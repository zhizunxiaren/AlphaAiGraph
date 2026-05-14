import { describe, expect, it } from "vitest";
import {
  projectRelationshipGraph,
  relationshipProjectionMapping,
} from "./research/projection";
import type {
  AgentMarker,
  EvidenceAnchor,
  RelationshipGraph,
  ResearchMap,
  ResearchNode,
  ResearchObject,
  ResearchSession,
  ResearchThread,
} from "./types";

describe("research domain types", () => {
  it("constructs a full research workspace object graph", () => {
    const object: ResearchObject = {
      id: "object-alpha",
      kind: "project",
      title: "AlphaAiGraph",
      status: "ready",
      sourceAssetIds: ["source-plan"],
      createdAt: "2026-05-09T00:00:00.000Z",
      updatedAt: "2026-05-09T00:00:00.000Z",
    };
    const session: ResearchSession = {
      id: "session-alpha",
      objectId: object.id,
      title: "研究地图",
      status: "active",
      activeThreadId: "thread-main",
      createdAt: object.createdAt,
      updatedAt: object.updatedAt,
    };
    const thread: ResearchThread = {
      id: "thread-main",
      sessionId: session.id,
      title: "主研究线程",
      kind: "main",
      status: "active",
      mapId: "map-alpha",
      createdAt: object.createdAt,
      updatedAt: object.updatedAt,
    };
    const marker: AgentMarker = {
      id: "marker-focus",
      nodeId: "node-root",
      kind: "focus",
      label: "核心入口",
      rationale: "第一层研究地图入口",
      confidence: 0.9,
    };
    const node: ResearchNode = {
      id: "node-root",
      mapId: thread.mapId,
      kind: "root",
      title: "AlphaAiGraph 研究对象",
      summary: "复杂对象的第一层研究入口。",
      depth: 0,
      status: "active",
      expansionState: "expanded",
      markerIds: [marker.id],
      evidenceIds: [],
      actionIds: [],
      createdAt: object.createdAt,
      updatedAt: object.updatedAt,
    };
    const map: ResearchMap = {
      id: thread.mapId,
      sessionId: session.id,
      threadId: thread.id,
      rootNodeId: node.id,
      nodes: [node],
      edges: [],
      createdAt: object.createdAt,
      updatedAt: object.updatedAt,
    };

    expect(map.nodes[0].kind).toBe("root");
    expect(thread.mapId).toBe(map.id);
  });

  it("keeps focus, difficulty, risk, drilldown and validation as markers, not node kinds", () => {
    const markerKinds: AgentMarker["kind"][] = [
      "focus",
      "difficulty",
      "risk",
      "recommended_drilldown",
      "needs_validation",
      "low_priority",
      "uncertain",
      "core_entry",
    ];
    const forbiddenNodeKinds = new Set(markerKinds);

    const nodeKinds: ResearchNode["kind"][] = [
      "root",
      "module",
      "section",
      "concept",
      "question",
      "hypothesis",
      "finding",
      "action",
      "script",
      "result",
      "conclusion",
      "evidence",
    ];

    expect(nodeKinds.some((kind) => forbiddenNodeKinds.has(kind as AgentMarker["kind"]))).toBe(false);
  });

  it("builds relationship graph projection types without using legacy graph as primary state", () => {
    const graph: RelationshipGraph = {
      id: "relationship-alpha",
      sourceObjectId: "object-alpha",
      generatedAt: "2026-05-09T00:00:00.000Z",
      nodes: [
        {
          id: "rg-node-root",
          kind: "research_node",
          sourceId: "node-root",
          title: "AlphaAiGraph 研究对象",
          summary: "投影节点",
          tags: ["root", "active", "focus"],
        },
      ],
      edges: [],
    };

    expect(graph.nodes[0].sourceId).toBe("node-root");
    expect(graph.nodes[0].kind).toBe("research_node");
  });

  it("maps research and evidence fields through explicit projection rules", () => {
    const object: ResearchObject = {
      id: "object-alpha",
      kind: "project",
      title: "AlphaAiGraph",
      status: "ready",
      sourceAssetIds: ["source-plan"],
      createdAt: "2026-05-09T00:00:00.000Z",
      updatedAt: "2026-05-09T00:00:00.000Z",
    };
    const node: ResearchNode = {
      id: "node-risk",
      mapId: "map-alpha",
      kind: "question",
      title: "候选合并风险",
      summary: "后台候选结果不能静默进入主图。",
      depth: 1,
      status: "open",
      expansionState: "collapsed",
      markerIds: ["marker-risk"],
      evidenceIds: ["evidence-plan"],
      actionIds: [],
      createdAt: object.createdAt,
      updatedAt: object.updatedAt,
    };
    const evidence: EvidenceAnchor = {
      id: "evidence-plan",
      sourceAssetId: "source-plan",
      title: "Plan.md 合并规则",
      quote: "合并和沉淀必须来自用户显式动作",
      locator: { kind: "file", path: "Plan.md" },
      createdAt: object.createdAt,
    };

    const graph = projectRelationshipGraph({
      object,
      map: {
        id: "map-alpha",
        sessionId: "session-alpha",
        threadId: "thread-main",
        rootNodeId: node.id,
        nodes: [node],
        edges: [],
        createdAt: object.createdAt,
        updatedAt: object.updatedAt,
      },
      markers: [
        {
          id: "marker-risk",
          nodeId: node.id,
          kind: "risk",
          label: "风险",
          rationale: "需要用户审核",
          confidence: 0.88,
        },
      ],
      evidenceAnchors: [evidence],
      executionRuns: [],
      conceptNotes: [],
      knowledgeDigests: [],
    });

    expect(relationshipProjectionMapping.researchNode.title).toBe("RelationshipGraphNode.title");
    expect(graph.nodes.find((item) => item.sourceId === node.id)?.title).toBe(node.title);
    expect(graph.nodes.find((item) => item.sourceId === evidence.id)?.kind).toBe("evidence");
  });
});
