// @vitest-environment node

import { test } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { KnowledgeGraphCanvas } from "../components/KnowledgeGraphCanvas";
import { buildKnowledgeSelection } from "./knowledgeEngine";
import { deriveKnowledgeClusters, findShortestKnowledgePath, knowledgeNodesInScope, queryLocalNeighborhood } from "./knowledgeGraphQuery";
import { deriveKnowledgeWorkspaceInsights } from "./knowledgeInsights";
import { createLargeKnowledgeGraphFixture } from "./fixtures/largeKnowledgeGraph";
import { deriveProgressiveKnowledgeProjection, layoutLocalKnowledgeProjection } from "./knowledgeGraphProjection";

const runBenchmark = process.env.RUN_GRAPH_SCALE_BENCHMARK === "1";
const scenarios = [
  { nodeCount: 320, averageDegree: 3 },
  { nodeCount: 1_000, averageDegree: 4 },
  { nodeCount: 3_000, averageDegree: 6 }
];

test.skipIf(!runBenchmark)("reports serial large-graph query and workspace derivation baselines", () => {
  const reports = scenarios.map((scenario) => {
    const buildStartedAt = performance.now();
    const workspace = createLargeKnowledgeGraphFixture(scenario);
    const fixtureBuildMs = performance.now() - buildStartedAt;
    const rootId = workspace.project.subject.rootNodeId;
    const leafId = workspace.graph.nodes.at(-1)!.id;
    const middleId = workspace.graph.nodes[Math.floor(workspace.graph.nodes.length / 2)].id;
    const indexStartedAt = performance.now();
    queryLocalNeighborhood(workspace, { focusNodeId: rootId, depth: 0, maxNodes: 1 });
    const queryIndexBuildMs = performance.now() - indexStartedAt;
    const visibleProjection = deriveProgressiveKnowledgeProjection(workspace, {
      view: workspace.views[0],
      focusNodeId: leafId,
      visibleNodeLimit: 48
    });
    const visibleLayout = layoutLocalKnowledgeProjection(visibleProjection);
    return {
      ...scenario,
      edgeCount: workspace.graph.edges.length,
      actualAverageDegree: 2 * workspace.graph.edges.length / workspace.graph.nodes.length,
      estimatedSnapshotBytes: JSON.stringify(workspace).length * 2,
      fixtureBuildMs,
      queryIndexBuildMs,
      operations: {
        scope: measure(() => knowledgeNodesInScope(workspace)),
        neighborhood80: measure(() => queryLocalNeighborhood(workspace, {
          focusNodeId: middleId,
          depth: 3,
          maxNodes: 80
        })),
        shortestPath: measure(() => findShortestKnowledgePath(workspace, {
          fromNodeId: rootId,
          toNodeId: leafId
        })),
        clusters: measure(() => deriveKnowledgeClusters(workspace)),
        localSelection: measure(() => buildKnowledgeSelection(workspace, middleId, "selected_and_neighbors")),
        wholeProjectSelection: measure(() => buildKnowledgeSelection(workspace, middleId, "whole_subject")),
        workspaceInsights: measure(() => deriveKnowledgeWorkspaceInsights(workspace)),
        progressiveProjection: measure(() => deriveProgressiveKnowledgeProjection(workspace, {
          view: workspace.views[0],
          focusNodeId: leafId
        })),
        localLayout: measure(() => layoutLocalKnowledgeProjection(visibleProjection)),
        reactStaticRender48: measure(() => renderToStaticMarkup(createElement(KnowledgeGraphCanvas, {
          projection: visibleProjection,
          positions: visibleLayout,
          selectedNodeId: leafId,
          onSelectNode: () => undefined
        })))
      }
    };
  });
  console.log(`GRAPH_SCALE_BASELINE ${JSON.stringify(reports)}`);
});

function measure(operation: () => unknown): { meanMs: number; p95Ms: number } {
  operation();
  const samples: number[] = [];
  for (let index = 0; index < 7; index += 1) {
    const startedAt = performance.now();
    operation();
    samples.push(performance.now() - startedAt);
  }
  samples.sort((left, right) => left - right);
  return {
    meanMs: samples.reduce((total, sample) => total + sample, 0) / samples.length,
    p95Ms: samples[Math.ceil(samples.length * 0.95) - 1]
  };
}
