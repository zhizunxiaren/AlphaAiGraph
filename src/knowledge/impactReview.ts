import type {
  AgentRequest,
  CandidateGraphPatch,
  ImpactReviewHistoryEntry,
  ImpactReviewRevisionSnapshot,
  ImpactReviewTask,
  KnowledgeWorkspaceSnapshot
} from "../types";
import { createGraphPatchAudit } from "./graphPatch";
import { isProjectWritable } from "./projectLifecycle";
import { projectModelNow } from "./projectModel";

export interface ImpactReviewModificationInput {
  title: string;
  summary: string;
  note?: string;
}

export function createImpactReviewTasks(
  snapshot: KnowledgeWorkspaceSnapshot,
  patch: CandidateGraphPatch,
  createdAt = projectModelNow
): ImpactReviewTask[] {
  if (patch.action !== "correct" || !patch.impactAssessment) return [];
  const nodeIds = new Set(snapshot.graph.nodes.map((node) => node.id));
  return patch.impactAssessment.affectedItems
    .filter((item) => nodeIds.has(item.nodeId))
    .map((item) => {
      const id = `impact-review-${patch.id}-${item.nodeId}`;
      return {
        id,
        sourceCorrectionPatchId: patch.id,
        impactAssessmentId: patch.impactAssessment!.id,
        correctionTargetNodeId: patch.targetNodeId,
        correctedNodeId: patch.focusNodeId,
        nodeId: item.nodeId,
        category: item.category,
        reason: item.reason,
        impactPath: item.path.map((segment) => ({ ...segment })),
        status: "pending_review",
        createdAt,
        updatedAt: createdAt,
        history: [historyEntry(id, 1, "created", createdAt, `纠偏 ${patch.id} 已被接受，节点进入下游影响复核。`, undefined, undefined, undefined, "system")]
      };
    });
}

export function acceptImpactReviewTask(
  snapshot: KnowledgeWorkspaceSnapshot,
  taskId: string,
  note = "已确认该节点在纠偏后仍然成立，无需修改。",
  reviewedAt = projectModelNow
): KnowledgeWorkspaceSnapshot {
  return resolveTask(snapshot, taskId, "accepted", note, reviewedAt);
}

export function rejectImpactReviewTask(
  snapshot: KnowledgeWorkspaceSnapshot,
  taskId: string,
  note = "已拒绝本次复核建议，保留节点现状供后续重新评估。",
  reviewedAt = projectModelNow
): KnowledgeWorkspaceSnapshot {
  return resolveTask(snapshot, taskId, "rejected", note, reviewedAt);
}

export function proposeImpactReviewTaskModification(
  snapshot: KnowledgeWorkspaceSnapshot,
  taskId: string,
  input: ImpactReviewModificationInput,
  proposedAt = projectModelNow
): KnowledgeWorkspaceSnapshot {
  if (!isProjectWritable(snapshot)) return snapshot;
  const task = requirePendingTask(snapshot, taskId);
  assertNoPendingModification(snapshot, taskId);
  const node = snapshot.graph.nodes.find((candidate) => candidate.id === task.nodeId);
  if (!node) throw reviewError("missing_review_node", `Impact review task ${taskId} references a missing node`);
  const title = input.title.trim();
  const summary = input.summary.trim();
  if (!title || !summary) throw reviewError("empty_revision", "Impact review modification requires a title and summary");
  if (title === node.title && summary === node.summary) {
    throw reviewError("unchanged_revision", "Impact review modification must change the title or summary");
  }

  const attempt = snapshot.candidatePatches.filter((patch) => patch.reviewTaskId === taskId).length + 1;
  const requestId = `impact-review-request-${taskId}-${attempt}`;
  const patchId = `impact-review-patch-${taskId}-${attempt}`;
  const before: ImpactReviewRevisionSnapshot = { title: node.title, summary: node.summary };
  const after: ImpactReviewRevisionSnapshot = { title, summary };
  const request: AgentRequest = {
    id: requestId,
    action: "revise",
    selectionId: snapshot.selection.id,
    prompt: input.note?.trim() || `复核并修改受纠偏影响的节点「${node.title}」。`,
    status: "proposed",
    createdAt: proposedAt
  };
  const patch: CandidateGraphPatch = {
    id: patchId,
    requestId,
    action: "revise",
    targetNodeId: node.id,
    focusNodeId: node.id,
    title: `修改受影响节点「${node.title}」`,
    summary: input.note?.trim() || "根据已接受的上游纠偏修订该节点。",
    revision: 1,
    createdBy: "user",
    operations: [{
      kind: "revise_node",
      nodeId: node.id,
      before: node,
      after: { ...node, title, summary, updatedAt: proposedAt },
      audit: createGraphPatchAudit(
        `audit-${patchId}`,
        input.note?.trim() || `Revise ${node.id} after reviewing correction impact`,
        proposedAt,
        "user"
      )
    }],
    confidence: 1,
    status: "pending_review",
    createdAt: proposedAt,
    reviewTaskId: taskId
  };
  return {
    ...snapshot,
    agentRequests: snapshot.agentRequests.concat(request),
    candidatePatches: snapshot.candidatePatches.concat(patch),
    impactReviewTasks: snapshot.impactReviewTasks.map((candidate) => candidate.id === taskId ? {
      ...candidate,
      updatedAt: proposedAt,
      history: candidate.history.concat(historyEntry(
        candidate.id,
        candidate.history.length + 1,
        "modification_proposed",
        proposedAt,
        input.note?.trim() || "已提交节点修改，等待 Candidate Graph Patch 审核。",
        patchId,
        before,
        after
      ))
    } : candidate)
  };
}

export function assertImpactReviewPatchCurrent(
  snapshot: KnowledgeWorkspaceSnapshot,
  patch: CandidateGraphPatch
): void {
  if (!patch.reviewTaskId) return;
  const task = requirePendingTask(snapshot, patch.reviewTaskId);
  if (patch.action !== "revise" || patch.targetNodeId !== task.nodeId || patch.focusNodeId !== task.nodeId) {
    throw reviewError("invalid_review_patch", `Patch ${patch.id} does not revise review task node ${task.nodeId}`);
  }
  const revisions = patch.operations.filter((operation) => operation.kind === "revise_node");
  if (revisions.length !== 1 || revisions[0].nodeId !== task.nodeId) {
    throw reviewError("invalid_review_patch", `Patch ${patch.id} must contain exactly one revision for ${task.nodeId}`);
  }
  const latestProposal = [...task.history].reverse().find((entry) => entry.action === "modification_proposed");
  if (!latestProposal || latestProposal.patchId !== patch.id) {
    throw reviewError("untracked_review_patch", `Patch ${patch.id} is not the latest proposed modification for ${task.id}`);
  }
}

export function completeImpactReviewTaskModification(
  snapshot: KnowledgeWorkspaceSnapshot,
  patch: CandidateGraphPatch,
  accepted: boolean,
  reviewedAt = projectModelNow
): KnowledgeWorkspaceSnapshot {
  if (!patch.reviewTaskId) return snapshot;
  const task = snapshot.impactReviewTasks.find((candidate) => candidate.id === patch.reviewTaskId);
  if (!task || task.status !== "pending_review") {
    throw reviewError("invalid_review_task_state", `Impact review task ${patch.reviewTaskId} cannot complete patch ${patch.id}`);
  }
  const revision = patch.operations.find((operation) => operation.kind === "revise_node");
  if (!revision || revision.kind !== "revise_node") {
    throw reviewError("invalid_review_patch", `Patch ${patch.id} has no review revision`);
  }
  const before = { title: revision.before.title, summary: revision.before.summary };
  const after = { title: revision.after.title, summary: revision.after.summary };
  return {
    ...snapshot,
    impactReviewTasks: snapshot.impactReviewTasks.map((candidate) => candidate.id === task.id ? {
      ...candidate,
      status: accepted ? "modified" : "pending_review",
      updatedAt: reviewedAt,
      history: candidate.history.concat(historyEntry(
        candidate.id,
        candidate.history.length + 1,
        accepted ? "modified" : "modification_rejected",
        reviewedAt,
        accepted ? "节点修改 Patch 已接受并写入知识图谱。" : "节点修改 Patch 已拒绝；复核任务保持待处理。",
        patch.id,
        before,
        after
      ))
    } : candidate)
  };
}

function resolveTask(
  snapshot: KnowledgeWorkspaceSnapshot,
  taskId: string,
  resolution: "accepted" | "rejected",
  note: string,
  reviewedAt: string
): KnowledgeWorkspaceSnapshot {
  if (!isProjectWritable(snapshot)) return snapshot;
  const task = requirePendingTask(snapshot, taskId);
  assertNoPendingModification(snapshot, taskId);
  const trimmedNote = note.trim();
  if (!trimmedNote) throw reviewError("empty_review_note", "Impact review decision requires a note");
  return {
    ...snapshot,
    impactReviewTasks: snapshot.impactReviewTasks.map((candidate) => candidate.id === task.id ? {
      ...candidate,
      status: resolution,
      updatedAt: reviewedAt,
      history: candidate.history.concat(historyEntry(
        candidate.id,
        candidate.history.length + 1,
        resolution,
        reviewedAt,
        trimmedNote
      ))
    } : candidate)
  };
}

function requirePendingTask(snapshot: KnowledgeWorkspaceSnapshot, taskId: string): ImpactReviewTask {
  const task = snapshot.impactReviewTasks.find((candidate) => candidate.id === taskId);
  if (!task) throw reviewError("missing_review_task", `Impact review task ${taskId} does not exist`);
  if (task.status !== "pending_review") {
    throw reviewError("review_task_resolved", `Impact review task ${taskId} is already ${task.status}`);
  }
  return task;
}

function assertNoPendingModification(snapshot: KnowledgeWorkspaceSnapshot, taskId: string): void {
  if (snapshot.candidatePatches.some((patch) => patch.reviewTaskId === taskId && patch.status === "pending_review")) {
    throw reviewError("pending_review_patch", `Impact review task ${taskId} already has a pending modification`);
  }
}

function historyEntry(
  taskId: string,
  sequence: number,
  action: ImpactReviewHistoryEntry["action"],
  at: string,
  note: string,
  patchId?: string,
  before?: ImpactReviewRevisionSnapshot,
  after?: ImpactReviewRevisionSnapshot,
  actor: ImpactReviewHistoryEntry["actor"] = "user"
): ImpactReviewHistoryEntry {
  return {
    id: `${taskId}-history-${sequence}`,
    action,
    actor,
    at,
    note,
    ...(patchId ? { patchId } : {}),
    ...(before ? { before } : {}),
    ...(after ? { after } : {})
  };
}

function reviewError(code: string, message: string): Error {
  return new Error(`Impact review failed: [${code}] ${message}`);
}
