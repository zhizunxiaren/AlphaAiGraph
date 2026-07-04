import { AlertTriangle, CheckCircle2, PanelLeftClose, PanelLeftOpen, PlayCircle } from "lucide-react";
import type { ResearchWorkspaceController } from "../state/useResearchWorkspace";

interface AgentFeedProps {
  workspace: ResearchWorkspaceController;
  collapsed: boolean;
  mergedIntoProjectRail: boolean;
  onToggleCollapsed: () => void;
}

export function AgentFeed({ workspace, collapsed, mergedIntoProjectRail, onToggleCollapsed }: AgentFeedProps) {
  const selected = workspace.selectedNode;
  const relatedJobs = workspace.jobs.filter((job) => !selected || job.nodeIds.includes(selected.id) || job.nodeIds.includes("node-root"));
  const toggleLabel = collapsed ? "展开 Agent 研究过程流" : "收起 Agent 研究过程流";

  if (collapsed) {
    return (
      <aside className={`panel agent-feed collapsed ${mergedIntoProjectRail ? "merged-collapsed" : ""}`} aria-label="Agent 研究过程流">
        {!mergedIntoProjectRail ? (
          <button type="button" className="panel-toggle" aria-label={toggleLabel} title={toggleLabel} aria-expanded={false} onClick={onToggleCollapsed}>
            <PanelLeftOpen size={16} />
          </button>
        ) : null}
      </aside>
    );
  }

  return (
    <aside className="panel agent-feed" aria-label="Agent 研究过程流">
      <div className="panel-heading">
        <span>Agent 研究过程流</span>
        <small>{relatedJobs.length} jobs</small>
        <button type="button" className="panel-toggle" aria-label={toggleLabel} title={toggleLabel} aria-expanded={true} onClick={onToggleCollapsed}>
          <PanelLeftClose size={16} />
        </button>
      </div>
      <div className="event-block complete">
        <div className="event-title"><CheckCircle2 size={15} /> 地图已生成</div>
        <p>Agent 已扫描项目规则、计划和规格，生成第一层研究工作流脑图。</p>
        <small>只生成高层地图，等待用户选择下钻路径。</small>
      </div>
      {workspace.candidates.filter((candidate) => candidate.status !== "dismissed").map((candidate) => (
        <div className={`event-block candidate ${candidate.status}`} key={candidate.id}>
          <div className="event-title"><AlertTriangle size={15} /> 候选结果待审核</div>
          <p>{candidate.node.title}</p>
          <small>{candidate.status}{candidate.conflictReason ? ` · ${candidate.conflictReason}` : ""}</small>
        </div>
      ))}
      {relatedJobs.map((job) => (
        <div className={`job-row ${job.status}`} key={job.id}>
          <PlayCircle size={14} />
          <span>{job.title}</span>
          <strong>{job.status}</strong>
        </div>
      ))}
    </aside>
  );
}
