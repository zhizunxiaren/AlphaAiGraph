import { expect, test } from "vitest";
import {
  acceptCandidateGraphPatch,
  buildKnowledgeSelection,
  createKnowledgeWorkspace,
  createProjectWorkspace,
  createResearchRouteWorkspace,
  deriveProjectFromNode,
  proposeKnowledgeAnswer,
  proposeKnowledgeDrillDown,
  proposeKnowledgeSummary,
  rejectCandidateGraphPatch
} from "./knowledgeEngine";

test("uses one knowledge graph without forcing a route into an Understand Project", () => {
  const workspace = createKnowledgeWorkspace("Rust async runtime");

  expect(workspace.project.mode).toBe("understand");
  expect(workspace.subject).toBe(workspace.project.subject);
  expect(workspace.views.map((view) => view.kind)).toEqual(["mind_map", "network"]);
  expect(workspace.views.every((view) => workspace.graph.nodes.some((node) => node.id === view.rootNodeId))).toBe(true);
  expect(workspace.graph.nodes.some((node) => node.kind === "decision" && node.title === "技术路线")).toBe(false);
});

test("creates mode-specific workflows independently from subject kind", () => {
  const understand = createProjectWorkspace({ mode: "understand", title: "RFC 9457", subjectKind: "document" });
  const systematize = createProjectWorkspace({ mode: "systematize", title: "Rust 工程经验", subjectKind: "topic" });
  const research = createProjectWorkspace({ mode: "research", title: "WebGPU 是否值得采用", subjectKind: "question" });

  expect(understand.project.workflow).toEqual({ mode: "understand", phase: "mapping" });
  expect(systematize.project.workflow).toEqual({ mode: "systematize", phase: "inventory" });
  expect(research.project.workflow).toEqual({ mode: "research", phase: "brief" });
  expect(understand.project.subject.kind).toBe("document");
  expect(systematize.graph.nodes.some((node) => node.title === "知识清单")).toBe(true);
  expect(systematize.graph.nodes.find((node) => node.title === "冲突与疑点")?.kind).toBe("uncertainty");
  expect(systematize.views.map((view) => view.kind)).toEqual([
    "mind_map",
    "network",
    "knowledge_modules",
    "skill_tree",
    "learning_dependencies",
    "learning_path",
    "practice_manual"
  ]);
  expect(research.graph.nodes.some((node) => node.title === "核心研究问题")).toBe(true);
  expect(research.graph.nodes.find((node) => node.title === "初始假设")?.kind).toBe("hypothesis");
});

test("only exposes a route view for a Research Project with a route subgraph", () => {
  const research = createProjectWorkspace({ mode: "research", title: "技术选型", subjectKind: "question" });
  const withRoute = createResearchRouteWorkspace("技术选型");

  expect(research.views.map((view) => view.kind)).toEqual(["mind_map", "network"]);
  expect(withRoute.views.map((view) => view.kind)).toEqual(["mind_map", "network", "route"]);
  expect(withRoute.graph.nodes.some((node) => node.title === "方案 A：渐进接入")).toBe(true);
});

test("derives another Project from a node without copying the knowledge graph", () => {
  const workspace = createKnowledgeWorkspace("Rust async runtime");
  const focus = workspace.graph.nodes.find((node) => node.title === "约束与风险")!;
  const derived = deriveProjectFromNode(workspace, { mode: "research", nodeId: focus.id, title: "验证 Rust async 风险" });

  expect(derived.graph).toBe(workspace.graph);
  expect(derived.project.mode).toBe("research");
  expect(derived.project.graphId).toBe(workspace.project.graphId);
  expect(derived.project.subject.rootNodeId).toBe(focus.id);
  expect(derived.projects).toHaveLength(2);
  expect(derived.space.projectIds).toEqual([workspace.project.id, derived.project.id]);
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
  const rootSelection = buildKnowledgeSelection(workspace, workspace.project.subject.rootNodeId, "selected_and_neighbors");
  const localSelection = buildKnowledgeSelection(workspace, workspace.project.subject.rootNodeId, "selected_node");

  expect(rootSelection.nodeIds.length).toBeGreaterThan(1);
  expect(rootSelection.depth).toBe(1);
  expect(localSelection.nodeIds).toEqual([workspace.project.subject.rootNodeId]);
});
