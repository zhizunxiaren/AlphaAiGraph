import type {
  GraphPatchOperation,
  GraphPatchOperationAudit,
  KnowledgeEdge,
  KnowledgeGraph,
  KnowledgeNode,
  KnowledgeNodeArchiveSnapshot,
  KnowledgeNodeSourceSnapshot,
  KnowledgeNodeStatusSnapshot
} from "../types";

export function createGraphPatchAudit(
  id: string,
  rationale: string,
  createdAt: string,
  actor: GraphPatchOperationAudit["actor"] = "agent"
): GraphPatchOperationAudit {
  return { id, rationale, actor, createdAt };
}

/**
 * Applies a reviewed patch to a copy of the graph. Every mutable operation is
 * compare-and-swap: its before snapshot must still match the canonical graph.
 * A failure throws before the caller publishes any part of the result.
 */
export function applyGraphPatchOperations(
  graph: KnowledgeGraph,
  operations: readonly GraphPatchOperation[]
): KnowledgeGraph {
  assertOperationAudits(operations);
  let nodes = graph.nodes.slice();
  let edges = graph.edges.slice();

  for (const operation of operations) {
    switch (operation.kind) {
      case "create_node":
        assertAbsent(nodes, operation.node.id, "node");
        nodes.push(operation.node);
        break;
      case "create_edge":
        assertAbsent(edges, operation.edge.id, "edge");
        assertEdgeEndpoints(nodes, operation.edge);
        edges.push(operation.edge);
        break;
      case "create_conversation":
        break;
      case "revise_node": {
        const index = requireNodeIndex(nodes, operation.nodeId);
        const current = nodes[index];
        assertBefore("revise_node", operation.nodeId, current, operation.before);
        if (operation.after.id !== operation.nodeId || operation.before.id !== operation.nodeId) {
          throw patchError("identity_drift", `revise_node cannot change node id ${operation.nodeId}`);
        }
        assertRevisionBoundaries(operation.before, operation.after, operation.audit);
        nodes[index] = operation.after;
        break;
      }
      case "link_nodes": {
        const currentIndex = edges.findIndex((edge) => edge.id === operation.after.id);
        if (operation.before === null) {
          if (currentIndex >= 0) {
            throw patchError("unexpected_existing_edge", `link_nodes expected edge ${operation.after.id} to be absent`);
          }
          assertEdgeEndpoints(nodes, operation.after);
          edges.push(operation.after);
          break;
        }
        if (operation.before.id !== operation.after.id) {
          throw patchError("identity_drift", "link_nodes cannot change edge id");
        }
        if (currentIndex < 0) {
          throw patchError("stale_before", `link_nodes expected edge ${operation.before.id} to exist`);
        }
        assertBefore("link_nodes", operation.before.id, edges[currentIndex], operation.before);
        assertEdgeEndpoints(nodes, operation.after);
        edges[currentIndex] = operation.after;
        break;
      }
      case "update_node_status": {
        const index = requireNodeIndex(nodes, operation.nodeId);
        const current = statusSnapshot(nodes[index]);
        assertBefore("update_node_status", operation.nodeId, current, operation.before);
        if (operation.before.status === "archived" || operation.after.status === "archived") {
          throw patchError("archive_requires_archive_operation", "Use archive_node to archive knowledge");
        }
        nodes[index] = {
          ...nodes[index],
          ...operation.after,
          updatedAt: operation.audit.createdAt
        };
        break;
      }
      case "update_node_sources": {
        const index = requireNodeIndex(nodes, operation.nodeId);
        const current = sourceSnapshot(nodes[index]);
        assertBefore("update_node_sources", operation.nodeId, current, operation.before);
        nodes[index] = {
          ...nodes[index],
          sourceRefs: operation.after.sourceRefs.slice(),
          sourceStatus: operation.after.sourceStatus,
          updatedAt: operation.audit.createdAt
        };
        break;
      }
      case "archive_node": {
        const index = requireNodeIndex(nodes, operation.nodeId);
        const current = archiveSnapshot(nodes[index]);
        assertBefore("archive_node", operation.nodeId, current, operation.before);
        assertArchiveTransition(operation.before, operation.after, operation.audit);
        nodes[index] = {
          ...nodes[index],
          ...operation.after,
          updatedAt: operation.audit.createdAt
        };
        break;
      }
    }
  }

  return { ...graph, nodes, edges };
}

function assertOperationAudits(operations: readonly GraphPatchOperation[]) {
  const ids = new Set<string>();
  for (const operation of operations) {
    const { audit } = operation;
    if (!audit.id.trim() || ids.has(audit.id)) {
      throw patchError("invalid_audit_id", `Operation audit id ${audit.id || "<empty>"} must be unique`);
    }
    ids.add(audit.id);
    if (!audit.rationale.trim()) {
      throw patchError("missing_audit_rationale", `Operation ${audit.id} must explain why it changes the graph`);
    }
    if (!Number.isFinite(Date.parse(audit.createdAt))) {
      throw patchError("invalid_audit_timestamp", `Operation ${audit.id} has an invalid createdAt`);
    }
  }
}

function assertRevisionBoundaries(before: KnowledgeNode, after: KnowledgeNode, audit: GraphPatchOperationAudit) {
  if (before.createdAt !== after.createdAt
    || before.createdBy !== after.createdBy
    || before.creatorId !== after.creatorId) {
    throw patchError("immutable_creator_drift", `revise_node cannot change creator history for ${before.id}`);
  }
  const protectedBefore = {
    status: before.status,
    epistemicStatus: before.epistemicStatus,
    temporalValidity: before.temporalValidity,
    sourceRefs: before.sourceRefs,
    sourceStatus: before.sourceStatus,
    archivedAt: before.archivedAt,
    archivedBy: before.archivedBy,
    archiveReason: before.archiveReason
  };
  const protectedAfter = {
    status: after.status,
    epistemicStatus: after.epistemicStatus,
    temporalValidity: after.temporalValidity,
    sourceRefs: after.sourceRefs,
    sourceStatus: after.sourceStatus,
    archivedAt: after.archivedAt,
    archivedBy: after.archivedBy,
    archiveReason: after.archiveReason
  };
  if (!sameValue(protectedBefore, protectedAfter)) {
    throw patchError("wrong_operation_kind", `revise_node must not hide status, source, or archive changes for ${before.id}`);
  }
  if (after.updatedAt !== audit.createdAt) {
    throw patchError("revision_timestamp_mismatch", `Revision ${before.id} must use its audit timestamp`);
  }
}

function assertArchiveTransition(
  before: KnowledgeNodeArchiveSnapshot,
  after: KnowledgeNodeArchiveSnapshot,
  audit: GraphPatchOperationAudit
) {
  if (before.status === "archived" || after.status !== "archived") {
    throw patchError("invalid_archive_transition", "archive_node must transition an active node to archived");
  }
  if (after.archivedAt !== audit.createdAt || after.archivedBy !== audit.actor) {
    throw patchError("archive_audit_mismatch", "Archive metadata must match its operation audit");
  }
  if (!after.archiveReason?.trim() || after.archiveReason !== audit.rationale) {
    throw patchError("missing_archive_reason", "archive_node must preserve its rationale as archiveReason");
  }
}

function statusSnapshot(node: KnowledgeNode): KnowledgeNodeStatusSnapshot {
  return {
    status: node.status,
    epistemicStatus: node.epistemicStatus,
    temporalValidity: node.temporalValidity
  };
}

function sourceSnapshot(node: KnowledgeNode): KnowledgeNodeSourceSnapshot {
  return { sourceRefs: node.sourceRefs, sourceStatus: node.sourceStatus };
}

function archiveSnapshot(node: KnowledgeNode): KnowledgeNodeArchiveSnapshot {
  return {
    status: node.status,
    archivedAt: node.archivedAt,
    archivedBy: node.archivedBy,
    archiveReason: node.archiveReason
  };
}

function requireNodeIndex(nodes: readonly KnowledgeNode[], nodeId: string): number {
  const index = nodes.findIndex((node) => node.id === nodeId);
  if (index < 0) throw patchError("missing_node", `Graph patch references missing node ${nodeId}`);
  return index;
}

function assertEdgeEndpoints(nodes: readonly KnowledgeNode[], edge: KnowledgeEdge) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  if (!nodeIds.has(edge.fromNodeId) || !nodeIds.has(edge.toNodeId)) {
    throw patchError("missing_edge_endpoint", `Edge ${edge.id} references a missing endpoint`);
  }
}

function assertAbsent(items: readonly { id: string }[], id: string, entity: string) {
  if (items.some((item) => item.id === id)) {
    throw patchError("silent_overwrite", `Cannot create ${entity} ${id}: that id already exists`);
  }
}

function assertBefore(operation: string, id: string, current: unknown, before: unknown) {
  if (!sameValue(current, before)) {
    throw patchError("stale_before", `${operation} before snapshot no longer matches ${id}`);
  }
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function patchError(code: string, message: string): Error {
  return new Error(`Graph patch validation failed: [${code}] ${message}`);
}
