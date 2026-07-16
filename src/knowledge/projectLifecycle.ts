import type { KnowledgeWorkspaceSnapshot, Project } from "../types";
import { deriveKnowledgeWorkspaceInsights } from "./knowledgeInsights";

export interface ProjectCompletionAssessment {
  projectId: string;
  canComplete: boolean;
  pendingPatchIds: string[];
  gapCount: number;
  unresolvedQuestionCount: number;
  requiresOpenItemAcknowledgement: boolean;
  messages: string[];
}

export interface CompleteUnderstandProjectOptions {
  completedAt: string;
  acknowledgeOpenItems: boolean;
}

export class ProjectLifecycleError extends Error {
  constructor(readonly code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = "ProjectLifecycleError";
  }
}

export function assessUnderstandProjectCompletion(
  snapshot: KnowledgeWorkspaceSnapshot
): ProjectCompletionAssessment {
  assertUnderstandMode(snapshot.project);
  const pendingPatchIds = snapshot.candidatePatches
    .filter((patch) => patch.status === "pending_review")
    .map((patch) => patch.id);
  const insights = deriveKnowledgeWorkspaceInsights(snapshot);
  const messages: string[] = [];
  if (pendingPatchIds.length > 0) messages.push(`仍有 ${pendingPatchIds.length} 个候选 Graph Patch 等待审核。`);
  if (insights.gaps.length > 0) messages.push(`仍有 ${insights.gaps.length} 个派生知识缺口。`);
  if (insights.unresolvedQuestions.length > 0) messages.push(`仍有 ${insights.unresolvedQuestions.length} 个未解决问题。`);
  if (messages.length === 0) messages.push("当前没有待审核变更、派生缺口或未解决问题。");
  return {
    projectId: snapshot.project.id,
    canComplete: pendingPatchIds.length === 0,
    pendingPatchIds,
    gapCount: insights.gaps.length,
    unresolvedQuestionCount: insights.unresolvedQuestions.length,
    requiresOpenItemAcknowledgement: insights.gaps.length > 0 || insights.unresolvedQuestions.length > 0,
    messages
  };
}

export function completeUnderstandProject(
  snapshot: KnowledgeWorkspaceSnapshot,
  options: CompleteUnderstandProjectOptions
): KnowledgeWorkspaceSnapshot {
  assertUnderstandMode(snapshot.project);
  assertTimestamp(options.completedAt, "completedAt");
  if (snapshot.project.status === "completed") {
    throw new ProjectLifecycleError("already_completed", "Understand Project is already completed");
  }
  if (snapshot.project.status !== "active" && snapshot.project.status !== "reopened") {
    throw new ProjectLifecycleError("invalid_status", `Cannot complete Project from status ${snapshot.project.status}`);
  }
  const assessment = assessUnderstandProjectCompletion(snapshot);
  if (!assessment.canComplete) {
    throw new ProjectLifecycleError("pending_patches", "Review or reject every pending Graph Patch before completing the Project");
  }
  if (assessment.requiresOpenItemAcknowledgement && !options.acknowledgeOpenItems) {
    throw new ProjectLifecycleError("open_items_unacknowledged", "Explicitly acknowledge remaining gaps and questions before completing");
  }
  const project: Project = {
    ...snapshot.project,
    status: "completed",
    workflow: { mode: "understand", phase: "completed" },
    updatedAt: options.completedAt,
    completedAt: options.completedAt
  };
  return replaceActiveProject(snapshot, project, options.completedAt);
}

export function reopenUnderstandProject(
  snapshot: KnowledgeWorkspaceSnapshot,
  reopenedAt: string
): KnowledgeWorkspaceSnapshot {
  assertUnderstandMode(snapshot.project);
  assertTimestamp(reopenedAt, "reopenedAt");
  if (snapshot.project.status !== "completed") {
    throw new ProjectLifecycleError("not_completed", "Only a completed Understand Project can be reopened");
  }
  const project: Project = {
    ...snapshot.project,
    status: "reopened",
    workflow: { mode: "understand", phase: "reviewing" },
    updatedAt: reopenedAt
  };
  return replaceActiveProject(snapshot, project, reopenedAt);
}

export function isProjectWritable(snapshot: KnowledgeWorkspaceSnapshot): boolean {
  return snapshot.project.status === "active" || snapshot.project.status === "reopened";
}

function replaceActiveProject(
  snapshot: KnowledgeWorkspaceSnapshot,
  project: Project,
  updatedAt: string
): KnowledgeWorkspaceSnapshot {
  return {
    ...snapshot,
    space: { ...snapshot.space, updatedAt },
    project,
    projects: snapshot.projects.map((candidate) => candidate.id === project.id ? project : candidate),
    subject: project.subject
  };
}

function assertUnderstandMode(project: Project): void {
  if (project.mode !== "understand") {
    throw new ProjectLifecycleError("unsupported_mode", "This lifecycle action currently supports Understand Projects only");
  }
}

function assertTimestamp(value: string, name: string): void {
  if (!value.trim() || !Number.isFinite(Date.parse(value))) {
    throw new ProjectLifecycleError("invalid_timestamp", `${name} must be a valid timestamp`);
  }
}
