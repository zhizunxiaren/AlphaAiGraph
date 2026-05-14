import { generateFirstLayerResearchMap } from "../research/researchAgent";
import type { ResearchAgentResult } from "../research/researchAgent";
import type { SourceAsset } from "../types";

export interface BrowserLocalResearchResult {
  mode: "browser-local";
  object: ResearchAgentResult["object"];
  session: ResearchAgentResult["session"];
  thread: ResearchAgentResult["thread"];
  researchMap: ResearchAgentResult["map"];
  markers: ResearchAgentResult["markers"];
  evidenceAnchors: ResearchAgentResult["evidenceAnchors"];
  actions: ResearchAgentResult["actions"];
  jobs: ResearchAgentResult["jobs"];
}

export async function getResearchAgentResult(input: {
  objectId: string;
  title: string;
  sourceAssets: SourceAsset[];
}): Promise<BrowserLocalResearchResult> {
  const result = generateFirstLayerResearchMap({
    objectId: input.objectId,
    objectKind: "project",
    title: input.title,
    sourceAssets: input.sourceAssets,
  });
  return {
    mode: "browser-local",
    object: result.object,
    session: result.session,
    thread: result.thread,
    researchMap: result.map,
    markers: result.markers,
    evidenceAnchors: result.evidenceAnchors,
    actions: result.actions,
    jobs: result.jobs,
  };
}

export function normalizeResearchPayload(payload: unknown): any {
  if (Array.isArray(payload)) {
    return payload.map((item) => normalizeResearchPayload(item));
  }
  if (payload && typeof payload === "object") {
    return Object.fromEntries(
      Object.entries(payload).map(([key, value]) => [
        snakeToCamel(key),
        normalizeResearchPayload(value),
      ]),
    );
  }
  return payload;
}

function snakeToCamel(value: string): string {
  return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}
