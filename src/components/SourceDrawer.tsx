import { X } from "lucide-react";
import type { ResearchWorkspaceController } from "../state/useResearchWorkspace";

interface SourceDrawerProps {
  workspace: ResearchWorkspaceController;
}

export function SourceDrawer({ workspace }: SourceDrawerProps) {
  const evidence = workspace.evidenceAnchors.find((item) => item.id === workspace.activeEvidenceId);
  const source = evidence ? workspace.sourceAssets.find((item) => item.id === evidence.sourceAssetId) : undefined;

  return (
    <aside className={`source-drawer ${workspace.isSourceDrawerOpen ? "open" : ""}`} aria-label="资料抽屉" aria-hidden={!workspace.isSourceDrawerOpen}>
      <div className="drawer-header">
        <strong>资料抽屉</strong>
        <button type="button" aria-label="关闭资料抽屉" onClick={workspace.closeSourceDrawer}><X size={16} /></button>
      </div>
      {evidence && source ? (
        <div className="drawer-body">
          <div className="source-card">
            <span>{source.title}</span>
            <small>{source.uri}</small>
          </div>
          <h2>{evidence.title}</h2>
          <p>{evidence.text ?? evidence.quote}</p>
          <div className="evidence-highlight">{evidence.reason}</div>
        </div>
      ) : (
        <div className="drawer-body source-list">
          {workspace.sourceAssets.map((asset) => (
            <div className="source-card" key={asset.id}>
              <span>{asset.title}</span>
              <small>{asset.kind} · {asset.analysisState}</small>
              {asset.uri !== asset.title ? <small>{asset.uri}</small> : null}
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
