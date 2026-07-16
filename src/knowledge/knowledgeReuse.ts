import type {
  AgentRequest,
  CandidateGraphPatch,
  GraphPatchOperation,
  KnowledgeEdge,
  KnowledgeNode,
  KnowledgeWorkspaceSnapshot
} from "../types";
import { createGraphPatchAudit } from "./graphPatch";

export interface ProposeCrossProjectKnowledgeReuseInput {
  sourceNodeId: string;
  targetProjectId: string;
  createdAt: string;
}

/**
 * Proposes sharing one canonical node with the active target Project. The Patch
 * revises scope and links the target root; it never creates or copies a node.
 */
export function proposeCrossProjectKnowledgeReuse(
  snapshot: KnowledgeWorkspaceSnapshot,
  input: ProposeCrossProjectKnowledgeReuseInput
): KnowledgeWorkspaceSnapshot {
  assertTimestamp(input.createdAt, "createdAt");
  const target = requireTargetProject(snapshot, input.targetProjectId);
  const source = requireReusableSource(snapshot, input.sourceNodeId, target.id);
  const edge = reuseEdge(target.subject.rootNodeId, source, target.id, input.createdAt);
  if (snapshot.graph.edges.some((candidate) => candidate.id === edge.id
    || (candidate.kind === "contains"
      && candidate.fromNodeId === edge.fromNodeId
      && candidate.toNodeId === edge.toNodeId))) {
    throw new Error(`Knowledge ${source.id} is already linked to Project ${target.id}`);
  }
  if (snapshot.candidatePatches.some((patch) => patch.action === "reuse"
    && patch.status === "pending_review"
    && patch.focusNodeId === source.id
    && patch.targetNodeId === target.subject.rootNodeId)) {
    throw new Error(`Knowledge ${source.id} already has a pending reuse Patch for Project ${target.id}`);
  }
  const revised = revisedSharedNode(source, target.id, input.createdAt);
  const sequence = nextRequestSequence(snapshot);
  const request: AgentRequest = {
    id: `agent-request-${sequence}`,
    action: "reuse",
    selectionId: snapshot.selection.id,
    prompt: `复用知识「${source.title}」到 Project「${target.title}」，保持 canonical node 身份不变。`,
    status: "proposed",
    createdAt: input.createdAt
  };
  const operations: GraphPatchOperation[] = [
    {
      kind: "revise_node",
      nodeId: source.id,
      before: source,
      after: revised,
      audit: createGraphPatchAudit(
        `reuse-node-${sanitizeId(target.id)}-${sanitizeId(source.id)}`,
        `Share canonical knowledge ${source.id} with Project ${target.id} without copying it`,
        input.createdAt
      )
    },
    {
      kind: "link_nodes",
      before: null,
      after: edge,
      audit: createGraphPatchAudit(
        `reuse-link-${sanitizeId(target.id)}-${sanitizeId(source.id)}`,
        `Link Project ${target.id} to shared canonical knowledge ${source.id}`,
        input.createdAt
      )
    }
  ];
  const patch: CandidateGraphPatch = {
    id: `graph-patch-${sequence}`,
    requestId: request.id,
    action: "reuse",
    targetNodeId: target.subject.rootNodeId,
    focusNodeId: source.id,
    title: `审核跨 Project 复用「${source.title}」`,
    summary: `扩展同一 canonical node 的 Project 范围并建立入口关系，不创建知识副本。`,
    revision: 1,
    createdBy: "agent",
    operations,
    confidence: 1,
    status: "pending_review",
    createdAt: input.createdAt
  };
  const next = {
    ...snapshot,
    agentRequests: snapshot.agentRequests.concat(request),
    candidatePatches: snapshot.candidatePatches.concat(patch)
  };
  validateCrossProjectReusePatch(next, patch, "pending");
  return next;
}

export function prepareCrossProjectKnowledgeReuseAcceptance(
  snapshot: KnowledgeWorkspaceSnapshot,
  patch: CandidateGraphPatch
): void {
  if (patch.action === "reuse") validateCrossProjectReusePatch(snapshot, patch, "pending");
}

export function validateAcceptedCrossProjectKnowledgeReusePatches(
  snapshot: KnowledgeWorkspaceSnapshot
): string[] {
  const errors: string[] = [];
  for (const patch of snapshot.candidatePatches.filter((candidate) =>
    candidate.action === "reuse" && candidate.status === "accepted")) {
    try {
      validateCrossProjectReusePatch(snapshot, patch, "accepted");
    } catch (error) {
      errors.push(`reuse Patch ${patch.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return errors;
}

export function assertAcceptedCrossProjectKnowledgeReusePatches(
  snapshot: KnowledgeWorkspaceSnapshot
): void {
  const errors = validateAcceptedCrossProjectKnowledgeReusePatches(snapshot);
  if (errors.length > 0) throw new Error(`Cross-Project knowledge reuse validation failed: ${errors.join("; ")}`);
}

function validateCrossProjectReusePatch(
  snapshot: KnowledgeWorkspaceSnapshot,
  patch: CandidateGraphPatch,
  mode: "pending" | "accepted"
): void {
  if (patch.action !== "reuse") throw new Error("Cross-Project reuse Patch must use the reuse action");
  if (patch.createdBy !== "agent" || patch.status !== (mode === "pending" ? "pending_review" : "accepted")) {
    throw new Error(`Cross-Project reuse Patch has invalid ${mode} governance state`);
  }
  if (mode === "accepted" && (patch.reviewedBy !== "user" || !patch.reviewedAt)) {
    throw new Error("Accepted Cross-Project reuse Patch must record user review");
  }
  const request = snapshot.agentRequests.find((candidate) => candidate.id === patch.requestId);
  if (!request || request.action !== "reuse") throw new Error("Cross-Project reuse Patch must reference a reuse request");
  if (patch.operations.length !== 2
    || patch.operations.some((operation) => operation.kind !== "revise_node" && operation.kind !== "link_nodes")) {
    throw new Error("Cross-Project reuse Patch must contain exactly one node revision and one link, with no node creation");
  }
  const revisions = patch.operations.filter((operation): operation is Extract<GraphPatchOperation, { kind: "revise_node" }> =>
    operation.kind === "revise_node");
  const links = patch.operations.filter((operation): operation is Extract<GraphPatchOperation, { kind: "link_nodes" }> =>
    operation.kind === "link_nodes");
  if (revisions.length !== 1 || links.length !== 1 || links[0].before !== null) {
    throw new Error("Cross-Project reuse Patch must revise one canonical node and add one new link");
  }
  const revision = revisions[0];
  if (revision.nodeId !== revision.before.id || revision.nodeId !== revision.after.id
    || patch.focusNodeId !== revision.nodeId || patch.confidence !== 1) {
    throw new Error("Cross-Project reuse Patch canonical identity, focus, or confidence has drifted");
  }
  const target = snapshot.projects.find((project) => project.subject.rootNodeId === patch.targetNodeId);
  if (!target || target.id !== snapshot.project.id) {
    throw new Error("Cross-Project reuse target must be the active Project root");
  }
  requireReusableBefore(snapshot, revision.before, target.id);
  const expectedAfter = revisedSharedNode(revision.before, target.id, patch.createdAt);
  if (!sameValue(revision.after, expectedAfter)) {
    throw new Error("Cross-Project reuse node revision changed data beyond canonical Project sharing metadata");
  }
  const expectedEdge = reuseEdge(target.subject.rootNodeId, revision.before, target.id, patch.createdAt);
  if (!sameValue(links[0].after, expectedEdge)) {
    throw new Error("Cross-Project reuse link has drifted from the canonical target-root relation");
  }
  if (mode === "pending") {
    const current = snapshot.graph.nodes.find((node) => node.id === revision.nodeId);
    if (!current || !sameValue(current, revision.before)) {
      throw new Error("Pending Cross-Project reuse before snapshot is stale");
    }
    if (snapshot.graph.edges.some((edge) => edge.id === expectedEdge.id
      || (edge.kind === "contains" && edge.fromNodeId === expectedEdge.fromNodeId && edge.toNodeId === expectedEdge.toNodeId))) {
      throw new Error("Pending Cross-Project reuse link already exists");
    }
  } else {
    const current = snapshot.graph.nodes.find((node) => node.id === revision.nodeId);
    if (!current || !sameValue(current, revision.after)) {
      throw new Error("Accepted Cross-Project reuse canonical node is missing or has drifted");
    }
    if (!snapshot.graph.edges.some((edge) => sameValue(edge, expectedEdge))) {
      throw new Error("Accepted Cross-Project reuse link is missing or has drifted");
    }
  }
}

function requireTargetProject(snapshot: KnowledgeWorkspaceSnapshot, targetProjectId: string) {
  const target = snapshot.projects.find((project) => project.id === targetProjectId);
  if (!target) throw new Error(`Reuse target Project is unavailable: ${targetProjectId}`);
  if (target.id !== snapshot.project.id) throw new Error("Knowledge reuse target must be the active Project");
  if (!snapshot.graph.nodes.some((node) => node.id === target.subject.rootNodeId)) {
    throw new Error(`Reuse target Project root is unavailable: ${target.subject.rootNodeId}`);
  }
  return target;
}

function requireReusableSource(
  snapshot: KnowledgeWorkspaceSnapshot,
  sourceNodeId: string,
  targetProjectId: string
): KnowledgeNode {
  const source = snapshot.graph.nodes.find((node) => node.id === sourceNodeId);
  if (!source) throw new Error(`Reusable knowledge is unavailable: ${sourceNodeId}`);
  requireReusableBefore(snapshot, source, targetProjectId);
  return source;
}

function requireReusableBefore(
  snapshot: KnowledgeWorkspaceSnapshot,
  source: KnowledgeNode,
  targetProjectId: string
): void {
  if (snapshot.projects.some((project) => project.subject.rootNodeId === source.id)) {
    throw new Error(`Knowledge ${source.id} is a Project root and cannot be reused as an individual node`);
  }
  if (source.status === "archived" || source.scope.kind !== "project") {
    throw new Error(`Knowledge ${source.id} is not an active Project-scoped reusable node`);
  }
  if (source.scope.contextIds.includes(targetProjectId)) {
    throw new Error(`Knowledge ${source.id} is already shared with Project ${targetProjectId}`);
  }
  const knownOtherProject = source.scope.contextIds.some((id) =>
    id !== targetProjectId && snapshot.projects.some((project) => project.id === id));
  if (!knownOtherProject) throw new Error(`Knowledge ${source.id} has no source Project to reuse from`);
}

function revisedSharedNode(source: KnowledgeNode, targetProjectId: string, createdAt: string): KnowledgeNode {
  const shareTag = `shared:project:${targetProjectId}`;
  return {
    ...source,
    scope: { ...source.scope, contextIds: source.scope.contextIds.concat(targetProjectId) },
    tags: source.tags.includes(shareTag) ? source.tags.slice() : source.tags.concat(shareTag),
    updatedAt: createdAt
  };
}

function reuseEdge(rootNodeId: string, source: KnowledgeNode, targetProjectId: string, createdAt: string): KnowledgeEdge {
  return {
    id: `reuse-edge-${sanitizeId(targetProjectId)}-${sanitizeId(source.id)}`,
    fromNodeId: rootNodeId,
    toNodeId: source.id,
    kind: "contains",
    label: "跨 Project 复用",
    rationale: `Project ${targetProjectId} 复用 canonical knowledge ${source.id}，不创建副本。`,
    createdBy: "agent",
    confidence: 1,
    createdAt
  };
}

function nextRequestSequence(snapshot: KnowledgeWorkspaceSnapshot): number {
  let sequence = snapshot.agentRequests.length + 1;
  const requestIds = new Set(snapshot.agentRequests.map((request) => request.id));
  const patchIds = new Set(snapshot.candidatePatches.map((patch) => patch.id));
  while (requestIds.has(`agent-request-${sequence}`) || patchIds.has(`graph-patch-${sequence}`)) sequence += 1;
  return sequence;
}

function assertTimestamp(value: string, label: string): void {
  if (Number.isNaN(Date.parse(value))) throw new Error(`${label} must be a valid timestamp`);
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sanitizeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "knowledge";
}
