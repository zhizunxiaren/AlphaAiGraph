import { expect, test } from "vitest";
import type {
  CandidateGraphPatch,
  EpistemicStatus,
  KnowledgeEdge,
  KnowledgeGraph,
  KnowledgeNode
} from "../types";
import { acceptCandidateGraphPatch, createProjectWorkspace } from "./knowledgeEngine";
import { createGraphPatchAudit } from "./graphPatch";
import {
  createEvolutionEdge,
  evolutionRelationDefinitions,
  validateKnowledgeEvolution
} from "./knowledgeEvolution";
import { createKnowledgeMetadata } from "./knowledgeMetadata";

test("defines and creates auditable cognitive-evolution relations with fixed direction", () => {
  expect(Object.keys(evolutionRelationDefinitions)).toEqual([
    "refines",
    "corrects",
    "supersedes",
    "valid_in_context",
    "derived_from"
  ]);
  expect(evolutionRelationDefinitions.corrects.direction).toBe("corrected → previous");

  const edge = createEvolutionEdge({
    id: "corrected-corrects-old",
    kind: "corrects",
    fromNodeId: "corrected",
    toNodeId: "old",
    rationale: "Two independent primary sources contradict the previous value.",
    createdBy: "agent",
    createdAt: "2026-07-14T00:00:00.000Z",
    confidence: 0.94
  });
  expect(edge).toMatchObject({
    kind: "corrects",
    label: "纠正",
    createdBy: "agent",
    confidence: 0.94
  });
});

test("keeps old knowledge while validating correction and supersession history", () => {
  const oldClaim = node("old-claim", "claim", "contradicted", "contested");
  const corrected = node("corrected-claim", "claim", "supported", "verified");
  const superseded = node("old-practice", "practice", "superseded", "understood");
  const replacement = node("new-practice", "practice", "context_dependent", "verified");
  const edges = [
    createEvolutionEdge({
      id: "corrects-edge",
      kind: "corrects",
      fromNodeId: corrected.id,
      toNodeId: oldClaim.id,
      rationale: "The previous claim used an obsolete denominator.",
      createdBy: "agent",
      createdAt: corrected.createdAt
    }),
    createEvolutionEdge({
      id: "supersedes-edge",
      kind: "supersedes",
      fromNodeId: replacement.id,
      toNodeId: superseded.id,
      rationale: "The replacement practice is the current reviewed version.",
      createdBy: "user",
      createdAt: replacement.createdAt
    })
  ];
  const graph = knowledgeGraph([oldClaim, corrected, superseded, replacement], edges);

  expect(validateKnowledgeEvolution(graph)).toEqual([]);
  expect(graph.nodes.map((item) => item.id)).toEqual([
    oldClaim.id,
    corrected.id,
    superseded.id,
    replacement.id
  ]);
});

test("requires context scope to name the target context node", () => {
  const context = node("context-windows", "constraint", "unverified", "open");
  const scoped = {
    ...node("scoped-practice", "practice", "context_dependent", "understood"),
    scope: {
      kind: "context_specific" as const,
      description: "Only applies to Windows deployments.",
      contextIds: [context.id]
    }
  };
  const valid = createEvolutionEdge({
    id: "valid-context-edge",
    kind: "valid_in_context",
    fromNodeId: scoped.id,
    toNodeId: context.id,
    rationale: "The filesystem behavior is Windows-specific.",
    createdBy: "agent",
    createdAt: scoped.createdAt
  });
  expect(validateKnowledgeEvolution(knowledgeGraph([scoped, context], [valid]))).toEqual([]);

  const invalid = { ...valid, toNodeId: "missing-context" };
  expect(validateKnowledgeEvolution(knowledgeGraph([scoped, context], [invalid]))
    .map((issue) => issue.code)).toEqual(["missing_evolution_endpoint"]);
});

test("rejects self-links, missing rationale and invalid correction state", () => {
  const claim = node("same-claim", "claim", "unverified", "open");
  const invalid: KnowledgeEdge = {
    id: "invalid-correction",
    fromNodeId: claim.id,
    toNodeId: claim.id,
    kind: "corrects",
    confidence: 0.5,
    createdAt: claim.createdAt
  };
  expect(validateKnowledgeEvolution(knowledgeGraph([claim], [invalid]))
    .map((issue) => issue.code)).toEqual([
      "self_evolution_relation",
      "missing_evolution_rationale",
      "invalid_correction_state"
    ]);
});

test("checks evolution relations before accepting a CandidateGraphPatch", () => {
  const workspace = createProjectWorkspace({
    mode: "understand",
    title: "Evolution patch",
    subjectKind: "technology"
  });
  const root = workspace.graph.nodes[0];
  const child = workspace.graph.nodes[1];
  const relation = createEvolutionEdge({
    id: "child-derived-from-root",
    kind: "derived_from",
    fromNodeId: child.id,
    toNodeId: root.id,
    rationale: "The first-layer topic is derived from the project subject.",
    createdBy: "agent",
    createdAt: child.createdAt
  });
  const patch = edgePatch(relation, root.id, child.id);
  const accepted = acceptCandidateGraphPatch(
    { ...workspace, candidatePatches: [patch] },
    patch.id
  );
  expect(accepted.graph.edges).toContainEqual(relation);
  expect(accepted.graph.nodes).toEqual(workspace.graph.nodes);

  const invalidPatch = edgePatch({ ...relation, id: "invalid-edge", rationale: undefined }, root.id, child.id);
  expect(() => acceptCandidateGraphPatch(
    { ...workspace, candidatePatches: [invalidPatch] },
    invalidPatch.id
  )).toThrow("missing_evolution_rationale");
});

function node(
  id: string,
  kind: KnowledgeNode["kind"],
  epistemicStatus: EpistemicStatus,
  status: KnowledgeNode["status"]
): KnowledgeNode {
  return {
    id,
    kind,
    title: id,
    summary: id,
    status,
    ...createKnowledgeMetadata({
      kind,
      createdBy: "agent",
      creatorId: "test-agent",
      scopeContextId: "project-evolution"
    }),
    epistemicStatus,
    depth: 1,
    tags: [],
    sourceRefs: [],
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z"
  };
}

function knowledgeGraph(nodes: KnowledgeNode[], edges: KnowledgeEdge[]): KnowledgeGraph {
  return {
    id: "graph-evolution",
    title: "Evolution graph",
    rootNodeIds: nodes[0] ? [nodes[0].id] : [],
    nodes,
    edges,
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z"
  };
}

function edgePatch(edge: KnowledgeEdge, targetNodeId: string, focusNodeId: string): CandidateGraphPatch {
  return {
    id: `patch-${edge.id}`,
    requestId: `request-${edge.id}`,
    action: "drill_down",
    targetNodeId,
    focusNodeId,
    title: "Add evolution relation",
    summary: "Preserve history through a typed relation.",
    revision: 1,
    createdBy: "agent",
    operations: [{
      kind: "create_edge",
      edge,
      audit: createGraphPatchAudit(`audit-${edge.id}`, "Add a reviewed evolution relation", edge.createdAt)
    }],
    confidence: 0.9,
    status: "pending_review",
    createdAt: edge.createdAt
  };
}
