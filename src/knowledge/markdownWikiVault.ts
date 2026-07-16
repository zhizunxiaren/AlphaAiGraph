import type {
  AgentRequest,
  CandidateGraphPatch,
  GraphPatchOperation,
  KnowledgeEdge,
  KnowledgeGraph,
  KnowledgeNode,
  KnowledgeSourceAsset,
  KnowledgeSpace,
  KnowledgeWorkspaceSnapshot,
  Project,
  SourceAnchor
} from "../types";
import { createGraphPatchAudit } from "./graphPatch";
import { knowledgeNodesInScope } from "./knowledgeGraphQuery";
import { knowledgeNodeKindLabels } from "./knowledgeNodeKinds";
import { formatSourceLocator } from "./sourceOutline";
import { decodeDeterministicZip, encodeDeterministicZip, crc32 } from "./deterministicZip";

export const markdownWikiVaultVersion = 1 as const;
export const markdownWikiVaultManifestPath = ".alpha-ai-graph/manifest.json";

export interface MarkdownWikiVaultFile {
  path: string;
  mediaType: "text/markdown;charset=utf-8" | "application/json;charset=utf-8";
  content: string;
}

export interface MarkdownWikiVaultExport {
  version: typeof markdownWikiVaultVersion;
  directoryName: string;
  archiveFileName: string;
  graphUpdatedAt: string;
  files: MarkdownWikiVaultFile[];
}

export interface MarkdownWikiVaultManifestEntry {
  entity: "project" | "node" | "source";
  id: string;
  path: string;
}

export interface MarkdownWikiVaultManifest {
  alphaAiGraphVaultVersion: typeof markdownWikiVaultVersion;
  projectId: string;
  graphId: string;
  graphUpdatedAt: string;
  entries: MarkdownWikiVaultManifestEntry[];
}

export interface MarkdownWikiVaultRoundTrip {
  project: Project;
  space: KnowledgeSpace;
  graph: KnowledgeGraph;
  knowledgeSourceAssets: KnowledgeSourceAsset[];
  sourceAnchors: SourceAnchor[];
}

export interface MarkdownWikiVaultDownloadEnvironment {
  document: Pick<Document, "createElement" | "body">;
  url: Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;
}

export interface MarkdownWikiVaultImportResult {
  status: "unchanged" | "proposed";
  snapshot: KnowledgeWorkspaceSnapshot;
  patchId?: string;
  operationCount: number;
}

interface GraphMetadata extends Omit<KnowledgeGraph, "nodes" | "edges"> {}

export function exportKnowledgeWorkspaceToMarkdownVault(
  snapshot: KnowledgeWorkspaceSnapshot
): MarkdownWikiVaultExport {
  const nodes = knowledgeNodesInScope(snapshot);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges = snapshot.graph.edges
    .filter((edge) => nodeById.has(edge.fromNodeId) && nodeById.has(edge.toNodeId))
    .slice().sort(compareEdges);
  const sources = referencedSources(snapshot, nodes);
  const sourceIds = new Set(sources.map((source) => source.id));
  const anchors = snapshot.sourceAnchors
    .filter((anchor) => sourceIds.has(anchor.sourceId))
    .slice().sort(compareAnchors);
  const nodePathById = uniqueEntityPaths("Nodes", nodes.map((node) => ({ id: node.id, title: node.title })));
  const sourcePathById = uniqueEntityPaths("Sources", sources.map((source) => ({ id: source.id, title: source.title })));
  const projectPath = "Project.md";
  const graphMetadata: GraphMetadata = {
    id: snapshot.graph.id,
    title: snapshot.graph.title,
    rootNodeIds: Array.from(new Set([
      snapshot.project.subject.rootNodeId,
      ...snapshot.graph.rootNodeIds.filter((id) => nodeById.has(id))
    ])),
    createdAt: snapshot.graph.createdAt,
    updatedAt: snapshot.graph.updatedAt
  };
  const entries: MarkdownWikiVaultManifestEntry[] = [
    { entity: "project" as const, id: snapshot.project.id, path: projectPath },
    ...nodes.map((node) => ({ entity: "node" as const, id: node.id, path: nodePathById.get(node.id)! })),
    ...sources.map((source) => ({ entity: "source" as const, id: source.id, path: sourcePathById.get(source.id)! }))
  ];
  entries.sort(compareManifestEntries);
  const manifest: MarkdownWikiVaultManifest = {
    alphaAiGraphVaultVersion: markdownWikiVaultVersion,
    projectId: snapshot.project.id,
    graphId: snapshot.graph.id,
    graphUpdatedAt: snapshot.graph.updatedAt,
    entries
  };
  const files: MarkdownWikiVaultFile[] = [
    {
      path: "README.md",
      mediaType: "text/markdown;charset=utf-8" as const,
      content: renderReadme(snapshot)
    },
    {
      path: "Index.md",
      mediaType: "text/markdown;charset=utf-8" as const,
      content: renderIndex(snapshot, nodes, nodePathById, sources, sourcePathById)
    },
    {
      path: projectPath,
      mediaType: "text/markdown;charset=utf-8" as const,
      content: renderProjectNote(
        snapshot.project,
        snapshot.space,
        graphMetadata,
        nodePathById.get(snapshot.project.subject.rootNodeId)!
      )
    },
    ...nodes.map((node) => ({
      path: nodePathById.get(node.id)!,
      mediaType: "text/markdown;charset=utf-8" as const,
      content: renderNodeNote(
        node,
        edges.filter((edge) => edge.fromNodeId === node.id),
        nodeById,
        nodePathById,
        new Map(sources.map((source) => [source.id, source])),
        sourcePathById,
        new Map(anchors.map((anchor) => [anchor.id, anchor]))
      )
    })),
    ...sources.map((source) => ({
      path: sourcePathById.get(source.id)!,
      mediaType: "text/markdown;charset=utf-8" as const,
      content: renderSourceNote(source, anchors.filter((anchor) => anchor.sourceId === source.id))
    })),
    {
      path: markdownWikiVaultManifestPath,
      mediaType: "application/json;charset=utf-8" as const,
      content: `${canonicalJson(manifest)}\n`
    }
  ];
  files.sort(compareFiles);
  const directoryName = `${safeFilePart(snapshot.project.title, snapshot.project.id)}.obsidian`;
  return {
    version: markdownWikiVaultVersion,
    directoryName,
    archiveFileName: `${directoryName}.zip`,
    graphUpdatedAt: snapshot.graph.updatedAt,
    files
  };
}

export function encodeMarkdownWikiVaultZip(vault: MarkdownWikiVaultExport): Uint8Array {
  const encoder = new TextEncoder();
  return encodeDeterministicZip(vault.files.map((file) => ({
    path: `${vault.directoryName}/${file.path}`,
    content: encoder.encode(file.content)
  })), vault.graphUpdatedAt);
}

export function decodeMarkdownWikiVaultZip(bytes: Uint8Array): MarkdownWikiVaultExport {
  const decoded = decodeDeterministicZip(bytes);
  const manifestEntry = decoded.find((entry) => entry.path.endsWith(`/${markdownWikiVaultManifestPath}`));
  if (!manifestEntry) throw vaultError("missing_manifest", "ZIP does not contain an AlphaAiGraph vault manifest");
  const directoryName = manifestEntry.path.slice(0, -(`/${markdownWikiVaultManifestPath}`.length));
  if (!directoryName || decoded.some((entry) => !entry.path.startsWith(`${directoryName}/`))) {
    throw vaultError("mixed_roots", "ZIP entries must share one vault root directory");
  }
  const decoder = new TextDecoder();
  const files = decoded.map((entry): MarkdownWikiVaultFile => {
    const path = entry.path.slice(directoryName.length + 1);
    return {
      path,
      mediaType: path.endsWith(".json") ? "application/json;charset=utf-8" : "text/markdown;charset=utf-8",
      content: decoder.decode(entry.content)
    };
  }).sort(compareFiles);
  const manifest = parseManifest(files);
  return {
    version: markdownWikiVaultVersion,
    directoryName,
    archiveFileName: `${directoryName}.zip`,
    graphUpdatedAt: manifest.graphUpdatedAt,
    files
  };
}

export function downloadMarkdownWikiVault(
  vault: MarkdownWikiVaultExport,
  environment: MarkdownWikiVaultDownloadEnvironment = { document, url: URL }
): void {
  const bytes = encodeMarkdownWikiVaultZip(vault);
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const objectUrl = environment.url.createObjectURL(new Blob([arrayBuffer], { type: "application/zip" }));
  const anchor = environment.document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = vault.archiveFileName;
  anchor.style.display = "none";
  environment.document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    environment.url.revokeObjectURL(objectUrl);
  }
}

export function parseMarkdownWikiVault(vault: MarkdownWikiVaultExport): MarkdownWikiVaultRoundTrip {
  const manifest = parseManifest(vault.files);
  if (manifest.graphUpdatedAt !== vault.graphUpdatedAt) throw vaultError("version_mismatch", "Vault graph timestamp differs from manifest");
  const fileByPath = new Map(vault.files.map((file) => [file.path, file]));
  if (fileByPath.size !== vault.files.length) throw vaultError("duplicate_path", "Vault file paths must be unique");
  const projectEntry = manifest.entries.find((entry) => entry.entity === "project");
  if (!projectEntry) throw vaultError("missing_project", "Vault manifest needs one Project note");
  if (manifest.entries.filter((entry) => entry.entity === "project").length !== 1) {
    throw vaultError("duplicate_project", "Vault manifest must contain exactly one Project note");
  }
  const projectFile = requireVaultFile(fileByPath, projectEntry.path);
  const project = parseJsonField<Project>(projectFile.content, "alphaAiGraphProject");
  const space = parseJsonField<KnowledgeSpace>(projectFile.content, "alphaAiGraphSpace");
  const graphMetadata = parseJsonField<GraphMetadata>(projectFile.content, "alphaAiGraphGraph");
  if (project.id !== projectEntry.id || project.id !== manifest.projectId || graphMetadata.id !== manifest.graphId) {
    throw vaultError("identity_mismatch", "Project or graph identity differs from manifest");
  }

  const nodes = manifest.entries.filter((entry) => entry.entity === "node").map((entry) => {
    const file = requireVaultFile(fileByPath, entry.path);
    const node = parseJsonField<KnowledgeNode>(file.content, "alphaAiGraphNode");
    if (node.id !== entry.id) throw vaultError("identity_mismatch", `Node ${entry.id} payload has another id`);
    return node;
  }).sort(compareNodes);
  const edges = manifest.entries.filter((entry) => entry.entity === "node").flatMap((entry) => {
    const file = requireVaultFile(fileByPath, entry.path);
    const outgoing = parseJsonField<KnowledgeEdge[]>(file.content, "alphaAiGraphOutgoingEdges");
    if (!Array.isArray(outgoing) || outgoing.some((edge) => edge.fromNodeId !== entry.id)) {
      throw vaultError("edge_ownership", `Node ${entry.id} may only own outgoing edges`);
    }
    return outgoing;
  }).sort(compareEdges);
  const sourcePayloads = manifest.entries.filter((entry) => entry.entity === "source").map((entry) => {
    const file = requireVaultFile(fileByPath, entry.path);
    const source = parseJsonField<KnowledgeSourceAsset>(file.content, "alphaAiGraphSource");
    const anchors = parseJsonField<SourceAnchor[]>(file.content, "alphaAiGraphSourceAnchors");
    if (source.id !== entry.id || anchors.some((anchor) => anchor.sourceId !== source.id)) {
      throw vaultError("source_identity", `Source ${entry.id} payload or anchors have another identity`);
    }
    return { source, anchors };
  });
  const knowledgeSourceAssets = sourcePayloads.map((payload) => payload.source)
    .sort((left, right) => compareText(left.id, right.id));
  const sourceAnchors = sourcePayloads.flatMap((payload) => payload.anchors).sort(compareAnchors);
  validateRoundTrip({ project, space, graph: { ...graphMetadata, nodes, edges }, knowledgeSourceAssets, sourceAnchors });
  return { project, space, graph: { ...graphMetadata, nodes, edges }, knowledgeSourceAssets, sourceAnchors };
}

export function proposeMarkdownWikiVaultImport(
  snapshot: KnowledgeWorkspaceSnapshot,
  vault: MarkdownWikiVaultExport,
  importedAt: string
): MarkdownWikiVaultImportResult {
  if (!Number.isFinite(Date.parse(importedAt))) throw vaultError("invalid_timestamp", "Wiki import requires a valid timestamp");
  const roundTrip = parseMarkdownWikiVault(vault);
  if (roundTrip.project.id !== snapshot.project.id || roundTrip.graph.id !== snapshot.graph.id) {
    throw vaultError("wrong_workspace", "Vault belongs to another Project or KnowledgeGraph");
  }
  assertImmutableSourcesUnchanged(snapshot, roundTrip);
  const currentNodes = knowledgeNodesInScope(snapshot);
  const currentNodeById = new Map(currentNodes.map((node) => [node.id, node]));
  const importedNodeById = new Map(roundTrip.graph.nodes.map((node) => [node.id, node]));
  const missingNode = currentNodes.find((node) => !importedNodeById.has(node.id));
  if (missingNode) throw vaultError("node_removal_unsupported", `Vault cannot remove canonical node ${missingNode.id}`);
  const operations: GraphPatchOperation[] = [];
  for (const imported of roundTrip.graph.nodes) {
    const current = currentNodeById.get(imported.id);
    if (!current) throw vaultError("node_creation_unsupported", `Vault cannot create node ${imported.id} in this contract version`);
    assertOnlyWikiEditableNodeFieldsChanged(current, imported);
    const after = {
      ...current,
      title: imported.title,
      summary: imported.summary,
      tags: imported.tags.slice(),
      scope: imported.scope,
      updatedAt: importedAt
    };
    if (!sameValue(wikiEditableNodeFields(current), wikiEditableNodeFields(after))) {
      operations.push({
        kind: "revise_node",
        nodeId: current.id,
        before: current,
        after,
        audit: createGraphPatchAudit(`wiki-revise-${stableToken(current.id)}`, "Import reviewed Markdown wiki node edits", importedAt, "user")
      });
    }
  }
  const currentEdges = snapshot.graph.edges.filter((edge) => currentNodeById.has(edge.fromNodeId) && currentNodeById.has(edge.toNodeId));
  const importedEdgeById = new Map(roundTrip.graph.edges.map((edge) => [edge.id, edge]));
  const missingEdge = currentEdges.find((edge) => !importedEdgeById.has(edge.id));
  if (missingEdge) throw vaultError("edge_removal_unsupported", `Vault cannot remove canonical edge ${missingEdge.id}`);
  const currentEdgeById = new Map(currentEdges.map((edge) => [edge.id, edge]));
  for (const imported of roundTrip.graph.edges) {
    const current = currentEdgeById.get(imported.id);
    if (!current) {
      operations.push({
        kind: "link_nodes",
        before: null,
        after: { ...imported, createdBy: "user", createdAt: importedAt },
        audit: createGraphPatchAudit(`wiki-link-${stableToken(imported.id)}`, "Import reviewed Markdown wiki relation", importedAt, "user")
      });
      continue;
    }
    if (imported.createdAt !== current.createdAt || imported.createdBy !== current.createdBy) {
      throw vaultError("edge_history_drift", `Vault cannot rewrite creator history for edge ${current.id}`);
    }
    if (!sameValue(current, imported)) {
      operations.push({
        kind: "link_nodes",
        before: current,
        after: imported,
        audit: createGraphPatchAudit(`wiki-relink-${stableToken(imported.id)}`, "Import reviewed Markdown wiki relation edits", importedAt, "user")
      });
    }
  }
  if (operations.length === 0) return { status: "unchanged", snapshot, operationCount: 0 };
  if (snapshot.candidatePatches.some((patch) => patch.status === "pending_review" && patch.title.startsWith("导回 Obsidian Wiki"))) {
    throw vaultError("pending_import", "Review the existing Wiki import patch before importing again");
  }
  const sequence = snapshot.candidatePatches.length + 1;
  const requestId = `wiki-import-request-${sequence}`;
  const patchId = `wiki-import-patch-${sequence}`;
  const request: AgentRequest = {
    id: requestId,
    action: "revise",
    selectionId: snapshot.selection.id,
    prompt: `Review ${operations.length} structured edits imported from Obsidian Markdown Wiki`,
    status: "proposed",
    createdAt: importedAt
  };
  const patch: CandidateGraphPatch = {
    id: patchId,
    requestId,
    action: "revise",
    targetNodeId: snapshot.project.subject.rootNodeId,
    focusNodeId: snapshot.selectedNodeId,
    title: `导回 Obsidian Wiki：${operations.length} 项候选变更`,
    summary: "Markdown Wiki 是可编辑投影；接受后才会把结构化差异写入 canonical KnowledgeGraph。",
    revision: 1,
    createdBy: "user",
    operations,
    confidence: 1,
    status: "pending_review",
    createdAt: importedAt
  };
  return {
    status: "proposed",
    snapshot: {
      ...snapshot,
      agentRequests: snapshot.agentRequests.concat(request),
      candidatePatches: snapshot.candidatePatches.concat(patch)
    },
    patchId,
    operationCount: operations.length
  };
}

function renderProjectNote(project: Project, space: KnowledgeSpace, graph: GraphMetadata, rootNodePath: string): string {
  return markdownNote([
    "---",
    `alphaAiGraphVaultVersion: ${markdownWikiVaultVersion}`,
    `entity: ${JSON.stringify("project")}`,
    `alphaAiGraphProject: ${canonicalJson(project)}`,
    `alphaAiGraphSpace: ${canonicalJson(space)}`,
    `alphaAiGraphGraph: ${canonicalJson(graph)}`,
    "---",
    "",
    `# ${markdownHeading(project.title)}`,
    "",
    project.goal,
    "",
    `- Mode: \`${project.mode}\``,
    `- Status: \`${project.status}\``,
    `- Graph: \`${graph.id}\``,
    `- Root: [[${withoutMarkdownExtension(rootNodePath)}|${wikilinkAlias(project.subject.title)}]]`,
    ""
  ]);
}

function renderNodeNote(
  node: KnowledgeNode,
  outgoingEdges: KnowledgeEdge[],
  nodeById: Map<string, KnowledgeNode>,
  nodePathById: Map<string, string>,
  sourceById: Map<string, KnowledgeSourceAsset>,
  sourcePathById: Map<string, string>,
  anchorById: Map<string, SourceAnchor>
): string {
  const lines = [
    "---",
    `alphaAiGraphVaultVersion: ${markdownWikiVaultVersion}`,
    `entity: ${JSON.stringify("knowledge_node")}`,
    `id: ${JSON.stringify(node.id)}`,
    `aliases: ${canonicalJson([node.title])}`,
    `tags: ${canonicalJson(["alpha-ai-graph", `kind/${node.kind}`, ...node.tags.map((tag) => `knowledge/${tag}`)])}`,
    `alphaAiGraphNode: ${canonicalJson(node)}`,
    `alphaAiGraphOutgoingEdges: ${canonicalJson(outgoingEdges.slice().sort(compareEdges))}`,
    "---",
    "",
    `# ${markdownHeading(node.title)}`,
    "",
    node.summary,
    "",
    `> ${knowledgeNodeKindLabels[node.kind]} · ${node.epistemicStatus} · ${node.sourceStatus}`,
    "",
    "## Relations",
    ""
  ];
  if (outgoingEdges.length === 0) lines.push("- None");
  for (const edge of outgoingEdges.slice().sort(compareEdges)) {
    const target = nodeById.get(edge.toNodeId)!;
    lines.push(`- \`${edge.kind}\` → [[${withoutMarkdownExtension(nodePathById.get(target.id)!)}|${wikilinkAlias(target.title)}]]`);
  }
  lines.push("", "## Sources", "");
  if (node.sourceRefs.length === 0) lines.push("- None");
  for (const reference of node.sourceRefs.slice().sort(compareSourceRefs)) {
    const source = sourceById.get(reference.sourceId);
    const anchor = reference.anchorId ? anchorById.get(reference.anchorId) : undefined;
    const locator = anchor ? formatSourceLocator(anchor.locator) : reference.locator ?? "locator missing";
    const target = sourcePathById.get(reference.sourceId);
    lines.push(`- ${target ? `[[${withoutMarkdownExtension(target)}|${wikilinkAlias(source?.title ?? reference.sourceId)}]]` : reference.sourceId} — ${locator}`);
    const quote = anchor?.quote ?? reference.quote;
    if (quote) lines.push(...quote.replace(/\r\n|\r/g, "\n").split("\n").map((line) => `  > ${line}`));
  }
  lines.push("");
  return markdownNote(lines);
}

function renderSourceNote(source: KnowledgeSourceAsset, anchors: SourceAnchor[]): string {
  const lines = [
    "---",
    `alphaAiGraphVaultVersion: ${markdownWikiVaultVersion}`,
    `entity: ${JSON.stringify("source")}`,
    `id: ${JSON.stringify(source.id)}`,
    `aliases: ${canonicalJson([source.title])}`,
    `tags: ${canonicalJson(["alpha-ai-graph", "source", `format/${source.format}`])}`,
    `alphaAiGraphSource: ${canonicalJson(source)}`,
    `alphaAiGraphSourceAnchors: ${canonicalJson(anchors.slice().sort(compareAnchors))}`,
    "---",
    "",
    `# ${markdownHeading(source.title)}`,
    "",
    `- Immutable Source ID: \`${source.id}\``,
    `- Logical Source ID: \`${source.logicalSourceId}\``,
    `- Version: ${source.version}`,
    `- URI: <${source.uri.replaceAll(">", "%3E")}>`,
    `- Content hash: \`${source.contentHash}\``,
    "",
    "## Anchors",
    ""
  ];
  if (anchors.length === 0) lines.push("- None");
  for (const anchor of anchors.slice().sort(compareAnchors)) {
    lines.push(`- \`${anchor.id}\` — ${formatSourceLocator(anchor.locator)}`);
    if (anchor.quote) lines.push(...anchor.quote.replace(/\r\n|\r/g, "\n").split("\n").map((line) => `  > ${line}`));
  }
  lines.push("");
  return markdownNote(lines);
}

function renderReadme(snapshot: KnowledgeWorkspaceSnapshot): string {
  return markdownNote([
    `# ${markdownHeading(snapshot.project.title)} · Obsidian Wiki`,
    "",
    "This vault is a deterministic, editable projection of AlphaAiGraph's canonical KnowledgeGraph.",
    "",
    "- Open `Index.md` in Obsidian.",
    "- Node notes use standard `[[wikilinks]]`.",
    "- Structured `alphaAiGraph*` frontmatter is the round-trip contract.",
    "- Re-import creates a CandidateGraphPatch; it never silently overwrites the graph.",
    "- Source notes are immutable metadata references, not copies of raw source bodies.",
    ""
  ]);
}

function renderIndex(
  snapshot: KnowledgeWorkspaceSnapshot,
  nodes: KnowledgeNode[],
  nodePathById: Map<string, string>,
  sources: KnowledgeSourceAsset[],
  sourcePathById: Map<string, string>
): string {
  const lines = [
    `# ${markdownHeading(snapshot.project.title)} · Knowledge Index`,
    "",
    `- [[Project|Project contract]]`,
    `- Graph: \`${snapshot.graph.id}\` @ \`${snapshot.graph.updatedAt}\``,
    "",
    "## Nodes",
    ""
  ];
  for (const node of nodes) lines.push(`- [[${withoutMarkdownExtension(nodePathById.get(node.id)!)}|${wikilinkAlias(node.title)}]] — ${node.kind}`);
  lines.push("", "## Sources", "");
  if (sources.length === 0) lines.push("- None");
  for (const source of sources) lines.push(`- [[${withoutMarkdownExtension(sourcePathById.get(source.id)!)}|${wikilinkAlias(source.title)}]] — v${source.version}`);
  lines.push("");
  return markdownNote(lines);
}

function parseManifest(files: readonly MarkdownWikiVaultFile[]): MarkdownWikiVaultManifest {
  const manifestFile = files.find((file) => file.path === markdownWikiVaultManifestPath);
  if (!manifestFile) throw vaultError("missing_manifest", "Vault manifest is missing");
  let manifest: MarkdownWikiVaultManifest;
  try {
    manifest = JSON.parse(manifestFile.content) as MarkdownWikiVaultManifest;
  } catch {
    throw vaultError("invalid_manifest", "Vault manifest is not valid JSON");
  }
  if (manifest.alphaAiGraphVaultVersion !== markdownWikiVaultVersion) throw vaultError("unsupported_version", "Vault version is unsupported");
  if (!manifest.projectId?.trim() || !manifest.graphId?.trim() || !Number.isFinite(Date.parse(manifest.graphUpdatedAt))) {
    throw vaultError("invalid_manifest", "Vault manifest identities or graph timestamp are invalid");
  }
  if (!Array.isArray(manifest.entries) || new Set(manifest.entries.map((entry) => entry.path)).size !== manifest.entries.length
    || new Set(manifest.entries.map((entry) => `${entry.entity}:${entry.id}`)).size !== manifest.entries.length) {
    throw vaultError("invalid_manifest", "Vault manifest entries must have unique paths and identities");
  }
  for (const entry of manifest.entries) validateVaultPath(entry.path);
  return manifest;
}

function validateRoundTrip(roundTrip: MarkdownWikiVaultRoundTrip): void {
  const nodeIds = new Set(roundTrip.graph.nodes.map((node) => node.id));
  const edgeIds = new Set(roundTrip.graph.edges.map((edge) => edge.id));
  const sourceIds = new Set(roundTrip.knowledgeSourceAssets.map((source) => source.id));
  const anchorIds = new Set(roundTrip.sourceAnchors.map((anchor) => anchor.id));
  if (nodeIds.size !== roundTrip.graph.nodes.length || edgeIds.size !== roundTrip.graph.edges.length
    || sourceIds.size !== roundTrip.knowledgeSourceAssets.length || anchorIds.size !== roundTrip.sourceAnchors.length) {
    throw vaultError("duplicate_identity", "Vault contains duplicate node, edge, source, or anchor ids");
  }
  if (!nodeIds.has(roundTrip.project.subject.rootNodeId)) throw vaultError("missing_root", "Project root node is missing from vault");
  for (const edge of roundTrip.graph.edges) {
    if (!nodeIds.has(edge.fromNodeId) || !nodeIds.has(edge.toNodeId)) throw vaultError("missing_endpoint", `Edge ${edge.id} has a missing endpoint`);
  }
  const sourceById = new Map(roundTrip.knowledgeSourceAssets.map((source) => [source.id, source]));
  const anchorById = new Map(roundTrip.sourceAnchors.map((anchor) => [anchor.id, anchor]));
  for (const source of roundTrip.knowledgeSourceAssets) {
    if (source.immutable !== true) throw vaultError("mutable_source", `Source ${source.id} must remain immutable`);
  }
  for (const anchor of roundTrip.sourceAnchors) {
    const source = sourceById.get(anchor.sourceId);
    if (!source || (anchor.contentHash && anchor.contentHash !== source.contentHash)) {
      throw vaultError("invalid_anchor", `Anchor ${anchor.id} does not match its immutable Source`);
    }
    formatSourceLocator(anchor.locator);
  }
  for (const node of roundTrip.graph.nodes) {
    for (const reference of node.sourceRefs) {
      const source = sourceById.get(reference.sourceId);
      const anchor = reference.anchorId ? anchorById.get(reference.anchorId) : undefined;
      if (!source || (reference.anchorId && (!anchor || anchor.sourceId !== source.id))) {
        throw vaultError("invalid_source_ref", `Node ${node.id} has an invalid source reference`);
      }
      if (anchor && reference.locator && reference.locator !== formatSourceLocator(anchor.locator)) {
        throw vaultError("locator_drift", `Node ${node.id} source locator differs from anchor ${anchor.id}`);
      }
    }
  }
}

function assertImmutableSourcesUnchanged(snapshot: KnowledgeWorkspaceSnapshot, roundTrip: MarkdownWikiVaultRoundTrip): void {
  const currentSources = new Map(snapshot.knowledgeSourceAssets.map((source) => [source.id, source]));
  const currentAnchors = new Map(snapshot.sourceAnchors.map((anchor) => [anchor.id, anchor]));
  for (const source of roundTrip.knowledgeSourceAssets) {
    if (!sameValue(currentSources.get(source.id), source)) throw vaultError("immutable_source_changed", `Source ${source.id} metadata cannot be edited through Wiki import`);
  }
  for (const anchor of roundTrip.sourceAnchors) {
    if (!sameValue(currentAnchors.get(anchor.id), anchor)) throw vaultError("immutable_anchor_changed", `SourceAnchor ${anchor.id} cannot be edited through Wiki import`);
  }
}

function assertOnlyWikiEditableNodeFieldsChanged(current: KnowledgeNode, imported: KnowledgeNode): void {
  const omitEditable = (node: KnowledgeNode) => {
    const { title: _title, summary: _summary, tags: _tags, scope: _scope, updatedAt: _updatedAt, ...protectedFields } = node;
    return protectedFields;
  };
  if (!sameValue(omitEditable(current), omitEditable(imported))) {
    throw vaultError("protected_node_field", `Wiki import cannot change protected node fields for ${current.id}`);
  }
}

function wikiEditableNodeFields(node: KnowledgeNode): unknown {
  return { title: node.title, summary: node.summary, tags: node.tags, scope: node.scope };
}

function referencedSources(snapshot: KnowledgeWorkspaceSnapshot, nodes: KnowledgeNode[]): KnowledgeSourceAsset[] {
  const ids = new Set([
    ...snapshot.project.subject.sourceAssetIds,
    ...nodes.flatMap((node) => node.sourceRefs.map((reference) => reference.sourceId))
  ]);
  return snapshot.knowledgeSourceAssets.filter((source) => ids.has(source.id))
    .slice().sort((left, right) => compareText(left.id, right.id));
}

function uniqueEntityPaths(directory: string, entities: Array<{ id: string; title: string }>): Map<string, string> {
  const paths = new Map<string, string>();
  const seen = new Set<string>();
  for (const entity of entities.slice().sort((left, right) => compareText(left.id, right.id))) {
    const path = `${directory}/${safeFilePart(entity.title, entity.id).slice(0, 72)}--${stableToken(entity.id)}.md`;
    if (seen.has(path)) throw vaultError("path_collision", `Stable wiki path collision for ${entity.id}`);
    seen.add(path);
    paths.set(entity.id, path);
  }
  return paths;
}

function requireVaultFile(files: Map<string, MarkdownWikiVaultFile>, path: string): MarkdownWikiVaultFile {
  validateVaultPath(path);
  const file = files.get(path);
  if (!file) throw vaultError("missing_file", `Vault manifest references missing file ${path}`);
  return file;
}

function validateVaultPath(path: string): void {
  const segments = path.split("/");
  if (!path || path.length > 512 || path.startsWith("/") || path.includes(":") || path.includes("\\")
    || path.includes("\u0000") || segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw vaultError("unsafe_path", `Vault path is unsafe: ${path}`);
  }
}

function parseJsonField<T>(content: string, field: string): T {
  const frontmatter = content.match(/^---\n([\s\S]*?)\n---(?:\n|$)/)?.[1];
  if (!frontmatter) throw vaultError("missing_frontmatter", `Wiki note is missing YAML frontmatter for ${field}`);
  const prefix = `${field}: `;
  const line = frontmatter.split("\n").find((candidate) => candidate.startsWith(prefix));
  if (!line) throw vaultError("missing_payload", `Wiki note is missing structured field ${field}`);
  try {
    return JSON.parse(line.slice(prefix.length)) as T;
  } catch {
    throw vaultError("invalid_payload", `Wiki note field ${field} is not valid JSON-compatible YAML`);
  }
}

function markdownNote(lines: string[]): string {
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

function markdownHeading(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/^(#+)/, "\\$1").trim() || "Untitled";
}

function wikilinkAlias(value: string): string {
  return value.replace(/[\r\n|\]]+/g, " ").trim() || "Untitled";
}

function withoutMarkdownExtension(path: string): string {
  return path.replace(/\.md$/i, "");
}

function safeFilePart(title: string, fallback: string): string {
  return title.normalize("NFKC").toLowerCase()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.\- ]+|[.\- ]+$/g, "")
    .slice(0, 80) || fallback.replace(/[^a-zA-Z0-9_-]+/g, "-") || "knowledge";
}

function stableToken(value: string): string {
  return crc32(new TextEncoder().encode(value)).toString(16).padStart(8, "0");
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => compareText(left, right))
      .map(([key, item]) => [key, canonicalize(item)]));
  }
  return value;
}

function sameValue(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function compareFiles(left: MarkdownWikiVaultFile, right: MarkdownWikiVaultFile): number {
  return compareText(left.path, right.path);
}

function compareManifestEntries(left: MarkdownWikiVaultManifestEntry, right: MarkdownWikiVaultManifestEntry): number {
  return compareText(left.path, right.path) || compareText(left.id, right.id);
}

function compareNodes(left: KnowledgeNode, right: KnowledgeNode): number {
  return compareText(left.id, right.id);
}

function compareEdges(left: KnowledgeEdge, right: KnowledgeEdge): number {
  return compareText(left.fromNodeId, right.fromNodeId)
    || compareText(left.kind, right.kind)
    || compareText(left.toNodeId, right.toNodeId)
    || compareText(left.id, right.id);
}

function compareAnchors(left: SourceAnchor, right: SourceAnchor): number {
  return compareText(left.sourceId, right.sourceId) || compareText(left.id, right.id);
}

function compareSourceRefs(left: KnowledgeNode["sourceRefs"][number], right: KnowledgeNode["sourceRefs"][number]): number {
  return compareText(left.sourceId, right.sourceId) || compareText(left.anchorId ?? "", right.anchorId ?? "");
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function vaultError(code: string, message: string): Error {
  return new Error(`Markdown wiki import failed: [${code}] ${message}`);
}
