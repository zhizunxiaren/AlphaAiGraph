import type { ResearchWorkspace, RelationshipGraph } from "../types";
import { requiredFirstLayerTitles, researchNow } from "./constants";
import { generateFirstLayerResearchMap } from "./researchAgent";

export { requiredFirstLayerTitles, researchNow };

export const sourceAssets = [
  {
    id: "source-agents",
    kind: "file" as const,
    title: "AGENTS.md",
    path: "AGENTS.md",
    summary: "项目产品主题、研究地图主循环和操作红线。",
    createdAt: researchNow,
  },
  {
    id: "source-plan",
    kind: "file" as const,
    title: "Plan.md",
    path: "Plan.md",
    summary: "分阶段实施计划和验收命令。",
    createdAt: researchNow,
  },
  {
    id: "source-spec",
    kind: "file" as const,
    title: "2026-05-09 alpha ai graph spec",
    path: "docs/superpowers/specs/2026-05-09-alpha-ai-graph-agent-research-map.md",
    summary: "完整数据模型以规格文档为准。",
    createdAt: researchNow,
  },
];

const generated = generateFirstLayerResearchMap({
  objectId: "object-alpha",
  objectKind: "project",
  title: "AlphaAiGraph",
  sourceAssets,
});

const rootNode = generated.map.nodes.find((node) => node.id === generated.map.rootNodeId)!;
const firstChild = generated.map.nodes.find((node) => node.title === "产品定位")!;
rootNode.evidenceIds = [generated.evidenceAnchors[0].id];
firstChild.actionIds = [
  ...firstChild.actionIds,
  "action-study-secondary",
  "action-synthesis-secondary",
  "action-export-secondary",
];

export const researchFixtures: ResearchWorkspace = {
  object: generated.object,
  session: generated.session,
  thread: generated.thread,
  map: generated.map,
  sourceAssets,
  markers: generated.markers,
  evidenceAnchors: generated.evidenceAnchors,
  actions: [
    ...generated.actions,
    {
      id: "action-validate-evidence",
      nodeId: "object-alpha-map-node-5",
      kind: "run_validation",
      title: "验证证据链",
      description: "检查证据是否能支撑结论。",
      createdAt: researchNow,
    },
    {
      id: "action-study-secondary",
      nodeId: firstChild.id,
      kind: "study",
      title: "生成学习卡片",
      description: "辅助动作，不作为主流程入口。",
      createdAt: researchNow,
    },
    {
      id: "action-synthesis-secondary",
      nodeId: firstChild.id,
      kind: "synthesis",
      title: "生成综合摘要",
      description: "辅助动作，链接回研究节点。",
      createdAt: researchNow,
    },
    {
      id: "action-export-secondary",
      nodeId: firstChild.id,
      kind: "export",
      title: "导出当前研究结果",
      description: "输出能力，来自研究地图和关系投影。",
      createdAt: researchNow,
    },
  ],
  jobs: [
    ...generated.jobs,
    {
      id: "job-parallel-fixture",
      kind: "parallel_extraction",
      status: "queued",
      title: "并行抽取候选证据",
      nodeIds: ["object-alpha-map-node-3"],
      sourceAssetIds: ["source-plan"],
      outputIds: ["candidate-node-fixture"],
      groupId: "parallel-group-fixture",
      createdAt: researchNow,
      updatedAt: researchNow,
    },
  ],
  parallelGroups: [
    {
      id: "parallel-group-fixture",
      mode: "fan_out",
      mergePolicy: "manual_review",
      status: "queued",
      nodeIds: ["object-alpha-map-node-3"],
      jobIds: ["job-parallel-fixture"],
      candidateNodeIds: ["candidate-node-fixture"],
      createdAt: researchNow,
      updatedAt: researchNow,
    },
  ],
  candidateNodes: [
    {
      id: "candidate-node-fixture",
      groupId: "parallel-group-fixture",
      jobId: "job-parallel-fixture",
      status: "pending_review",
      node: {
        id: "node-candidate-parallel",
        mapId: generated.map.id,
        parentNodeId: "object-alpha-map-node-3",
        kind: "finding",
        title: "候选并行发现",
        summary: "后台并行任务产出的候选节点，需要用户审核。",
        depth: 2,
        status: "under_review",
        expansionState: "leaf",
        markerIds: [],
        evidenceIds: [],
        actionIds: [],
        createdAt: researchNow,
        updatedAt: researchNow,
        provenance: {
          groupId: "parallel-group-fixture",
          jobId: "job-parallel-fixture",
          candidateId: "candidate-node-fixture",
          sourceNodeIds: ["object-alpha-map-node-3"],
        },
      },
    },
  ],
  executionRuns: [
    {
      id: "execution-validation-fixture",
      nodeId: "object-alpha-map-node-5",
      actionId: "action-validate-evidence",
      status: "succeeded",
      command: "npm test -- src/research/fixtures.test.ts",
      output: "fixture evidence links are deterministic",
      createdAt: researchNow,
      updatedAt: researchNow,
    },
  ],
  sideInquiries: [
    {
      id: "side-inquiry-fixture",
      nodeId: firstChild.id,
      status: "open",
      contextPolicy: "local_node",
      question: "为什么产品定位是核心入口？",
      messageIds: ["inquiry-message-user", "inquiry-message-agent"],
      createdAt: researchNow,
      updatedAt: researchNow,
    },
  ],
  inquiryMessages: [
    {
      id: "inquiry-message-user",
      inquiryId: "side-inquiry-fixture",
      role: "user",
      content: "为什么产品定位是核心入口？",
      createdAt: researchNow,
    },
    {
      id: "inquiry-message-agent",
      inquiryId: "side-inquiry-fixture",
      role: "agent",
      content: "context_policy=local_node；它定义哪些能力不能成为主轴。",
      createdAt: researchNow,
    },
  ],
  conceptNotes: [
    {
      id: "concept-note-fixture",
      title: "研究地图不是静态脑图",
      body: "研究地图表达当前怎么研究复杂对象，而不是静态知识点集合。",
      sourceInquiryId: "side-inquiry-fixture",
      relatedNodeIds: [firstChild.id],
      createdAt: researchNow,
      updatedAt: researchNow,
    },
  ],
  knowledgeDigests: [
    {
      id: "digest-fixture",
      title: "AlphaAiGraph 知识整理",
      summary: "沉淀关键概念、已验证结论和待研究问题。",
      includedNodeIds: [firstChild.id],
      includedNoteIds: ["concept-note-fixture"],
      createdAt: researchNow,
      updatedAt: researchNow,
    },
  ],
};

export const expectedRelationshipGraph: RelationshipGraph = {
  id: "relationship-object-alpha",
  sourceObjectId: "object-alpha",
  generatedAt: researchNow,
  nodes: [
    {
      id: "rg-object-object-alpha",
      kind: "research_object",
      sourceId: "object-alpha",
      title: "AlphaAiGraph",
      tags: ["project", "ready"],
    },
    {
      id: "rg-research-object-alpha-map-root",
      kind: "research_node",
      sourceId: "object-alpha-map-root",
      title: "AlphaAiGraph 研究对象",
      summary: "AI Agent 先生成高层研究地图，再由用户选择节点下钻。",
      tags: ["root", "active", "core_entry"],
    },
    {
      id: "rg-evidence-object-alpha-map-evidence-0",
      kind: "evidence",
      sourceId: "object-alpha-map-evidence-0",
      title: "AGENTS.md 证据锚点",
      tags: ["evidence"],
    },
  ],
  edges: [
    {
      id: "rg-edge-object-alpha-map-edge-1",
      sourceId: "object-alpha-map-edge-1",
      fromNodeId: "rg-research-object-alpha-map-root",
      toNodeId: "rg-research-object-alpha-map-node-1",
      relation: "research_flow",
      confidence: 0.93,
    },
  ],
};
