import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("AlphaAiGraph app shell", () => {
  it("renders the four-zone research cockpit", () => {
    render(<App />);

    expect(screen.getByRole("banner", { name: "研究上下文" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "研究对象导航" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Agent 研究过程流" })).toBeInTheDocument();
    expect(screen.getByRole("main", { name: "研究 workflow 脑图" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "节点检查器" })).toBeInTheDocument();
  });

  it("renders path context, readable markers, evidence, candidates and side inquiries", () => {
    render(<App />);

    expect(screen.getAllByText("AlphaAiGraph").length).toBeGreaterThan(0);
    expect(screen.getByText("当前研究路径")).toBeInTheDocument();
    expect(screen.getAllByText("关系图谱").length).toBeGreaterThan(0);
    expect(screen.getAllByText("重点").length).toBeGreaterThan(0);
    expect(screen.getByText("证据锚点")).toBeInTheDocument();
    expect(screen.getByText("候选结果区")).toBeInTheDocument();
    expect(screen.getByText("合并前不写入主图")).toBeInTheDocument();
    expect(screen.getAllByText("旁路临时会话").length).toBeGreaterThan(0);
    expect(screen.getByText("旁路会话默认不修改主研究图")).toBeInTheDocument();
  });

  it("opens and closes the source drawer from the cockpit", async () => {
    render(<App />);

    await userEvent.click(screen.getByRole("button", { name: "打开资料抽屉" }));
    const drawer = screen.getByRole("complementary", { name: "资料抽屉" });
    expect(drawer).toBeInTheDocument();
    expect(within(drawer).getAllByText("AGENTS.md").length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("button", { name: "关闭资料抽屉" }));
    expect(screen.queryByRole("complementary", { name: "资料抽屉" })).not.toBeInTheDocument();
  });

  it("closes and reopens the node inspector", async () => {
    render(<App />);

    expect(screen.getByRole("complementary", { name: "节点检查器" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "关闭节点检查器" }));

    expect(screen.queryByRole("complementary", { name: "节点检查器" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "打开节点检查器" }));

    expect(screen.getByRole("complementary", { name: "节点检查器" })).toBeInTheDocument();
  });

  it("groups collapsed left cockpit panes into one icon rail", async () => {
    const { container } = render(<App />);
    const grid = container.querySelector(".cockpit-grid");
    expect(grid).not.toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "收起研究对象导航" }));
    expect(screen.getByRole("complementary", { name: "左侧折叠栏" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "展开研究对象导航" })).toBeInTheDocument();
    expect(screen.queryByRole("separator", { name: "调整研究对象导航宽度" })).not.toBeInTheDocument();
    expect(grid).toHaveStyle({
      gridTemplateColumns: "76px 320px 8px minmax(0, 1fr) 8px 320px",
    });

    await userEvent.click(screen.getByRole("button", { name: "收起 Agent 研究过程流" }));
    expect(screen.getByRole("button", { name: "展开 Agent 研究过程流" })).toBeInTheDocument();
    expect(screen.queryByRole("separator", { name: "调整研究过程流宽度" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("complementary", { name: "左侧折叠栏" })).getAllByRole("button")).toHaveLength(2);
    expect(screen.queryByRole("complementary", { name: "Agent 研究过程流" })).not.toBeInTheDocument();
    expect(grid).toHaveStyle({
      gridTemplateColumns: "76px minmax(0, 1fr) 8px 320px",
    });

    await userEvent.click(screen.getByRole("button", { name: "展开研究对象导航" }));
    expect(screen.getByRole("button", { name: "收起研究对象导航" })).toBeInTheDocument();
    expect(screen.getByRole("separator", { name: "调整研究对象导航宽度" })).toBeInTheDocument();
    expect(grid).toHaveStyle({
      gridTemplateColumns: "76px 210px 8px minmax(0, 1fr) 8px 320px",
    });

    await userEvent.click(screen.getByRole("button", { name: "展开 Agent 研究过程流" }));
    expect(screen.getByRole("button", { name: "收起 Agent 研究过程流" })).toBeInTheDocument();
    expect(screen.getByRole("separator", { name: "调整研究过程流宽度" })).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "左侧折叠栏" })).not.toBeInTheDocument();
    expect(grid).toHaveStyle({
      gridTemplateColumns: "210px 8px 320px 8px minmax(0, 1fr) 8px 320px",
    });
  });

  it("lets users resize the cockpit panes by dragging separators", () => {
    const { container } = render(<App />);

    const grid = container.querySelector(".cockpit-grid");
    expect(grid).not.toBeNull();

    fireEvent.mouseDown(screen.getByRole("separator", { name: "调整研究对象导航宽度" }), {
      clientX: 210,
      button: 0,
    });
    fireEvent.mouseMove(window, { clientX: 250, buttons: 1 });
    fireEvent.mouseUp(window, { clientX: 250 });

    expect(grid).toHaveStyle({
      gridTemplateColumns: "250px 8px 320px 8px minmax(0, 1fr) 8px 320px",
    });

    fireEvent.mouseDown(screen.getByRole("separator", { name: "调整节点检查器宽度" }), {
      clientX: 1500,
      button: 0,
    });
    fireEvent.mouseMove(window, { clientX: 1460, buttons: 1 });
    fireEvent.mouseUp(window, { clientX: 1460 });

    expect(grid).toHaveStyle({
      gridTemplateColumns: "250px 8px 320px 8px minmax(0, 1fr) 8px 360px",
    });
  });

  it("lets users drag graph nodes on the research map", () => {
    render(<App />);

    const stage = screen.getByTestId("workflow-stage");
    const node = screen.getByRole("button", { name: "产品定位" });
    fireEvent.mouseDown(node, { clientX: 20, clientY: 30, button: 0 });
    fireEvent.mouseMove(node, { clientX: 56, clientY: 48, buttons: 1 });
    fireEvent.mouseUp(node, { clientX: 56, clientY: 48 });

    expect(node).toHaveStyle({ transform: "translate(36px, 18px)" });
    expect(stage).not.toHaveStyle({ transform: "translate(36px, 18px)" });
  });

  it("lets users drag candidate and waiting graph cards", () => {
    const { container } = render(<App />);

    const candidate = container.querySelector(".candidate-node");
    expect(candidate).not.toBeNull();
    fireEvent.mouseDown(candidate!, { clientX: 80, clientY: 90, button: 0 });
    fireEvent.mouseMove(candidate!, { clientX: 124, clientY: 118, buttons: 1 });

    expect(candidate).toHaveStyle({ transform: "translate(44px, 28px)" });
    expect(container.querySelectorAll(".workflow-edge.edge-active").length).toBeGreaterThan(0);

    fireEvent.mouseUp(candidate!, { clientX: 124, clientY: 118 });

    const waitingCard = screen.getByText("等待下钻").closest("button");
    expect(waitingCard).not.toBeNull();
    fireEvent.mouseDown(waitingCard!, { clientX: 180, clientY: 190, button: 0 });
    fireEvent.mouseMove(waitingCard!, { clientX: 150, clientY: 212, buttons: 1 });
    fireEvent.mouseUp(waitingCard!, { clientX: 150, clientY: 212 });

    expect(waitingCard).toHaveStyle({ transform: "translate(-30px, 22px)" });
  });

  it("turns the placeholder into a drill-down action for the selected node", async () => {
    render(<App />);

    await userEvent.click(screen.getByRole("button", { name: "产品定位" }));

    expect(screen.queryByText("选择一个可下钻节点后，再展开下一层研究问题。")).not.toBeInTheDocument();
    const drillPlaceholder = screen.getByRole("button", { name: "展开 产品定位" });
    expect(drillPlaceholder).toHaveTextContent("展开 产品定位");
    expect(drillPlaceholder).toHaveTextContent("只展开该节点的下一层研究问题。");

    await userEvent.click(drillPlaceholder);
    expect(screen.getByText("目标用户与主场景")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "展开 产品定位" })).not.toBeInTheDocument();
  });

  it("lets users pan the research canvas from empty space", () => {
    render(<App />);

    const canvas = screen.getByLabelText("研究地图平移画布");
    const stage = screen.getByTestId("workflow-stage");
    fireEvent.mouseDown(canvas, { clientX: 200, clientY: 220, button: 0 });
    fireEvent.mouseMove(canvas, { clientX: 244, clientY: 208, buttons: 1 });
    fireEvent.mouseUp(canvas, { clientX: 244, clientY: 208 });

    expect(stage).toHaveStyle({ transform: "translate(44px, -12px)" });
  });

  it("renders visible connector lines between research graph nodes", () => {
    render(<App />);

    expect(screen.getByLabelText("研究节点连线")).toBeInTheDocument();
    expect(screen.getAllByTestId("research-map-edge").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("candidate-map-edge").length).toBeGreaterThan(0);
    expect(screen.getByTestId("placeholder-map-edge")).toBeInTheDocument();
  });

  it("anchors connector lines to node edges and keeps them curved", () => {
    render(<App />);

    const edge = screen.getAllByTestId("research-map-edge")[0];

    expect(edge).toHaveAttribute("data-anchor", "target-left-edge");
    expect(edge).toHaveAttribute("data-path-style", "floating-curve");
    expect(edge.getAttribute("d")).toContain("C");
  });

  it("highlights connected edges while dragging a graph node", () => {
    const { container } = render(<App />);

    const node = screen.getByRole("button", { name: "产品定位" });
    fireEvent.mouseDown(node, { clientX: 20, clientY: 30, button: 0 });
    fireEvent.mouseMove(node, { clientX: 56, clientY: 48, buttons: 1 });

    expect(container.querySelectorAll(".workflow-edge.edge-active").length).toBeGreaterThan(0);

    fireEvent.mouseUp(node, { clientX: 56, clientY: 48 });
    expect(container.querySelectorAll(".workflow-edge.edge-active").length).toBe(0);
  });

  it("drills down from a selected node through the UI", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "产品定位" }));
    await userEvent.click(screen.getByRole("button", { name: "深入研究" }));

    expect(screen.getByText("目标用户与主场景")).toBeInTheDocument();
  });

  it("switches to projected relationship graph mode", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "切换到关系图谱" }));

    expect(screen.getByText("Obsidian-style 关系图谱")).toBeInTheDocument();
    expect(screen.getByText("由研究数据投影生成，不是主数据源")).toBeInTheDocument();
    expect(screen.getAllByText("research_node").length).toBeGreaterThan(0);
  });
});
