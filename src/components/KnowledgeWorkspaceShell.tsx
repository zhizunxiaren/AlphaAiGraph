import {
  AlertTriangle,
  ArrowDownToLine,
  BookOpenText,
  BrainCircuit,
  Check,
  ChevronRight,
  CircleHelp,
  CircleDot,
  Compass,
  FileText,
  GitBranch,
  ExternalLink,
  Layers3,
  MapPin,
  Network,
  Plus,
  RefreshCw,
  Route,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Upload,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { projectModeLabels, subjectKindLabels } from "../knowledge/projectModel";
import { epistemicStatusLabels, sourceStatusLabels } from "../knowledge/knowledgeMetadata";
import { knowledgeNodeKindLabels } from "../knowledge/knowledgeNodeKinds";
import { deriveKnowledgeWorkspaceInsights } from "../knowledge/knowledgeInsights";
import { deriveKnowledgeInventory, knowledgeInventoryItemKindLabels } from "../knowledge/knowledgeInventory";
import { deriveInterviewerProgress } from "../knowledge/interviewerPolicy";
import { knowledgeDiagnosticKindLabels, lintKnowledgeWorkspace } from "../knowledge/knowledgeDiagnostics";
import {
  buildExplorerSearchUrl,
  deriveExplorerPlan,
  filterExplorerSearchResults,
  type ExplorerSearchExecution,
  type ExplorerSearchFilters,
  type ExplorerSearchResult,
  type ExplorerTask
} from "../knowledge/explorerPolicy";
import {
  correctionErrorTypeLabels,
  deriveCorrectionEvidenceCandidates,
  type CorrectionErrorType
} from "../knowledge/correctionPolicy";
import { impactCategoryLabels } from "../knowledge/impactAssessment";
import {
  deriveSystematizeViewProjection,
  isSystematizeArtifactViewKind,
  type SystematizeProjectionNode,
  type SystematizeViewProjection
} from "../knowledge/systematizeViews";
import { assessUnderstandProjectCompletion } from "../knowledge/projectLifecycle";
import { downloadMarkdownWiki, exportKnowledgeWorkspaceToMarkdown } from "../knowledge/markdownWikiExporter";
import { downloadMarkdownWikiVault, exportKnowledgeWorkspaceToMarkdownVault } from "../knowledge/markdownWikiVault";
import { resolveSourceReference } from "../knowledge/sourceIngest";
import { queryLocalNeighborhood } from "../knowledge/knowledgeGraphQuery";
import {
  deriveProgressiveKnowledgeProjection,
  knowledgeGraphPerformanceBudget,
  layoutLocalKnowledgeProjection
} from "../knowledge/knowledgeGraphProjection";
import type { KnowledgeWorkspaceController } from "../state/useKnowledgeWorkspace";
import type { CandidateGraphPatch, GraphPatchOperation, ImpactReviewTask, KnowledgeInventoryItemKind, KnowledgeNode, KnowledgeView, KnowledgeViewKind, ProjectMode, SearchSourceKind, SubjectKind } from "../types";
import { KnowledgeGraphCanvas } from "./KnowledgeGraphCanvas";

interface Props {
  workspace: KnowledgeWorkspaceController;
}

export function KnowledgeWorkspaceShell({ workspace }: Props) {
  const [question, setQuestion] = useState("这个节点最关键的原理和取舍是什么？");
  const [isLauncherOpen, setLauncherOpen] = useState(false);
  const [newProjectMode, setNewProjectMode] = useState<ProjectMode>("understand");
  const [newProjectGoal, setNewProjectGoal] = useState("");
  const [newSubjectTitle, setNewSubjectTitle] = useState("");
  const [newSubjectKind, setNewSubjectKind] = useState<SubjectKind>("technology");
  const [sourceImportMessage, setSourceImportMessage] = useState("");
  const [isImportingSource, setImportingSource] = useState(false);
  const [isKnowledgeImportOpen, setKnowledgeImportOpen] = useState(false);
  const [knowledgeImportKind, setKnowledgeImportKind] = useState<Exclude<KnowledgeInventoryItemKind, "document">>("note");
  const [knowledgeImportTitle, setKnowledgeImportTitle] = useState("");
  const [knowledgeImportContent, setKnowledgeImportContent] = useState("");
  const [explorerCaptureTask, setExplorerCaptureTask] = useState<ExplorerTask>();
  const [explorerSourceTitle, setExplorerSourceTitle] = useState("");
  const [explorerSourceUrl, setExplorerSourceUrl] = useState("");
  const [explorerSourceContent, setExplorerSourceContent] = useState("");
  const [explorerMessage, setExplorerMessage] = useState("");
  const [explorerSearchExecution, setExplorerSearchExecution] = useState<ExplorerSearchExecution>();
  const [explorerSearchingTaskId, setExplorerSearchingTaskId] = useState<string>();
  const [explorerSelectedResultIds, setExplorerSelectedResultIds] = useState<string[]>([]);
  const [explorerSourceFilter, setExplorerSourceFilter] = useState<ExplorerSourceFilter>("all");
  const [explorerLatestOnly, setExplorerLatestOnly] = useState(true);
  const [explorerHideExisting, setExplorerHideExisting] = useState(false);
  const [isExplorerCapturing, setExplorerCapturing] = useState(false);
  const [isCompletionOpen, setCompletionOpen] = useState(false);
  const [acknowledgeOpenItems, setAcknowledgeOpenItems] = useState(false);
  const [wikiExportMessage, setWikiExportMessage] = useState("");
  const [legacyMigrationMessage, setLegacyMigrationMessage] = useState("");
  const { selectedNode, activeView } = workspace;
  const isProjectCompleted = workspace.project.status === "completed";
  const isProjectWritable = workspace.project.status === "active" || workspace.project.status === "reopened";
  const pendingPatches = workspace.candidatePatches.filter((item) => item.status === "pending_review");
  const graphViews = workspace.views.filter((view) => !isSystematizeArtifactViewKind(view.kind));
  const artifactViews = workspace.views.filter((view) => isSystematizeArtifactViewKind(view.kind));
  const insights = useMemo(() => deriveKnowledgeWorkspaceInsights(workspace), [
    workspace.graph,
    workspace.project,
    workspace.selection
  ]);
  const inventory = useMemo(() => deriveKnowledgeInventory(workspace), [
    workspace.project,
    workspace.graph,
    workspace.candidatePatches,
    workspace.knowledgeSourceAssets,
    workspace.sourceAnchors
  ]);
  const diagnostics = useMemo(() => lintKnowledgeWorkspace(workspace), [
    workspace.project,
    workspace.graph,
    workspace.selection
  ]);
  const explorerPlan = useMemo(() => workspace.project.mode === "systematize"
    ? deriveExplorerPlan(workspace)
    : undefined, [workspace.project, workspace.graph, workspace.selection]);
  const activeExplorerSearch = explorerSearchExecution && explorerPlan?.tasks.some((task) => task.id === explorerSearchExecution.taskId)
    ? explorerSearchExecution
    : undefined;
  const explorerSearchTask = explorerPlan?.tasks.find((task) => task.id === activeExplorerSearch?.taskId);
  const visibleExplorerResults = useMemo(() => activeExplorerSearch?.status === "completed"
    ? filterExplorerSearchResults(activeExplorerSearch.results, buildExplorerFilters(
      explorerSourceFilter,
      explorerLatestOnly,
      explorerHideExisting
    ))
    : [], [activeExplorerSearch, explorerSourceFilter, explorerLatestOnly, explorerHideExisting]);
  const visibleSelectableExplorerResults = visibleExplorerResults.filter((result) => !result.existingSourceId).slice(0, 10);
  const isSelectedNodeExpanded = workspace.graph.edges.some(
    (edge) => edge.kind === "contains" && edge.fromNodeId === selectedNode.id
  );
  const neighbors = useMemo(() => {
    return queryLocalNeighborhood(workspace, {
      focusNodeId: selectedNode.id,
      depth: 1,
      maxNodes: Math.max(1, workspace.graph.nodes.length)
    }).nodes.filter((node) => node.id !== selectedNode.id);
  }, [selectedNode.id, workspace.graph, workspace.project.id, workspace.projects]);
  const selectedSourceReferences = useMemo(() => selectedNode.sourceRefs
    .map((reference) => resolveSourceReference(workspace, reference))
    .filter((reference): reference is NonNullable<typeof reference> => Boolean(reference)), [
      selectedNode.sourceRefs,
      workspace.knowledgeSourceAssets,
      workspace.sourceAnchors
    ]);
  const completionAssessment = useMemo(() => workspace.project.mode === "understand"
    ? assessUnderstandProjectCompletion(workspace)
    : undefined, [workspace.project, workspace.graph, workspace.candidatePatches]);
  const systematizeProjection = useMemo(() => isSystematizeArtifactViewKind(activeView.kind)
    ? deriveSystematizeViewProjection(workspace, activeView.kind, activeView.rootNodeId)
    : undefined, [activeView.kind, activeView.rootNodeId, workspace.graph, workspace.project.subject.rootNodeId]);

  async function importSource(file: File | undefined) {
    if (!file || isImportingSource) return;
    setImportingSource(true);
    setSourceImportMessage(`正在解析 ${file.name}…`);
    try {
      const result = await workspace.importSource(file);
      setSourceImportMessage(result.status === "parsed"
        ? `已解析 ${result.sections.length} 个来源片段，第一层地图等待审核。`
        : result.error ?? "文档导入失败");
    } catch (error) {
      setSourceImportMessage(error instanceof Error ? error.message : "文档导入失败");
    } finally {
      setImportingSource(false);
    }
  }

  async function importKnowledgeItem() {
    if (isImportingSource) return;
    setImportingSource(true);
    setSourceImportMessage(`正在录入${knowledgeInventoryItemKindLabels[knowledgeImportKind]}…`);
    try {
      const result = await workspace.importKnowledgeItem({
        kind: knowledgeImportKind,
        title: knowledgeImportTitle,
        content: knowledgeImportContent
      });
      setSourceImportMessage(result.status === "parsed"
        ? `已录入${knowledgeInventoryItemKindLabels[knowledgeImportKind]}，${result.sections.length} 个片段等待审核。`
        : result.error ?? "知识录入失败");
      if (result.status === "parsed") {
        setKnowledgeImportTitle("");
        setKnowledgeImportContent("");
        setKnowledgeImportOpen(false);
      }
    } catch (error) {
      setSourceImportMessage(error instanceof Error ? error.message : "知识录入失败");
    } finally {
      setImportingSource(false);
    }
  }

  async function captureExplorerSource() {
    if (!explorerCaptureTask || isImportingSource) return;
    setImportingSource(true);
    setExplorerMessage("正在保存不可变来源并解析…");
    try {
      const result = await workspace.captureExplorerSource({
        task: explorerCaptureTask,
        title: explorerSourceTitle,
        url: explorerSourceUrl,
        content: explorerSourceContent
      });
      if (result.status !== "parsed") throw new Error(result.error ?? "搜索资料收录失败");
      setExplorerMessage(`已收录「${explorerSourceTitle.trim()}」，${result.sections.length} 个来源片段等待审核。`);
      setExplorerCaptureTask(undefined);
      setExplorerSourceTitle("");
      setExplorerSourceUrl("");
      setExplorerSourceContent("");
    } catch (error) {
      setExplorerMessage(error instanceof Error ? error.message : "搜索资料收录失败");
    } finally {
      setImportingSource(false);
    }
  }

  async function runExplorerSearch(task: ExplorerTask) {
    if (explorerSearchingTaskId) return;
    setExplorerSearchingTaskId(task.id);
    setExplorerMessage(`正在通过 ${workspace.explorerSearchProvider?.id ?? "Provider"} 搜索「${task.label}」…`);
    try {
      const execution = await workspace.searchExplorer(task);
      setExplorerSearchExecution(execution);
      setExplorerSelectedResultIds([]);
      setExplorerMessage(execution.status === "completed"
        ? `找到 ${execution.results.length} 个去重结果；搜索清单不会写入工作区。`
        : execution.error ?? "Explorer 搜索失败");
    } catch (error) {
      setExplorerMessage(error instanceof Error ? error.message : "Explorer 搜索失败");
    } finally {
      setExplorerSearchingTaskId(undefined);
    }
  }

  async function captureSelectedExplorerResults() {
    if (!explorerSearchTask || !activeExplorerSearch || isExplorerCapturing) return;
    const selected = activeExplorerSearch.results.filter((result) => explorerSelectedResultIds.includes(result.id));
    if (selected.length === 0) return;
    setExplorerCapturing(true);
    setExplorerMessage(`正在抓取 ${selected.length} 个页面正文并保存为不可变来源…`);
    try {
      const execution = await workspace.captureExplorerSearchResults({ task: explorerSearchTask, results: selected });
      const ingested = execution.decisions.filter((decision) => decision.reason === "ingested");
      const duplicates = execution.decisions.filter((decision) => decision.reason === "duplicate_content");
      const failed = execution.decisions.filter((decision) => decision.reason === "capture_failed");
      setExplorerSelectedResultIds((current) => current.filter((id) => !ingested.some((decision) => decision.result.id === id)));
      setExplorerMessage(`批量收录完成：${ingested.length} 个新增，${duplicates.length} 个内容重复，${failed.length} 个失败。正文片段仍需审核 Patch。`);
    } catch (error) {
      setExplorerMessage(error instanceof Error ? error.message : "Explorer 批量收录失败");
    } finally {
      setExplorerCapturing(false);
    }
  }

  function openExplorerManualCapture(task: ExplorerTask, result?: ExplorerSearchResult) {
    setExplorerCaptureTask(task);
    setExplorerSourceTitle(result?.title ?? "");
    setExplorerSourceUrl(result?.canonicalUrl ?? "");
    setExplorerSourceContent("");
    setExplorerMessage("");
  }

  function exportWiki() {
    try {
      const artifact = exportKnowledgeWorkspaceToMarkdown(workspace);
      downloadMarkdownWiki(artifact);
      setWikiExportMessage(`已导出 ${artifact.fileName}`);
    } catch (error) {
      setWikiExportMessage(error instanceof Error ? `导出失败：${error.message}` : "导出失败");
    }
  }

  function exportWikiVault() {
    try {
      const vault = exportKnowledgeWorkspaceToMarkdownVault(workspace);
      downloadMarkdownWikiVault(vault);
      setWikiExportMessage(`已导出 ${vault.archiveFileName}`);
    } catch (error) {
      setWikiExportMessage(error instanceof Error ? `导出失败：${error.message}` : "Obsidian Vault 导出失败");
    }
  }

  async function importWikiVault(file: File | undefined) {
    if (!file || isImportingSource) return;
    setImportingSource(true);
    setWikiExportMessage(`正在校验 ${file.name}…`);
    try {
      const result = await workspace.importMarkdownWikiVault(file);
      setWikiExportMessage(result.status === "unchanged"
        ? "Wiki Vault 与当前 KnowledgeGraph 完全一致，无需变更。"
        : `已生成 ${result.operationCount} 项 Wiki 候选变更，请在 Patch 审核区确认。`);
    } catch (error) {
      setWikiExportMessage(error instanceof Error ? `导回失败：${error.message}` : "Obsidian Vault 导回失败");
    } finally {
      setImportingSource(false);
    }
  }

  async function importLegacyResearchWorkspace(file: File | undefined) {
    if (!file || isImportingSource) return;
    setImportingSource(true);
    setLegacyMigrationMessage(`正在审计 ${file.name}…`);
    try {
      const result = await workspace.importLegacyResearchWorkspace(file);
      const migratedCount = result.evidenceNodeIds.length + result.candidatePatchIds.length + result.researchTaskIds.length;
      const historyNote = result.executionHistory.length > 0
        ? `；${result.executionHistory.length} 条命令执行仅作为脱敏历史报告，未写入 workspace`
        : "";
      setLegacyMigrationMessage(result.status === "unchanged"
        ? `没有可安全迁移的 V1 数据；跳过 ${result.skipped.length} 项${historyNote}`
        : `已迁移 ${migratedCount} 项：Evidence/Candidate 等待 Patch 审核，Job 进入现有 Research Round；跳过 ${result.skipped.length} 项${historyNote}`);
    } catch (error) {
      setLegacyMigrationMessage(error instanceof Error ? `旧工作区迁移失败：${error.message}` : "旧工作区迁移失败");
    } finally {
      setImportingSource(false);
    }
  }

  return (
    <div className="knowledge-app">
      <a className="skip-link" href="#knowledge-main">跳到主要内容</a>
      <header className="knowledge-topbar">
        <div className="knowledge-brand">
          <span className="brand-glyph"><Network size={18} /></span>
          <strong>AlphaAiGraph</strong>
          <span>认知与研究工作台</span>
        </div>
        <div className="subject-crumb">
          <span>{projectModeLabels[workspace.project.mode]}</span>
          <ChevronRight size={14} />
          <strong>{workspace.project.subject.title}</strong>
        </div>
        <div className="topbar-actions">
          <label className={`source-import-action ${isImportingSource || !isProjectWritable ? "disabled" : ""}`}>
            <Upload size={15} /> {isImportingSource ? "解析中" : "导入文档"}
            <input
              type="file"
              aria-label="导入 Markdown、文本或 PDF 文档"
              accept=".md,.markdown,.txt,.pdf,text/markdown,text/plain,application/pdf"
              disabled={isImportingSource || !isProjectWritable}
              onChange={(event) => {
                void importSource(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
          {workspace.project.mode === "systematize" ? (
            <button className="quiet-action" type="button" disabled={!isProjectWritable || isImportingSource} onClick={() => setKnowledgeImportOpen(true)}>
              <BookOpenText size={15} /> 录入已有知识
            </button>
          ) : null}
          {workspace.project.mode === "understand" ? isProjectCompleted ? (
            <button className="project-lifecycle-action reopen" type="button" onClick={() => workspace.reopenProject()}>重新打开并继续</button>
          ) : (
            <button className="project-lifecycle-action" type="button" onClick={() => {
              setAcknowledgeOpenItems(false);
              setCompletionOpen(true);
            }}>完成 Project</button>
          ) : null}
          <button className="new-analysis-action" type="button" onClick={() => setLauncherOpen(true)}><Plus size={15} /> 创建 Project</button>
          <button className="quiet-action" type="button" onClick={exportWiki}><ArrowDownToLine size={15} /> 导出 Markdown Wiki</button>
          <button className="quiet-action" type="button" onClick={exportWikiVault}><ArrowDownToLine size={15} /> 导出 Obsidian Vault</button>
          <label className={`source-import-action mobile-hidden-action ${isImportingSource || !isProjectWritable ? "disabled" : ""}`}>
            <Upload size={15} /> 导回 Wiki Vault
            <input
              type="file"
              aria-label="导回 Obsidian Wiki Vault ZIP"
              accept=".zip,application/zip"
              disabled={isImportingSource || !isProjectWritable}
              onChange={(event) => {
                void importWikiVault(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
          <label className={`source-import-action mobile-hidden-action ${isImportingSource || !isProjectWritable ? "disabled" : ""}`}>
            <Upload size={15} /> 迁入旧 Research
            <input
              type="file"
              aria-label="迁入旧 Research 工作区 JSON"
              accept=".json,application/json"
              disabled={isImportingSource || !isProjectWritable}
              onChange={(event) => {
                void importLegacyResearchWorkspace(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
          {wikiExportMessage ? <span className="wiki-export-status" role="status">{wikiExportMessage}</span> : null}
          {legacyMigrationMessage ? <span className="wiki-export-status" role="status">{legacyMigrationMessage}</span> : null}
        </div>
      </header>

      <main className="knowledge-layout" id="knowledge-main" tabIndex={-1}>
        <aside className="knowledge-atlas" aria-label="知识空间导航">
          <div className="atlas-heading">
            <span>KNOWLEDGE ATLAS</span>
            <button type="button" aria-label="搜索知识"><Search size={16} /></button>
          </div>
          <section className="atlas-subject">
            <small>{projectModeLabels[workspace.project.mode]}</small>
            <strong>{workspace.project.subject.title}</strong>
            <p>{workspace.project.goal}</p>
            <span className="project-phase">{workspace.project.workflow.phase}</span>
          </section>
          <nav className="view-switcher" aria-label="图谱视图">
            <span className="view-group-label">图谱</span>
            {graphViews.map((view) => <KnowledgeViewButton key={view.id} view={view} workspace={workspace} />)}
            {artifactViews.length > 0 ? <span className="view-group-label">体系产物</span> : null}
            {artifactViews.map((view) => <KnowledgeViewButton key={view.id} view={view} workspace={workspace} />)}
          </nav>
          <section className="atlas-stats">
            <div><strong>{workspace.graph.nodes.length}</strong><span>知识节点</span></div>
            <div><strong>{workspace.graph.edges.length}</strong><span>语义关系</span></div>
            <div><strong>{pendingPatches.length}</strong><span>待确认变更</span></div>
          </section>
          {workspace.project.mode === "systematize" ? (
            <section className="knowledge-inventory-panel" aria-label="KnowledgeInventory">
              <div className="inventory-heading"><BookOpenText size={15} /><strong>知识库存</strong><small>{inventory.items.length}</small></div>
              <div className="inventory-counts">
                <span>笔记 {inventory.counts.note}</span>
                <span>文档 {inventory.counts.document}</span>
                <span>收藏 {inventory.counts.bookmark_index}</span>
                <span>经验 {inventory.counts.experience}</span>
              </div>
              <p>{inventory.mappedItemCount} 已入图 · {inventory.pendingReviewItemCount} 待审核 · {inventory.unmappedItemCount} 未映射</p>
              <div className="inventory-items">
                {inventory.items.slice(0, 5).map((item) => (
                  <button
                    type="button"
                    key={item.logicalSourceId}
                    disabled={item.linkedNodeIds.length === 0}
                    onClick={() => item.linkedNodeIds[0] && workspace.selectNode(item.linkedNodeIds[0])}
                  >
                    <span><strong>{item.title}</strong><small>{knowledgeInventoryItemKindLabels[item.kind]} · v{item.latestVersion}</small></span>
                    <i className={`inventory-state ${item.reviewState}`} />
                  </button>
                ))}
                {inventory.items.length === 0 ? <small>导入文档，或录入笔记、收藏索引和经验陈述。</small> : null}
              </div>
            </section>
          ) : null}
          {workspace.project.mode === "systematize" ? (
            <section className="knowledge-diagnostics-panel" aria-label="知识诊断">
              <div className="diagnostics-heading"><AlertTriangle size={15} /><strong>知识诊断</strong><small>{diagnostics.issues.length}</small></div>
              <div className="diagnostics-counts">
                {(Object.keys(knowledgeDiagnosticKindLabels) as Array<keyof typeof knowledgeDiagnosticKindLabels>).map((kind) => (
                  <span key={kind}>{knowledgeDiagnosticKindLabels[kind]} <strong>{diagnostics.counts[kind]}</strong></span>
                ))}
              </div>
              <div className="diagnostic-items">
                {diagnostics.issues.slice(0, 6).map((issue) => (
                  <button type="button" key={issue.id} onClick={() => issue.nodeIds[0] && workspace.selectNode(issue.nodeIds[0])}>
                    <i className={`severity-${issue.severity}`} />
                    <span><strong>{issue.title}</strong><small>{issue.detail}</small></span>
                  </button>
                ))}
                {diagnostics.issues.length === 0 ? <small>当前没有检测到显式知识质量问题。</small> : null}
              </div>
            </section>
          ) : null}
          {explorerPlan ? (
            <section className="explorer-panel" aria-label="Explorer 探索与验证">
              <div className="explorer-heading"><Compass size={15} /><strong>Explorer</strong><small>{explorerPlan.tasks.length}</small></div>
              <p>围绕当前节点搜索新资料和相邻领域，同时主动寻找反例。</p>
              <aside className={`explorer-provider-note ${workspace.explorerSearchProvider ? "configured" : "fallback"}`} aria-label="搜索 Provider 说明">
                <ShieldCheck size={15} aria-hidden="true" />
                {workspace.explorerSearchProvider ? (
                  <span>
                    <strong>{workspace.explorerSearchProvider.id}</strong>
                    <small>{workspace.explorerSearchProvider.disclosure.privacyNotice}</small>
                    <small>{workspace.explorerSearchProvider.disclosure.costNotice} · {explorerPricingLabels[workspace.explorerSearchProvider.disclosure.pricing]}</small>
                  </span>
                ) : (
                  <span><strong>浏览器 handoff</strong><small>未配置可信 Provider。搜索在新窗口进行，粘贴原文后才会进入 Source Store。</small></span>
                )}
              </aside>
              <div className="explorer-tasks">
                {explorerPlan.tasks.map((task) => (
                  <article key={task.id} className={activeExplorerSearch?.taskId === task.id ? "active" : ""}>
                    <span><strong>{task.label}</strong><small>{task.query}</small></span>
                    <div>
                      {workspace.explorerSearchProvider ? (
                        <button
                          type="button"
                          disabled={Boolean(explorerSearchingTaskId)}
                          aria-busy={explorerSearchingTaskId === task.id}
                          onClick={() => void runExplorerSearch(task)}
                        >{explorerSearchingTaskId === task.id ? <RefreshCw className="spin" size={13} /> : <Search size={13} />}站内搜索</button>
                      ) : null}
                      <a href={buildExplorerSearchUrl(task)} target="_blank" rel="noreferrer" aria-label={`${task.label}：打开浏览器搜索`}><ExternalLink size={13} />浏览器</a>
                      <button type="button" disabled={!isProjectWritable} onClick={() => openExplorerManualCapture(task)}>手动收录</button>
                    </div>
                  </article>
                ))}
              </div>
              {activeExplorerSearch ? (
                <section className="explorer-search-results" aria-label="Explorer 搜索结果">
                  <header>
                    <span><strong>搜索结果</strong><small>{activeExplorerSearch.results.length} 条 · {activeExplorerSearch.attempts.length} 次尝试</small></span>
                    {activeExplorerSearch.status !== "completed" && explorerSearchTask ? (
                      <button type="button" disabled={Boolean(explorerSearchingTaskId)} onClick={() => void runExplorerSearch(explorerSearchTask)}><RefreshCw size={13} />重试</button>
                    ) : null}
                  </header>
                  {activeExplorerSearch.status === "completed" ? (
                    <>
                      <div className="explorer-result-filters" aria-label="结果筛选">
                        <label htmlFor="explorer-source-filter">来源
                          <select id="explorer-source-filter" value={explorerSourceFilter} onChange={(event) => setExplorerSourceFilter(event.target.value as ExplorerSourceFilter)}>
                            <option value="all">全部</option>
                            <option value="original">原始 / 官方</option>
                            <option value="secondary">评审 / 二手</option>
                            <option value="community">社区 / 其他</option>
                          </select>
                        </label>
                        <label className="explorer-check"><input type="checkbox" checked={explorerLatestOnly} onChange={(event) => setExplorerLatestOnly(event.target.checked)} />仅最新版本</label>
                        <label className="explorer-check"><input type="checkbox" checked={explorerHideExisting} onChange={(event) => setExplorerHideExisting(event.target.checked)} />隐藏已收录</label>
                      </div>
                      <div className="explorer-bulk-bar">
                        <label className="explorer-check">
                          <input
                            type="checkbox"
                            aria-label="选择当前筛选结果"
                            checked={visibleSelectableExplorerResults.length > 0 && visibleSelectableExplorerResults.every((result) => explorerSelectedResultIds.includes(result.id))}
                            onChange={(event) => {
                              const ids = visibleSelectableExplorerResults.map((result) => result.id);
                              setExplorerSelectedResultIds((current) => event.target.checked
                                ? Array.from(new Set([...current, ...ids])).slice(0, 10)
                                : current.filter((id) => !ids.includes(id)));
                            }}
                          />选择本页
                        </label>
                        <button
                          type="button"
                          disabled={!isProjectWritable || !workspace.explorerSearchProvider?.canCapture || explorerSelectedResultIds.length === 0 || isExplorerCapturing}
                          aria-busy={isExplorerCapturing}
                          onClick={() => void captureSelectedExplorerResults()}
                        ><ArrowDownToLine size={13} />{isExplorerCapturing ? "抓取中…" : `收录所选 (${explorerSelectedResultIds.length})`}</button>
                      </div>
                      {!workspace.explorerSearchProvider?.canCapture ? <small className="explorer-capture-hint">该 Provider 不支持正文抓取；可逐条打开原页面并手动收录。</small> : null}
                      <div className="explorer-result-list">
                        {visibleExplorerResults.map((result) => (
                          <article key={result.id} className={result.existingSourceId ? "existing" : ""}>
                            <input
                              type="checkbox"
                              aria-label={`选择搜索结果：${result.title}`}
                              disabled={Boolean(result.existingSourceId)}
                              checked={explorerSelectedResultIds.includes(result.id)}
                              onChange={(event) => setExplorerSelectedResultIds((current) => event.target.checked
                                ? Array.from(new Set([...current, result.id])).slice(0, 10)
                                : current.filter((id) => id !== result.id))}
                            />
                            <span>
                              <span className="explorer-result-meta">
                                <i>{explorerSourceKindLabels[result.sourceKind]}</i>
                                <small>相关度 {result.relevanceScore}</small>
                                <small>{explorerVersionStateLabels[result.versionState]}</small>
                                {result.existingSourceId ? <em>已收录</em> : null}
                              </span>
                              <a href={result.canonicalUrl} target="_blank" rel="noreferrer">{result.title}<ExternalLink size={12} aria-hidden="true" /></a>
                              {result.snippet ? <small className="explorer-result-snippet">{result.snippet}</small> : null}
                              <small className="explorer-ranking-reason">{result.rankingReasons.join(" · ")}</small>
                              <button type="button" disabled={!isProjectWritable} onClick={() => explorerSearchTask && openExplorerManualCapture(explorerSearchTask, result)}>打开手动收录</button>
                            </span>
                          </article>
                        ))}
                        {visibleExplorerResults.length === 0 ? <p role="status">当前筛选条件下没有结果。可切换来源、取消“仅最新版本”，或使用浏览器搜索。</p> : null}
                      </div>
                    </>
                  ) : (
                    <p className="explorer-search-error" role="alert">{activeExplorerSearch.error ?? "搜索未完成，可重试或改用浏览器搜索。"}</p>
                  )}
                </section>
              ) : null}
              <button
                className="explorer-propose"
                type="button"
                disabled={!isProjectWritable || pendingPatches.some((patch) => patch.action === "explore" && patch.targetNodeId === explorerPlan.targetNodeId)}
                onClick={() => {
                  try {
                    workspace.proposeExploration(explorerPlan.targetNodeId);
                    setExplorerMessage("反例与待验证问题已生成，接受前不会写入主图。");
                  } catch (error) {
                    setExplorerMessage(error instanceof Error ? error.message : "探索建议生成失败");
                  }
                }}
              ><Sparkles size={13} />生成反例与待验证问题</button>
              {explorerMessage ? <small className="explorer-message" role="status">{explorerMessage}</small> : null}
            </section>
          ) : null}
          <section className="knowledge-insight-panel" aria-label="理解范围与知识缺口">
            <div className="insight-heading"><Layers3 size={15} /><strong>理解范围</strong></div>
            <div className="coverage-row">
              <span>结构探索</span><strong>{insights.scope.explorationCoveragePercent}%</strong>
            </div>
            <div className="coverage-track" aria-label={`结构探索覆盖 ${insights.scope.explorationCoveragePercent}%`}>
              <i style={{ width: `${insights.scope.explorationCoveragePercent}%` }} />
            </div>
            <p>{insights.scope.hint}</p>
            <div className="insight-metrics">
              <span>最深 {insights.scope.maxDepth} 层</span>
              <span>{insights.scope.sourceBackedNodeCount} 个有来源</span>
              <span>{insights.scope.resolvedNodeCount} 个已理解</span>
            </div>
            <div className="insight-list-heading"><AlertTriangle size={13} /> 知识缺口 <small>{insights.gaps.length}</small></div>
            <div className="insight-node-list">
              {insights.gaps.slice(0, 3).map((gap) => (
                <button type="button" key={gap.id} onClick={() => workspace.selectNode(gap.nodeId)}>
                  <span className={`severity-${gap.severity}`} />
                  <span><strong>{gap.title}</strong><small>{gap.detail}</small></span>
                </button>
              ))}
              {insights.gaps.length === 0 ? <small>当前没有派生出的知识缺口。</small> : null}
            </div>
            <div className="insight-list-heading"><CircleHelp size={13} /> 未解决问题 <small>{insights.unresolvedQuestions.length}</small></div>
            <div className="insight-node-list questions">
              {insights.unresolvedQuestions.slice(0, 2).map((questionInsight) => (
                <button type="button" key={questionInsight.nodeId} onClick={() => workspace.selectNode(questionInsight.nodeId)}>
                  <CircleHelp size={12} />
                  <span><strong>{questionInsight.title}</strong><small>{questionInsight.state === "candidate_answer" ? "已有候选回答，尚未确认理解" : "尚无候选回答"}</small></span>
                </button>
              ))}
              {insights.unresolvedQuestions.length === 0 ? <small>当前没有显式未解决问题。</small> : null}
            </div>
          </section>
          <section className="atlas-principle">
            <Compass size={18} />
            <div><strong>图谱是主数据</strong><p>多个 Project 引用同一知识网络，不复制节点和关系。</p></div>
          </section>
        </aside>

        <section className="knowledge-stage" aria-label="知识图谱画布">
          <div className="stage-heading">
            <div>
              <span className="stage-kicker">{activeView.kind.replace("_", " ")}</span>
              <h1>{activeView.title}</h1>
            </div>
            <p>{knowledgeViewPresentations[activeView.kind].description}</p>
          </div>
          {systematizeProjection
            ? <SystematizeArtifactView projection={systematizeProjection} workspace={workspace} />
            : <KnowledgeGraph key={`${activeView.id}:${workspace.selectedNodeId}`} workspace={workspace} />}
          {systematizeProjection ? (
            <div className="graph-legend artifact-legend">
              <span><i className="legend-dot core" /> 正式图确定性投影</span>
              <small>点击条目聚焦原节点 · 产物视图不复制知识数据</small>
            </div>
          ) : (
            <div className="graph-legend">
              <span><i className="legend-dot core" /> 核心知识</span>
              <span><i className="legend-dot inquiry" /> 提问与总结</span>
              {workspace.views.some((view) => view.kind === "route") ? <span><i className="legend-dot route" /> 技术路线</span> : null}
              <small>点击节点聚焦 · 每个节点都可继续下钻</small>
            </div>
          )}
        </section>

        <aside className="thinking-dock" aria-label="节点思考面板">
          <div className="dock-heading">
            <span><CircleDot size={15} /> NODE FOCUS</span>
            <small>{knowledgeNodeKindLabels[selectedNode.kind]}</small>
          </div>
          {isProjectCompleted ? (
            <section className="project-completed-banner" aria-label="Project 已完成">
              <Check size={17} />
              <div><strong>Understand Project 已完成</strong><p>图谱保持可浏览；重新打开后可继续导入、下钻、提问和总结。</p></div>
            </section>
          ) : null}
          <section className="focused-node-card">
            <span className={`kind-pill kind-${selectedNode.kind}`}>{knowledgeNodeKindLabels[selectedNode.kind]}</span>
            <h2>{selectedNode.title}</h2>
            <p>{selectedNode.summary}</p>
            <div className="knowledge-metadata-row">
              <span>{epistemicStatusLabels[selectedNode.epistemicStatus]}</span>
              <span>{selectedNode.scope.kind === "context_specific" ? "限定场景" : selectedNode.scope.kind === "project" ? "当前 Project" : "通用范围"}</span>
              <span>{sourceStatusLabels[selectedNode.sourceStatus]}</span>
            </div>
            {selectedNode.scope.kind === "context_specific" ? <p className="scope-description">适用范围：{selectedNode.scope.description}</p> : null}
            <div className="tag-row">{selectedNode.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
          </section>
          {sourceImportMessage ? <p className="source-import-message" role="status">{sourceImportMessage}</p> : null}
          {selectedSourceReferences.length > 0 ? (
            <section className="source-reference-list" aria-label="节点来源定位">
              <div className="section-title"><span>来源定位</span><small>{selectedSourceReferences.length}</small></div>
              {selectedSourceReferences.map((reference, index) => (
                <article key={`${reference.sourceUri}-${reference.locator}-${index}`}>
                  <div><FileText size={14} /><strong>{reference.sourceTitle}</strong></div>
                  <span><MapPin size={12} /> {reference.locator}</span>
                  {reference.quote ? <blockquote>{reference.quote}</blockquote> : null}
                  {reference.href ? (
                    <a href={reference.href} target="_blank" rel="noreferrer">打开原始位置 <ExternalLink size={12} /></a>
                  ) : <small>{reference.sourceUri}</small>}
                </article>
              ))}
            </section>
          ) : null}
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
                <option value="whole_subject">整个 Project</option>
              </select>
            </div>
            <div className="context-focus"><CircleDot size={13} /><strong>{selectedNode.title}</strong></div>
            <div className="context-metrics">
              <span>{workspace.selection.nodeIds.length} 个节点</span>
              <span>{workspace.selection.sourceIds.length} 个来源</span>
              <span>{workspace.selection.depth < 0 ? "全图" : `${workspace.selection.depth} 层关系`}</span>
            </div>
            <p className="context-range-hint">当前 Agent 范围：{insights.scope.label}，覆盖 Project 内 {insights.scope.selectedNodeCount}/{insights.scope.projectNodeCount} 个节点。</p>
          </section>
          {workspace.project.mode === "systematize" ? <InterviewerPanel key={selectedNode.id} workspace={workspace} /> : null}
          {workspace.project.mode === "systematize" ? <CorrectionAdvisorPanel key={`correction-${selectedNode.id}`} workspace={workspace} /> : null}
          <section className="node-actions">
            <button
              className="primary-action-v2"
              type="button"
              disabled={isSelectedNodeExpanded || !isProjectWritable}
              title={!isProjectWritable ? "重新打开 Project 后才能继续下钻" : isSelectedNodeExpanded ? "该节点已有下一层，请选择子节点继续下钻" : undefined}
              onClick={() => workspace.drillDown(selectedNode.id)}
            >
              <GitBranch size={16} /> {isSelectedNodeExpanded ? "已生成下一层" : "生成下钻建议"}
            </button>
            <button type="button" disabled={!isProjectWritable} onClick={() => workspace.summarize(selectedNode.id)}>
              <BookOpenText size={16} /> 生成总结建议
            </button>
          </section>
          <section className="question-composer">
            <label htmlFor="node-question"><Sparkles size={15} /> 围绕这个点继续提问</label>
            <textarea id="node-question" disabled={!isProjectWritable} value={question} onChange={(event) => setQuestion(event.target.value)} />
            <button type="button" disabled={!isProjectWritable} onClick={() => workspace.ask(selectedNode.id, question)}><Send size={15} /> 生成回答建议</button>
          </section>
          <PatchReview patches={pendingPatches} workspace={workspace} />
          <ImpactReviewPanel workspace={workspace} />
          <section className="neighbor-list">
            <div className="section-title"><span>直接关联</span><small>{neighbors.length}</small></div>
            {neighbors.slice(0, 7).map((node) => (
              <button type="button" key={node.id} onClick={() => workspace.selectNode(node.id)}>
                <FileText size={14} />
                <span><strong>{node.title}</strong><small>{knowledgeNodeKindLabels[node.kind]}</small></span>
                <ChevronRight size={14} />
              </button>
            ))}
          </section>
        </aside>
      </main>
      {isLauncherOpen ? (
        <ProjectLauncher
          title={newSubjectTitle}
          mode={newProjectMode}
          goal={newProjectGoal}
          subjectKind={newSubjectKind}
          onModeChange={setNewProjectMode}
          onGoalChange={setNewProjectGoal}
          onTitleChange={setNewSubjectTitle}
          onSubjectKindChange={setNewSubjectKind}
          onClose={() => setLauncherOpen(false)}
          onStart={() => {
            workspace.startProject({
              mode: newProjectMode,
              title: newSubjectTitle,
              subjectKind: newSubjectKind,
              goal: newProjectGoal
            });
            if (newSubjectTitle.trim()) {
              setQuestion("这个节点最关键的原理和取舍是什么？");
              setLauncherOpen(false);
            }
          }}
        />
      ) : null}
      {isKnowledgeImportOpen ? (
        <div className="task-launcher-backdrop" role="presentation">
          <section className="knowledge-import-dialog" role="dialog" aria-modal="true" aria-labelledby="knowledge-import-title">
            <button className="launcher-close" type="button" aria-label="关闭知识录入" onClick={() => setKnowledgeImportOpen(false)}><X size={17} /></button>
            <span className="stage-kicker">KNOWLEDGE INVENTORY</span>
            <h2 id="knowledge-import-title">录入已有知识</h2>
            <p>原文先作为不可变来源保存；解析结果生成候选 Graph Patch，接受后才进入主图。</p>
            <label htmlFor="knowledge-import-kind">知识类型</label>
            <select id="knowledge-import-kind" aria-label="知识类型" value={knowledgeImportKind} onChange={(event) => setKnowledgeImportKind(event.target.value as Exclude<KnowledgeInventoryItemKind, "document">)}>
              <option value="note">用户笔记</option>
              <option value="bookmark_index">收藏索引</option>
              <option value="experience">经验陈述</option>
            </select>
            <label htmlFor="knowledge-import-entry-title">标题</label>
            <input id="knowledge-import-entry-title" value={knowledgeImportTitle} onChange={(event) => setKnowledgeImportTitle(event.target.value)} placeholder="例如：Rust 异步服务实践" />
            <label htmlFor="knowledge-import-content">内容</label>
            <textarea id="knowledge-import-content" value={knowledgeImportContent} onChange={(event) => setKnowledgeImportContent(event.target.value)} placeholder={knowledgeImportKind === "bookmark_index" ? "支持 Markdown 链接或每行一个 URL，并可附上收藏理由。" : "可以使用 Markdown；请保留原始表述和适用上下文。"} />
            <button className="launcher-start" type="button" disabled={isImportingSource || !knowledgeImportTitle.trim() || !knowledgeImportContent.trim()} onClick={() => void importKnowledgeItem()}>
              {isImportingSource ? "正在录入…" : "保存到库存并生成候选结构"} <ChevronRight size={16} />
            </button>
          </section>
        </div>
      ) : null}
      {explorerCaptureTask ? (
        <div className="task-launcher-backdrop" role="presentation">
          <section className="knowledge-import-dialog" role="dialog" aria-modal="true" aria-labelledby="explorer-capture-title">
            <button className="launcher-close" type="button" aria-label="关闭搜索资料收录" onClick={() => setExplorerCaptureTask(undefined)}><X size={17} /></button>
            <span className="stage-kicker">EXPLORER SOURCE</span>
            <h2 id="explorer-capture-title">收录搜索资料</h2>
            <p>请打开原页面后粘贴实际正文或原文摘录。搜索结果摘要不会被当成来源。</p>
            <label htmlFor="explorer-source-title">资料标题</label>
            <input id="explorer-source-title" value={explorerSourceTitle} onChange={(event) => setExplorerSourceTitle(event.target.value)} placeholder="例如：Retry budgets guidance" />
            <label htmlFor="explorer-source-url">原始 URL</label>
            <input id="explorer-source-url" type="url" value={explorerSourceUrl} onChange={(event) => setExplorerSourceUrl(event.target.value)} placeholder="https://…" />
            <label htmlFor="explorer-source-content">实际正文或原文摘录</label>
            <textarea id="explorer-source-content" value={explorerSourceContent} onChange={(event) => setExplorerSourceContent(event.target.value)} placeholder="粘贴从原页面读取的正文；请保留原始措辞。" />
            <button
              className="launcher-submit"
              type="button"
              disabled={isImportingSource || !explorerSourceTitle.trim() || !explorerSourceUrl.trim() || !explorerSourceContent.trim()}
              onClick={() => void captureExplorerSource()}
            >保存来源并生成候选结构 <ArrowDownToLine size={16} /></button>
          </section>
        </div>
      ) : null}
      {isCompletionOpen && completionAssessment ? (
        <div className="task-launcher-backdrop" role="presentation">
          <section className="project-completion-dialog" role="dialog" aria-modal="true" aria-labelledby="project-completion-title">
            <button className="launcher-close" type="button" aria-label="关闭完成确认" onClick={() => setCompletionOpen(false)}><X size={17} /></button>
            <span className="stage-kicker">COMPLETE UNDERSTAND PROJECT</span>
            <h2 id="project-completion-title">确认当前理解已达到目标？</h2>
            <p>完成是用户对当前目标和所需深度的明确判断，不代表图谱已经穷尽所有知识。</p>
            <div className="completion-summary">
              <span><strong>{completionAssessment.pendingPatchIds.length}</strong> 待审核 Patch</span>
              <span><strong>{completionAssessment.gapCount}</strong> 知识缺口</span>
              <span><strong>{completionAssessment.unresolvedQuestionCount}</strong> 未解决问题</span>
            </div>
            <ul>{completionAssessment.messages.map((message) => <li key={message}>{message}</li>)}</ul>
            {completionAssessment.requiresOpenItemAcknowledgement ? (
              <label className="completion-acknowledgement">
                <input type="checkbox" checked={acknowledgeOpenItems} onChange={(event) => setAcknowledgeOpenItems(event.target.checked)} />
                我确认剩余缺口和问题已知晓，当前理解已经达到本次 Project 所需深度。
              </label>
            ) : null}
            {!completionAssessment.canComplete ? <p className="completion-blocker">请先接受或拒绝所有待审核 Patch。</p> : null}
            <button
              className="launcher-start"
              type="button"
              disabled={!completionAssessment.canComplete || (completionAssessment.requiresOpenItemAcknowledgement && !acknowledgeOpenItems)}
              onClick={() => {
                workspace.completeProject(acknowledgeOpenItems);
                setCompletionOpen(false);
              }}
            >确认完成 Project <Check size={16} /></button>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function InterviewerPanel({ workspace }: Props) {
  const [answer, setAnswer] = useState("");
  const [context, setContext] = useState("");
  const [constraints, setConstraints] = useState("");
  const [exceptions, setExceptions] = useState("");
  const progress = deriveInterviewerProgress(workspace, workspace.selectedNode.id);
  const prompt = progress.nextPrompt;
  const isWritable = workspace.project.status === "active" || workspace.project.status === "reopened";

  return (
    <section className="interviewer-panel" aria-label="Interviewer 隐性知识访谈">
      <div className="interviewer-heading">
        <span><Sparkles size={14} /> Interviewer</span>
        <small>{progress.completedCount}/{progress.totalCount}</small>
      </div>
      <div className="interviewer-progress" aria-label={`访谈维度进度 ${progress.completedCount}/${progress.totalCount}`}>
        <i style={{ width: `${Math.round(progress.completedCount / progress.totalCount * 100)}%` }} />
      </div>
      {progress.isComplete ? (
        <p className="interviewer-complete"><Check size={13} /> 当前节点的目标、做法、判断、场景、例外和观察依据已完成一轮外化。</p>
      ) : prompt ? (
        <>
          <span className="interviewer-dimension">{prompt.label}</span>
          <strong className="interviewer-question">{prompt.question}</strong>
          <p>{prompt.rationale}</p>
          {progress.nextPromptPendingReview ? (
            <div className="interviewer-pending">本轮回答已生成 Candidate Graph Patch，请先接受或拒绝。</div>
          ) : (
            <div className="interviewer-fields">
              <label htmlFor={`interview-answer-${workspace.selectedNode.id}`}>访谈回答</label>
              <textarea id={`interview-answer-${workspace.selectedNode.id}`} value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="描述你真实采用的做法、判断或经验。" />
              <label htmlFor={`interview-context-${workspace.selectedNode.id}`}>适用上下文（必填）</label>
              <textarea id={`interview-context-${workspace.selectedNode.id}`} value={context} onChange={(event) => setContext(event.target.value)} placeholder="例如：支付服务、峰值 2k RPS、5 人后端团队。" />
              <label htmlFor={`interview-constraints-${workspace.selectedNode.id}`}>约束与前提（可选）</label>
              <input id={`interview-constraints-${workspace.selectedNode.id}`} value={constraints} onChange={(event) => setConstraints(event.target.value)} placeholder="成立所需的资源、规模或技术前提。" />
              <label htmlFor={`interview-exceptions-${workspace.selectedNode.id}`}>例外与不确定性（可选）</label>
              <input id={`interview-exceptions-${workspace.selectedNode.id}`} value={exceptions} onChange={(event) => setExceptions(event.target.value)} placeholder="已知失效条件、反例或仍待验证之处。" />
              <button
                type="button"
                disabled={!isWritable || !answer.trim() || !context.trim()}
                onClick={() => {
                  workspace.answerInterview({
                    targetNodeId: workspace.selectedNode.id,
                    answer,
                    context,
                    constraints,
                    exceptions
                  });
                  setAnswer("");
                  setContext("");
                  setConstraints("");
                  setExceptions("");
                }}
              ><Send size={14} /> 生成访谈候选知识</button>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}

function CorrectionAdvisorPanel({ workspace }: Props) {
  const [errorType, setErrorType] = useState<CorrectionErrorType>("factual_error");
  const [correctedContent, setCorrectedContent] = useState("");
  const [applicabilityScope, setApplicabilityScope] = useState("");
  const [supportingIds, setSupportingIds] = useState<string[]>([]);
  const [opposingIds, setOpposingIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const candidates = useMemo(
    () => deriveCorrectionEvidenceCandidates(workspace, workspace.selectedNode.id),
    [workspace.project, workspace.graph, workspace.knowledgeSourceAssets, workspace.sourceAnchors, workspace.selectedNode.id]
  );
  const pending = workspace.candidatePatches.some((patch) =>
    patch.action === "correct" && patch.targetNodeId === workspace.selectedNode.id && patch.status === "pending_review"
  );
  const isWritable = workspace.project.status === "active" || workspace.project.status === "reopened";

  function toggleEvidence(nodeId: string, stance: "support" | "oppose", checked: boolean) {
    if (stance === "support") {
      setSupportingIds((current) => checked ? Array.from(new Set(current.concat(nodeId))) : current.filter((id) => id !== nodeId));
      if (checked) setOpposingIds((current) => current.filter((id) => id !== nodeId));
    } else {
      setOpposingIds((current) => checked ? Array.from(new Set(current.concat(nodeId))) : current.filter((id) => id !== nodeId));
      if (checked) setSupportingIds((current) => current.filter((id) => id !== nodeId));
    }
  }

  return (
    <section className="correction-advisor-panel" aria-label="纠偏建议">
      <div className="correction-heading">
        <span><ShieldCheck size={14} /> Correction Advisor</span>
        <small>{candidates.length} 条可用来源</small>
      </div>
      <p>新认知通过 <code>corrects</code> 指向旧认知；旧节点与审查历史都会保留。</p>
      <div className="correction-fields">
        <label htmlFor={`correction-error-${workspace.selectedNode.id}`}>错误类型</label>
        <select id={`correction-error-${workspace.selectedNode.id}`} value={errorType} onChange={(event) => setErrorType(event.target.value as CorrectionErrorType)}>
          {(Object.keys(correctionErrorTypeLabels) as CorrectionErrorType[]).map((type) => (
            <option key={type} value={type}>{correctionErrorTypeLabels[type]}</option>
          ))}
        </select>
        <label htmlFor={`correction-content-${workspace.selectedNode.id}`}>修正内容</label>
        <textarea id={`correction-content-${workspace.selectedNode.id}`} value={correctedContent} onChange={(event) => setCorrectedContent(event.target.value)} placeholder="说明修正后的认知；不要删除或改写原节点。" />
        <label htmlFor={`correction-scope-${workspace.selectedNode.id}`}>适用范围</label>
        <input id={`correction-scope-${workspace.selectedNode.id}`} value={applicabilityScope} onChange={(event) => setApplicabilityScope(event.target.value)} placeholder="系统、团队、规模、前提和时间范围。" />
      </div>
      <div className="correction-evidence-heading">
        <strong>支持与反对证据</strong>
        <small>支持、反对各 1 条 · 至少 2 个来源</small>
      </div>
      <div className="correction-evidence-list">
        {candidates.map((candidate) => (
          <article key={candidate.nodeId}>
            <span><strong>{candidate.title}</strong><small>{candidate.sourceCount} 个不可变来源 · {candidate.stance === "unclassified" ? "尚未分类" : candidate.stance === "supports_correction" ? "已反驳旧认知" : "已支持旧认知"}</small></span>
            <label>
              <input
                type="checkbox"
                aria-label={`支持修正：${candidate.title}`}
                checked={supportingIds.includes(candidate.nodeId)}
                onChange={(event) => toggleEvidence(candidate.nodeId, "support", event.target.checked)}
              /> 支持修正
            </label>
            <label>
              <input
                type="checkbox"
                aria-label={`反对修正：${candidate.title}`}
                checked={opposingIds.includes(candidate.nodeId)}
                onChange={(event) => toggleEvidence(candidate.nodeId, "oppose", event.target.checked)}
              /> 反对修正
            </label>
          </article>
        ))}
        {candidates.length === 0 ? <small>先导入并接受带原文定位的资料，再提出纠偏；不能只凭搜索摘要宣布旧认知错误。</small> : null}
      </div>
      <button
        className="correction-propose"
        type="button"
        disabled={!isWritable || pending || !correctedContent.trim() || !applicabilityScope.trim() || supportingIds.length === 0 || opposingIds.length === 0}
        onClick={() => {
          try {
            workspace.proposeCorrection({
              targetNodeId: workspace.selectedNode.id,
              errorType,
              correctedContent,
              applicabilityScope,
              supportingEvidenceNodeIds: supportingIds,
              opposingEvidenceNodeIds: opposingIds
            });
            setMessage("纠偏建议已生成；接受前不会改变旧认知或写入新节点。");
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "纠偏建议生成失败");
          }
        }}
      ><ShieldCheck size={13} />生成带证据的纠偏建议</button>
      {pending ? <small className="correction-message">请先接受或拒绝当前纠偏 Patch。</small> : message ? <small className="correction-message" role="status">{message}</small> : null}
    </section>
  );
}

function PatchReview({ patches, workspace }: { patches: CandidateGraphPatch[]; workspace: KnowledgeWorkspaceController }) {
  return (
    <section className="patch-review" aria-label="候选图谱变更">
      <div className="section-title"><span>待确认变更</span><small>{patches.length}</small></div>
      {patches.length === 0 ? <p className="patch-empty">Agent 生成的节点和关系会先在这里等待确认。</p> : patches.map((patch) => {
        const operationCounts = patch.operations.reduce<Partial<Record<GraphPatchOperation["kind"], number>>>((counts, operation) => ({
          ...counts,
          [operation.kind]: (counts[operation.kind] ?? 0) + 1
        }), {});
        return (
          <article className="patch-ticket" key={patch.id}>
            <div className="patch-ticket-heading">
              <span>{patch.action.replace("_", " ")}</span>
              <small>rev {patch.revision} · {Math.round(patch.confidence * 100)}% confidence</small>
            </div>
            <strong>{patch.title}</strong>
            <p>{patch.summary}</p>
            <div className="patch-impact">
              {Object.entries(operationCounts).map(([kind, count]) => (
                <span key={kind}>{graphPatchOperationLabels[kind as GraphPatchOperation["kind"]]} {count}</span>
              ))}
            </div>
            {patch.impactAssessment ? (
              <div className="impact-assessment-card" aria-label="纠偏影响评估">
                <div className="impact-assessment-heading">
                  <span><AlertTriangle size={13} /> Impact Assessment</span>
                  <small>接受前检查</small>
                </div>
                <div className="impact-assessment-counts">
                  {(Object.keys(impactCategoryLabels) as Array<keyof typeof impactCategoryLabels>).map((category) => (
                    <span key={category}>{impactCategoryLabels[category]} <strong>{patch.impactAssessment!.counts[category]}</strong></span>
                  ))}
                </div>
                <div className="impact-assessment-items">
                  {patch.impactAssessment.affectedItems.map((item) => (
                    <button type="button" key={item.nodeId} onClick={() => workspace.selectNode(item.nodeId)}>
                      <span><strong>{item.title}</strong><small>{impactCategoryLabels[item.category]} · {item.distance} 层影响</small></span>
                      <ChevronRight size={12} />
                    </button>
                  ))}
                  {!patch.impactAssessment.hasDownstreamImpact ? <small>当前未发现依赖该旧认知的判断、方法、总结或结论。</small> : null}
                </div>
                <p>接受纠偏后，将为每个受影响节点创建独立待复核任务。</p>
              </div>
            ) : null}
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

function ImpactReviewPanel({ workspace }: { workspace: KnowledgeWorkspaceController }) {
  const tasks = workspace.impactReviewTasks;
  if (tasks.length === 0) return null;
  const pendingCount = tasks.filter((task) => task.status === "pending_review").length;
  return (
    <section className="impact-review-panel" aria-label="下游影响复核">
      <div className="section-title"><span>下游影响复核</span><small>{pendingCount} 待处理 / {tasks.length}</small></div>
      <div className="impact-review-list">
        {tasks.map((task) => <ImpactReviewTaskCard key={task.id} task={task} workspace={workspace} />)}
      </div>
    </section>
  );
}

function ImpactReviewTaskCard({
  task,
  workspace
}: {
  task: ImpactReviewTask;
  workspace: KnowledgeWorkspaceController;
}) {
  const node = workspace.graph.nodes.find((candidate) => candidate.id === task.nodeId);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(node?.title ?? "");
  const [summary, setSummary] = useState(node?.summary ?? "");
  const [note, setNote] = useState("");
  const hasPendingModification = workspace.candidatePatches.some(
    (patch) => patch.reviewTaskId === task.id && patch.status === "pending_review"
  );
  const isPending = task.status === "pending_review";
  return (
    <article className={`impact-review-task status-${task.status}`} aria-label={`复核任务：${node?.title ?? task.nodeId}`}>
      <div className="impact-review-task-heading">
        <span>{impactCategoryLabels[task.category]}</span>
        <small>{impactReviewStatusLabels[task.status]}</small>
      </div>
      <button className="impact-review-node" type="button" onClick={() => workspace.selectNode(task.nodeId)}>
        <span><strong>{node?.title ?? task.nodeId}</strong><small>{task.impactPath.length} 层影响 · 定位节点</small></span>
        <ChevronRight size={13} />
      </button>
      <p>{task.reason}</p>
      {editing && isPending ? (
        <div className="impact-review-editor">
          <label htmlFor={`${task.id}-title`}>修订标题</label>
          <input id={`${task.id}-title`} value={title} onChange={(event) => setTitle(event.target.value)} />
          <label htmlFor={`${task.id}-summary`}>修订内容</label>
          <textarea id={`${task.id}-summary`} value={summary} onChange={(event) => setSummary(event.target.value)} />
          <label htmlFor={`${task.id}-note`}>修改说明</label>
          <input id={`${task.id}-note`} value={note} onChange={(event) => setNote(event.target.value)} placeholder="为什么需要调整这个节点" />
          <div className="impact-review-actions">
            <button type="button" onClick={() => {
              workspace.modifyImpactReview(task.id, { title, summary, note });
              setEditing(false);
            }}>提交修改 Patch</button>
            <button type="button" onClick={() => setEditing(false)}>取消</button>
          </div>
        </div>
      ) : null}
      {isPending && !editing ? (
        <div className="impact-review-actions">
          <button type="button" disabled={hasPendingModification} onClick={() => workspace.acceptImpactReview(task.id)}><Check size={13} /> 接受现状</button>
          <button type="button" disabled={hasPendingModification} onClick={() => setEditing(true)}><FileText size={13} /> 修改节点</button>
          <button type="button" disabled={hasPendingModification} onClick={() => workspace.rejectImpactReview(task.id)}><X size={13} /> 拒绝复核</button>
        </div>
      ) : null}
      {hasPendingModification ? <small className="impact-review-waiting">节点修改正在上方 Candidate Graph Patch 中等待确认。</small> : null}
      <details className="impact-review-history">
        <summary>复核历史 {task.history.length}</summary>
        <ol>
          {[...task.history].reverse().map((entry) => (
            <li key={entry.id}>
              <strong>{impactReviewActionLabels[entry.action]}</strong>
              <span>{entry.note}</span>
              {entry.before && entry.after ? <small>{entry.before.title} → {entry.after.title}</small> : null}
            </li>
          ))}
        </ol>
      </details>
    </article>
  );
}

const impactReviewStatusLabels: Record<ImpactReviewTask["status"], string> = {
  pending_review: "待复核",
  accepted: "已接受现状",
  modified: "已修改",
  rejected: "已拒绝复核"
};

const impactReviewActionLabels: Record<ImpactReviewTask["history"][number]["action"], string> = {
  created: "创建任务",
  accepted: "接受现状",
  modification_proposed: "提交修改",
  modified: "接受修改",
  modification_rejected: "拒绝修改 Patch",
  rejected: "拒绝复核"
};

const graphPatchOperationLabels: Record<GraphPatchOperation["kind"], string> = {
  create_node: "新增节点",
  create_edge: "新增关系",
  create_conversation: "保存问答",
  revise_node: "修订节点",
  link_nodes: "调整关系",
  update_node_status: "更新状态",
  update_node_sources: "更新来源",
  archive_node: "归档节点"
};

const knowledgeViewPresentations: Record<KnowledgeViewKind, { Icon: LucideIcon; subtitle: string; description: string }> = {
  mind_map: { Icon: GitBranch, subtitle: "局部理解", description: "从一个根节点开始理解，沿任意知识点继续下钻。" },
  network: { Icon: Network, subtitle: "全局关联", description: "查看提问、证据、概念与总结如何互相连接。" },
  evidence: { Icon: ShieldCheck, subtitle: "证据追溯", description: "检查 Claim 与原始来源之间的可追溯关系。" },
  route: { Icon: Route, subtitle: "方案决策", description: "把目标、约束、候选方案和推荐步骤放到同一张图里。" },
  knowledge_modules: { Icon: Layers3, subtitle: "主题分组", description: "按正式 contains 层级查看知识模块和跨模块内容。" },
  skill_tree: { Icon: BrainCircuit, subtitle: "能力结构", description: "查看技能、实践和经验如何形成可培养的能力结构。" },
  learning_dependencies: { Icon: Network, subtitle: "前置关系", description: "检查明确记录的学习依赖与仍待澄清的阻塞项。" },
  learning_path: { Icon: Route, subtitle: "学习顺序", description: "依据显式依赖和先后关系形成可解释的学习顺序。" },
  practice_manual: { Icon: BookOpenText, subtitle: "方法手册", description: "把方法、判断规则、适用范围、证据和例外整理为实践手册。" }
};

function KnowledgeViewButton({
  view,
  workspace
}: {
  view: KnowledgeView;
  workspace: KnowledgeWorkspaceController;
}) {
  const presentation = knowledgeViewPresentations[view.kind];
  const Icon = presentation.Icon;
  const active = view.id === workspace.activeViewId;
  return (
    <button
      type="button"
      className={active ? "active" : ""}
      aria-current={active ? "page" : undefined}
      onClick={() => workspace.switchView(view.id)}
    >
      <Icon size={16} />
      <span>{view.title}</span>
      <small>{presentation.subtitle}</small>
    </button>
  );
}

function SystematizeArtifactView({
  projection,
  workspace
}: {
  projection: SystematizeViewProjection;
  workspace: KnowledgeWorkspaceController;
}) {
  const nodesById = new Map(projection.nodes.map((node) => [node.nodeId, node]));
  const sequencePosition = new Map(projection.sequence.map((nodeId, index) => [nodeId, index + 1]));
  const cycleNodeIds = new Set(projection.cycleNodeIds);
  const showRelations = projection.kind === "skill_tree"
    || projection.kind === "learning_dependencies"
    || projection.kind === "learning_path";
  return (
    <section className={`systematize-artifact artifact-${projection.kind}`} aria-label={`${projection.title}投影`}>
      <header className="artifact-summary">
        <p>{projection.description}</p>
        <div className="artifact-metrics" aria-label="视图统计">
          {projection.metrics.map((metric) => (
            <span key={metric.id}><strong>{metric.value}</strong><small>{metric.label}</small></span>
          ))}
        </div>
      </header>
      {projection.emptyMessage ? (
        <div className="artifact-empty" role="note"><CircleHelp size={18} /><p>{projection.emptyMessage}</p></div>
      ) : null}
      <div className="artifact-groups">
        {projection.groups.map((group) => (
          <article className="artifact-group" key={group.id} aria-label={`${projection.title}：${group.title}`}>
            <header><div><h2>{group.title}</h2><p>{group.description}</p></div><small>{group.nodeIds.length}</small></header>
            <div className="artifact-node-list">
              {group.nodeIds.map((nodeId) => nodesById.get(nodeId)).filter((node): node is SystematizeProjectionNode => Boolean(node)).map((node) => (
                <button type="button" key={node.nodeId} aria-label={`聚焦节点：${node.title}`} onClick={() => workspace.selectNode(node.nodeId)}>
                  {projection.kind === "learning_path" ? <span className="artifact-sequence-index">{sequencePosition.get(node.nodeId)}</span> : null}
                  <span className="artifact-node-copy">
                    <span className="artifact-node-meta">
                      <i>{knowledgeNodeKindLabels[node.kind]}</i>
                      <small>{epistemicStatusLabels[node.epistemicStatus]}</small>
                      {cycleNodeIds.has(node.nodeId) ? <em>循环依赖</em> : null}
                    </span>
                    <strong>{node.title}</strong>
                    <small>{node.summary}</small>
                  </span>
                  <ChevronRight size={14} aria-hidden="true" />
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>
      {showRelations && projection.links.length > 0 ? (
        <section className="artifact-relations" aria-label={`${projection.title}关系依据`}>
          <div className="section-title"><span>关系依据</span><small>{projection.links.length}</small></div>
          <div>
            {projection.links.map((link) => (
              <button type="button" key={link.edgeId} onClick={() => workspace.selectNode(link.fromNodeId)}>
                <strong>{nodesById.get(link.fromNodeId)?.title ?? link.fromNodeId}</strong>
                <span>{link.label}</span>
                <strong>{nodesById.get(link.toNodeId)?.title ?? link.toNodeId}</strong>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}

type ExplorerSourceFilter = "all" | "original" | "secondary" | "community";

const explorerSourceKindLabels: Record<SearchSourceKind, string> = {
  primary: "原始来源",
  official: "官方来源",
  peer_reviewed: "同行评审",
  independent_secondary: "独立二手",
  community: "社区来源",
  other: "其他来源"
};

const explorerVersionStateLabels: Record<ExplorerSearchResult["versionState"], string> = {
  single: "单一版本",
  latest: "最新版本",
  older: "较旧版本",
  unknown: "版本未知"
};

const explorerPricingLabels: Record<NonNullable<KnowledgeWorkspaceController["explorerSearchProvider"]>["disclosure"]["pricing"], string> = {
  free: "免费",
  metered: "按量计费",
  unknown: "费用未知"
};

function buildExplorerFilters(
  sourceFilter: ExplorerSourceFilter,
  latestVersionsOnly: boolean,
  hideExisting: boolean
): ExplorerSearchFilters {
  const sourceKinds: ExplorerSearchFilters["sourceKinds"] = sourceFilter === "original"
    ? ["primary", "official"]
    : sourceFilter === "secondary"
      ? ["peer_reviewed", "independent_secondary"]
      : sourceFilter === "community"
        ? ["community", "other"]
        : undefined;
  return { sourceKinds, latestVersionsOnly, hideExisting };
}

function ProjectLauncher({
  title,
  mode,
  goal,
  subjectKind,
  onModeChange,
  onGoalChange,
  onTitleChange,
  onSubjectKindChange,
  onClose,
  onStart
}: {
  title: string;
  mode: ProjectMode;
  goal: string;
  subjectKind: SubjectKind;
  onModeChange: (value: ProjectMode) => void;
  onGoalChange: (value: string) => void;
  onTitleChange: (value: string) => void;
  onSubjectKindChange: (value: SubjectKind) => void;
  onClose: () => void;
  onStart: () => void;
}) {
  const modes: Array<{ mode: ProjectMode; title: string; detail: string; icon: typeof BrainCircuit }> = [
    { mode: "understand", title: "我想搞清楚一个东西", detail: "渐进理解概念、原理、结构和边界", icon: BrainCircuit },
    { mode: "systematize", title: "我想梳理已有知识体系", detail: "盘点、结构化、验证并发现冲突", icon: Network },
    { mode: "research", title: "我想研究问题并得到结论", detail: "围绕问题收集证据、验证并形成判断", icon: Compass }
  ];
  return (
    <div className="task-launcher-backdrop" role="presentation">
      <section className="task-launcher" role="dialog" aria-modal="true" aria-labelledby="project-launcher-title">
        <button className="launcher-close" type="button" aria-label="关闭 Project 创建" onClick={onClose}><X size={17} /></button>
        <span className="stage-kicker">NEW PROJECT</span>
        <h2 id="project-launcher-title">你想完成什么？</h2>
        <p>先选择用户意图，再定义要处理的对象；两者是独立的产品维度。</p>
        <div className="launcher-step"><span>01</span><strong>选择 Project 意图</strong></div>
        <div className="task-options">
          {modes.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.mode} type="button" className={mode === item.mode ? "active" : ""} onClick={() => onModeChange(item.mode)}>
                <Icon size={18} /><span><strong>{item.title}</strong><small>{item.detail}</small></span>
              </button>
            );
          })}
        </div>
        <div className="launcher-step"><span>02</span><strong>定义目标与对象</strong></div>
        <div className="launcher-fields">
          <label htmlFor="new-project-goal">Project 目标</label>
          <input id="new-project-goal" value={goal} onChange={(event) => onGoalChange(event.target.value)} placeholder="可选；留空时使用该模式的默认目标" />
          <label htmlFor="new-subject-kind">对象类型</label>
          <select id="new-subject-kind" value={subjectKind} onChange={(event) => onSubjectKindChange(event.target.value as SubjectKind)}>
            {(Object.keys(subjectKindLabels) as SubjectKind[]).map((kind) => <option value={kind} key={kind}>{subjectKindLabels[kind]}</option>)}
          </select>
          <label htmlFor="new-subject-title">认知或研究对象</label>
          <input id="new-subject-title" autoFocus value={title} onChange={(event) => onTitleChange(event.target.value)} placeholder="例如：WebGPU、RFC 9457、支付服务代码库……" />
        </div>
        <button className="launcher-start" type="button" disabled={!title.trim()} onClick={onStart}>创建 {projectModeLabels[mode]} Project <ChevronRight size={16} /></button>
      </section>
    </div>
  );
}

function KnowledgeGraph({ workspace }: Props) {
  const [visibleNodeLimit, setVisibleNodeLimit] = useState<number>(knowledgeGraphPerformanceBudget.initialVisibleNodes);
  const projection = useMemo(() => deriveProgressiveKnowledgeProjection(workspace, {
    view: workspace.activeView,
    focusNodeId: workspace.selectedNodeId,
    visibleNodeLimit
  }), [workspace.graph, workspace.project.id, workspace.projects, workspace.activeView, workspace.selectedNodeId, visibleNodeLimit]);
  const positions = useMemo(() => layoutLocalKnowledgeProjection(projection), [projection]);

  return (
    <div className={`knowledge-graph view-${workspace.activeView.kind}`}>
      <div className="graph-projection-status" aria-label="图谱局部投影状态" aria-live="polite">
        <span>局部投影 {projection.nodes.length}/{projection.totalScopedNodeCount} 节点 · {projection.edges.length} 关系</span>
        {projection.canLoadMore ? (
          <button type="button" onClick={() => setVisibleNodeLimit(projection.nextVisibleNodeLimit)}>
            展开更多（+{projection.nextVisibleNodeLimit - projection.nodes.length}）
          </button>
        ) : projection.truncated ? <small>已达可见预算上限</small> : <small>当前范围已完整加载</small>}
      </div>
      <KnowledgeGraphCanvas
        projection={projection}
        positions={positions}
        selectedNodeId={workspace.selectedNodeId}
        onSelectNode={workspace.selectNode}
      />
    </div>
  );
}
