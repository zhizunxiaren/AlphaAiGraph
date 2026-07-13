import { expect, test } from "vitest";
import {
  acceptCandidateGraphPatch,
  buildKnowledgeSelection,
  createKnowledgeWorkspace,
  proposeKnowledgeAnswer,
  proposeKnowledgeDrillDown,
  proposeKnowledgeSummary,
  rejectCandidateGraphPatch
} from "./knowledgeEngine";

test("uses one knowledge graph as the source for mind map, network and route views", () => {
  const workspace = createKnowledgeWorkspace("Rust async runtime");

  expect(workspace.views.map((view) => view.kind)).toEqual(["mind_map", "network", "route"]);
  expect(workspace.views.every((view) => workspace.graph.nodes.some((node) => node.id === view.rootNodeId))).toBe(true);
  expect(workspace.graph.nodes.some((node) => node.kind === "decision" && node.title === "技术路线")).toBe(true);
});

test("proposes a drill-down patch before writing to the graph", () => {
  const workspace = createKnowledgeWorkspace();
  const target = workspace.graph.nodes.find((node) => node.title === "核心原理")!;
  const proposed = proposeKnowledgeDrillDown(workspace, target.id);
  const patch = proposed.candidatePatches[0];
  const accepted = acceptCandidateGraphPatch(proposed, patch.id);
  const repeated = proposeKnowledgeDrillDown(accepted, target.id);

  expect(proposed.graph.nodes).toHaveLength(workspace.graph.nodes.length);
  expect(patch.operations.filter((operation) => operation.kind === "create_node")).toHaveLength(3);
  expect(accepted.graph.nodes.filter((node) => node.tags.includes("核心原理"))).toHaveLength(3);
  expect(accepted.candidatePatches[0].status).toBe("accepted");
  expect(repeated).toBe(accepted);
});

test("persists questions, answers and summaries only after explicit acceptance", () => {
  const workspace = createKnowledgeWorkspace();
  const target = workspace.graph.nodes.find((node) => node.title === "系统结构")!;
  const asked = proposeKnowledgeAnswer(workspace, target.id, "它依赖哪些接口？");
  const acceptedAnswer = acceptCandidateGraphPatch(asked, asked.candidatePatches[0].id);
  const summarized = proposeKnowledgeSummary(acceptedAnswer, target.id);
  const acceptedSummary = acceptCandidateGraphPatch(summarized, summarized.candidatePatches.at(-1)!.id);

  expect(asked.conversations).toHaveLength(0);
  expect(asked.graph.nodes.some((node) => node.kind === "question")).toBe(false);
  expect(acceptedAnswer.conversations).toHaveLength(1);
  expect(acceptedAnswer.graph.nodes.some((node) => node.kind === "question")).toBe(true);
  expect(acceptedSummary.graph.edges.some((edge) => edge.kind === "summarizes" && edge.toNodeId === target.id)).toBe(true);
});

test("rejects a candidate patch without mutating the knowledge graph", () => {
  const workspace = createKnowledgeWorkspace();
  const target = workspace.graph.nodes.find((node) => node.title === "核心原理")!;
  const proposed = proposeKnowledgeSummary(workspace, target.id);
  const rejected = rejectCandidateGraphPatch(proposed, proposed.candidatePatches[0].id);

  expect(rejected.graph).toBe(workspace.graph);
  expect(rejected.candidatePatches[0].status).toBe("rejected");
  expect(rejected.agentRequests[0].status).toBe("rejected");
});

test("builds an explicit context packet from the selected node and scope", () => {
  const workspace = createKnowledgeWorkspace();
  const rootSelection = buildKnowledgeSelection(workspace, workspace.subject.rootNodeId, "selected_and_neighbors");
  const localSelection = buildKnowledgeSelection(workspace, workspace.subject.rootNodeId, "selected_node");

  expect(rootSelection.nodeIds.length).toBeGreaterThan(1);
  expect(rootSelection.depth).toBe(1);
  expect(localSelection.nodeIds).toEqual([workspace.subject.rootNodeId]);
});
