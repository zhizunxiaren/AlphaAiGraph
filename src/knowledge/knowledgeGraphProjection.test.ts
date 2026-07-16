// @vitest-environment node

import { expect, test } from "vitest";
import { createLargeKnowledgeGraphFixture } from "./fixtures/largeKnowledgeGraph";
import { queryKnowledgeNodePage } from "./knowledgeGraphQuery";
import {
  deriveProgressiveKnowledgeProjection,
  knowledgeGraphPerformanceBudget,
  layoutLocalKnowledgeProjection
} from "./knowledgeGraphProjection";

test("progressively projects a large canonical graph without changing it or the visible Context Packet", () => {
  const workspace = createLargeKnowledgeGraphFixture({ nodeCount: 320, averageDegree: 4 });
  const graphBefore = JSON.stringify(workspace.graph);
  const selectionBefore = workspace.selection;
  const view = workspace.views[0];
  const initial = deriveProgressiveKnowledgeProjection(workspace, {
    view,
    focusNodeId: workspace.selectedNodeId
  });

  expect(initial.nodes).toHaveLength(knowledgeGraphPerformanceBudget.initialVisibleNodes);
  expect(initial.nodes.some((node) => node.id === view.rootNodeId)).toBe(true);
  expect(initial.nodes.some((node) => node.id === workspace.selectedNodeId)).toBe(true);
  expect(initial.edges.length).toBeLessThanOrEqual(knowledgeGraphPerformanceBudget.maxVisibleEdges);
  expect(initial.canLoadMore).toBe(true);
  const expanded = deriveProgressiveKnowledgeProjection(workspace, {
    view,
    focusNodeId: workspace.selectedNodeId,
    visibleNodeLimit: initial.nextVisibleNodeLimit
  });
  expect(expanded.nodes.length).toBeGreaterThan(initial.nodes.length);
  expect(expanded.nodes.slice(0, initial.nodes.length)).toEqual(initial.nodes);
  expect(JSON.stringify(workspace.graph)).toBe(graphBefore);
  expect(workspace.selection).toBe(selectionBefore);
});

test("lays out only the local projection deterministically inside the viewport", () => {
  const workspace = createLargeKnowledgeGraphFixture({ nodeCount: 320, averageDegree: 3 });
  const projection = deriveProgressiveKnowledgeProjection(workspace, {
    view: workspace.views[0],
    focusNodeId: workspace.selectedNodeId
  });
  const first = layoutLocalKnowledgeProjection(projection);
  const second = layoutLocalKnowledgeProjection(projection);

  expect(second).toEqual(first);
  expect(Object.keys(first)).toHaveLength(projection.nodes.length);
  expect(first[workspace.selectedNodeId]).toEqual({ x: 500, y: 330 });
  expect(Object.values(first).every(({ x, y }) => x >= 0 && x <= 1_000 && y >= 0 && y <= 660)).toBe(true);
});

test("paginates canonical nodes with a scope-bound cursor that expires after graph changes", () => {
  const workspace = createLargeKnowledgeGraphFixture({ nodeCount: 50, averageDegree: 3 });
  const first = queryKnowledgeNodePage(workspace, { pageSize: 12 });
  const second = queryKnowledgeNodePage(workspace, { pageSize: 12, cursor: first.nextCursor });

  expect(first.nodes).toHaveLength(12);
  expect(second.nodes).toHaveLength(12);
  expect(second.nodes.some((node) => first.nodes.includes(node))).toBe(false);
  expect(first.totalCount).toBe(50);
  expect(() => queryKnowledgeNodePage({
    ...workspace,
    graph: { ...workspace.graph, updatedAt: "2026-07-15T13:00:00.000Z" }
  }, { pageSize: 12, cursor: first.nextCursor })).toThrow(/cursor expired/);
  expect(() => queryKnowledgeNodePage(workspace, {
    pageSize: 12,
    cursor: first.nextCursor,
    includeUniversal: false
  })).toThrow(/different scope/);
});
