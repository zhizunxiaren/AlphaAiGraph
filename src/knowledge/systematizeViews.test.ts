import { describe, expect, test } from "vitest";
import type { KnowledgeEdge, KnowledgeNode, KnowledgeNodeKind, KnowledgeWorkspaceSnapshot } from "../types";
import { createProjectWorkspace, knowledgeNow } from "./knowledgeEngine";
import { createKnowledgeMetadata } from "./knowledgeMetadata";
import { deriveSystematizeViewProjection } from "./systematizeViews";
import { deserializeKnowledgeWorkspace, serializeKnowledgeWorkspace } from "./workspacePersistence";

describe("systematize artifact views", () => {
  test("derives modules from the canonical contains hierarchy without creating another graph", () => {
    const workspace = fixture();
    const graphBefore = JSON.stringify(workspace.graph);
    const projection = deriveSystematizeViewProjection(workspace, "knowledge_modules");

    expect(projection.groups.some((group) => group.title === "基础模块" && group.nodeIds.includes("foundation-concept"))).toBe(true);
    expect(projection.metrics.find((metric) => metric.id === "modules")?.value).toBe(6);
    expect(projection.sourceGraphUpdatedAt).toBe(workspace.graph.updatedAt);
    expect(JSON.stringify(workspace.graph)).toBe(graphBefore);
    expect(deserializeKnowledgeWorkspace(serializeKnowledgeWorkspace(workspace)).views.map((view) => view.kind))
      .toEqual(workspace.views.map((view) => view.kind));
  });

  test("keeps skill, dependency, learning path, and manual semantics distinct", () => {
    const workspace = fixture();
    const skillTree = deriveSystematizeViewProjection(workspace, "skill_tree");
    expect(skillTree.nodes.map((node) => node.nodeId)).toEqual(expect.arrayContaining(["cache-skill", "cache-practice", "cache-experience"]));
    expect(skillTree.groups.map((group) => group.title)).toEqual(["技能", "实践方法", "经验与例外"]);

    const dependencies = deriveSystematizeViewProjection(workspace, "learning_dependencies");
    expect(dependencies.links).toContainEqual(expect.objectContaining({
      fromNodeId: "cache-skill",
      toNodeId: "foundation-concept",
      relationKind: "depends_on"
    }));
    expect(dependencies.groups.find((group) => group.id === "dependency-blockers")?.nodeIds.length).toBeGreaterThan(0);

    const path = deriveSystematizeViewProjection(workspace, "learning_path");
    expect(path.sequence).toEqual(["foundation-concept", "cache-skill", "cache-practice"]);
    expect(path.cycleNodeIds).toEqual([]);

    const manual = deriveSystematizeViewProjection(workspace, "practice_manual");
    expect(manual.groups.find((group) => group.id === "manual-methods")?.nodeIds).toEqual(expect.arrayContaining(["cache-skill", "cache-practice", "cache-experience"]));
    expect(manual.groups.find((group) => group.id === "manual-context")?.nodeIds).toContain("cache-context");
  });

  test("is deterministic across storage order and refuses to invent a path without explicit relations", () => {
    const workspace = fixture();
    const reordered = {
      ...workspace,
      graph: { ...workspace.graph, nodes: [...workspace.graph.nodes].reverse(), edges: [...workspace.graph.edges].reverse() }
    };
    expect(deriveSystematizeViewProjection(reordered, "practice_manual"))
      .toEqual(deriveSystematizeViewProjection(workspace, "practice_manual"));

    const initial = createProjectWorkspace({ mode: "systematize", title: "空路径", subjectKind: "topic" });
    const emptyPath = deriveSystematizeViewProjection(initial, "learning_path");
    expect(emptyPath.sequence).toEqual([]);
    expect(emptyPath.emptyMessage).toContain("补充明确依赖");
  });
});

function fixture(): KnowledgeWorkspaceSnapshot {
  const base = createProjectWorkspace({ mode: "systematize", title: "缓存知识体系", subjectKind: "topic" });
  const rootId = base.project.subject.rootNodeId;
  const nodes = [
    node("foundation-concept", "concept", "基础模块", "先理解一致性与时效性。", 1),
    node("cache-skill", "skill", "设计缓存策略", "根据数据特性选择缓存边界。", 2),
    node("cache-practice", "practice", "配置主动失效", "写路径主动删除或更新缓存。", 3),
    node("cache-experience", "experience", "热点键经验", "热点键需要避免同时失效。", 4),
    node("cache-context", "constraint", "允许短暂陈旧", "只适用于允许短暂陈旧的读多写少场景。", 2)
  ];
  const edges: KnowledgeEdge[] = [
    edge("root-contains-foundation", rootId, "foundation-concept", "contains"),
    edge("skill-depends-foundation", "cache-skill", "foundation-concept", "depends_on"),
    edge("skill-precedes-practice", "cache-skill", "cache-practice", "precedes"),
    edge("practice-contains-experience", "cache-practice", "cache-experience", "contains")
  ];
  return {
    ...base,
    graph: {
      ...base.graph,
      nodes: base.graph.nodes.concat(nodes),
      edges: base.graph.edges.concat(edges)
    }
  };
}

function node(id: string, kind: KnowledgeNodeKind, title: string, summary: string, depth: number): KnowledgeNode {
  return {
    id,
    kind,
    title,
    summary,
    status: "open",
    ...createKnowledgeMetadata({ kind, createdBy: "user", creatorId: "test-user", scopeContextId: "project-缓存知识体系" }),
    depth,
    tags: [],
    sourceRefs: [],
    createdAt: knowledgeNow,
    updatedAt: knowledgeNow
  };
}

function edge(id: string, fromNodeId: string, toNodeId: string, kind: KnowledgeEdge["kind"]): KnowledgeEdge {
  return {
    id,
    fromNodeId,
    toNodeId,
    kind,
    confidence: 1,
    rationale: `Test ${kind} projection`,
    createdBy: "user",
    createdAt: knowledgeNow
  };
}
