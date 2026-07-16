import type {
  AgentRequest,
  CandidateGraphPatch,
  EpistemicStatus,
  GraphPatchOperation,
  KnowledgeEdge,
  KnowledgeNode,
  KnowledgeWorkspaceSnapshot
} from "../types";
import { createGraphPatchAudit } from "./graphPatch";
import { createEvolutionEdge } from "./knowledgeEvolution";
import { createKnowledgeMetadata } from "./knowledgeMetadata";
import { isProjectWritable } from "./projectLifecycle";
import { deriveImpactAssessment } from "./impactAssessment";

export type CorrectionErrorType =
  | "factual_error"
  | "conceptual_misalignment"
  | "incorrect_causality"
  | "outdated"
  | "scope_overgeneralization"
  | "contradiction"
  | "unsafe_practice";

export type CorrectionEvidenceStance = "supports_correction" | "opposes_correction" | "unclassified";

export interface CorrectionEvidenceCandidate {
  nodeId: string;
  title: string;
  kind: KnowledgeNode["kind"];
  sourceCount: number;
  stance: CorrectionEvidenceStance;
}

export interface CorrectionProposalInput {
  targetNodeId: string;
  errorType: CorrectionErrorType;
  correctedContent: string;
  applicabilityScope: string;
  supportingEvidenceNodeIds: string[];
  opposingEvidenceNodeIds?: string[];
}

export interface CorrectionSuggestion {
  id: string;
  targetNodeId: string;
  targetTitle: string;
  errorType: CorrectionErrorType;
  errorTypeLabel: string;
  correctedTitle: string;
  correctedContent: string;
  applicabilityScope: string;
  supportingEvidence: CorrectionEvidenceCandidate[];
  opposingEvidence: CorrectionEvidenceCandidate[];
  independentSourceCount: number;
}

export const correctionErrorTypeLabels: Record<CorrectionErrorType, string> = {
  factual_error: "事实错误",
  conceptual_misalignment: "概念偏差",
  incorrect_causality: "因果关系错误",
  outdated: "知识过时",
  scope_overgeneralization: "适用范围过度泛化",
  contradiction: "知识矛盾",
  unsafe_practice: "不正确或不安全的实践"
};

export const correctionPolicy = {
  id: "systematize-correction-advisor",
  version: 1,
  role: "Critic + Verifier + Coach",
  requiresGroundedSupportingEvidence: true,
  preservesPreviousKnowledge: true,
  writesThroughCandidatePatchOnly: true,
  includesImpactAssessment: false
} as const;

export function deriveCorrectionEvidenceCandidates(
  snapshot: KnowledgeWorkspaceSnapshot,
  targetNodeId = snapshot.selection.focusNodeId
): CorrectionEvidenceCandidate[] {
  requireSystematize(snapshot);
  requireTarget(snapshot, targetNodeId);
  return snapshot.graph.nodes
    .filter((node) => node.id !== targetNodeId && node.status !== "archived" && hasValidDirectSource(snapshot, node))
    .map((node) => ({
      nodeId: node.id,
      title: node.title,
      kind: node.kind,
      sourceCount: new Set(node.sourceRefs.map((reference) => reference.sourceId)).size,
      stance: evidenceStance(snapshot, node.id, targetNodeId)
    }))
    .sort((left, right) => stancePriority(left.stance) - stancePriority(right.stance)
      || left.title.localeCompare(right.title, "zh-CN")
      || left.nodeId.localeCompare(right.nodeId));
}

export function buildCorrectionSuggestion(
  snapshot: KnowledgeWorkspaceSnapshot,
  input: CorrectionProposalInput
): CorrectionSuggestion {
  requireSystematize(snapshot);
  const target = requireTarget(snapshot, input.targetNodeId);
  if (snapshot.selection.focusNodeId !== target.id) throw new Error("Correction target must match the visible Context Packet focus");
  const correctedContent = input.correctedContent.trim();
  const applicabilityScope = input.applicabilityScope.trim();
  if (!correctedContent) throw new Error("修正内容不能为空");
  if (!applicabilityScope) throw new Error("必须明确修正后知识的适用范围");
  if (!correctionErrorTypeLabels[input.errorType]) throw new Error(`Unsupported correction error type: ${input.errorType}`);

  const candidates = new Map(deriveCorrectionEvidenceCandidates(snapshot, target.id).map((candidate) => [candidate.nodeId, candidate]));
  const supportIds = uniqueIds(input.supportingEvidenceNodeIds);
  const oppositionIds = uniqueIds(input.opposingEvidenceNodeIds ?? []);
  if (supportIds.length === 0) throw new Error("纠偏至少需要一条带原文定位的支持证据");
  if (oppositionIds.length === 0) throw new Error("纠偏至少需要一条反对证据，或应先继续搜索反例");
  if (supportIds.some((nodeId) => oppositionIds.includes(nodeId))) throw new Error("同一证据不能同时标记为支持与反对");
  const supportingEvidence = supportIds.map((nodeId) => requireEvidenceCandidate(candidates, nodeId));
  const opposingEvidence = oppositionIds.map((nodeId) => requireEvidenceCandidate(candidates, nodeId));
  const independentSourceCount = new Set(supportIds.concat(oppositionIds).flatMap((nodeId) =>
    snapshot.graph.nodes.find((node) => node.id === nodeId)?.sourceRefs.map((reference) => reference.sourceId) ?? []
  )).size;
  if (independentSourceCount < 2) throw new Error("纠偏至少需要两个独立不可变来源，不能只凭单一页面宣布旧认知错误");
  return {
    id: `correction-suggestion-${target.id}`,
    targetNodeId: target.id,
    targetTitle: target.title,
    errorType: input.errorType,
    errorTypeLabel: correctionErrorTypeLabels[input.errorType],
    correctedTitle: `${target.title} · 修正`,
    correctedContent,
    applicabilityScope,
    supportingEvidence,
    opposingEvidence,
    independentSourceCount
  };
}

export function proposeCorrection(
  snapshot: KnowledgeWorkspaceSnapshot,
  input: CorrectionProposalInput
): KnowledgeWorkspaceSnapshot {
  requireSystematize(snapshot);
  if (!isProjectWritable(snapshot)) throw new Error("Project must be writable before proposing a correction");
  if (snapshot.candidatePatches.some((patch) => patch.action === "correct" && patch.targetNodeId === input.targetNodeId && patch.status === "pending_review")) {
    throw new Error("请先审核当前纠偏 Candidate Graph Patch");
  }
  const suggestion = buildCorrectionSuggestion(snapshot, input);
  const target = requireTarget(snapshot, suggestion.targetNodeId);
  const sequence = snapshot.candidatePatches.filter((patch) => patch.action === "correct").length + 1;
  const baseId = `${target.id}-correction-${sequence}`;
  const contextNode = createContextNode(snapshot, target, suggestion, `${baseId}-context`);
  const correctedNode = createCorrectedNode(snapshot, target, suggestion, contextNode.id, `${baseId}-corrected`);
  const evidenceEntries = [
    ...suggestion.supportingEvidence.map((candidate) => ({ candidate, stance: "supports_correction" as const })),
    ...suggestion.opposingEvidence.map((candidate) => ({ candidate, stance: "opposes_correction" as const }))
  ].map((entry, index) => ({
    ...entry,
    sourceNode: snapshot.graph.nodes.find((node) => node.id === entry.candidate.nodeId)!,
    evidenceNodeId: `${baseId}-evidence-${index + 1}`
  }));
  const evidenceNodes = evidenceEntries.map((entry) => createEvidenceNode(
    snapshot,
    target,
    entry.sourceNode,
    entry.stance,
    entry.evidenceNodeId
  ));
  const operations: GraphPatchOperation[] = [
    createTargetStatusOperation(target, suggestion.errorType, snapshot.graph.updatedAt),
    createNodeOperation(contextNode, "Preserve the explicit applicability scope for the correction"),
    createNodeOperation(correctedNode, "Create a source-grounded corrected knowledge node without overwriting the previous node"),
    ...evidenceNodes.map((node) => createNodeOperation(node, "Preserve a typed supporting or opposing evidence excerpt for the correction")),
    ...evidenceEntries.flatMap((entry, index) => {
      const evidenceNode = evidenceNodes[index];
      const derived = createEvolutionEdge({
        id: `${evidenceNode.id}-derived-from-${entry.sourceNode.id}`,
        kind: "derived_from",
        fromNodeId: evidenceNode.id,
        toNodeId: entry.sourceNode.id,
        rationale: "The correction evidence preserves the immutable source locator carried by this source-backed node.",
        createdBy: "agent",
        createdAt: snapshot.graph.updatedAt
      });
      const stanceEdge = createEvidenceStanceEdge(
        `${evidenceNode.id}-${entry.stance === "supports_correction" ? "supports" : "contradicts"}-${correctedNode.id}`,
        evidenceNode.id,
        correctedNode.id,
        entry.stance,
        snapshot.graph.updatedAt
      );
      return [
        createEdgeOperation(derived, "Trace the typed correction evidence back to the selected source-backed node"),
        createEdgeOperation(stanceEdge, `Record that this evidence ${entry.stance === "supports_correction" ? "supports" : "opposes"} the correction`)
      ];
    }),
    createEdgeOperation(createEvolutionEdge({
      id: `${correctedNode.id}-valid-in-${contextNode.id}`,
      kind: "valid_in_context",
      fromNodeId: correctedNode.id,
      toNodeId: contextNode.id,
      rationale: suggestion.applicabilityScope,
      createdBy: "agent",
      createdAt: snapshot.graph.updatedAt
    }), "Attach the correction to its explicit applicability context"),
    createEdgeOperation(createEvolutionEdge({
      id: `${correctedNode.id}-corrects-${target.id}`,
      kind: "corrects",
      fromNodeId: correctedNode.id,
      toNodeId: target.id,
      rationale: `${suggestion.errorTypeLabel}；${suggestion.supportingEvidence.length} 条支持证据，${suggestion.opposingEvidence.length} 条反对证据。`,
      createdBy: "agent",
      createdAt: snapshot.graph.updatedAt,
      confidence: suggestion.supportingEvidence.length >= 2 ? 0.9 : 0.75
    }), "Preserve correction history from the new knowledge to the previous knowledge")
  ];
  const request: AgentRequest = {
    id: `agent-request-correct-${sequence}`,
    action: "correct",
    selectionId: snapshot.selection.id,
    prompt: `检查「${target.title}」的${suggestion.errorTypeLabel}，比较支持与反对证据，并在“${suggestion.applicabilityScope}”范围内提出修正。`,
    status: "proposed",
    createdAt: snapshot.graph.updatedAt
  };
  const patchBase: CandidateGraphPatch = {
    id: `graph-patch-correct-${sequence}`,
    requestId: request.id,
    action: "correct",
    targetNodeId: target.id,
    focusNodeId: correctedNode.id,
    title: `纠偏「${target.title}」：${suggestion.errorTypeLabel}`,
    summary: `修正内容：${suggestion.correctedContent}\n适用范围：${suggestion.applicabilityScope}\n证据：${suggestion.supportingEvidence.length} 条支持，${suggestion.opposingEvidence.length} 条反对，覆盖 ${suggestion.independentSourceCount} 个独立来源。旧认知不会被覆盖。`,
    revision: 1,
    createdBy: "agent",
    operations,
    confidence: suggestion.supportingEvidence.length >= 2 ? 0.9 : 0.75,
    status: "pending_review",
    createdAt: snapshot.graph.updatedAt
  };
  const patch: CandidateGraphPatch = {
    ...patchBase,
    impactAssessment: deriveImpactAssessment(snapshot, {
      patchId: patchBase.id,
      targetNodeId: patchBase.targetNodeId,
      assessedAt: patchBase.createdAt
    })
  };
  return { ...snapshot, agentRequests: snapshot.agentRequests.concat(request), candidatePatches: snapshot.candidatePatches.concat(patch) };
}

function createTargetStatusOperation(
  target: KnowledgeNode,
  errorType: CorrectionErrorType,
  createdAt: string
): GraphPatchOperation {
  const epistemicStatus: EpistemicStatus = errorType === "outdated"
    ? "outdated"
    : ["conceptual_misalignment", "scope_overgeneralization", "contradiction"].includes(errorType)
      ? "contested"
      : "contradicted";
  return {
    kind: "update_node_status",
    nodeId: target.id,
    before: {
      status: target.status,
      epistemicStatus: target.epistemicStatus,
      temporalValidity: target.temporalValidity
    },
    after: {
      status: "contested",
      epistemicStatus,
      temporalValidity: target.temporalValidity
    },
    audit: createGraphPatchAudit(`${target.id}-correction-status-audit-${createdAt}`, `Mark previous knowledge as ${epistemicStatus} before linking a reviewed correction`, createdAt)
  };
}

function createContextNode(
  snapshot: KnowledgeWorkspaceSnapshot,
  target: KnowledgeNode,
  suggestion: CorrectionSuggestion,
  id: string
): KnowledgeNode {
  return {
    id,
    kind: "topic",
    title: `${target.title} · 修正适用范围`,
    summary: suggestion.applicabilityScope,
    status: "open",
    ...createKnowledgeMetadata({ kind: "topic", createdBy: "agent", creatorId: correctionPolicy.id, scopeContextId: snapshot.project.id }),
    depth: target.depth + 1,
    tags: ["纠偏范围", `纠偏目标:${target.id}`],
    sourceRefs: [],
    createdAt: snapshot.graph.updatedAt,
    updatedAt: snapshot.graph.updatedAt
  };
}

function createCorrectedNode(
  snapshot: KnowledgeWorkspaceSnapshot,
  target: KnowledgeNode,
  suggestion: CorrectionSuggestion,
  contextNodeId: string,
  id: string
): KnowledgeNode {
  return {
    id,
    kind: "claim",
    title: suggestion.correctedTitle,
    summary: suggestion.correctedContent,
    status: "verified",
    ...createKnowledgeMetadata({ kind: "claim", createdBy: "agent", creatorId: correctionPolicy.id, scopeContextId: snapshot.project.id }),
    epistemicStatus: "context_dependent",
    scope: {
      kind: "context_specific",
      description: suggestion.applicabilityScope,
      contextIds: [snapshot.project.id, contextNodeId]
    },
    depth: target.depth + 1,
    tags: ["纠偏建议", `纠偏类型:${suggestion.errorType}`, `纠偏目标:${target.id}`],
    sourceRefs: [],
    createdAt: snapshot.graph.updatedAt,
    updatedAt: snapshot.graph.updatedAt
  };
}

function createEvidenceNode(
  snapshot: KnowledgeWorkspaceSnapshot,
  target: KnowledgeNode,
  sourceNode: KnowledgeNode,
  stance: Exclude<CorrectionEvidenceStance, "unclassified">,
  id: string
): KnowledgeNode {
  const label = stance === "supports_correction" ? "支持证据" : "反对证据";
  return {
    id,
    kind: "evidence",
    title: `${label} · ${sourceNode.title}`,
    summary: sourceNode.summary,
    status: "verified",
    ...createKnowledgeMetadata({
      kind: "evidence",
      createdBy: "agent",
      creatorId: correctionPolicy.id,
      scopeContextId: snapshot.project.id,
      sourceRefCount: sourceNode.sourceRefs.length,
      sourceVerified: true
    }),
    depth: target.depth + 1,
    tags: [label, `纠偏证据:${stance}`, `证据来源节点:${sourceNode.id}`, `纠偏目标:${target.id}`],
    sourceRefs: sourceNode.sourceRefs.map((reference) => ({ ...reference })),
    createdAt: snapshot.graph.updatedAt,
    updatedAt: snapshot.graph.updatedAt
  };
}

function createEvidenceStanceEdge(
  id: string,
  fromNodeId: string,
  toNodeId: string,
  stance: Exclude<CorrectionEvidenceStance, "unclassified">,
  createdAt: string
): KnowledgeEdge {
  return {
    id,
    fromNodeId,
    toNodeId,
    kind: stance === "supports_correction" ? "supports" : "contradicts",
    rationale: stance === "supports_correction" ? "Selected as evidence supporting the correction" : "Selected as evidence opposing the correction",
    createdBy: "agent",
    confidence: 1,
    createdAt
  };
}

function createNodeOperation(node: KnowledgeNode, rationale: string): GraphPatchOperation {
  return { kind: "create_node", node, audit: createGraphPatchAudit(`${node.id}-audit`, rationale, node.createdAt) };
}

function createEdgeOperation(edge: KnowledgeEdge, rationale: string): GraphPatchOperation {
  return { kind: "create_edge", edge, audit: createGraphPatchAudit(`${edge.id}-audit`, rationale, edge.createdAt) };
}

function evidenceStance(
  snapshot: KnowledgeWorkspaceSnapshot,
  evidenceNodeId: string,
  targetNodeId: string
): CorrectionEvidenceStance {
  if (snapshot.graph.edges.some((edge) => edge.fromNodeId === evidenceNodeId && edge.toNodeId === targetNodeId && edge.kind === "contradicts")) {
    return "supports_correction";
  }
  if (snapshot.graph.edges.some((edge) => edge.fromNodeId === evidenceNodeId && edge.toNodeId === targetNodeId && edge.kind === "supports")) {
    return "opposes_correction";
  }
  return "unclassified";
}

function hasValidDirectSource(snapshot: KnowledgeWorkspaceSnapshot, node: KnowledgeNode): boolean {
  if (node.sourceStatus !== "verified" || node.sourceRefs.length === 0) return false;
  return node.sourceRefs.every((reference) => {
    const source = snapshot.knowledgeSourceAssets.find((candidate) => candidate.id === reference.sourceId);
    const anchor = snapshot.sourceAnchors.find((candidate) => candidate.id === reference.anchorId);
    return Boolean(source && anchor && anchor.sourceId === source.id && anchor.contentHash === source.contentHash);
  });
}

function requireSystematize(snapshot: KnowledgeWorkspaceSnapshot): void {
  if (snapshot.project.mode !== "systematize") throw new Error("Correction policy is only available in a Systematize Project");
}

function requireTarget(snapshot: KnowledgeWorkspaceSnapshot, targetNodeId: string): KnowledgeNode {
  const target = snapshot.graph.nodes.find((node) => node.id === targetNodeId);
  if (!target || target.status === "archived") throw new Error(`Correction target is unavailable: ${targetNodeId}`);
  return target;
}

function requireEvidenceCandidate(
  candidates: Map<string, CorrectionEvidenceCandidate>,
  nodeId: string
): CorrectionEvidenceCandidate {
  const candidate = candidates.get(nodeId);
  if (!candidate) throw new Error(`纠偏证据必须是当前图谱中带有效来源定位的节点：${nodeId}`);
  return candidate;
}

function uniqueIds(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function stancePriority(stance: CorrectionEvidenceStance): number {
  return stance === "supports_correction" ? 0 : stance === "opposes_correction" ? 1 : 2;
}
