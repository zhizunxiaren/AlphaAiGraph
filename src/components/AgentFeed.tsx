import { Bot, CheckCircle2, CircleDot, Lightbulb, Radar, TriangleAlert } from "lucide-react";
import type { KnowledgeAppState, ResearchNode } from "../types";
import { jobStatusLabel, markerLabel } from "./labels";

export function AgentFeed({
  state,
  selectedNode,
}: {
  state: KnowledgeAppState;
  selectedNode?: ResearchNode;
}) {
  const selectedMarkers = selectedNode
    ? state.markers.filter((marker) => selectedNode.markerIds.includes(marker.id))
    : [];
  const visibleJobs = [...state.jobs]
    .sort((left, right) => Number(right.status === "running") - Number(left.status === "running"))
    .slice(0, 5);

  return (
    <aside className="panel agent-feed" aria-label="Agent 研究过程流">
      <header className="panel-header compact">
        <div>
          <span className="eyebrow">Agent Run Feed</span>
          <h2>研究过程流</h2>
        </div>
        <span className="status-pill active">active</span>
      </header>

      <section className="event-block event-primary">
        <div className="event-icon" aria-hidden="true">
          <Radar size={16} />
        </div>
        <div>
          <strong>地图已生成</strong>
          <p>已扫描 {state.sourceAssets.length} 个资料源，生成第一层研究 workflow，等待用户选择下钻方向。</p>
          <span className="event-link">关联：{state.researchObject.title}</span>
        </div>
      </section>

      <section className="event-block">
        <div className="event-icon" aria-hidden="true">
          <Lightbulb size={16} />
        </div>
        <div>
          <strong>当前建议</strong>
          <p>
            {selectedNode
              ? `围绕「${selectedNode.title}」查看 marker 理由和证据，再决定是否深入研究。`
              : "先选择一个研究节点。"}
          </p>
          {selectedMarkers.length > 0 ? (
            <div className="inline-marker-list">
              {selectedMarkers.map((marker) => (
                <span className={`marker-badge marker-${marker.kind}`} key={marker.id}>
                  {markerLabel(marker.kind)}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="feed-section">
        <h3>AI 判断</h3>
        {selectedMarkers.length === 0 ? <p className="muted">当前节点暂无 marker。</p> : null}
        {selectedMarkers.map((marker) => (
          <article className="reason-row" key={marker.id}>
            <div>
              <strong>{markerLabel(marker.kind)}</strong>
              <p>{marker.rationale}</p>
            </div>
            <span>{Math.round(marker.confidence * 100)}%</span>
          </article>
        ))}
      </section>

      <section className="feed-section">
        <h3>任务状态</h3>
        {visibleJobs.map((job) => (
          <article className="job-feed-row" key={job.id}>
            <span className={`job-dot status-${job.status}`} />
            <div>
              <strong>{job.title}</strong>
              <span>{jobStatusLabel(job.status)} / {job.kind}</span>
            </div>
          </article>
        ))}
      </section>

      {state.warnings.length > 0 ? (
        <section className="event-block event-warning">
          <div className="event-icon" aria-hidden="true">
            <TriangleAlert size={16} />
          </div>
          <div>
            <strong>需要处理</strong>
            {state.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        </section>
      ) : (
        <section className="event-block event-complete">
          <div className="event-icon" aria-hidden="true">
            <CheckCircle2 size={16} />
          </div>
          <div>
            <strong>候选合并受控</strong>
            <p>并行产物先进入候选结果区，合并前不写入主图。</p>
          </div>
        </section>
      )}

      <footer className="feed-footer">
        <Bot size={15} aria-hidden="true" />
        <span>Agent 只建议路径，最终下钻和合并由用户触发。</span>
        <CircleDot size={12} aria-hidden="true" />
      </footer>
    </aside>
  );
}
