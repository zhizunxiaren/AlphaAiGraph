import type {
  AgentMarker,
  EvidenceAnchor,
  ExecutionRun,
  KnowledgeDigest,
  ConceptNote,
  RelationshipGraph,
  RelationshipGraphEdge,
  RelationshipGraphNode,
  ResearchEdge,
  ResearchMap,
  ResearchNode,
  ResearchObject,
  ResearchWorkspace,
} from "../types";
import { researchNow } from "./constants";

export const relationshipProjectionMapping = {
  researchNode: {
    id: "RelationshipGraphNode.sourceId",
    title: "RelationshipGraphNode.title",
    summary: "RelationshipGraphNode.summary",
    kindStatusMarkers: "RelationshipGraphNode.tags",
  },
  researchEdge: {
    fromNodeId: "RelationshipGraphEdge.fromNodeId",
    toNodeId: "RelationshipGraphEdge.toNodeId",
    kind: "RelationshipGraphEdge.relation",
  },
  evidenceAnchor: {
    id: "RelationshipGraphNode.sourceId",
  },
} as const;

export function projectRelationshipGraph(input: Pick<
  ResearchWorkspace,
  | "object"
  | "map"
  | "markers"
  | "evidenceAnchors"
  | "executionRuns"
  | "conceptNotes"
  | "knowledgeDigests"
>): RelationshipGraph {
  const markerByNode = groupMarkersByNode(input.markers);
  const nodes: RelationshipGraphNode[] = [
    {
      id: objectGraphId(input.object.id),
      kind: "research_object",
      sourceId: input.object.id,
      title: input.object.title,
      tags: [input.object.kind, input.object.status],
    },
    ...input.map.nodes.map((node) => researchNodeToGraphNode(node, markerByNode.get(node.id) ?? [])),
    ...input.evidenceAnchors.map(evidenceToGraphNode),
    ...input.executionRuns.map(executionToGraphNode),
    ...input.conceptNotes.map(noteToGraphNode),
    ...input.knowledgeDigests.map(digestToGraphNode),
  ];
  const root = input.map.nodes.find((node) => node.id === input.map.rootNodeId);
  const edges: RelationshipGraphEdge[] = [
    ...(root
      ? [
          {
            id: `rg-edge-${input.object.id}-contains-${root.id}`,
            sourceId: input.object.id,
            fromNodeId: objectGraphId(input.object.id),
            toNodeId: researchGraphId(root.id),
            relation: "contains" as const,
            confidence: 1,
          },
        ]
      : []),
    ...input.map.edges.map(researchEdgeToGraphEdge),
    ...evidenceEdges(input.map, input.evidenceAnchors),
    ...input.executionRuns.map((run) => ({
      id: `rg-edge-${run.id}-validated-by`,
      sourceId: run.id,
      fromNodeId: researchGraphId(run.nodeId),
      toNodeId: executionGraphId(run.id),
      relation: "validated_by" as const,
      confidence: run.status === "succeeded" ? 0.9 : 0.5,
    })),
    ...input.conceptNotes.flatMap((note) =>
      note.relatedNodeIds.map((nodeId) => ({
        id: `rg-edge-${note.id}-${nodeId}-explains`,
        sourceId: note.id,
        fromNodeId: noteGraphId(note.id),
        toNodeId: researchGraphId(nodeId),
        relation: "explains" as const,
        confidence: 0.84,
      })),
    ),
    ...input.knowledgeDigests.flatMap((digest) => [
      ...digest.includedNodeIds.map((nodeId) => ({
        id: `rg-edge-${digest.id}-${nodeId}-node`,
        sourceId: digest.id,
        fromNodeId: digestGraphId(digest.id),
        toNodeId: researchGraphId(nodeId),
        relation: "derived_from" as const,
        confidence: 0.8,
      })),
      ...digest.includedNoteIds.map((noteId) => ({
        id: `rg-edge-${digest.id}-${noteId}-note`,
        sourceId: digest.id,
        fromNodeId: digestGraphId(digest.id),
        toNodeId: noteGraphId(noteId),
        relation: "derived_from" as const,
        confidence: 0.8,
      })),
    ]),
  ];

  return {
    id: `relationship-${input.object.id}`,
    sourceObjectId: input.object.id,
    generatedAt: researchNow,
    nodes,
    edges,
  };
}

function groupMarkersByNode(markers: AgentMarker[]): Map<string, AgentMarker[]> {
  return markers.reduce((map, marker) => {
    map.set(marker.nodeId, [...(map.get(marker.nodeId) ?? []), marker]);
    return map;
  }, new Map<string, AgentMarker[]>());
}

function researchNodeToGraphNode(node: ResearchNode, markers: AgentMarker[]): RelationshipGraphNode {
  return {
    id: researchGraphId(node.id),
    kind: "research_node",
    sourceId: node.id,
    title: node.title,
    summary: node.summary,
    tags: [node.kind, node.status, ...markers.map((marker) => marker.kind)],
  };
}

function evidenceToGraphNode(evidence: EvidenceAnchor): RelationshipGraphNode {
  return {
    id: evidenceGraphId(evidence.id),
    kind: "evidence",
    sourceId: evidence.id,
    title: evidence.title,
    summary: evidence.quote,
    tags: ["evidence"],
  };
}

function executionToGraphNode(run: ExecutionRun): RelationshipGraphNode {
  return {
    id: executionGraphId(run.id),
    kind: "execution_run",
    sourceId: run.id,
    title: run.command,
    summary: run.output,
    tags: ["execution_run", run.status],
  };
}

function noteToGraphNode(note: ConceptNote): RelationshipGraphNode {
  return {
    id: noteGraphId(note.id),
    kind: "concept_note",
    sourceId: note.id,
    title: note.title,
    summary: note.body,
    tags: ["concept_note"],
  };
}

function digestToGraphNode(digest: KnowledgeDigest): RelationshipGraphNode {
  return {
    id: digestGraphId(digest.id),
    kind: "knowledge_digest",
    sourceId: digest.id,
    title: digest.title,
    summary: digest.summary,
    tags: ["knowledge_digest"],
  };
}

function researchEdgeToGraphEdge(edge: ResearchEdge): RelationshipGraphEdge {
  return {
    id: `rg-edge-${edge.id}`,
    sourceId: edge.id,
    fromNodeId: researchGraphId(edge.fromNodeId),
    toNodeId: researchGraphId(edge.toNodeId),
    relation: researchEdgeRelation(edge),
    confidence: edge.confidence,
  };
}

function researchEdgeRelation(edge: ResearchEdge): RelationshipGraphEdge["relation"] {
  if (edge.kind === "contains") {
    return "research_flow";
  }
  return edge.kind;
}

function evidenceEdges(map: ResearchMap, evidence: EvidenceAnchor[]): RelationshipGraphEdge[] {
  const evidenceIds = new Set(evidence.map((item) => item.id));
  return map.nodes.flatMap((node) =>
    node.evidenceIds
      .filter((id) => evidenceIds.has(id))
      .map((evidenceId) => ({
        id: `rg-edge-${node.id}-${evidenceId}-references`,
        sourceId: evidenceId,
        fromNodeId: researchGraphId(node.id),
        toNodeId: evidenceGraphId(evidenceId),
        relation: "references" as const,
        confidence: 0.86,
      })),
  );
}

function objectGraphId(id: string): string {
  return `rg-object-${id}`;
}

function researchGraphId(id: string): string {
  return `rg-research-${id}`;
}

function evidenceGraphId(id: string): string {
  return `rg-evidence-${id}`;
}

function executionGraphId(id: string): string {
  return `rg-execution-${id}`;
}

function noteGraphId(id: string): string {
  return `rg-note-${id}`;
}

function digestGraphId(id: string): string {
  return `rg-digest-${id}`;
}
