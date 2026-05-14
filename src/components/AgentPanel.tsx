import { Check, GitMerge, MessageCircleQuestion, Play, Search } from "lucide-react";
import type { InquiryContextPolicy, KnowledgeAppState, ResearchNode } from "../types";

export function AgentPanel({
  state,
  selectedNode,
  draftQuestion,
  setDraftQuestion,
  drillDown,
  createInquiry,
  mergeCandidate,
}: {
  state: KnowledgeAppState;
  selectedNode?: ResearchNode;
  draftQuestion: string;
  setDraftQuestion: (value: string) => void;
  drillDown: (nodeId: string) => void;
  createInquiry: (nodeId: string, question: string, policy: InquiryContextPolicy) => void;
  mergeCandidate: (candidateId: string) => void;
}) {
  const evidence = selectedNode
    ? state.evidenceAnchors.filter((item) => selectedNode.evidenceIds.includes(item.id))
    : [];
  const actions = selectedNode
    ? state.actions.filter((item) => item.nodeId === selectedNode.id || selectedNode.actionIds.includes(item.id))
    : [];
  const hasDrillAction = actions.some((action) => action.kind === "drill_down");

  return (
    <aside className="panel agent-panel" aria-label="Agent 工作台">
      {!selectedNode ? (
        <section className="empty-state">请选择研究节点</section>
      ) : (
        <section className="selected-node">
          <h2>{selectedNode.title}</h2>
          <p>{selectedNode.summary}</p>
          <p>Status: {selectedNode.status}</p>
          <p>Evidence: {evidence.length}</p>
          {hasDrillAction && (
            <button className="primary-action" onClick={() => drillDown(selectedNode.id)}>
              <Search size={15} /> 深入研究
            </button>
          )}
        </section>
      )}

      <section>
        <h3>证据</h3>
        {evidence.length === 0 ? <p>暂无证据锚点</p> : null}
        {evidence.map((item) => (
          <article className="list-item" key={item.id}>
            <strong>{item.title}</strong>
            <span>{item.quote}</span>
          </article>
        ))}
      </section>

      <section>
        <h3>Suggested research actions</h3>
        {actions.map((action) => (
          <article className="list-item" key={action.id}>
            <strong>{action.title}</strong>
            <span>{action.kind}</span>
          </article>
        ))}
      </section>

      <section>
        <h3>旁路临时会话区</h3>
        <div className="inquiry-row">
          <input
            aria-label="旁路问题"
            value={draftQuestion}
            onChange={(event) => setDraftQuestion(event.target.value)}
            placeholder="输入旁路问题"
          />
          <button
            onClick={() =>
              selectedNode && createInquiry(selectedNode.id, draftQuestion, "local_node")
            }
          >
            <MessageCircleQuestion size={15} />
          </button>
        </div>
        {state.sideInquiries.map((item) => (
          <article className="list-item" key={item.id}>
            <strong>{item.question}</strong>
            <span>{item.contextPolicy} / {item.status}</span>
          </article>
        ))}
      </section>

      <section>
        <h3>Parallel job queue</h3>
        {state.jobs.length === 0 ? <p>无 jobs</p> : null}
        {state.jobs.map((job) => (
          <article className="list-item" key={job.id}>
            <strong>{job.title}</strong>
            <span>{job.status === "running" ? "Agent job running" : job.status}</span>
          </article>
        ))}
      </section>

      <section>
        <h3>候选结果审核</h3>
        {state.candidateNodes.map((candidate) => (
          <article className="list-item" key={candidate.id}>
            <strong>{candidate.node.title}</strong>
            <span>{candidate.status}</span>
            {candidate.conflictReason ? <span>{candidate.conflictReason}</span> : null}
            {candidate.status === "pending_review" ? (
              <button onClick={() => mergeCandidate(candidate.id)}>
                <GitMerge size={15} /> Merge
              </button>
            ) : null}
          </article>
        ))}
      </section>

      <section>
        <h3>Execution runs</h3>
        {state.executionRuns.map((run) => (
          <article className="list-item" key={run.id}>
            <strong>{run.command}</strong>
            <span>{run.status}</span>
          </article>
        ))}
      </section>

      <section>
        <h3>辅助输出</h3>
        <p><Check size={14} /> Study、Synthesis、Export 作为节点辅助动作保留</p>
        <p><Play size={14} /> 执行动作需要用户显式触发</p>
      </section>

      {state.warnings.length > 0 ? (
        <section className="warning-list">
          {state.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </section>
      ) : null}
    </aside>
  );
}
