import { useMemo, useState } from "react";
import { researchFixtures } from "../research/fixtures";
import { researchNow } from "../research/constants";
import { expandResearchNode } from "../research/researchAgent";
import type {
  AgentJobStatus,
  CandidateResearchNode,
  InquiryContextPolicy,
  KnowledgeAppState,
  ResearchNodeStatus,
} from "../types";

export function createInitialKnowledgeState(): KnowledgeAppState {
  return {
    researchObject: researchFixtures.object,
    researchSession: researchFixtures.session,
    researchThread: researchFixtures.thread,
    researchMap: researchFixtures.map,
    sourceAssets: researchFixtures.sourceAssets,
    markers: researchFixtures.markers,
    evidenceAnchors: researchFixtures.evidenceAnchors,
    actions: researchFixtures.actions,
    jobs: researchFixtures.jobs,
    parallelGroups: researchFixtures.parallelGroups,
    candidateNodes: researchFixtures.candidateNodes,
    executionRuns: researchFixtures.executionRuns,
    sideInquiries: researchFixtures.sideInquiries,
    inquiryMessages: researchFixtures.inquiryMessages,
    conceptNotes: researchFixtures.conceptNotes,
    knowledgeDigests: researchFixtures.knowledgeDigests,
    selectedNodeId: researchFixtures.map.rootNodeId,
    canvasMode: "research_map",
    warnings: [],
  };
}

export function useKnowledgeApp() {
  const [state, setState] = useState(createInitialKnowledgeState);
  return useMemo(
    () => ({
      state,
      selectNode: (nodeId: string) => setState((current) => ({ ...current, selectedNodeId: nodeId })),
      setCanvasMode: (canvasMode: KnowledgeAppState["canvasMode"]) =>
        setState((current) => ({ ...current, canvasMode })),
      drillDown: (nodeId: string) => setState((current) => drillDownNode(current, nodeId)),
      createInquiry: (nodeId: string, question: string, policy: InquiryContextPolicy) =>
        setState((current) => createSideInquiry(current, nodeId, question, policy)),
      mergeCandidate: (candidateId: string) =>
        setState((current) => mergeCandidateNode(current, candidateId)),
    }),
    [state],
  );
}

export function drillDownNode(state: KnowledgeAppState, nodeId: string): KnowledgeAppState {
  const before = state.researchMap;
  const after = expandResearchNode(before, nodeId);
  if (after === before && !before.nodes.some((node) => node.id === nodeId)) {
    return { ...state, warnings: [...state.warnings, `Cannot drill down missing node ${nodeId}`] };
  }
  return { ...state, researchMap: after, selectedNodeId: nodeId };
}

export function markResearchNode(
  state: KnowledgeAppState,
  nodeId: string,
  status: ResearchNodeStatus,
): KnowledgeAppState {
  return {
    ...state,
    researchMap: {
      ...state.researchMap,
      nodes: state.researchMap.nodes.map((node) =>
        node.id === nodeId ? { ...node, status, updatedAt: researchNow } : node,
      ),
    },
  };
}

export function createSideInquiry(
  state: KnowledgeAppState,
  nodeId: string,
  question: string,
  contextPolicy: InquiryContextPolicy,
): KnowledgeAppState {
  if (!state.researchMap.nodes.some((node) => node.id === nodeId)) {
    return { ...state, warnings: [...state.warnings, `Cannot create side inquiry for missing node ${nodeId}`] };
  }
  if (!question.trim()) {
    return { ...state, warnings: [...state.warnings, "Side inquiry question is empty"] };
  }
  const suffix = state.sideInquiries.length + 1;
  const inquiryId = `side-inquiry-${suffix}`;
  const userMessageId = `${inquiryId}-user`;
  const agentMessageId = `${inquiryId}-agent`;
  return {
    ...state,
    sideInquiries: [
      ...state.sideInquiries,
      {
        id: inquiryId,
        nodeId,
        status: "open",
        contextPolicy,
        question,
        messageIds: [userMessageId, agentMessageId],
        createdAt: researchNow,
        updatedAt: researchNow,
      },
    ],
    inquiryMessages: [
      ...state.inquiryMessages,
      { id: userMessageId, inquiryId, role: "user", content: question, createdAt: researchNow },
      {
        id: agentMessageId,
        inquiryId,
        role: "agent",
        content: `context_policy=${contextPolicy}; 这是隔离旁路解释，默认不修改主研究图。`,
        createdAt: researchNow,
      },
    ],
  };
}

export function promoteSideInquiry(state: KnowledgeAppState, inquiryId: string): KnowledgeAppState {
  const inquiry = state.sideInquiries.find((item) => item.id === inquiryId);
  if (!inquiry || !["open", "resolved"].includes(inquiry.status)) {
    return { ...state, warnings: [...state.warnings, `Cannot promote inquiry ${inquiryId}`] };
  }
  const noteId = `concept-note-${state.conceptNotes.length + 1}`;
  return {
    ...state,
    sideInquiries: state.sideInquiries.map((item) =>
      item.id === inquiryId ? { ...item, status: "promoted", updatedAt: researchNow } : item,
    ),
    conceptNotes: [
      ...state.conceptNotes,
      {
        id: noteId,
        title: inquiry.question,
        body: `从旁路会话沉淀：${inquiry.question}`,
        sourceInquiryId: inquiry.id,
        relatedNodeIds: [inquiry.nodeId],
        createdAt: researchNow,
        updatedAt: researchNow,
      },
    ],
  };
}

export function startParallelAnalysis(
  state: KnowledgeAppState,
  nodeIds: string[],
  options: { candidateTitle?: string } = {},
): KnowledgeAppState {
  const scopedNodeIds = nodeIds.length > 0 ? nodeIds : [state.researchMap.rootNodeId];
  const existingNodeIds = new Set(state.researchMap.nodes.map((node) => node.id));
  const missingNodeIds = scopedNodeIds.filter((nodeId) => !existingNodeIds.has(nodeId));
  if (missingNodeIds.length > 0) {
    return {
      ...state,
      warnings: [...state.warnings, `Cannot start parallel analysis for missing node ${missingNodeIds.join(", ")}`],
    };
  }
  const suffix = state.parallelGroups.length + 1;
  const groupId = `parallel-group-${suffix}`;
  const firstScope = scopedNodeIds[0];
  const parent = state.researchMap.nodes.find((node) => node.id === firstScope);
  const title = options.candidateTitle ?? `候选发现 ${suffix}`;
  const jobIds = [`${groupId}-job-a`, `${groupId}-job-b`];
  const candidateId = `${groupId}-candidate-node`;
  const conflict = Boolean(
    parent &&
      state.researchMap.nodes.some(
        (node) => node.parentNodeId === parent.id && node.title === title,
      ),
  );
  const candidate: CandidateResearchNode = {
    id: candidateId,
    groupId,
    jobId: jobIds[0],
    status: conflict ? "needs_review" : "pending_review",
    conflictReason: conflict ? "same title under same parent" : undefined,
    node: {
      id: `${groupId}-node`,
      mapId: state.researchMap.id,
      parentNodeId: parent?.id,
      kind: "finding",
      title,
      summary: "并行研究产出的候选节点，合并前不进入主图。",
      depth: (parent?.depth ?? 0) + 1,
      status: "under_review",
      expansionState: "leaf",
      markerIds: [],
      evidenceIds: [],
      actionIds: [],
      createdAt: researchNow,
      updatedAt: researchNow,
      provenance: { groupId, jobId: jobIds[0], candidateId, sourceNodeIds: scopedNodeIds },
    },
  };
  return {
    ...state,
    parallelGroups: [
      ...state.parallelGroups,
      {
        id: groupId,
        mode: scopedNodeIds.length > 1 ? "fan_out" : "sweep",
        mergePolicy: "manual_review",
        status: "queued",
        nodeIds: scopedNodeIds,
        jobIds,
        candidateNodeIds: [candidateId],
        createdAt: researchNow,
        updatedAt: researchNow,
      },
    ],
    jobs: [
      ...state.jobs,
      ...jobIds.map((jobId, index) => ({
        id: jobId,
        kind: "parallel_extraction" as const,
        status: "queued" as const,
        title: `并行研究任务 ${index + 1}`,
        nodeIds: [scopedNodeIds[index] ?? firstScope],
        sourceAssetIds: state.sourceAssets.map((source) => source.id),
        outputIds: [candidateId],
        groupId,
        createdAt: researchNow,
        updatedAt: researchNow,
      })),
    ],
    candidateNodes: [...state.candidateNodes, candidate],
  };
}

export function mergeCandidateNode(state: KnowledgeAppState, candidateId: string): KnowledgeAppState {
  const candidate = state.candidateNodes.find((item) => item.id === candidateId);
  if (!candidate || candidate.status !== "pending_review") {
    return { ...state, warnings: [...state.warnings, `Candidate ${candidateId} requires review`] };
  }
  if (!candidate.node.parentNodeId) {
    return { ...state, warnings: [...state.warnings, `Candidate ${candidateId} has no parent node`] };
  }
  const conflictReason = candidateMergeConflictReason(state, candidate);
  if (conflictReason) {
    return {
      ...state,
      candidateNodes: state.candidateNodes.map((item) =>
        item.id === candidateId ? { ...item, status: "needs_review", conflictReason } : item,
      ),
      warnings: [...state.warnings, `Candidate ${candidateId} requires review: ${conflictReason}`],
    };
  }
  return {
    ...state,
    researchMap: {
      ...state.researchMap,
      nodes: [...state.researchMap.nodes, candidate.node],
      edges: [
        ...state.researchMap.edges,
        {
          id: `${candidate.id}-edge`,
          mapId: state.researchMap.id,
          fromNodeId: candidate.node.parentNodeId,
          toNodeId: candidate.node.id,
          kind: "contains",
          confidence: 0.82,
          createdAt: researchNow,
          provenance: candidate.node.provenance,
        },
      ],
    },
    candidateNodes: state.candidateNodes.map((item) =>
      item.id === candidateId ? { ...item, status: "merged" } : item,
    ),
  };
}

function candidateMergeConflictReason(
  state: KnowledgeAppState,
  candidate: CandidateResearchNode,
): string | undefined {
  const nodeIdExists = state.researchMap.nodes.some((node) => node.id === candidate.node.id);
  if (nodeIdExists) {
    return "node id already exists";
  }
  const sameTitleSibling = state.researchMap.nodes.some(
    (node) =>
      node.parentNodeId === candidate.node.parentNodeId &&
      node.title === candidate.node.title,
  );
  if (sameTitleSibling) {
    return "same title under same parent";
  }
  const duplicateEdge = state.researchMap.edges.some(
    (edge) =>
      edge.fromNodeId === candidate.node.parentNodeId &&
      edge.toNodeId === candidate.node.id &&
      edge.kind === "contains",
  );
  if (duplicateEdge) {
    return "candidate edge already exists";
  }
  return undefined;
}

export function transitionAgentJob(
  state: KnowledgeAppState,
  jobId: string,
  status: AgentJobStatus,
): KnowledgeAppState {
  return {
    ...state,
    jobs: state.jobs.map((job) =>
      job.id === jobId ? { ...job, status, updatedAt: researchNow } : job,
    ),
  };
}
