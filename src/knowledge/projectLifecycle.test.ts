import { expect, test } from "vitest";
import {
  createKnowledgeWorkspace,
  createProjectWorkspace,
  proposeKnowledgeSummary
} from "./knowledgeEngine";
import {
  assessUnderstandProjectCompletion,
  completeUnderstandProject,
  isProjectWritable,
  reopenUnderstandProject
} from "./projectLifecycle";
import { deserializeKnowledgeWorkspace, serializeKnowledgeWorkspace } from "./workspacePersistence";

const completedAt = "2026-07-14T10:00:00.000Z";
const reopenedAt = "2026-07-14T11:00:00.000Z";

test("requires explicit acknowledgement of open knowledge while allowing user-defined completion depth", () => {
  const workspace = createKnowledgeWorkspace("Lifecycle fixture");
  const assessment = assessUnderstandProjectCompletion(workspace);

  expect(assessment).toMatchObject({
    canComplete: true,
    gapCount: 5,
    unresolvedQuestionCount: 0,
    requiresOpenItemAcknowledgement: true
  });
  expect(() => completeUnderstandProject(workspace, {
    completedAt,
    acknowledgeOpenItems: false
  })).toThrow("[open_items_unacknowledged]");

  const completed = completeUnderstandProject(workspace, {
    completedAt,
    acknowledgeOpenItems: true
  });
  expect(completed.project).toMatchObject({
    status: "completed",
    workflow: { mode: "understand", phase: "completed" },
    completedAt,
    updatedAt: completedAt
  });
  expect(completed.projects.find((project) => project.id === completed.project.id)).toEqual(completed.project);
  expect(isProjectWritable(completed)).toBe(false);
  expect(proposeKnowledgeSummary(completed, completed.project.subject.rootNodeId)).toBe(completed);
});

test("blocks completion while a Candidate Graph Patch is pending review", () => {
  const workspace = proposeKnowledgeSummary(
    createKnowledgeWorkspace("Pending lifecycle"),
    "knowledge-pending-lifecycle"
  );
  expect(assessUnderstandProjectCompletion(workspace)).toMatchObject({
    canComplete: false,
    pendingPatchIds: ["graph-patch-1"]
  });
  expect(() => completeUnderstandProject(workspace, {
    completedAt,
    acknowledgeOpenItems: true
  })).toThrow("[pending_patches]");
});

test("round trips a completed Project, then reopens it at the same graph position", () => {
  const workspace = createKnowledgeWorkspace("Restore lifecycle");
  const completed = completeUnderstandProject(workspace, {
    completedAt,
    acknowledgeOpenItems: true
  });
  const restored = deserializeKnowledgeWorkspace(serializeKnowledgeWorkspace(completed, completedAt));
  const reopened = reopenUnderstandProject(restored, reopenedAt);

  expect(reopened.project).toMatchObject({
    status: "reopened",
    workflow: { mode: "understand", phase: "reviewing" },
    completedAt,
    updatedAt: reopenedAt
  });
  expect(reopened.selectedNodeId).toBe(workspace.selectedNodeId);
  expect(reopened.graph).toEqual(workspace.graph);
  expect(isProjectWritable(reopened)).toBe(true);
});

test("does not apply the Understand lifecycle to other Project modes", () => {
  const research = createProjectWorkspace({ mode: "research", title: "Research lifecycle", subjectKind: "question" });
  expect(() => assessUnderstandProjectCompletion(research)).toThrow("[unsupported_mode]");
  expect(() => reopenUnderstandProject(research, reopenedAt)).toThrow("[unsupported_mode]");
});
