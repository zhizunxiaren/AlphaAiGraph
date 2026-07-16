import type {
  KnowledgeContextPolicy,
  KnowledgeNode,
  KnowledgeWorkspaceSnapshot
} from "../types";

export type KnowledgeGapKind =
  | "unexpanded"
  | "needs_evidence"
  | "stale_source"
  | "conflicted_source"
  | "uncertainty";

export interface KnowledgeGapInsight {
  id: string;
  nodeId: string;
  kind: KnowledgeGapKind;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
}

export interface UnresolvedQuestionInsight {
  nodeId: string;
  title: string;
  state: "unanswered" | "candidate_answer";
  answerNodeIds: string[];
}

export interface UnderstandingScopeInsight {
  policy: KnowledgeContextPolicy;
  label: string;
  selectedNodeCount: number;
  projectNodeCount: number;
  expandedNodeCount: number;
  resolvedNodeCount: number;
  sourceBackedNodeCount: number;
  maxDepth: number;
  explorationCoveragePercent: number;
  hint: string;
}

export interface KnowledgeWorkspaceInsights {
  scope: UnderstandingScopeInsight;
  gaps: KnowledgeGapInsight[];
  unresolvedQuestions: UnresolvedQuestionInsight[];
}

const evidenceSensitiveKinds = new Set([
  "claim",
  "hypothesis",
  "inference",
  "conclusion",
  "decision"
]);

export function deriveKnowledgeWorkspaceInsights(
  snapshot: KnowledgeWorkspaceSnapshot
): KnowledgeWorkspaceInsights {
  const projectNodes = activeProjectNodes(snapshot);
  const projectNodeIds = new Set(projectNodes.map((node) => node.id));
  const outgoingContains = new Set(snapshot.graph.edges
    .filter((edge) => edge.kind === "contains" && projectNodeIds.has(edge.fromNodeId) && projectNodeIds.has(edge.toNodeId))
    .map((edge) => edge.fromNodeId));
  const answerIdsByQuestion = new Map<string, string[]>();
  for (const edge of snapshot.graph.edges) {
    if (edge.kind !== "answers" || !projectNodeIds.has(edge.toNodeId)) continue;
    const answers = answerIdsByQuestion.get(edge.toNodeId) ?? [];
    answers.push(edge.fromNodeId);
    answerIdsByQuestion.set(edge.toNodeId, answers);
  }

  const unresolvedQuestions = projectNodes
    .filter((node) => node.kind === "question" && !isResolved(node))
    .map((node): UnresolvedQuestionInsight => {
      const answerNodeIds = answerIdsByQuestion.get(node.id) ?? [];
      return {
        nodeId: node.id,
        title: node.title,
        state: answerNodeIds.length > 0 ? "candidate_answer" : "unanswered",
        answerNodeIds
      };
    })
    .sort((left, right) => questionPriority(left.state) - questionPriority(right.state)
      || left.title.localeCompare(right.title, "zh-CN"));

  const gaps = projectNodes.flatMap((node) => deriveNodeGaps(node, outgoingContains))
    .sort((left, right) => severityPriority(left.severity) - severityPriority(right.severity)
      || left.title.localeCompare(right.title, "zh-CN"));
  const expandedNodeCount = projectNodes.filter((node) => outgoingContains.has(node.id)).length;
  const resolvedNodeCount = projectNodes.filter(isResolved).length;
  const sourceBackedNodeCount = projectNodes.filter((node) => node.sourceRefs.length > 0).length;
  const exploredIds = new Set(projectNodes
    .filter((node) => outgoingContains.has(node.id) || isResolved(node))
    .map((node) => node.id));
  const explorationCoveragePercent = projectNodes.length === 0
    ? 0
    : Math.round(exploredIds.size / projectNodes.length * 100);
  const maxDepth = projectNodes.reduce((maximum, node) => Math.max(maximum, node.depth), 0);
  const selectedNodeCount = snapshot.selection.nodeIds.filter((nodeId) => projectNodeIds.has(nodeId)).length;

  return {
    scope: {
      policy: snapshot.selection.contextPolicy,
      label: contextPolicyLabel(snapshot.selection.contextPolicy),
      selectedNodeCount,
      projectNodeCount: projectNodes.length,
      expandedNodeCount,
      resolvedNodeCount,
      sourceBackedNodeCount,
      maxDepth,
      explorationCoveragePercent,
      hint: understandingHint(projectNodes.length, maxDepth, explorationCoveragePercent, resolvedNodeCount)
    },
    gaps,
    unresolvedQuestions
  };
}

function activeProjectNodes(snapshot: KnowledgeWorkspaceSnapshot): KnowledgeNode[] {
  const rootNodeId = snapshot.project.subject.rootNodeId;
  return snapshot.graph.nodes.filter((node) =>
    node.status !== "archived"
    && (node.id === rootNodeId || node.scope.contextIds.includes(snapshot.project.id))
  );
}

function deriveNodeGaps(node: KnowledgeNode, outgoingContains: Set<string>): KnowledgeGapInsight[] {
  const gaps: KnowledgeGapInsight[] = [];
  if (node.kind === "uncertainty" && !isResolved(node)) {
    gaps.push(gap(node, "uncertainty", "high", "尚未收敛的不确定性", "需要补充证据、边界或替代解释。"));
  }
  if (node.sourceStatus === "conflicted") {
    gaps.push(gap(node, "conflicted_source", "high", "来源存在冲突", "需要比较来源口径并记录冲突处理结果。"));
  } else if (node.sourceStatus === "stale") {
    gaps.push(gap(node, "stale_source", "high", "来源已经失效", "需要定位更新版本并重新验证相关知识。"));
  } else if (evidenceSensitiveKinds.has(node.kind)
    && node.sourceStatus === "unlinked"
    && !["superseded", "contradicted"].includes(node.epistemicStatus)) {
    gaps.push(gap(node, "needs_evidence", "medium", "判断仍缺少证据", "当前内容只能视为待验证认知。"));
  }
  if (!outgoingContains.has(node.id)
    && !isResolved(node)
    && !["question", "uncertainty", "fact", "evidence"].includes(node.kind)) {
    gaps.push(gap(node, "unexpanded", "low", "尚未继续下钻", "当前节点仍停留在已有地图层级。"));
  }
  return gaps;
}

function gap(
  node: KnowledgeNode,
  kind: KnowledgeGapKind,
  severity: KnowledgeGapInsight["severity"],
  title: string,
  detail: string
): KnowledgeGapInsight {
  return {
    id: `${kind}:${node.id}`,
    nodeId: node.id,
    kind,
    severity,
    title: `${title} · ${node.title}`,
    detail
  };
}

function isResolved(node: KnowledgeNode): boolean {
  return node.status === "understood" || node.status === "verified";
}

function contextPolicyLabel(policy: KnowledgeContextPolicy): string {
  if (policy === "selected_node") return "仅当前节点";
  if (policy === "whole_subject") return "整个 Project";
  return "当前节点与直接关联";
}

function understandingHint(
  nodeCount: number,
  maxDepth: number,
  explorationCoveragePercent: number,
  resolvedNodeCount: number
): string {
  if (nodeCount === 0) return "当前 Project 尚未形成知识地图。";
  if (maxDepth <= 1) return "当前理解范围主要停留在根节点和第一层地图。";
  if (resolvedNodeCount === 0) {
    return `结构已下钻至第 ${maxDepth} 层，但还没有节点被明确标记为已理解。`;
  }
  return `结构已下钻至第 ${maxDepth} 层，探索覆盖约 ${explorationCoveragePercent}%；这不代表结论完整度。`;
}

function severityPriority(severity: KnowledgeGapInsight["severity"]): number {
  return severity === "high" ? 0 : severity === "medium" ? 1 : 2;
}

function questionPriority(state: UnresolvedQuestionInsight["state"]): number {
  return state === "unanswered" ? 0 : 1;
}
