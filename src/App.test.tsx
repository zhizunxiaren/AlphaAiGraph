import { fireEvent, render, screen, within } from "@testing-library/react";
import App from "./App";

test("renders the knowledge graph as the primary workspace", () => {
  render(<App />);

  expect(screen.getAllByText("AlphaAiGraph").length).toBeGreaterThan(0);
  const views = screen.getByLabelText("图谱视图");
  expect(within(views).getByRole("button", { name: /分析脑图/ })).toBeInTheDocument();
  expect(within(views).getByRole("button", { name: /知识网络/ })).toBeInTheDocument();
  expect(within(views).getByRole("button", { name: /技术路线/ })).toBeInTheDocument();
  expect(screen.getByText("图谱是主数据")).toBeInTheDocument();

  fireEvent.click(within(views).getByRole("button", { name: /技术路线/ }));
  expect(screen.getByRole("heading", { level: 2, name: "技术路线" })).toBeInTheDocument();
  expect(within(screen.getByLabelText("知识图谱画布")).getByRole("button", { name: /方案 A：渐进接入/ })).toBeInTheDocument();
});

test("lets every node drill down, ask and summarize into the graph", () => {
  render(<App />);
  const canvas = screen.getByLabelText("知识图谱画布");
  fireEvent.click(within(canvas).getByRole("button", { name: /核心原理/ }));
  expect(screen.getByLabelText("本次 Agent 上下文")).toHaveTextContent("核心原理");
  fireEvent.click(screen.getByRole("button", { name: /生成下钻建议/ }));
  expect(within(canvas).queryByRole("button", { name: /执行模型/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /接受并写入图谱/ }));
  expect(within(canvas).getByRole("button", { name: /执行模型/ })).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("围绕这个点继续提问"), { target: { value: "它的主要权衡是什么？" } });
  fireEvent.click(screen.getByRole("button", { name: /生成回答建议/ }));
  expect(within(canvas).queryByText("核心原理 · 回答 1")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /接受并写入图谱/ }));
  expect(within(canvas).getByText("核心原理 · 回答 1")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /生成总结建议/ }));
  fireEvent.click(screen.getByRole("button", { name: /接受并写入图谱/ }));
  expect(within(canvas).getByText(/阶段总结/)).toBeInTheDocument();
});

test("starts a new analysis from a task-first launcher", () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /开始新分析/ }));
  expect(screen.getByRole("dialog", { name: "你想从哪里开始？" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /分析一篇文档/ }));
  fireEvent.change(screen.getByLabelText("分析对象"), { target: { value: "RFC 9457" } });
  fireEvent.click(screen.getByRole("button", { name: /生成第一层知识地图/ }));

  expect(screen.getAllByText("RFC 9457").length).toBeGreaterThan(0);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
