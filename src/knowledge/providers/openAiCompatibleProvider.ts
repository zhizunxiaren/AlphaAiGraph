import type {
  KnowledgeAgentInput,
  KnowledgeAgentInvocationOptions,
  KnowledgeAgentProvider,
  KnowledgeAgentProviderResponse,
  AgentTokenUsage
} from "../../types";
import { knowledgeAgentOutputJsonSchema } from "../agentBoundary";

export type AgentProviderFetch = (input: string, init: RequestInit) => Promise<Response>;

export interface OpenAiCompatibleProviderRuntimeConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
  maxTokens?: number;
  thinking?: "enabled" | "disabled";
  fetch?: AgentProviderFetch;
  /** API keys must normally remain in a trusted desktop/server runtime. */
  allowInBrowser?: boolean;
}

interface CreateOpenAiCompatibleProviderInput extends OpenAiCompatibleProviderRuntimeConfig {
  providerName: string;
  requestExtras?: (input: KnowledgeAgentInput) => Record<string, unknown>;
}

export class KnowledgeAgentProviderHttpError extends Error {
  constructor(
    public readonly providerId: string,
    public readonly status: number,
    public readonly retryable: boolean
  ) {
    super(`Knowledge Agent provider ${providerId} returned HTTP ${status}`);
    this.name = "KnowledgeAgentProviderHttpError";
  }
}

export class KnowledgeAgentProviderResponseError extends Error {
  constructor(public readonly providerId: string, public readonly code: string, message: string) {
    super(`Knowledge Agent provider ${providerId} response failed: [${code}] ${message}`);
    this.name = "KnowledgeAgentProviderResponseError";
  }
}

export function createOpenAiCompatibleProvider({
  providerName,
  apiKey,
  model,
  baseUrl,
  maxTokens = 16_384,
  thinking,
  fetch: fetchOverride,
  allowInBrowser = false,
  requestExtras
}: CreateOpenAiCompatibleProviderInput): KnowledgeAgentProvider {
  assertRuntimeConfiguration({ providerName, apiKey, model, baseUrl, maxTokens, allowInBrowser });
  const providerId = `${providerName}/${model}`;
  const endpoint = new URL("chat/completions", ensureTrailingSlash(baseUrl)).toString();
  const fetchImpl = fetchOverride ?? globalThis.fetch?.bind(globalThis);
  if (!fetchImpl) throw new Error(`Knowledge Agent provider ${providerId} requires a fetch implementation`);

  return {
    id: providerId,
    async invoke(input: KnowledgeAgentInput, options?: KnowledgeAgentInvocationOptions): Promise<KnowledgeAgentProviderResponse> {
      const body: Record<string, unknown> = {
        model,
        messages: buildMessages(input),
        response_format: { type: "json_object" },
        stream: false,
        max_tokens: maxTokens,
        ...(thinking ? { thinking: { type: thinking } } : {}),
        ...(requestExtras?.(input) ?? {})
      };
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
        signal: options?.signal
      });
      if (!response.ok) {
        throw new KnowledgeAgentProviderHttpError(providerId, response.status, isRetryableStatus(response.status));
      }
      const payload = await readJsonResponse(response, providerId);
      const choice = Array.isArray(payload.choices) ? payload.choices[0] : undefined;
      const finishReason = isRecord(choice) ? choice.finish_reason : undefined;
      if (finishReason === "length") {
        throw new KnowledgeAgentProviderResponseError(providerId, "truncated_output", "JSON output reached the token limit");
      }
      const message = isRecord(choice) ? choice.message : undefined;
      const content = isRecord(message) ? message.content : undefined;
      if (typeof content !== "string" || !content.trim()) {
        throw new KnowledgeAgentProviderResponseError(providerId, "empty_output", "choices[0].message.content is empty");
      }
      try {
        return {
          output: JSON.parse(content) as unknown,
          metadata: {
            providerRequestId: readOptionalString(payload.request_id) ?? readOptionalString(payload.id),
            model: readOptionalString(payload.model) ?? model,
            usage: normalizeTokenUsage(payload.usage)
          }
        };
      } catch {
        throw new KnowledgeAgentProviderResponseError(providerId, "invalid_json", "message content is not valid JSON");
      }
    }
  };
}

function buildMessages(input: KnowledgeAgentInput) {
  return [
    {
      role: "system",
      content: [
        "You are the AlphaAiGraph knowledge agent.",
        "Return JSON only. Do not use markdown fences or explanatory text.",
        "Return exactly one KnowledgeAgentOutput whose patch remains pending_review.",
        "Never invent source ids or anchors outside the supplied Context Packet.",
        `Output JSON Schema: ${JSON.stringify(knowledgeAgentOutputJsonSchema)}`
      ].join("\n")
    },
    {
      role: "user",
      content: `Generate a reviewable knowledge graph patch from this JSON input:\n${JSON.stringify(input)}`
    }
  ];
}

async function readJsonResponse(response: Response, providerId: string): Promise<Record<string, unknown>> {
  try {
    const value = await response.json() as unknown;
    if (!isRecord(value)) throw new Error("not an object");
    return value;
  } catch {
    throw new KnowledgeAgentProviderResponseError(providerId, "invalid_response", "HTTP response body is not a JSON object");
  }
}

function assertRuntimeConfiguration(input: {
  providerName: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  maxTokens: number;
  allowInBrowser: boolean;
}) {
  if (!input.apiKey.trim()) throw new Error(`${input.providerName} API key is required`);
  if (!input.model.trim()) throw new Error(`${input.providerName} model is required`);
  if (!Number.isInteger(input.maxTokens) || input.maxTokens < 1) {
    throw new Error(`${input.providerName} maxTokens must be a positive integer`);
  }
  let url: URL;
  try {
    url = new URL(input.baseUrl);
  } catch {
    throw new Error(`${input.providerName} baseUrl must be an absolute URL`);
  }
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  if (url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) {
    throw new Error(`${input.providerName} baseUrl must use HTTPS, except for a local proxy`);
  }
  if (typeof window !== "undefined" && !input.allowInBrowser) {
    throw new Error(`${input.providerName} API keys cannot be used directly in a browser runtime; use a trusted backend or desktop bridge`);
  }
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeTokenUsage(value: unknown): AgentTokenUsage | undefined {
  if (!isRecord(value)) return undefined;
  const inputTokens = readNonNegativeInteger(value.prompt_tokens) ?? readNonNegativeInteger(value.input_tokens);
  const outputTokens = readNonNegativeInteger(value.completion_tokens) ?? readNonNegativeInteger(value.output_tokens);
  if (inputTokens === undefined || outputTokens === undefined) return undefined;
  const details = isRecord(value.prompt_tokens_details) ? value.prompt_tokens_details : undefined;
  const cachedInputTokens = readNonNegativeInteger(value.prompt_cache_hit_tokens)
    ?? readNonNegativeInteger(details?.cached_tokens);
  return {
    inputTokens,
    outputTokens,
    totalTokens: readNonNegativeInteger(value.total_tokens) ?? inputTokens + outputTokens,
    ...(cachedInputTokens === undefined ? {} : { cachedInputTokens })
  };
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readNonNegativeInteger(value: unknown): number | undefined {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : undefined;
}
