// @vitest-environment node
import { describe, expect, test } from "vitest";
import type {
  AgentJob,
  CandidateResult,
  ExecutionRun,
  KnowledgeSourceAsset,
  KnowledgeWorkspaceSnapshot,
  ResearchNode,
  ResearchOrchestration,
  ResearchWorkspaceSnapshot
} from "../types";
import { acceptCandidateGraphPatch, createProjectWorkspace } from "./knowledgeEngine";
import {
  parseLegacyResearchWorkspace,
  proposeLegacyResearchMigration
} from "./legacyResearchMigration";
import { startResearchSearchRound } from "./researchSearch";
import { serializeKnowledgeWorkspace } from "./workspacePersistence";

const now = "2026-07-16T01:00:00.000Z";
const legacyHash = "sha256:legacy-content";

describe("legacy Research workflow migration", () => {
  test("turns source-matched evidence and even a previously merged candidate into pending V2 patches", () => {
    const workspace = workspaceWithSource();
    const target = workspace.graph.nodes.find((node) => node.title === "核心原理")!;
    const legacy = legacyWorkspace({ targetTitle: target.title, candidateStatus: "merged" });

    const result = proposeLegacyResearchMigration(workspace, legacy, now);

    expect(result.status).toBe("proposed");
    expect(result.snapshot.graph).toBe(workspace.graph);
    expect(result.evidenceNodeIds).toHaveLength(1);
    expect(result.candidatePatchIds).toHaveLength(1);
    expect(result.researchTaskIds).toEqual([]);
    expect(result.snapshot.sourceAnchors).toEqual([
      expect.objectContaining({ sourceId: "source-v2", contentHash: legacyHash })
    ]);
    expect(result.snapshot.candidatePatches).toHaveLength(2);
    expect(result.snapshot.candidatePatches.every((patch) => patch.status === "pending_review")).toBe(true);
    expect(result.snapshot.candidatePatches.find((patch) => patch.id === result.candidatePatchIds[0])).toMatchObject({
      action: "drill_down",
      targetNodeId: target.id,
      status: "pending_review"
    });

    const evidencePatch = result.snapshot.candidatePatches.find((patch) =>
      patch.operations.some((operation) => operation.kind === "create_node"
        && result.evidenceNodeIds.includes(operation.node.id)))!;
    const acceptedEvidence = acceptCandidateGraphPatch(result.snapshot, evidencePatch.id);
    const evidence = acceptedEvidence.graph.nodes.find((node) => node.id === result.evidenceNodeIds[0])!;
    expect(evidence).toMatchObject({
      kind: "evidence",
      status: "verified",
      epistemicStatus: "supported",
      sourceStatus: "verified"
    });
    expect(acceptedEvidence.graph.edges).toContainEqual(expect.objectContaining({
      fromNodeId: evidence.id,
      toNodeId: target.id,
      kind: "supports"
    }));

    const acceptedCandidate = acceptCandidateGraphPatch(acceptedEvidence, result.candidatePatchIds[0]);
    expect(acceptedCandidate.graph.nodes).toContainEqual(expect.objectContaining({
      title: "旧候选判断",
      kind: "claim"
    }));
    expect(serializeKnowledgeWorkspace(acceptedCandidate, now)).toContain('"schemaVersion":2');
  });

  test("is idempotent and never trusts a mismatched legacy source hash", () => {
    const workspace = workspaceWithSource();
    const target = workspace.graph.nodes.find((node) => node.title === "核心原理")!;
    const legacy = legacyWorkspace({ targetTitle: target.title });
    const first = proposeLegacyResearchMigration(workspace, legacy, now);
    const second = proposeLegacyResearchMigration(first.snapshot, legacy, now);

    expect(second.status).toBe("unchanged");
    expect(second.snapshot).toBe(first.snapshot);
    expect(second.snapshot.sourceAnchors).toHaveLength(1);
    expect(second.snapshot.candidatePatches).toHaveLength(2);

    const mismatched = legacyWorkspace({ targetTitle: target.title });
    mismatched.sourceAssets[0] = { ...mismatched.sourceAssets[0], contentHash: "sha256:other" };
    const rejected = proposeLegacyResearchMigration(workspace, mismatched, now);
    expect(rejected.status).toBe("unchanged");
    expect(rejected.snapshot).toBe(workspace);
    expect(rejected.skipped).toContainEqual(expect.objectContaining({
      kind: "evidence",
      reason: expect.stringContaining("contentHash")
    }));
  });

  test("moves compatible jobs into the active Research Round while keeping command output history-only", () => {
    const started = startResearchSearchRound(plannedResearchWorkspace(), {
      planId: "plan-migration",
      createdAt: now
    });
    const target = started.graph.nodes.find((node) => node.kind === "question")!;
    const legacy = legacyWorkspace({ targetTitle: target.title, includeEvidence: false, includeCandidate: false });
    legacy.jobs = [
      job("job-extract", "extract_evidence", "running"),
      {
        ...job("job-digest", "create_digest", "completed"),
        dependsOnJobIds: ["job-extract"],
        finishedAt: now
      },
      { ...job("job-command", "run_command", "completed"), finishedAt: now }
    ];
    legacy.executionRuns = [executionRun()];

    const result = proposeLegacyResearchMigration(started, legacy, now);

    expect(result.status).toBe("proposed");
    expect(result.researchTaskIds).toEqual([
      "legacy-task-job-extract",
      "legacy-task-job-digest"
    ]);
    expect(result.snapshot.researchOrchestration.tasks).toContainEqual(expect.objectContaining({
      id: "legacy-task-job-extract",
      kind: "extract",
      status: "in_progress",
      inputNodeIds: [target.id]
    }));
    expect(result.snapshot.researchOrchestration.tasks).toContainEqual(expect.objectContaining({
      id: "legacy-task-job-digest",
      kind: "synthesize",
      status: "completed",
      dependsOnTaskIds: ["legacy-task-job-extract"]
    }));
    expect(result.snapshot.researchOrchestration.rounds[0].taskIds).toEqual(expect.arrayContaining(result.researchTaskIds));
    expect(result.snapshot.researchOrchestration.plans[0].taskIds).toEqual(expect.arrayContaining(result.researchTaskIds));
    expect(result.snapshot.agentRuns).toEqual(started.agentRuns);
    expect(result.executionHistory).toEqual([
      expect.objectContaining({ id: "run-command", rawPayloadOmitted: true, resultSummary: "命令已运行。" })
    ]);
    expect(result.executionHistory[0]).not.toHaveProperty("stdout");
    expect(result.skipped).toContainEqual(expect.objectContaining({ id: "job-command", kind: "job" }));
    expect(serializeKnowledgeWorkspace(result.snapshot, now)).toContain("legacy-task-job-digest");
  });

  test("rejects malformed legacy JSON and candidate endpoint drift without mutating the graph", () => {
    expect(() => parseLegacyResearchWorkspace(JSON.stringify({ map: { nodes: [], edges: [] } })))
      .toThrow(/legacy Research workspace/i);

    const duplicate = legacyWorkspace({ targetTitle: "核心原理", includeEvidence: false, includeCandidate: false });
    duplicate.jobs = [job("duplicate", "extract_evidence", "queued"), job("duplicate", "create_digest", "queued")];
    expect(() => parseLegacyResearchWorkspace(JSON.stringify(duplicate))).toThrow(/duplicate/i);

    const colliding = legacyWorkspace({ targetTitle: "核心原理", includeEvidence: false, includeCandidate: false });
    colliding.jobs = [job("collision one", "extract_evidence", "queued"), job("collision-one", "create_digest", "queued")];
    expect(() => parseLegacyResearchWorkspace(JSON.stringify(colliding))).toThrow(/collide after normalization/i);

    const workspace = workspaceWithSource();
    const target = workspace.graph.nodes.find((node) => node.title === "核心原理")!;
    const legacy = legacyWorkspace({ targetTitle: target.title, includeEvidence: false });
    legacy.candidates[0].edge = { ...legacy.candidates[0].edge, fromNodeId: "another-parent" };
    const result = proposeLegacyResearchMigration(workspace, legacy, now);
    expect(result.status).toBe("unchanged");
    expect(result.snapshot.graph).toBe(workspace.graph);
    expect(result.skipped).toContainEqual(expect.objectContaining({
      kind: "candidate",
      reason: expect.stringContaining("endpoint")
    }));
  });
});

function workspaceWithSource(): KnowledgeWorkspaceSnapshot {
  const workspace = createProjectWorkspace({
    mode: "understand",
    title: "Legacy migration",
    subjectKind: "technology"
  });
  const source: KnowledgeSourceAsset = {
    id: "source-v2",
    logicalSourceId: "logical-source-v2",
    version: 1,
    spaceId: workspace.space.id,
    inventoryKind: "document",
    format: "text",
    title: "Legacy source",
    uri: "https://example.test/legacy.txt",
    mediaType: "text/plain",
    contentHash: legacyHash,
    byteLength: 42,
    immutable: true,
    createdAt: now
  };
  return { ...workspace, knowledgeSourceAssets: [source] };
}

function legacyWorkspace(input: {
  targetTitle: string;
  candidateStatus?: CandidateResult["status"];
  includeEvidence?: boolean;
  includeCandidate?: boolean;
}): ResearchWorkspaceSnapshot {
  const includeEvidence = input.includeEvidence ?? true;
  const includeCandidate = input.includeCandidate ?? true;
  const target = researchNode("legacy-target", input.targetTitle, includeEvidence ? ["legacy-anchor"] : []);
  const candidateNode = researchNode("legacy-candidate", "旧候选判断", includeEvidence ? ["legacy-anchor"] : []);
  candidateNode.kind = "finding";
  candidateNode.parentId = target.id;
  const candidate: CandidateResult = {
    id: "legacy-candidate-result",
    groupId: "legacy-group",
    jobId: "legacy-job",
    parentNodeId: target.id,
    node: candidateNode,
    edge: {
      id: "legacy-candidate-edge",
      fromNodeId: target.id,
      toNodeId: candidateNode.id,
      kind: "decomposes_to",
      confidence: 0.8,
      createdBy: "agent",
      createdAt: now
    },
    status: input.candidateStatus ?? "pending_review",
    createdAt: now
  };
  return {
    object: {
      id: "legacy-object",
      kind: "topic",
      title: "Legacy workspace",
      createdAt: now,
      updatedAt: now,
      status: "mapped",
      metadata: {}
    },
    session: {
      id: "legacy-session",
      objectId: "legacy-object",
      title: "Legacy session",
      activeMapId: "legacy-map",
      activeThreadIds: ["legacy-thread"],
      status: "active",
      createdAt: now,
      updatedAt: now
    },
    threads: [{
      id: "legacy-thread",
      sessionId: "legacy-session",
      mapId: "legacy-map",
      kind: "main",
      title: "Legacy thread",
      focusNodeIds: [target.id],
      sourceAssetIds: ["legacy-source"],
      jobIds: [],
      mergePolicy: "auto_create_candidates",
      status: "completed",
      createdAt: now,
      updatedAt: now
    }],
    map: {
      id: "legacy-map",
      sessionId: "legacy-session",
      title: "Legacy map",
      rootNodeId: target.id,
      nodes: [target],
      edges: [],
      createdAt: now,
      updatedAt: now
    },
    sourceAssets: includeEvidence ? [{
      id: "legacy-source",
      objectId: "legacy-object",
      kind: "file",
      title: "Legacy source",
      uri: "https://example.test/legacy.txt",
      analysisState: "analyzed",
      contentHash: legacyHash,
      metadata: {},
      createdAt: now
    }] : [],
    evidenceAnchors: includeEvidence ? [{
      id: "legacy-anchor",
      objectId: "legacy-object",
      sourceAssetId: "legacy-source",
      uri: "https://example.test/legacy.txt",
      title: "Legacy evidence",
      quote: "A source-backed legacy statement.",
      text: "A source-backed legacy statement.",
      reason: "Supports the mapped target.",
      lineStart: 1,
      lineEnd: 1,
      createdAt: now
    }] : [],
    actions: [],
    jobs: [],
    parallelGroups: [],
    executionRuns: [],
    sideInquiries: [],
    conceptNotes: [],
    knowledgeDigests: [],
    candidates: includeCandidate ? [candidate] : []
  };
}

function researchNode(id: string, title: string, evidenceIds: string[]): ResearchNode {
  return {
    id,
    mapId: "legacy-map",
    kind: "concept",
    title,
    summary: `Legacy summary for ${title}`,
    depth: 1,
    order: 1,
    expansionState: "expanded",
    status: "understood",
    markers: [],
    evidenceIds,
    actionIds: [],
    inquiryIds: [],
    conceptNoteIds: [],
    createdBy: "agent",
    createdAt: now,
    updatedAt: now
  };
}

function job(id: string, kind: AgentJob["kind"], status: AgentJob["status"]): AgentJob {
  return {
    id,
    sessionId: "legacy-session",
    threadId: "legacy-thread",
    mapId: "legacy-map",
    nodeIds: ["legacy-target"],
    sourceAssetIds: [],
    kind,
    title: id,
    status,
    priority: "normal",
    dependsOnJobIds: [],
    outputNodeIds: [],
    outputEvidenceIds: [],
    outputRunIds: [],
    outputDigestIds: [],
    createdAt: now
  };
}

function executionRun(): ExecutionRun {
  return {
    id: "run-command",
    jobId: "job-command",
    actionId: "legacy-action",
    nodeId: "legacy-target",
    command: "tool --token should-not-persist",
    startedAt: now,
    finishedAt: now,
    status: "passed",
    exitCode: 0,
    stdout: "secret raw output",
    resultSummary: "命令已运行。"
  };
}

function plannedResearchWorkspace(): KnowledgeWorkspaceSnapshot {
  const workspace = createProjectWorkspace({
    mode: "research",
    title: "Legacy job migration",
    subjectKind: "question"
  });
  const question = workspace.graph.nodes.find((node) => node.kind === "question")!;
  const orchestration: ResearchOrchestration = {
    briefs: [{
      id: "brief-migration",
      projectId: workspace.project.id,
      primaryQuestionNodeId: question.id,
      secondaryQuestionNodeIds: [],
      objective: "迁移仍有价值的旧研究任务。",
      scope: {
        description: "当前 Project。",
        time: { asOf: now },
        geographies: [],
        units: [],
        inclusionCriteria: ["可审计旧任务"],
        exclusionCriteria: ["原始命令输出"]
      },
      successCriteria: ["任务进入正式编排"],
      seedSourceIds: [],
      status: "ready",
      revision: 1,
      createdBy: "user",
      createdAt: now,
      updatedAt: now
    }],
    plans: [{
      id: "plan-migration",
      projectId: workspace.project.id,
      briefId: "brief-migration",
      strategy: "仅迁移可映射的研究任务。",
      taskIds: [],
      verificationRequirements: [],
      status: "draft",
      revision: 1,
      createdBy: "agent",
      createdAt: now,
      updatedAt: now
    }],
    tasks: [],
    rounds: [],
    searchQueries: [],
    verificationRecords: []
  };
  return { ...workspace, researchOrchestration: orchestration };
}
