// @vitest-environment node
import { expect, test } from "vitest";
import type { IngestRequest, KnowledgeInventoryItemKind, KnowledgeWorkspaceSnapshot } from "../types";
import { BuiltinMarkdownSourceParser } from "./builtinSourceParsers";
import { acceptCandidateGraphPatch, createProjectWorkspace, rejectCandidateGraphPatch } from "./knowledgeEngine";
import { deriveKnowledgeInventory } from "./knowledgeInventory";
import { InMemoryRawSourceStore } from "./rawSourceStore";
import { ingestSourceIntoWorkspace } from "./sourceIngest";

const parser = new BuiltinMarkdownSourceParser();
const rawStore = new InMemoryRawSourceStore();
const now = "2026-07-14T10:00:00.000Z";

test("builds a deterministic inventory for notes, documents, bookmarks, and experience without a second data model", async () => {
  let workspace = createProjectWorkspace({
    mode: "systematize",
    title: "Distributed systems practice",
    subjectKind: "topic"
  });
  const original = structuredClone(workspace);

  const note = await ingest(workspace, "note", "Retry notes", "Retries require idempotency.");
  workspace = acceptCandidateGraphPatch(note.snapshot, note.patchId!);
  const document = await ingest(workspace, "document", "Architecture guide", "# Storage\nUse an append-only log.");
  workspace = acceptCandidateGraphPatch(document.snapshot, document.patchId!);
  const bookmarks = await ingest(workspace, "bookmark_index", "Reading list", "- [Raft paper](https://raft.github.io/) — consensus reference");
  workspace = bookmarks.snapshot;
  const experience = await ingest(workspace, "experience", "Incident lesson", "In our service, jitter reduced retry storms.");
  workspace = rejectCandidateGraphPatch(experience.snapshot, experience.patchId!);

  const beforeProjection = structuredClone(workspace);
  const inventory = deriveKnowledgeInventory(workspace);
  const reordered = deriveKnowledgeInventory({
    ...workspace,
    graph: { ...workspace.graph, nodes: [...workspace.graph.nodes].reverse() },
    candidatePatches: [...workspace.candidatePatches].reverse(),
    knowledgeSourceAssets: [...workspace.knowledgeSourceAssets].reverse(),
    sourceAnchors: [...workspace.sourceAnchors].reverse()
  });

  expect(inventory).toEqual(reordered);
  expect(workspace).toEqual(beforeProjection);
  expect(original.knowledgeSourceAssets).toEqual([]);
  expect(inventory.counts).toEqual({ note: 1, document: 1, bookmark_index: 1, experience: 1 });
  expect(inventory).toMatchObject({ mappedItemCount: 2, pendingReviewItemCount: 1, unmappedItemCount: 1 });
  expect(inventory.items.map((item) => [item.kind, item.reviewState])).toEqual([
    ["bookmark_index", "pending_review"],
    ["document", "mapped"],
    ["experience", "unmapped"],
    ["note", "mapped"]
  ]);

  const inventoryRootId = `${workspace.project.subject.rootNodeId}-inventory`;
  const acceptedInventoryNodes = workspace.graph.nodes.filter((node) =>
    node.sourceRefs.length > 0 && ["note", "document"].includes(sourceKindForNode(workspace, node.id))
  );
  expect(acceptedInventoryNodes.length).toBeGreaterThanOrEqual(2);
  expect(acceptedInventoryNodes.every((node) => workspace.graph.edges.some((edge) =>
    edge.kind === "contains" && edge.fromNodeId === inventoryRootId && edge.toNodeId === node.id
  ))).toBe(true);
});

async function ingest(
  snapshot: KnowledgeWorkspaceSnapshot,
  inventoryKind: KnowledgeInventoryItemKind,
  title: string,
  content: string
) {
  const sourceId = `${inventoryKind}-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  const request: IngestRequest = {
    id: `ingest-${sourceId}`,
    projectId: snapshot.project.id,
    spaceId: snapshot.space.id,
    sourceId,
    inventoryKind,
    title,
    uri: `urn:test:${sourceId}`,
    format: "markdown",
    mediaType: "text/markdown",
    requestedAt: now
  };
  return await ingestSourceIntoWorkspace({ snapshot, request, content, parsers: [parser], rawStore });
}

function sourceKindForNode(snapshot: KnowledgeWorkspaceSnapshot, nodeId: string): KnowledgeInventoryItemKind {
  const node = snapshot.graph.nodes.find((candidate) => candidate.id === nodeId)!;
  const source = snapshot.knowledgeSourceAssets.find((candidate) => candidate.id === node.sourceRefs[0]?.sourceId);
  return source?.inventoryKind ?? "document";
}
