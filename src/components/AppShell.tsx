import { type MouseEvent, useEffect, useMemo, useState } from "react";
import { Bot, PanelLeftOpen } from "lucide-react";
import { projectRelationshipGraph } from "../research/projection";
import type { InquiryContextPolicy, KnowledgeAppState } from "../types";
import { AgentFeed } from "./AgentFeed";
import { GraphCanvas } from "./GraphCanvas";
import { LeftPanel } from "./LeftPanel";
import { NodeInspector } from "./NodeInspector";
import { SourceDrawer } from "./SourceDrawer";

type PaneKey = "left" | "feed" | "inspector";
type ResizeDirection = "normal" | "inverse";
type ResizeDrag = {
  pane: PaneKey;
  direction: ResizeDirection;
  startX: number;
  startWidth: number;
};

const paneBounds: Record<PaneKey, { min: number; max: number }> = {
  left: { min: 76, max: 320 },
  feed: { min: 260, max: 460 },
  inspector: { min: 260, max: 480 },
};

const defaultPaneWidths: Record<PaneKey, number> = {
  left: 210,
  feed: 320,
  inspector: 320,
};

export interface AppShellProps {
  state: KnowledgeAppState;
  selectNode?: (nodeId: string) => void;
  setCanvasMode?: (mode: KnowledgeAppState["canvasMode"]) => void;
  drillDown?: (nodeId: string) => void;
  createInquiry?: (nodeId: string, question: string, policy: InquiryContextPolicy) => void;
  mergeCandidate?: (candidateId: string) => void;
}

export function AppShell({
  state,
  selectNode = () => undefined,
  setCanvasMode = () => undefined,
  drillDown = () => undefined,
  createInquiry = () => undefined,
  mergeCandidate = () => undefined,
}: AppShellProps) {
  const [draftQuestion, setDraftQuestion] = useState("");
  const [sourceDrawerOpen, setSourceDrawerOpen] = useState(false);
  const [nodeInspectorOpen, setNodeInspectorOpen] = useState(true);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [agentFeedCollapsed, setAgentFeedCollapsed] = useState(false);
  const [paneWidths, setPaneWidths] = useState(defaultPaneWidths);
  const [resizeDrag, setResizeDrag] = useState<ResizeDrag>();
  const relationshipGraph = useMemo(
    () =>
      projectRelationshipGraph({
        object: state.researchObject,
        map: state.researchMap,
        markers: state.markers,
        evidenceAnchors: state.evidenceAnchors,
        executionRuns: state.executionRuns,
        conceptNotes: state.conceptNotes,
        knowledgeDigests: state.knowledgeDigests,
      }),
    [state],
  );

  const selectedNode = state.researchMap.nodes.find((node) => node.id === state.selectedNodeId);
  const selectedPath = buildSelectedPath(state);
  const cockpitColumns = buildCockpitColumns({
    paneWidths,
    leftPanelCollapsed,
    agentFeedCollapsed,
    nodeInspectorOpen,
  });

  useEffect(() => {
    if (!resizeDrag) return undefined;

    const handleMouseMove = (event: globalThis.MouseEvent) => {
      const delta = event.clientX - resizeDrag.startX;
      const nextWidth =
        resizeDrag.direction === "inverse"
          ? resizeDrag.startWidth - delta
          : resizeDrag.startWidth + delta;

      setPaneWidths((current) => ({
        ...current,
        [resizeDrag.pane]: clamp(nextWidth, paneBounds[resizeDrag.pane].min, paneBounds[resizeDrag.pane].max),
      }));
    };
    const stopResize = () => setResizeDrag(undefined);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopResize);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopResize);
    };
  }, [resizeDrag]);

  const startPaneResize = (pane: PaneKey, direction: ResizeDirection, event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    setResizeDrag({
      pane,
      direction,
      startX: event.clientX,
      startWidth: paneWidths[pane],
    });
  };

  const resizePaneByKeyboard = (pane: PaneKey, direction: ResizeDirection, delta: number) => {
    const signedDelta = direction === "inverse" ? -delta : delta;
    setPaneWidths((current) => ({
      ...current,
      [pane]: clamp(current[pane] + signedDelta, paneBounds[pane].min, paneBounds[pane].max),
    }));
  };

  return (
    <div className="app-shell">
      <header className="top-context" role="banner" aria-label="研究上下文">
        <div className="brand-lockup">
          <span className="brand-mark">A</span>
          <div>
            <strong>AlphaAiGraph</strong>
            <span>AI Agent 渐进式研究地图</span>
          </div>
        </div>
        <div className="context-path" aria-label="当前研究路径">
          <span>当前研究路径</span>
          <strong>{selectedPath}</strong>
        </div>
        <div className="top-actions">
          <button
            className={state.canvasMode === "research_map" ? "mode-button active" : "mode-button"}
            aria-label="切换到研究地图"
            onClick={() => setCanvasMode("research_map")}
          >
            研究地图
          </button>
          <button
            className={state.canvasMode === "relationship_graph" ? "mode-button active" : "mode-button"}
            aria-label="切换到关系图谱"
            onClick={() => setCanvasMode("relationship_graph")}
          >
            关系图谱
          </button>
          <button className="mode-button" aria-label="打开资料抽屉" onClick={() => setSourceDrawerOpen(true)}>
            资料
          </button>
          {!nodeInspectorOpen ? (
            <button className="mode-button" aria-label="打开节点检查器" onClick={() => setNodeInspectorOpen(true)}>
              检查器
            </button>
          ) : null}
        </div>
      </header>
      <div
        className={[
          "cockpit-grid",
          nodeInspectorOpen ? "" : "inspector-closed",
          leftPanelCollapsed ? "left-panel-collapsed" : "",
          agentFeedCollapsed ? "agent-feed-collapsed" : "",
          resizeDrag ? "is-resizing" : "",
        ].join(" ")}
        style={{ gridTemplateColumns: cockpitColumns }}
      >
        {leftPanelCollapsed || agentFeedCollapsed ? (
          <CollapsedLeftRail
            leftPanelCollapsed={leftPanelCollapsed}
            agentFeedCollapsed={agentFeedCollapsed}
            openLeftPanel={() => setLeftPanelCollapsed(false)}
            openAgentFeed={() => setAgentFeedCollapsed(false)}
          />
        ) : null}
        {!leftPanelCollapsed ? (
          <>
            <LeftPanel
              state={state}
              setCanvasMode={setCanvasMode}
              openSourceDrawer={() => setSourceDrawerOpen(true)}
              toggleCollapsed={() => setLeftPanelCollapsed(true)}
            />
            <PaneResizer
              label="调整研究对象导航宽度"
              value={paneWidths.left}
              min={paneBounds.left.min}
              max={paneBounds.left.max}
              onMouseDown={(event) => startPaneResize("left", "normal", event)}
              onKeyboardResize={(delta) => resizePaneByKeyboard("left", "normal", delta)}
            />
          </>
        ) : null}
        {!agentFeedCollapsed ? (
          <>
            <AgentFeed
              state={state}
              selectedNode={selectedNode}
              toggleCollapsed={() => setAgentFeedCollapsed(true)}
            />
            <PaneResizer
              label="调整研究过程流宽度"
              value={paneWidths.feed}
              min={paneBounds.feed.min}
              max={paneBounds.feed.max}
              onMouseDown={(event) => startPaneResize("feed", "normal", event)}
              onKeyboardResize={(delta) => resizePaneByKeyboard("feed", "normal", delta)}
            />
          </>
        ) : null}
        <GraphCanvas
          state={state}
          relationshipGraph={relationshipGraph}
          selectNode={selectNode}
          setCanvasMode={setCanvasMode}
          drillDown={drillDown}
        />
        {nodeInspectorOpen ? (
          <>
            <PaneResizer
              label="调整节点检查器宽度"
              value={paneWidths.inspector}
              min={paneBounds.inspector.min}
              max={paneBounds.inspector.max}
              onMouseDown={(event) => startPaneResize("inspector", "inverse", event)}
              onKeyboardResize={(delta) => resizePaneByKeyboard("inspector", "inverse", delta)}
            />
            <NodeInspector
              state={state}
              selectedNode={selectedNode}
              draftQuestion={draftQuestion}
              setDraftQuestion={setDraftQuestion}
              drillDown={drillDown}
              createInquiry={createInquiry}
              mergeCandidate={mergeCandidate}
              openSourceDrawer={() => setSourceDrawerOpen(true)}
              closeInspector={() => setNodeInspectorOpen(false)}
            />
          </>
        ) : null}
      </div>
      {sourceDrawerOpen ? (
        <SourceDrawer
          state={state}
          selectedNode={selectedNode}
          onClose={() => setSourceDrawerOpen(false)}
        />
      ) : null}
    </div>
  );
}

function CollapsedLeftRail({
  leftPanelCollapsed,
  agentFeedCollapsed,
  openLeftPanel,
  openAgentFeed,
}: {
  leftPanelCollapsed: boolean;
  agentFeedCollapsed: boolean;
  openLeftPanel: () => void;
  openAgentFeed: () => void;
}) {
  return (
    <aside className="panel collapsed-left-rail" aria-label="左侧折叠栏">
      {leftPanelCollapsed ? (
        <button
          className="icon-button collapsed-rail-button"
          aria-label="展开研究对象导航"
          title="展开研究对象导航"
          onClick={openLeftPanel}
        >
          <PanelLeftOpen size={18} aria-hidden="true" />
        </button>
      ) : null}
      {agentFeedCollapsed ? (
        <button
          className="icon-button collapsed-rail-button"
          aria-label="展开 Agent 研究过程流"
          title="展开 Agent 研究过程流"
          onClick={openAgentFeed}
        >
          <Bot size={18} aria-hidden="true" />
        </button>
      ) : null}
    </aside>
  );
}

function buildCockpitColumns({
  paneWidths,
  leftPanelCollapsed,
  agentFeedCollapsed,
  nodeInspectorOpen,
}: {
  paneWidths: Record<PaneKey, number>;
  leftPanelCollapsed: boolean;
  agentFeedCollapsed: boolean;
  nodeInspectorOpen: boolean;
}) {
  const columns = [
    ...(leftPanelCollapsed || agentFeedCollapsed ? [`${paneBounds.left.min}px`] : []),
    ...(!leftPanelCollapsed ? [`${paneWidths.left}px`] : []),
    ...(!leftPanelCollapsed ? ["8px"] : []),
    ...(!agentFeedCollapsed ? [`${paneWidths.feed}px`] : []),
    ...(!agentFeedCollapsed ? ["8px"] : []),
    "minmax(0, 1fr)",
  ];

  if (nodeInspectorOpen) {
    columns.push("8px", `${paneWidths.inspector}px`);
  }

  return columns.join(" ");
}

function PaneResizer({
  label,
  value,
  min,
  max,
  onMouseDown,
  onKeyboardResize,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onMouseDown: (event: MouseEvent<HTMLDivElement>) => void;
  onKeyboardResize: (delta: number) => void;
}) {
  return (
    <div
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemax={max}
      aria-valuemin={min}
      aria-valuenow={value}
      className="pane-resizer"
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          onKeyboardResize(-16);
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          onKeyboardResize(16);
        }
      }}
      onMouseDown={onMouseDown}
      role="separator"
      tabIndex={0}
    />
  );
}

function buildSelectedPath(state: KnowledgeAppState): string {
  const selected = state.researchMap.nodes.find((node) => node.id === state.selectedNodeId);
  if (!selected) return `${state.researchObject.title} / ${state.researchThread.title}`;
  const parent = state.researchMap.nodes.find((node) => node.id === selected.parentNodeId);
  return parent
    ? `${state.researchObject.title} / ${state.researchThread.title} / ${parent.title} / ${selected.title}`
    : `${state.researchObject.title} / ${state.researchThread.title} / ${selected.title}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
