import { describe, expect, it } from "vitest";
import { expectedRelationshipGraph, researchFixtures } from "./fixtures";
import { projectRelationshipGraph } from "./projection";

describe("relationship graph projection", () => {
  it("projects objects, research nodes, evidence, execution runs, notes and digests", () => {
    const graph = projectRelationshipGraph(researchFixtures);

    expect(graph.nodes.map((node) => node.kind)).toEqual(
      expect.arrayContaining([
        "research_object",
        "research_node",
        "evidence",
        "execution_run",
        "concept_note",
        "knowledge_digest",
      ]),
    );
  });

  it("projects research edges and evidence references as relationship edges", () => {
    const graph = projectRelationshipGraph(researchFixtures);

    expect(graph.edges.map((edge) => edge.relation)).toEqual(
      expect.arrayContaining(["contains", "research_flow", "references"]),
    );
  });

  it("preserves non-containment research edge semantics", () => {
    const graph = projectRelationshipGraph({
      ...researchFixtures,
      map: {
        ...researchFixtures.map,
        edges: [
          {
            id: "edge-depends",
            mapId: researchFixtures.map.id,
            fromNodeId: researchFixtures.map.nodes[1].id,
            toNodeId: researchFixtures.map.nodes[2].id,
            kind: "depends_on",
            confidence: 0.7,
            createdAt: researchFixtures.map.createdAt,
          },
          {
            id: "edge-challenges",
            mapId: researchFixtures.map.id,
            fromNodeId: researchFixtures.map.nodes[2].id,
            toNodeId: researchFixtures.map.nodes[3].id,
            kind: "challenges",
            confidence: 0.6,
            createdAt: researchFixtures.map.createdAt,
          },
          {
            id: "edge-validates",
            mapId: researchFixtures.map.id,
            fromNodeId: researchFixtures.map.nodes[3].id,
            toNodeId: researchFixtures.map.nodes[4].id,
            kind: "validates",
            confidence: 0.8,
            createdAt: researchFixtures.map.createdAt,
          },
          {
            id: "edge-leads",
            mapId: researchFixtures.map.id,
            fromNodeId: researchFixtures.map.nodes[4].id,
            toNodeId: researchFixtures.map.nodes[5].id,
            kind: "leads_to",
            confidence: 0.75,
            createdAt: researchFixtures.map.createdAt,
          },
        ],
      },
    });

    expect(graph.edges.find((edge) => edge.sourceId === "edge-depends")?.relation).toBe("depends_on");
    expect(graph.edges.find((edge) => edge.sourceId === "edge-challenges")?.relation).toBe("challenges");
    expect(graph.edges.find((edge) => edge.sourceId === "edge-validates")?.relation).toBe("validates");
    expect(graph.edges.find((edge) => edge.sourceId === "edge-leads")?.relation).toBe("leads_to");
  });

  it("keeps every projected node traceable by sourceId", () => {
    const graph = projectRelationshipGraph(researchFixtures);

    expect(graph.nodes.every((node) => node.sourceId.length > 0)).toBe(true);
  });

  it("matches the required golden graph subset", () => {
    const graph = projectRelationshipGraph(researchFixtures);
    const projectedNodeSources = new Set(graph.nodes.map((node) => node.sourceId));
    const projectedEdgeSources = new Set(graph.edges.map((edge) => edge.sourceId));

    for (const node of expectedRelationshipGraph.nodes) {
      expect(projectedNodeSources.has(node.sourceId)).toBe(true);
    }
    for (const edge of expectedRelationshipGraph.edges) {
      expect(projectedEdgeSources.has(edge.sourceId)).toBe(true);
    }
  });
});
