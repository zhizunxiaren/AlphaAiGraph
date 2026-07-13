import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach } from "vitest";
import { useResearchWorkspace } from "../state/useResearchWorkspace";
import { AppShell } from "./AppShell";

function App() {
  return <AppShell workspace={useResearchWorkspace()} />;
}

beforeEach(() => {
  window.localStorage.clear();
});

test("renders four cockpit areas and research navigation", () => {
  render(<App />);

  expect(screen.getByLabelText("研究对象导航")).toBeInTheDocument();
  expect(screen.getByLabelText("Agent 研究过程流")).toBeInTheDocument();
  expect(screen.getByLabelText("Research Workflow Canvas")).toBeInTheDocument();
  expect(screen.getByLabelText("节点检查器")).toBeInTheDocument();
  expect(screen.getByText("候选结果")).toBeInTheDocument();
});

test("keeps the top bar minimal", () => {
  render(<App />);

  const topBar = screen.getByRole("banner");
  expect(within(topBar).getByText("AlphaAiGraph")).toBeInTheDocument();
  expect(within(topBar).queryByLabelText("当前研究路径")).not.toBeInTheDocument();
  expect(within(topBar).queryByRole("tablist", { name: "画布模式" })).not.toBeInTheDocument();
});

test("renders projects first with research graphs nested inside", () => {
  render(<App />);

  const rail = screen.getByLabelText("研究对象导航");
  const pinned = within(rail).getByLabelText("置顶");
  const projectList = within(rail).getByLabelText("项目列表");
  const graphList = within(projectList).getByLabelText("AlphaAiGraph 的研究 Graph");

  expect(within(pinned).getByRole("button", { name: "置顶 AlphaAiGraph" })).toBeInTheDocument();
  expect(within(pinned).getByRole("button", { name: "AlphaAiGraph 第一层研究地图 最近研究" })).toBeInTheDocument();
  expect(within(pinned).getByText("展开显示")).toBeInTheDocument();
  expect(within(projectList).getByRole("button", { name: "AlphaAiGraph 项目" })).toBeInTheDocument();
  expect(within(graphList).getByRole("button", { name: "AlphaAiGraph 第一层研究地图" })).toBeInTheDocument();
  expect(screen.queryByText("AI Agent 驱动的渐进式研究图谱产品 MVP。")).not.toBeInTheDocument();
});

test("renders each first-layer research node only once on the map", () => {
  render(<App />);
  const canvas = within(screen.getByLabelText("Research Workflow Canvas"));

  expect(canvas.getAllByRole("button", { name: /产品定位/ })).toHaveLength(1);
  expect(canvas.getAllByRole("button", { name: /研究工作流脑图/ })).toHaveLength(1);
  expect(canvas.getAllByRole("button", { name: /并行研究/ })).toHaveLength(1);
});

test("supports node selection, drill-down, relationship mode, and source drawer", () => {
  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: /并行研究/ }));
  expect(screen.getAllByText("后台任务只能产出候选结果，不能静默改写主图。").length).toBeGreaterThan(0);

  fireEvent.click(screen.getByRole("button", { name: /深入研究/ }));
  expect(screen.getByRole("button", { name: /候选区隔离/ })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "关系图谱" }));
  expect(screen.getByText("由研究数据投影生成")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "研究地图" }));
  fireEvent.click(screen.getAllByRole("button", { name: /并行研究 证据/ })[0]);
  expect(screen.getByText("资料抽屉")).toBeInTheDocument();
});

test("keeps a selected deep node visible on the research canvas", () => {
  render(<App />);
  const canvas = within(screen.getByLabelText("Research Workflow Canvas"));

  fireEvent.click(canvas.getByRole("button", { name: /研究工作流脑图/ }));
  fireEvent.click(screen.getByRole("button", { name: /深入研究/ }));
  const deepNode = canvas.getByRole("button", { name: /节点状态/ });
  fireEvent.click(deepNode);

  expect(canvas.getByRole("button", { name: /节点状态/ })).toHaveAttribute("aria-pressed", "true");
});

test("allows research map nodes to be dragged on the canvas", () => {
  render(<App />);

  const canvas = screen.getByLabelText("Research Workflow Canvas");
  const node = screen.getByRole("button", { name: /产品定位/ });
  const pointerEvent = (type: string, clientX: number, clientY: number) => {
    const event = new MouseEvent(type, { bubbles: true, clientX, clientY });
    Object.defineProperty(event, "pointerId", { value: 1 });
    return event;
  };

  fireEvent(node, pointerEvent("pointerdown", 100, 100));
  fireEvent(canvas, pointerEvent("pointermove", 140, 125));
  fireEvent(canvas, pointerEvent("pointerup", 140, 125));

  expect(node).toHaveStyle({ transform: "translate(40px, 25px)" });
});

test("supports collapsible project rail", () => {
  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "收起侧边栏" }));
  expect(screen.getByRole("button", { name: "展开侧边栏" })).toBeInTheDocument();
});

test("supports collapsible agent feed and node inspector", () => {
  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "收起 Agent 研究过程流" }));
  expect(screen.getByRole("button", { name: "展开 Agent 研究过程流" })).toBeInTheDocument();
  expect(screen.queryByText("地图已生成")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "收起节点检查器" }));
  expect(screen.getByRole("button", { name: "展开节点检查器" })).toBeInTheDocument();
  expect(screen.queryByText("Agent 判断理由")).not.toBeInTheDocument();
});

test("merges the collapsed project rail and agent feed into one rail", () => {
  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "收起侧边栏" }));
  fireEvent.click(screen.getByRole("button", { name: "收起 Agent 研究过程流" }));

  const projectRail = screen.getByLabelText("研究对象导航");
  expect(within(projectRail).getByRole("button", { name: "展开侧边栏" })).toBeInTheDocument();
  expect(within(projectRail).getByRole("button", { name: "展开 Agent 研究过程流" })).toBeInTheDocument();
  const railButtonLabels = Array.from(projectRail.querySelectorAll("button")).map((button) => button.getAttribute("aria-label"));
  expect(railButtonLabels.indexOf("展开 Agent 研究过程流")).toBeGreaterThan(railButtonLabels.indexOf("输出"));
  expect(screen.getByLabelText("Agent 研究过程流")).toHaveClass("merged-collapsed");
});

test("keeps collapsed rail state after remount", () => {
  const { unmount } = render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "收起侧边栏" }));
  fireEvent.click(screen.getByRole("button", { name: "收起 Agent 研究过程流" }));
  fireEvent.click(screen.getByRole("button", { name: "收起节点检查器" }));

  unmount();
  render(<App />);

  const projectRail = screen.getByLabelText("研究对象导航");
  expect(within(projectRail).getByRole("button", { name: "展开侧边栏" })).toBeInTheDocument();
  expect(within(projectRail).getByRole("button", { name: "展开 Agent 研究过程流" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "展开节点检查器" })).toBeInTheDocument();
  expect(screen.getByLabelText("Agent 研究过程流")).toHaveClass("merged-collapsed");
});

test("shows source count next to the sources navigation item", () => {
  render(<App />);

  const sourcesButton = screen.getByRole("button", { name: "资料" });
  expect(screen.queryByText("Research Object")).not.toBeInTheDocument();
  expect(within(sourcesButton).getByText("3")).toBeInTheDocument();
  expect(screen.queryByText("3 个资料")).not.toBeInTheDocument();
  expect(screen.queryByText("当前路径")).not.toBeInTheDocument();
  expect(screen.queryByText("项目工程")).not.toBeInTheDocument();
  expect(screen.queryByText("MVP 研究驾驶舱")).not.toBeInTheDocument();
  expect(screen.queryByText("运行中")).not.toBeInTheDocument();
  expect(screen.queryByText("project")).not.toBeInTheDocument();
  expect(screen.queryByText("running")).not.toBeInTheDocument();
});

test("uses project rail navigation for sources, candidates, and outputs", () => {
  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "资料" }));
  expect(screen.getByRole("complementary", { name: "资料抽屉" })).toHaveClass("open");
  expect(screen.getByText("AGENTS.md")).toBeInTheDocument();
  expect(screen.getByText("Plan.md")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "候选结果" }));
  expect(within(screen.getByLabelText("节点检查器")).getByText("手动审核合并策略")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "输出" }));
  expect(screen.getByText("MVP 实现期间持续运行测试验证。")).toBeInTheDocument();
});

test("duplicates a node with alt left-button drag", () => {
  render(<App />);

  const canvas = screen.getByLabelText("Research Workflow Canvas");
  const node = screen.getByRole("button", { name: /产品定位/ });
  const pointerEvent = (type: string, clientX: number, clientY: number) => {
    const event = new MouseEvent(type, { bubbles: true, clientX, clientY, altKey: true });
    Object.defineProperty(event, "pointerId", { value: 2 });
    return event;
  };

  fireEvent(node, pointerEvent("pointerdown", 100, 100));
  fireEvent(canvas, pointerEvent("pointermove", 122, 134));
  fireEvent(canvas, pointerEvent("pointerup", 122, 134));

  expect(within(canvas).getByRole("button", { name: /产品定位 副本/ })).toBeInTheDocument();
});

test("keeps alt-drag duplicate under the pointer instead of jumping to its layout slot", () => {
  render(<App />);

  const canvas = screen.getByLabelText("Research Workflow Canvas");
  const node = screen.getByRole("button", { name: /产品定位/ });
  const pointerEvent = (type: string, clientX: number, clientY: number) => {
    const event = new MouseEvent(type, { bubbles: true, clientX, clientY, altKey: true });
    Object.defineProperty(event, "pointerId", { value: 4 });
    return event;
  };

  fireEvent(node, pointerEvent("pointerdown", 100, 100));
  fireEvent(canvas, pointerEvent("pointermove", 122, 134));
  fireEvent(canvas, pointerEvent("pointerup", 122, 134));

  const copy = within(canvas).getByRole("button", { name: /产品定位 副本/ });
  expect(copy).toHaveStyle({ left: "780px", top: "28px", transform: "translate(-310px, 52px)" });
});

test("pans and zooms the canvas with ctrl mouse gestures", () => {
  render(<App />);

  const canvas = screen.getByLabelText("Research Workflow Canvas");
  const transformLayer = screen.getByTestId("canvas-transform");
  const pointerEvent = (type: string, clientX: number, clientY: number) => {
    const event = new MouseEvent(type, { bubbles: true, clientX, clientY, ctrlKey: true });
    Object.defineProperty(event, "pointerId", { value: 3 });
    return event;
  };

  fireEvent(canvas, pointerEvent("pointerdown", 100, 100));
  fireEvent(canvas, pointerEvent("pointermove", 138, 116));
  fireEvent(canvas, pointerEvent("pointerup", 138, 116));
  expect(transformLayer).toHaveStyle({ transform: "translate(38px, 16px) scale(1)" });

  fireEvent.wheel(canvas, { ctrlKey: true, deltaY: -120, clientX: 160, clientY: 120 });
  expect(transformLayer.style.transform).toContain("scale(1.08)");
});
