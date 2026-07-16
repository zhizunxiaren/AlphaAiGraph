import type {
  AgentRequest,
  CandidateGraphPatch,
  GraphPatchOperation,
  KnowledgeEdge,
  KnowledgeNode,
  KnowledgeSourceAsset,
  KnowledgeSourceFormat,
  KnowledgeWorkspaceSnapshot,
  SearchSourceKind,
  SourceParserInput,
  SourceParser
} from "../types";
import { createGraphPatchAudit } from "./graphPatch";
import { knowledgeDiagnosticKindLabels, lintKnowledgeWorkspace, type KnowledgeDiagnostic } from "./knowledgeDiagnostics";
import { createKnowledgeMetadata } from "./knowledgeMetadata";
import { isProjectWritable } from "./projectLifecycle";
import type { RawSourceStore } from "./rawSourceStore";
import { sha256ContentHash } from "./rawSourceStore";
import { inferKnowledgeSourceFormat, ingestSourceIntoWorkspace, type WorkspaceIngestResult } from "./sourceIngest";

export type ExplorerTaskKind = "new_material" | "adjacent_domain" | "counterexample" | "verification";

export interface ExplorerTask {
  id: string;
  kind: ExplorerTaskKind;
  label: string;
  query: string;
  rationale: string;
  targetNodeId: string;
}

export interface ExplorerPlan {
  targetNodeId: string;
  diagnosticIds: string[];
  tasks: ExplorerTask[];
}

export interface KnowledgeSearchResult {
  title: string;
  url: string;
  snippet?: string;
  publishedAt?: string;
  providerId: string;
  sourceKind?: SearchSourceKind;
  language?: string;
  /** Provider-declared stable identity across version-specific URLs. */
  logicalUrl?: string;
  versionLabel?: string;
}

export interface KnowledgeSearchCapture {
  content: SourceParserInput["content"];
  mediaType?: string;
}

export interface KnowledgeSearchProviderDisclosure {
  privacyNotice: string;
  costNotice: string;
  sends: "query_only" | "query_and_result_url";
  pricing: "free" | "metered" | "unknown";
}

export interface KnowledgeSearchProvider {
  readonly id: string;
  readonly disclosure?: KnowledgeSearchProviderDisclosure;
  search(input: { query: string; limit: number; signal?: AbortSignal }): Promise<readonly KnowledgeSearchResult[]>;
  capture?(input: { result: KnowledgeSearchResult; signal?: AbortSignal }): Promise<KnowledgeSearchCapture>;
}

export interface ExplorerSourceCapture {
  task: ExplorerTask;
  result: KnowledgeSearchResult;
  /** Exact excerpt or page text captured by the provider/user; listing snippets are not silently promoted to sources. */
  sourceContent: SourceParserInput["content"];
  mediaType?: string;
  requestedAt: string;
}

export type ExplorerResultVersionState = "single" | "latest" | "older" | "unknown";

export interface ExplorerSearchResult extends KnowledgeSearchResult {
  id: string;
  canonicalUrl: string;
  logicalUrl: string;
  sourceKind: SearchSourceKind;
  relevanceScore: number;
  rankingReasons: string[];
  versionState: ExplorerResultVersionState;
  existingSourceId?: string;
}

export interface ExplorerSearchFilters {
  domains?: readonly string[];
  sourceKinds?: readonly SearchSourceKind[];
  publishedFrom?: string;
  publishedTo?: string;
  latestVersionsOnly?: boolean;
  hideExisting?: boolean;
}

export interface ExplorerSearchAttempt {
  attempt: number;
  startedAt: string;
  finishedAt: string;
  status: "completed" | "failed" | "cancelled" | "timeout";
  error?: string;
}

export interface ExplorerSearchExecution {
  taskId: string;
  providerId: string;
  status: "completed" | "failed" | "cancelled";
  results: ExplorerSearchResult[];
  attempts: ExplorerSearchAttempt[];
  disclosure: KnowledgeSearchProviderDisclosure;
  error?: string;
  canRetry: boolean;
}

export type ExplorerCaptureDecisionReason = "ingested" | "duplicate_content" | "capture_failed";

export interface ExplorerCaptureDecision {
  result: ExplorerSearchResult;
  reason: ExplorerCaptureDecisionReason;
  sourceId?: string;
  detail?: string;
  attempts: number;
}

export interface ExplorerBatchCaptureExecution {
  snapshot: KnowledgeWorkspaceSnapshot;
  decisions: ExplorerCaptureDecision[];
}

export interface ExplorerSearchOptions {
  limit?: number;
  signal?: AbortSignal;
  existingSources?: readonly Pick<KnowledgeSourceAsset, "id" | "uri" | "logicalSourceId" | "version" | "contentHash">[];
  filters?: ExplorerSearchFilters;
  maxAttempts?: number;
  timeoutMs?: number;
  retryDelayMs?: number;
  now?: () => string;
}

export const explorerPolicy = {
  id: "systematize-explorer",
  version: 1,
  role: "Explorer",
  writesThroughCandidatePatchOnly: true,
  requiresImmutableSourceBeforeGrounding: true,
  persistsSearchQueries: false
} as const;

export function deriveExplorerPlan(snapshot: KnowledgeWorkspaceSnapshot): ExplorerPlan {
  if (snapshot.project.mode !== "systematize") {
    throw new Error("Explorer policy is only available in a Systematize Project");
  }
  const target = requireTarget(snapshot, snapshot.selection.focusNodeId);
  const diagnostics = lintKnowledgeWorkspace(snapshot).issues
    .filter((issue) => issue.nodeIds.includes(target.id));
  const cue = diagnostics[0]
    ? knowledgeDiagnosticKindLabels[diagnostics[0].kind]
    : "知识缺口与适用边界";
  const title = quoteQueryTerm(target.title);
  const tasks: ExplorerTask[] = [
    task(target, "new_material", "搜索新资料", `${title} 官方文档 原始研究 最新`, `寻找可定位的原始来源，补充「${cue}」。`),
    task(target, "adjacent_domain", "发现相邻领域", `${title} 相邻领域 类似方法 可迁移经验`, "寻找可类比的方法，也明确类比成立所需的条件。"),
    task(target, "counterexample", "寻找反例", `${title} 反例 失效条件 局限 批评`, "优先寻找不同观点、失败案例和边界条件，避免只收集支持材料。"),
    task(target, "verification", "验证问题", `${title} 验证方法 指标 数据 ${cue}`, verificationRationale(target, diagnostics[0]))
  ];
  return { targetNodeId: target.id, diagnosticIds: diagnostics.map((issue) => issue.id), tasks };
}

/** Opens a replaceable browser-search handoff; direct in-app search uses KnowledgeSearchProvider. */
export function buildExplorerSearchUrl(task: ExplorerTask): string {
  const url = new URL("https://www.google.com/search");
  url.searchParams.set("q", task.query);
  return url.toString();
}

export async function searchExplorerTask(
  provider: KnowledgeSearchProvider,
  task: ExplorerTask,
  options: ExplorerSearchOptions = {}
): Promise<ExplorerSearchResult[]> {
  const execution = await executeExplorerSearch(provider, task, options);
  if (execution.status !== "completed") throw new Error(execution.error ?? "Explorer search failed");
  return execution.results;
}

/** Executes one ephemeral search with timeout/retry and deterministic ranking. */
export async function executeExplorerSearch(
  provider: KnowledgeSearchProvider,
  task: ExplorerTask,
  options: ExplorerSearchOptions = {}
): Promise<ExplorerSearchExecution> {
  const limit = options.limit ?? 8;
  const maxAttempts = options.maxAttempts ?? 2;
  const timeoutMs = options.timeoutMs ?? 12_000;
  const retryDelayMs = options.retryDelayMs ?? 250;
  assertExplorerSearchLimit(limit);
  assertPositiveInteger(maxAttempts, "Explorer maxAttempts", 3);
  assertPositiveInteger(timeoutMs, "Explorer timeoutMs", 120_000);
  if (!Number.isInteger(retryDelayMs) || retryDelayMs < 0 || retryDelayMs > 10_000) {
    throw new Error("Explorer retryDelayMs must be an integer from 0 to 10000");
  }
  const now = options.now ?? (() => new Date().toISOString());
  const attempts: ExplorerSearchAttempt[] = [];
  const disclosure = provider.disclosure ?? unknownProviderDisclosure(provider.id);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const startedAt = now();
    try {
      const results = await invokeProviderWithTimeout(
        (signal) => provider.search({ query: task.query, limit: Math.min(20, Math.max(limit * 2, limit)), signal }),
        options.signal,
        timeoutMs
      );
      const finishedAt = now();
      attempts.push({ attempt, startedAt, finishedAt, status: "completed" });
      return {
        taskId: task.id,
        providerId: provider.id,
        status: "completed",
        results: rankExplorerSearchResults(results, task, {
          limit,
          existingSources: options.existingSources,
          filters: options.filters
        }),
        attempts,
        disclosure,
        canRetry: false
      };
    } catch (error) {
      const finishedAt = now();
      const classified = classifyExplorerProviderError(error, options.signal);
      attempts.push({ attempt, startedAt, finishedAt, status: classified.status, error: classified.message });
      if (classified.status === "cancelled") {
        return {
          taskId: task.id,
          providerId: provider.id,
          status: "cancelled",
          results: [],
          attempts,
          disclosure,
          error: classified.message,
          canRetry: false
        };
      }
      if (attempt < maxAttempts) await waitForRetry(retryDelayMs, options.signal);
    }
  }

  return {
    taskId: task.id,
    providerId: provider.id,
    status: "failed",
    results: [],
    attempts,
    disclosure,
    error: attempts.at(-1)?.error ?? "Explorer search failed",
    canRetry: true
  };
}

export async function ingestExplorerSourceCapture(input: {
  snapshot: KnowledgeWorkspaceSnapshot;
  capture: ExplorerSourceCapture;
  parsers: readonly SourceParser[];
  rawStore: RawSourceStore;
}): Promise<WorkspaceIngestResult> {
  const { snapshot, capture } = input;
  if (snapshot.project.mode !== "systematize") throw new Error("Explorer source capture is only available in a Systematize Project");
  if (capture.task.targetNodeId !== snapshot.selection.focusNodeId) throw new Error("Explorer task must match the visible Context Packet focus");
  if (!hasCapturedContent(capture.sourceContent)) throw new Error("搜索结果必须包含实际捕获的原文或摘录，不能只保存搜索摘要");
  if (!Number.isFinite(Date.parse(capture.requestedAt))) throw new Error("requestedAt must be a valid timestamp");
  const url = canonicalHttpUrl(capture.result.url);
  const logicalSourceId = `explorer-${stableHash(url)}`;
  const format = inferExplorerSourceFormat(url, capture.mediaType);
  return await ingestSourceIntoWorkspace({
    snapshot,
    request: {
      id: `ingest-${logicalSourceId}-${stableHash(capture.requestedAt)}`,
      projectId: snapshot.project.id,
      spaceId: snapshot.space.id,
      sourceId: logicalSourceId,
      inventoryKind: "document",
      title: capture.result.title.trim(),
      uri: url,
      format,
      mediaType: capture.mediaType ?? defaultExplorerMediaType(format),
      researchSourceKind: capture.result.sourceKind,
      requestedAt: capture.requestedAt
    },
    content: capture.sourceContent,
    parsers: input.parsers,
    rawStore: input.rawStore,
    parentNodeId: capture.task.targetNodeId
  });
}

/** Captures selected direct-search results, deduplicates actual bytes, then uses immutable source ingest. */
export async function captureExplorerSearchResults(input: {
  snapshot: KnowledgeWorkspaceSnapshot;
  task: ExplorerTask;
  provider: KnowledgeSearchProvider;
  results: readonly ExplorerSearchResult[];
  parsers: readonly SourceParser[];
  rawStore: RawSourceStore;
  requestedAt: string;
  maxAttempts?: number;
  timeoutMs?: number;
  retryDelayMs?: number;
  signal?: AbortSignal;
}): Promise<ExplorerBatchCaptureExecution> {
  if (!input.provider.capture) throw new Error(`Explorer provider ${input.provider.id} does not support page capture`);
  if (!Number.isFinite(Date.parse(input.requestedAt))) throw new Error("requestedAt must be a valid timestamp");
  if (input.task.targetNodeId !== input.snapshot.selection.focusNodeId) {
    throw new Error("Explorer task must match the visible Context Packet focus");
  }
  const maxAttempts = input.maxAttempts ?? 2;
  const timeoutMs = input.timeoutMs ?? 15_000;
  const retryDelayMs = input.retryDelayMs ?? 250;
  assertPositiveInteger(maxAttempts, "Explorer capture maxAttempts", 3);
  assertPositiveInteger(timeoutMs, "Explorer capture timeoutMs", 120_000);
  if (!Number.isInteger(retryDelayMs) || retryDelayMs < 0 || retryDelayMs > 10_000) {
    throw new Error("Explorer capture retryDelayMs must be an integer from 0 to 10000");
  }
  const selected = uniqueSearchResults(input.results);
  if (selected.length === 0) throw new Error("请至少选择一个搜索结果");
  if (selected.length > 10) throw new Error("Explorer 单次最多批量收录 10 个结果");

  let working = input.snapshot;
  const decisions: ExplorerCaptureDecision[] = [];
  for (const result of selected) {
    let captured: KnowledgeSearchCapture | undefined;
    let lastError = "页面正文抓取失败";
    let attempts = 0;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      attempts = attempt;
      try {
        captured = await invokeProviderWithTimeout(
          (signal) => input.provider.capture!({ result, signal }),
          input.signal,
          timeoutMs
        );
        if (!hasCapturedContent(captured.content)) throw new Error("Provider 未返回页面正文");
        break;
      } catch (error) {
        const classified = classifyExplorerProviderError(error, input.signal);
        lastError = classified.message;
        if (classified.status === "cancelled" || attempt >= maxAttempts) break;
        await waitForRetry(retryDelayMs, input.signal);
      }
    }
    if (!captured) {
      decisions.push({ result, reason: "capture_failed", detail: lastError, attempts });
      continue;
    }

    const contentHash = await sha256ContentHash(captured.content);
    const duplicate = working.knowledgeSourceAssets.find((source) => source.contentHash === contentHash);
    if (duplicate) {
      decisions.push({ result, reason: "duplicate_content", sourceId: duplicate.id, attempts });
      continue;
    }
    try {
      const ingest = await ingestExplorerSourceCapture({
        snapshot: working,
        capture: {
          task: input.task,
          result,
          sourceContent: captured.content,
          mediaType: captured.mediaType,
          requestedAt: input.requestedAt
        },
        parsers: input.parsers,
        rawStore: input.rawStore
      });
      if (ingest.ingest.status !== "parsed" || !ingest.ingest.source) {
        decisions.push({
          result,
          reason: "capture_failed",
          detail: ingest.ingest.error ?? `Source ingest returned ${ingest.ingest.status}`,
          attempts
        });
        continue;
      }
      working = ingest.snapshot;
      decisions.push({ result, reason: "ingested", sourceId: ingest.ingest.source.id, attempts });
    } catch (error) {
      decisions.push({
        result,
        reason: "capture_failed",
        detail: error instanceof Error ? error.message : String(error),
        attempts
      });
    }
  }
  return { snapshot: working, decisions };
}

export function proposeExplorerCandidates(
  snapshot: KnowledgeWorkspaceSnapshot,
  targetNodeId = snapshot.selection.focusNodeId
): KnowledgeWorkspaceSnapshot {
  if (snapshot.project.mode !== "systematize") throw new Error("Explorer policy is only available in a Systematize Project");
  if (!isProjectWritable(snapshot)) throw new Error("Project must be writable before exploring");
  if (snapshot.selection.focusNodeId !== targetNodeId) throw new Error("Explorer target must match the visible Context Packet focus");
  const target = requireTarget(snapshot, targetNodeId);
  if (snapshot.candidatePatches.some((patch) => patch.action === "explore" && patch.targetNodeId === target.id && patch.status === "pending_review")) {
    throw new Error("请先审核当前 Explorer 生成的 Candidate Graph Patch");
  }
  const plan = deriveExplorerPlan(snapshot);
  const sequence = snapshot.candidatePatches.filter((patch) => patch.action === "explore").length + 1;
  const baseId = `${target.id}-explore-${sequence}`;
  const nodes = [
    explorerNode(snapshot, target, `${baseId}-adjacent`, "question", `相邻领域：哪些方法可迁移到「${target.title}」？`, "需要比较相邻领域的方法、目标、约束和失效边界；类比尚未验证。", "adjacent_domain"),
    explorerNode(snapshot, target, `${baseId}-counterexample`, "hypothesis", `候选反例：当关键前提不成立时，「${target.title}」可能失效`, "这不是事实陈述；需要寻找失败案例、反对证据和适用范围，验证是否构成真正反例。", "counterexample"),
    explorerNode(snapshot, target, `${baseId}-verification`, "question", verificationQuestion(target, lintKnowledgeWorkspace(snapshot).issues), "回答必须同时处理支持与反对材料，并保留来源定位。", "verification")
  ];
  const operations: GraphPatchOperation[] = nodes.flatMap((node, index) => {
    const edge = createExplorerEdge(`${baseId}-edge-${index + 1}`, node.id, target.id, snapshot.graph.updatedAt);
    return [
      { kind: "create_node", node, audit: createGraphPatchAudit(`${node.id}-audit`, `Create a reviewable Explorer ${node.kind} for ${target.id}`, node.createdAt) },
      { kind: "create_edge", edge, audit: createGraphPatchAudit(`${edge.id}-audit`, "Attach the Explorer candidate to its visible target", edge.createdAt) }
    ];
  });
  const request: AgentRequest = {
    id: `agent-request-explore-${sequence}`,
    action: "explore",
    selectionId: snapshot.selection.id,
    prompt: plan.tasks.map((item) => `${item.label}: ${item.query}`).join("\n"),
    status: "proposed",
    createdAt: snapshot.graph.updatedAt
  };
  const patch: CandidateGraphPatch = {
    id: `graph-patch-explore-${sequence}`,
    requestId: request.id,
    action: "explore",
    targetNodeId: target.id,
    focusNodeId: target.id,
    title: `探索「${target.title}」的边界与反例`,
    summary: "提出相邻领域、候选反例和待验证问题；这些内容接受后仍保持待验证，不会伪装为已有事实。",
    revision: 1,
    createdBy: "agent",
    operations,
    confidence: 0.7,
    status: "pending_review",
    createdAt: snapshot.graph.updatedAt
  };
  return { ...snapshot, agentRequests: snapshot.agentRequests.concat(request), candidatePatches: snapshot.candidatePatches.concat(patch) };
}

function task(target: KnowledgeNode, kind: ExplorerTaskKind, label: string, query: string, rationale: string): ExplorerTask {
  return { id: `explorer-${target.id}-${kind}`, kind, label, query, rationale, targetNodeId: target.id };
}

function explorerNode(
  snapshot: KnowledgeWorkspaceSnapshot,
  target: KnowledgeNode,
  id: string,
  kind: "question" | "hypothesis",
  title: string,
  summary: string,
  taskKind: ExplorerTaskKind
): KnowledgeNode {
  return {
    id,
    kind,
    title,
    summary,
    status: "open",
    ...createKnowledgeMetadata({ kind, createdBy: "agent", creatorId: explorerPolicy.id, scopeContextId: snapshot.project.id }),
    depth: target.depth + 1,
    tags: ["Explorer", `探索类型:${taskKind}`, `探索目标:${target.id}`],
    sourceRefs: [],
    createdAt: snapshot.graph.updatedAt,
    updatedAt: snapshot.graph.updatedAt
  };
}

function createExplorerEdge(id: string, fromNodeId: string, toNodeId: string, createdAt: string): KnowledgeEdge {
  return {
    id,
    fromNodeId,
    toNodeId,
    kind: "related_to",
    rationale: "Explorer candidate awaiting evidence and user review",
    createdBy: "agent",
    confidence: 1,
    createdAt
  };
}

function verificationRationale(target: KnowledgeNode, diagnostic?: KnowledgeDiagnostic): string {
  if (!diagnostic) return `为「${target.title}」提出可证伪的问题，并定义需要观察的数据。`;
  return `针对“${diagnostic.title}”寻找支持与反对材料，并验证口径、时间和范围。`;
}

function verificationQuestion(target: KnowledgeNode, diagnostics: KnowledgeDiagnostic[]): string {
  const issue = diagnostics.find((candidate) => candidate.nodeIds.includes(target.id));
  if (issue?.kind === "outdated") return `当前版本的原始来源是否仍支持「${target.title}」？`;
  if (issue?.kind === "scope_ambiguity") return `在什么上下文与边界之外，「${target.title}」不再成立？`;
  if (issue?.kind === "conflict") return `哪些原始证据分别支持与反对「${target.title}」，口径是否一致？`;
  return `什么可观察证据能够支持或反驳「${target.title}」？`;
}

function requireTarget(snapshot: KnowledgeWorkspaceSnapshot, targetNodeId: string): KnowledgeNode {
  const target = snapshot.graph.nodes.find((node) => node.id === targetNodeId);
  if (!target || target.status === "archived") throw new Error(`Explorer target is unavailable: ${targetNodeId}`);
  return target;
}

const explorerSourceKindPriority: Record<SearchSourceKind, number> = {
  primary: 6,
  official: 5,
  peer_reviewed: 4,
  independent_secondary: 3,
  community: 2,
  other: 1
};

export function rankExplorerSearchResults(
  results: readonly KnowledgeSearchResult[],
  task: ExplorerTask,
  options: {
    limit?: number;
    existingSources?: ExplorerSearchOptions["existingSources"];
    filters?: ExplorerSearchFilters;
  } = {}
): ExplorerSearchResult[] {
  const limit = options.limit ?? 8;
  assertExplorerSearchLimit(limit);
  const existingByUrl = new Map<string, string>();
  for (const source of options.existingSources ?? []) {
    const url = tryCanonicalHttpUrl(source.uri);
    if (url) existingByUrl.set(url, source.id);
  }
  const queryTokens = normalizedSearchTokens(task.query);
  const candidates = results.flatMap((raw, index) => {
    const normalized = normalizeExplorerResult(raw, task, queryTokens, index, existingByUrl);
    return normalized ? [normalized] : [];
  });
  candidates.sort(compareExplorerResults);

  const seenVersions = new Set<string>();
  const deduplicated: ExplorerSearchResult[] = [];
  for (const candidate of candidates) {
    const versionIdentity = candidate.versionLabel
      ? normalizeVersionLabel(candidate.versionLabel)
      : candidate.canonicalUrl;
    const key = `${candidate.logicalUrl}\u0000${versionIdentity}`;
    if (seenVersions.has(key)) continue;
    seenVersions.add(key);
    deduplicated.push(candidate);
  }
  assignVersionStates(deduplicated);
  return filterExplorerSearchResults(deduplicated, options.filters).slice(0, limit);
}

export function filterExplorerSearchResults(
  results: readonly ExplorerSearchResult[],
  filters: ExplorerSearchFilters = {}
): ExplorerSearchResult[] {
  validateExplorerFilters(filters);
  return results.filter((result) => {
    const hostname = new URL(result.canonicalUrl).hostname;
    if (filters.domains?.length && !filters.domains.some((domain) => domainMatches(hostname, domain))) return false;
    if (filters.sourceKinds?.length && !filters.sourceKinds.includes(result.sourceKind)) return false;
    if (filters.publishedFrom && (!result.publishedAt || Date.parse(result.publishedAt) < Date.parse(filters.publishedFrom))) return false;
    if (filters.publishedTo && (!result.publishedAt || Date.parse(result.publishedAt) > Date.parse(filters.publishedTo))) return false;
    if (filters.latestVersionsOnly && result.versionState === "older") return false;
    if (filters.hideExisting && result.existingSourceId) return false;
    return true;
  });
}

function normalizeExplorerResult(
  raw: KnowledgeSearchResult,
  task: ExplorerTask,
  queryTokens: string[],
  providerIndex: number,
  existingByUrl: ReadonlyMap<string, string>
): ExplorerSearchResult | undefined {
  const title = raw.title.trim();
  const canonicalUrl = tryCanonicalHttpUrl(raw.url);
  if (!title || !canonicalUrl) return undefined;
  const logicalUrl = raw.logicalUrl ? tryCanonicalHttpUrl(raw.logicalUrl) : canonicalUrl;
  if (!logicalUrl) return undefined;
  if (raw.publishedAt && !Number.isFinite(Date.parse(raw.publishedAt))) return undefined;
  const sourceKind = raw.sourceKind && raw.sourceKind in explorerSourceKindPriority ? raw.sourceKind : "other";
  const snippet = raw.snippet?.trim() || undefined;
  const haystack = normalizeSearchText(`${title} ${snippet ?? ""} ${canonicalUrl}`);
  const matchedTokens = queryTokens.filter((token) => haystack.includes(token));
  const relevance = queryTokens.length === 0 ? 0 : matchedTokens.length / queryTokens.length;
  const providerRankBonus = Math.max(0, 12 - providerIndex);
  const relevanceScore = Math.min(100, Math.round(relevance * 58 + explorerSourceKindPriority[sourceKind] * 5 + providerRankBonus));
  const rankingReasons = [
    `${matchedTokens.length}/${queryTokens.length || 0} 个查询词匹配`,
    sourceKind === "primary" ? "原始来源" : sourceKind === "official" ? "官方来源" : sourceKind === "peer_reviewed" ? "同行评审来源" : "补充来源"
  ];
  if (raw.publishedAt) rankingReasons.push(`发布日期 ${raw.publishedAt.slice(0, 10)}`);
  const versionLabel = raw.versionLabel?.trim() || inferVersionLabel(title, canonicalUrl);
  return {
    ...raw,
    id: `explorer-result-${stableHash(`${task.id}\u0000${logicalUrl}\u0000${versionLabel ?? canonicalUrl}`)}`,
    title,
    url: canonicalUrl,
    canonicalUrl,
    logicalUrl,
    providerId: raw.providerId.trim() || "unknown-provider",
    sourceKind,
    language: raw.language?.trim().toLowerCase() || undefined,
    snippet,
    versionLabel,
    relevanceScore,
    rankingReasons,
    versionState: "single",
    existingSourceId: existingByUrl.get(canonicalUrl)
  };
}

function compareExplorerResults(left: ExplorerSearchResult, right: ExplorerSearchResult): number {
  return right.relevanceScore - left.relevanceScore
    || explorerSourceKindPriority[right.sourceKind] - explorerSourceKindPriority[left.sourceKind]
    || compareOptionalDates(right.publishedAt, left.publishedAt)
    || left.title.localeCompare(right.title)
    || left.canonicalUrl.localeCompare(right.canonicalUrl);
}

function assignVersionStates(results: ExplorerSearchResult[]): void {
  const groups = new Map<string, ExplorerSearchResult[]>();
  for (const result of results) {
    const group = groups.get(result.logicalUrl) ?? [];
    group.push(result);
    groups.set(result.logicalUrl, group);
  }
  for (const group of groups.values()) {
    if (group.length === 1) {
      group[0].versionState = "single";
      continue;
    }
    const sorted = [...group].sort(compareExplorerVersions);
    const hasVersionEvidence = sorted.some((result) => result.publishedAt || result.versionLabel);
    if (!hasVersionEvidence) {
      group.forEach((result) => { result.versionState = "unknown"; });
      continue;
    }
    sorted.forEach((result, index) => { result.versionState = index === 0 ? "latest" : "older"; });
  }
}

function compareExplorerVersions(left: ExplorerSearchResult, right: ExplorerSearchResult): number {
  const dateOrder = compareOptionalDates(right.publishedAt, left.publishedAt);
  if (dateOrder !== 0) return dateOrder;
  const leftVersion = numericVersion(left.versionLabel);
  const rightVersion = numericVersion(right.versionLabel);
  if (leftVersion && rightVersion) {
    const length = Math.max(leftVersion.length, rightVersion.length);
    for (let index = 0; index < length; index += 1) {
      const difference = (rightVersion[index] ?? 0) - (leftVersion[index] ?? 0);
      if (difference !== 0) return difference;
    }
  }
  return left.canonicalUrl.localeCompare(right.canonicalUrl);
}

function compareOptionalDates(left?: string, right?: string): number {
  if (left && right) return Date.parse(left) - Date.parse(right);
  if (left) return 1;
  if (right) return -1;
  return 0;
}

function normalizedSearchTokens(value: string): string[] {
  return Array.from(new Set(normalizeSearchText(value).split(" ").filter((token) => token.length >= 2)));
}

function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function inferVersionLabel(title: string, url: string): string | undefined {
  const text = `${title} ${decodeURIComponent(new URL(url).pathname)} ${new URL(url).searchParams.get("version") ?? ""} ${new URL(url).searchParams.get("v") ?? ""}`;
  return text.match(/\b(?:version|ver|rev|v)\s*([0-9]+(?:\.[0-9]+){0,3})\b/i)?.[1]
    ?? text.match(/\b(20\d{2}[-/.](?:0?[1-9]|1[0-2])(?:[-/.](?:0?[1-9]|[12]\d|3[01]))?)\b/)?.[1];
}

function normalizeVersionLabel(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function numericVersion(value?: string): number[] | undefined {
  const match = value?.match(/\d+(?:\.\d+)*/)?.[0];
  return match ? match.split(".").map(Number) : undefined;
}

function validateExplorerFilters(filters: ExplorerSearchFilters): void {
  for (const domain of filters.domains ?? []) {
    if (!domain.trim() || /[:/]/.test(domain)) throw new Error(`Explorer filter domain is invalid: ${domain}`);
  }
  for (const kind of filters.sourceKinds ?? []) {
    if (!(kind in explorerSourceKindPriority)) throw new Error(`Explorer source kind is invalid: ${kind}`);
  }
  for (const [label, value] of [["publishedFrom", filters.publishedFrom], ["publishedTo", filters.publishedTo]] as const) {
    if (value && !Number.isFinite(Date.parse(value))) throw new Error(`Explorer ${label} must be a valid timestamp`);
  }
}

function domainMatches(hostname: string, domain: string): boolean {
  const normalized = domain.trim().toLowerCase().replace(/^\.+|\.+$/g, "");
  return hostname === normalized || hostname.endsWith(`.${normalized}`);
}

function assertExplorerSearchLimit(value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > 20) throw new Error("Explorer search limit must be an integer from 1 to 20");
}

function assertPositiveInteger(value: number, label: string, maximum: number): void {
  if (!Number.isInteger(value) || value < 1 || value > maximum) throw new Error(`${label} must be an integer from 1 to ${maximum}`);
}

function unknownProviderDisclosure(providerId: string): KnowledgeSearchProviderDisclosure {
  return {
    privacyNotice: `${providerId} 将收到本次查询；不会发送 Knowledge Graph 或 Context Packet。`,
    costNotice: "Provider 未声明费用策略，请在搜索前确认。",
    sends: "query_only",
    pricing: "unknown"
  };
}

async function invokeProviderWithTimeout<T>(
  invoke: (signal: AbortSignal) => Promise<T>,
  externalSignal: AbortSignal | undefined,
  timeoutMs: number
): Promise<T> {
  if (externalSignal?.aborted) throw new ExplorerProviderCancelledError();
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let rejectGate: ((reason: Error) => void) | undefined;
  const gate = new Promise<never>((_resolve, reject) => { rejectGate = reject; });
  const onAbort = () => {
    controller.abort();
    rejectGate?.(new ExplorerProviderCancelledError());
  };
  externalSignal?.addEventListener("abort", onAbort, { once: true });
  timeoutId = setTimeout(() => {
    controller.abort();
    rejectGate?.(new ExplorerProviderTimeoutError(timeoutMs));
  }, timeoutMs);
  try {
    return await Promise.race([invoke(controller.signal), gate]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    externalSignal?.removeEventListener("abort", onAbort);
  }
}

function classifyExplorerProviderError(
  error: unknown,
  externalSignal?: AbortSignal
): { status: "failed" | "cancelled" | "timeout"; message: string } {
  if (externalSignal?.aborted || error instanceof ExplorerProviderCancelledError) {
    return { status: "cancelled", message: "Explorer 搜索已取消" };
  }
  if (error instanceof ExplorerProviderTimeoutError) {
    return { status: "timeout", message: error.message };
  }
  return { status: "failed", message: error instanceof Error ? error.message : String(error) };
}

async function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (delayMs === 0) return;
  await new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ExplorerProviderCancelledError());
      return;
    }
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(new ExplorerProviderCancelledError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

class ExplorerProviderTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Explorer Provider 在 ${timeoutMs}ms 内未响应，可重试或改用浏览器搜索`);
    this.name = "ExplorerProviderTimeoutError";
  }
}

class ExplorerProviderCancelledError extends Error {
  constructor() {
    super("Explorer search cancelled");
    this.name = "ExplorerProviderCancelledError";
  }
}

function hasCapturedContent(content: SourceParserInput["content"]): boolean {
  return typeof content === "string" ? Boolean(content.trim()) : content.byteLength > 0;
}

function inferExplorerSourceFormat(url: string, mediaType?: string): KnowledgeSourceFormat {
  return inferKnowledgeSourceFormat(new URL(url).pathname, mediaType ?? "");
}

function defaultExplorerMediaType(format: KnowledgeSourceFormat): string {
  if (format === "pdf") return "application/pdf";
  if (format === "markdown") return "text/markdown";
  return "text/plain";
}

function uniqueSearchResults(results: readonly ExplorerSearchResult[]): ExplorerSearchResult[] {
  const seen = new Set<string>();
  return results.filter((result) => {
    if (seen.has(result.id)) return false;
    seen.add(result.id);
    return true;
  });
}

function canonicalHttpUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`Explorer result URL must use HTTP(S): ${value}`);
  url.hash = "";
  for (const key of Array.from(url.searchParams.keys())) {
    if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
  }
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

function tryCanonicalHttpUrl(value: string): string | undefined {
  try {
    return canonicalHttpUrl(value);
  } catch {
    return undefined;
  }
}

function quoteQueryTerm(value: string): string {
  return `"${value.replace(/["\r\n]+/g, " ").trim()}"`;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
