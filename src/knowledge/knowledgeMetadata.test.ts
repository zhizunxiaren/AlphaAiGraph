import { expect, test } from "vitest";
import type { KnowledgeNode } from "../types";
import {
  createKnowledgeMetadata,
  epistemicStatusLabels,
  sourceStatusLabels,
  validateKnowledgeMetadata
} from "./knowledgeMetadata";

test("creates separate epistemic, scope, time, creator and source metadata", () => {
  const metadata = createKnowledgeMetadata({
    kind: "hypothesis",
    createdBy: "agent",
    creatorId: "alpha-ai-graph",
    scopeContextId: "project-research"
  });
  expect(metadata).toEqual({
    epistemicStatus: "unverified",
    scope: {
      kind: "project",
      description: "仅适用于当前 Project 上下文。",
      contextIds: ["project-research"]
    },
    temporalValidity: { status: "unknown" },
    sourceStatus: "unlinked",
    createdBy: "agent",
    creatorId: "alpha-ai-graph"
  });

  const userMetadata = createKnowledgeMetadata({
    kind: "experience",
    createdBy: "user",
    creatorId: "local-user",
    scopeContextId: "project-systematize"
  });
  expect(userMetadata.epistemicStatus).toBe("user_asserted");
  expect(userMetadata.sourceStatus).toBe("not_applicable");
  expect(epistemicStatusLabels.context_dependent).toBe("依赖场景");
  expect(sourceStatusLabels.verified).toBe("来源已验证");
});

test("marks hash-backed source metadata as supported and verified", () => {
  const metadata = createKnowledgeMetadata({
    kind: "fact",
    createdBy: "agent",
    creatorId: "alpha-ai-graph",
    scopeContextId: "project-understand",
    sourceRefCount: 1,
    sourceVerified: true
  });
  expect(metadata.epistemicStatus).toBe("supported");
  expect(metadata.sourceStatus).toBe("verified");
});

test("rejects inconsistent metadata and invalid temporal ranges", () => {
  const invalid: KnowledgeNode = {
    id: "invalid-metadata",
    kind: "claim",
    title: "Invalid",
    summary: "Invalid",
    status: "verified",
    epistemicStatus: "unverified",
    scope: { kind: "context_specific", description: "", contextIds: [] },
    temporalValidity: {
      status: "time_bound",
      validFrom: "2026-08-01T00:00:00.000Z",
      validUntil: "2026-07-01T00:00:00.000Z"
    },
    sourceStatus: "verified",
    depth: 1,
    tags: [],
    sourceRefs: [],
    createdBy: "agent",
    creatorId: "",
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z"
  };

  expect(validateKnowledgeMetadata(invalid).map((issue) => issue.code)).toEqual([
    "invalid_creator",
    "invalid_scope",
    "invalid_temporal_validity",
    "inconsistent_source_status",
    "inconsistent_epistemic_status"
  ]);
});

test("requires an expiry boundary and aligns contested knowledge with workflow status", () => {
  const base: KnowledgeNode = {
    id: "contested-node",
    kind: "claim",
    title: "Contested",
    summary: "Contested",
    status: "open",
    ...createKnowledgeMetadata({
      kind: "claim",
      createdBy: "agent",
      creatorId: "critic-agent",
      scopeContextId: "project-research"
    }),
    epistemicStatus: "contradicted",
    temporalValidity: { status: "expired" },
    depth: 1,
    tags: [],
    sourceRefs: [],
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z"
  };
  expect(validateKnowledgeMetadata(base).map((issue) => issue.code)).toEqual([
    "invalid_temporal_validity",
    "inconsistent_epistemic_status"
  ]);
});
