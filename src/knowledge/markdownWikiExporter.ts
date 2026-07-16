import type {
  KnowledgeEdge,
  KnowledgeNode,
  KnowledgeSourceAsset,
  KnowledgeWorkspaceSnapshot,
  SourceAnchor
} from "../types";
import { epistemicStatusLabels, sourceStatusLabels } from "./knowledgeMetadata";
import { knowledgeNodeKindLabels } from "./knowledgeNodeKinds";
import { deriveKnowledgeWorkspaceInsights } from "./knowledgeInsights";
import { formatSourceLocator } from "./sourceOutline";
import { knowledgeNodesInScope } from "./knowledgeGraphQuery";

export const markdownWikiExportVersion = 1 as const;

export interface MarkdownWikiExport {
  version: typeof markdownWikiExportVersion;
  fileName: string;
  mediaType: "text/markdown;charset=utf-8";
  content: string;
}

export interface MarkdownDownloadEnvironment {
  document: Pick<Document, "createElement" | "body">;
  url: Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;
}

export function exportKnowledgeWorkspaceToMarkdown(
  snapshot: KnowledgeWorkspaceSnapshot
): MarkdownWikiExport {
  const nodes = projectNodes(snapshot);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges = snapshot.graph.edges
    .filter((edge) => nodeById.has(edge.fromNodeId) && nodeById.has(edge.toNodeId))
    .slice()
    .sort(compareEdges);
  const containsByParent = new Map<string, KnowledgeNode[]>();
  for (const edge of edges.filter((edge) => edge.kind === "contains")) {
    const children = containsByParent.get(edge.fromNodeId) ?? [];
    children.push(nodeById.get(edge.toNodeId)!);
    containsByParent.set(edge.fromNodeId, children);
  }
  for (const children of containsByParent.values()) children.sort(compareNodes);
  const sourceById = new Map(snapshot.knowledgeSourceAssets.map((source) => [source.id, source]));
  const anchorById = new Map(snapshot.sourceAnchors.map((anchor) => [anchor.id, anchor]));
  const insights = deriveKnowledgeWorkspaceInsights(snapshot);
  const lines: string[] = [
    "---",
    `alphaAiGraphExportVersion: ${markdownWikiExportVersion}`,
    `projectId: ${yamlString(snapshot.project.id)}`,
    `graphId: ${yamlString(snapshot.graph.id)}`,
    `projectMode: ${yamlString(snapshot.project.mode)}`,
    `projectStatus: ${yamlString(snapshot.project.status)}`,
    `graphUpdatedAt: ${yamlString(snapshot.graph.updatedAt)}`,
    "---",
    "",
    `# ${heading(snapshot.project.title)}`,
    "",
    snapshot.project.goal,
    "",
    `- **Project 状态**：${inline(snapshot.project.status)} / ${inline(snapshot.project.workflow.phase)}`,
    `- **知识图谱**：${inline(snapshot.graph.title)}（${inline(snapshot.graph.id)}）`,
    `- **认知对象**：${inline(snapshot.project.subject.title)}（${inline(snapshot.project.subject.kind)}）`,
    `- **结构范围**：${nodes.length} 个节点，最深 ${insights.scope.maxDepth} 层，${insights.scope.sourceBackedNodeCount} 个节点带来源`,
    "",
    "## 完成条件",
    "",
    ...bulletList(snapshot.project.completionCriteria),
    "",
    "## 理解范围与未解决问题",
    "",
    `> ${insights.scope.hint}`,
    "",
    `- 结构探索覆盖：${insights.scope.explorationCoveragePercent}%（不代表结论完整度）`,
    `- 派生知识缺口：${insights.gaps.length}`,
    `- 未解决问题：${insights.unresolvedQuestions.length}`,
    ""
  ];
  if (insights.unresolvedQuestions.length > 0) {
    lines.push(...insights.unresolvedQuestions.map((question) =>
      `- ${inline(question.title)} — ${question.state === "candidate_answer" ? "已有候选回答，尚未确认理解" : "尚无候选回答"}`
    ), "");
  }
  lines.push("## Knowledge Map", "");

  const visited = new Set<string>();
  const root = nodeById.get(snapshot.project.subject.rootNodeId);
  if (root) appendNodeTree(lines, root, 3, visited, containsByParent, edges, nodeById, sourceById, anchorById);
  const unvisited = nodes.filter((node) => !visited.has(node.id)).sort(compareNodes);
  if (unvisited.length > 0) {
    lines.push("## 关联知识", "");
    for (const node of unvisited) {
      if (!visited.has(node.id)) appendNodeTree(lines, node, 3, visited, containsByParent, edges, nodeById, sourceById, anchorById);
    }
  }

  lines.push("## 关系索引", "");
  if (edges.length === 0) {
    lines.push("- 无", "");
  } else {
    lines.push(...edges.map((edge) => {
      const from = nodeById.get(edge.fromNodeId)!;
      const to = nodeById.get(edge.toNodeId)!;
      const rationale = edge.rationale ? ` — ${inline(edge.rationale)}` : "";
      return `- ${inline(from.title)} \`${edge.kind}\` → ${inline(to.title)}（${inline(edge.id)}，confidence ${formatConfidence(edge.confidence)}）${rationale}`;
    }), "");
  }

  const sources = referencedSources(snapshot, nodes, sourceById);
  lines.push("## 来源索引", "");
  if (sources.length === 0) {
    lines.push("- 当前 Project 没有关联不可变来源。", "");
  } else {
    for (const source of sources) appendSourceIndex(lines, source);
  }

  return {
    version: markdownWikiExportVersion,
    fileName: `${fileNamePart(snapshot.project.title, snapshot.project.id)}.wiki.md`,
    mediaType: "text/markdown;charset=utf-8",
    content: `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`
  };
}

export function downloadMarkdownWiki(
  artifact: MarkdownWikiExport,
  environment: MarkdownDownloadEnvironment = { document, url: URL }
): void {
  const objectUrl = environment.url.createObjectURL(new Blob([artifact.content], { type: artifact.mediaType }));
  const anchor = environment.document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = artifact.fileName;
  anchor.style.display = "none";
  environment.document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    environment.url.revokeObjectURL(objectUrl);
  }
}

function appendNodeTree(
  lines: string[],
  node: KnowledgeNode,
  level: number,
  visited: Set<string>,
  containsByParent: Map<string, KnowledgeNode[]>,
  edges: KnowledgeEdge[],
  nodeById: Map<string, KnowledgeNode>,
  sourceById: Map<string, KnowledgeSourceAsset>,
  anchorById: Map<string, SourceAnchor>
): void {
  if (visited.has(node.id)) return;
  visited.add(node.id);
  lines.push(`${"#".repeat(Math.min(level, 6))} ${heading(node.title)}`, "", node.summary, "");
  lines.push(
    `- **节点 ID**：${inline(node.id)}`,
    `- **类型**：${knowledgeNodeKindLabels[node.kind]}（${inline(node.kind)}）`,
    `- **状态**：${inline(node.status)}；${epistemicStatusLabels[node.epistemicStatus]}（${inline(node.epistemicStatus)}）`,
    `- **范围**：${inline(node.scope.description)}（${inline(node.scope.kind)}）`,
    `- **来源状态**：${sourceStatusLabels[node.sourceStatus]}（${inline(node.sourceStatus)}）`,
    `- **创建者**：${inline(node.createdBy)} / ${inline(node.creatorId)}`,
    ""
  );
  if (node.tags.length > 0) lines.push(`**标签**：${node.tags.slice().sort(compareText).map((tag) => `\`${inline(tag)}\``).join(" ")}`, "");
  if (node.sourceRefs.length > 0) {
    lines.push("**来源定位**", "");
    for (const reference of node.sourceRefs.slice().sort((left, right) =>
      compareText(left.sourceId, right.sourceId) || compareText(left.anchorId ?? "", right.anchorId ?? "")
    )) {
      const source = sourceById.get(reference.sourceId);
      const anchor = reference.anchorId ? anchorById.get(reference.anchorId) : undefined;
      const locator = anchor ? formatSourceLocator(anchor.locator) : reference.locator ?? "未提供 locator";
      lines.push(`- ${inline(source?.title ?? reference.sourceId)} — ${inline(locator)} — source \`${inline(reference.sourceId)}\``);
      const quote = anchor?.quote ?? reference.quote;
      if (quote) lines.push(...quoteLines(quote), "");
    }
  }
  const related = edges.filter((edge) => edge.kind !== "contains" && (edge.fromNodeId === node.id || edge.toNodeId === node.id));
  if (related.length > 0) {
    lines.push("**语义关系**", "");
    for (const edge of related) {
      const outgoing = edge.fromNodeId === node.id;
      const other = nodeById.get(outgoing ? edge.toNodeId : edge.fromNodeId)!;
      lines.push(`- ${outgoing ? "→" : "←"} \`${edge.kind}\` ${inline(other.title)}（${inline(other.id)}）`);
    }
    lines.push("");
  }
  for (const child of containsByParent.get(node.id) ?? []) {
    appendNodeTree(lines, child, level + 1, visited, containsByParent, edges, nodeById, sourceById, anchorById);
  }
}

function projectNodes(snapshot: KnowledgeWorkspaceSnapshot): KnowledgeNode[] {
  return knowledgeNodesInScope(snapshot).slice().sort(compareNodes);
}

function referencedSources(
  snapshot: KnowledgeWorkspaceSnapshot,
  nodes: KnowledgeNode[],
  sourceById: Map<string, KnowledgeSourceAsset>
): KnowledgeSourceAsset[] {
  const ids = new Set([
    ...snapshot.project.subject.sourceAssetIds,
    ...nodes.flatMap((node) => node.sourceRefs.map((reference) => reference.sourceId))
  ]);
  return [...ids].map((id) => sourceById.get(id)).filter((source): source is KnowledgeSourceAsset => Boolean(source))
    .sort((left, right) => compareText(left.title, right.title) || compareText(left.id, right.id));
}

function appendSourceIndex(lines: string[], source: KnowledgeSourceAsset): void {
  lines.push(
    `### ${heading(source.title)}`,
    "",
    `- **Source ID**：${inline(source.id)}`,
    `- **Logical Source ID**：${inline(source.logicalSourceId)}`,
    `- **版本**：${source.version}${source.previousVersionId ? `；previous ${inline(source.previousVersionId)}` : ""}`,
    `- **库存类型**：${inline(source.inventoryKind ?? "document")}`,
    `- **格式**：${inline(source.format)}${source.mediaType ? ` / ${inline(source.mediaType)}` : ""}`,
    `- **URI**：<${source.uri.replace(/>/g, "%3E")}>`,
    `- **SHA-256**：${inline(source.contentHash)}`,
    `- **字节数**：${source.byteLength}`,
    ""
  );
}

function compareNodes(left: KnowledgeNode, right: KnowledgeNode): number {
  return left.depth - right.depth || compareText(left.title, right.title) || compareText(left.id, right.id);
}

function compareEdges(left: KnowledgeEdge, right: KnowledgeEdge): number {
  return compareText(left.fromNodeId, right.fromNodeId)
    || compareText(left.kind, right.kind)
    || compareText(left.toNodeId, right.toNodeId)
    || compareText(left.id, right.id);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function heading(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/^(#+)/, "\\$1").trim() || "Untitled";
}

function inline(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/([\\`*_{}\[\]<>])/g, "\\$1").trim();
}

function bulletList(values: string[]): string[] {
  return values.length > 0 ? values.map((value) => `- ${inline(value)}`) : ["- 未定义"];
}

function quoteLines(value: string): string[] {
  return value.replace(/\r\n|\r/g, "\n").split("\n").map((line) => `  > ${line}`);
}

function formatConfidence(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "unknown";
}

function fileNamePart(title: string, fallback: string): string {
  return title.normalize("NFKC").toLowerCase()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.\- ]+|[.\- ]+$/g, "")
    .slice(0, 80) || fallback.replace(/[^a-zA-Z0-9_-]+/g, "-") || "knowledge-project";
}
