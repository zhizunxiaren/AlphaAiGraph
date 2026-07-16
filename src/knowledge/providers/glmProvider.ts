import type { KnowledgeAgentProvider } from "../../types";
import {
  createOpenAiCompatibleProvider,
  type OpenAiCompatibleProviderRuntimeConfig
} from "./openAiCompatibleProvider";

export const GLM_API_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";
export const DEFAULT_GLM_MODEL = "glm-5.2";

export interface GlmProviderConfig extends Partial<Omit<OpenAiCompatibleProviderRuntimeConfig, "apiKey">> {
  apiKey: string;
}

export function createGlmProvider(config: GlmProviderConfig): KnowledgeAgentProvider {
  return createOpenAiCompatibleProvider({
    providerName: "glm",
    apiKey: config.apiKey,
    model: config.model ?? DEFAULT_GLM_MODEL,
    baseUrl: config.baseUrl ?? GLM_API_BASE_URL,
    maxTokens: config.maxTokens,
    thinking: config.thinking ?? "enabled",
    fetch: config.fetch,
    allowInBrowser: config.allowInBrowser,
    requestExtras: (input) => ({ request_id: normalizeGlmRequestId(input.request.id) })
  });
}

function normalizeGlmRequestId(requestId: string): string {
  const normalized = requestId.replace(/[^a-zA-Z0-9_-]/g, "-");
  if (normalized.length >= 6) return normalized.slice(0, 64);
  return `${normalized}-request`.slice(0, 64);
}
