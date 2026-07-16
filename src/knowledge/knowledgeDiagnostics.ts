import type { KnowledgeEdge, KnowledgeNode, KnowledgeWorkspaceSnapshot } from "../types";
import { deriveKnowledgeWorkspaceInsights } from "./knowledgeInsights";
import { isKnowledgeNodeGroundedInSources, validateKnowledgeSourceReference } from "./provenance";

export type KnowledgeDiagnosticKind =
  | "orphan_node"
  | "duplicate_concept"
  | "missing_claim_source"
  | "terminology_inconsistency"
  | "knowledge_gap"
  | "conflict"
  | "outdated"
  | "invalid_locator"
  | "scope_ambiguity";

export type KnowledgeDiagnosticSeverity = "high" | "medium" | "low";

export interface KnowledgeDiagnostic {
  id: string;
  kind: KnowledgeDiagnosticKind;
  severity: KnowledgeDiagnosticSeverity;
  title: string;
  detail: string;
  nodeIds: string[];
  edgeIds: string[];
  confidence: number;
  evidence: string[];
}

export interface KnowledgeDiagnostics {
  graphUpdatedAt: string;
  asOf: string;
  counts: Record<KnowledgeDiagnosticKind, number>;
  issues: KnowledgeDiagnostic[];
}

export const knowledgeDiagnosticKindLabels: Record<KnowledgeDiagnosticKind, string> = {
  orphan_node: "孤儿节点",
  duplicate_concept: "重复概念",
  missing_claim_source: "Claim 缺来源",
  terminology_inconsistency: "术语不一致",
  knowledge_gap: "知识缺口",
  conflict: "知识冲突",
  outdated: "过时内容",
  invalid_locator: "失效定位",
  scope_ambiguity: "适用范围"
};

const duplicateKinds = new Set<KnowledgeNode["kind"]>([
  "topic", "concept", "claim", "hypothesis", "inference", "conclusion", "skill", "practice", "experience"
]);
const terminologyKinds = new Set<KnowledgeNode["kind"]>(["topic", "concept", "skill", "practice"]);
const scopeSensitiveKinds = new Set<KnowledgeNode["kind"]>([
  "claim", "hypothesis", "inference", "conclusion", "practice", "experience", "decision"
]);

export function deriveKnowledgeDiagnostics(
  snapshot: KnowledgeWorkspaceSnapshot,
  options: { asOf?: string } = {}
): KnowledgeDiagnostics {
  const asOf = options.asOf ?? snapshot.graph.updatedAt;
  if (!Number.isFinite(Date.parse(asOf))) throw new Error(`Knowledge diagnostics asOf is invalid: ${asOf}`);
  const nodes = activeProjectNodes(snapshot).sort(compareNodes);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = snapshot.graph.edges
    .filter((edge) => nodeIds.has(edge.fromNodeId) && nodeIds.has(edge.toNodeId))
    .sort(compareEdges);
  const issues = [
    ...detectOrphanNodes(snapshot, nodes),
    ...detectDuplicateConcepts(nodes),
    ...detectMissingClaimSources(snapshot, nodes),
    ...detectTerminologyInconsistencies(nodes),
    ...detectKnowledgeGaps(snapshot, nodeIds),
    ...detectConflicts(nodes, edges),
    ...detectOutdated(nodes, asOf),
    ...detectInvalidLocators(snapshot, nodes),
    ...detectScopeAmbiguities(nodes, edges)
  ].sort(compareDiagnostics);
  const counts: KnowledgeDiagnostics["counts"] = {
    orphan_node: 0,
    duplicate_concept: 0,
    missing_claim_source: 0,
    terminology_inconsistency: 0,
    knowledge_gap: 0,
    conflict: 0,
    outdated: 0,
    invalid_locator: 0,
    scope_ambiguity: 0
  };
  for (const issue of issues) counts[issue.kind] += 1;
  return { graphUpdatedAt: snapshot.graph.updatedAt, asOf, counts, issues };
}

/** Stable read-only maintenance lint over the canonical workspace. */
export function lintKnowledgeWorkspace(
  snapshot: KnowledgeWorkspaceSnapshot,
  options: { asOf?: string } = {}
): KnowledgeDiagnostics {
  return deriveKnowledgeDiagnostics(snapshot, options);
}

function detectOrphanNodes(
  snapshot: KnowledgeWorkspaceSnapshot,
  nodes: KnowledgeNode[]
): KnowledgeDiagnostic[] {
  const activeIds = new Set(snapshot.graph.nodes.filter((node) => node.status !== "archived").map((node) => node.id));
  const incidentIds = new Set(snapshot.graph.edges
    .filter((edge) => activeIds.has(edge.fromNodeId) && activeIds.has(edge.toNodeId))
    .flatMap((edge) => [edge.fromNodeId, edge.toNodeId]));
  const exemptIds = new Set(snapshot.graph.rootNodeIds.concat(snapshot.project.subject.rootNodeId));
  return nodes
    .filter((node) => !exemptIds.has(node.id) && !incidentIds.has(node.id))
    .map((node) => diagnostic({
      kind: "orphan_node",
      severity: "medium",
      title: `孤儿节点 · ${node.title}`,
      detail: "该活动节点没有连接到任何其他活动知识；应建立正式关系、归入结构或确认是否归档。",
      nodes: [node],
      confidence: 1,
      evidence: ["活动入边：0", "活动出边：0"]
    }));
}

function detectMissingClaimSources(
  snapshot: KnowledgeWorkspaceSnapshot,
  nodes: KnowledgeNode[]
): KnowledgeDiagnostic[] {
  const context = { sources: snapshot.knowledgeSourceAssets, anchors: snapshot.sourceAnchors };
  return nodes
    .filter((node) => node.kind === "claim" && !isKnowledgeNodeGroundedInSources(snapshot.graph, node.id, context))
    .map((node) => diagnostic({
      kind: "missing_claim_source",
      severity: node.status === "verified" ? "high" : "medium",
      title: `Claim 缺少可验证来源 · ${node.title}`,
      detail: "该 Claim 既没有有效的已验证 SourceAnchor，也无法沿 supports/derived_from 追溯到带定位的正式证据。",
      nodes: [node],
      confidence: 1,
      evidence: [
        `sourceStatus：${node.sourceStatus}`,
        `直接来源引用：${node.sourceRefs.length}`,
        `正式支持关系：${snapshot.graph.edges.filter((edge) => edge.kind === "supports" && edge.toNodeId === node.id).length}`
      ]
    }));
}

function detectInvalidLocators(
  snapshot: KnowledgeWorkspaceSnapshot,
  nodes: KnowledgeNode[]
): KnowledgeDiagnostic[] {
  const context = { sources: snapshot.knowledgeSourceAssets, anchors: snapshot.sourceAnchors };
  return nodes.flatMap((node) => {
    const errors = node.sourceRefs.flatMap((ref) => {
      const error = validateKnowledgeSourceReference(ref, context);
      return error ? [`${ref.sourceId}/${ref.anchorId ?? "missing-anchor"}：${error}`] : [];
    });
    if (errors.length === 0) return [];
    return [diagnostic({
      kind: "invalid_locator",
      severity: "high",
      title: `来源定位失效 · ${node.title}`,
      detail: "节点的来源引用无法与不可变 Source、SourceAnchor、locator 或原文快照一致对应。",
      nodes: [node],
      confidence: 1,
      evidence: errors
    })];
  });
}

function detectDuplicateConcepts(nodes: KnowledgeNode[]): KnowledgeDiagnostic[] {
  const groups = groupBy(nodes.filter((node) => duplicateKinds.has(node.kind)), (node) => normalizeTitle(node.title));
  return Array.from(groups.entries()).flatMap(([signature, group]) => {
    if (!signature || group.length < 2) return [];
    const ordered = [...group].sort(compareNodes);
    return [diagnostic({
      kind: "duplicate_concept",
      severity: "medium",
      title: `可能重复：${ordered.map((node) => node.title).join(" / ")}`,
      detail: "这些节点的名称在忽略大小写、空格和标点后完全相同；应检查是否合并、建立 refines 关系或保留不同上下文。",
      nodes: ordered,
      confidence: 0.98,
      evidence: [`规范化名称：${signature}`, `节点类型：${ordered.map((node) => node.kind).join(", ")}`]
    })];
  });
}

function detectTerminologyInconsistencies(nodes: KnowledgeNode[]): KnowledgeDiagnostic[] {
  const issues: KnowledgeDiagnostic[] = [];
  const seenGroups = new Set<string>();
  const explicitTerms = new Map<string, KnowledgeNode[]>();
  for (const node of nodes) {
    for (const tag of node.tags) {
      if (!tag.startsWith("术语:")) continue;
      const term = normalizeTitle(tag.slice("术语:".length));
      if (term) explicitTerms.set(term, (explicitTerms.get(term) ?? []).concat(node));
    }
  }
  for (const [term, group] of explicitTerms) {
    appendTerminologyIssue(issues, seenGroups, group, `显式术语键：${term}`, 1);
  }

  const definitions = groupBy(
    nodes.filter((node) => terminologyKinds.has(node.kind) && normalizeDefinition(node.summary).length >= 12),
    (node) => normalizeDefinition(node.summary)
  );
  for (const [definition, group] of definitions) {
    appendTerminologyIssue(issues, seenGroups, group, `相同定义签名：${truncate(definition, 80)}`, 0.9);
  }
  return issues;
}

function appendTerminologyIssue(
  issues: KnowledgeDiagnostic[],
  seenGroups: Set<string>,
  group: KnowledgeNode[],
  evidence: string,
  confidence: number
): void {
  const distinctTitles = new Set(group.map((node) => normalizeTitle(node.title)));
  if (group.length < 2 || distinctTitles.size < 2) return;
  const ordered = uniqueNodes(group).sort(compareNodes);
  const key = ordered.map((node) => node.id).join("|");
  if (seenGroups.has(key)) return;
  seenGroups.add(key);
  issues.push(diagnostic({
    kind: "terminology_inconsistency",
    severity: "low",
    title: `术语可能不一致：${ordered.map((node) => node.title).join(" / ")}`,
    detail: "这些节点共享同一显式术语键或完全相同的定义，但名称不同；应确认标准术语、别名和边界。",
    nodes: ordered,
    confidence,
    evidence: [evidence]
  }));
}

function detectKnowledgeGaps(
  snapshot: KnowledgeWorkspaceSnapshot,
  activeNodeIds: Set<string>
): KnowledgeDiagnostic[] {
  const insights = deriveKnowledgeWorkspaceInsights(snapshot);
  const gapIssues = insights.gaps
    .filter((gap) => activeNodeIds.has(gap.nodeId) && ["uncertainty", "needs_evidence"].includes(gap.kind))
    .map((gap) => diagnostic({
      kind: "knowledge_gap",
      severity: gap.severity,
      title: gap.title,
      detail: gap.detail,
      nodes: snapshot.graph.nodes.filter((node) => node.id === gap.nodeId),
      confidence: 1,
      evidence: [`派生缺口类型：${gap.kind}`]
    }));
  const questionIssues = insights.unresolvedQuestions
    .filter((question) => activeNodeIds.has(question.nodeId))
    .map((question) => diagnostic({
      kind: "knowledge_gap",
      severity: question.state === "unanswered" ? "medium" : "low",
      title: `未解决问题 · ${question.title}`,
      detail: question.state === "unanswered" ? "当前没有候选回答。" : "已有候选回答，但尚未明确标记为已理解或已验证。",
      nodes: snapshot.graph.nodes.filter((node) => node.id === question.nodeId),
      confidence: 1,
      evidence: [`问题状态：${question.state}`]
    }));
  return uniqueDiagnostics(gapIssues.concat(questionIssues));
}

function detectConflicts(nodes: KnowledgeNode[], edges: KnowledgeEdge[]): KnowledgeDiagnostic[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const issues = edges.filter((edge) => edge.kind === "contradicts").map((edge) => {
    const from = nodesById.get(edge.fromNodeId)!;
    const to = nodesById.get(edge.toNodeId)!;
    return diagnostic({
      kind: "conflict",
      severity: "high",
      title: `显式冲突：${from.title} ↔ ${to.title}`,
      detail: "图谱中存在 contradicts 关系，需要比较来源、口径、时间和适用上下文。",
      nodes: [from, to],
      edges: [edge],
      confidence: 1,
      evidence: [`关系：${edge.id}`]
    });
  });
  const explicitConflictNodeIds = new Set(issues.flatMap((issue) => issue.nodeIds));
  for (const node of nodes) {
    const reasons = [
      node.sourceStatus === "conflicted" ? "来源状态为 conflicted" : undefined,
      node.epistemicStatus === "contested" ? "认知状态为 contested" : undefined,
      node.epistemicStatus === "contradicted" ? "认知状态为 contradicted" : undefined
    ].filter((value): value is string => Boolean(value));
    if (reasons.length === 0 || explicitConflictNodeIds.has(node.id)) continue;
    issues.push(diagnostic({
      kind: "conflict",
      severity: "high",
      title: `待处理冲突 · ${node.title}`,
      detail: "节点已被标记为存在争议、被反驳或来源冲突，但尚未形成可解释的冲突关系。",
      nodes: [node],
      confidence: 1,
      evidence: reasons
    }));
  }
  return issues;
}

function detectOutdated(nodes: KnowledgeNode[], asOf: string): KnowledgeDiagnostic[] {
  const asOfMs = Date.parse(asOf);
  return nodes.flatMap((node) => {
    const reasons = [
      node.epistemicStatus === "outdated" ? "认知状态为 outdated" : undefined,
      node.temporalValidity.status === "expired" ? "时间有效性为 expired" : undefined,
      node.temporalValidity.validUntil && Date.parse(node.temporalValidity.validUntil) < asOfMs
        ? `有效期截至 ${node.temporalValidity.validUntil}`
        : undefined,
      node.sourceStatus === "stale" ? "来源状态为 stale" : undefined
    ].filter((value): value is string => Boolean(value));
    if (reasons.length === 0) return [];
    return [diagnostic({
      kind: "outdated",
      severity: node.epistemicStatus === "outdated" || node.temporalValidity.status === "expired" ? "high" : "medium",
      title: `可能过时 · ${node.title}`,
      detail: "当前图谱时间或显式状态表明这项知识需要寻找新版本并重新验证。",
      nodes: [node],
      confidence: 1,
      evidence: reasons
    })];
  });
}

function detectScopeAmbiguities(nodes: KnowledgeNode[], edges: KnowledgeEdge[]): KnowledgeDiagnostic[] {
  const validContextTargets = new Map<string, Set<string>>();
  const declaredContextNodeIds = new Set<string>();
  for (const edge of edges.filter((edge) => edge.kind === "valid_in_context")) {
    const targets = validContextTargets.get(edge.fromNodeId) ?? new Set<string>();
    targets.add(edge.toNodeId);
    declaredContextNodeIds.add(edge.toNodeId);
    validContextTargets.set(edge.fromNodeId, targets);
  }
  return nodes.flatMap((node) => {
    if (declaredContextNodeIds.has(node.id)) return [];
    const declaredTargets = validContextTargets.get(node.id) ?? new Set<string>();
    const hasDeclaredContext = Array.from(declaredTargets).some((contextId) => node.scope.contextIds.includes(contextId));
    const reasons: string[] = [];
    if (node.scope.kind === "context_specific" && !hasDeclaredContext) {
      reasons.push("scope 为 context_specific，但缺少一致的 valid_in_context 关系");
    }
    if (node.epistemicStatus === "context_dependent" && !hasDeclaredContext) {
      reasons.push("认知状态依赖场景，但没有声明 Context 节点");
    }
    if (node.createdBy === "user"
      && scopeSensitiveKinds.has(node.kind)
      && node.scope.kind === "project"
      && !hasDeclaredContext) {
      reasons.push("用户经验仅使用默认 Project 范围，未说明适用场景和边界");
    }
    if (reasons.length === 0) return [];
    return [diagnostic({
      kind: "scope_ambiguity",
      severity: "medium",
      title: `适用范围不明 · ${node.title}`,
      detail: "需要明确系统、团队、规模、前提、时间窗口或失效条件，并建立 valid_in_context 关系。",
      nodes: [node],
      confidence: 1,
      evidence: reasons
    })];
  });
}

function activeProjectNodes(snapshot: KnowledgeWorkspaceSnapshot): KnowledgeNode[] {
  const rootNodeId = snapshot.project.subject.rootNodeId;
  return snapshot.graph.nodes.filter((node) =>
    node.status !== "archived"
    && (node.id === rootNodeId || node.scope.contextIds.includes(snapshot.project.id))
  );
}

function diagnostic(input: {
  kind: KnowledgeDiagnosticKind;
  severity: KnowledgeDiagnosticSeverity;
  title: string;
  detail: string;
  nodes: KnowledgeNode[];
  edges?: KnowledgeEdge[];
  confidence: number;
  evidence: string[];
}): KnowledgeDiagnostic {
  const nodeIds = uniqueNodes(input.nodes).map((node) => node.id).sort(compareText);
  const edgeIds = Array.from(new Set((input.edges ?? []).map((edge) => edge.id))).sort(compareText);
  return {
    id: `${input.kind}:${nodeIds.join("|")}:${edgeIds.join("|")}`,
    kind: input.kind,
    severity: input.severity,
    title: input.title,
    detail: input.detail,
    nodeIds,
    edgeIds,
    confidence: input.confidence,
    evidence: [...input.evidence].sort(compareText)
  };
}

function groupBy<T>(values: T[], keyFor: (value: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const key = keyFor(value);
    groups.set(key, (groups.get(key) ?? []).concat(value));
  }
  return groups;
}

function uniqueNodes(nodes: KnowledgeNode[]): KnowledgeNode[] {
  return Array.from(new Map(nodes.map((node) => [node.id, node])).values());
}

function uniqueDiagnostics(issues: KnowledgeDiagnostic[]): KnowledgeDiagnostic[] {
  return Array.from(new Map(issues.map((issue) => [issue.id, issue])).values());
}

function normalizeTitle(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[\s\p{P}\p{S}_]+/gu, "");
}

function normalizeDefinition(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[\s\p{P}\p{S}_]+/gu, "");
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

function compareNodes(left: KnowledgeNode, right: KnowledgeNode): number {
  return compareText(left.id, right.id);
}

function compareEdges(left: KnowledgeEdge, right: KnowledgeEdge): number {
  return compareText(left.id, right.id);
}

function compareDiagnostics(left: KnowledgeDiagnostic, right: KnowledgeDiagnostic): number {
  return severityPriority(left.severity) - severityPriority(right.severity)
    || compareText(left.kind, right.kind)
    || compareText(left.id, right.id);
}

function severityPriority(severity: KnowledgeDiagnosticSeverity): number {
  return severity === "high" ? 0 : severity === "medium" ? 1 : 2;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
