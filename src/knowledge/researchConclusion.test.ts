// @vitest-environment node
import { describe, expect, test } from "vitest";
import type {
  KnowledgeEdge,
  KnowledgeNode,
  KnowledgeSourceAsset,
  KnowledgeWorkspaceSnapshot,
  ResearchOrchestration,
  SourceAnchor
} from "../types";
import { acceptCandidateGraphPatch, createProjectWorkspace, knowledgeNow, rejectCandidateGraphPatch } from "./knowledgeEngine";
import { createKnowledgeMetadata } from "./knowledgeMetadata";
import { assertResearchOrchestration, validateResearchOrchestration } from "./researchOrchestration";
import { completeResearchRound, captureResearchRoundBaseline } from "./researchRound";
import { proposeResearchConclusion } from "./researchConclusion";
import { runResearchVerificationMatrix } from "./researchVerification";
import { assertKnowledgeProvenance } from "./provenance";
import { deserializeKnowledgeWorkspace, serializeKnowledgeWorkspace } from "./workspacePersistence";

describe("trustworthy Research conclusion subgraph", () => {
  test("proposes a reviewable fact → inference → synthesis → conclusion chain without writing the graph", () => {
    const verified = verifiedWorkspace();
    const beforeNodeIds = verified.graph.nodes.map((node) => node.id);
    const proposed = propose(verified);
    const patch = proposed.candidatePatches.at(-1)!;

    expect(proposed.graph.nodes.map((node) => node.id)).toEqual(beforeNodeIds);
    expect(patch).toMatchObject({
      action: "conclude",
      targetNodeId: "research-target",
      focusNodeId: "research-conclusion",
      confidence: 0.82,
      status: "pending_review"
    });
    expect(patch.operations.filter((operation) => operation.kind === "create_node")).toHaveLength(3);
    expect(patch.operations.filter((operation) => operation.kind === "create_edge")).toHaveLength(5);
  });

  test("accepts and persists a reliable conclusion result backed by the canonical graph", () => {
    const proposed = propose(verifiedWorkspace());
    const patch = proposed.candidatePatches.at(-1)!;
    const accepted = acceptCandidateGraphPatch(proposed, patch.id);
    const result = accepted.researchOrchestration.rounds[0].result;

    expect(accepted.project.workflow).toEqual({ mode: "research", phase: "synthesizing" });
    expect(result).toMatchObject({
      kind: "reliable_conclusion",
      acceptedPatchId: patch.id,
      verificationTargetNodeId: "research-target",
      factNodeIds: ["research-fact"],
      inferenceNodeIds: ["research-inference"],
      synthesisNodeId: "research-synthesis",
      conclusionNodeId: "research-conclusion",
      unresolvedQuestionNodeIds: ["research-unresolved"],
      confidence: 0.82,
      scope: {
        kind: "project",
        description: "适用于当前公开资料、全球范围和百分比口径。",
        contextIds: [accepted.project.id]
      }
    });
    expect(accepted.graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ fromNodeId: "research-inference", toNodeId: "research-fact", kind: "derived_from" }),
      expect.objectContaining({ fromNodeId: "research-synthesis", toNodeId: "research-inference", kind: "derived_from" }),
      expect.objectContaining({ fromNodeId: "research-conclusion", toNodeId: "research-synthesis", kind: "derived_from" }),
      expect.objectContaining({ fromNodeId: "research-conclusion", toNodeId: "research-unresolved", kind: "depends_on" })
    ]));
    expect(validateResearchOrchestration(accepted)).toEqual([]);
    expect(() => assertKnowledgeProvenance(accepted.graph, {
      sources: accepted.knowledgeSourceAssets,
      anchors: accepted.sourceAnchors
    })).not.toThrow();

    const completed = completeResearchRound(accepted, {
      roundId: "research-round",
      completedAt: knowledgeNow,
      nextQuestionNodeIds: ["research-unresolved"]
    });
    expect(completed.researchOrchestration.rounds[0]).toMatchObject({
      status: "completed",
      outcome: "advanced",
      result: { kind: "reliable_conclusion", conclusionNodeId: "research-conclusion" },
      outputs: {
        inferenceNodeIds: ["research-inference"],
        synthesisNodeIds: ["research-synthesis", "research-conclusion"]
      }
    });
    const restored = deserializeKnowledgeWorkspace(serializeKnowledgeWorkspace(completed, knowledgeNow));
    expect(restored.researchOrchestration.rounds[0].result).toEqual(completed.researchOrchestration.rounds[0].result);
  });

  test("rejection leaves the graph and Research round result unchanged", () => {
    const proposed = propose(verifiedWorkspace());
    const patch = proposed.candidatePatches.at(-1)!;
    const rejected = rejectCandidateGraphPatch(proposed, patch.id);

    expect(rejected.graph.nodes.some((node) => node.id === "research-conclusion")).toBe(false);
    expect(rejected.researchOrchestration.rounds[0].result).toBeUndefined();
    expect(rejected.candidatePatches.at(-1)?.status).toBe("rejected");
  });

  test("requires a passed matrix, verified Facts, and genuinely unresolved questions", () => {
    const blocked = verifiedWorkspace();
    blocked.researchOrchestration.verificationRecords[0].status = "inconclusive";
    expect(() => propose(blocked)).toThrow("requires a passed verification matrix");

    const unreliableFact = verifiedWorkspace();
    unreliableFact.graph.nodes.find((node) => node.id === "research-fact")!.status = "open";
    expect(() => propose(unreliableFact)).toThrow("requires a verified, sourced Project Fact");

    const resolvedQuestion = verifiedWorkspace();
    resolvedQuestion.graph.nodes.find((node) => node.id === "research-unresolved")!.status = "understood";
    expect(() => propose(resolvedQuestion)).toThrow("unavailable or resolved");
  });

  test("rejects a forged conclusion Patch or persisted result", () => {
    const proposed = propose(verifiedWorkspace());
    const patch = proposed.candidatePatches.at(-1)!;
    const conclusionOperation = patch.operations.find((operation) =>
      operation.kind === "create_node" && operation.node.kind === "conclusion");
    if (conclusionOperation?.kind !== "create_node") throw new Error("fixture conclusion operation missing");
    conclusionOperation.node.confidence = 0.2;
    expect(() => acceptCandidateGraphPatch(proposed, patch.id)).toThrow("focus and confidence must match");

    const accepted = acceptCandidateGraphPatch(propose(verifiedWorkspace()), "graph-patch-1");
    if (accepted.researchOrchestration.rounds[0].result?.kind !== "reliable_conclusion") {
      throw new Error("fixture reliable result missing");
    }
    accepted.researchOrchestration.rounds[0].result.inferenceNodeIds = [];
    expect(validateResearchOrchestration(accepted)).toContain(
      "round research-round reliable conclusion Patch nodes does not match canonical state (missing: none; unexpected: research-inference)"
    );
  });
});

function propose(snapshot: KnowledgeWorkspaceSnapshot): KnowledgeWorkspaceSnapshot {
  return proposeResearchConclusion(snapshot, {
    roundId: "research-round",
    verificationTargetNodeId: "research-target",
    inferenceDrafts: [{
      id: "research-inference",
      title: "由可追溯事实形成推断",
      summary: "在既定范围和口径下，事实支持目标判断。",
      factNodeIds: ["research-fact"],
      confidence: 0.86
    }],
    synthesis: {
      id: "research-synthesis",
      title: "本轮证据综合",
      summary: "综合事实、推断以及已通过的验证矩阵。",
      confidence: 0.84
    },
    conclusion: {
      id: "research-conclusion",
      title: "可信研究结论",
      summary: "当前证据在声明范围内支持该结论，同时保留尚未解决的问题。",
      confidence: 0.82
    },
    scopeDescription: "适用于当前公开资料、全球范围和百分比口径。",
    unresolvedQuestionNodeIds: ["research-unresolved"],
    createdAt: knowledgeNow
  });
}

function verifiedWorkspace(): KnowledgeWorkspaceSnapshot {
  const workspace = createProjectWorkspace({
    mode: "research",
    title: "Reliable conclusion fixture",
    subjectKind: "question"
  });
  const projectId = workspace.project.id;
  const question = workspace.graph.nodes.find((node) => node.kind === "question")!;
  const sources: KnowledgeSourceAsset[] = [
    source("source-primary", "logical-primary", "primary", "hash-primary", workspace.space.id),
    source("source-official", "logical-official", "official", "hash-official", workspace.space.id)
  ];
  const anchors: SourceAnchor[] = [
    anchor("anchor-primary", "source-primary", "hash-primary", "Primary fact and supporting evidence."),
    anchor("anchor-official", "source-official", "hash-official", "Official opposing evidence.")
  ];
  const fact = sourcedNode(workspace, "research-fact", "fact", "可追溯事实", sources[0], anchors[0]);
  const target = node(workspace, "research-target", "claim", "待验证目标判断");
  const supporting = sourcedNode(workspace, "research-support", "evidence", "支持证据", sources[0], anchors[0]);
  const opposing = sourcedNode(workspace, "research-opposition", "evidence", "反对证据", sources[1], anchors[1]);
  const alternative = node(workspace, "research-alternative", "hypothesis", "替代解释");
  const unresolved = node(workspace, "research-unresolved", "question", "仍待解决的问题");
  const edges: KnowledgeEdge[] = [
    edge("support-target", supporting.id, target.id, "supports"),
    edge("oppose-target", opposing.id, target.id, "contradicts"),
    edge("alternative-target", alternative.id, target.id, "related_to")
  ];
  const graph = {
    ...workspace.graph,
    nodes: workspace.graph.nodes.concat(fact, target, supporting, opposing, alternative, unresolved),
    edges: workspace.graph.edges.concat(edges)
  };
  const orchestration: ResearchOrchestration = {
    briefs: [{
      id: "research-brief",
      projectId,
      primaryQuestionNodeId: question.id,
      secondaryQuestionNodeIds: [],
      objective: "形成可信结论子图。",
      scope: {
        description: "当前公开资料。",
        time: { asOf: knowledgeNow },
        geographies: ["global"],
        units: ["percent"],
        inclusionCriteria: ["可追溯来源"],
        exclusionCriteria: []
      },
      successCriteria: ["验证矩阵通过"],
      seedSourceIds: sources.map((item) => item.id),
      status: "ready",
      revision: 1,
      createdBy: "user",
      createdAt: knowledgeNow,
      updatedAt: knowledgeNow
    }],
    plans: [{
      id: "research-plan",
      projectId,
      briefId: "research-brief",
      strategy: "核验后形成结论链。",
      taskIds: [],
      verificationRequirements: ["independent_sources", "primary_source_traceability", "inference_scope"],
      status: "active",
      revision: 1,
      createdBy: "agent",
      createdAt: knowledgeNow,
      updatedAt: knowledgeNow
    }],
    tasks: [],
    rounds: [],
    searchQueries: [],
    verificationRecords: []
  };
  let snapshot: KnowledgeWorkspaceSnapshot = {
    ...workspace,
    graph,
    knowledgeSourceAssets: sources,
    sourceAnchors: anchors,
    researchOrchestration: orchestration
  };
  snapshot.researchOrchestration.rounds.push({
    id: "research-round",
    projectId,
    planId: "research-plan",
    roundNumber: 1,
    objective: "验证并形成可信结论。",
    taskIds: [],
    status: "active",
    baseline: captureResearchRoundBaseline(snapshot, knowledgeNow),
    outputs: emptyOutputs(),
    nextQuestionNodeIds: [],
    startedAt: knowledgeNow,
    createdAt: knowledgeNow,
    updatedAt: knowledgeNow
  });
  snapshot = runResearchVerificationMatrix(snapshot, {
    roundId: "research-round",
    targetNodeId: target.id,
    evidenceProfiles: [supporting, opposing].map((evidence) => ({
      evidenceNodeId: evidence.id,
      geographies: ["global"],
      unit: "percent",
      methodology: "controlled comparison",
      conflictOfInterestStatus: "none_declared"
    })),
    alternativeExplanationNodeIds: [alternative.id],
    checkedAt: knowledgeNow
  }).snapshot;
  assertResearchOrchestration(snapshot);
  return snapshot;
}

function node(
  snapshot: KnowledgeWorkspaceSnapshot,
  id: string,
  kind: KnowledgeNode["kind"],
  title: string
): KnowledgeNode {
  return {
    id,
    kind,
    title,
    summary: `${title}的内容。`,
    status: "open",
    ...createKnowledgeMetadata({ kind, createdBy: "agent", creatorId: "research-conclusion-test", scopeContextId: snapshot.project.id }),
    temporalValidity: { status: "current", observedAt: knowledgeNow },
    depth: 1,
    tags: [],
    sourceRefs: [],
    createdBy: "agent",
    creatorId: "research-conclusion-test",
    createdAt: knowledgeNow,
    updatedAt: knowledgeNow
  };
}

function sourcedNode(
  snapshot: KnowledgeWorkspaceSnapshot,
  id: string,
  kind: "fact" | "evidence",
  title: string,
  sourceAsset: KnowledgeSourceAsset,
  sourceAnchor: SourceAnchor
): KnowledgeNode {
  return {
    ...node(snapshot, id, kind, title),
    status: "verified",
    epistemicStatus: "supported",
    sourceStatus: "verified",
    sourceRefs: [{
      sourceId: sourceAsset.id,
      anchorId: sourceAnchor.id,
      locator: "L1",
      quote: sourceAnchor.quote
    }]
  };
}

function source(
  id: string,
  logicalSourceId: string,
  researchSourceKind: "primary" | "official",
  contentHash: string,
  spaceId: string
): KnowledgeSourceAsset {
  return {
    id,
    logicalSourceId,
    version: 1,
    spaceId,
    format: "text",
    title: id,
    uri: `https://example.com/${id}`,
    researchSourceKind,
    contentHash,
    byteLength: 64,
    immutable: true,
    createdAt: knowledgeNow
  };
}

function anchor(id: string, sourceId: string, contentHash: string, quote: string): SourceAnchor {
  return { id, sourceId, locator: { kind: "text", lineStart: 1 }, quote, contentHash };
}

function edge(id: string, fromNodeId: string, toNodeId: string, kind: KnowledgeEdge["kind"]): KnowledgeEdge {
  return {
    id,
    fromNodeId,
    toNodeId,
    kind,
    rationale: "Research conclusion fixture relation.",
    createdBy: "agent",
    confidence: 0.9,
    createdAt: knowledgeNow
  };
}

function emptyOutputs() {
  return {
    sourceIds: [],
    factNodeIds: [],
    claimNodeIds: [],
    hypothesisNodeIds: [],
    inferenceNodeIds: [],
    evidenceNodeIds: [],
    conflictNodeIds: [],
    gapNodeIds: [],
    synthesisNodeIds: [],
    edgeIds: [],
    verificationRecordIds: []
  };
}
