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
import {
  acceptCandidateGraphPatch,
  createProjectWorkspace,
  knowledgeNow,
  proposeKnowledgeDrillDown,
  rejectCandidateGraphPatch
} from "./knowledgeEngine";
import { createKnowledgeMetadata } from "./knowledgeMetadata";
import { captureResearchRoundBaseline, completeResearchRound } from "./researchRound";
import { proposeResearchConclusion } from "./researchConclusion";
import {
  proposeResearchRoute,
  validateAcceptedResearchRoutePatches
} from "./researchRoute";
import {
  proposeResearchRouteScenarios,
  validateAcceptedResearchRouteScenarioPatches
} from "./researchRouteScenario";
import { assertNoIndependentResearchReportData, projectResearchResults } from "./researchResults";
import { runResearchVerificationMatrix } from "./researchVerification";
import { assertKnowledgeProvenance } from "./provenance";
import { deserializeKnowledgeWorkspace, serializeKnowledgeWorkspace } from "./workspacePersistence";

describe("Research technical route subgraph", () => {
  test("proposes goal, constraints, criteria, options, Evidence, decision, and ordered steps without writing the graph", () => {
    const base = acceptedConclusionWorkspace();
    const beforeNodeIds = base.graph.nodes.map((node) => node.id);
    const proposed = proposeRoute(base);
    const patch = proposed.candidatePatches.at(-1)!;

    expect(proposed.graph.nodes.map((node) => node.id)).toEqual(beforeNodeIds);
    expect(patch).toMatchObject({
      action: "route",
      targetNodeId: "research-conclusion",
      focusNodeId: "route-decision",
      status: "pending_review",
      confidence: 0.81
    });
    const createdKinds = patch.operations.flatMap((operation) =>
      operation.kind === "create_node" ? [operation.node.kind] : []);
    expect(createdKinds).toEqual([
      "goal", "constraint", "criterion", "route_option", "route_option", "decision", "route_step", "route_step"
    ]);
    expect(patch.operations.some((operation) => operation.kind === "create_edge"
      && operation.edge.kind === "supports" && operation.edge.toNodeId === "route-option-a")).toBe(true);
  });

  test("accepts and persists the technical route in the shared KnowledgeGraph", () => {
    const proposed = proposeRoute(acceptedConclusionWorkspace());
    const patch = proposed.candidatePatches.at(-1)!;
    const accepted = acceptCandidateGraphPatch(proposed, patch.id);

    expect(accepted.graph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "route-goal", kind: "goal" }),
      expect.objectContaining({ id: "route-option-a", kind: "route_option", status: "verified" }),
      expect.objectContaining({ id: "route-decision", kind: "decision", status: "verified" }),
      expect.objectContaining({ id: "route-step-1", kind: "route_step" })
    ]));
    expect(accepted.graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ fromNodeId: "route-constraint", toNodeId: "route-option-a", kind: "constrains" }),
      expect.objectContaining({ fromNodeId: "route-criterion", toNodeId: "route-option-b", kind: "compares" }),
      expect.objectContaining({ fromNodeId: "research-support", toNodeId: "route-option-a", kind: "supports" }),
      expect.objectContaining({ fromNodeId: "route-decision", toNodeId: "route-option-a", kind: "derived_from" }),
      expect.objectContaining({ fromNodeId: "route-step-1", toNodeId: "route-step-2", kind: "precedes" })
    ]));
    expect(validateAcceptedResearchRoutePatches(accepted)).toEqual([]);
    expect(() => assertKnowledgeProvenance(accepted.graph, {
      sources: accepted.knowledgeSourceAssets,
      anchors: accepted.sourceAnchors
    })).not.toThrow();

    const restored = deserializeKnowledgeWorkspace(serializeKnowledgeWorkspace(accepted, knowledgeNow));
    expect(restored.graph.nodes.find((node) => node.id === "route-decision")).toEqual(
      accepted.graph.nodes.find((node) => node.id === "route-decision")
    );
    expect(validateAcceptedResearchRoutePatches(restored)).toEqual([]);
  });

  test("rejection leaves the route outside the primary graph", () => {
    const proposed = proposeRoute(acceptedConclusionWorkspace());
    const patch = proposed.candidatePatches.at(-1)!;
    const rejected = rejectCandidateGraphPatch(proposed, patch.id);

    expect(rejected.graph.nodes.some((node) => node.id === "route-decision")).toBe(false);
    expect(rejected.candidatePatches.at(-1)?.status).toBe("rejected");
  });

  test("requires an accepted reliable conclusion, multiple options, and supporting sourced Evidence", () => {
    const noConclusion = acceptedConclusionWorkspace();
    noConclusion.researchOrchestration.rounds[0].result = undefined;
    expect(() => proposeRoute(noConclusion)).toThrow("requires an accepted reliable conclusion");

    const oneOption = routeInput();
    oneOption.options = oneOption.options.slice(0, 1);
    expect(() => proposeResearchRoute(acceptedConclusionWorkspace(), oneOption)).toThrow("at least two route options");

    const noSupport = routeInput();
    noSupport.options[0].evidenceLinks = [{ evidenceNodeId: "research-opposition", stance: "contradicts" }];
    expect(() => proposeResearchRoute(acceptedConclusionWorkspace(), noSupport)).toThrow("requires at least one supporting Evidence");

    const invalidEvidence = acceptedConclusionWorkspace();
    invalidEvidence.graph.nodes.find((node) => node.id === "research-support")!.status = "open";
    expect(() => proposeRoute(invalidEvidence)).toThrow("requires verified, sourced Project Evidence");
  });

  test("rejects structurally forged pending or persisted route graphs", () => {
    const proposed = proposeRoute(acceptedConclusionWorkspace());
    const patch = proposed.candidatePatches.at(-1)!;
    const criterionEdgeIndex = patch.operations.findIndex((operation) => operation.kind === "create_edge"
      && operation.edge.kind === "compares" && operation.edge.toNodeId === "route-option-b");
    patch.operations.splice(criterionEdgeIndex, 1);
    expect(() => acceptCandidateGraphPatch(proposed, patch.id)).toThrow("criterion coverage");

    const accepted = acceptCandidateGraphPatch(proposeRoute(acceptedConclusionWorkspace()), "graph-patch-2");
    const persisted = JSON.parse(JSON.stringify(accepted)) as KnowledgeWorkspaceSnapshot;
    persisted.graph.nodes.find((node) => node.id === "route-decision")!.title = "tampered decision";
    expect(validateAcceptedResearchRoutePatches(persisted)[0]).toContain("route-decision is missing or has drifted");
  });
});

describe("Research route constraint-change scenarios", () => {
  test("proposes multiple scenarios with selection, abandonment, and uncertainty explanations without writing the graph", () => {
    const base = acceptedRouteWorkspace();
    const beforeNodeIds = base.graph.nodes.map((node) => node.id);
    const proposed = proposeResearchRouteScenarios(base, scenarioInput());
    const patch = proposed.candidatePatches.at(-1)!;

    expect(proposed.graph.nodes.map((node) => node.id)).toEqual(beforeNodeIds);
    expect(patch).toMatchObject({
      action: "route_scenario",
      targetNodeId: "route-decision",
      focusNodeId: "scenario-tight-decision",
      status: "pending_review",
      confidence: 0.82
    });
    expect(patch.operations.filter((operation) => operation.kind === "create_node")).toHaveLength(10);
    expect(patch.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "create_edge", edge: expect.objectContaining({ kind: "refines", fromNodeId: "scenario-tight", toNodeId: "route-constraint" }) }),
      expect.objectContaining({ kind: "create_edge", edge: expect.objectContaining({ kind: "depends_on", fromNodeId: "scenario-tight-decision", toNodeId: "scenario-tight-uncertainty" }) }),
      expect.objectContaining({ kind: "create_edge", edge: expect.objectContaining({ kind: "explains", fromNodeId: "scenario-relaxed-abandon-a", toNodeId: "route-option-a" }) })
    ]));
  });

  test("accepts and persists context-specific scenario decisions in the shared graph", () => {
    const proposed = proposeResearchRouteScenarios(acceptedRouteWorkspace(), scenarioInput());
    const accepted = acceptCandidateGraphPatch(proposed, proposed.candidatePatches.at(-1)!.id);

    expect(accepted.graph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "scenario-tight", kind: "constraint", status: "open" }),
      expect.objectContaining({
        id: "scenario-tight-decision",
        kind: "decision",
        status: "verified",
        epistemicStatus: "context_dependent",
        scope: expect.objectContaining({ kind: "context_specific", contextIds: [accepted.project.id, "scenario-tight"] })
      }),
      expect.objectContaining({ id: "scenario-relaxed-abandon-a", kind: "synthesis" }),
      expect.objectContaining({ id: "scenario-relaxed-uncertainty", kind: "uncertainty", status: "open" })
    ]));
    expect(accepted.graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "valid_in_context", fromNodeId: "scenario-relaxed-decision", toNodeId: "scenario-relaxed" }),
      expect.objectContaining({ kind: "derived_from", fromNodeId: "scenario-relaxed-decision", toNodeId: "route-option-b" }),
      expect.objectContaining({ kind: "explains", fromNodeId: "scenario-tight-abandon-b", toNodeId: "route-option-b" })
    ]));
    expect(validateAcceptedResearchRouteScenarioPatches(accepted)).toEqual([]);
    expect(() => assertKnowledgeProvenance(accepted.graph, {
      sources: accepted.knowledgeSourceAssets,
      anchors: accepted.sourceAnchors
    })).not.toThrow();

    const restored = deserializeKnowledgeWorkspace(serializeKnowledgeWorkspace(accepted, knowledgeNow));
    expect(validateAcceptedResearchRouteScenarioPatches(restored)).toEqual([]);
    expect(restored.graph.nodes.find((node) => node.id === "scenario-relaxed-decision")).toEqual(
      accepted.graph.nodes.find((node) => node.id === "scenario-relaxed-decision")
    );
  });

  test("rejection leaves all scenario analysis outside the shared graph", () => {
    const proposed = proposeResearchRouteScenarios(acceptedRouteWorkspace(), scenarioInput());
    const patch = proposed.candidatePatches.at(-1)!;
    const rejected = rejectCandidateGraphPatch(proposed, patch.id);

    expect(rejected.graph.nodes.some((node) => node.tags.includes("research:route-scenario"))).toBe(false);
    expect(rejected.candidatePatches.at(-1)?.status).toBe("rejected");
  });

  test("requires a valid base constraint, complete abandonment coverage, and explicit uncertainty", () => {
    const invalidBase = scenarioInput();
    invalidBase.scenarios[0].changedConstraint.baseConstraintId = "missing-constraint";
    expect(() => proposeResearchRouteScenarios(acceptedRouteWorkspace(), invalidBase)).toThrow("base constraint is unavailable");

    const missingAbandonment = scenarioInput();
    missingAbandonment.scenarios[0].abandonmentExplanations = [];
    expect(() => proposeResearchRouteScenarios(acceptedRouteWorkspace(), missingAbandonment)).toThrow("abandonment explanations");

    const noUncertainty = scenarioInput();
    noUncertainty.scenarios[0].uncertainties = [];
    expect(() => proposeResearchRouteScenarios(acceptedRouteWorkspace(), noUncertainty)).toThrow("requires at least one uncertainty");

    const invalidSelection = scenarioInput();
    invalidSelection.scenarios[0].selectedOptionId = "missing-option";
    expect(() => proposeResearchRouteScenarios(acceptedRouteWorkspace(), invalidSelection)).toThrow("selected option is unavailable");
  });

  test("rejects forged pending relations and persisted scenario drift", () => {
    const proposed = proposeResearchRouteScenarios(acceptedRouteWorkspace(), scenarioInput());
    const patch = proposed.candidatePatches.at(-1)!;
    const edgeIndex = patch.operations.findIndex((operation) => operation.kind === "create_edge"
      && operation.edge.kind === "explains" && operation.edge.fromNodeId === "scenario-tight-abandon-b");
    patch.operations.splice(edgeIndex, 1);
    expect(() => acceptCandidateGraphPatch(proposed, patch.id)).toThrow("scenario relations");

    const clean = proposeResearchRouteScenarios(acceptedRouteWorkspace(), scenarioInput());
    const accepted = acceptCandidateGraphPatch(clean, clean.candidatePatches.at(-1)!.id);
    const persisted = JSON.parse(JSON.stringify(accepted)) as KnowledgeWorkspaceSnapshot;
    persisted.graph.nodes.find((node) => node.id === "scenario-tight-decision")!.summary = "tampered scenario";
    expect(validateAcceptedResearchRouteScenarioPatches(persisted)[0]).toContain("scenario-tight-decision is missing or has drifted");
  });
});

describe("Research results return to the shared KnowledgeGraph", () => {
  test("builds an ephemeral result projection from canonical Graph objects", () => {
    const snapshot = acceptedScenarioWorkspace();
    const projection = projectResearchResults(snapshot);
    const round = projection.rounds[0];

    expect(projection).toMatchObject({
      projectId: snapshot.project.id,
      graphId: snapshot.graph.id,
      sourceGraphUpdatedAt: snapshot.graph.updatedAt
    });
    expect(round.round).toBe(snapshot.researchOrchestration.rounds[0]);
    expect(round.nodes.find((node) => node.id === "research-conclusion")).toBe(
      snapshot.graph.nodes.find((node) => node.id === "research-conclusion")
    );
    expect(round.nodes.find((node) => node.id === "scenario-tight-decision")).toBe(
      snapshot.graph.nodes.find((node) => node.id === "scenario-tight-decision")
    );
    expect(round.edges.find((edge) => edge.fromNodeId === "research-support" && edge.toNodeId === "route-option-a")).toBe(
      snapshot.graph.edges.find((edge) => edge.fromNodeId === "research-support" && edge.toNodeId === "route-option-a")
    );
    expect(round.edges.find((edge) => edge.id === "support-target")).toBe(
      snapshot.graph.edges.find((edge) => edge.id === "support-target")
    );
    expect(round.edges.some((edge) => edge.id === "oppose-target" && edge.kind === "contradicts")).toBe(true);
    expect(round.sources[0]).toBe(snapshot.knowledgeSourceAssets.find((source) => source.id === round.sources[0].id));
    expect(round.acceptedPatches.map((patch) => patch.id)).toEqual(["graph-patch-1", "graph-patch-2", "graph-patch-3"]);
  });

  test("projects two stateful rounds without creating a second result store", () => {
    let snapshot = completeResearchRound(acceptedScenarioWorkspace(), {
      roundId: "research-round",
      completedAt: knowledgeNow
    });
    const baseline = captureResearchRoundBaseline(snapshot, knowledgeNow);
    snapshot = {
      ...snapshot,
      researchOrchestration: {
        ...snapshot.researchOrchestration,
        rounds: snapshot.researchOrchestration.rounds.concat({
          id: "research-round-2",
          projectId: snapshot.project.id,
          planId: "research-plan",
          roundNumber: 2,
          objective: "验证第一轮路线中的剩余不确定性。",
          taskIds: [],
          status: "active",
          baseline,
          outputs: emptyOutputs(),
          nextQuestionNodeIds: [],
          startedAt: knowledgeNow,
          createdAt: knowledgeNow,
          updatedAt: knowledgeNow
        })
      }
    };
    const proposed = proposeKnowledgeDrillDown(snapshot, "scenario-tight-uncertainty");
    snapshot = acceptCandidateGraphPatch(proposed, proposed.candidatePatches.at(-1)!.id);
    snapshot = completeResearchRound(snapshot, { roundId: "research-round-2", completedAt: knowledgeNow });

    const projection = projectResearchResults(snapshot);
    expect(projection.rounds.map((item) => [item.round.roundNumber, item.round.status])).toEqual([
      [1, "completed"],
      [2, "completed"]
    ]);
    expect(projection.rounds[0].nodes.some((node) => node.id === "route-decision")).toBe(true);
    expect(projection.rounds[1].nodes.some((node) => node.id === "scenario-tight-uncertainty-detail-1")).toBe(true);
    expect(projection.rounds[1].acceptedPatches.at(-1)?.action).toBe("drill_down");
    expect(Object.hasOwn(snapshot, "researchReports")).toBe(false);
  });

  test("rejects persisted independent report copies", () => {
    const snapshot = acceptedScenarioWorkspace();
    expect(() => assertNoIndependentResearchReportData(snapshot)).not.toThrow();
    const document = JSON.parse(serializeKnowledgeWorkspace(snapshot, knowledgeNow));
    document.workspace.researchReports = [{ title: "copied conclusion", body: "must not persist" }];
    expect(() => deserializeKnowledgeWorkspace(JSON.stringify(document))).toThrowError(
      expect.objectContaining({ code: "invalid_workspace" })
    );

    delete document.workspace.researchReports;
    document.workspace.researchOrchestration.rounds[0].reportContent = "copied route and conclusion";
    expect(() => deserializeKnowledgeWorkspace(JSON.stringify(document))).toThrowError(
      expect.objectContaining({ code: "invalid_workspace" })
    );
  });
});

function proposeRoute(snapshot: KnowledgeWorkspaceSnapshot): KnowledgeWorkspaceSnapshot {
  return proposeResearchRoute(snapshot, routeInput());
}

function acceptedRouteWorkspace(): KnowledgeWorkspaceSnapshot {
  const proposed = proposeRoute(acceptedConclusionWorkspace());
  return acceptCandidateGraphPatch(proposed, proposed.candidatePatches.at(-1)!.id);
}

function acceptedScenarioWorkspace(): KnowledgeWorkspaceSnapshot {
  const proposed = proposeResearchRouteScenarios(acceptedRouteWorkspace(), scenarioInput());
  return acceptCandidateGraphPatch(proposed, proposed.candidatePatches.at(-1)!.id);
}

function scenarioInput(): Parameters<typeof proposeResearchRouteScenarios>[1] {
  return {
    routePatchId: "graph-patch-2",
    scenarios: [
      {
        changedConstraint: {
          id: "scenario-tight",
          baseConstraintId: "route-constraint",
          title: "预算进一步收紧",
          summary: "预算只允许先交付最小可验证闭环。",
          confidence: 0.9
        },
        selectedOptionId: "route-option-a",
        decision: {
          id: "scenario-tight-decision",
          title: "收紧预算时选择渐进式路线",
          summary: "渐进式路线能够在预算上限内先验证关键闭环。",
          confidence: 0.82
        },
        selectionExplanation: {
          id: "scenario-tight-selection",
          title: "渐进式路线的选择原因",
          summary: "它保留阶段验证能力，并降低一次性投入。",
          confidence: 0.84
        },
        abandonmentExplanations: [{
          optionId: "route-option-b",
          explanation: {
            id: "scenario-tight-abandon-b",
            title: "放弃一次性路线",
            summary: "一次性建设超过收紧后的预算边界。",
            confidence: 0.87
          }
        }],
        uncertainties: [{
          id: "scenario-tight-uncertainty",
          title: "最小闭环收益仍待实测",
          summary: "首阶段能否产生足够收益仍需用真实交付数据验证。",
          confidence: 0.58,
          affectedOptionIds: ["route-option-a", "route-option-b"]
        }],
        scopeDescription: "仅适用于预算进一步收紧且团队规模不变的情景。"
      },
      {
        changedConstraint: {
          id: "scenario-relaxed",
          baseConstraintId: "route-constraint",
          title: "资源约束放宽",
          summary: "预算和团队允许一次建设完整能力。",
          confidence: 0.86
        },
        selectedOptionId: "route-option-b",
        decision: {
          id: "scenario-relaxed-decision",
          title: "资源充足时选择一次性路线",
          summary: "在资源充足且窗口期短时，一次性路线缩短总体交付周期。",
          confidence: 0.74
        },
        selectionExplanation: {
          id: "scenario-relaxed-selection",
          title: "一次性路线的条件化选择原因",
          summary: "额外资源降低并行建设风险，并换取更短市场窗口。",
          confidence: 0.76
        },
        abandonmentExplanations: [{
          optionId: "route-option-a",
          explanation: {
            id: "scenario-relaxed-abandon-a",
            title: "放弃渐进式路线",
            summary: "分阶段交付在短窗口期内产生额外等待成本。",
            confidence: 0.72
          }
        }],
        uncertainties: [{
          id: "scenario-relaxed-uncertainty",
          title: "并行协作效率不确定",
          summary: "团队扩充后的协作开销可能抵消一次性路线的时间收益。",
          confidence: 0.61,
          affectedOptionIds: ["route-option-b"]
        }],
        scopeDescription: "仅适用于预算放宽、团队扩充且市场窗口缩短的情景。"
      }
    ],
    createdAt: knowledgeNow
  };
}

function routeInput(): Parameters<typeof proposeResearchRoute>[1] {
  return {
    roundId: "research-round",
    goal: { id: "route-goal", title: "形成可执行技术路线", summary: "把研究结论转化为可执行方案。", confidence: 0.9 },
    constraints: [{ id: "route-constraint", title: "资源约束", summary: "必须在现有团队和预算内实施。", confidence: 0.9 }],
    criteria: [{ id: "route-criterion", title: "可验证性", summary: "路线必须能够分阶段验证。", confidence: 0.88 }],
    options: [
      {
        id: "route-option-a",
        title: "渐进式路线",
        summary: "先完成最小闭环，再逐步扩展。",
        confidence: 0.84,
        evidenceLinks: [
          { evidenceNodeId: "research-support", stance: "supports" },
          { evidenceNodeId: "research-opposition", stance: "contradicts" }
        ]
      },
      {
        id: "route-option-b",
        title: "一次性路线",
        summary: "一次完成全部能力建设。",
        confidence: 0.62,
        evidenceLinks: [{ evidenceNodeId: "research-opposition", stance: "supports" }]
      }
    ],
    decision: {
      id: "route-decision",
      title: "选择渐进式路线",
      summary: "当前约束下选择渐进式路线。",
      selectedOptionId: "route-option-a",
      confidence: 0.81
    },
    steps: [
      { id: "route-step-1", title: "建立最小闭环", summary: "先完成可验证的端到端闭环。", confidence: 0.9 },
      { id: "route-step-2", title: "扩展路线能力", summary: "在闭环验证后扩展规模和自动化。", confidence: 0.82 }
    ],
    scopeDescription: "适用于当前团队、预算和已验证研究结论。",
    createdAt: knowledgeNow
  };
}

function acceptedConclusionWorkspace(): KnowledgeWorkspaceSnapshot {
  let snapshot = verifiedWorkspace();
  snapshot = proposeResearchConclusion(snapshot, {
    roundId: "research-round",
    verificationTargetNodeId: "research-target",
    inferenceDrafts: [{
      id: "research-inference",
      title: "证据推断",
      summary: "事实支持渐进式实施判断。",
      factNodeIds: ["research-fact"],
      confidence: 0.86
    }],
    synthesis: { id: "research-synthesis", title: "研究综合", summary: "综合事实和验证矩阵。", confidence: 0.84 },
    conclusion: { id: "research-conclusion", title: "可信结论", summary: "形成可用于路线推演的结论。", confidence: 0.82 },
    scopeDescription: "适用于当前公开资料和项目范围。",
    unresolvedQuestionNodeIds: ["research-unresolved"],
    createdAt: knowledgeNow
  });
  return acceptCandidateGraphPatch(snapshot, "graph-patch-1");
}

function verifiedWorkspace(): KnowledgeWorkspaceSnapshot {
  const workspace = createProjectWorkspace({ mode: "research", title: "Route fixture", subjectKind: "question" });
  const projectId = workspace.project.id;
  const question = workspace.graph.nodes.find((node) => node.kind === "question")!;
  const sources = [
    source("source-primary", "logical-primary", "primary", "hash-primary", workspace.space.id),
    source("source-official", "logical-official", "official", "hash-official", workspace.space.id)
  ];
  const anchors = [
    anchor("anchor-primary", "source-primary", "hash-primary", "Primary fact and support."),
    anchor("anchor-official", "source-official", "hash-official", "Official counterevidence.")
  ];
  const fact = sourcedNode(workspace, "research-fact", "fact", "可追溯事实", sources[0], anchors[0]);
  const target = node(workspace, "research-target", "claim", "目标判断");
  const support = sourcedNode(workspace, "research-support", "evidence", "支持证据", sources[0], anchors[0]);
  const opposition = sourcedNode(workspace, "research-opposition", "evidence", "反对证据", sources[1], anchors[1]);
  const alternative = node(workspace, "research-alternative", "hypothesis", "替代解释");
  const unresolved = node(workspace, "research-unresolved", "question", "仍待解决的问题");
  const graph = {
    ...workspace.graph,
    nodes: workspace.graph.nodes.concat(fact, target, support, opposition, alternative, unresolved),
    edges: workspace.graph.edges.concat(
      relation("support-target", support.id, target.id, "supports"),
      relation("oppose-target", opposition.id, target.id, "contradicts"),
      relation("alternative-target", alternative.id, target.id, "related_to")
    )
  };
  const orchestration: ResearchOrchestration = {
    briefs: [{
      id: "research-brief", projectId, primaryQuestionNodeId: question.id, secondaryQuestionNodeIds: [],
      objective: "形成路线。", scope: { description: "当前资料", time: { asOf: knowledgeNow }, geographies: ["global"], units: ["percent"], inclusionCriteria: [], exclusionCriteria: [] },
      successCriteria: ["验证通过"], seedSourceIds: sources.map((item) => item.id), status: "ready", revision: 1,
      createdBy: "user", createdAt: knowledgeNow, updatedAt: knowledgeNow
    }],
    plans: [{
      id: "research-plan", projectId, briefId: "research-brief", strategy: "验证后推演路线。", taskIds: [],
      verificationRequirements: ["independent_sources", "primary_source_traceability", "inference_scope"],
      status: "active", revision: 1, createdBy: "agent", createdAt: knowledgeNow, updatedAt: knowledgeNow
    }],
    tasks: [], rounds: [], searchQueries: [], verificationRecords: []
  };
  let snapshot: KnowledgeWorkspaceSnapshot = {
    ...workspace, graph, knowledgeSourceAssets: sources, sourceAnchors: anchors, researchOrchestration: orchestration
  };
  snapshot.researchOrchestration.rounds.push({
    id: "research-round", projectId, planId: "research-plan", roundNumber: 1, objective: "形成可信结论与路线。",
    taskIds: [], status: "active", baseline: captureResearchRoundBaseline(snapshot, knowledgeNow), outputs: emptyOutputs(),
    nextQuestionNodeIds: [], startedAt: knowledgeNow, createdAt: knowledgeNow, updatedAt: knowledgeNow
  });
  return runResearchVerificationMatrix(snapshot, {
    roundId: "research-round",
    targetNodeId: target.id,
    evidenceProfiles: [support, opposition].map((evidence) => ({
      evidenceNodeId: evidence.id, geographies: ["global"], unit: "percent", methodology: "controlled comparison",
      conflictOfInterestStatus: "none_declared"
    })),
    alternativeExplanationNodeIds: [alternative.id],
    checkedAt: knowledgeNow
  }).snapshot;
}

function node(snapshot: KnowledgeWorkspaceSnapshot, id: string, kind: KnowledgeNode["kind"], title: string): KnowledgeNode {
  return {
    id, kind, title, summary: `${title}内容。`, status: "open",
    ...createKnowledgeMetadata({ kind, createdBy: "agent", creatorId: "research-route-test", scopeContextId: snapshot.project.id }),
    temporalValidity: { status: "current", observedAt: knowledgeNow }, depth: 1, tags: [], sourceRefs: [],
    createdBy: "agent", creatorId: "research-route-test", createdAt: knowledgeNow, updatedAt: knowledgeNow
  };
}

function sourcedNode(snapshot: KnowledgeWorkspaceSnapshot, id: string, kind: "fact" | "evidence", title: string, asset: KnowledgeSourceAsset, itemAnchor: SourceAnchor): KnowledgeNode {
  return {
    ...node(snapshot, id, kind, title), status: "verified", epistemicStatus: "supported", sourceStatus: "verified",
    sourceRefs: [{ sourceId: asset.id, anchorId: itemAnchor.id, locator: "L1", quote: itemAnchor.quote }]
  };
}

function source(id: string, logicalSourceId: string, researchSourceKind: "primary" | "official", contentHash: string, spaceId: string): KnowledgeSourceAsset {
  return { id, logicalSourceId, version: 1, spaceId, format: "text", title: id, uri: `https://example.com/${id}`, researchSourceKind, contentHash, byteLength: 64, immutable: true, createdAt: knowledgeNow };
}

function anchor(id: string, sourceId: string, contentHash: string, quote: string): SourceAnchor {
  return { id, sourceId, locator: { kind: "text", lineStart: 1 }, quote, contentHash };
}

function relation(id: string, fromNodeId: string, toNodeId: string, kind: KnowledgeEdge["kind"]): KnowledgeEdge {
  return { id, fromNodeId, toNodeId, kind, rationale: "Route fixture relation.", createdBy: "agent", confidence: 0.9, createdAt: knowledgeNow };
}

function emptyOutputs() {
  return {
    sourceIds: [], factNodeIds: [], claimNodeIds: [], hypothesisNodeIds: [], inferenceNodeIds: [], evidenceNodeIds: [],
    conflictNodeIds: [], gapNodeIds: [], synthesisNodeIds: [], edgeIds: [], verificationRecordIds: []
  };
}
