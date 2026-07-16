import { describe, expect, test } from "vitest";
import type { CandidateGraphPatch, KnowledgeEdge, KnowledgeNode, KnowledgeWorkspaceSnapshot } from "../types";
import { createKnowledgeMetadata } from "./knowledgeMetadata";
import { acceptCandidateGraphPatch, createProjectWorkspace, knowledgeNow, rejectCandidateGraphPatch } from "./knowledgeEngine";
import { deriveImpactAssessment } from "./impactAssessment";
import {
  acceptImpactReviewTask,
  proposeImpactReviewTaskModification,
  rejectImpactReviewTask
} from "./impactReview";
import { deserializeKnowledgeWorkspace, serializeKnowledgeWorkspace } from "./workspacePersistence";

describe("impact review tasks", () => {
  test("creates one pending task per affected node only after correction acceptance", () => {
    const proposed = correctionWorkspace();
    expect(proposed.impactReviewTasks).toEqual([]);

    const accepted = acceptCandidateGraphPatch(proposed, "correction-patch");
    expect(accepted.impactReviewTasks).toHaveLength(1);
    expect(accepted.impactReviewTasks[0]).toMatchObject({
      sourceCorrectionPatchId: "correction-patch",
      nodeId: "downstream-summary",
      category: "summary",
      status: "pending_review",
      history: [{ action: "created" }]
    });
    expect(deserializeKnowledgeWorkspace(serializeKnowledgeWorkspace(accepted)).impactReviewTasks).toEqual(accepted.impactReviewTasks);
  });

  test("records accepting and rejecting review decisions without changing graph nodes", () => {
    const initial = acceptCandidateGraphPatch(correctionWorkspace(), "correction-patch");
    const taskId = initial.impactReviewTasks[0].id;
    const accepted = acceptImpactReviewTask(initial, taskId, "总结仍成立。", "2026-07-14T01:00:00.000Z");
    expect(accepted.impactReviewTasks[0]).toMatchObject({
      status: "accepted",
      history: [{ action: "created" }, { action: "accepted", note: "总结仍成立。" }]
    });
    expect(accepted.graph).toEqual(initial.graph);

    const rejected = rejectImpactReviewTask(initial, taskId, "暂不复核。", "2026-07-14T01:01:00.000Z");
    expect(rejected.impactReviewTasks[0]).toMatchObject({
      status: "rejected",
      history: [{ action: "created" }, { action: "rejected", note: "暂不复核。" }]
    });
    expect(rejected.graph).toEqual(initial.graph);
  });

  test("keeps modification proposals behind patch review and preserves rejected and accepted attempts", () => {
    const initial = acceptCandidateGraphPatch(correctionWorkspace(), "correction-patch");
    const taskId = initial.impactReviewTasks[0].id;
    const firstProposal = proposeImpactReviewTaskModification(initial, taskId, {
      title: "缓存策略 · 修订总结",
      summary: "第一次修订尝试。",
      note: "上游适用范围已经收窄。"
    }, "2026-07-14T02:00:00.000Z");
    const firstPatch = firstProposal.candidatePatches.at(-1)!;
    expect(firstProposal.graph.nodes.find((node) => node.id === "downstream-summary")?.summary).toBe("旧总结");
    expect(firstProposal.impactReviewTasks[0]).toMatchObject({
      status: "pending_review",
      history: [{ action: "created" }, { action: "modification_proposed", patchId: firstPatch.id }]
    });

    const firstRejected = rejectCandidateGraphPatch(firstProposal, firstPatch.id);
    expect(firstRejected.impactReviewTasks[0]).toMatchObject({
      status: "pending_review",
      history: [
        { action: "created" },
        { action: "modification_proposed" },
        { action: "modification_rejected", patchId: firstPatch.id }
      ]
    });
    expect(firstRejected.graph.nodes.find((node) => node.id === "downstream-summary")?.summary).toBe("旧总结");

    const secondProposal = proposeImpactReviewTaskModification(firstRejected, taskId, {
      title: "缓存策略 · 修订总结",
      summary: "纠偏后只在允许短暂陈旧时成立。"
    }, "2026-07-14T03:00:00.000Z");
    const secondPatch = secondProposal.candidatePatches.at(-1)!;
    const modified = acceptCandidateGraphPatch(secondProposal, secondPatch.id);
    expect(modified.graph.nodes.find((node) => node.id === "downstream-summary")).toMatchObject({
      title: "缓存策略 · 修订总结",
      summary: "纠偏后只在允许短暂陈旧时成立。"
    });
    expect(modified.impactReviewTasks[0]).toMatchObject({
      status: "modified",
      history: expect.arrayContaining([
        expect.objectContaining({ action: "modification_rejected", patchId: firstPatch.id }),
        expect.objectContaining({ action: "modified", patchId: secondPatch.id })
      ])
    });
  });
});

function correctionWorkspace(): KnowledgeWorkspaceSnapshot {
  const base = createProjectWorkspace({ mode: "systematize", title: "缓存策略", subjectKind: "topic" });
  const root = base.graph.nodes.find((node) => node.id === base.project.subject.rootNodeId)!;
  const summary: KnowledgeNode = {
    id: "downstream-summary",
    kind: "synthesis",
    title: "缓存策略 · 阶段总结",
    summary: "旧总结",
    status: "open",
    ...createKnowledgeMetadata({ kind: "synthesis", createdBy: "agent", creatorId: "test", scopeContextId: base.project.id }),
    depth: root.depth + 1,
    tags: ["总结"],
    sourceRefs: [],
    createdAt: knowledgeNow,
    updatedAt: knowledgeNow
  };
  const edge: KnowledgeEdge = {
    id: "downstream-summary-summarizes-root",
    fromNodeId: summary.id,
    toNodeId: root.id,
    kind: "summarizes",
    confidence: 1,
    rationale: "The summary depends on the corrected root knowledge.",
    createdBy: "agent",
    createdAt: knowledgeNow
  };
  const graph = { ...base.graph, nodes: base.graph.nodes.concat(summary), edges: base.graph.edges.concat(edge) };
  const patchBase: CandidateGraphPatch = {
    id: "correction-patch",
    requestId: "correction-request",
    action: "correct",
    targetNodeId: root.id,
    focusNodeId: root.id,
    title: "纠偏缓存策略",
    summary: "测试纠偏",
    revision: 1,
    createdBy: "agent",
    operations: [],
    confidence: 1,
    status: "pending_review",
    createdAt: knowledgeNow
  };
  const snapshot = {
    ...base,
    graph,
    agentRequests: base.agentRequests.concat({
      id: patchBase.requestId,
      action: "correct",
      selectionId: base.selection.id,
      prompt: "纠偏",
      status: "proposed",
      createdAt: knowledgeNow
    })
  };
  return {
    ...snapshot,
    candidatePatches: [{
      ...patchBase,
      impactAssessment: deriveImpactAssessment(snapshot, {
        patchId: patchBase.id,
        targetNodeId: patchBase.targetNodeId,
        assessedAt: patchBase.createdAt
      })
    }]
  };
}
