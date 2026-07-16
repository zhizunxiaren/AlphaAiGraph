import type {
  KnowledgeNode,
  KnowledgeWorkspaceSnapshot,
  ResearchInsufficientEvidenceResult,
  ResearchRoundBaseline,
  ResearchRoundOutcome,
  ResearchRoundOutputs,
  VerificationRecord
} from "../types";
import { assertResearchOrchestration } from "./researchOrchestration";

export type ResearchProgressKind =
  | "source"
  | "fact"
  | "claim"
  | "hypothesis"
  | "inference"
  | "evidence"
  | "conflict"
  | "gap"
  | "stage_judgment"
  | "verification";

export interface ResearchRoundProgress {
  roundId: string;
  outputs: ResearchRoundOutputs;
  kinds: ResearchProgressKind[];
  hasMeaningfulProgress: boolean;
}

export interface CompleteResearchRoundInput {
  roundId: string;
  completedAt: string;
  outcome?: ResearchRoundOutcome;
  nextQuestionNodeIds?: string[];
}

export function captureResearchRoundBaseline(
  snapshot: KnowledgeWorkspaceSnapshot,
  capturedAt: string
): ResearchRoundBaseline {
  assertTimestamp(capturedAt, "capturedAt");
  return {
    capturedAt,
    graphUpdatedAt: snapshot.graph.updatedAt,
    nodeIds: snapshot.graph.nodes.map((node) => node.id),
    edgeIds: snapshot.graph.edges.map((edge) => edge.id),
    sourceIds: snapshot.knowledgeSourceAssets.map((source) => source.id),
    verificationRecordIds: snapshot.researchOrchestration.verificationRecords.map((record) => record.id)
  };
}

/** Derives progress from canonical state; callers cannot self-report output ids. */
export function deriveResearchRoundProgress(
  snapshot: KnowledgeWorkspaceSnapshot,
  roundId: string
): ResearchRoundProgress {
  const round = snapshot.researchOrchestration.rounds.find((candidate) => candidate.id === roundId);
  if (!round) throw new Error(`Research round does not exist: ${roundId}`);
  const baselineNodeIds = new Set(round.baseline.nodeIds);
  const baselineEdgeIds = new Set(round.baseline.edgeIds);
  const baselineSourceIds = new Set(round.baseline.sourceIds);
  const baselineVerificationIds = new Set(round.baseline.verificationRecordIds);
  const nodes = snapshot.graph.nodes.filter((node) =>
    !baselineNodeIds.has(node.id)
    && node.status !== "archived"
    && belongsToProject(node, round.projectId)
  );
  const nodeIds = new Set(nodes.map((node) => node.id));
  const roundTasks = snapshot.researchOrchestration.tasks.filter((task) => task.roundId === round.id);
  const referencedSourceIds = new Set([
    ...roundTasks.flatMap((task) => task.outputSourceIds),
    ...snapshot.researchOrchestration.searchQueries
      .filter((query) => query.roundId === round.id)
      .flatMap((query) => query.resultSourceIds)
  ]);
  const sourceIds = snapshot.knowledgeSourceAssets
    .filter((source) => !baselineSourceIds.has(source.id) && referencedSourceIds.has(source.id))
    .map((source) => source.id);
  const conflicts = nodes.filter(isConflictNode);
  const conflictIds = new Set(conflicts.map((node) => node.id));
  const verificationRecordIds = snapshot.researchOrchestration.verificationRecords
    .filter((record) => record.roundId === round.id && !baselineVerificationIds.has(record.id))
    .map((record) => record.id);
  const outputs: ResearchRoundOutputs = {
    sourceIds,
    factNodeIds: idsOfKind(nodes, "fact"),
    claimNodeIds: idsOfKind(nodes, "claim"),
    hypothesisNodeIds: idsOfKind(nodes, "hypothesis"),
    inferenceNodeIds: idsOfKind(nodes, "inference"),
    evidenceNodeIds: idsOfKind(nodes, "evidence"),
    conflictNodeIds: conflicts.map((node) => node.id),
    gapNodeIds: nodes
      .filter((node) => (node.kind === "question" || node.kind === "uncertainty") && !conflictIds.has(node.id))
      .map((node) => node.id),
    synthesisNodeIds: nodes
      .filter((node) => node.kind === "synthesis" || node.kind === "conclusion")
      .map((node) => node.id),
    edgeIds: snapshot.graph.edges
      .filter((edge) => !baselineEdgeIds.has(edge.id) && (nodeIds.has(edge.fromNodeId) || nodeIds.has(edge.toNodeId)))
      .map((edge) => edge.id),
    verificationRecordIds
  };
  const kinds = progressKinds(outputs);
  return {
    roundId,
    outputs,
    kinds,
    hasMeaningfulProgress: kinds.length > 0
  };
}

export function completeResearchRound(
  snapshot: KnowledgeWorkspaceSnapshot,
  input: CompleteResearchRoundInput
): KnowledgeWorkspaceSnapshot {
  assertTimestamp(input.completedAt, "completedAt");
  const round = snapshot.researchOrchestration.rounds.find((candidate) => candidate.id === input.roundId);
  if (!round) throw new Error(`Research round does not exist: ${input.roundId}`);
  if (round.status !== "active") throw new Error(`Research round is not active: ${round.status}`);
  const unfinishedTasks = snapshot.researchOrchestration.tasks.filter((task) =>
    task.roundId === round.id && (task.status === "queued" || task.status === "in_progress")
  );
  if (unfinishedTasks.length > 0) {
    throw new Error(`Research round ${round.id} has unfinished tasks: ${unfinishedTasks.map((task) => task.id).join(", ")}`);
  }
  const progress = deriveResearchRoundProgress(snapshot, round.id);
  if (!progress.hasMeaningfulProgress) {
    throw new Error(
      `Research round ${round.id} cannot complete without a new source, fact, claim, hypothesis, evidence, conflict, gap, verification, or stage judgment`
    );
  }
  const nextQuestionNodeIds = input.nextQuestionNodeIds ?? progress.outputs.gapNodeIds;
  const outputVerifications = progress.outputs.verificationRecordIds.map((recordId) =>
    snapshot.researchOrchestration.verificationRecords.find((record) => record.id === recordId)!
  );
  const pendingVerificationIds = outputVerifications
    .filter((record) => record.status === "pending")
    .map((record) => record.id);
  if (pendingVerificationIds.length > 0) {
    throw new Error(`Research round ${round.id} has unresolved verification records: ${pendingVerificationIds.join(", ")}`);
  }
  const hasEvidenceBlockers = outputVerifications.some(isEvidenceBlocker);
  if (input.outcome === "insufficient_evidence" && !hasEvidenceBlockers) {
    throw new Error(`Research round ${round.id} cannot report insufficient evidence without a failed or inconclusive verification`);
  }
  if (input.outcome !== undefined && input.outcome !== "insufficient_evidence" && hasEvidenceBlockers) {
    throw new Error(`Research round ${round.id} must report insufficient evidence while verification blockers remain`);
  }
  const outcome: ResearchRoundOutcome = hasEvidenceBlockers
    ? "insufficient_evidence"
    : input.outcome ?? "advanced";
  const result = hasEvidenceBlockers
    ? deriveResearchInsufficientEvidenceResult(snapshot, round.id, input.completedAt, nextQuestionNodeIds)
    : undefined;
  const next: KnowledgeWorkspaceSnapshot = {
    ...snapshot,
    researchOrchestration: {
      ...snapshot.researchOrchestration,
      rounds: snapshot.researchOrchestration.rounds.map((candidate) => candidate.id === round.id
        ? {
            ...candidate,
            status: "completed" as const,
            outcome,
            result: result ?? (candidate.result?.kind === "reliable_conclusion" ? candidate.result : undefined),
            outputs: progress.outputs,
            nextQuestionNodeIds,
            completedAt: input.completedAt,
            updatedAt: input.completedAt
          }
        : candidate)
    }
  };
  assertResearchOrchestration(next);
  return next;
}

/** Builds an auditable negative result from canonical verification records. */
export function deriveResearchInsufficientEvidenceResult(
  snapshot: KnowledgeWorkspaceSnapshot,
  roundId: string,
  assessedAt: string,
  nextQuestionNodeIds: string[] = []
): ResearchInsufficientEvidenceResult {
  assertTimestamp(assessedAt, "assessedAt");
  const progress = deriveResearchRoundProgress(snapshot, roundId);
  const blockingRecords = progress.outputs.verificationRecordIds
    .map((recordId) => snapshot.researchOrchestration.verificationRecords.find((record) => record.id === recordId)!)
    .filter(isEvidenceBlocker);
  if (blockingRecords.length === 0) {
    throw new Error(`Research round ${roundId} has no failed or inconclusive verification to support an insufficient-evidence result`);
  }
  return buildInsufficientEvidenceResult(blockingRecords, progress.outputs.gapNodeIds, nextQuestionNodeIds, assessedAt);
}

function buildInsufficientEvidenceResult(
  blockingRecords: VerificationRecord[],
  gapNodeIds: string[],
  nextQuestionNodeIds: string[],
  assessedAt: string
): ResearchInsufficientEvidenceResult {
  return {
    kind: "insufficient_evidence",
    targetNodeIds: union(blockingRecords.map((record) => record.targetNodeId)),
    blockingVerificationRecordIds: blockingRecords.map((record) => record.id),
    failedCheckKinds: union(blockingRecords
      .filter((record) => record.status === "failed")
      .map((record) => record.checkKind)),
    inconclusiveCheckKinds: union(blockingRecords
      .filter((record) => record.status === "inconclusive")
      .map((record) => record.checkKind)),
    sourceIds: union(blockingRecords.flatMap((record) => record.sourceIds)),
    evidenceNodeIds: union(blockingRecords.flatMap((record) => record.evidenceNodeIds)),
    opposingEvidenceNodeIds: union(blockingRecords.flatMap((record) => record.opposingEvidenceNodeIds)),
    gapNodeIds: union(gapNodeIds.concat(nextQuestionNodeIds)),
    summary: "当前资料不足以支持可靠结论。",
    assessedBy: "system",
    assessedAt
  };
}

function isEvidenceBlocker(record: VerificationRecord): boolean {
  return record.status === "failed" || record.status === "inconclusive";
}

function union<T extends string>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function progressKinds(outputs: ResearchRoundOutputs): ResearchProgressKind[] {
  const kinds: ResearchProgressKind[] = [];
  if (outputs.sourceIds.length > 0) kinds.push("source");
  if (outputs.factNodeIds.length > 0) kinds.push("fact");
  if (outputs.claimNodeIds.length > 0) kinds.push("claim");
  if (outputs.hypothesisNodeIds.length > 0) kinds.push("hypothesis");
  if (outputs.inferenceNodeIds.length > 0) kinds.push("inference");
  if (outputs.evidenceNodeIds.length > 0) kinds.push("evidence");
  if (outputs.conflictNodeIds.length > 0) kinds.push("conflict");
  if (outputs.gapNodeIds.length > 0) kinds.push("gap");
  if (outputs.synthesisNodeIds.length > 0) kinds.push("stage_judgment");
  if (outputs.verificationRecordIds.length > 0) kinds.push("verification");
  return kinds;
}

function idsOfKind(nodes: KnowledgeNode[], kind: KnowledgeNode["kind"]): string[] {
  return nodes.filter((node) => node.kind === kind).map((node) => node.id);
}

function belongsToProject(node: KnowledgeNode, projectId: string): boolean {
  return node.scope.contextIds.includes(projectId);
}

function isConflictNode(node: KnowledgeNode): boolean {
  if (node.epistemicStatus === "contested" || node.epistemicStatus === "contradicted") return true;
  return node.tags.some((tag) => /(^|[:：_-])(conflict|research_conflict|研究冲突|冲突)([:：_-]|$)/i.test(tag));
}

function assertTimestamp(value: string, label: string): void {
  if (Number.isNaN(Date.parse(value))) throw new Error(`${label} must be a valid timestamp`);
}
