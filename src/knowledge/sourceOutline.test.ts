import { expect, test } from "vitest";
import type { KnowledgeNode, KnowledgeSourceAsset, SourceParserOutput } from "../types";
import { BuiltinMarkdownSourceParser, BuiltinTextSourceParser } from "./builtinSourceParsers";
import { createKnowledgeMetadata } from "./knowledgeMetadata";
import { buildSourceOutlineSubgraph } from "./sourceOutline";

const parentNode: KnowledgeNode = {
  id: "knowledge-source-subject",
  kind: "subject",
  title: "Source subject",
  summary: "Subject root",
  status: "open",
  ...createKnowledgeMetadata({
    kind: "subject",
    createdBy: "user",
    creatorId: "local-user",
    scopeContextId: "project-source-outline"
  }),
  depth: 0,
  tags: [],
  sourceRefs: [],
  createdAt: "2026-07-14T00:00:00.000Z",
  updatedAt: "2026-07-14T00:00:00.000Z"
};

test("turns a Markdown outline into hierarchical first-layer knowledge", async () => {
  const source = sourceAsset("source-md", "Architecture guide", "markdown");
  const parsed = await new BuiltinMarkdownSourceParser().parse({
    sourceId: source.id,
    title: source.title,
    uri: source.uri,
    format: "markdown",
    content: "# Architecture\nOverview\n\n## Storage\nDurable graph\n\n# Risks\nMigration cost"
  });
  const outline = buildSourceOutlineSubgraph({ parentNode, source, parsed });
  const repeated = buildSourceOutlineSubgraph({ parentNode, source, parsed });
  const architecture = outline.nodes.find((node) => node.title === "Architecture")!;
  const storage = outline.nodes.find((node) => node.title === "Storage")!;
  const risks = outline.nodes.find((node) => node.title === "Risks")!;

  expect(outline).toEqual(repeated);
  expect(outline.nodes).toHaveLength(3);
  expect(architecture.depth).toBe(1);
  expect(storage.depth).toBe(2);
  expect(risks.depth).toBe(1);
  expect(outline.edges).toEqual(expect.arrayContaining([
    expect.objectContaining({ fromNodeId: parentNode.id, toNodeId: architecture.id, kind: "contains" }),
    expect.objectContaining({ fromNodeId: architecture.id, toNodeId: storage.id, kind: "contains" }),
    expect.objectContaining({ fromNodeId: parentNode.id, toNodeId: risks.id, kind: "contains" })
  ]));
  expect(storage.sourceRefs[0]).toMatchObject({
    sourceId: source.id,
    anchorId: parsed.sections[1].anchor.id,
    locator: "L4-L5 · Architecture > Storage",
    quote: "## Storage\nDurable graph"
  });
  expect(outline.anchors[1].contentHash).toBe(source.contentHash);
});

test("keeps text paragraphs flat under the selected graph parent", async () => {
  const source = sourceAsset("source-text", "Research notes", "text");
  const parsed = await new BuiltinTextSourceParser().parse({
    sourceId: source.id,
    title: source.title,
    uri: source.uri,
    format: "text",
    content: "First finding\nwith context\n\nSecond finding"
  });
  const outline = buildSourceOutlineSubgraph({ parentNode, source, parsed });

  expect(outline.nodes.map((node) => node.title)).toEqual(["First finding", "Second finding"]);
  expect(outline.nodes.every((node) => node.depth === 1)).toBe(true);
  expect(outline.edges.every((edge) => edge.fromNodeId === parentNode.id)).toBe(true);
});

test("preserves user-authored note and experience semantics in candidate nodes", async () => {
  const parser = new BuiltinTextSourceParser();
  const noteSource = { ...sourceAsset("source-note", "Design notes", "text"), inventoryKind: "note" as const };
  const experienceSource = { ...sourceAsset("source-experience", "Production lesson", "text"), inventoryKind: "experience" as const };
  const noteParsed = await parser.parse({
    sourceId: noteSource.id,
    title: noteSource.title,
    uri: noteSource.uri,
    format: "text",
    content: "Retries need idempotency"
  });
  const experienceParsed = await parser.parse({
    sourceId: experienceSource.id,
    title: experienceSource.title,
    uri: experienceSource.uri,
    format: "text",
    content: "In our payment service, jitter reduced retry storms."
  });

  const note = buildSourceOutlineSubgraph({ parentNode, source: noteSource, parsed: noteParsed }).nodes[0];
  const experience = buildSourceOutlineSubgraph({ parentNode, source: experienceSource, parsed: experienceParsed }).nodes[0];

  expect(note).toMatchObject({ kind: "claim", createdBy: "user", epistemicStatus: "user_asserted" });
  expect(note.tags).toContain("用户笔记");
  expect(experience).toMatchObject({ kind: "experience", createdBy: "user", epistemicStatus: "user_asserted" });
  expect(experience.tags).toContain("经验陈述");
});

test("groups PDF line anchors into page nodes instead of flooding the first layer", () => {
  const source = sourceAsset("source-pdf", "Paper", "pdf");
  const parsed: SourceParserOutput = {
    parserId: "pdfjs-dist@6.1.200",
    warnings: [],
    metadata: { pageCount: 2 },
    sections: [
      pdfLine(source.id, 1, 1, "First line"),
      pdfLine(source.id, 1, 2, "Second line"),
      pdfLine(source.id, 2, 1, "Next page")
    ]
  };
  const outline = buildSourceOutlineSubgraph({ parentNode, source, parsed });

  expect(outline.nodes.map((node) => node.title)).toEqual(["Paper · 第 1 页", "Paper · 第 2 页"]);
  expect(outline.nodes[0].summary).toBe("First line Second line");
  expect(outline.nodes[0].sourceRefs).toHaveLength(2);
  expect(outline.nodes[0].sourceRefs[0].locator).toBe("p.1 · line-1 · bbox(10,20,30,40)");
});

test("returns an empty candidate subgraph and rejects broken source anchors", () => {
  const source = sourceAsset("source-empty", "Empty", "markdown");
  const empty = buildSourceOutlineSubgraph({
    parentNode,
    source,
    parsed: { parserId: "builtin-markdown@1", sections: [], warnings: [], metadata: {} }
  });
  expect(empty).toEqual({
    sourceId: source.id,
    parentNodeId: parentNode.id,
    nodes: [],
    edges: [],
    anchors: []
  });

  const broken = {
    parserId: "builtin-markdown@1",
    warnings: [],
    metadata: {},
    sections: [{
      id: "broken-section",
      text: "Broken",
      anchor: {
        id: "broken-anchor",
        sourceId: "another-source",
        locator: { kind: "text" as const, lineStart: 1 }
      }
    }]
  };
  expect(() => buildSourceOutlineSubgraph({ parentNode, source, parsed: broken })).toThrow(
    "expected source-empty"
  );
});

function sourceAsset(
  id: string,
  title: string,
  format: KnowledgeSourceAsset["format"]
): KnowledgeSourceAsset {
  return {
    id,
    logicalSourceId: id,
    version: 1,
    spaceId: "space-main",
    format,
    title,
    uri: `memory://${id}`,
    mediaType: format === "pdf" ? "application/pdf" : "text/plain",
    contentHash: `sha256-${id}`,
    byteLength: 1,
    immutable: true,
    createdAt: "2026-07-14T00:00:00.000Z"
  };
}

function pdfLine(sourceId: string, page: number, line: number, text: string) {
  return {
    id: `${sourceId}-page-${page}-line-${line}`,
    title: `Page ${page}`,
    text,
    anchor: {
      id: `${sourceId}-anchor-page-${page}-line-${line}`,
      sourceId,
      locator: {
        kind: "pdf" as const,
        page,
        section: `line-${line}`,
        boundingBox: [10, 20, 30, 40] as [number, number, number, number]
      },
      quote: text
    }
  };
}
