import type {
  AgentRequest,
  CandidateGraphPatch,
  GraphPatchOperation,
  KnowledgeEdge,
  KnowledgeNode,
  KnowledgeScope,
  KnowledgeWorkspaceSnapshot
} from "../types";
import { createGraphPatchAudit } from "./graphPatch";
import { createEvolutionEdge } from "./knowledgeEvolution";
import { createKnowledgeMetadata } from "./knowledgeMetadata";
import { assertAcceptedResearchRoutePatches, type ResearchRouteNodeDraft } from "./researchRoute";

export interface ResearchRouteAbandonmentDraft {
  optionId: string;
  explanation: ResearchRouteNodeDraft;
}

export interface ResearchRouteUncertaintyDraft extends ResearchRouteNodeDraft {
  affectedOptionIds: string[];
}

export interface ResearchRouteScenarioDraft {
  changedConstraint: ResearchRouteNodeDraft & { baseConstraintId: string };
  selectedOptionId: string;
  decision: ResearchRouteNodeDraft;
  selectionExplanation: ResearchRouteNodeDraft;
  abandonmentExplanations: ResearchRouteAbandonmentDraft[];
  uncertainties: ResearchRouteUncertaintyDraft[];
  scopeDescription: string;
}

export interface ProposeResearchRouteScenariosInput {
  routePatchId: string;
  scenarios: ResearchRouteScenarioDraft[];
  createdAt: string;
}

interface AcceptedRouteContext {
  patch: CandidateGraphPatch;
  decision: KnowledgeNode;
  constraints: KnowledgeNode[];
  options: KnowledgeNode[];
  roundId: string;
}

const routePatchTag = "research:route-patch:";
const scenarioTag = "research:scenario:";
const roleTag = "research:role:";
const baseConstraintTag = "research:base-constraint:";
const selectedOptionTag = "research:selected-option:";
const affectedOptionTag = "research:route-option:";

export function proposeResearchRouteScenarios(
  snapshot: KnowledgeWorkspaceSnapshot,
  input: ProposeResearchRouteScenariosInput
): KnowledgeWorkspaceSnapshot {
  if (snapshot.project.mode !== "research") throw new Error("Research route scenarios require a Research Project");
  assertTimestamp(input.createdAt, "createdAt");
  if (input.scenarios.length === 0) throw new Error("Research route scenarios require at least one constraint-change scenario");
  const route = requireAcceptedRoute(snapshot, input.routePatchId, true);
  if (snapshot.candidatePatches.some((patch) => patch.action === "route_scenario"
    && patch.status === "pending_review"
    && patch.operations.some((operation) => operation.kind === "create_node"
      && operation.node.tags.includes(`${routePatchTag}${route.patch.id}`)))) {
    throw new Error(`Research route ${route.patch.id} already has a pending scenario Patch`);
  }

  const optionIds = route.options.map((option) => option.id);
  const constraintIds = new Set(route.constraints.map((constraint) => constraint.id));
  const drafts = input.scenarios.flatMap((scenario) => [
    scenario.changedConstraint,
    scenario.decision,
    scenario.selectionExplanation,
    ...scenario.abandonmentExplanations.map((item) => item.explanation),
    ...scenario.uncertainties
  ]);
  drafts.forEach(validateDraft);
  assertDistinct(drafts.map((draft) => draft.id), "Research route scenario node ids");
  for (const draft of drafts) {
    if (snapshot.graph.nodes.some((node) => node.id === draft.id)) {
      throw new Error(`Research route scenario node already exists: ${draft.id}`);
    }
  }

  const scenarioIds = input.scenarios.map((scenario) => scenario.changedConstraint.id);
  assertDistinct(scenarioIds, "Research route scenario ids");
  for (const scenario of input.scenarios) {
    validateScenarioDraft(scenario, optionIds, constraintIds);
  }

  let edgeSequence = 0;
  const nextEdgeId = () => `research-route-scenario-edge-${sanitizeId(route.patch.id)}-${++edgeSequence}`;
  const nodes: KnowledgeNode[] = [];
  const edges: KnowledgeEdge[] = [];
  const scenarioDecisions: KnowledgeNode[] = [];
  for (const scenario of input.scenarios) {
    const scenarioId = scenario.changedConstraint.id;
    const projectScope: KnowledgeScope = {
      kind: "project",
      description: scenario.scopeDescription.trim(),
      contextIds: [snapshot.project.id]
    };
    const contextualScope: KnowledgeScope = {
      kind: "context_specific",
      description: scenario.scopeDescription.trim(),
      contextIds: [snapshot.project.id, scenarioId]
    };
    const commonTags = ["research:route-scenario", `${routePatchTag}${route.patch.id}`, `${scenarioTag}${scenarioId}`];
    const changedConstraint = scenarioNode(
      snapshot,
      "constraint",
      scenario.changedConstraint,
      route.decision.depth,
      projectScope,
      commonTags.concat(`${roleTag}scenario_constraint`, `${baseConstraintTag}${scenario.changedConstraint.baseConstraintId}`),
      input.createdAt
    );
    const decision = scenarioNode(
      snapshot,
      "decision",
      scenario.decision,
      changedConstraint.depth + 1,
      contextualScope,
      commonTags.concat(`${roleTag}scenario_decision`, `${selectedOptionTag}${scenario.selectedOptionId}`),
      input.createdAt,
      true
    );
    const selection = scenarioNode(
      snapshot,
      "synthesis",
      scenario.selectionExplanation,
      decision.depth + 1,
      contextualScope,
      commonTags.concat(`${roleTag}selection_explanation`, `${selectedOptionTag}${scenario.selectedOptionId}`),
      input.createdAt,
      true
    );
    const abandonments = scenario.abandonmentExplanations.map((item) => scenarioNode(
      snapshot,
      "synthesis",
      item.explanation,
      decision.depth + 1,
      contextualScope,
      commonTags.concat(`${roleTag}abandonment_explanation`, `${affectedOptionTag}${item.optionId}`),
      input.createdAt,
      true
    ));
    const uncertainties = scenario.uncertainties.map((item) => scenarioNode(
      snapshot,
      "uncertainty",
      item,
      decision.depth + 1,
      contextualScope,
      commonTags.concat(`${roleTag}scenario_uncertainty`, ...item.affectedOptionIds.map((id) => `${affectedOptionTag}${id}`)),
      input.createdAt
    ));
    nodes.push(changedConstraint, decision, selection, ...abandonments, ...uncertainties);
    scenarioDecisions.push(decision);

    edges.push(
      evolutionEdge(nextEdgeId(), "refines", changedConstraint.id, scenario.changedConstraint.baseConstraintId,
        `情景约束「${changedConstraint.title}」调整原约束。`, input.createdAt, changedConstraint.confidence),
      ...route.options.map((option) => relation(
        nextEdgeId(), changedConstraint.id, option.id, "constrains",
        `变化后的约束「${changedConstraint.title}」重新限制路线「${option.title}」。`, input.createdAt, changedConstraint.confidence
      )),
      evolutionEdge(nextEdgeId(), "derived_from", decision.id, scenario.selectedOptionId,
        `情景决策「${decision.title}」选择路线「${scenario.selectedOptionId}」。`, input.createdAt, decision.confidence),
      evolutionEdge(nextEdgeId(), "valid_in_context", decision.id, changedConstraint.id,
        `决策「${decision.title}」仅在约束情景「${changedConstraint.title}」中成立。`, input.createdAt, decision.confidence),
      evolutionEdge(nextEdgeId(), "derived_from", selection.id, scenario.selectedOptionId,
        `选择解释「${selection.title}」基于被选路线。`, input.createdAt, selection.confidence),
      evolutionEdge(nextEdgeId(), "derived_from", selection.id, changedConstraint.id,
        `选择解释「${selection.title}」基于变化后的约束。`, input.createdAt, selection.confidence),
      relation(nextEdgeId(), selection.id, decision.id, "explains",
        `解释情景决策「${decision.title}」为何成立。`, input.createdAt, selection.confidence),
      evolutionEdge(nextEdgeId(), "valid_in_context", selection.id, changedConstraint.id,
        `选择解释仅适用于约束情景「${changedConstraint.title}」。`, input.createdAt, selection.confidence)
    );
    scenario.abandonmentExplanations.forEach((item, index) => {
      const explanation = abandonments[index];
      edges.push(
        evolutionEdge(nextEdgeId(), "derived_from", explanation.id, item.optionId,
          `放弃解释「${explanation.title}」评估未选路线。`, input.createdAt, explanation.confidence),
        evolutionEdge(nextEdgeId(), "derived_from", explanation.id, changedConstraint.id,
          `放弃解释「${explanation.title}」基于变化后的约束。`, input.createdAt, explanation.confidence),
        relation(nextEdgeId(), explanation.id, item.optionId, "explains",
          `解释为何在当前情景放弃路线「${item.optionId}」。`, input.createdAt, explanation.confidence),
        evolutionEdge(nextEdgeId(), "valid_in_context", explanation.id, changedConstraint.id,
          `放弃解释仅适用于约束情景「${changedConstraint.title}」。`, input.createdAt, explanation.confidence)
      );
    });
    scenario.uncertainties.forEach((item, index) => {
      const uncertainty = uncertainties[index];
      edges.push(relation(
        nextEdgeId(), decision.id, uncertainty.id, "depends_on",
        `情景决策仍受不确定性「${uncertainty.title}」影响。`, input.createdAt, uncertainty.confidence
      ));
      item.affectedOptionIds.forEach((optionId) => edges.push(relation(
        nextEdgeId(), uncertainty.id, optionId, "related_to",
        `不确定性「${uncertainty.title}」影响路线「${optionId}」。`, input.createdAt, uncertainty.confidence
      )));
    });
  }

  const operations: GraphPatchOperation[] = [
    ...nodes.map((node, index): GraphPatchOperation => ({
      kind: "create_node",
      node,
      audit: createGraphPatchAudit(
        `research-route-scenario-node-audit-${sanitizeId(route.patch.id)}-${index + 1}`,
        `Create reviewed ${node.kind} node for a route constraint scenario`,
        input.createdAt
      )
    })),
    ...edges.map((edge, index): GraphPatchOperation => ({
      kind: "create_edge",
      edge,
      audit: createGraphPatchAudit(
        `research-route-scenario-edge-audit-${sanitizeId(route.patch.id)}-${index + 1}`,
        `Record reviewed ${edge.kind} relation for a route constraint scenario`,
        input.createdAt
      )
    }))
  ];
  const sequence = nextRequestSequence(snapshot);
  const request: AgentRequest = {
    id: `agent-request-${sequence}`,
    action: "route_scenario",
    selectionId: snapshot.selection.id,
    prompt: `针对已接受路线 ${route.patch.id} 推演 ${input.scenarios.length} 个约束变化情景。`,
    status: "proposed",
    createdAt: input.createdAt
  };
  const patch: CandidateGraphPatch = {
    id: `graph-patch-${sequence}`,
    requestId: request.id,
    action: "route_scenario",
    targetNodeId: route.decision.id,
    focusNodeId: scenarioDecisions[0].id,
    title: `审核 ${input.scenarios.length} 个技术路线约束情景`,
    summary: `逐项审核情景约束、条件化选择、全部放弃原因和剩余不确定性。`,
    revision: 1,
    createdBy: "agent",
    operations,
    confidence: scenarioDecisions[0].confidence!,
    status: "pending_review",
    createdAt: input.createdAt
  };
  validateResearchRouteScenarioPatch(snapshot, patch, "pending");
  return {
    ...snapshot,
    agentRequests: snapshot.agentRequests.concat(request),
    candidatePatches: snapshot.candidatePatches.concat(patch)
  };
}

export function prepareResearchRouteScenarioAcceptance(
  snapshot: KnowledgeWorkspaceSnapshot,
  patch: CandidateGraphPatch
): void {
  if (patch.action !== "route_scenario") return;
  validateResearchRouteScenarioPatch(snapshot, patch, "pending");
}

export function validateAcceptedResearchRouteScenarioPatches(snapshot: KnowledgeWorkspaceSnapshot): string[] {
  const errors: string[] = [];
  for (const patch of snapshot.candidatePatches.filter((candidate) =>
    candidate.action === "route_scenario" && candidate.status === "accepted")) {
    try {
      validateResearchRouteScenarioPatch(snapshot, patch, "accepted");
    } catch (error) {
      errors.push(`route scenario Patch ${patch.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return errors;
}

export function assertAcceptedResearchRouteScenarioPatches(snapshot: KnowledgeWorkspaceSnapshot): void {
  const errors = validateAcceptedResearchRouteScenarioPatches(snapshot);
  if (errors.length > 0) throw new Error(`Research route scenario validation failed: ${errors.join("; ")}`);
}

function validateResearchRouteScenarioPatch(
  snapshot: KnowledgeWorkspaceSnapshot,
  patch: CandidateGraphPatch,
  mode: "pending" | "accepted"
): void {
  if (patch.action !== "route_scenario") throw new Error("Research route scenario Patch must use the route_scenario action");
  if (patch.createdBy !== "agent" || patch.status !== (mode === "pending" ? "pending_review" : "accepted")) {
    throw new Error(`Research route scenario Patch has invalid ${mode} governance state`);
  }
  if (mode === "accepted" && (patch.reviewedBy !== "user" || !patch.reviewedAt)) {
    throw new Error("Accepted Research route scenario Patch must record user review");
  }
  if (patch.operations.some((operation) => operation.kind !== "create_node" && operation.kind !== "create_edge")) {
    throw new Error("Research route scenario Patch may only create reviewed nodes and edges");
  }
  const nodes = patch.operations
    .filter((operation): operation is Extract<GraphPatchOperation, { kind: "create_node" }> => operation.kind === "create_node")
    .map((operation) => operation.node);
  const edges = patch.operations
    .filter((operation): operation is Extract<GraphPatchOperation, { kind: "create_edge" }> => operation.kind === "create_edge")
    .map((operation) => operation.edge);
  if (nodes.length === 0) throw new Error("Research route scenario Patch must create scenario nodes");
  const routePatchIds = union(nodes.flatMap((node) => tagValues(node, routePatchTag)));
  if (routePatchIds.length !== 1) throw new Error("Research route scenario nodes must reference one accepted route Patch");
  if (nodes.some((node) => !sameValue(tagValues(node, routePatchTag), routePatchIds))) {
    throw new Error("Every Research route scenario node must reference exactly one shared accepted route Patch");
  }
  const route = requireAcceptedRoute(snapshot, routePatchIds[0], false);
  const scenarioIds = union(nodes.flatMap((node) => tagValues(node, scenarioTag)));
  if (scenarioIds.length === 0) throw new Error("Research route scenario Patch must declare scenarios");
  const groups = scenarioIds.map((id) => ({ id, nodes: nodes.filter((node) => node.tags.includes(`${scenarioTag}${id}`)) }));
  if (groups.some((group) => group.nodes.length === 0)
    || nodes.some((node) => tagValues(node, scenarioTag).length !== 1)) {
    throw new Error("Research route scenario nodes must belong to exactly one scenario");
  }
  const decisionByScenario = new Map<string, KnowledgeNode>();
  const expectedEdges: string[] = [];
  for (const group of groups) {
    const constraint = singleRole(group.nodes, "scenario_constraint", "constraint", group.id);
    const decision = singleRole(group.nodes, "scenario_decision", "decision", group.id);
    const selection = singleRole(group.nodes, "selection_explanation", "synthesis", group.id);
    const abandonments = roleNodes(group.nodes, "abandonment_explanation");
    const uncertainties = roleNodes(group.nodes, "scenario_uncertainty");
    if (uncertainties.length === 0) throw new Error(`Route scenario ${group.id} must preserve at least one uncertainty`);
    if (group.nodes.length !== 3 + abandonments.length + uncertainties.length) {
      throw new Error(`Route scenario ${group.id} contains unsupported node roles`);
    }
    if (constraint.id !== group.id) throw new Error(`Route scenario ${group.id} constraint id has drifted`);
    const baseConstraintIds = tagValues(constraint, baseConstraintTag);
    const selectedOptionIds = tagValues(decision, selectedOptionTag);
    if (baseConstraintIds.length !== 1 || !route.constraints.some((node) => node.id === baseConstraintIds[0])) {
      throw new Error(`Route scenario ${group.id} must refine exactly one route constraint`);
    }
    if (selectedOptionIds.length !== 1 || !route.options.some((node) => node.id === selectedOptionIds[0])) {
      throw new Error(`Route scenario ${group.id} must select exactly one route option`);
    }
    const selectedOptionId = selectedOptionIds[0];
    if (!selection.tags.includes(`${selectedOptionTag}${selectedOptionId}`)) {
      throw new Error(`Route scenario ${group.id} selection explanation has drifted`);
    }
    const abandonedOptionIds = abandonments.flatMap((node) => tagValues(node, affectedOptionTag));
    assertExactSet(
      abandonedOptionIds,
      route.options.map((option) => option.id).filter((id) => id !== selectedOptionId),
      `Route scenario ${group.id} abandoned options`
    );
    validateScenarioNodes(snapshot, group.nodes, constraint, mode);
    decisionByScenario.set(group.id, decision);
    expectedEdges.push(
      edgeKey("refines", constraint.id, baseConstraintIds[0]),
      ...route.options.map((option) => edgeKey("constrains", constraint.id, option.id)),
      edgeKey("derived_from", decision.id, selectedOptionId),
      edgeKey("valid_in_context", decision.id, constraint.id),
      edgeKey("derived_from", selection.id, selectedOptionId),
      edgeKey("derived_from", selection.id, constraint.id),
      edgeKey("explains", selection.id, decision.id),
      edgeKey("valid_in_context", selection.id, constraint.id)
    );
    abandonments.forEach((explanation) => {
      const optionId = tagValues(explanation, affectedOptionTag)[0];
      expectedEdges.push(
        edgeKey("derived_from", explanation.id, optionId),
        edgeKey("derived_from", explanation.id, constraint.id),
        edgeKey("explains", explanation.id, optionId),
        edgeKey("valid_in_context", explanation.id, constraint.id)
      );
    });
    uncertainties.forEach((uncertainty) => {
      const affected = tagValues(uncertainty, affectedOptionTag);
      if (affected.length === 0 || affected.some((id) => !route.options.some((option) => option.id === id))) {
        throw new Error(`Route scenario uncertainty ${uncertainty.id} must reference route options`);
      }
      assertDistinct(affected, `Route scenario uncertainty ${uncertainty.id} option ids`);
      expectedEdges.push(
        edgeKey("depends_on", decision.id, uncertainty.id),
        ...affected.map((optionId) => edgeKey("related_to", uncertainty.id, optionId))
      );
    });
  }
  const firstDecision = decisionByScenario.get(scenarioIds[0])!;
  if (patch.targetNodeId !== route.decision.id || patch.focusNodeId !== firstDecision.id
    || patch.confidence !== firstDecision.confidence) {
    throw new Error("Research route scenario Patch target, focus, or confidence has drifted");
  }
  assertDistinct(nodes.map((node) => node.id), "Research route scenario node ids");
  assertDistinct(edges.map((edge) => edge.id), "Research route scenario edge ids");
  for (const edge of edges) {
    if (!edge.rationale?.trim() || edge.createdBy !== "agent"
      || !Number.isFinite(edge.confidence) || edge.confidence < 0 || edge.confidence > 1) {
      throw new Error(`Research route scenario edge ${edge.id} has invalid governance metadata`);
    }
  }
  assertExactSet(edges.map((edge) => edgeKey(edge.kind, edge.fromNodeId, edge.toNodeId)), expectedEdges,
    "Research route scenario relations");
  if (mode === "pending") {
    if (nodes.some((node) => snapshot.graph.nodes.some((existing) => existing.id === node.id))) {
      throw new Error("Pending Research route scenario contains an existing node id");
    }
  } else {
    for (const node of nodes) {
      if (!snapshot.graph.nodes.some((candidate) => candidate.id === node.id && sameValue(candidate, node))) {
        throw new Error(`Accepted Research route scenario node ${node.id} is missing or has drifted`);
      }
    }
    for (const edge of edges) {
      if (!snapshot.graph.edges.some((candidate) => candidate.id === edge.id && sameValue(candidate, edge))) {
        throw new Error(`Accepted Research route scenario edge ${edge.id} is missing or has drifted`);
      }
    }
  }
}

function requireAcceptedRoute(
  snapshot: KnowledgeWorkspaceSnapshot,
  routePatchId: string,
  requireActiveRound: boolean
): AcceptedRouteContext {
  assertAcceptedResearchRoutePatches(snapshot);
  const patch = snapshot.candidatePatches.find((candidate) =>
    candidate.id === routePatchId && candidate.action === "route" && candidate.status === "accepted");
  if (!patch) throw new Error(`Accepted Research route Patch is unavailable: ${routePatchId}`);
  const nodes = patch.operations
    .filter((operation): operation is Extract<GraphPatchOperation, { kind: "create_node" }> => operation.kind === "create_node")
    .map((operation) => operation.node);
  const decisions = nodes.filter((node) => node.kind === "decision");
  const constraints = nodes.filter((node) => node.kind === "constraint");
  const options = nodes.filter((node) => node.kind === "route_option");
  const roundIds = union(nodes.flatMap((node) => tagValues(node, "research:round:")));
  if (decisions.length !== 1 || constraints.length === 0 || options.length < 2 || roundIds.length !== 1) {
    throw new Error(`Accepted Research route Patch ${routePatchId} has invalid structure`);
  }
  const round = snapshot.researchOrchestration.rounds.find((candidate) => candidate.id === roundIds[0]);
  if (!round || (requireActiveRound && round.status !== "active")) {
    throw new Error(`Research route scenario requires an active route round: ${roundIds[0]}`);
  }
  return { patch, decision: decisions[0], constraints, options, roundId: roundIds[0] };
}

function validateScenarioDraft(
  scenario: ResearchRouteScenarioDraft,
  optionIds: string[],
  constraintIds: Set<string>
): void {
  assertText(scenario.scopeDescription, `${scenario.changedConstraint.id}.scopeDescription`);
  if (!constraintIds.has(scenario.changedConstraint.baseConstraintId)) {
    throw new Error(`Route scenario base constraint is unavailable: ${scenario.changedConstraint.baseConstraintId}`);
  }
  if (!optionIds.includes(scenario.selectedOptionId)) {
    throw new Error(`Route scenario selected option is unavailable: ${scenario.selectedOptionId}`);
  }
  if (scenario.uncertainties.length === 0) {
    throw new Error(`Route scenario ${scenario.changedConstraint.id} requires at least one uncertainty`);
  }
  const abandonmentIds = scenario.abandonmentExplanations.map((item) => item.optionId);
  assertExactSet(
    abandonmentIds,
    optionIds.filter((id) => id !== scenario.selectedOptionId),
    `Route scenario ${scenario.changedConstraint.id} abandonment explanations`
  );
  for (const uncertainty of scenario.uncertainties) {
    if (uncertainty.affectedOptionIds.length === 0
      || uncertainty.affectedOptionIds.some((id) => !optionIds.includes(id))) {
      throw new Error(`Route scenario uncertainty ${uncertainty.id} must affect known route options`);
    }
    assertDistinct(uncertainty.affectedOptionIds, `Route scenario uncertainty ${uncertainty.id} option ids`);
  }
}

function validateScenarioNodes(
  snapshot: KnowledgeWorkspaceSnapshot,
  nodes: KnowledgeNode[],
  constraint: KnowledgeNode,
  mode: "pending" | "accepted"
): void {
  const expectedContextIds = [snapshot.project.id, constraint.id];
  for (const node of nodes) {
    validateConfidence(node.confidence, `Research route scenario node ${node.id}`);
    if (!node.tags.includes("research:route-scenario") || !node.tags.includes(`${scenarioTag}${constraint.id}`)) {
      throw new Error(`Research route scenario node ${node.id} has invalid tags`);
    }
    if (node === constraint) {
      if (node.status !== "open" || node.epistemicStatus !== "unverified" || node.scope.kind !== "project"
        || !sameValue(node.scope.contextIds, [snapshot.project.id])) {
        throw new Error(`Route scenario constraint ${node.id} has invalid epistemic state or scope`);
      }
    } else {
      if (node.scope.kind !== "context_specific" || !sameValue(node.scope.contextIds, expectedContextIds)) {
        throw new Error(`Route scenario node ${node.id} must use the scenario context scope`);
      }
      const role = tagValues(node, roleTag)[0];
      const verified = role === "scenario_decision" || role === "selection_explanation" || role === "abandonment_explanation";
      if (verified && (node.status !== "verified" || node.epistemicStatus !== "context_dependent")) {
        throw new Error(`Route scenario explanation ${node.id} must be verified and context dependent`);
      }
      if (!verified && (node.status !== "open" || node.epistemicStatus !== "unverified")) {
        throw new Error(`Route scenario uncertainty ${node.id} must remain open and unverified`);
      }
    }
    if (!node.scope.description.trim() || node.sourceRefs.length > 0) {
      throw new Error(`Research route scenario node ${node.id} has invalid scope or copied sources`);
    }
    if (mode === "accepted" && node.updatedAt !== node.createdAt) {
      throw new Error(`Accepted Research route scenario node ${node.id} has drifted timestamps`);
    }
  }
}

function scenarioNode(
  snapshot: KnowledgeWorkspaceSnapshot,
  kind: Extract<KnowledgeNode["kind"], "constraint" | "decision" | "synthesis" | "uncertainty">,
  draft: ResearchRouteNodeDraft,
  depth: number,
  scope: KnowledgeScope,
  tags: string[],
  createdAt: string,
  verified = false
): KnowledgeNode {
  return {
    id: draft.id,
    kind,
    title: draft.title.trim(),
    summary: draft.summary.trim(),
    status: verified ? "verified" : "open",
    ...createKnowledgeMetadata({ kind, createdBy: "agent", creatorId: "research-route-scenario", scopeContextId: snapshot.project.id }),
    epistemicStatus: verified ? "context_dependent" : "unverified",
    scope: cloneScope(scope),
    temporalValidity: { status: "current", observedAt: createdAt },
    confidence: draft.confidence,
    depth,
    tags,
    sourceRefs: [],
    createdBy: "agent",
    creatorId: "research-route-scenario",
    createdAt,
    updatedAt: createdAt
  };
}

function evolutionEdge(
  id: string,
  kind: "refines" | "valid_in_context" | "derived_from",
  fromNodeId: string,
  toNodeId: string,
  rationale: string,
  createdAt: string,
  confidence: number | undefined
): KnowledgeEdge {
  return createEvolutionEdge({ id, kind, fromNodeId, toNodeId, rationale, createdBy: "agent", createdAt, confidence });
}

function relation(
  id: string,
  fromNodeId: string,
  toNodeId: string,
  kind: Extract<KnowledgeEdge["kind"], "constrains" | "explains" | "depends_on" | "related_to">,
  rationale: string,
  createdAt: string,
  confidence: number | undefined
): KnowledgeEdge {
  validateConfidence(confidence, `Research route scenario edge ${id}`);
  return { id, fromNodeId, toNodeId, kind, rationale, createdBy: "agent", confidence: confidence!, createdAt };
}

function singleRole(
  nodes: KnowledgeNode[],
  role: string,
  kind: KnowledgeNode["kind"],
  scenarioId: string
): KnowledgeNode {
  const matches = roleNodes(nodes, role);
  if (matches.length !== 1 || matches[0].kind !== kind) {
    throw new Error(`Route scenario ${scenarioId} requires exactly one ${role} ${kind} node`);
  }
  return matches[0];
}

function roleNodes(nodes: KnowledgeNode[], role: string): KnowledgeNode[] {
  return nodes.filter((node) => node.tags.includes(`${roleTag}${role}`));
}

function tagValues(node: KnowledgeNode, prefix: string): string[] {
  return node.tags.filter((tag) => tag.startsWith(prefix)).map((tag) => tag.slice(prefix.length));
}

function edgeKey(kind: KnowledgeEdge["kind"], fromNodeId: string, toNodeId: string): string {
  return `${kind}:${fromNodeId}->${toNodeId}`;
}

function validateDraft(draft: ResearchRouteNodeDraft): void {
  assertText(draft.id, "route scenario node id");
  assertText(draft.title, `${draft.id}.title`);
  assertText(draft.summary, `${draft.id}.summary`);
  validateConfidence(draft.confidence, draft.id);
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
    throw new Error(`${label} must exactly match the canonical route scenario structure`);
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

function cloneScope(scope: KnowledgeScope): KnowledgeScope {
  return { ...scope, contextIds: scope.contextIds.slice() };
}

function union(values: string[]): string[] {
  return Array.from(new Set(values));
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sanitizeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "route";
}
