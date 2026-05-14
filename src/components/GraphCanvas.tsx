import { type MouseEvent, type PointerEvent, useCallback, useLayoutEffect, useRef, useState } from "react";
import type { KnowledgeAppState, RelationshipGraph } from "../types";
import { candidateStatusLabel, markerLabel } from "./labels";

type NodeOffset = { x: number; y: number };
type Point = { x: number; y: number };
type NodeAnchor = {
  center: Point;
  left: Point;
  right: Point;
};
type EdgePath = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  from: Point;
  to: Point;
  variant: "research" | "candidate" | "placeholder";
};

type DragState = {
  nodeId: string;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

type PanState = {
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

const EMPTY_BRANCH_CARD_ID = "empty-branch-card";

export function GraphCanvas({
  state,
  relationshipGraph,
  selectNode,
  setCanvasMode,
  drillDown,
}: {
  state: KnowledgeAppState;
  relationshipGraph: RelationshipGraph;
  selectNode: (nodeId: string) => void;
  setCanvasMode: (mode: KnowledgeAppState["canvasMode"]) => void;
  drillDown: (nodeId: string) => void;
}) {
  const [nodeOffsets, setNodeOffsets] = useState<Record<string, NodeOffset>>({});
  const [dragState, setDragState] = useState<DragState>();
  const [canvasOffset, setCanvasOffset] = useState<NodeOffset>({ x: 0, y: 0 });
  const [panState, setPanState] = useState<PanState>();
  const [nodeAnchors, setNodeAnchors] = useState<Record<string, NodeAnchor>>({});
  const [candidateAnchors, setCandidateAnchors] = useState<Record<string, NodeAnchor>>({});
  const [emptyBranchAnchor, setEmptyBranchAnchor] = useState<NodeAnchor>();
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
  const suppressClickNodeId = useRef<string | undefined>(undefined);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const candidateRefs = useRef<Record<string, HTMLElement | null>>({});
  const emptyBranchRef = useRef<HTMLButtonElement | null>(null);

  const measureGraph = useCallback(() => {
    const stageElement = stageRef.current;
    if (!stageElement) return;

    const mapRect = stageElement.getBoundingClientRect();
    const nextNodeAnchors: Record<string, NodeAnchor> = {};
    const nextCandidateAnchors: Record<string, NodeAnchor> = {};

    for (const [nodeId, element] of Object.entries(nodeRefs.current)) {
      if (!element) continue;
      const rect = element.getBoundingClientRect();
      nextNodeAnchors[nodeId] = anchorsFromRect(rect, mapRect);
    }

    for (const [candidateId, element] of Object.entries(candidateRefs.current)) {
      if (!element) continue;
      const rect = element.getBoundingClientRect();
      nextCandidateAnchors[candidateId] = anchorsFromRect(rect, mapRect);
    }

    const emptyBranchElement = emptyBranchRef.current;
    setEmptyBranchAnchor(
      emptyBranchElement
        ? anchorsFromRect(emptyBranchElement.getBoundingClientRect(), mapRect)
        : undefined,
    );
    setMapSize({ width: mapRect.width, height: mapRect.height });
    setNodeAnchors(nextNodeAnchors);
    setCandidateAnchors(nextCandidateAnchors);
  }, []);

  useLayoutEffect(() => {
    measureGraph();
  }, [measureGraph, nodeOffsets, state.researchMap.nodes, state.candidateNodes, state.canvasMode]);

  useLayoutEffect(() => {
    window.addEventListener("resize", measureGraph);
    return () => window.removeEventListener("resize", measureGraph);
  }, [measureGraph]);

  const startDrag = (nodeId: string, clientX: number, clientY: number) => {
    const offset = nodeOffsets[nodeId] ?? { x: 0, y: 0 };
    setDragState({
      nodeId,
      startX: clientX,
      startY: clientY,
      originX: offset.x,
      originY: offset.y,
    });
  };

  const moveDrag = (nodeId: string, clientX: number, clientY: number) => {
    if (!dragState || dragState.nodeId !== nodeId) return;
    const nextOffset = {
      x: dragState.originX + clientX - dragState.startX,
      y: dragState.originY + clientY - dragState.startY,
    };

    if (Math.abs(nextOffset.x - dragState.originX) > 2 || Math.abs(nextOffset.y - dragState.originY) > 2) {
      suppressClickNodeId.current = nodeId;
    }

    setNodeOffsets((current) => ({
      ...current,
      [nodeId]: nextOffset,
    }));
    requestAnimationFrame(measureGraph);
  };

  const beginNodeDrag = (nodeId: string, event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 && event.button !== undefined) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    startDrag(nodeId, event.clientX, event.clientY);
  };

  const dragNode = (nodeId: string, event: PointerEvent<HTMLElement>) => {
    moveDrag(nodeId, event.clientX, event.clientY);
  };

  const endNodeDrag = (nodeId: string, event: PointerEvent<HTMLElement>) => {
    if (dragState?.nodeId !== nodeId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setDragState(undefined);
  };

  const beginMouseDrag = (nodeId: string, event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    startDrag(nodeId, event.clientX, event.clientY);
  };

  const dragNodeWithMouse = (nodeId: string, event: MouseEvent<HTMLElement>) => {
    if (event.buttons !== 1) return;
    moveDrag(nodeId, event.clientX, event.clientY);
  };

  const endMouseDrag = (nodeId: string) => {
    if (dragState?.nodeId !== nodeId) return;
    setDragState(undefined);
  };

  const beginCanvasPan = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !canStartCanvasPan(event.target)) return;
    setPanState({
      startX: event.clientX,
      startY: event.clientY,
      originX: canvasOffset.x,
      originY: canvasOffset.y,
    });
  };

  const panCanvas = (event: MouseEvent<HTMLDivElement>) => {
    if (!panState || event.buttons !== 1) return;
    setCanvasOffset({
      x: panState.originX + event.clientX - panState.startX,
      y: panState.originY + event.clientY - panState.startY,
    });
  };

  const endCanvasPan = () => {
    setPanState(undefined);
  };

  const selectOrIgnoreDragClick = (nodeId: string) => {
    if (suppressClickNodeId.current === nodeId) {
      suppressClickNodeId.current = undefined;
      return;
    }

    selectNode(nodeId);
  };

  const activatePlaceholderCard = (nodeId: string | undefined, canDrill: boolean) => {
    if (suppressClickNodeId.current === EMPTY_BRANCH_CARD_ID) {
      suppressClickNodeId.current = undefined;
      return;
    }

    if (nodeId && canDrill) {
      drillDown(nodeId);
    }
  };

  if (state.canvasMode === "relationship_graph") {
    return (
      <main className="canvas relationship-canvas" aria-label="关系图谱投影">
        <div className="canvas-toolbar">
          <div>
            <span className="eyebrow">Projected Graph</span>
            <h1>Obsidian-style 关系图谱</h1>
            <p>由研究数据投影生成，不是主数据源</p>
          </div>
          <button onClick={() => setCanvasMode("research_map")}>研究地图</button>
        </div>
        <div className="relationship-grid">
          {relationshipGraph.nodes.map((node) => (
            <article className="graph-node relationship-node" key={node.id}>
              <span>{node.kind}</span>
              <strong>{node.title}</strong>
              <small>{node.sourceId}</small>
            </article>
          ))}
        </div>
      </main>
    );
  }

  if (state.researchMap.nodes.length === 0) {
    return (
      <main className="canvas empty-canvas" aria-label="研究 workflow 脑图">
        研究地图为空
      </main>
    );
  }

  const rootNode = state.researchMap.nodes.find((node) => node.id === state.researchMap.rootNodeId);
  const childNodes = state.researchMap.nodes.filter((node) => node.parentNodeId === rootNode?.id);
  const deeperNodes = state.researchMap.nodes.filter((node) => node.depth > 1);
  const visibleNodeIds = new Set(state.researchMap.nodes.map((node) => node.id));
  const placeholderParentId = visibleParentNodeId(state.selectedNodeId, visibleNodeIds, rootNode?.id);
  const placeholderNode = state.researchMap.nodes.find((node) => node.id === placeholderParentId);
  const placeholderCanDrill = Boolean(
    placeholderNode &&
      placeholderNode.expansionState !== "expanded" &&
      state.actions.some((action) => action.nodeId === placeholderNode.id && action.kind === "drill_down"),
  );
  const placeholderTitle = placeholderCanDrill && placeholderNode ? `展开 ${placeholderNode.title}` : "等待下钻";
  const placeholderSummary = placeholderCanDrill
    ? "只展开该节点的下一层研究问题。"
    : "选择一个可下钻节点后，再展开下一层研究问题。";
  const edgePaths: EdgePath[] = [
    ...state.researchMap.edges
      .filter((edge) => visibleNodeIds.has(edge.fromNodeId) && visibleNodeIds.has(edge.toNodeId))
      .flatMap((edge) => {
        const from = nodeAnchors[edge.fromNodeId];
        const to = nodeAnchors[edge.toNodeId];
        return from && to
          ? [{
              id: edge.id,
              fromNodeId: edge.fromNodeId,
              toNodeId: edge.toNodeId,
              from: sourceAnchor(from, to),
              to: to.left,
              variant: "research" as const,
            }]
          : [];
      }),
    ...state.candidateNodes.flatMap((candidate) => {
      const parentId = candidate.node.parentNodeId;
      if (!parentId) return [];
      const from = nodeAnchors[parentId];
      const to = candidateAnchors[candidate.id];
      return from && to
        ? [{
            id: candidate.id,
            fromNodeId: parentId,
            toNodeId: candidate.node.id,
            from: sourceAnchor(from, to),
            to: to.left,
            variant: "candidate" as const,
          }]
        : [];
    }),
    ...(() => {
      if (deeperNodes.length > 0 || !placeholderParentId || !emptyBranchAnchor) return [];
      const from = nodeAnchors[placeholderParentId];
      return from
        ? [{
            id: EMPTY_BRANCH_CARD_ID,
            fromNodeId: placeholderParentId,
            toNodeId: EMPTY_BRANCH_CARD_ID,
            from: sourceAnchor(from, emptyBranchAnchor),
            to: emptyBranchAnchor.left,
            variant: "placeholder" as const,
          }]
        : [];
    })(),
  ];

  return (
    <main className="canvas" aria-label="研究 workflow 脑图">
      <div className="canvas-toolbar">
        <div>
          <span className="eyebrow">Research Workflow</span>
          <h1>研究 workflow 脑图</h1>
          <p>先看高层地图，再由用户选择节点下钻。</p>
        </div>
        <button onClick={() => setCanvasMode("relationship_graph")}>查看关系投影</button>
      </div>

      <div
        className={panState ? "workflow-map is-panning" : "workflow-map"}
        aria-label="研究地图平移画布"
        ref={mapRef}
        onMouseDown={beginCanvasPan}
        onMouseMove={panCanvas}
        onMouseUp={endCanvasPan}
        onMouseLeave={endCanvasPan}
      >
        <div
          className="workflow-stage"
          data-testid="workflow-stage"
          ref={stageRef}
          style={
            canvasOffset.x || canvasOffset.y
              ? { transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px)` }
              : undefined
          }
        >
          <svg
            className="workflow-edge-layer"
            aria-label="研究节点连线"
            width={mapSize.width}
            height={mapSize.height}
          >
            {edgePaths.map((edge, index) => {
              const isActive =
                dragState?.nodeId === edge.fromNodeId ||
                dragState?.nodeId === edge.toNodeId ||
                dragState?.nodeId === edge.id;
              return (
                <path
                  className={[
                    "workflow-edge",
                    `edge-${edge.variant}`,
                    isActive ? "edge-active" : "",
                  ].join(" ")}
                  data-testid={
                    edge.variant === "candidate"
                      ? "candidate-map-edge"
                      : edge.variant === "placeholder"
                        ? "placeholder-map-edge"
                        : "research-map-edge"
                  }
                  data-anchor="target-left-edge"
                  data-path-style="floating-curve"
                  d={edgePath(edge.from, edge.to, index, edge.variant)}
                  key={edge.id}
                />
              );
            })}
          </svg>
          {rootNode ? (
            <div className="workflow-column root-column">
              <NodeButton
                nodeId={rootNode.id}
                state={state}
                offset={nodeOffsets[rootNode.id]}
                isDragging={dragState?.nodeId === rootNode.id}
                selectNode={selectOrIgnoreDragClick}
                beginDrag={beginNodeDrag}
                dragNode={dragNode}
                endDrag={endNodeDrag}
                beginMouseDrag={beginMouseDrag}
                dragNodeWithMouse={dragNodeWithMouse}
                endMouseDrag={endMouseDrag}
                registerNode={(element) => {
                  nodeRefs.current[rootNode.id] = element;
                }}
              />
            </div>
          ) : null}

          <div className="workflow-column branch-column" aria-label="第一层研究节点">
            {childNodes.map((node) => (
              <NodeButton
                key={node.id}
                nodeId={node.id}
                state={state}
                offset={nodeOffsets[node.id]}
                isDragging={dragState?.nodeId === node.id}
                selectNode={selectOrIgnoreDragClick}
                beginDrag={beginNodeDrag}
                dragNode={dragNode}
                endDrag={endNodeDrag}
                beginMouseDrag={beginMouseDrag}
                dragNodeWithMouse={dragNodeWithMouse}
                endMouseDrag={endMouseDrag}
                registerNode={(element) => {
                  nodeRefs.current[node.id] = element;
                }}
              />
            ))}
          </div>

          <div className="workflow-column detail-column" aria-label="下钻节点与候选结果">
            {deeperNodes.length === 0 ? (
              <button
                type="button"
                className={[
                  "empty-branch",
                  nodeOffsets[EMPTY_BRANCH_CARD_ID] ? "is-positioned" : "",
                  dragState?.nodeId === EMPTY_BRANCH_CARD_ID ? "is-dragging" : "",
                ].join(" ")}
                aria-label={placeholderTitle}
                onClick={() => activatePlaceholderCard(placeholderNode?.id, placeholderCanDrill)}
                onPointerDown={(event) => beginNodeDrag(EMPTY_BRANCH_CARD_ID, event)}
                onPointerMove={(event) => dragNode(EMPTY_BRANCH_CARD_ID, event)}
                onPointerUp={(event) => endNodeDrag(EMPTY_BRANCH_CARD_ID, event)}
                onPointerCancel={(event) => endNodeDrag(EMPTY_BRANCH_CARD_ID, event)}
                onMouseDown={(event) => beginMouseDrag(EMPTY_BRANCH_CARD_ID, event)}
                onMouseMove={(event) => dragNodeWithMouse(EMPTY_BRANCH_CARD_ID, event)}
                onMouseUp={() => endMouseDrag(EMPTY_BRANCH_CARD_ID)}
                onMouseLeave={() => endMouseDrag(EMPTY_BRANCH_CARD_ID)}
                ref={emptyBranchRef}
                style={
                  nodeOffsets[EMPTY_BRANCH_CARD_ID]
                    ? {
                        transform: `translate(${nodeOffsets[EMPTY_BRANCH_CARD_ID].x}px, ${
                          nodeOffsets[EMPTY_BRANCH_CARD_ID].y
                        }px)`,
                  }
                    : undefined
                }
              >
                <strong>{placeholderTitle}</strong>
                <span>{placeholderSummary}</span>
              </button>
            ) : (
              deeperNodes.map((node) => (
                <NodeButton
                  key={node.id}
                  nodeId={node.id}
                  state={state}
                  offset={nodeOffsets[node.id]}
                  isDragging={dragState?.nodeId === node.id}
                  selectNode={selectOrIgnoreDragClick}
                  beginDrag={beginNodeDrag}
                  dragNode={dragNode}
                  endDrag={endNodeDrag}
                  beginMouseDrag={beginMouseDrag}
                  dragNodeWithMouse={dragNodeWithMouse}
                  endMouseDrag={endMouseDrag}
                  registerNode={(element) => {
                    nodeRefs.current[node.id] = element;
                  }}
                />
              ))
            )}
            {state.candidateNodes.map((candidate) => (
              <article
                aria-label={candidate.node.title}
                className={[
                  "candidate-node",
                  `candidate-${candidate.status}`,
                  nodeOffsets[candidate.id] ? "is-positioned" : "",
                  dragState?.nodeId === candidate.id ? "is-dragging" : "",
                ].join(" ")}
                key={candidate.id}
                onPointerDown={(event) => beginNodeDrag(candidate.id, event)}
                onPointerMove={(event) => dragNode(candidate.id, event)}
                onPointerUp={(event) => endNodeDrag(candidate.id, event)}
                onPointerCancel={(event) => endNodeDrag(candidate.id, event)}
                onMouseDown={(event) => beginMouseDrag(candidate.id, event)}
                onMouseMove={(event) => dragNodeWithMouse(candidate.id, event)}
                onMouseUp={() => endMouseDrag(candidate.id)}
                onMouseLeave={() => endMouseDrag(candidate.id)}
                ref={(element) => {
                  candidateRefs.current[candidate.id] = element;
                }}
                style={
                  nodeOffsets[candidate.id]
                    ? { transform: `translate(${nodeOffsets[candidate.id].x}px, ${nodeOffsets[candidate.id].y}px)` }
                    : undefined
                }
              >
                <span className="candidate-status">{candidateStatusLabel(candidate.status)}</span>
                <strong>{candidate.node.title}</strong>
                <p>{candidate.node.summary}</p>
                <small>候选结果，合并前不写入主图</small>
              </article>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

function NodeButton({
  nodeId,
  state,
  offset,
  isDragging,
  selectNode,
  beginDrag,
  dragNode,
  endDrag,
  beginMouseDrag,
  dragNodeWithMouse,
  endMouseDrag,
  registerNode,
}: {
  nodeId: string;
  state: KnowledgeAppState;
  offset?: NodeOffset;
  isDragging: boolean;
  selectNode: (nodeId: string) => void;
  beginDrag: (nodeId: string, event: PointerEvent<HTMLElement>) => void;
  dragNode: (nodeId: string, event: PointerEvent<HTMLElement>) => void;
  endDrag: (nodeId: string, event: PointerEvent<HTMLElement>) => void;
  beginMouseDrag: (nodeId: string, event: MouseEvent<HTMLElement>) => void;
  dragNodeWithMouse: (nodeId: string, event: MouseEvent<HTMLElement>) => void;
  endMouseDrag: (nodeId: string) => void;
  registerNode: (element: HTMLButtonElement | null) => void;
}) {
  const node = state.researchMap.nodes.find((item) => item.id === nodeId)!;
  const markers = state.markers.filter((marker) => node.markerIds.includes(marker.id));
  const candidateCount = state.candidateNodes.filter((candidate) => candidate.node.parentNodeId === node.id).length;
  const isSelected = state.selectedNodeId === node.id;

  return (
    <button
      className={[
        "graph-node",
        `kind-${node.kind}`,
        `status-${node.status}`,
        `expansion-${node.expansionState}`,
        isSelected ? "selected" : "",
        offset ? "is-positioned" : "",
        isDragging ? "is-dragging" : "",
        ...markers.map((marker) => `marker-${marker.kind}`),
      ].join(" ")}
      onClick={() => selectNode(node.id)}
      onPointerDown={(event) => beginDrag(node.id, event)}
      onPointerMove={(event) => dragNode(node.id, event)}
      onPointerUp={(event) => endDrag(node.id, event)}
      onPointerCancel={(event) => endDrag(node.id, event)}
      onMouseDown={(event) => beginMouseDrag(node.id, event)}
      onMouseMove={(event) => dragNodeWithMouse(node.id, event)}
      onMouseUp={() => endMouseDrag(node.id)}
      onMouseLeave={() => endMouseDrag(node.id)}
      ref={registerNode}
      aria-label={node.title}
      aria-pressed={isSelected}
      style={offset ? { transform: `translate(${offset.x}px, ${offset.y}px)` } : undefined}
    >
      <span className="node-kicker">{node.kind} / {node.expansionState}</span>
      <strong>{node.title}</strong>
      <span>{node.summary}</span>
      <div className="marker-row">
        {markers.map((marker) => (
          <small className={`marker-badge marker-${marker.kind}`} key={marker.id}>
            {markerLabel(marker.kind)}
          </small>
        ))}
      </div>
      <div className="node-metrics">
        <small>证据 {node.evidenceIds.length}</small>
        <small>动作 {node.actionIds.length}</small>
        <small>候选 {candidateCount}</small>
      </div>
    </button>
  );
}

function edgePath(from: Point, to: Point, index: number, variant: EdgePath["variant"]): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const direction = index % 2 === 0 ? 1 : -1;
  const lane = ((index % 5) - 2) * 8;
  const bow = clamp(
    dy * 0.18 + direction * (variant === "candidate" || variant === "placeholder" ? 44 : 30) + lane,
    -120,
    120,
  );
  const tension = Math.max(80, Math.abs(dx) * 0.45);
  const c1 = {
    x: from.x + Math.sign(dx || 1) * tension,
    y: from.y + bow,
  };
  const c2 = {
    x: to.x - Math.sign(dx || 1) * tension * 0.74,
    y: to.y - bow * 0.7,
  };

  return `M ${from.x} ${from.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.x} ${to.y}`;
}

function anchorsFromRect(rect: DOMRect, mapRect: DOMRect): NodeAnchor {
  const left = rect.left - mapRect.left;
  const right = rect.right - mapRect.left;
  const centerY = rect.top - mapRect.top + rect.height / 2;

  return {
    center: {
      x: left + rect.width / 2,
      y: centerY,
    },
    left: {
      x: left,
      y: centerY,
    },
    right: {
      x: right,
      y: centerY,
    },
  };
}

function sourceAnchor(from: NodeAnchor, to: NodeAnchor): Point {
  return to.center.x >= from.center.x ? from.right : from.left;
}

function canStartCanvasPan(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;

  return !target.closest(".graph-node, .candidate-node, .empty-branch, button, input, textarea, a");
}

function visibleParentNodeId(
  selectedNodeId: string | undefined,
  visibleNodeIds: Set<string>,
  fallbackNodeId: string | undefined,
): string | undefined {
  return selectedNodeId && visibleNodeIds.has(selectedNodeId) ? selectedNodeId : fallbackNodeId;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
