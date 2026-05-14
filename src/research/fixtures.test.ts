import { describe, expect, it } from "vitest";
import {
  expectedRelationshipGraph,
  researchFixtures,
  requiredFirstLayerTitles,
} from "./fixtures";

describe("research fixtures", () => {
  it("contains the complete deterministic research workspace sample", () => {
    expect(researchFixtures.object.title).toBe("AlphaAiGraph");
    expect(researchFixtures.session.status).toBe("active");
    expect(researchFixtures.thread.kind).toBe("main");
    expect(researchFixtures.map.nodes.length).toBeGreaterThan(1);
    expect(researchFixtures.sourceAssets.length).toBeGreaterThanOrEqual(3);
    expect(researchFixtures.evidenceAnchors.length).toBeGreaterThan(0);
    expect(researchFixtures.actions.length).toBeGreaterThan(0);
    expect(researchFixtures.jobs.length).toBeGreaterThan(0);
    expect(researchFixtures.sideInquiries.length).toBeGreaterThan(0);
    expect(researchFixtures.parallelGroups.length).toBeGreaterThan(0);
  });

  it("places the required first-layer nodes under the root node", () => {
    const childIds = researchFixtures.map.edges
      .filter((edge) => edge.fromNodeId === researchFixtures.map.rootNodeId)
      .map((edge) => edge.toNodeId);
    const childTitles = researchFixtures.map.nodes
      .filter((node) => childIds.includes(node.id))
      .map((node) => node.title);

    expect(childTitles).toEqual(expect.arrayContaining(requiredFirstLayerTitles));
  });

  it("covers the required agent marker kinds", () => {
    expect(researchFixtures.markers.map((marker) => marker.kind)).toEqual(
      expect.arrayContaining([
        "focus",
        "difficulty",
        "risk",
        "recommended_drilldown",
        "needs_validation",
      ]),
    );
  });

  it("links every evidence anchor to a source asset and at least one research node", () => {
    const sourceIds = new Set(researchFixtures.sourceAssets.map((source) => source.id));
    const nodeEvidenceIds = new Set(researchFixtures.map.nodes.flatMap((node) => node.evidenceIds));

    for (const evidence of researchFixtures.evidenceAnchors) {
      expect(sourceIds.has(evidence.sourceAssetId)).toBe(true);
      expect(nodeEvidenceIds.has(evidence.id)).toBe(true);
    }
  });

  it("keeps the golden relationship graph traceable to research fixture inputs", () => {
    const sourceIds = new Set([
      researchFixtures.object.id,
      ...researchFixtures.map.nodes.map((node) => node.id),
      ...researchFixtures.map.edges.map((edge) => edge.id),
      ...researchFixtures.evidenceAnchors.map((evidence) => evidence.id),
    ]);

    for (const node of expectedRelationshipGraph.nodes) {
      expect(sourceIds.has(node.sourceId)).toBe(true);
    }
    for (const edge of expectedRelationshipGraph.edges) {
      expect(sourceIds.has(edge.sourceId)).toBe(true);
    }
  });
});
