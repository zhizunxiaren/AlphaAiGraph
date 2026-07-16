import type { KnowledgeAgentProvider } from "../../types";
import {
  createOpenAiCompatibleProvider,
  type OpenAiCompatibleProviderRuntimeConfig
} from "./openAiCompatibleProvider";

export const DEEPSEEK_API_BASE_URL = "https://api.deepseek.com";
export const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-pro";

export interface DeepSeekProviderConfig extends Partial<Omit<OpenAiCompatibleProviderRuntimeConfig, "apiKey">> {
  apiKey: string;
}

export function createDeepSeekProvider(config: DeepSeekProviderConfig): KnowledgeAgentProvider {
  return createOpenAiCompatibleProvider({
    providerName: "deepseek",
    apiKey: config.apiKey,
    model: config.model ?? DEFAULT_DEEPSEEK_MODEL,
    baseUrl: config.baseUrl ?? DEEPSEEK_API_BASE_URL,
    maxTokens: config.maxTokens,
    thinking: config.thinking ?? "enabled",
    fetch: config.fetch,
    allowInBrowser: config.allowInBrowser
  });
}
