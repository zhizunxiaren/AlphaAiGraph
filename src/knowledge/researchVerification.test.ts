// @vitest-environment node
import { describe, expect, test } from "vitest";
import type {
  KnowledgeEdge,
  KnowledgeNode,
  KnowledgeSourceAsset,
  KnowledgeWorkspaceSnapshot,
  ResearchOrchestration,
  SourceAnchor,
  VerificationEvidenceProfile
} from "../types";
import { createProjectWorkspace } from "./knowledgeEngine";
import { createKnowledgeMetadata } from "./knowledgeMetadata";
import { captureResearchRoundBaseline } from "./researchRound";
import { validateResearchOrchestration } from "./researchOrchestration";
import {
  deriveResearchVerificationMatrix,
  runResearchVerificationMatrix
} from "./researchVerification";
import { formatSourceLocator } from "./sourceOutline";
import { deserializeKnowledgeWorkspace, serializeKnowledgeWorkspace } from "./workspacePersistence";

const checkedAt = "2026-07-15T06:00:00.000Z";

describe("research verification matrix", () => {
  test("passes only after handling both stances, data comparability, time, interests, and alternatives", () => {
    const workspace = verificationWorkspace();
    const result = runResearchVerificationMatrix(workspace, {
      roundId: "round-verification-1",
      targetNodeId: "target-claim",
      evidenceProfiles: consistentProfiles(),
      alternativeExplanationNodeIds: ["alternative-hypothesis"],
      checkedAt
    });

    expect(result.matrix.overallStatus).toBe("passed");
    expect(result.matrix.records.map((record) => [record.checkKind, record.status])).toEqual([
      ["independent_sources", "passed"],
      ["primary_source_traceability", "passed"],
      ["support_and_opposition", "passed"],
      ["geography_consistency", "passed"],
      ["unit_consistency", "passed"],
      ["methodology_consistency", "passed"],
      ["temporal_validity", "passed"],
      ["conflict_of_interest", "passed"],
      ["inference_scope", "passed"],
      ["alternative_explanation", "passed"]
    ]);
    expect(result.snapshot.project.workflow).toEqual({ mode: "research", phase: "verifying" });
    expect(result.snapshot.researchOrchestration.tasks.at(-1)).toMatchObject({
      kind: "verify",
      role: "verifier",
      status: "completed"
    });
    expect(result.snapshot.researchOrchestration.rounds[0].outputs.verificationRecordIds).toHaveLength(10);
    expect(deriveResearchVerificationMatrix(result.snapshot, "round-verification-1", "target-claim")).toEqual(result.matrix);
    expect(() => serializeKnowledgeWorkspace(result.snapshot, checkedAt)).not.toThrow();
  });

  test("surfaces inconsistent scope, unit, method, expired evidence, disclosed interests, and missing alternatives", () => {
    const workspace = verificationWorkspace();
    workspace.graph.nodes.find((node) => node.id === "opposing-evidence")!.temporalValidity = {
      status: "expired",
      validUntil: "2025-12-31T00:00:00.000Z"
    };
    const profiles = consistentProfiles();
    profiles[1] = {
      ...profiles[1],
      geographies: ["eu"],
      unit: "basis_points",
      methodology: "randomized trial",
      conflictOfInterestStatus: "declared",
      conflictOfInterestDisclosure: "研究由候选方案供应商资助"
    };

    const result = runResearchVerificationMatrix(workspace, {
      roundId: "round-verification-1",
      targetNodeId: "target-claim",
      evidenceProfiles: profiles,
      alternativeExplanationNodeIds: [],
      checkedAt
    });
    const statuses = Object.fromEntries(result.matrix.records.map((record) => [record.checkKind, record.status]));

    expect(result.matrix.overallStatus).toBe("failed");
    expect(statuses).toMatchObject({
      support_and_opposition: "passed",
      geography_consistency: "failed",
      unit_consistency: "failed",
      methodology_consistency: "failed",
      temporal_validity: "failed",
      conflict_of_interest: "inconclusive",
      alternative_explanation: "failed"
    });
    expect(result.matrix.blockers).toEqual(expect.arrayContaining([
      expect.stringContaining("unit_consistency"),
      expect.stringContaining("conflict_of_interest"),
      expect.stringContaining("alternative_explanation")
    ]));
  });

  test("cannot pass support/opposition when the formal graph has only supporting evidence", () => {
    const workspace = verificationWorkspace();
    workspace.graph.edges = workspace.graph.edges.filter((edge) => edge.id !== "opposing-contradicts-target");

    const result = runResearchVerificationMatrix(workspace, {
      roundId: "round-verification-1",
      targetNodeId: "target-claim",
      evidenceProfiles: [consistentProfiles()[0]],
      alternativeExplanationNodeIds: ["alternative-hypothesis"],
      checkedAt
    });

    expect(result.matrix.records.find((record) => record.checkKind === "support_and_opposition")).toMatchObject({
      status: "failed",
      evidenceNodeIds: ["supporting-evidence"],
      opposingEvidenceNodeIds: []
    });
  });

  test("persistence rejects a VerificationRecord whose claimed stance is not a formal graph relation", () => {
    const result = runResearchVerificationMatrix(verificationWorkspace(), {
      roundId: "round-verification-1",
      targetNodeId: "target-claim",
      evidenceProfiles: consistentProfiles(),
      alternativeExplanationNodeIds: ["alternative-hypothesis"],
      checkedAt
    });
    const record = result.snapshot.researchOrchestration.verificationRecords
      .find((candidate) => candidate.checkKind === "support_and_opposition")!;
    record.opposingEvidenceNodeIds = ["supporting-evidence"];

    expect(validateResearchOrchestration(result.snapshot)).toContain(
      `verification ${record.id} opposing evidence supporting-evidence does not formally contradict its target`
    );
    expect(() => serializeKnowledgeWorkspace(result.snapshot, checkedAt)).toThrow("invalid_workspace");
  });

  test("migrates legacy verification details to explicit unknown and inconclusive states", () => {
    const result = runResearchVerificationMatrix(verificationWorkspace(), {
      roundId: "round-verification-1",
      targetNodeId: "target-claim",
      evidenceProfiles: consistentProfiles(),
      alternativeExplanationNodeIds: ["alternative-hypothesis"],
      checkedAt
    });
    const document = JSON.parse(serializeKnowledgeWorkspace(result.snapshot, checkedAt));
    const records = document.workspace.researchOrchestration.verificationRecords;
    const geography = records.find((record: { checkKind: string }) => record.checkKind === "geography_consistency");
    const alternative = records.find((record: { checkKind: string }) => record.checkKind === "alternative_explanation");
    delete geography.evidenceProfiles;
    delete alternative.alternativeExplanationNodeIds;

    const migrated = deserializeKnowledgeWorkspace(JSON.stringify(document));
    const migratedGeography = migrated.researchOrchestration.verificationRecords
      .find((record) => record.checkKind === "geography_consistency")!;
    const migratedAlternative = migrated.researchOrchestration.verificationRecords
      .find((record) => record.checkKind === "alternative_explanation")!;
    expect(migratedGeography.status).toBe("inconclusive");
    expect(migratedGeography.evidenceProfiles.every((profile) =>
      profile.conflictOfInterestStatus === "unknown" && profile.geographies.length === 0
    )).toBe(true);
    expect(migratedAlternative).toMatchObject({ status: "inconclusive", alternativeExplanationNodeIds: [] });
  });
});

function verificationWorkspace(): KnowledgeWorkspaceSnapshot {
  const base = createProjectWorkspace({
    mode: "research",
    title: "Verification matrix fixture",
    subjectKind: "question"
  });
  const primaryQuestion = base.graph.nodes.find((node) => node.kind === "question")!;
  const orchestration: ResearchOrchestration = {
    briefs: [{
      id: "brief-verification",
      projectId: base.project.id,
      primaryQuestionNodeId: primaryQuestion.id,
      secondaryQuestionNodeIds: [],
      objective: "验证候选 Claim 是否有可比较的正反证据。",
      scope: {
        description: "全球公开研究，单位为 percent。",
        time: { asOf: checkedAt },
        geographies: ["global"],
        units: ["percent"],
        inclusionCriteria: ["可追溯原文"],
        exclusionCriteria: []
      },
      successCriteria: ["验证矩阵无阻塞项"],
      seedSourceIds: [],
      status: "ready",
      revision: 1,
      createdBy: "user",
      createdAt: checkedAt,
      updatedAt: checkedAt
    }],
    plans: [{
      id: "plan-verification",
      projectId: base.project.id,
      briefId: "brief-verification",
      strategy: "同时验证正反证据和口径。",
      taskIds: [],
      verificationRequirements: ["independent_sources", "primary_source_traceability", "inference_scope"],
      status: "active",
      revision: 1,
      createdBy: "agent",
      createdAt: checkedAt,
      updatedAt: checkedAt
    }],
    tasks: [],
    rounds: [],
    searchQueries: [],
    verificationRecords: []
  };
  const beforeEvidence = { ...base, researchOrchestration: orchestration };
  beforeEvidence.researchOrchestration.rounds.push({
    id: "round-verification-1",
    projectId: base.project.id,
    planId: "plan-verification",
    roundNumber: 1,
    objective: "完成候选 Claim 验证矩阵。",
    taskIds: [],
    status: "active",
    baseline: captureResearchRoundBaseline(beforeEvidence, checkedAt),
    outputs: emptyOutputs(),
    nextQuestionNodeIds: [],
    startedAt: checkedAt,
    createdAt: checkedAt,
    updatedAt: checkedAt
  });

  const sources = [source("primary-source", "primary"), source("opposing-source", "independent_secondary")];
  const anchors = [anchor(sources[0], "primary-anchor"), anchor(sources[1], "opposing-anchor")];
  const target = node(beforeEvidence, "target-claim", "claim", "候选研究判断");
  const supporting = evidenceNode(beforeEvidence, "supporting-evidence", "支持证据", sources[0], anchors[0]);
  const opposing = evidenceNode(beforeEvidence, "opposing-evidence", "反对证据", sources[1], anchors[1]);
  const alternative = node(beforeEvidence, "alternative-hypothesis", "hypothesis", "替代解释");
  const edges: KnowledgeEdge[] = [
    edge("supporting-supports-target", supporting.id, target.id, "supports"),
    edge("opposing-contradicts-target", opposing.id, target.id, "contradicts"),
    edge("alternative-related-target", alternative.id, target.id, "related_to")
  ];
  const subject = { ...base.project.subject, sourceAssetIds: sources.map((source) => source.id) };
  const project = { ...base.project, subject };
  return {
    ...beforeEvidence,
    project,
    projects: [project],
    subject,
    graph: {
      ...base.graph,
      nodes: base.graph.nodes.concat(target, supporting, opposing, alternative),
      edges: base.graph.edges.concat(edges)
    },
    knowledgeSourceAssets: sources,
    sourceAnchors: anchors
  };
}

function consistentProfiles(): VerificationEvidenceProfile[] {
  return ["supporting-evidence", "opposing-evidence"].map((evidenceNodeId) => ({
    evidenceNodeId,
    geographies: ["global"],
    unit: "percent",
    methodology: "cohort study",
    conflictOfInterestStatus: "none_declared"
  }));
}

function source(logicalSourceId: string, researchSourceKind: KnowledgeSourceAsset["researchSourceKind"]): KnowledgeSourceAsset {
  return {
    id: `${logicalSourceId}@v1-aaaaaaaaaaaa`,
    logicalSourceId,
    version: 1,
    spaceId: "space-main",
    inventoryKind: "document",
    format: "text",
    title: logicalSourceId,
    uri: `https://example.com/${logicalSourceId}`,
    mediaType: "text/plain",
    researchSourceKind,
    contentHash: `sha256:${logicalSourceId}`,
    byteLength: 64,
    immutable: true,
    createdAt: checkedAt
  };
}

function anchor(sourceAsset: KnowledgeSourceAsset, id: string): SourceAnchor {
  return {
    id,
    sourceId: sourceAsset.id,
    locator: { kind: "text", lineStart: 1, lineEnd: 2 },
    quote: `${sourceAsset.title} excerpt`,
    contentHash: sourceAsset.contentHash
  };
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
    summary: `${title}内容。`,
    status: "open",
    ...createKnowledgeMetadata({ kind, createdBy: "agent", creatorId: "verification-test", scopeContextId: snapshot.project.id }),
    depth: 2,
    tags: [],
    sourceRefs: [],
    createdAt: checkedAt,
    updatedAt: checkedAt
  };
}

function evidenceNode(
  snapshot: KnowledgeWorkspaceSnapshot,
  id: string,
  title: string,
  sourceAsset: KnowledgeSourceAsset,
  sourceAnchor: SourceAnchor
): KnowledgeNode {
  return {
    ...node(snapshot, id, "evidence", title),
    status: "verified",
    ...createKnowledgeMetadata({
      kind: "evidence",
      createdBy: "agent",
      creatorId: "verification-test",
      scopeContextId: snapshot.project.id,
      sourceRefCount: 1,
      sourceVerified: true
    }),
    temporalValidity: { status: "current", observedAt: checkedAt },
    sourceRefs: [{
      sourceId: sourceAsset.id,
      anchorId: sourceAnchor.id,
      locator: formatSourceLocator(sourceAnchor.locator),
      quote: sourceAnchor.quote
    }]
  };
}

function edge(id: string, fromNodeId: string, toNodeId: string, kind: KnowledgeEdge["kind"]): KnowledgeEdge {
  return {
    id,
    fromNodeId,
    toNodeId,
    kind,
    rationale: `${kind} for verification fixture`,
    createdBy: "agent",
    confidence: 1,
    createdAt: checkedAt
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
