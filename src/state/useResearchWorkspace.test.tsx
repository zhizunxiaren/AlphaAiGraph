import { act, renderHook } from "@testing-library/react";
import { researchNow } from "../research/fixtures";
import { useResearchWorkspace } from "./useResearchWorkspace";

test("drills down selected node without expanding unrelated branches", () => {
  const { result } = renderHook(() => useResearchWorkspace());

  act(() => result.current.drillDownNode("node-workflow-map"));

  expect(result.current.map.nodes.filter((node) => node.parentId === "node-workflow-map")).toHaveLength(3);
  expect(result.current.map.nodes.filter((node) => node.parentId === "node-parallel-research")).toHaveLength(0);

  act(() => result.current.drillDownNode("node-workflow-map"));

  expect(result.current.map.nodes.filter((node) => node.parentId === "node-workflow-map")).toHaveLength(3);
});

test("creates isolated side inquiry and promotes only on explicit action", () => {
  const { result } = renderHook(() => useResearchWorkspace());
  const beforeNodeCount = result.current.map.nodes.length;
  const beforeMap = result.current.map;

  act(() => result.current.createSideInquiry("node-workflow-map", "marker 为什么不是节点类型？", "local_node"));

  expect(result.current.map.nodes).toHaveLength(beforeNodeCount);
  expect(result.current.map).toBe(beforeMap);
  expect(result.current.sideInquiries.at(-1)?.messages.at(-1)?.content).toContain("local_node");
  expect(result.current.conceptNotes).toHaveLength(0);

  const inquiryId = result.current.sideInquiries.at(-1)!.id;
  act(() => result.current.promoteInquiry(inquiryId));

  expect(result.current.conceptNotes).toHaveLength(1);
  expect(result.current.map.nodes.find((node) => node.id === "node-workflow-map")?.conceptNoteIds).toContain(`concept-${inquiryId}`);
  expect(result.current.relationshipGraph.nodes.some((node) => node.kind === "concept_note")).toBe(true);
});

test("keeps parallel candidates isolated until explicit merge", () => {
  const { result } = renderHook(() => useResearchWorkspace());

  act(() => result.current.startParallelAnalysis(["node-workflow-map"]));

  const candidate = result.current.candidates.at(-1)!;
  const groupId = candidate.groupId;
  expect(result.current.map.nodes.some((node) => node.id === candidate.node.id)).toBe(false);

  act(() => result.current.mergeCandidate(candidate.id));

  expect(result.current.map.nodes.some((node) => node.id === candidate.node.id)).toBe(true);
  expect(result.current.candidates.find((item) => item.id === candidate.id)?.status).toBe("merged");
  expect(result.current.parallelGroups.find((group) => group.id === groupId)?.status).toBe("merged");

  act(() => result.current.dismissCandidate(candidate.id));

  expect(result.current.candidates.find((item) => item.id === candidate.id)?.status).toBe("merged");
  expect(result.current.map.nodes.some((node) => node.id === candidate.node.id)).toBe(true);
});

test("keeps thread job references and runtime timestamps in sync", () => {
  const { result } = renderHook(() => useResearchWorkspace());

  act(() => result.current.drillDownNode("node-workflow-map"));

  const drillJob = result.current.jobs.at(-1)!;
  expect(result.current.threads[0].jobIds).toContain(drillJob.id);
  expect(drillJob.createdAt).not.toBe(researchNow);

  act(() => result.current.startParallelAnalysis(["node-parallel-research"]));

  const parallelJob = result.current.jobs.at(-1)!;
  expect(result.current.threads[0].jobIds).toContain(parallelJob.id);
  expect(parallelJob.createdAt).not.toBe(researchNow);
});

test("does not duplicate the research map root", () => {
  const { result } = renderHook(() => useResearchWorkspace());
  const beforeCount = result.current.map.nodes.length;
  let copyId: string | undefined;

  act(() => {
    copyId = result.current.duplicateNode(result.current.map.rootNodeId);
  });

  expect(copyId).toBeUndefined();
  expect(result.current.map.nodes).toHaveLength(beforeCount);
  expect(result.current.map.nodes.filter((node) => !node.parentId)).toHaveLength(1);
});
