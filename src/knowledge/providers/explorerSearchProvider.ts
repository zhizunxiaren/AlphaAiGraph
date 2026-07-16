import type {
  KnowledgeSearchProvider,
  KnowledgeSearchProviderDisclosure,
  KnowledgeSearchResult
} from "../explorerPolicy";
import type { SearchSourceKind } from "../../types";

export type ExplorerProviderFetch = (input: string, init: RequestInit) => Promise<Response>;

export interface TrustedExplorerSearchProviderConfig {
  endpoint: string;
  id?: string;
  fetchImpl?: ExplorerProviderFetch;
  privacyNotice?: string;
  costNotice?: string;
  pricing?: KnowledgeSearchProviderDisclosure["pricing"];
}

export interface AlphaAiGraphExplorerRuntimeConfig {
  endpoint: string;
  id?: string;
  privacyNotice?: string;
  costNotice?: string;
  pricing?: KnowledgeSearchProviderDisclosure["pricing"];
}

const maxSearchResponseBytes = 2 * 1024 * 1024;
const maxCaptureTextBytes = 8 * 1024 * 1024;
const sourceKinds = new Set<SearchSourceKind>([
  "primary",
  "official",
  "peer_reviewed",
  "independent_secondary",
  "community",
  "other"
]);

/**
 * Browser-safe adapter for a trusted search/capture backend. It accepts no API
 * key and sends credentials: omit, so provider credentials stay behind the
 * configured service or desktop bridge.
 */
export function createTrustedExplorerSearchProvider(
  config: TrustedExplorerSearchProviderConfig
): KnowledgeSearchProvider {
  const endpoint = validateEndpoint(config.endpoint);
  const id = config.id?.trim() || `trusted-explorer/${endpoint.hostname}`;
  const fetchImpl = config.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!fetchImpl) throw new Error(`Explorer provider ${id} requires a fetch implementation`);
  const disclosure: KnowledgeSearchProviderDisclosure = {
    privacyNotice: config.privacyNotice?.trim()
      || `搜索时只向 ${endpoint.origin} 发送查询；批量收录时另发送用户选择的结果 URL，不发送 Knowledge Graph 或 Context Packet。`,
    costNotice: config.costNotice?.trim() || "服务费用由已配置的可信搜索后端决定。",
    sends: "query_and_result_url",
    pricing: config.pricing ?? "unknown"
  };

  return {
    id,
    disclosure,
    async search(input) {
      const payload = await postJson(fetchImpl, endpointUrl(endpoint, "search"), {
        query: input.query,
        limit: input.limit
      }, input.signal, maxSearchResponseBytes, id);
      const rawResults = Array.isArray(payload.results) ? payload.results : undefined;
      if (!rawResults) throw new Error(`Explorer provider ${id} response.results must be an array`);
      return rawResults.map((raw, index) => parseSearchResult(raw, id, index));
    },
    async capture(input) {
      const payload = await postJson(fetchImpl, endpointUrl(endpoint, "capture"), {
        url: input.result.url
      }, input.signal, maxCaptureTextBytes + 1024, id);
      const content = typeof payload.content === "string" ? payload.content : "";
      if (!content.trim()) throw new Error(`Explorer provider ${id} capture response has no page content`);
      if (new TextEncoder().encode(content).byteLength > maxCaptureTextBytes) {
        throw new Error(`Explorer provider ${id} captured page exceeds 8 MiB`);
      }
      return {
        content,
        mediaType: typeof payload.mediaType === "string" && payload.mediaType.trim()
          ? payload.mediaType.trim()
          : "text/plain"
      };
    }
  };
}

/** Reads optional host-injected configuration; absence keeps browser handoff as the default. */
export function createConfiguredExplorerSearchProvider(): KnowledgeSearchProvider | undefined {
  const runtime = globalThis as typeof globalThis & {
    __ALPHA_AI_GRAPH_EXPLORER__?: AlphaAiGraphExplorerRuntimeConfig;
  };
  const config = runtime.__ALPHA_AI_GRAPH_EXPLORER__;
  return config ? createTrustedExplorerSearchProvider(config) : undefined;
}

async function postJson(
  fetchImpl: ExplorerProviderFetch,
  url: string,
  body: Record<string, unknown>,
  signal: AbortSignal | undefined,
  maximumBytes: number,
  providerId: string
): Promise<Record<string, unknown>> {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    credentials: "omit",
    referrerPolicy: "no-referrer",
    signal
  });
  if (!response.ok) throw new Error(`Explorer provider ${providerId} returned HTTP ${response.status}`);
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > maximumBytes) {
    throw new Error(`Explorer provider ${providerId} response exceeds its safety limit`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`Explorer provider ${providerId} response is not valid JSON`, { cause: error });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Explorer provider ${providerId} response must be an object`);
  }
  return parsed as Record<string, unknown>;
}

function parseSearchResult(raw: unknown, providerId: string, index: number): KnowledgeSearchResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`Explorer provider ${providerId} result ${index} must be an object`);
  }
  const record = raw as Record<string, unknown>;
  if (typeof record.title !== "string" || typeof record.url !== "string") {
    throw new Error(`Explorer provider ${providerId} result ${index} requires title and url`);
  }
  const sourceKind = typeof record.sourceKind === "string" && sourceKinds.has(record.sourceKind as SearchSourceKind)
    ? record.sourceKind as SearchSourceKind
    : undefined;
  return {
    title: record.title,
    url: record.url,
    providerId,
    sourceKind,
    snippet: optionalString(record.snippet),
    publishedAt: optionalString(record.publishedAt),
    language: optionalString(record.language),
    logicalUrl: optionalString(record.logicalUrl),
    versionLabel: optionalString(record.versionLabel)
  };
}

function validateEndpoint(value: string): URL {
  let endpoint: URL;
  try {
    endpoint = new URL(value);
  } catch (error) {
    throw new Error("Explorer search endpoint must be an absolute URL", { cause: error });
  }
  const isLocalHttp = endpoint.protocol === "http:" && (endpoint.hostname === "localhost" || endpoint.hostname === "127.0.0.1" || endpoint.hostname === "[::1]");
  if (endpoint.protocol !== "https:" && !isLocalHttp) {
    throw new Error("Explorer search endpoint must use HTTPS, except for a local trusted bridge");
  }
  endpoint.hash = "";
  endpoint.search = "";
  endpoint.pathname = endpoint.pathname.replace(/\/+$/, "");
  return endpoint;
}

function endpointUrl(endpoint: URL, operation: "search" | "capture"): string {
  const url = new URL(endpoint.toString());
  url.pathname = `${url.pathname}/${operation}`.replace(/\/{2,}/g, "/");
  return url.toString();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
