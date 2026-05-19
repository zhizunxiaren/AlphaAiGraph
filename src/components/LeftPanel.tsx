import { Bot, ChevronsLeft, FileText, GitBranch, Network, Route, SquareStack } from "lucide-react";
import type { KnowledgeAppState } from "../types";

export function LeftPanel({
  state,
  setCanvasMode,
  openSourceDrawer,
  toggleCollapsed,
}: {
  state: KnowledgeAppState;
  setCanvasMode: (mode: KnowledgeAppState["canvasMode"]) => void;
  openSourceDrawer: () => void;
  toggleCollapsed: () => void;
}) {
  const selectedPath = buildSelectedPath(state);

  return (
    <aside className="panel left-panel" aria-label="研究对象导航">
      <div className="pane-toggle-row">
        <button className="icon-button pane-toggle" aria-expanded={true} aria-label="收起研究对象导航" onClick={toggleCollapsed}>
          <ChevronsLeft size={16} aria-hidden="true" />
        </button>
      </div>
      <section className="agent-card">
        <Bot size={18} />
        <div>
          <strong>{state.researchObject.title}</strong>
          <span>{state.researchObject.kind} / {state.researchObject.status}</span>
        </div>
      </section>
      <section className="nav-summary">
        <span className="eyebrow">Research Session</span>
        <h2>{state.researchSession.title}</h2>
        <p>{state.researchThread.title} / {state.researchThread.status}</p>
        <p>{state.sourceAssets.length} 个资料源</p>
      </section>
      <nav className="nav-tabs" aria-label="主导航">
        <button className={state.canvasMode === "research_map" ? "active" : ""} onClick={() => setCanvasMode("research_map")}>
          <Route size={15} /> 研究地图
        </button>
        <button>
          <SquareStack size={15} /> 候选结果
        </button>
        <button onClick={openSourceDrawer}>
          <FileText size={15} /> 资料
        </button>
        <button className={state.canvasMode === "relationship_graph" ? "active" : ""} onClick={() => setCanvasMode("relationship_graph")}>
          <Network size={15} /> 关系图谱
        </button>
        <button>
          <GitBranch size={15} /> 输出
        </button>
      </nav>
      <section className="current-path-card">
        <h3>当前路径</h3>
        <p>{selectedPath}</p>
      </section>
      <section className="source-mini-list">
        <h3>资料源</h3>
        {state.sourceAssets.map((source) => (
          <button key={source.id} onClick={openSourceDrawer}>
            <span>{source.title} 资料</span>
            <small>{source.kind}</small>
          </button>
        ))}
      </section>
    </aside>
  );
}

function buildSelectedPath(state: KnowledgeAppState): string {
  const selected = state.researchMap.nodes.find((node) => node.id === state.selectedNodeId);
  if (!selected) return "未选择节点";
  const parent = state.researchMap.nodes.find((node) => node.id === selected.parentNodeId);
  return parent ? `${parent.title} / ${selected.title}` : selected.title;
}
