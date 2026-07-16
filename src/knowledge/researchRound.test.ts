// @vitest-environment node
import { describe, expect, test } from "vitest";
import type {
  AgentRequest,
  CandidateGraphPatch,
  KnowledgeEdge,
  KnowledgeNode,
  KnowledgeWorkspaceSnapshot,
  ResearchOrchestration
} from "../types";
import { createGraphPatchAudit } from "./graphPatch";
import { acceptCandidateGraphPatch, createProjectWorkspace, knowledgeNow } from "./knowledgeEngine";
import { createKnowledgeMetadata } from "./knowledgeMetadata";
import { validateResearchOrchestration } from "./researchOrchestration";
import {
  captureResearchRoundBaseline,
  completeResearchRound,
  deriveResearchRoundProgress
} from "./researchRound";
import { deserializeKnowledgeWorkspace, serializeKnowledgeWorkspace } from "./workspacePersistence";

const startedAt = "2026-07-15T04:00:00.000Z";
const completedAt = "2026-07-15T04:30:00.000Z";

describe("research round progress", () => {
  test("does not count a pending Candidate Graph Patch and completes only after user acceptance", () => {
    const active = activeRoundWorkspace();
    const proposed = proposeRoundClaim(active);

    expect(deriveResearchRoundProgress(proposed, "round-progress-1")).toMatchObject({
      hasMeaningfulProgress: false,
      kinds: []
    });
    expect(() => completeResearchRound(proposed, {
      roundId: "round-progress-1",
      completedAt
    })).toThrow("cannot complete without a new source");

    const accepted = acceptCandidateGraphPatch(proposed, "patch-round-claim");
    const progress = deriveResearchRoundProgress(accepted, "round-progress-1");
    expect(progress).toMatchObject({
      hasMeaningfulProgress: true,
      kinds: ["claim"]
    });
    expect(progress.outputs.claimNodeIds).toEqual(["round-claim"]);
    expect(progress.outputs.edgeIds).toEqual(["round-claim-supports-question"]);

    const completed = completeResearchRound(accepted, {
      roundId: "round-progress-1",
      completedAt
    });
    expect(completed.researchOrchestration.rounds[0]).toMatchObject({
      status: "completed",
      outcome: "advanced",
      completedAt,
      outputs: {
        claimNodeIds: ["round-claim"],
        edgeIds: ["round-claim-supports-question"]
      }
    });
  });

  test("classifies conflict, gap, and stage judgment from new canonical nodes", () => {
    const active = activeRoundWorkspace();
    const nodes = [
      roundNode(active, "round-conflict", "claim", "冲突判断", { epistemicStatus: "contested", tags: ["研究冲突"] }),
      roundNode(active, "round-gap", "question", "尚缺什么证据？"),
      roundNode(active, "round-synthesis", "synthesis", "本轮阶段判断")
    ];
    const snapshot = { ...active, graph: { ...active.graph, nodes: active.graph.nodes.concat(nodes) } };

    expect(deriveResearchRoundProgress(snapshot, "round-progress-1")).toMatchObject({
      kinds: ["claim", "conflict", "gap", "stage_judgment"],
      outputs: {
        claimNodeIds: ["round-conflict"],
        conflictNodeIds: ["round-conflict"],
        gapNodeIds: ["round-gap"],
        synthesisNodeIds: ["round-synthesis"]
      }
    });
  });

  test("persists insufficient evidence as an auditable valid result", () => {
    const active = withBlockingVerification(activeRoundWorkspace());
    const question = active.graph.nodes.find((node) => node.kind === "question")!;
    const completed = completeResearchRound(active, {
      roundId: "round-progress-1",
      completedAt,
      nextQuestionNodeIds: [question.id]
    });
    const round = completed.researchOrchestration.rounds[0];

    expect(round).toMatchObject({
      status: "completed",
      outcome: "insufficient_evidence",
      result: {
        kind: "insufficient_evidence",
        targetNodeIds: [question.id],
        blockingVerificationRecordIds: ["verification-insufficient-1"],
        failedCheckKinds: [],
        inconclusiveCheckKinds: ["primary_source_traceability"],
        sourceIds: [],
        evidenceNodeIds: [],
        opposingEvidenceNodeIds: [],
        gapNodeIds: [question.id],
        assessedBy: "system",
        assessedAt: completedAt
      }
    });
    expect(round.result?.summary).toBe("当前资料不足以支持可靠结论。");
    expect(validateResearchOrchestration(completed)).toEqual([]);

    const restored = deserializeKnowledgeWorkspace(serializeKnowledgeWorkspace(completed, completedAt));
    expect(restored.researchOrchestration.rounds[0].result).toEqual(round.result);
  });

  test("does not allow callers to self-report or hide insufficient evidence", () => {
    const advanced = acceptCandidateGraphPatch(proposeRoundClaim(activeRoundWorkspace()), "patch-round-claim");
    expect(() => completeResearchRound(advanced, {
      roundId: "round-progress-1",
      completedAt,
      outcome: "insufficient_evidence"
    })).toThrow("without a failed or inconclusive verification");

    const blocked = withBlockingVerification(activeRoundWorkspace());
    expect(() => completeResearchRound(blocked, {
      roundId: "round-progress-1",
      completedAt,
      outcome: "advanced"
    })).toThrow("must report insufficient evidence");
  });

  test("rejects a forged insufficient-evidence result", () => {
    const completed = completeResearchRound(withBlockingVerification(activeRoundWorkspace()), {
      roundId: "round-progress-1",
      completedAt
    });
    completed.researchOrchestration.rounds[0].result!.inconclusiveCheckKinds = [];

    expect(validateResearchOrchestration(completed)).toContain(
      "round round-progress-1 inconclusive checks does not match canonical state (missing: primary_source_traceability; unexpected: none)"
    );

    completed.researchOrchestration.rounds[0].outcome = "advanced";
    completed.researchOrchestration.rounds[0].result = undefined;
    expect(validateResearchOrchestration(completed)).toContain(
      "completed round round-progress-1 must report insufficient evidence while verification blockers remain"
    );
  });

  test("reconstructs an auditable result for a legacy insufficient-evidence round", () => {
    const completed = completeResearchRound(withBlockingVerification(activeRoundWorkspace()), {
      roundId: "round-progress-1",
      completedAt
    });
    const document = JSON.parse(serializeKnowledgeWorkspace(completed, completedAt));
    delete document.workspace.researchOrchestration.rounds[0].result;

    const migrated = deserializeKnowledgeWorkspace(JSON.stringify(document));
    expect(migrated.researchOrchestration.rounds[0].result).toEqual(completed.researchOrchestration.rounds[0].result);
  });

  test("rejects pre-existing ids as fabricated round progress", () => {
    const workspace = activeRoundWorkspace();
    const oldHypothesis = workspace.graph.nodes.find((node) => node.kind === "hypothesis")!;
    workspace.researchOrchestration.rounds[0] = {
      ...workspace.researchOrchestration.rounds[0],
      status: "completed",
      outcome: "advanced",
      completedAt,
      updatedAt: completedAt,
      outputs: {
        ...workspace.researchOrchestration.rounds[0].outputs,
        hypothesisNodeIds: [oldHypothesis.id]
      }
    };

    expect(validateResearchOrchestration(workspace)).toContain(
      `round round-progress-1 output node ${oldHypothesis.id} already existed at round start`
    );
  });

  test("does not treat a relationship-only change as meaningful research progress", () => {
    const workspace = activeRoundWorkspace();
    const [root, question] = workspace.graph.nodes;
    const edge: KnowledgeEdge = {
      id: "round-edge-only",
      fromNodeId: root.id,
      toNodeId: question.id,
      kind: "related_to",
      rationale: "A relationship alone does not add research evidence or judgment.",
      createdBy: "agent",
      confidence: 0.5,
      createdAt: completedAt
    };
    workspace.graph.edges.push(edge);
    workspace.researchOrchestration.rounds[0] = {
      ...workspace.researchOrchestration.rounds[0],
      status: "completed",
      outcome: "advanced",
      completedAt,
      updatedAt: completedAt,
      outputs: { ...workspace.researchOrchestration.rounds[0].outputs, edgeIds: [edge.id] }
    };

    expect(validateResearchOrchestration(workspace)).toContain(
      "completed round round-progress-1 must advance research state; graph edges alone are not progress"
    );
  });

  test("reconstructs a safe baseline when loading a pre-baseline schema v2 round", () => {
    const completed = completeResearchRound(
      acceptCandidateGraphPatch(proposeRoundClaim(activeRoundWorkspace()), "patch-round-claim"),
      { roundId: "round-progress-1", completedAt }
    );
    const document = JSON.parse(serializeKnowledgeWorkspace(completed, completedAt));
    delete document.workspace.researchOrchestration.rounds[0].baseline;

    const migrated = deserializeKnowledgeWorkspace(JSON.stringify(document));
    const baseline = migrated.researchOrchestration.rounds[0].baseline;
    expect(baseline.nodeIds).not.toContain("round-claim");
    expect(baseline.nodeIds).toContain(migrated.project.subject.rootNodeId);
    expect(migrated.researchOrchestration.rounds[0].outputs.claimNodeIds).toEqual(["round-claim"]);
  });
});

function activeRoundWorkspace(): KnowledgeWorkspaceSnapshot {
  const workspace = createProjectWorkspace({
    mode: "research",
    title: "Round progress fixture",
    subjectKind: "question"
  });
  const question = workspace.graph.nodes.find((node) => node.kind === "question")!;
  const orchestration: ResearchOrchestration = {
    briefs: [{
      id: "brief-progress",
      projectId: workspace.project.id,
      primaryQuestionNodeId: question.id,
      secondaryQuestionNodeIds: [],
      objective: "验证每轮是否形成正式进展。",
      scope: {
        description: "当前 Project",
        time: { asOf: startedAt },
        geographies: [],
        units: [],
        inclusionCriteria: [],
        exclusionCriteria: []
      },
      successCriteria: ["形成至少一个正式增量"],
      seedSourceIds: [],
      status: "ready",
      revision: 1,
      createdBy: "user",
      createdAt: startedAt,
      updatedAt: startedAt
    }],
    plans: [{
      id: "plan-progress",
      projectId: workspace.project.id,
      briefId: "brief-progress",
      strategy: "先提出可审核 Claim。",
      taskIds: [],
      verificationRequirements: [],
      status: "active",
      revision: 1,
      createdBy: "agent",
      createdAt: startedAt,
      updatedAt: startedAt
    }],
    tasks: [],
    rounds: [],
    searchQueries: [],
    verificationRecords: []
  };
  const withOrchestration = { ...workspace, researchOrchestration: orchestration };
  withOrchestration.researchOrchestration.rounds.push({
    id: "round-progress-1",
    projectId: workspace.project.id,
    planId: "plan-progress",
    roundNumber: 1,
    objective: "产生一个经用户接受的研究增量。",
    taskIds: [],
    status: "active",
    baseline: captureResearchRoundBaseline(withOrchestration, startedAt),
    outputs: emptyOutputs(),
    nextQuestionNodeIds: [],
    startedAt,
    createdAt: startedAt,
    updatedAt: startedAt
  });
  return withOrchestration;
}

function proposeRoundClaim(snapshot: KnowledgeWorkspaceSnapshot): KnowledgeWorkspaceSnapshot {
  const question = snapshot.graph.nodes.find((node) => node.kind === "question")!;
  const claim = roundNode(snapshot, "round-claim", "claim", "本轮候选判断");
  const edge: KnowledgeEdge = {
    id: "round-claim-supports-question",
    fromNodeId: claim.id,
    toNodeId: question.id,
    kind: "answers",
    rationale: "本轮 Claim 回答核心研究问题。",
    createdBy: "agent",
    confidence: 0.7,
    createdAt: knowledgeNow
  };
  const request: AgentRequest = {
    id: "request-round-claim",
    action: "explore",
    selectionId: snapshot.selection.id,
    prompt: "提出本轮 Claim",
    status: "proposed",
    createdAt: knowledgeNow
  };
  const patch: CandidateGraphPatch = {
    id: "patch-round-claim",
    requestId: request.id,
    action: "explore",
    targetNodeId: question.id,
    focusNodeId: claim.id,
    title: "本轮 Claim",
    summary: "接受后才计入本轮进展。",
    revision: 1,
    createdBy: "agent",
    operations: [
      {
        kind: "create_node",
        node: claim,
        audit: createGraphPatchAudit("audit-round-claim", "Create a reviewable research claim", knowledgeNow)
      },
      {
        kind: "create_edge",
        edge,
        audit: createGraphPatchAudit("audit-round-claim-edge", "Connect the accepted claim to the question", knowledgeNow)
      }
    ],
    confidence: 0.7,
    status: "pending_review",
    createdAt: knowledgeNow
  };
  return {
    ...snapshot,
    agentRequests: snapshot.agentRequests.concat(request),
    candidatePatches: snapshot.candidatePatches.concat(patch)
  };
}

function withBlockingVerification(snapshot: KnowledgeWorkspaceSnapshot): KnowledgeWorkspaceSnapshot {
  const question = snapshot.graph.nodes.find((node) => node.kind === "question")!;
  return {
    ...snapshot,
    researchOrchestration: {
      ...snapshot.researchOrchestration,
      verificationRecords: snapshot.researchOrchestration.verificationRecords.concat({
        id: "verification-insufficient-1",
        projectId: snapshot.project.id,
        planId: "plan-progress",
        roundId: "round-progress-1",
        targetNodeId: question.id,
        checkKind: "primary_source_traceability",
        status: "inconclusive",
        sourceIds: [],
        evidenceNodeIds: [],
        opposingEvidenceNodeIds: [],
        evidenceProfiles: [],
        alternativeExplanationNodeIds: [],
        finding: "当前没有可追溯的原始来源。",
        checkedBy: "system",
        checkedAt: completedAt,
        createdAt: completedAt
      })
    }
  };
}

function roundNode(
  snapshot: KnowledgeWorkspaceSnapshot,
  id: string,
  kind: KnowledgeNode["kind"],
  title: string,
  overrides: Partial<KnowledgeNode> = {}
): KnowledgeNode {
  return {
    id,
    kind,
    title,
    summary: `${title}的研究内容。`,
    status: "open",
    ...createKnowledgeMetadata({ kind, createdBy: "agent", creatorId: "research-round-test", scopeContextId: snapshot.project.id }),
    depth: 2,
    tags: [],
    sourceRefs: [],
    createdBy: "agent",
    creatorId: "research-round-test",
    createdAt: knowledgeNow,
    updatedAt: knowledgeNow,
    ...overrides
  };
}

function emptyOutputs() {
  return {
    sourceIds: [],
    factNodeIds: [],
    claimNodeIds: [],
    hypothesisNodeIds: [],
    inferenceNodeIds: [],
    evidenceNodeIds: [],
    conflictNodeIds: [],
    gapNodeIds: [],
    synthesisNodeIds: [],
    edgeIds: [],
    verificationRecordIds: []
  };
}
