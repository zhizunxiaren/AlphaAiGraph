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
  KnowledgeView,
  KnowledgeWorkspaceSnapshot,
  NodeConversation,
  ProjectMode,
  ProjectSubject,
  SubjectKind
} from "../types";
import { createProjectRecord, projectModelNow } from "./projectModel";
import { assertKnowledgeProvenance } from "./provenance";
import { createKnowledgeMetadata } from "./knowledgeMetadata";
import { assertKnowledgeEvolution } from "./knowledgeEvolution";
import { applyGraphPatchOperations, createGraphPatchAudit } from "./graphPatch";
import { isProjectWritable } from "./projectLifecycle";
import { assertCorrectionImpactAssessmentCurrent } from "./impactAssessment";
import {
  assertImpactReviewPatchCurrent,
  completeImpactReviewTaskModification,
  createImpactReviewTasks
} from "./impactReview";
import {
  completeResearchConclusionAcceptance,
  prepareResearchConclusionAcceptance
} from "./researchConclusion";
import {
  assertAcceptedResearchRoutePatches,
  prepareResearchRouteAcceptance
} from "./researchRoute";
import {
  assertAcceptedResearchRouteScenarioPatches,
  prepareResearchRouteScenarioAcceptance
} from "./researchRouteScenario";
import {
  assertAcceptedCrossProjectKnowledgeReusePatches,
  prepareCrossProjectKnowledgeReuseAcceptance
} from "./knowledgeReuse";
import { knowledgeNodesInScope, queryLocalNeighborhood } from "./knowledgeGraphQuery";

export const knowledgeNow = projectModelNow;

type LayerTemplate = readonly [string, string, string, KnowledgeNodeKind];

const firstLayers: Record<ProjectMode, readonly LayerTemplate[]> = {
  understand: [
    ["problem", "问题与价值", "它解决什么问题，理解边界在哪里？", "topic"],
    ["principles", "核心原理", "关键机制、抽象和运行方式。", "concept"],
    ["architecture", "系统结构", "组件、数据流、接口与依赖。", "topic"],
    ["ecosystem", "生态与关联", "工具链、替代方案和互操作关系。", "topic"],
    ["constraints", "约束与风险", "性能、安全、成本和采用门槛。", "constraint"]
  ],
  systematize: [
    ["inventory", "知识清单", "盘点已有概念、经验、方法和资料。", "topic"],
    ["structure", "当前结构", "识别现有知识的层次、依赖与分类。", "topic"],
    ["gaps", "缺口与断层", "记录尚未覆盖或无法连接的知识。", "question"],
    ["conflicts", "冲突与疑点", "标记矛盾、过时和适用范围不明的内容。", "uncertainty"],
    ["validation", "验证重点", "确定需要优先补证据和纠偏的高影响知识。", "topic"]
  ],
  research: [
    ["research-question", "核心研究问题", "明确需要回答的问题与判断目标。", "question"],
    ["scope", "范围与口径", "限定时间、地域、对象、单位和排除项。", "constraint"],
    ["claims", "初始假设", "记录需要支持、反驳或修正的候选解释。", "hypothesis"],
    ["evidence", "证据方向", "规划原始来源、支持证据和反对证据。", "topic"],
    ["uncertainty", "不确定性", "记录证据缺口、冲突和替代解释。", "uncertainty"]
  ]
};

const expansionTemplates: Record<string, Array<[string, string, KnowledgeNodeKind]>> = {
  principles: [
    ["执行模型", "解释代码或规则如何被执行。", "concept"],
    ["边界与接口", "识别系统边界、输入输出和契约。", "concept"],
    ["关键权衡", "说明性能、复杂度与可移植性的交换。", "inference"]
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

export interface CreateProjectWorkspaceInput {
  mode: ProjectMode;
  title: string;
  subjectKind: SubjectKind;
  goal?: string;
}

export function createProjectWorkspace({
  mode,
  title,
  subjectKind,
  goal
}: CreateProjectWorkspaceInput): KnowledgeWorkspaceSnapshot {
  const slug = slugify(title);
  const rootId = `knowledge-${slug}`;
  const graphId = `graph-${slug}`;
  const spaceId = "space-main";
  const subject: ProjectSubject = {
    id: `subject-${slug}`,
    kind: subjectKind,
    title,
    description: "围绕用户目标渐进建立可持续演化的知识网络。",
    rootNodeId: rootId,
    sourceAssetIds: []
  };
  const project = createProjectRecord({
    id: `project-${mode}-${slug}`,
    spaceId,
    graphId,
    mode,
    title,
    goal,
    subject
  });
  const root: KnowledgeNode = node(rootId, "subject", title, subject.description, 0, [subjectKind, mode], project.id);
  const layer = firstLayers[mode];
  const firstLayerNodes = layer.map(([key, nodeTitle, summary, nodeKind]) =>
    node(`${rootId}-${key}`, nodeKind, nodeTitle, summary, 1, ["第一层", mode], project.id)
  );
  const graph = {
    id: graphId,
    title: `${title} 知识图谱`,
    rootNodeIds: [rootId],
    nodes: [root, ...firstLayerNodes],
    edges: layer.map(([key]) => edge(`${rootId}-contains-${key}`, rootId, `${rootId}-${key}`, "contains")),
    createdAt: knowledgeNow,
    updatedAt: knowledgeNow
  };
  return {
    space: {
      id: spaceId,
      title: "AlphaAiGraph Knowledge Space",
      graphId,
      projectIds: [project.id],
      createdAt: knowledgeNow,
      updatedAt: knowledgeNow
    },
    project,
    projects: [project],
    subject,
    graph,
    views: buildProjectViews(project.mode, graph.nodes, rootId),
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
    agentRuns: [],
    candidatePatches: [],
    impactReviewTasks: [],
    researchOrchestration: {
      briefs: [],
      plans: [],
      tasks: [],
      rounds: [],
      searchQueries: [],
      verificationRecords: []
    },
    conversations: [],
    knowledgeSourceAssets: [],
    sourceAnchors: [],
    sourceAssets: []
  };
}

/** Stage-0 compatibility entry: all legacy analyses become Understand Projects. */
export function createKnowledgeWorkspace(
  title = "WebAssembly Component Model",
  kind: AnalysisSubject["kind"] = "technology"
): KnowledgeWorkspaceSnapshot {
  return createProjectWorkspace({ mode: "understand", title, subjectKind: kind });
}

export function createResearchRouteWorkspace(title = "技术采用决策"): KnowledgeWorkspaceSnapshot {
  const workspace = createProjectWorkspace({ mode: "research", title, subjectKind: "question" });
  const rootId = workspace.project.subject.rootNodeId;
  const routeRoot = node(`${rootId}-route`, "decision", "技术路线", "从目标、约束和证据形成可执行选择。", 1, ["技术路线"], workspace.project.id);
  const routeNodes = expansionTemplates.route.map(([nodeTitle, summary, nodeKind], index) =>
    node(`${routeRoot.id}-detail-${index + 1}`, nodeKind, nodeTitle, summary, 2, ["技术路线"], workspace.project.id)
  );
  const graph = {
    ...workspace.graph,
    nodes: workspace.graph.nodes.concat(routeRoot, routeNodes),
    edges: workspace.graph.edges.concat(
      edge(`${rootId}-contains-route`, rootId, routeRoot.id, "contains"),
      ...routeNodes.map((routeNode, index) => edge(`${routeRoot.id}-contains-${index + 1}`, routeRoot.id, routeNode.id, "contains"))
    )
  };
  return {
    ...workspace,
    graph,
    views: buildProjectViews(workspace.project.mode, graph.nodes, rootId)
  };
}

export function deriveProjectFromNode(
  snapshot: KnowledgeWorkspaceSnapshot,
  input: { mode: ProjectMode; nodeId: string; title?: string; goal?: string; subjectKind?: SubjectKind }
): KnowledgeWorkspaceSnapshot {
  const sourceNode = snapshot.graph.nodes.find((item) => item.id === input.nodeId);
  if (!sourceNode) return snapshot;
  const title = input.title?.trim() || sourceNode.title;
  const slug = slugify(title);
  const subject: ProjectSubject = {
    id: `subject-${input.mode}-${slug}-${snapshot.projects.length + 1}`,
    kind: input.subjectKind ?? snapshot.project.subject.kind,
    title,
    description: `从已有知识节点「${sourceNode.title}」派生的 Project。`,
    rootNodeId: sourceNode.id,
    sourceAssetIds: Array.from(new Set(sourceNode.sourceRefs.map((sourceRef) => sourceRef.sourceId)))
  };
  const project = createProjectRecord({
    id: `project-${input.mode}-${slug}-${snapshot.projects.length + 1}`,
    spaceId: snapshot.space.id,
    graphId: snapshot.graph.id,
    mode: input.mode,
    title,
    goal: input.goal,
    subject,
    parentProjectId: snapshot.project.id,
    derivedFromNodeId: sourceNode.id
  });
  const views = buildProjectViews(project.mode, snapshot.graph.nodes, sourceNode.id);
  const next = {
    ...snapshot,
    space: {
      ...snapshot.space,
      projectIds: snapshot.space.projectIds.concat(project.id),
      updatedAt: knowledgeNow
    },
    project,
    projects: snapshot.projects.concat(project),
    subject: project.subject,
    views,
    activeViewId: views[0].id,
    selectedNodeId: sourceNode.id
  };
  return { ...next, selection: buildKnowledgeSelection(next, sourceNode.id, snapshot.selection.contextPolicy) };
}

export function buildProjectViews(
  mode: ProjectMode,
  nodes: KnowledgeNode[],
  rootNodeId: string
): KnowledgeView[] {
  const views: KnowledgeView[] = [
    { id: "view-mind-map", kind: "mind_map", title: mode === "systematize" ? "知识结构" : "分析脑图", rootNodeId, focusNodeId: rootNodeId, visibleDepth: 2 },
    { id: "view-network", kind: "network", title: "知识网络", rootNodeId, focusNodeId: rootNodeId, visibleDepth: 4 }
  ];
  if (mode === "systematize") {
    views.push(
      { id: "view-knowledge-modules", kind: "knowledge_modules", title: "知识模块", rootNodeId, focusNodeId: rootNodeId, visibleDepth: 3 },
      { id: "view-skill-tree", kind: "skill_tree", title: "技能树", rootNodeId, focusNodeId: rootNodeId, visibleDepth: 4 },
      { id: "view-learning-dependencies", kind: "learning_dependencies", title: "学习依赖", rootNodeId, focusNodeId: rootNodeId, visibleDepth: 4 },
      { id: "view-learning-path", kind: "learning_path", title: "学习路径", rootNodeId, focusNodeId: rootNodeId, visibleDepth: 4 },
      { id: "view-practice-manual", kind: "practice_manual", title: "实践手册", rootNodeId, focusNodeId: rootNodeId, visibleDepth: 4 }
    );
  }
  const routeRoot = mode === "research"
    ? nodes.find((item) => item.kind === "decision" && item.tags.includes("技术路线"))
    : undefined;
  if (routeRoot) {
    views.push({ id: "view-route", kind: "route", title: "技术路线", rootNodeId: routeRoot.id, focusNodeId: routeRoot.id, visibleDepth: 3 });
  }
  return views;
}

export function proposeKnowledgeDrillDown(snapshot: KnowledgeWorkspaceSnapshot, nodeId: string): KnowledgeWorkspaceSnapshot {
  if (!isProjectWritable(snapshot)) return snapshot;
  const parent = snapshot.graph.nodes.find((item) => item.id === nodeId);
  if (!parent) return snapshot;
  if (snapshot.graph.edges.some((item) => item.fromNodeId === nodeId && item.kind === "contains")) return snapshot;
  if (hasPendingPatch(snapshot, "drill_down", nodeId)) return snapshot;

  const templateKey = Object.keys(expansionTemplates).find((key) => nodeId.endsWith(`-${key}`));
  const template: Array<[string, string, KnowledgeNodeKind]> = templateKey ? expansionTemplates[templateKey] : [
    [`${parent.title} 的关键概念`, `建立 ${parent.title} 的定义和边界。`, "concept" as const],
    [`${parent.title} 的证据缺口`, `寻找能够支持或反驳该节点的来源。`, "question" as const],
    [`${parent.title} 的开放问题`, `记录下一轮需要验证的问题。`, "question" as const]
  ];
  const children = template.map(([title, summary, kind], index) =>
    node(`${nodeId}-detail-${index + 1}`, kind, title, summary, parent.depth + 1, [parent.title], snapshot.project.id)
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
      ...children.map((child): GraphPatchOperation => ({
        kind: "create_node",
        node: child,
        audit: operationAudit(`create-${child.id}`, `Create the next knowledge layer under ${parent.id}`)
      })),
      ...childEdges.map((childEdge): GraphPatchOperation => ({
        kind: "create_edge",
        edge: childEdge,
        audit: operationAudit(`create-${childEdge.id}`, `Connect the new knowledge node to ${parent.id}`)
      }))
    ],
    confidence: 0.86
  });
}

export function proposeKnowledgeAnswer(
  snapshot: KnowledgeWorkspaceSnapshot,
  nodeId: string,
  question: string
): KnowledgeWorkspaceSnapshot {
  if (!isProjectWritable(snapshot)) return snapshot;
  const target = snapshot.graph.nodes.find((item) => item.id === nodeId);
  const trimmed = question.trim();
  if (!target || !trimmed) return snapshot;
  const sequence = snapshot.conversations.length + snapshot.candidatePatches.filter((item) => item.action === "ask").length + 1;
  const questionNode = node(`${nodeId}-question-${sequence}`, "question", trimmed, `围绕「${target.title}」提出的问题。`, target.depth + 1, ["用户提问"], snapshot.project.id, "user");
  const answerNode = node(
    `${nodeId}-answer-${sequence}`,
    "synthesis",
    `${target.title} · 回答 ${sequence}`,
    `应结合当前节点、相邻知识和来源证据回答：${trimmed}`,
    target.depth + 1,
    ["待模型生成", "可沉淀"],
    snapshot.project.id
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
      { kind: "create_node", node: questionNode, audit: operationAudit(`create-${questionNode.id}`, "Preserve the user question as knowledge") },
      { kind: "create_node", node: answerNode, audit: operationAudit(`create-${answerNode.id}`, "Preserve the candidate answer as knowledge") },
      {
        kind: "create_edge",
        edge: edge(`${nodeId}-question-${sequence}`, questionNode.id, nodeId, "related_to"),
        audit: operationAudit(`link-${nodeId}-question-${sequence}`, "Link the question to its selected context")
      },
      {
        kind: "create_edge",
        edge: edge(`${nodeId}-answer-${sequence}`, answerNode.id, questionNode.id, "answers"),
        audit: operationAudit(`link-${nodeId}-answer-${sequence}`, "Link the answer to the question it addresses")
      },
      { kind: "create_conversation", conversation, audit: operationAudit(`create-${conversation.id}`, "Preserve the node conversation audit trail") }
    ],
    confidence: 0.72
  });
}

export function proposeKnowledgeSummary(snapshot: KnowledgeWorkspaceSnapshot, nodeId: string): KnowledgeWorkspaceSnapshot {
  if (!isProjectWritable(snapshot)) return snapshot;
  const target = snapshot.graph.nodes.find((item) => item.id === nodeId);
  if (!target) return snapshot;
  if (hasPendingPatch(snapshot, "summarize", nodeId)) return snapshot;
  const neighbors = queryLocalNeighborhood(snapshot, {
    focusNodeId: nodeId,
    depth: 1,
    maxNodes: Math.max(1, snapshot.graph.nodes.length)
  }).nodes.filter((item) => item.id !== nodeId).map((item) => item.id);
  const id = `${nodeId}-summary-${snapshot.graph.nodes.filter((item) => item.id.startsWith(`${nodeId}-summary-`)).length + 1}`;
  const summary = node(id, "synthesis", `${target.title} · 阶段总结`, `综合当前节点与 ${neighbors.length} 个直接关联节点，形成可继续修订的阶段结论。`, target.depth + 1, ["阶段总结"], snapshot.project.id);
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
      { kind: "create_node", node: summary, audit: operationAudit(`create-${summary.id}`, "Create a reviewable stage summary") },
      ...summaryEdges.map((summaryEdge): GraphPatchOperation => ({
        kind: "create_edge",
        edge: summaryEdge,
        audit: operationAudit(`create-${summaryEdge.id}`, "Record which knowledge the stage summary covers")
      }))
    ],
    confidence: 0.78
  });
}

export function acceptCandidateGraphPatch(snapshot: KnowledgeWorkspaceSnapshot, patchId: string): KnowledgeWorkspaceSnapshot {
  if (!isProjectWritable(snapshot)) return snapshot;
  const patch = snapshot.candidatePatches.find((item) => item.id === patchId && item.status === "pending_review");
  if (!patch) return snapshot;
  const researchConclusionAcceptance = prepareResearchConclusionAcceptance(snapshot, patch, knowledgeNow);
  prepareResearchRouteAcceptance(snapshot, patch);
  prepareResearchRouteScenarioAcceptance(snapshot, patch);
  prepareCrossProjectKnowledgeReuseAcceptance(snapshot, patch);
  assertCorrectionImpactAssessmentCurrent(snapshot, patch);
  assertImpactReviewPatchCurrent(snapshot, patch);
  if (!Number.isInteger(patch.revision) || patch.revision < 1) {
    throw new Error("Graph patch validation failed: [invalid_revision] revision must be a positive integer");
  }
  const conversations = patch.operations
    .filter((item): item is Extract<GraphPatchOperation, { kind: "create_conversation" }> => item.kind === "create_conversation")
    .map((item) => item.conversation);
  const existingConversationIds = new Set(snapshot.conversations.map((item) => item.id));
  if (conversations.some((conversation) => existingConversationIds.has(conversation.id))) {
    throw new Error("Graph patch validation failed: [silent_overwrite] conversation id already exists");
  }
  const nextGraph = {
    ...applyGraphPatchOperations(snapshot.graph, patch.operations),
    updatedAt: knowledgeNow
  };
  assertKnowledgeProvenance(nextGraph, {
    sources: snapshot.knowledgeSourceAssets,
    anchors: snapshot.sourceAnchors
  });
  assertKnowledgeEvolution(nextGraph);
  const newImpactReviewTasks = createImpactReviewTasks({ ...snapshot, graph: nextGraph }, patch, knowledgeNow);
  const existingReviewTaskIds = new Set(snapshot.impactReviewTasks.map((task) => task.id));
  if (newImpactReviewTasks.some((task) => existingReviewTaskIds.has(task.id))) {
    throw new Error("Impact review failed: [duplicate_review_task] correction review tasks already exist");
  }
  let next = {
    ...snapshot,
    graph: nextGraph,
    conversations: snapshot.conversations.concat(conversations),
    impactReviewTasks: snapshot.impactReviewTasks.concat(newImpactReviewTasks),
    selectedNodeId: patch.focusNodeId,
    candidatePatches: snapshot.candidatePatches.map((item) => item.id === patchId ? {
      ...item,
      status: "accepted" as const,
      reviewedBy: "user" as const,
      reviewedAt: knowledgeNow
    } : item),
    agentRequests: snapshot.agentRequests.map((item) => item.id === patch.requestId ? { ...item, status: "accepted" as const } : item)
  };
  next = completeImpactReviewTaskModification(next, patch, true, knowledgeNow);
  next = completeResearchConclusionAcceptance(next, researchConclusionAcceptance);
  assertAcceptedResearchRoutePatches(next);
  assertAcceptedResearchRouteScenarioPatches(next);
  assertAcceptedCrossProjectKnowledgeReusePatches(next);
  return { ...next, selection: buildKnowledgeSelection(next, patch.focusNodeId, snapshot.selection.contextPolicy) };
}

export function rejectCandidateGraphPatch(snapshot: KnowledgeWorkspaceSnapshot, patchId: string): KnowledgeWorkspaceSnapshot {
  if (!isProjectWritable(snapshot)) return snapshot;
  const patch = snapshot.candidatePatches.find((item) => item.id === patchId && item.status === "pending_review");
  if (!patch) return snapshot;
  assertImpactReviewPatchCurrent(snapshot, patch);
  const next = {
    ...snapshot,
    candidatePatches: snapshot.candidatePatches.map((item) => item.id === patchId ? {
      ...item,
      status: "rejected" as const,
      reviewedBy: "user" as const,
      reviewedAt: knowledgeNow
    } : item),
    agentRequests: snapshot.agentRequests.map((item) => item.id === patch.requestId ? { ...item, status: "rejected" as const } : item)
  };
  return completeImpactReviewTaskModification(next, patch, false, knowledgeNow);
}

export function buildKnowledgeSelection(
  snapshot: KnowledgeWorkspaceSnapshot,
  focusNodeId: string,
  contextPolicy: KnowledgeContextPolicy = snapshot.selection?.contextPolicy ?? "selected_and_neighbors"
): KnowledgeSelection {
  const focus = snapshot.graph.nodes.find((item) => item.id === focusNodeId);
  if (!focus) return snapshot.selection;
  const neighborIds = contextPolicy === "selected_and_neighbors"
    ? queryLocalNeighborhood(snapshot, {
      focusNodeId,
      depth: 1,
      maxNodes: Math.max(1, snapshot.graph.nodes.length)
    }).nodes.filter((item) => item.id !== focusNodeId).map((item) => item.id)
    : [];
  const nodeIds = contextPolicy === "whole_subject"
    ? knowledgeNodesInScope(snapshot).map((item) => item.id)
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
    revision: 1,
    createdBy: "agent",
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

function operationAudit(id: string, rationale: string) {
  return createGraphPatchAudit(id, rationale, knowledgeNow);
}

function node(
  id: string,
  kind: KnowledgeNodeKind,
  title: string,
  summary: string,
  depth: number,
  tags: string[],
  projectId: string,
  createdBy: "agent" | "user" = "agent"
): KnowledgeNode {
  return {
    id,
    kind,
    title,
    summary,
    status: "open",
    ...createKnowledgeMetadata({
      kind,
      createdBy,
      creatorId: createdBy === "user" ? "local-user" : "alpha-ai-graph",
      scopeContextId: projectId
    }),
    depth,
    tags,
    sourceRefs: [],
    createdAt: knowledgeNow,
    updatedAt: knowledgeNow
  };
}

function edge(id: string, fromNodeId: string, toNodeId: string, kind: KnowledgeEdge["kind"], confidence = 0.9): KnowledgeEdge {
  return { id, fromNodeId, toNodeId, kind, confidence, createdAt: knowledgeNow };
}

function slugify(value: string) {
  const slug = value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-|-$/g, "");
  return slug || "subject";
}
