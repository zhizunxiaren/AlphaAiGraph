import type { ResearchWorkspaceSnapshot } from "../../types";

const legacyNow = "2026-05-09T00:00:00.000Z";

/**
 * Minimal V1 envelope used only to verify the governed JSON-import boundary.
 * It intentionally contains an execution payload that must be reported only as
 * sanitized history and must never enter the V2 workspace.
 */
export const legacyResearchAuditWorkspace: ResearchWorkspaceSnapshot = {
  object: {
    id: "legacy-object-audit",
    kind: "project",
    title: "Legacy Research audit fixture",
    description: "Exercises safe handling of unverifiable V1 data.",
    createdAt: legacyNow,
    updatedAt: legacyNow,
    status: "mapped",
    metadata: { fixture: "legacy-migration-audit" }
  },
  session: {
    id: "legacy-session-audit",
    objectId: "legacy-object-audit",
    title: "Legacy audit session",
    activeMapId: "legacy-map-audit",
    activeThreadIds: [],
    status: "completed",
    createdAt: legacyNow,
    updatedAt: legacyNow
  },
  threads: [],
  map: {
    id: "legacy-map-audit",
    sessionId: "legacy-session-audit",
    title: "Legacy audit map",
    rootNodeId: "legacy-root-audit",
    nodes: [{
      id: "legacy-root-audit",
      mapId: "legacy-map-audit",
      kind: "root",
      title: "Legacy audit root",
      summary: "No source-backed knowledge is eligible for migration.",
      depth: 0,
      order: 0,
      expansionState: "expanded",
      status: "understood",
      markers: [],
      evidenceIds: [],
      actionIds: [],
      inquiryIds: [],
      conceptNoteIds: [],
      createdBy: "agent",
      createdAt: legacyNow,
      updatedAt: legacyNow
    }],
    edges: [],
    createdAt: legacyNow,
    updatedAt: legacyNow
  },
  sourceAssets: [],
  evidenceAnchors: [],
  actions: [],
  jobs: [],
  parallelGroups: [],
  executionRuns: [{
    id: "legacy-run-audit",
    actionId: "legacy-action-audit",
    nodeId: "legacy-root-audit",
    command: "tool --token must-not-persist",
    script: "read-private-output",
    startedAt: legacyNow,
    finishedAt: legacyNow,
    status: "passed",
    exitCode: 0,
    stdout: "raw output must not persist",
    stderr: "raw error must not persist",
    resultSummary: "旧命令已执行，仅允许迁移脱敏摘要。"
  }],
  sideInquiries: [],
  conceptNotes: [],
  knowledgeDigests: [],
  candidates: []
};
