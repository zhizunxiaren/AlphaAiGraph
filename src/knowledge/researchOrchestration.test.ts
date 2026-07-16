// @vitest-environment node
import { describe, expect, test } from "vitest";
import type { KnowledgeWorkspaceSnapshot, ResearchOrchestration } from "../types";
import { createProjectWorkspace, knowledgeNow } from "./knowledgeEngine";
import { assertResearchOrchestration, validateResearchOrchestration } from "./researchOrchestration";
import { deserializeKnowledgeWorkspace, serializeKnowledgeWorkspace } from "./workspacePersistence";

describe("research orchestration contract", () => {
  test("coordinates brief, plan, task, round, query, and verification by canonical references", () => {
    const workspace = researchWorkspace();

    expect(validateResearchOrchestration(workspace)).toEqual([]);
    expect(() => assertResearchOrchestration(workspace)).not.toThrow();

    const restored = deserializeKnowledgeWorkspace(serializeKnowledgeWorkspace(workspace, knowledgeNow));
    expect(restored.researchOrchestration).toEqual(workspace.researchOrchestration);
    expect(restored.researchOrchestration.searchQueries[0].resultSourceIds).toEqual([]);
  });

  test("requires every completed round to produce durable graph, source, or verification progress", () => {
    const workspace = researchWorkspace();
    workspace.researchOrchestration.rounds[0].outputs = emptyOutputs();

    expect(validateResearchOrchestration(workspace)).toContain(
      "completed round round-1 must advance research state; graph edges alone are not progress"
    );
  });

  test("rejects orchestration that escapes its research project, plan, round, or primary graph", () => {
    const workspace = researchWorkspace();
    workspace.project.mode = "understand";
    workspace.projects[0].mode = "understand";
    workspace.researchOrchestration.searchQueries[0].roundId = "missing-round";
    workspace.researchOrchestration.verificationRecords[0].targetNodeId = "detached-claim";

    const errors = validateResearchOrchestration(workspace);
    expect(errors).toEqual(expect.arrayContaining([
      "brief brief-1 must belong to a research project",
      "query query-1 references unknown round missing-round",
      "verification verification-1 target references unknown id detached-claim"
    ]));
  });
});

function researchWorkspace(): KnowledgeWorkspaceSnapshot {
  const workspace = createProjectWorkspace({
    mode: "research",
    title: "Research contract fixture",
    subjectKind: "question"
  });
  const question = workspace.graph.nodes.find((node) => node.kind === "question")!;
  const orchestration: ResearchOrchestration = {
    briefs: [{
      id: "brief-1",
      projectId: workspace.project.id,
      primaryQuestionNodeId: question.id,
      secondaryQuestionNodeIds: [],
      objective: "形成有来源、可复核的判断。",
      scope: {
        description: "评估当前公开证据。",
        time: { asOf: knowledgeNow },
        geographies: ["global"],
        units: ["document"],
        inclusionCriteria: ["可追溯来源"],
        exclusionCriteria: ["匿名转述"]
      },
      successCriteria: ["完成正反证据核验"],
      seedSourceIds: [],
      status: "ready",
      revision: 1,
      createdBy: "user",
      createdAt: knowledgeNow,
      updatedAt: knowledgeNow
    }],
    plans: [{
      id: "plan-1",
      projectId: workspace.project.id,
      briefId: "brief-1",
      strategy: "先查原始来源，再搜索反证并交叉核验。",
      taskIds: ["task-1"],
      verificationRequirements: ["primary_source_traceability", "support_and_opposition"],
      maxRounds: 3,
      status: "active",
      revision: 1,
      createdBy: "agent",
      createdAt: knowledgeNow,
      updatedAt: knowledgeNow
    }],
    tasks: [{
      id: "task-1",
      projectId: workspace.project.id,
      planId: "plan-1",
      roundId: "round-1",
      kind: "search",
      title: "搜索原始来源",
      objective: "定位能够直接回答核心问题的原始材料。",
      role: "researcher",
      status: "completed",
      dependsOnTaskIds: [],
      inputNodeIds: [question.id],
      inputSourceIds: [],
      outputNodeIds: [question.id],
      outputSourceIds: [],
      createdAt: knowledgeNow,
      updatedAt: knowledgeNow,
      completedAt: knowledgeNow
    }],
    rounds: [{
      id: "round-1",
      projectId: workspace.project.id,
      planId: "plan-1",
      roundNumber: 1,
      objective: "确认问题边界并暴露首轮证据缺口。",
      taskIds: ["task-1"],
      status: "completed",
      outcome: "insufficient_evidence",
      result: {
        kind: "insufficient_evidence",
        targetNodeIds: [question.id],
        blockingVerificationRecordIds: ["verification-1"],
        failedCheckKinds: [],
        inconclusiveCheckKinds: ["primary_source_traceability"],
        sourceIds: [],
        evidenceNodeIds: [],
        opposingEvidenceNodeIds: [],
        gapNodeIds: [question.id],
        summary: "当前资料不足以支持可靠结论。",
        assessedBy: "system",
        assessedAt: knowledgeNow
      },
      baseline: {
        capturedAt: knowledgeNow,
        graphUpdatedAt: workspace.graph.updatedAt,
        nodeIds: workspace.graph.nodes.map((node) => node.id),
        edgeIds: workspace.graph.edges.map((edge) => edge.id),
        sourceIds: [],
        verificationRecordIds: []
      },
      outputs: {
        ...emptyOutputs(),
        verificationRecordIds: ["verification-1"]
      },
      nextQuestionNodeIds: [question.id],
      startedAt: knowledgeNow,
      completedAt: knowledgeNow,
      createdAt: knowledgeNow,
      updatedAt: knowledgeNow
    }],
    searchQueries: [{
      id: "query-1",
      projectId: workspace.project.id,
      planId: "plan-1",
      taskId: "task-1",
      roundId: "round-1",
      query: "Research contract primary source",
      purpose: "primary_source",
      filters: { domains: [], languages: ["en"], sourceKinds: ["official"] },
      status: "completed",
      resultSourceIds: [],
      deduplicatedSourceIds: [],
      createdAt: knowledgeNow,
      updatedAt: knowledgeNow,
      executedAt: knowledgeNow,
      completedAt: knowledgeNow
    }],
    verificationRecords: [{
      id: "verification-1",
      projectId: workspace.project.id,
      planId: "plan-1",
      roundId: "round-1",
      taskId: "task-1",
      targetNodeId: question.id,
      checkKind: "primary_source_traceability",
      status: "inconclusive",
      sourceIds: [],
      evidenceNodeIds: [],
      opposingEvidenceNodeIds: [],
      evidenceProfiles: [],
      alternativeExplanationNodeIds: [],
      finding: "首轮未定位到足够的原始来源，需要进入下一轮。",
      checkedBy: "agent",
      checkedAt: knowledgeNow,
      createdAt: knowledgeNow
    }]
  };
  return { ...workspace, researchOrchestration: orchestration };
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
