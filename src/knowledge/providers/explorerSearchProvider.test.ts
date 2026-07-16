// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest";
import {
  createConfiguredExplorerSearchProvider,
  createTrustedExplorerSearchProvider,
  type AlphaAiGraphExplorerRuntimeConfig,
  type ExplorerProviderFetch
} from "./explorerSearchProvider";

afterEach(() => {
  delete (globalThis as typeof globalThis & { __ALPHA_AI_GRAPH_EXPLORER__?: AlphaAiGraphExplorerRuntimeConfig })
    .__ALPHA_AI_GRAPH_EXPLORER__;
});

test("trusted adapter sends only the query or selected URL without browser credentials", async () => {
  const fetchImpl = vi.fn<ExplorerProviderFetch>()
    .mockResolvedValueOnce(jsonResponse({ results: [{
      title: "Official retry guidance",
      url: "https://docs.example/retry",
      sourceKind: "official",
      snippet: "bounded retry guidance"
    }] }))
    .mockResolvedValueOnce(jsonResponse({ content: "Full original page body.", mediaType: "text/plain" }));
  const provider = createTrustedExplorerSearchProvider({
    endpoint: "https://search.example/api/",
    id: "trusted-test",
    pricing: "metered",
    fetchImpl
  });

  const [result] = await provider.search({ query: "retry budget", limit: 5 });
  const captured = await provider.capture!({ result });

  expect(result).toMatchObject({ providerId: "trusted-test", sourceKind: "official" });
  expect(captured).toEqual({ content: "Full original page body.", mediaType: "text/plain" });
  expect(fetchImpl).toHaveBeenNthCalledWith(1, "https://search.example/api/search", expect.objectContaining({
    method: "POST",
    credentials: "omit",
    referrerPolicy: "no-referrer",
    body: JSON.stringify({ query: "retry budget", limit: 5 })
  }));
  expect(fetchImpl).toHaveBeenNthCalledWith(2, "https://search.example/api/capture", expect.objectContaining({
    credentials: "omit",
    body: JSON.stringify({ url: "https://docs.example/retry" })
  }));
  expect(provider.disclosure).toMatchObject({ sends: "query_and_result_url", pricing: "metered" });
});

test("adapter rejects insecure remote endpoints and keeps runtime configuration optional", () => {
  expect(() => createTrustedExplorerSearchProvider({ endpoint: "http://search.example/api" })).toThrow("must use HTTPS");
  expect(createConfiguredExplorerSearchProvider()).toBeUndefined();

  (globalThis as typeof globalThis & { __ALPHA_AI_GRAPH_EXPLORER__?: AlphaAiGraphExplorerRuntimeConfig })
    .__ALPHA_AI_GRAPH_EXPLORER__ = { endpoint: "http://localhost:8123/explorer", id: "local-bridge", pricing: "free" };
  expect(createConfiguredExplorerSearchProvider()).toMatchObject({ id: "local-bridge", disclosure: { pricing: "free" } });
});

test("adapter rejects malformed search payloads and empty captures", async () => {
  const fetchImpl = vi.fn<ExplorerProviderFetch>()
    .mockResolvedValueOnce(jsonResponse({ results: "not-an-array" }))
    .mockResolvedValueOnce(jsonResponse({ content: " " }));
  const provider = createTrustedExplorerSearchProvider({ endpoint: "https://search.example", fetchImpl });

  await expect(provider.search({ query: "retry", limit: 2 })).rejects.toThrow("response.results must be an array");
  await expect(provider.capture!({ result: { title: "Result", url: "https://example.com", providerId: provider.id } })).rejects.toThrow("has no page content");
});

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" }
  });
}
