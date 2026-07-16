import type {
  AgentRequest,
  CandidateGraphPatch,
  GraphPatchOperation,
  KnowledgeEdge,
  KnowledgeNode,
  KnowledgeNodeKind,
  KnowledgeScope,
  KnowledgeWorkspaceSnapshot
} from "../types";
import { createGraphPatchAudit } from "./graphPatch";
import { createEvolutionEdge } from "./knowledgeEvolution";
import { createKnowledgeMetadata } from "./knowledgeMetadata";
import { assertKnowledgeProvenance } from "./provenance";

export interface ResearchRouteNodeDraft {
  id: string;
  title: string;
  summary: string;
  confidence: number;
}

export interface ResearchRouteEvidenceLink {
  evidenceNodeId: string;
  stance: "supports" | "contradicts";
}

export interface ResearchRouteOptionDraft extends ResearchRouteNodeDraft {
  evidenceLinks: ResearchRouteEvidenceLink[];
}

export interface ProposeResearchRouteInput {
  roundId: string;
  goal: ResearchRouteNodeDraft;
  constraints: ResearchRouteNodeDraft[];
  criteria: ResearchRouteNodeDraft[];
  options: ResearchRouteOptionDraft[];
  decision: ResearchRouteNodeDraft & { selectedOptionId: string };
  steps: ResearchRouteNodeDraft[];
  scopeDescription: string;
  createdAt: string;
}

export function proposeResearchRoute(
  snapshot: KnowledgeWorkspaceSnapshot,
  input: ProposeResearchRouteInput
): KnowledgeWorkspaceSnapshot {
  if (snapshot.project.mode !== "research") throw new Error("Research route requires a Research Project");
  assertTimestamp(input.createdAt, "createdAt");
  assertText(input.scopeDescription, "scopeDescription");
  assertKnowledgeProvenance(snapshot.graph, {
    sources: snapshot.knowledgeSourceAssets,
    anchors: snapshot.sourceAnchors
  });
  const round = requireRouteRound(snapshot, input.roundId, true);
  if (snapshot.candidatePatches.some((patch) => patch.action === "route"
    && patch.status === "pending_review"
    && patch.operations.some((operation) => operation.kind === "create_node"
      && operation.node.tags.includes(`research:round:${round.id}`)))) {
    throw new Error(`Research round ${round.id} already has a pending route Patch`);
  }
  if (input.constraints.length === 0) throw new Error("Research route requires at least one constraint");
  if (input.criteria.length === 0) throw new Error("Research route requires at least one criterion");
  if (input.options.length < 2) throw new Error("Research route requires at least two route options");
  if (input.steps.length === 0) throw new Error("Research route requires at least one route step");
  const selectedOption = input.options.find((option) => option.id === input.decision.selectedOptionId);
  if (!selectedOption) throw new Error(`Research route selected option is unavailable: ${input.decision.selectedOptionId}`);
  const drafts = [input.goal, ...input.constraints, ...input.criteria, ...input.options, input.decision, ...input.steps];
  drafts.forEach((draft) => validateDraft(draft));
  assertDistinct(drafts.map((draft) => draft.id), "Research route node ids");
  for (const draft of drafts) {
    if (snapshot.graph.nodes.some((node) => node.id === draft.id)) throw new Error(`Research route node already exists: ${draft.id}`);
  }
  for (const option of input.options) {
    if (option.evidenceLinks.length === 0 || !option.evidenceLinks.some((link) => link.stance === "supports")) {
      throw new Error(`Route option ${option.id} requires at least one supporting Evidence link`);
    }
    assertDistinct(option.evidenceLinks.map((link) => link.evidenceNodeId), `Route option ${option.id} Evidence ids`);
    option.evidenceLinks.forEach((link) => requireReliableEvidence(snapshot, link.evidenceNodeId));
  }
  const scope: KnowledgeScope = {
    kind: "project",
    description: input.scopeDescription.trim(),
    contextIds: [snapshot.project.id]
  };
  const conclusion = snapshot.graph.nodes.find((node) => node.id === round.result.conclusionNodeId)!;
  const goal = routeNode(snapshot, "goal", input.goal, conclusion.depth + 1, scope, round.id, input.createdAt);
  const constraints = input.constraints.map((draft) =>
    routeNode(snapshot, "constraint", draft, goal.depth + 1, scope, round.id, input.createdAt));
  const criteria = input.criteria.map((draft) =>
    routeNode(snapshot, "criterion", draft, goal.depth + 1, scope, round.id, input.createdAt));
  const options = input.options.map((draft) =>
    routeNode(snapshot, "route_option", draft, goal.depth + 1, scope, round.id, input.createdAt, true));
  const decision = routeNode(snapshot, "decision", input.decision, goal.depth + 2, scope, round.id, input.createdAt, true);
  const steps = input.steps.map((draft, index) => ({
    ...routeNode(snapshot, "route_step", draft, goal.depth + 3, scope, round.id, input.createdAt),
    tags: ["research:route", `research:round:${round.id}`, "research:role:route_step", `research:route-step:${index + 1}`]
  }));
  let edgeSequence = 0;
  const nextEdgeId = () => `research-route-edge-${sanitizeId(round.id)}-${++edgeSequence}`;
  const structuralNodes = constraints.concat(criteria, options);
  const edges: KnowledgeEdge[] = [
    createEvolutionEdge({
      id: nextEdgeId(),
      kind: "derived_from",
      fromNodeId: goal.id,
      toNodeId: conclusion.id,
      rationale: `技术路线目标「${goal.title}」由已验收研究结论「${conclusion.title}」派生。`,
      createdBy: "agent",
      createdAt: input.createdAt,
      confidence: goal.confidence
    }),
    ...structuralNodes.map((node) => edge(
      nextEdgeId(), goal.id, node.id, "contains", `目标「${goal.title}」包含${node.title}。`, input.createdAt, node.confidence
    )),
    ...constraints.flatMap((constraint) => options.map((option) => edge(
      nextEdgeId(), constraint.id, option.id, "constrains", `约束「${constraint.title}」限制路线「${option.title}」。`, input.createdAt, constraint.confidence
    ))),
    ...criteria.flatMap((criterion) => options.map((option) => edge(
      nextEdgeId(), criterion.id, option.id, "compares", `标准「${criterion.title}」用于比较路线「${option.title}」。`, input.createdAt, criterion.confidence
    ))),
    ...input.options.flatMap((option) => option.evidenceLinks.map((link) => edge(
      nextEdgeId(), link.evidenceNodeId, option.id, link.stance,
      `${link.stance === "supports" ? "支持" : "反对"}路线「${option.title}」的正式证据。`,
      input.createdAt,
      0.9
    ))),
    createEvolutionEdge({
      id: nextEdgeId(),
      kind: "derived_from",
      fromNodeId: decision.id,
      toNodeId: selectedOption.id,
      rationale: `决策「${decision.title}」选择路线「${selectedOption.title}」。`,
      createdBy: "agent",
      createdAt: input.createdAt,
      confidence: decision.confidence
    }),
    ...steps.map((step) => createEvolutionEdge({
      id: nextEdgeId(),
      kind: "derived_from",
      fromNodeId: step.id,
      toNodeId: decision.id,
      rationale: `步骤「${step.title}」由已审核路线决策派生。`,
      createdBy: "agent",
      createdAt: input.createdAt,
      confidence: step.confidence
    })),
    ...steps.slice(0, -1).map((step, index) => edge(
      nextEdgeId(), step.id, steps[index + 1].id, "precedes",
      `路线步骤 ${index + 1} 先于步骤 ${index + 2}。`, input.createdAt, 1
    ))
  ];
  const nodes = [goal, ...constraints, ...criteria, ...options, decision, ...steps];
  const operations: GraphPatchOperation[] = [
    ...nodes.map((node, index): GraphPatchOperation => ({
      kind: "create_node",
      node,
      audit: createGraphPatchAudit(
        `research-route-node-audit-${sanitizeId(round.id)}-${index + 1}`,
        `Create reviewed ${node.kind} node for the Research technical route`,
        input.createdAt
      )
    })),
    ...edges.map((routeEdge, index): GraphPatchOperation => ({
      kind: "create_edge",
      edge: routeEdge,
      audit: createGraphPatchAudit(
        `research-route-edge-audit-${sanitizeId(round.id)}-${index + 1}`,
        `Record reviewed ${routeEdge.kind} relation for the Research technical route`,
        input.createdAt
      )
    }))
  ];
  const sequence = nextRequestSequence(snapshot);
  const request: AgentRequest = {
    id: `agent-request-${sequence}`,
    action: "route",
    selectionId: snapshot.selection.id,
    prompt: `基于已接受结论 ${round.result.conclusionNodeId} 形成技术路线子图。`,
    status: "proposed",
    createdAt: input.createdAt
  };
  const patch: CandidateGraphPatch = {
    id: `graph-patch-${sequence}`,
    requestId: request.id,
    action: "route",
    targetNodeId: round.result.conclusionNodeId,
    focusNodeId: decision.id,
    title: `审核技术路线「${goal.title}」`,
    summary: `审核 ${constraints.length} 个约束、${criteria.length} 个标准、${options.length} 个候选、1 个决策和 ${steps.length} 个执行步骤。`,
    revision: 1,
    createdBy: "agent",
    operations,
    confidence: decision.confidence!,
    status: "pending_review",
    createdAt: input.createdAt
  };
  validateResearchRoutePatch(snapshot, patch, "pending");
  return {
    ...snapshot,
    agentRequests: snapshot.agentRequests.concat(request),
    candidatePatches: snapshot.candidatePatches.concat(patch)
  };
}

export function prepareResearchRouteAcceptance(
  snapshot: KnowledgeWorkspaceSnapshot,
  patch: CandidateGraphPatch
): void {
  if (patch.action !== "route") return;
  validateResearchRoutePatch(snapshot, patch, "pending");
}

export function validateAcceptedResearchRoutePatches(snapshot: KnowledgeWorkspaceSnapshot): string[] {
  const errors: string[] = [];
  for (const patch of snapshot.candidatePatches.filter((candidate) =>
    candidate.action === "route" && candidate.status === "accepted")) {
    try {
      validateResearchRoutePatch(snapshot, patch, "accepted");
    } catch (error) {
      errors.push(`route Patch ${patch.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return errors;
}

export function assertAcceptedResearchRoutePatches(snapshot: KnowledgeWorkspaceSnapshot): void {
  const errors = validateAcceptedResearchRoutePatches(snapshot);
  if (errors.length > 0) throw new Error(`Research route validation failed: ${errors.join("; ")}`);
}

function validateResearchRoutePatch(
  snapshot: KnowledgeWorkspaceSnapshot,
  patch: CandidateGraphPatch,
  mode: "pending" | "accepted"
): void {
  if (patch.action !== "route") throw new Error("Research route Patch must use the route action");
  if (patch.createdBy !== "agent" || patch.status !== (mode === "pending" ? "pending_review" : "accepted")) {
    throw new Error(`Research route Patch has invalid ${mode} governance state`);
  }
  if (mode === "accepted" && (patch.reviewedBy !== "user" || !patch.reviewedAt)) {
    throw new Error("Accepted Research route Patch must record user review");
  }
  if (patch.operations.some((operation) => operation.kind !== "create_node" && operation.kind !== "create_edge")) {
    throw new Error("Research route Patch may only create reviewed route nodes and edges");
  }
  const createdNodes = patch.operations
    .filter((operation): operation is Extract<GraphPatchOperation, { kind: "create_node" }> => operation.kind === "create_node")
    .map((operation) => operation.node);
  const createdEdges = patch.operations
    .filter((operation): operation is Extract<GraphPatchOperation, { kind: "create_edge" }> => operation.kind === "create_edge")
    .map((operation) => operation.edge);
  const byKind = (kind: KnowledgeNodeKind) => createdNodes.filter((node) => node.kind === kind);
  const goals = byKind("goal");
  const constraints = byKind("constraint");
  const criteria = byKind("criterion");
  const options = byKind("route_option");
  const decisions = byKind("decision");
  const steps = byKind("route_step");
  if (createdNodes.length !== 2 + constraints.length + criteria.length + options.length + steps.length
    || goals.length !== 1 || constraints.length === 0 || criteria.length === 0
    || options.length < 2 || decisions.length !== 1 || steps.length === 0) {
    throw new Error("Research route requires one goal, constraints, criteria, at least two options, one decision, and route steps");
  }
  const goal = goals[0];
  const decision = decisions[0];
  const roundIds = union(createdNodes.flatMap((node) => node.tags
    .filter((tag) => tag.startsWith("research:round:"))
    .map((tag) => tag.slice("research:round:".length))));
  if (roundIds.length !== 1) throw new Error("Research route nodes must declare one shared Research round");
  const round = requireRouteRound(snapshot, roundIds[0], mode === "pending");
  if (patch.targetNodeId !== round.result.conclusionNodeId || patch.focusNodeId !== decision.id
    || patch.confidence !== decision.confidence) {
    throw new Error("Research route Patch target, focus, or confidence has drifted");
  }
  const scope = goal.scope;
  for (const node of createdNodes) validateRouteNode(node, snapshot.project.id, scope);
  for (const option of options.concat(decision)) {
    if (option.status !== "verified" || option.epistemicStatus !== "supported") {
      throw new Error(`Research route ${option.kind} ${option.id} must be verified and supported`);
    }
  }
  const createdIds = createdNodes.map((node) => node.id);
  assertDistinct(createdIds, "Research route node ids");
  if (mode === "pending") {
    if (createdNodes.some((node) => snapshot.graph.nodes.some((existing) => existing.id === node.id))) {
      throw new Error("Pending Research route contains an existing node id");
    }
  } else {
    for (const node of createdNodes) {
      if (!snapshot.graph.nodes.some((candidate) => candidate.id === node.id && sameValue(candidate, node))) {
        throw new Error(`Accepted Research route node ${node.id} is missing or has drifted`);
      }
    }
    for (const routeEdge of createdEdges) {
      if (!snapshot.graph.edges.some((candidate) => candidate.id === routeEdge.id && sameValue(candidate, routeEdge))) {
        throw new Error(`Accepted Research route edge ${routeEdge.id} is missing or has drifted`);
      }
    }
  }

  const allowedNodeIds = new Set(createdIds);
  const structuralIds = constraints.concat(criteria, options).map((node) => node.id);
  const containsTargets: string[] = [];
  const constraintPairs: string[] = [];
  const criterionPairs: string[] = [];
  const optionSupportCounts = new Map(options.map((option) => [option.id, 0]));
  const goalPremises: string[] = [];
  const decisionPremises: string[] = [];
  const stepPremises: string[] = [];
  const precedingPairs: string[] = [];
  for (const routeEdge of createdEdges) {
    if (routeEdge.kind === "contains" && routeEdge.fromNodeId === goal.id) {
      containsTargets.push(routeEdge.toNodeId);
    } else if (routeEdge.kind === "constrains"
      && constraints.some((node) => node.id === routeEdge.fromNodeId)
      && options.some((node) => node.id === routeEdge.toNodeId)) {
      constraintPairs.push(`${routeEdge.fromNodeId}->${routeEdge.toNodeId}`);
    } else if (routeEdge.kind === "compares"
      && criteria.some((node) => node.id === routeEdge.fromNodeId)
      && options.some((node) => node.id === routeEdge.toNodeId)) {
      criterionPairs.push(`${routeEdge.fromNodeId}->${routeEdge.toNodeId}`);
    } else if ((routeEdge.kind === "supports" || routeEdge.kind === "contradicts")
      && options.some((node) => node.id === routeEdge.toNodeId)
      && !allowedNodeIds.has(routeEdge.fromNodeId)) {
      requireReliableEvidence(snapshot, routeEdge.fromNodeId);
      if (routeEdge.kind === "supports") {
        optionSupportCounts.set(routeEdge.toNodeId, optionSupportCounts.get(routeEdge.toNodeId)! + 1);
      }
    } else if (routeEdge.kind === "derived_from" && routeEdge.fromNodeId === goal.id) {
      goalPremises.push(routeEdge.toNodeId);
    } else if (routeEdge.kind === "derived_from" && routeEdge.fromNodeId === decision.id) {
      decisionPremises.push(routeEdge.toNodeId);
    } else if (routeEdge.kind === "derived_from" && steps.some((node) => node.id === routeEdge.fromNodeId)
      && routeEdge.toNodeId === decision.id) {
      stepPremises.push(routeEdge.fromNodeId);
    } else if (routeEdge.kind === "precedes"
      && steps.some((node) => node.id === routeEdge.fromNodeId)
      && steps.some((node) => node.id === routeEdge.toNodeId)) {
      precedingPairs.push(`${routeEdge.fromNodeId}->${routeEdge.toNodeId}`);
    } else {
      throw new Error(`Research route contains unsupported edge ${routeEdge.id}`);
    }
  }
  assertExactSet(containsTargets, structuralIds, "Research route goal contents");
  assertExactSet(
    constraintPairs,
    constraints.flatMap((constraint) => options.map((option) => `${constraint.id}->${option.id}`)),
    "Research route constraint coverage"
  );
  assertExactSet(
    criterionPairs,
    criteria.flatMap((criterion) => options.map((option) => `${criterion.id}->${option.id}`)),
    "Research route criterion coverage"
  );
  for (const [optionId, supportCount] of optionSupportCounts) {
    if (supportCount === 0) throw new Error(`Route option ${optionId} has no formal supporting Evidence`);
  }
  if (goalPremises.length !== 1 || goalPremises[0] !== round.result.conclusionNodeId) {
    throw new Error("Research route goal must derive from exactly one accepted conclusion");
  }
  if (decisionPremises.length !== 1 || !options.some((option) => option.id === decisionPremises[0])) {
    throw new Error("Research route decision must derive from exactly one selected option");
  }
  assertExactSet(stepPremises, steps.map((step) => step.id), "Research route decision steps");
  const orderedSteps = steps.slice().sort((left, right) => stepSequence(left) - stepSequence(right));
  orderedSteps.forEach((step, index) => {
    if (stepSequence(step) !== index + 1) throw new Error("Research route steps must use contiguous sequence numbers starting at 1");
  });
  assertExactSet(
    precedingPairs,
    orderedSteps.slice(0, -1).map((step, index) => `${step.id}->${orderedSteps[index + 1].id}`),
    "Research route step order"
  );
}

function routeNode(
  snapshot: KnowledgeWorkspaceSnapshot,
  kind: Extract<KnowledgeNodeKind, "goal" | "constraint" | "criterion" | "route_option" | "decision" | "route_step">,
  draft: ResearchRouteNodeDraft,
  depth: number,
  scope: KnowledgeScope,
  roundId: string,
  createdAt: string,
  verified = false
): KnowledgeNode {
  return {
    id: draft.id,
    kind,
    title: draft.title.trim(),
    summary: draft.summary.trim(),
    status: verified ? "verified" : "open",
    ...createKnowledgeMetadata({ kind, createdBy: "agent", creatorId: "research-route", scopeContextId: snapshot.project.id }),
    epistemicStatus: verified ? "supported" : "unverified",
    scope: cloneScope(scope),
    temporalValidity: { status: "current", observedAt: createdAt },
    confidence: draft.confidence,
    depth,
    tags: ["research:route", `research:round:${roundId}`, `research:role:${kind}`],
    sourceRefs: [],
    createdBy: "agent",
    creatorId: "research-route",
    createdAt,
    updatedAt: createdAt
  };
}

function validateRouteNode(node: KnowledgeNode, projectId: string, scope: KnowledgeScope): void {
  validateConfidence(node.confidence, `Research route node ${node.id}`);
  if (!node.tags.includes("research:route") || !node.scope.contextIds.includes(projectId)
    || !sameValue(node.scope, scope) || !node.scope.description.trim()) {
    throw new Error(`Research route node ${node.id} has invalid tags or Project scope`);
  }
}

function requireRouteRound(snapshot: KnowledgeWorkspaceSnapshot, roundId: string, requireActive: boolean) {
  const round = snapshot.researchOrchestration.rounds.find((candidate) =>
    candidate.id === roundId && candidate.projectId === snapshot.project.id);
  if (!round) throw new Error(`Research round is unavailable: ${roundId}`);
  if (requireActive && round.status !== "active") throw new Error(`Research round is not active: ${round.status}`);
  if (round.result?.kind !== "reliable_conclusion") {
    throw new Error(`Research route requires an accepted reliable conclusion in round ${round.id}`);
  }
  return round as typeof round & { result: Extract<NonNullable<typeof round.result>, { kind: "reliable_conclusion" }> };
}

function requireReliableEvidence(snapshot: KnowledgeWorkspaceSnapshot, evidenceId: string): KnowledgeNode {
  const evidence = snapshot.graph.nodes.find((node) => node.id === evidenceId && node.status !== "archived");
  if (!evidence || evidence.kind !== "evidence" || evidence.status !== "verified"
    || evidence.epistemicStatus !== "supported" || evidence.sourceStatus !== "verified"
    || !evidence.scope.contextIds.includes(snapshot.project.id)) {
    throw new Error(`Research route requires verified, sourced Project Evidence: ${evidenceId}`);
  }
  return evidence;
}

function edge(
  id: string,
  fromNodeId: string,
  toNodeId: string,
  kind: KnowledgeEdge["kind"],
  rationale: string,
  createdAt: string,
  confidence: number | undefined
): KnowledgeEdge {
  validateConfidence(confidence, `Research route edge ${id}`);
  return { id, fromNodeId, toNodeId, kind, rationale, createdBy: "agent", confidence: confidence!, createdAt };
}

function validateDraft(draft: ResearchRouteNodeDraft): void {
  assertText(draft.id, "route node id");
  assertText(draft.title, `${draft.id}.title`);
  assertText(draft.summary, `${draft.id}.summary`);
  validateConfidence(draft.confidence, draft.id);
}

function stepSequence(node: KnowledgeNode): number {
  const tag = node.tags.find((candidate) => candidate.startsWith("research:route-step:"));
  const sequence = Number(tag?.slice("research:route-step:".length));
  if (!Number.isInteger(sequence) || sequence < 1) throw new Error(`Route step ${node.id} has an invalid sequence tag`);
  return sequence;
}

function nextRequestSequence(snapshot: KnowledgeWorkspaceSnapshot): number {
  let sequence = snapshot.agentRequests.length + 1;
  const requestIds = new Set(snapshot.agentRequests.map((request) => request.id));
  const patchIds = new Set(snapshot.candidatePatches.map((patch) => patch.id));
  while (requestIds.has(`agent-request-${sequence}`) || patchIds.has(`graph-patch-${sequence}`)) sequence += 1;
  return sequence;
}

function assertExactSet(actual: string[], expected: string[], label: string): void {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  if (actualSet.size !== actual.length || expectedSet.size !== expected.length
    || actualSet.size !== expectedSet.size || actual.some((value) => !expectedSet.has(value))) {
    throw new Error(`${label} must exactly match the canonical route structure`);
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

function validateConfidence(value: number | undefined, label: string): void {
  if (value === undefined || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} confidence must be between 0 and 1`);
  }
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
