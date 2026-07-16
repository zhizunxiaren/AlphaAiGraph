// @vitest-environment node

import { expect, test } from "vitest";
import type { KnowledgeSourceAsset, SourceAnchor } from "../types";
import { acceptCandidateGraphPatch, createKnowledgeWorkspace } from "./knowledgeEngine";
import { formatSourceLocator } from "./sourceOutline";
import {
  decodeMarkdownWikiVaultZip,
  encodeMarkdownWikiVaultZip,
  exportKnowledgeWorkspaceToMarkdownVault,
  markdownWikiVaultManifestPath,
  parseMarkdownWikiVault,
  proposeMarkdownWikiVaultImport,
  type MarkdownWikiVaultExport
} from "./markdownWikiVault";

test("exports a deterministic Obsidian vault with one canonical note per node and typed wikilinks", () => {
  const workspace = createKnowledgeWorkspace("Obsidian Round Trip");
  const first = exportKnowledgeWorkspaceToMarkdownVault(workspace);
  const reordered = exportKnowledgeWorkspaceToMarkdownVault({
    ...workspace,
    graph: { ...workspace.graph, nodes: workspace.graph.nodes.slice().reverse(), edges: workspace.graph.edges.slice().reverse() },
    projects: workspace.projects.slice().reverse()
  });

  expect(reordered).toEqual(first);
  expect(first.archiveFileName).toBe("obsidian-round-trip.obsidian.zip");
  expect(first.files.find((file) => file.path === markdownWikiVaultManifestPath)).toBeDefined();
  expect(first.files.filter((file) => file.path.startsWith("Nodes/"))).toHaveLength(workspace.graph.nodes.length);
  expect(first.files.find((file) => file.path === "Index.md")?.content).toContain("[[Nodes/");
  const nodeNote = first.files.find((file) => file.path.startsWith("Nodes/"))!;
  expect(nodeNote.content).toContain("alphaAiGraphNode: {");
  expect(nodeNote.content).toContain("alphaAiGraphOutgoingEdges: [");
  expect(nodeNote.content).toContain("`contains` → [[Nodes/");
});

test("round trips the vault through a deterministic ZIP without losing graph identities", () => {
  const workspace = sourcedWorkspace();
  const vault = exportKnowledgeWorkspaceToMarkdownVault(workspace);
  const firstZip = encodeMarkdownWikiVaultZip(vault);
  const secondZip = encodeMarkdownWikiVaultZip({ ...vault, files: vault.files.slice().reverse() });
  const decoded = decodeMarkdownWikiVaultZip(firstZip);
  const roundTrip = parseMarkdownWikiVault(decoded);

  expect(secondZip).toEqual(firstZip);
  expect(decoded).toEqual(vault);
  expect(roundTrip.project).toEqual(workspace.project);
  expect(roundTrip.graph.nodes.map((node) => node.id).sort()).toEqual(workspace.graph.nodes.map((node) => node.id).sort());
  expect(roundTrip.graph.edges.map((edge) => edge.id).sort()).toEqual(workspace.graph.edges.map((edge) => edge.id).sort());
  expect(roundTrip.knowledgeSourceAssets).toEqual(workspace.knowledgeSourceAssets);
  expect(roundTrip.sourceAnchors).toEqual(workspace.sourceAnchors);
});

test("imports structured wiki edits as a CandidateGraphPatch and never writes before acceptance", () => {
  const workspace = createKnowledgeWorkspace("Review Wiki Import");
  const vault = exportKnowledgeWorkspaceToMarkdownVault(workspace);
  const unchanged = proposeMarkdownWikiVaultImport(workspace, vault, "2026-07-15T14:00:00.000Z");
  expect(unchanged).toMatchObject({ status: "unchanged", operationCount: 0 });
  expect(unchanged.snapshot).toBe(workspace);

  const target = workspace.graph.nodes[1];
  const edited = editJsonField(vault, target.id, "alphaAiGraphNode", (node) => ({
    ...node,
    title: "Wiki reviewed title",
    summary: "Wiki reviewed summary"
  }));
  const proposed = proposeMarkdownWikiVaultImport(workspace, edited, "2026-07-15T14:01:00.000Z");

  expect(proposed).toMatchObject({ status: "proposed", operationCount: 1 });
  expect(proposed.snapshot.graph).toBe(workspace.graph);
  expect(proposed.snapshot.graph.nodes.find((node) => node.id === target.id)?.title).toBe(target.title);
  const patch = proposed.snapshot.candidatePatches.find((candidate) => candidate.id === proposed.patchId)!;
  expect(patch).toMatchObject({ action: "revise", status: "pending_review", createdBy: "user" });
  expect(patch.operations[0]).toMatchObject({ kind: "revise_node", nodeId: target.id });

  const accepted = acceptCandidateGraphPatch(proposed.snapshot, proposed.patchId!);
  expect(accepted.graph.nodes.find((node) => node.id === target.id)).toMatchObject({
    title: "Wiki reviewed title",
    summary: "Wiki reviewed summary"
  });
});

test("rejects edits to immutable Sources, locators, and protected node fields", () => {
  const workspace = sourcedWorkspace();
  const vault = exportKnowledgeWorkspaceToMarkdownVault(workspace);
  const source = workspace.knowledgeSourceAssets[0];
  const changedSource = editJsonField(vault, source.id, "alphaAiGraphSource", (payload) => ({ ...payload, contentHash: "sha256:tampered" }));
  expect(() => proposeMarkdownWikiVaultImport(workspace, changedSource, "2026-07-15T14:02:00.000Z"))
    .toThrow(/invalid_anchor|immutable_source_changed/);

  const target = workspace.graph.nodes[1];
  const changedStatus = editJsonField(vault, target.id, "alphaAiGraphNode", (payload) => ({ ...payload, status: "verified" }));
  expect(() => proposeMarkdownWikiVaultImport(workspace, changedStatus, "2026-07-15T14:03:00.000Z"))
    .toThrow(/protected_node_field/);
});

function editJsonField(
  vault: MarkdownWikiVaultExport,
  entityId: string,
  field: string,
  edit: (payload: Record<string, unknown>) => Record<string, unknown>
): MarkdownWikiVaultExport {
  const manifest = JSON.parse(vault.files.find((file) => file.path === markdownWikiVaultManifestPath)!.content) as {
    entries: Array<{ id: string; path: string }>;
  };
  const path = manifest.entries.find((entry) => entry.id === entityId)!.path;
  const prefix = `${field}: `;
  return {
    ...vault,
    files: vault.files.map((file) => {
      if (file.path !== path) return file;
      const lines = file.content.split("\n");
      const index = lines.findIndex((line) => line.startsWith(prefix));
      const payload = JSON.parse(lines[index].slice(prefix.length)) as Record<string, unknown>;
      lines[index] = `${prefix}${JSON.stringify(edit(payload))}`;
      return { ...file, content: lines.join("\n") };
    })
  };
}

function sourcedWorkspace() {
  const workspace = createKnowledgeWorkspace("Vault Sources");
  const source: KnowledgeSourceAsset = {
    id: "vault-source@v1-aaaaaaaaaaaa",
    logicalSourceId: "vault-source",
    version: 1,
    spaceId: workspace.space.id,
    inventoryKind: "document",
    format: "markdown",
    title: "Vault Source",
    uri: "https://example.com/vault-source.md",
    mediaType: "text/markdown",
    contentHash: "sha256:aaaaaaaa",
    byteLength: 128,
    immutable: true,
    createdAt: workspace.graph.updatedAt
  };
  const anchor: SourceAnchor = {
    id: "vault-source-anchor-1",
    sourceId: source.id,
    locator: { kind: "text", lineStart: 4, lineEnd: 6, section: "Evidence" },
    quote: "Round-trip locators remain exact.",
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
  const project = { ...workspace.project, subject: { ...workspace.project.subject, sourceAssetIds: [source.id] } };
  return {
    ...workspace,
    project,
    projects: [project],
    subject: project.subject,
    graph: { ...workspace.graph, nodes: workspace.graph.nodes.map((node) => node.id === target.id ? sourcedTarget : node) },
    knowledgeSourceAssets: [source],
    sourceAnchors: [anchor]
  };
}
