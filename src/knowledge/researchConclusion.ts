import type {
  AgentRequest,
  CandidateGraphPatch,
  GraphPatchOperation,
  KnowledgeEdge,
  KnowledgeNode,
  KnowledgeScope,
  KnowledgeWorkspaceSnapshot,
  ResearchReliableConclusionResult
} from "../types";
import { createGraphPatchAudit } from "./graphPatch";
import { createEvolutionEdge } from "./knowledgeEvolution";
import { createKnowledgeMetadata } from "./knowledgeMetadata";
import { assertResearchOrchestration } from "./researchOrchestration";
import { deriveResearchVerificationMatrix } from "./researchVerification";
import { assertKnowledgeProvenance } from "./provenance";

export interface ResearchInferenceDraft {
  id: string;
  title: string;
  summary: string;
  factNodeIds: string[];
  confidence: number;
}

export interface ResearchConclusionNodeDraft {
  id: string;
  title: string;
  summary: string;
  confidence: number;
}

export interface ProposeResearchConclusionInput {
  roundId: string;
  verificationTargetNodeId: string;
  inferenceDrafts: ResearchInferenceDraft[];
  synthesis: ResearchConclusionNodeDraft;
  conclusion: ResearchConclusionNodeDraft;
  scopeDescription: string;
  unresolvedQuestionNodeIds: string[];
  createdAt: string;
}

export interface ResearchConclusionAcceptance {
  roundId: string;
  result: ResearchReliableConclusionResult;
}

export function proposeResearchConclusion(
  snapshot: KnowledgeWorkspaceSnapshot,
  input: ProposeResearchConclusionInput
): KnowledgeWorkspaceSnapshot {
  if (snapshot.project.mode !== "research") throw new Error("Research conclusion requires a Research Project");
  assertTimestamp(input.createdAt, "createdAt");
  assertText(input.scopeDescription, "scopeDescription");
  assertKnowledgeProvenance(snapshot.graph, {
    sources: snapshot.knowledgeSourceAssets,
    anchors: snapshot.sourceAnchors
  });
  const round = requireActiveRound(snapshot, input.roundId);
  if (round.result?.kind === "reliable_conclusion") {
    throw new Error(`Research round ${round.id} already has an accepted reliable conclusion`);
  }
  if (snapshot.candidatePatches.some((patch) => patch.action === "conclude"
    && patch.status === "pending_review"
    && patch.operations.some((operation) => operation.kind === "create_node"
      && operation.node.tags.includes(`research:round:${round.id}`)))) {
    throw new Error(`Research round ${round.id} already has a pending conclusion patch`);
  }
  const matrix = deriveResearchVerificationMatrix(snapshot, round.id, input.verificationTargetNodeId);
  if (matrix.overallStatus !== "passed") {
    throw new Error(`Research conclusion requires a passed verification matrix; got ${matrix.overallStatus}`);
  }
  if (input.inferenceDrafts.length === 0) throw new Error("Research conclusion requires at least one inference");
  const ids = input.inferenceDrafts.map((draft) => draft.id).concat(input.synthesis.id, input.conclusion.id);
  assertDistinct(ids, "Research conclusion node ids");
  for (const id of ids) {
    assertText(id, "Research conclusion node id");
    if (snapshot.graph.nodes.some((node) => node.id === id)) throw new Error(`Research conclusion node already exists: ${id}`);
  }
  const scope: KnowledgeScope = {
    kind: "project",
    description: input.scopeDescription.trim(),
    contextIds: [snapshot.project.id]
  };
  const factIds = new Set<string>();
  for (const draft of input.inferenceDrafts) {
    validateDraft(draft, "inference");
    if (draft.factNodeIds.length === 0) throw new Error(`Inference ${draft.id} requires at least one Fact`);
    assertDistinct(draft.factNodeIds, `Inference ${draft.id} Fact ids`);
    for (const factId of draft.factNodeIds) {
      requireReliableFact(snapshot, factId);
      factIds.add(factId);
    }
  }
  validateDraft(input.synthesis, "synthesis");
  validateDraft(input.conclusion, "conclusion");
  const unresolvedQuestions = input.unresolvedQuestionNodeIds.map((nodeId) =>
    requireUnresolvedQuestion(snapshot, nodeId));
  assertDistinct(input.unresolvedQuestionNodeIds, "Unresolved question ids");

  const inferenceDepth = Math.max(...Array.from(factIds).map((factId) =>
    snapshot.graph.nodes.find((node) => node.id === factId)!.depth)) + 1;
  const inferences = input.inferenceDrafts.map((draft) => chainNode(
    snapshot,
    "inference",
    draft,
    inferenceDepth,
    scope,
    round.id,
    input.createdAt
  ));
  const synthesis = chainNode(snapshot, "synthesis", input.synthesis, inferenceDepth + 1, scope, round.id, input.createdAt);
  const conclusion = chainNode(snapshot, "conclusion", input.conclusion, inferenceDepth + 2, scope, round.id, input.createdAt);
  let edgeSequence = 0;
  const nextEdgeId = () => `research-conclusion-edge-${sanitizeId(round.id)}-${++edgeSequence}`;
  const derivedEdges: KnowledgeEdge[] = [
    ...input.inferenceDrafts.flatMap((draft) => draft.factNodeIds.map((factId) => createEvolutionEdge({
      id: nextEdgeId(),
      kind: "derived_from",
      fromNodeId: draft.id,
      toNodeId: factId,
      rationale: `推理「${draft.title}」由可追溯 Fact ${factId} 推导。`,
      createdBy: "agent",
      createdAt: input.createdAt,
      confidence: draft.confidence
    }))),
    ...inferences.map((inference) => createEvolutionEdge({
      id: nextEdgeId(),
      kind: "derived_from",
      fromNodeId: synthesis.id,
      toNodeId: inference.id,
      rationale: `综合判断由推理「${inference.title}」汇总。`,
      createdBy: "agent",
      createdAt: input.createdAt,
      confidence: synthesis.confidence
    })),
    createEvolutionEdge({
      id: nextEdgeId(),
      kind: "derived_from",
      fromNodeId: synthesis.id,
      toNodeId: input.verificationTargetNodeId,
      rationale: "综合判断保留已通过验证矩阵的目标判断。",
      createdBy: "agent",
      createdAt: input.createdAt,
      confidence: synthesis.confidence
    }),
    createEvolutionEdge({
      id: nextEdgeId(),
      kind: "derived_from",
      fromNodeId: conclusion.id,
      toNodeId: synthesis.id,
      rationale: "最终结论由本轮综合判断派生。",
      createdBy: "agent",
      createdAt: input.createdAt,
      confidence: conclusion.confidence
    })
  ];
  const unresolvedEdges: KnowledgeEdge[] = unresolvedQuestions.map((question) => ({
    id: nextEdgeId(),
    fromNodeId: conclusion.id,
    toNodeId: question.id,
    kind: "depends_on",
    label: "仍待解决",
    rationale: `结论仍受未解决问题「${question.title}」限制。`,
    createdBy: "agent",
    confidence: 1,
    createdAt: input.createdAt
  }));
  const operations: GraphPatchOperation[] = [
    ...inferences.concat(synthesis, conclusion).map((node, index): GraphPatchOperation => ({
      kind: "create_node",
      node,
      audit: createGraphPatchAudit(
        `research-conclusion-node-audit-${sanitizeId(round.id)}-${index + 1}`,
        `Create reviewed ${node.kind} node for a trustworthy Research conclusion chain`,
        input.createdAt
      )
    })),
    ...derivedEdges.concat(unresolvedEdges).map((edge, index): GraphPatchOperation => ({
      kind: "create_edge",
      edge,
      audit: createGraphPatchAudit(
        `research-conclusion-edge-audit-${sanitizeId(round.id)}-${index + 1}`,
        `Record the reviewed ${edge.kind} relation for the Research conclusion chain`,
        input.createdAt
      )
    }))
  ];
  const sequence = nextRequestSequence(snapshot);
  const request: AgentRequest = {
    id: `agent-request-${sequence}`,
    action: "conclude",
    selectionId: snapshot.selection.id,
    prompt: `基于已验证判断 ${input.verificationTargetNodeId} 形成可信结论子图。`,
    status: "proposed",
    createdAt: input.createdAt
  };
  const patch: CandidateGraphPatch = {
    id: `graph-patch-${sequence}`,
    requestId: request.id,
    action: "conclude",
    targetNodeId: input.verificationTargetNodeId,
    focusNodeId: conclusion.id,
    title: `审核研究结论「${conclusion.title}」`,
    summary: `审核 ${factIds.size} 个 Fact、${inferences.length} 个推理、1 个综合和 1 个结论组成的派生链。`,
    revision: 1,
    createdBy: "agent",
    operations,
    confidence: conclusion.confidence!,
    status: "pending_review",
    createdAt: input.createdAt
  };
  prepareResearchConclusionAcceptance(snapshot, patch, input.createdAt);
  return {
    ...snapshot,
    agentRequests: snapshot.agentRequests.concat(request),
    candidatePatches: snapshot.candidatePatches.concat(patch)
  };
}

export function prepareResearchConclusionAcceptance(
  snapshot: KnowledgeWorkspaceSnapshot,
  patch: CandidateGraphPatch,
  acceptedAt: string
): ResearchConclusionAcceptance | undefined {
  if (patch.action !== "conclude") return undefined;
  assertTimestamp(acceptedAt, "acceptedAt");
  if (patch.createdBy !== "agent" || patch.status !== "pending_review") {
    throw new Error("Research conclusion must remain an agent Candidate Graph Patch until user acceptance");
  }
  if (patch.operations.some((operation) => operation.kind !== "create_node" && operation.kind !== "create_edge")) {
    throw new Error("Research conclusion patch may only create its reviewed nodes and edges");
  }
  const createdNodes = patch.operations
    .filter((operation): operation is Extract<GraphPatchOperation, { kind: "create_node" }> => operation.kind === "create_node")
    .map((operation) => operation.node);
  const createdEdges = patch.operations
    .filter((operation): operation is Extract<GraphPatchOperation, { kind: "create_edge" }> => operation.kind === "create_edge")
    .map((operation) => operation.edge);
  const inferences = createdNodes.filter((node) => node.kind === "inference");
  const syntheses = createdNodes.filter((node) => node.kind === "synthesis");
  const conclusions = createdNodes.filter((node) => node.kind === "conclusion");
  if (createdNodes.length !== inferences.length + 2 || inferences.length === 0 || syntheses.length !== 1 || conclusions.length !== 1) {
    throw new Error("Research conclusion patch requires one or more inference nodes, one synthesis, and one conclusion");
  }
  const synthesis = syntheses[0];
  const conclusion = conclusions[0];
  const roundIds = union(createdNodes.flatMap((node) => node.tags
    .filter((tag) => tag.startsWith("research:round:"))
    .map((tag) => tag.slice("research:round:".length))));
  if (roundIds.length !== 1) throw new Error("Research conclusion nodes must declare one shared Research round");
  const round = requireActiveRound(snapshot, roundIds[0]);
  if (round.result?.kind === "reliable_conclusion") throw new Error(`Research round ${round.id} already has a reliable conclusion`);
  const matrix = deriveResearchVerificationMatrix(snapshot, round.id, patch.targetNodeId);
  if (matrix.overallStatus !== "passed" || matrix.records.some((record) =>
    record.status !== "passed" && record.status !== "not_applicable")) {
    throw new Error("Research conclusion requires every verification check to pass or be not applicable");
  }
  const scope = conclusion.scope;
  validateChainNode(conclusion, "conclusion", snapshot.project.id, scope);
  validateChainNode(synthesis, "synthesis", snapshot.project.id, scope);
  for (const inference of inferences) validateChainNode(inference, "inference", snapshot.project.id, scope);
  if (patch.focusNodeId !== conclusion.id || patch.confidence !== conclusion.confidence) {
    throw new Error("Research conclusion patch focus and confidence must match its conclusion node");
  }
  const createdNodeIds = createdNodes.map((node) => node.id);
  if (new Set(createdNodeIds).size !== createdNodes.length
    || createdNodes.some((node) => snapshot.graph.nodes.some((existing) => existing.id === node.id))) {
    throw new Error("Research conclusion patch contains duplicate or existing node ids");
  }
  const derivedEdges = createdEdges.filter((edge) => edge.kind === "derived_from");
  const unresolvedEdges = createdEdges.filter((edge) => edge.kind === "depends_on");
  if (createdEdges.length !== derivedEdges.length + unresolvedEdges.length) {
    throw new Error("Research conclusion patch contains an unsupported relation");
  }
  const inferenceIds = new Set(inferences.map((node) => node.id));
  const factIds = new Set<string>();
  for (const inference of inferences) {
    const premises = derivedEdges.filter((edge) => edge.fromNodeId === inference.id);
    if (premises.length === 0) throw new Error(`Inference ${inference.id} must derive from at least one Fact`);
    for (const edge of premises) {
      const fact = requireReliableFact(snapshot, edge.toNodeId);
      factIds.add(fact.id);
    }
  }
  const synthesisPremises = derivedEdges
    .filter((edge) => edge.fromNodeId === synthesis.id)
    .map((edge) => edge.toNodeId);
  assertExactSet(synthesisPremises, inferences.map((node) => node.id).concat(patch.targetNodeId), "Synthesis premises");
  const conclusionPremises = derivedEdges
    .filter((edge) => edge.fromNodeId === conclusion.id)
    .map((edge) => edge.toNodeId);
  assertExactSet(conclusionPremises, [synthesis.id], "Conclusion premises");
  if (derivedEdges.some((edge) => !inferenceIds.has(edge.fromNodeId)
    && edge.fromNodeId !== synthesis.id && edge.fromNodeId !== conclusion.id)) {
    throw new Error("Research conclusion contains a derived_from edge outside its chain");
  }
  const unresolvedQuestionIds = unresolvedEdges.map((edge) => {
    if (edge.fromNodeId !== conclusion.id) throw new Error("Only the conclusion may depend on unresolved questions");
    return requireUnresolvedQuestion(snapshot, edge.toNodeId).id;
  });
  assertDistinct(unresolvedQuestionIds, "Research conclusion unresolved questions");
  return {
    roundId: round.id,
    result: {
      kind: "reliable_conclusion",
      acceptedPatchId: patch.id,
      verificationTargetNodeId: patch.targetNodeId,
      verificationRecordIds: matrix.records.map((record) => record.id),
      factNodeIds: Array.from(factIds),
      inferenceNodeIds: inferences.map((node) => node.id),
      synthesisNodeId: synthesis.id,
      conclusionNodeId: conclusion.id,
      unresolvedQuestionNodeIds: unresolvedQuestionIds,
      confidence: conclusion.confidence!,
      scope: cloneScope(scope),
      acceptedAt
    }
  };
}

export function completeResearchConclusionAcceptance(
  snapshot: KnowledgeWorkspaceSnapshot,
  acceptance: ResearchConclusionAcceptance | undefined
): KnowledgeWorkspaceSnapshot {
  if (!acceptance) return snapshot;
  const project = {
    ...snapshot.project,
    workflow: { mode: "research" as const, phase: "synthesizing" as const },
    updatedAt: acceptance.result.acceptedAt
  };
  const next: KnowledgeWorkspaceSnapshot = {
    ...snapshot,
    project,
    projects: snapshot.projects.map((candidate) => candidate.id === project.id ? project : candidate),
    subject: project.subject,
    researchOrchestration: {
      ...snapshot.researchOrchestration,
      rounds: snapshot.researchOrchestration.rounds.map((round) => round.id === acceptance.roundId
        ? { ...round, result: acceptance.result, updatedAt: acceptance.result.acceptedAt }
        : round)
    }
  };
  assertResearchOrchestration(next);
  return next;
}

function chainNode(
  snapshot: KnowledgeWorkspaceSnapshot,
  kind: "inference" | "synthesis" | "conclusion",
  draft: ResearchConclusionNodeDraft,
  depth: number,
  scope: KnowledgeScope,
  roundId: string,
  createdAt: string
): KnowledgeNode {
  return {
    id: draft.id,
    kind,
    title: draft.title.trim(),
    summary: draft.summary.trim(),
    status: "verified",
    ...createKnowledgeMetadata({
      kind,
      createdBy: "agent",
      creatorId: "research-conclusion",
      scopeContextId: snapshot.project.id
    }),
    epistemicStatus: "supported",
    scope: cloneScope(scope),
    temporalValidity: { status: "current", observedAt: createdAt },
    sourceStatus: "unlinked",
    confidence: draft.confidence,
    depth,
    tags: ["research:conclusion_chain", `research:round:${roundId}`, `research:role:${kind}`],
    sourceRefs: [],
    createdBy: "agent",
    creatorId: "research-conclusion",
    createdAt,
    updatedAt: createdAt
  };
}

function validateChainNode(
  node: KnowledgeNode,
  expectedKind: "inference" | "synthesis" | "conclusion",
  projectId: string,
  scope: KnowledgeScope
): void {
  if (node.kind !== expectedKind || node.status !== "verified" || node.epistemicStatus !== "supported") {
    throw new Error(`Research ${expectedKind} ${node.id} must be a verified, supported ${expectedKind}`);
  }
  validateConfidence(node.confidence, `Research ${expectedKind} ${node.id}`);
  if (!sameValue(node.scope, scope) || !node.scope.contextIds.includes(projectId) || !node.scope.description.trim()) {
    throw new Error(`Research ${expectedKind} ${node.id} must record the shared Project scope`);
  }
  if (!node.tags.includes("research:conclusion_chain")) throw new Error(`Research ${expectedKind} ${node.id} is missing its chain tag`);
}

function requireReliableFact(snapshot: KnowledgeWorkspaceSnapshot, factId: string): KnowledgeNode {
  const fact = snapshot.graph.nodes.find((node) => node.id === factId && node.status !== "archived");
  if (!fact || fact.kind !== "fact" || fact.status !== "verified"
    || fact.epistemicStatus !== "supported" || fact.sourceStatus !== "verified"
    || !fact.scope.contextIds.includes(snapshot.project.id)) {
    throw new Error(`Reliable Research conclusion requires a verified, sourced Project Fact: ${factId}`);
  }
  return fact;
}

function requireUnresolvedQuestion(snapshot: KnowledgeWorkspaceSnapshot, nodeId: string): KnowledgeNode {
  const node = snapshot.graph.nodes.find((candidate) => candidate.id === nodeId && candidate.status !== "archived");
  if (!node || (node.kind !== "question" && node.kind !== "uncertainty")
    || ["understood", "verified"].includes(node.status)
    || !node.scope.contextIds.includes(snapshot.project.id)) {
    throw new Error(`Research conclusion unresolved question is unavailable or resolved: ${nodeId}`);
  }
  return node;
}

function requireActiveRound(snapshot: KnowledgeWorkspaceSnapshot, roundId: string) {
  const round = snapshot.researchOrchestration.rounds.find((candidate) =>
    candidate.id === roundId && candidate.projectId === snapshot.project.id);
  if (!round) throw new Error(`Research round is unavailable: ${roundId}`);
  if (round.status !== "active") throw new Error(`Research round is not active: ${round.status}`);
  return round;
}

function validateDraft(draft: ResearchConclusionNodeDraft, label: string): void {
  assertText(draft.id, `${label}.id`);
  assertText(draft.title, `${label}.title`);
  assertText(draft.summary, `${label}.summary`);
  validateConfidence(draft.confidence, label);
}

function validateConfidence(value: number | undefined, label: string): void {
  if (value === undefined || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} confidence must be between 0 and 1`);
  }
}

function nextRequestSequence(snapshot: KnowledgeWorkspaceSnapshot): number {
  let sequence = snapshot.agentRequests.length + 1;
  const requestIds = new Set(snapshot.agentRequests.map((request) => request.id));
  const patchIds = new Set(snapshot.candidatePatches.map((patch) => patch.id));
  while (requestIds.has(`agent-request-${sequence}`) || patchIds.has(`graph-patch-${sequence}`)) sequence += 1;
  return sequence;
}

function assertExactSet(actual: string[], expected: string[], label: string): void {
  assertDistinct(actual, label);
  assertDistinct(expected, `${label} expected ids`);
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  if (actualSet.size !== expectedSet.size || actual.some((id) => !expectedSet.has(id))) {
    throw new Error(`${label} must exactly match the canonical conclusion chain`);
  }
}

function assertDistinct(values: string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${label} must not contain duplicates`);
}

function assertText(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} must not be empty`);
}

function assertTimestamp(value: string, label: string): void {
  if (Number.isNaN(Date.parse(value))) throw new Error(`${label} must be a valid timestamp`);
}

function union(values: string[]): string[] {
  return Array.from(new Set(values));
}

function cloneScope(scope: KnowledgeScope): KnowledgeScope {
  return { ...scope, contextIds: scope.contextIds.slice() };
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sanitizeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "round";
}
