import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppShell } from "./AppShell";
import { createInitialKnowledgeState } from "../state/useKnowledgeApp";

describe("component workbench states", () => {
  it("shows empty, loading and warning states", () => {
    const state = createInitialKnowledgeState();
    render(
      <AppShell
        state={{
          ...state,
          selectedNodeId: undefined,
          jobs: state.jobs.map((job, index) =>
            index === 0 ? { ...job, status: "running" } : job,
          ),
          warnings: ["missing-node 不存在"],
        }}
      />,
    );

    expect(screen.getByText("请选择研究节点")).toBeInTheDocument();
    expect(screen.getByText("运行中")).toBeInTheDocument();
    expect(screen.getByText("missing-node 不存在")).toBeInTheDocument();
  });

  it("keeps candidate results visually separated from the main map", () => {
    const state = createInitialKnowledgeState();
    render(<AppShell state={state} />);

    expect(screen.getByText("候选结果区")).toBeInTheDocument();
    expect(screen.getAllByText("待审核").length).toBeGreaterThan(0);
    expect(screen.getByText("合并前不写入主图")).toBeInTheDocument();
  });
});
