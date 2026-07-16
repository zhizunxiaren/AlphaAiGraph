import type {
  GraphPatchOperation,
  KnowledgeNode,
  KnowledgeNodeKind,
  KnowledgeWorkspaceSnapshot,
  ResearchReliableConclusionResult,
  ResearchRound,
  ResearchOrchestration,
  ResearchRoundOutputs,
  VerificationRecord
} from "../types";

export const emptyResearchOrchestration = (): ResearchOrchestration => ({
  briefs: [],
  plans: [],
  tasks: [],
  rounds: [],
  searchQueries: [],
  verificationRecords: []
});

export class ResearchOrchestrationError extends Error {
  constructor(readonly errors: string[]) {
    super(`[invalid_research_orchestration] ${errors.join("; ")}`);
    this.name = "ResearchOrchestrationError";
  }
}

/**
 * Enforces the V2 boundary: orchestration records may coordinate research,
 * but every knowledge or evidence output must resolve to the primary graph or
 * immutable source registry owned by the workspace.
 */
export function assertResearchOrchestration(workspace: KnowledgeWorkspaceSnapshot): void {
  const errors = validateResearchOrchestration(workspace);
  if (errors.length > 0) throw new ResearchOrchestrationError(errors);
}

export function validateResearchOrchestration(workspace: KnowledgeWorkspaceSnapshot): string[] {
  const errors: string[] = [];
  const orchestration = workspace.researchOrchestration;
  const projects = indexUnique(workspace.projects, "project", errors);
  const nodes = indexUnique(workspace.graph.nodes, "graph node", errors);
  const edges = indexUnique(workspace.graph.edges, "graph edge", errors);
  const sources = indexUnique(workspace.knowledgeSourceAssets, "knowledge source", errors);
  const briefs = indexUnique(orchestration.briefs, "research brief", errors);
  const plans = indexUnique(orchestration.plans, "research plan", errors);
  const tasks = indexUnique(orchestration.tasks, "research task", errors);
  const rounds = indexUnique(orchestration.rounds, "research round", errors);
  const queries = indexUnique(orchestration.searchQueries, "search query", errors);
  const verifications = indexUnique(orchestration.verificationRecords, "verification record", errors);
  void queries;

  for (const brief of orchestration.briefs) {
    assertResearchProject(brief.projectId, `brief ${brief.id}`, projects, errors);
    assertNodeKind(brief.primaryQuestionNodeId, ["question"], `brief ${brief.id} primary question`, nodes, errors);
    assertNodeRefs(brief.secondaryQuestionNodeIds, ["question"], `brief ${brief.id} secondary questions`, nodes, errors);
    assertRefs(brief.seedSourceIds, sources, `brief ${brief.id} seed sources`, errors);
    assertText(brief.objective, `brief ${brief.id} objective`, errors);
    assertText(brief.scope.description, `brief ${brief.id} scope description`, errors);
    if (brief.scope.time.from !== undefined) assertTimestamp(brief.scope.time.from, `brief ${brief.id} scope from`, errors);
    if (brief.scope.time.to !== undefined) assertTimestamp(brief.scope.time.to, `brief ${brief.id} scope to`, errors);
    if (brief.scope.time.asOf !== undefined) assertTimestamp(brief.scope.time.asOf, `brief ${brief.id} scope asOf`, errors);
    assertPositiveInteger(brief.revision, `brief ${brief.id} revision`, errors);
    assertTimestamp(brief.createdAt, `brief ${brief.id} createdAt`, errors);
    assertTimestamp(brief.updatedAt, `brief ${brief.id} updatedAt`, errors);
    assertDistinct(brief.secondaryQuestionNodeIds, `brief ${brief.id} secondary questions`, errors);
    assertDistinct(brief.seedSourceIds, `brief ${brief.id} seed sources`, errors);
  }

  for (const plan of orchestration.plans) {
    assertResearchProject(plan.projectId, `plan ${plan.id}`, projects, errors);
    const brief = briefs.get(plan.briefId);
    if (!brief) errors.push(`plan ${plan.id} references unknown brief ${plan.briefId}`);
    else if (brief.projectId !== plan.projectId) errors.push(`plan ${plan.id} and brief ${brief.id} belong to different projects`);
    assertText(plan.strategy, `plan ${plan.id} strategy`, errors);
    assertPositiveInteger(plan.revision, `plan ${plan.id} revision`, errors);
    if (plan.maxRounds !== undefined) assertPositiveInteger(plan.maxRounds, `plan ${plan.id} maxRounds`, errors);
    assertTimestamp(plan.createdAt, `plan ${plan.id} createdAt`, errors);
    assertTimestamp(plan.updatedAt, `plan ${plan.id} updatedAt`, errors);
    if (plan.status === "completed") assertTimestamp(plan.completedAt, `completed plan ${plan.id} completedAt`, errors);
    assertDistinct(plan.taskIds, `plan ${plan.id} task order`, errors);
    assertDistinct(plan.verificationRequirements, `plan ${plan.id} verification requirements`, errors);
  }

  for (const task of orchestration.tasks) {
    assertResearchProject(task.projectId, `task ${task.id}`, projects, errors);
    const plan = plans.get(task.planId);
    if (!plan) errors.push(`task ${task.id} references unknown plan ${task.planId}`);
    else {
      if (plan.projectId !== task.projectId) errors.push(`task ${task.id} and plan ${plan.id} belong to different projects`);
      if (!plan.taskIds.includes(task.id)) errors.push(`task ${task.id} is missing from plan ${plan.id} taskIds`);
    }
    if (task.roundId !== undefined) {
      const round = rounds.get(task.roundId);
      if (!round) errors.push(`task ${task.id} references unknown round ${task.roundId}`);
      else if (round.planId !== task.planId) errors.push(`task ${task.id} and round ${round.id} belong to different plans`);
    }
    assertText(task.title, `task ${task.id} title`, errors);
    assertText(task.objective, `task ${task.id} objective`, errors);
    assertRefs(task.inputNodeIds, nodes, `task ${task.id} input nodes`, errors);
    assertRefs(task.outputNodeIds, nodes, `task ${task.id} output nodes`, errors);
    assertRefs(task.inputSourceIds, sources, `task ${task.id} input sources`, errors);
    assertRefs(task.outputSourceIds, sources, `task ${task.id} output sources`, errors);
    assertRefs(task.dependsOnTaskIds, tasks, `task ${task.id} dependencies`, errors);
    if (task.dependsOnTaskIds.includes(task.id)) errors.push(`task ${task.id} cannot depend on itself`);
    for (const dependencyId of task.dependsOnTaskIds) {
      const dependency = tasks.get(dependencyId);
      if (dependency && dependency.planId !== task.planId) errors.push(`task ${task.id} dependency ${dependencyId} belongs to another plan`);
    }
    if (task.status === "blocked") assertText(task.blockedReason, `blocked task ${task.id} blockedReason`, errors);
    if (task.status === "completed") assertTimestamp(task.completedAt, `completed task ${task.id} completedAt`, errors);
    assertTimestamp(task.createdAt, `task ${task.id} createdAt`, errors);
    assertTimestamp(task.updatedAt, `task ${task.id} updatedAt`, errors);
  }

  const roundNumbers = new Set<string>();
  for (const round of orchestration.rounds) {
    assertResearchProject(round.projectId, `round ${round.id}`, projects, errors);
    const plan = plans.get(round.planId);
    if (!plan) errors.push(`round ${round.id} references unknown plan ${round.planId}`);
    else if (plan.projectId !== round.projectId) errors.push(`round ${round.id} and plan ${plan.id} belong to different projects`);
    assertPositiveInteger(round.roundNumber, `round ${round.id} roundNumber`, errors);
    const roundNumberKey = `${round.planId}:${round.roundNumber}`;
    if (roundNumbers.has(roundNumberKey)) errors.push(`plan ${round.planId} has duplicate round number ${round.roundNumber}`);
    roundNumbers.add(roundNumberKey);
    assertText(round.objective, `round ${round.id} objective`, errors);
    assertRefs(round.taskIds, tasks, `round ${round.id} tasks`, errors);
    for (const taskId of round.taskIds) {
      const task = tasks.get(taskId);
      if (task && task.roundId !== round.id) errors.push(`round ${round.id} task ${taskId} does not reference the round`);
    }
    validateRoundBaseline(round.id, round.baseline, nodes, edges, sources, verifications, errors);
    validateRoundOutputs(round.id, round.outputs, nodes, edges, sources, verifications, errors);
    validateRoundOutputDelta(round.id, round.outputs, round.baseline, errors);
    for (const nodeId of roundOutputNodeIds(round.outputs)) {
      const node = nodes.get(nodeId);
      if (node && !node.scope.contextIds.includes(round.projectId)) {
        errors.push(`round ${round.id} output node ${nodeId} belongs to another project scope`);
      }
    }
    for (const verificationId of round.outputs.verificationRecordIds) {
      const verification = verifications.get(verificationId);
      if (verification && verification.roundId !== round.id) {
        errors.push(`round ${round.id} output verification ${verificationId} belongs to another round`);
      }
    }
    const reportedSourceIds = new Set([
      ...orchestration.tasks.filter((task) => task.roundId === round.id).flatMap((task) => task.outputSourceIds),
      ...orchestration.searchQueries.filter((query) => query.roundId === round.id).flatMap((query) => query.resultSourceIds)
    ]);
    for (const sourceId of round.outputs.sourceIds) {
      if (!reportedSourceIds.has(sourceId)) errors.push(`round ${round.id} output source ${sourceId} was not produced by a round task or query`);
    }
    assertNodeRefs(round.nextQuestionNodeIds, ["question", "uncertainty"], `round ${round.id} next questions`, nodes, errors);
    validateRoundResult(round, workspace, nodes, sources, verifications, errors);
    if (round.status === "active") assertTimestamp(round.startedAt, `active round ${round.id} startedAt`, errors);
    if (round.status === "completed") {
      assertTimestamp(round.startedAt, `completed round ${round.id} startedAt`, errors);
      assertTimestamp(round.completedAt, `completed round ${round.id} completedAt`, errors);
      if (!round.outcome) errors.push(`completed round ${round.id} requires an outcome`);
      if (meaningfulRoundOutputCount(round.outputs) === 0) errors.push(`completed round ${round.id} must advance research state; graph edges alone are not progress`);
      const pendingVerificationIds = round.outputs.verificationRecordIds.filter((recordId) =>
        verifications.get(recordId)?.status === "pending");
      if (pendingVerificationIds.length > 0) {
        errors.push(`completed round ${round.id} has unresolved verification records: ${pendingVerificationIds.join(", ")}`);
      }
      const unfinishedTaskIds = round.taskIds.filter((taskId) => {
        const task = tasks.get(taskId);
        return task?.status === "queued" || task?.status === "in_progress";
      });
      if (unfinishedTaskIds.length > 0) errors.push(`completed round ${round.id} has unfinished tasks: ${unfinishedTaskIds.join(", ")}`);
    }
    assertTimestamp(round.createdAt, `round ${round.id} createdAt`, errors);
    assertTimestamp(round.updatedAt, `round ${round.id} updatedAt`, errors);
  }

  for (const query of orchestration.searchQueries) {
    assertResearchProject(query.projectId, `query ${query.id}`, projects, errors);
    const plan = plans.get(query.planId);
    const task = tasks.get(query.taskId);
    const round = rounds.get(query.roundId);
    if (!plan) errors.push(`query ${query.id} references unknown plan ${query.planId}`);
    if (!task) errors.push(`query ${query.id} references unknown task ${query.taskId}`);
    if (!round) errors.push(`query ${query.id} references unknown round ${query.roundId}`);
    if (plan && plan.projectId !== query.projectId) errors.push(`query ${query.id} and plan ${plan.id} belong to different projects`);
    if (task && (task.planId !== query.planId || task.roundId !== query.roundId)) errors.push(`query ${query.id} task is outside its plan or round`);
    if (round && (round.planId !== query.planId || round.projectId !== query.projectId)) errors.push(`query ${query.id} round is outside its plan or project`);
    assertText(query.query, `query ${query.id} text`, errors);
    assertDistinct(query.filters.domains, `query ${query.id} domains`, errors);
    assertDistinct(query.filters.languages, `query ${query.id} languages`, errors);
    assertDistinct(query.filters.sourceKinds, `query ${query.id} source kinds`, errors);
    if (query.filters.publishedFrom !== undefined) assertTimestamp(query.filters.publishedFrom, `query ${query.id} publishedFrom`, errors);
    if (query.filters.publishedTo !== undefined) assertTimestamp(query.filters.publishedTo, `query ${query.id} publishedTo`, errors);
    assertRefs(query.resultSourceIds, sources, `query ${query.id} result sources`, errors);
    assertRefs(query.deduplicatedSourceIds, sources, `query ${query.id} deduplicated sources`, errors);
    if (query.status === "running" || query.status === "completed" || query.status === "failed") {
      assertTimestamp(query.executedAt, `${query.status} query ${query.id} executedAt`, errors);
    }
    if (query.status === "completed" || query.status === "failed") assertTimestamp(query.completedAt, `${query.status} query ${query.id} completedAt`, errors);
    if (query.status === "failed") assertText(query.error, `failed query ${query.id} error`, errors);
    assertTimestamp(query.createdAt, `query ${query.id} createdAt`, errors);
    assertTimestamp(query.updatedAt, `query ${query.id} updatedAt`, errors);
  }

  for (const verification of orchestration.verificationRecords) {
    assertResearchProject(verification.projectId, `verification ${verification.id}`, projects, errors);
    const plan = plans.get(verification.planId);
    const round = rounds.get(verification.roundId);
    if (!plan) errors.push(`verification ${verification.id} references unknown plan ${verification.planId}`);
    if (!round) errors.push(`verification ${verification.id} references unknown round ${verification.roundId}`);
    if (plan && plan.projectId !== verification.projectId) errors.push(`verification ${verification.id} and plan ${plan.id} belong to different projects`);
    if (round && (round.planId !== verification.planId || round.projectId !== verification.projectId)) errors.push(`verification ${verification.id} round is outside its plan or project`);
    if (verification.taskId !== undefined) {
      const task = tasks.get(verification.taskId);
      if (!task) errors.push(`verification ${verification.id} references unknown task ${verification.taskId}`);
      else if (task.planId !== verification.planId || task.roundId !== verification.roundId) errors.push(`verification ${verification.id} task is outside its plan or round`);
    }
    assertRefs([verification.targetNodeId], nodes, `verification ${verification.id} target`, errors);
    assertRefs(verification.sourceIds, sources, `verification ${verification.id} sources`, errors);
    assertNodeRefs(verification.evidenceNodeIds, ["evidence"], `verification ${verification.id} evidence`, nodes, errors);
    assertNodeRefs(verification.opposingEvidenceNodeIds, ["evidence"], `verification ${verification.id} opposing evidence`, nodes, errors);
    assertNodeRefs(
      verification.alternativeExplanationNodeIds,
      ["claim", "hypothesis", "inference", "uncertainty"],
      `verification ${verification.id} alternative explanations`,
      nodes,
      errors
    );
    for (const evidenceNodeId of verification.evidenceNodeIds) {
      if (!workspace.graph.edges.some((edge) => edge.kind === "supports"
        && edge.fromNodeId === evidenceNodeId && edge.toNodeId === verification.targetNodeId)) {
        errors.push(`verification ${verification.id} evidence ${evidenceNodeId} does not formally support its target`);
      }
    }
    for (const evidenceNodeId of verification.opposingEvidenceNodeIds) {
      if (!workspace.graph.edges.some((edge) => edge.kind === "contradicts"
        && edge.fromNodeId === evidenceNodeId && edge.toNodeId === verification.targetNodeId)) {
        errors.push(`verification ${verification.id} opposing evidence ${evidenceNodeId} does not formally contradict its target`);
      }
    }
    const matrixCheckKinds = new Set([
      "geography_consistency",
      "unit_consistency",
      "methodology_consistency",
      "conflict_of_interest"
    ]);
    const evidenceIds = new Set(verification.evidenceNodeIds.concat(verification.opposingEvidenceNodeIds));
    const profileIds = new Set<string>();
    for (const profile of verification.evidenceProfiles) {
      if (profileIds.has(profile.evidenceNodeId)) errors.push(`verification ${verification.id} has duplicate evidence profile ${profile.evidenceNodeId}`);
      profileIds.add(profile.evidenceNodeId);
      if (!evidenceIds.has(profile.evidenceNodeId)) errors.push(`verification ${verification.id} profile ${profile.evidenceNodeId} is outside its evidence set`);
      assertDistinct(profile.geographies, `verification ${verification.id} profile ${profile.evidenceNodeId} geographies`, errors);
      if (profile.unit !== undefined) assertText(profile.unit, `verification ${verification.id} profile ${profile.evidenceNodeId} unit`, errors);
      if (profile.methodology !== undefined) assertText(profile.methodology, `verification ${verification.id} profile ${profile.evidenceNodeId} methodology`, errors);
      if (!new Set(["none_declared", "declared", "unknown"]).has(profile.conflictOfInterestStatus)) {
        errors.push(`verification ${verification.id} profile ${profile.evidenceNodeId} has invalid conflict-of-interest status`);
      }
      if (profile.conflictOfInterestStatus === "declared") {
        assertText(
          profile.conflictOfInterestDisclosure,
          `verification ${verification.id} profile ${profile.evidenceNodeId} conflict disclosure`,
          errors
        );
      }
    }
    if (matrixCheckKinds.has(verification.checkKind)) {
      for (const evidenceNodeId of evidenceIds) {
        if (!profileIds.has(evidenceNodeId)) errors.push(`verification ${verification.id} is missing profile for evidence ${evidenceNodeId}`);
      }
    }
    if (verification.checkKind === "support_and_opposition" && verification.status === "passed"
      && (verification.evidenceNodeIds.length === 0 || verification.opposingEvidenceNodeIds.length === 0)) {
      errors.push(`verification ${verification.id} cannot pass without both supporting and opposing evidence`);
    }
    if (verification.checkKind === "alternative_explanation" && verification.status === "passed"
      && verification.alternativeExplanationNodeIds.length === 0) {
      errors.push(`verification ${verification.id} cannot pass without an alternative explanation node`);
    }
    if (verification.status !== "pending") {
      assertText(verification.finding, `resolved verification ${verification.id} finding`, errors);
      assertTimestamp(verification.checkedAt, `resolved verification ${verification.id} checkedAt`, errors);
    }
    assertTimestamp(verification.createdAt, `verification ${verification.id} createdAt`, errors);
  }

  return errors;
}

function validateRoundResult(
  round: ResearchRound,
  workspace: KnowledgeWorkspaceSnapshot,
  nodes: Map<string, KnowledgeNode>,
  sources: Map<string, { id: string }>,
  verifications: Map<string, VerificationRecord>,
  errors: string[]
): void {
  const expectedBlockers = round.outputs.verificationRecordIds
    .map((recordId) => verifications.get(recordId))
    .filter((record): record is VerificationRecord => record?.status === "failed" || record?.status === "inconclusive");
  if (round.outcome === "insufficient_evidence" && round.result === undefined) {
    errors.push(`round ${round.id} insufficient-evidence outcome requires an auditable result`);
    return;
  }
  if (round.result === undefined) {
    if (round.status === "completed" && expectedBlockers.length > 0) {
      errors.push(`completed round ${round.id} must report insufficient evidence while verification blockers remain`);
    }
    return;
  }
  const result = round.result;
  if (result.kind === "reliable_conclusion") {
    validateReliableConclusionResult(round, result, workspace, nodes, verifications, errors);
    return;
  }
  if (round.outcome !== "insufficient_evidence") {
    errors.push(`round ${round.id} has an insufficient-evidence result but outcome is ${String(round.outcome)}`);
  }
  if (result.assessedBy !== "system") errors.push(`round ${round.id} insufficient-evidence result must be assessed by system`);
  assertText(result.summary, `round ${round.id} insufficient-evidence summary`, errors);
  assertTimestamp(result.assessedAt, `round ${round.id} insufficient-evidence assessedAt`, errors);
  assertDistinct(result.targetNodeIds, `round ${round.id} insufficient-evidence targets`, errors);
  assertDistinct(result.blockingVerificationRecordIds, `round ${round.id} blocking verifications`, errors);
  assertDistinct(result.failedCheckKinds, `round ${round.id} failed checks`, errors);
  assertDistinct(result.inconclusiveCheckKinds, `round ${round.id} inconclusive checks`, errors);
  assertDistinct(result.sourceIds, `round ${round.id} insufficient-evidence sources`, errors);
  assertDistinct(result.evidenceNodeIds, `round ${round.id} insufficient-evidence evidence`, errors);
  assertDistinct(result.opposingEvidenceNodeIds, `round ${round.id} insufficient-evidence opposing evidence`, errors);
  assertDistinct(result.gapNodeIds, `round ${round.id} insufficient-evidence gaps`, errors);
  assertRefs(result.targetNodeIds, nodes, `round ${round.id} insufficient-evidence targets`, errors);
  for (const targetNodeId of result.targetNodeIds) {
    const target = nodes.get(targetNodeId);
    if (target && !target.scope.contextIds.includes(round.projectId)) {
      errors.push(`round ${round.id} insufficient-evidence target ${targetNodeId} belongs to another project scope`);
    }
  }
  assertRefs(result.sourceIds, sources, `round ${round.id} insufficient-evidence sources`, errors);
  assertNodeRefs(result.evidenceNodeIds, ["evidence"], `round ${round.id} insufficient-evidence evidence`, nodes, errors);
  assertNodeRefs(result.opposingEvidenceNodeIds, ["evidence"], `round ${round.id} insufficient-evidence opposing evidence`, nodes, errors);
  assertNodeRefs(result.gapNodeIds, ["question", "uncertainty"], `round ${round.id} insufficient-evidence gaps`, nodes, errors);

  if (expectedBlockers.length === 0) {
    errors.push(`round ${round.id} insufficient-evidence result requires a failed or inconclusive verification`);
  }
  assertExactSet(
    result.blockingVerificationRecordIds,
    expectedBlockers.map((record) => record.id),
    `round ${round.id} blocking verifications`,
    errors
  );
  for (const recordId of result.blockingVerificationRecordIds) {
    const record = verifications.get(recordId);
    if (!record) continue;
    if (record.roundId !== round.id) errors.push(`round ${round.id} blocking verification ${recordId} belongs to another round`);
    if (record.status !== "failed" && record.status !== "inconclusive") {
      errors.push(`round ${round.id} blocking verification ${recordId} is not failed or inconclusive`);
    }
  }
  assertExactSet(result.targetNodeIds, union(expectedBlockers.map((record) => record.targetNodeId)), `round ${round.id} insufficient-evidence targets`, errors);
  assertExactSet(result.failedCheckKinds, union(expectedBlockers.filter((record) => record.status === "failed").map((record) => record.checkKind)), `round ${round.id} failed checks`, errors);
  assertExactSet(result.inconclusiveCheckKinds, union(expectedBlockers.filter((record) => record.status === "inconclusive").map((record) => record.checkKind)), `round ${round.id} inconclusive checks`, errors);
  assertExactSet(result.sourceIds, union(expectedBlockers.flatMap((record) => record.sourceIds)), `round ${round.id} insufficient-evidence sources`, errors);
  assertExactSet(result.evidenceNodeIds, union(expectedBlockers.flatMap((record) => record.evidenceNodeIds)), `round ${round.id} insufficient-evidence evidence`, errors);
  assertExactSet(result.opposingEvidenceNodeIds, union(expectedBlockers.flatMap((record) => record.opposingEvidenceNodeIds)), `round ${round.id} insufficient-evidence opposing evidence`, errors);
  assertExactSet(
    result.gapNodeIds,
    union(round.outputs.gapNodeIds.concat(round.nextQuestionNodeIds)),
    `round ${round.id} insufficient-evidence gaps`,
    errors
  );
}

function validateReliableConclusionResult(
  round: ResearchRound,
  result: ResearchReliableConclusionResult,
  workspace: KnowledgeWorkspaceSnapshot,
  nodes: Map<string, KnowledgeNode>,
  verifications: Map<string, VerificationRecord>,
  errors: string[]
): void {
  if (round.outcome === "insufficient_evidence") {
    errors.push(`round ${round.id} cannot combine a reliable conclusion with an insufficient-evidence outcome`);
  }
  assertTimestamp(result.acceptedAt, `round ${round.id} reliable conclusion acceptedAt`, errors);
  if (!Number.isFinite(result.confidence) || result.confidence < 0 || result.confidence > 1) {
    errors.push(`round ${round.id} reliable conclusion confidence must be between 0 and 1`);
  }
  if (!result.scope.description.trim() || !result.scope.contextIds.includes(round.projectId)) {
    errors.push(`round ${round.id} reliable conclusion must record its Project scope`);
  }
  assertDistinct(result.verificationRecordIds, `round ${round.id} conclusion verifications`, errors);
  assertDistinct(result.factNodeIds, `round ${round.id} conclusion facts`, errors);
  assertDistinct(result.inferenceNodeIds, `round ${round.id} conclusion inferences`, errors);
  assertDistinct(result.unresolvedQuestionNodeIds, `round ${round.id} conclusion unresolved questions`, errors);
  assertRefs([result.verificationTargetNodeId], nodes, `round ${round.id} conclusion verification target`, errors);
  assertNodeRefs(result.factNodeIds, ["fact"], `round ${round.id} conclusion facts`, nodes, errors);
  assertNodeRefs(result.inferenceNodeIds, ["inference"], `round ${round.id} conclusion inferences`, nodes, errors);
  assertNodeRefs([result.synthesisNodeId], ["synthesis"], `round ${round.id} conclusion synthesis`, nodes, errors);
  assertNodeRefs([result.conclusionNodeId], ["conclusion"], `round ${round.id} conclusion node`, nodes, errors);
  assertNodeRefs(
    result.unresolvedQuestionNodeIds,
    ["question", "uncertainty"],
    `round ${round.id} conclusion unresolved questions`,
    nodes,
    errors
  );
  const chainNodes = result.inferenceNodeIds.concat(result.synthesisNodeId, result.conclusionNodeId)
    .map((nodeId) => nodes.get(nodeId))
    .filter((node): node is KnowledgeNode => node !== undefined);
  for (const node of chainNodes) {
    if (node.status !== "verified" || node.epistemicStatus !== "supported") {
      errors.push(`round ${round.id} conclusion chain node ${node.id} must remain verified and supported`);
    }
    if (!Number.isFinite(node.confidence) || node.confidence! < 0 || node.confidence! > 1) {
      errors.push(`round ${round.id} conclusion chain node ${node.id} requires confidence between 0 and 1`);
    }
    if (!sameValue(node.scope, result.scope)) {
      errors.push(`round ${round.id} conclusion chain node ${node.id} scope differs from the recorded conclusion scope`);
    }
    if (!node.scope.contextIds.includes(round.projectId)) {
      errors.push(`round ${round.id} conclusion chain node ${node.id} belongs to another Project scope`);
    }
  }
  const conclusion = nodes.get(result.conclusionNodeId);
  if (conclusion && conclusion.confidence !== result.confidence) {
    errors.push(`round ${round.id} conclusion confidence differs from its canonical node`);
  }
  for (const factNodeId of result.factNodeIds) {
    const fact = nodes.get(factNodeId);
    if (fact && (fact.status !== "verified" || fact.epistemicStatus !== "supported"
      || fact.sourceStatus !== "verified" || !fact.scope.contextIds.includes(round.projectId))) {
      errors.push(`round ${round.id} conclusion Fact ${factNodeId} is not verified, sourced, and Project-scoped`);
    }
  }

  const patch = workspace.candidatePatches.find((candidate) => candidate.id === result.acceptedPatchId);
  if (!patch || patch.action !== "conclude" || patch.status !== "accepted") {
    errors.push(`round ${round.id} reliable conclusion references an unavailable accepted conclude Patch ${result.acceptedPatchId}`);
    return;
  }
  if (patch.targetNodeId !== result.verificationTargetNodeId || patch.focusNodeId !== result.conclusionNodeId) {
    errors.push(`round ${round.id} reliable conclusion Patch target or focus has drifted`);
  }
  if (patch.reviewedAt !== result.acceptedAt || patch.confidence !== result.confidence) {
    errors.push(`round ${round.id} reliable conclusion Patch review time or confidence has drifted`);
  }
  const patchNodes = patch.operations
    .filter((operation): operation is Extract<GraphPatchOperation, { kind: "create_node" }> => operation.kind === "create_node")
    .map((operation) => operation.node.id);
  assertExactSet(
    patchNodes,
    result.inferenceNodeIds.concat(result.synthesisNodeId, result.conclusionNodeId),
    `round ${round.id} reliable conclusion Patch nodes`,
    errors
  );
  const patchEdges = patch.operations
    .filter((operation): operation is Extract<GraphPatchOperation, { kind: "create_edge" }> => operation.kind === "create_edge")
    .map((operation) => operation.edge);
  for (const edge of patchEdges) {
    if (!workspace.graph.edges.some((candidate) => candidate.id === edge.id && sameValue(candidate, edge))) {
      errors.push(`round ${round.id} reliable conclusion edge ${edge.id} is missing or has drifted`);
    }
  }
  const inferencePremises = new Map(result.inferenceNodeIds.map((nodeId) => [nodeId, [] as string[]]));
  const synthesisPremises: string[] = [];
  const conclusionPremises: string[] = [];
  const unresolvedQuestionIds: string[] = [];
  for (const edge of patchEdges) {
    if (edge.kind === "derived_from" && inferencePremises.has(edge.fromNodeId)) {
      inferencePremises.get(edge.fromNodeId)!.push(edge.toNodeId);
    } else if (edge.kind === "derived_from" && edge.fromNodeId === result.synthesisNodeId) {
      synthesisPremises.push(edge.toNodeId);
    } else if (edge.kind === "derived_from" && edge.fromNodeId === result.conclusionNodeId) {
      conclusionPremises.push(edge.toNodeId);
    } else if (edge.kind === "depends_on" && edge.fromNodeId === result.conclusionNodeId) {
      unresolvedQuestionIds.push(edge.toNodeId);
    } else {
      errors.push(`round ${round.id} reliable conclusion Patch contains an unsupported edge ${edge.id}`);
    }
  }
  const usedFactIds: string[] = [];
  for (const [inferenceNodeId, factNodeIds] of inferencePremises) {
    if (factNodeIds.length === 0) errors.push(`round ${round.id} inference ${inferenceNodeId} has no Fact premise`);
    usedFactIds.push(...factNodeIds);
  }
  assertExactSet(usedFactIds, result.factNodeIds, `round ${round.id} conclusion Fact premises`, errors);
  assertExactSet(
    synthesisPremises,
    result.inferenceNodeIds.concat(result.verificationTargetNodeId),
    `round ${round.id} synthesis premises`,
    errors
  );
  assertExactSet(conclusionPremises, [result.synthesisNodeId], `round ${round.id} conclusion premises`, errors);
  assertExactSet(
    unresolvedQuestionIds,
    result.unresolvedQuestionNodeIds,
    `round ${round.id} conclusion unresolved questions`,
    errors
  );

  const targetVerifications = workspace.researchOrchestration.verificationRecords.filter((record) =>
    record.roundId === round.id
    && record.targetNodeId === result.verificationTargetNodeId
    && Date.parse(record.createdAt) <= Date.parse(result.acceptedAt));
  if (targetVerifications.length === 0) errors.push(`round ${round.id} reliable conclusion requires verification records`);
  if (targetVerifications.some((record) => record.status !== "passed" && record.status !== "not_applicable")) {
    errors.push(`round ${round.id} reliable conclusion has unresolved verification checks`);
  }
  assertExactSet(
    result.verificationRecordIds,
    targetVerifications.map((record) => record.id),
    `round ${round.id} conclusion verifications`,
    errors
  );
  for (const verificationId of result.verificationRecordIds) {
    if (!verifications.has(verificationId)) errors.push(`round ${round.id} conclusion references unknown verification ${verificationId}`);
  }
  if (round.status === "completed") {
    for (const inferenceNodeId of result.inferenceNodeIds) {
      if (!round.outputs.inferenceNodeIds.includes(inferenceNodeId)) errors.push(`completed round ${round.id} omits conclusion inference ${inferenceNodeId}`);
    }
    if (!round.outputs.synthesisNodeIds.includes(result.synthesisNodeId)
      || !round.outputs.synthesisNodeIds.includes(result.conclusionNodeId)) {
      errors.push(`completed round ${round.id} omits its accepted synthesis or conclusion output`);
    }
  }
}

function validateRoundOutputs(
  roundId: string,
  outputs: ResearchRoundOutputs,
  nodes: Map<string, KnowledgeNode>,
  edges: Map<string, { id: string }>,
  sources: Map<string, { id: string }>,
  verifications: Map<string, { id: string }>,
  errors: string[]
): void {
  assertRefs(outputs.sourceIds, sources, `round ${roundId} output sources`, errors);
  assertNodeRefs(outputs.factNodeIds, ["fact"], `round ${roundId} facts`, nodes, errors);
  assertNodeRefs(outputs.claimNodeIds, ["claim"], `round ${roundId} claims`, nodes, errors);
  assertNodeRefs(outputs.hypothesisNodeIds, ["hypothesis"], `round ${roundId} hypotheses`, nodes, errors);
  assertNodeRefs(outputs.inferenceNodeIds, ["inference"], `round ${roundId} inferences`, nodes, errors);
  assertNodeRefs(outputs.evidenceNodeIds, ["evidence"], `round ${roundId} evidence`, nodes, errors);
  assertNodeRefs(outputs.conflictNodeIds, ["claim", "hypothesis", "uncertainty"], `round ${roundId} conflicts`, nodes, errors);
  assertNodeRefs(outputs.gapNodeIds, ["question", "uncertainty"], `round ${roundId} gaps`, nodes, errors);
  assertNodeRefs(outputs.synthesisNodeIds, ["synthesis", "conclusion"], `round ${roundId} synthesis`, nodes, errors);
  assertRefs(outputs.edgeIds, edges, `round ${roundId} graph edges`, errors);
  assertRefs(outputs.verificationRecordIds, verifications, `round ${roundId} verification records`, errors);
}

function validateRoundBaseline(
  roundId: string,
  baseline: { capturedAt: string; graphUpdatedAt: string; nodeIds: string[]; edgeIds: string[]; sourceIds: string[]; verificationRecordIds: string[] },
  nodes: Map<string, KnowledgeNode>,
  edges: Map<string, { id: string }>,
  sources: Map<string, { id: string }>,
  verifications: Map<string, { id: string }>,
  errors: string[]
): void {
  assertTimestamp(baseline.capturedAt, `round ${roundId} baseline capturedAt`, errors);
  assertTimestamp(baseline.graphUpdatedAt, `round ${roundId} baseline graphUpdatedAt`, errors);
  assertRefs(baseline.nodeIds, nodes, `round ${roundId} baseline nodes`, errors);
  assertRefs(baseline.edgeIds, edges, `round ${roundId} baseline edges`, errors);
  assertRefs(baseline.sourceIds, sources, `round ${roundId} baseline sources`, errors);
  assertRefs(baseline.verificationRecordIds, verifications, `round ${roundId} baseline verifications`, errors);
}

function validateRoundOutputDelta(
  roundId: string,
  outputs: ResearchRoundOutputs,
  baseline: { nodeIds: string[]; edgeIds: string[]; sourceIds: string[]; verificationRecordIds: string[] },
  errors: string[]
): void {
  const baselineNodeIds = new Set(baseline.nodeIds);
  const baselineEdgeIds = new Set(baseline.edgeIds);
  const baselineSourceIds = new Set(baseline.sourceIds);
  const baselineVerificationIds = new Set(baseline.verificationRecordIds);
  for (const id of roundOutputNodeIds(outputs)) {
    if (baselineNodeIds.has(id)) errors.push(`round ${roundId} output node ${id} already existed at round start`);
  }
  for (const id of outputs.edgeIds) if (baselineEdgeIds.has(id)) errors.push(`round ${roundId} output edge ${id} already existed at round start`);
  for (const id of outputs.sourceIds) if (baselineSourceIds.has(id)) errors.push(`round ${roundId} output source ${id} already existed at round start`);
  for (const id of outputs.verificationRecordIds) {
    if (baselineVerificationIds.has(id)) errors.push(`round ${roundId} output verification ${id} already existed at round start`);
  }
}

function roundOutputNodeIds(outputs: ResearchRoundOutputs): string[] {
  return Array.from(new Set([
    ...outputs.factNodeIds,
    ...outputs.claimNodeIds,
    ...outputs.hypothesisNodeIds,
    ...outputs.inferenceNodeIds,
    ...outputs.evidenceNodeIds,
    ...outputs.conflictNodeIds,
    ...outputs.gapNodeIds,
    ...outputs.synthesisNodeIds
  ]));
}

function meaningfulRoundOutputCount(outputs: ResearchRoundOutputs): number {
  return new Set([
    ...outputs.sourceIds,
    ...roundOutputNodeIds(outputs),
    ...outputs.verificationRecordIds
  ]).size;
}

function assertExactSet<T extends string>(actual: T[], expected: T[], label: string, errors: string[]): void {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = expected.filter((value) => !actualSet.has(value));
  const unexpected = actual.filter((value) => !expectedSet.has(value));
  if (missing.length > 0 || unexpected.length > 0) {
    errors.push(`${label} does not match canonical state (missing: ${missing.join(", ") || "none"}; unexpected: ${unexpected.join(", ") || "none"})`);
  }
}

function union<T extends string>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function indexUnique<T extends { id: string }>(items: T[], label: string, errors: string[]): Map<string, T> {
  const index = new Map<string, T>();
  for (const item of items) {
    if (!item.id?.trim()) errors.push(`${label} has an empty id`);
    else if (index.has(item.id)) errors.push(`duplicate ${label} id ${item.id}`);
    else index.set(item.id, item);
  }
  return index;
}

function assertResearchProject(
  projectId: string,
  label: string,
  projects: Map<string, { id: string; mode: string }>,
  errors: string[]
): void {
  const project = projects.get(projectId);
  if (!project) errors.push(`${label} references unknown project ${projectId}`);
  else if (project.mode !== "research") errors.push(`${label} must belong to a research project`);
}

function assertNodeRefs(
  ids: string[],
  allowedKinds: KnowledgeNodeKind[],
  label: string,
  nodes: Map<string, KnowledgeNode>,
  errors: string[]
): void {
  assertRefs(ids, nodes, label, errors);
  for (const id of ids) assertNodeKind(id, allowedKinds, label, nodes, errors);
}

function assertNodeKind(
  id: string,
  allowedKinds: KnowledgeNodeKind[],
  label: string,
  nodes: Map<string, KnowledgeNode>,
  errors: string[]
): void {
  const node = nodes.get(id);
  if (node && !allowedKinds.includes(node.kind)) errors.push(`${label} node ${id} must be ${allowedKinds.join(" or ")}, got ${node.kind}`);
}

function assertRefs<T extends { id: string }>(ids: string[], index: Map<string, T>, label: string, errors: string[]): void {
  assertDistinct(ids, label, errors);
  for (const id of ids) if (!index.has(id)) errors.push(`${label} references unknown id ${id}`);
}

function assertDistinct(ids: string[], label: string, errors: string[]): void {
  if (new Set(ids).size !== ids.length) errors.push(`${label} must not contain duplicate ids`);
}

function assertText(value: string | undefined, label: string, errors: string[]): void {
  if (!value?.trim()) errors.push(`${label} must not be empty`);
}

function assertPositiveInteger(value: number, label: string, errors: string[]): void {
  if (!Number.isInteger(value) || value < 1) errors.push(`${label} must be a positive integer`);
}

function assertTimestamp(value: string | undefined, label: string, errors: string[]): void {
  if (!value || Number.isNaN(Date.parse(value))) errors.push(`${label} must be an ISO timestamp`);
}
