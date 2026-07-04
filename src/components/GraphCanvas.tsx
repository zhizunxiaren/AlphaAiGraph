import { GitMerge, Network } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { markerLabel } from "../research/researchAgent";
import type { ResearchWorkspaceController } from "../state/useResearchWorkspace";
import type { ResearchNode } from "../types";

interface GraphCanvasProps {
  workspace: ResearchWorkspaceController;
}

interface NodeOffset {
  x: number;
  y: number;
}

type DragState =
  | {
      mode: "node";
      nodeId: string;
      pointerId: number;
      startClientX: number;
      startClientY: number;
      startOffset: NodeOffset;
      startScale: number;
    }
  | {
      mode: "pan";
      pointerId: number;
      startClientX: number;
      startClientY: number;
      startViewport: CanvasViewport;
    };

interface CanvasViewport {
  x: number;
  y: number;
  scale: number;
}

interface NodeLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

const NODE_WIDTH = 310;
const NODE_HEIGHT = 118;
const ROOT_LAYOUT: NodeLayout = { x: 38, y: 112, width: NODE_WIDTH, height: NODE_HEIGHT };
const FIRST_LAYER_X = 430;
const SECOND_LAYER_X = 820;

export function GraphCanvas({ workspace }: GraphCanvasProps) {
  const [nodeOffsets, setNodeOffsets] = useState<Record<string, NodeOffset>>({});
  const [viewport, setViewport] = useState<CanvasViewport>({ x: 0, y: 0, scale: 1 });
  const dragStateRef = useRef<DragState | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const suppressNextClickRef = useRef(false);
  const root = workspace.map.nodes.find((node) => node.id === workspace.map.rootNodeId);
  const children = workspace.map.nodes.filter((node) => node.parentId === root?.id);
  const selectedChildren =
    workspace.selectedNode && workspace.selectedNode.id !== root?.id
      ? workspace.map.nodes.filter((node) => node.parentId === workspace.selectedNode?.id)
      : [];
  const visibleNodes = uniqueNodes([root, ...children, ...selectedChildren].filter(Boolean) as ResearchNode[]);
  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = workspace.map.edges.filter((edge) => visibleIds.has(edge.fromNodeId) && visibleIds.has(edge.toNodeId));
  const layoutByNodeId = useMemo(() => buildNodeLayouts(root, children, selectedChildren), [root, children, selectedChildren]);
  const canvasHeight = Math.max(760, ...Object.values(layoutByNodeId).map((layout) => layout.y + layout.height + 90));

  if (workspace.canvasMode === "relationship_graph") {
    return <RelationshipGraphCanvas workspace={workspace} />;
  }

  const startPan = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragStateRef.current = {
      mode: "pan",
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startViewport: viewport
    };
    suppressNextClickRef.current = true;
  };

  const startDrag = (nodeId: string, event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return;
    }
    if (event.ctrlKey) {
      startPan(event);
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const sourceOffset = nodeOffsets[nodeId] ?? { x: 0, y: 0 };
    let activeNodeId = nodeId;
    let activeStartOffset = sourceOffset;
    if (event.altKey) {
      activeNodeId = workspace.duplicateNode(nodeId) ?? nodeId;
      activeStartOffset = duplicateStartOffset(nodeId, activeNodeId, sourceOffset, layoutByNodeId, root, children, selectedChildren);
      setNodeOffsets((current) => ({
        ...current,
        [activeNodeId]: activeStartOffset
      }));
      suppressNextClickRef.current = true;
    } else {
      workspace.selectNode(nodeId);
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragStateRef.current = {
      mode: "node",
      nodeId: activeNodeId,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startOffset: activeStartOffset,
      startScale: viewport.scale
    };
  };

  const moveDrag = (event: React.PointerEvent<HTMLElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }

    if (dragState.mode === "pan") {
      setViewport({
        ...dragState.startViewport,
        x: dragState.startViewport.x + event.clientX - dragState.startClientX,
        y: dragState.startViewport.y + event.clientY - dragState.startClientY
      });
      return;
    }

    const nextOffset = {
      x: dragState.startOffset.x + (event.clientX - dragState.startClientX) / dragState.startScale,
      y: dragState.startOffset.y + (event.clientY - dragState.startClientY) / dragState.startScale
    };
    setNodeOffsets((current) => ({
      ...current,
      [dragState.nodeId]: nextOffset
    }));
  };

  const stopDrag = (event: React.PointerEvent<HTMLElement>) => {
    const dragState = dragStateRef.current;
    if (dragState && event.pointerId === dragState.pointerId) {
      dragStateRef.current = null;
    }
  };

  const zoomCanvas = (event: React.WheelEvent<HTMLElement>) => {
    if (!event.ctrlKey) {
      return;
    }
    event.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    const originX = rect ? event.clientX - rect.left : 0;
    const originY = rect ? event.clientY - rect.top : 0;
    const direction = event.deltaY < 0 ? 1.08 : 0.92;
    setViewport((current) => {
      const nextScale = clamp(current.scale * direction, 0.65, 1.8);
      const contentX = (originX - current.x) / current.scale;
      const contentY = (originY - current.y) / current.scale;
      return {
        scale: nextScale,
        x: originX - contentX * nextScale,
        y: originY - contentY * nextScale
      };
    });
  };

  const resetViewport = () => {
    setViewport({ x: 0, y: 0, scale: 1 });
  };

  return (
    <section
      className="panel graph-canvas"
      aria-label="Research Workflow Canvas"
      onPointerDown={(event) => {
        if (event.ctrlKey) startPan(event);
      }}
      onPointerMove={moveDrag}
      onPointerUp={stopDrag}
      onPointerLeave={stopDrag}
      onWheel={zoomCanvas}
    >
      <div className="panel-heading">
        <span>Research Workflow Canvas</span>
        <small>{workspace.map.nodes.length} nodes · {workspace.map.edges.length} edges</small>
        <button type="button" className="ghost-button" onClick={resetViewport}>
          重置视图
        </button>
      </div>
      <div
        ref={canvasRef}
        className={`workflow-canvas ${dragStateRef.current?.mode === "pan" ? "is-panning" : ""}`}
        style={{ minHeight: canvasHeight }}
        onPointerDown={(event) => {
          if (event.ctrlKey) startPan(event);
        }}
        onWheel={zoomCanvas}
      >
        <div
          className="canvas-transform"
          data-testid="canvas-transform"
          style={{
            minHeight: canvasHeight,
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`
          }}
        >
          <svg className="edge-layer" aria-hidden="true">
            {visibleEdges.map((edge) => {
              const from = endpoint(layoutByNodeId[edge.fromNodeId], nodeOffsets[edge.fromNodeId], "right");
              const to = endpoint(layoutByNodeId[edge.toNodeId], nodeOffsets[edge.toNodeId], "left");
              if (!from || !to) {
                return null;
              }
              return (
                <g key={edge.id}>
                  <path d={curvePath(from.x, from.y, to.x, to.y)} />
                  <circle cx={to.x} cy={to.y} r="3.5" />
                </g>
              );
            })}
          </svg>
          {visibleNodes.map((node) => (
            <ResearchNodeButton
              key={node.id}
              node={node}
              workspace={workspace}
              className={node.id === root?.id ? "root-node" : ""}
              layout={layoutByNodeId[node.id]}
              offset={nodeOffsets[node.id]}
              onDragStart={startDrag}
              onSelect={(selectNodeId) => {
                if (suppressNextClickRef.current) {
                  suppressNextClickRef.current = false;
                  return;
                }
                workspace.selectNode(selectNodeId);
              }}
            />
          ))}
          {workspace.candidates.filter((candidate) => candidate.status !== "merged" && candidate.status !== "dismissed").map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              className={`research-node candidate-node ${candidate.status}`}
              onClick={() => workspace.selectNode(candidate.parentNodeId)}
            >
              <span className="node-title">{candidate.node.title}</span>
              <span className="node-summary">候选结果 · 合并前不写入主图</span>
              <span className="candidate-state">{candidate.status}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function uniqueNodes(nodes: ResearchNode[]) {
  const seen = new Set<string>();
  return nodes.filter((node) => {
    if (seen.has(node.id)) {
      return false;
    }
    seen.add(node.id);
    return true;
  });
}

function buildNodeLayouts(root: ResearchNode | undefined, children: ResearchNode[], selectedChildren: ResearchNode[]) {
  const layouts: Record<string, NodeLayout> = {};
  if (root) {
    layouts[root.id] = ROOT_LAYOUT;
  }

  children.forEach((node, index) => {
    layouts[node.id] = {
      x: FIRST_LAYER_X + (index % 2) * 350,
      y: 28 + Math.floor(index / 2) * 154,
      width: NODE_WIDTH,
      height: NODE_HEIGHT
    };
  });

  selectedChildren.forEach((node, index) => {
    layouts[node.id] = {
      x: SECOND_LAYER_X,
      y: 54 + index * 146,
      width: NODE_WIDTH,
      height: NODE_HEIGHT
    };
  });

  return layouts;
}

function duplicateStartOffset(
  sourceNodeId: string,
  copyNodeId: string,
  sourceOffset: NodeOffset,
  currentLayouts: Record<string, NodeLayout>,
  root: ResearchNode | undefined,
  children: ResearchNode[],
  selectedChildren: ResearchNode[]
) {
  const sourceLayout = currentLayouts[sourceNodeId];
  const sourceNode = children.concat(selectedChildren).find((node) => node.id === sourceNodeId);
  if (!sourceLayout || !sourceNode || copyNodeId === sourceNodeId) {
    return { x: sourceOffset.x + 18, y: sourceOffset.y + 18 };
  }

  const copyNode = { ...sourceNode, id: copyNodeId, title: `${sourceNode.title} 副本` };
  const predictedChildren = insertAfter(children, sourceNodeId, copyNode);
  const predictedSelectedChildren = insertAfter(selectedChildren, sourceNodeId, copyNode);
  const copyLayout = buildNodeLayouts(root, predictedChildren, predictedSelectedChildren)[copyNodeId];
  if (!copyLayout) {
    return { x: sourceOffset.x + 18, y: sourceOffset.y + 18 };
  }

  return {
    x: sourceLayout.x + sourceOffset.x + 18 - copyLayout.x,
    y: sourceLayout.y + sourceOffset.y + 18 - copyLayout.y
  };
}

function insertAfter(nodes: ResearchNode[], sourceNodeId: string, copyNode: ResearchNode) {
  const index = nodes.findIndex((node) => node.id === sourceNodeId);
  if (index < 0) {
    return nodes;
  }
  return nodes.slice(0, index + 1).concat(copyNode, nodes.slice(index + 1));
}

function endpoint(layout: NodeLayout | undefined, offset: NodeOffset | undefined, side: "left" | "right") {
  if (!layout) {
    return undefined;
  }
  const dx = offset?.x ?? 0;
  const dy = offset?.y ?? 0;
  return {
    x: layout.x + dx + (side === "right" ? layout.width : 0),
    y: layout.y + dy + layout.height / 2
  };
}

function curvePath(x1: number, y1: number, x2: number, y2: number) {
  const bend = Math.max(80, Math.abs(x2 - x1) * 0.42);
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function ResearchNodeButton({
  node,
  workspace,
  className = "",
  layout,
  offset,
  onDragStart,
  onSelect
}: {
  node: ResearchNode;
  workspace: ResearchWorkspaceController;
  className?: string;
  layout?: NodeLayout;
  offset?: NodeOffset;
  onDragStart: (nodeId: string, event: React.PointerEvent<HTMLButtonElement>) => void;
  onSelect: (nodeId: string) => void;
}) {
  const candidateCount = workspace.candidates.filter((candidate) => candidate.parentNodeId === node.id && candidate.status !== "merged").length;
  const style = {
    left: layout?.x,
    top: layout?.y,
    width: layout?.width,
    transform: offset ? `translate(${offset.x}px, ${offset.y}px)` : undefined
  };

  return (
    <button
      type="button"
      className={`research-node ${className} ${workspace.selectedNodeId === node.id ? "selected" : ""} ${node.expansionState}`}
      aria-pressed={workspace.selectedNodeId === node.id}
      draggable={false}
      style={style}
      onClick={() => onSelect(node.id)}
      onDragStart={(event) => event.preventDefault()}
      onPointerDown={(event) => onDragStart(node.id, event)}
    >
      <span className="node-kind">{node.kind} · {node.status}</span>
      <span className="node-title">{node.title}</span>
      <span className="node-summary">{node.summary}</span>
      <span className="marker-row">
        {node.markers.map((marker) => <span key={marker.id} className={`marker-badge marker-${marker.kind}`}>{markerLabel(marker.kind)}</span>)}
      </span>
      <span className="node-meta">{node.evidenceIds.length} 证据 · {node.actionIds.length} 动作 · {candidateCount} 候选 · {node.expansionState}</span>
    </button>
  );
}

function RelationshipGraphCanvas({ workspace }: GraphCanvasProps) {
  const graph = workspace.relationshipGraph;
  return (
    <section className="panel graph-canvas relationship-mode" aria-label="Obsidian-style 关系图谱">
      <div className="panel-heading">
        <span><Network size={16} /> Obsidian-style 关系图谱</span>
        <small>由研究数据投影生成</small>
      </div>
      <div className="relationship-summary">
        <GitMerge size={18} />
        <strong>{graph.nodes.length} nodes / {graph.edges.length} edges</strong>
        <span>Relationship graph 使用 sourceId 追溯原始对象，不是第二套主数据源。</span>
      </div>
      <div className="relationship-grid">
        {graph.nodes.slice(0, 18).map((node) => (
          <button key={node.id} type="button" className={`relationship-node ${node.kind}`}>
            <span>{node.title}</span>
            <small>{node.kind}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
