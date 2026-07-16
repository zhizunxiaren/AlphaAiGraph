// @vitest-environment node

import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { expect, test } from "vitest";
import type { KnowledgeNode } from "../types";
import {
  createBm25Retriever,
  createEmbeddingRetriever,
  createProductionLexicalRetriever,
  createRrfHybridRetriever,
  evaluateKnowledgeSearch,
  type KnowledgeEmbeddingProvider,
  type KnowledgeSearchEvaluationQuery,
  type KnowledgeSearchEvaluationReport
} from "./searchEvaluation";

const projectRoot = resolve(import.meta.dirname, "../..");
const embeddingModelId = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
const embeddingModelRevision = "2c4055b12046f11709e9df2c122e59ffbdc2f900";
const runEmbeddingBenchmark = process.env.RUN_SEARCH_BENCHMARK === "1";

test("builds a 300+ node benchmark from real repository specifications with explicit judgments", () => {
  const benchmark = buildRepositoryBenchmark();

  expect(benchmark.files.length).toBeGreaterThanOrEqual(7);
  expect(benchmark.nodes.length).toBeGreaterThanOrEqual(300);
  expect(benchmark.queries).toHaveLength(15);
  expect(benchmark.queries.filter((query) => query.split === "calibration")).toHaveLength(7);
  expect(benchmark.queries.every((query) => Object.values(query.relevance).some((grade) => grade > 0))).toBe(true);
});

test.skipIf(!runEmbeddingBenchmark)("compares lexical, BM25, multilingual embedding and calibrated hybrid retrieval", async () => {
  const benchmark = buildRepositoryBenchmark();
  const { pipeline } = await import("@huggingface/transformers");
  const modelStartedAt = performance.now();
  const extractor = await pipeline("feature-extraction", embeddingModelId, {
    dtype: "q8",
    revision: embeddingModelRevision
  });
  const modelLoadMs = performance.now() - modelStartedAt;
  const provider: KnowledgeEmbeddingProvider = {
    id: `${embeddingModelId}:q8:mean-normalized`,
    async embed(texts) {
      const vectors: number[][] = [];
      for (let index = 0; index < texts.length; index += 16) {
        const batch = texts.slice(index, index + 16);
        const tensor = await extractor(batch, { pooling: "mean", normalize: true });
        vectors.push(...tensor.tolist() as number[][]);
      }
      return vectors;
    }
  };
  const lexical = createProductionLexicalRetriever(benchmark.nodes);
  const bm25 = createBm25Retriever(benchmark.nodes);
  const embeddingStartedAt = performance.now();
  const embedding = await createEmbeddingRetriever(benchmark.nodes, provider);
  const embeddingIndexBuildMs = performance.now() - embeddingStartedAt;
  const calibrationQueries = benchmark.queries.filter((query) => query.split === "calibration");
  const evaluationQueries = benchmark.queries.filter((query) => query.split === "evaluation");
  const hybridCandidates: Array<{
    bm25Weight: number;
    retriever: ReturnType<typeof createRrfHybridRetriever>;
    report: KnowledgeSearchEvaluationReport;
  }> = [];
  for (const bm25Weight of [0.25, 0.5, 0.75]) {
    const retriever = createRrfHybridRetriever(bm25, embedding, {
      primaryWeight: bm25Weight,
      secondaryWeight: 1 - bm25Weight,
      id: `hybrid_bm25_${bm25Weight}_embedding_${1 - bm25Weight}`
    });
    hybridCandidates.push({
      bm25Weight,
      retriever,
      report: await evaluateKnowledgeSearch(retriever, calibrationQueries, 10)
    });
  }
  hybridCandidates.sort((left, right) =>
    right.report.ndcgAtK - left.report.ndcgAtK
    || right.report.mrrAtK - left.report.mrrAtK
    || right.report.recallAtK - left.report.recallAtK
    || left.bm25Weight - right.bm25Weight);
  const selectedHybrid = hybridCandidates[0];
  const lexicalReport = await evaluateKnowledgeSearch(lexical, evaluationQueries, 10);
  const bm25Report = await evaluateKnowledgeSearch(bm25, evaluationQueries, 10);
  const embeddingReport = await evaluateKnowledgeSearch(embedding, evaluationQueries, 10);
  const hybridReport = await evaluateKnowledgeSearch(selectedHybrid.retriever, evaluationQueries, 10);
  const bm25MaterialGain = bm25Report.ndcgAtK >= lexicalReport.ndcgAtK + 0.05
    || bm25Report.recallAtK >= lexicalReport.recallAtK + 0.1;
  const hybridMaterialGainOverBm25 = hybridReport.ndcgAtK >= bm25Report.ndcgAtK + 0.05
    || hybridReport.recallAtK >= bm25Report.recallAtK + 0.1;
  const bm25InteractiveLatency = bm25Report.p95LatencyMs <= 100;
  const hybridInteractiveLatency = hybridReport.p95LatencyMs <= 250;
  const output = {
    generatedAt: new Date().toISOString(),
    corpus: { fileCount: benchmark.files.length, nodeCount: benchmark.nodes.length },
    querySet: { calibration: calibrationQueries.length, evaluation: evaluationQueries.length, k: 10 },
    embedding: {
      runtime: "@huggingface/transformers@4.2.0",
      model: embeddingModelId,
      revision: embeddingModelRevision,
      dtype: "q8",
      pooling: "mean",
      normalized: true,
      modelLoadMs,
      indexBuildMs: embeddingIndexBuildMs
    },
    calibration: hybridCandidates.map((candidate) => ({
      bm25Weight: candidate.bm25Weight,
      metrics: compactMetrics(candidate.report)
    })),
    selectedHybrid: {
      bm25Weight: selectedHybrid.bm25Weight,
      embeddingWeight: 1 - selectedHybrid.bm25Weight
    },
    evaluation: {
      lexical: compactReport(lexicalReport),
      bm25: compactReport(bm25Report),
      embedding: compactReport(embeddingReport),
      hybrid: compactReport(hybridReport)
    },
    decision: {
      bm25MaterialGain,
      bm25InteractiveLatency,
      hybridMaterialGainOverBm25,
      hybridInteractiveLatency,
      recommendation: bm25MaterialGain && bm25InteractiveLatency
        ? hybridMaterialGainOverBm25 && hybridInteractiveLatency
          ? "evaluate_bm25_embedding_hybrid_product_integration"
          : "plan_bm25_integration_and_defer_embedding_hybrid"
        : "keep_lexical_default_and_collect_more_judgments"
    }
  };
  console.log(`SEARCH_BENCHMARK_RESULT=${JSON.stringify(output)}`);

  expect(hybridReport.queryCount).toBe(evaluationQueries.length);
  expect(Number.isFinite(hybridReport.ndcgAtK)).toBe(true);
  await extractor.dispose();
});

interface BenchmarkSection {
  path: string;
  heading: string;
  headingPath: string[];
  line: number;
  content: string;
}

interface RelevanceRule {
  pathEndsWith: string;
  headingIncludes: string;
  grade: 1 | 2 | 3;
}

interface QueryDraft {
  id: string;
  text: string;
  split: "calibration" | "evaluation";
  rules: RelevanceRule[];
}

function buildRepositoryBenchmark() {
  const files = markdownFiles(resolve(projectRoot, "docs"));
  const sections = files.flatMap(parseMarkdownSections);
  const nodes = sections.flatMap(sectionNodes);
  const queries = queryDrafts.map((draft): KnowledgeSearchEvaluationQuery => ({
    id: draft.id,
    text: draft.text,
    split: draft.split,
    relevance: resolveRelevance(nodes, draft)
  }));
  return { files, nodes, queries };
}

function markdownFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? markdownFiles(path) : entry.isFile() && entry.name.endsWith(".md") ? [path] : [];
  }).sort(compareText);
}

function parseMarkdownSections(path: string): BenchmarkSection[] {
  const projectPath = relative(projectRoot, path).replaceAll("\\", "/");
  const lines = readFileSync(path, "utf8").replaceAll("\r\n", "\n").split("\n");
  const sections: BenchmarkSection[] = [];
  const stack: Array<{ depth: number; title: string }> = [];
  let current: Omit<BenchmarkSection, "content"> & { contentLines: string[] } | undefined;
  const publish = () => {
    if (!current) return;
    sections.push({
      path: current.path,
      heading: current.heading,
      headingPath: current.headingPath,
      line: current.line,
      content: cleanMarkdown(current.contentLines.join("\n"))
    });
  };
  lines.forEach((line, index) => {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (!match) {
      current?.contentLines.push(line);
      return;
    }
    publish();
    const depth = match[1].length;
    const heading = match[2].replace(/\s+#+$/, "").trim();
    while (stack.length > 0 && stack.at(-1)!.depth >= depth) stack.pop();
    stack.push({ depth, title: heading });
    current = {
      path: projectPath,
      heading,
      headingPath: stack.map((item) => item.title),
      line: index + 1,
      contentLines: []
    };
  });
  publish();
  return sections;
}

function sectionNodes(section: BenchmarkSection): KnowledgeNode[] {
  const chunks = chunkText(section.content || section.headingPath.join(" / "), 360);
  return chunks.map((content, index): KnowledgeNode => {
    const id = `${section.path}:L${section.line}:P${index + 1}`;
    return {
      id,
      kind: "topic",
      title: chunks.length === 1 ? section.heading : `${section.heading} · ${index + 1}`,
      summary: content,
      status: "understood",
      epistemicStatus: "user_asserted",
      scope: { kind: "project", description: "Repository search benchmark", contextIds: ["project-search-evaluation"] },
      temporalValidity: { status: "current", observedAt: "2026-07-15T00:00:00.000Z" },
      sourceStatus: "linked",
      depth: section.headingPath.length - 1,
      tags: [`source:${section.path}`, ...section.headingPath.slice(0, -1)],
      sourceRefs: [{
        sourceId: section.path,
        locator: `${section.path}:L${section.line}`,
        quote: content.slice(0, 280)
      }],
      createdBy: "user",
      creatorId: "repository-search-benchmark",
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:00:00.000Z"
    };
  });
}

function chunkText(value: string, maxLength: number): string[] {
  const paragraphs = value.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  if (paragraphs.length === 0) return [value.trim()];
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > maxLength) {
      chunks.push(current);
      current = "";
    }
    if (paragraph.length <= maxLength) {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
      continue;
    }
    if (current) chunks.push(current);
    for (let index = 0; index < paragraph.length; index += maxLength) {
      chunks.push(paragraph.slice(index, index + maxLength));
    }
    current = "";
  }
  if (current) chunks.push(current);
  return chunks;
}

function cleanMarkdown(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/^```[^\n]*|```$/g, ""))
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveRelevance(nodes: readonly KnowledgeNode[], draft: QueryDraft): Record<string, 1 | 2 | 3> {
  const relevance: Record<string, 1 | 2 | 3> = {};
  for (const rule of draft.rules) {
    const matches = nodes.filter((node) => node.tags.includes(`source:${rule.pathEndsWith}`)
      && node.title.includes(rule.headingIncludes));
    if (matches.length === 0) throw new Error(`Query ${draft.id} judgment did not match ${rule.pathEndsWith} / ${rule.headingIncludes}`);
    matches.forEach((node) => { relevance[node.id] = Math.max(relevance[node.id] ?? 0, rule.grade) as 1 | 2 | 3; });
  }
  return relevance;
}

function compactMetrics(report: KnowledgeSearchEvaluationReport) {
  return {
    recallAt10: round(report.recallAtK),
    mrrAt10: round(report.mrrAtK),
    ndcgAt10: round(report.ndcgAtK),
    meanLatencyMs: round(report.meanLatencyMs),
    p95LatencyMs: round(report.p95LatencyMs)
  };
}

function compactReport(report: KnowledgeSearchEvaluationReport) {
  return {
    ...compactMetrics(report),
    queries: report.queries.map((query) => ({
      id: query.queryId,
      recallAt10: round(query.recallAtK),
      reciprocalRank: round(query.reciprocalRank),
      ndcgAt10: round(query.ndcgAtK),
      top3: query.resultNodeIds.slice(0, 3)
    }))
  };
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

const philosophy = "docs/superpowers/specs/2026-07-13-alpha-ai-graph-product-philosophy.md";
const routeSystem = "docs/superpowers/specs/2026-07-13-alpha-ai-graph-knowledge-route-system.md";
const uiDesign = "docs/superpowers/specs/2026-05-13-alpha-ai-graph-ui-design.md";
const cockpit = "docs/superpowers/specs/2026-05-11-alpha-ai-graph-research-cockpit-ux-design.md";
const productAnalysis = "docs/product-research/2026-07-13-ponder-ing-product-analysis.md";
const alignment = "docs/superpowers/specs/2026-07-14-alpha-ai-graph-project-model-alignment.md";

const queryDrafts: QueryDraft[] = [
  {
    id: "govern-user-conclusions",
    text: "为什么不能让 AI 自动覆盖用户已经确认的知识和结论？",
    split: "calibration",
    rules: [
      { pathEndsWith: philosophy, headingIncludes: "不静默改变用户知识和结论", grade: 3 },
      { pathEndsWith: philosophy, headingIncludes: "Agent 角色与治理", grade: 2 },
      { pathEndsWith: productAnalysis, headingIncludes: "Agent 输出的治理不足", grade: 2 }
    ]
  },
  {
    id: "conclusion-from-facts",
    text: "怎样从事实和推理逐步形成可追溯的可信研究结论？",
    split: "calibration",
    rules: [
      { pathEndsWith: philosophy, headingIncludes: "结论结构", grade: 3 },
      { pathEndsWith: philosophy, headingIncludes: "验证要求", grade: 2 }
    ]
  },
  {
    id: "responsive-workspace",
    text: "手机和窄屏上研究工作台应该怎样重新排布？",
    split: "calibration",
    rules: [
      { pathEndsWith: uiDesign, headingIncludes: "响应式设计", grade: 3 },
      { pathEndsWith: cockpit, headingIncludes: "布局", grade: 2 }
    ]
  },
  {
    id: "visible-node-context",
    text: "用户选中一个节点后，Agent 应该读取哪些可见上下文？",
    split: "calibration",
    rules: [
      { pathEndsWith: productAnalysis, headingIncludes: "节点选择即上下文", grade: 3 },
      { pathEndsWith: routeSystem, headingIncludes: "核心领域模型", grade: 2 }
    ]
  },
  {
    id: "progressive-map",
    text: "为什么第一张知识图不应该一次生成全部细节？",
    split: "calibration",
    rules: [
      { pathEndsWith: philosophy, headingIncludes: "渐进展开", grade: 3 },
      { pathEndsWith: routeSystem, headingIncludes: "根本判断", grade: 2 }
    ]
  },
  {
    id: "source-traceability",
    text: "知识结论怎样保留原始资料定位并可追溯？",
    split: "calibration",
    rules: [
      { pathEndsWith: productAnalysis, headingIncludes: "来源与可追溯性", grade: 3 },
      { pathEndsWith: routeSystem, headingIncludes: "核心领域模型", grade: 2 }
    ]
  },
  {
    id: "correct-old-knowledge",
    text: "系统如何纠正用户旧认知同时保留历史和影响范围？",
    split: "calibration",
    rules: [
      { pathEndsWith: philosophy, headingIncludes: "纠偏是核心能力", grade: 3 },
      { pathEndsWith: philosophy, headingIncludes: "纠偏影响分析", grade: 3 }
    ]
  },
  {
    id: "parallel-review-isolation",
    text: "多个 Agent 并行产生的结果为什么不能直接自动合并？",
    split: "evaluation",
    rules: [
      { pathEndsWith: uiDesign, headingIncludes: "并行结果默认隔离", grade: 3 },
      { pathEndsWith: uiDesign, headingIncludes: "候选结果设计", grade: 2 },
      { pathEndsWith: cockpit, headingIncludes: "审核候选结果", grade: 1 }
    ]
  },
  {
    id: "route-constraints-options",
    text: "Research 技术路线怎样表达目标、约束、候选方案和最终决策？",
    split: "evaluation",
    rules: [
      { pathEndsWith: routeSystem, headingIncludes: "技术路线", grade: 3 },
      { pathEndsWith: routeSystem, headingIncludes: "主交互闭环", grade: 2 }
    ]
  },
  {
    id: "insufficient-evidence",
    text: "现有证据无法支撑判断时，研究应该输出什么有效结果？",
    split: "evaluation",
    rules: [
      { pathEndsWith: philosophy, headingIncludes: "结论结构", grade: 3 },
      { pathEndsWith: philosophy, headingIncludes: "验证要求", grade: 2 }
    ]
  },
  {
    id: "obsidian-wiki",
    text: "如何把同一知识图谱映射为 Obsidian 可读的 Markdown wiki？",
    split: "evaluation",
    rules: [
      { pathEndsWith: routeSystem, headingIncludes: "LLM Wiki 对齐", grade: 3 },
      { pathEndsWith: routeSystem, headingIncludes: "知识网络", grade: 1 }
    ]
  },
  {
    id: "project-reopen",
    text: "Project 完成关闭后，怎样保留历史并重新打开继续工作？",
    split: "evaluation",
    rules: [
      { pathEndsWith: alignment, headingIncludes: "Contract 约束", grade: 3 },
      { pathEndsWith: philosophy, headingIncludes: "三类 Project 的流转", grade: 2 }
    ]
  },
  {
    id: "conflict-and-expiry",
    text: "怎样发现知识体系中的矛盾、过期内容和失效来源？",
    split: "evaluation",
    rules: [
      { pathEndsWith: philosophy, headingIncludes: "纠偏是核心能力", grade: 2 },
      { pathEndsWith: routeSystem, headingIncludes: "知识网络", grade: 2 }
    ]
  },
  {
    id: "side-inquiry",
    text: "研究过程中临时冒出的问题如何旁路探索而不污染主线？",
    split: "evaluation",
    rules: [
      { pathEndsWith: uiDesign, headingIncludes: "旁路临时会话设计", grade: 3 },
      { pathEndsWith: cockpit, headingIncludes: "旁路提问", grade: 3 }
    ]
  },
  {
    id: "evidence-near-decision",
    text: "界面怎样让证据和它支持的决策保持在视觉上接近？",
    split: "evaluation",
    rules: [
      { pathEndsWith: uiDesign, headingIncludes: "证据靠近决策", grade: 3 },
      { pathEndsWith: routeSystem, headingIncludes: "技术路线", grade: 2 }
    ]
  }
];
