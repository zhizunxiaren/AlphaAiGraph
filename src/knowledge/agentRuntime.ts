import type {
  AgentCostEstimate,
  AgentModelPricing,
  AgentRequest,
  AgentRun,
  AgentRunError,
  AgentRunEvent,
  AgentRuntimeConfig,
  AgentTokenUsage,
  KnowledgeAgentOutput,
  KnowledgeAgentProvider,
  KnowledgeWorkspaceSnapshot
} from "../types";
import {
  buildKnowledgeAgentInput,
  invokeKnowledgeAgentWithMetadata,
  KnowledgeAgentSchemaError
} from "./agentBoundary";
import {
  KnowledgeAgentProviderHttpError,
  KnowledgeAgentProviderResponseError
} from "./providers/openAiCompatibleProvider";

export const defaultAgentRuntimeConfig: Omit<AgentRuntimeConfig, "pricing" | "signal"> = {
  timeoutMs: 60_000,
  maxAttempts: 3,
  retryDelayMs: 500
};

export interface AgentRuntimeDependencies {
  now?: () => number;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
}

export interface KnowledgeAgentExecutionResult {
  snapshot: KnowledgeWorkspaceSnapshot;
  run: AgentRun;
  output?: KnowledgeAgentOutput;
}

export async function executeKnowledgeAgentRun(
  snapshot: KnowledgeWorkspaceSnapshot,
  provider: KnowledgeAgentProvider,
  request: AgentRequest,
  config: Partial<AgentRuntimeConfig> = {},
  dependencies: AgentRuntimeDependencies = {}
): Promise<KnowledgeAgentExecutionResult> {
  const runtimeConfig = { ...defaultAgentRuntimeConfig, ...config };
  assertRuntimeConfig(runtimeConfig);
  const now = dependencies.now ?? Date.now;
  const sleep = dependencies.sleep ?? sleepWithAbort;
  const input = buildKnowledgeAgentInput(snapshot, request);
  const startedMs = now();
  const startedAt = toIso(startedMs);
  const attempts: AgentRun["attempts"] = [];
  const events: AgentRunEvent[] = [];
  const addEvent = (kind: AgentRunEvent["kind"], message: string) => events.push({
    sequence: events.length + 1,
    at: toIso(now()),
    kind,
    message
  });
  addEvent("run_started", `Started ${provider.id} for request ${request.id}`);

  let output: KnowledgeAgentOutput | undefined;
  let finalUsage: AgentTokenUsage | undefined;
  let finalModel: string | undefined;
  let finalError: AgentRunError | undefined;
  let finalStatus: AgentRun["status"] = "failed";

  for (let attemptNumber = 1; attemptNumber <= runtimeConfig.maxAttempts; attemptNumber += 1) {
    if (runtimeConfig.signal?.aborted) {
      finalError = { code: "cancelled", message: "Agent run was cancelled", retryable: false };
      finalStatus = "cancelled";
      break;
    }
    const attemptStartedMs = now();
    addEvent("attempt_started", `Attempt ${attemptNumber} started`);
    try {
      const invocation = await invokeWithTimeout(
        provider,
        input,
        runtimeConfig.timeoutMs,
        runtimeConfig.signal
      );
      if (snapshot.candidatePatches.some((patch) => patch.id === invocation.output.patch.id)) {
        throw new AgentRuntimeIntegrationError("duplicate_patch_id", `Candidate patch ${invocation.output.patch.id} already exists`);
      }
      const completedMs = now();
      attempts.push({
        attempt: attemptNumber,
        status: "succeeded",
        startedAt: toIso(attemptStartedMs),
        completedAt: toIso(completedMs),
        durationMs: elapsed(attemptStartedMs, completedMs),
        providerRequestId: invocation.metadata.providerRequestId,
        usage: invocation.metadata.usage
      });
      output = invocation.output;
      finalUsage = invocation.metadata.usage;
      finalModel = invocation.metadata.model;
      finalStatus = "succeeded";
      addEvent("attempt_succeeded", `Attempt ${attemptNumber} produced candidate patch ${output.patch.id}`);
      break;
    } catch (error) {
      const completedMs = now();
      const normalized = normalizeRunError(error, runtimeConfig.signal);
      finalError = normalized;
      finalStatus = normalized.code === "timeout"
        ? "timed_out"
        : normalized.code === "cancelled" ? "cancelled" : "failed";
      attempts.push({
        attempt: attemptNumber,
        status: finalStatus === "timed_out" ? "timed_out" : finalStatus === "cancelled" ? "cancelled" : "failed",
        startedAt: toIso(attemptStartedMs),
        completedAt: toIso(completedMs),
        durationMs: elapsed(attemptStartedMs, completedMs),
        error: normalized
      });
      addEvent("attempt_failed", `Attempt ${attemptNumber} failed with ${normalized.code}`);
      const shouldRetry = normalized.retryable
        && attemptNumber < runtimeConfig.maxAttempts
        && !runtimeConfig.signal?.aborted;
      if (!shouldRetry) break;
      addEvent("retry_scheduled", `Retry ${attemptNumber + 1} scheduled after ${runtimeConfig.retryDelayMs}ms`);
      try {
        await sleep(runtimeConfig.retryDelayMs, runtimeConfig.signal);
      } catch {
        finalError = { code: "cancelled", message: "Agent run was cancelled during retry delay", retryable: false };
        finalStatus = "cancelled";
        break;
      }
    }
  }

  const completedMs = now();
  addEvent("run_completed", `Agent run completed with status ${finalStatus}`);
  const run: AgentRun = {
    id: `agent-run-${sanitizeId(request.id)}-${startedMs}`,
    requestId: request.id,
    providerId: provider.id,
    model: finalModel,
    schemaVersion: input.schemaVersion,
    status: finalStatus,
    maxAttempts: runtimeConfig.maxAttempts,
    attemptCount: attempts.length,
    startedAt,
    completedAt: toIso(completedMs),
    durationMs: elapsed(startedMs, completedMs),
    patchId: output?.patch.id,
    usage: finalUsage,
    cost: finalUsage && runtimeConfig.pricing ? estimateAgentCost(finalUsage, runtimeConfig.pricing) : undefined,
    error: finalStatus === "succeeded" ? undefined : finalError,
    attempts,
    events
  };
  return {
    snapshot: recordRun(snapshot, request, run, output),
    run,
    output
  };
}

export function estimateAgentCost(usage: AgentTokenUsage, pricing: AgentModelPricing): AgentCostEstimate {
  assertPricing(pricing);
  const cachedTokens = Math.min(usage.inputTokens, usage.cachedInputTokens ?? 0);
  const regularInputTokens = usage.inputTokens - cachedTokens;
  const cachedRate = pricing.cachedInputPerMillionTokens ?? pricing.inputPerMillionTokens;
  const inputCost = regularInputTokens / 1_000_000 * pricing.inputPerMillionTokens;
  const cachedInputCost = cachedTokens / 1_000_000 * cachedRate;
  const outputCost = usage.outputTokens / 1_000_000 * pricing.outputPerMillionTokens;
  return {
    currency: pricing.currency,
    inputCost,
    outputCost,
    cachedInputCost,
    totalCost: inputCost + cachedInputCost + outputCost,
    pricingSource: pricing.source,
    pricingEffectiveAt: pricing.effectiveAt
  };
}

function recordRun(
  snapshot: KnowledgeWorkspaceSnapshot,
  request: AgentRequest,
  run: AgentRun,
  output?: KnowledgeAgentOutput
): KnowledgeWorkspaceSnapshot {
  const hasRequest = snapshot.agentRequests.some((candidate) => candidate.id === request.id);
  const nextRequest = run.status === "succeeded" ? request : { ...request, status: "failed" as const };
  return {
    ...snapshot,
    agentRequests: hasRequest
      ? snapshot.agentRequests.map((candidate) => candidate.id === request.id ? nextRequest : candidate)
      : snapshot.agentRequests.concat(nextRequest),
    agentRuns: (snapshot.agentRuns ?? []).concat(run),
    candidatePatches: output
      ? snapshot.candidatePatches.concat(output.patch)
      : snapshot.candidatePatches
  };
}

async function invokeWithTimeout(
  provider: KnowledgeAgentProvider,
  input: Parameters<typeof invokeKnowledgeAgentWithMetadata>[1],
  timeoutMs: number,
  externalSignal?: AbortSignal
) {
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort(externalSignal?.reason);
  externalSignal?.addEventListener("abort", onExternalAbort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AgentRunTimeoutError(timeoutMs));
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      invokeKnowledgeAgentWithMetadata(provider, input, { signal: controller.signal }),
      timeout
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}

function normalizeRunError(error: unknown, externalSignal?: AbortSignal): AgentRunError {
  if (externalSignal?.aborted) return { code: "cancelled", message: "Agent run was cancelled", retryable: false };
  if (error instanceof AgentRunTimeoutError) return { code: "timeout", message: error.message, retryable: true };
  if (error instanceof KnowledgeAgentProviderHttpError) {
    return { code: `http_${error.status}`, message: error.message, retryable: error.retryable };
  }
  if (error instanceof KnowledgeAgentProviderResponseError) {
    return { code: error.code, message: error.message, retryable: true };
  }
  if (error instanceof KnowledgeAgentSchemaError) {
    return { code: error.code, message: error.message, retryable: true };
  }
  if (error instanceof AgentRuntimeIntegrationError) {
    return { code: error.code, message: error.message, retryable: false };
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return { code: "cancelled", message: "Agent provider call was aborted", retryable: false };
  }
  if (error instanceof TypeError) {
    return { code: "network_error", message: "Agent provider network request failed", retryable: true };
  }
  return {
    code: "provider_error",
    message: error instanceof Error ? error.message : "Unknown Agent provider error",
    retryable: false
  };
}

function assertRuntimeConfig(config: Omit<AgentRuntimeConfig, "pricing" | "signal"> & Pick<AgentRuntimeConfig, "pricing" | "signal">) {
  for (const [key, value] of Object.entries({
    timeoutMs: config.timeoutMs,
    maxAttempts: config.maxAttempts,
    retryDelayMs: config.retryDelayMs
  })) {
    if (!Number.isInteger(value) || value < (key === "retryDelayMs" ? 0 : 1)) {
      throw new Error(`Agent Runtime ${key} is invalid`);
    }
  }
  if (config.pricing) assertPricing(config.pricing);
}

function assertPricing(pricing: AgentModelPricing) {
  if (!pricing.source.trim() || !Number.isFinite(Date.parse(pricing.effectiveAt))) {
    throw new Error("Agent pricing must record a source and effectiveAt timestamp");
  }
  for (const value of [
    pricing.inputPerMillionTokens,
    pricing.outputPerMillionTokens,
    pricing.cachedInputPerMillionTokens ?? 0
  ]) {
    if (!Number.isFinite(value) || value < 0) throw new Error("Agent pricing rates must be non-negative finite numbers");
  }
}

function sleepWithAbort(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

class AgentRunTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Agent provider attempt exceeded ${timeoutMs}ms`);
  }
}

class AgentRuntimeIntegrationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

function toIso(milliseconds: number): string {
  return new Date(milliseconds).toISOString();
}

function elapsed(start: number, end: number): number {
  return Math.max(0, end - start);
}

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}
