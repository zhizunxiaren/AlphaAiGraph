import { describe, expect, it } from "vitest";
import {
  createInitialKnowledgeState,
  createSideInquiry,
  drillDownNode,
  markResearchNode,
  mergeCandidateNode,
  promoteSideInquiry,
  startParallelAnalysis,
  transitionAgentJob,
} from "./useKnowledgeApp";

describe("research workspace state", () => {
  it("drills down one selected node and avoids duplicate children", () => {
    const state = createInitialKnowledgeState();
    const target = state.researchMap.nodes.find((node) => node.title === "产品定位")!;
    const first = drillDownNode(state, target.id);
    const second = drillDownNode(first, target.id);

    expect(first.researchMap.nodes.length).toBeGreaterThan(state.researchMap.nodes.length);
    expect(second.researchMap.nodes).toHaveLength(first.researchMap.nodes.length);
  });

  it("marks node status without changing kind or markers", () => {
    const state = createInitialKnowledgeState();
    const target = state.researchMap.nodes[0];
    const next = markResearchNode(state, target.id, "verified");
    const updated = next.researchMap.nodes.find((node) => node.id === target.id)!;

    expect(updated.status).toBe("verified");
    expect(updated.kind).toBe(target.kind);
    expect(updated.markerIds).toEqual(target.markerIds);
  });

  it("creates isolated side inquiries and promotes only by explicit action", () => {
    const state = createInitialKnowledgeState();
    const node = state.researchMap.nodes[0];
    const withInquiry = createSideInquiry(state, node.id, "这个节点为什么重要？", "local_node");

    expect(withInquiry.researchMap.nodes).toEqual(state.researchMap.nodes);
    expect(withInquiry.sideInquiries).toHaveLength(state.sideInquiries.length + 1);

    const promoted = promoteSideInquiry(withInquiry, withInquiry.sideInquiries.at(-1)!.id);
    expect(promoted.conceptNotes.length).toBe(state.conceptNotes.length + 1);
    expect(promoted.sideInquiries.at(-1)?.status).toBe("promoted");
  });

  it("starts parallel analysis as candidates without mutating the main map", () => {
    const state = createInitialKnowledgeState();
    const nodeIds = state.researchMap.nodes.slice(1, 3).map((node) => node.id);
    const next = startParallelAnalysis(state, nodeIds);

    expect(next.researchMap.nodes).toEqual(state.researchMap.nodes);
    expect(next.parallelGroups.length).toBe(state.parallelGroups.length + 1);
    expect(next.candidateNodes.some((candidate) => candidate.status === "pending_review")).toBe(true);
  });

  it("requires review for conflicting candidate merge and preserves provenance for merged candidates", () => {
    const state = createInitialKnowledgeState();
    const parentNodeId = state.researchMap.rootNodeId;
    const withGroup = startParallelAnalysis(state, [parentNodeId]);
    const candidate = withGroup.candidateNodes.at(-1)!;
    const merged = mergeCandidateNode(withGroup, candidate.id);
    const mergedNode = merged.researchMap.nodes.find((node) => node.id === candidate.node.id);
    const mergedEdge = merged.researchMap.edges.find(
      (edge) => edge.fromNodeId === parentNodeId && edge.toNodeId === candidate.node.id,
    );

    expect(mergedNode?.provenance?.candidateId).toBe(candidate.id);
    expect(mergedEdge?.kind).toBe("contains");
    expect(mergedEdge?.provenance?.candidateId).toBe(candidate.id);

    const conflicting = startParallelAnalysis(state, [parentNodeId], {
      candidateTitle: "产品定位",
    });
    expect(conflicting.candidateNodes.at(-1)?.status).toBe("needs_review");
    expect(conflicting.candidateNodes.at(-1)?.conflictReason).toContain("same title");
  });

  it("revalidates candidate node conflicts at merge time", () => {
    const state = createInitialKnowledgeState();
    const parentNodeId = state.researchMap.rootNodeId;
    const withGroup = startParallelAnalysis(state, [parentNodeId], {
      candidateTitle: "late conflict",
    });
    const candidate = withGroup.candidateNodes.at(-1)!;
    const withLateConflict = {
      ...withGroup,
      researchMap: {
        ...withGroup.researchMap,
        nodes: [
          ...withGroup.researchMap.nodes,
          {
            ...candidate.node,
            id: "existing-late-conflict",
            title: candidate.node.title,
          },
        ],
      },
    };

    const next = mergeCandidateNode(withLateConflict, candidate.id);

    expect(next.researchMap.nodes.some((node) => node.id === candidate.node.id)).toBe(false);
    expect(next.candidateNodes.find((item) => item.id === candidate.id)?.status).toBe("needs_review");
    expect(next.candidateNodes.find((item) => item.id === candidate.id)?.conflictReason).toContain("same title");
  });

  it("rejects parallel analysis for missing nodes without creating orphan candidates", () => {
    const state = createInitialKnowledgeState();
    const next = startParallelAnalysis(state, ["missing-node"]);

    expect(next.parallelGroups).toHaveLength(state.parallelGroups.length);
    expect(next.jobs).toHaveLength(state.jobs.length);
    expect(next.candidateNodes).toHaveLength(state.candidateNodes.length);
    expect(next.warnings.at(-1)).toContain("missing-node");
  });

  it("rejects side inquiries for missing nodes and promotes each inquiry only once", () => {
    const state = createInitialKnowledgeState();
    const missing = createSideInquiry(state, "missing-node", "这是什么？", "local_node");
    expect(missing.sideInquiries).toHaveLength(state.sideInquiries.length);
    expect(missing.warnings.at(-1)).toContain("missing-node");

    const node = state.researchMap.nodes[0];
    const withInquiry = createSideInquiry(state, node.id, "这个节点为什么重要？", "local_node");
    const inquiryId = withInquiry.sideInquiries.at(-1)!.id;
    const promoted = promoteSideInquiry(withInquiry, inquiryId);
    const promotedAgain = promoteSideInquiry(promoted, inquiryId);

    expect(promotedAgain.conceptNotes).toHaveLength(promoted.conceptNotes.length);
    expect(promotedAgain.warnings.at(-1)).toContain(inquiryId);
  });

  it("records missing node warnings and independent job status transitions", () => {
    const state = createInitialKnowledgeState();
    const afterMissing = drillDownNode(state, "missing-node");
    const withGroup = startParallelAnalysis(state, [state.researchMap.rootNodeId]);
    const jobA = withGroup.jobs.at(-2)!;
    const jobB = withGroup.jobs.at(-1)!;
    const transitioned = transitionAgentJob(
      transitionAgentJob(withGroup, jobA.id, "failed"),
      jobB.id,
      "completed",
    );

    expect(afterMissing.warnings.at(-1)).toContain("missing-node");
    expect(transitioned.jobs.find((job) => job.id === jobA.id)?.status).toBe("failed");
    expect(transitioned.jobs.find((job) => job.id === jobB.id)?.status).toBe("completed");
  });
});
