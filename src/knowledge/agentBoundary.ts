import type {
  AgentRequest,
  CandidateGraphPatch,
  GraphPatchOperation,
  GraphPatchOperationKind,
  KnowledgeAgentInput,
  KnowledgeAgentInvocationResult,
  KnowledgeAgentInvocationOptions,
  KnowledgeAgentOutput,
  KnowledgeAgentOutputConstraints,
  KnowledgeAgentProvider,
  KnowledgeAgentProviderMetadata,
  KnowledgeNode,
  KnowledgeWorkspaceSnapshot
} from "../types";
import { queryLocalNeighborhood } from "./knowledgeGraphQuery";

export const KNOWLEDGE_AGENT_SCHEMA_VERSION = "1.0" as const;

export const graphPatchOperationKinds: readonly GraphPatchOperationKind[] = [
  "create_node",
  "create_edge",
  "create_conversation",
  "revise_node",
  "link_nodes",
  "update_node_status",
  "update_node_sources",
  "archive_node"
];

export const defaultKnowledgeAgentConstraints: KnowledgeAgentOutputConstraints = {
  allowedOperationKinds: [...graphPatchOperationKinds],
  maxOperations: 24,
  requireSourceAnchors: true
};

/** JSON-schema headers for adapters that support structured input/output. */
export const knowledgeAgentInputJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "AlphaAiGraph KnowledgeAgentInput v1",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "request", "project", "selection", "currentNode", "neighborNodes", "sources", "unresolvedQuestions", "constraints"],
  properties: {
    schemaVersion: { const: KNOWLEDGE_AGENT_SCHEMA_VERSION },
    request: { type: "object" },
    project: { type: "object" },
    selection: { type: "object" },
    currentNode: { type: "object" },
    neighborNodes: { type: "array", items: { type: "object" } },
    sources: { type: "array", items: { type: "object" } },
    unresolvedQuestions: { type: "array", items: { type: "object" } },
    constraints: {
      type: "object",
      additionalProperties: false,
      required: ["allowedOperationKinds", "maxOperations", "requireSourceAnchors"],
      properties: {
        allowedOperationKinds: { type: "array", items: { enum: graphPatchOperationKinds } },
        maxOperations: { type: "integer", minimum: 1 },
        requireSourceAnchors: { type: "boolean" }
      }
    }
  }
} as const;

export const knowledgeAgentOutputJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "AlphaAiGraph KnowledgeAgentOutput v1",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "requestId", "patch"],
  properties: {
    schemaVersion: { const: KNOWLEDGE_AGENT_SCHEMA_VERSION },
    requestId: { type: "string", minLength: 1 },
    patch: {
      type: "object",
      additionalProperties: false,
      required: ["id", "requestId", "action", "targetNodeId", "focusNodeId", "title", "summary", "revision", "createdBy", "operations", "confidence", "status", "createdAt"],
      properties: {
        id: { type: "string", minLength: 1 },
        requestId: { type: "string", minLength: 1 },
        action: { type: "string" },
        targetNodeId: { type: "string", minLength: 1 },
        focusNodeId: { type: "string", minLength: 1 },
        title: { type: "string", minLength: 1 },
        summary: { type: "string", minLength: 1 },
        revision: { type: "integer", minimum: 1 },
        createdBy: { const: "agent" },
        operations: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["kind", "audit"],
            properties: { kind: { enum: graphPatchOperationKinds }, audit: { type: "object" } }
          }
        },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        status: { const: "pending_review" },
        createdAt: { type: "string", format: "date-time" }
      }
    }
  }
} as const;

export function buildKnowledgeAgentInput(
  snapshot: KnowledgeWorkspaceSnapshot,
  request: AgentRequest,
  constraints: KnowledgeAgentOutputConstraints = defaultKnowledgeAgentConstraints
): KnowledgeAgentInput {
  const selection = snapshot.selection;
  const currentNode = snapshot.graph.nodes.find((node) => node.id === selection.focusNodeId);
  if (!currentNode) throw agentSchemaError("missing_current_node", `Selection focus ${selection.focusNodeId} is absent from the graph`);

  const selectedIds = new Set(selection.nodeIds);
  const directNeighborIds = new Set(queryLocalNeighborhood(snapshot, {
    focusNodeId: currentNode.id,
    depth: 1,
    maxNodes: Math.max(1, snapshot.graph.nodes.length)
  }).nodes.filter((node) => node.id !== currentNode.id).map((node) => node.id));
  const neighborNodes = snapshot.graph.nodes.filter((node) =>
    selectedIds.has(node.id) && directNeighborIds.has(node.id)
  );
  const unresolvedQuestions = snapshot.graph.nodes.filter((node) =>
    selectedIds.has(node.id)
    && node.kind === "question"
    && !["understood", "verified", "archived"].includes(node.status)
  );
  const sources = selection.sourceIds.map((sourceId) => {
    const source = snapshot.knowledgeSourceAssets.find((candidate) => candidate.id === sourceId);
    if (!source) throw agentSchemaError("missing_context_source", `Context Packet references missing source ${sourceId}`);
    return {
      source,
      anchors: snapshot.sourceAnchors.filter((anchor) => anchor.sourceId === source.id)
    };
  });
  const input: KnowledgeAgentInput = {
    schemaVersion: KNOWLEDGE_AGENT_SCHEMA_VERSION,
    request,
    project: snapshot.project,
    selection,
    currentNode,
    neighborNodes,
    sources,
    unresolvedQuestions,
    constraints: {
      ...constraints,
      allowedOperationKinds: constraints.allowedOperationKinds.slice()
    }
  };
  assertKnowledgeAgentInput(input);
  return cloneSerializable(input);
}

export async function invokeKnowledgeAgent(
  provider: KnowledgeAgentProvider,
  input: KnowledgeAgentInput,
  options?: KnowledgeAgentInvocationOptions
): Promise<KnowledgeAgentOutput> {
  return (await invokeKnowledgeAgentWithMetadata(provider, input, options)).output;
}

export async function invokeKnowledgeAgentWithMetadata(
  provider: KnowledgeAgentProvider,
  input: KnowledgeAgentInput,
  options?: KnowledgeAgentInvocationOptions
): Promise<KnowledgeAgentInvocationResult> {
  assertKnowledgeAgentInput(input);
  if (!provider.id.trim()) throw agentSchemaError("invalid_provider", "Provider id is required");
  const providerInput = deepFreeze(cloneSerializable(input));
  const response = await provider.invoke(providerInput, options);
  if (!isRecord(response) || !("output" in response)) {
    throw agentSchemaError("invalid_provider_response", "Provider must return an output and optional metadata envelope");
  }
  const metadata = (isRecord(response.metadata) ? cloneSerializable(response.metadata) : {}) as KnowledgeAgentProviderMetadata;
  if (metadata.usage !== undefined) validateTokenUsage(metadata.usage);
  return {
    output: parseKnowledgeAgentOutput(input, response.output),
    metadata
  };
}

export function assertKnowledgeAgentInput(input: KnowledgeAgentInput): void {
  if (input.schemaVersion !== KNOWLEDGE_AGENT_SCHEMA_VERSION) {
    throw agentSchemaError("unsupported_schema_version", `Expected Agent schema ${KNOWLEDGE_AGENT_SCHEMA_VERSION}`);
  }
  if (!input.request.id.trim() || input.request.status !== "proposed") {
    throw agentSchemaError("invalid_request", "Agent input requires a proposed request with an id");
  }
  if (input.project.status !== "active" && input.project.status !== "reopened") {
    throw agentSchemaError("project_not_writable", "Completed or archived Projects must be reopened before Agent execution");
  }
  if (input.request.selectionId !== input.selection.id) {
    throw agentSchemaError("selection_mismatch", "Agent request must reference the visible Context Packet");
  }
  if (input.currentNode.id !== input.selection.focusNodeId || !input.selection.nodeIds.includes(input.currentNode.id)) {
    throw agentSchemaError("focus_mismatch", "currentNode must equal the visible Context Packet focus");
  }
  const selectedIds = new Set(input.selection.nodeIds);
  if (input.neighborNodes.some((node) => node.id === input.currentNode.id || !selectedIds.has(node.id))) {
    throw agentSchemaError("neighbor_outside_context", "Agent neighbors must be distinct nodes inside the Context Packet");
  }
  if (input.unresolvedQuestions.some((node) => node.kind !== "question" || !selectedIds.has(node.id))) {
    throw agentSchemaError("invalid_unresolved_question", "Unresolved questions must be question nodes inside the Context Packet");
  }
  const sourceIds = new Set(input.sources.map(({ source }) => source.id));
  if (input.selection.sourceIds.some((sourceId) => !sourceIds.has(sourceId))) {
    throw agentSchemaError("missing_context_source", "Every Context Packet source must be included in Agent input");
  }
  if (!Number.isInteger(input.constraints.maxOperations) || input.constraints.maxOperations < 1) {
    throw agentSchemaError("invalid_operation_limit", "maxOperations must be a positive integer");
  }
  if (input.constraints.allowedOperationKinds.some((kind) => !graphPatchOperationKinds.includes(kind))) {
    throw agentSchemaError("unknown_operation_kind", "Agent constraints contain an unknown operation kind");
  }
}

export function parseKnowledgeAgentOutput(input: KnowledgeAgentInput, value: unknown): KnowledgeAgentOutput {
  const output = requireRecord(value, "output");
  assertExactKeys(output, ["schemaVersion", "requestId", "patch"], "output");
  if (output.schemaVersion !== KNOWLEDGE_AGENT_SCHEMA_VERSION) {
    throw agentSchemaError("unsupported_schema_version", "Provider output schemaVersion does not match the request");
  }
  if (output.requestId !== input.request.id) {
    throw agentSchemaError("request_mismatch", "Provider output requestId does not match Agent input");
  }
  const patch = requireRecord(output.patch, "patch");
  assertExactKeys(patch, [
    "id", "requestId", "action", "targetNodeId", "focusNodeId", "title", "summary", "revision",
    "createdBy", "operations", "confidence", "status", "createdAt"
  ], "patch");
  requireNonEmptyStrings(patch, ["id", "requestId", "targetNodeId", "focusNodeId", "title", "summary", "createdAt"], "patch");
  if (patch.requestId !== input.request.id || patch.action !== input.request.action) {
    throw agentSchemaError("request_mismatch", "Candidate patch must preserve request id and action");
  }
  if (patch.createdBy !== "agent" || patch.status !== "pending_review") {
    throw agentSchemaError("direct_write_attempt", "Provider output must be an unreviewed agent CandidateGraphPatch");
  }
  if (!Number.isInteger(patch.revision) || Number(patch.revision) < 1) {
    throw agentSchemaError("invalid_revision", "Candidate patch revision must be a positive integer");
  }
  if (typeof patch.confidence !== "number" || !Number.isFinite(patch.confidence) || patch.confidence < 0 || patch.confidence > 1) {
    throw agentSchemaError("invalid_confidence", "Candidate patch confidence must be between 0 and 1");
  }
  if (!Number.isFinite(Date.parse(String(patch.createdAt)))) {
    throw agentSchemaError("invalid_timestamp", "Candidate patch createdAt must be a valid timestamp");
  }
  if (!Array.isArray(patch.operations) || patch.operations.length === 0
    || patch.operations.length > input.constraints.maxOperations) {
    throw agentSchemaError("invalid_operation_count", "Candidate patch operation count is outside the configured boundary");
  }

  const operations = patch.operations.map((operation, index) => parseOperation(operation, index));
  const auditIds = operations.map((operation) => operation.audit.id);
  if (new Set(auditIds).size !== auditIds.length) {
    throw agentSchemaError("duplicate_audit_id", "Every Agent operation must have a unique audit id");
  }
  assertOutputScope(input, patch, operations);
  return cloneSerializable({
    schemaVersion: KNOWLEDGE_AGENT_SCHEMA_VERSION,
    requestId: input.request.id,
    patch: { ...patch, operations } as unknown as CandidateGraphPatch
  });
}

function parseOperation(value: unknown, index: number): GraphPatchOperation {
  const operation = requireRecord(value, `operations[${index}]`);
  const kind = operation.kind;
  if (typeof kind !== "string" || !graphPatchOperationKinds.includes(kind as GraphPatchOperationKind)) {
    throw agentSchemaError("unknown_operation_kind", `operations[${index}] has an unknown kind`);
  }
  const allowedKeys: Record<GraphPatchOperationKind, string[]> = {
    create_node: ["kind", "node", "audit"],
    create_edge: ["kind", "edge", "audit"],
    create_conversation: ["kind", "conversation", "audit"],
    revise_node: ["kind", "nodeId", "before", "after", "audit"],
    link_nodes: ["kind", "before", "after", "audit"],
    update_node_status: ["kind", "nodeId", "before", "after", "audit"],
    update_node_sources: ["kind", "nodeId", "before", "after", "audit"],
    archive_node: ["kind", "nodeId", "before", "after", "audit"]
  };
  assertExactKeys(operation, allowedKeys[kind as GraphPatchOperationKind], `operations[${index}]`);
  const audit = requireRecord(operation.audit, `operations[${index}].audit`);
  assertExactKeys(audit, ["id", "rationale", "actor", "createdAt"], `operations[${index}].audit`);
  requireNonEmptyStrings(audit, ["id", "rationale", "createdAt"], `operations[${index}].audit`);
  if (audit.actor !== "agent" || !Number.isFinite(Date.parse(String(audit.createdAt)))) {
    throw agentSchemaError("invalid_operation_audit", `operations[${index}] must have a valid agent audit`);
  }
  switch (kind) {
    case "create_node": assertNodeLike(operation.node, `operations[${index}].node`); break;
    case "create_edge": assertEdgeLike(operation.edge, `operations[${index}].edge`); break;
    case "create_conversation": requireNonEmptyStrings(requireRecord(operation.conversation, "conversation"), ["id", "nodeId", "question", "answerNodeId", "createdAt"], "conversation"); break;
    case "revise_node":
      requireString(operation.nodeId, `operations[${index}].nodeId`);
      assertNodeLike(operation.before, `operations[${index}].before`);
      assertNodeLike(operation.after, `operations[${index}].after`);
      break;
    case "link_nodes":
      if (operation.before !== null) assertEdgeLike(operation.before, `operations[${index}].before`);
      assertEdgeLike(operation.after, `operations[${index}].after`);
      break;
    case "update_node_status":
    case "update_node_sources":
    case "archive_node":
      requireString(operation.nodeId, `operations[${index}].nodeId`);
      requireRecord(operation.before, `operations[${index}].before`);
      requireRecord(operation.after, `operations[${index}].after`);
      break;
  }
  return operation as unknown as GraphPatchOperation;
}

function assertOutputScope(input: KnowledgeAgentInput, patch: Record<string, unknown>, operations: GraphPatchOperation[]) {
  const allowedKinds = new Set(input.constraints.allowedOperationKinds);
  if (operations.some((operation) => !allowedKinds.has(operation.kind))) {
    throw agentSchemaError("operation_not_allowed", "Provider emitted an operation kind outside its constraints");
  }
  const contextNodeIds = new Set(input.selection.nodeIds);
  const createdNodeIds = new Set(operations
    .filter((operation): operation is Extract<GraphPatchOperation, { kind: "create_node" }> => operation.kind === "create_node")
    .map((operation) => operation.node.id));
  const createdNodeCount = operations.filter((operation) => operation.kind === "create_node").length;
  if (createdNodeIds.size !== createdNodeCount) {
    throw agentSchemaError("duplicate_created_id", "Provider emitted duplicate created node ids");
  }
  const visibleOrCreated = new Set([...contextNodeIds, ...createdNodeIds]);
  if (!contextNodeIds.has(String(patch.targetNodeId)) || !visibleOrCreated.has(String(patch.focusNodeId))) {
    throw agentSchemaError("patch_outside_context", "Patch target/focus must remain inside the Context Packet or its created nodes");
  }
  for (const operation of operations) {
    if ("nodeId" in operation && !contextNodeIds.has(operation.nodeId)) {
      throw agentSchemaError("patch_outside_context", `${operation.kind} targets a node outside the Context Packet`);
    }
    const edge = operation.kind === "create_edge" ? operation.edge
      : operation.kind === "link_nodes" ? operation.after
        : undefined;
    if (edge && (!visibleOrCreated.has(edge.fromNodeId) || !visibleOrCreated.has(edge.toNodeId))) {
      throw agentSchemaError("patch_outside_context", `${operation.kind} references an endpoint outside the Context Packet`);
    }
  }
  assertSourceScope(input, operations);
}

function assertSourceScope(input: KnowledgeAgentInput, operations: GraphPatchOperation[]) {
  const sourceIds = new Set(input.sources.map(({ source }) => source.id));
  const anchorIds = new Set(input.sources.flatMap(({ anchors }) => anchors.map((anchor) => anchor.id)));
  const refs = operations.flatMap((operation) => {
    if (operation.kind === "create_node") return operation.node.sourceRefs;
    if (operation.kind === "revise_node") return operation.after.sourceRefs;
    if (operation.kind === "update_node_sources") return operation.after.sourceRefs;
    return [];
  });
  for (const ref of refs) {
    if (!sourceIds.has(ref.sourceId)) {
      throw agentSchemaError("source_outside_context", `Provider referenced source ${ref.sourceId} outside the Context Packet`);
    }
    if (input.constraints.requireSourceAnchors && (!ref.anchorId || !anchorIds.has(ref.anchorId))) {
      throw agentSchemaError("source_outside_context", `Provider referenced an unavailable source anchor`);
    }
  }
}

function assertNodeLike(value: unknown, path: string) {
  const node = requireRecord(value, path);
  requireNonEmptyStrings(node, ["id", "kind", "title", "summary", "status", "epistemicStatus", "sourceStatus", "createdBy", "creatorId", "createdAt", "updatedAt"], path);
  if (!Array.isArray(node.tags) || !Array.isArray(node.sourceRefs) || !isRecord(node.scope) || !isRecord(node.temporalValidity)) {
    throw agentSchemaError("invalid_node", `${path} is missing structured node metadata`);
  }
}

function assertEdgeLike(value: unknown, path: string) {
  const edge = requireRecord(value, path);
  requireNonEmptyStrings(edge, ["id", "fromNodeId", "toNodeId", "kind", "createdAt"], path);
  if (typeof edge.confidence !== "number" || edge.confidence < 0 || edge.confidence > 1) {
    throw agentSchemaError("invalid_edge", `${path}.confidence must be between 0 and 1`);
  }
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw agentSchemaError("invalid_shape", `${path} must be an object`);
  return value;
}

function requireNonEmptyStrings(value: Record<string, unknown>, keys: string[], path: string) {
  for (const key of keys) requireString(value[key], `${path}.${key}`);
}

function requireString(value: unknown, path: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw agentSchemaError("invalid_shape", `${path} must be a non-empty string`);
  }
}

function assertExactKeys(value: Record<string, unknown>, allowed: string[], path: string) {
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(value).find((key) => !allowedSet.has(key));
  if (unexpected) throw agentSchemaError("unexpected_field", `${path}.${unexpected} is not part of the provider-neutral schema`);
  const missing = allowed.find((key) => !(key in value));
  if (missing) throw agentSchemaError("invalid_shape", `${path}.${missing} is required`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function validateTokenUsage(value: unknown) {
  const usage = requireRecord(value, "provider.metadata.usage");
  for (const key of ["inputTokens", "outputTokens", "totalTokens"] as const) {
    if (!Number.isInteger(usage[key]) || Number(usage[key]) < 0) {
      throw agentSchemaError("invalid_token_usage", `${key} must be a non-negative integer`);
    }
  }
  if (usage.cachedInputTokens !== undefined
    && (!Number.isInteger(usage.cachedInputTokens) || Number(usage.cachedInputTokens) < 0)) {
    throw agentSchemaError("invalid_token_usage", "cachedInputTokens must be a non-negative integer");
  }
}

export class KnowledgeAgentSchemaError extends Error {
  constructor(public readonly code: string, message: string) {
    super(`Knowledge Agent schema validation failed: [${code}] ${message}`);
    this.name = "KnowledgeAgentSchemaError";
  }
}

function agentSchemaError(code: string, message: string): KnowledgeAgentSchemaError {
  return new KnowledgeAgentSchemaError(code, message);
}
