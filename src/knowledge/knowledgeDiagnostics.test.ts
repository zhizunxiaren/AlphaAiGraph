// @vitest-environment node
import { expect, test } from "vitest";
import type {
  KnowledgeEdge,
  KnowledgeNode,
  KnowledgeSourceAsset,
  KnowledgeWorkspaceSnapshot,
  SourceAnchor
} from "../types";
import { acceptCandidateGraphPatch, createProjectWorkspace } from "./knowledgeEngine";
import { deriveKnowledgeDiagnostics, lintKnowledgeWorkspace } from "./knowledgeDiagnostics";
import { proposeInterviewAnswer } from "./interviewerPolicy";

test("detects explainable knowledge quality and maintenance lint classes deterministically", () => {
  const workspace = diagnosticWorkspace();
  const before = structuredClone(workspace);
  const diagnostics = deriveKnowledgeDiagnostics(workspace);
  const reordered = deriveKnowledgeDiagnostics({
    ...workspace,
    graph: {
      ...workspace.graph,
      nodes: [...workspace.graph.nodes].reverse(),
      edges: [...workspace.graph.edges].reverse()
    }
  });

  expect(diagnostics).toEqual(reordered);
  expect(workspace).toEqual(before);
  expect(diagnostics.counts).toEqual({
    orphan_node: 8,
    duplicate_concept: 1,
    missing_claim_source: 1,
    terminology_inconsistency: 1,
    knowledge_gap: 2,
    conflict: 1,
    outdated: 1,
    invalid_locator: 0,
    scope_ambiguity: 1
  });
  expect(diagnostics.issues.find((issue) => issue.kind === "orphan_node")?.evidence).toEqual(["活动入边：0", "活动出边：0"]);
  expect(diagnostics.issues.find((issue) => issue.kind === "duplicate_concept")).toMatchObject({
    nodeIds: ["dup-a", "dup-b"],
    confidence: 0.98,
    evidence: expect.arrayContaining(["规范化名称：retrybudget"])
  });
  expect(diagnostics.issues.find((issue) => issue.kind === "terminology_inconsistency")?.title).toContain("Jitter");
  expect(diagnostics.issues.find((issue) => issue.kind === "conflict")).toMatchObject({
    severity: "high",
    edgeIds: ["edge-conflict"]
  });
  expect(diagnostics.issues.find((issue) => issue.kind === "outdated")?.evidence).toContain("时间有效性为 expired");
  expect(diagnostics.issues.find((issue) => issue.kind === "missing_claim_source")?.nodeIds).toEqual(["gap-claim"]);
  expect(diagnostics.issues.find((issue) => issue.kind === "scope_ambiguity")?.nodeIds).toEqual(["vague-experience"]);
});

test("keeps a sourced supporting chain clean while reporting orphan nodes and locator drift", () => {
  const initial = createProjectWorkspace({ mode: "systematize", title: "Maintenance lint", subjectKind: "topic" });
  const root = initial.graph.nodes[0];
  const source: KnowledgeSourceAsset = {
    id: "lint-source",
    logicalSourceId: "lint-logical-source",
    version: 1,
    spaceId: initial.space.id,
    inventoryKind: "document",
    format: "text",
    title: "Lint source",
    uri: "memory://lint-source",
    contentHash: "lint-hash",
    byteLength: 64,
    immutable: true,
    createdAt: "2026-07-14T00:00:00.000Z"
  };
  const anchor: SourceAnchor = {
    id: "lint-anchor",
    sourceId: source.id,
    locator: { kind: "text", lineStart: 1 },
    quote: "Verified evidence.",
    contentHash: source.contentHash
  };
  const evidence = node(root, "lint-evidence", "正式证据", "带不可变定位的支持证据。", "evidence", {
    status: "verified",
    epistemicStatus: "supported",
    sourceStatus: "verified",
    sourceRefs: [{ sourceId: source.id, anchorId: anchor.id, locator: "L1", quote: anchor.quote }]
  });
  const groundedClaim = node(root, "grounded-claim", "有证据 Claim", "由正式证据支持。", "claim", {
    status: "verified",
    epistemicStatus: "supported"
  });
  const invalidClaim = node(root, "invalid-locator-claim", "定位漂移 Claim", "引用的 locator 已漂移。", "claim", {
    sourceStatus: "verified",
    sourceRefs: [{ sourceId: source.id, anchorId: anchor.id, locator: "L99", quote: anchor.quote }]
  });
  const orphan = node(root, "orphan-concept", "未连接概念", "没有任何活动关系。", "concept");
  const workspace: KnowledgeWorkspaceSnapshot = {
    ...initial,
    graph: {
      ...initial.graph,
      nodes: initial.graph.nodes.concat(evidence, groundedClaim, invalidClaim, orphan),
      edges: initial.graph.edges.concat(
        edge("contains-evidence", root.id, evidence.id, "contains"),
        edge("contains-grounded", root.id, groundedClaim.id, "contains"),
        edge("contains-invalid", root.id, invalidClaim.id, "contains"),
        edge("supports-grounded", evidence.id, groundedClaim.id, "supports")
      )
    },
    knowledgeSourceAssets: initial.knowledgeSourceAssets.concat(source),
    sourceAnchors: initial.sourceAnchors.concat(anchor)
  };
  const before = structuredClone(workspace);
  const diagnostics = lintKnowledgeWorkspace(workspace);

  expect(workspace).toEqual(before);
  expect(diagnostics.issues.some((issue) => issue.kind === "missing_claim_source"
    && issue.nodeIds.includes(groundedClaim.id))).toBe(false);
  expect(diagnostics.issues.find((issue) => issue.kind === "missing_claim_source"
    && issue.nodeIds.includes(invalidClaim.id))).toBeDefined();
  expect(diagnostics.issues.find((issue) => issue.kind === "invalid_locator")).toMatchObject({
    severity: "high",
    nodeIds: [invalidClaim.id],
    evidence: [expect.stringContaining("locator has drifted")]
  });
  expect(diagnostics.issues.find((issue) => issue.kind === "orphan_node"
    && issue.nodeIds.includes(orphan.id))).toBeDefined();
});

test("treats an accepted Interviewer Context node and valid_in_context relation as explicit scope", () => {
  let workspace = createProjectWorkspace({
    mode: "systematize",
    title: "Scope fixture",
    subjectKind: "topic"
  });
  workspace = proposeInterviewAnswer(workspace, {
    targetNodeId: workspace.selectedNodeId,
    answer: "我会限制单次请求的重试预算。",
    context: "支付服务，峰值 2000 RPS"
  });
  workspace = acceptCandidateGraphPatch(workspace, workspace.candidatePatches.at(-1)!.id);

  const diagnostics = deriveKnowledgeDiagnostics(workspace);
  const interviewNodeIds = new Set(workspace.graph.nodes
    .filter((node) => node.tags.includes("访谈外化") || node.tags.includes("访谈上下文"))
    .map((node) => node.id));
  expect(diagnostics.issues.filter((issue) =>
    issue.kind === "scope_ambiguity" && issue.nodeIds.some((nodeId) => interviewNodeIds.has(nodeId))
  )).toEqual([]);
});

function diagnosticWorkspace(): KnowledgeWorkspaceSnapshot {
  const initial = createProjectWorkspace({
    mode: "systematize",
    title: "Diagnostic fixture",
    subjectKind: "topic"
  });
  const root = initial.graph.nodes[0];
  const nodes: KnowledgeNode[] = [
    root,
    node(root, "dup-a", "Retry Budget", "限制一次请求允许消费的重试资源。", "concept"),
    node(root, "dup-b", " retry-budget ", "另一个重复定义。", "concept"),
    node(root, "dup-archived", "Retry Budget", "历史归档副本。", "concept", { status: "archived" }),
    node(root, "term-a", "Jitter", "在退避时间中加入随机偏移以避免请求同步重试。", "concept", { tags: ["术语:randomized-backoff"] }),
    node(root, "term-b", "随机化退避", "在退避时间中加入随机偏移以避免请求同步重试。", "concept", { tags: ["术语:randomized-backoff"] }),
    node(root, "gap-claim", "抖动一定降低故障率", "需要生产指标支持的判断。", "claim", { sourceStatus: "unlinked" }),
    node(root, "gap-question", "该策略在长尾延迟下是否仍然有效？", "尚无回答。", "question", { sourceStatus: "unlinked" }),
    node(root, "conflict-a", "固定退避", "所有客户端使用固定等待时间。", "concept"),
    node(root, "conflict-b", "随机退避", "所有客户端使用随机等待时间。", "concept"),
    node(root, "expired-node", "旧版重试参数", "只适用于已经下线的网关版本。", "concept", {
      epistemicStatus: "outdated",
      temporalValidity: { status: "expired", validUntil: "2025-01-01T00:00:00.000Z" }
    }),
    node(root, "vague-experience", "线上重试经验", "通常加入 jitter 就够了。", "experience", {
      createdBy: "user",
      creatorId: "local-user"
    }),
    node(root, "declared-context", "支付高峰上下文", "支付服务峰值流量。", "topic", {
      createdBy: "user",
      creatorId: "local-user",
      scope: {
        kind: "context_specific",
        description: "支付服务峰值流量",
        contextIds: [initial.project.id, "declared-context"]
      }
    }),
    node(root, "scoped-experience", "高峰重试经验", "峰值时限制重试预算。", "experience", {
      createdBy: "user",
      creatorId: "local-user",
      scope: {
        kind: "context_specific",
        description: "支付服务峰值流量",
        contextIds: [initial.project.id, "declared-context"]
      }
    })
  ];
  const edges: KnowledgeEdge[] = [
    edge("edge-conflict", "conflict-a", "conflict-b", "contradicts"),
    edge("edge-context", "scoped-experience", "declared-context", "valid_in_context")
  ];
  return {
    ...initial,
    graph: { ...initial.graph, nodes, edges }
  };
}

function node(
  root: KnowledgeNode,
  id: string,
  title: string,
  summary: string,
  kind: KnowledgeNode["kind"],
  overrides: Partial<KnowledgeNode> = {}
): KnowledgeNode {
  return {
    ...root,
    id,
    kind,
    title,
    summary,
    status: "open",
    sourceStatus: kind === "claim" || kind === "question" ? "unlinked" : "not_applicable",
    depth: 1,
    tags: [],
    sourceRefs: [],
    ...overrides
  };
}

function edge(
  id: string,
  fromNodeId: string,
  toNodeId: string,
  kind: KnowledgeEdge["kind"]
): KnowledgeEdge {
  return {
    id,
    fromNodeId,
    toNodeId,
    kind,
    rationale: `Diagnostic fixture ${kind}`,
    createdBy: "user",
    confidence: 1,
    createdAt: "2026-07-14T00:00:00.000Z"
  };
}
