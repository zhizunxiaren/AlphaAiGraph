import type {
  ConceptNote,
  EvidenceAnchor,
  ExecutionRun,
  KnowledgeDigest,
  RelationshipGraph,
  RelationshipGraphEdge,
  RelationshipGraphNode,
  ResearchMap,
  ResearchObject,
  ResearchWorkspaceSnapshot,
  SourceAsset
} from "../types";
import { researchNow } from "./fixtures";

export const projectionMapping = {
  researchNodeSourceId: "ResearchNode.id -> RelationshipGraphNode.sourceId",
  title: "ResearchNode.title -> RelationshipGraphNode.title",
  summary: "ResearchNode.summary -> RelationshipGraphNode.summary",
  tags: "ResearchNode.kind/status + AgentMarker.kind -> RelationshipGraphNode.tags",
  evidenceSourceId: "EvidenceAnchor.id -> RelationshipGraphNode.sourceId"
} as const;

export function projectRelationshipGraph(input: ResearchWorkspaceSnapshot): RelationshipGraph {
  const nodes: RelationshipGraphNode[] = [
    objectNode(input.object),
    ...input.sourceAssets.map(sourceNode),
    ...input.map.nodes.map((item) => ({
      id: `rg-${item.id}`,
      sourceId: item.id,
      kind: "research_node" as const,
      title: item.title,
      summary: item.summary,
      weight: 1 + item.markers.length,
      tags: [item.kind, item.status, item.expansionState, ...item.markers.map((marker) => marker.kind)]
    })),
    ...input.evidenceAnchors.map(evidenceNode),
    ...input.executionRuns.map(runNode),
    ...input.conceptNotes.map(conceptNode),
    ...input.knowledgeDigests.map(digestNode)
  ];

  const edges: RelationshipGraphEdge[] = [];
  edges.push(
    ...input.map.nodes
      .filter((item) => item.id === input.map.rootNodeId)
      .map((item) => ({
        id: `rg-edge-object-${item.id}`,
        fromNodeId: `rg-${input.object.id}`,
        toNodeId: `rg-${item.id}`,
        relation: "contains" as const,
        confidence: 1
      }))
  );
  edges.push(...input.sourceAssets.map((item) => ({
    id: `rg-edge-object-source-${item.id}`,
    fromNodeId: `rg-${input.object.id}`,
    toNodeId: `rg-${item.id}`,
    relation: "contains" as const,
    confidence: 1
  })));
  edges.push(
    ...input.map.edges.map((edge) => ({
      id: `rg-${edge.id}`,
      fromNodeId: `rg-${edge.fromNodeId}`,
      toNodeId: `rg-${edge.toNodeId}`,
      relation: edge.kind === "depends_on" ? "depends_on" as const : edge.kind === "contradicts" ? "contradicts" as const : "related_to" as const,
      confidence: edge.confidence
    }))
  );
  edges.push(...evidenceEdges(input.map, input.evidenceAnchors));
  edges.push(
    ...input.executionRuns.map((run) => ({
      id: `rg-edge-run-${run.id}`,
      fromNodeId: `rg-${run.nodeId}`,
      toNodeId: `rg-${run.id}`,
      relation: "validated_by" as const,
      confidence: run.status === "passed" ? 0.95 : 0.7
    }))
  );
  edges.push(
    ...input.conceptNotes.flatMap((note) =>
      note.relatedNodeIds.map((nodeId) => ({
        id: `rg-edge-note-${note.id}-${nodeId}`,
        fromNodeId: `rg-${note.id}`,
        toNodeId: `rg-${nodeId}`,
        relation: "explains" as const,
        confidence: 0.8
      }))
    )
  );
  edges.push(
    ...input.knowledgeDigests.flatMap((digest) =>
      digest.researchNodeIds.map((nodeId) => ({
        id: `rg-edge-digest-${digest.id}-${nodeId}`,
        fromNodeId: `rg-${digest.id}`,
        toNodeId: `rg-${nodeId}`,
        relation: "derived_from" as const,
        confidence: 0.8
      }))
    )
  );

  return {
    id: `relationship-${input.object.id}`,
    objectId: input.object.id,
    sessionId: input.session.id,
    generatedFromMapIds: [input.map.id],
    nodes,
    edges,
    generatedAt: researchNow
  };
}

function objectNode(object: ResearchObject): RelationshipGraphNode {
  return {
    id: `rg-${object.id}`,
    sourceId: object.id,
    kind: "research_object",
    title: object.title,
    summary: object.description,
    weight: 4,
    tags: [object.kind, object.status]
  };
}

function sourceNode(source: SourceAsset): RelationshipGraphNode {
  return {
    id: `rg-${source.id}`,
    sourceId: source.id,
    kind: "source_asset",
    title: source.title,
    summary: source.uri,
    weight: 1,
    tags: [source.kind, source.analysisState]
  };
}

function evidenceNode(evidence: EvidenceAnchor): RelationshipGraphNode {
  return {
    id: `rg-${evidence.id}`,
    sourceId: evidence.id,
    kind: "evidence",
    title: evidence.title ?? evidence.uri,
    summary: evidence.reason,
    weight: 2,
    tags: ["evidence"]
  };
}

function runNode(run: ExecutionRun): RelationshipGraphNode {
  return {
    id: `rg-${run.id}`,
    sourceId: run.id,
    kind: "execution_run",
    title: run.command ?? run.actionId,
    summary: run.resultSummary,
    weight: 2,
    tags: ["execution_run", run.status]
  };
}

function conceptNode(note: ConceptNote): RelationshipGraphNode {
  return {
    id: `rg-${note.id}`,
    sourceId: note.id,
    kind: "concept_note",
    title: note.title,
    summary: note.summary,
    weight: 2,
    tags: ["concept_note", note.status]
  };
}

function digestNode(digest: KnowledgeDigest): RelationshipGraphNode {
  return {
    id: `rg-${digest.id}`,
    sourceId: digest.id,
    kind: "knowledge_digest",
    title: digest.title,
    summary: digest.summary,
    weight: 2,
    tags: ["knowledge_digest", digest.scope]
  };
}

function evidenceEdges(map: ResearchMap, evidence: EvidenceAnchor[]): RelationshipGraphEdge[] {
  const knownEvidence = new Set(evidence.map((item) => item.id));
  return map.nodes.flatMap((node) =>
    node.evidenceIds
      .filter((evidenceId) => knownEvidence.has(evidenceId))
      .map((evidenceId) => ({
        id: `rg-edge-${node.id}-${evidenceId}`,
        fromNodeId: `rg-${node.id}`,
        toNodeId: `rg-${evidenceId}`,
        relation: "references" as const,
        confidence: 0.88
      }))
  );
}
