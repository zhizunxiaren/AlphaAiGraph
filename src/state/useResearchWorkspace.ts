import { useMemo, useState } from "react";
import { initialWorkspace, researchNow } from "../research/fixtures";
import { expandResearchNode } from "../research/researchAgent";
import { projectRelationshipGraph } from "../research/projection";
import type {
  CandidateResult,
  ConceptNote,
  InquiryContextPolicy,
  RelationshipGraph,
  ResearchMap,
  ResearchNode,
  ResearchWorkspaceSnapshot,
  SideInquirySession
} from "../types";

export type CanvasMode = "research_map" | "relationship_graph";

export interface ResearchWorkspaceState extends ResearchWorkspaceSnapshot {
  selectedNodeId: string;
  canvasMode: CanvasMode;
  isSourceDrawerOpen: boolean;
  activeEvidenceId?: string;
  warning?: string;
}

export interface ResearchWorkspaceController extends ResearchWorkspaceState {
  selectedNode?: ResearchNode;
  selectedPath: ResearchNode[];
  relationshipGraph: RelationshipGraph;
  selectNode: (nodeId: string) => void;
  drillDownNode: (nodeId: string) => void;
  duplicateNode: (nodeId: string) => string | undefined;
  switchCanvasMode: (mode: CanvasMode) => void;
  createSideInquiry: (nodeId: string, question: string, policy: InquiryContextPolicy) => void;
  promoteInquiry: (inquiryId: string) => void;
  startParallelAnalysis: (nodeIds: string[]) => void;
  mergeCandidate: (candidateId: string) => void;
  dismissCandidate: (candidateId: string) => void;
  openSourceList: () => void;
  openEvidence: (evidenceId: string) => void;
  closeSourceDrawer: () => void;
}

export function useResearchWorkspace(seed: ResearchWorkspaceSnapshot = initialWorkspace): ResearchWorkspaceController {
  const [state, setState] = useState<ResearchWorkspaceState>({
    ...seed,
    selectedNodeId: "node-workflow-map",
    canvasMode: "research_map",
    isSourceDrawerOpen: false
  });

  const selectedNode = state.map.nodes.find((item) => item.id === state.selectedNodeId);
  const selectedPath = selectedNode ? buildPath(state.map, selectedNode.id) : [];
  const relationshipGraph = useMemo(() => projectRelationshipGraph(state), [state]);

  return {
    ...state,
    selectedNode,
    selectedPath,
    relationshipGraph,
    selectNode(nodeId) {
      setState((current) => {
        const exists = current.map.nodes.some((item) => item.id === nodeId);
        return exists ? { ...current, selectedNodeId: nodeId, warning: undefined } : { ...current, warning: `找不到节点：${nodeId}` };
      });
    },
    drillDownNode(nodeId) {
      setState((current) => {
        const nextMap = expandResearchNode(current.map, nodeId);
        if (nextMap === current.map) {
          const exists = current.map.nodes.some((item) => item.id === nodeId);
          return { ...current, warning: exists ? "该节点已经展开，不会重复生成子节点。" : `找不到节点：${nodeId}` };
        }
        return {
          ...current,
          map: nextMap,
          selectedNodeId: nodeId,
          jobs: current.jobs.concat({
            id: `job-expand-${nodeId}`,
            sessionId: current.session.id,
            threadId: current.threads[0]?.id,
            mapId: current.map.id,
            nodeIds: [nodeId],
            sourceAssetIds: current.sourceAssets.map((item) => item.id),
            kind: "expand_node",
            title: `展开 ${nextMap.nodes.find((item) => item.id === nodeId)?.title ?? nodeId}`,
            status: "completed",
            priority: "normal",
            dependsOnJobIds: [],
            outputNodeIds: nextMap.nodes.filter((item) => item.parentId === nodeId).map((item) => item.id),
            outputEvidenceIds: [],
            outputRunIds: [],
            outputDigestIds: [],
            startedAt: researchNow,
            finishedAt: researchNow,
            createdAt: researchNow
          }),
          warning: undefined
        };
      });
    },
    duplicateNode(nodeId) {
      const sourceNode = state.map.nodes.find((item) => item.id === nodeId);
      if (!sourceNode) {
        setState((current) => ({ ...current, warning: `找不到节点：${nodeId}` }));
        return undefined;
      }

      const copyId = nextCopyId(state.map, nodeId);
      const copyNode: ResearchNode = {
        ...sourceNode,
        id: copyId,
        title: `${sourceNode.title} 副本`,
        order: sourceNode.order + 0.1,
        status: "new",
        expansionState: "not_expanded",
        markers: sourceNode.markers.map((marker) => ({ ...marker, id: `${copyId}-${marker.kind}` })),
        inquiryIds: [],
        conceptNoteIds: [],
        createdBy: "user",
        createdAt: researchNow,
        updatedAt: researchNow,
        provenance: { sourceNodeId: nodeId }
      };
      const copyEdge = sourceNode.parentId
        ? {
            id: `edge-${copyId}`,
            fromNodeId: sourceNode.parentId,
            toNodeId: copyId,
            kind: "relates_to" as const,
            label: "copied_from",
            confidence: 1,
            createdBy: "user" as const,
            createdAt: researchNow,
            provenance: { sourceNodeId: nodeId }
          }
        : undefined;

      setState((current) => {
        const index = current.map.nodes.findIndex((item) => item.id === nodeId);
        const nextNodes =
          index >= 0
            ? current.map.nodes.slice(0, index + 1).concat(copyNode, current.map.nodes.slice(index + 1))
            : current.map.nodes.concat(copyNode);
        return {
          ...current,
          selectedNodeId: copyId,
          map: {
            ...current.map,
            nodes: nextNodes,
            edges: copyEdge ? current.map.edges.concat(copyEdge) : current.map.edges,
            updatedAt: researchNow
          },
          warning: "已复制节点；副本进入当前研究地图，可继续移动或编辑。"
        };
      });
      return copyId;
    },
    switchCanvasMode(mode) {
      setState((current) => ({ ...current, canvasMode: mode, warning: undefined }));
    },
    createSideInquiry(nodeId, question, policy) {
      setState((current) => {
        const trimmed = question.trim();
        const sourceNode = current.map.nodes.find((item) => item.id === nodeId);
        if (!sourceNode) {
          return { ...current, warning: `找不到节点：${nodeId}` };
        }
        if (!trimmed) {
          return { ...current, warning: "旁路问题不能为空。" };
        }
        const id = `inquiry-${nodeId}-${current.sideInquiries.length + 1}`;
        const inquiry: SideInquirySession = {
          id,
          researchSessionId: current.session.id,
          sourceNodeId: nodeId,
          title: trimmed,
          triggerText: sourceNode.title,
          initialQuestion: trimmed,
          contextPolicy: policy,
          status: "open",
          messages: [
            { id: `${id}-user`, inquiryId: id, role: "user", content: trimmed, createdAt: researchNow },
            {
              id: `${id}-agent`,
              inquiryId: id,
              role: "agent",
              content: `基于 ${policy} 上下文：这是隔离旁路会话，默认不会修改主研究图。`,
              createdAt: researchNow
            }
          ],
          createdAt: researchNow,
          updatedAt: researchNow
        };
        return {
          ...current,
          sideInquiries: current.sideInquiries.concat(inquiry),
          map: {
            ...current.map,
            nodes: current.map.nodes.map((item) => (item.id === nodeId ? { ...item, inquiryIds: item.inquiryIds.concat(id) } : item))
          },
          warning: "旁路会话已创建；除 inquiry 引用外，主研究图结构未改变。"
        };
      });
    },
    promoteInquiry(inquiryId) {
      setState((current) => {
        const inquiry = current.sideInquiries.find((item) => item.id === inquiryId);
        if (!inquiry || inquiry.status === "discarded") {
          return { ...current, warning: "该旁路会话不能沉淀。" };
        }
        const note: ConceptNote = {
          id: `concept-${inquiryId}`,
          objectId: current.object.id,
          sourceInquiryId: inquiry.id,
          title: inquiry.title,
          summary: inquiry.initialQuestion,
          explanation: inquiry.messages.map((item) => item.content).join("\n"),
          relatedNodeIds: inquiry.sourceNodeId ? [inquiry.sourceNodeId] : [],
          evidenceIds: [],
          status: "accepted",
          createdAt: researchNow,
          updatedAt: researchNow
        };
        return {
          ...current,
          sideInquiries: current.sideInquiries.map((item) => (item.id === inquiryId ? { ...item, status: "promoted", updatedAt: researchNow } : item)),
          conceptNotes: current.conceptNotes.some((item) => item.id === note.id) ? current.conceptNotes : current.conceptNotes.concat(note),
          warning: "旁路会话已沉淀为 ConceptNote，并进入关系图谱投影。"
        };
      });
    },
    startParallelAnalysis(nodeIds) {
      setState((current) => {
        const scopedNodes = nodeIds.filter((nodeId) => current.map.nodes.some((item) => item.id === nodeId));
        if (scopedNodes.length === 0) {
          return { ...current, warning: "请选择至少一个有效节点启动并行研究。" };
        }
        const groupId = `group-${current.parallelGroups.length + 1}`;
        const jobId = `job-${groupId}-fanout`;
        const parentNodeId = scopedNodes[0];
        const parent = current.map.nodes.find((item) => item.id === parentNodeId)!;
        const candidateNode: ResearchNode = {
          id: `candidate-${groupId}-finding`,
          mapId: current.map.id,
          parentId: parentNodeId,
          kind: "finding",
          title: `${parent.title} 候选发现`,
          summary: "并行任务产出的候选结果，合并前不会进入主研究图。",
          depth: parent.depth + 1,
          order: 99,
          expansionState: "not_expanded",
          status: "new",
          markers: [],
          evidenceIds: parent.evidenceIds.slice(0, 1),
          actionIds: [],
          inquiryIds: [],
          conceptNoteIds: [],
          createdBy: "agent",
          createdAt: researchNow,
          updatedAt: researchNow,
          provenance: { groupId, jobId, sourceNodeId: parentNodeId }
        };
        const candidate: CandidateResult = {
          id: `candidate-${groupId}`,
          groupId,
          jobId,
          parentNodeId,
          node: candidateNode,
          edge: {
            id: `edge-${candidateNode.id}`,
            fromNodeId: parentNodeId,
            toNodeId: candidateNode.id,
            kind: "decomposes_to",
            confidence: 0.76,
            createdBy: "agent",
            createdAt: researchNow,
            provenance: candidateNode.provenance
          },
          status: current.map.nodes.some((item) => item.parentId === parentNodeId && item.title === candidateNode.title) ? "needs_review" : "pending_review",
          conflictReason: current.map.nodes.some((item) => item.parentId === parentNodeId && item.title === candidateNode.title) ? "同一父节点下已有同名节点。" : undefined,
          createdAt: researchNow
        };
        return {
          ...current,
          parallelGroups: current.parallelGroups.concat({
            id: groupId,
            sessionId: current.session.id,
            mapId: current.map.id,
            threadId: current.threads[0]?.id,
            title: "节点组并行分析",
            mode: scopedNodes.length > 1 ? "fan_out" : "evidence_sweep",
            inputNodeIds: scopedNodes,
            inputSourceAssetIds: current.sourceAssets.map((item) => item.id),
            jobIds: [jobId],
            mergePolicy: "manual_review",
            status: "ready_to_review",
            createdAt: researchNow,
            updatedAt: researchNow
          }),
          jobs: current.jobs.concat({
            id: jobId,
            sessionId: current.session.id,
            threadId: current.threads[0]?.id,
            mapId: current.map.id,
            nodeIds: scopedNodes,
            sourceAssetIds: current.sourceAssets.map((item) => item.id),
            kind: "extract_evidence",
            title: "并行候选抽取",
            status: "completed",
            priority: "normal",
            dependsOnJobIds: [],
            outputNodeIds: [candidateNode.id],
            outputEvidenceIds: [],
            outputRunIds: [],
            outputDigestIds: [],
            startedAt: researchNow,
            finishedAt: researchNow,
            createdAt: researchNow
          }),
          candidates: current.candidates.concat(candidate),
          warning: "并行研究已完成，结果进入候选区，尚未写入主图。"
        };
      });
    },
    mergeCandidate(candidateId) {
      setState((current) => {
        const candidate = current.candidates.find((item) => item.id === candidateId);
        if (!candidate) {
          return { ...current, warning: `找不到候选结果：${candidateId}` };
        }
        if (candidate.status === "needs_review") {
          return { ...current, warning: candidate.conflictReason ?? "候选结果需要复核，不能直接合并。" };
        }
        if (candidate.status !== "pending_review") {
          return { ...current, warning: "该候选结果当前不能合并。" };
        }
        const hasConflict = current.map.nodes.some((item) => item.parentId === candidate.parentNodeId && item.title === candidate.node.title);
        if (hasConflict) {
          return {
            ...current,
            candidates: current.candidates.map((item) =>
              item.id === candidateId ? { ...item, status: "needs_review", conflictReason: "同一父节点下已有同名节点。" } : item
            ),
            warning: "候选结果存在同名冲突，已转入 needs_review。"
          };
        }
        return {
          ...current,
          map: {
            ...current.map,
            nodes: current.map.nodes.concat({ ...candidate.node, status: "understood" }),
            edges: current.map.edges.concat(candidate.edge),
            updatedAt: researchNow
          },
          candidates: current.candidates.map((item) => (item.id === candidateId ? { ...item, status: "merged" } : item)),
          selectedNodeId: candidate.node.id,
          warning: "候选结果已显式合并进主研究图，并保留 provenance。"
        };
      });
    },
    dismissCandidate(candidateId) {
      setState((current) => ({
        ...current,
        candidates: current.candidates.map((item) => (item.id === candidateId ? { ...item, status: "dismissed" } : item)),
        warning: "候选结果已忽略；provenance 仍保留在候选记录中。"
      }));
    },
    openSourceList() {
      setState((current) => ({ ...current, activeEvidenceId: undefined, isSourceDrawerOpen: true, warning: undefined }));
    },
    openEvidence(evidenceId) {
      setState((current) => ({ ...current, activeEvidenceId: evidenceId, isSourceDrawerOpen: true, warning: undefined }));
    },
    closeSourceDrawer() {
      setState((current) => ({ ...current, isSourceDrawerOpen: false }));
    }
  };
}

function buildPath(map: ResearchMap, nodeId: string): ResearchNode[] {
  const byId = new Map(map.nodes.map((node) => [node.id, node]));
  const path: ResearchNode[] = [];
  let cursor = byId.get(nodeId);
  while (cursor) {
    path.unshift(cursor);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  return path;
}

function nextCopyId(map: ResearchMap, nodeId: string) {
  let index = 1;
  let candidate = `${nodeId}-copy-${index}`;
  while (map.nodes.some((node) => node.id === candidate)) {
    index += 1;
    candidate = `${nodeId}-copy-${index}`;
  }
  return candidate;
}
