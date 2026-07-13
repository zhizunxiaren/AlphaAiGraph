import {
  ArrowDownToLine,
  BookOpenText,
  BrainCircuit,
  Check,
  ChevronRight,
  CircleDot,
  Code2,
  Compass,
  FileText,
  FileUp,
  GitBranch,
  Network,
  Plus,
  Route,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  X
} from "lucide-react";
import { useMemo, useState } from "react";
import type { KnowledgeWorkspaceController } from "../state/useKnowledgeWorkspace";
import type { AnalysisSubject, CandidateGraphPatch, KnowledgeNode } from "../types";

interface Props {
  workspace: KnowledgeWorkspaceController;
}

const kindLabels: Record<KnowledgeNode["kind"], string> = {
  subject: "分析对象",
  topic: "主题",
  concept: "概念",
  claim: "判断",
  evidence: "证据",
  question: "问题",
  synthesis: "总结",
  goal: "目标",
  criterion: "决策标准",
  constraint: "约束",
  route_option: "路线候选",
  decision: "决策",
  route_step: "路线步骤"
};

export function KnowledgeWorkspaceShell({ workspace }: Props) {
  const [question, setQuestion] = useState("这个节点最关键的原理和取舍是什么？");
  const [isLauncherOpen, setLauncherOpen] = useState(false);
  const [newSubjectTitle, setNewSubjectTitle] = useState("");
  const [newSubjectKind, setNewSubjectKind] = useState<AnalysisSubject["kind"]>("technology");
  const { selectedNode, activeView } = workspace;
  const pendingPatches = workspace.candidatePatches.filter((item) => item.status === "pending_review");
  const isSelectedNodeExpanded = workspace.graph.edges.some(
    (edge) => edge.kind === "contains" && edge.fromNodeId === selectedNode.id
  );
  const neighbors = useMemo(() => {
    const ids = new Set(workspace.graph.edges.flatMap((edge) => {
      if (edge.fromNodeId === selectedNode.id) return [edge.toNodeId];
      if (edge.toNodeId === selectedNode.id) return [edge.fromNodeId];
      return [];
    }));
    return workspace.graph.nodes.filter((node) => ids.has(node.id));
  }, [selectedNode.id, workspace.graph.edges, workspace.graph.nodes]);

  return (
    <div className="knowledge-app">
      <header className="knowledge-topbar">
        <div className="knowledge-brand">
          <span className="brand-glyph"><Network size={18} /></span>
          <strong>AlphaAiGraph</strong>
          <span>知识路线工作台</span>
        </div>
        <div className="subject-crumb">
          <span>{workspace.subject.kind}</span>
          <ChevronRight size={14} />
          <strong>{workspace.subject.title}</strong>
        </div>
        <div className="topbar-actions">
          <button className="new-analysis-action" type="button" onClick={() => setLauncherOpen(true)}><Plus size={15} /> 开始新分析</button>
          <button className="quiet-action" type="button"><ArrowDownToLine size={15} /> 导出知识库</button>
        </div>
      </header>

      <main className="knowledge-layout">
        <aside className="knowledge-atlas" aria-label="知识空间导航">
          <div className="atlas-heading">
            <span>KNOWLEDGE ATLAS</span>
            <button type="button" aria-label="搜索知识"><Search size={16} /></button>
          </div>
          <section className="atlas-subject">
            <small>当前分析对象</small>
            <strong>{workspace.subject.title}</strong>
            <p>{workspace.subject.description}</p>
          </section>
          <nav className="view-switcher" aria-label="图谱视图">
            {workspace.views.map((view) => {
              const Icon = view.kind === "mind_map" ? GitBranch : view.kind === "network" ? Network : Route;
              return (
                <button
                  key={view.id}
                  type="button"
                  className={view.id === workspace.activeViewId ? "active" : ""}
                  onClick={() => workspace.switchView(view.id)}
                >
                  <Icon size={16} />
                  <span>{view.title}</span>
                  <small>{view.kind === "mind_map" ? "局部理解" : view.kind === "network" ? "全局关联" : "方案决策"}</small>
                </button>
              );
            })}
          </nav>
          <section className="atlas-stats">
            <div><strong>{workspace.graph.nodes.length}</strong><span>知识节点</span></div>
            <div><strong>{workspace.graph.edges.length}</strong><span>语义关系</span></div>
            <div><strong>{pendingPatches.length}</strong><span>待确认变更</span></div>
          </section>
          <section className="atlas-principle">
            <Compass size={18} />
            <div><strong>图谱是主数据</strong><p>脑图、总结和技术路线都从同一知识网络生成。</p></div>
          </section>
        </aside>

        <section className="knowledge-stage" aria-label="知识图谱画布">
          <div className="stage-heading">
            <div>
              <span className="stage-kicker">{activeView.kind.replace("_", " ")}</span>
              <h1>{activeView.title}</h1>
            </div>
            <p>{activeView.kind === "mind_map" ? "从一个根节点开始理解，沿任意知识点继续下钻。" : activeView.kind === "network" ? "查看提问、证据、概念与总结如何互相连接。" : "把目标、约束、候选方案和推荐步骤放到同一张图里。"}</p>
          </div>
          <KnowledgeGraph workspace={workspace} />
          <div className="graph-legend">
            <span><i className="legend-dot core" /> 核心知识</span>
            <span><i className="legend-dot inquiry" /> 提问与总结</span>
            <span><i className="legend-dot route" /> 技术路线</span>
            <small>点击节点聚焦 · 每个节点都可继续下钻</small>
          </div>
        </section>

        <aside className="thinking-dock" aria-label="节点思考面板">
          <div className="dock-heading">
            <span><CircleDot size={15} /> NODE FOCUS</span>
            <small>{kindLabels[selectedNode.kind]}</small>
          </div>
          <section className="focused-node-card">
            <span className={`kind-pill kind-${selectedNode.kind}`}>{kindLabels[selectedNode.kind]}</span>
            <h2>{selectedNode.title}</h2>
            <p>{selectedNode.summary}</p>
            <div className="tag-row">{selectedNode.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
          </section>
          <section className="context-packet" aria-label="本次 Agent 上下文">
            <div className="context-heading">
              <span><ShieldCheck size={15} /> 本次上下文</span>
              <select
                aria-label="上下文范围"
                value={workspace.selection.contextPolicy}
                onChange={(event) => workspace.setContextPolicy(event.target.value as typeof workspace.selection.contextPolicy)}
              >
                <option value="selected_node">仅当前节点</option>
                <option value="selected_and_neighbors">节点与直接关联</option>
                <option value="whole_subject">整个分析对象</option>
              </select>
            </div>
            <div className="context-focus"><CircleDot size={13} /><strong>{selectedNode.title}</strong></div>
            <div className="context-metrics">
              <span>{workspace.selection.nodeIds.length} 个节点</span>
              <span>{workspace.selection.sourceIds.length} 个来源</span>
              <span>{workspace.selection.depth < 0 ? "全图" : `${workspace.selection.depth} 层关系`}</span>
            </div>
          </section>
          <section className="node-actions">
            <button
              className="primary-action-v2"
              type="button"
              disabled={isSelectedNodeExpanded}
              title={isSelectedNodeExpanded ? "该节点已有下一层，请选择子节点继续下钻" : undefined}
              onClick={() => workspace.drillDown(selectedNode.id)}
            >
              <GitBranch size={16} /> {isSelectedNodeExpanded ? "已生成下一层" : "生成下钻建议"}
            </button>
            <button type="button" onClick={() => workspace.summarize(selectedNode.id)}>
              <BookOpenText size={16} /> 生成总结建议
            </button>
          </section>
          <section className="question-composer">
            <label htmlFor="node-question"><Sparkles size={15} /> 围绕这个点继续提问</label>
            <textarea id="node-question" value={question} onChange={(event) => setQuestion(event.target.value)} />
            <button type="button" onClick={() => workspace.ask(selectedNode.id, question)}><Send size={15} /> 生成回答建议</button>
          </section>
          <PatchReview patches={pendingPatches} workspace={workspace} />
          <section className="neighbor-list">
            <div className="section-title"><span>直接关联</span><small>{neighbors.length}</small></div>
            {neighbors.slice(0, 7).map((node) => (
              <button type="button" key={node.id} onClick={() => workspace.selectNode(node.id)}>
                <FileText size={14} />
                <span><strong>{node.title}</strong><small>{kindLabels[node.kind]}</small></span>
                <ChevronRight size={14} />
              </button>
            ))}
          </section>
        </aside>
      </main>
      {isLauncherOpen ? (
        <TaskLauncher
          title={newSubjectTitle}
          kind={newSubjectKind}
          onTitleChange={setNewSubjectTitle}
          onKindChange={setNewSubjectKind}
          onClose={() => setLauncherOpen(false)}
          onStart={() => {
            workspace.startSubject(newSubjectTitle, newSubjectKind);
            if (newSubjectTitle.trim()) {
              setQuestion("这个节点最关键的原理和取舍是什么？");
              setLauncherOpen(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}

function PatchReview({ patches, workspace }: { patches: CandidateGraphPatch[]; workspace: KnowledgeWorkspaceController }) {
  return (
    <section className="patch-review" aria-label="候选图谱变更">
      <div className="section-title"><span>待确认变更</span><small>{patches.length}</small></div>
      {patches.length === 0 ? <p className="patch-empty">Agent 生成的节点和关系会先在这里等待确认。</p> : patches.map((patch) => {
        const nodeCount = patch.operations.filter((item) => item.kind === "create_node").length;
        const edgeCount = patch.operations.filter((item) => item.kind === "create_edge").length;
        return (
          <article className="patch-ticket" key={patch.id}>
            <div className="patch-ticket-heading">
              <span>{patch.action.replace("_", " ")}</span>
              <small>{Math.round(patch.confidence * 100)}% confidence</small>
            </div>
            <strong>{patch.title}</strong>
            <p>{patch.summary}</p>
            <div className="patch-impact"><span>+{nodeCount} 节点</span><span>+{edgeCount} 关系</span></div>
            <div className="patch-actions">
              <button type="button" onClick={() => workspace.acceptPatch(patch.id)}><Check size={14} /> 接受并写入图谱</button>
              <button type="button" onClick={() => workspace.rejectPatch(patch.id)}><X size={14} /> 拒绝</button>
            </div>
          </article>
        );
      })}
    </section>
  );
}

function TaskLauncher({
  title,
  kind,
  onTitleChange,
  onKindChange,
  onClose,
  onStart
}: {
  title: string;
  kind: AnalysisSubject["kind"];
  onTitleChange: (value: string) => void;
  onKindChange: (value: AnalysisSubject["kind"]) => void;
  onClose: () => void;
  onStart: () => void;
}) {
  const tasks: Array<{ kind: AnalysisSubject["kind"]; title: string; detail: string; icon: typeof BrainCircuit }> = [
    { kind: "technology", title: "分析一项技术", detail: "理解原理、生态、约束与路线", icon: BrainCircuit },
    { kind: "document", title: "分析一篇文档", detail: "从章节与来源建立知识网络", icon: FileUp },
    { kind: "codebase", title: "分析一个代码库", detail: "拆解模块、依赖和技术风险", icon: Code2 },
    { kind: "question", title: "研究复杂问题", detail: "从问题开始形成证据与判断", icon: Compass }
  ];
  return (
    <div className="task-launcher-backdrop" role="presentation">
      <section className="task-launcher" role="dialog" aria-modal="true" aria-labelledby="task-launcher-title">
        <button className="launcher-close" type="button" aria-label="关闭新分析" onClick={onClose}><X size={17} /></button>
        <span className="stage-kicker">NEW KNOWLEDGE ROUTE</span>
        <h2 id="task-launcher-title">你想从哪里开始？</h2>
        <p>先给出一个主题或对象，Agent 只生成第一层知识地图。</p>
        <div className="task-options">
          {tasks.map((task) => {
            const Icon = task.icon;
            return (
              <button key={task.kind} type="button" className={kind === task.kind ? "active" : ""} onClick={() => onKindChange(task.kind)}>
                <Icon size={18} /><span><strong>{task.title}</strong><small>{task.detail}</small></span>
              </button>
            );
          })}
        </div>
        <label htmlFor="new-subject-title">分析对象</label>
        <input id="new-subject-title" autoFocus value={title} onChange={(event) => onTitleChange(event.target.value)} placeholder="例如：WebGPU、RFC 9457、支付服务代码库……" />
        <button className="launcher-start" type="button" disabled={!title.trim()} onClick={onStart}>生成第一层知识地图 <ChevronRight size={16} /></button>
      </section>
    </div>
  );
}

function KnowledgeGraph({ workspace }: Props) {
  const rootId = workspace.activeView.kind === "route" ? workspace.activeView.rootNodeId : workspace.graph.rootNodeIds[0];
  const unorderedNodes = visibleGraphNodes(workspace.graph.nodes, workspace.graph.edges, rootId, workspace.activeView.kind);
  const rootNode = unorderedNodes.find((node) => node.id === rootId);
  const visibleNodes = rootNode ? [rootNode, ...unorderedNodes.filter((node) => node.id !== rootId)] : unorderedNodes;
  const positionById = new Map(visibleNodes.map((node, index) => [node.id, positionNode(node, index, visibleNodes.length, rootId)]));
  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const edges = workspace.graph.edges.filter((edge) => visibleIds.has(edge.fromNodeId) && visibleIds.has(edge.toNodeId));

  return (
    <div className={`knowledge-graph view-${workspace.activeView.kind}`}>
      <svg className="knowledge-edge-layer" viewBox="0 0 1000 660" preserveAspectRatio="none" aria-hidden="true">
        {edges.map((edge) => {
          const from = positionById.get(edge.fromNodeId);
          const to = positionById.get(edge.toNodeId);
          if (!from || !to) return null;
          const mx = (from.x + to.x) / 2;
          return <path key={edge.id} className={`edge-${edge.kind}`} d={`M ${from.x} ${from.y} C ${mx} ${from.y}, ${mx} ${to.y}, ${to.x} ${to.y}`} />;
        })}
      </svg>
      {visibleNodes.map((node) => {
        const position = positionById.get(node.id)!;
        return (
          <button
            type="button"
            key={node.id}
            className={`knowledge-node-v2 kind-${node.kind} ${node.id === workspace.selectedNodeId ? "selected" : ""}`}
            style={{ left: `${position.x / 10}%`, top: `${position.y / 6.6}%` }}
            aria-pressed={node.id === workspace.selectedNodeId}
            onClick={() => workspace.selectNode(node.id)}
          >
            <span>{kindLabels[node.kind]}</span>
            <strong>{node.title}</strong>
            <small>{node.summary}</small>
          </button>
        );
      })}
    </div>
  );
}

function visibleGraphNodes(nodes: KnowledgeNode[], edges: KnowledgeWorkspaceController["graph"]["edges"], rootId: string, view: string) {
  if (view === "network") return nodes.slice(-18);
  if (view === "route") {
    const routeKinds = new Set<KnowledgeNode["kind"]>(["decision", "goal", "criterion", "constraint", "route_option", "route_step", "synthesis"]);
    const connectedIds = new Set(edges.filter((edge) => edge.fromNodeId === rootId || edge.toNodeId === rootId).flatMap((edge) => [edge.fromNodeId, edge.toNodeId]));
    return nodes.filter((node) => node.id === rootId || routeKinds.has(node.kind) && (node.depth <= 1 || connectedIds.has(node.id))).slice(-12);
  }
  const shallow = nodes.filter((node) => node.depth <= 2 && !(node.depth > 1 && node.tags.includes("技术路线")));
  const recentDeep = nodes.filter((node) => node.depth > 2).slice(-6);
  return shallow.concat(recentDeep).slice(-15);
}

function positionNode(node: KnowledgeNode, index: number, count: number, rootId: string) {
  if (node.id === rootId) return { x: 500, y: 330 };
  const rootOffset = index > 0 ? index - 1 : index;
  const denominator = Math.max(1, count - 1);
  const angle = -Math.PI / 2 + (rootOffset / denominator) * Math.PI * 2;
  const radiusX = node.depth > 1 ? 430 : 330;
  const radiusY = node.depth > 1 ? 270 : 220;
  return { x: 500 + Math.cos(angle) * radiusX, y: 330 + Math.sin(angle) * radiusY };
}
