import type {
  CandidateGraphPatch,
  ImpactAssessment,
  ImpactAssessmentItem,
  ImpactCategory,
  ImpactPathSegment,
  KnowledgeEdge,
  KnowledgeNode,
  KnowledgeNodeKind,
  KnowledgeRelationKind,
  KnowledgeWorkspaceSnapshot
} from "../types";

type InfluenceDirection = "forward" | "reverse" | "none";

/**
 * Direction describes how a changed premise can affect another node.
 * For example, supports is evidence -> judgment (forward), while
 * depends_on is dependent -> premise (reverse).
 */
export const impactRelationDirections: Record<KnowledgeRelationKind, InfluenceDirection> = {
  contains: "none",
  explains: "reverse",
  depends_on: "reverse",
  supports: "forward",
  contradicts: "forward",
  answers: "reverse",
  summarizes: "reverse",
  compares: "none",
  constrains: "forward",
  recommends: "forward",
  precedes: "forward",
  refines: "reverse",
  corrects: "reverse",
  supersedes: "reverse",
  valid_in_context: "reverse",
  derived_from: "reverse",
  related_to: "none"
};

export const impactCategoryLabels: Record<ImpactCategory, string> = {
  judgment: "判断",
  method: "方法",
  summary: "总结",
  conclusion: "结论"
};

const categoryByNodeKind: Partial<Record<KnowledgeNodeKind, ImpactCategory>> = {
  claim: "judgment",
  hypothesis: "judgment",
  inference: "judgment",
  decision: "judgment",
  skill: "method",
  practice: "method",
  route_option: "method",
  route_step: "method",
  synthesis: "summary",
  conclusion: "conclusion"
};

export interface DeriveImpactAssessmentInput {
  patchId: string;
  targetNodeId: string;
  assessedAt: string;
}

export function deriveImpactAssessment(
  snapshot: KnowledgeWorkspaceSnapshot,
  input: DeriveImpactAssessmentInput
): ImpactAssessment {
  requireTimestamp(input.assessedAt, "assessedAt");
  const target = snapshot.graph.nodes.find((node) => node.id === input.targetNodeId);
  if (!target || target.status === "archived") throw new Error(`Impact target is unavailable: ${input.targetNodeId}`);
  if (!input.patchId.trim()) throw new Error("ImpactAssessment requires patchId");

  const nodesById = new Map(snapshot.graph.nodes
    .filter((node) => node.status !== "archived")
    .map((node) => [node.id, node]));
  const paths = traverseDownstream(target.id, snapshot.graph.edges, nodesById);
  const affectedItems = Array.from(paths.entries())
    .flatMap(([nodeId, path]): ImpactAssessmentItem[] => {
      const node = nodesById.get(nodeId);
      const category = node ? categoryByNodeKind[node.kind] : undefined;
      if (!node || !category) return [];
      return [{
        nodeId: node.id,
        title: node.title,
        nodeKind: node.kind,
        category,
        distance: path.length,
        path,
        reason: describeImpactPath(target, node, path)
      }];
    })
    .sort(compareImpactItems);
  const counts: ImpactAssessment["counts"] = { judgment: 0, method: 0, summary: 0, conclusion: 0 };
  for (const item of affectedItems) counts[item.category] += 1;
  return {
    id: `impact-${input.patchId}`,
    patchId: input.patchId,
    targetNodeId: target.id,
    graphUpdatedAt: snapshot.graph.updatedAt,
    assessedAt: input.assessedAt,
    counts,
    affectedItems,
    hasDownstreamImpact: affectedItems.length > 0
  };
}

export function assertCorrectionImpactAssessmentCurrent(
  snapshot: KnowledgeWorkspaceSnapshot,
  patch: CandidateGraphPatch
): void {
  if (patch.action !== "correct") return;
  if (!patch.impactAssessment) {
    throw impactError("missing_impact_assessment", "A correction patch must include ImpactAssessment before review");
  }
  if (patch.impactAssessment.patchId !== patch.id || patch.impactAssessment.targetNodeId !== patch.targetNodeId) {
    throw impactError("impact_identity_mismatch", "ImpactAssessment must reference its correction patch and target");
  }
  const expected = deriveImpactAssessment(snapshot, {
    patchId: patch.id,
    targetNodeId: patch.targetNodeId,
    assessedAt: patch.createdAt
  });
  if (JSON.stringify(expected) !== JSON.stringify(patch.impactAssessment)) {
    throw impactError("stale_impact_assessment", "Downstream knowledge changed; regenerate the correction and ImpactAssessment before acceptance");
  }
}

function traverseDownstream(
  targetNodeId: string,
  edges: readonly KnowledgeEdge[],
  nodesById: Map<string, KnowledgeNode>
): Map<string, ImpactPathSegment[]> {
  const paths = new Map<string, ImpactPathSegment[]>();
  const queue: Array<{ nodeId: string; path: ImpactPathSegment[] }> = [{ nodeId: targetNodeId, path: [] }];
  const visited = new Set([targetNodeId]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of edges.slice().sort(compareEdges)) {
      const next = influencedNodeId(edge, current.nodeId);
      if (!next || visited.has(next) || !nodesById.has(next)) continue;
      const path = current.path.concat({
        edgeId: edge.id,
        relationKind: edge.kind,
        fromNodeId: edge.fromNodeId,
        toNodeId: edge.toNodeId
      });
      visited.add(next);
      paths.set(next, path);
      queue.push({ nodeId: next, path });
    }
  }
  return paths;
}

function influencedNodeId(edge: KnowledgeEdge, currentNodeId: string): string | undefined {
  const direction = impactRelationDirections[edge.kind];
  if (direction === "forward" && edge.fromNodeId === currentNodeId) return edge.toNodeId;
  if (direction === "reverse" && edge.toNodeId === currentNodeId) return edge.fromNodeId;
  return undefined;
}

function describeImpactPath(target: KnowledgeNode, affected: KnowledgeNode, path: ImpactPathSegment[]): string {
  const relations = path.map((segment) => segment.relationKind).join(" → ");
  return `「${affected.title}」通过 ${relations} 路径依赖「${target.title}」，距离 ${path.length} 层。`;
}

function compareImpactItems(left: ImpactAssessmentItem, right: ImpactAssessmentItem): number {
  return categoryPriority(left.category) - categoryPriority(right.category)
    || left.distance - right.distance
    || compareText(left.nodeId, right.nodeId);
}

function categoryPriority(category: ImpactCategory): number {
  return category === "judgment" ? 0 : category === "method" ? 1 : category === "summary" ? 2 : 3;
}

function compareEdges(left: KnowledgeEdge, right: KnowledgeEdge): number {
  return compareText(left.id, right.id);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function requireTimestamp(value: string, name: string): void {
  if (!Number.isFinite(Date.parse(value))) throw new Error(`ImpactAssessment ${name} must be a valid timestamp`);
}

function impactError(code: string, message: string): Error {
  return new Error(`Impact assessment validation failed: [${code}] ${message}`);
}
