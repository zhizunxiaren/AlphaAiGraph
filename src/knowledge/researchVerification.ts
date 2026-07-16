import type {
  KnowledgeNode,
  KnowledgeWorkspaceSnapshot,
  ResearchBrief,
  VerificationCheckKind,
  VerificationEvidenceProfile,
  VerificationRecord,
  VerificationStatus
} from "../types";
import { assertKnowledgeProvenance } from "./provenance";
import { assertResearchOrchestration } from "./researchOrchestration";

export type ResearchVerificationOverallStatus = "passed" | "failed" | "inconclusive";

export interface ResearchVerificationMatrix {
  projectId: string;
  planId: string;
  roundId: string;
  targetNodeId: string;
  overallStatus: ResearchVerificationOverallStatus;
  records: VerificationRecord[];
  blockers: string[];
}

export interface RunResearchVerificationInput {
  roundId: string;
  targetNodeId: string;
  evidenceProfiles: VerificationEvidenceProfile[];
  alternativeExplanationNodeIds: string[];
  checkedAt: string;
}

export interface ResearchVerificationResult {
  snapshot: KnowledgeWorkspaceSnapshot;
  matrix: ResearchVerificationMatrix;
}

interface CheckResult {
  status: VerificationStatus;
  finding: string;
}

const coreCheckKinds: VerificationCheckKind[] = [
  "support_and_opposition",
  "geography_consistency",
  "unit_consistency",
  "methodology_consistency",
  "temporal_validity",
  "conflict_of_interest",
  "alternative_explanation"
];

const checkOrder: VerificationCheckKind[] = [
  "independent_sources",
  "primary_source_traceability",
  "support_and_opposition",
  "geography_consistency",
  "unit_consistency",
  "methodology_consistency",
  "temporal_validity",
  "conflict_of_interest",
  "inference_scope",
  "alternative_explanation"
];

export function runResearchVerificationMatrix(
  snapshot: KnowledgeWorkspaceSnapshot,
  input: RunResearchVerificationInput
): ResearchVerificationResult {
  if (snapshot.project.mode !== "research") throw new Error("Research verification requires a Research Project");
  assertTimestamp(input.checkedAt, "checkedAt");
  assertKnowledgeProvenance(snapshot.graph, {
    sources: snapshot.knowledgeSourceAssets,
    anchors: snapshot.sourceAnchors
  });
  const round = snapshot.researchOrchestration.rounds.find((candidate) => candidate.id === input.roundId);
  if (!round || round.projectId !== snapshot.project.id) throw new Error(`Research round is unavailable: ${input.roundId}`);
  if (round.status !== "active") throw new Error(`Research round is not active: ${round.status}`);
  const plan = snapshot.researchOrchestration.plans.find((candidate) => candidate.id === round.planId)!;
  const brief = snapshot.researchOrchestration.briefs.find((candidate) => candidate.id === plan.briefId)!;
  const target = snapshot.graph.nodes.find((node) => node.id === input.targetNodeId && node.status !== "archived");
  if (!target || !new Set(["claim", "hypothesis", "inference", "synthesis", "conclusion", "decision"]).has(target.kind)) {
    throw new Error(`Research verification target is unavailable or not judgment-bearing: ${input.targetNodeId}`);
  }
  if (!target.scope.contextIds.includes(round.projectId)) throw new Error("Research verification target belongs to another Project scope");
  const supportingEvidence = relatedEvidence(snapshot, target.id, "supports");
  const opposingEvidence = relatedEvidence(snapshot, target.id, "contradicts");
  const evidenceIds = new Set(supportingEvidence.concat(opposingEvidence).map((node) => node.id));
  if (supportingEvidence.some((node) => opposingEvidence.some((opposing) => opposing.id === node.id))) {
    throw new Error("One Evidence node cannot simultaneously support and oppose the same target");
  }
  const profiles = normalizeProfiles(input.evidenceProfiles, evidenceIds);
  const alternatives = validateAlternatives(snapshot, target.id, input.alternativeExplanationNodeIds, round.projectId);
  const sourceIds = Array.from(new Set([...evidenceIds].flatMap((evidenceId) =>
    snapshot.graph.nodes.find((node) => node.id === evidenceId)!.sourceRefs.map((reference) => reference.sourceId)
  )));
  const checks = new Set(coreCheckKinds.concat(plan.verificationRequirements));
  const taskId = `verify-${sanitizeId(round.id)}-${sanitizeId(target.id)}`;
  if (snapshot.researchOrchestration.tasks.some((task) => task.id === taskId)) {
    throw new Error(`Research verification already exists for ${target.id} in round ${round.id}`);
  }
  const records = checkOrder
    .filter((checkKind) => checks.has(checkKind))
    .map((checkKind): VerificationRecord => {
      const result = evaluateCheck({
        checkKind,
        snapshot,
        brief,
        target,
        supportingEvidence,
        opposingEvidence,
        profiles,
        alternatives,
        sourceIds,
        checkedAt: input.checkedAt
      });
      return {
        id: `${taskId}-${checkKind}`,
        projectId: round.projectId,
        planId: round.planId,
        roundId: round.id,
        taskId,
        targetNodeId: target.id,
        checkKind,
        status: result.status,
        sourceIds,
        evidenceNodeIds: supportingEvidence.map((node) => node.id),
        opposingEvidenceNodeIds: opposingEvidence.map((node) => node.id),
        evidenceProfiles: profiles,
        alternativeExplanationNodeIds: alternatives.map((node) => node.id),
        finding: result.finding,
        checkedBy: "agent",
        checkedAt: input.checkedAt,
        createdAt: input.checkedAt
      };
    });
  const task = {
    id: taskId,
    projectId: round.projectId,
    planId: round.planId,
    roundId: round.id,
    kind: "verify" as const,
    title: `验证「${target.title}」`,
    objective: "同时检查正反证据、数据口径、时间有效性、利益相关和替代解释。",
    role: "verifier" as const,
    status: "completed" as const,
    dependsOnTaskIds: [],
    inputNodeIds: Array.from(new Set([target.id, ...evidenceIds, ...alternatives.map((node) => node.id)])),
    inputSourceIds: sourceIds,
    outputNodeIds: [],
    outputSourceIds: [],
    createdAt: input.checkedAt,
    updatedAt: input.checkedAt,
    completedAt: input.checkedAt
  };
  const project = {
    ...snapshot.project,
    workflow: { mode: "research" as const, phase: "verifying" as const },
    updatedAt: input.checkedAt
  };
  const next: KnowledgeWorkspaceSnapshot = {
    ...snapshot,
    project,
    projects: snapshot.projects.map((candidate) => candidate.id === project.id ? project : candidate),
    subject: project.subject,
    researchOrchestration: {
      ...snapshot.researchOrchestration,
      plans: snapshot.researchOrchestration.plans.map((candidate) => candidate.id === plan.id
        ? { ...candidate, taskIds: candidate.taskIds.concat(task.id), updatedAt: input.checkedAt }
        : candidate),
      tasks: snapshot.researchOrchestration.tasks.concat(task),
      rounds: snapshot.researchOrchestration.rounds.map((candidate) => candidate.id === round.id
        ? {
            ...candidate,
            taskIds: candidate.taskIds.concat(task.id),
            outputs: {
              ...candidate.outputs,
              verificationRecordIds: union(candidate.outputs.verificationRecordIds, records.map((record) => record.id))
            },
            updatedAt: input.checkedAt
          }
        : candidate),
      verificationRecords: snapshot.researchOrchestration.verificationRecords.concat(records)
    }
  };
  assertResearchOrchestration(next);
  return { snapshot: next, matrix: matrixFromRecords(next, round.id, target.id) };
}

export function deriveResearchVerificationMatrix(
  snapshot: KnowledgeWorkspaceSnapshot,
  roundId: string,
  targetNodeId: string
): ResearchVerificationMatrix {
  return matrixFromRecords(snapshot, roundId, targetNodeId);
}

function matrixFromRecords(
  snapshot: KnowledgeWorkspaceSnapshot,
  roundId: string,
  targetNodeId: string
): ResearchVerificationMatrix {
  const round = snapshot.researchOrchestration.rounds.find((candidate) => candidate.id === roundId);
  if (!round) throw new Error(`Research round does not exist: ${roundId}`);
  const records = checkOrder.flatMap((checkKind) => snapshot.researchOrchestration.verificationRecords
    .filter((record) => record.roundId === roundId && record.targetNodeId === targetNodeId && record.checkKind === checkKind));
  if (records.length === 0) throw new Error(`Research verification matrix does not exist for ${targetNodeId}`);
  const blockers = records
    .filter((record) => record.status === "failed" || record.status === "inconclusive" || record.status === "pending")
    .map((record) => `${record.checkKind}: ${record.finding ?? record.status}`);
  const overallStatus: ResearchVerificationOverallStatus = records.some((record) => record.status === "failed")
    ? "failed"
    : records.some((record) => record.status === "inconclusive" || record.status === "pending")
      ? "inconclusive"
      : "passed";
  return {
    projectId: round.projectId,
    planId: round.planId,
    roundId,
    targetNodeId,
    overallStatus,
    records,
    blockers
  };
}

function evaluateCheck(input: {
  checkKind: VerificationCheckKind;
  snapshot: KnowledgeWorkspaceSnapshot;
  brief: ResearchBrief;
  target: KnowledgeNode;
  supportingEvidence: KnowledgeNode[];
  opposingEvidence: KnowledgeNode[];
  profiles: VerificationEvidenceProfile[];
  alternatives: KnowledgeNode[];
  sourceIds: string[];
  checkedAt: string;
}): CheckResult {
  const allEvidence = input.supportingEvidence.concat(input.opposingEvidence);
  switch (input.checkKind) {
    case "independent_sources": {
      const logicalSourceIds = new Set(input.sourceIds.map((sourceId) =>
        input.snapshot.knowledgeSourceAssets.find((source) => source.id === sourceId)!.logicalSourceId));
      return logicalSourceIds.size >= 2
        ? passed(`证据覆盖 ${logicalSourceIds.size} 个独立逻辑来源。`)
        : failed(`仅覆盖 ${logicalSourceIds.size} 个独立逻辑来源，至少需要 2 个。`);
    }
    case "primary_source_traceability": {
      const primaryCount = input.sourceIds.filter((sourceId) => {
        const kind = input.snapshot.knowledgeSourceAssets.find((source) => source.id === sourceId)!.researchSourceKind;
        return kind === "primary" || kind === "official";
      }).length;
      return primaryCount > 0
        ? passed(`找到 ${primaryCount} 个 primary/official 来源。`)
        : failed("尚未找到标记为 primary 或 official 的原始来源。 ");
    }
    case "support_and_opposition":
      return input.supportingEvidence.length > 0 && input.opposingEvidence.length > 0
        ? passed(`已处理 ${input.supportingEvidence.length} 条支持证据和 ${input.opposingEvidence.length} 条反对证据。`)
        : failed(`支持证据 ${input.supportingEvidence.length} 条，反对证据 ${input.opposingEvidence.length} 条；两类都必须处理。`);
    case "geography_consistency":
      return compareGeographies(input.profiles, input.brief.scope.geographies);
    case "unit_consistency":
      return compareSingleValue(input.profiles, "unit", "单位", input.brief.scope.units);
    case "methodology_consistency":
      return compareSingleValue(input.profiles, "methodology", "统计/研究方法");
    case "temporal_validity":
      return temporalCheck(allEvidence, input.brief.scope.time.asOf ?? input.checkedAt);
    case "conflict_of_interest":
      return conflictOfInterestCheck(input.profiles);
    case "inference_scope":
      return input.target.scope.description.trim()
        && (input.target.scope.kind === "universal" || input.target.scope.contextIds.includes(input.brief.projectId))
        ? passed(`目标结论声明适用范围：${input.target.scope.description}`)
        : failed("目标结论缺少与 Research Project 一致的适用范围。 ");
    case "alternative_explanation":
      return input.alternatives.length > 0
        ? passed(`已处理 ${input.alternatives.length} 个正式图中的替代解释。`)
        : failed("尚未在正式图中记录并关联替代解释。 ");
  }
}

function compareGeographies(profiles: VerificationEvidenceProfile[], expected: string[]): CheckResult {
  if (profiles.length === 0) return failed("没有可比较的数据地域口径。 ");
  if (profiles.some((profile) => profile.geographies.length === 0)) return inconclusive("部分证据缺少地域口径。 ");
  const signatures = new Set(profiles.map((profile) => normalizedSet(profile.geographies).join("|")));
  if (signatures.size > 1) return failed(`证据地域口径不一致：${Array.from(signatures).join(" vs ")}。`);
  const observed = normalizedSet(profiles.flatMap((profile) => profile.geographies));
  const expectedNormalized = normalizedSet(expected);
  if (expectedNormalized.length > 0 && !observed.some((value) => expectedNormalized.includes(value))) {
    return failed(`证据地域 ${observed.join(", ")} 不在 Brief 范围 ${expectedNormalized.join(", ")} 内。`);
  }
  return passed(`证据地域口径一致：${observed.join(", ")}。`);
}

function compareSingleValue(
  profiles: VerificationEvidenceProfile[],
  key: "unit" | "methodology",
  label: string,
  expected: string[] = []
): CheckResult {
  if (profiles.length === 0) return failed(`没有可比较的${label}。`);
  const values = profiles.map((profile) => profile[key]?.trim().toLowerCase());
  if (values.some((value) => !value)) return inconclusive(`部分证据缺少${label}。`);
  const distinct = new Set(values as string[]);
  if (distinct.size > 1) return failed(`${label}不一致：${Array.from(distinct).join(" vs ")}。`);
  const observed = values[0]!;
  const expectedNormalized = expected.map((value) => value.trim().toLowerCase());
  if (expectedNormalized.length > 0 && !expectedNormalized.includes(observed)) {
    return failed(`${label} ${observed} 不在 Brief 约定 ${expectedNormalized.join(", ")} 内。`);
  }
  return passed(`${label}一致：${observed}。`);
}

function temporalCheck(evidence: KnowledgeNode[], asOf: string): CheckResult {
  if (evidence.length === 0) return failed("没有证据可检查时间有效性。 ");
  const failedEvidence = evidence.filter((node) => node.epistemicStatus === "outdated"
    || node.sourceStatus === "stale"
    || node.temporalValidity.status === "expired"
    || (node.temporalValidity.validUntil !== undefined
      && Date.parse(node.temporalValidity.validUntil) < Date.parse(asOf)));
  if (failedEvidence.length > 0) return failed(`存在 ${failedEvidence.length} 条过期或失效证据：${failedEvidence.map((node) => node.id).join(", ")}。`);
  const unknownEvidence = evidence.filter((node) => node.temporalValidity.status === "unknown");
  return unknownEvidence.length > 0
    ? inconclusive(`${unknownEvidence.length} 条证据的时间有效性未知。`)
    : passed(`全部 ${evidence.length} 条证据在 ${asOf} 时点未过期。`);
}

function conflictOfInterestCheck(profiles: VerificationEvidenceProfile[]): CheckResult {
  if (profiles.length === 0) return failed("没有 Evidence Profile 可检查利益相关。 ");
  const declared = profiles.filter((profile) => profile.conflictOfInterestStatus === "declared");
  const unknown = profiles.filter((profile) => profile.conflictOfInterestStatus === "unknown");
  if (declared.length > 0) {
    return inconclusive(`有 ${declared.length} 条证据披露利益相关，需要在结论中说明：${declared.map((profile) => profile.conflictOfInterestDisclosure).join("；")}。`);
  }
  if (unknown.length > 0) return inconclusive(`${unknown.length} 条证据的利益相关状态未知。`);
  return passed("所有 Evidence Profile 均记录为未声明利益相关。 ");
}

function relatedEvidence(
  snapshot: KnowledgeWorkspaceSnapshot,
  targetNodeId: string,
  relationKind: "supports" | "contradicts"
): KnowledgeNode[] {
  return snapshot.graph.edges
    .filter((edge) => edge.kind === relationKind && edge.toNodeId === targetNodeId)
    .map((edge) => snapshot.graph.nodes.find((node) => node.id === edge.fromNodeId))
    .filter((node): node is KnowledgeNode => node?.kind === "evidence" && node.status !== "archived");
}

function normalizeProfiles(
  profiles: VerificationEvidenceProfile[],
  evidenceIds: Set<string>
): VerificationEvidenceProfile[] {
  const seen = new Set<string>();
  for (const profile of profiles) {
    if (!evidenceIds.has(profile.evidenceNodeId)) throw new Error(`Evidence profile references unrelated evidence: ${profile.evidenceNodeId}`);
    if (seen.has(profile.evidenceNodeId)) throw new Error(`Duplicate Evidence profile: ${profile.evidenceNodeId}`);
    seen.add(profile.evidenceNodeId);
    if (profile.conflictOfInterestStatus === "declared" && !profile.conflictOfInterestDisclosure?.trim()) {
      throw new Error(`Declared conflict of interest needs disclosure: ${profile.evidenceNodeId}`);
    }
  }
  for (const evidenceId of evidenceIds) {
    if (!seen.has(evidenceId)) throw new Error(`Missing Evidence profile: ${evidenceId}`);
  }
  return profiles.map((profile) => ({
    ...profile,
    geographies: normalizedSet(profile.geographies),
    unit: profile.unit?.trim() || undefined,
    methodology: profile.methodology?.trim() || undefined,
    conflictOfInterestDisclosure: profile.conflictOfInterestDisclosure?.trim() || undefined
  }));
}

function validateAlternatives(
  snapshot: KnowledgeWorkspaceSnapshot,
  targetNodeId: string,
  alternativeIds: string[],
  projectId: string
): KnowledgeNode[] {
  if (new Set(alternativeIds).size !== alternativeIds.length) throw new Error("Alternative explanation ids must be unique");
  return alternativeIds.map((id) => {
    const node = snapshot.graph.nodes.find((candidate) => candidate.id === id && candidate.status !== "archived");
    if (!node || !new Set(["claim", "hypothesis", "inference", "uncertainty"]).has(node.kind)) {
      throw new Error(`Alternative explanation is unavailable: ${id}`);
    }
    if (!node.scope.contextIds.includes(projectId)) throw new Error(`Alternative explanation belongs to another Project: ${id}`);
    if (!snapshot.graph.edges.some((edge) => edge.fromNodeId === id && edge.toNodeId === targetNodeId
      && (edge.kind === "related_to" || edge.kind === "contradicts" || edge.kind === "compares"))) {
      throw new Error(`Alternative explanation ${id} is not formally related to target ${targetNodeId}`);
    }
    return node;
  });
}

function passed(finding: string): CheckResult {
  return { status: "passed", finding };
}

function failed(finding: string): CheckResult {
  return { status: "failed", finding };
}

function inconclusive(finding: string): CheckResult {
  return { status: "inconclusive", finding };
}

function normalizedSet(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))).sort();
}

function union(left: string[], right: string[]): string[] {
  return Array.from(new Set(left.concat(right)));
}

function assertTimestamp(value: string, label: string): void {
  if (Number.isNaN(Date.parse(value))) throw new Error(`${label} must be a valid timestamp`);
}

function sanitizeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "verification";
}
