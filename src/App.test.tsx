import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { vi } from "vitest";
import App from "./App";
import type { KnowledgeSearchProvider } from "./knowledge/explorerPolicy";
import { legacyResearchAuditWorkspace } from "./knowledge/fixtures/legacyResearchWorkspace";
import { createKnowledgeWorkspace } from "./knowledge/knowledgeEngine";
import { encodeMarkdownWikiVaultZip, exportKnowledgeWorkspaceToMarkdownVault } from "./knowledge/markdownWikiVault";

test("renders the knowledge graph as the primary workspace", () => {
  render(<App />);

  expect(screen.getAllByText("AlphaAiGraph").length).toBeGreaterThan(0);
  expect(screen.getByRole("link", { name: "跳到主要内容" })).toHaveAttribute("href", "#knowledge-main");
  const views = screen.getByLabelText("图谱视图");
  expect(within(views).getByRole("button", { name: /分析脑图/ })).toBeInTheDocument();
  expect(within(views).getByRole("button", { name: /知识网络/ })).toBeInTheDocument();
  expect(within(views).queryByRole("button", { name: /技术路线/ })).not.toBeInTheDocument();
  expect(screen.getByText("图谱是主数据")).toBeInTheDocument();
  expect(screen.getAllByText("搞清楚一个东西").length).toBeGreaterThan(0);
  const insights = screen.getByLabelText("理解范围与知识缺口");
  expect(insights).toHaveTextContent("结构探索");
  expect(insights).toHaveTextContent("17%");
  expect(insights).toHaveTextContent("尚未继续下钻");
});

test("audits a legacy Research JSON without importing unverifiable evidence or raw command output", async () => {
  render(<App />);
  const file = new File([JSON.stringify(legacyResearchAuditWorkspace)], "legacy-research.json", {
    type: "application/json"
  });

  fireEvent.change(screen.getByLabelText("迁入旧 Research 工作区 JSON"), {
    target: { files: [file] }
  });

  expect(await screen.findByText(/没有可安全迁移的 V1 数据/)).toHaveTextContent(
    "命令执行仅作为脱敏历史报告，未写入 workspace"
  );
  expect(screen.queryByText("迁移旧 Research 证据")).not.toBeInTheDocument();
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

test("starts a Project by choosing intent independently from subject kind", () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /创建 Project/ }));
  expect(screen.getByRole("dialog", { name: "你想完成什么？" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /我想搞清楚一个东西/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /我想梳理已有知识体系/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /我想研究问题并得到结论/ }));
  fireEvent.change(screen.getByLabelText("对象类型"), { target: { value: "document" } });
  fireEvent.change(screen.getByLabelText("Project 目标"), { target: { value: "判断错误响应规范是否适合采用" } });
  fireEvent.change(screen.getByLabelText("认知或研究对象"), { target: { value: "RFC 9457" } });
  fireEvent.click(screen.getByRole("button", { name: /创建 研究问题并形成结论 Project/ }));

  expect(screen.getAllByText("RFC 9457").length).toBeGreaterThan(0);
  expect(screen.getByText("判断错误响应规范是否适合采用")).toBeInTheDocument();
  expect(within(screen.getByLabelText("知识图谱画布")).getByRole("button", { name: /核心研究问题/ })).toBeInTheDocument();
  expect(within(screen.getByLabelText("图谱视图")).queryByRole("button", { name: /技术路线/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("imports a real Markdown file, reviews its first map, and exposes source locators", async () => {
  render(<App />);
  const file = new File([
    "# Imported Guide\n\nThis is the source root.\n\n## Evidence\n\nTraceable source text."
  ], "imported-guide.md", { type: "text/markdown" });

  fireEvent.change(screen.getByLabelText("导入 Markdown、文本或 PDF 文档"), {
    target: { files: [file] }
  });

  expect(await screen.findByText(/已解析 2 个来源片段/)).toBeInTheDocument();
  expect(screen.getByText("导入「imported-guide.md」的第一层地图")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /接受并写入图谱/ }));

  const canvas = screen.getByLabelText("知识图谱画布");
  fireEvent.click(within(canvas).getByRole("button", { name: /Evidence/ }));
  const provenance = screen.getByLabelText("节点来源定位");
  expect(provenance).toHaveTextContent("imported-guide.md");
  expect(provenance).toHaveTextContent(/L5-L7 · Imported Guide > Evidence/);
  expect(provenance).toHaveTextContent("Traceable source text.");
});

test("records user experience into a Systematize KnowledgeInventory before graph review", async () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /创建 Project/ }));
  fireEvent.click(screen.getByRole("button", { name: /我想梳理已有知识体系/ }));
  fireEvent.change(screen.getByLabelText("认知或研究对象"), { target: { value: "Rust 服务工程经验" } });
  fireEvent.click(screen.getByRole("button", { name: /创建 梳理与完善知识体系 Project/ }));

  const viewNavigation = screen.getByRole("navigation", { name: "图谱视图" });
  expect(within(viewNavigation).getByRole("button", { name: /知识模块/ })).toBeInTheDocument();
  expect(within(viewNavigation).getByRole("button", { name: /技能树/ })).toBeInTheDocument();
  expect(within(viewNavigation).getByRole("button", { name: /学习依赖/ })).toBeInTheDocument();
  expect(within(viewNavigation).getByRole("button", { name: /学习路径/ })).toBeInTheDocument();
  expect(within(viewNavigation).getByRole("button", { name: /实践手册/ })).toBeInTheDocument();
  fireEvent.click(within(viewNavigation).getByRole("button", { name: /学习路径/ }));
  expect(screen.getByLabelText("学习路径投影")).toHaveTextContent("补充明确依赖后才会生成学习路径");

  const inventory = screen.getByLabelText("KnowledgeInventory");
  expect(inventory).toHaveTextContent("笔记 0");
  expect(inventory).toHaveTextContent("经验 0");
  fireEvent.click(screen.getByRole("button", { name: /录入已有知识/ }));
  const dialog = screen.getByRole("dialog", { name: "录入已有知识" });
  fireEvent.change(within(dialog).getByLabelText("知识类型"), { target: { value: "experience" } });
  fireEvent.change(within(dialog).getByLabelText("标题"), { target: { value: "重试风暴处理经验" } });
  fireEvent.change(within(dialog).getByLabelText("内容"), {
    target: { value: "在支付服务中，指数退避加入 jitter 后显著减少了重试风暴。" }
  });
  fireEvent.click(within(dialog).getByRole("button", { name: /保存到库存并生成候选结构/ }));

  expect(await screen.findByText(/已录入经验陈述，1 个片段等待审核/)).toBeInTheDocument();
  expect(inventory).toHaveTextContent("经验 1");
  expect(inventory).toHaveTextContent("1 待审核");
  expect(screen.getByText("导入「重试风暴处理经验」的第一层地图")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /接受并写入图谱/ }));

  expect(inventory).toHaveTextContent("1 已入图");
  fireEvent.click(within(viewNavigation).getByRole("button", { name: /实践手册/ }));
  const manual = screen.getByLabelText("实践手册投影");
  expect(manual).toHaveTextContent("方法与步骤");
  expect(manual).toHaveTextContent("重试风暴处理经验");
  const diagnostics = screen.getByLabelText("知识诊断");
  expect(diagnostics).toHaveTextContent("适用范围 1");
  fireEvent.click(within(diagnostics).getByRole("button", { name: /适用范围不明/ }));
  expect(screen.getByLabelText("节点思考面板")).toHaveTextContent("经验");
  expect(screen.getByLabelText("节点来源定位")).toHaveTextContent("重试风暴处理经验");
});

test("runs a contextual Interviewer turn through Candidate Graph Patch review", () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /创建 Project/ }));
  fireEvent.click(screen.getByRole("button", { name: /我想梳理已有知识体系/ }));
  fireEvent.change(screen.getByLabelText("Project 目标"), { target: { value: "沉淀支付服务生产经验" } });
  fireEvent.change(screen.getByLabelText("认知或研究对象"), { target: { value: "支付服务可靠性" } });
  fireEvent.click(screen.getByRole("button", { name: /创建 梳理与完善知识体系 Project/ }));

  const interviewer = screen.getByLabelText("Interviewer 隐性知识访谈");
  expect(interviewer).toHaveTextContent("0/6");
  expect(interviewer).toHaveTextContent("沉淀支付服务生产经验");
  const submit = within(interviewer).getByRole("button", { name: /生成访谈候选知识/ });
  expect(submit).toBeDisabled();
  fireEvent.change(within(interviewer).getByLabelText("访谈回答"), {
    target: { value: "我会先限制重试预算，再为退避加入 jitter。" }
  });
  fireEvent.change(within(interviewer).getByLabelText("适用上下文（必填）"), {
    target: { value: "支付服务，峰值 2000 RPS，5 人后端团队" }
  });
  fireEvent.change(within(interviewer).getByLabelText("约束与前提（可选）"), {
    target: { value: "请求具备幂等键" }
  });
  fireEvent.click(submit);

  expect(interviewer).toHaveTextContent("请先接受或拒绝");
  expect(screen.getByText("外化「支付服务可靠性」的实际目标")).toBeInTheDocument();
  expect(within(screen.getByLabelText("知识图谱画布")).queryByText(/支付服务可靠性 · 实际目标/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /接受并写入图谱/ }));

  expect(interviewer).toHaveTextContent("1/6");
  expect(interviewer).toHaveTextContent("请按真实执行顺序");
  const answerNode = within(screen.getByLabelText("知识图谱画布")).getByRole("button", { name: /支付服务可靠性 · 实际目标/ });
  fireEvent.click(answerNode);
  expect(screen.getByLabelText("节点思考面板")).toHaveTextContent("限定场景");
  expect(screen.getByLabelText("节点思考面板")).toHaveTextContent("支付服务，峰值 2000 RPS，5 人后端团队");
});

test("explores adjacent domains, counterexamples, and captures searched source text", async () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /创建 Project/ }));
  fireEvent.click(screen.getByRole("button", { name: /我想梳理已有知识体系/ }));
  fireEvent.change(screen.getByLabelText("认知或研究对象"), { target: { value: "重试策略" } });
  fireEvent.click(screen.getByRole("button", { name: /创建 梳理与完善知识体系 Project/ }));

  const explorer = screen.getByLabelText("Explorer 探索与验证");
  expect(explorer).toHaveTextContent("搜索新资料");
  expect(explorer).toHaveTextContent("发现相邻领域");
  expect(explorer).toHaveTextContent("寻找反例");
  expect(explorer).toHaveTextContent("未配置可信 Provider");
  expect(within(explorer).getAllByRole("link", { name: /打开浏览器搜索/ })).toHaveLength(4);

  fireEvent.click(within(explorer).getByRole("button", { name: /生成反例与待验证问题/ }));
  expect(screen.getByText("探索「重试策略」的边界与反例")).toBeInTheDocument();
  expect(within(screen.getByLabelText("知识图谱画布")).queryByText(/候选反例/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /接受并写入图谱/ }));
  expect(within(screen.getByLabelText("知识图谱画布")).getByRole("button", { name: /候选反例/ })).toBeInTheDocument();

  fireEvent.click(within(explorer).getAllByRole("button", { name: "手动收录" })[0]);
  const dialog = screen.getByRole("dialog", { name: "收录搜索资料" });
  expect(dialog).toHaveTextContent("搜索结果摘要不会被当成来源");
  fireEvent.change(within(dialog).getByLabelText("资料标题"), { target: { value: "重试预算指南" } });
  fireEvent.change(within(dialog).getByLabelText("原始 URL"), { target: { value: "https://example.com/retry-budget?utm_source=test" } });
  fireEvent.change(within(dialog).getByLabelText("实际正文或原文摘录"), { target: { value: "重试预算必须设置上限，并记录耗尽条件。" } });
  fireEvent.click(within(dialog).getByRole("button", { name: /保存来源并生成候选结构/ }));

  expect(await screen.findByText(/已收录「重试预算指南」/)).toBeInTheDocument();
  expect(screen.getByText("导入「重试预算指南」的第一层地图")).toBeInTheDocument();
});

test("searches through a disclosed Explorer provider, filters results, and batch-captures page bodies", async () => {
  const provider: KnowledgeSearchProvider = {
    id: "trusted-ui-test",
    disclosure: {
      privacyNotice: "仅发送查询和用户选择的结果 URL，不发送知识图谱。",
      costNotice: "测试 Provider 每次查询计费。",
      sends: "query_and_result_url",
      pricing: "metered"
    },
    search: vi.fn().mockResolvedValue([
      {
        title: "重试策略官方指南 v2.0",
        url: "https://official.example/retry/v2",
        logicalUrl: "https://official.example/retry",
        versionLabel: "2.0",
        publishedAt: "2026-06-01T00:00:00.000Z",
        sourceKind: "primary",
        providerId: "trusted-ui-test",
        snippet: "重试策略应设置有界预算。"
      },
      {
        title: "重试策略官方指南 v1.0",
        url: "https://official.example/retry/v1",
        logicalUrl: "https://official.example/retry",
        versionLabel: "1.0",
        publishedAt: "2025-06-01T00:00:00.000Z",
        sourceKind: "official",
        providerId: "trusted-ui-test"
      },
      {
        title: "社区重试策略讨论",
        url: "https://community.example/retry",
        sourceKind: "community",
        providerId: "trusted-ui-test"
      }
    ]),
    capture: vi.fn().mockResolvedValue({
      content: "重试策略应设置有界预算，并记录预算耗尽时的失败处理。",
      mediaType: "text/plain"
    })
  };
  render(<App explorerSearchProvider={provider} />);
  fireEvent.click(screen.getByRole("button", { name: /创建 Project/ }));
  fireEvent.click(screen.getByRole("button", { name: /我想梳理已有知识体系/ }));
  fireEvent.change(screen.getByLabelText("认知或研究对象"), { target: { value: "重试策略" } });
  fireEvent.click(screen.getByRole("button", { name: /创建 梳理与完善知识体系 Project/ }));

  const explorer = screen.getByLabelText("Explorer 探索与验证");
  expect(explorer).toHaveTextContent("trusted-ui-test");
  expect(explorer).toHaveTextContent("不发送知识图谱");
  expect(explorer).toHaveTextContent("按量计费");
  fireEvent.click(within(explorer).getAllByRole("button", { name: /站内搜索/ })[0]);

  expect(await within(explorer).findByRole("link", { name: /重试策略官方指南 v2.0/ })).toBeInTheDocument();
  expect(within(explorer).queryByRole("link", { name: /v1.0/ })).not.toBeInTheDocument();
  fireEvent.change(within(explorer).getByLabelText("来源"), { target: { value: "original" } });
  expect(within(explorer).queryByRole("link", { name: /社区重试策略讨论/ })).not.toBeInTheDocument();

  fireEvent.click(within(explorer).getByLabelText("选择搜索结果：重试策略官方指南 v2.0"));
  fireEvent.click(within(explorer).getByRole("button", { name: /收录所选 \(1\)/ }));

  expect(await within(explorer).findByText(/批量收录完成：1 个新增/)).toBeInTheDocument();
  expect(screen.getByText("导入「重试策略官方指南 v2.0」的第一层地图")).toBeInTheDocument();
  expect(provider.capture).toHaveBeenCalledTimes(1);
});

test("offers an explicit retry after an Explorer provider failure", async () => {
  const search = vi.fn<KnowledgeSearchProvider["search"]>()
    .mockRejectedValueOnce(new Error("Provider offline"))
    .mockRejectedValueOnce(new Error("Provider offline"))
    .mockResolvedValueOnce([{ title: "Recovered result", url: "https://example.com/recovered", providerId: "retry-ui" }]);
  render(<App explorerSearchProvider={{ id: "retry-ui", search }} />);
  fireEvent.click(screen.getByRole("button", { name: /创建 Project/ }));
  fireEvent.click(screen.getByRole("button", { name: /我想梳理已有知识体系/ }));
  fireEvent.change(screen.getByLabelText("认知或研究对象"), { target: { value: "重试策略" } });
  fireEvent.click(screen.getByRole("button", { name: /创建 梳理与完善知识体系 Project/ }));

  const explorer = screen.getByLabelText("Explorer 探索与验证");
  fireEvent.click(within(explorer).getAllByRole("button", { name: /站内搜索/ })[0]);
  expect(await within(explorer).findByRole("alert")).toHaveTextContent("Provider offline");
  fireEvent.click(within(explorer).getByRole("button", { name: "重试" }));

  expect(await within(explorer).findByRole("link", { name: /Recovered result/ })).toBeInTheDocument();
  expect(search).toHaveBeenCalledTimes(3);
});

test("proposes a source-grounded correction without overwriting previous knowledge", async () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /创建 Project/ }));
  fireEvent.click(screen.getByRole("button", { name: /我想梳理已有知识体系/ }));
  fireEvent.change(screen.getByLabelText("认知或研究对象"), { target: { value: "缓存策略" } });
  fireEvent.click(screen.getByRole("button", { name: /创建 梳理与完善知识体系 Project/ }));

  fireEvent.click(screen.getByRole("button", { name: /录入已有知识/ }));
  const importDialog = screen.getByRole("dialog", { name: "录入已有知识" });
  fireEvent.change(within(importDialog).getByLabelText("标题"), { target: { value: "缓存失效边界证据" } });
  fireEvent.change(within(importDialog).getByLabelText("内容"), { target: { value: "缓存仅适用于允许短暂陈旧、并具备主动失效机制的数据。" } });
  fireEvent.click(within(importDialog).getByRole("button", { name: /保存到库存并生成候选结构/ }));
  expect(await screen.findByText(/已录入用户笔记/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /接受并写入图谱/ }));

  fireEvent.click(screen.getByRole("button", { name: /录入已有知识/ }));
  const oppositionDialog = screen.getByRole("dialog", { name: "录入已有知识" });
  fireEvent.change(within(oppositionDialog).getByLabelText("标题"), { target: { value: "缓存强一致性反对证据" } });
  fireEvent.change(within(oppositionDialog).getByLabelText("内容"), { target: { value: "账户余额等强一致数据不应接受短暂陈旧，缓存可能造成错误决策。" } });
  fireEvent.click(within(oppositionDialog).getByRole("button", { name: /保存到库存并生成候选结构/ }));
  expect(await screen.findByText(/已录入用户笔记/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /接受并写入图谱/ }));

  const canvas = screen.getByLabelText("知识图谱画布");
  fireEvent.click(within(canvas).getByRole("button", { name: /缓存策略/ }));
  fireEvent.click(screen.getByRole("button", { name: /生成总结建议/ }));
  fireEvent.click(screen.getByRole("button", { name: /接受并写入图谱/ }));
  fireEvent.click(within(canvas).getByText("缓存策略").closest("button")!);
  const correction = screen.getByLabelText("纠偏建议");
  expect(correction).toHaveTextContent("2 条可用来源");
  const submit = within(correction).getByRole("button", { name: /生成带证据的纠偏建议/ });
  expect(submit).toBeDisabled();
  fireEvent.change(within(correction).getByLabelText("错误类型"), { target: { value: "scope_overgeneralization" } });
  fireEvent.change(within(correction).getByLabelText("修正内容"), { target: { value: "缓存只应在允许短暂陈旧且具备主动失效机制时使用。" } });
  fireEvent.change(within(correction).getByLabelText("适用范围"), { target: { value: "读多写少、允许 30 秒陈旧的服务" } });
  fireEvent.click(within(correction).getByLabelText("支持修正：缓存失效边界证据"));
  fireEvent.click(within(correction).getByLabelText("反对修正：缓存强一致性反对证据"));
  expect(submit).toBeEnabled();
  fireEvent.click(submit);

  expect(screen.getByText("纠偏「缓存策略」：适用范围过度泛化")).toBeInTheDocument();
  const impact = screen.getByLabelText("纠偏影响评估");
  expect(impact).toHaveTextContent("总结 1");
  expect(impact).toHaveTextContent("缓存策略 · 阶段总结");
  expect(impact).toHaveTextContent("接受纠偏后，将为每个受影响节点创建独立待复核任务");
  expect(within(canvas).queryByRole("button", { name: /缓存策略 · 修正/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /接受并写入图谱/ }));

  expect(within(canvas).getByText("缓存策略 · 修正").closest("button")).toBeInTheDocument();
  expect(within(canvas).getByText("缓存策略").closest("button")).toBeInTheDocument();
  expect(screen.getByLabelText("节点思考面板")).toHaveTextContent("限定场景");
  expect(screen.getByLabelText("节点思考面板")).toHaveTextContent("读多写少、允许 30 秒陈旧的服务");
  const reviewPanel = screen.getByLabelText("下游影响复核");
  expect(reviewPanel).toHaveTextContent("1 待处理 / 1");
  const reviewTask = within(reviewPanel).getByLabelText("复核任务：缓存策略 · 阶段总结");
  expect(reviewTask).toHaveTextContent("创建任务");
  fireEvent.click(within(reviewTask).getByRole("button", { name: /接受现状/ }));
  expect(reviewTask).toHaveTextContent("已接受现状");
  expect(reviewTask).toHaveTextContent("复核历史 2");
});

test("shows candidate answers as unresolved and navigates from the insight panel", () => {
  render(<App />);
  fireEvent.change(screen.getByLabelText("围绕这个点继续提问"), {
    target: { value: "理解范围是否已经完整？" }
  });
  fireEvent.click(screen.getByRole("button", { name: /生成回答建议/ }));
  fireEvent.click(screen.getByRole("button", { name: /接受并写入图谱/ }));

  const insights = screen.getByLabelText("理解范围与知识缺口");
  const question = within(insights).getByRole("button", { name: /理解范围是否已经完整.*已有候选回答，尚未确认理解/ });
  fireEvent.click(question);

  expect(screen.getByLabelText("本次 Agent 上下文")).toHaveTextContent("理解范围是否已经完整？");
  expect(insights).toHaveTextContent("第一层地图");
});

test("requires explicit completion confirmation, then reopens the Understand Project", () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "完成 Project" }));
  const dialog = screen.getByRole("dialog", { name: "确认当前理解已达到目标？" });
  expect(dialog).toHaveTextContent("5 知识缺口");
  const confirm = within(dialog).getByRole("button", { name: /确认完成 Project/ });
  expect(confirm).toBeDisabled();

  fireEvent.click(within(dialog).getByRole("checkbox"));
  expect(confirm).toBeEnabled();
  fireEvent.click(confirm);

  expect(screen.getByLabelText("Project 已完成")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "重新打开并继续" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /生成总结建议/ })).toBeDisabled();
  expect(screen.getByLabelText("导入 Markdown、文本或 PDF 文档")).toBeDisabled();

  fireEvent.click(screen.getByRole("button", { name: "重新打开并继续" }));
  expect(screen.queryByLabelText("Project 已完成")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "完成 Project" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /生成总结建议/ })).toBeEnabled();
  expect(screen.getByText("reviewing")).toBeInTheDocument();
});

test("downloads a deterministic Markdown Wiki without changing the graph", () => {
  const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
  const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
  const createObjectURL = vi.fn(() => "blob:alpha-ai-graph-wiki");
  const revokeObjectURL = vi.fn();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
  let downloadedName = "";
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    downloadedName = this.download;
  });
  try {
    render(<App />);
    const canvas = screen.getByLabelText("知识图谱画布");
    const nodeCountBefore = within(canvas).getAllByRole("button").length;
    fireEvent.click(screen.getByRole("button", { name: "导出 Markdown Wiki" }));

    expect(screen.getByRole("status")).toHaveTextContent("webassembly-component-model.wiki.md");
    expect(downloadedName).toBe("webassembly-component-model.wiki.md");
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:alpha-ai-graph-wiki");
    expect(within(canvas).getAllByRole("button")).toHaveLength(nodeCountBefore);
  } finally {
    click.mockRestore();
    if (originalCreateObjectUrl) Object.defineProperty(URL, "createObjectURL", originalCreateObjectUrl);
    else delete (URL as { createObjectURL?: typeof URL.createObjectURL }).createObjectURL;
    if (originalRevokeObjectUrl) Object.defineProperty(URL, "revokeObjectURL", originalRevokeObjectUrl);
    else delete (URL as { revokeObjectURL?: typeof URL.revokeObjectURL }).revokeObjectURL;
  }
});

test("downloads and round trips an Obsidian-compatible Wiki Vault", async () => {
  const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
  const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
  const createObjectURL = vi.fn(() => "blob:alpha-ai-graph-obsidian-vault");
  const revokeObjectURL = vi.fn();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
  let downloadedName = "";
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    downloadedName = this.download;
  });
  try {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "导出 Obsidian Vault" }));
    expect(screen.getByRole("status")).toHaveTextContent("webassembly-component-model.obsidian.zip");
    expect(downloadedName).toBe("webassembly-component-model.obsidian.zip");
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));

    const vault = exportKnowledgeWorkspaceToMarkdownVault(createKnowledgeWorkspace());
    const bytes = encodeMarkdownWikiVaultZip(vault);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const file = new File([buffer], vault.archiveFileName, { type: "application/zip" });
    fireEvent.change(screen.getByLabelText("导回 Obsidian Wiki Vault ZIP"), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/与当前 KnowledgeGraph 完全一致/));
  } finally {
    click.mockRestore();
    if (originalCreateObjectUrl) Object.defineProperty(URL, "createObjectURL", originalCreateObjectUrl);
    else delete (URL as { createObjectURL?: typeof URL.createObjectURL }).createObjectURL;
    if (originalRevokeObjectUrl) Object.defineProperty(URL, "revokeObjectURL", originalRevokeObjectUrl);
    else delete (URL as { revokeObjectURL?: typeof URL.revokeObjectURL }).revokeObjectURL;
  }
});
