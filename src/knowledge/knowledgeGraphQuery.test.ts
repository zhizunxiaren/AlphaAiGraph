// @vitest-environment node

import { expect, test } from "vitest";
import type { KnowledgeEdge, KnowledgeNode, KnowledgeWorkspaceSnapshot } from "../types";
import {
  deriveKnowledgeClusters,
  findReusableKnowledge,
  findShortestKnowledgePath,
  knowledgeNodesInScope,
  queryLocalNeighborhood,
  searchKnowledgeGraph
} from "./knowledgeGraphQuery";
import {
  acceptCandidateGraphPatch,
  buildKnowledgeSelection,
  createProjectWorkspace,
  rejectCandidateGraphPatch
} from "./knowledgeEngine";
import { proposeCrossProjectKnowledgeReuse } from "./knowledgeReuse";
import { deserializeKnowledgeWorkspace, serializeKnowledgeWorkspace } from "./workspacePersistence";

const at = "2026-07-15T08:00:00.000Z";

test("queries a deterministic Project-scoped local neighborhood", () => {
  const workspace = queryWorkspace();
  const result = queryLocalNeighborhood(workspace, {
    focusNodeId: "target-extra",
    depth: 2,
    direction: "incoming",
    maxNodes: 10
  });

  expect(result.nodes.map((node) => node.id)).toEqual([
    "target-extra",
    targetLayer(workspace, 0).id,
    workspace.project.subject.rootNodeId
  ]);
  expect(result.distances).toEqual({
    "target-extra": 0,
    [targetLayer(workspace, 0).id]: 1,
    [workspace.project.subject.rootNodeId]: 2
  });
  expect(result.focusNode).toBe(workspace.graph.nodes.find((node) => node.id === "target-extra"));
  expect(result.edges.every((edge) => workspace.graph.edges.includes(edge))).toBe(true);
  expect(result.nodes.some((node) => node.id.startsWith("knowledge-source"))).toBe(false);
  const reordered = {
    ...workspace,
    graph: { ...workspace.graph, nodes: workspace.graph.nodes.slice().reverse(), edges: workspace.graph.edges.slice().reverse() }
  };
  expect(queryLocalNeighborhood(reordered, {
    focusNodeId: "target-extra",
    depth: 2,
    direction: "incoming",
    maxNodes: 10
  }).nodes.map((node) => node.id)).toEqual(result.nodes.map((node) => node.id));

  const filtered = queryLocalNeighborhood(workspace, {
    focusNodeId: targetLayer(workspace, 0).id,
    depth: 1,
    relationKinds: ["supports"],
    maxNodes: 10
  });
  expect(filtered.nodes.map((node) => node.id)).toEqual([targetLayer(workspace, 0).id, "target-support"]);

  const truncated = queryLocalNeighborhood(workspace, {
    focusNodeId: workspace.project.subject.rootNodeId,
    depth: 1,
    maxNodes: 2
  });
  expect(truncated.nodes).toHaveLength(2);
  expect(truncated.truncated).toBe(true);
});

test("finds deterministic shortest paths with direction and hop limits", () => {
  const workspace = queryWorkspace();
  const sibling = targetLayer(workspace, 1);
  const path = findShortestKnowledgePath(workspace, {
    fromNodeId: "target-extra",
    toNodeId: sibling.id
  });

  expect(path?.nodes.map((node) => node.id)).toEqual([
    "target-extra",
    targetLayer(workspace, 0).id,
    workspace.project.subject.rootNodeId,
    sibling.id
  ]);
  expect(path?.hopCount).toBe(3);
  expect(findShortestKnowledgePath(workspace, {
    fromNodeId: "target-extra",
    toNodeId: sibling.id,
    maxHops: 2
  })).toBeUndefined();
  expect(findShortestKnowledgePath(workspace, {
    fromNodeId: "target-extra",
    toNodeId: workspace.project.subject.rootNodeId,
    direction: "outgoing"
  })).toBeUndefined();
});

test("derives weak connected components without pretending to run statistical clustering", () => {
  const workspace = queryWorkspace();
  const clusters = deriveKnowledgeClusters(workspace);
  const detached = clusters.find((cluster) => cluster.nodes.some((node) => node.id === "detached-a"));
  const singleton = clusters.find((cluster) => cluster.nodes.some((node) => node.id === "isolated"));

  expect(clusters[0].nodes.some((node) => node.id === workspace.project.subject.rootNodeId)).toBe(true);
  expect(detached?.nodes.map((node) => node.id)).toEqual(["detached-a", "detached-b"]);
  expect(detached?.edges.map((edge) => edge.id)).toEqual(["detached-edge"]);
  expect(singleton?.id).toBe("cluster:isolated");
  expect(clusters.every((cluster) => cluster.nodes.every((node) =>
    node.scope.contextIds.includes(workspace.project.id)))).toBe(true);
  expect(deriveKnowledgeClusters(workspace, { includeSingletons: false })
    .some((cluster) => cluster.id === "cluster:isolated")).toBe(false);
});

test("performs explainable lexical full-text search with explicit scope", () => {
  const workspace = queryWorkspace();
  const quoteNode = {
    ...customNode(workspace.graph.nodes[1], "search-quote", "Captured excerpt", "Quoted source fixture", []),
    sourceRefs: [{ sourceId: "search-only-fixture", quote: "retry budget policy" }]
  };
  const searchable = { ...workspace, graph: { ...workspace.graph, nodes: workspace.graph.nodes.concat(quoteNode) } };
  const results = searchKnowledgeGraph(searchable, { query: "Retry Budget", limit: 10 });

  expect(results[0].node.id).toBe("search-title");
  expect(results[0].matchedFields).toContain("title");
  expect(results.find((result) => result.node.id === "search-summary")?.matchedFields).toContain("summary");
  expect(results.find((result) => result.node.id === "search-tags")?.matchedFields).toContain("tags");
  expect(results.find((result) => result.node.id === "search-quote")?.matchedFields).toContain("source_quote");
  expect(results.some((result) => result.node.id === "source-retry-budget")).toBe(false);
  expect(searchKnowledgeGraph(workspace, { query: "——" })).toEqual([]);
  expect(searchKnowledgeGraph(workspace, {
    query: "Retry Budget",
    projectIds: [sourceProject(workspace).id]
  })[0].node.id).toBe("source-retry-budget");
});

test("keeps default Context Packet and graph queries inside the active Project", () => {
  const workspace = queryWorkspace();
  const visible = knowledgeNodesInScope(workspace);
  const selection = buildKnowledgeSelection(
    workspace,
    workspace.project.subject.rootNodeId,
    "whole_subject"
  );

  expect(visible.map((node) => node.id)).toEqual(selection.nodeIds);
  expect(selection.nodeIds).not.toContain("source-retry-budget");
  expect(knowledgeNodesInScope(workspace, { projectIds: [sourceProject(workspace).id] })
    .some((node) => node.id === "source-retry-budget")).toBe(true);
});

test("discovers canonical reusable knowledge without mutating or copying the graph", () => {
  const workspace = queryWorkspace();
  const before = JSON.stringify(workspace.graph);
  const results = findReusableKnowledge(workspace, {
    targetProjectId: workspace.project.id,
    query: "Retry Budget"
  });

  expect(results).toHaveLength(1);
  expect(results[0]).toMatchObject({
    sourceProjectIds: [sourceProject(workspace).id],
    alreadyShared: false,
    reuseMode: "shared_reference"
  });
  expect(results[0].node).toBe(workspace.graph.nodes.find((node) => node.id === "source-retry-budget"));
  expect(JSON.stringify(workspace.graph)).toBe(before);
});

test("accepts reviewed cross-Project reuse as a shared reference and persists its gate", () => {
  const workspace = queryWorkspace();
  const originalNodeCount = workspace.graph.nodes.length;
  const proposed = proposeCrossProjectKnowledgeReuse(workspace, {
    sourceNodeId: "source-retry-budget",
    targetProjectId: workspace.project.id,
    createdAt: at
  });
  const patch = proposed.candidatePatches.at(-1)!;

  expect(proposed.graph).toBe(workspace.graph);
  expect(patch.action).toBe("reuse");
  expect(patch.operations.map((operation) => operation.kind)).toEqual(["revise_node", "link_nodes"]);
  expect(patch.operations.some((operation) => operation.kind === "create_node")).toBe(false);

  const accepted = acceptCandidateGraphPatch(proposed, patch.id);
  const shared = accepted.graph.nodes.find((node) => node.id === "source-retry-budget")!;
  expect(accepted.graph.nodes).toHaveLength(originalNodeCount);
  expect(shared.scope.contextIds).toEqual([sourceProject(workspace).id, workspace.project.id]);
  expect(shared.tags).toContain(`shared:project:${workspace.project.id}`);
  expect(accepted.graph.edges.some((edge) => edge.kind === "contains"
    && edge.fromNodeId === workspace.project.subject.rootNodeId
    && edge.toNodeId === shared.id)).toBe(true);
  expect(findReusableKnowledge(accepted, {
    targetProjectId: accepted.project.id,
    query: "Retry Budget"
  })).toEqual([]);
  expect(findReusableKnowledge(accepted, {
    targetProjectId: accepted.project.id,
    query: "Retry Budget",
    includeAlreadyShared: true
  })[0].alreadyShared).toBe(true);

  const restored = deserializeKnowledgeWorkspace(serializeKnowledgeWorkspace(accepted, at));
  expect(restored.graph.nodes.find((node) => node.id === shared.id)).toEqual(shared);
});

test("rejects reuse without graph changes and blocks copy-shaped forged patches", () => {
  const workspace = queryWorkspace();
  const proposed = proposeCrossProjectKnowledgeReuse(workspace, {
    sourceNodeId: "source-retry-budget",
    targetProjectId: workspace.project.id,
    createdAt: at
  });
  const patch = proposed.candidatePatches.at(-1)!;
  const rejected = rejectCandidateGraphPatch(proposed, patch.id);
  expect(rejected.graph).toBe(workspace.graph);

  const forgedNode = { ...workspace.graph.nodes.find((node) => node.id === "source-retry-budget")!, id: "copied-retry-budget" };
  const forged = {
    ...proposed,
    candidatePatches: proposed.candidatePatches.map((candidate) => candidate.id === patch.id ? {
      ...candidate,
      operations: candidate.operations.concat({
        kind: "create_node" as const,
        node: forgedNode,
        audit: { id: "forged-copy", rationale: "copy", actor: "agent" as const, createdAt: at }
      })
    } : candidate)
  };
  expect(() => acceptCandidateGraphPatch(forged, patch.id)).toThrow("no node creation");
});

function queryWorkspace(): KnowledgeWorkspaceSnapshot {
  const target = createProjectWorkspace({ mode: "understand", title: "Target System", subjectKind: "technology" });
  const source = createProjectWorkspace({ mode: "systematize", title: "Source Notes", subjectKind: "topic" });
  const sourceRecord = {
    ...source.project,
    spaceId: target.space.id,
    graphId: target.graph.id
  };
  const sourceNodes = source.graph.nodes.map((node, index) => index === 1 ? {
    ...node,
    id: "source-retry-budget",
    title: "Retry Budget",
    summary: "A bounded retry policy shared across services.",
    tags: ["resilience", "operations"]
  } : node);
  const renamedSourceId = source.graph.nodes[1].id;
  const sourceEdges = source.graph.edges.map((edge) => ({
    ...edge,
    fromNodeId: edge.fromNodeId === renamedSourceId ? "source-retry-budget" : edge.fromNodeId,
    toNodeId: edge.toNodeId === renamedSourceId ? "source-retry-budget" : edge.toNodeId
  }));
  const base = target.graph.nodes[1];
  const customNodes = [
    customNode(base, "target-extra", "Deep child", "Traversal depth fixture", []),
    customNode(base, "target-support", "Supporting note", "Relation filter fixture", []),
    customNode(base, "detached-a", "Detached A", "Separate component", []),
    customNode(base, "detached-b", "Detached B", "Separate component", []),
    customNode(base, "isolated", "Isolated", "Singleton component", []),
    customNode(base, "search-title", "Retry Budget", "Exact title match", []),
    customNode(base, "search-summary", "Resilience rule", "Set a retry budget for every dependency", []),
    customNode(base, "search-tags", "Operations rule", "Bounded recovery", ["retry", "budget"])
  ];
  const customEdges: KnowledgeEdge[] = [
    graphEdge("target-extra-edge", targetLayer(target, 0).id, "target-extra", "contains"),
    graphEdge("target-support-edge", targetLayer(target, 0).id, "target-support", "supports"),
    graphEdge("detached-edge", "detached-a", "detached-b", "related_to")
  ];
  return {
    ...target,
    space: {
      ...target.space,
      projectIds: [target.project.id, sourceRecord.id]
    },
    projects: [target.project, sourceRecord],
    graph: {
      ...target.graph,
      rootNodeIds: target.graph.rootNodeIds.concat(sourceRecord.subject.rootNodeId),
      nodes: target.graph.nodes.concat(customNodes, sourceNodes),
      edges: target.graph.edges.concat(customEdges, sourceEdges)
    }
  };
}

function customNode(base: KnowledgeNode, id: string, title: string, summary: string, tags: string[]): KnowledgeNode {
  return {
    ...base,
    id,
    title,
    summary,
    tags,
    sourceRefs: [],
    scope: { ...base.scope, contextIds: base.scope.contextIds.slice() },
    temporalValidity: { ...base.temporalValidity },
    createdAt: at,
    updatedAt: at
  };
}

function graphEdge(
  id: string,
  fromNodeId: string,
  toNodeId: string,
  kind: KnowledgeEdge["kind"]
): KnowledgeEdge {
  return { id, fromNodeId, toNodeId, kind, confidence: 1, createdAt: at };
}

function targetLayer(workspace: KnowledgeWorkspaceSnapshot, index: number): KnowledgeNode {
  const rootId = workspace.project.subject.rootNodeId;
  const childIds = workspace.graph.edges
    .filter((edge) => edge.kind === "contains" && edge.fromNodeId === rootId)
    .map((edge) => edge.toNodeId);
  return workspace.graph.nodes.filter((node) => childIds.includes(node.id))[index];
}

function sourceProject(workspace: KnowledgeWorkspaceSnapshot) {
  return workspace.projects.find((project) => project.id !== workspace.project.id)!;
}
