import { describe, expect, it } from "vitest";
import {
  getResearchAgentResult,
  normalizeResearchPayload,
} from "./tauriClient";

describe("tauri client boundary", () => {
  it("returns deterministic browser-local research results without Tauri shell", async () => {
    const result = await getResearchAgentResult({
      objectId: "object-browser",
      title: "Browser Local",
      sourceAssets: [],
    });

    expect(result.mode).toBe("browser-local");
    expect(result.object.id).toBe("object-browser");
    expect(result.session.objectId).toBe("object-browser");
    expect(result.thread.mapId).toBe(result.researchMap.id);
    expect(result.markers.length).toBeGreaterThan(0);
    expect(result.researchMap.rootNodeId).toBeTruthy();
    expect(result.jobs.length).toBeGreaterThan(0);
  });

  it("normalizes snake_case Rust research payloads into camelCase TypeScript objects", () => {
    const normalized = normalizeResearchPayload({
      research_map: {
        root_node_id: "node-root",
        nodes: [{ marker_ids: [], evidence_ids: [], action_ids: [] }],
        edges: [{ from_node_id: "a", to_node_id: "b" }],
      },
      evidence_anchors: [{ source_asset_id: "source-plan" }],
      browser_local: true,
    });

    expect(normalized.researchMap.rootNodeId).toBe("node-root");
    expect(normalized.researchMap.edges[0].fromNodeId).toBe("a");
    expect(normalized.evidenceAnchors[0].sourceAssetId).toBe("source-plan");
    expect(normalized.browserLocal).toBe(true);
  });
});
