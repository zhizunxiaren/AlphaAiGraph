import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders the AlphaAiGraph research cockpit shell", () => {
  render(<App />);

  expect(screen.getAllByText("AlphaAiGraph").length).toBeGreaterThan(0);
  expect(screen.getByText("Agent 研究过程流")).toBeInTheDocument();
  expect(screen.getByText("Research Workflow Canvas")).toBeInTheDocument();
  expect(screen.getByText("节点检查器")).toBeInTheDocument();
});
