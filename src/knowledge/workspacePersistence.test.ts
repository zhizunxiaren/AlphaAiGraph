// @vitest-environment node
import { expect, test } from "vitest";
import type { AgentRun, KnowledgeSourceAsset, KnowledgeWorkspaceSnapshot, SourceAnchor } from "../types";
import { createKnowledgeWorkspace, proposeKnowledgeSummary } from "./knowledgeEngine";
import {
  BrowserLocalStorageKnowledgeWorkspaceStore,
  deserializeKnowledgeWorkspace,
  InMemoryKnowledgeWorkspaceStore,
  loadKnowledgeWorkspace,
  saveKnowledgeWorkspace,
  serializeKnowledgeWorkspace,
  WorkspacePersistenceError
} from "./workspacePersistence";

const savedAt = "2026-07-14T06:00:00.000Z";

test("round trips Project, KnowledgeGraph, Source, Patch, and AgentRun as one versioned workspace", async () => {
  const store = new InMemoryKnowledgeWorkspaceStore();
  const workspace = workspaceWithDurableRecords();

  await expect(saveKnowledgeWorkspace(store, workspace, savedAt)).resolves.toEqual({
    spaceId: workspace.space.id,
    schemaVersion: 2,
    savedAt
  });
  const loaded = await loadKnowledgeWorkspace(store, workspace.space.id);

  expect(loaded).toEqual(workspace);
  expect(loaded?.subject).toBe(loaded?.project.subject);
  expect(loaded?.knowledgeSourceAssets).toHaveLength(1);
  expect(loaded?.knowledgeSourceAssets[0].inventoryKind).toBe("note");
  expect(loaded?.candidatePatches).toHaveLength(1);
  expect(loaded?.agentRuns).toHaveLength(1);
  await expect(loadKnowledgeWorkspace(store, "missing-space")).resolves.toBeUndefined();
});

test("migrates schema v1 patches and collections to the current audited contract", () => {
  const current = proposeKnowledgeSummary(
    createKnowledgeWorkspace("Migration fixture"),
    "knowledge-migration-fixture"
  );
  const legacyWorkspace = JSON.parse(JSON.stringify(current)) as Record<string, unknown>;
  delete legacyWorkspace.agentRuns;
  delete legacyWorkspace.subject;
  delete legacyWorkspace.researchOrchestration;
  const patches = legacyWorkspace.candidatePatches as Array<Record<string, unknown>>;
  const patch = patches[0];
  delete patch.revision;
  delete patch.createdBy;
  for (const operation of patch.operations as Array<Record<string, unknown>>) delete operation.audit;

  const migrated = deserializeKnowledgeWorkspace(JSON.stringify({
    schemaVersion: 1,
    savedAt,
    workspace: legacyWorkspace
  }));

  expect(migrated.agentRuns).toEqual([]);
  expect(migrated.impactReviewTasks).toEqual([]);
  expect(migrated.researchOrchestration).toEqual({
    briefs: [], plans: [], tasks: [], rounds: [], searchQueries: [], verificationRecords: []
  });
  expect(migrated.subject).toBe(migrated.project.subject);
  expect(migrated.candidatePatches[0]).toMatchObject({ revision: 1, createdBy: "agent" });
  expect(migrated.candidatePatches[0].operations.every((operation) =>
    operation.audit.rationale === "Migrated from workspace schema version 1"
  )).toBe(true);

  const earlierV2 = JSON.parse(serializeKnowledgeWorkspace(current, savedAt)) as Record<string, unknown>;
  const earlierV2Workspace = earlierV2.workspace as Record<string, unknown>;
  delete earlierV2Workspace.impactReviewTasks;
  delete earlierV2Workspace.researchOrchestration;
  expect(deserializeKnowledgeWorkspace(JSON.stringify(earlierV2)).impactReviewTasks).toEqual([]);
  expect(deserializeKnowledgeWorkspace(JSON.stringify(earlierV2)).researchOrchestration).toEqual({
    briefs: [], plans: [], tasks: [], rounds: [], searchQueries: [], verificationRecords: []
  });
});

test("refuses to persist provider secrets while allowing token accounting fields", () => {
  const workspace = workspaceWithDurableRecords();
  expect(() => serializeKnowledgeWorkspace(workspace, savedAt)).not.toThrow();

  const unsafe = workspace as KnowledgeWorkspaceSnapshot & {
    providerConfig: { providerId: string; apiKey: string };
  };
  unsafe.providerConfig = { providerId: "deepseek", apiKey: "must-not-be-persisted" };

  expect(() => serializeKnowledgeWorkspace(unsafe, savedAt)).toThrowError(
    expect.objectContaining<Partial<WorkspacePersistenceError>>({ code: "sensitive_field" })
  );
});

test("rejects unsupported versions and broken graph references before restoring state", () => {
  const workspace = workspaceWithDurableRecords();
  expect(() => deserializeKnowledgeWorkspace(JSON.stringify({
    schemaVersion: 99,
    savedAt,
    workspace
  }))).toThrowError(expect.objectContaining<Partial<WorkspacePersistenceError>>({ code: "unsupported_version" }));

  const document = JSON.parse(serializeKnowledgeWorkspace(workspace, savedAt));
  document.workspace.graph.edges[0].toNodeId = "missing-node";
  expect(() => deserializeKnowledgeWorkspace(JSON.stringify(document))).toThrow("unknown target node");
  expect(() => deserializeKnowledgeWorkspace("not-json")).toThrowError(
    expect.objectContaining<Partial<WorkspacePersistenceError>>({ code: "invalid_json" })
  );
});

test("browser adapter namespaces opaque JSON without knowing the domain schema", async () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }
  };
  const store = new BrowserLocalStorageKnowledgeWorkspaceStore(storage, "test.workspace.");

  await store.save("space/with slash", "{\"schemaVersion\":2}");

  expect(values.get("test.workspace.space%2Fwith%20slash")).toBe("{\"schemaVersion\":2}");
  await expect(store.load("space/with slash")).resolves.toBe("{\"schemaVersion\":2}");
});

function workspaceWithDurableRecords(): KnowledgeWorkspaceSnapshot {
  const initial = createKnowledgeWorkspace("Persistence fixture");
  const workspace = proposeKnowledgeSummary(initial, initial.project.subject.rootNodeId);
  const source: KnowledgeSourceAsset = {
    id: "source-guide@v1-aaaaaaaaaaaa",
    logicalSourceId: "source-guide",
    version: 1,
    spaceId: workspace.space.id,
    inventoryKind: "note",
    format: "markdown",
    title: "Persistence guide",
    uri: "file:///workspace/persistence.md",
    mediaType: "text/markdown",
    contentHash: "sha256:aaaaaaaa",
    byteLength: 42,
    immutable: true,
    createdAt: savedAt
  };
  const anchor: SourceAnchor = {
    id: "source-guide-anchor-1",
    sourceId: source.id,
    locator: { kind: "text", lineStart: 1, lineEnd: 2 },
    quote: "Workspace snapshots are versioned.",
    contentHash: source.contentHash
  };
  const patch = workspace.candidatePatches[0];
  const run: AgentRun = {
    id: "agent-run-persistence-1",
    requestId: patch.requestId,
    providerId: "deepseek/deepseek-chat",
    model: "deepseek-chat",
    schemaVersion: "1.0",
    status: "succeeded",
    maxAttempts: 2,
    attemptCount: 1,
    startedAt: savedAt,
    completedAt: savedAt,
    durationMs: 12,
    patchId: patch.id,
    usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120, cachedInputTokens: 10 },
    attempts: [{
      attempt: 1,
      status: "succeeded",
      startedAt: savedAt,
      completedAt: savedAt,
      durationMs: 12,
      usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120, cachedInputTokens: 10 }
    }],
    events: [{ sequence: 1, at: savedAt, kind: "run_completed", message: "Agent run completed" }]
  };
  return {
    ...workspace,
    agentRuns: [run],
    knowledgeSourceAssets: [source],
    sourceAnchors: [anchor]
  };
}
