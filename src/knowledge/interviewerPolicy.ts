import type {
  AgentRequest,
  CandidateGraphPatch,
  GraphPatchOperation,
  KnowledgeEdge,
  KnowledgeNode,
  KnowledgeNodeKind,
  KnowledgeWorkspaceSnapshot,
  NodeConversation
} from "../types";
import { createGraphPatchAudit } from "./graphPatch";
import { createKnowledgeMetadata } from "./knowledgeMetadata";
import { isProjectWritable } from "./projectLifecycle";

export type InterviewDimension = "goal" | "procedure" | "decision_rule" | "context" | "exception" | "evidence";

export interface InterviewerPrompt {
  id: string;
  dimension: InterviewDimension;
  label: string;
  question: string;
  rationale: string;
  answerKind: KnowledgeNodeKind;
}

export interface InterviewerProgress {
  targetNodeId: string;
  completedDimensions: InterviewDimension[];
  pendingDimensions: InterviewDimension[];
  completedCount: number;
  totalCount: number;
  isComplete: boolean;
  nextPrompt?: InterviewerPrompt;
  nextPromptPendingReview: boolean;
}

export interface InterviewAnswerInput {
  targetNodeId: string;
  answer: string;
  context: string;
  constraints?: string;
  exceptions?: string;
  observedAt?: string;
}

interface InterviewDimensionDefinition {
  dimension: InterviewDimension;
  label: string;
  rationale: string;
  answerKind: KnowledgeNodeKind;
  question: (target: KnowledgeNode, snapshot: KnowledgeWorkspaceSnapshot) => string;
}

const dimensions: readonly InterviewDimensionDefinition[] = [
  {
    dimension: "goal",
    label: "实际目标",
    rationale: "先确认知识服务的真实任务，避免脱离用途进行抽象。",
    answerKind: "experience",
    question: (target, snapshot) => `为了完成「${snapshot.project.goal}」，你通常在什么实际任务中使用「${target.title}」？`
  },
  {
    dimension: "procedure",
    label: "实际做法",
    rationale: "把只存在于操作习惯中的步骤和顺序外化出来。",
    answerKind: "practice",
    question: (target) => `请按真实执行顺序描述你处理「${target.title}」时会怎么做，哪些步骤不能省略？`
  },
  {
    dimension: "decision_rule",
    label: "判断规则",
    rationale: "显式记录专家在分支、权衡和优先级上的判断依据。",
    answerKind: "practice",
    question: (target) => `处理「${target.title}」出现多种选择时，你依据哪些信号做判断或取舍？`
  },
  {
    dimension: "context",
    label: "适用场景",
    rationale: "明确经验成立所依赖的系统、团队、规模和约束。",
    answerKind: "experience",
    question: (target) => `关于「${target.title}」，这套认识在哪些系统、团队、规模或前提下成立？`
  },
  {
    dimension: "exception",
    label: "例外与失效",
    rationale: "主动寻找反例和失效条件，防止把局部经验过度概括。",
    answerKind: "uncertainty",
    question: (target) => `「${target.title}」在什么情况下会失效、需要反过来做，或你仍然不确定？`
  },
  {
    dimension: "evidence",
    label: "观察依据",
    rationale: "区分个人判断与可观察结果，为后续验证留下入口。",
    answerKind: "claim",
    question: (target) => `你通过哪些结果、指标、事故或反馈判断「${target.title}」确实有效？`
  }
] as const;

export const interviewerPolicy = {
  id: "systematize-interviewer",
  version: 1,
  role: "Interviewer",
  dimensions: dimensions.map(({ dimension }) => dimension),
  requiresExplicitContext: true,
  writesThroughCandidatePatchOnly: true
} as const;

export function deriveInterviewerProgress(
  snapshot: KnowledgeWorkspaceSnapshot,
  targetNodeId: string
): InterviewerProgress {
  const target = requireInterviewTarget(snapshot, targetNodeId);
  const completed = new Set(snapshot.graph.nodes.flatMap((node) => {
    if (!node.tags.includes(targetTag(target.id))) return [];
    const dimension = dimensionFromTags(node.tags);
    return dimension ? [dimension] : [];
  }));
  const pending = new Set(snapshot.candidatePatches
    .filter((patch) => patch.action === "interview" && patch.targetNodeId === target.id && patch.status === "pending_review")
    .flatMap((patch) => patch.operations)
    .flatMap((operation) => operation.kind === "create_node" ? dimensionFromTags(operation.node.tags) ?? [] : []));
  const completedDimensions = dimensions.map(({ dimension }) => dimension).filter((dimension) => completed.has(dimension));
  const pendingDimensions = dimensions.map(({ dimension }) => dimension).filter((dimension) => pending.has(dimension));
  const nextDefinition = dimensions.find(({ dimension }) => pending.has(dimension))
    ?? dimensions.find(({ dimension }) => !completed.has(dimension));
  const isComplete = completedDimensions.length === dimensions.length;

  return {
    targetNodeId,
    completedDimensions,
    pendingDimensions,
    completedCount: completedDimensions.length,
    totalCount: dimensions.length,
    isComplete,
    nextPrompt: isComplete || !nextDefinition ? undefined : buildPrompt(snapshot, target, nextDefinition),
    nextPromptPendingReview: Boolean(nextDefinition && pending.has(nextDefinition.dimension))
  };
}

export function proposeInterviewAnswer(
  snapshot: KnowledgeWorkspaceSnapshot,
  input: InterviewAnswerInput
): KnowledgeWorkspaceSnapshot {
  if (snapshot.project.mode !== "systematize") throw new Error("Interviewer policy is only available in a Systematize Project");
  if (!isProjectWritable(snapshot)) throw new Error("Project must be writable before continuing an interview");
  const target = requireInterviewTarget(snapshot, input.targetNodeId);
  if (snapshot.selection.focusNodeId !== target.id) throw new Error("Interview target must match the visible Context Packet focus");
  const answer = input.answer.trim();
  const context = input.context.trim();
  if (!answer) throw new Error("访谈回答不能为空");
  if (!context) throw new Error("必须明确这项经验的适用上下文");
  if (input.observedAt && !Number.isFinite(Date.parse(input.observedAt))) throw new Error("observedAt must be a valid timestamp");

  const progress = deriveInterviewerProgress(snapshot, target.id);
  if (!progress.nextPrompt) throw new Error("当前节点的访谈维度已经完成");
  if (progress.nextPromptPendingReview) throw new Error("请先审核当前访谈生成的 Candidate Graph Patch");

  const prompt = progress.nextPrompt;
  const sequence = snapshot.candidatePatches.filter((patch) => patch.action === "interview").length + 1;
  const baseId = `${target.id}-interview-${prompt.dimension}-${sequence}`;
  const questionNode = createQuestionNode(snapshot, target, prompt, `${baseId}-question`);
  const contextNode = createContextNode(snapshot, target, input, `${baseId}-context`);
  const answerNode = createAnswerNode(snapshot, target, prompt, input, `${baseId}-answer`, contextNode.id);
  const conversation: NodeConversation = {
    id: `${baseId}-conversation`,
    nodeId: target.id,
    question: prompt.question,
    answerNodeId: answerNode.id,
    createdAt: snapshot.graph.updatedAt
  };
  const operations: GraphPatchOperation[] = [
    createNodeOperation(questionNode, `Preserve the Interviewer question for ${target.id}`),
    createNodeOperation(contextNode, `Preserve the explicit applicability context for ${target.id}`),
    createNodeOperation(answerNode, `Externalize the user's ${prompt.dimension} knowledge with explicit context`),
    createEdgeOperation(createEdge(`${baseId}-question-target`, questionNode.id, target.id, "related_to", prompt.rationale, snapshot.graph.updatedAt), "Link the interview question to its selected target"),
    createEdgeOperation(createEdge(`${baseId}-context-target`, contextNode.id, target.id, "related_to", "Applicability context for the selected knowledge target", snapshot.graph.updatedAt), "Link the explicit context to the selected target"),
    createEdgeOperation(createEdge(`${baseId}-answer-question`, answerNode.id, questionNode.id, "answers", "User answer to the Interviewer prompt", snapshot.graph.updatedAt), "Link the externalized knowledge to the prompt it answers"),
    createEdgeOperation(createEdge(`${baseId}-answer-context`, answerNode.id, contextNode.id, "valid_in_context", context, snapshot.graph.updatedAt), "Record the explicit context in which the user knowledge applies"),
    {
      kind: "create_conversation",
      conversation,
      audit: createGraphPatchAudit(`${conversation.id}-audit`, "Preserve the governed interview turn", snapshot.graph.updatedAt)
    }
  ];
  const request: AgentRequest = {
    id: `agent-request-interview-${sequence}`,
    action: "interview",
    selectionId: snapshot.selection.id,
    prompt: `${prompt.question}\n必须明确适用上下文，并将回答作为 user_asserted 候选知识。`,
    status: "proposed",
    createdAt: snapshot.graph.updatedAt
  };
  const patch: CandidateGraphPatch = {
    id: `graph-patch-interview-${sequence}`,
    requestId: request.id,
    action: "interview",
    targetNodeId: target.id,
    focusNodeId: target.id,
    title: `外化「${target.title}」的${prompt.label}`,
    summary: `保留访谈问题，并把用户回答结构化为带明确适用上下文的 ${answerNode.kind} 节点。`,
    revision: 1,
    createdBy: "agent",
    operations,
    confidence: 0.95,
    status: "pending_review",
    createdAt: snapshot.graph.updatedAt
  };
  return {
    ...snapshot,
    agentRequests: snapshot.agentRequests.concat(request),
    candidatePatches: snapshot.candidatePatches.concat(patch)
  };
}

function buildPrompt(
  snapshot: KnowledgeWorkspaceSnapshot,
  target: KnowledgeNode,
  definition: InterviewDimensionDefinition
): InterviewerPrompt {
  return {
    id: `interviewer-${target.id}-${definition.dimension}`,
    dimension: definition.dimension,
    label: definition.label,
    question: definition.question(target, snapshot),
    rationale: definition.rationale,
    answerKind: definition.answerKind
  };
}

function createQuestionNode(
  snapshot: KnowledgeWorkspaceSnapshot,
  target: KnowledgeNode,
  prompt: InterviewerPrompt,
  id: string
): KnowledgeNode {
  return {
    id,
    kind: "question",
    title: prompt.question,
    summary: prompt.rationale,
    status: "open",
    ...createKnowledgeMetadata({
      kind: "question",
      createdBy: "agent",
      creatorId: interviewerPolicy.id,
      scopeContextId: snapshot.project.id
    }),
    depth: target.depth + 1,
    tags: ["Interviewer", "隐性知识外化", targetTag(target.id)],
    sourceRefs: [],
    createdAt: snapshot.graph.updatedAt,
    updatedAt: snapshot.graph.updatedAt
  };
}

function createContextNode(
  snapshot: KnowledgeWorkspaceSnapshot,
  target: KnowledgeNode,
  input: InterviewAnswerInput,
  id: string
): KnowledgeNode {
  const context = input.context.trim();
  return {
    id,
    kind: "topic",
    title: `${target.title} · 适用上下文`,
    summary: context,
    status: "open",
    ...createKnowledgeMetadata({
      kind: "topic",
      createdBy: "user",
      creatorId: "local-user",
      scopeContextId: snapshot.project.id
    }),
    scope: {
      kind: "context_specific",
      description: context,
      contextIds: [snapshot.project.id, target.id]
    },
    temporalValidity: input.observedAt
      ? { status: "current", observedAt: input.observedAt }
      : { status: "unknown" },
    depth: target.depth + 1,
    tags: ["访谈上下文", targetTag(target.id)],
    sourceRefs: [],
    createdAt: snapshot.graph.updatedAt,
    updatedAt: snapshot.graph.updatedAt
  };
}

function createAnswerNode(
  snapshot: KnowledgeWorkspaceSnapshot,
  target: KnowledgeNode,
  prompt: InterviewerPrompt,
  input: InterviewAnswerInput,
  id: string,
  contextNodeId: string
): KnowledgeNode {
  const metadata = createKnowledgeMetadata({
    kind: prompt.answerKind,
    createdBy: "user",
    creatorId: "local-user",
    scopeContextId: snapshot.project.id
  });
  const details = [
    input.answer.trim(),
    `适用上下文：${input.context.trim()}`,
    input.constraints?.trim() ? `约束与前提：${input.constraints.trim()}` : undefined,
    input.exceptions?.trim() ? `例外与不确定性：${input.exceptions.trim()}` : undefined
  ].filter((value): value is string => Boolean(value));
  return {
    id,
    kind: prompt.answerKind,
    title: `${target.title} · ${prompt.label}`,
    summary: details.join("\n"),
    status: "open",
    ...metadata,
    scope: {
      kind: "context_specific",
      description: input.context.trim(),
      contextIds: [snapshot.project.id, target.id, contextNodeId]
    },
    temporalValidity: input.observedAt
      ? { status: "current", observedAt: input.observedAt }
      : { status: "unknown" },
    depth: target.depth + 1,
    tags: ["访谈外化", dimensionTag(prompt.dimension), targetTag(target.id)],
    sourceRefs: [],
    createdAt: snapshot.graph.updatedAt,
    updatedAt: snapshot.graph.updatedAt
  };
}

function createNodeOperation(node: KnowledgeNode, rationale: string): GraphPatchOperation {
  return {
    kind: "create_node",
    node,
    audit: createGraphPatchAudit(`${node.id}-audit`, rationale, node.createdAt)
  };
}

function createEdgeOperation(edge: KnowledgeEdge, rationale: string): GraphPatchOperation {
  return {
    kind: "create_edge",
    edge,
    audit: createGraphPatchAudit(`${edge.id}-audit`, rationale, edge.createdAt)
  };
}

function createEdge(
  id: string,
  fromNodeId: string,
  toNodeId: string,
  kind: KnowledgeEdge["kind"],
  rationale: string,
  createdAt: string
): KnowledgeEdge {
  return { id, fromNodeId, toNodeId, kind, rationale, createdBy: "agent", confidence: 1, createdAt };
}

function requireInterviewTarget(snapshot: KnowledgeWorkspaceSnapshot, targetNodeId: string): KnowledgeNode {
  const target = snapshot.graph.nodes.find((node) => node.id === targetNodeId);
  if (!target || target.status === "archived") throw new Error(`Interviewer target is unavailable: ${targetNodeId}`);
  return target;
}

function dimensionTag(dimension: InterviewDimension): string {
  return `访谈维度:${dimension}`;
}

function targetTag(targetNodeId: string): string {
  return `访谈目标:${targetNodeId}`;
}

function dimensionFromTags(tags: readonly string[]): InterviewDimension | undefined {
  const value = tags.find((tag) => tag.startsWith("访谈维度:"))?.slice("访谈维度:".length);
  return dimensions.some(({ dimension }) => dimension === value) ? value as InterviewDimension : undefined;
}
