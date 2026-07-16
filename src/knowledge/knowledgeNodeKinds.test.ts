import { expect, test } from "vitest";
import { knowledgeNodeKindDefinitions, knowledgeNodeKindLabels } from "./knowledgeNodeKinds";

test("defines every cognitive node kind with one UI label and governance policy", () => {
  expect(Object.keys(knowledgeNodeKindDefinitions)).toEqual(expect.arrayContaining([
    "fact",
    "hypothesis",
    "inference",
    "conclusion",
    "uncertainty",
    "skill",
    "practice",
    "experience"
  ]));
  expect(knowledgeNodeKindDefinitions.fact).toMatchObject({
    category: "epistemic",
    sourcePolicy: "required"
  });
  expect(knowledgeNodeKindDefinitions.hypothesis.sourcePolicy).toBe("optional");
  expect(knowledgeNodeKindDefinitions.conclusion.sourcePolicy).toBe("required_when_verified");
  expect(knowledgeNodeKindDefinitions.experience.category).toBe("capability");
  expect(knowledgeNodeKindLabels.inference).toBe("推理");
});
