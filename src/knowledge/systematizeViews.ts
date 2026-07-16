import type {
  EpistemicStatus,
  KnowledgeEdge,
  KnowledgeNode,
  KnowledgeNodeKind,
  KnowledgeNodeStatus,
  KnowledgeRelationKind,
  KnowledgeSourceStatus,
  KnowledgeViewKind,
  KnowledgeWorkspaceSnapshot
} from "../types";

export const systematizeArtifactViewKinds = [
  "knowledge_modules",
  "skill_tree",
  "learning_dependencies",
  "learning_path",
  "practice_manual"
] as const satisfies readonly KnowledgeViewKind[];

export type SystematizeArtifactViewKind = typeof systematizeArtifactViewKinds[number];

export interface SystematizeProjectionNode {
  nodeId: string;
  title: string;
  summary: string;
  kind: KnowledgeNodeKind;
  status: KnowledgeNodeStatus;
  epistemicStatus: EpistemicStatus;
  sourceStatus: KnowledgeSourceStatus;
  depth: number;
  tags: string[];
}

export interface SystematizeProjectionLink {
  edgeId: string;
  fromNodeId: string;
  toNodeId: string;
  relationKind: KnowledgeRelationKind;
  label: string;
}

export interface SystematizeProjectionGroup {
  id: string;
  title: string;
  description: string;
  nodeIds: string[];
}

export interface SystematizeProjectionMetric {
  id: string;
  label: string;
  value: number;
}

export interface SystematizeViewProjection {
  kind: SystematizeArtifactViewKind;
  title: string;
  description: string;
  sourceGraphUpdatedAt: string;
  nodes: SystematizeProjectionNode[];
  links: SystematizeProjectionLink[];
  groups: SystematizeProjectionGroup[];
  metrics: SystematizeProjectionMetric[];
  sequence: string[];
  cycleNodeIds: string[];
  emptyMessage?: string;
}

const viewCopy: Record<SystematizeArtifactViewKind, { title: string; description: string }> = {
  knowledge_modules: {
    title: "知识模块",
    description: "按根主题下的正式 contains 层级组织知识，不复制节点。"
  },
  skill_tree: {
    title: "技能树",
    description: "聚合技能、实践和经验节点，并保留显式层级与依赖。"
  },
  learning_dependencies: {
    title: "学习依赖",
    description: "只展示正式 depends_on 关系，并把问题与不确定性列为阻塞项。"
  },
  learning_path: {
    title: "学习路径",
    description: "根据 depends_on 与 precedes 关系生成可解释顺序；循环依赖会明确标记。"
  },
  practice_manual: {
    title: "实践手册",
    description: "把方法、原则、判断规则、适用范围、证据和开放问题组织为可维护章节。"
  }
};

const relationLabels: Partial<Record<KnowledgeRelationKind, string>> = {
  contains: "包含",
  depends_on: "依赖",
  precedes: "先于",
  valid_in_context: "适用于",
  supports: "支持",
  contradicts: "反对",
  derived_from: "来源于"
};

export function isSystematizeArtifactViewKind(kind: KnowledgeViewKind): kind is SystematizeArtifactViewKind {
  return systematizeArtifactViewKinds.includes(kind as SystematizeArtifactViewKind);
}

export function deriveSystematizeViewProjection(
  snapshot: KnowledgeWorkspaceSnapshot,
  kind: SystematizeArtifactViewKind,
  rootNodeId = snapshot.project.subject.rootNodeId
): SystematizeViewProjection {
  const activeNodes = snapshot.graph.nodes.filter((node) => node.status !== "archived");
  const activeNodeIds = new Set(activeNodes.map((node) => node.id));
  const edges = snapshot.graph.edges.filter((edge) => activeNodeIds.has(edge.fromNodeId) && activeNodeIds.has(edge.toNodeId));
  const base = { kind, ...viewCopy[kind], sourceGraphUpdatedAt: snapshot.graph.updatedAt };
  if (kind === "knowledge_modules") return knowledgeModules(base, activeNodes, edges, rootNodeId);
  if (kind === "skill_tree") return skillTree(base, activeNodes, edges);
  if (kind === "learning_dependencies") return learningDependencies(base, activeNodes, edges);
  if (kind === "learning_path") return learningPath(base, activeNodes, edges);
  return practiceManual(base, activeNodes, edges);
}

function knowledgeModules(
  base: ProjectionBase,
  nodes: KnowledgeNode[],
  edges: KnowledgeEdge[],
  rootNodeId: string
): SystematizeViewProjection {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const childrenById = childIndex(edges);
  const moduleRoots = (childrenById.get(rootNodeId) ?? [])
    .map((id) => nodesById.get(id))
    .filter((node): node is KnowledgeNode => Boolean(node))
    .sort(compareNode);
  const assigned = new Set<string>();
  const groups = moduleRoots.map((moduleRoot) => {
    const nodeIds = descendants(moduleRoot.id, childrenById).filter((id) => nodesById.has(id));
    nodeIds.forEach((id) => assigned.add(id));
    return {
      id: `module-${moduleRoot.id}`,
      title: moduleRoot.title,
      description: moduleRoot.summary,
      nodeIds
    };
  });
  const crossCutting = nodes.filter((node) => node.id !== rootNodeId && !assigned.has(node.id)).sort(compareNode);
  if (crossCutting.length > 0) {
    groups.push({
      id: "module-cross-cutting",
      title: "跨模块知识",
      description: "尚未归入根主题 contains 层级，但仍属于当前正式图的知识。",
      nodeIds: crossCutting.map((node) => node.id)
    });
  }
  const visibleIds = new Set(groups.flatMap((group) => group.nodeIds));
  const projectionNodes = nodes.filter((node) => visibleIds.has(node.id)).sort(compareNode).map(toProjectionNode);
  return {
    ...base,
    nodes: projectionNodes,
    links: projectionLinks(edges.filter((edge) => edge.kind === "contains"), visibleIds),
    groups,
    metrics: [
      metric("modules", "模块", moduleRoots.length),
      metric("knowledge", "模块内知识", projectionNodes.length),
      metric("gaps", "问题与不确定性", projectionNodes.filter((node) => node.kind === "question" || node.kind === "uncertainty").length)
    ],
    sequence: [],
    cycleNodeIds: [],
    ...(groups.length === 0 ? { emptyMessage: "当前还没有根主题下的模块层级；先接受包含关系或从知识结构继续下钻。" } : {})
  };
}

function skillTree(base: ProjectionBase, nodes: KnowledgeNode[], edges: KnowledgeEdge[]): SystematizeViewProjection {
  const skillKinds = new Set<KnowledgeNodeKind>(["skill", "practice", "experience"]);
  const selected = nodes.filter((node) => skillKinds.has(node.kind)).sort(compareNode);
  const selectedIds = new Set(selected.map((node) => node.id));
  const groupDefinitions: Array<[string, string, string, KnowledgeNodeKind]> = [
    ["skills", "技能", "可培养、可组合的能力。", "skill"],
    ["practices", "实践方法", "把技能落实为可重复做法。", "practice"],
    ["experiences", "经验与例外", "来自真实场景的经验判断。", "experience"]
  ];
  const groups = groupDefinitions.map(([id, title, description, nodeKind]) => ({
    id,
    title,
    description,
    nodeIds: selected.filter((node) => node.kind === nodeKind).map((node) => node.id)
  })).filter((group) => group.nodeIds.length > 0);
  return {
    ...base,
    nodes: selected.map(toProjectionNode),
    links: projectionLinks(edges.filter((edge) => edge.kind === "contains" || edge.kind === "depends_on"), selectedIds),
    groups,
    metrics: [
      metric("skills", "技能", selected.filter((node) => node.kind === "skill").length),
      metric("practices", "实践", selected.filter((node) => node.kind === "practice").length),
      metric("experiences", "经验", selected.filter((node) => node.kind === "experience").length)
    ],
    sequence: [],
    cycleNodeIds: [],
    ...(selected.length === 0 ? { emptyMessage: "当前正式图中还没有 skill、practice 或 experience 节点；可通过访谈外化实际做法和经验。" } : {})
  };
}

function learningDependencies(base: ProjectionBase, nodes: KnowledgeNode[], edges: KnowledgeEdge[]): SystematizeViewProjection {
  const dependencyEdges = edges.filter((edge) => edge.kind === "depends_on").sort(compareEdge);
  const dependencyIds = new Set(dependencyEdges.flatMap((edge) => [edge.fromNodeId, edge.toNodeId]));
  const blockers = nodes.filter((node) => node.kind === "question" || node.kind === "uncertainty").sort(compareNode);
  const selected = nodes.filter((node) => dependencyIds.has(node.id) || blockers.some((blocker) => blocker.id === node.id)).sort(compareNode);
  const selectedIds = new Set(selected.map((node) => node.id));
  const groups: SystematizeProjectionGroup[] = [];
  if (dependencyIds.size > 0) groups.push({
    id: "dependencies",
    title: "显式依赖网络",
    description: "箭头语义为“前者 depends_on 后者”；后者应优先掌握。",
    nodeIds: selected.filter((node) => dependencyIds.has(node.id)).map((node) => node.id)
  });
  if (blockers.length > 0) groups.push({
    id: "dependency-blockers",
    title: "待澄清阻塞",
    description: "尚未解决的问题与不确定性不会自动转换为依赖。",
    nodeIds: blockers.map((node) => node.id)
  });
  return {
    ...base,
    nodes: selected.map(toProjectionNode),
    links: projectionLinks(dependencyEdges, selectedIds),
    groups,
    metrics: [
      metric("relations", "依赖关系", dependencyEdges.length),
      metric("knowledge", "涉及知识", dependencyIds.size),
      metric("blockers", "待澄清", blockers.length)
    ],
    sequence: [],
    cycleNodeIds: [],
    ...(dependencyEdges.length === 0 ? { emptyMessage: "尚无显式 depends_on 关系；系统不会根据位置或标题臆造学习依赖。" } : {})
  };
}

function learningPath(base: ProjectionBase, nodes: KnowledgeNode[], edges: KnowledgeEdge[]): SystematizeViewProjection {
  const pathKinds = new Set<KnowledgeNodeKind>(["concept", "skill", "practice", "experience"]);
  const nodesById = new Map(nodes.filter((node) => pathKinds.has(node.kind)).map((node) => [node.id, node]));
  const pathEdges = edges.filter((edge) =>
    (edge.kind === "depends_on" || edge.kind === "precedes")
    && nodesById.has(edge.fromNodeId)
    && nodesById.has(edge.toNodeId)
  ).sort(compareEdge);
  const pathNodeIds = new Set(pathEdges.flatMap((edge) => [edge.fromNodeId, edge.toNodeId]));
  const { sequence, cycleNodeIds } = topologicalLearningOrder(pathNodeIds, pathEdges, nodesById);
  const selected = sequence.map((id) => nodesById.get(id)).filter((node): node is KnowledgeNode => Boolean(node));
  const selectedIds = new Set(sequence);
  const groups = selected.length > 0 ? [{
    id: "learning-sequence",
    title: "可解释学习顺序",
    description: "依赖项排在使用它的知识之前；precedes 保持显式先后关系。",
    nodeIds: sequence
  }] : [];
  return {
    ...base,
    nodes: selected.map(toProjectionNode),
    links: projectionLinks(pathEdges, selectedIds),
    groups,
    metrics: [
      metric("steps", "路径步骤", sequence.length),
      metric("relations", "排序依据", pathEdges.length),
      metric("cycles", "循环依赖", cycleNodeIds.length)
    ],
    sequence,
    cycleNodeIds,
    ...(pathEdges.length === 0 ? { emptyMessage: "尚无可排序的 depends_on 或 precedes 关系；补充明确依赖后才会生成学习路径。" } : {})
  };
}

function practiceManual(base: ProjectionBase, nodes: KnowledgeNode[], edges: KnowledgeEdge[]): SystematizeViewProjection {
  const definitions: Array<{ id: string; title: string; description: string; kinds: KnowledgeNodeKind[] }> = [
    { id: "manual-methods", title: "方法与步骤", description: "可执行技能、实践、经验和路线步骤。", kinds: ["skill", "practice", "experience", "route_step"] },
    { id: "manual-principles", title: "原则与结论", description: "支撑实践的概念、事实、判断和阶段总结。", kinds: ["concept", "fact", "claim", "hypothesis", "inference", "conclusion", "synthesis"] },
    { id: "manual-decisions", title: "判断规则", description: "用于选择方法的标准、决策和候选路线。", kinds: ["criterion", "decision", "route_option"] },
    { id: "manual-context", title: "适用范围", description: "目标和约束决定方法何时成立。", kinds: ["goal", "constraint"] },
    { id: "manual-evidence", title: "证据与来源", description: "支持或反对手册内容的可追溯证据。", kinds: ["evidence"] },
    { id: "manual-open", title: "例外与待验证", description: "尚未解决的问题、反例和不确定性。", kinds: ["question", "uncertainty"] }
  ];
  const used = new Set<string>();
  const groups = definitions.map((definition) => {
    const kindSet = new Set(definition.kinds);
    const groupNodes = nodes.filter((node) => kindSet.has(node.kind)).sort(compareNode);
    groupNodes.forEach((node) => used.add(node.id));
    return { id: definition.id, title: definition.title, description: definition.description, nodeIds: groupNodes.map((node) => node.id) };
  }).filter((group) => group.nodeIds.length > 0);
  const selected = nodes.filter((node) => used.has(node.id)).sort(compareNode);
  const selectedIds = new Set(selected.map((node) => node.id));
  const manualRelations = new Set<KnowledgeRelationKind>(["contains", "depends_on", "valid_in_context", "supports", "contradicts", "derived_from"]);
  return {
    ...base,
    nodes: selected.map(toProjectionNode),
    links: projectionLinks(edges.filter((edge) => manualRelations.has(edge.kind)), selectedIds),
    groups,
    metrics: [
      metric("sections", "有效章节", groups.length),
      metric("entries", "手册条目", selected.length),
      metric("sourced", "带来源条目", selected.filter((node) => node.sourceStatus === "verified").length)
    ],
    sequence: [],
    cycleNodeIds: [],
    ...(selected.length === 0 ? { emptyMessage: "当前知识尚不足以形成实践手册；先通过访谈补充实际做法、判断规则、上下文与例外。" } : {})
  };
}

type ProjectionBase = Pick<SystematizeViewProjection, "kind" | "title" | "description" | "sourceGraphUpdatedAt">;

function topologicalLearningOrder(
  nodeIds: Set<string>,
  edges: KnowledgeEdge[],
  nodesById: Map<string, KnowledgeNode>
): { sequence: string[]; cycleNodeIds: string[] } {
  const outgoing = new Map<string, Set<string>>();
  const indegree = new Map([...nodeIds].map((id) => [id, 0]));
  for (const edge of edges) {
    const before = edge.kind === "depends_on" ? edge.toNodeId : edge.fromNodeId;
    const after = edge.kind === "depends_on" ? edge.fromNodeId : edge.toNodeId;
    const targets = outgoing.get(before) ?? new Set<string>();
    if (!targets.has(after)) {
      targets.add(after);
      outgoing.set(before, targets);
      indegree.set(after, (indegree.get(after) ?? 0) + 1);
    }
  }
  const compareId = (left: string, right: string) => compareNode(nodesById.get(left)!, nodesById.get(right)!);
  const ready = [...nodeIds].filter((id) => indegree.get(id) === 0).sort(compareId);
  const sequence: string[] = [];
  while (ready.length > 0) {
    const current = ready.shift()!;
    sequence.push(current);
    for (const next of [...(outgoing.get(current) ?? [])].sort(compareId)) {
      const nextIndegree = (indegree.get(next) ?? 1) - 1;
      indegree.set(next, nextIndegree);
      if (nextIndegree === 0) {
        ready.push(next);
        ready.sort(compareId);
      }
    }
  }
  const cycleNodeIds = [...nodeIds].filter((id) => !sequence.includes(id)).sort(compareId);
  return { sequence: sequence.concat(cycleNodeIds), cycleNodeIds };
}

function childIndex(edges: KnowledgeEdge[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const edge of edges.filter((edge) => edge.kind === "contains").sort(compareEdge)) {
    index.set(edge.fromNodeId, [...(index.get(edge.fromNodeId) ?? []), edge.toNodeId]);
  }
  return index;
}

function descendants(rootId: string, childrenById: Map<string, string[]>): string[] {
  const ordered: string[] = [];
  const queue = [rootId];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    ordered.push(current);
    queue.push(...(childrenById.get(current) ?? []));
  }
  return ordered;
}

function projectionLinks(edges: KnowledgeEdge[], visibleIds: Set<string>): SystematizeProjectionLink[] {
  return edges
    .filter((edge) => visibleIds.has(edge.fromNodeId) && visibleIds.has(edge.toNodeId))
    .sort(compareEdge)
    .map((edge) => ({
      edgeId: edge.id,
      fromNodeId: edge.fromNodeId,
      toNodeId: edge.toNodeId,
      relationKind: edge.kind,
      label: relationLabels[edge.kind] ?? edge.kind.replaceAll("_", " ")
    }));
}

function toProjectionNode(node: KnowledgeNode): SystematizeProjectionNode {
  return {
    nodeId: node.id,
    title: node.title,
    summary: node.summary,
    kind: node.kind,
    status: node.status,
    epistemicStatus: node.epistemicStatus,
    sourceStatus: node.sourceStatus,
    depth: node.depth,
    tags: [...node.tags]
  };
}

function metric(id: string, label: string, value: number): SystematizeProjectionMetric {
  return { id, label, value };
}

function compareNode(left: KnowledgeNode, right: KnowledgeNode): number {
  return left.depth - right.depth || compareText(left.title, right.title) || compareText(left.id, right.id);
}

function compareEdge(left: KnowledgeEdge, right: KnowledgeEdge): number {
  return compareText(left.kind, right.kind) || compareText(left.fromNodeId, right.fromNodeId)
    || compareText(left.toNodeId, right.toNodeId) || compareText(left.id, right.id);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
