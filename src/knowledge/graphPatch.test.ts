import { expect, test } from "vitest";
import type {
  CandidateGraphPatch,
  GraphPatchOperation,
  KnowledgeEdge,
  KnowledgeNodeStatusSnapshot,
  KnowledgeSourceAsset,
  SourceAnchor
} from "../types";
import { acceptCandidateGraphPatch, createProjectWorkspace, knowledgeNow } from "./knowledgeEngine";
import { createGraphPatchAudit } from "./graphPatch";

test("applies revise, link, status, source, and archive operations with durable audit snapshots", () => {
  const workspace = createProjectWorkspace({ mode: "systematize", title: "Patch audit", subjectKind: "topic" });
  const [root, reviseTarget, statusTarget, sourceTarget, archiveTarget] = workspace.graph.nodes;
  const source = sourceAsset();
  const anchor = sourceAnchor(source);
  const revisedNode = {
    ...reviseTarget,
    summary: "Revised only after an explicit human-reviewed patch.",
    updatedAt: knowledgeNow
  };
  const statusBefore: KnowledgeNodeStatusSnapshot = {
    status: statusTarget.status,
    epistemicStatus: statusTarget.epistemicStatus,
    temporalValidity: statusTarget.temporalValidity
  };
  const statusAfter: KnowledgeNodeStatusSnapshot = { ...statusBefore, status: "exploring" };
  const sourceRef = {
    sourceId: source.id,
    anchorId: anchor.id,
    locator: "L1",
    quote: anchor.quote
  };
  const linkedEdge: KnowledgeEdge = {
    id: "edge-reviewed-link",
    fromNodeId: root.id,
    toNodeId: statusTarget.id,
    kind: "related_to",
    rationale: "This cross-link is useful during validation.",
    createdBy: "agent",
    confidence: 0.82,
    createdAt: knowledgeNow
  };
  const operations: GraphPatchOperation[] = [
    {
      kind: "revise_node",
      nodeId: reviseTarget.id,
      before: reviseTarget,
      after: revisedNode,
      audit: audit("revise", "Clarify the node without hiding its previous value")
    },
    {
      kind: "link_nodes",
      before: null,
      after: linkedEdge,
      audit: audit("link", "Add an explicit reviewed relationship")
    },
    {
      kind: "update_node_status",
      nodeId: statusTarget.id,
      before: statusBefore,
      after: statusAfter,
      audit: audit("status", "Record that exploration has started")
    },
    {
      kind: "update_node_sources",
      nodeId: sourceTarget.id,
      before: { sourceRefs: sourceTarget.sourceRefs, sourceStatus: sourceTarget.sourceStatus },
      after: { sourceRefs: [sourceRef], sourceStatus: "linked" },
      audit: audit("source", "Attach an immutable source locator")
    },
    {
      kind: "archive_node",
      nodeId: archiveTarget.id,
      before: { status: archiveTarget.status },
      after: {
        status: "archived",
        archivedAt: knowledgeNow,
        archivedBy: "agent",
        archiveReason: "Archive obsolete working knowledge without deleting history"
      },
      audit: audit("archive", "Archive obsolete working knowledge without deleting history")
    }
  ];
  const patch = candidatePatch(operations, root.id, reviseTarget.id, 3);
  const accepted = acceptCandidateGraphPatch({
    ...workspace,
    knowledgeSourceAssets: [source],
    sourceAnchors: [anchor],
    candidatePatches: [patch]
  }, patch.id);

  expect(accepted.graph.nodes.find((node) => node.id === reviseTarget.id)?.summary).toBe(revisedNode.summary);
  expect(accepted.graph.nodes.find((node) => node.id === statusTarget.id)?.status).toBe("exploring");
  expect(accepted.graph.nodes.find((node) => node.id === sourceTarget.id)?.sourceRefs).toEqual([sourceRef]);
  expect(accepted.graph.nodes.find((node) => node.id === archiveTarget.id)).toMatchObject({
    status: "archived",
    archivedAt: knowledgeNow,
    archivedBy: "agent"
  });
  expect(accepted.graph.edges).toContainEqual(linkedEdge);
  expect(accepted.candidatePatches[0]).toMatchObject({
    revision: 3,
    status: "accepted",
    reviewedBy: "user",
    reviewedAt: knowledgeNow
  });
  expect((accepted.candidatePatches[0].operations[0] as Extract<GraphPatchOperation, { kind: "revise_node" }>).before.summary)
    .toBe(reviseTarget.summary);
});

test("rejects a stale before snapshot atomically", () => {
  const workspace = createProjectWorkspace({ mode: "understand", title: "Atomic patch", subjectKind: "technology" });
  const [root, first, second] = workspace.graph.nodes;
  const operations: GraphPatchOperation[] = [
    {
      kind: "revise_node",
      nodeId: first.id,
      before: first,
      after: { ...first, summary: "Must not leak from a failed patch.", updatedAt: knowledgeNow },
      audit: audit("atomic-revise", "Prepare a valid revision")
    },
    {
      kind: "update_node_status",
      nodeId: second.id,
      before: {
        status: "verified",
        epistemicStatus: second.epistemicStatus,
        temporalValidity: second.temporalValidity
      },
      after: {
        status: "exploring",
        epistemicStatus: second.epistemicStatus,
        temporalValidity: second.temporalValidity
      },
      audit: audit("atomic-stale", "This stale operation must reject the whole patch")
    }
  ];
  const patch = candidatePatch(operations, root.id, first.id);

  expect(() => acceptCandidateGraphPatch({ ...workspace, candidatePatches: [patch] }, patch.id))
    .toThrow("[stale_before]");
  expect(workspace.graph.nodes.find((node) => node.id === first.id)?.summary).toBe(first.summary);
  expect(workspace.candidatePatches).toEqual([]);
});

test("blocks silent id overwrites and unaudited operations", () => {
  const workspace = createProjectWorkspace({ mode: "understand", title: "No overwrite", subjectKind: "technology" });
  const root = workspace.graph.nodes[0];
  const overwritePatch = candidatePatch([{
    kind: "create_node",
    node: { ...root, summary: "Hidden overwrite" },
    audit: audit("overwrite", "Attempt a duplicate id")
  }], root.id, root.id);
  expect(() => acceptCandidateGraphPatch({ ...workspace, candidatePatches: [overwritePatch] }, overwritePatch.id))
    .toThrow("[silent_overwrite]");

  const unauditedPatch = candidatePatch([{
    kind: "link_nodes",
    before: null,
    after: {
      id: "edge-no-audit",
      fromNodeId: root.id,
      toNodeId: workspace.graph.nodes[1].id,
      kind: "related_to",
      confidence: 0.5,
      createdAt: knowledgeNow
    },
    audit: audit("missing-reason", "")
  }], root.id, root.id);
  expect(() => acceptCandidateGraphPatch({ ...workspace, candidatePatches: [unauditedPatch] }, unauditedPatch.id))
    .toThrow("[missing_audit_rationale]");
});

function candidatePatch(
  operations: GraphPatchOperation[],
  targetNodeId: string,
  focusNodeId: string,
  revision = 1
): CandidateGraphPatch {
  return {
    id: `patch-${operations[0].audit.id}`,
    requestId: `request-${operations[0].audit.id}`,
    action: "revise",
    targetNodeId,
    focusNodeId,
    title: "Audited graph maintenance",
    summary: "Apply explicit knowledge maintenance operations.",
    revision,
    createdBy: "agent",
    operations,
    confidence: 0.9,
    status: "pending_review",
    createdAt: knowledgeNow
  };
}

function audit(id: string, rationale: string) {
  return createGraphPatchAudit(`audit-${id}`, rationale, knowledgeNow);
}

function sourceAsset(): KnowledgeSourceAsset {
  return {
    id: "source-patch@v1",
    logicalSourceId: "source-patch",
    version: 1,
    spaceId: "space-main",
    format: "text",
    title: "Patch source",
    uri: "file:///patch-source.txt",
    mediaType: "text/plain",
    contentHash: "hash-patch-source",
    byteLength: 12,
    immutable: true,
    createdAt: knowledgeNow
  };
}

function sourceAnchor(source: KnowledgeSourceAsset): SourceAnchor {
  return {
    id: "anchor-patch-source-l1",
    sourceId: source.id,
    locator: { kind: "text", lineStart: 1 },
    quote: "source line",
    contentHash: source.contentHash
  };
}
