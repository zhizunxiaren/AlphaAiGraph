import { expect, test } from "vitest";
import {
  acceptCandidateGraphPatch,
  createKnowledgeWorkspace,
  proposeKnowledgeAnswer,
  proposeKnowledgeDrillDown
} from "./knowledgeEngine";
import { deriveKnowledgeWorkspaceInsights } from "./knowledgeInsights";

test("reports first-layer leaves as unexplored without claiming they are understood", () => {
  const workspace = createKnowledgeWorkspace("Insight fixture");
  const insights = deriveKnowledgeWorkspaceInsights(workspace);

  expect(insights.scope).toMatchObject({
    projectNodeCount: 6,
    expandedNodeCount: 1,
    resolvedNodeCount: 0,
    maxDepth: 1,
    explorationCoveragePercent: 17
  });
  expect(insights.scope.hint).toContain("第一层地图");
  expect(insights.gaps.filter((gap) => gap.kind === "unexpanded")).toHaveLength(5);
  expect(insights.unresolvedQuestions).toEqual([]);
});

test("distinguishes unanswered questions from candidate answers until understanding is confirmed", () => {
  let workspace = createKnowledgeWorkspace("Question insight");
  const target = workspace.graph.nodes[1];
  workspace = proposeKnowledgeDrillDown(workspace, target.id);
  workspace = acceptCandidateGraphPatch(workspace, workspace.candidatePatches.at(-1)!.id);
  let insights = deriveKnowledgeWorkspaceInsights(workspace);
  expect(insights.unresolvedQuestions.filter((question) => question.state === "unanswered").length).toBeGreaterThanOrEqual(2);

  workspace = proposeKnowledgeAnswer(workspace, target.id, "这个判断的证据是什么？");
  workspace = acceptCandidateGraphPatch(workspace, workspace.candidatePatches.at(-1)!.id);
  insights = deriveKnowledgeWorkspaceInsights(workspace);
  expect(insights.unresolvedQuestions).toContainEqual(expect.objectContaining({
    title: "这个判断的证据是什么？",
    state: "candidate_answer",
    answerNodeIds: [expect.stringContaining("-answer-")]
  }));
});

test("prioritizes uncertainty, source conflicts, and evidence gaps", () => {
  const workspace = createKnowledgeWorkspace("Gap priority");
  const [root, first, second, third] = workspace.graph.nodes;
  const graph = {
    ...workspace.graph,
    nodes: workspace.graph.nodes.map((node) => {
      if (node.id === first.id) return { ...node, kind: "uncertainty" as const };
      if (node.id === second.id) return { ...node, sourceStatus: "conflicted" as const };
      if (node.id === third.id) return { ...node, kind: "claim" as const, sourceStatus: "unlinked" as const };
      return node;
    })
  };
  const insights = deriveKnowledgeWorkspaceInsights({ ...workspace, graph, selectedNodeId: root.id });

  expect(insights.gaps.slice(0, 3).map((gap) => gap.kind)).toEqual(expect.arrayContaining([
    "uncertainty",
    "conflicted_source"
  ]));
  expect(insights.gaps.some((gap) => gap.kind === "needs_evidence" && gap.nodeId === third.id)).toBe(true);
});
