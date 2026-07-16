import type { KnowledgeEdge, KnowledgeNode, KnowledgeWorkspaceSnapshot } from "../../types";
import { createProjectWorkspace } from "../knowledgeEngine";
import { createKnowledgeMetadata } from "../knowledgeMetadata";

const generatedAt = "2026-07-15T12:00:00.000Z";

export interface LargeKnowledgeGraphFixtureInput {
  nodeCount: number;
  averageDegree: number;
}

/**
 * Builds a deterministic connected graph for scale contracts and local benchmarks.
 * averageDegree is the undirected degree target: 2 * edgeCount / nodeCount.
 */
export function createLargeKnowledgeGraphFixture({
  nodeCount,
  averageDegree
}: LargeKnowledgeGraphFixtureInput): KnowledgeWorkspaceSnapshot {
  if (!Number.isInteger(nodeCount) || nodeCount < 2) throw new Error("Large graph nodeCount must be an integer of at least 2");
  if (!Number.isFinite(averageDegree) || averageDegree < 2) throw new Error("Large graph averageDegree must be at least 2");

  const workspace = createProjectWorkspace({
    mode: "understand",
    title: `Scale fixture ${nodeCount}`,
    subjectKind: "technology"
  });
  const projectId = workspace.project.id;
  const rootId = workspace.project.subject.rootNodeId;
  const nodes = Array.from({ length: nodeCount }, (_, index) => generatedNode(index, rootId, projectId));
  const edges = generatedEdges(nodes, averageDegree);
  const graph = {
    ...workspace.graph,
    rootNodeIds: [rootId],
    nodes,
    edges,
    updatedAt: `${generatedAt.slice(0, 20)}${String(nodeCount).padStart(4, "0")}Z`
  };
  return {
    ...workspace,
    graph,
    selectedNodeId: nodes.at(-1)!.id,
    selection: {
      ...workspace.selection,
      focusNodeId: nodes.at(-1)!.id,
      nodeIds: [nodes.at(-1)!.id],
      updatedAt: graph.updatedAt
    }
  };
}

function generatedNode(index: number, rootId: string, projectId: string): KnowledgeNode {
  const id = index === 0 ? rootId : `scale-node-${String(index).padStart(5, "0")}`;
  const kind = index === 0 ? "subject" : index % 11 === 0 ? "practice" : "concept";
  const depth = index === 0 ? 0 : Math.floor(Math.log2(index)) + 1;
  return {
    id,
    kind,
    title: index === 0 ? "Scale fixture root" : `Scale concept ${index}`,
    summary: `Deterministic scale fixture node ${index} at depth ${depth}.`,
    status: "open",
    ...createKnowledgeMetadata({
      kind,
      createdBy: "agent",
      creatorId: "scale-fixture",
      scopeContextId: projectId
    }),
    depth,
    tags: ["scale-fixture", `bucket-${index % 17}`],
    sourceRefs: [],
    createdAt: generatedAt,
    updatedAt: generatedAt
  };
}

function generatedEdges(nodes: KnowledgeNode[], averageDegree: number): KnowledgeEdge[] {
  const targetEdgeCount = Math.max(nodes.length - 1, Math.ceil(nodes.length * averageDegree / 2));
  const edges: KnowledgeEdge[] = [];
  const pairs = new Set<string>();
  for (let index = 1; index < nodes.length; index += 1) {
    addEdge(edges, pairs, nodes[Math.floor((index - 1) / 3)].id, nodes[index].id, "contains");
  }
  let sequence = 0;
  while (edges.length < targetEdgeCount) {
    const fromIndex = sequence % nodes.length;
    const step = 2 + Math.floor(sequence / nodes.length);
    const toIndex = (fromIndex * 37 + step * 53) % nodes.length;
    sequence += 1;
    if (fromIndex === toIndex) continue;
    addEdge(edges, pairs, nodes[fromIndex].id, nodes[toIndex].id, "related_to");
  }
  return edges;
}

function addEdge(
  edges: KnowledgeEdge[],
  pairs: Set<string>,
  fromNodeId: string,
  toNodeId: string,
  kind: KnowledgeEdge["kind"]
): void {
  const pair = fromNodeId < toNodeId ? `${fromNodeId}\u0000${toNodeId}` : `${toNodeId}\u0000${fromNodeId}`;
  if (pairs.has(pair)) return;
  pairs.add(pair);
  edges.push({
    id: `scale-edge-${String(edges.length + 1).padStart(6, "0")}`,
    fromNodeId,
    toNodeId,
    kind,
    confidence: 0.9,
    createdAt: generatedAt
  });
}
