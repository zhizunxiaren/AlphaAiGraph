# AlphaAiGraph V2 知识路线系统实施计划

> 产品规格：`docs/superpowers/specs/2026-07-13-alpha-ai-graph-knowledge-route-system.md`

## 目标

以单一 `KnowledgeGraph` 为主数据，把脑图分析、任意下钻、节点提问、阶段总结、长期知识沉淀和技术路线决策统一为同一个可持续生长的系统。

## 执行原则

- 每个阶段都必须同时有行为测试和构建验证。
- 新能力只进入 V2 knowledge model；旧 research model 只做迁移兼容和必要 bugfix。
- 原始资料不可变；事实性知识必须能回溯来源。
- Agent 生成 graph patch，用户或明确策略决定是否接受高影响变更。
- 不批量删除旧模块。迁移完成后列出归档/删除清单，由用户确认并手动处理生成目录。
- 完成声明前按顺序运行 `npm test` → `npm run build` → `cargo test --workspace`。

## 阶段 0：产品模型重置（已完成）

- [x] 明确 `KnowledgeGraph` 是唯一主数据。
- [x] 定义 `KnowledgeNode`、`KnowledgeEdge`、`KnowledgeView`、`AnalysisSubject`、`NodeConversation`。
- [x] 同步 Rust core 第一版知识图谱结构。
- [x] 实现确定性第一层知识图谱。
- [x] 实现任意节点渐进下钻和幂等保护。
- [x] 实现节点提问与回答入图。
- [x] 实现局部总结与 `summarizes` 关系。
- [x] 实现可见 `KnowledgeSelection / Context Packet` 和上下文范围切换。
- [x] 实现 `AgentRequest -> CandidateGraphPatch -> 接受/拒绝` 治理闭环。
- [x] 实现任务优先的新分析入口。
- [x] 应用入口切换到 V2 知识路线工作台。
- [x] 保留旧驾驶舱为兼容测试层。
- [x] 建立 LLM Wiki 目录约定与维护文件。
- [x] 完成真实浏览器视觉复核。
- [x] 三条全量验收命令通过。

## 阶段 1：来源与文档分析

- [ ] 定义通用 `IngestRequest` / `IngestResult` / `SourceAnchor` contract。
- [ ] 支持 Markdown、纯文本和 PDF 的最小解析路径。
- [ ] 把文档目录转换为第一层知识节点，而不是一份孤立摘要。
- [ ] 每个 claim/evidence 保留页码、章节、行号或 URI locator。
- [ ] 原始资料写入不可变 raw layer。
- [ ] 加入无来源 claim 和失效 locator 测试。

## 阶段 2：真实 Agent 与候选 Graph Patch

- [ ] 定义 Agent 输入上下文：当前节点、邻居、来源、未解决问题。
- [ ] 定义候选 graph patch：create/update/link/archive。
- [x] 第一版 create node/edge/conversation patch 与人工接受/拒绝流程。
- [ ] 补齐 update/link/archive，并定义低风险自动接受策略。
- [ ] 接入 provider-neutral Agent boundary。
- [ ] 增加超时、失败、重试、token/cost 记录。
- [ ] 验证 Agent 不会静默覆盖用户结论。

## 阶段 3：技术路线推演

- [ ] 用户定义目标、硬约束、偏好和成功指标。
- [ ] Agent 生成至少两个路线候选和待验证假设。
- [ ] 建立 criterion ↔ option ↔ evidence 的比较关系。
- [ ] 生成 recommendation 与分阶段 route steps。
- [ ] 支持“如果约束变化会怎样”的情景切换。
- [ ] 决策页能解释选择、放弃和不确定性。

## 阶段 4：持久化知识体系

- [ ] 定义 KnowledgeGraph 与 Markdown wiki 的双向、确定性映射。
- [ ] 实现 index.md 和 append-only log.md 更新。
- [ ] 实现 graph save/load、版本和迁移。
- [ ] 支持同一知识节点跨多个分析对象复用。
- [ ] 支持导出 Obsidian-compatible Markdown。
- [ ] 增加 round-trip 和版本迁移测试。

## 阶段 5：知识维护与大图导航

- [ ] 孤儿节点、重复概念、缺来源 claim、矛盾和过期内容 lint。
- [ ] 局部邻居、最短路径、cluster 和全文搜索。
- [ ] 数百节点后再评估 BM25/embedding hybrid search。
- [ ] 大图渐进加载、局部布局和性能预算。
- [ ] 知识健康度面板服务于维护动作，不抢占主分析画布。

## 阶段 6：迁移收口

- [ ] 列出旧 `Research*` 模型到 V2 的数据迁移映射。
- [ ] 把仍有价值的 evidence/candidate/job 能力迁移为 graph patch workflow。
- [ ] 列出不再使用的 tracked 文件供用户确认。
- [ ] 用户确认后逐个明确处理 tracked 旧文件；本地生成目录由用户手动清理。
- [ ] 更新根 `AGENTS.md`、README 和开发者文档为 V2 唯一方向。

## 每阶段验收

```powershell
npm test
npm run build
cargo test --workspace
```
