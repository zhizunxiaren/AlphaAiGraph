import { useMemo, useState } from "react";
import {
  acceptCandidateGraphPatch,
  buildKnowledgeSelection,
  createKnowledgeWorkspace,
  proposeKnowledgeAnswer,
  proposeKnowledgeDrillDown,
  proposeKnowledgeSummary,
  rejectCandidateGraphPatch
} from "../knowledge/knowledgeEngine";
import type { AnalysisSubject, KnowledgeContextPolicy, KnowledgeView, KnowledgeWorkspaceSnapshot } from "../types";

export interface KnowledgeWorkspaceController extends KnowledgeWorkspaceSnapshot {
  selectedNode: KnowledgeWorkspaceSnapshot["graph"]["nodes"][number];
  activeView: KnowledgeView;
  selectNode: (nodeId: string) => void;
  switchView: (viewId: string) => void;
  startSubject: (title: string, kind: AnalysisSubject["kind"]) => void;
  setContextPolicy: (policy: KnowledgeContextPolicy) => void;
  drillDown: (nodeId: string) => void;
  ask: (nodeId: string, question: string) => void;
  summarize: (nodeId: string) => void;
  acceptPatch: (patchId: string) => void;
  rejectPatch: (patchId: string) => void;
}

export function useKnowledgeWorkspace(): KnowledgeWorkspaceController {
  const [snapshot, setSnapshot] = useState(() => createKnowledgeWorkspace());
  const selectedNode = useMemo(
    () => snapshot.graph.nodes.find((item) => item.id === snapshot.selectedNodeId) ?? snapshot.graph.nodes[0],
    [snapshot.graph.nodes, snapshot.selectedNodeId]
  );
  const activeView = snapshot.views.find((item) => item.id === snapshot.activeViewId) ?? snapshot.views[0];

  return {
    ...snapshot,
    selectedNode,
    activeView,
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
    }
  };
}
