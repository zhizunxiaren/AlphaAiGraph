// @vitest-environment node
import { expect, test } from "vitest";
import { BuiltinMarkdownSourceParser } from "./builtinSourceParsers";
import {
  buildCorrectionSuggestion,
  correctionPolicy,
  deriveCorrectionEvidenceCandidates,
  proposeCorrection
} from "./correctionPolicy";
import {
  acceptCandidateGraphPatch,
  buildKnowledgeSelection,
  createProjectWorkspace
} from "./knowledgeEngine";
import { InMemoryRawSourceStore } from "./rawSourceStore";
import { ingestSourceIntoWorkspace } from "./sourceIngest";
import { createKnowledgeMetadata } from "./knowledgeMetadata";
import type { KnowledgeNode } from "../types";

test("derives only source-grounded evidence candidates and preserves their existing stance", async () => {
  const workspace = await workspaceWithEvidence();
  const candidates = deriveCorrectionEvidenceCandidates(workspace);

  expect(correctionPolicy).toMatchObject({
    requiresGroundedSupportingEvidence: true,
    preservesPreviousKnowledge: true,
    writesThroughCandidatePatchOnly: true,
    includesImpactAssessment: false
  });
  expect(candidates).toHaveLength(2);
  expect(candidates.every((candidate) => candidate.sourceCount === 1)).toBe(true);
  expect(candidates.map((candidate) => candidate.title)).toEqual(expect.arrayContaining(["Primary support", "Known limitation"]));
  expect(candidates.every((candidate) => candidate.stance === "unclassified")).toBe(true);
});

test("builds a structured correction suggestion with error, evidence, content, and scope", async () => {
  const workspace = await workspaceWithEvidence();
  const [support, opposition] = deriveCorrectionEvidenceCandidates(workspace);
  const suggestion = buildCorrectionSuggestion(workspace, {
    targetNodeId: workspace.selectedNodeId,
    errorType: "scope_overgeneralization",
    correctedContent: "指数退避只在请求可安全重试且设置总预算时适用。",
    applicabilityScope: "具备幂等键、总重试预算和可观测失败率的后端服务",
    supportingEvidenceNodeIds: [support.nodeId],
    opposingEvidenceNodeIds: [opposition.nodeId]
  });

  expect(suggestion).toMatchObject({
    errorTypeLabel: "适用范围过度泛化",
    correctedContent: "指数退避只在请求可安全重试且设置总预算时适用。",
    applicabilityScope: "具备幂等键、总重试预算和可观测失败率的后端服务",
    supportingEvidence: [{ nodeId: support.nodeId }],
    opposingEvidence: [{ nodeId: opposition.nodeId }],
    independentSourceCount: 2
  });
});

test("creates a governed correction subgraph and keeps the previous knowledge", async () => {
  const initial = await workspaceWithEvidence();
  const [support, opposition] = deriveCorrectionEvidenceCandidates(initial);
  const proposed = proposeCorrection(initial, {
    targetNodeId: initial.selectedNodeId,
    errorType: "factual_error",
    correctedContent: "指数退避必须与重试预算和幂等约束一起使用。",
    applicabilityScope: "支付服务，具备幂等键且总重试预算不超过 3 次",
    supportingEvidenceNodeIds: [support.nodeId],
    opposingEvidenceNodeIds: [opposition.nodeId]
  });

  expect(proposed.graph).toEqual(initial.graph);
  expect(proposed.agentRequests.at(-1)).toMatchObject({ action: "correct", status: "proposed" });
  const patch = proposed.candidatePatches.at(-1)!;
  expect(patch).toMatchObject({ action: "correct", targetNodeId: initial.selectedNodeId, status: "pending_review" });
  expect(patch.impactAssessment).toMatchObject({
    patchId: patch.id,
    targetNodeId: initial.selectedNodeId,
    counts: { judgment: 0, method: 0, summary: 0, conclusion: 0 }
  });
  expect(patch.summary).toContain("1 条支持，1 条反对");
  expect(patch.operations).toEqual(expect.arrayContaining([
    expect.objectContaining({
      kind: "update_node_status",
      nodeId: initial.selectedNodeId,
      after: expect.objectContaining({ status: "contested", epistemicStatus: "contradicted" })
    }),
    expect.objectContaining({
      kind: "create_node",
      node: expect.objectContaining({ kind: "claim", status: "verified", epistemicStatus: "context_dependent", summary: "指数退避必须与重试预算和幂等约束一起使用。" })
    }),
    expect.objectContaining({ kind: "create_edge", edge: expect.objectContaining({ kind: "supports" }) }),
    expect.objectContaining({ kind: "create_edge", edge: expect.objectContaining({ kind: "contradicts" }) }),
    expect.objectContaining({ kind: "create_edge", edge: expect.objectContaining({ kind: "valid_in_context" }) }),
    expect.objectContaining({ kind: "create_edge", edge: expect.objectContaining({ kind: "corrects", toNodeId: initial.selectedNodeId }) })
  ]));

  const accepted = acceptCandidateGraphPatch(proposed, patch.id);
  const previous = accepted.graph.nodes.find((node) => node.id === initial.selectedNodeId)!;
  const corrected = accepted.graph.nodes.find((node) => node.tags.includes(`纠偏目标:${previous.id}`) && node.tags.includes("纠偏建议"))!;
  expect(previous).toMatchObject({ status: "contested", epistemicStatus: "contradicted" });
  expect(corrected).toMatchObject({ status: "verified", epistemicStatus: "context_dependent" });
  expect(accepted.graph.edges).toContainEqual(expect.objectContaining({ kind: "corrects", fromNodeId: corrected.id, toNodeId: previous.id }));
  expect(accepted.graph.nodes.some((node) => node.id === previous.id)).toBe(true);
});

test("rejects a correction when downstream knowledge changes after assessment", async () => {
  const initial = await workspaceWithEvidence();
  const [support, opposition] = deriveCorrectionEvidenceCandidates(initial);
  const proposed = proposeCorrection(initial, {
    targetNodeId: initial.selectedNodeId,
    errorType: "incorrect_causality",
    correctedContent: "Backoff reduces load only when retries are bounded.",
    applicabilityScope: "Idempotent backend requests with a retry budget",
    supportingEvidenceNodeIds: [support.nodeId],
    opposingEvidenceNodeIds: [opposition.nodeId]
  });
  const patch = proposed.candidatePatches.at(-1)!;
  const method: KnowledgeNode = {
    id: "late-dependent-method",
    kind: "practice",
    title: "Late dependent method",
    summary: "Added after assessment",
    status: "open",
    ...createKnowledgeMetadata({ kind: "practice", createdBy: "user", creatorId: "local-user", scopeContextId: initial.project.id }),
    depth: 2,
    tags: [],
    sourceRefs: [],
    createdAt: initial.graph.updatedAt,
    updatedAt: initial.graph.updatedAt
  };
  const changed = {
    ...proposed,
    graph: {
      ...proposed.graph,
      nodes: proposed.graph.nodes.concat(method),
      edges: proposed.graph.edges.concat({
        id: "late-method-depends-target",
        fromNodeId: method.id,
        toNodeId: initial.selectedNodeId,
        kind: "depends_on" as const,
        confidence: 1,
        createdAt: initial.graph.updatedAt
      })
    }
  };
  expect(() => acceptCandidateGraphPatch(changed, patch.id)).toThrow("stale_impact_assessment");
});

test("rejects unsupported, overlapping, or source-free correction evidence", async () => {
  const workspace = await workspaceWithEvidence();
  const [candidate, opposition] = deriveCorrectionEvidenceCandidates(workspace);
  const base = {
    targetNodeId: workspace.selectedNodeId,
    errorType: "outdated" as const,
    correctedContent: "Use the current limit.",
    applicabilityScope: "Current production version"
  };
  expect(() => buildCorrectionSuggestion(workspace, {
    ...base,
    supportingEvidenceNodeIds: []
  })).toThrow("至少需要一条");
  expect(() => buildCorrectionSuggestion(workspace, {
    ...base,
    supportingEvidenceNodeIds: [candidate.nodeId]
  })).toThrow("至少需要一条反对证据");
  expect(() => buildCorrectionSuggestion(workspace, {
    ...base,
    supportingEvidenceNodeIds: [candidate.nodeId],
    opposingEvidenceNodeIds: [candidate.nodeId]
  })).toThrow("不能同时标记");
  expect(() => buildCorrectionSuggestion(workspace, {
    ...base,
    supportingEvidenceNodeIds: [workspace.selectedNodeId],
    opposingEvidenceNodeIds: [opposition.nodeId]
  })).toThrow("带有效来源定位");
});

async function workspaceWithEvidence() {
  const initial = createProjectWorkspace({
    mode: "systematize",
    title: "Retry policy",
    subjectKind: "topic"
  });
  const rawStore = new InMemoryRawSourceStore();
  const firstIngest = await ingestSourceIntoWorkspace({
    snapshot: initial,
    request: {
      id: "ingest-correction-evidence",
      projectId: initial.project.id,
      spaceId: initial.space.id,
      sourceId: "correction-support-evidence",
      inventoryKind: "document",
      title: "Correction support evidence",
      uri: "https://example.com/correction-support-evidence",
      format: "markdown",
      mediaType: "text/markdown",
      requestedAt: "2026-07-14T14:00:00.000Z"
    },
    content: "# Primary support\n\nRetry budgets must be bounded.",
    parsers: [new BuiltinMarkdownSourceParser()],
    rawStore
  });
  const firstAccepted = acceptCandidateGraphPatch(firstIngest.snapshot, firstIngest.patchId!);
  const secondIngest = await ingestSourceIntoWorkspace({
    snapshot: firstAccepted,
    request: {
      id: "ingest-correction-opposition",
      projectId: initial.project.id,
      spaceId: initial.space.id,
      sourceId: "correction-opposition-evidence",
      inventoryKind: "document",
      title: "Correction opposition evidence",
      uri: "https://independent.example.com/correction-opposition-evidence",
      format: "markdown",
      mediaType: "text/markdown",
      requestedAt: "2026-07-14T14:01:00.000Z"
    },
    content: "# Known limitation\n\nBackoff does not make non-idempotent requests safe.",
    parsers: [new BuiltinMarkdownSourceParser()],
    rawStore
  });
  const accepted = acceptCandidateGraphPatch(secondIngest.snapshot, secondIngest.patchId!);
  const targetNodeId = initial.project.subject.rootNodeId;
  return {
    ...accepted,
    selectedNodeId: targetNodeId,
    selection: buildKnowledgeSelection(accepted, targetNodeId)
  };
}
