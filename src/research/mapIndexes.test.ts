import { describe, expect, it } from "vitest";
import { researchFixtures } from "./fixtures";
import { createResearchMapIndexes } from "./mapIndexes";

describe("research map query indexes", () => {
  it("builds stable node and parent-child lookup indexes", () => {
    const indexes = createResearchMapIndexes(researchFixtures.map);
    const root = indexes.nodesById.get(researchFixtures.map.rootNodeId);

    expect(root?.title).toBe("AlphaAiGraph 研究对象");
    expect(indexes.childrenByParentId(researchFixtures.map.rootNodeId).map((node) => node.title)).toEqual(
      expect.arrayContaining(["产品定位", "研究工作流脑图", "并行研究"]),
    );
    expect(indexes.childrenByParentId("missing-node")).toEqual([]);
  });
});
