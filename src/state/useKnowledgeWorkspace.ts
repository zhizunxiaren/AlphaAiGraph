import { useMemo, useRef, useState } from "react";
import {
  acceptCandidateGraphPatch,
  buildKnowledgeSelection,
  createKnowledgeWorkspace,
  createProjectWorkspace,
  proposeKnowledgeAnswer,
  proposeKnowledgeDrillDown,
  proposeKnowledgeSummary,
  rejectCandidateGraphPatch
} from "../knowledge/knowledgeEngine";
import { InMemoryRawSourceStore } from "../knowledge/rawSourceStore";
import { inferKnowledgeSourceFormat, ingestSourceIntoWorkspace } from "../knowledge/sourceIngest";
import { completeUnderstandProject, reopenUnderstandProject } from "../knowledge/projectLifecycle";
import { proposeInterviewAnswer, type InterviewAnswerInput } from "../knowledge/interviewerPolicy";
import {
  captureExplorerSearchResults as captureExplorerSearchResultsIntoWorkspace,
  executeExplorerSearch,
  ingestExplorerSourceCapture,
  proposeExplorerCandidates,
  type ExplorerBatchCaptureExecution,
  type ExplorerSearchExecution,
  type ExplorerSearchFilters,
  type ExplorerSearchResult,
  type ExplorerTask,
  type KnowledgeSearchProvider
} from "../knowledge/explorerPolicy";
import { proposeCorrection as proposeCorrectionPatch, type CorrectionProposalInput } from "../knowledge/correctionPolicy";
import {
  decodeMarkdownWikiVaultZip,
  proposeMarkdownWikiVaultImport,
  type MarkdownWikiVaultImportResult
} from "../knowledge/markdownWikiVault";
import type { LegacyResearchMigrationResult } from "../knowledge/legacyResearchMigration";
import {
  acceptImpactReviewTask,
  proposeImpactReviewTaskModification,
  rejectImpactReviewTask,
  type ImpactReviewModificationInput
} from "../knowledge/impactReview";
import type { AnalysisSubject, IngestResult, KnowledgeContextPolicy, KnowledgeInventoryItemKind, KnowledgeSourceFormat, KnowledgeView, KnowledgeWorkspaceSnapshot, ProjectMode, SourceParser, SubjectKind } from "../types";

export interface KnowledgeWorkspaceController extends KnowledgeWorkspaceSnapshot {
  selectedNode: KnowledgeWorkspaceSnapshot["graph"]["nodes"][number];
  activeView: KnowledgeView;
  selectNode: (nodeId: string) => void;
  switchView: (viewId: string) => void;
  startProject: (input: { mode: ProjectMode; title: string; subjectKind: SubjectKind; goal?: string }) => void;
  /** @deprecated Use startProject. */
  startSubject: (title: string, kind: AnalysisSubject["kind"]) => void;
  setContextPolicy: (policy: KnowledgeContextPolicy) => void;
  drillDown: (nodeId: string) => void;
  ask: (nodeId: string, question: string) => void;
  summarize: (nodeId: string) => void;
  acceptPatch: (patchId: string) => void;
  rejectPatch: (patchId: string) => void;
  importSource: (file: File) => Promise<IngestResult>;
  importKnowledgeItem: (input: { kind: Exclude<KnowledgeInventoryItemKind, "document">; title: string; content: string }) => Promise<IngestResult>;
  importMarkdownWikiVault: (file: File) => Promise<MarkdownWikiVaultImportResult>;
  importLegacyResearchWorkspace: (file: File) => Promise<LegacyResearchMigrationResult>;
  answerInterview: (input: InterviewAnswerInput) => void;
  proposeExploration: (targetNodeId: string) => void;
  explorerSearchProvider?: {
    id: string;
    canCapture: boolean;
    disclosure: NonNullable<KnowledgeSearchProvider["disclosure"]>;
  };
  searchExplorer: (task: ExplorerTask, filters?: ExplorerSearchFilters) => Promise<ExplorerSearchExecution>;
  captureExplorerSearchResults: (input: { task: ExplorerTask; results: readonly ExplorerSearchResult[] }) => Promise<ExplorerBatchCaptureExecution>;
  captureExplorerSource: (input: { task: ExplorerTask; title: string; url: string; content: string }) => Promise<IngestResult>;
  proposeCorrection: (input: CorrectionProposalInput) => void;
  acceptImpactReview: (taskId: string, note?: string) => void;
  rejectImpactReview: (taskId: string, note?: string) => void;
  modifyImpactReview: (taskId: string, input: ImpactReviewModificationInput) => void;
  completeProject: (acknowledgeOpenItems: boolean) => void;
  reopenProject: () => void;
}

export interface KnowledgeWorkspaceOptions {
  explorerSearchProvider?: KnowledgeSearchProvider;
}

export function useKnowledgeWorkspace(options: KnowledgeWorkspaceOptions = {}): KnowledgeWorkspaceController {
  const [snapshot, setSnapshot] = useState(() => createKnowledgeWorkspace());
  const snapshotRef = useRef(snapshot);
  const rawSourceStore = useRef(new InMemoryRawSourceStore());
  const sourceParsers = useRef<Partial<Record<KnowledgeSourceFormat, SourceParser>>>({});
  snapshotRef.current = snapshot;
  const selectedNode = useMemo(
    () => snapshot.graph.nodes.find((item) => item.id === snapshot.selectedNodeId) ?? snapshot.graph.nodes[0],
    [snapshot.graph.nodes, snapshot.selectedNodeId]
  );
  const activeView = snapshot.views.find((item) => item.id === snapshot.activeViewId) ?? snapshot.views[0];
  const configuredExplorerProvider = options.explorerSearchProvider;
  const explorerSearchProvider = configuredExplorerProvider ? {
    id: configuredExplorerProvider.id,
    canCapture: Boolean(configuredExplorerProvider.capture),
    disclosure: configuredExplorerProvider.disclosure ?? {
      privacyNotice: `${configuredExplorerProvider.id} 将收到本次查询；不会发送 Knowledge Graph 或 Context Packet。`,
      costNotice: "Provider 未声明费用策略，请在搜索前确认。",
      sends: "query_only" as const,
      pricing: "unknown" as const
    }
  } : undefined;

  return {
    ...snapshot,
    selectedNode,
    activeView,
    explorerSearchProvider,
    selectNode(nodeId) {
      setSnapshot((current) => current.graph.nodes.some((item) => item.id === nodeId)
        ? { ...current, selectedNodeId: nodeId, selection: buildKnowledgeSelection(current, nodeId) }
        : current);
    },
    switchView(viewId) {
      setSnapshot((current) => {
        const view = current.views.find((item) => item.id === viewId);
        return view
          ? { ...current, activeViewId: viewId, selectedNodeId: view.focusNodeId, selection: buildKnowledgeSelection(current, view.focusNodeId) }
          : current;
      });
    },
    startProject(input) {
      const trimmed = input.title.trim();
      if (trimmed) setSnapshot(createProjectWorkspace({ ...input, title: trimmed }));
    },
    startSubject(title, kind) {
      const trimmed = title.trim();
      if (trimmed) setSnapshot(createKnowledgeWorkspace(trimmed, kind));
    },
    setContextPolicy(policy) {
      setSnapshot((current) => ({ ...current, selection: buildKnowledgeSelection(current, current.selectedNodeId, policy) }));
    },
    drillDown(nodeId) {
      setSnapshot((current) => proposeKnowledgeDrillDown(current, nodeId));
    },
    ask(nodeId, question) {
      setSnapshot((current) => proposeKnowledgeAnswer(current, nodeId, question));
    },
    summarize(nodeId) {
      setSnapshot((current) => proposeKnowledgeSummary(current, nodeId));
    },
    acceptPatch(patchId) {
      setSnapshot((current) => acceptCandidateGraphPatch(current, patchId));
    },
    rejectPatch(patchId) {
      setSnapshot((current) => rejectCandidateGraphPatch(current, patchId));
    },
    answerInterview(input) {
      setSnapshot((current) => proposeInterviewAnswer(current, input));
    },
    proposeExploration(targetNodeId) {
      setSnapshot((current) => proposeExplorerCandidates(current, targetNodeId));
    },
    proposeCorrection(input) {
      setSnapshot((current) => proposeCorrectionPatch(current, input));
    },
    acceptImpactReview(taskId, note) {
      setSnapshot((current) => acceptImpactReviewTask(current, taskId, note));
    },
    rejectImpactReview(taskId, note) {
      setSnapshot((current) => rejectImpactReviewTask(current, taskId, note));
    },
    modifyImpactReview(taskId, input) {
      setSnapshot((current) => proposeImpactReviewTaskModification(current, taskId, input));
    },
    completeProject(acknowledgeOpenItems) {
      setSnapshot((current) => completeUnderstandProject(current, {
        completedAt: new Date().toISOString(),
        acknowledgeOpenItems
      }));
    },
    reopenProject() {
      setSnapshot((current) => reopenUnderstandProject(current, new Date().toISOString()));
    },
    async importSource(file) {
      const current = snapshotRef.current;
      const requestedAt = new Date().toISOString();
      const format = inferKnowledgeSourceFormat(file.name, file.type);
      const logicalSourceId = `upload-${sourceIdPart(file.name)}`;
      const sourceParser = await loadSourceParser(format, sourceParsers.current);
      const result = await ingestSourceIntoWorkspace({
        snapshot: current,
        request: {
          id: `ingest-${sourceIdPart(file.name)}-${Date.now()}`,
          projectId: current.project.id,
          spaceId: current.space.id,
          sourceId: logicalSourceId,
          inventoryKind: "document",
          title: file.name,
          uri: `urn:alpha-ai-graph:upload:${encodeURIComponent(file.name)}`,
          format,
          mediaType: file.type || defaultMediaType(format),
          requestedAt
        },
        content: await readFileBytes(file),
        parsers: [sourceParser],
        rawStore: rawSourceStore.current
      });
      if (result.ingest.status === "parsed") {
        snapshotRef.current = result.snapshot;
        setSnapshot(result.snapshot);
      }
      return result.ingest;
    },
    async importKnowledgeItem(input) {
      const title = input.title.trim();
      const content = input.content.trim();
      if (!title) throw new Error("知识条目标题不能为空");
      if (!content) throw new Error("知识条目内容不能为空");
      const current = snapshotRef.current;
      const requestedAt = new Date().toISOString();
      const sequence = Date.now();
      const idPart = `${input.kind}-${sourceIdPart(title)}-${sequence}`;
      const sourceParser = await loadSourceParser("markdown", sourceParsers.current);
      const result = await ingestSourceIntoWorkspace({
        snapshot: current,
        request: {
          id: `ingest-${idPart}`,
          projectId: current.project.id,
          spaceId: current.space.id,
          sourceId: idPart,
          inventoryKind: input.kind,
          title,
          uri: `urn:alpha-ai-graph:inventory:${input.kind}:${encodeURIComponent(String(sequence))}`,
          format: "markdown",
          mediaType: "text/markdown",
          requestedAt
        },
        content,
        parsers: [sourceParser],
        rawStore: rawSourceStore.current
      });
      if (result.ingest.status === "parsed") {
        snapshotRef.current = result.snapshot;
        setSnapshot(result.snapshot);
      }
      return result.ingest;
    },
    async importMarkdownWikiVault(file) {
      const current = snapshotRef.current;
      const vault = decodeMarkdownWikiVaultZip(await readFileBytes(file));
      const result = proposeMarkdownWikiVaultImport(current, vault, new Date().toISOString());
      if (result.status === "proposed") {
        snapshotRef.current = result.snapshot;
        setSnapshot(result.snapshot);
      }
      return result;
    },
    async importLegacyResearchWorkspace(file) {
      if (file.size > maxLegacyResearchImportBytes) {
        throw new Error(`旧 Research JSON 超过 ${maxLegacyResearchImportBytes / 1024 / 1024} MiB 安全上限`);
      }
      const current = snapshotRef.current;
      let serialized: string;
      try {
        serialized = new TextDecoder("utf-8", { fatal: true }).decode(await readFileBytes(file));
      } catch (error) {
        throw new Error("旧 Research 工作区必须是有效 UTF-8 JSON", { cause: error });
      }
      const { parseLegacyResearchWorkspace, proposeLegacyResearchMigration } = await import(
        "../knowledge/legacyResearchMigration"
      );
      const legacy = parseLegacyResearchWorkspace(serialized);
      const result = proposeLegacyResearchMigration(current, legacy, new Date().toISOString());
      if (result.status === "proposed") {
        snapshotRef.current = result.snapshot;
        setSnapshot(result.snapshot);
      }
      return result;
    },
    async searchExplorer(task, filters) {
      if (!configuredExplorerProvider) {
        throw new Error("尚未配置可信搜索 Provider，请使用浏览器搜索 handoff");
      }
      return await executeExplorerSearch(configuredExplorerProvider, task, {
        existingSources: snapshotRef.current.knowledgeSourceAssets,
        filters,
        maxAttempts: 2,
        timeoutMs: 12_000,
        retryDelayMs: 250
      });
    },
    async captureExplorerSearchResults(input) {
      if (!configuredExplorerProvider) throw new Error("尚未配置可信搜索 Provider");
      if (!configuredExplorerProvider.capture) throw new Error(`Explorer provider ${configuredExplorerProvider.id} 不支持页面正文抓取`);
      const parsers = await Promise.all(([
        "text",
        "markdown",
        "pdf"
      ] as const).map((format) => loadSourceParser(format, sourceParsers.current)));
      const execution = await captureExplorerSearchResultsIntoWorkspace({
        snapshot: snapshotRef.current,
        task: input.task,
        provider: configuredExplorerProvider,
        results: input.results,
        parsers,
        rawStore: rawSourceStore.current,
        requestedAt: new Date().toISOString(),
        maxAttempts: 2,
        timeoutMs: 15_000,
        retryDelayMs: 250
      });
      if (execution.snapshot !== snapshotRef.current) {
        snapshotRef.current = execution.snapshot;
        setSnapshot(execution.snapshot);
      }
      return execution;
    },
    async captureExplorerSource(input) {
      const current = snapshotRef.current;
      const sourceParser = await loadSourceParser("text", sourceParsers.current);
      const result = await ingestExplorerSourceCapture({
        snapshot: current,
        capture: {
          task: input.task,
          result: {
            title: input.title,
            url: input.url,
            providerId: "browser-handoff"
          },
          sourceContent: input.content,
          requestedAt: new Date().toISOString()
        },
        parsers: [sourceParser],
        rawStore: rawSourceStore.current
      });
      if (result.ingest.status === "parsed") {
        snapshotRef.current = result.snapshot;
        setSnapshot(result.snapshot);
      }
      return result.ingest;
    }
  };
}

const maxLegacyResearchImportBytes = 8 * 1024 * 1024;

function sourceIdPart(fileName: string): string {
  return fileName.toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64) || "document";
}

function defaultMediaType(format: "markdown" | "text" | "pdf"): string {
  if (format === "pdf") return "application/pdf";
  if (format === "markdown") return "text/markdown";
  return "text/plain";
}

async function readFileBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === "function") return new Uint8Array(await file.arrayBuffer());
  return await new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error(`Unable to read ${file.name}`));
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer)) {
        reject(new Error(`Unable to read ${file.name} as binary content`));
        return;
      }
      resolve(new Uint8Array(reader.result));
    };
    reader.readAsArrayBuffer(file);
  });
}

async function loadSourceParser(
  format: KnowledgeSourceFormat,
  cache: Partial<Record<KnowledgeSourceFormat, SourceParser>>
): Promise<SourceParser> {
  const cached = cache[format];
  if (cached) return cached;
  const parser = format === "pdf"
    ? new (await import("../knowledge/pdfJsSourceParser")).PdfJsSourceParser()
    : format === "markdown"
      ? new (await import("../knowledge/builtinSourceParsers")).BuiltinMarkdownSourceParser()
      : new (await import("../knowledge/builtinSourceParsers")).BuiltinTextSourceParser();
  cache[format] = parser;
  return parser;
}
