import type { ResearchMap, ResearchNode } from "../types";

export interface ResearchMapIndexes {
  nodesById: Map<string, ResearchNode>;
  childNodeIdsByParentId: Map<string, string[]>;
  childrenByParentId: (parentNodeId: string) => ResearchNode[];
}

export function createResearchMapIndexes(map: ResearchMap): ResearchMapIndexes {
  const nodesById = new Map(map.nodes.map((node) => [node.id, node]));
  const childNodeIdsByParentId = new Map<string, string[]>();

  for (const node of map.nodes) {
    if (!node.parentNodeId) continue;
    childNodeIdsByParentId.set(node.parentNodeId, [
      ...(childNodeIdsByParentId.get(node.parentNodeId) ?? []),
      node.id,
    ]);
  }

  return {
    nodesById,
    childNodeIdsByParentId,
    childrenByParentId: (parentNodeId) =>
      (childNodeIdsByParentId.get(parentNodeId) ?? [])
        .map((nodeId) => nodesById.get(nodeId))
        .filter((node): node is ResearchNode => Boolean(node)),
  };
}
