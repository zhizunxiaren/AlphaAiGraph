import { expect, test } from "vitest";
import type {
  AgentModelPricing,
  AgentRequest,
  KnowledgeAgentInput,
  KnowledgeAgentOutput,
  KnowledgeAgentProvider,
  KnowledgeNode
} from "../types";
import { executeKnowledgeAgentRun, estimateAgentCost } from "./agentRuntime";
import { buildKnowledgeAgentInput } from "./agentBoundary";
import { createProjectWorkspace, knowledgeNow } from "./knowledgeEngine";
import { createGraphPatchAudit } from "./graphPatch";
import { KnowledgeAgentProviderHttpError } from "./providers/openAiCompatibleProvider";

const pricing: AgentModelPricing = {
  currency: "USD",
  inputPerMillionTokens: 2,
  outputPerMillionTokens: 8,
  cachedInputPerMillionTokens: 0.5,
  source: "test-pricing-table",
  effectiveAt: "2026-07-14T00:00:00.000Z"
};

test("records a successful AgentRun, usage, cost, and pending patch without changing the graph", async () => {
  const { workspace, request, input } = runtimeFixture("Runtime success");
  const output = validOutput(input, "success");
  const provider: KnowledgeAgentProvider = {
    id: "test/success-model",
    async invoke() {
      return {
        output,
        metadata: {
          providerRequestId: "provider-request-1",
          model: "success-model",
          usage: { inputTokens: 1_000, outputTokens: 200, totalTokens: 1_200, cachedInputTokens: 400 }
        }
      };
    }
  };

  const result = await executeKnowledgeAgentRun(workspace, provider, request, {
    timeoutMs: 100,
    maxAttempts: 1,
    retryDelayMs: 0,
    pricing
  });

  expect(result.run).toMatchObject({
    status: "succeeded",
    providerId: provider.id,
    model: "success-model",
    attemptCount: 1,
    patchId: output.patch.id,
    usage: { totalTokens: 1_200 }
  });
  expect(result.run.cost).toMatchObject({
    currency: "USD",
    pricingSource: "test-pricing-table",
    inputCost: 0.0012,
    cachedInputCost: 0.0002,
    outputCost: 0.0016,
    totalCost: 0.003
  });
  expect(result.snapshot.graph).toBe(workspace.graph);
  expect(result.snapshot.candidatePatches).toContainEqual(output.patch);
  expect(result.snapshot.agentRuns).toContainEqual(result.run);
  expect(result.snapshot.agentRequests).toContainEqual(request);
  expect(result.run.events.map((event) => event.kind)).toEqual([
    "run_started",
    "attempt_started",
    "attempt_succeeded",
    "run_completed"
  ]);
});

test("retries retryable provider failures and preserves every attempt", async () => {
  const { workspace, request, input } = runtimeFixture("Runtime retry");
  const output = validOutput(input, "retry");
  let invocationCount = 0;
  const provider: KnowledgeAgentProvider = {
    id: "test/retry-model",
    async invoke() {
      invocationCount += 1;
      if (invocationCount === 1) throw new KnowledgeAgentProviderHttpError("test/retry-model", 503, true);
      return { output, metadata: { usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } } };
    }
  };

  const result = await executeKnowledgeAgentRun(workspace, provider, request, {
    timeoutMs: 100,
    maxAttempts: 3,
    retryDelayMs: 0
  });

  expect(invocationCount).toBe(2);
  expect(result.run.status).toBe("succeeded");
  expect(result.run.attempts.map((attempt) => attempt.status)).toEqual(["failed", "succeeded"]);
  expect(result.run.attempts[0].error).toMatchObject({ code: "http_503", retryable: true });
  expect(result.run.events.some((event) => event.kind === "retry_scheduled")).toBe(true);
});

test("hard-times out providers that ignore AbortSignal and never mutates candidate patches", async () => {
  const { workspace, request } = runtimeFixture("Runtime timeout");
  const provider: KnowledgeAgentProvider = {
    id: "test/hanging-model",
    invoke: async () => new Promise<never>(() => undefined)
  };

  const result = await executeKnowledgeAgentRun(workspace, provider, request, {
    timeoutMs: 5,
    maxAttempts: 2,
    retryDelayMs: 0
  });

  expect(result.run.status).toBe("timed_out");
  expect(result.run.attempts.map((attempt) => attempt.status)).toEqual(["timed_out", "timed_out"]);
  expect(result.run.error).toMatchObject({ code: "timeout", retryable: true });
  expect(result.snapshot.graph).toBe(workspace.graph);
  expect(result.snapshot.candidatePatches).toEqual(workspace.candidatePatches);
  expect(result.snapshot.agentRequests[0].status).toBe("failed");
});

test("does not retry non-retryable authentication failures", async () => {
  const { workspace, request } = runtimeFixture("Runtime auth failure");
  let invocationCount = 0;
  const provider: KnowledgeAgentProvider = {
    id: "test/auth-model",
    async invoke() {
      invocationCount += 1;
      throw new KnowledgeAgentProviderHttpError("test/auth-model", 401, false);
    }
  };

  const result = await executeKnowledgeAgentRun(workspace, provider, request, {
    timeoutMs: 100,
    maxAttempts: 3,
    retryDelayMs: 0
  });

  expect(invocationCount).toBe(1);
  expect(result.run.status).toBe("failed");
  expect(result.run.error).toEqual({
    code: "http_401",
    message: "Knowledge Agent provider test/auth-model returned HTTP 401",
    retryable: false
  });
});

test("computes cached and regular input costs from an explicit dated pricing table", () => {
  expect(estimateAgentCost({
    inputTokens: 2_000,
    cachedInputTokens: 500,
    outputTokens: 250,
    totalTokens: 2_250
  }, pricing)).toMatchObject({
    inputCost: 0.003,
    cachedInputCost: 0.00025,
    outputCost: 0.002,
    totalCost: 0.00525
  });
});

function runtimeFixture(title: string) {
  const workspace = createProjectWorkspace({ mode: "understand", title, subjectKind: "technology" });
  const request: AgentRequest = {
    id: `agent-request-${title.toLowerCase().replace(/\s+/g, "-")}`,
    action: "drill_down",
    selectionId: workspace.selection.id,
    prompt: "Expand the selected node.",
    status: "proposed",
    createdAt: knowledgeNow
  };
  return { workspace, request, input: buildKnowledgeAgentInput(workspace, request) };
}

function validOutput(input: KnowledgeAgentInput, suffix: string): KnowledgeAgentOutput {
  const node: KnowledgeNode = {
    ...input.currentNode,
    id: `${input.currentNode.id}-${suffix}`,
    kind: "concept",
    title: `Runtime ${suffix}`,
    summary: "A provider candidate that remains outside the primary graph.",
    status: "open",
    epistemicStatus: "unverified",
    sourceStatus: "not_applicable",
    sourceRefs: [],
    depth: input.currentNode.depth + 1,
    tags: ["agent-runtime"],
    createdBy: "agent",
    creatorId: "agent-runtime-test",
    createdAt: knowledgeNow,
    updatedAt: knowledgeNow
  };
  return {
    schemaVersion: "1.0",
    requestId: input.request.id,
    patch: {
      id: `patch-runtime-${suffix}`,
      requestId: input.request.id,
      action: input.request.action,
      targetNodeId: input.currentNode.id,
      focusNodeId: node.id,
      title: "Runtime patch",
      summary: "Candidate output from the tested Agent Runtime.",
      revision: 1,
      createdBy: "agent",
      operations: [{
        kind: "create_node",
        node,
        audit: createGraphPatchAudit(`audit-runtime-${suffix}`, "Propose a runtime candidate node", knowledgeNow)
      }],
      confidence: 0.8,
      status: "pending_review",
      createdAt: knowledgeNow
    }
  };
}
