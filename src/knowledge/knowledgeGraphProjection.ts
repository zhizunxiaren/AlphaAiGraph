import type { KnowledgeEdge, KnowledgeNode, KnowledgeView, KnowledgeWorkspaceSnapshot } from "../types";
import {
  findShortestKnowledgePath,
  knowledgeNodesInScope,
  queryLocalNeighborhood
} from "./knowledgeGraphQuery";

export const knowledgeGraphPerformanceBudget = {
  initialVisibleNodes: 24,
  incrementalVisibleNodes: 12,
  maxVisibleNodes: 48,
  maxVisibleEdges: 96,
  targetLocalQueryP95Ms: 16,
  targetLocalLayoutP95Ms: 16,
  targetProjectionP95Ms: 50,
  maxMainThreadTaskMs: 50
} as const;

export interface ProgressiveKnowledgeProjectionInput {
  view: KnowledgeView;
  focusNodeId: string;
  visibleNodeLimit?: number;
}

export interface ProgressiveKnowledgeProjection {
  graphUpdatedAt: string;
  rootNodeId: string;
  focusNodeId: string;
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  totalScopedNodeCount: number;
  omittedNodeCount: number;
  omittedEdgeCount: number;
  truncated: boolean;
  canLoadMore: boolean;
  nextVisibleNodeLimit: number;
}

export interface KnowledgeNodePosition {
  x: number;
  y: number;
}

export function deriveProgressiveKnowledgeProjection(
  snapshot: KnowledgeWorkspaceSnapshot,
  input: ProgressiveKnowledgeProjectionInput
): ProgressiveKnowledgeProjection {
  const visibleNodeLimit = input.visibleNodeLimit ?? knowledgeGraphPerformanceBudget.initialVisibleNodes;
  if (!Number.isInteger(visibleNodeLimit) || visibleNodeLimit < 1
    || visibleNodeLimit > knowledgeGraphPerformanceBudget.maxVisibleNodes) {
    throw new Error(`Visible node limit must be between 1 and ${knowledgeGraphPerformanceBudget.maxVisibleNodes}`);
  }
  const scopedNodes = knowledgeNodesInScope(snapshot);
  const scopedIds = new Set(scopedNodes.map((node) => node.id));
  if (!scopedIds.has(input.view.rootNodeId)) throw new Error(`Projection root is unavailable in scope: ${input.view.rootNodeId}`);
  if (!scopedIds.has(input.focusNodeId)) throw new Error(`Projection focus is unavailable in scope: ${input.focusNodeId}`);

  const candidateLimit = Math.min(scopedNodes.length, knowledgeGraphPerformanceBudget.maxVisibleNodes * 4);
  const rootNeighborhood = queryLocalNeighborhood(snapshot, {
    focusNodeId: input.view.rootNodeId,
    depth: input.view.visibleDepth,
    maxNodes: Math.max(1, candidateLimit)
  });
  const focusNeighborhood = queryLocalNeighborhood(snapshot, {
    focusNodeId: input.focusNodeId,
    depth: 1,
    maxNodes: Math.max(1, candidateLimit)
  });
  const path = findShortestKnowledgePath(snapshot, {
    fromNodeId: input.view.rootNodeId,
    toNodeId: input.focusNodeId,
    maxHops: Math.max(input.view.visibleDepth * 4, 12)
  });
  const allowed = viewNodePredicate(input.view.kind, input.view.rootNodeId, input.focusNodeId);
  const candidates = uniqueNodes([
    ...(path?.nodes ?? []),
    ...focusNeighborhood.nodes,
    ...rootNeighborhood.nodes
  ]).filter(allowed);
  const nodes = candidates.slice(0, visibleNodeLimit);
  const visibleIds = new Set(nodes.map((node) => node.id));
  const allVisibleEdges = snapshot.graph.edges
    .filter((edge) => visibleIds.has(edge.fromNodeId) && visibleIds.has(edge.toNodeId))
    .sort((left, right) => edgePriority(left, input.view.rootNodeId, input.focusNodeId)
      - edgePriority(right, input.view.rootNodeId, input.focusNodeId)
      || compareText(left.id, right.id));
  const edges = allVisibleEdges.slice(0, knowledgeGraphPerformanceBudget.maxVisibleEdges);
  const eligibleScopedCount = scopedNodes.filter(allowed).length;
  const omittedNodeCount = Math.max(0, eligibleScopedCount - nodes.length);
  const omittedEdgeCount = Math.max(0, allVisibleEdges.length - edges.length);
  const truncated = omittedNodeCount > 0 || omittedEdgeCount > 0 || rootNeighborhood.truncated || focusNeighborhood.truncated;
  return {
    graphUpdatedAt: snapshot.graph.updatedAt,
    rootNodeId: input.view.rootNodeId,
    focusNodeId: input.focusNodeId,
    nodes,
    edges,
    totalScopedNodeCount: eligibleScopedCount,
    omittedNodeCount,
    omittedEdgeCount,
    truncated,
    canLoadMore: truncated && visibleNodeLimit < knowledgeGraphPerformanceBudget.maxVisibleNodes,
    nextVisibleNodeLimit: Math.min(
      knowledgeGraphPerformanceBudget.maxVisibleNodes,
      visibleNodeLimit + knowledgeGraphPerformanceBudget.incrementalVisibleNodes
    )
  };
}

/** Pure local layout for the visible projection; positions never write back to KnowledgeGraph. */
export function layoutLocalKnowledgeProjection(
  projection: Pick<ProgressiveKnowledgeProjection, "nodes" | "edges" | "rootNodeId" | "focusNodeId">,
  width = 1_000,
  height = 660
): Record<string, KnowledgeNodePosition> {
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new Error("Local layout dimensions must be positive");
  }
  const anchorId = projection.nodes.some((node) => node.id === projection.focusNodeId)
    ? projection.focusNodeId
    : projection.rootNodeId;
  const ordered = projection.nodes.slice().sort((left, right) => {
    if (left.id === anchorId) return -1;
    if (right.id === anchorId) return 1;
    return left.depth - right.depth || compareText(left.id, right.id);
  });
  const positions: Record<string, KnowledgeNodePosition> = {
    [anchorId]: { x: width / 2, y: height / 2 }
  };
  const remaining = ordered.filter((node) => node.id !== anchorId);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  remaining.forEach((node, index) => {
    const progress = Math.sqrt((index + 1) / Math.max(1, remaining.length));
    const angle = index * goldenAngle - Math.PI / 2;
    const radiusX = Math.min(width * 0.42, width * (0.13 + 0.3 * progress));
    const radiusY = Math.min(height * 0.39, height * (0.12 + 0.27 * progress));
    positions[node.id] = {
      x: clamp(width / 2 + Math.cos(angle) * radiusX, 82, width - 82),
      y: clamp(height / 2 + Math.sin(angle) * radiusY, 54, height - 54)
    };
  });
  return positions;
}

function viewNodePredicate(
  viewKind: KnowledgeView["kind"],
  rootNodeId: string,
  focusNodeId: string
): (node: KnowledgeNode) => boolean {
  if (viewKind === "route") {
    const kinds = new Set<KnowledgeNode["kind"]>([
      "subject", "goal", "constraint", "criterion", "route_option", "decision", "route_step", "synthesis", "uncertainty"
    ]);
    return (node) => node.id === rootNodeId || node.id === focusNodeId || kinds.has(node.kind);
  }
  if (viewKind === "evidence") {
    const kinds = new Set<KnowledgeNode["kind"]>([
      "subject", "fact", "claim", "evidence", "inference", "synthesis", "conclusion", "uncertainty", "question"
    ]);
    return (node) => node.id === rootNodeId || node.id === focusNodeId || kinds.has(node.kind);
  }
  return () => true;
}

function uniqueNodes(nodes: KnowledgeNode[]): KnowledgeNode[] {
  const seen = new Set<string>();
  return nodes.filter((node) => {
    if (seen.has(node.id)) return false;
    seen.add(node.id);
    return true;
  });
}

function edgePriority(edge: KnowledgeEdge, rootNodeId: string, focusNodeId: string): number {
  if (edge.fromNodeId === focusNodeId || edge.toNodeId === focusNodeId) return 0;
  if (edge.fromNodeId === rootNodeId || edge.toNodeId === rootNodeId) return 1;
  return 2;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
