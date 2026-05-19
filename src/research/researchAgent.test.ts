import { describe, expect, it } from "vitest";
import {
  expandResearchNode,
  generateFirstLayerResearchMap,
} from "./researchAgent";
import { researchFixtures } from "./fixtures";

describe("deterministic research agent", () => {
  it("generates a first-layer research map with markers, evidence, actions and jobs", () => {
    const result = generateFirstLayerResearchMap({
      objectId: "object-generated",
      objectKind: "project",
      title: "AlphaAiGraph",
      sourceAssets: researchFixtures.sourceAssets,
    });

    expect(result.map.rootNodeId).toBeTruthy();
    expect(result.map.nodes.filter((node) => node.depth === 1).length).toBeGreaterThanOrEqual(6);
    expect(result.markers.length).toBeGreaterThanOrEqual(5);
    expect(result.evidenceAnchors.length).toBeGreaterThan(0);
    expect(result.actions.map((action) => action.kind)).toEqual(expect.arrayContaining(["drill_down"]));
    expect(result.jobs.map((job) => job.kind)).toEqual(expect.arrayContaining(["source_scan", "map_generation"]));
  });

  it("expands only the selected node by one level", () => {
    const target = researchFixtures.map.nodes.find((node) => node.title === "并行研究");
    expect(target).toBeDefined();

    const expanded = expandResearchNode(researchFixtures.map, target!.id);
    const newNodes = expanded.nodes.filter(
      (node) => !researchFixtures.map.nodes.some((existing) => existing.id === node.id),
    );

    expect(expanded.nodes.find((node) => node.id === target!.id)?.expansionState).toBe("expanded");
    expect(newNodes.length).toBeGreaterThan(0);
    expect(newNodes.every((node) => node.parentNodeId === target!.id)).toBe(true);
    expect(newNodes.every((node) => node.depth === target!.depth + 1)).toBe(true);
  });

  it("does not perform full automatic deep analysis in the first-layer map", () => {
    const result = generateFirstLayerResearchMap({
      objectId: "object-generated",
      objectKind: "project",
      title: "AlphaAiGraph",
      sourceAssets: researchFixtures.sourceAssets,
    });

    expect(result.map.nodes.some((node) => node.depth > 1)).toBe(false);
    expect(result.map.nodes.filter((node) => node.expansionState === "expanded").length).toBe(1);
  });

  it("returns complete node and edge shapes", () => {
    const result = generateFirstLayerResearchMap({
      objectId: "object-generated",
      objectKind: "project",
      title: "AlphaAiGraph",
      sourceAssets: researchFixtures.sourceAssets,
    });

    for (const node of result.map.nodes) {
      expect(node).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          mapId: expect.any(String),
          kind: expect.any(String),
          title: expect.any(String),
          depth: expect.any(Number),
          status: expect.any(String),
          expansionState: expect.any(String),
        }),
      );
    }
    for (const edge of result.map.edges) {
      expect(edge).toEqual(
        expect.objectContaining({
          fromNodeId: expect.any(String),
          toNodeId: expect.any(String),
          kind: expect.any(String),
          confidence: expect.any(Number),
        }),
      );
    }
  });

  it("is idempotent for expanded nodes and leaves missing node ids unchanged", () => {
    const target = researchFixtures.map.nodes.find((node) => node.title === "产品定位")!;
    const expanded = expandResearchNode(researchFixtures.map, target.id);
    const expandedAgain = expandResearchNode(expanded, target.id);
    const missing = expandResearchNode(researchFixtures.map, "missing-node");

    expect(expandedAgain).toEqual(expanded);
    expect(missing).toEqual(researchFixtures.map);
  });

  it("does not reuse child ids when a partially expanded node is repaired", () => {
    const target = researchFixtures.map.nodes.find((node) => node.title === "产品定位")!;
    const existingChild = {
      ...researchFixtures.map.nodes[0],
      id: `${target.id}-child-1`,
      parentNodeId: target.id,
      title: "目标用户与主场景",
      depth: target.depth + 1,
      expansionState: "collapsed" as const,
    };
    const inconsistentMap = {
      ...researchFixtures.map,
      nodes: [...researchFixtures.map.nodes, existingChild],
    };

    const expanded = expandResearchNode(inconsistentMap, target.id);
    const childIds = expanded.nodes
      .filter((node) => node.parentNodeId === target.id)
      .map((node) => node.id);

    expect(new Set(childIds).size).toBe(childIds.length);
    expect(childIds).toEqual(expect.arrayContaining([
      `${target.id}-child-1`,
      `${target.id}-child-2`,
      `${target.id}-child-3`,
    ]));
  });
});
