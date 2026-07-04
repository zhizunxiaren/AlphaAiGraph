import { researchMap, sourceAssets } from "./fixtures";
import { expandResearchNode, generateFirstLayerResearchMap } from "./researchAgent";

test("generates only a first-layer research map", () => {
  const map = generateFirstLayerResearchMap("object-alpha", "AlphaAiGraph", sourceAssets);

  expect(map.nodes.some((node) => node.kind === "root")).toBe(true);
  expect(map.nodes.filter((node) => node.depth === 1)).toHaveLength(6);
  expect(map.nodes.some((node) => node.depth > 1)).toBe(false);
  expect(map.nodes.filter((node) => node.expansionState === "expanded")).toHaveLength(1);
});

test("expands only the selected node by one layer and is idempotent", () => {
  const expanded = expandResearchNode(researchMap, "node-workflow-map");
  const workflowChildren = expanded.nodes.filter((node) => node.parentId === "node-workflow-map");
  const unrelatedChildren = expanded.nodes.filter((node) => node.parentId === "node-parallel-research");

  expect(workflowChildren).toHaveLength(3);
  expect(workflowChildren.every((node) => node.depth === 2)).toBe(true);
  expect(unrelatedChildren).toHaveLength(0);

  const expandedAgain = expandResearchNode(expanded, "node-workflow-map");
  expect(expandedAgain.nodes).toHaveLength(expanded.nodes.length);
});

test("returns original map for missing node", () => {
  expect(expandResearchNode(researchMap, "missing-node")).toBe(researchMap);
});
