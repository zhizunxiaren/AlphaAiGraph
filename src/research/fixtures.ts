import type {
  AgentJob,
  CandidateResult,
  EvidenceAnchor,
  ExecutionRun,
  KnowledgeDigest,
  ParallelAnalysisGroup,
  ResearchAction,
  ResearchMap,
  ResearchNode,
  ResearchObject,
  ResearchSession,
  ResearchThread,
  ResearchWorkspaceSnapshot,
  SideInquirySession,
  SourceAsset
} from "../types";

export const researchNow = "2026-05-09T00:00:00.000Z";

export const researchObject: ResearchObject = {
  id: "object-alpha-ai-graph",
  kind: "project",
  title: "AlphaAiGraph",
  description: "AI Agent 驱动的渐进式研究图谱产品 MVP。",
  rootUri: "G:/Projects/AI/AlphaAiGraph",
  createdAt: researchNow,
  updatedAt: researchNow,
  status: "mapped",
  metadata: { mode: "browser-local", source: "project-docs" }
};

export const activeSession: ResearchSession = {
  id: "session-mvp",
  objectId: researchObject.id,
  title: "MVP 研究驾驶舱",
  goal: "生成第一层研究地图，并允许用户选择节点逐层下钻。",
  activeMapId: "map-main",
  activeThreadIds: ["thread-main"],
  status: "active",
  createdAt: researchNow,
  updatedAt: researchNow
};

export const mainThread: ResearchThread = {
  id: "thread-main",
  sessionId: activeSession.id,
  mapId: "map-main",
  kind: "main",
  title: "主研究线程",
  goal: "围绕当前研究路径逐层分析。",
  focusNodeIds: ["node-root", "node-workflow-map"],
  sourceAssetIds: ["source-agents", "source-plan", "source-spec"],
  jobIds: ["job-scan", "job-map", "job-parallel"],
  mergePolicy: "manual_review",
  status: "running",
  createdAt: researchNow,
  updatedAt: researchNow
};

const marker = (nodeId: string, kind: ResearchNode["markers"][number]["kind"], label: string, reason: string, severity?: "low" | "medium" | "high") => ({
  id: `${nodeId}-marker-${kind}`,
  kind,
  label,
  reason,
  confidence: 0.86,
  severity
});

const node = (
  id: string,
  title: string,
  summary: string,
  order: number,
  markers: ResearchNode["markers"],
  kind: ResearchNode["kind"] = "section"
): ResearchNode => ({
  id,
  mapId: "map-main",
  parentId: id === "node-root" ? undefined : "node-root",
  kind,
  title,
  summary,
  depth: id === "node-root" ? 0 : 1,
  order,
  expansionState: id === "node-root" ? "expanded" : "not_expanded",
  status: id === "node-evidence-validation" ? "in_progress" : "new",
  markers,
  evidenceIds: id === "node-root" ? ["evidence-agents-loop"] : [`evidence-${id.replace("node-", "")}`],
  actionIds: [`action-${id.replace("node-", "")}-drill`, `action-${id.replace("node-", "")}-inquiry`],
  inquiryIds: id === "node-side-inquiry" ? ["inquiry-local-node"] : [],
  conceptNoteIds: [],
  createdBy: "agent",
  createdAt: researchNow,
  updatedAt: researchNow
});

export const researchMap: ResearchMap = {
  id: "map-main",
  sessionId: activeSession.id,
  title: "AlphaAiGraph 第一层研究地图",
  rootNodeId: "node-root",
  nodes: [
    node("node-root", "AlphaAiGraph 研究对象", "先建立高层研究地图，再由用户选择下钻路径。", 0, [
      marker("node-root", "core_entry", "核心入口", "根节点承载当前研究对象与主路径。", "high")
    ], "root"),
    node("node-product-positioning", "产品定位", "确认它不是普通知识图谱或聊天工具，而是 Agent 研究向导。", 1, [
      marker("node-product-positioning", "focus", "重点", "定位决定所有后续功能取舍。", "high"),
      marker("node-product-positioning", "core_entry", "核心入口", "先理解产品心智，再研究实现。", "high")
    ], "concept"),
    node("node-workflow-map", "研究工作流脑图", "当前研究过程的主画布，表达如何研究对象。", 2, [
      marker("node-workflow-map", "difficulty", "难点", "需要同时表达结构、状态、证据和下钻。", "medium"),
      marker("node-workflow-map", "recommended_drilldown", "建议下钻", "MVP 的核心交互从这里开始。", "high")
    ], "module"),
    node("node-parallel-research", "并行研究", "后台任务只能产出候选结果，不能静默改写主图。", 3, [
      marker("node-parallel-research", "risk", "风险", "若候选结果自动合并，会污染主研究上下文。", "high")
    ], "module"),
    node("node-side-inquiry", "旁路临时会话", "用于概念澄清，默认隔离，显式沉淀后才进入知识图谱。", 4, [
      marker("node-side-inquiry", "recommended_drilldown", "建议下钻", "它体现主线和旁路隔离。", "medium")
    ], "question"),
    node("node-evidence-validation", "证据与验证", "将判断绑定到资料、代码行、命令输出或测试结果。", 5, [
      marker("node-evidence-validation", "needs_validation", "待验证", "MVP 需要通过测试与交互确认。", "high")
    ], "section"),
    node("node-relationship-projection", "关系图谱投影", "Obsidian-style 图谱从研究数据派生，不作为第二套主数据源。", 6, [
      marker("node-relationship-projection", "uncertain", "不确定", "投影粒度后续还会随着数据模型演进。", "low")
    ], "module")
  ],
  edges: [
    "node-product-positioning",
    "node-workflow-map",
    "node-parallel-research",
    "node-side-inquiry",
    "node-evidence-validation",
    "node-relationship-projection"
  ].map((childId) => ({
    id: `edge-root-${childId}`,
    fromNodeId: "node-root",
    toNodeId: childId,
    kind: "decomposes_to",
    confidence: 0.9,
    createdBy: "agent",
    createdAt: researchNow
  })),
  createdAt: researchNow,
  updatedAt: researchNow
};

export const sourceAssets: SourceAsset[] = [
  {
    id: "source-agents",
    objectId: researchObject.id,
    kind: "file",
    title: "AGENTS.md",
    uri: "AGENTS.md",
    analysisState: "analyzed",
    metadata: { role: "schema" },
    createdAt: researchNow
  },
  {
    id: "source-plan",
    objectId: researchObject.id,
    kind: "file",
    title: "Plan.md",
    uri: "Plan.md",
    analysisState: "analyzed",
    metadata: { role: "implementation-plan" },
    createdAt: researchNow
  },
  {
    id: "source-spec",
    objectId: researchObject.id,
    kind: "file",
    title: "Agent Research Map Spec",
    uri: "docs/superpowers/specs/2026-05-09-alpha-ai-graph-agent-research-map.md",
    analysisState: "analyzed",
    metadata: { role: "product-spec" },
    createdAt: researchNow
  }
];

export const evidenceAnchors: EvidenceAnchor[] = [
  {
    id: "evidence-agents-loop",
    objectId: researchObject.id,
    sourceAssetId: "source-agents",
    uri: "AGENTS.md",
    title: "核心循环",
    quote: "AI Agent 先画出研究地图。",
    reason: "定义产品第一感和主流程。",
    createdAt: researchNow
  },
  ...researchMap.nodes
    .filter((item) => item.id !== "node-root")
    .map((item, index) => ({
      id: `evidence-${item.id.replace("node-", "")}`,
      objectId: researchObject.id,
      sourceAssetId: index % 2 === 0 ? "source-spec" : "source-plan",
      uri: index % 2 === 0 ? sourceAssets[2].uri : sourceAssets[1].uri,
      title: `${item.title} 证据`,
      text: item.summary,
      reason: `支撑 ${item.title} 节点的初始判断。`,
      createdAt: researchNow
    }))
];

export const actions: ResearchAction[] = researchMap.nodes.flatMap((item) => [
  {
    id: `action-${item.id.replace("node-", "")}-drill`,
    nodeId: item.id,
    kind: "drill_down",
    title: "深入研究",
    description: "只展开当前节点下一层，不自动分析其它分支。",
    status: "suggested",
    createdBy: "agent",
    createdAt: researchNow,
    updatedAt: researchNow
  },
  {
    id: `action-${item.id.replace("node-", "")}-inquiry`,
    nodeId: item.id,
    kind: "create_side_inquiry",
    title: "旁路提问",
    description: "创建默认隔离的临时概念会话。",
    status: "suggested",
    createdBy: "agent",
    createdAt: researchNow,
    updatedAt: researchNow
  }
]);

export const jobs: AgentJob[] = [
  {
    id: "job-scan",
    sessionId: activeSession.id,
    threadId: mainThread.id,
    mapId: researchMap.id,
    nodeIds: ["node-root"],
    sourceAssetIds: sourceAssets.map((item) => item.id),
    kind: "scan_source",
    title: "扫描项目文档",
    status: "completed",
    priority: "high",
    dependsOnJobIds: [],
    outputNodeIds: [],
    outputEvidenceIds: evidenceAnchors.map((item) => item.id),
    outputRunIds: [],
    outputDigestIds: [],
    startedAt: researchNow,
    finishedAt: researchNow,
    createdAt: researchNow
  },
  {
    id: "job-map",
    sessionId: activeSession.id,
    threadId: mainThread.id,
    mapId: researchMap.id,
    nodeIds: ["node-root"],
    sourceAssetIds: sourceAssets.map((item) => item.id),
    kind: "generate_map",
    title: "生成第一层研究地图",
    status: "completed",
    priority: "high",
    dependsOnJobIds: ["job-scan"],
    outputNodeIds: researchMap.nodes.map((item) => item.id),
    outputEvidenceIds: [],
    outputRunIds: [],
    outputDigestIds: [],
    startedAt: researchNow,
    finishedAt: researchNow,
    createdAt: researchNow
  },
  {
    id: "job-parallel",
    sessionId: activeSession.id,
    threadId: mainThread.id,
    mapId: researchMap.id,
    nodeIds: ["node-parallel-research"],
    sourceAssetIds: ["source-plan"],
    kind: "extract_evidence",
    title: "候选结果抽取",
    status: "running",
    priority: "normal",
    dependsOnJobIds: ["job-map"],
    outputNodeIds: [],
    outputEvidenceIds: [],
    outputRunIds: [],
    outputDigestIds: [],
    startedAt: researchNow,
    createdAt: researchNow
  }
];

export const parallelGroups: ParallelAnalysisGroup[] = [
  {
    id: "group-review-parallel",
    sessionId: activeSession.id,
    mapId: researchMap.id,
    threadId: mainThread.id,
    title: "并行研究候选审核",
    mode: "fan_out",
    inputNodeIds: ["node-parallel-research", "node-evidence-validation"],
    inputSourceAssetIds: ["source-plan", "source-spec"],
    jobIds: ["job-parallel"],
    mergePolicy: "manual_review",
    status: "ready_to_review",
    createdAt: researchNow,
    updatedAt: researchNow
  }
];

const candidateNode: ResearchNode = {
  id: "candidate-node-merge-policy",
  mapId: researchMap.id,
  parentId: "node-parallel-research",
  kind: "finding",
  title: "手动审核合并策略",
  summary: "候选节点进入主图前必须经过用户显式合并。",
  depth: 2,
  order: 1,
  expansionState: "not_expanded",
  status: "new",
  markers: [marker("candidate-node-merge-policy", "risk", "风险", "自动合并会污染主研究图。", "high")],
  evidenceIds: ["evidence-parallel-research"],
  actionIds: [],
  inquiryIds: [],
  conceptNoteIds: [],
  createdBy: "agent",
  createdAt: researchNow,
  updatedAt: researchNow,
  provenance: { groupId: "group-review-parallel", jobId: "job-parallel", sourceNodeId: "node-parallel-research" }
};

export const candidates: CandidateResult[] = [
  {
    id: "candidate-review-merge-policy",
    groupId: "group-review-parallel",
    jobId: "job-parallel",
    parentNodeId: "node-parallel-research",
    node: candidateNode,
    edge: {
      id: "candidate-edge-merge-policy",
      fromNodeId: "node-parallel-research",
      toNodeId: candidateNode.id,
      kind: "decomposes_to",
      confidence: 0.78,
      createdBy: "agent",
      createdAt: researchNow,
      provenance: candidateNode.provenance
    },
    status: "pending_review",
    createdAt: researchNow
  }
];

export const sideInquiries: SideInquirySession[] = [
  {
    id: "inquiry-local-node",
    researchSessionId: activeSession.id,
    sourceNodeId: "node-side-inquiry",
    title: "什么是旁路临时会话？",
    triggerText: "旁路临时会话",
    initialQuestion: "它为什么不能直接写入主图？",
    contextPolicy: "local_node",
    status: "open",
    messages: [
      {
        id: "message-inquiry-user",
        inquiryId: "inquiry-local-node",
        role: "user",
        content: "它为什么不能直接写入主图？",
        createdAt: researchNow
      },
      {
        id: "message-inquiry-agent",
        inquiryId: "inquiry-local-node",
        role: "agent",
        content: "基于 local_node 上下文：旁路会话用于临时澄清概念，默认不修改主研究地图。",
        createdAt: researchNow
      }
    ],
    createdAt: researchNow,
    updatedAt: researchNow
  }
];

export const executionRuns: ExecutionRun[] = [
  {
    id: "run-mvp-tests",
    jobId: "job-map",
    actionId: "action-evidence-validation-drill",
    nodeId: "node-evidence-validation",
    command: "npm test",
    startedAt: researchNow,
    finishedAt: researchNow,
    status: "running",
    resultSummary: "MVP 实现期间持续运行测试验证。"
  }
];

export const knowledgeDigests: KnowledgeDigest[] = [];

export const initialWorkspace: ResearchWorkspaceSnapshot = {
  object: researchObject,
  session: activeSession,
  threads: [mainThread],
  map: researchMap,
  sourceAssets,
  evidenceAnchors,
  actions,
  jobs,
  parallelGroups,
  executionRuns,
  sideInquiries,
  conceptNotes: [],
  knowledgeDigests,
  candidates
};
