import type {
  KnowledgeEdge,
  KnowledgeInventoryItemKind,
  KnowledgeNode,
  KnowledgeSourceAsset,
  KnowledgeSourceRef,
  ParsedSourceSection,
  SourceAnchor,
  SourceLocator,
  SourceParserOutput
} from "../types";
import { createKnowledgeMetadata } from "./knowledgeMetadata";

export interface SourceOutlineSubgraph {
  sourceId: string;
  parentNodeId: string;
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  anchors: SourceAnchor[];
}

export interface BuildSourceOutlineInput {
  parentNode: KnowledgeNode;
  source: KnowledgeSourceAsset;
  parsed: SourceParserOutput;
}

interface OutlineEntry {
  key: string;
  title: string;
  text: string;
  path?: string;
  anchors: SourceAnchor[];
}

/**
 * Converts parser output into candidate graph material without mutating the
 * primary graph. Ingest orchestration can wrap these nodes/edges in a reviewed
 * CandidateGraphPatch before they become canonical knowledge.
 */
export function buildSourceOutlineSubgraph({
  parentNode,
  source,
  parsed
}: BuildSourceOutlineInput): SourceOutlineSubgraph {
  validateSections(source, parsed.sections);
  const anchors = parsed.sections.map((section) => ({
    ...section.anchor,
    contentHash: section.anchor.contentHash ?? source.contentHash
  }));
  const anchorsById = new Map(anchors.map((anchor) => [anchor.id, anchor]));
  const entries = source.format === "pdf"
    ? buildPdfPageEntries(source, parsed.sections, anchorsById)
    : buildTextEntries(source, parsed.sections, anchorsById);
  const semantics = inventoryOutlineSemantics(source.inventoryKind ?? "document");
  const nodes: KnowledgeNode[] = [];
  const edges: KnowledgeEdge[] = [];
  const latestNodeByPath = new Map<string, KnowledgeNode>();

  for (const entry of entries) {
    const parent = source.format === "markdown"
      ? findOutlineParent(parentNode, entry.path, latestNodeByPath)
      : parentNode;
    const nodeId = `${parentNode.id}-source-${stableKey(source.id)}-${stableKey(entry.key)}`;
    const outlineNode: KnowledgeNode = {
      id: nodeId,
      kind: semantics.nodeKind,
      title: entry.title,
      summary: summarizeSourceText(entry.text),
      status: "open",
      ...createKnowledgeMetadata({
        kind: semantics.nodeKind,
        createdBy: semantics.createdBy,
        creatorId: semantics.createdBy === "user" ? "local-user" : "alpha-ai-graph",
        scopeContextId: parentNode.scope.contextIds[0] ?? "project-unknown",
        sourceRefCount: entry.anchors.length,
        sourceVerified: true
      }),
      scope: parentNode.scope,
      depth: parent.depth + 1,
      tags: [
        semantics.tag,
        source.format,
        parent.id === parentNode.id ? "第一层" : "来源子层"
      ],
      sourceRefs: entry.anchors.map(toKnowledgeSourceRef),
      createdAt: source.createdAt,
      updatedAt: source.createdAt
    };
    nodes.push(outlineNode);
    edges.push({
      id: `${parent.id}-contains-${outlineNode.id}`,
      fromNodeId: parent.id,
      toNodeId: outlineNode.id,
      kind: "contains",
      confidence: 1,
      createdAt: source.createdAt
    });
    if (entry.path && entry.path !== "preamble") {
      latestNodeByPath.set(entry.path, outlineNode);
    }
  }

  return { sourceId: source.id, parentNodeId: parentNode.id, nodes, edges, anchors };
}

function inventoryOutlineSemantics(kind: KnowledgeInventoryItemKind): {
  nodeKind: KnowledgeNode["kind"];
  createdBy: "agent" | "user";
  tag: string;
} {
  if (kind === "note") return { nodeKind: "claim", createdBy: "user", tag: "用户笔记" };
  if (kind === "bookmark_index") return { nodeKind: "topic", createdBy: "user", tag: "收藏索引" };
  if (kind === "experience") return { nodeKind: "experience", createdBy: "user", tag: "经验陈述" };
  return { nodeKind: "topic", createdBy: "agent", tag: "来源目录" };
}

export function formatSourceLocator(locator: SourceLocator): string {
  if (locator.kind === "text") {
    const lineRange = locator.lineEnd && locator.lineEnd !== locator.lineStart
      ? `L${locator.lineStart}-L${locator.lineEnd}`
      : `L${locator.lineStart}`;
    return locator.section ? `${lineRange} · ${locator.section}` : lineRange;
  }
  if (locator.kind === "pdf") {
    const section = locator.section ? ` · ${locator.section}` : "";
    const box = locator.boundingBox ? ` · bbox(${locator.boundingBox.join(",")})` : "";
    return `p.${locator.page}${section}${box}`;
  }
  return locator.fragment ? `${locator.uri}#${locator.fragment}` : locator.uri;
}

function buildTextEntries(
  source: KnowledgeSourceAsset,
  sections: ParsedSourceSection[],
  anchorsById: Map<string, SourceAnchor>
): OutlineEntry[] {
  return sections.map((section) => {
    const path = source.format === "markdown" && section.anchor.locator.kind === "text"
      ? section.anchor.locator.section
      : undefined;
    return {
      key: section.id,
      title: section.title?.trim() || firstMeaningfulLine(section.text) || source.title,
      text: section.text,
      path,
      anchors: [anchorsById.get(section.anchor.id)!]
    };
  });
}

function buildPdfPageEntries(
  source: KnowledgeSourceAsset,
  sections: ParsedSourceSection[],
  anchorsById: Map<string, SourceAnchor>
): OutlineEntry[] {
  const pages = new Map<number, { texts: string[]; anchors: SourceAnchor[] }>();
  for (const section of sections) {
    if (section.anchor.locator.kind !== "pdf") {
      throw new Error(`PDF section ${section.id} must use a PDF locator`);
    }
    const page = section.anchor.locator.page;
    const entry = pages.get(page) ?? { texts: [], anchors: [] };
    entry.texts.push(section.text);
    entry.anchors.push(anchorsById.get(section.anchor.id)!);
    pages.set(page, entry);
  }
  return Array.from(pages.entries())
    .sort(([left], [right]) => left - right)
    .map(([page, entry]) => ({
      key: `page-${page}`,
      title: `${source.title} · 第 ${page} 页`,
      text: entry.texts.join("\n"),
      anchors: entry.anchors
    }));
}

function findOutlineParent(
  root: KnowledgeNode,
  path: string | undefined,
  latestNodeByPath: Map<string, KnowledgeNode>
): KnowledgeNode {
  if (!path || path === "preamble") return root;
  const segments = path.split(" > ").map((part) => part.trim()).filter(Boolean);
  segments.pop();
  while (segments.length > 0) {
    const parent = latestNodeByPath.get(segments.join(" > "));
    if (parent) return parent;
    segments.pop();
  }
  return root;
}

function toKnowledgeSourceRef(anchor: SourceAnchor): KnowledgeSourceRef {
  return {
    sourceId: anchor.sourceId,
    anchorId: anchor.id,
    locator: formatSourceLocator(anchor.locator),
    quote: anchor.quote
  };
}

function validateSections(source: KnowledgeSourceAsset, sections: ParsedSourceSection[]): void {
  const sectionIds = new Set<string>();
  const anchorIds = new Set<string>();
  for (const section of sections) {
    if (sectionIds.has(section.id)) throw new Error(`Duplicate parsed section id: ${section.id}`);
    if (anchorIds.has(section.anchor.id)) throw new Error(`Duplicate source anchor id: ${section.anchor.id}`);
    if (section.anchor.sourceId !== source.id) {
      throw new Error(
        `Section ${section.id} references source ${section.anchor.sourceId}, expected ${source.id}`
      );
    }
    sectionIds.add(section.id);
    anchorIds.add(section.anchor.id);
  }
}

function firstMeaningfulLine(text: string): string {
  const line = text.split(/\r\n|\n|\r/).find((candidate) => candidate.trim());
  return truncate((line ?? "").replace(/^ {0,3}#{1,6}[\t ]+/, "").trim(), 80);
}

function summarizeSourceText(text: string): string {
  const normalized = text
    .replace(/^ {0,3}#{1,6}[\t ]+/gm, "")
    .replace(/^ {0,3}(=+|-+)[\t ]*$/gm, "")
    .replace(/^ {0,3}(`{3,}|~{3,}).*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  return truncate(normalized, 240);
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function stableKey(value: string): string {
  const readable = value.toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "item";
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${readable}-${(hash >>> 0).toString(36)}`;
}
