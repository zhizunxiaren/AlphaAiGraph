// @vitest-environment node
import { expect, test } from "vitest";
import realDocument from "./fixtures/real-understand-source.md?raw";
import {
  acceptCandidateGraphPatch,
  createProjectWorkspace,
  proposeKnowledgeAnswer,
  proposeKnowledgeDrillDown,
  proposeKnowledgeSummary
} from "./knowledgeEngine";
import { BuiltinMarkdownSourceParser } from "./builtinSourceParsers";
import { InMemoryRawSourceStore } from "./rawSourceStore";
import { ingestSourceIntoWorkspace, resolveSourceReference } from "./sourceIngest";
import { deserializeKnowledgeWorkspace, serializeKnowledgeWorkspace } from "./workspacePersistence";

const now = "2026-07-14T08:00:00.000Z";

test("runs a real document through first map, drill-down, Q&A, summary, provenance, review, and restore", async () => {
  const initial = createProjectWorkspace({
    mode: "understand",
    title: "AlphaAiGraph 产品文档",
    subjectKind: "document",
    goal: "从真实资料理解知识图谱与候选补丁机制"
  });
  const imported = await ingestSourceIntoWorkspace({
    snapshot: initial,
    request: {
      id: "ingest-real-document-1",
      projectId: initial.project.id,
      spaceId: initial.space.id,
      sourceId: "alpha-ai-graph-product-doc",
      title: "AlphaAiGraph 产品文档",
      uri: "https://example.com/docs/alpha-ai-graph.md",
      format: "markdown",
      mediaType: "text/markdown",
      requestedAt: now
    },
    content: realDocument,
    parsers: [new BuiltinMarkdownSourceParser()],
    rawStore: new InMemoryRawSourceStore()
  });

  expect(imported.ingest).toMatchObject({ status: "parsed", parserId: "builtin-markdown@1" });
  expect(imported.ingest.sections.length).toBeGreaterThanOrEqual(5);
  expect(imported.snapshot.knowledgeSourceAssets).toHaveLength(1);
  expect(imported.snapshot.sourceAnchors).toHaveLength(imported.ingest.sections.length);
  expect(imported.snapshot.graph.nodes).toEqual(initial.graph.nodes);
  expect(imported.snapshot.candidatePatches.at(-1)).toMatchObject({
    id: imported.patchId,
    action: "source",
    status: "pending_review"
  });

  let workspace = acceptCandidateGraphPatch(imported.snapshot, imported.patchId!);
  const sourceNodes = workspace.graph.nodes.filter((node) => node.tags.includes("来源目录"));
  expect(sourceNodes.length).toBeGreaterThanOrEqual(5);
  expect(workspace.candidatePatches.at(-1)).toMatchObject({ status: "accepted", reviewedBy: "user" });

  const locatedNode = sourceNodes.find((node) => node.title === "来源与证据")!;
  const sourceDetails = resolveSourceReference(workspace, locatedNode.sourceRefs[0]);
  expect(sourceDetails).toMatchObject({
    sourceTitle: "AlphaAiGraph 产品文档",
    locator: expect.stringMatching(/^L\d+-L\d+ · AlphaAiGraph > 来源与证据$/),
    href: "https://example.com/docs/alpha-ai-graph.md"
  });
  expect(sourceDetails?.quote).toContain("事实性知识必须关联不可变来源版本");

  const actionNode = sourceNodes.find((node) => node.title === "Candidate Graph Patch")!;
  workspace = proposeKnowledgeDrillDown(workspace, actionNode.id);
  workspace = acceptLatestPatch(workspace);
  expect(workspace.graph.edges.some((edge) => edge.fromNodeId === actionNode.id && edge.kind === "contains")).toBe(true);

  workspace = proposeKnowledgeAnswer(workspace, actionNode.id, "候选补丁为什么必须审核？");
  workspace = acceptLatestPatch(workspace);
  expect(workspace.conversations.at(-1)?.question).toBe("候选补丁为什么必须审核？");
  expect(workspace.graph.nodes.some((node) => node.kind === "question")).toBe(true);
  expect(workspace.graph.nodes.some((node) => node.kind === "synthesis" && node.title.includes("回答"))).toBe(true);

  workspace = proposeKnowledgeSummary(workspace, actionNode.id);
  workspace = acceptLatestPatch(workspace);
  expect(workspace.graph.nodes.some((node) => node.kind === "synthesis" && node.title.includes("阶段总结"))).toBe(true);
  expect(workspace.candidatePatches.every((patch) => patch.status === "accepted")).toBe(true);

  const restored = deserializeKnowledgeWorkspace(serializeKnowledgeWorkspace(workspace, now));
  expect(restored.selectedNodeId).toBe(workspace.selectedNodeId);
  expect(restored.project.subject.sourceAssetIds).toEqual([imported.ingest.source!.id]);
  expect(resolveSourceReference(restored, locatedNode.sourceRefs[0])).toEqual(sourceDetails);
});

function acceptLatestPatch(workspace: ReturnType<typeof createProjectWorkspace>) {
  const patch = workspace.candidatePatches.at(-1);
  expect(patch?.status).toBe("pending_review");
  return acceptCandidateGraphPatch(workspace, patch!.id);
}
