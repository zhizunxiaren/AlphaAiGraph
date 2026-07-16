// @vitest-environment node
import { expect, test, vi } from "vitest";
import { BuiltinTextSourceParser } from "./builtinSourceParsers";
import {
  buildExplorerSearchUrl,
  captureExplorerSearchResults,
  deriveExplorerPlan,
  executeExplorerSearch,
  explorerPolicy,
  filterExplorerSearchResults,
  ingestExplorerSourceCapture,
  proposeExplorerCandidates,
  rankExplorerSearchResults,
  searchExplorerTask,
  type KnowledgeSearchProvider
} from "./explorerPolicy";
import { acceptCandidateGraphPatch, createProjectWorkspace } from "./knowledgeEngine";
import { InMemoryRawSourceStore } from "./rawSourceStore";

test("derives four focused exploration tasks without persisting a Phase 5 SearchQuery model", () => {
  const workspace = createSystematizeWorkspace();
  const plan = deriveExplorerPlan(workspace);

  expect(explorerPolicy).toMatchObject({ role: "Explorer", requiresImmutableSourceBeforeGrounding: true, persistsSearchQueries: false });
  expect(plan.targetNodeId).toBe(workspace.selection.focusNodeId);
  expect(plan.tasks.map((task) => task.kind)).toEqual(["new_material", "adjacent_domain", "counterexample", "verification"]);
  expect(plan.tasks.every((task) => task.query.includes("Retry policy"))).toBe(true);
  expect(buildExplorerSearchUrl(plan.tasks[0])).toMatch(/^https:\/\/www\.google\.com\/search\?q=/);
  expect(workspace.agentRequests).toHaveLength(0);
});

test("normalizes and deduplicates replaceable provider results", async () => {
  const workspace = createSystematizeWorkspace();
  const task = deriveExplorerPlan(workspace).tasks[0];
  const search = vi.fn<KnowledgeSearchProvider["search"]>().mockResolvedValue([
    { title: " Retry policy RFC  ", url: "https://EXAMPLE.com/rfc/?utm_source=test#top", snippet: " canonical ", providerId: "fake", sourceKind: "primary" },
    { title: "Duplicate", url: "https://example.com/rfc", providerId: "fake" },
    { title: "Unsafe", url: "javascript:alert(1)", providerId: "fake" },
    { title: "Existing retry policy", url: "https://existing.example/doc", providerId: "fake", sourceKind: "official" }
  ]);
  const provider: KnowledgeSearchProvider = { id: "fake", search };

  const results = await searchExplorerTask(provider, task, {
    existingSources: [{
      id: "source-existing",
      uri: "https://existing.example/doc",
      logicalSourceId: "logical-existing",
      version: 1,
      contentHash: "sha256:existing"
    }]
  });

  expect(search).toHaveBeenCalledWith({ query: task.query, limit: 16, signal: expect.any(AbortSignal) });
  expect(results).toHaveLength(2);
  expect(results[0]).toMatchObject({ title: "Retry policy RFC", canonicalUrl: "https://example.com/rfc", snippet: "canonical", sourceKind: "primary" });
  expect(results[1]).toMatchObject({ canonicalUrl: "https://existing.example/doc", existingSourceId: "source-existing" });
});

test("prioritizes relevant original sources and recognizes latest versions before filtering", () => {
  const task = deriveExplorerPlan(createSystematizeWorkspace()).tasks[0];
  const results = rankExplorerSearchResults([
    {
      title: "Retry policy reference v1.0",
      url: "https://standards.example/retry/v1",
      logicalUrl: "https://standards.example/retry",
      versionLabel: "1.0",
      publishedAt: "2025-01-01T00:00:00.000Z",
      sourceKind: "official",
      providerId: "fake"
    },
    {
      title: "Retry policy reference v2.0",
      url: "https://standards.example/retry/v2",
      logicalUrl: "https://standards.example/retry",
      versionLabel: "2.0",
      publishedAt: "2026-01-01T00:00:00.000Z",
      sourceKind: "primary",
      providerId: "fake"
    },
    {
      title: "Retry policy opinions",
      url: "https://forum.example/retry",
      snippet: "Retry policy discussion",
      sourceKind: "community",
      providerId: "fake"
    }
  ], task);

  expect(results[0]).toMatchObject({ versionLabel: "2.0", versionState: "latest", sourceKind: "primary" });
  expect(results.find((result) => result.versionLabel === "1.0")?.versionState).toBe("older");
  expect(filterExplorerSearchResults(results, { latestVersionsOnly: true }).map((result) => result.versionLabel)).not.toContain("1.0");
  expect(filterExplorerSearchResults(results, { sourceKinds: ["primary", "official"] })).toHaveLength(2);
});

test("retries transient provider failures and exposes a retryable terminal state", async () => {
  const task = deriveExplorerPlan(createSystematizeWorkspace()).tasks[0];
  const successfulSearch = vi.fn<KnowledgeSearchProvider["search"]>()
    .mockRejectedValueOnce(new Error("temporary outage"))
    .mockResolvedValueOnce([{ title: "Retry policy evidence", url: "https://example.com/evidence", providerId: "retrying" }]);
  const completed = await executeExplorerSearch({ id: "retrying", search: successfulSearch }, task, {
    retryDelayMs: 0,
    now: () => "2026-07-16T00:00:00.000Z"
  });
  expect(completed).toMatchObject({ status: "completed", canRetry: false });
  expect(completed.attempts.map((attempt) => attempt.status)).toEqual(["failed", "completed"]);

  const failed = await executeExplorerSearch({ id: "offline", search: vi.fn().mockRejectedValue(new Error("offline")) }, task, {
    maxAttempts: 2,
    retryDelayMs: 0,
    now: () => "2026-07-16T00:00:00.000Z"
  });
  expect(failed).toMatchObject({ status: "failed", canRetry: true, results: [] });
  expect(failed.attempts).toHaveLength(2);
});

test("batch capture stores actual page bodies once and reports content duplicates", async () => {
  const workspace = createSystematizeWorkspace();
  const task = deriveExplorerPlan(workspace).tasks[0];
  const results = rankExplorerSearchResults([
    { title: "Primary retry guide", url: "https://one.example/retry", sourceKind: "primary", providerId: "capture" },
    { title: "Mirrored retry guide", url: "https://two.example/retry", sourceKind: "official", providerId: "capture" }
  ], task);
  const capture = vi.fn<NonNullable<KnowledgeSearchProvider["capture"]>>()
    .mockRejectedValueOnce(new Error("temporary capture error"))
    .mockResolvedValue({ content: "A bounded retry budget prevents cascading failure.", mediaType: "text/plain" });
  const execution = await captureExplorerSearchResults({
    snapshot: workspace,
    task,
    provider: { id: "capture", search: vi.fn(), capture },
    results,
    parsers: [new BuiltinTextSourceParser()],
    rawStore: new InMemoryRawSourceStore(),
    requestedAt: "2026-07-16T00:00:00.000Z",
    retryDelayMs: 0
  });

  expect(execution.decisions.map((decision) => decision.reason)).toEqual(["ingested", "duplicate_content"]);
  expect(execution.decisions[0].attempts).toBe(2);
  expect(execution.snapshot.knowledgeSourceAssets).toHaveLength(workspace.knowledgeSourceAssets.length + 1);
  expect(execution.snapshot.candidatePatches.at(-1)).toMatchObject({ action: "source", status: "pending_review" });
});

test("stores captured page text as an immutable source before proposing graph structure", async () => {
  const workspace = createSystematizeWorkspace();
  const task = deriveExplorerPlan(workspace).tasks[0];
  const rawStore = new InMemoryRawSourceStore();
  const sourceContent = "The retry budget must be bounded.\n\nThis page describes failure conditions.";

  const result = await ingestExplorerSourceCapture({
    snapshot: workspace,
    capture: {
      task,
      result: { title: "Retry budgets", url: "https://example.com/retry?utm_campaign=alpha#section", providerId: "fake" },
      sourceContent,
      requestedAt: "2026-07-14T13:00:00.000Z"
    },
    parsers: [new BuiltinTextSourceParser()],
    rawStore
  });

  expect(result.ingest).toMatchObject({ status: "parsed", source: { immutable: true, uri: "https://example.com/retry", inventoryKind: "document" } });
  expect(result.snapshot.graph).toEqual(workspace.graph);
  expect(result.snapshot.candidatePatches.at(-1)).toMatchObject({ action: "source", targetNodeId: workspace.selection.focusNodeId, status: "pending_review" });
  const stored = rawStore.get(result.ingest.source!.id)!;
  expect(new TextDecoder().decode(stored.content)).toBe(sourceContent);
  await expect(rawStore.verify(stored.asset.id)).resolves.toBe(true);
});

test("refuses to promote a listing snippet without captured source content", async () => {
  const workspace = createSystematizeWorkspace();
  const task = deriveExplorerPlan(workspace).tasks[0];
  await expect(ingestExplorerSourceCapture({
    snapshot: workspace,
    capture: {
      task,
      result: { title: "Search listing", url: "https://example.com/listing", snippet: "not enough", providerId: "fake" },
      sourceContent: " ",
      requestedAt: "2026-07-14T13:00:00.000Z"
    },
    parsers: [new BuiltinTextSourceParser()],
    rawStore: new InMemoryRawSourceStore()
  })).rejects.toThrow("不能只保存搜索摘要");
});

test("proposes adjacent-domain, counterexample and verification nodes behind review", () => {
  const initial = createSystematizeWorkspace();
  const proposed = proposeExplorerCandidates(initial);

  expect(proposed.graph).toEqual(initial.graph);
  expect(proposed.agentRequests.at(-1)).toMatchObject({ action: "explore", status: "proposed" });
  const patch = proposed.candidatePatches.at(-1)!;
  expect(patch).toMatchObject({ action: "explore", status: "pending_review", targetNodeId: initial.selection.focusNodeId });
  expect(patch.operations.filter((operation) => operation.kind === "create_node")).toEqual(expect.arrayContaining([
    expect.objectContaining({ node: expect.objectContaining({ kind: "question", tags: expect.arrayContaining(["探索类型:adjacent_domain"]) }) }),
    expect.objectContaining({ node: expect.objectContaining({ kind: "hypothesis", epistemicStatus: "unverified", sourceRefs: [], tags: expect.arrayContaining(["探索类型:counterexample"]) }) }),
    expect.objectContaining({ node: expect.objectContaining({ kind: "question", tags: expect.arrayContaining(["探索类型:verification"]) }) })
  ]));
  expect(() => proposeExplorerCandidates(proposed)).toThrow("请先审核当前 Explorer");

  const accepted = acceptCandidateGraphPatch(proposed, patch.id);
  expect(accepted.graph.nodes.some((node) => node.tags.includes("探索类型:counterexample"))).toBe(true);
  expect(accepted.graph.nodes.find((node) => node.tags.includes("探索类型:counterexample"))?.epistemicStatus).toBe("unverified");
});

function createSystematizeWorkspace() {
  return createProjectWorkspace({ mode: "systematize", title: "Retry policy", subjectKind: "topic" });
}
