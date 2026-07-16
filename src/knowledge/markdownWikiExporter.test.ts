import { expect, test } from "vitest";
import type { KnowledgeSourceAsset, SourceAnchor } from "../types";
import { createKnowledgeWorkspace } from "./knowledgeEngine";
import { exportKnowledgeWorkspaceToMarkdown } from "./markdownWikiExporter";
import { formatSourceLocator } from "./sourceOutline";

test("exports a deterministic Markdown Wiki projection without mutating the workspace", () => {
  const workspace = createKnowledgeWorkspace("Deterministic Wiki");
  const before = JSON.stringify(workspace);
  const first = exportKnowledgeWorkspaceToMarkdown(workspace);
  const reordered = {
    ...workspace,
    graph: {
      ...workspace.graph,
      nodes: workspace.graph.nodes.slice().reverse(),
      edges: workspace.graph.edges.slice().reverse()
    },
    projects: workspace.projects.slice().reverse(),
    knowledgeSourceAssets: workspace.knowledgeSourceAssets.slice().reverse(),
    sourceAnchors: workspace.sourceAnchors.slice().reverse()
  };
  const second = exportKnowledgeWorkspaceToMarkdown(reordered);

  expect(first).toEqual(second);
  expect(JSON.stringify(workspace)).toBe(before);
  expect(first).toMatchObject({
    version: 1,
    fileName: "deterministic-wiki.wiki.md",
    mediaType: "text/markdown;charset=utf-8"
  });
  expect(first.content).toContain("alphaAiGraphExportVersion: 1");
  expect(first.content).toContain("## Knowledge Map");
  expect(first.content).toContain("## 关系索引");
  expect(first.content).toContain("## 来源索引");
  expect(first.content.endsWith("\n")).toBe(true);
  expect(first.content).not.toMatch(/\n{3,}/);
});

test("preserves immutable source versions, locators, quotes, and semantic relations", () => {
  const workspace = createKnowledgeWorkspace("Source Wiki");
  const source: KnowledgeSourceAsset = {
    id: "wiki-guide@v1-aaaaaaaaaaaa",
    logicalSourceId: "wiki-guide",
    version: 1,
    spaceId: workspace.space.id,
    inventoryKind: "bookmark_index",
    format: "markdown",
    title: "Wiki Guide",
    uri: "https://example.com/wiki-guide.md",
    mediaType: "text/markdown",
    contentHash: "sha256:aaaaaaaa",
    byteLength: 128,
    immutable: true,
    createdAt: workspace.graph.updatedAt
  };
  const anchor: SourceAnchor = {
    id: "wiki-guide-anchor-1",
    sourceId: source.id,
    locator: { kind: "text", lineStart: 8, lineEnd: 10, section: "Evidence" },
    quote: "Facts keep an exact source location.",
    contentHash: source.contentHash
  };
  const target = workspace.graph.nodes[1];
  const sourcedTarget = {
    ...target,
    sourceStatus: "verified" as const,
    epistemicStatus: "supported" as const,
    sourceRefs: [{
      sourceId: source.id,
      anchorId: anchor.id,
      locator: formatSourceLocator(anchor.locator),
      quote: anchor.quote
    }]
  };
  const project = {
    ...workspace.project,
    subject: { ...workspace.project.subject, sourceAssetIds: [source.id] }
  };
  const artifact = exportKnowledgeWorkspaceToMarkdown({
    ...workspace,
    project,
    projects: [project],
    subject: project.subject,
    graph: {
      ...workspace.graph,
      nodes: workspace.graph.nodes.map((node) => node.id === target.id ? sourcedTarget : node)
    },
    knowledgeSourceAssets: [source],
    sourceAnchors: [anchor]
  });

  expect(artifact.content).toContain("Wiki Guide — L8-L10 · Evidence");
  expect(artifact.content).toContain("> Facts keep an exact source location.");
  expect(artifact.content).toContain("wiki-guide@v1-aaaaaaaaaaaa");
  expect(artifact.content).toContain("**库存类型**：bookmark\\_index");
  expect(artifact.content).toContain("https://example.com/wiki-guide.md");
  expect(artifact.content).toContain("`contains` →");
});

test("uses snapshot timestamps only and safely normalizes the download name", () => {
  const workspace = createKnowledgeWorkspace("Wiki: Alpha/Graph? *");
  const artifact = exportKnowledgeWorkspaceToMarkdown(workspace);

  expect(artifact.fileName).toBe("wiki-alpha-graph.wiki.md");
  expect(artifact.content).toContain(`graphUpdatedAt: ${JSON.stringify(workspace.graph.updatedAt)}`);
  expect(artifact.content).not.toContain("exportedAt:");
});
