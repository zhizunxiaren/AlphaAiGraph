import { expect, test } from "vitest";
import type {
  AgentRequest,
  KnowledgeAgentInput,
  KnowledgeAgentOutput,
  KnowledgeAgentProvider,
  KnowledgeNode
} from "../types";
import {
  buildKnowledgeAgentInput,
  invokeKnowledgeAgent,
  knowledgeAgentInputJsonSchema,
  knowledgeAgentOutputJsonSchema,
  parseKnowledgeAgentOutput
} from "./agentBoundary";
import { createProjectWorkspace, knowledgeNow } from "./knowledgeEngine";
import { createGraphPatchAudit } from "./graphPatch";

test("builds a provider-neutral input from the visible Context Packet", () => {
  const workspace = createProjectWorkspace({
    mode: "research",
    title: "Agent boundary",
    subjectKind: "question",
    goal: "Decide what to investigate next"
  });
  const request = agentRequest(workspace.selection.id);
  const input = buildKnowledgeAgentInput(workspace, request);

  expect(input.schemaVersion).toBe("1.0");
  expect(input.project.goal).toBe("Decide what to investigate next");
  expect(input.currentNode.id).toBe(workspace.selection.focusNodeId);
  expect(input.neighborNodes.map((node) => node.id).sort()).toEqual(
    workspace.selection.nodeIds.filter((id) => id !== workspace.selection.focusNodeId).sort()
  );
  expect(input.unresolvedQuestions.map((node) => node.title)).toContain("核心研究问题");
  expect(input.selection).toEqual(workspace.selection);
  expect(input.project).not.toBe(workspace.project);
  expect(input.constraints.allowedOperationKinds).toContain("revise_node");
});

test("invokes interchangeable providers and accepts only a pending CandidateGraphPatch", async () => {
  const workspace = createProjectWorkspace({ mode: "understand", title: "Provider adapter", subjectKind: "technology" });
  const input = buildKnowledgeAgentInput(workspace, agentRequest(workspace.selection.id));
  const output = validOutput(input);
  let received: KnowledgeAgentInput | undefined;
  const provider: KnowledgeAgentProvider = {
    id: "deterministic-test-provider",
    async invoke(providerInput) {
      received = providerInput;
      return { output };
    }
  };

  const result = await invokeKnowledgeAgent(provider, input);

  expect(received).toEqual(input);
  expect(Object.isFrozen(received)).toBe(true);
  expect(Object.isFrozen(received?.selection)).toBe(true);
  expect(result).toEqual(output);
  expect(result.patch.status).toBe("pending_review");
  expect(workspace.graph.nodes.some((node) => node.id === result.patch.focusNodeId)).toBe(false);
});

test("rejects direct graph output, request drift, and out-of-context operations", () => {
  const workspace = createProjectWorkspace({ mode: "understand", title: "Strict output", subjectKind: "technology" });
  const input = buildKnowledgeAgentInput(workspace, agentRequest(workspace.selection.id));
  const output = validOutput(input);

  expect(() => parseKnowledgeAgentOutput(input, { ...output, graph: workspace.graph }))
    .toThrow("[unexpected_field]");
  expect(() => parseKnowledgeAgentOutput(input, { ...output, requestId: "another-request" }))
    .toThrow("[request_mismatch]");

  const operation = output.patch.operations[0];
  const outsideNode = { ...(operation.kind === "create_node" ? operation.node : input.currentNode), id: "outside-node" };
  const outsideOutput: KnowledgeAgentOutput = {
    ...output,
    patch: {
      ...output.patch,
      focusNodeId: outsideNode.id,
      operations: [{
        kind: "update_node_status",
        nodeId: outsideNode.id,
        before: statusSnapshot(outsideNode),
        after: { ...statusSnapshot(outsideNode), status: "exploring" },
        audit: createGraphPatchAudit("audit-outside", "Attempt an out-of-context mutation", knowledgeNow)
      }]
    }
  };
  expect(() => parseKnowledgeAgentOutput(input, outsideOutput)).toThrow("[patch_outside_context]");
});

test("publishes strict JSON-schema headers for provider adapters", () => {
  expect(knowledgeAgentInputJsonSchema.additionalProperties).toBe(false);
  expect(knowledgeAgentInputJsonSchema.properties.schemaVersion.const).toBe("1.0");
  expect(knowledgeAgentOutputJsonSchema.additionalProperties).toBe(false);
  expect(knowledgeAgentOutputJsonSchema.properties.patch.properties.status.const).toBe("pending_review");
  expect(knowledgeAgentOutputJsonSchema.properties.patch.properties.operations.minItems).toBe(1);
});

test("blocks Agent execution while an Understand Project is completed", () => {
  const workspace = createProjectWorkspace({ mode: "understand", title: "Completed boundary", subjectKind: "technology" });
  const completed = {
    ...workspace,
    project: {
      ...workspace.project,
      status: "completed" as const,
      workflow: { mode: "understand" as const, phase: "completed" as const },
      completedAt: knowledgeNow
    }
  };
  expect(() => buildKnowledgeAgentInput(completed, agentRequest(completed.selection.id)))
    .toThrow("[project_not_writable]");
});

function agentRequest(selectionId: string): AgentRequest {
  return {
    id: "agent-request-boundary-1",
    action: "drill_down",
    selectionId,
    prompt: "Expand the current node by one evidence-aware layer.",
    status: "proposed",
    createdAt: knowledgeNow
  };
}

function validOutput(input: KnowledgeAgentInput): KnowledgeAgentOutput {
  const createdNode: KnowledgeNode = {
    ...input.currentNode,
    id: `${input.currentNode.id}-provider-child`,
    kind: "concept",
    title: "Provider-neutral result",
    summary: "A structured candidate that still requires review.",
    status: "open",
    epistemicStatus: "unverified",
    depth: input.currentNode.depth + 1,
    tags: ["agent-output"],
    sourceRefs: [],
    sourceStatus: "not_applicable",
    createdBy: "agent",
    creatorId: "deterministic-test-provider",
    createdAt: knowledgeNow,
    updatedAt: knowledgeNow,
    archivedAt: undefined,
    archivedBy: undefined,
    archiveReason: undefined
  };
  return {
    schemaVersion: "1.0",
    requestId: input.request.id,
    patch: {
      id: "patch-provider-boundary-1",
      requestId: input.request.id,
      action: input.request.action,
      targetNodeId: input.currentNode.id,
      focusNodeId: createdNode.id,
      title: "Expand current knowledge",
      summary: "Provider returned a structured candidate patch.",
      revision: 1,
      createdBy: "agent",
      operations: [{
        kind: "create_node",
        node: createdNode,
        audit: createGraphPatchAudit("audit-provider-node", "Propose one next-layer concept", knowledgeNow)
      }],
      confidence: 0.81,
      status: "pending_review",
      createdAt: knowledgeNow
    }
  };
}

function statusSnapshot(node: KnowledgeNode) {
  return {
    status: node.status,
    epistemicStatus: node.epistemicStatus,
    temporalValidity: node.temporalValidity
  };
}
