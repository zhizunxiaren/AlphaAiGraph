import type {
  KnowledgeEdge,
  KnowledgeNode,
  KnowledgeNodeKind,
  KnowledgeRelationKind,
  KnowledgeWorkspaceSnapshot
} from "../types";

export interface KnowledgeQueryScope {
  projectIds?: readonly string[];
  includeUniversal?: boolean;
  includeArchived?: boolean;
  relationKinds?: readonly KnowledgeRelationKind[];
}

export type KnowledgeTraversalDirection = "both" | "incoming" | "outgoing";

export interface LocalNeighborhoodInput extends KnowledgeQueryScope {
  focusNodeId: string;
  depth?: number;
  direction?: KnowledgeTraversalDirection;
  maxNodes?: number;
}

export interface LocalNeighborhoodResult {
  graphUpdatedAt: string;
  focusNode: KnowledgeNode;
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  distances: Record<string, number>;
  truncated: boolean;
}

export interface ShortestKnowledgePathInput extends KnowledgeQueryScope {
  fromNodeId: string;
  toNodeId: string;
  direction?: KnowledgeTraversalDirection;
  maxHops?: number;
}

export interface ShortestKnowledgePath {
  graphUpdatedAt: string;
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  hopCount: number;
}

export interface KnowledgeCluster {
  id: string;
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  projectIds: string[];
}

export interface DeriveKnowledgeClustersInput extends KnowledgeQueryScope {
  includeSingletons?: boolean;
}

export type KnowledgeSearchField = "title" | "summary" | "tags" | "kind" | "source_quote";

export interface KnowledgeSearchInput extends KnowledgeQueryScope {
  query: string;
  kinds?: readonly KnowledgeNodeKind[];
  limit?: number;
}

export interface KnowledgeSearchResult {
  node: KnowledgeNode;
  score: number;
  matchedFields: KnowledgeSearchField[];
  matchedTerms: string[];
}

export interface KnowledgeNodePageInput extends KnowledgeQueryScope {
  cursor?: string;
  pageSize?: number;
}

export interface KnowledgeNodePage {
  graphUpdatedAt: string;
  nodes: KnowledgeNode[];
  totalCount: number;
  nextCursor?: string;
}

export interface ReusableKnowledgeInput {
  targetProjectId: string;
  query?: string;
  kinds?: readonly KnowledgeNodeKind[];
  limit?: number;
  includeAlreadyShared?: boolean;
}

export interface ReusableKnowledgeResult extends KnowledgeSearchResult {
  sourceProjectIds: string[];
  alreadyShared: boolean;
  reuseMode: "shared_reference";
}

/** Returns canonical active nodes visible in the explicit Project query scope. */
export function knowledgeNodesInScope(
  snapshot: KnowledgeWorkspaceSnapshot,
  scope: KnowledgeQueryScope = {}
): KnowledgeNode[] {
  const projectIds = resolveProjectIds(snapshot, scope.projectIds);
  const projectRootIds = new Set(snapshot.projects
    .filter((project) => projectIds.has(project.id))
    .map((project) => project.subject.rootNodeId));
  const includeUniversal = scope.includeUniversal ?? true;
  return snapshot.graph.nodes.filter((node) =>
    (scope.includeArchived || node.status !== "archived")
    && (projectRootIds.has(node.id)
      || (includeUniversal && node.scope.kind === "universal")
      || node.scope.contextIds.some((id) => projectIds.has(id))))
    .sort(compareNodes);
}

/** Deterministic cursor pagination over canonical nodes; cursors expire with graph.updatedAt or scope changes. */
export function queryKnowledgeNodePage(
  snapshot: KnowledgeWorkspaceSnapshot,
  input: KnowledgeNodePageInput = {}
): KnowledgeNodePage {
  const pageSize = input.pageSize ?? 24;
  requirePositiveInteger(pageSize, "Knowledge node pageSize");
  const signature = scopeSignature(snapshot, input);
  const offset = input.cursor ? decodePageCursor(input.cursor, snapshot.graph.updatedAt, signature) : 0;
  const nodes = knowledgeNodesInScope(snapshot, input);
  if (offset > nodes.length) throw new Error("Knowledge node cursor offset is outside the current scope");
  const pageNodes = nodes.slice(offset, offset + pageSize);
  const nextOffset = offset + pageNodes.length;
  return {
    graphUpdatedAt: snapshot.graph.updatedAt,
    nodes: pageNodes,
    totalCount: nodes.length,
    nextCursor: nextOffset < nodes.length
      ? encodePageCursor({ graphUpdatedAt: snapshot.graph.updatedAt, signature, offset: nextOffset })
      : undefined
  };
}

export function queryLocalNeighborhood(
  snapshot: KnowledgeWorkspaceSnapshot,
  input: LocalNeighborhoodInput
): LocalNeighborhoodResult {
  const depth = input.depth ?? 1;
  const maxNodes = input.maxNodes ?? 100;
  requireNonNegativeInteger(depth, "Local neighborhood depth");
  requirePositiveInteger(maxNodes, "Local neighborhood maxNodes");
  const scoped = scopedGraph(snapshot, input);
  const focusNode = scoped.nodesById.get(input.focusNodeId);
  if (!focusNode) throw new Error(`Knowledge neighborhood focus is unavailable in scope: ${input.focusNodeId}`);
  const distances = traverseDistances(
    input.focusNodeId,
    scoped,
    input.direction ?? "both",
    depth
  );
  const orderedIds = Array.from(distances).sort((left, right) =>
    left[1] - right[1] || compareText(left[0], right[0])).map(([id]) => id);
  const selectedIds = new Set(orderedIds.slice(0, maxNodes));
  const nodes = orderedIds.slice(0, maxNodes).map((id) => scoped.nodesById.get(id)!);
  return {
    graphUpdatedAt: snapshot.graph.updatedAt,
    focusNode,
    nodes,
    edges: scoped.edges.filter((edge) => selectedIds.has(edge.fromNodeId) && selectedIds.has(edge.toNodeId)),
    distances: Object.fromEntries(nodes.map((node) => [node.id, distances.get(node.id)!])),
    truncated: orderedIds.length > maxNodes
  };
}

export function findShortestKnowledgePath(
  snapshot: KnowledgeWorkspaceSnapshot,
  input: ShortestKnowledgePathInput
): ShortestKnowledgePath | undefined {
  const maxHops = input.maxHops ?? Number.POSITIVE_INFINITY;
  if (maxHops !== Number.POSITIVE_INFINITY) requireNonNegativeInteger(maxHops, "Shortest path maxHops");
  const scoped = scopedGraph(snapshot, input);
  const from = scoped.nodesById.get(input.fromNodeId);
  const to = scoped.nodesById.get(input.toNodeId);
  if (!from) throw new Error(`Shortest path start is unavailable in scope: ${input.fromNodeId}`);
  if (!to) throw new Error(`Shortest path target is unavailable in scope: ${input.toNodeId}`);
  if (from.id === to.id) {
    return { graphUpdatedAt: snapshot.graph.updatedAt, nodes: [from], edges: [], hopCount: 0 };
  }
  const direction = input.direction ?? "both";
  const queue: Array<{ nodeId: string; distance: number }> = [{ nodeId: from.id, distance: 0 }];
  let queueIndex = 0;
  const visited = new Set([from.id]);
  const predecessor = new Map<string, { nodeId: string; edge: KnowledgeEdge }>();
  while (queueIndex < queue.length) {
    const current = queue[queueIndex++];
    if (current.distance >= maxHops) continue;
    for (const step of adjacentSteps(current.nodeId, scoped, direction)) {
      if (visited.has(step.nodeId)) continue;
      visited.add(step.nodeId);
      predecessor.set(step.nodeId, { nodeId: current.nodeId, edge: step.edge });
      if (step.nodeId === to.id) return rebuildPath(snapshot.graph.updatedAt, from.id, to.id, predecessor, scoped.nodesById);
      queue.push({ nodeId: step.nodeId, distance: current.distance + 1 });
    }
  }
  return undefined;
}

/** Deterministic weakly connected components; no statistical clustering is implied. */
export function deriveKnowledgeClusters(
  snapshot: KnowledgeWorkspaceSnapshot,
  input: DeriveKnowledgeClustersInput = {}
): KnowledgeCluster[] {
  const scoped = scopedGraph(snapshot, input);
  const projectIds = new Set(snapshot.projects.map((project) => project.id));
  const unvisited = new Set(scoped.nodes.map((node) => node.id));
  const clusters: KnowledgeCluster[] = [];
  while (unvisited.size > 0) {
    const firstId = Array.from(unvisited).sort(compareText)[0];
    const componentIds = new Set<string>();
    const queue = [firstId];
    let queueIndex = 0;
    unvisited.delete(firstId);
    while (queueIndex < queue.length) {
      const current = queue[queueIndex++];
      componentIds.add(current);
      for (const step of adjacentSteps(current, scoped, "both")) {
        if (!unvisited.has(step.nodeId)) continue;
        unvisited.delete(step.nodeId);
        queue.push(step.nodeId);
      }
    }
    if (componentIds.size === 1 && input.includeSingletons === false) continue;
    const nodes = scoped.nodes.filter((node) => componentIds.has(node.id));
    clusters.push({
      id: `cluster:${nodes[0].id}`,
      nodes,
      edges: scoped.edges.filter((edge) => componentIds.has(edge.fromNodeId) && componentIds.has(edge.toNodeId)),
      projectIds: Array.from(new Set(nodes.flatMap((node) =>
        node.scope.contextIds.filter((id) => projectIds.has(id))))).sort(compareText)
    });
  }
  return clusters.sort((left, right) => right.nodes.length - left.nodes.length || compareText(left.id, right.id));
}

/** Explainable lexical full-text search. BM25/embedding evaluation belongs to the next plan item. */
export function searchKnowledgeGraph(
  snapshot: KnowledgeWorkspaceSnapshot,
  input: KnowledgeSearchInput
): KnowledgeSearchResult[] {
  const query = normalizeText(input.query);
  if (!query) return [];
  const limit = input.limit ?? 20;
  requirePositiveInteger(limit, "Knowledge search limit");
  const kinds = input.kinds ? new Set(input.kinds) : undefined;
  return knowledgeNodesInScope(snapshot, input)
    .filter((node) => !kinds || kinds.has(node.kind))
    .map((node) => scoreNode(node, query))
    .filter((result): result is KnowledgeSearchResult => result !== undefined)
    .sort((left, right) => right.score - left.score || compareText(left.node.id, right.node.id))
    .slice(0, limit);
}

/** Scores one canonical node with the exact lexical policy used by production search. */
export function scoreKnowledgeNodeLexically(
  node: KnowledgeNode,
  query: string
): KnowledgeSearchResult | undefined {
  const normalizedQuery = normalizeText(query);
  return normalizedQuery ? scoreNode(node, normalizedQuery) : undefined;
}

/** Finds canonical nodes owned by other Projects; results are references, never copies. */
export function findReusableKnowledge(
  snapshot: KnowledgeWorkspaceSnapshot,
  input: ReusableKnowledgeInput
): ReusableKnowledgeResult[] {
  const target = snapshot.projects.find((project) => project.id === input.targetProjectId);
  if (!target) throw new Error(`Reuse target Project is unavailable: ${input.targetProjectId}`);
  const limit = input.limit ?? 20;
  requirePositiveInteger(limit, "Reusable knowledge limit");
  const knownProjectIds = new Set(snapshot.projects.map((project) => project.id));
  const projectRootIds = new Set(snapshot.projects.map((project) => project.subject.rootNodeId));
  const kinds = input.kinds ? new Set(input.kinds) : undefined;
  const query = normalizeText(input.query ?? "");
  return snapshot.graph.nodes
    .filter((node) => node.status !== "archived" && node.scope.kind === "project" && !projectRootIds.has(node.id))
    .flatMap((node): ReusableKnowledgeResult[] => {
      const sourceProjectIds = node.scope.contextIds
        .filter((id) => knownProjectIds.has(id) && id !== target.id)
        .sort(compareText);
      const alreadyShared = node.scope.contextIds.includes(target.id);
      if (sourceProjectIds.length === 0 || (alreadyShared && !input.includeAlreadyShared) || (kinds && !kinds.has(node.kind))) return [];
      const scored = query ? scoreNode(node, query) : emptySearchResult(node);
      return scored ? [{ ...scored, sourceProjectIds, alreadyShared, reuseMode: "shared_reference" }] : [];
    })
    .sort((left, right) => right.score - left.score || compareText(left.node.id, right.node.id))
    .slice(0, limit);
}

interface ScopedKnowledgeGraph {
  nodes: KnowledgeNode[];
  nodesById: Map<string, KnowledgeNode>;
  edges: KnowledgeEdge[];
  outgoingByNodeId: Map<string, Array<{ nodeId: string; edge: KnowledgeEdge }>>;
  incomingByNodeId: Map<string, Array<{ nodeId: string; edge: KnowledgeEdge }>>;
}

interface CachedScopedKnowledgeGraph {
  graphUpdatedAt: string;
  nodeCount: number;
  edgeCount: number;
  scoped: ScopedKnowledgeGraph;
}

const scopedGraphCache = new WeakMap<KnowledgeWorkspaceSnapshot["graph"], Map<string, CachedScopedKnowledgeGraph>>();

function scopedGraph(snapshot: KnowledgeWorkspaceSnapshot, scope: KnowledgeQueryScope): ScopedKnowledgeGraph {
  const signature = scopeSignature(snapshot, scope);
  let graphCache = scopedGraphCache.get(snapshot.graph);
  if (!graphCache) {
    graphCache = new Map();
    scopedGraphCache.set(snapshot.graph, graphCache);
  }
  const cached = graphCache.get(signature);
  if (cached
    && cached.graphUpdatedAt === snapshot.graph.updatedAt
    && cached.nodeCount === snapshot.graph.nodes.length
    && cached.edgeCount === snapshot.graph.edges.length) return cached.scoped;
  const nodes = knowledgeNodesInScope(snapshot, scope);
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const relationKinds = scope.relationKinds ? new Set(scope.relationKinds) : undefined;
  const edges = snapshot.graph.edges
    .filter((edge) => nodesById.has(edge.fromNodeId) && nodesById.has(edge.toNodeId)
      && (!relationKinds || relationKinds.has(edge.kind)))
    .sort(compareEdges);
  const outgoingByNodeId = new Map<string, Array<{ nodeId: string; edge: KnowledgeEdge }>>();
  const incomingByNodeId = new Map<string, Array<{ nodeId: string; edge: KnowledgeEdge }>>();
  for (const edge of edges) {
    appendStep(outgoingByNodeId, edge.fromNodeId, { nodeId: edge.toNodeId, edge });
    appendStep(incomingByNodeId, edge.toNodeId, { nodeId: edge.fromNodeId, edge });
  }
  const scoped = { nodes, nodesById, edges, outgoingByNodeId, incomingByNodeId };
  graphCache.set(signature, {
    graphUpdatedAt: snapshot.graph.updatedAt,
    nodeCount: snapshot.graph.nodes.length,
    edgeCount: snapshot.graph.edges.length,
    scoped
  });
  return scoped;
}

function traverseDistances(
  startNodeId: string,
  scoped: ScopedKnowledgeGraph,
  direction: KnowledgeTraversalDirection,
  maxDepth: number
): Map<string, number> {
  const distances = new Map([[startNodeId, 0]]);
  const queue = [startNodeId];
  let queueIndex = 0;
  while (queueIndex < queue.length) {
    const current = queue[queueIndex++];
    const distance = distances.get(current)!;
    if (distance >= maxDepth) continue;
    for (const step of adjacentSteps(current, scoped, direction)) {
      if (distances.has(step.nodeId)) continue;
      distances.set(step.nodeId, distance + 1);
      queue.push(step.nodeId);
    }
  }
  return distances;
}

function adjacentSteps(
  nodeId: string,
  scoped: ScopedKnowledgeGraph,
  direction: KnowledgeTraversalDirection
): Array<{ nodeId: string; edge: KnowledgeEdge }> {
  const outgoing = direction === "incoming" ? [] : scoped.outgoingByNodeId.get(nodeId) ?? [];
  const incoming = direction === "outgoing" ? [] : scoped.incomingByNodeId.get(nodeId) ?? [];
  return outgoing.concat(incoming)
    .sort((left, right) => compareText(left.edge.id, right.edge.id) || compareText(left.nodeId, right.nodeId));
}

function appendStep(
  index: Map<string, Array<{ nodeId: string; edge: KnowledgeEdge }>>,
  nodeId: string,
  step: { nodeId: string; edge: KnowledgeEdge }
): void {
  const steps = index.get(nodeId);
  if (steps) steps.push(step);
  else index.set(nodeId, [step]);
}

interface KnowledgePageCursor {
  graphUpdatedAt: string;
  signature: string;
  offset: number;
}

function encodePageCursor(cursor: KnowledgePageCursor): string {
  return `kgp1.${encodeURIComponent(JSON.stringify(cursor))}`;
}

function decodePageCursor(cursor: string, graphUpdatedAt: string, signature: string): number {
  if (!cursor.startsWith("kgp1.")) throw new Error("Knowledge node cursor has an unsupported version");
  let parsed: KnowledgePageCursor;
  try {
    parsed = JSON.parse(decodeURIComponent(cursor.slice(5))) as KnowledgePageCursor;
  } catch {
    throw new Error("Knowledge node cursor is malformed");
  }
  if (parsed.graphUpdatedAt !== graphUpdatedAt) throw new Error("Knowledge node cursor expired because the graph changed");
  if (parsed.signature !== signature) throw new Error("Knowledge node cursor cannot be reused with a different scope");
  if (!Number.isInteger(parsed.offset) || parsed.offset < 0) throw new Error("Knowledge node cursor offset is invalid");
  return parsed.offset;
}

function scopeSignature(snapshot: KnowledgeWorkspaceSnapshot, scope: KnowledgeQueryScope): string {
  return JSON.stringify({
    projectIds: Array.from(resolveProjectIds(snapshot, scope.projectIds)).sort(compareText),
    includeUniversal: scope.includeUniversal ?? true,
    includeArchived: scope.includeArchived ?? false,
    relationKinds: scope.relationKinds ? Array.from(new Set(scope.relationKinds)).sort(compareText) : []
  });
}

function rebuildPath(
  graphUpdatedAt: string,
  fromNodeId: string,
  toNodeId: string,
  predecessor: Map<string, { nodeId: string; edge: KnowledgeEdge }>,
  nodesById: Map<string, KnowledgeNode>
): ShortestKnowledgePath {
  const nodeIds = [toNodeId];
  const edges: KnowledgeEdge[] = [];
  let current = toNodeId;
  while (current !== fromNodeId) {
    const previous = predecessor.get(current)!;
    edges.push(previous.edge);
    current = previous.nodeId;
    nodeIds.push(current);
  }
  nodeIds.reverse();
  edges.reverse();
  return { graphUpdatedAt, nodes: nodeIds.map((id) => nodesById.get(id)!), edges, hopCount: edges.length };
}

function scoreNode(node: KnowledgeNode, normalizedQuery: string): KnowledgeSearchResult | undefined {
  const terms = uniqueTerms(normalizedQuery);
  if (terms.length === 0) return undefined;
  const fields: Record<KnowledgeSearchField, string> = {
    title: normalizeText(node.title),
    summary: normalizeText(node.summary),
    tags: normalizeText(node.tags.join(" ")),
    kind: normalizeText(node.kind.replaceAll("_", " ")),
    source_quote: normalizeText(node.sourceRefs.map((ref) => ref.quote ?? "").join(" "))
  };
  const matchedFields = new Set<KnowledgeSearchField>();
  const matchedTerms = new Set<string>();
  let score = 0;
  const compactQuery = compact(normalizedQuery);
  if (fields.title === normalizedQuery) {
    score += 100;
    matchedFields.add("title");
  } else if (compact(fields.title).includes(compactQuery)) {
    score += 40;
    matchedFields.add("title");
  }
  const weights: Record<KnowledgeSearchField, number> = { title: 12, summary: 5, tags: 3, kind: 2, source_quote: 2 };
  for (const term of terms) {
    for (const field of Object.keys(fields) as KnowledgeSearchField[]) {
      if (!compact(fields[field]).includes(compact(term))) continue;
      score += weights[field];
      matchedFields.add(field);
      matchedTerms.add(term);
    }
  }
  if (matchedTerms.size === 0) return undefined;
  score += Math.round(matchedTerms.size / terms.length * 10);
  return {
    node,
    score,
    matchedFields: Array.from(matchedFields).sort(compareText),
    matchedTerms: Array.from(matchedTerms).sort(compareText)
  };
}

function emptySearchResult(node: KnowledgeNode): KnowledgeSearchResult {
  return { node, score: 0, matchedFields: [], matchedTerms: [] };
}

function resolveProjectIds(snapshot: KnowledgeWorkspaceSnapshot, requested?: readonly string[]): Set<string> {
  const values = requested ?? [snapshot.project.id];
  const known = new Set(snapshot.projects.map((project) => project.id));
  for (const id of values) {
    if (!known.has(id)) throw new Error(`Knowledge query Project is unavailable: ${id}`);
  }
  return new Set(values);
}

function uniqueTerms(value: string): string[] {
  return Array.from(new Set(value.match(/[\p{L}\p{N}]+/gu) ?? [])).sort(compareText);
}

function normalizeText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/g, " ").trim();
}

function compact(value: string): string {
  return value.replace(/[\s\p{P}\p{S}_]+/gu, "");
}

function requirePositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`);
}

function requireNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`);
}

function compareNodes(left: KnowledgeNode, right: KnowledgeNode): number {
  return compareText(left.id, right.id);
}

function compareEdges(left: KnowledgeEdge, right: KnowledgeEdge): number {
  return compareText(left.id, right.id);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
