import { expect, test } from "vitest";
import type {
  AgentRequest,
  KnowledgeAgentInput,
  KnowledgeAgentOutput,
  KnowledgeNode
} from "../../types";
import { buildKnowledgeAgentInput, invokeKnowledgeAgentWithMetadata } from "../agentBoundary";
import { createProjectWorkspace, knowledgeNow } from "../knowledgeEngine";
import { createGraphPatchAudit } from "../graphPatch";
import {
  createDeepSeekProvider,
  DEEPSEEK_API_BASE_URL,
  DEFAULT_DEEPSEEK_MODEL
} from "./deepSeekProvider";
import {
  createGlmProvider,
  DEFAULT_GLM_MODEL,
  GLM_API_BASE_URL
} from "./glmProvider";
import {
  KnowledgeAgentProviderHttpError,
  KnowledgeAgentProviderResponseError,
  type AgentProviderFetch
} from "./openAiCompatibleProvider";

test("adapts DeepSeek chat completions to the strict Agent boundary", async () => {
  const input = agentInput("DeepSeek adapter");
  const output = validOutput(input, "deepseek-test");
  const capture = capturingFetch(chatResponse(output));
  const provider = createDeepSeekProvider({
    apiKey: "deepseek-test-key",
    allowInBrowser: true,
    fetch: capture.fetch
  });

  const invocation = await invokeKnowledgeAgentWithMetadata(provider, input);
  const body = JSON.parse(String(capture.init?.body)) as Record<string, unknown>;
  const headers = capture.init?.headers as Record<string, string>;

  expect(invocation.output).toEqual(output);
  expect(invocation.metadata).toMatchObject({
    providerRequestId: "provider-request-test",
    model: "provider-model",
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 }
  });
  expect(provider.id).toBe(`deepseek/${DEFAULT_DEEPSEEK_MODEL}`);
  expect(capture.url).toBe(`${DEEPSEEK_API_BASE_URL}/chat/completions`);
  expect(body.model).toBe(DEFAULT_DEEPSEEK_MODEL);
  expect(body.response_format).toEqual({ type: "json_object" });
  expect(body.thinking).toEqual({ type: "enabled" });
  expect(JSON.stringify(body)).toContain("Return JSON only");
  expect(JSON.stringify(body)).not.toContain("deepseek-test-key");
  expect(headers.Authorization).toBe("Bearer deepseek-test-key");
});

test("adapts GLM chat completions and forwards a normalized request_id", async () => {
  const input = agentInput("GLM adapter");
  const output = validOutput(input, "glm-test");
  const capture = capturingFetch(chatResponse(output));
  const provider = createGlmProvider({
    apiKey: "glm-test-key",
    allowInBrowser: true,
    fetch: capture.fetch
  });

  const invocation = await invokeKnowledgeAgentWithMetadata(provider, input);
  const body = JSON.parse(String(capture.init?.body)) as Record<string, unknown>;

  expect(invocation.output).toEqual(output);
  expect(provider.id).toBe(`glm/${DEFAULT_GLM_MODEL}`);
  expect(capture.url).toBe(`${GLM_API_BASE_URL}/chat/completions`);
  expect(body.model).toBe(DEFAULT_GLM_MODEL);
  expect(body.request_id).toBe(input.request.id);
  expect(body.response_format).toEqual({ type: "json_object" });
});

test("keeps provider keys out of browser runtimes by default", () => {
  expect(() => createDeepSeekProvider({ apiKey: "not-a-real-key" }))
    .toThrow("cannot be used directly in a browser runtime");
  expect(() => createGlmProvider({ apiKey: "not-a-real-key" }))
    .toThrow("cannot be used directly in a browser runtime");
});

test("normalizes HTTP and malformed model responses without exposing response bodies", async () => {
  const input = agentInput("Provider failures");
  const throttled = createDeepSeekProvider({
    apiKey: "test-key",
    allowInBrowser: true,
    fetch: async () => ({ ok: false, status: 429 }) as Response
  });
  await expect(throttled.invoke(input)).rejects.toMatchObject<Partial<KnowledgeAgentProviderHttpError>>({
    status: 429,
    retryable: true
  });

  const malformed = createGlmProvider({
    apiKey: "test-key",
    allowInBrowser: true,
    fetch: async () => chatResponse("```json\n{}\n```")
  });
  await expect(malformed.invoke(input)).rejects.toBeInstanceOf(KnowledgeAgentProviderResponseError);
});

function agentInput(title: string): KnowledgeAgentInput {
  const workspace = createProjectWorkspace({ mode: "understand", title, subjectKind: "technology" });
  const request: AgentRequest = {
    id: `agent-request-${title.toLowerCase().replace(/\s+/g, "-")}`,
    action: "drill_down",
    selectionId: workspace.selection.id,
    prompt: "Expand the current node using the visible context.",
    status: "proposed",
    createdAt: knowledgeNow
  };
  return buildKnowledgeAgentInput(workspace, request);
}

function validOutput(input: KnowledgeAgentInput, creatorId: string): KnowledgeAgentOutput {
  const node: KnowledgeNode = {
    ...input.currentNode,
    id: `${input.currentNode.id}-${creatorId}`,
    kind: "concept",
    title: "Provider candidate",
    summary: "Structured provider output awaiting review.",
    status: "open",
    epistemicStatus: "unverified",
    sourceStatus: "not_applicable",
    sourceRefs: [],
    depth: input.currentNode.depth + 1,
    tags: ["provider-adapter"],
    createdBy: "agent",
    creatorId,
    createdAt: knowledgeNow,
    updatedAt: knowledgeNow
  };
  return {
    schemaVersion: "1.0",
    requestId: input.request.id,
    patch: {
      id: `patch-${creatorId}`,
      requestId: input.request.id,
      action: input.request.action,
      targetNodeId: input.currentNode.id,
      focusNodeId: node.id,
      title: "Provider patch",
      summary: "One candidate node generated by a provider adapter.",
      revision: 1,
      createdBy: "agent",
      operations: [{
        kind: "create_node",
        node,
        audit: createGraphPatchAudit(`audit-${creatorId}`, "Propose one provider-generated concept", knowledgeNow)
      }],
      confidence: 0.8,
      status: "pending_review",
      createdAt: knowledgeNow
    }
  };
}

function chatResponse(output: KnowledgeAgentOutput | string): Response {
  const content = typeof output === "string" ? output : JSON.stringify(output);
  return {
    ok: true,
    status: 200,
    json: async () => ({
      id: "provider-request-test",
      model: "provider-model",
      choices: [{ finish_reason: "stop", message: { content } }],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
    })
  } as Response;
}

function capturingFetch(response: Response): {
  fetch: AgentProviderFetch;
  url?: string;
  init?: RequestInit;
} {
  const capture: { fetch: AgentProviderFetch; url?: string; init?: RequestInit } = {
    async fetch(url, init) {
      capture.url = url;
      capture.init = init;
      return response;
    }
  };
  return capture;
}
