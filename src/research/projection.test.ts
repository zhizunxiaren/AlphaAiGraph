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

test("preserves supported research edge semantics", () => {
  const graph = projectRelationshipGraph({
    ...initialWorkspace,
    map: {
      ...initialWorkspace.map,
      edges: initialWorkspace.map.edges.concat(
        {
          id: "edge-supports",
          fromNodeId: "node-product-positioning",
          toNodeId: "node-workflow-map",
          kind: "supports",
          confidence: 0.9,
          createdBy: "agent",
          createdAt: initialWorkspace.map.createdAt
        },
        {
          id: "edge-explains",
          fromNodeId: "node-side-inquiry",
          toNodeId: "node-product-positioning",
          kind: "explains",
          confidence: 0.8,
          createdBy: "agent",
          createdAt: initialWorkspace.map.createdAt
        }
      )
    }
  });

  expect(graph.edges.find((edge) => edge.id === "rg-edge-supports")?.relation).toBe("supports");
  expect(graph.edges.find((edge) => edge.id === "rg-edge-explains")?.relation).toBe("explains");
});
