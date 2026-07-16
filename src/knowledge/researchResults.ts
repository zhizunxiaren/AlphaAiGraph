import type {
  CandidateGraphPatch,
  KnowledgeEdge,
  KnowledgeNode,
  KnowledgeSourceAsset,
  KnowledgeWorkspaceSnapshot,
  ResearchRound,
  VerificationRecord
} from "../types";
import { assertResearchOrchestration } from "./researchOrchestration";
import { assertAcceptedResearchRoutePatches } from "./researchRoute";
import { assertAcceptedResearchRouteScenarioPatches } from "./researchRouteScenario";

export interface ResearchRoundResultProjection {
  /** Canonical orchestration record; projection does not clone report content. */
  readonly round: ResearchRound;
  /** Canonical objects owned by the shared KnowledgeGraph. */
  readonly nodes: readonly KnowledgeNode[];
  readonly edges: readonly KnowledgeEdge[];
  readonly sources: readonly KnowledgeSourceAsset[];
  readonly verificationRecords: readonly VerificationRecord[];
  readonly acceptedPatches: readonly CandidateGraphPatch[];
}

export interface ResearchResultsProjection {
  readonly projectId: string;
  readonly graphId: string;
  readonly sourceGraphUpdatedAt: string;
  readonly rounds: readonly ResearchRoundResultProjection[];
}

const workspaceReportKeys = new Set([
  "researchReport",
  "researchReports",
  "researchReportStore",
  "researchResultDocument",
  "researchResultDocuments"
]);
const orchestrationReportKeys = new Set(["report", "reports", "researchReports", "resultDocument", "resultDocuments"]);
const roundReportKeys = new Set(["report", "reportId", "reportContent", "reportData", "reportDocument", "resultDocument"]);

/**
 * Builds an ephemeral read model from canonical Graph/Source/Research references.
 * The returned nodes, edges, sources, rounds, verifications, and patches are the
 * exact objects owned by the workspace; this projection is never persisted.
 */
export function projectResearchResults(
  snapshot: KnowledgeWorkspaceSnapshot,
  projectId = snapshot.project.id
): ResearchResultsProjection {
  assertNoIndependentResearchReportData(snapshot);
  assertResearchOrchestration(snapshot);
  assertAcceptedResearchRoutePatches(snapshot);
  assertAcceptedResearchRouteScenarioPatches(snapshot);
  const project = snapshot.projects.find((candidate) => candidate.id === projectId);
  if (!project || project.mode !== "research") throw new Error(`Research Project is unavailable: ${projectId}`);
  const rounds = snapshot.researchOrchestration.rounds
    .filter((round) => round.projectId === projectId)
    .slice()
    .sort((left, right) => left.roundNumber - right.roundNumber || compareText(left.id, right.id))
    .map((round) => projectRound(snapshot, round));
  return {
    projectId,
    graphId: snapshot.graph.id,
    sourceGraphUpdatedAt: snapshot.graph.updatedAt,
    rounds
  };
}

/** Rejects a second persisted Research report model at the workspace boundary. */
export function assertNoIndependentResearchReportData(snapshot: KnowledgeWorkspaceSnapshot): void {
  const violations: string[] = [];
  collectForbiddenKeys(snapshot as unknown as Record<string, unknown>, workspaceReportKeys, "workspace", violations);
  const orchestration = snapshot.researchOrchestration as unknown as Record<string, unknown>;
  collectForbiddenKeys(orchestration, orchestrationReportKeys, "researchOrchestration", violations);
  snapshot.researchOrchestration.rounds.forEach((round) => collectForbiddenKeys(
    round as unknown as Record<string, unknown>,
    roundReportKeys,
    `research round ${round.id}`,
    violations
  ));
  if (violations.length > 0) {
    throw new Error(`Independent Research report data is not allowed; derive it from KnowledgeGraph references: ${violations.join(", ")}`);
  }
}

function projectRound(snapshot: KnowledgeWorkspaceSnapshot, round: ResearchRound): ResearchRoundResultProjection {
  const nodeIds = new Set(roundOutputNodeIds(round));
  const edgeIds = new Set(round.outputs.edgeIds);
  const sourceIds = new Set(round.outputs.sourceIds);
  const verificationIds = new Set(round.outputs.verificationRecordIds);
  addResultReferences(round, nodeIds, sourceIds, verificationIds);

  const routePatches = snapshot.candidatePatches.filter((patch) =>
    patch.action === "route" && patch.status === "accepted" && patch.operations.some((operation) =>
      operation.kind === "create_node" && operation.node.tags.includes(`research:round:${round.id}`)));
  const routePatchIds = new Set(routePatches.map((patch) => patch.id));
  const scenarioPatches = snapshot.candidatePatches.filter((patch) =>
    patch.action === "route_scenario" && patch.status === "accepted" && patch.operations.some((operation) =>
      operation.kind === "create_node" && operation.node.tags.some((tag) =>
        tag.startsWith("research:route-patch:") && routePatchIds.has(tag.slice("research:route-patch:".length)))));
  const specializedPatchIds = new Set(routePatches.concat(scenarioPatches).map((patch) => patch.id));
  if (round.result?.kind === "reliable_conclusion") specializedPatchIds.add(round.result.acceptedPatchId);

  const acceptedPatches = snapshot.candidatePatches.filter((patch) => {
    if (patch.status !== "accepted") return false;
    if (specializedPatchIds.has(patch.id)) return true;
    return patch.operations.some((operation) => operation.kind === "create_node" && nodeIds.has(operation.node.id));
  });
  for (const patch of acceptedPatches) {
    for (const operation of patch.operations) {
      if (operation.kind === "create_node") nodeIds.add(operation.node.id);
      if (operation.kind === "create_edge") edgeIds.add(operation.edge.id);
    }
  }

  const referencedVerifications = snapshot.researchOrchestration.verificationRecords.filter((record) =>
    verificationIds.has(record.id));
  for (const record of referencedVerifications) {
    nodeIds.add(record.targetNodeId);
    record.evidenceNodeIds.forEach((id) => nodeIds.add(id));
    record.opposingEvidenceNodeIds.forEach((id) => nodeIds.add(id));
    record.alternativeExplanationNodeIds.forEach((id) => nodeIds.add(id));
    record.sourceIds.forEach((id) => sourceIds.add(id));
    const verificationNodeIds = new Set([
      record.targetNodeId,
      ...record.evidenceNodeIds,
      ...record.opposingEvidenceNodeIds,
      ...record.alternativeExplanationNodeIds
    ]);
    snapshot.graph.edges
      .filter((edge) => verificationNodeIds.has(edge.fromNodeId)
        && verificationNodeIds.has(edge.toNodeId)
        && ["supports", "contradicts", "related_to", "compares"].includes(edge.kind))
      .forEach((edge) => edgeIds.add(edge.id));
  }

  const edges = snapshot.graph.edges.filter((edge) => edgeIds.has(edge.id));
  for (const edge of edges) {
    nodeIds.add(edge.fromNodeId);
    nodeIds.add(edge.toNodeId);
  }
  const nodes = snapshot.graph.nodes.filter((node) => nodeIds.has(node.id));
  nodes.flatMap((node) => node.sourceRefs).forEach((ref) => sourceIds.add(ref.sourceId));
  return {
    round,
    nodes,
    edges,
    sources: snapshot.knowledgeSourceAssets.filter((source) => sourceIds.has(source.id)),
    verificationRecords: referencedVerifications,
    acceptedPatches
  };
}

function roundOutputNodeIds(round: ResearchRound): string[] {
  return [
    ...round.outputs.factNodeIds,
    ...round.outputs.claimNodeIds,
    ...round.outputs.hypothesisNodeIds,
    ...round.outputs.inferenceNodeIds,
    ...round.outputs.evidenceNodeIds,
    ...round.outputs.conflictNodeIds,
    ...round.outputs.gapNodeIds,
    ...round.outputs.synthesisNodeIds,
    ...round.nextQuestionNodeIds
  ];
}

function addResultReferences(
  round: ResearchRound,
  nodeIds: Set<string>,
  sourceIds: Set<string>,
  verificationIds: Set<string>
): void {
  const result = round.result;
  if (!result) return;
  if (result.kind === "reliable_conclusion") {
    [
      result.verificationTargetNodeId,
      ...result.factNodeIds,
      ...result.inferenceNodeIds,
      result.synthesisNodeId,
      result.conclusionNodeId,
      ...result.unresolvedQuestionNodeIds
    ].forEach((id) => nodeIds.add(id));
    result.verificationRecordIds.forEach((id) => verificationIds.add(id));
    return;
  }
  [
    ...result.targetNodeIds,
    ...result.evidenceNodeIds,
    ...result.opposingEvidenceNodeIds,
    ...result.gapNodeIds
  ].forEach((id) => nodeIds.add(id));
  result.sourceIds.forEach((id) => sourceIds.add(id));
  result.blockingVerificationRecordIds.forEach((id) => verificationIds.add(id));
}

function collectForbiddenKeys(
  record: Record<string, unknown>,
  forbidden: Set<string>,
  label: string,
  violations: string[]
): void {
  for (const key of Object.keys(record)) {
    if (forbidden.has(key)) violations.push(`${label}.${key}`);
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
