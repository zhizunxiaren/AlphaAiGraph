// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
import type { KnowledgeWorkspaceSnapshot, ResearchOrchestration } from "../types";
import { BuiltinTextSourceParser } from "./builtinSourceParsers";
import { createProjectWorkspace } from "./knowledgeEngine";
import { InMemoryRawSourceStore } from "./rawSourceStore";
import {
  executeResearchSearchQuery,
  selectResearchSearchResults,
  startResearchSearchRound,
  type ResearchSearchProvider,
  type ResearchSearchResult
} from "./researchSearch";

const now = "2026-07-15T03:00:00.000Z";

describe("active research search", () => {
  test("creates a persisted round for original, supporting, opposing, and updated evidence", () => {
    const initial = plannedResearchWorkspace();
    const started = startResearchSearchRound(initial, { planId: "plan-search", createdAt: now });

    expect(started.graph).toEqual(initial.graph);
    expect(started.knowledgeSourceAssets).toEqual([]);
    expect(started.project.workflow).toEqual({ mode: "research", phase: "researching" });
    expect(started.researchOrchestration.rounds[0]).toMatchObject({
      roundNumber: 1,
      status: "active",
      taskIds: expect.arrayContaining([
        "research-plan-search-round-1-task-1",
        "research-plan-search-round-1-task-4"
      ])
    });
    expect(started.researchOrchestration.searchQueries.map((query) => query.purpose)).toEqual([
      "primary_source",
      "supporting_evidence",
      "counterevidence",
      "update_check"
    ]);
    expect(started.researchOrchestration.searchQueries[0].filters).toMatchObject({
      sourceKinds: ["primary", "official", "peer_reviewed"],
      publishedFrom: "2025-01-01T00:00:00.000Z",
      publishedTo: "2026-07-15T00:00:00.000Z"
    });
  });

  test("filters by domain, language, source kind and date before ranking primary sources", () => {
    const results: ResearchSearchResult[] = [
      result("Secondary", "https://docs.example.org/secondary", "independent_secondary"),
      result("Official", "https://docs.example.org/official", "official"),
      result("Primary", "https://DOCS.example.org/source/?utm_source=test#top", "primary"),
      result("Duplicate URL", "https://docs.example.org/source", "primary"),
      { ...result("Wrong domain", "https://elsewhere.test/source", "primary") },
      { ...result("Wrong language", "https://docs.example.org/zh", "primary"), language: "zh" },
      { ...result("Too old", "https://docs.example.org/old", "primary"), publishedAt: "2024-01-01T00:00:00.000Z" }
    ];
    const selection = selectResearchSearchResults(results, {
      domains: ["example.org"],
      languages: ["en"],
      sourceKinds: ["primary", "official"],
      publishedFrom: "2025-01-01T00:00:00.000Z",
      publishedTo: "2026-12-31T00:00:00.000Z"
    });

    expect(selection.accepted.map((candidate) => [candidate.title, candidate.sourceKind])).toEqual([
      ["Duplicate URL", "primary"],
      ["Official", "official"]
    ]);
    expect(selection.accepted[0].url).toBe("https://docs.example.org/source");
    expect(selection.rejected.map((decision) => decision.reason)).toEqual(expect.arrayContaining([
      "source_kind_filtered",
      "duplicate_url",
      "domain_filtered",
      "language_filtered",
      "date_filtered"
    ]));
  });

  test("captures original bytes, ingests immutable sources, and deduplicates equal content by SHA-256", async () => {
    const started = startResearchSearchRound(plannedResearchWorkspace(), { planId: "plan-search", createdAt: now });
    const query = started.researchOrchestration.searchQueries[0];
    const primary = result("Primary report", "https://research.example/report?utm_campaign=test#methods", "primary");
    const officialMirror = result("Official mirror", "https://official.example/report", "official");
    const search = vi.fn<ResearchSearchProvider["search"]>().mockResolvedValue([officialMirror, primary]);
    const capture = vi.fn<ResearchSearchProvider["capture"]>().mockResolvedValue({
      content: "Exact captured report text.\n\nMethods and results.",
      mediaType: "text/plain"
    });
    const provider: ResearchSearchProvider = { id: "fixture-search", search, capture };

    const execution = await executeResearchSearchQuery({
      snapshot: started,
      queryId: query.id,
      provider,
      parsers: [new BuiltinTextSourceParser()],
      rawStore: new InMemoryRawSourceStore(),
      executedAt: "2026-07-15T03:10:00.000Z"
    });

    expect(execution.status).toBe("completed");
    expect(search).toHaveBeenCalledWith(expect.objectContaining({
      query: query.query,
      filters: query.filters,
      limit: 16
    }));
    expect(capture.mock.calls.map(([input]) => input.result.sourceKind)).toEqual(["primary", "official"]);
    expect(execution.decisions.map((decision) => decision.reason)).toEqual(["ingested", "duplicate_content"]);
    expect(execution.snapshot.knowledgeSourceAssets).toHaveLength(1);
    expect(execution.snapshot.knowledgeSourceAssets[0]).toMatchObject({
      immutable: true,
      uri: "https://research.example/report",
      contentHash: expect.stringMatching(/^sha256:/)
    });
    const completedQuery = execution.snapshot.researchOrchestration.searchQueries.find((candidate) => candidate.id === query.id)!;
    expect(completedQuery).toMatchObject({ status: "completed", completedAt: "2026-07-15T03:10:00.000Z" });
    expect(completedQuery.resultSourceIds).toEqual([execution.snapshot.knowledgeSourceAssets[0].id]);
    expect(completedQuery.deduplicatedSourceIds).toEqual(completedQuery.resultSourceIds);
    expect(execution.snapshot.researchOrchestration.tasks.find((task) => task.id === query.taskId)).toMatchObject({
      status: "completed",
      outputSourceIds: completedQuery.resultSourceIds
    });
    expect(execution.snapshot.researchOrchestration.rounds[0].outputs.sourceIds).toEqual(completedQuery.resultSourceIds);
    expect(execution.snapshot.candidatePatches).toHaveLength(1);
  });

  test("records provider failure in query and task state without inventing a source", async () => {
    const started = startResearchSearchRound(plannedResearchWorkspace(), { planId: "plan-search", createdAt: now });
    const query = started.researchOrchestration.searchQueries[0];
    const provider: ResearchSearchProvider = {
      id: "failed-search",
      search: vi.fn().mockRejectedValue(new Error("provider unavailable")),
      capture: vi.fn()
    };

    const execution = await executeResearchSearchQuery({
      snapshot: started,
      queryId: query.id,
      provider,
      parsers: [new BuiltinTextSourceParser()],
      rawStore: new InMemoryRawSourceStore(),
      executedAt: "2026-07-15T03:10:00.000Z"
    });

    expect(execution).toMatchObject({ status: "failed", error: "provider unavailable" });
    expect(execution.snapshot.knowledgeSourceAssets).toEqual([]);
    expect(execution.snapshot.researchOrchestration.searchQueries[0]).toMatchObject({
      status: "failed",
      error: "provider unavailable"
    });
    expect(execution.snapshot.researchOrchestration.tasks[0]).toMatchObject({
      status: "blocked",
      blockedReason: "provider unavailable"
    });
  });
});

function plannedResearchWorkspace(): KnowledgeWorkspaceSnapshot {
  const workspace = createProjectWorkspace({
    mode: "research",
    title: "Active search fixture",
    subjectKind: "question"
  });
  const question = workspace.graph.nodes.find((node) => node.kind === "question")!;
  const orchestration: ResearchOrchestration = {
    briefs: [{
      id: "brief-search",
      projectId: workspace.project.id,
      primaryQuestionNodeId: question.id,
      secondaryQuestionNodeIds: [],
      objective: "形成可追溯且包含反证的研究判断。",
      scope: {
        description: "评估最近的公开证据。",
        time: {
          from: "2025-01-01T00:00:00.000Z",
          asOf: "2026-07-15T00:00:00.000Z"
        },
        geographies: ["global"],
        units: [],
        inclusionCriteria: ["可捕获原文"],
        exclusionCriteria: ["只有搜索摘要"]
      },
      successCriteria: ["至少定位一个原始来源"],
      seedSourceIds: [],
      status: "ready",
      revision: 1,
      createdBy: "user",
      createdAt: now,
      updatedAt: now
    }],
    plans: [{
      id: "plan-search",
      projectId: workspace.project.id,
      briefId: "brief-search",
      strategy: "原始来源优先，并主动寻找反证和更新。",
      taskIds: [],
      verificationRequirements: ["primary_source_traceability", "support_and_opposition", "temporal_validity"],
      maxRounds: 3,
      status: "draft",
      revision: 1,
      createdBy: "agent",
      createdAt: now,
      updatedAt: now
    }],
    tasks: [],
    rounds: [],
    searchQueries: [],
    verificationRecords: []
  };
  return { ...workspace, researchOrchestration: orchestration };
}

function result(title: string, url: string, sourceKind: ResearchSearchResult["sourceKind"]): ResearchSearchResult {
  return {
    title,
    url,
    providerId: "fixture-search",
    sourceKind,
    language: "en",
    publishedAt: "2026-06-01T00:00:00.000Z"
  };
}
