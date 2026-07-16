import type { KnowledgeWorkspaceDocument, KnowledgeWorkspaceSnapshot, KnowledgeWorkspaceStore } from "../types";
import { knowledgeWorkspaceSchemaVersion } from "../types";
import { assertKnowledgeEvolution } from "./knowledgeEvolution";
import { validateProjectContract } from "./projectModel";
import { assertKnowledgeProvenance } from "./provenance";
import { assertResearchOrchestration, emptyResearchOrchestration } from "./researchOrchestration";
import { assertAcceptedResearchRoutePatches } from "./researchRoute";
import { assertAcceptedResearchRouteScenarioPatches } from "./researchRouteScenario";
import { assertNoIndependentResearchReportData } from "./researchResults";
import { assertAcceptedCrossProjectKnowledgeReusePatches } from "./knowledgeReuse";

const legacySchemaVersion = 1;
const defaultStoragePrefix = "alpha-ai-graph.workspace.";
const sensitivePropertyNames = new Set([
  "apikey",
  "token",
  "accesstoken",
  "refreshtoken",
  "authtoken",
  "secret",
  "clientsecret",
  "password",
  "authorization",
  "credential",
  "credentials",
  "privatekey"
]);

export type WorkspacePersistenceErrorCode =
  | "invalid_json"
  | "invalid_document"
  | "unsupported_version"
  | "invalid_workspace"
  | "sensitive_field"
  | "storage_unavailable";

export class WorkspacePersistenceError extends Error {
  constructor(
    readonly code: WorkspacePersistenceErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(`[${code}] ${message}`, options);
    this.name = "WorkspacePersistenceError";
  }
}

export interface KnowledgeWorkspaceSaveReceipt {
  spaceId: string;
  schemaVersion: typeof knowledgeWorkspaceSchemaVersion;
  savedAt: string;
}

export function serializeKnowledgeWorkspace(
  workspace: KnowledgeWorkspaceSnapshot,
  savedAt = new Date().toISOString()
): string {
  assertTimestamp(savedAt, "savedAt");
  assertNoSensitiveFields(workspace);
  validateWorkspace(workspace);
  const document: KnowledgeWorkspaceDocument = {
    schemaVersion: knowledgeWorkspaceSchemaVersion,
    savedAt,
    workspace
  };
  try {
    return JSON.stringify(document);
  } catch (error) {
    throw new WorkspacePersistenceError(
      "invalid_document",
      "Workspace contains values that cannot be serialized as JSON",
      { cause: error }
    );
  }
}

export function deserializeKnowledgeWorkspace(serializedDocument: string): KnowledgeWorkspaceSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serializedDocument);
  } catch (error) {
    throw new WorkspacePersistenceError("invalid_json", "Stored workspace is not valid JSON", { cause: error });
  }

  assertNoSensitiveFields(parsed);
  const document = migrateDocument(parsed);
  assertNoSensitiveFields(document.workspace);
  validateWorkspace(document.workspace);

  // JSON round trips preserve values, not shared object identity. Rebuild the deprecated alias.
  document.workspace.subject = document.workspace.project.subject;
  return document.workspace;
}

export async function saveKnowledgeWorkspace(
  store: KnowledgeWorkspaceStore,
  workspace: KnowledgeWorkspaceSnapshot,
  savedAt = new Date().toISOString()
): Promise<KnowledgeWorkspaceSaveReceipt> {
  const serialized = serializeKnowledgeWorkspace(workspace, savedAt);
  await store.save(workspace.space.id, serialized);
  return {
    spaceId: workspace.space.id,
    schemaVersion: knowledgeWorkspaceSchemaVersion,
    savedAt
  };
}

export async function loadKnowledgeWorkspace(
  store: KnowledgeWorkspaceStore,
  spaceId: string
): Promise<KnowledgeWorkspaceSnapshot | undefined> {
  assertIdentifier(spaceId, "spaceId");
  const serialized = await store.load(spaceId);
  return serialized === null ? undefined : deserializeKnowledgeWorkspace(serialized);
}

export class InMemoryKnowledgeWorkspaceStore implements KnowledgeWorkspaceStore {
  private readonly documents = new Map<string, string>();

  async save(spaceId: string, serializedDocument: string): Promise<void> {
    assertIdentifier(spaceId, "spaceId");
    this.documents.set(spaceId, serializedDocument);
  }

  async load(spaceId: string): Promise<string | null> {
    assertIdentifier(spaceId, "spaceId");
    return this.documents.get(spaceId) ?? null;
  }
}

export class BrowserLocalStorageKnowledgeWorkspaceStore implements KnowledgeWorkspaceStore {
  private readonly storage: Pick<Storage, "getItem" | "setItem">;

  constructor(storage?: Pick<Storage, "getItem" | "setItem">, private readonly prefix = defaultStoragePrefix) {
    const availableStorage = storage ?? (typeof window === "undefined" ? undefined : window.localStorage);
    if (!availableStorage) {
      throw new WorkspacePersistenceError("storage_unavailable", "Browser localStorage is unavailable");
    }
    this.storage = availableStorage;
  }

  async save(spaceId: string, serializedDocument: string): Promise<void> {
    this.storage.setItem(this.key(spaceId), serializedDocument);
  }

  async load(spaceId: string): Promise<string | null> {
    return this.storage.getItem(this.key(spaceId));
  }

  private key(spaceId: string): string {
    assertIdentifier(spaceId, "spaceId");
    return `${this.prefix}${encodeURIComponent(spaceId)}`;
  }
}

function migrateDocument(value: unknown): KnowledgeWorkspaceDocument {
  const document = requireRecord(value, "document");
  const schemaVersion = document.schemaVersion;
  if (schemaVersion === knowledgeWorkspaceSchemaVersion) {
    assertTimestamp(document.savedAt, "savedAt");
    const workspace = requireRecord(document.workspace, "workspace");
    normalizeWorkspaceCollections(workspace);
    return {
      schemaVersion: knowledgeWorkspaceSchemaVersion,
      savedAt: document.savedAt,
      workspace: workspace as unknown as KnowledgeWorkspaceSnapshot
    };
  }
  if (schemaVersion === legacySchemaVersion) return migrateVersion1(document);
  throw new WorkspacePersistenceError(
    "unsupported_version",
    `Cannot load workspace schema version ${String(schemaVersion)}`
  );
}

function migrateVersion1(document: Record<string, unknown>): KnowledgeWorkspaceDocument {
  assertTimestamp(document.savedAt, "savedAt");
  const workspace = requireRecord(document.workspace, "workspace");
  normalizeWorkspaceCollections(workspace);
  const project = requireRecord(workspace.project, "workspace.project");
  workspace.subject ??= project.subject;
  workspace.projects ??= [project];
  workspace.agentRuns ??= [];

  const patches = requireArray(workspace.candidatePatches, "workspace.candidatePatches");
  patches.forEach((candidate, patchIndex) => migrateLegacyPatch(candidate, patchIndex));

  return {
    schemaVersion: knowledgeWorkspaceSchemaVersion,
    savedAt: document.savedAt,
    workspace: workspace as unknown as KnowledgeWorkspaceSnapshot
  };
}

function normalizeWorkspaceCollections(workspace: Record<string, unknown>): void {
  for (const key of [
    "views",
    "agentRequests",
    "candidatePatches",
    "impactReviewTasks",
    "conversations",
    "knowledgeSourceAssets",
    "sourceAnchors",
    "sourceAssets"
  ]) {
    workspace[key] ??= [];
  }
  const empty = emptyResearchOrchestration();
  const orchestration: Record<string, unknown> = workspace.researchOrchestration === undefined
    ? { ...empty }
    : requireRecord(workspace.researchOrchestration, "workspace.researchOrchestration");
  for (const [key, value] of Object.entries(empty)) orchestration[key] ??= value;
  requireRecordArray(
    orchestration.verificationRecords,
    "workspace.researchOrchestration.verificationRecords"
  ).forEach((record) => {
    const missingProfiles = record.evidenceProfiles === undefined;
    if (missingProfiles) {
      const evidenceIds = [
        ...requireArray(record.evidenceNodeIds, "workspace.researchOrchestration.verificationRecord.evidenceNodeIds"),
        ...requireArray(record.opposingEvidenceNodeIds, "workspace.researchOrchestration.verificationRecord.opposingEvidenceNodeIds")
      ].map((id, index) => readString(id, `workspace.researchOrchestration.verificationRecord.evidenceIds[${index}]`));
      record.evidenceProfiles = Array.from(new Set(evidenceIds)).map((evidenceNodeId) => ({
        evidenceNodeId,
        geographies: [],
        conflictOfInterestStatus: "unknown"
      }));
    }
    const missingAlternatives = record.alternativeExplanationNodeIds === undefined;
    record.alternativeExplanationNodeIds ??= [];
    const profileDependentChecks = new Set([
      "geography_consistency",
      "unit_consistency",
      "methodology_consistency",
      "conflict_of_interest"
    ]);
    if (record.status === "passed"
      && ((missingProfiles && profileDependentChecks.has(String(record.checkKind)))
        || (missingAlternatives && record.checkKind === "alternative_explanation"))) {
      record.status = "inconclusive";
      record.finding = `Migrated without structured verification details; re-run this check. Previous finding: ${String(record.finding ?? "not recorded")}`;
    }
  });
  workspace.researchOrchestration = orchestration;
  normalizeResearchRoundBaselines(workspace, orchestration);
  normalizeResearchRoundResults(orchestration);
}

function normalizeResearchRoundBaselines(
  workspace: Record<string, unknown>,
  orchestration: Record<string, unknown>
): void {
  const rounds = requireRecordArray(orchestration.rounds, "workspace.researchOrchestration.rounds");
  if (rounds.length === 0) return;
  const graph = requireRecord(workspace.graph, "workspace.graph");
  const graphNodeIds = recordIds(requireRecordArray(graph.nodes, "workspace.graph.nodes"), "workspace.graph.nodes");
  const graphEdgeIds = recordIds(requireRecordArray(graph.edges, "workspace.graph.edges"), "workspace.graph.edges");
  const sourceIds = recordIds(
    requireRecordArray(workspace.knowledgeSourceAssets, "workspace.knowledgeSourceAssets"),
    "workspace.knowledgeSourceAssets"
  );
  const verificationIds = recordIds(
    requireRecordArray(orchestration.verificationRecords, "workspace.researchOrchestration.verificationRecords"),
    "workspace.researchOrchestration.verificationRecords"
  );
  rounds.forEach((round, index) => {
    const outputs = requireRecord(round.outputs, `workspace.researchOrchestration.rounds[${index}].outputs`);
    outputs.inferenceNodeIds ??= [];
    if (round.baseline !== undefined) return;
    const outputNodeIds = new Set([
      "factNodeIds",
      "claimNodeIds",
      "hypothesisNodeIds",
      "inferenceNodeIds",
      "evidenceNodeIds",
      "conflictNodeIds",
      "gapNodeIds",
      "synthesisNodeIds"
    ].flatMap((key) => requireArray(outputs[key], `workspace.researchOrchestration.rounds[${index}].outputs.${key}`)
      .map((id, idIndex) => readString(id, `workspace.researchOrchestration.rounds[${index}].outputs.${key}[${idIndex}]`))));
    const outputEdgeIds = new Set(requireArray(outputs.edgeIds, `workspace.researchOrchestration.rounds[${index}].outputs.edgeIds`)
      .map((id, idIndex) => readString(id, `workspace.researchOrchestration.rounds[${index}].outputs.edgeIds[${idIndex}]`)));
    const outputSourceIds = new Set(requireArray(outputs.sourceIds, `workspace.researchOrchestration.rounds[${index}].outputs.sourceIds`)
      .map((id, idIndex) => readString(id, `workspace.researchOrchestration.rounds[${index}].outputs.sourceIds[${idIndex}]`)));
    const outputVerificationIds = new Set(requireArray(
      outputs.verificationRecordIds,
      `workspace.researchOrchestration.rounds[${index}].outputs.verificationRecordIds`
    ).map((id, idIndex) => readString(
      id,
      `workspace.researchOrchestration.rounds[${index}].outputs.verificationRecordIds[${idIndex}]`
    )));
    round.baseline = {
      capturedAt: round.startedAt ?? round.createdAt,
      graphUpdatedAt: graph.updatedAt ?? round.createdAt,
      nodeIds: graphNodeIds.filter((id) => !outputNodeIds.has(id)),
      edgeIds: graphEdgeIds.filter((id) => !outputEdgeIds.has(id)),
      sourceIds: sourceIds.filter((id) => !outputSourceIds.has(id)),
      verificationRecordIds: verificationIds.filter((id) => !outputVerificationIds.has(id))
    };
  });
}

function normalizeResearchRoundResults(orchestration: Record<string, unknown>): void {
  const rounds = requireRecordArray(orchestration.rounds, "workspace.researchOrchestration.rounds");
  const verificationRecords = requireRecordArray(
    orchestration.verificationRecords,
    "workspace.researchOrchestration.verificationRecords"
  );
  const verificationById = new Map(verificationRecords.map((record, index) => [
    readString(record.id, `workspace.researchOrchestration.verificationRecords[${index}].id`),
    record
  ]));
  rounds.forEach((round, roundIndex) => {
    if (round.outcome !== "insufficient_evidence" || round.result !== undefined) return;
    const outputs = requireRecord(round.outputs, `workspace.researchOrchestration.rounds[${roundIndex}].outputs`);
    const verificationIds = requireArray(
      outputs.verificationRecordIds,
      `workspace.researchOrchestration.rounds[${roundIndex}].outputs.verificationRecordIds`
    ).map((id, idIndex) => readString(
      id,
      `workspace.researchOrchestration.rounds[${roundIndex}].outputs.verificationRecordIds[${idIndex}]`
    ));
    const blockers = verificationIds
      .map((id) => verificationById.get(id))
      .filter((record): record is Record<string, unknown> =>
        record?.status === "failed" || record?.status === "inconclusive");
    if (blockers.length === 0) {
      // Legacy callers could self-report insufficient evidence without an auditable basis.
      // Preserve the completed round, but do not preserve an unsupported negative conclusion.
      round.outcome = "advanced";
      return;
    }
    round.result = {
      kind: "insufficient_evidence",
      targetNodeIds: uniqueStrings(blockers.map((record, index) =>
        readString(record.targetNodeId, `workspace.researchOrchestration.rounds[${roundIndex}].blockers[${index}].targetNodeId`))),
      blockingVerificationRecordIds: blockers.map((record, index) =>
        readString(record.id, `workspace.researchOrchestration.rounds[${roundIndex}].blockers[${index}].id`)),
      failedCheckKinds: uniqueStrings(blockers
        .filter((record) => record.status === "failed")
        .map((record, index) => readString(record.checkKind, `workspace.researchOrchestration.rounds[${roundIndex}].failedChecks[${index}]`))),
      inconclusiveCheckKinds: uniqueStrings(blockers
        .filter((record) => record.status === "inconclusive")
        .map((record, index) => readString(record.checkKind, `workspace.researchOrchestration.rounds[${roundIndex}].inconclusiveChecks[${index}]`))),
      sourceIds: uniqueStrings(blockers.flatMap((record) => stringArray(record.sourceIds))),
      evidenceNodeIds: uniqueStrings(blockers.flatMap((record) => stringArray(record.evidenceNodeIds))),
      opposingEvidenceNodeIds: uniqueStrings(blockers.flatMap((record) => stringArray(record.opposingEvidenceNodeIds))),
      gapNodeIds: uniqueStrings([
        ...stringArray(outputs.gapNodeIds),
        ...stringArray(round.nextQuestionNodeIds)
      ]),
      summary: "当前资料不足以支持可靠结论。",
      assessedBy: "system",
      assessedAt: round.completedAt ?? round.updatedAt ?? round.createdAt
    };
  });
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function recordIds(records: Record<string, unknown>[], path: string): string[] {
  return records.map((record, index) => readString(record.id, `${path}[${index}].id`));
}

function migrateLegacyPatch(value: unknown, patchIndex: number): void {
  const patch = requireRecord(value, `workspace.candidatePatches[${patchIndex}]`);
  const patchId = readString(patch.id, `candidatePatches[${patchIndex}].id`);
  patch.revision ??= 1;
  patch.createdBy ??= "agent";
  if ((patch.status === "accepted" || patch.status === "rejected") && patch.reviewedAt === undefined) {
    patch.reviewedAt = patch.createdAt;
    patch.reviewedBy ??= "user";
  }
  const operations = requireArray(patch.operations, `candidatePatches[${patchIndex}].operations`);
  operations.forEach((value, operationIndex) => {
    const operation = requireRecord(value, `candidatePatches[${patchIndex}].operations[${operationIndex}]`);
    operation.audit ??= {
      id: `migration-${patchId}-${operationIndex + 1}`,
      rationale: "Migrated from workspace schema version 1",
      actor: patch.createdBy,
      createdAt: patch.createdAt
    };
  });
}

function validateWorkspace(workspace: KnowledgeWorkspaceSnapshot): void {
  try {
    const value = requireRecord(workspace, "workspace");
    const space = requireRecord(value.space, "workspace.space");
    const project = requireRecord(value.project, "workspace.project");
    const subject = requireRecord(value.subject, "workspace.subject");
    const graph = requireRecord(value.graph, "workspace.graph");
    const projects = requireRecordArray(value.projects, "workspace.projects");
    const nodes = requireRecordArray(graph.nodes, "workspace.graph.nodes");
    const edges = requireRecordArray(graph.edges, "workspace.graph.edges");
    const views = requireRecordArray(value.views, "workspace.views");
    const sources = requireRecordArray(value.knowledgeSourceAssets, "workspace.knowledgeSourceAssets");
    const anchors = requireRecordArray(value.sourceAnchors, "workspace.sourceAnchors");
    const requests = requireRecordArray(value.agentRequests, "workspace.agentRequests");
    const runs = requireRecordArray(value.agentRuns, "workspace.agentRuns");
    const patches = requireRecordArray(value.candidatePatches, "workspace.candidatePatches");
    const reviewTasks = requireRecordArray(value.impactReviewTasks, "workspace.impactReviewTasks");
    const researchOrchestration = requireRecord(value.researchOrchestration, "workspace.researchOrchestration");
    requireRecordArray(researchOrchestration.briefs, "workspace.researchOrchestration.briefs");
    requireRecordArray(researchOrchestration.plans, "workspace.researchOrchestration.plans");
    requireRecordArray(researchOrchestration.tasks, "workspace.researchOrchestration.tasks");
    requireRecordArray(researchOrchestration.rounds, "workspace.researchOrchestration.rounds");
    requireRecordArray(researchOrchestration.searchQueries, "workspace.researchOrchestration.searchQueries");
    requireRecordArray(researchOrchestration.verificationRecords, "workspace.researchOrchestration.verificationRecords");
    const conversations = requireRecordArray(value.conversations, "workspace.conversations");
    requireArray(value.sourceAssets, "workspace.sourceAssets");

    const spaceId = readString(space.id, "space.id");
    const graphId = readString(graph.id, "graph.id");
    const projectId = readString(project.id, "project.id");
    const nodeIds = uniqueIds(nodes, "graph.nodes");
    const edgeIds = uniqueIds(edges, "graph.edges");
    const projectIds = uniqueIds(projects, "projects");
    const viewIds = uniqueIds(views, "views");
    const sourceIds = uniqueIds(sources, "knowledgeSourceAssets");
    const anchorIds = uniqueIds(anchors, "sourceAnchors");
    const requestIds = uniqueIds(requests, "agentRequests");
    const patchIds = uniqueIds(patches, "candidatePatches");
    const reviewTaskIds = uniqueIds(reviewTasks, "impactReviewTasks");
    uniqueIds(runs, "agentRuns");
    uniqueIds(conversations, "conversations");
    void edgeIds;
    void anchorIds;

    if (readString(space.graphId, "space.graphId") !== graphId) fail("space.graphId must match graph.id");
    if (readString(project.spaceId, "project.spaceId") !== spaceId) fail("project.spaceId must match space.id");
    if (!projectIds.has(projectId)) fail("active project must be included in projects");
    const projectSubject = requireRecord(project.subject, "project.subject");
    if (readString(subject.id, "subject.id") !== readString(projectSubject.id, "project.subject.id")) {
      fail("subject must represent the active project subject");
    }

    const declaredProjectIds = stringSet(requireArray(space.projectIds, "space.projectIds"), "space.projectIds");
    assertSameIds(declaredProjectIds, projectIds, "space.projectIds", "projects");
    for (const candidate of projects) {
      if (candidate.spaceId !== spaceId) fail(`project ${String(candidate.id)} belongs to another space`);
      if (candidate.graphId !== graphId) fail(`project ${String(candidate.id)} belongs to another graph`);
      const contractErrors = validateProjectContract(candidate as unknown as KnowledgeWorkspaceSnapshot["project"], workspace.graph);
      if (contractErrors.length > 0) fail(`project ${String(candidate.id)}: ${contractErrors.join("; ")}`);
      if (candidate.parentProjectId !== undefined && !projectIds.has(String(candidate.parentProjectId))) {
        fail(`project ${String(candidate.id)} references unknown parent project`);
      }
      if (candidate.derivedFromNodeId !== undefined && !nodeIds.has(String(candidate.derivedFromNodeId))) {
        fail(`project ${String(candidate.id)} references unknown derived node`);
      }
    }

    for (const rootId of stringSet(requireArray(graph.rootNodeIds, "graph.rootNodeIds"), "graph.rootNodeIds")) {
      if (!nodeIds.has(rootId)) fail(`graph root ${rootId} does not exist`);
    }
    for (const edge of edges) {
      if (!nodeIds.has(readString(edge.fromNodeId, `edge ${String(edge.id)}.fromNodeId`))) fail(`edge ${String(edge.id)} has unknown source node`);
      if (!nodeIds.has(readString(edge.toNodeId, `edge ${String(edge.id)}.toNodeId`))) fail(`edge ${String(edge.id)} has unknown target node`);
    }

    const activeViewId = readString(value.activeViewId, "activeViewId");
    if (!viewIds.has(activeViewId)) fail("activeViewId does not reference an existing view");
    for (const view of views) {
      if (!new Set([
        "mind_map",
        "network",
        "evidence",
        "route",
        "knowledge_modules",
        "skill_tree",
        "learning_dependencies",
        "learning_path",
        "practice_manual"
      ]).has(String(view.kind))) fail(`view ${String(view.id)} has an invalid kind`);
      if (!nodeIds.has(readString(view.rootNodeId, `view ${String(view.id)}.rootNodeId`))) fail(`view ${String(view.id)} has unknown root node`);
      if (!nodeIds.has(readString(view.focusNodeId, `view ${String(view.id)}.focusNodeId`))) fail(`view ${String(view.id)} has unknown focus node`);
    }
    if (!nodeIds.has(readString(value.selectedNodeId, "selectedNodeId"))) fail("selectedNodeId does not exist");
    const selection = requireRecord(value.selection, "workspace.selection");
    if (!nodeIds.has(readString(selection.focusNodeId, "selection.focusNodeId"))) fail("selection focus node does not exist");
    for (const nodeId of stringSet(requireArray(selection.nodeIds, "selection.nodeIds"), "selection.nodeIds")) {
      if (!nodeIds.has(nodeId)) fail(`selection references unknown node ${nodeId}`);
    }
    for (const sourceId of stringSet(requireArray(selection.sourceIds, "selection.sourceIds"), "selection.sourceIds")) {
      if (!sourceIds.has(sourceId)) fail(`selection references unknown source ${sourceId}`);
    }

    for (const source of sources) {
      if (source.spaceId !== spaceId) fail(`source ${String(source.id)} belongs to another space`);
      if (source.immutable !== true) fail(`source ${String(source.id)} must be immutable`);
    }
    for (const candidate of projects) {
      const candidateSubject = requireRecord(candidate.subject, `project ${String(candidate.id)}.subject`);
      for (const sourceId of stringSet(
        requireArray(candidateSubject.sourceAssetIds, `project ${String(candidate.id)}.subject.sourceAssetIds`),
        `project ${String(candidate.id)}.subject.sourceAssetIds`
      )) {
        if (!sourceIds.has(sourceId)) fail(`project ${String(candidate.id)} references unknown source ${sourceId}`);
      }
    }
    for (const anchor of anchors) {
      if (!sourceIds.has(readString(anchor.sourceId, `anchor ${String(anchor.id)}.sourceId`))) {
        fail(`anchor ${String(anchor.id)} references unknown source`);
      }
    }

    for (const patch of patches) validatePatch(patch, requestIds, nodeIds, edgeIds, reviewTaskIds);
    const patchesById = new Map(patches.map((patch) => [String(patch.id), patch]));
    for (const task of reviewTasks) validateImpactReviewTask(task, patchesById, nodeIds, edgeIds);
    for (const run of runs) {
      if (!requestIds.has(readString(run.requestId, `run ${String(run.id)}.requestId`))) fail(`run ${String(run.id)} references unknown request`);
      if (run.patchId !== undefined && !patchIds.has(String(run.patchId))) fail(`run ${String(run.id)} references unknown patch`);
    }
    for (const conversation of conversations) {
      if (!nodeIds.has(readString(conversation.nodeId, `conversation ${String(conversation.id)}.nodeId`))) fail(`conversation ${String(conversation.id)} has unknown question node`);
      if (!nodeIds.has(readString(conversation.answerNodeId, `conversation ${String(conversation.id)}.answerNodeId`))) fail(`conversation ${String(conversation.id)} has unknown answer node`);
    }

    assertKnowledgeProvenance(workspace.graph, {
      sources: workspace.knowledgeSourceAssets,
      anchors: workspace.sourceAnchors
    });
    assertKnowledgeEvolution(workspace.graph);
    assertNoIndependentResearchReportData(workspace);
    assertResearchOrchestration(workspace);
    assertAcceptedResearchRoutePatches(workspace);
    assertAcceptedResearchRouteScenarioPatches(workspace);
    assertAcceptedCrossProjectKnowledgeReusePatches(workspace);
  } catch (error) {
    if (error instanceof WorkspacePersistenceError) throw error;
    throw new WorkspacePersistenceError("invalid_workspace", "Workspace failed domain validation", { cause: error });
  }
}

function validatePatch(
  patch: Record<string, unknown>,
  requestIds: Set<string>,
  nodeIds: Set<string>,
  edgeIds: Set<string>,
  reviewTaskIds: Set<string>
): void {
  const patchId = readString(patch.id, "candidatePatch.id");
  if (!requestIds.has(readString(patch.requestId, `patch ${patchId}.requestId`))) fail(`patch ${patchId} references unknown request`);
  if (!nodeIds.has(readString(patch.targetNodeId, `patch ${patchId}.targetNodeId`))) fail(`patch ${patchId} references unknown target node`);
  if (!Number.isInteger(patch.revision) || Number(patch.revision) < 1) fail(`patch ${patchId} has an invalid revision`);
  if (!new Set(["agent", "user", "system"]).has(String(patch.createdBy))) fail(`patch ${patchId} has an invalid creator`);
  if (!new Set(["pending_review", "accepted", "rejected"]).has(String(patch.status))) fail(`patch ${patchId} has an invalid status`);
  const operations = requireRecordArray(patch.operations, `patch ${patchId}.operations`);
  const auditIds = new Set<string>();
  for (const operation of operations) {
    const audit = requireRecord(operation.audit, `patch ${patchId} operation audit`);
    const auditId = readString(audit.id, `patch ${patchId} operation audit.id`);
    if (auditIds.has(auditId)) fail(`patch ${patchId} has duplicate audit id ${auditId}`);
    auditIds.add(auditId);
    readString(audit.rationale, `patch ${patchId} operation audit.rationale`);
    assertTimestamp(audit.createdAt, `patch ${patchId} operation audit.createdAt`);
  }
  if ((patch.status === "accepted" || patch.status === "rejected") && (!patch.reviewedBy || !patch.reviewedAt)) {
    fail(`reviewed patch ${patchId} must record reviewer and review time`);
  }
  if (patch.impactAssessment !== undefined) validateImpactAssessment(patch.impactAssessment, patchId, patch, nodeIds, edgeIds);
  if (patch.reviewTaskId !== undefined) {
    const reviewTaskId = readString(patch.reviewTaskId, `patch ${patchId}.reviewTaskId`);
    if (!reviewTaskIds.has(reviewTaskId)) fail(`patch ${patchId} references unknown impact review task ${reviewTaskId}`);
    if (patch.action !== "revise") fail(`patch ${patchId} linked to an impact review task must be a revise action`);
  }
}

function validateImpactReviewTask(
  task: Record<string, unknown>,
  patchesById: Map<string, Record<string, unknown>>,
  nodeIds: Set<string>,
  edgeIds: Set<string>
): void {
  const taskId = readString(task.id, "impactReviewTask.id");
  const sourcePatchId = readString(task.sourceCorrectionPatchId, `impact review task ${taskId}.sourceCorrectionPatchId`);
  const sourcePatch = patchesById.get(sourcePatchId);
  if (!sourcePatch || sourcePatch.action !== "correct" || sourcePatch.status !== "accepted") {
    fail(`impact review task ${taskId} must reference an accepted correction patch`);
  }
  const assessment = requireRecord(sourcePatch.impactAssessment, `impact review task ${taskId} source assessment`);
  if (readString(task.impactAssessmentId, `impact review task ${taskId}.impactAssessmentId`) !== assessment.id) {
    fail(`impact review task ${taskId} references another impact assessment`);
  }
  const nodeId = readString(task.nodeId, `impact review task ${taskId}.nodeId`);
  if (!nodeIds.has(nodeId)) fail(`impact review task ${taskId} references unknown affected node ${nodeId}`);
  const correctionTargetNodeId = readString(task.correctionTargetNodeId, `impact review task ${taskId}.correctionTargetNodeId`);
  const correctedNodeId = readString(task.correctedNodeId, `impact review task ${taskId}.correctedNodeId`);
  if (correctionTargetNodeId !== sourcePatch.targetNodeId || correctedNodeId !== sourcePatch.focusNodeId) {
    fail(`impact review task ${taskId} does not match its correction patch`);
  }
  if (!nodeIds.has(correctionTargetNodeId) || !nodeIds.has(correctedNodeId)) {
    fail(`impact review task ${taskId} references missing correction nodes`);
  }
  const categories = new Set(["judgment", "method", "summary", "conclusion"]);
  const category = readString(task.category, `impact review task ${taskId}.category`);
  if (!categories.has(category)) fail(`impact review task ${taskId} has invalid category ${category}`);
  readString(task.reason, `impact review task ${taskId}.reason`);
  const path = requireRecordArray(task.impactPath, `impact review task ${taskId}.impactPath`);
  for (const segment of path) {
    const edgeId = readString(segment.edgeId, `impact review task ${taskId} path.edgeId`);
    if (!edgeIds.has(edgeId)) fail(`impact review task ${taskId} references unknown edge ${edgeId}`);
  }
  const assessmentItems = requireRecordArray(assessment.affectedItems, `impact review task ${taskId} assessment items`);
  const assessmentItem = assessmentItems.find((item) => item.nodeId === nodeId);
  if (!assessmentItem || assessmentItem.category !== category || JSON.stringify(assessmentItem.path) !== JSON.stringify(path)) {
    fail(`impact review task ${taskId} does not preserve its assessed impact item`);
  }

  const statuses = new Set(["pending_review", "accepted", "modified", "rejected"]);
  const status = readString(task.status, `impact review task ${taskId}.status`);
  if (!statuses.has(status)) fail(`impact review task ${taskId} has invalid status ${status}`);
  assertTimestamp(task.createdAt, `impact review task ${taskId}.createdAt`);
  assertTimestamp(task.updatedAt, `impact review task ${taskId}.updatedAt`);
  const history = requireRecordArray(task.history, `impact review task ${taskId}.history`);
  if (history.length === 0) fail(`impact review task ${taskId} must preserve history`);
  const historyIds = uniqueIds(history, `impact review task ${taskId} history`);
  void historyIds;
  const actions = new Set(["created", "accepted", "modification_proposed", "modified", "modification_rejected", "rejected"]);
  for (const entry of history) {
    const action = readString(entry.action, `impact review task ${taskId} history.action`);
    if (!actions.has(action)) fail(`impact review task ${taskId} has invalid history action ${action}`);
    if (!new Set(["agent", "user", "system"]).has(String(entry.actor))) fail(`impact review task ${taskId} has invalid history actor`);
    assertTimestamp(entry.at, `impact review task ${taskId} history.at`);
    readString(entry.note, `impact review task ${taskId} history.note`);
    if (entry.patchId !== undefined) {
      const patchId = readString(entry.patchId, `impact review task ${taskId} history.patchId`);
      const linkedPatch = patchesById.get(patchId);
      if (!linkedPatch || linkedPatch.reviewTaskId !== taskId) fail(`impact review task ${taskId} history references an unrelated patch`);
    }
    if (action.startsWith("modification_") || action === "modified") {
      requireRecord(entry.before, `impact review task ${taskId} history.before`);
      requireRecord(entry.after, `impact review task ${taskId} history.after`);
    }
  }
  if (history[0].action !== "created" || history[0].at !== task.createdAt) {
    fail(`impact review task ${taskId} history must start with its creation`);
  }
  const last = history.at(-1)!;
  if (last.at !== task.updatedAt) fail(`impact review task ${taskId} updatedAt must match its latest history`);
  const allowedLastActions: Record<string, Set<unknown>> = {
    pending_review: new Set(["created", "modification_proposed", "modification_rejected"]),
    accepted: new Set(["accepted"]),
    modified: new Set(["modified"]),
    rejected: new Set(["rejected"])
  };
  if (!allowedLastActions[status].has(last.action)) fail(`impact review task ${taskId} status does not match its latest history`);
}

function validateImpactAssessment(
  value: unknown,
  patchId: string,
  patch: Record<string, unknown>,
  nodeIds: Set<string>,
  edgeIds: Set<string>
): void {
  const assessment = requireRecord(value, `patch ${patchId}.impactAssessment`);
  if (readString(assessment.patchId, `patch ${patchId}.impactAssessment.patchId`) !== patchId) {
    fail(`patch ${patchId} impact assessment references another patch`);
  }
  if (readString(assessment.targetNodeId, `patch ${patchId}.impactAssessment.targetNodeId`) !== patch.targetNodeId) {
    fail(`patch ${patchId} impact assessment references another target`);
  }
  assertTimestamp(assessment.graphUpdatedAt, `patch ${patchId}.impactAssessment.graphUpdatedAt`);
  assertTimestamp(assessment.assessedAt, `patch ${patchId}.impactAssessment.assessedAt`);
  const items = requireRecordArray(assessment.affectedItems, `patch ${patchId}.impactAssessment.affectedItems`);
  const actualCounts = { judgment: 0, method: 0, summary: 0, conclusion: 0 };
  const categories = new Set(Object.keys(actualCounts));
  for (const item of items) {
    const nodeId = readString(item.nodeId, `patch ${patchId} impact item.nodeId`);
    if (!nodeIds.has(nodeId)) fail(`patch ${patchId} impact assessment references unknown node ${nodeId}`);
    const category = readString(item.category, `patch ${patchId} impact item.category`);
    if (!categories.has(category)) fail(`patch ${patchId} impact assessment has invalid category ${category}`);
    actualCounts[category as keyof typeof actualCounts] += 1;
    if (!Number.isInteger(item.distance) || Number(item.distance) < 1) fail(`patch ${patchId} impact item has invalid distance`);
    const path = requireRecordArray(item.path, `patch ${patchId} impact item.path`);
    if (path.length !== item.distance) fail(`patch ${patchId} impact item path length does not match distance`);
    for (const segment of path) {
      const edgeId = readString(segment.edgeId, `patch ${patchId} impact path.edgeId`);
      if (!edgeIds.has(edgeId)) fail(`patch ${patchId} impact assessment references unknown edge ${edgeId}`);
    }
  }
  const counts = requireRecord(assessment.counts, `patch ${patchId}.impactAssessment.counts`);
  for (const category of categories) {
    if (counts[category] !== actualCounts[category as keyof typeof actualCounts]) {
      fail(`patch ${patchId} impact assessment ${category} count is inconsistent`);
    }
  }
  if (assessment.hasDownstreamImpact !== (items.length > 0)) {
    fail(`patch ${patchId} impact assessment hasDownstreamImpact is inconsistent`);
  }
}

function assertNoSensitiveFields(value: unknown): void {
  const visited = new Set<object>();
  const inspect = (candidate: unknown, path: string): void => {
    if (!candidate || typeof candidate !== "object" || visited.has(candidate)) return;
    visited.add(candidate);
    if (Array.isArray(candidate)) {
      candidate.forEach((item, index) => inspect(item, `${path}[${index}]`));
      return;
    }
    for (const [key, child] of Object.entries(candidate)) {
      const normalizedKey = key.replace(/[-_\s]/g, "").toLowerCase();
      if (sensitivePropertyNames.has(normalizedKey)) {
        throw new WorkspacePersistenceError("sensitive_field", `Refusing to persist sensitive field ${path}.${key}`);
      }
      inspect(child, `${path}.${key}`);
    }
  };
  inspect(value, "workspace");
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new WorkspacePersistenceError("invalid_document", `${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new WorkspacePersistenceError("invalid_document", `${path} must be an array`);
  return value;
}

function requireRecordArray(value: unknown, path: string): Record<string, unknown>[] {
  return requireArray(value, path).map((item, index) => requireRecord(item, `${path}[${index}]`));
}

function readString(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new WorkspacePersistenceError("invalid_workspace", `${path} must be a non-empty string`);
  }
  return value;
}

function assertIdentifier(value: unknown, path: string): asserts value is string {
  readString(value, path);
}

function assertTimestamp(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || !value.trim() || !Number.isFinite(Date.parse(value))) {
    throw new WorkspacePersistenceError("invalid_document", `${path} must be a valid timestamp`);
  }
}

function uniqueIds(values: Record<string, unknown>[], path: string): Set<string> {
  const ids = new Set<string>();
  values.forEach((value, index) => {
    const id = readString(value.id, `${path}[${index}].id`);
    if (ids.has(id)) fail(`${path} contains duplicate id ${id}`);
    ids.add(id);
  });
  return ids;
}

function stringSet(values: unknown[], path: string): Set<string> {
  const ids = new Set<string>();
  values.forEach((value, index) => {
    const id = readString(value, `${path}[${index}]`);
    if (ids.has(id)) fail(`${path} contains duplicate id ${id}`);
    ids.add(id);
  });
  return ids;
}

function assertSameIds(left: Set<string>, right: Set<string>, leftLabel: string, rightLabel: string): void {
  if (left.size !== right.size || [...left].some((id) => !right.has(id))) {
    fail(`${leftLabel} must contain exactly the ids from ${rightLabel}`);
  }
}

function fail(message: string): never {
  throw new WorkspacePersistenceError("invalid_workspace", message);
}
