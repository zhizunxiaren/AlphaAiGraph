import type {
  ActorKind,
  KnowledgeEdge,
  KnowledgeGraph,
  KnowledgeNode,
  KnowledgeRelationKind
} from "../types";

export type KnowledgeEvolutionRelationKind = Extract<
  KnowledgeRelationKind,
  "refines" | "corrects" | "supersedes" | "valid_in_context" | "derived_from"
>;

export interface EvolutionRelationDefinition {
  label: string;
  direction: string;
  description: string;
}

export const evolutionRelationDefinitions: Record<
  KnowledgeEvolutionRelationKind,
  EvolutionRelationDefinition
> = {
  refines: {
    label: "细化",
    direction: "new → previous",
    description: "新节点增加精度、边界或细节，同时保留原节点。"
  },
  corrects: {
    label: "纠正",
    direction: "corrected → previous",
    description: "新节点纠正存在争议、错误或过时的旧认知。"
  },
  supersedes: {
    label: "取代",
    direction: "replacement → previous",
    description: "新节点成为当前采用版本，旧节点保留为历史。"
  },
  valid_in_context: {
    label: "适用于场景",
    direction: "knowledge → context",
    description: "认知只在目标场景或约束节点代表的范围内成立。"
  },
  derived_from: {
    label: "派生自",
    direction: "derived → source",
    description: "新知识由已有知识推导、转换或综合而来。"
  }
};

export interface CreateEvolutionEdgeInput {
  id: string;
  kind: KnowledgeEvolutionRelationKind;
  fromNodeId: string;
  toNodeId: string;
  rationale: string;
  createdBy: ActorKind;
  createdAt: string;
  confidence?: number;
}

export function createEvolutionEdge(input: CreateEvolutionEdgeInput): KnowledgeEdge {
  if (!input.rationale.trim()) throw new Error(`${input.kind} relation requires a rationale`);
  if (!Number.isFinite(input.confidence ?? 1) || (input.confidence ?? 1) < 0 || (input.confidence ?? 1) > 1) {
    throw new Error("Evolution relation confidence must be between 0 and 1");
  }
  return {
    id: input.id,
    fromNodeId: input.fromNodeId,
    toNodeId: input.toNodeId,
    kind: input.kind,
    label: evolutionRelationDefinitions[input.kind].label,
    rationale: input.rationale.trim(),
    createdBy: input.createdBy,
    confidence: input.confidence ?? 1,
    createdAt: input.createdAt
  };
}

export interface KnowledgeEvolutionIssue {
  code:
    | "missing_evolution_endpoint"
    | "self_evolution_relation"
    | "missing_evolution_rationale"
    | "invalid_correction_state"
    | "invalid_supersession_state"
    | "invalid_context_relation";
  edgeId: string;
  message: string;
}

const evolutionKinds = new Set<KnowledgeRelationKind>(
  Object.keys(evolutionRelationDefinitions) as KnowledgeEvolutionRelationKind[]
);

export function validateKnowledgeEvolution(graph: KnowledgeGraph): KnowledgeEvolutionIssue[] {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const issues: KnowledgeEvolutionIssue[] = [];
  for (const edge of graph.edges) {
    if (!evolutionKinds.has(edge.kind)) continue;
    const from = nodesById.get(edge.fromNodeId);
    const to = nodesById.get(edge.toNodeId);
    if (!from || !to) {
      issues.push({
        code: "missing_evolution_endpoint",
        edgeId: edge.id,
        message: `Evolution edge ${edge.id} references a missing node`
      });
      continue;
    }
    if (from.id === to.id) {
      issues.push({
        code: "self_evolution_relation",
        edgeId: edge.id,
        message: `Evolution edge ${edge.id} cannot point to the same node`
      });
    }
    if (!edge.rationale?.trim() || !edge.createdBy) {
      issues.push({
        code: "missing_evolution_rationale",
        edgeId: edge.id,
        message: `Evolution edge ${edge.id} must record rationale and createdBy`
      });
    }
    if (edge.kind === "corrects") validateCorrection(edge, from, to, issues);
    if (edge.kind === "supersedes") validateSupersession(edge, from, to, issues);
    if (edge.kind === "valid_in_context") validateContext(edge, from, to, issues);
  }
  return issues;
}

export function assertKnowledgeEvolution(graph: KnowledgeGraph): void {
  const issues = validateKnowledgeEvolution(graph);
  if (issues.length === 0) return;
  throw new Error(
    `Knowledge evolution validation failed: ${issues
      .map((issue) => `[${issue.code}] ${issue.message}`)
      .join("; ")}`
  );
}

function validateCorrection(
  edge: KnowledgeEdge,
  corrected: KnowledgeNode,
  previous: KnowledgeNode,
  issues: KnowledgeEvolutionIssue[]
): void {
  if (!["supported", "context_dependent"].includes(corrected.epistemicStatus)
    || !["contested", "contradicted", "outdated"].includes(previous.epistemicStatus)) {
    issues.push({
      code: "invalid_correction_state",
      edgeId: edge.id,
      message: `corrects requires a supported correction and a contested, contradicted, or outdated target`
    });
  }
}

function validateSupersession(
  edge: KnowledgeEdge,
  replacement: KnowledgeNode,
  previous: KnowledgeNode,
  issues: KnowledgeEvolutionIssue[]
): void {
  if (!["supported", "context_dependent"].includes(replacement.epistemicStatus)
    || previous.epistemicStatus !== "superseded") {
    issues.push({
      code: "invalid_supersession_state",
      edgeId: edge.id,
      message: `supersedes requires a supported replacement and a superseded target`
    });
  }
}

function validateContext(
  edge: KnowledgeEdge,
  knowledge: KnowledgeNode,
  context: KnowledgeNode,
  issues: KnowledgeEvolutionIssue[]
): void {
  const validContextKinds = new Set(["subject", "topic", "constraint", "criterion"]);
  if (knowledge.scope.kind !== "context_specific"
    || !knowledge.scope.contextIds.includes(context.id)
    || !validContextKinds.has(context.kind)) {
    issues.push({
      code: "invalid_context_relation",
      edgeId: edge.id,
      message: `valid_in_context must target a declared subject, topic, constraint, or criterion context`
    });
  }
}
