import { Check, FileSearch, GitMerge, MessageCircleQuestion, Play, Search } from "lucide-react";
import type { InquiryContextPolicy, KnowledgeAppState, ResearchNode } from "../types";
import { candidateStatusLabel, contextPolicyLabel, jobStatusLabel, markerLabel } from "./labels";

export function NodeInspector({
  state,
  selectedNode,
  draftQuestion,
  setDraftQuestion,
  drillDown,
  createInquiry,
  mergeCandidate,
  openSourceDrawer,
  closeInspector,
}: {
  state: KnowledgeAppState;
  selectedNode?: ResearchNode;
  draftQuestion: string;
  setDraftQuestion: (value: string) => void;
  drillDown: (nodeId: string) => void;
  createInquiry: (nodeId: string, question: string, policy: InquiryContextPolicy) => void;
  mergeCandidate: (candidateId: string) => void;
  openSourceDrawer: () => void;
  closeInspector: () => void;
}) {
  const selectedMarkers = selectedNode
    ? state.markers.filter((marker) => selectedNode.markerIds.includes(marker.id))
    : [];
  const evidence = selectedNode
    ? state.evidenceAnchors.filter((item) => selectedNode.evidenceIds.includes(item.id))
    : [];
  const actions = selectedNode
    ? state.actions.filter((item) => item.nodeId === selectedNode.id || selectedNode.actionIds.includes(item.id))
    : [];
  const nodeJobs = selectedNode
    ? state.jobs.filter((job) => job.nodeIds.includes(selectedNode.id))
    : state.jobs;
  const nodeRuns = selectedNode
    ? state.executionRuns.filter((run) => run.nodeId === selectedNode.id)
    : state.executionRuns;
  const hasDrillAction = actions.some((action) => action.kind === "drill_down");

  return (
    <aside className="panel node-inspector" aria-label="节点检查器">
      <header className="panel-header inspector-header">
        <div>
          <span className="eyebrow">Node Inspector</span>
          <h2>节点检查器</h2>
        </div>
        <button className="ghost-action" aria-label="关闭节点检查器" onClick={closeInspector}>
          收起
        </button>
      </header>
      {!selectedNode ? (
        <section className="empty-state">请选择研究节点</section>
      ) : (
        <section className="selected-node">
          <span className="eyebrow">{selectedNode.kind} / {selectedNode.status}</span>
          <h2>{selectedNode.title}</h2>
          <p>{selectedNode.summary}</p>
          <div className="inline-marker-list">
            {selectedMarkers.map((marker) => (
              <span className={`marker-badge marker-${marker.kind}`} key={marker.id}>
                {markerLabel(marker.kind)}
              </span>
            ))}
          </div>
          {hasDrillAction ? (
            <button className="primary-action" onClick={() => drillDown(selectedNode.id)}>
              <Search size={15} aria-hidden="true" /> 深入研究
            </button>
          ) : null}
        </section>
      )}

      <section className="inspector-section">
        <h3>Agent 判断理由</h3>
        {selectedMarkers.length === 0 ? <p className="muted">当前节点暂无判断理由。</p> : null}
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

      <section className="inspector-section">
        <div className="section-title-row">
          <h3>证据锚点</h3>
          <button className="ghost-action" onClick={openSourceDrawer}>
            <FileSearch size={14} aria-hidden="true" /> 查看资料
          </button>
        </div>
        {evidence.length === 0 ? <p className="muted">暂无证据锚点</p> : null}
        {evidence.map((item) => (
          <button className="evidence-row" key={item.id} onClick={openSourceDrawer}>
            <strong>{item.title}</strong>
            <span>{item.quote}</span>
            <small>{item.locator.path ?? item.locator.kind}</small>
          </button>
        ))}
      </section>

      <section className="inspector-section">
        <h3>建议动作</h3>
        {actions.map((action) => (
          <article className="list-item dense" key={action.id}>
            <strong>{action.title}</strong>
            <span>{action.description}</span>
          </article>
        ))}
      </section>

      <section className="inspector-section">
        <h3>旁路临时会话</h3>
        <p className="section-note">旁路会话默认不修改主研究图</p>
        <div className="inquiry-row">
          <input
            aria-label="旁路问题"
            value={draftQuestion}
            onChange={(event) => setDraftQuestion(event.target.value)}
            placeholder="输入旁路问题"
          />
          <button
            aria-label="创建旁路会话"
            onClick={() => selectedNode && createInquiry(selectedNode.id, draftQuestion, "local_node")}
          >
            <MessageCircleQuestion size={15} aria-hidden="true" />
          </button>
        </div>
        {state.sideInquiries.map((item) => (
          <article className="list-item dense" key={item.id}>
            <strong>{item.question}</strong>
            <span>{contextPolicyLabel(item.contextPolicy)} / {item.status}</span>
          </article>
        ))}
      </section>

      <section className="inspector-section candidate-section">
        <h3>候选结果区</h3>
        <p className="section-note">合并前不写入主图</p>
        {state.candidateNodes.map((candidate) => (
          <article className={`candidate-row candidate-${candidate.status}`} key={candidate.id}>
            <div>
              <strong>{candidate.node.title}</strong>
              <span>{candidateStatusLabel(candidate.status)}</span>
              {candidate.conflictReason ? <small>{candidate.conflictReason}</small> : null}
            </div>
            {candidate.status === "pending_review" ? (
              <button onClick={() => mergeCandidate(candidate.id)}>
                <GitMerge size={14} aria-hidden="true" /> 合并
              </button>
            ) : null}
          </article>
        ))}
      </section>

      <section className="inspector-section">
        <h3>并行任务</h3>
        {nodeJobs.map((job) => (
          <article className="job-feed-row" key={job.id}>
            <span className={`job-dot status-${job.status}`} />
            <div>
              <strong>{job.title}</strong>
              <span>{jobStatusLabel(job.status)}</span>
            </div>
          </article>
        ))}
      </section>

      <section className="inspector-section">
        <h3>执行结果</h3>
        {nodeRuns.length === 0 ? <p className="muted">暂无执行结果</p> : null}
        {nodeRuns.map((run) => (
          <article className="list-item dense" key={run.id}>
            <strong>{run.command}</strong>
            <span>{run.status} / {run.output}</span>
          </article>
        ))}
      </section>

      <section className="inspector-section support-actions">
        <p><Check size={14} aria-hidden="true" /> Study、Synthesis、Export 作为节点辅助动作保留</p>
        <p><Play size={14} aria-hidden="true" /> 执行动作需要用户显式触发</p>
      </section>
    </aside>
  );
}
