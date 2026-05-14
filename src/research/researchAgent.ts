import type {
  AgentJob,
  AgentMarker,
  ResearchAction,
  ResearchEdge,
  ResearchMap,
  ResearchNode,
  ResearchObject,
  ResearchObjectKind,
  ResearchSession,
  ResearchThread,
  SourceAsset,
  EvidenceAnchor,
} from "../types";
import { researchNow, requiredFirstLayerTitles } from "./constants";

export interface ResearchAgentResult {
  object: ResearchObject;
  session: ResearchSession;
  thread: ResearchThread;
  map: ResearchMap;
  markers: AgentMarker[];
  evidenceAnchors: EvidenceAnchor[];
  actions: ResearchAction[];
  jobs: AgentJob[];
}

export function generateFirstLayerResearchMap(input: {
  objectId: string;
  objectKind: ResearchObjectKind;
  title: string;
  sourceAssets: SourceAsset[];
}): ResearchAgentResult {
  const object: ResearchObject = {
    id: input.objectId,
    kind: input.objectKind,
    title: input.title,
    status: "ready",
    sourceAssetIds: input.sourceAssets.map((source) => source.id),
    createdAt: researchNow,
    updatedAt: researchNow,
  };
  const session: ResearchSession = {
    id: `${input.objectId}-session`,
    objectId: object.id,
    title: "渐进式研究地图",
    status: "active",
    activeThreadId: `${input.objectId}-thread-main`,
    createdAt: researchNow,
    updatedAt: researchNow,
  };
  const thread: ResearchThread = {
    id: session.activeThreadId,
    sessionId: session.id,
    title: "主研究线程",
    kind: "main",
    status: "active",
    mapId: `${input.objectId}-map`,
    createdAt: researchNow,
    updatedAt: researchNow,
  };
  const rootNode: ResearchNode = {
    id: `${thread.mapId}-root`,
    mapId: thread.mapId,
    kind: "root",
    title: `${input.title} 研究对象`,
    summary: "AI Agent 先生成高层研究地图，再由用户选择节点下钻。",
    depth: 0,
    status: "active",
    expansionState: "expanded",
    markerIds: [`${thread.mapId}-marker-core`],
    evidenceIds: input.sourceAssets[0] ? [`${thread.mapId}-evidence-0`] : [],
    actionIds: [],
    createdAt: researchNow,
    updatedAt: researchNow,
  };
  const childNodes = requiredFirstLayerTitles.map((title, index): ResearchNode => ({
    id: `${thread.mapId}-node-${index + 1}`,
    mapId: thread.mapId,
    parentNodeId: rootNode.id,
    kind: index === 0 ? "module" : "concept",
    title,
    summary: firstLayerSummary(title),
    depth: 1,
    status: "open",
    expansionState: "collapsed",
    markerIds: [`${thread.mapId}-marker-${index + 1}`],
    evidenceIds: input.sourceAssets[index % Math.max(input.sourceAssets.length, 1)]
      ? [`${thread.mapId}-evidence-${index % input.sourceAssets.length}`]
      : [],
    actionIds: [`${thread.mapId}-action-drill-${index + 1}`],
    createdAt: researchNow,
    updatedAt: researchNow,
  }));
  const markers: AgentMarker[] = [
    {
      id: `${thread.mapId}-marker-core`,
      nodeId: rootNode.id,
      kind: "core_entry",
      label: "核心入口",
      rationale: "根节点承载当前复杂对象的研究入口。",
      confidence: 0.94,
    },
    ...childNodes.map((node, index): AgentMarker => ({
      id: `${thread.mapId}-marker-${index + 1}`,
      nodeId: node.id,
      kind: (["focus", "difficulty", "risk", "recommended_drilldown", "needs_validation", "uncertain"] as const)[index],
      label: ["重点", "难点", "风险", "建议下钻", "待验证", "不确定"][index],
      rationale: `${node.title} 是第一层研究地图中的关键判断点。`,
      confidence: 0.8 + index * 0.02,
    })),
  ];
  const evidenceAnchors: EvidenceAnchor[] = input.sourceAssets.map((source, index) => ({
    id: `${thread.mapId}-evidence-${index}`,
    sourceAssetId: source.id,
    title: `${source.title} 证据锚点`,
    quote: source.summary,
    locator: { kind: "file", path: source.path },
    createdAt: researchNow,
  }));
  const actions: ResearchAction[] = childNodes.flatMap((node, index): ResearchAction[] => [
    {
      id: `${thread.mapId}-action-drill-${index + 1}`,
      nodeId: node.id,
      kind: "drill_down",
      title: "深入研究",
      description: "只展开当前选中节点的一层研究问题。",
      createdAt: researchNow,
    },
    {
      id: `${thread.mapId}-action-side-${index + 1}`,
      nodeId: node.id,
      kind: "create_side_inquiry",
      title: "旁路澄清",
      description: "在隔离临时会话中解释概念。",
      createdAt: researchNow,
    },
  ]);
  const map: ResearchMap = {
    id: thread.mapId,
    sessionId: session.id,
    threadId: thread.id,
    rootNodeId: rootNode.id,
    nodes: [rootNode, ...childNodes],
    edges: childNodes.map((node, index): ResearchEdge => ({
      id: `${thread.mapId}-edge-${index + 1}`,
      mapId: thread.mapId,
      fromNodeId: rootNode.id,
      toNodeId: node.id,
      kind: "contains",
      confidence: 0.93,
      createdAt: researchNow,
    })),
    createdAt: researchNow,
    updatedAt: researchNow,
  };
  const jobs: AgentJob[] = [
    {
      id: `${thread.mapId}-job-source-scan`,
      kind: "source_scan",
      status: "completed",
      title: "扫描输入资料",
      nodeIds: [rootNode.id],
      sourceAssetIds: input.sourceAssets.map((source) => source.id),
      outputIds: evidenceAnchors.map((evidence) => evidence.id),
      createdAt: researchNow,
      updatedAt: researchNow,
    },
    {
      id: `${thread.mapId}-job-map-generation`,
      kind: "map_generation",
      status: "completed",
      title: "生成第一层研究地图",
      nodeIds: map.nodes.map((node) => node.id),
      sourceAssetIds: input.sourceAssets.map((source) => source.id),
      outputIds: map.nodes.map((node) => node.id),
      createdAt: researchNow,
      updatedAt: researchNow,
    },
  ];

  return { object, session, thread, map, markers, evidenceAnchors, actions, jobs };
}

export function expandResearchNode(map: ResearchMap, nodeId: string): ResearchMap {
  const target = map.nodes.find((node) => node.id === nodeId);
  if (!target || target.expansionState === "expanded") {
    return map;
  }
  const children = expansionTemplates(target.title).filter(
    (title) =>
      !map.nodes.some((node) => node.parentNodeId === target.id && node.title === title),
  );
  if (children.length === 0) {
    return {
      ...map,
      nodes: map.nodes.map((node) =>
        node.id === target.id ? { ...node, expansionState: "expanded" as const, updatedAt: researchNow } : node,
      ),
      updatedAt: researchNow,
    };
  }
  const newNodes = children.map((title, index): ResearchNode => ({
    id: `${target.id}-child-${index + 1}`,
    mapId: map.id,
    parentNodeId: target.id,
    kind: index === 0 ? "question" : "finding",
    title,
    summary: `${target.title} 的下一层研究问题。`,
    depth: target.depth + 1,
    status: "open",
    expansionState: "collapsed",
    markerIds: [],
    evidenceIds: [],
    actionIds: [],
    createdAt: researchNow,
    updatedAt: researchNow,
  }));
  const newEdges = newNodes.map((node, index): ResearchEdge => ({
    id: `${target.id}-edge-${index + 1}`,
    mapId: map.id,
    fromNodeId: target.id,
    toNodeId: node.id,
    kind: "contains",
    confidence: 0.86,
    createdAt: researchNow,
  }));
  return {
    ...map,
    nodes: [
      ...map.nodes.map((node) =>
        node.id === target.id ? { ...node, expansionState: "expanded" as const, updatedAt: researchNow } : node,
      ),
      ...newNodes,
    ],
    edges: [...map.edges, ...newEdges],
    updatedAt: researchNow,
  };
}

function firstLayerSummary(title: string): string {
  const summaries: Record<string, string> = {
    产品定位: "确认 AlphaAiGraph 不是普通知识图谱或 PDF 总结器。",
    研究工作流脑图: "定义当前研究会话的主画布和渐进式展开方式。",
    并行研究: "让后台分析先进入候选区，避免污染主研究图。",
    旁路临时会话: "隔离概念澄清，显式沉淀后才进入知识整理。",
    证据与验证: "把资料片段、命令输出和结论关联到节点。",
    关系图谱投影: "从研究数据派生 Obsidian-style 长期关系网络。",
  };
  return summaries[title] ?? `${title} 的研究摘要。`;
}

function expansionTemplates(title: string): string[] {
  const templates: Record<string, string[]> = {
    产品定位: ["目标用户与主场景", "非目标形态边界", "第一屏产品信号"],
    研究工作流脑图: ["节点下钻策略", "Agent marker 解释", "证据回填路径"],
    并行研究: ["候选结果隔离", "任务独立失败", "显式合并审核"],
    旁路临时会话: ["上下文策略", "消息持久化", "显式沉淀"],
    证据与验证: ["证据锚点结构", "验证动作", "执行结果回填"],
    关系图谱投影: ["字段映射", "边语义", "无状态再生成"],
  };
  return templates[title] ?? [`${title} 关键问题`, `${title} 验证路径`];
}
