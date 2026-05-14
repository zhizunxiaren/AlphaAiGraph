import { FileText, X } from "lucide-react";
import type { KnowledgeAppState, ResearchNode } from "../types";

export function SourceDrawer({
  state,
  selectedNode,
  onClose,
}: {
  state: KnowledgeAppState;
  selectedNode?: ResearchNode;
  onClose: () => void;
}) {
  const evidence = selectedNode
    ? state.evidenceAnchors.filter((item) => selectedNode.evidenceIds.includes(item.id))
    : state.evidenceAnchors;
  const activeEvidence = evidence[0] ?? state.evidenceAnchors[0];
  const activeSource = activeEvidence
    ? state.sourceAssets.find((source) => source.id === activeEvidence.sourceAssetId)
    : state.sourceAssets[0];

  return (
    <aside className="source-drawer" aria-label="资料抽屉">
      <header className="drawer-header">
        <div>
          <span className="eyebrow">Source Drawer</span>
          <h2>资料与证据</h2>
        </div>
        <button className="icon-button" aria-label="关闭资料抽屉" onClick={onClose}>
          <X size={16} aria-hidden="true" />
        </button>
      </header>

      <section className="source-list">
        <h3>资料列表</h3>
        {state.sourceAssets.map((source) => (
          <article className="source-row" key={source.id}>
            <FileText size={15} aria-hidden="true" />
            <div>
              <strong>{source.title}</strong>
              <span>{source.path}</span>
            </div>
          </article>
        ))}
      </section>

      <section className="source-preview">
        <span className="eyebrow">当前来源</span>
        <h3>{activeSource?.title ?? "未选择资料"}</h3>
        <p>{activeSource?.summary ?? "暂无资料摘要。"}</p>
        {activeEvidence ? (
          <article className="evidence-preview">
            <strong>{activeEvidence.title}</strong>
            <p>{activeEvidence.quote}</p>
            <small>{activeEvidence.locator.path ?? activeEvidence.locator.kind}</small>
          </article>
        ) : null}
      </section>
    </aside>
  );
}
