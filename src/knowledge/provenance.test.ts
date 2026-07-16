import { expect, test } from "vitest";
import type {
  CandidateGraphPatch,
  KnowledgeEdge,
  KnowledgeGraph,
  KnowledgeNode,
  KnowledgeSourceAsset,
  SourceAnchor
} from "../types";
import { acceptCandidateGraphPatch, createProjectWorkspace } from "./knowledgeEngine";
import { createGraphPatchAudit } from "./graphPatch";
import { createKnowledgeMetadata } from "./knowledgeMetadata";
import {
  assertKnowledgeProvenance,
  validateKnowledgeProvenance
} from "./provenance";

test("accepts Evidence only when locator, anchor and immutable source version agree", () => {
  const source = sourceAsset();
  const anchor = sourceAnchor(source);
  const evidence = node("evidence-1", "evidence", "verified", [sourceRef(source, anchor)]);
  const graph = knowledgeGraph([evidence], []);

  expect(validateKnowledgeProvenance(graph, { sources: [source], anchors: [anchor] })).toEqual([]);

  const staleAnchor = { ...anchor, contentHash: "sha256:stale" };
  expect(validateKnowledgeProvenance(graph, { sources: [source], anchors: [staleAnchor] })
    .map((issue) => issue.code)).toEqual([
      "invalid_source_ref",
      "evidence_without_source"
    ]);

  const invalidLocator = {
    ...anchor,
    locator: { kind: "text" as const, lineStart: 0, lineEnd: 4, section: "Architecture" }
  };
  expect(validateKnowledgeProvenance(graph, { sources: [source], anchors: [invalidLocator] })
    .map((issue) => issue.code)).toEqual([
      "invalid_source_ref",
      "evidence_without_source"
    ]);
});

test("allows an open source-free Claim but never a verified one", () => {
  const openClaim = node("claim-open", "claim", "open", []);
  const verifiedClaim = node("claim-verified", "claim", "verified", []);

  expect(validateKnowledgeProvenance(knowledgeGraph([openClaim], []))).toEqual([]);
  expect(validateKnowledgeProvenance(knowledgeGraph([verifiedClaim], []))).toEqual([
    expect.objectContaining({ code: "verified_claim_without_evidence", nodeId: verifiedClaim.id })
  ]);
});

test("allows a verified Claim supported by a source-backed Evidence node", () => {
  const source = sourceAsset();
  const anchor = sourceAnchor(source);
  const evidence = node("evidence-support", "evidence", "verified", [sourceRef(source, anchor)]);
  const claim = node("claim-supported", "claim", "verified", []);
  const support: KnowledgeEdge = {
    id: "evidence-supports-claim",
    fromNodeId: evidence.id,
    toNodeId: claim.id,
    kind: "supports",
    confidence: 0.95,
    createdAt: "2026-07-14T00:00:00.000Z"
  };

  expect(validateKnowledgeProvenance(
    knowledgeGraph([evidence, claim], [support]),
    { sources: [source], anchors: [anchor] }
  )).toEqual([]);
});

test("requires Facts to be directly sourced and grounds inference-to-conclusion chains", () => {
  const source = sourceAsset();
  const anchor = sourceAnchor(source);
  const fact = node("fact-grounded", "fact", "verified", [sourceRef(source, anchor)]);
  const inference = node("inference-grounded", "inference", "verified", []);
  const conclusion = node("conclusion-grounded", "conclusion", "verified", []);
  const edges: KnowledgeEdge[] = [
    {
      id: "fact-supports-inference",
      fromNodeId: fact.id,
      toNodeId: inference.id,
      kind: "supports",
      confidence: 0.95,
      createdAt: fact.createdAt
    },
    {
      id: "inference-supports-conclusion",
      fromNodeId: inference.id,
      toNodeId: conclusion.id,
      kind: "supports",
      confidence: 0.88,
      createdAt: fact.createdAt
    }
  ];

  expect(validateKnowledgeProvenance(
    knowledgeGraph([fact, inference, conclusion], edges),
    { sources: [source], anchors: [anchor] }
  )).toEqual([]);

  const unsourcedFact = { ...fact, id: "fact-unsourced", sourceRefs: [], sourceStatus: "unlinked" as const };
  expect(validateKnowledgeProvenance(knowledgeGraph([unsourcedFact], []))
    .map((issue) => issue.code)).toEqual([
      "invalid_node_metadata",
      "fact_without_source"
    ]);
});

test("blocks an invalid verified Claim before a CandidateGraphPatch enters the primary graph", () => {
  const workspace = createProjectWorkspace({
    mode: "understand",
    title: "Provenance gate",
    subjectKind: "document"
  });
  expect(validateKnowledgeProvenance(workspace.graph)).toEqual([]);
  const claim = node("claim-without-source", "claim", "verified", []);
  const patch: CandidateGraphPatch = {
    id: "invalid-provenance-patch",
    requestId: "invalid-provenance-request",
    action: "summarize",
    targetNodeId: workspace.project.subject.rootNodeId,
    focusNodeId: claim.id,
    title: "Invalid verified claim",
    summary: "Must not enter the graph",
    revision: 1,
    createdBy: "agent",
    operations: [{
      kind: "create_node",
      node: claim,
      audit: createGraphPatchAudit("audit-invalid-claim", "Test the provenance acceptance gate", "2026-07-14T00:00:00.000Z")
    }],
    confidence: 0.9,
    status: "pending_review",
    createdAt: "2026-07-14T00:00:00.000Z"
  };
  const proposed = { ...workspace, candidatePatches: [patch] };

  expect(() => acceptCandidateGraphPatch(proposed, patch.id)).toThrow(
    "verified_claim_without_evidence"
  );
  expect(workspace.graph.nodes.some((item) => item.id === claim.id)).toBe(false);
});

test("rejects fabricated source refs that are absent from the workspace registry", () => {
  const workspace = createProjectWorkspace({
    mode: "research",
    title: "Fabricated source",
    subjectKind: "question"
  });
  const fakeClaim = node("claim-fake-source", "claim", "verified", [{
    sourceId: "missing-source@v1",
    anchorId: "missing-anchor",
    locator: "L1",
    quote: "fabricated"
  }]);
  const patch: CandidateGraphPatch = {
    id: "fake-source-patch",
    requestId: "fake-source-request",
    action: "summarize",
    targetNodeId: workspace.project.subject.rootNodeId,
    focusNodeId: fakeClaim.id,
    title: "Fake source",
    summary: "Must not enter the graph",
    revision: 1,
    createdBy: "agent",
    operations: [{
      kind: "create_node",
      node: fakeClaim,
      audit: createGraphPatchAudit("audit-fake-source", "Test rejection of a fabricated source", "2026-07-14T00:00:00.000Z")
    }],
    confidence: 0.9,
    status: "pending_review",
    createdAt: "2026-07-14T00:00:00.000Z"
  };

  expect(() => acceptCandidateGraphPatch(
    { ...workspace, candidatePatches: [patch] },
    patch.id
  )).toThrow("unknown source");
});

test("requires source and anchor registries together for deep validation", () => {
  expect(() => assertKnowledgeProvenance(knowledgeGraph([], []), { sources: [] })).toThrow(
    "sources and anchors together"
  );
});

function node(
  id: string,
  kind: KnowledgeNode["kind"],
  status: KnowledgeNode["status"],
  sourceRefs: KnowledgeNode["sourceRefs"]
): KnowledgeNode {
  const metadata = createKnowledgeMetadata({
    kind,
    createdBy: "agent",
    creatorId: "test-agent",
    scopeContextId: "project-provenance",
    sourceRefCount: sourceRefs.length,
    sourceVerified: sourceRefs.length > 0
  });
  if (status === "verified") metadata.epistemicStatus = "supported";
  return {
    id,
    kind,
    title: id,
    summary: id,
    status,
    ...metadata,
    depth: 1,
    tags: [],
    sourceRefs,
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z"
  };
}

function knowledgeGraph(nodes: KnowledgeNode[], edges: KnowledgeEdge[]): KnowledgeGraph {
  return {
    id: "graph-provenance",
    title: "Provenance graph",
    rootNodeIds: nodes[0] ? [nodes[0].id] : [],
    nodes,
    edges,
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z"
  };
}

function sourceAsset(): KnowledgeSourceAsset {
  return {
    id: "guide@v1-aaaaaaaaaaaa",
    logicalSourceId: "guide",
    version: 1,
    spaceId: "space-main",
    format: "markdown",
    title: "Guide",
    uri: "file:///workspace/guide.md",
    mediaType: "text/markdown",
    contentHash: "sha256:aaaa",
    byteLength: 12,
    immutable: true,
    createdAt: "2026-07-14T00:00:00.000Z"
  };
}

function sourceAnchor(source: KnowledgeSourceAsset): SourceAnchor {
  return {
    id: "anchor-guide-1",
    sourceId: source.id,
    locator: { kind: "text", lineStart: 3, lineEnd: 4, section: "Architecture" },
    quote: "Architecture facts",
    contentHash: source.contentHash
  };
}

function sourceRef(source: KnowledgeSourceAsset, anchor: SourceAnchor) {
  return {
    sourceId: source.id,
    anchorId: anchor.id,
    locator: "L3-L4 · Architecture",
    quote: anchor.quote
  };
}
