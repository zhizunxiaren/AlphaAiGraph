import type {
  AgentRequest,
  AgentJob,
  CandidateGraphPatch,
  CandidateResult,
  ExecutionRun,
  GraphPatchOperation,
  KnowledgeEdge,
  KnowledgeNode,
  KnowledgeNodeKind,
  KnowledgeRelationKind,
  KnowledgeSourceAsset,
  KnowledgeSourceRef,
  KnowledgeWorkspaceSnapshot,
  ResearchAgentRole,
  ResearchTask,
  ResearchTaskKind,
  ResearchWorkspaceSnapshot,
  SourceAnchor,
  SourceLocator
} from "../types";
import { createGraphPatchAudit } from "./graphPatch";
import { knowledgeNodesInScope } from "./knowledgeGraphQuery";
import { createKnowledgeMetadata } from "./knowledgeMetadata";
import { isProjectWritable } from "./projectLifecycle";
import { assertResearchOrchestration } from "./researchOrchestration";
import { formatSourceLocator } from "./sourceOutline";

export interface LegacyResearchMigrationBindings {
  nodeIds?: Readonly<Record<string, string>>;
  sourceIds?: Readonly<Record<string, string>>;
  planId?: string;
  roundId?: string;
}

export interface LegacyMigrationSkip {
  kind: "evidence" | "candidate" | "job";
  id: string;
  reason: string;
}

/** Sanitized command-run history. Raw commands, scripts and output never enter V2 persistence. */
export interface LegacyExecutionHistoryRecord {
  id: string;
  jobId?: string;
  status: ExecutionRun["status"];
  startedAt: string;
  finishedAt?: string;
  exitCode?: number;
  resultSummary: string;
  evidenceId?: string;
  rawPayloadOmitted: boolean;
}

export interface LegacyResearchMigrationResult {
  status: "unchanged" | "proposed";
  snapshot: KnowledgeWorkspaceSnapshot;
  evidenceNodeIds: string[];
  candidatePatchIds: string[];
  researchTaskIds: string[];
  executionHistory: LegacyExecutionHistoryRecord[];
  skipped: LegacyMigrationSkip[];
}

export class LegacyResearchMigrationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(`Legacy Research workspace migration failed: ${message}`, options);
    this.name = "LegacyResearchMigrationError";
  }
}

const legacyCollectionKeys = [
  "threads",
  "sourceAssets",
  "evidenceAnchors",
  "actions",
  "jobs",
  "parallelGroups",
  "executionRuns",
  "sideInquiries",
  "conceptNotes",
  "knowledgeDigests",
  "candidates"
] as const;

/** Parses only the V1 workspace envelope. It is intentionally separate from schema-v2 persistence migration. */
export function parseLegacyResearchWorkspace(serialized: string): ResearchWorkspaceSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new LegacyResearchMigrationError("input is not valid JSON", { cause: error });
  }
  const workspace = requireRecord(parsed, "legacy Research workspace");
  const object = requireRecord(workspace.object, "legacy Research workspace.object");
  requireString(object.id, "legacy Research workspace.object.id");
  requireRecord(workspace.session, "legacy Research workspace.session");
  const map = requireRecord(workspace.map, "legacy Research workspace.map");
  requireString(map.id, "legacy Research workspace.map.id");
  requireString(map.rootNodeId, "legacy Research workspace.map.rootNodeId");
  const nodes = requireRecordArray(map.nodes, "legacy Research workspace.map.nodes");
  const edges = requireRecordArray(map.edges, "legacy Research workspace.map.edges");
  for (const key of legacyCollectionKeys) requireRecordArray(workspace[key], `legacy Research workspace.${key}`);

  assertUniqueIds(nodes, "map node");
  assertUniqueIds(edges, "map edge");
  assertUniqueIds(requireRecordArray(workspace.sourceAssets, "sourceAssets"), "source asset");
  assertUniqueIds(requireRecordArray(workspace.evidenceAnchors, "evidenceAnchors"), "evidence anchor");
  assertUniqueIds(requireRecordArray(workspace.jobs, "jobs"), "job");
  assertUniqueIds(requireRecordArray(workspace.executionRuns, "executionRuns"), "execution run");
  const candidates = requireRecordArray(workspace.candidates, "candidates");
  assertUniqueIds(candidates, "candidate");
  const candidateNodes = candidates.map((candidate, index) => requireRecord(candidate.node, `candidates[${index}].node`));
  const candidateEdges = candidates.map((candidate, index) => requireRecord(candidate.edge, `candidates[${index}].edge`));
  assertUniqueIds(candidateNodes, "candidate node");
  assertUniqueIds(candidateEdges, "candidate edge");
  assertUniqueMigratedIds(nodes, "map node");
  assertUniqueMigratedIds(requireRecordArray(workspace.evidenceAnchors, "evidenceAnchors"), "evidence anchor");
  assertUniqueMigratedIds(requireRecordArray(workspace.jobs, "jobs"), "job");
  assertUniqueMigratedIds(candidates, "candidate");
  assertUniqueMigratedIds(candidateNodes, "candidate node");
  assertUniqueMigratedIds(candidateEdges, "candidate edge");

  for (const node of nodes) {
    requireString(node.id, "map node.id");
    requireString(node.title, `map node ${String(node.id)}.title`);
    requireString(node.summary, `map node ${String(node.id)}.summary`);
    requireEnum(node.kind, researchNodeKinds, `map node ${String(node.id)}.kind`);
    requireStringArray(node.evidenceIds, `map node ${String(node.id)}.evidenceIds`);
  }
  for (const source of requireRecordArray(workspace.sourceAssets, "sourceAssets")) {
    const id = requireString(source.id, "source asset.id");
    requireString(source.title, `source asset ${id}.title`);
    requireString(source.uri, `source asset ${id}.uri`);
    requireOptionalString(source.contentHash, `source asset ${id}.contentHash`);
  }
  for (const anchor of requireRecordArray(workspace.evidenceAnchors, "evidenceAnchors")) {
    const id = requireString(anchor.id, "evidence anchor.id");
    requireString(anchor.sourceAssetId, `evidence anchor ${id}.sourceAssetId`);
    requireString(anchor.uri, `evidence anchor ${id}.uri`);
    requireString(anchor.reason, `evidence anchor ${id}.reason`);
    requireOptionalString(anchor.title, `evidence anchor ${id}.title`);
    requireOptionalString(anchor.quote, `evidence anchor ${id}.quote`);
    requireOptionalString(anchor.text, `evidence anchor ${id}.text`);
    requireOptionalNumber(anchor.page, `evidence anchor ${id}.page`);
    requireOptionalNumber(anchor.lineStart, `evidence anchor ${id}.lineStart`);
    requireOptionalNumber(anchor.lineEnd, `evidence anchor ${id}.lineEnd`);
  }
  for (const candidate of candidates) {
    const id = requireString(candidate.id, "candidate.id");
    requireString(candidate.parentNodeId, `candidate ${id}.parentNodeId`);
    requireEnum(candidate.status, candidateStatuses, `candidate ${id}.status`);
    const node = requireRecord(candidate.node, `candidate ${id}.node`);
    requireString(node.id, `candidate ${id}.node.id`);
    requireString(node.title, `candidate ${id}.node.title`);
    requireString(node.summary, `candidate ${id}.node.summary`);
    requireEnum(node.kind, researchNodeKinds, `candidate ${id}.node.kind`);
    requireStringArray(node.evidenceIds, `candidate ${id}.node.evidenceIds`);
    const markers = requireRecordArray(node.markers, `candidate ${id}.node.markers`);
    markers.forEach((marker, index) => {
      requireString(marker.kind, `candidate ${id}.node.markers[${index}].kind`);
      requireString(marker.label, `candidate ${id}.node.markers[${index}].label`);
    });
    const edge = requireRecord(candidate.edge, `candidate ${id}.edge`);
    requireString(edge.id, `candidate ${id}.edge.id`);
    requireString(edge.fromNodeId, `candidate ${id}.edge.fromNodeId`);
    requireString(edge.toNodeId, `candidate ${id}.edge.toNodeId`);
    requireEnum(edge.kind, researchEdgeKinds, `candidate ${id}.edge.kind`);
    requireNumber(edge.confidence, `candidate ${id}.edge.confidence`);
  }
  for (const job of requireRecordArray(workspace.jobs, "jobs")) {
    const id = requireString(job.id, "job.id");
    requireString(job.title, `job ${id}.title`);
    requireString(job.createdAt, `job ${id}.createdAt`);
    requireOptionalString(job.finishedAt, `job ${id}.finishedAt`);
    requireEnum(job.kind, agentJobKinds, `job ${id}.kind`);
    requireEnum(job.status, agentJobStatuses, `job ${id}.status`);
    requireStringArray(job.nodeIds, `job ${id}.nodeIds`);
    requireStringArray(job.sourceAssetIds, `job ${id}.sourceAssetIds`);
    requireStringArray(job.dependsOnJobIds, `job ${id}.dependsOnJobIds`);
    requireStringArray(job.outputNodeIds, `job ${id}.outputNodeIds`);
    requireStringArray(job.outputEvidenceIds, `job ${id}.outputEvidenceIds`);
    requireStringArray(job.outputRunIds, `job ${id}.outputRunIds`);
    requireStringArray(job.outputDigestIds, `job ${id}.outputDigestIds`);
    requireOptionalString(job.errorMessage, `job ${id}.errorMessage`);
  }
  for (const run of requireRecordArray(workspace.executionRuns, "executionRuns")) {
    const id = requireString(run.id, "execution run.id");
    requireEnum(run.status, executionRunStatuses, `execution run ${id}.status`);
    requireString(run.startedAt, `execution run ${id}.startedAt`);
    requireString(run.resultSummary, `execution run ${id}.resultSummary`);
  }
  return workspace as unknown as ResearchWorkspaceSnapshot;
}

/**
 * Proposes a governed V1→V2 migration without modifying the canonical graph.
 * Sources must already exist as immutable V2 versions with an equal contentHash.
 */
export function proposeLegacyResearchMigration(
  snapshot: KnowledgeWorkspaceSnapshot,
  legacy: ResearchWorkspaceSnapshot,
  migratedAt: string,
  bindings: LegacyResearchMigrationBindings = {}
): LegacyResearchMigrationResult {
  if (!Number.isFinite(Date.parse(migratedAt))) {
    throw new LegacyResearchMigrationError("migratedAt must be an ISO timestamp");
  }
  if (!isProjectWritable(snapshot)) {
    throw new LegacyResearchMigrationError("the active Project must be writable");
  }

  const skipped: LegacyMigrationSkip[] = [];
  const scopedNodes = knowledgeNodesInScope(snapshot);
  const scopedNodeById = new Map(scopedNodes.map((node) => [node.id, node]));
  const legacyNodeById = new Map(legacy.map.nodes.map((node) => [node.id, node]));
  const legacySourceById = new Map(legacy.sourceAssets.map((source) => [source.id, source]));
  const nodeResolver = createNodeResolver(scopedNodes, legacyNodeById, bindings.nodeIds);
  const sourceResolver = createSourceResolver(snapshot.knowledgeSourceAssets, legacySourceById, bindings.sourceIds);
  const reservedNodeIds = new Set(snapshot.graph.nodes.map((node) => node.id));
  const reservedEdgeIds = new Set(snapshot.graph.edges.map((edge) => edge.id));
  for (const patch of snapshot.candidatePatches) {
    for (const operation of patch.operations) {
      if (operation.kind === "create_node") reservedNodeIds.add(operation.node.id);
      if (operation.kind === "create_edge") reservedEdgeIds.add(operation.edge.id);
    }
  }

  const relevantAnchorIds = new Set([
    ...legacy.map.nodes.flatMap((node) => node.evidenceIds),
    ...legacy.candidates.flatMap((candidate) => candidate.node.evidenceIds)
  ]);
  const existingAnchorById = new Map(snapshot.sourceAnchors.map((anchor) => [anchor.id, anchor]));
  const proposedAnchors = new Map<string, SourceAnchor>();
  const sourceRefByLegacyAnchorId = new Map<string, KnowledgeSourceRef>();

  for (const legacyAnchor of legacy.evidenceAnchors) {
    if (!relevantAnchorIds.has(legacyAnchor.id)) continue;
    const legacySource = legacySourceById.get(legacyAnchor.sourceAssetId);
    if (!legacySource) {
      skipped.push(skip("evidence", legacyAnchor.id, `references unknown legacy source ${legacyAnchor.sourceAssetId}`));
      continue;
    }
    const resolution = sourceResolver(legacySource.id);
    if (!resolution.source) {
      skipped.push(skip("evidence", legacyAnchor.id, resolution.reason));
      continue;
    }
    const locator = legacyLocator(legacyAnchor, resolution.source);
    if (!locator.locator) {
      skipped.push(skip("evidence", legacyAnchor.id, locator.reason));
      continue;
    }
    const anchorId = `legacy-anchor-${idPart(legacy.object.id)}-${idPart(legacyAnchor.id)}`;
    const anchor: SourceAnchor = {
      id: anchorId,
      sourceId: resolution.source.id,
      locator: locator.locator,
      quote: trimmed(legacyAnchor.quote),
      contentHash: resolution.source.contentHash
    };
    const existing = existingAnchorById.get(anchorId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(anchor)) {
      skipped.push(skip("evidence", legacyAnchor.id, `anchor identity ${anchorId} conflicts with existing immutable data`));
      continue;
    }
    if (!existing) proposedAnchors.set(anchorId, anchor);
    sourceRefByLegacyAnchorId.set(legacyAnchor.id, {
      sourceId: resolution.source.id,
      anchorId,
      locator: formatSourceLocator(anchor.locator),
      quote: anchor.quote
    });
  }

  const requests: AgentRequest[] = [];
  const patches: CandidateGraphPatch[] = [];
  const evidenceNodeIds: string[] = [];
  const evidenceOperations: GraphPatchOperation[] = [];

  for (const legacyAnchor of legacy.evidenceAnchors) {
    const sourceRef = sourceRefByLegacyAnchorId.get(legacyAnchor.id);
    if (!sourceRef) continue;
    const targets = unique(legacy.map.nodes
      .filter((node) => node.evidenceIds.includes(legacyAnchor.id))
      .map((node) => nodeResolver(node.id)?.id)
      .filter((id): id is string => Boolean(id)));
    if (targets.length === 0) continue;
    const nodeId = `legacy-evidence-${idPart(legacy.object.id)}-${idPart(legacyAnchor.id)}`;
    if (reservedNodeIds.has(nodeId)) continue;
    const summary = firstText(legacyAnchor.text, legacyAnchor.quote, legacyAnchor.reason);
    if (!summary) {
      skipped.push(skip("evidence", legacyAnchor.id, "has no quote, text, or reason to migrate"));
      continue;
    }
    const targetNodes = targets.map((id) => scopedNodeById.get(id)!).filter(Boolean);
    const evidenceNode = migratedNode({
      id: nodeId,
      kind: "evidence",
      title: firstText(legacyAnchor.title, `迁移证据 ${legacyAnchor.id}`)!,
      summary,
      depth: Math.min(...targetNodes.map((node) => node.depth)) + 1,
      sourceRefs: [sourceRef],
      sourceVerified: true,
      status: "verified",
      tags: ["legacy-research", "migrated-evidence"],
      projectId: snapshot.project.id,
      migratedAt
    });
    evidenceOperations.push({
      kind: "create_node",
      node: evidenceNode,
      audit: migrationAudit(`evidence-node-${nodeId}`, `Migrate source-backed legacy EvidenceAnchor ${legacyAnchor.id}`, migratedAt)
    });
    reservedNodeIds.add(nodeId);
    evidenceNodeIds.push(nodeId);
    for (const targetId of targets) {
      const edgeId = `legacy-support-${idPart(legacyAnchor.id)}-${idPart(targetId)}-${shortHash(targetId)}`;
      if (reservedEdgeIds.has(edgeId)) continue;
      evidenceOperations.push({
        kind: "create_edge",
        edge: migratedEdge(edgeId, nodeId, targetId, "supports", migratedAt, 1),
        audit: migrationAudit(`evidence-edge-${edgeId}`, `Attach migrated evidence ${nodeId} to canonical node ${targetId}`, migratedAt)
      });
      reservedEdgeIds.add(edgeId);
    }
  }

  if (evidenceOperations.length > 0) {
    const base = `${idPart(legacy.object.id)}-${idPart(legacy.map.id)}`;
    const requestId = `agent-request-legacy-evidence-${base}`;
    const patchId = `graph-patch-legacy-evidence-${base}`;
    if (!snapshot.candidatePatches.some((patch) => patch.id === patchId)
      && !snapshot.agentRequests.some((request) => request.id === requestId)) {
      requests.push({
        id: requestId,
        action: "source",
        selectionId: snapshot.selection.id,
        prompt: "将已与 V2 不可变来源逐 hash 对账的旧 EvidenceAnchor 迁入当前 KnowledgeGraph。",
        status: "proposed",
        createdAt: migratedAt
      });
      patches.push({
        id: patchId,
        requestId,
        action: "source",
        targetNodeId: evidenceOperations
          .find((operation): operation is Extract<GraphPatchOperation, { kind: "create_edge" }> => operation.kind === "create_edge")?.edge.toNodeId
          ?? snapshot.project.subject.rootNodeId,
        focusNodeId: evidenceNodeIds[0],
        title: "迁移旧 Research 证据",
        summary: `生成 ${evidenceNodeIds.length} 个可追溯 Evidence 候选节点；接受前不修改主图。`,
        revision: 1,
        createdBy: "system",
        operations: evidenceOperations,
        confidence: 1,
        status: "pending_review",
        createdAt: migratedAt
      });
    }
  }

  const candidatePatchIds: string[] = [];
  for (const candidate of legacy.candidates) {
    migrateCandidate(candidate);
  }

  function migrateCandidate(candidate: CandidateResult): void {
    if (candidate.status === "dismissed") {
      skipped.push(skip("candidate", candidate.id, "was dismissed in V1 and remains history-only"));
      return;
    }
    if (candidate.parentNodeId !== candidate.edge.fromNodeId || candidate.node.id !== candidate.edge.toNodeId) {
      skipped.push(skip("candidate", candidate.id, "candidate endpoint identity has drifted from parent/node"));
      return;
    }
    const target = nodeResolver(candidate.parentNodeId);
    if (!target) {
      skipped.push(skip("candidate", candidate.id, `cannot map parent node ${candidate.parentNodeId} into the active Project scope`));
      return;
    }
    if (!validConfidence(candidate.edge.confidence)) {
      skipped.push(skip("candidate", candidate.id, "has confidence outside 0..1"));
      return;
    }
    const refs = uniqueBy(candidate.node.evidenceIds
      .map((id) => sourceRefByLegacyAnchorId.get(id))
      .filter((ref): ref is KnowledgeSourceRef => Boolean(ref)), (ref) => `${ref.sourceId}:${ref.anchorId}`);
    if (refs.length !== candidate.node.evidenceIds.length) {
      skipped.push(skip("candidate", candidate.id, "cannot verify every declared legacy evidence reference by contentHash and SourceAnchor"));
      return;
    }
    const kind = migrateNodeKind(candidate.node.kind);
    if (!kind) {
      skipped.push(skip("candidate", candidate.id, `node kind ${candidate.node.kind} is history-only and has no canonical graph mapping`));
      return;
    }
    if ((kind === "fact" || kind === "evidence") && refs.length === 0) {
      skipped.push(skip("candidate", candidate.id, `${kind} requires a verified immutable SourceAnchor`));
      return;
    }
    const nodeId = `legacy-candidate-${idPart(legacy.object.id)}-${idPart(candidate.node.id)}`;
    const edgeId = `legacy-edge-${idPart(legacy.object.id)}-${idPart(candidate.edge.id)}`;
    const requestId = `agent-request-legacy-candidate-${idPart(candidate.id)}`;
    const patchId = `graph-patch-legacy-candidate-${idPart(candidate.id)}`;
    if (reservedNodeIds.has(nodeId)
      || snapshot.candidatePatches.some((patch) => patch.id === patchId)
      || snapshot.agentRequests.some((request) => request.id === requestId)) return;
    if (reservedEdgeIds.has(edgeId)) {
      skipped.push(skip("candidate", candidate.id, `edge identity ${edgeId} is already reserved`));
      return;
    }
    const sourceVerified = refs.length > 0;
    const node = migratedNode({
      id: nodeId,
      kind,
      title: candidate.node.title,
      summary: firstText(candidate.node.summary, candidate.node.detail) ?? candidate.node.title,
      depth: target.depth + 1,
      sourceRefs: refs,
      sourceVerified,
      status: (kind === "fact" || kind === "evidence") && sourceVerified ? "verified" : "open",
      tags: unique([
        "legacy-research",
        `legacy-kind:${candidate.node.kind}`,
        ...candidate.node.markers.flatMap((marker) => [marker.kind, marker.label]).map((value) => value.trim()).filter(Boolean)
      ]),
      projectId: snapshot.project.id,
      migratedAt
    });
    const relation = migrateEdgeKind(candidate.edge.kind);
    const [fromNodeId, toNodeId] = candidate.edge.kind === "produces"
      ? [node.id, target.id]
      : [target.id, node.id];
    const edge = migratedEdge(edgeId, fromNodeId, toNodeId, relation, migratedAt, candidate.edge.confidence);
    requests.push({
      id: requestId,
      action: "drill_down",
      selectionId: snapshot.selection.id,
      prompt: `重新审核旧 CandidateResult「${candidate.node.title}」；V1 状态 ${candidate.status} 不授予自动合并权限。`,
      status: "proposed",
      createdAt: migratedAt
    });
    patches.push({
      id: patchId,
      requestId,
      action: "drill_down",
      targetNodeId: target.id,
      focusNodeId: node.id,
      title: `迁移候选：${candidate.node.title}`,
      summary: "候选内容已转换为 V2 node/edge operation，仍需用户显式接受。",
      revision: 1,
      createdBy: "system",
      operations: [
        {
          kind: "create_node",
          node,
          audit: migrationAudit(`candidate-node-${nodeId}`, `Migrate legacy CandidateResult ${candidate.id} as pending review`, migratedAt)
        },
        {
          kind: "create_edge",
          edge,
          audit: migrationAudit(`candidate-edge-${edgeId}`, `Attach migrated candidate ${nodeId} to canonical target ${target.id}`, migratedAt)
        }
      ],
      confidence: candidate.edge.confidence,
      status: "pending_review",
      createdAt: migratedAt
    });
    reservedNodeIds.add(nodeId);
    reservedEdgeIds.add(edgeId);
    candidatePatchIds.push(patchId);
  }

  const taskMigration = migrateJobs(snapshot, legacy.jobs, migratedAt, bindings, nodeResolver, sourceResolver, skipped);
  const usedAnchorIds = new Set(patches.flatMap((patch) => patch.operations.flatMap((operation) =>
    operation.kind === "create_node" ? operation.node.sourceRefs.map((ref) => ref.anchorId).filter(Boolean) as string[] : [])));
  const anchors = Array.from(proposedAnchors.values()).filter((anchor) => usedAnchorIds.has(anchor.id));
  const usedSourceIds = new Set([
    ...anchors.map((anchor) => anchor.sourceId),
    ...taskMigration.tasks.flatMap((task) => task.inputSourceIds.concat(task.outputSourceIds))
  ]);
  const nextSourceIds = unique(snapshot.project.subject.sourceAssetIds.concat(Array.from(usedSourceIds)));
  const subjectChanged = nextSourceIds.length !== snapshot.project.subject.sourceAssetIds.length;
  const changed = requests.length > 0 || patches.length > 0 || anchors.length > 0 || taskMigration.tasks.length > 0 || subjectChanged;
  const executionHistory = legacy.executionRuns.map(sanitizeExecutionRun);

  if (!changed) {
    return {
      status: "unchanged",
      snapshot,
      evidenceNodeIds: [],
      candidatePatchIds: [],
      researchTaskIds: [],
      executionHistory,
      skipped
    };
  }

  const subject = subjectChanged
    ? { ...snapshot.project.subject, sourceAssetIds: nextSourceIds }
    : snapshot.project.subject;
  const project = subjectChanged
    ? { ...snapshot.project, subject, updatedAt: migratedAt }
    : snapshot.project;
  const next: KnowledgeWorkspaceSnapshot = {
    ...snapshot,
    project,
    projects: subjectChanged
      ? snapshot.projects.map((candidate) => candidate.id === project.id ? project : candidate)
      : snapshot.projects,
    subject,
    sourceAnchors: snapshot.sourceAnchors.concat(anchors),
    agentRequests: snapshot.agentRequests.concat(requests),
    candidatePatches: snapshot.candidatePatches.concat(patches),
    researchOrchestration: taskMigration.orchestration
  };
  assertResearchOrchestration(next);
  return {
    status: "proposed",
    snapshot: next,
    evidenceNodeIds,
    candidatePatchIds,
    researchTaskIds: taskMigration.tasks.map((task) => task.id),
    executionHistory,
    skipped
  };
}

function migrateJobs(
  snapshot: KnowledgeWorkspaceSnapshot,
  jobs: readonly AgentJob[],
  migratedAt: string,
  bindings: LegacyResearchMigrationBindings,
  resolveNode: (legacyNodeId: string) => KnowledgeNode | undefined,
  resolveSource: (legacySourceId: string) => SourceResolution,
  skipped: LegacyMigrationSkip[]
): { tasks: ResearchTask[]; orchestration: KnowledgeWorkspaceSnapshot["researchOrchestration"] } {
  const orchestration = snapshot.researchOrchestration;
  const round = bindings.roundId
    ? orchestration.rounds.find((candidate) => candidate.id === bindings.roundId)
    : orchestration.rounds.find((candidate) => candidate.projectId === snapshot.project.id && candidate.status === "active");
  const planId = bindings.planId ?? round?.planId;
  const plan = orchestration.plans.find((candidate) => candidate.id === planId);
  const supported = jobs.filter((job) => {
    if (job.kind === "generate_script" || job.kind === "run_command") {
      skipped.push(skip("job", job.id, `${job.kind} remains history-only; raw execution is not a ResearchTask or AgentRun`));
      return false;
    }
    return true;
  });
  if (supported.length === 0) return { tasks: [], orchestration };
  if (snapshot.project.mode !== "research" || !round || round.status !== "active" || !plan
    || plan.id !== round.planId || plan.projectId !== snapshot.project.id) {
    for (const job of supported) skipped.push(skip("job", job.id, "requires an active V2 Research Plan and Round"));
    return { tasks: [], orchestration };
  }

  const existingTaskIds = new Set(orchestration.tasks.map((task) => task.id));
  const candidateJobs = supported.filter((job) => !existingTaskIds.has(`legacy-task-${idPart(job.id)}`));
  const candidateTaskIds = new Set(candidateJobs.map((job) => `legacy-task-${idPart(job.id)}`));
  const tasks: ResearchTask[] = [];
  for (const job of candidateJobs) {
    const mapping = migrateJobKind(job.kind);
    if (!mapping) continue;
    if (!Number.isFinite(Date.parse(job.createdAt))) {
      skipped.push(skip("job", job.id, "has an invalid createdAt timestamp"));
      continue;
    }
    if (job.status === "completed" && !job.finishedAt) {
      skipped.push(skip("job", job.id, "completed job has no finishedAt audit timestamp"));
      continue;
    }
    const taskId = `legacy-task-${idPart(job.id)}`;
    const inputNodeIds = unique(job.nodeIds.map((id) => resolveNode(id)?.id).filter((id): id is string => Boolean(id)));
    const outputNodeIds = unique(job.outputNodeIds.map((id) => resolveNode(id)?.id).filter((id): id is string => Boolean(id)));
    const inputSourceIds = unique(job.sourceAssetIds
      .map((id) => resolveSource(id).source?.id)
      .filter((id): id is string => Boolean(id)));
    if (inputSourceIds.length !== job.sourceAssetIds.length) {
      skipped.push(skip("job", job.id, "cannot verify every declared input source by immutable contentHash"));
      continue;
    }
    if (inputNodeIds.length !== job.nodeIds.length || outputNodeIds.length !== job.outputNodeIds.length) {
      skipped.push(skip("job", job.id, "one or more legacy node refs were omitted because they do not map uniquely to the active Project"));
    }
    if (job.outputEvidenceIds.length > 0 || job.outputRunIds.length > 0 || job.outputDigestIds.length > 0) {
      skipped.push(skip("job", job.id, "legacy evidence/run/digest outputs stay in Patch or history projections instead of ResearchTask output IDs"));
    }
    const dependencies = job.dependsOnJobIds
      .map((id) => `legacy-task-${idPart(id)}`)
      .filter((id) => candidateTaskIds.has(id) || existingTaskIds.has(id));
    if (dependencies.length !== job.dependsOnJobIds.length) {
      skipped.push(skip("job", job.id, "one or more dependencies are not safely migratable ResearchTasks"));
    }
    const status = migrateJobStatus(job.status);
    tasks.push({
      id: taskId,
      projectId: snapshot.project.id,
      planId: plan.id,
      roundId: round.id,
      kind: mapping.kind,
      title: job.title.trim() || `Migrated legacy job ${job.id}`,
      objective: `迁移旧 AgentJob ${job.id}；只保留可审计的 node/source 引用。`,
      role: mapping.role,
      status,
      dependsOnTaskIds: unique(dependencies),
      inputNodeIds,
      inputSourceIds,
      outputNodeIds,
      outputSourceIds: [],
      createdAt: job.createdAt,
      updatedAt: job.finishedAt ?? migratedAt,
      completedAt: status === "completed" ? job.finishedAt : undefined,
      blockedReason: status === "blocked" ? job.errorMessage?.trim() || "Legacy job failed without an error message" : undefined
    });
  }
  if (tasks.length === 0) return { tasks, orchestration };
  const taskIds = tasks.map((task) => task.id);
  return {
    tasks,
    orchestration: {
      ...orchestration,
      plans: orchestration.plans.map((candidate) => candidate.id === plan.id
        ? { ...candidate, taskIds: candidate.taskIds.concat(taskIds), updatedAt: migratedAt }
        : candidate),
      tasks: orchestration.tasks.concat(tasks),
      rounds: orchestration.rounds.map((candidate) => candidate.id === round.id
        ? { ...candidate, taskIds: candidate.taskIds.concat(taskIds), updatedAt: migratedAt }
        : candidate)
    }
  };
}

function createNodeResolver(
  scopedNodes: readonly KnowledgeNode[],
  legacyNodeById: ReadonlyMap<string, ResearchWorkspaceSnapshot["map"]["nodes"][number]>,
  explicit: LegacyResearchMigrationBindings["nodeIds"]
): (legacyNodeId: string) => KnowledgeNode | undefined {
  const byId = new Map(scopedNodes.map((node) => [node.id, node]));
  const byTitle = new Map<string, KnowledgeNode[]>();
  for (const node of scopedNodes) {
    const key = normalizedTitle(node.title);
    byTitle.set(key, (byTitle.get(key) ?? []).concat(node));
  }
  return (legacyNodeId) => {
    const explicitId = explicit?.[legacyNodeId];
    if (explicitId) return byId.get(explicitId);
    const exact = byId.get(legacyNodeId);
    if (exact) return exact;
    const legacyNode = legacyNodeById.get(legacyNodeId);
    if (!legacyNode) return undefined;
    const matches = byTitle.get(normalizedTitle(legacyNode.title)) ?? [];
    return matches.length === 1 ? matches[0] : undefined;
  };
}

interface SourceResolution {
  source?: KnowledgeSourceAsset;
  reason: string;
}

function createSourceResolver(
  sources: readonly KnowledgeSourceAsset[],
  legacySourceById: ReadonlyMap<string, ResearchWorkspaceSnapshot["sourceAssets"][number]>,
  explicit: LegacyResearchMigrationBindings["sourceIds"]
): (legacySourceId: string) => SourceResolution {
  const byId = new Map(sources.map((source) => [source.id, source]));
  const byHash = new Map<string, KnowledgeSourceAsset[]>();
  for (const source of sources) byHash.set(source.contentHash, (byHash.get(source.contentHash) ?? []).concat(source));
  return (legacySourceId) => {
    const legacySource = legacySourceById.get(legacySourceId);
    if (!legacySource) return { reason: `unknown legacy source ${legacySourceId}` };
    if (!legacySource.contentHash?.trim()) {
      return { reason: `legacy source ${legacySourceId} has no contentHash and must be re-ingested` };
    }
    const explicitId = explicit?.[legacySourceId];
    const explicitSource = explicitId ? byId.get(explicitId) : undefined;
    if (explicitId && !explicitSource) return { reason: `explicit V2 source ${explicitId} does not exist` };
    if (explicitSource) return explicitSource.contentHash === legacySource.contentHash
      ? { source: explicitSource, reason: "" }
      : { reason: `contentHash mismatch between legacy source ${legacySourceId} and ${explicitSource.id}` };
    const exact = byId.get(legacySourceId);
    if (exact) return exact.contentHash === legacySource.contentHash
      ? { source: exact, reason: "" }
      : { reason: `contentHash mismatch for same-id source ${legacySourceId}` };
    const matches = byHash.get(legacySource.contentHash) ?? [];
    if (matches.length === 1) return { source: matches[0], reason: "" };
    if (matches.length > 1) return { reason: `contentHash ${legacySource.contentHash} matches multiple V2 source versions` };
    return { reason: `no immutable V2 source has contentHash ${legacySource.contentHash}` };
  };
}

function legacyLocator(
  anchor: ResearchWorkspaceSnapshot["evidenceAnchors"][number],
  source: KnowledgeSourceAsset
): { locator?: SourceLocator; reason: string } {
  if (anchor.page !== undefined) {
    if (source.format !== "pdf") return { reason: `page locator requires a PDF source, not ${source.format}` };
    if (!Number.isInteger(anchor.page) || anchor.page < 1) return { reason: "page locator must be a positive integer" };
    return { locator: { kind: "pdf", page: anchor.page }, reason: "" };
  }
  if (anchor.lineStart !== undefined) {
    if (source.format === "pdf") return { reason: "PDF evidence requires a page locator" };
    if (!Number.isInteger(anchor.lineStart) || anchor.lineStart < 1
      || (anchor.lineEnd !== undefined && (!Number.isInteger(anchor.lineEnd) || anchor.lineEnd < anchor.lineStart))) {
      return { reason: "text locator has an invalid line range" };
    }
    return {
      locator: { kind: "text", lineStart: anchor.lineStart, lineEnd: anchor.lineEnd, section: trimmed(anchor.title) },
      reason: ""
    };
  }
  try {
    const uri = new URL(anchor.uri);
    return { locator: { kind: "uri", uri: uri.toString() }, reason: "" };
  } catch {
    return { reason: "evidence has no valid page, line, or absolute URI locator" };
  }
}

function migratedNode(input: {
  id: string;
  kind: KnowledgeNodeKind;
  title: string;
  summary: string;
  depth: number;
  sourceRefs: KnowledgeSourceRef[];
  sourceVerified: boolean;
  status: KnowledgeNode["status"];
  tags: string[];
  projectId: string;
  migratedAt: string;
}): KnowledgeNode {
  return {
    id: input.id,
    kind: input.kind,
    title: input.title.trim(),
    summary: input.summary.trim(),
    status: input.status,
    ...createKnowledgeMetadata({
      kind: input.kind,
      createdBy: "system",
      creatorId: "alpha-ai-graph-legacy-migration",
      scopeContextId: input.projectId,
      sourceRefCount: input.sourceRefs.length,
      sourceVerified: input.sourceVerified
    }),
    depth: input.depth,
    tags: input.tags,
    sourceRefs: input.sourceRefs,
    createdAt: input.migratedAt,
    updatedAt: input.migratedAt
  };
}

function migratedEdge(
  id: string,
  fromNodeId: string,
  toNodeId: string,
  kind: KnowledgeRelationKind,
  createdAt: string,
  confidence: number
): KnowledgeEdge {
  const evolution = new Set<KnowledgeRelationKind>(["refines", "corrects", "supersedes", "valid_in_context", "derived_from"]);
  return {
    id,
    fromNodeId,
    toNodeId,
    kind,
    rationale: evolution.has(kind) ? "Migrated from an explicitly reviewed V1 relation." : undefined,
    createdBy: "system",
    confidence,
    createdAt
  };
}

function migrateNodeKind(kind: ResearchWorkspaceSnapshot["map"]["nodes"][number]["kind"]): KnowledgeNodeKind | undefined {
  const mapping: Record<typeof kind, KnowledgeNodeKind | undefined> = {
    root: "subject",
    module: "topic",
    section: "topic",
    file: "topic",
    concept: "concept",
    question: "question",
    hypothesis: "hypothesis",
    finding: "claim",
    risk: "uncertainty",
    action: "route_step",
    script: undefined,
    result: "synthesis",
    conclusion: "conclusion",
    evidence: "evidence"
  };
  return mapping[kind];
}

function migrateEdgeKind(kind: CandidateResult["edge"]["kind"]): KnowledgeRelationKind {
  const mapping: Record<typeof kind, KnowledgeRelationKind> = {
    decomposes_to: "contains",
    depends_on: "depends_on",
    relates_to: "related_to",
    supports: "supports",
    contradicts: "contradicts",
    evidence_for: "supports",
    next_step: "precedes",
    validates: "supports",
    produces: "derived_from",
    explains: "explains"
  };
  return mapping[kind];
}

function migrateJobKind(kind: AgentJob["kind"]): { kind: ResearchTaskKind; role: ResearchAgentRole } | undefined {
  const mapping: Record<AgentJob["kind"], { kind: ResearchTaskKind; role: ResearchAgentRole } | undefined> = {
    scan_source: { kind: "parse", role: "researcher" },
    generate_map: { kind: "analyze", role: "analyst" },
    expand_node: { kind: "analyze", role: "analyst" },
    summarize_source: { kind: "synthesize", role: "synthesizer" },
    extract_concepts: { kind: "extract", role: "analyst" },
    extract_evidence: { kind: "extract", role: "researcher" },
    compare_sources: { kind: "analyze", role: "critic" },
    generate_script: undefined,
    run_command: undefined,
    create_digest: { kind: "synthesize", role: "synthesizer" }
  };
  return mapping[kind];
}

function migrateJobStatus(status: AgentJob["status"]): ResearchTask["status"] {
  const mapping: Record<AgentJob["status"], ResearchTask["status"]> = {
    queued: "queued",
    running: "in_progress",
    completed: "completed",
    failed: "blocked",
    cancelled: "cancelled"
  };
  return mapping[status];
}

function sanitizeExecutionRun(run: ExecutionRun): LegacyExecutionHistoryRecord {
  return {
    id: run.id,
    jobId: run.jobId,
    status: run.status,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    exitCode: run.exitCode,
    resultSummary: run.resultSummary,
    evidenceId: run.evidenceId,
    rawPayloadOmitted: Boolean(run.command || run.script || run.stdout || run.stderr)
  };
}

function migrationAudit(id: string, rationale: string, createdAt: string) {
  return createGraphPatchAudit(`audit-legacy-${idPart(id)}-${shortHash(id)}`, rationale, createdAt, "system");
}

function skip(kind: LegacyMigrationSkip["kind"], id: string, reason: string): LegacyMigrationSkip {
  return { kind, id, reason };
}

function validConfidence(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function normalizedTitle(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[\p{P}\p{S}\s]+/gu, "");
}

function idPart(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "legacy";
}

function shortHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function firstText(...values: Array<string | undefined>): string | undefined {
  return values.map(trimmed).find((value): value is string => Boolean(value));
}

function trimmed(value: string | undefined): string | undefined {
  const result = value?.trim();
  return result || undefined;
}

function unique<T>(values: readonly T[]): T[] {
  return Array.from(new Set(values));
}

function uniqueBy<T>(values: readonly T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const identity = key(value);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new LegacyResearchMigrationError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireRecordArray(value: unknown, label: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new LegacyResearchMigrationError(`${label} must be an array`);
  return value.map((item, index) => requireRecord(item, `${label}[${index}]`));
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new LegacyResearchMigrationError(`${label} must be a non-empty string`);
  return value;
}

function requireStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new LegacyResearchMigrationError(`${label} must be a string array`);
  }
  return value;
}

function requireOptionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new LegacyResearchMigrationError(`${label} must be a string when present`);
  return value;
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new LegacyResearchMigrationError(`${label} must be a finite number`);
  }
  return value;
}

function requireOptionalNumber(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  return requireNumber(value, label);
}

function requireEnum(value: unknown, allowed: ReadonlySet<string>, label: string): string {
  const result = requireString(value, label);
  if (!allowed.has(result)) throw new LegacyResearchMigrationError(`${label} has unsupported value ${result}`);
  return result;
}

function assertUniqueIds(items: readonly Record<string, unknown>[], label: string): void {
  const ids = new Set<string>();
  for (const item of items) {
    const id = requireString(item.id, `${label}.id`);
    if (ids.has(id)) throw new LegacyResearchMigrationError(`duplicate ${label} id ${id}`);
    ids.add(id);
  }
}

function assertUniqueMigratedIds(items: readonly Record<string, unknown>[], label: string): void {
  const ids = new Set<string>();
  for (const item of items) {
    const original = requireString(item.id, `${label}.id`);
    const migrated = idPart(original);
    if (ids.has(migrated)) {
      throw new LegacyResearchMigrationError(`${label} ids collide after normalization: ${original}`);
    }
    ids.add(migrated);
  }
}

const researchNodeKinds = new Set([
  "root", "module", "section", "file", "concept", "question", "hypothesis", "finding",
  "risk", "action", "script", "result", "conclusion", "evidence"
]);
const researchEdgeKinds = new Set([
  "decomposes_to", "depends_on", "relates_to", "supports", "contradicts", "evidence_for",
  "next_step", "validates", "produces", "explains"
]);
const candidateStatuses = new Set(["pending_review", "needs_review", "merged", "dismissed"]);
const agentJobKinds = new Set([
  "scan_source", "generate_map", "expand_node", "summarize_source", "extract_concepts",
  "extract_evidence", "compare_sources", "generate_script", "run_command", "create_digest"
]);
const agentJobStatuses = new Set(["queued", "running", "completed", "failed", "cancelled"]);
const executionRunStatuses = new Set(["running", "passed", "failed", "cancelled"]);
