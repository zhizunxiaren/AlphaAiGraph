// @vitest-environment node
import { expect, test } from "vitest";
import { acceptCandidateGraphPatch, createProjectWorkspace } from "./knowledgeEngine";
import {
  deriveInterviewerProgress,
  interviewerPolicy,
  proposeInterviewAnswer
} from "./interviewerPolicy";

test("adapts the Interviewer policy to the visible Systematize target", () => {
  const workspace = createSystematizeWorkspace();
  const progress = deriveInterviewerProgress(workspace, workspace.selectedNodeId);

  expect(interviewerPolicy).toMatchObject({
    role: "Interviewer",
    requiresExplicitContext: true,
    writesThroughCandidatePatchOnly: true
  });
  expect(progress).toMatchObject({ completedCount: 0, totalCount: 6, isComplete: false });
  expect(progress.nextPrompt).toMatchObject({ dimension: "goal", label: "实际目标", answerKind: "experience" });
  expect(progress.nextPrompt?.question).toContain(workspace.project.goal);
  expect(progress.nextPrompt?.question).toContain(workspace.graph.nodes.find((node) => node.id === workspace.selectedNodeId)!.title);
});

test("externalizes one answer as contextual user knowledge behind a Candidate Graph Patch", () => {
  const initial = createSystematizeWorkspace();
  const before = structuredClone(initial);
  const proposed = proposeInterviewAnswer(initial, {
    targetNodeId: initial.selectedNodeId,
    answer: "我用它来降低支付服务重试造成的级联故障。",
    context: "支付服务，峰值 2000 RPS，5 人后端团队",
    constraints: "请求必须具备幂等键",
    exceptions: "第三方接口不支持幂等时需要人工补偿",
    observedAt: "2026-07-14T12:00:00.000Z"
  });

  expect(initial).toEqual(before);
  expect(proposed.graph).toEqual(initial.graph);
  expect(proposed.agentRequests.at(-1)).toMatchObject({ action: "interview", status: "proposed" });
  const patch = proposed.candidatePatches.at(-1)!;
  expect(patch).toMatchObject({ action: "interview", targetNodeId: initial.selectedNodeId, focusNodeId: initial.selectedNodeId, status: "pending_review" });
  const answerNode = patch.operations.find((operation) =>
    operation.kind === "create_node" && operation.node.tags.includes("访谈维度:goal")
  );
  expect(answerNode).toMatchObject({
    kind: "create_node",
    node: {
      kind: "experience",
      createdBy: "user",
      epistemicStatus: "user_asserted",
      scope: {
        kind: "context_specific",
        description: "支付服务，峰值 2000 RPS，5 人后端团队"
      },
      temporalValidity: { status: "current", observedAt: "2026-07-14T12:00:00.000Z" }
    }
  });
  expect(patch.operations).toEqual(expect.arrayContaining([
    expect.objectContaining({
      kind: "create_node",
      node: expect.objectContaining({ kind: "topic", summary: "支付服务，峰值 2000 RPS，5 人后端团队", tags: expect.arrayContaining(["访谈上下文"]) })
    })
  ]));
  expect(patch.operations).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: "create_conversation" }),
    expect.objectContaining({
      kind: "create_edge",
      edge: expect.objectContaining({ kind: "valid_in_context", rationale: "支付服务，峰值 2000 RPS，5 人后端团队" })
    })
  ]));
  expect(() => proposeInterviewAnswer(proposed, {
    targetNodeId: initial.selectedNodeId,
    answer: "duplicate",
    context: "same context"
  })).toThrow("请先审核当前访谈");

  const accepted = acceptCandidateGraphPatch(proposed, patch.id);
  expect(accepted.selectedNodeId).toBe(initial.selectedNodeId);
  expect(accepted.conversations).toHaveLength(1);
  expect(deriveInterviewerProgress(accepted, initial.selectedNodeId)).toMatchObject({
    completedDimensions: ["goal"],
    completedCount: 1,
    nextPrompt: { dimension: "procedure" }
  });
});

test("completes one governed six-dimension interview round", () => {
  let workspace = createSystematizeWorkspace();
  const targetNodeId = workspace.selectedNodeId;

  for (let index = 0; index < interviewerPolicy.dimensions.length; index += 1) {
    const progress = deriveInterviewerProgress(workspace, targetNodeId);
    workspace = proposeInterviewAnswer(workspace, {
      targetNodeId,
      answer: `第 ${index + 1} 轮用户经验`,
      context: "分布式后端服务的生产环境"
    });
    const patch = workspace.candidatePatches.at(-1)!;
    expect(patch.title).toContain(progress.nextPrompt!.label);
    workspace = acceptCandidateGraphPatch(workspace, patch.id);
  }

  const progress = deriveInterviewerProgress(workspace, targetNodeId);
  expect(progress).toMatchObject({ completedCount: 6, totalCount: 6, isComplete: true, nextPrompt: undefined });
  expect(workspace.graph.nodes.filter((node) => node.tags.includes(`访谈目标:${targetNodeId}`))).toHaveLength(18);
  expect(workspace.conversations).toHaveLength(6);
});

test("requires a writable Systematize Project and explicit context", () => {
  const systematize = createSystematizeWorkspace();
  const understand = createProjectWorkspace({ mode: "understand", title: "Interview boundary", subjectKind: "topic" });
  expect(() => proposeInterviewAnswer(systematize, {
    targetNodeId: systematize.selectedNodeId,
    answer: "A useful practice",
    context: "  "
  })).toThrow("必须明确");
  expect(() => proposeInterviewAnswer(understand, {
    targetNodeId: understand.selectedNodeId,
    answer: "A useful practice",
    context: "Production"
  })).toThrow("only available in a Systematize Project");
});

function createSystematizeWorkspace() {
  return createProjectWorkspace({
    mode: "systematize",
    title: "Distributed systems practice",
    subjectKind: "topic",
    goal: "梳理可复用的生产经验"
  });
}
