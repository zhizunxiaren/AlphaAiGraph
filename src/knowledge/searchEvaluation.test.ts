// @vitest-environment node

import { expect, test } from "vitest";
import type { KnowledgeNode } from "../types";
import {
  createBm25Retriever,
  createEmbeddingRetriever,
  createProductionLexicalRetriever,
  createRrfHybridRetriever,
  evaluateKnowledgeSearch,
  tokenizeKnowledgeSearchText,
  type KnowledgeEmbeddingProvider,
  type KnowledgeSearchRetriever
} from "./searchEvaluation";

test("evaluates recall, reciprocal rank and graded nDCG from explicit judgments", async () => {
  const retriever = fixedRetriever("fixed", [
    { nodeId: "irrelevant", score: 3 },
    { nodeId: "relevant-secondary", score: 2 },
    { nodeId: "relevant-primary", score: 1 }
  ]);
  const report = await evaluateKnowledgeSearch(retriever, [{
    id: "q1",
    text: "query",
    split: "evaluation",
    relevance: { "relevant-primary": 3, "relevant-secondary": 1 }
  }], 3);

  expect(report.recallAtK).toBe(1);
  expect(report.mrrAtK).toBe(0.5);
  expect(report.ndcgAtK).toBeGreaterThan(0.5);
  expect(report.ndcgAtK).toBeLessThan(1);
  expect(report.queries[0].relevantResultNodeIds).toEqual(["relevant-secondary", "relevant-primary"]);
});

test("uses the production lexical scorer as the evaluation baseline", async () => {
  const nodes = [
    node("summary", "Resilience", "Every dependency needs a retry budget."),
    node("title", "Retry Budget", "Exact title."),
    node("other", "Circuit breaker", "Stop repeated failures.")
  ];
  const results = await createProductionLexicalRetriever(nodes).search("Retry Budget", 3);

  expect(results.map((result) => result.nodeId)).toEqual(["title", "summary"]);
});

test("ranks rare terms with deterministic BM25 regardless of input order", async () => {
  const nodes = [
    node("common", "Agent graph", "agent graph graph workflow"),
    node("rare", "Immutable provenance", "source locator audit anchor"),
    node("mixed", "Graph provenance", "graph source")
  ];
  const forward = await createBm25Retriever(nodes).search("immutable provenance locator", 3);
  const reverse = await createBm25Retriever(nodes.slice().reverse()).search("immutable provenance locator", 3);

  expect(forward[0].nodeId).toBe("rare");
  expect(reverse).toEqual(forward);
});

test("evaluates a real embedding boundary without treating lexical hashes as vectors", async () => {
  const provider: KnowledgeEmbeddingProvider = {
    id: "semantic-test-provider",
    async embed(texts) {
      return texts.map((text) => {
        const normalized = text.toLowerCase();
        if (/cat|feline|kitten/.test(normalized)) return [1, 0, 0];
        if (/dog|canine|puppy/.test(normalized)) return [0, 1, 0];
        return [0, 0, 1];
      });
    }
  };
  const retriever = await createEmbeddingRetriever([
    node("cat", "Feline care", "Nutrition for cats."),
    node("dog", "Canine care", "Exercise for dogs.")
  ], provider);

  expect((await retriever.search("kitten health", 2))[0].nodeId).toBe("cat");
});

test("combines incomparable retriever scores through weighted reciprocal ranks", async () => {
  const lexical = fixedRetriever("lexical", [
    { nodeId: "lexical-first", score: 1_000 },
    { nodeId: "shared", score: 1 }
  ]);
  const semantic = fixedRetriever("semantic", [
    { nodeId: "semantic-first", score: 0.99 },
    { nodeId: "shared", score: 0.98 }
  ]);
  const hybrid = createRrfHybridRetriever(lexical, semantic, {
    primaryWeight: 0.5,
    secondaryWeight: 0.5,
    rrfK: 60
  });

  expect((await hybrid.search("query", 3))[0].nodeId).toBe("shared");
});

test("tokenizes bilingual text deterministically and validates evaluation input", async () => {
  expect(tokenizeKnowledgeSearchText("Graph 图谱治理")).toEqual([
    "graph", "图", "谱", "治", "理", "图谱", "谱治", "治理"
  ]);
  await expect(evaluateKnowledgeSearch(fixedRetriever("empty", []), [{
    id: "q1",
    text: "query",
    split: "evaluation",
    relevance: {}
  }])).rejects.toThrow("positive relevance judgment");
});

function fixedRetriever(
  id: string,
  results: Array<{ nodeId: string; score: number }>
): KnowledgeSearchRetriever {
  return { id, async search(_query, limit) { return results.slice(0, limit); } };
}

function node(id: string, title: string, summary: string): KnowledgeNode {
  return {
    id,
    kind: "concept",
    title,
    summary,
    status: "understood",
    epistemicStatus: "user_asserted",
    scope: { kind: "project", description: "Evaluation fixture", contextIds: ["project-evaluation"] },
    temporalValidity: { status: "timeless" },
    sourceStatus: "not_applicable",
    depth: 1,
    tags: [],
    sourceRefs: [],
    createdBy: "user",
    creatorId: "search-evaluation-test",
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z"
  };
}
