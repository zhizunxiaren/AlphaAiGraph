// @vitest-environment node
import { expect, test } from "vitest";
import type { CandidateGraphPatch, KnowledgeEdge, KnowledgeNode } from "../types";
import { createProjectWorkspace } from "./knowledgeEngine";
import {
  assertCorrectionImpactAssessmentCurrent,
  deriveImpactAssessment,
  impactRelationDirections
} from "./impactAssessment";
import { createKnowledgeMetadata } from "./knowledgeMetadata";
import { deserializeKnowledgeWorkspace, serializeKnowledgeWorkspace } from "./workspacePersistence";

test("traverses typed dependency directions and classifies judgments, methods, summaries, and conclusions", () => {
  const snapshot = workspaceWithDownstream();
  const targetNodeId = snapshot.project.subject.rootNodeId;
  const assessment = deriveImpactAssessment(snapshot, {
    patchId: "patch-correction",
    targetNodeId,
    assessedAt: snapshot.graph.updatedAt
  });

  expect(impactRelationDirections).toMatchObject({
    supports: "forward",
    depends_on: "reverse",
    summarizes: "reverse",
    derived_from: "reverse",
    contains: "none",
    related_to: "none"
  });
  expect(assessment).toMatchObject({
    id: "impact-patch-correction",
    patchId: "patch-correction",
    targetNodeId,
    counts: { judgment: 1, method: 1, summary: 1, conclusion: 1 },
    hasDownstreamImpact: true
  });
  expect(assessment.affectedItems.map((item) => [item.nodeId, item.category, item.distance])).toEqual([
    ["impact-judgment", "judgment", 1],
    ["impact-method", "method", 1],
    ["impact-summary", "summary", 1],
    ["impact-conclusion", "conclusion", 2]
  ]);
  expect(assessment.affectedItems.find((item) => item.nodeId === "impact-conclusion")?.path.map((step) => step.relationKind))
    .toEqual(["supports", "derived_from"]);
  expect(assessment.affectedItems.some((item) => item.nodeId === "impact-structural-decoy")).toBe(false);
});

test("is deterministic across graph array order and reports no impact for an isolated node", () => {
  const snapshot = workspaceWithDownstream();
  const input = {
    patchId: "patch-deterministic",
    targetNodeId: snapshot.project.subject.rootNodeId,
    assessedAt: snapshot.graph.updatedAt
  };
  const reordered = {
    ...snapshot,
    graph: {
      ...snapshot.graph,
      nodes: [...snapshot.graph.nodes].reverse(),
      edges: [...snapshot.graph.edges].reverse()
    }
  };
  expect(deriveImpactAssessment(reordered, input)).toEqual(deriveImpactAssessment(snapshot, input));

  const isolated = deriveImpactAssessment(snapshot, {
    ...input,
    patchId: "patch-isolated",
    targetNodeId: "impact-structural-decoy"
  });
  expect(isolated).toMatchObject({
    counts: { judgment: 0, method: 0, summary: 0, conclusion: 0 },
    affectedItems: [],
    hasDownstreamImpact: false
  });
});

test("requires every correction patch to carry a current assessment for the same target", () => {
  const snapshot = workspaceWithDownstream();
  const targetNodeId = snapshot.project.subject.rootNodeId;
  const patch = correctionPatch(targetNodeId, snapshot.graph.updatedAt);
  expect(() => assertCorrectionImpactAssessmentCurrent(snapshot, patch)).toThrow("missing_impact_assessment");

  const assessed = {
    ...patch,
    impactAssessment: deriveImpactAssessment(snapshot, {
      patchId: patch.id,
      targetNodeId,
      assessedAt: patch.createdAt
    })
  };
  expect(() => assertCorrectionImpactAssessmentCurrent(snapshot, assessed)).not.toThrow();
  expect(() => assertCorrectionImpactAssessmentCurrent(snapshot, {
    ...assessed,
    impactAssessment: { ...assessed.impactAssessment, targetNodeId: "other" }
  })).toThrow("impact_identity_mismatch");
});

test("round trips ImpactAssessment with the durable patch and rejects broken paths", () => {
  const snapshot = workspaceWithDownstream();
  const targetNodeId = snapshot.project.subject.rootNodeId;
  const patch = correctionPatch(targetNodeId, snapshot.graph.updatedAt);
  const assessedPatch = {
    ...patch,
    impactAssessment: deriveImpactAssessment(snapshot, {
      patchId: patch.id,
      targetNodeId,
      assessedAt: patch.createdAt
    })
  };
  const request = {
    id: patch.requestId,
    action: "correct" as const,
    selectionId: snapshot.selection.id,
    prompt: "Assess correction impact",
    status: "proposed" as const,
    createdAt: snapshot.graph.updatedAt
  };
  const durable = {
    ...snapshot,
    agentRequests: snapshot.agentRequests.concat(request),
    candidatePatches: snapshot.candidatePatches.concat(assessedPatch)
  };
  const serialized = serializeKnowledgeWorkspace(durable, "2026-07-14T15:00:00.000Z");
  expect(deserializeKnowledgeWorkspace(serialized).candidatePatches.at(-1)?.impactAssessment).toEqual(assessedPatch.impactAssessment);

  const broken = JSON.parse(serialized);
  broken.workspace.candidatePatches.at(-1).impactAssessment.affectedItems[0].path[0].edgeId = "missing-edge";
  expect(() => deserializeKnowledgeWorkspace(JSON.stringify(broken))).toThrow("unknown edge");
});

function workspaceWithDownstream() {
  const snapshot = createProjectWorkspace({ mode: "systematize", title: "Impact graph", subjectKind: "topic" });
  const targetNodeId = snapshot.project.subject.rootNodeId;
  const nodes: KnowledgeNode[] = [
    node("impact-judgment", "claim", "Derived judgment", snapshot),
    node("impact-method", "practice", "Dependent method", snapshot),
    node("impact-summary", "synthesis", "Dependent summary", snapshot),
    node("impact-conclusion", "conclusion", "Transitive conclusion", snapshot),
    node("impact-structural-decoy", "claim", "Structural only", snapshot)
  ];
  const edges: KnowledgeEdge[] = [
    edge("impact-target-supports-judgment", targetNodeId, "impact-judgment", "supports", snapshot.graph.updatedAt),
    edge("impact-method-depends-target", "impact-method", targetNodeId, "depends_on", snapshot.graph.updatedAt),
    edge("impact-summary-covers-target", "impact-summary", targetNodeId, "summarizes", snapshot.graph.updatedAt),
    edge("impact-conclusion-derived-judgment", "impact-conclusion", "impact-judgment", "derived_from", snapshot.graph.updatedAt),
    edge("impact-target-contains-decoy", targetNodeId, "impact-structural-decoy", "contains", snapshot.graph.updatedAt)
  ];
  return {
    ...snapshot,
    graph: {
      ...snapshot.graph,
      nodes: snapshot.graph.nodes.concat(nodes),
      edges: snapshot.graph.edges.concat(edges)
    }
  };
}

function node(
  id: string,
  kind: KnowledgeNode["kind"],
  title: string,
  snapshot: ReturnType<typeof createProjectWorkspace>
): KnowledgeNode {
  return {
    id,
    kind,
    title,
    summary: title,
    status: "open",
    ...createKnowledgeMetadata({ kind, createdBy: "agent", creatorId: "impact-test", scopeContextId: snapshot.project.id }),
    depth: 2,
    tags: [],
    sourceRefs: [],
    createdAt: snapshot.graph.updatedAt,
    updatedAt: snapshot.graph.updatedAt
  };
}

function edge(
  id: string,
  fromNodeId: string,
  toNodeId: string,
  kind: KnowledgeEdge["kind"],
  createdAt: string
): KnowledgeEdge {
  return { id, fromNodeId, toNodeId, kind, rationale: "Impact dependency fixture", createdBy: "agent", confidence: 1, createdAt };
}

function correctionPatch(targetNodeId: string, createdAt: string): CandidateGraphPatch {
  return {
    id: "impact-correction-patch",
    requestId: "impact-correction-request",
    action: "correct",
    targetNodeId,
    focusNodeId: targetNodeId,
    title: "Correction",
    summary: "Correction",
    revision: 1,
    createdBy: "agent",
    operations: [],
    confidence: 0.8,
    status: "pending_review",
    createdAt
  };
}
