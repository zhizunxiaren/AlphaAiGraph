# AlphaAiGraph 开发者指南

> 当前产品方向：AI 驱动的认知、知识体系构建与研究平台  
> 适用实现：`Plan-v2.md` / workspace schema v2

## 先读什么

开发或评审前按以下顺序建立上下文：

1. `docs/superpowers/specs/2026-07-13-alpha-ai-graph-product-philosophy.md`
2. `docs/superpowers/specs/2026-07-14-alpha-ai-graph-project-model-alignment.md`
3. `Plan-v2.md`
4. 与任务直接相关的 `docs/superpowers/specs/` contract 或评估报告
5. `src/types.ts` 与对应 Rust serde contract

发生冲突时，上位产品不变量优先；运行时字段则以当前 TypeScript/Rust contract 和测试为准。2026 年 5 月的 Research Map/Cockpit/UI 文档、`Plan.md` 和 `wiki/` 中的旧摘要是历史资料，不是实现入口。

## 产品边界

AlphaAiGraph 只有一个顶层产品模型：`Project`。

- `ProjectMode`：`understand | systematize | research`，表达用户目标。
- `SubjectKind`：`technology | document | paper | codebase | industry | topic | question`，表达处理对象。
- `KnowledgeSpace`：共享一个 canonical `KnowledgeGraph` 并容纳多个 Project。
- `ProjectSubject`：把 Project 的对象和 root node 关联起来，不拥有一份独立图谱。

不要按文件类型新增第四种 Project，不要为 Systematize 或 Research 建立第二套 node/edge，不要把技术路线恢复成所有 Project 的固定主视图。

## 分层与数据流

```text
UI / useKnowledgeWorkspace
  -> Project policy 与 KnowledgeSelection
  -> AgentRequest / KnowledgeAgentInput
  -> provider 或本地确定性 policy
  -> CandidateGraphPatch
  -> graphPatch 语义与 CAS 门禁
  -> 用户接受或拒绝
  -> canonical KnowledgeGraph + audit history

Source bytes
  -> parser registry
  -> immutable KnowledgeSourceAsset version
  -> SourceAnchor / locator
  -> source CandidateGraphPatch
  -> canonical KnowledgeGraph
```

Knowledge Graph 保存认知结果。Research Brief、Plan、Task、Round、SearchQuery、VerificationRecord 和 AgentRun 属于 orchestration/audit；它们可以引用 graph/source/patch ID，但不能复制结论正文形成独立报告主数据。

## 模块导航

| 领域 | 入口 | 约束 |
| --- | --- | --- |
| 权威类型 | `src/types.ts` | TS/Rust JSON 字段必须对齐 |
| 主状态与 UI | `src/state/useKnowledgeWorkspace.ts`、`src/components/KnowledgeWorkspaceShell.tsx` | 不建立第二个 workspace store |
| 图谱写入 | `src/knowledge/knowledgeEngine.ts`、`graphPatch.ts` | 高影响写入必须经过 Candidate Patch |
| 图查询与大图 | `knowledgeGraphQuery.ts`、`knowledgeGraphProjection.ts` | 默认遵守 Project scope；局部投影不改主图 |
| 来源 | `sourceIngest.ts`、`sourceParserRegistry.ts`、`builtinSourceParsers.ts`、`pdfJsSourceParser.ts` | source version 不可变；locator 必须可校验 |
| 来源追踪 | `provenance.ts`、`sourceOutline.ts` | verified Claim 必须可追溯 |
| Agent | `agentBoundary.ts`、`agentRuntime.ts`、`providers/` | provider 输出只产生 pending patch |
| Systematize | `knowledgeInventory.ts`、`interviewerPolicy.ts`、`knowledgeDiagnostics.ts`、`correctionPolicy.ts` | 用户经验保留 `user_asserted` 与适用上下文 |
| Research | `researchOrchestration.ts`、`researchSearch.ts`、`researchRound.ts`、`researchVerification.ts`、`researchConclusion.ts`、`researchRoute*.ts` | 结论和路线必须经过验证与来源门禁 |
| 持久化 | `workspacePersistence.ts` | schema v2；加载时重跑领域门禁并拒绝敏感字段 |
| Wiki | `markdownWikiExporter.ts`、`markdownWikiVault.ts`、`deterministicZip.ts` | 导回差异仍需 Patch 审核 |
| V1 导入 | `legacyResearchMigration.ts` | 唯一旧 Research JSON 边界；不信任旧 verified/merged 状态 |
| Rust | `crates/` | `alpha_graph_core` 负责 contract，不放前端业务状态 |

## 开发流程

1. 阅读 `AGENTS.md` 的删除、隐私和 git 红线。
2. 从 `Plan-v2.md` 或明确用户请求确定范围；不要顺手扩张到无关迁移或重构。
3. 修改数据模型时先定义不变量和失败模式，再同步 TypeScript、Rust、持久化 migration 和测试。
4. 修改图写入时覆盖“提议前不变、接受后生效、拒绝不落图、篡改被拒绝”。
5. 修改来源时覆盖 hash/version/locator/quote 漂移和无来源 Claim。
6. 修改 Project scope、Research 编排或跨 Project 复用时覆盖跨 Project ID 注入。
7. 完成前按规定顺序运行全量门禁并检查工作区。

## 命令

```powershell
# 开发
npm install
npm run dev
npm run start:web

# 聚焦测试
npm test -- src/App.test.tsx
npm test -- src/knowledge/knowledgeEngine.test.ts

# 完整门禁：顺序不可调换
npm test
npm run build
cargo test --workspace

# 可选评估
npm run benchmark:graph
npm run benchmark:search

# 完成前检查
git diff --check
git status --short
git diff --cached --name-only
```

Vitest 使用 jsdom，setup 位于 `src/test/setup.ts`。Graph/Search benchmark 默认与普通测试隔离；搜索真实 embedding 用例可能使用用户模型缓存，不应让 CI 的普通测试隐式下载模型。

## 测试责任

| 变更 | 最低专项覆盖 |
| --- | --- |
| Project/type contract | TypeScript 创建/校验 + Rust serde round-trip |
| Graph operation | operation audit、CAS、接受、拒绝、非法 endpoint |
| Source/parser | 真实 bytes、immutable version、locator、hash、无来源拒绝 |
| Agent/provider | schema、超时、重试、错误分类、usage/cost、浏览器 key 拒绝 |
| Persistence | save/load round-trip、旧 schema migration、敏感字段、篡改 |
| Research | Project/Plan/Round/Task scope、verification gate、来源追溯 |
| Wiki import/export | 确定性 bytes、round-trip、path/CRC/size 门禁、差异审核 |
| 大图或搜索 | 固定 fixture、正确性指标、P95 latency、预算和复现实录 |

## Provider 集成

`KnowledgeAgentProvider` 是 provider-neutral 边界。当前有 OpenAI-compatible HTTP adapter，以及 DeepSeek、GLM 配置封装。新增 provider 时：

- 输出必须符合 `KnowledgeAgentOutput` 严格 JSON contract；
- 不得允许 provider 返回 accepted patch 或直接写 graph；
- timeout、retry、attempt log、token usage 和 cost estimate 必须保留；
- API key 默认不得在浏览器 runtime 使用，生产接入应通过可信后端或桌面桥；
- key、请求凭证和原始私有响应不得进入 workspace 或 git。

Explorer 使用独立的 `KnowledgeSearchProvider` listing / capture 边界。`explorerSearchProvider.ts` 只连接可信 HTTPS 后端或 localhost bridge，不接受浏览器 key，固定省略 cookies 与 referrer；搜索只发送查询，抓取只发送用户明确选择的 URL。Provider 必须声明隐私与费用，支持 timeout、retry 和 AbortSignal。搜索 execution 不得写入 workspace schema；实际正文仍通过 `sourceIngest`、immutable raw store 和 Candidate Patch 审核。未配置 Provider 时必须保留浏览器 handoff 和手动原文收录。

## 持久化与兼容

- `KnowledgeWorkspaceDocument.schemaVersion` 当前为 2。
- browser adapter 使用 `localStorage` 保存 opaque JSON；领域校验和 migration 在 adapter 上层执行。
- `subject` 是 `project.subject` 的 deprecated in-memory alias，不是第二个 Subject 主数据。
- V1 `ResearchWorkspaceSnapshot` 只用于 `legacyResearchMigration` 的显式 JSON 导入。
- 旧 evidence 必须与当前 immutable source 的 `contentHash` 精确匹配；旧 merged candidate 重新降为 pending patch。
- 旧 command/script/stdout/stderr 只返回脱敏 history 摘要，绝不持久化。
- Rust 中仍有少量 `ResearchNode` 兼容公共 API；切换调用方和测试前不要删除。

## 文档维护

产品方向改变时先更新产品理念并显式记录迁移决策；工程 contract 改变时同步 Project model spec、`src/types.ts`、Rust、持久化和 Plan。评估报告应记录 fixture、环境、指标、门槛和限制，不把一次 benchmark 结果直接写成永久架构结论。

README 面向使用者和新贡献者，本文面向实现者，`AGENTS.md` 负责工作区操作与 Agent 行为约束。三者应引用同一产品方向，但避免复制易过时的逐任务完成数量。
