import type {
  KnowledgeInventory,
  KnowledgeInventoryItem,
  KnowledgeInventoryItemKind,
  KnowledgeSourceAsset,
  KnowledgeWorkspaceSnapshot
} from "../types";

export const knowledgeInventoryItemKindLabels: Record<KnowledgeInventoryItemKind, string> = {
  note: "用户笔记",
  document: "文档",
  bookmark_index: "收藏索引",
  experience: "经验陈述"
};

export function sourceInventoryKind(source: KnowledgeSourceAsset): KnowledgeInventoryItemKind {
  return source.inventoryKind ?? "document";
}

/**
 * Rebuilds a Project's inventory from immutable source versions and graph
 * references. Nothing is stored outside the source registry and primary graph.
 */
export function deriveKnowledgeInventory(snapshot: KnowledgeWorkspaceSnapshot): KnowledgeInventory {
  const projectSourceIds = new Set(snapshot.project.subject.sourceAssetIds);
  const projectSources = snapshot.knowledgeSourceAssets.filter((source) => projectSourceIds.has(source.id));
  const versionsByLogicalId = new Map<string, KnowledgeSourceAsset[]>();
  for (const source of projectSources) {
    const versions = versionsByLogicalId.get(source.logicalSourceId) ?? [];
    versions.push(source);
    versionsByLogicalId.set(source.logicalSourceId, versions);
  }

  const items = Array.from(versionsByLogicalId.entries()).map(([logicalSourceId, versions]) => {
    const orderedVersions = [...versions].sort(compareSourceVersions);
    const latest = orderedVersions.at(-1)!;
    const versionIds = new Set(orderedVersions.map((source) => source.id));
    const linkedNodeIds = snapshot.graph.nodes
      .filter((node) => node.sourceRefs.some((reference) => versionIds.has(reference.sourceId)))
      .map((node) => node.id)
      .sort(compareText);
    const pendingNodeIds = snapshot.candidatePatches
      .filter((patch) => patch.status === "pending_review")
      .flatMap((patch) => patch.operations)
      .filter((operation) => operation.kind === "create_node"
        && operation.node.sourceRefs.some((reference) => versionIds.has(reference.sourceId)))
      .map((operation) => operation.kind === "create_node" ? operation.node.id : "")
      .filter(Boolean)
      .sort(compareText);
    const uniquePendingNodeIds = Array.from(new Set(pendingNodeIds));
    const reviewState = uniquePendingNodeIds.length > 0
      ? "pending_review" as const
      : linkedNodeIds.length > 0
        ? "mapped" as const
        : "unmapped" as const;

    return {
      logicalSourceId,
      latestSourceId: latest.id,
      kind: sourceInventoryKind(latest),
      title: latest.title,
      uri: latest.uri,
      format: latest.format,
      versionCount: orderedVersions.length,
      latestVersion: latest.version,
      importedAt: latest.createdAt,
      reviewState,
      linkedNodeIds,
      pendingNodeIds: uniquePendingNodeIds,
      anchorCount: snapshot.sourceAnchors.filter((anchor) => anchor.sourceId === latest.id).length
    } satisfies KnowledgeInventoryItem;
  }).sort(compareInventoryItems);

  const counts: KnowledgeInventory["counts"] = {
    note: 0,
    document: 0,
    bookmark_index: 0,
    experience: 0
  };
  for (const item of items) counts[item.kind] += 1;

  return {
    projectId: snapshot.project.id,
    items,
    counts,
    mappedItemCount: items.filter((item) => item.reviewState === "mapped").length,
    pendingReviewItemCount: items.filter((item) => item.reviewState === "pending_review").length,
    unmappedItemCount: items.filter((item) => item.reviewState === "unmapped").length
  };
}

function compareSourceVersions(left: KnowledgeSourceAsset, right: KnowledgeSourceAsset): number {
  return left.version - right.version || compareText(left.id, right.id);
}

function compareInventoryItems(left: KnowledgeInventoryItem, right: KnowledgeInventoryItem): number {
  return compareText(left.kind, right.kind)
    || compareText(left.title, right.title)
    || compareText(left.logicalSourceId, right.logicalSourceId);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
