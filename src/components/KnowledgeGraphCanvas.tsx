import { knowledgeNodeKindLabels } from "../knowledge/knowledgeNodeKinds";
import type { KnowledgeNodePosition, ProgressiveKnowledgeProjection } from "../knowledge/knowledgeGraphProjection";

export interface KnowledgeGraphCanvasProps {
  projection: ProgressiveKnowledgeProjection;
  positions: Record<string, KnowledgeNodePosition>;
  selectedNodeId: string;
  onSelectNode: (nodeId: string) => void;
}

/** Bounded render surface: it receives a local projection, never the canonical full graph. */
export function KnowledgeGraphCanvas({
  projection,
  positions,
  selectedNodeId,
  onSelectNode
}: KnowledgeGraphCanvasProps) {
  return (
    <>
      <svg className="knowledge-edge-layer" viewBox="0 0 1000 660" preserveAspectRatio="none" aria-hidden="true">
        {projection.edges.map((edge) => {
          const from = positions[edge.fromNodeId];
          const to = positions[edge.toNodeId];
          if (!from || !to) return null;
          const mx = (from.x + to.x) / 2;
          return <path key={edge.id} className={`edge-${edge.kind}`} d={`M ${from.x} ${from.y} C ${mx} ${from.y}, ${mx} ${to.y}, ${to.x} ${to.y}`} />;
        })}
      </svg>
      {projection.nodes.map((node) => {
        const position = positions[node.id];
        return (
          <button
            type="button"
            key={node.id}
            className={`knowledge-node-v2 kind-${node.kind} ${node.id === selectedNodeId ? "selected" : ""}`}
            style={{ left: `${position.x / 10}%`, top: `${position.y / 6.6}%` }}
            aria-pressed={node.id === selectedNodeId}
            onClick={() => onSelectNode(node.id)}
          >
            <span>{knowledgeNodeKindLabels[node.kind]}</span>
            <strong>{node.title}</strong>
            <small>{node.summary}</small>
          </button>
        );
      })}
    </>
  );
}
