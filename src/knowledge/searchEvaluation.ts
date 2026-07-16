import type { KnowledgeNode } from "../types";
import { scoreKnowledgeNodeLexically } from "./knowledgeGraphQuery";

export interface RankedKnowledgeSearchResult {
  nodeId: string;
  score: number;
}

export interface KnowledgeSearchRetriever {
  readonly id: string;
  search(query: string, limit: number): Promise<RankedKnowledgeSearchResult[]>;
}

export type SearchRelevanceGrade = 0 | 1 | 2 | 3;

export interface KnowledgeSearchEvaluationQuery {
  id: string;
  text: string;
  split: "calibration" | "evaluation";
  relevance: Record<string, SearchRelevanceGrade>;
}

export interface KnowledgeSearchQueryEvaluation {
  queryId: string;
  recallAtK: number;
  reciprocalRank: number;
  ndcgAtK: number;
  latencyMs: number;
  resultNodeIds: string[];
  relevantResultNodeIds: string[];
}

export interface KnowledgeSearchEvaluationReport {
  retrieverId: string;
  queryCount: number;
  k: number;
  recallAtK: number;
  mrrAtK: number;
  ndcgAtK: number;
  meanLatencyMs: number;
  p95LatencyMs: number;
  queries: KnowledgeSearchQueryEvaluation[];
}

export interface KnowledgeEmbeddingProvider {
  readonly id: string;
  embed(texts: readonly string[]): Promise<number[][]>;
}

export interface Bm25Options {
  k1?: number;
  b?: number;
  titleBoost?: number;
  tagBoost?: number;
}

export interface RrfHybridOptions {
  primaryWeight: number;
  secondaryWeight: number;
  candidateLimit?: number;
  rrfK?: number;
  id?: string;
}

export async function evaluateKnowledgeSearch(
  retriever: KnowledgeSearchRetriever,
  queries: readonly KnowledgeSearchEvaluationQuery[],
  k = 10
): Promise<KnowledgeSearchEvaluationReport> {
  requirePositiveInteger(k, "Evaluation k");
  if (queries.length === 0) throw new Error("Knowledge search evaluation requires at least one query");
  const seenQueryIds = new Set<string>();
  const details: KnowledgeSearchQueryEvaluation[] = [];
  for (const query of queries) {
    if (!query.id.trim() || seenQueryIds.has(query.id)) throw new Error(`Evaluation query id must be unique: ${query.id}`);
    if (!query.text.trim()) throw new Error(`Evaluation query ${query.id} must not be empty`);
    seenQueryIds.add(query.id);
    const relevantIds = Object.entries(query.relevance)
      .filter(([, grade]) => grade > 0)
      .map(([nodeId]) => nodeId);
    if (relevantIds.length === 0) throw new Error(`Evaluation query ${query.id} requires a positive relevance judgment`);
    const startedAt = performance.now();
    const results = await retriever.search(query.text, k);
    const latencyMs = performance.now() - startedAt;
    assertRankedResults(results, query.id, k);
    const resultNodeIds = results.map((result) => result.nodeId);
    const relevantResultNodeIds = resultNodeIds.filter((nodeId) => (query.relevance[nodeId] ?? 0) > 0);
    const firstRelevantRank = resultNodeIds.findIndex((nodeId) => (query.relevance[nodeId] ?? 0) > 0);
    details.push({
      queryId: query.id,
      recallAtK: relevantResultNodeIds.length / relevantIds.length,
      reciprocalRank: firstRelevantRank < 0 ? 0 : 1 / (firstRelevantRank + 1),
      ndcgAtK: normalizedDiscountedCumulativeGain(resultNodeIds, query.relevance, k),
      latencyMs,
      resultNodeIds,
      relevantResultNodeIds
    });
  }
  const latencies = details.map((detail) => detail.latencyMs).sort((left, right) => left - right);
  return {
    retrieverId: retriever.id,
    queryCount: details.length,
    k,
    recallAtK: mean(details.map((detail) => detail.recallAtK)),
    mrrAtK: mean(details.map((detail) => detail.reciprocalRank)),
    ndcgAtK: mean(details.map((detail) => detail.ndcgAtK)),
    meanLatencyMs: mean(latencies),
    p95LatencyMs: latencies[Math.max(0, Math.ceil(latencies.length * 0.95) - 1)],
    queries: details
  };
}

export function createProductionLexicalRetriever(
  nodes: readonly KnowledgeNode[]
): KnowledgeSearchRetriever {
  const canonicalNodes = nodes.slice();
  return {
    id: "production_lexical",
    async search(query, limit) {
      requirePositiveInteger(limit, "Lexical search limit");
      return canonicalNodes
        .map((node) => scoreKnowledgeNodeLexically(node, query))
        .filter((result): result is NonNullable<typeof result> => result !== undefined)
        .sort((left, right) => right.score - left.score || compareText(left.node.id, right.node.id))
        .slice(0, limit)
        .map((result) => ({ nodeId: result.node.id, score: result.score }));
    }
  };
}

export function createBm25Retriever(
  nodes: readonly KnowledgeNode[],
  options: Bm25Options = {}
): KnowledgeSearchRetriever {
  const k1 = options.k1 ?? 1.2;
  const b = options.b ?? 0.75;
  const titleBoost = options.titleBoost ?? 2;
  const tagBoost = options.tagBoost ?? 1.25;
  if (!Number.isFinite(k1) || k1 <= 0) throw new Error("BM25 k1 must be positive");
  if (!Number.isFinite(b) || b < 0 || b > 1) throw new Error("BM25 b must be between 0 and 1");
  if (!Number.isFinite(titleBoost) || titleBoost < 1 || !Number.isFinite(tagBoost) || tagBoost < 1) {
    throw new Error("BM25 field boosts must be at least 1");
  }
  const documents = nodes.map((node) => {
    const tokens = [
      ...repeat(tokenizeKnowledgeSearchText(node.title), titleBoost),
      ...repeat(tokenizeKnowledgeSearchText(node.tags.join(" ")), tagBoost),
      ...tokenizeKnowledgeSearchText(`${node.summary} ${node.kind.replaceAll("_", " ")} ${node.sourceRefs.map((ref) => ref.quote ?? "").join(" ")}`)
    ];
    return { nodeId: node.id, tokens, frequencies: frequencies(tokens) };
  });
  const averageLength = documents.length === 0
    ? 0
    : documents.reduce((total, document) => total + document.tokens.length, 0) / documents.length;
  const documentFrequency = new Map<string, number>();
  for (const document of documents) {
    for (const term of document.frequencies.keys()) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }
  return {
    id: "bm25",
    async search(query, limit) {
      requirePositiveInteger(limit, "BM25 search limit");
      const queryTerms = Array.from(new Set(tokenizeKnowledgeSearchText(query)));
      if (queryTerms.length === 0 || averageLength === 0) return [];
      return documents.map((document): RankedKnowledgeSearchResult => {
        let score = 0;
        for (const term of queryTerms) {
          const termFrequency = document.frequencies.get(term) ?? 0;
          if (termFrequency === 0) continue;
          const matchingDocuments = documentFrequency.get(term) ?? 0;
          const inverseDocumentFrequency = Math.log(1 + (documents.length - matchingDocuments + 0.5) / (matchingDocuments + 0.5));
          const lengthNormalization = termFrequency + k1 * (1 - b + b * document.tokens.length / averageLength);
          score += inverseDocumentFrequency * termFrequency * (k1 + 1) / lengthNormalization;
        }
        return { nodeId: document.nodeId, score };
      }).filter((result) => result.score > 0)
        .sort(compareRankedResults)
        .slice(0, limit);
    }
  };
}

export async function createEmbeddingRetriever(
  nodes: readonly KnowledgeNode[],
  provider: KnowledgeEmbeddingProvider
): Promise<KnowledgeSearchRetriever> {
  const texts = nodes.map(knowledgeNodeSearchText);
  const vectors = await provider.embed(texts);
  assertEmbeddingBatch(vectors, nodes.length, provider.id);
  const normalizedVectors = vectors.map(normalizeVector);
  return {
    id: `embedding:${provider.id}`,
    async search(query, limit) {
      requirePositiveInteger(limit, "Embedding search limit");
      if (!query.trim()) return [];
      const queryVectors = await provider.embed([query]);
      assertEmbeddingBatch(queryVectors, 1, provider.id);
      const queryVector = normalizeVector(queryVectors[0]);
      return nodes.map((node, index) => ({
        nodeId: node.id,
        score: dot(queryVector, normalizedVectors[index])
      })).sort(compareRankedResults).slice(0, limit);
    }
  };
}

/** Reciprocal Rank Fusion combines ranks, never incomparable raw scores. */
export function createRrfHybridRetriever(
  primary: KnowledgeSearchRetriever,
  secondary: KnowledgeSearchRetriever,
  options: RrfHybridOptions
): KnowledgeSearchRetriever {
  assertUnitWeight(options.primaryWeight, "RRF primaryWeight");
  assertUnitWeight(options.secondaryWeight, "RRF secondaryWeight");
  if (options.primaryWeight + options.secondaryWeight <= 0) throw new Error("RRF requires a positive total weight");
  const candidateLimit = options.candidateLimit ?? 50;
  const rrfK = options.rrfK ?? 60;
  requirePositiveInteger(candidateLimit, "RRF candidateLimit");
  requirePositiveInteger(rrfK, "RRF k");
  return {
    id: options.id ?? `rrf:${primary.id}:${secondary.id}:${options.primaryWeight}:${options.secondaryWeight}`,
    async search(query, limit) {
      requirePositiveInteger(limit, "RRF search limit");
      const fetchLimit = Math.max(limit, candidateLimit);
      const [primaryResults, secondaryResults] = await Promise.all([
        primary.search(query, fetchLimit),
        secondary.search(query, fetchLimit)
      ]);
      const scores = new Map<string, number>();
      addRrfScores(scores, primaryResults, options.primaryWeight, rrfK);
      addRrfScores(scores, secondaryResults, options.secondaryWeight, rrfK);
      return Array.from(scores, ([nodeId, score]) => ({ nodeId, score }))
        .sort(compareRankedResults)
        .slice(0, limit);
    }
  };
}

export function tokenizeKnowledgeSearchText(value: string): string[] {
  const normalized = value.normalize("NFKC").toLocaleLowerCase("en-US");
  return Array.from(normalized.matchAll(/[\p{Script=Han}]+|[\p{L}\p{N}]+/gu)).flatMap(([token]) => {
    if (!/^\p{Script=Han}+$/u.test(token)) return [token];
    const characters = Array.from(token);
    return characters.concat(characters.slice(0, -1).map((character, index) => character + characters[index + 1]));
  });
}

export function knowledgeNodeSearchText(node: KnowledgeNode): string {
  return [node.title, node.summary, node.tags.join(" "), node.kind.replaceAll("_", " "),
    node.sourceRefs.map((ref) => ref.quote ?? "").join(" ")].filter(Boolean).join("\n");
}

function normalizedDiscountedCumulativeGain(
  resultNodeIds: readonly string[],
  relevance: Record<string, SearchRelevanceGrade>,
  k: number
): number {
  const gains = resultNodeIds.slice(0, k).map((nodeId) => relevance[nodeId] ?? 0);
  const idealGains = Object.values(relevance).filter((grade) => grade > 0).sort((left, right) => right - left).slice(0, k);
  const ideal = discountedCumulativeGain(idealGains);
  return ideal === 0 ? 0 : discountedCumulativeGain(gains) / ideal;
}

function discountedCumulativeGain(grades: readonly number[]): number {
  return grades.reduce((total, grade, index) => total + (2 ** grade - 1) / Math.log2(index + 2), 0);
}

function addRrfScores(
  scores: Map<string, number>,
  results: readonly RankedKnowledgeSearchResult[],
  weight: number,
  rrfK: number
): void {
  results.forEach((result, index) => scores.set(
    result.nodeId,
    (scores.get(result.nodeId) ?? 0) + weight / (rrfK + index + 1)
  ));
}

function assertRankedResults(results: readonly RankedKnowledgeSearchResult[], queryId: string, limit: number): void {
  if (results.length > limit) throw new Error(`Retriever returned too many results for ${queryId}`);
  const ids = new Set<string>();
  for (const result of results) {
    if (!result.nodeId.trim() || ids.has(result.nodeId) || !Number.isFinite(result.score)) {
      throw new Error(`Retriever returned an invalid result for ${queryId}`);
    }
    ids.add(result.nodeId);
  }
}

function assertEmbeddingBatch(vectors: readonly number[][], expectedLength: number, providerId: string): void {
  if (vectors.length !== expectedLength) throw new Error(`Embedding provider ${providerId} returned the wrong batch length`);
  const dimension = vectors[0]?.length ?? 0;
  if (dimension === 0 || vectors.some((vector) => vector.length !== dimension
    || vector.some((value) => !Number.isFinite(value)))) {
    throw new Error(`Embedding provider ${providerId} returned invalid vectors`);
  }
}

function normalizeVector(vector: readonly number[]): number[] {
  const magnitude = Math.sqrt(dot(vector, vector));
  if (magnitude === 0) throw new Error("Embedding vectors must not have zero magnitude");
  return vector.map((value) => value / magnitude);
}

function dot(left: readonly number[], right: readonly number[]): number {
  if (left.length !== right.length) throw new Error("Embedding dimensions must match");
  return left.reduce((total, value, index) => total + value * right[index], 0);
}

function repeat(tokens: readonly string[], boost: number): string[] {
  const copies = Math.max(1, Math.round(boost));
  return Array.from({ length: copies }, () => tokens).flat();
}

function frequencies(tokens: readonly string[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const token of tokens) result.set(token, (result.get(token) ?? 0) + 1);
  return result;
}

function mean(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function assertUnitWeight(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${label} must be between 0 and 1`);
}

function requirePositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`);
}

function compareRankedResults(left: RankedKnowledgeSearchResult, right: RankedKnowledgeSearchResult): number {
  return right.score - left.score || compareText(left.nodeId, right.nodeId);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
