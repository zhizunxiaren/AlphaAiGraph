import { researchNow } from "./fixtures";
import type { AgentMarker, ResearchEdge, ResearchMap, ResearchNode, SourceAsset } from "../types";

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-|-$/g, "");

const marker = (nodeId: string, kind: AgentMarker["kind"], label: string, reason: string, severity?: AgentMarker["severity"]): AgentMarker => ({
  id: `${nodeId}-marker-${kind}`,
  kind,
  label,
  reason,
  confidence: 0.82,
  severity
});

const expansionTemplates: Record<string, Array<{ title: string; summary: string; kind: ResearchNode["kind"]; markers: AgentMarker["kind"][] }>> = {
  "node-product-positioning": [
    { title: "非聊天主轴", summary: "Agent 流是结构化研究事件，不是普通聊天。", kind: "finding", markers: ["focus"] },
    { title: "非静态脑图", summary: "节点必须携带状态、证据、动作和下钻能力。", kind: "finding", markers: ["difficulty"] },
    { title: "第一屏心智", summary: "用户应立即看到研究地图和推荐路径。", kind: "conclusion", markers: ["core_entry"] }
  ],
  "node-workflow-map": [
    { title: "节点状态", summary: "区分未展开、展开中、已展开和失败。", kind: "concept", markers: ["focus"] },
    { title: "Marker 理由", summary: "重点、难点、风险和待验证必须解释原因。", kind: "concept", markers: ["recommended_drilldown"] },
    { title: "渐进式下钻", summary: "一次只展开选中节点的一层。", kind: "action", markers: ["needs_validation"] }
  ],
  "node-parallel-research": [
    { title: "候选区隔离", summary: "并行任务输出先进入 candidate result。", kind: "risk", markers: ["risk"] },
    { title: "手动合并", summary: "用户显式点击合并后才写入主图。", kind: "action", markers: ["needs_validation"] },
    { title: "任务独立状态", summary: "同组 job 可独立成功、失败、取消或重试。", kind: "concept", markers: ["difficulty"] }
  ],
  "node-side-inquiry": [
    { title: "local_node 上下文", summary: "只围绕当前节点解释，不污染主线。", kind: "concept", markers: ["focus"] },
    { title: "显式沉淀", summary: "用户选择后才生成 ConceptNote。", kind: "action", markers: ["needs_validation"] },
    { title: "主图不变", summary: "创建和追问不会改变 nodes 或 edges。", kind: "finding", markers: ["risk"] }
  ],
  "node-evidence-validation": [
    { title: "证据锚点", summary: "每个判断可以追溯到文档、代码或命令输出。", kind: "evidence", markers: ["focus"] },
    { title: "验证动作", summary: "命令和脚本作为 action 提出，执行需批准。", kind: "action", markers: ["needs_validation"] },
    { title: "执行结果", summary: "运行结果回填为 ExecutionRun 和 evidence。", kind: "result", markers: ["recommended_drilldown"] }
  ],
  "node-relationship-projection": [
    { title: "投影节点", summary: "ResearchNode 映射为 RelationshipGraphNode。", kind: "concept", markers: ["focus"] },
    { title: "来源追溯", summary: "sourceId 保留原始 research 或 evidence id。", kind: "evidence", markers: ["needs_validation"] },
    { title: "非主数据源", summary: "关系图谱可以重建，不能绕过研究数据编辑。", kind: "risk", markers: ["risk"] }
  ]
};

const genericTemplate = [
  { title: "关键问题", summary: "围绕当前节点提炼下一步问题。", kind: "question" as const, markers: ["recommended_drilldown" as const] },
  { title: "证据线索", summary: "整理当前节点需要查看的证据。", kind: "evidence" as const, markers: ["needs_validation" as const] }
];

export function generateFirstLayerResearchMap(objectId: string, title: string, sourceAssets: SourceAsset[]): ResearchMap {
  const rootId = `node-${slug(title)}-root`;
  const children = ["产品定位", "研究工作流脑图", "并行研究", "旁路临时会话", "证据与验证", "关系图谱投影"];
  const nodes: ResearchNode[] = [
    {
      id: rootId,
      mapId: "generated-map",
      kind: "root",
      title,
      summary: `基于 ${sourceAssets.length} 个资料生成第一层研究地图。`,
      depth: 0,
      order: 0,
      expansionState: "expanded",
      status: "new",
      markers: [marker(rootId, "core_entry", "核心入口", `研究对象 ${objectId} 的入口。`, "high")],
      evidenceIds: [],
      actionIds: [],
      inquiryIds: [],
      conceptNoteIds: [],
      createdBy: "agent",
      createdAt: researchNow,
      updatedAt: researchNow
    },
    ...children.map((childTitle, index) => {
      const id = `node-generated-${slug(childTitle)}`;
      return {
        id,
        mapId: "generated-map",
        parentId: rootId,
        kind: "section" as const,
        title: childTitle,
        summary: `${childTitle} 是第一层研究方向。`,
        depth: 1,
        order: index + 1,
        expansionState: "not_expanded" as const,
        status: "new" as const,
        markers: [marker(id, index === 0 ? "focus" : "recommended_drilldown", index === 0 ? "重点" : "建议下钻", "第一层地图只给出高层方向。")],
        evidenceIds: [],
        actionIds: [],
        inquiryIds: [],
        conceptNoteIds: [],
        createdBy: "agent" as const,
        createdAt: researchNow,
        updatedAt: researchNow
      };
    })
  ];

  const edges: ResearchEdge[] = nodes
    .filter((item) => item.parentId === rootId)
    .map((item) => ({
      id: `edge-${rootId}-${item.id}`,
      fromNodeId: rootId,
      toNodeId: item.id,
      kind: "decomposes_to",
      confidence: 0.86,
      createdBy: "agent",
      createdAt: researchNow
    }));

  return {
    id: "generated-map",
    sessionId: "generated-session",
    title: `${title} 第一层研究地图`,
    rootNodeId: rootId,
    nodes,
    edges,
    createdAt: researchNow,
    updatedAt: researchNow
  };
}

export function expandResearchNode(map: ResearchMap, nodeId: string): ResearchMap {
  const target = map.nodes.find((item) => item.id === nodeId);
  if (!target || target.expansionState === "expanded") {
    return map;
  }

  const template = expansionTemplates[nodeId] ?? genericTemplate;
  const existingTitles = new Set(map.nodes.filter((item) => item.parentId === nodeId).map((item) => item.title));
  const nextNodes = template
    .filter((item) => !existingTitles.has(item.title))
    .map((item, index) => {
      const id = `${nodeId}-child-${slug(item.title)}`;
      return {
        id,
        mapId: map.id,
        parentId: nodeId,
        kind: item.kind,
        title: item.title,
        summary: item.summary,
        depth: target.depth + 1,
        order: index + 1,
        expansionState: "not_expanded" as const,
        status: "new" as const,
        markers: item.markers.map((kind) => marker(id, kind, markerLabel(kind), `Agent 建议围绕「${item.title}」继续研究。`)),
        evidenceIds: target.evidenceIds.slice(0, 1),
        actionIds: [],
        inquiryIds: [],
        conceptNoteIds: [],
        createdBy: "agent" as const,
        createdAt: researchNow,
        updatedAt: researchNow
      };
    });

  const nextEdges: ResearchEdge[] = nextNodes.map((item) => ({
    id: `edge-${nodeId}-${item.id}`,
    fromNodeId: nodeId,
    toNodeId: item.id,
    kind: "decomposes_to",
    confidence: 0.82,
    createdBy: "agent",
    createdAt: researchNow
  }));

  return {
    ...map,
    nodes: map.nodes.map((item) => (item.id === nodeId ? { ...item, expansionState: "expanded" as const, updatedAt: researchNow } : item)).concat(nextNodes),
    edges: map.edges.concat(nextEdges),
    updatedAt: researchNow
  };
}

export function markerLabel(kind: AgentMarker["kind"]) {
  const labels: Record<AgentMarker["kind"], string> = {
    focus: "重点",
    difficulty: "难点",
    risk: "风险",
    recommended_drilldown: "建议下钻",
    needs_validation: "待验证",
    low_priority: "低优先级",
    uncertain: "不确定",
    core_entry: "核心入口"
  };
  return labels[kind];
}
