import type {
  ActorKind,
  EpistemicStatus,
  KnowledgeNode,
  KnowledgeNodeKind,
  KnowledgeSourceStatus,
  KnowledgeTemporalValidity,
  KnowledgeScope
} from "../types";
import { knowledgeNodeKindDefinitions } from "./knowledgeNodeKinds";

export const epistemicStatusLabels: Record<EpistemicStatus, string> = {
  user_asserted: "用户陈述",
  unverified: "待验证",
  supported: "已有支持",
  contested: "存在争议",
  contradicted: "已被反驳",
  outdated: "已经过时",
  context_dependent: "依赖场景",
  superseded: "已被取代"
};

export const sourceStatusLabels: Record<KnowledgeSourceStatus, string> = {
  not_applicable: "无需来源",
  unlinked: "尚未关联",
  linked: "已关联",
  verified: "来源已验证",
  stale: "来源已失效",
  conflicted: "来源冲突"
};

export interface CreateKnowledgeMetadataInput {
  kind: KnowledgeNodeKind;
  createdBy: ActorKind;
  creatorId: string;
  scopeContextId: string;
  sourceRefCount?: number;
  sourceVerified?: boolean;
}

export type KnowledgeMetadata = Pick<
  KnowledgeNode,
  "epistemicStatus" | "scope" | "temporalValidity" | "sourceStatus" | "createdBy" | "creatorId"
>;

export function createKnowledgeMetadata({
  kind,
  createdBy,
  creatorId,
  scopeContextId,
  sourceRefCount = 0,
  sourceVerified = false
}: CreateKnowledgeMetadataInput): KnowledgeMetadata {
  const definition = knowledgeNodeKindDefinitions[kind];
  const hasSources = sourceRefCount > 0;
  const sourceStatus: KnowledgeSourceStatus = hasSources
    ? sourceVerified ? "verified" : "linked"
    : definition.category === "epistemic" || definition.sourcePolicy === "required_when_verified"
      ? "unlinked"
      : "not_applicable";
  return {
    epistemicStatus: createdBy === "user"
      ? "user_asserted"
      : sourceVerified ? "supported" : "unverified",
    scope: {
      kind: "project",
      description: "仅适用于当前 Project 上下文。",
      contextIds: [scopeContextId]
    },
    temporalValidity: { status: "unknown" },
    sourceStatus,
    createdBy,
    creatorId
  };
}

export interface KnowledgeMetadataIssue {
  code: "invalid_creator" | "invalid_scope" | "invalid_temporal_validity" | "invalid_archive_metadata" | "invalid_confidence" | "inconsistent_epistemic_status" | "inconsistent_source_status";
  message: string;
}

export function validateKnowledgeMetadata(node: KnowledgeNode): KnowledgeMetadataIssue[] {
  const issues: KnowledgeMetadataIssue[] = [];
  if (!node.creatorId.trim()) {
    issues.push({ code: "invalid_creator", message: `Node ${node.id} must record creatorId` });
  }
  if (node.confidence !== undefined
    && (!Number.isFinite(node.confidence) || node.confidence < 0 || node.confidence > 1)) {
    issues.push({ code: "invalid_confidence", message: `Node ${node.id} confidence must be between 0 and 1` });
  }
  issues.push(...validateScope(node));
  issues.push(...validateTemporalValidity(node));
  issues.push(...validateArchiveMetadata(node));

  const hasSourceRefs = node.sourceRefs.length > 0;
  if (hasSourceRefs && (node.sourceStatus === "not_applicable" || node.sourceStatus === "unlinked")) {
    issues.push({
      code: "inconsistent_source_status",
      message: `Node ${node.id} has source refs but sourceStatus is ${node.sourceStatus}`
    });
  }
  if (!hasSourceRefs && !["not_applicable", "unlinked"].includes(node.sourceStatus)) {
    issues.push({
      code: "inconsistent_source_status",
      message: `Node ${node.id} has sourceStatus ${node.sourceStatus} without source refs`
    });
  }
  if ((node.kind === "fact" || node.kind === "evidence") && node.sourceStatus !== "verified") {
    issues.push({
      code: "inconsistent_source_status",
      message: `${node.kind} node ${node.id} requires sourceStatus verified`
    });
  }

  if (node.status === "verified"
    && node.epistemicStatus !== "supported"
    && node.epistemicStatus !== "context_dependent") {
    issues.push({
      code: "inconsistent_epistemic_status",
      message: `Verified node ${node.id} cannot have epistemicStatus ${node.epistemicStatus}`
    });
  }
  if (["contested", "contradicted"].includes(node.epistemicStatus)
    && node.status !== "contested"
    && node.status !== "archived") {
    issues.push({
      code: "inconsistent_epistemic_status",
      message: `Node ${node.id} with epistemicStatus ${node.epistemicStatus} must be contested`
    });
  }
  return issues;
}

function validateArchiveMetadata(node: KnowledgeNode): KnowledgeMetadataIssue[] {
  const hasArchiveMetadata = Boolean(node.archivedAt || node.archivedBy || node.archiveReason);
  if (node.status !== "archived") {
    return hasArchiveMetadata
      ? [{ code: "invalid_archive_metadata", message: `Active node ${node.id} cannot carry archive metadata` }]
      : [];
  }
  if (!node.archivedAt || !Number.isFinite(Date.parse(node.archivedAt))
    || !node.archivedBy
    || !node.archiveReason?.trim()) {
    return [{ code: "invalid_archive_metadata", message: `Archived node ${node.id} needs archivedAt, archivedBy, and archiveReason` }];
  }
  return [];
}

function validateScope(node: KnowledgeNode): KnowledgeMetadataIssue[] {
  const scope: KnowledgeScope = node.scope;
  if (!scope.description.trim()) {
    return [{ code: "invalid_scope", message: `Node ${node.id} scope needs a description` }];
  }
  if ((scope.kind === "project" || scope.kind === "context_specific") && scope.contextIds.length === 0) {
    return [{ code: "invalid_scope", message: `Node ${node.id} scope ${scope.kind} needs contextIds` }];
  }
  return [];
}

function validateTemporalValidity(node: KnowledgeNode): KnowledgeMetadataIssue[] {
  const temporal: KnowledgeTemporalValidity = node.temporalValidity;
  const timestamps = [temporal.observedAt, temporal.validFrom, temporal.validUntil].filter(
    (value): value is string => value !== undefined
  );
  if (timestamps.some((value) => !Number.isFinite(Date.parse(value)))) {
    return [{ code: "invalid_temporal_validity", message: `Node ${node.id} has an invalid timestamp` }];
  }
  if (temporal.status === "time_bound" && !temporal.validFrom && !temporal.validUntil) {
    return [{ code: "invalid_temporal_validity", message: `Node ${node.id} time_bound validity needs a boundary` }];
  }
  if (temporal.status === "expired" && !temporal.validUntil) {
    return [{ code: "invalid_temporal_validity", message: `Node ${node.id} expired validity needs validUntil` }];
  }
  if (temporal.validFrom && temporal.validUntil
    && Date.parse(temporal.validFrom) > Date.parse(temporal.validUntil)) {
    return [{ code: "invalid_temporal_validity", message: `Node ${node.id} validFrom is after validUntil` }];
  }
  return [];
}
