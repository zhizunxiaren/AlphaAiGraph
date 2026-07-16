import { expect, test } from "vitest";
import contractFixture from "./fixtures/project-contract.json";
import { createKnowledgeMetadata } from "./knowledgeMetadata";
import { createProjectRecord, toProjectSubject, validateProjectContract } from "./projectModel";
import type { AnalysisSubject, KnowledgeGraph, Project, ProjectSubject } from "../types";

const subject: ProjectSubject = contractFixture.subject as ProjectSubject;

function graph(): KnowledgeGraph {
  return {
    id: contractFixture.graphId,
    title: "Rust async runtime 知识图谱",
    rootNodeIds: [subject.rootNodeId],
    nodes: [{
      id: subject.rootNodeId,
      kind: "subject",
      title: subject.title,
      summary: subject.description,
      status: "open",
      ...createKnowledgeMetadata({
        kind: "subject",
        createdBy: "agent",
        creatorId: "test-agent",
        scopeContextId: contractFixture.id
      }),
      depth: 0,
      tags: ["technology"],
      sourceRefs: [],
      createdAt: contractFixture.createdAt,
      updatedAt: contractFixture.updatedAt
    }],
    edges: [],
    createdAt: contractFixture.createdAt,
    updatedAt: contractFixture.updatedAt
  };
}

test("creates the shared TypeScript/Rust project contract fixture", () => {
  const project = createProjectRecord({
    id: contractFixture.id,
    spaceId: contractFixture.spaceId,
    graphId: contractFixture.graphId,
    mode: "understand",
    title: contractFixture.title,
    subject
  });

  expect(project).toEqual(contractFixture);
  expect(validateProjectContract(project, graph())).toEqual([]);
});

test("rejects workflow, graph, root-node, and completion contract violations", () => {
  const invalid = {
    ...contractFixture,
    graphId: "graph-other",
    workflow: { mode: "research", phase: "brief" },
    status: "completed",
    goal: "",
    subject: { ...subject, rootNodeId: "missing" }
  } as Project;

  expect(validateProjectContract(invalid, graph())).toEqual([
    "workflow mode must match project mode",
    "project graphId must reference the active knowledge graph",
    "subject rootNodeId must exist in the knowledge graph",
    "completed project must record completedAt",
    "completed project workflow must be completed",
    "project goal must not be empty"
  ]);
});

test("adapts a stage-0 AnalysisSubject without changing its meaning", () => {
  const legacy: AnalysisSubject = { ...subject, createdAt: contractFixture.createdAt };
  expect(toProjectSubject(legacy)).toEqual(subject);
});
