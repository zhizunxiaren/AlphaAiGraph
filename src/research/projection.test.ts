import { initialWorkspace } from "./fixtures";
import { projectRelationshipGraph, projectionMapping } from "./projection";

test("projects research data into a traceable relationship graph", () => {
  const graph = projectRelationshipGraph(initialWorkspace);

  expect(projectionMapping.researchNodeSourceId).toContain("sourceId");
  expect(graph.nodes.some((node) => node.kind === "research_object" && node.sourceId === initialWorkspace.object.id)).toBe(true);
  expect(graph.nodes.some((node) => node.kind === "research_node" && node.sourceId === "node-workflow-map")).toBe(true);
  expect(graph.nodes.some((node) => node.kind === "evidence" && node.sourceId === "evidence-workflow-map")).toBe(true);
  expect(graph.edges.some((edge) => edge.relation === "references")).toBe(true);
});
