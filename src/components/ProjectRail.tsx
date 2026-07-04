import {
  Bot,
  ClipboardList,
  Files,
  Folders,
  FolderArchive,
  Map,
  PanelLeftClose,
  PanelLeftOpen,
  Waypoints,
  Workflow
} from "lucide-react";
import type { ResearchWorkspaceController } from "../state/useResearchWorkspace";

interface ProjectRailProps {
  workspace: ResearchWorkspaceController;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  agentFeedCollapsed?: boolean;
  onToggleAgentFeedCollapsed?: () => void;
}

const navItems = [
  ["研究地图", Map],
  ["候选结果", ClipboardList],
  ["资料", Files],
  ["关系图谱", Waypoints],
  ["输出", FolderArchive]
] as const;

export function ProjectRail({ workspace, collapsed, onToggleCollapsed, agentFeedCollapsed, onToggleAgentFeedCollapsed }: ProjectRailProps) {
  const firstCandidate = workspace.candidates.find((candidate) => candidate.status === "pending_review" || candidate.status === "needs_review");
  const firstRun = workspace.executionRuns[0];
  const agentToggleLabel = agentFeedCollapsed ? "展开 Agent 研究过程流" : "收起 Agent 研究过程流";

  return (
    <aside className={`panel project-rail ${collapsed ? "collapsed" : ""}`} aria-label="研究对象导航">
      <div className="rail-collapse-stack">
        <button
          type="button"
          className="rail-toggle"
          aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
          title={collapsed ? "展开侧边栏" : "收起侧边栏"}
          aria-expanded={!collapsed}
          onClick={onToggleCollapsed}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>
      {!collapsed ? (
        <>
          <section className="pinned-list rail-list-section" aria-label="置顶">
            <div className="panel-kicker">置顶</div>
            <button
              type="button"
              className="project-list-item"
              aria-label={`置顶 ${workspace.object.title}`}
              onClick={() => workspace.selectNode(workspace.map.rootNodeId)}
            >
              <Folders size={15} />
              <span>{workspace.object.title}</span>
            </button>
            <div className="recent-graph-list">
              <button
                type="button"
                className="recent-graph-item"
                aria-label={`${workspace.map.title} 最近研究`}
                onClick={() => {
                  workspace.switchCanvasMode("research_map");
                  workspace.selectNode(workspace.map.rootNodeId);
                }}
              >
                <span>{workspace.map.title}</span>
                <small>当前</small>
              </button>
            </div>
            <button type="button" className="show-more-button">
              展开显示
            </button>
          </section>

          <section className="project-list rail-list-section" aria-label="项目列表">
            <div className="panel-kicker">项目</div>
            <button
              type="button"
              className="project-list-item active"
              aria-label={`${workspace.object.title} 项目`}
              onClick={() => workspace.selectNode(workspace.map.rootNodeId)}
            >
              <Folders size={15} />
              <span>{workspace.object.title}</span>
              <small>1 graph</small>
            </button>
            <div className="graph-list" aria-label={`${workspace.object.title} 的研究 Graph`}>
              <button
                type="button"
                className="graph-list-item active"
                aria-label={workspace.map.title}
                onClick={() => {
                  workspace.switchCanvasMode("research_map");
                  workspace.selectNode(workspace.map.rootNodeId);
                }}
              >
                <Workflow size={14} />
                <span>{workspace.map.title}</span>
              </button>
            </div>
          </section>
        </>
      ) : null}
      <nav className="rail-nav" aria-label="主导航">
        {navItems.map(([label, Icon]) => (
          <button
            key={label}
            type="button"
            aria-label={label}
            className={(label === "研究地图" && workspace.canvasMode === "research_map") || (label === "关系图谱" && workspace.canvasMode === "relationship_graph") ? "active" : ""}
            onClick={() => {
              if (label === "研究地图") workspace.switchCanvasMode("research_map");
              if (label === "关系图谱") {
                workspace.switchCanvasMode("relationship_graph");
              }
              if (label === "资料") {
                workspace.openSourceList();
              }
              if (label === "候选结果" && firstCandidate) {
                workspace.switchCanvasMode("research_map");
                workspace.selectNode(firstCandidate.parentNodeId);
              }
              if (label === "输出" && firstRun) {
                workspace.switchCanvasMode("research_map");
                workspace.selectNode(firstRun.nodeId);
              }
            }}
          >
            <Icon size={15} />
            {!collapsed ? (
              <>
                <span className="nav-label">{label}</span>
                {label === "资料" ? <span className="nav-count" aria-hidden="true">{workspace.sourceAssets.length}</span> : null}
              </>
            ) : null}
          </button>
        ))}
      </nav>
      {collapsed && agentFeedCollapsed && onToggleAgentFeedCollapsed ? (
        <button
          type="button"
          className="rail-toggle secondary-rail-toggle"
          aria-label={agentToggleLabel}
          title={agentToggleLabel}
          aria-expanded={false}
          onClick={onToggleAgentFeedCollapsed}
        >
          <Bot size={17} />
        </button>
      ) : null}
    </aside>
  );
}
