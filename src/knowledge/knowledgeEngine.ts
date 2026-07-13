import type {
  AgentActionKind,
  AgentRequest,
  AnalysisSubject,
  CandidateGraphPatch,
  GraphPatchOperation,
  KnowledgeContextPolicy,
  KnowledgeEdge,
  KnowledgeNode,
  KnowledgeNodeKind,
  KnowledgeSelection,
  KnowledgeWorkspaceSnapshot,
  NodeConversation
} from "../types";

export const knowledgeNow = "2026-07-13T00:00:00.000Z";

const firstLayer = [
  ["problem", "问题与价值", "它解决什么问题，价值边界在哪里？", "topic"],
  ["principles", "核心原理", "关键机制、抽象和运行方式。", "concept"],
  ["architecture", "系统结构", "组件、数据流、接口与依赖。", "topic"],
  ["ecosystem", "生态与替代方案", "工具链、竞品和互操作关系。", "route_option"],
  ["constraints", "约束与风险", "性能、安全、成本和采用门槛。", "constraint"],
  ["route", "技术路线", "从目标与约束出发形成可执行选择。", "decision"]
] as const;

const expansionTemplates: Record<string, Array<[string, string, KnowledgeNodeKind]>> = {
  principles: [
    ["执行模型", "解释代码或规则如何被执行。", "concept"],
    ["边界与接口", "识别系统边界、输入输出和契约。", "concept"],
    ["关键权衡", "说明性能、复杂度与可移植性的交换。", "claim"]
  ],
  architecture: [
    ["核心组件", "拆解组成系统的稳定模块。", "concept"],
    ["数据与控制流", "追踪信息如何流动、由谁驱动。", "concept"],
    ["集成面", "梳理对外接口和上下游依赖。", "topic"]
  ],
  route: [
    ["采用目标", "明确路线必须服务的业务或工程目标。", "goal"],
    ["决策标准", "把性能、成本、风险和团队能力变成可比较标准。", "criterion"],
    ["方案 A：渐进接入", "先验证关键路径，再扩大覆盖范围。", "route_option"],
    ["方案 B：完整迁移", "一次性切换核心系统，收益和风险更集中。", "route_option"],
    ["推荐：证据驱动试点", "用可测量试点验证关键假设后再决策。", "route_step"]
  ]
};

export function createKnowledgeWorkspace(
  title = "WebAssembly Component Model",
  kind: AnalysisSubject["kind"] = "technology"
): KnowledgeWorkspaceSnapshot {
  const slug = slugify(title);
  const rootId = `knowledge-${slug}`;
  const subject: AnalysisSubject = {
    id: `subject-${slug}`,
    kind,
    title,
    description: "从原理、架构、生态、约束和路线决策建立可持续演化的知识网络。",
    rootNodeId: rootId,
    sourceAssetIds: [],
    createdAt: knowledgeNow
  };
  const root: KnowledgeNode = node(rootId, "subject", title, subject.description, 0, ["分析对象"]);
  const firstLayerNodes = firstLayer.map(([key, nodeTitle, summary, nodeKind]) =>
    node(`${rootId}-${key}`, nodeKind, nodeTitle, summary, 1, [key === "route" ? "路线决策" : "第一层"])
  );
  const routeRootId = `${rootId}-route`;
  const routeNodes = expansionTemplates.route.map(([nodeTitle, summary, nodeKind], index) =>
    node(`${routeRootId}-detail-${index + 1}`, nodeKind, nodeTitle, summary, 2, ["技术路线"])
  );
  const nodes = [root, ...firstLayerNodes, ...routeNodes];
  const edges = [
    ...firstLayer.map(([key]) => edge(`${rootId}-contains-${key}`, rootId, `${rootId}-${key}`, "contains")),
    ...routeNodes.map((routeNode, index) => edge(`${routeRootId}-contains-${index + 1}`, routeRootId, routeNode.id, "contains"))
  ];
  return {
    subject,
    graph: {
      id: `graph-${slug}`,
      title: `${title} 知识图谱`,
      rootNodeIds: [rootId],
      nodes,
      edges,
      createdAt: knowledgeNow,
      updatedAt: knowledgeNow
    },
    views: [
      { id: "view-mind-map", kind: "mind_map", title: "分析脑图", rootNodeId: rootId, focusNodeId: rootId, visibleDepth: 2 },
      { id: "view-network", kind: "network", title: "知识网络", rootNodeId: rootId, focusNodeId: rootId, visibleDepth: 4 },
      { id: "view-route", kind: "route", title: "技术路线", rootNodeId: `${rootId}-route`, focusNodeId: `${rootId}-route`, visibleDepth: 3 }
    ],
    activeViewId: "view-mind-map",
    selectedNodeId: rootId,
    selection: {
      id: "selection-active",
      focusNodeId: rootId,
      nodeIds: [rootId, ...firstLayerNodes.map((item) => item.id)],
      sourceIds: [],
      contextPolicy: "selected_and_neighbors",
      depth: 1,
      updatedAt: knowledgeNow
    },
    agentRequests: [],
    candidatePatches: [],
    conversations: [],
    sourceAssets: []
  };
}

export function proposeKnowledgeDrillDown(snapshot: KnowledgeWorkspaceSnapshot, nodeId: string): KnowledgeWorkspaceSnapshot {
  const parent = snapshot.graph.nodes.find((item) => item.id === nodeId);
  if (!parent) return snapshot;
  if (snapshot.graph.edges.some((item) => item.fromNodeId === nodeId && item.kind === "contains")) return snapshot;
  if (hasPendingPatch(snapshot, "drill_down", nodeId)) return snapshot;

  const templateKey = Object.keys(expansionTemplates).find((key) => nodeId.endsWith(`-${key}`));
  const template: Array<[string, string, KnowledgeNodeKind]> = templateKey ? expansionTemplates[templateKey] : [
    [`${parent.title} 的关键概念`, `建立 ${parent.title} 的定义和边界。`, "concept" as const],
    [`${parent.title} 的证据`, `寻找能够支持或反驳该节点的来源。`, "evidence" as const],
    [`${parent.title} 的开放问题`, `记录下一轮需要验证的问题。`, "question" as const]
  ];
  const children = template.map(([title, summary, kind], index) =>
    node(`${nodeId}-detail-${index + 1}`, kind, title, summary, parent.depth + 1, [parent.title])
  );
  const childEdges = children.map((child, index) => edge(`${nodeId}-contains-${index + 1}`, nodeId, child.id, "contains"));
  return appendCandidatePatch(snapshot, {
    action: "drill_down",
    targetNodeId: nodeId,
    focusNodeId: nodeId,
    title: `展开「${parent.title}」`,
    summary: `建议新增 ${children.length} 个下一层知识节点；接受后才会写入正式图谱。`,
    prompt: `围绕「${parent.title}」下钻一层。`,
    operations: [
      ...children.map((child): GraphPatchOperation => ({ kind: "create_node", node: child })),
      ...childEdges.map((childEdge): GraphPatchOperation => ({ kind: "create_edge", edge: childEdge }))
    ],
    confidence: 0.86
  });
}

export function proposeKnowledgeAnswer(
  snapshot: KnowledgeWorkspaceSnapshot,
  nodeId: string,
  question: string
): KnowledgeWorkspaceSnapshot {
  const target = snapshot.graph.nodes.find((item) => item.id === nodeId);
  const trimmed = question.trim();
  if (!target || !trimmed) return snapshot;
  const sequence = snapshot.conversations.length + snapshot.candidatePatches.filter((item) => item.action === "ask").length + 1;
  const questionNode = node(`${nodeId}-question-${sequence}`, "question", trimmed, `围绕「${target.title}」提出的问题。`, target.depth + 1, ["用户提问"]);
  questionNode.createdBy = "user";
  const answerNode = node(
    `${nodeId}-answer-${sequence}`,
    "synthesis",
    `${target.title} · 回答 ${sequence}`,
    `应结合当前节点、相邻知识和来源证据回答：${trimmed}`,
    target.depth + 1,
    ["待模型生成", "可沉淀"]
  );
  const conversation: NodeConversation = {
    id: `conversation-${sequence}`,
    nodeId,
    question: trimmed,
    answerNodeId: answerNode.id,
    createdAt: knowledgeNow
  };
  return appendCandidatePatch(snapshot, {
    action: "ask",
    targetNodeId: nodeId,
    focusNodeId: answerNode.id,
    title: `回答「${target.title}」的问题`,
    summary: "问题会作为用户节点保存；Agent 回答作为待验证综合进入图谱。",
    prompt: trimmed,
    operations: [
      { kind: "create_node", node: questionNode },
      { kind: "create_node", node: answerNode },
      { kind: "create_edge", edge: edge(`${nodeId}-question-${sequence}`, questionNode.id, nodeId, "related_to") },
      { kind: "create_edge", edge: edge(`${nodeId}-answer-${sequence}`, answerNode.id, questionNode.id, "answers") },
      { kind: "create_conversation", conversation }
    ],
    confidence: 0.72
  });
}

export function proposeKnowledgeSummary(snapshot: KnowledgeWorkspaceSnapshot, nodeId: string): KnowledgeWorkspaceSnapshot {
  const target = snapshot.graph.nodes.find((item) => item.id === nodeId);
  if (!target) return snapshot;
  if (hasPendingPatch(snapshot, "summarize", nodeId)) return snapshot;
  const neighbors = snapshot.graph.edges
    .filter((item) => item.fromNodeId === nodeId || item.toNodeId === nodeId)
    .map((item) => item.fromNodeId === nodeId ? item.toNodeId : item.fromNodeId);
  const id = `${nodeId}-summary-${snapshot.graph.nodes.filter((item) => item.id.startsWith(`${nodeId}-summary-`)).length + 1}`;
  const summary = node(id, "synthesis", `${target.title} · 阶段总结`, `综合当前节点与 ${neighbors.length} 个直接关联节点，形成可继续修订的阶段结论。`, target.depth + 1, ["阶段总结"]);
  const summaryEdges = [edge(`${id}-summarizes`, id, nodeId, "summarizes"), ...neighbors.map((neighborId, index) =>
    edge(`${id}-covers-${index + 1}`, id, neighborId, "summarizes", 0.82)
  )];
  return appendCandidatePatch(snapshot, {
    action: "summarize",
    targetNodeId: nodeId,
    focusNodeId: id,
    title: `总结「${target.title}」`,
    summary: `综合目标节点与 ${neighbors.length} 个直接关联节点，形成待确认的阶段结论。`,
    prompt: `总结「${target.title}」及其直接关联。`,
    operations: [
      { kind: "create_node", node: summary },
      ...summaryEdges.map((summaryEdge): GraphPatchOperation => ({ kind: "create_edge", edge: summaryEdge }))
    ],
    confidence: 0.78
  });
}

export function acceptCandidateGraphPatch(snapshot: KnowledgeWorkspaceSnapshot, patchId: string): KnowledgeWorkspaceSnapshot {
  const patch = snapshot.candidatePatches.find((item) => item.id === patchId && item.status === "pending_review");
  if (!patch) return snapshot;
  const nodes = patch.operations.filter((item): item is Extract<GraphPatchOperation, { kind: "create_node" }> => item.kind === "create_node").map((item) => item.node);
  const edges = patch.operations.filter((item): item is Extract<GraphPatchOperation, { kind: "create_edge" }> => item.kind === "create_edge").map((item) => item.edge);
  const conversations = patch.operations
    .filter((item): item is Extract<GraphPatchOperation, { kind: "create_conversation" }> => item.kind === "create_conversation")
    .map((item) => item.conversation);
  const nextGraph = {
    ...snapshot.graph,
    nodes: appendUnique(snapshot.graph.nodes, nodes),
    edges: appendUnique(snapshot.graph.edges, edges),
    updatedAt: knowledgeNow
  };
  const next = {
    ...snapshot,
    graph: nextGraph,
    conversations: appendUnique(snapshot.conversations, conversations),
    selectedNodeId: patch.focusNodeId,
    candidatePatches: snapshot.candidatePatches.map((item) => item.id === patchId ? { ...item, status: "accepted" as const } : item),
    agentRequests: snapshot.agentRequests.map((item) => item.id === patch.requestId ? { ...item, status: "accepted" as const } : item)
  };
  return { ...next, selection: buildKnowledgeSelection(next, patch.focusNodeId, snapshot.selection.contextPolicy) };
}

export function rejectCandidateGraphPatch(snapshot: KnowledgeWorkspaceSnapshot, patchId: string): KnowledgeWorkspaceSnapshot {
  const patch = snapshot.candidatePatches.find((item) => item.id === patchId && item.status === "pending_review");
  if (!patch) return snapshot;
  return {
    ...snapshot,
    candidatePatches: snapshot.candidatePatches.map((item) => item.id === patchId ? { ...item, status: "rejected" as const } : item),
    agentRequests: snapshot.agentRequests.map((item) => item.id === patch.requestId ? { ...item, status: "rejected" as const } : item)
  };
}

export function buildKnowledgeSelection(
  snapshot: KnowledgeWorkspaceSnapshot,
  focusNodeId: string,
  contextPolicy: KnowledgeContextPolicy = snapshot.selection?.contextPolicy ?? "selected_and_neighbors"
): KnowledgeSelection {
  const focus = snapshot.graph.nodes.find((item) => item.id === focusNodeId);
  if (!focus) return snapshot.selection;
  const neighborIds = snapshot.graph.edges.flatMap((item) => {
    if (item.fromNodeId === focusNodeId) return [item.toNodeId];
    if (item.toNodeId === focusNodeId) return [item.fromNodeId];
    return [];
  });
  const nodeIds = contextPolicy === "whole_subject"
    ? snapshot.graph.nodes.map((item) => item.id)
    : contextPolicy === "selected_and_neighbors"
      ? [focusNodeId, ...neighborIds]
      : [focusNodeId];
  const uniqueNodeIds = Array.from(new Set(nodeIds));
  const sourceIds = Array.from(new Set(snapshot.graph.nodes
    .filter((item) => uniqueNodeIds.includes(item.id))
    .flatMap((item) => item.sourceRefs.map((sourceRef) => sourceRef.sourceId))));
  return {
    id: "selection-active",
    focusNodeId,
    nodeIds: uniqueNodeIds,
    sourceIds,
    contextPolicy,
    depth: contextPolicy === "selected_node" ? 0 : contextPolicy === "selected_and_neighbors" ? 1 : -1,
    updatedAt: knowledgeNow
  };
}

function appendCandidatePatch(
  snapshot: KnowledgeWorkspaceSnapshot,
  input: {
    action: AgentActionKind;
    targetNodeId: string;
    focusNodeId: string;
    title: string;
    summary: string;
    prompt: string;
    operations: GraphPatchOperation[];
    confidence: number;
  }
): KnowledgeWorkspaceSnapshot {
  const sequence = snapshot.agentRequests.length + 1;
  const request: AgentRequest = {
    id: `agent-request-${sequence}`,
    action: input.action,
    selectionId: snapshot.selection.id,
    prompt: input.prompt,
    status: "proposed",
    createdAt: knowledgeNow
  };
  const patch: CandidateGraphPatch = {
    id: `graph-patch-${sequence}`,
    requestId: request.id,
    action: input.action,
    targetNodeId: input.targetNodeId,
    focusNodeId: input.focusNodeId,
    title: input.title,
    summary: input.summary,
    operations: input.operations,
    confidence: input.confidence,
    status: "pending_review",
    createdAt: knowledgeNow
  };
  return {
    ...snapshot,
    agentRequests: snapshot.agentRequests.concat(request),
    candidatePatches: snapshot.candidatePatches.concat(patch)
  };
}

function hasPendingPatch(snapshot: KnowledgeWorkspaceSnapshot, action: AgentActionKind, targetNodeId: string) {
  return snapshot.candidatePatches.some((item) => item.action === action && item.targetNodeId === targetNodeId && item.status === "pending_review");
}

function appendUnique<T extends { id: string }>(current: T[], additions: T[]) {
  const existingIds = new Set(current.map((item) => item.id));
  return current.concat(additions.filter((item) => !existingIds.has(item.id)));
}

function node(id: string, kind: KnowledgeNodeKind, title: string, summary: string, depth: number, tags: string[]): KnowledgeNode {
  return { id, kind, title, summary, status: "open", depth, tags, sourceRefs: [], createdBy: "agent", createdAt: knowledgeNow, updatedAt: knowledgeNow };
}

function edge(id: string, fromNodeId: string, toNodeId: string, kind: KnowledgeEdge["kind"], confidence = 0.9): KnowledgeEdge {
  return { id, fromNodeId, toNodeId, kind, confidence, createdAt: knowledgeNow };
}

function slugify(value: string) {
  const slug = value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-|-$/g, "");
  return slug || "subject";
}
