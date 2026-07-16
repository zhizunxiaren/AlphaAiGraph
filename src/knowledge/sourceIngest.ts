import type {
  AgentRequest,
  CandidateGraphPatch,
  GraphPatchOperation,
  IngestRequest,
  IngestResult,
  KnowledgeSourceFormat,
  KnowledgeSourceAsset,
  KnowledgeSourceRef,
  KnowledgeWorkspaceSnapshot,
  SourceAnchor,
  SourceParser,
  SourceParserInput
} from "../types";
import { createGraphPatchAudit } from "./graphPatch";
import type { RawSourceRecord, RawSourceStore } from "./rawSourceStore";
import { selectSourceParser } from "./sourceParser";
import { buildSourceOutlineSubgraph, formatSourceLocator } from "./sourceOutline";
import { isProjectWritable } from "./projectLifecycle";
import { knowledgeInventoryItemKindLabels, sourceInventoryKind } from "./knowledgeInventory";

export interface IngestSourceIntoWorkspaceInput {
  snapshot: KnowledgeWorkspaceSnapshot;
  request: IngestRequest;
  content: SourceParserInput["content"];
  parsers: readonly SourceParser[];
  rawStore: RawSourceStore;
  parentNodeId?: string;
}

export interface WorkspaceIngestResult {
  snapshot: KnowledgeWorkspaceSnapshot;
  ingest: IngestResult;
  patchId?: string;
}

export interface SourceReferenceDetails {
  sourceTitle: string;
  sourceUri: string;
  locator: string;
  quote?: string;
  href?: string;
}

/**
 * Stores exact raw bytes first, parses through the registered adapter, then
 * registers immutable Source/Anchor records. Graph structure remains a pending
 * CandidateGraphPatch until the user accepts it.
 */
export async function ingestSourceIntoWorkspace({
  snapshot,
  request,
  content,
  parsers,
  rawStore,
  parentNodeId = defaultIngestParentNodeId(snapshot)
}: IngestSourceIntoWorkspaceInput): Promise<WorkspaceIngestResult> {
  assertIngestScope(snapshot, request, parentNodeId);
  const parser = selectSourceParser(parsers, request.format);
  if (!parser) {
    return {
      snapshot,
      ingest: {
        requestId: request.id,
        status: "unsupported",
        sections: [],
        warnings: [],
        error: `No source parser is registered for ${request.format}`
      }
    };
  }

  let record: RawSourceRecord | undefined;
  try {
    const stored = await rawStore.append({ request, content });
    record = stored;
    const parsed = await parser.parse({
      sourceId: stored.asset.id,
      title: stored.asset.title,
      uri: stored.asset.uri,
      format: stored.asset.format,
      mediaType: stored.asset.mediaType,
      content: stored.content
    });
    const parentNode = snapshot.graph.nodes.find((node) => node.id === parentNodeId)!;
    const outline = buildSourceOutlineSubgraph({ parentNode, source: stored.asset, parsed });
    outline.anchors.forEach((anchor) => rawStore.assertAnchorIntegrity(anchor));
    const registered = registerSource(snapshot, stored.asset.id, stored.asset, outline.anchors, request.requestedAt);
    const existingOutline = outline.nodes.length > 0
      && outline.nodes.every((node) => registered.graph.nodes.some((existing) => existing.id === node.id));
    const existingPending = registered.candidatePatches.find((patch) =>
      patch.status === "pending_review"
      && patch.action === "source"
      && patch.targetNodeId === parentNodeId
      && patch.operations.some((operation) => operation.kind === "create_node"
        && outline.nodes.some((node) => node.id === operation.node.id))
    );

    if (outline.nodes.length === 0 || existingOutline || existingPending) {
      return {
        snapshot: registered,
        ingest: {
          requestId: request.id,
          status: "parsed",
          source: stored.asset,
          sections: parsed.sections,
          parserId: parsed.parserId,
          warnings: parsed.warnings
        },
        patchId: existingPending?.id
      };
    }

    const { requestRecord, patch } = createSourceOutlinePatch(
      registered,
      request,
      parentNodeId,
      outline.nodes[0].id,
      stored.asset.title,
      sourceInventoryKind(stored.asset),
      outline.nodes.map((node, index): GraphPatchOperation => ({
        kind: "create_node",
        node,
        audit: createGraphPatchAudit(
          `audit-source-node-${sanitizeId(stored.asset.id)}-${index + 1}`,
          `Create a reviewable source outline node from immutable source ${stored.asset.id}`,
          request.requestedAt
        )
      })).concat(outline.edges.map((edge, index): GraphPatchOperation => ({
        kind: "create_edge",
        edge,
        audit: createGraphPatchAudit(
          `audit-source-edge-${sanitizeId(stored.asset.id)}-${index + 1}`,
          `Attach reviewed source outline structure for ${stored.asset.id}`,
          request.requestedAt
        )
      })))
    );
    const next = {
      ...registered,
      agentRequests: registered.agentRequests.concat(requestRecord),
      candidatePatches: registered.candidatePatches.concat(patch)
    };
    return {
      snapshot: next,
      ingest: {
        requestId: request.id,
        status: "parsed",
        source: stored.asset,
        sections: parsed.sections,
        parserId: parsed.parserId,
        warnings: parsed.warnings
      },
      patchId: patch.id
    };
  } catch (error) {
    return {
      snapshot,
      ingest: {
        requestId: request.id,
        status: "failed",
        source: record?.asset,
        sections: [],
        parserId: parser.id,
        warnings: [],
        error: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

export function resolveSourceReference(
  snapshot: KnowledgeWorkspaceSnapshot,
  reference: KnowledgeSourceRef
): SourceReferenceDetails | undefined {
  const source = snapshot.knowledgeSourceAssets.find((candidate) => candidate.id === reference.sourceId);
  const anchor = snapshot.sourceAnchors.find((candidate) => candidate.id === reference.anchorId);
  if (!source || !anchor || anchor.sourceId !== source.id) return undefined;
  return {
    sourceTitle: source.title,
    sourceUri: source.uri,
    locator: formatSourceLocator(anchor.locator),
    quote: anchor.quote,
    href: navigableSourceHref(source.uri, anchor)
  };
}

export function inferKnowledgeSourceFormat(fileName: string, mediaType = ""): KnowledgeSourceFormat {
  const normalizedName = fileName.toLowerCase();
  const normalizedMediaType = mediaType.toLowerCase();
  if (normalizedName.endsWith(".pdf") || normalizedMediaType === "application/pdf") return "pdf";
  if (normalizedName.endsWith(".md") || normalizedName.endsWith(".markdown") || normalizedMediaType === "text/markdown") {
    return "markdown";
  }
  return "text";
}

function registerSource(
  snapshot: KnowledgeWorkspaceSnapshot,
  sourceId: string,
  source: KnowledgeWorkspaceSnapshot["knowledgeSourceAssets"][number],
  anchors: SourceAnchor[],
  updatedAt: string
): KnowledgeWorkspaceSnapshot {
  const knowledgeSourceAssets = snapshot.knowledgeSourceAssets.some((candidate) => candidate.id === sourceId)
    ? snapshot.knowledgeSourceAssets
    : snapshot.knowledgeSourceAssets.concat(source);
  const existingAnchorIds = new Set(snapshot.sourceAnchors.map((anchor) => anchor.id));
  const sourceAnchors = snapshot.sourceAnchors.concat(anchors.filter((anchor) => !existingAnchorIds.has(anchor.id)));
  const subject = snapshot.project.subject.sourceAssetIds.includes(sourceId)
    ? snapshot.project.subject
    : { ...snapshot.project.subject, sourceAssetIds: snapshot.project.subject.sourceAssetIds.concat(sourceId) };
  const project = { ...snapshot.project, subject, updatedAt };
  return {
    ...snapshot,
    space: { ...snapshot.space, updatedAt },
    project,
    projects: snapshot.projects.map((candidate) => candidate.id === project.id ? project : candidate),
    subject,
    knowledgeSourceAssets,
    sourceAnchors
  };
}

function createSourceOutlinePatch(
  snapshot: KnowledgeWorkspaceSnapshot,
  ingestRequest: IngestRequest,
  targetNodeId: string,
  focusNodeId: string,
  sourceTitle: string,
  inventoryKind: KnowledgeSourceAsset["inventoryKind"],
  operations: GraphPatchOperation[]
): { requestRecord: AgentRequest; patch: CandidateGraphPatch } {
  const base = `source-${sanitizeId(targetNodeId)}-${sanitizeId(ingestRequest.sourceId)}`;
  const sequence = snapshot.candidatePatches.filter((patch) => patch.id.startsWith(`graph-patch-${base}`)).length + 1;
  const suffix = sequence === 1 ? "" : `-${sequence}`;
  const requestRecord: AgentRequest = {
    id: `agent-request-${base}${suffix}`,
    action: "source",
    selectionId: snapshot.selection.id,
    prompt: `从不可变${knowledgeInventoryItemKindLabels[inventoryKind ?? "document"]}「${sourceTitle}」生成第一层知识地图。`,
    status: "proposed",
    createdAt: ingestRequest.requestedAt
  };
  const patch: CandidateGraphPatch = {
    id: `graph-patch-${base}${suffix}`,
    requestId: requestRecord.id,
    action: "source",
    targetNodeId,
    focusNodeId,
    title: `导入「${sourceTitle}」的第一层地图`,
    summary: `根据${knowledgeInventoryItemKindLabels[inventoryKind ?? "document"]}内容生成 ${operations.filter((operation) => operation.kind === "create_node").length} 个带来源定位的候选节点。`,
    revision: 1,
    createdBy: "agent",
    operations,
    confidence: 0.9,
    status: "pending_review",
    createdAt: ingestRequest.requestedAt
  };
  return { requestRecord, patch };
}

function defaultIngestParentNodeId(snapshot: KnowledgeWorkspaceSnapshot): string {
  if (snapshot.project.mode !== "systematize") return snapshot.project.subject.rootNodeId;
  const rootId = snapshot.project.subject.rootNodeId;
  return snapshot.graph.edges
    .filter((edge) => edge.kind === "contains" && edge.fromNodeId === rootId)
    .map((edge) => snapshot.graph.nodes.find((node) => node.id === edge.toNodeId))
    .find((node) => node?.id.endsWith("-inventory") || node?.title === "知识清单")?.id ?? rootId;
}

function assertIngestScope(
  snapshot: KnowledgeWorkspaceSnapshot,
  request: IngestRequest,
  parentNodeId: string
): void {
  if (!isProjectWritable(snapshot)) throw new Error("Completed Project must be reopened before importing more sources");
  if (request.projectId !== snapshot.project.id) throw new Error("Ingest request projectId does not match the active project");
  if (request.spaceId !== snapshot.space.id) throw new Error("Ingest request spaceId does not match the active knowledge space");
  if (!snapshot.graph.nodes.some((node) => node.id === parentNodeId)) throw new Error(`Ingest parent node does not exist: ${parentNodeId}`);
}

function navigableSourceHref(uri: string, anchor: SourceAnchor): string | undefined {
  let protocol: string;
  try {
    protocol = new URL(uri).protocol;
  } catch {
    return undefined;
  }
  if (!new Set(["http:", "https:", "file:"]).has(protocol)) return undefined;
  if (anchor.locator.kind === "uri") return anchor.locator.fragment
    ? `${anchor.locator.uri}#${anchor.locator.fragment}`
    : anchor.locator.uri;
  if (anchor.locator.kind === "pdf") return `${uri}#page=${anchor.locator.page}`;
  return uri;
}

function sanitizeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "source";
}
