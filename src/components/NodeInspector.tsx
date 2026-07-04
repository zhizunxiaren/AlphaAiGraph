import { Check, FileSearch, GitPullRequestArrow, MessageSquarePlus, PanelRightClose, PanelRightOpen, SearchCode } from "lucide-react";
import { useState } from "react";
import { markerLabel } from "../research/researchAgent";
import type { ResearchWorkspaceController } from "../state/useResearchWorkspace";
import type { InquiryContextPolicy } from "../types";

interface NodeInspectorProps {
  workspace: ResearchWorkspaceController;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export function NodeInspector({ workspace, collapsed, onToggleCollapsed }: NodeInspectorProps) {
  const [question, setQuestion] = useState("这个节点当前最值得验证的点是什么？");
  const [policy, setPolicy] = useState<InquiryContextPolicy>("local_node");
  const selected = workspace.selectedNode;
  const toggleLabel = collapsed ? "展开节点检查器" : "收起节点检查器";

  if (collapsed) {
    return (
      <aside className="panel node-inspector collapsed" aria-label="节点检查器">
        <button type="button" className="panel-toggle" aria-label={toggleLabel} title={toggleLabel} aria-expanded={false} onClick={onToggleCollapsed}>
          <PanelRightOpen size={16} />
        </button>
      </aside>
    );
  }

  if (!selected) {
    return (
      <aside className="panel node-inspector" aria-label="节点检查器">
        <div className="panel-heading">
          <span>节点检查器</span>
          <button type="button" className="panel-toggle" aria-label={toggleLabel} title={toggleLabel} aria-expanded={true} onClick={onToggleCollapsed}>
            <PanelRightClose size={16} />
          </button>
        </div>
        <div className="empty-state">请选择一个研究节点。</div>
      </aside>
    );
  }

  const selectedEvidence = workspace.evidenceAnchors.filter((evidence) => selected.evidenceIds.includes(evidence.id));
  const selectedActions = workspace.actions.filter((action) => selected.actionIds.includes(action.id));
  const selectedInquiries = workspace.sideInquiries.filter((inquiry) => inquiry.sourceNodeId === selected.id);
  const selectedCandidates = workspace.candidates.filter((candidate) => candidate.parentNodeId === selected.id);
  const selectedJobs = workspace.jobs.filter((job) => job.nodeIds.includes(selected.id));

  return (
    <aside className="panel node-inspector" aria-label="节点检查器">
      <div className="panel-heading">
        <span>节点检查器</span>
        <small>{selected.kind}</small>
        <button type="button" className="panel-toggle" aria-label={toggleLabel} title={toggleLabel} aria-expanded={true} onClick={onToggleCollapsed}>
          <PanelRightClose size={16} />
        </button>
      </div>
      <section>
        <h2>{selected.title}</h2>
        <p>{selected.summary}</p>
        <div className="marker-row">
          {selected.markers.map((marker) => <span className={`marker-badge marker-${marker.kind}`} key={marker.id}>{markerLabel(marker.kind)}</span>)}
        </div>
      </section>

      <section>
        <h3>Agent 判断理由</h3>
        {selected.markers.length === 0 ? <p className="muted">该节点暂无 marker。</p> : selected.markers.map((marker) => (
          <div className="reason-row" key={marker.id}>
            <strong>{markerLabel(marker.kind)}</strong>
            <span>{marker.reason}</span>
          </div>
        ))}
      </section>

      <section>
        <h3>证据锚点</h3>
        {selectedEvidence.map((evidence) => (
          <button className="evidence-row" type="button" key={evidence.id} onClick={() => workspace.openEvidence(evidence.id)}>
            <FileSearch size={15} />
            <span>{evidence.title ?? evidence.uri}</span>
            <small>{evidence.reason}</small>
          </button>
        ))}
      </section>

      <section>
        <h3>建议动作</h3>
        <div className="action-grid">
          <button type="button" className="primary-action" onClick={() => workspace.drillDownNode(selected.id)}>
            <SearchCode size={15} /> 深入研究
          </button>
          <button type="button" onClick={() => workspace.startParallelAnalysis([selected.id])}>
            <GitPullRequestArrow size={15} /> 并行分析
          </button>
          {selectedActions.map((action) => <span className="action-chip" key={action.id}>{action.title}</span>)}
        </div>
      </section>

      <section>
        <h3>旁路临时会话</h3>
        <div className="side-inquiry-form">
          <textarea aria-label="旁路问题" value={question} onChange={(event) => setQuestion(event.target.value)} />
          <select aria-label="上下文策略" value={policy} onChange={(event) => setPolicy(event.target.value as InquiryContextPolicy)}>
            <option value="local_node">当前节点</option>
            <option value="current_branch">当前分支</option>
            <option value="whole_project">全项目</option>
          </select>
          <button type="button" onClick={() => workspace.createSideInquiry(selected.id, question, policy)}>
            <MessageSquarePlus size={15} /> 创建旁路会话
          </button>
        </div>
        <p className="isolation-note">旁路会话默认不修改主研究图。只有用户选择沉淀后才进入关系图谱。</p>
        {selectedInquiries.map((inquiry) => (
          <div className="inquiry-row" key={inquiry.id}>
            <strong>{inquiry.title}</strong>
            <small>{inquiry.contextPolicy} · {inquiry.status}</small>
            <button type="button" onClick={() => workspace.promoteInquiry(inquiry.id)}>
              <Check size={14} /> 沉淀
            </button>
          </div>
        ))}
      </section>

      <section>
        <h3>候选结果区</h3>
        <p className="isolation-note">合并前不写入主图。</p>
        {selectedCandidates.length === 0 ? <p className="muted">暂无候选结果。</p> : selectedCandidates.map((candidate) => (
          <div className={`candidate-row ${candidate.status}`} key={candidate.id}>
            <strong>{candidate.node.title}</strong>
            <span>{candidate.status}</span>
            {candidate.conflictReason ? <small>{candidate.conflictReason}</small> : null}
            <div>
              <button type="button" onClick={() => workspace.mergeCandidate(candidate.id)}>合并</button>
              <button type="button" onClick={() => workspace.dismissCandidate(candidate.id)}>忽略</button>
            </div>
          </div>
        ))}
      </section>

      <section>
        <h3>并行任务与执行结果</h3>
        {selectedJobs.map((job) => <div className={`job-row ${job.status}`} key={job.id}><span>{job.title}</span><strong>{job.status}</strong></div>)}
        {workspace.executionRuns.filter((run) => run.nodeId === selected.id).map((run) => (
          <div className={`run-row ${run.status}`} key={run.id}>
            <strong>{run.command}</strong>
            <span>{run.resultSummary}</span>
          </div>
        ))}
      </section>
    </aside>
  );
}
