import type {
  KnowledgeSourceFormat,
  KnowledgeWorkspaceSnapshot,
  ResearchBrief,
  ResearchPlan,
  ResearchRoundOutputs,
  SearchQuery,
  SearchQueryFilters,
  SearchQueryPurpose,
  SearchSourceKind,
  SourceParser,
  SourceParserInput
} from "../types";
import type { RawSourceStore } from "./rawSourceStore";
import { sha256ContentHash } from "./rawSourceStore";
import { assertResearchOrchestration } from "./researchOrchestration";
import { captureResearchRoundBaseline } from "./researchRound";
import { inferKnowledgeSourceFormat, ingestSourceIntoWorkspace } from "./sourceIngest";
import { isProjectWritable } from "./projectLifecycle";

export interface ResearchSearchResult {
  title: string;
  url: string;
  providerId: string;
  sourceKind: SearchSourceKind;
  language?: string;
  snippet?: string;
  publishedAt?: string;
}

export interface ResearchSearchCapture {
  content: SourceParserInput["content"];
  mediaType?: string;
}

export interface ResearchSearchProvider {
  readonly id: string;
  search(input: {
    query: string;
    filters: SearchQueryFilters;
    limit: number;
    signal?: AbortSignal;
  }): Promise<readonly ResearchSearchResult[]>;
  capture(input: { result: ResearchSearchResult; signal?: AbortSignal }): Promise<ResearchSearchCapture>;
}

export type ResearchSearchDecisionReason =
  | "invalid_result"
  | "domain_filtered"
  | "language_filtered"
  | "source_kind_filtered"
  | "date_filtered"
  | "duplicate_url"
  | "duplicate_content"
  | "capture_failed"
  | "ingested";

export interface ResearchSearchDecision {
  result: ResearchSearchResult;
  reason: ResearchSearchDecisionReason;
  sourceId?: string;
  detail?: string;
}

export interface ResearchSearchSelection {
  accepted: ResearchSearchResult[];
  rejected: ResearchSearchDecision[];
}

export interface ResearchSearchExecution {
  snapshot: KnowledgeWorkspaceSnapshot;
  queryId: string;
  status: "completed" | "failed";
  decisions: ResearchSearchDecision[];
  error?: string;
}

export interface StartResearchSearchRoundInput {
  planId: string;
  createdAt: string;
  focusNodeId?: string;
}

const sourceKindRank: Record<SearchSourceKind, number> = {
  primary: 0,
  official: 1,
  peer_reviewed: 2,
  independent_secondary: 3,
  community: 4,
  other: 5
};

const searchTemplates: ReadonlyArray<{
  purpose: SearchQueryPurpose;
  title: string;
  suffix: string;
  sourceKinds: SearchSourceKind[];
}> = [
  {
    purpose: "primary_source",
    title: "定位原始来源",
    suffix: "official standard original study dataset primary source",
    sourceKinds: ["primary", "official", "peer_reviewed"]
  },
  {
    purpose: "supporting_evidence",
    title: "搜索支持证据",
    suffix: "supporting evidence data methodology",
    sourceKinds: ["primary", "official", "peer_reviewed", "independent_secondary"]
  },
  {
    purpose: "counterevidence",
    title: "搜索反对证据",
    suffix: "counterevidence criticism failure limitation contradictory data",
    sourceKinds: ["primary", "peer_reviewed", "independent_secondary"]
  },
  {
    purpose: "update_check",
    title: "检查更新与时效",
    suffix: "latest update revision current status",
    sourceKinds: ["primary", "official", "peer_reviewed"]
  }
];

/** Creates an active, persisted search round from a ready ResearchBrief. */
export function startResearchSearchRound(
  snapshot: KnowledgeWorkspaceSnapshot,
  input: StartResearchSearchRoundInput
): KnowledgeWorkspaceSnapshot {
  if (snapshot.project.mode !== "research") throw new Error("Active research search requires a Research Project");
  if (!isProjectWritable(snapshot)) throw new Error("Research Project must be writable before starting search");
  assertTimestamp(input.createdAt, "createdAt");
  const orchestration = snapshot.researchOrchestration;
  const plan = orchestration.plans.find((candidate) => candidate.id === input.planId);
  if (!plan || plan.projectId !== snapshot.project.id) throw new Error(`Research plan is unavailable: ${input.planId}`);
  if (plan.status === "completed" || plan.status === "cancelled" || plan.status === "superseded") {
    throw new Error(`Research plan is not active: ${plan.id}`);
  }
  const brief = orchestration.briefs.find((candidate) => candidate.id === plan.briefId);
  if (!brief || brief.projectId !== plan.projectId || brief.status !== "ready") {
    throw new Error(`Research plan ${plan.id} requires a ready brief`);
  }
  if (orchestration.rounds.some((round) => round.planId === plan.id && round.status === "active")) {
    throw new Error(`Research plan ${plan.id} already has an active round`);
  }
  const planRounds = orchestration.rounds.filter((round) => round.planId === plan.id);
  if (plan.maxRounds !== undefined && planRounds.length >= plan.maxRounds) {
    throw new Error(`Research plan ${plan.id} reached its maxRounds limit`);
  }
  const focusNodeId = input.focusNodeId ?? brief.primaryQuestionNodeId;
  const focus = snapshot.graph.nodes.find((node) => node.id === focusNodeId && node.status !== "archived");
  if (!focus) throw new Error(`Research search focus is unavailable: ${focusNodeId}`);
  const roundNumber = Math.max(0, ...planRounds.map((round) => round.roundNumber)) + 1;
  const baseId = `research-${sanitizeId(plan.id)}-round-${roundNumber}`;
  const roundId = `${baseId}`;
  const question = quoteQueryTerm(focus.title);
  const tasks = searchTemplates.map((template, index) => ({
    id: `${baseId}-task-${index + 1}`,
    projectId: plan.projectId,
    planId: plan.id,
    roundId,
    kind: "search" as const,
    title: template.title,
    objective: `${template.title}，并只收录已捕获原文的不可变来源。`,
    role: "researcher" as const,
    status: "in_progress" as const,
    dependsOnTaskIds: [],
    inputNodeIds: [focus.id],
    inputSourceIds: brief.seedSourceIds,
    outputNodeIds: [],
    outputSourceIds: [],
    createdAt: input.createdAt,
    updatedAt: input.createdAt
  }));
  const queries: SearchQuery[] = searchTemplates.map((template, index) => ({
    id: `${baseId}-query-${index + 1}`,
    projectId: plan.projectId,
    planId: plan.id,
    taskId: tasks[index].id,
    roundId,
    query: `${question} ${template.suffix}`,
    purpose: template.purpose,
    filters: filtersFromBrief(brief, template.sourceKinds),
    status: "queued",
    resultSourceIds: [],
    deduplicatedSourceIds: [],
    createdAt: input.createdAt,
    updatedAt: input.createdAt
  }));
  const round = {
    id: roundId,
    projectId: plan.projectId,
    planId: plan.id,
    roundNumber,
    objective: `围绕「${focus.title}」主动搜索原始来源、支持证据、反对证据和最新更新。`,
    taskIds: tasks.map((task) => task.id),
    status: "active" as const,
    baseline: captureResearchRoundBaseline(snapshot, input.createdAt),
    outputs: emptyRoundOutputs(),
    nextQuestionNodeIds: [],
    startedAt: input.createdAt,
    createdAt: input.createdAt,
    updatedAt: input.createdAt
  };
  const nextPlan: ResearchPlan = {
    ...plan,
    status: "active",
    taskIds: plan.taskIds.concat(tasks.map((task) => task.id)),
    updatedAt: input.createdAt
  };
  const project = {
    ...snapshot.project,
    workflow: { mode: "research" as const, phase: "researching" as const },
    updatedAt: input.createdAt
  };
  const next: KnowledgeWorkspaceSnapshot = {
    ...snapshot,
    project,
    projects: snapshot.projects.map((candidate) => candidate.id === project.id ? project : candidate),
    subject: project.subject,
    researchOrchestration: {
      ...orchestration,
      plans: orchestration.plans.map((candidate) => candidate.id === nextPlan.id ? nextPlan : candidate),
      tasks: orchestration.tasks.concat(tasks),
      rounds: orchestration.rounds.concat(round),
      searchQueries: orchestration.searchQueries.concat(queries)
    }
  };
  assertResearchOrchestration(next);
  return next;
}

/** Filters metadata, canonicalizes URLs, removes duplicate URLs, then ranks original sources first. */
export function selectResearchSearchResults(
  results: readonly ResearchSearchResult[],
  filters: SearchQueryFilters,
  limit = 20
): ResearchSearchSelection {
  assertSearchLimit(limit);
  const rejected: ResearchSearchDecision[] = [];
  const candidates: ResearchSearchResult[] = [];
  for (const raw of results) {
    const normalized = normalizeResult(raw);
    if (!normalized) {
      rejected.push({ result: raw, reason: "invalid_result" });
      continue;
    }
    const filterReason = rejectedByFilter(normalized, filters);
    if (filterReason) {
      rejected.push({ result: normalized, reason: filterReason });
      continue;
    }
    candidates.push(normalized);
  }
  candidates.sort(compareResults);
  const seenUrls = new Set<string>();
  const accepted: ResearchSearchResult[] = [];
  for (const candidate of candidates) {
    if (seenUrls.has(candidate.url)) {
      rejected.push({ result: candidate, reason: "duplicate_url" });
      continue;
    }
    seenUrls.add(candidate.url);
    accepted.push(candidate);
    if (accepted.length >= limit) break;
  }
  return { accepted, rejected };
}

/**
 * Runs one persisted SearchQuery. Listing snippets remain ephemeral: only
 * provider-captured bytes pass through immutable source ingest.
 */
export async function executeResearchSearchQuery(input: {
  snapshot: KnowledgeWorkspaceSnapshot;
  queryId: string;
  provider: ResearchSearchProvider;
  parsers: readonly SourceParser[];
  rawStore: RawSourceStore;
  executedAt: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<ResearchSearchExecution> {
  const limit = input.limit ?? 8;
  assertSearchLimit(limit);
  assertTimestamp(input.executedAt, "executedAt");
  const query = input.snapshot.researchOrchestration.searchQueries.find((candidate) => candidate.id === input.queryId);
  if (!query) throw new Error(`Research search query does not exist: ${input.queryId}`);
  if (query.status !== "queued" && query.status !== "draft") throw new Error(`Research search query is not executable: ${query.status}`);
  const task = input.snapshot.researchOrchestration.tasks.find((candidate) => candidate.id === query.taskId);
  if (!task || task.kind !== "search") throw new Error(`Research search task is unavailable: ${query.taskId}`);
  let working = updateQuery(input.snapshot, query.id, {
    status: "running",
    executedAt: input.executedAt,
    updatedAt: input.executedAt,
    error: undefined
  });

  let rawResults: readonly ResearchSearchResult[];
  try {
    rawResults = await input.provider.search({
      query: query.query,
      filters: query.filters,
      limit: Math.min(20, Math.max(limit * 2, limit)),
      signal: input.signal
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    working = failQuery(working, query, task.id, input.executedAt, message);
    assertResearchOrchestration(working);
    return { snapshot: working, queryId: query.id, status: "failed", decisions: [], error: message };
  }

  const selection = selectResearchSearchResults(rawResults, query.filters, limit);
  const decisions = [...selection.rejected];
  const resultSourceIds: string[] = [];
  const deduplicatedSourceIds: string[] = [];
  for (const result of selection.accepted) {
    try {
      const capture = await input.provider.capture({ result, signal: input.signal });
      if (!hasCapturedContent(capture.content)) throw new Error("Provider returned no captured source content");
      const contentHash = await sha256ContentHash(capture.content);
      const duplicate = working.knowledgeSourceAssets.find((source) => source.contentHash === contentHash);
      if (duplicate) {
        appendUnique(resultSourceIds, duplicate.id);
        appendUnique(deduplicatedSourceIds, duplicate.id);
        decisions.push({ result, reason: "duplicate_content", sourceId: duplicate.id });
        continue;
      }
      const format = inferResearchSourceFormat(result.url, capture.mediaType);
      const logicalSourceId = `research-${stableHash(result.url)}`;
      const ingest = await ingestSourceIntoWorkspace({
        snapshot: working,
        request: {
          id: `ingest-${sanitizeId(query.id)}-${stableHash(result.url)}`,
          projectId: query.projectId,
          spaceId: working.space.id,
          sourceId: logicalSourceId,
          inventoryKind: "document",
          title: result.title,
          uri: result.url,
          format,
          mediaType: capture.mediaType,
          researchSourceKind: result.sourceKind,
          requestedAt: input.executedAt
        },
        content: capture.content,
        parsers: input.parsers,
        rawStore: input.rawStore,
        parentNodeId: working.project.subject.rootNodeId
      });
      if (ingest.ingest.status !== "parsed" || !ingest.ingest.source) {
        decisions.push({
          result,
          reason: "capture_failed",
          detail: ingest.ingest.error ?? `Source ingest returned ${ingest.ingest.status}`
        });
        continue;
      }
      working = ingest.snapshot;
      appendUnique(resultSourceIds, ingest.ingest.source.id);
      decisions.push({ result, reason: "ingested", sourceId: ingest.ingest.source.id });
    } catch (error) {
      decisions.push({
        result,
        reason: "capture_failed",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  }

  working = completeQuery(
    working,
    query,
    task.id,
    input.executedAt,
    resultSourceIds,
    deduplicatedSourceIds
  );
  assertResearchOrchestration(working);
  return { snapshot: working, queryId: query.id, status: "completed", decisions };
}

function filtersFromBrief(brief: ResearchBrief, sourceKinds: SearchSourceKind[]): SearchQueryFilters {
  return {
    domains: [],
    languages: [],
    sourceKinds,
    publishedFrom: brief.scope.time.from,
    publishedTo: brief.scope.time.to ?? brief.scope.time.asOf
  };
}

function normalizeResult(result: ResearchSearchResult): ResearchSearchResult | undefined {
  const title = result.title.trim();
  const providerId = result.providerId.trim();
  if (!title || !providerId || !(result.sourceKind in sourceKindRank)) return undefined;
  let url: string;
  try {
    url = canonicalHttpUrl(result.url);
  } catch {
    return undefined;
  }
  if (result.publishedAt && Number.isNaN(Date.parse(result.publishedAt))) return undefined;
  return {
    ...result,
    title,
    url,
    providerId,
    language: result.language?.trim().toLowerCase() || undefined,
    snippet: result.snippet?.trim() || undefined
  };
}

function rejectedByFilter(
  result: ResearchSearchResult,
  filters: SearchQueryFilters
): Exclude<ResearchSearchDecisionReason, "invalid_result" | "duplicate_url" | "duplicate_content" | "capture_failed" | "ingested"> | undefined {
  const hostname = new URL(result.url).hostname;
  if (filters.domains.length > 0 && !filters.domains.some((domain) => domainMatches(hostname, domain))) return "domain_filtered";
  if (filters.languages.length > 0 && (!result.language || !filters.languages.some((language) => language.toLowerCase() === result.language))) {
    return "language_filtered";
  }
  if (filters.sourceKinds.length > 0 && !filters.sourceKinds.includes(result.sourceKind)) return "source_kind_filtered";
  if (filters.publishedFrom || filters.publishedTo) {
    if (!result.publishedAt) return "date_filtered";
    const published = Date.parse(result.publishedAt);
    if (filters.publishedFrom && published < Date.parse(filters.publishedFrom)) return "date_filtered";
    if (filters.publishedTo && published > Date.parse(filters.publishedTo)) return "date_filtered";
  }
  return undefined;
}

function compareResults(left: ResearchSearchResult, right: ResearchSearchResult): number {
  const kindDifference = sourceKindRank[left.sourceKind] - sourceKindRank[right.sourceKind];
  if (kindDifference !== 0) return kindDifference;
  const leftPublished = left.publishedAt ? Date.parse(left.publishedAt) : 0;
  const rightPublished = right.publishedAt ? Date.parse(right.publishedAt) : 0;
  if (leftPublished !== rightPublished) return rightPublished - leftPublished;
  return left.url.localeCompare(right.url) || left.title.localeCompare(right.title);
}

function completeQuery(
  snapshot: KnowledgeWorkspaceSnapshot,
  query: SearchQuery,
  taskId: string,
  completedAt: string,
  sourceIds: string[],
  deduplicatedSourceIds: string[]
): KnowledgeWorkspaceSnapshot {
  const queries = snapshot.researchOrchestration.searchQueries.map((candidate): SearchQuery => candidate.id === query.id
    ? {
        ...candidate,
        status: "completed",
        resultSourceIds: sourceIds,
        deduplicatedSourceIds,
        executedAt: candidate.executedAt ?? completedAt,
        completedAt,
        updatedAt: completedAt,
        error: undefined
      }
    : candidate);
  const taskQueries = queries.filter((candidate) => candidate.taskId === taskId);
  const taskCompleted = taskQueries.every((candidate) => candidate.status === "completed" || candidate.status === "cancelled");
  const tasks = snapshot.researchOrchestration.tasks.map((candidate) => candidate.id === taskId
    ? {
        ...candidate,
        status: taskCompleted ? "completed" as const : candidate.status,
        outputSourceIds: union(candidate.outputSourceIds, sourceIds),
        updatedAt: completedAt,
        completedAt: taskCompleted ? completedAt : candidate.completedAt,
        blockedReason: undefined
      }
    : candidate);
  const rounds = snapshot.researchOrchestration.rounds.map((round) => round.id === query.roundId
    ? {
        ...round,
        outputs: { ...round.outputs, sourceIds: union(round.outputs.sourceIds, sourceIds) },
        updatedAt: completedAt
      }
    : round);
  return {
    ...snapshot,
    researchOrchestration: { ...snapshot.researchOrchestration, searchQueries: queries, tasks, rounds }
  };
}

function failQuery(
  snapshot: KnowledgeWorkspaceSnapshot,
  query: SearchQuery,
  taskId: string,
  completedAt: string,
  error: string
): KnowledgeWorkspaceSnapshot {
  const searchQueries = snapshot.researchOrchestration.searchQueries.map((candidate): SearchQuery => candidate.id === query.id
    ? { ...candidate, status: "failed", executedAt: candidate.executedAt ?? completedAt, completedAt, updatedAt: completedAt, error }
    : candidate);
  const tasks = snapshot.researchOrchestration.tasks.map((candidate) => candidate.id === taskId
    ? { ...candidate, status: "blocked" as const, blockedReason: error, updatedAt: completedAt }
    : candidate);
  return { ...snapshot, researchOrchestration: { ...snapshot.researchOrchestration, searchQueries, tasks } };
}

function updateQuery(
  snapshot: KnowledgeWorkspaceSnapshot,
  queryId: string,
  update: Partial<SearchQuery>
): KnowledgeWorkspaceSnapshot {
  return {
    ...snapshot,
    researchOrchestration: {
      ...snapshot.researchOrchestration,
      searchQueries: snapshot.researchOrchestration.searchQueries.map((query) => query.id === queryId ? { ...query, ...update } : query)
    }
  };
}

function inferResearchSourceFormat(url: string, mediaType = ""): KnowledgeSourceFormat {
  const pathname = new URL(url).pathname;
  return inferKnowledgeSourceFormat(pathname, mediaType);
}

function canonicalHttpUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`Research result URL must use HTTP(S): ${value}`);
  url.hash = "";
  for (const key of Array.from(url.searchParams.keys())) {
    if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
  }
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

function domainMatches(hostname: string, allowedDomain: string): boolean {
  const normalized = allowedDomain.trim().toLowerCase().replace(/^\.+/, "");
  return Boolean(normalized) && (hostname === normalized || hostname.endsWith(`.${normalized}`));
}

function quoteQueryTerm(value: string): string {
  return `"${value.replace(/["\r\n]+/g, " ").trim()}"`;
}

function hasCapturedContent(content: SourceParserInput["content"]): boolean {
  return typeof content === "string" ? Boolean(content.trim()) : content.byteLength > 0;
}

function assertSearchLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error("Research search limit must be an integer from 1 to 20");
}

function assertTimestamp(value: string, label: string): void {
  if (Number.isNaN(Date.parse(value))) throw new Error(`${label} must be a valid timestamp`);
}

function emptyRoundOutputs(): ResearchRoundOutputs {
  return {
    sourceIds: [],
    factNodeIds: [],
    claimNodeIds: [],
    hypothesisNodeIds: [],
    inferenceNodeIds: [],
    evidenceNodeIds: [],
    conflictNodeIds: [],
    gapNodeIds: [],
    synthesisNodeIds: [],
    edgeIds: [],
    verificationRecordIds: []
  };
}

function union(left: string[], right: string[]): string[] {
  return Array.from(new Set(left.concat(right)));
}

function appendUnique(values: string[], value: string): void {
  if (!values.includes(value)) values.push(value);
}

function sanitizeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "research";
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
