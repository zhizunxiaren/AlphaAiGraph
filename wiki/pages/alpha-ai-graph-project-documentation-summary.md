# AlphaAiGraph 项目文档提炼

生成日期：2026-05-26

## 摘要

AlphaAiGraph 的项目文档已经从早期的“知识点图谱 / 学习卡片 / 导出工具”方向，明确转向 **AI Agent 驱动的渐进式研究工作流脑图产品**。

它的核心不是一次性总结完整个项目、PDF 或资料集，而是：

```text
输入复杂对象
-> AI Agent 先生成高层研究地图
-> 标注重点、难点、风险、推荐下钻点和待验证点
-> 用户选择研究路径
-> AI 逐层展开节点
-> 证据、验证动作、执行结果和结论回填到节点
-> 长期沉淀为 Obsidian-style 关系图谱
```

因此，AlphaAiGraph 的第一产品心智应是“研究向导 + 工作流脑图”，不是聊天助手、普通知识图谱、PDF 总结器或静态脑图。

## 文档地图

当前文档可以分为六类：

- `AGENTS.md`：项目操作红线、产品定义、数据模型方向、UI 方向和交互式工作流规则。
- `Plan.md`：从阶段 0 到阶段 12 的分阶段实施计划，包含技术栈、测试命令、安全规则和提交边界。
- `docs/superpowers/specs/2026-05-09-alpha-ai-graph-agent-research-map.md`：产品方向和完整数据模型，是研究地图产品定义的主规格。
- `docs/superpowers/specs/2026-05-11-alpha-ai-graph-research-cockpit-ux-design.md`：研究驾驶舱 UX 设计，定义第一屏信息架构和核心交互。
- `docs/superpowers/specs/2026-05-13-alpha-ai-graph-ui-design.md`：更具体的 UI 设计文档，强调四栏研究工作台、Agent 研究流、资料抽屉和当前实现差异。
- `issue.md` / `TODO.md`：计划审查问题、已完成修正项、待确认任务和里程碑状态。

`wiki/` 已经按 Karpathy LLM Wiki 模式建立了基础结构：`raw/` 存不可变资料，`pages/` 存 LLM 维护的总结和综合页，`index.md` 做内容索引，`log.md` 做时间线记录。

## 产品边界

文档反复强调 AlphaAiGraph 不应退化为以下产品：

- 普通知识图谱查看器。
- PDF 总结器。
- 静态脑图。
- 学习卡片生成器。
- 聊天优先助手。
- 文件管理器加聊天窗口。

正确的产品边界是：

- AI Agent 自动扫描复杂对象，但第一步只生成高层研究地图。
- 用户控制下钻路径，AI 只围绕选中节点继续深入。
- 重点、难点、风险、推荐下钻和待验证点是 Agent 的辅助判断。
- 证据、命令输出、脚本结果和结论必须能追溯到节点。
- 长期关系图谱是从研究过程投影出来的沉淀视图，不是另一套主数据源。

## 两个图面

### 研究工作流脑图

研究工作流脑图是当前研究会话的主画布，回答“该如何研究这个复杂对象”。

它关心：

- 项目、PDF 或资料集的结构。
- 哪些部分重要。
- 哪些部分困难。
- 哪些部分有风险。
- 哪些问题需要验证。
- 哪些节点值得继续下钻。

它表达的是研究过程，因此节点可以是模块、章节、概念、问题、假设、风险、动作、脚本、结果、结论或证据。

### Obsidian-style 关系图谱

关系图谱是长期关系网络，回答“对象之间如何关联”。

它关心：

- 项目、文件、模块、章节、概念、问题、证据和结论之间的关系。
- 哪些节点是中心节点。
- 哪些证据支撑哪些结论。
- 哪些问题仍然孤立或未解决。

文档中的关键约束是：关系图谱必须从研究数据投影产生，不应成为第二套可任意编辑的主数据源。

## 数据模型主线

核心主链路是：

```text
ResearchObject
-> ResearchSession
-> ResearchThread
-> ResearchMap
-> ResearchNode
```

含义分别是：

- `ResearchObject`：用户交给 AlphaAiGraph 研究的复杂对象，例如项目、代码仓库、PDF、文档集或知识体系问题。
- `ResearchSession`：围绕同一个对象的一次研究会话。
- `ResearchThread`：会话内的一条研究线程或分支，用于隔离主线、资料分析、旁路探索或并行任务。
- `ResearchMap`：当前研究工作流脑图。
- `ResearchNode`：研究单元。

围绕主链路的辅助模型包括：

- `SourceAsset`：项目内可分析资料，例如文件、PDF、文档、命令输出或网页片段。
- `AgentMarker`：AI 对节点的辅助判断，例如重点、难点、风险、推荐下钻、待验证、低优先级、不确定、核心入口。
- `EvidenceAnchor`：可定位证据，指向 PDF 页、代码行、文档段落、命令输出或网页摘录。
- `ResearchAction`：节点上的建议动作，例如下钻、验证、运行命令、打开资料或生成输出。
- `AgentJob`：异步或并行 Agent 工作单元。
- `ParallelAnalysisGroup`：一组并行任务，统一查看、审核和合并。
- `ExecutionRun`：脚本、测试、命令等执行结果。
- `SideInquirySession`：临时概念会话，默认隔离主研究图。
- `ConceptNote` / `KnowledgeDigest`：从临时会话、结论和证据中沉淀出的知识整理结果。
- `RelationshipGraph`：由研究数据投影出的 Obsidian-style 长期关系图谱。

## 建模不变量

这些约束是后续实现和审查的重点：

- `ResearchNode.kind` 表达节点是什么，不能用来表达重点、难点、风险、推荐下钻或待验证。
- `AgentMarker.kind` 表达 Agent 指导信号，不是节点类型。
- `recommended_drilldown` 和 `needs_validation` 仍是 Agent 判断信号；真正可点击、可排队或可执行的事项必须同时表达为 `ResearchAction`。
- `core_entry` 表示“该节点是理解当前对象的核心入口节点”。
- `EvidenceAnchor` 必须让主张可以追溯。
- `RelationshipGraph` 是派生投影视图，不是并行主存储。
- Agent 不能自主合并 candidate，也不能自主 promote side inquiry。
- Side inquiry 默认不修改主研究图。
- Parallel outputs 默认是 candidates，只有显式 merge 或明确审核策略才能进入主图。

## UX 和 UI 方向

最新 UI 文档把界面收敛为 **四栏研究驾驶舱 + 可折叠资料抽屉**：

```text
顶部上下文栏：项目 / 会话 / 当前研究路径 / 模式切换 / 全局命令

研究对象导航
Agent 研究过程流
Research Workflow Canvas
节点检查器

可折叠资料抽屉：PDF / 代码 / 文档 / 来源列表
```

各区域职责：

- 研究对象导航：提供当前对象、会话、线程、资料入口和主导航。
- Agent 研究过程流：展示扫描事件、地图生成、marker 判断理由、推荐下一步和任务状态；它应像研究日志，不像聊天气泡。
- Research Workflow Canvas：承载研究工作流脑图，是第一屏主角。
- 节点检查器：围绕选中节点展示摘要、marker 理由、证据锚点、动作、旁路会话、并行任务、候选结果和执行结果。
- 资料抽屉：在需要时并排查看 PDF、代码、文档和来源，不压缩主研究地图。

视觉调性是高密度、克制、工具型研究工作台。文档明确要求避免营销式 hero、装饰卡片、渐变光球、大面积品牌色和普通 AI 聊天产品结构。

## 工程实施主线

`Plan.md` 将工作拆成阶段 0 到阶段 12：

1. 阶段 0：仓库基线与 React/Vite/Vitest/Rust workspace 工程骨架。
2. 阶段 1：研究领域模型和 Rust core 初步同步。
3. 阶段 2：研究 fixtures 与种子数据。
4. 阶段 3：确定性 Research Agent 流程。
5. 阶段 4：关系图谱投影。
6. 阶段 5：研究工作台状态。
7. 阶段 6：三栏/多栏研究工作台 UI。
8. 阶段 7：旁路临时会话工作流。
9. 阶段 8：并行研究与候选合并审核。
10. 阶段 9：Rust core 模型补齐与一致性复核。
11. 阶段 10：Agent harness 与 Tauri payload normalization。
12. 阶段 11：旧 Study/Synthesis/Export 流程降级。
13. 阶段 12：完整产品验收与提交边界。

计划中的关键工程原则是：

- 阶段 0 到阶段 8 必须能在 browser-local 模式下独立验证。
- Tauri 2 集成不能阻塞前端、状态和研究模型验收。
- Rust 模型应尽早与 TypeScript 类型对齐，减少后续 payload 返工。
- 优先使用聚焦的 TypeScript 和 Rust library tests。
- 声称完成前必须运行对应测试、构建和 Rust workspace tests。
- 提交应按阶段或职责拆分，避免把大量无关变更压成一个不可审查的大提交。

## 当前审查与待办状态

`issue.md` 记录的核心审查问题包括：

- `ResearchNode` 到 `RelationshipGraphNode` 的字段映射表必须显式固定。
- `AgentMarkerKind` 中信号标记和行动暗示的边界需要注释说明。
- `core_entry` 语义需要明确。
- `expandResearchNode` 需要定义重复下钻语义。
- `mergeCandidateNode` 需要定义冲突检测和 `needs_review` 行为。
- Stage 3、5、6-8 的类型形状、状态边界、空态/加载态/错误态测试需要补齐。
- Rust 模型不能滞后于 TypeScript 类型。
- `ResearchMap` 需要父子索引或查询层缓存，避免大图 O(n) 遍历。
- Candidate 节点内嵌完整 node 存在 ID 碰撞风险。
- Agent 安全边界必须写清楚：不能自主 merge 或 promote。
- Tauri 2 风险需要通过 browser-local 阶段隔离。

`TODO.md` 显示这些审查修正和验证任务大多已被标记完成，包括代码审查、Rust 模型补齐、类型建模修正、语义边界、测试补充、Plan 顺序调整和验证命令。

当前仍需注意：

- `TODO.md` 的“待确认任务”仍有“提交当前修改（AGENTS.md + issue.md 变更）”未完成。
- `TODO.md` 的里程碑状态仍是“未完成”。
- 本总结只依据项目文档提炼，不断言当前代码实现已经完全满足所有文档要求。

## LLM Wiki 对齐

AlphaAiGraph 可以吸收 LLM Wiki 的长期知识沉淀机制，但主产品不能变成普通 wiki。

对应关系是：

- Raw sources -> `SourceAsset`。
- Wiki pages -> `ConceptNote`、`KnowledgeDigest` 和导出的 markdown 产物。
- Schema -> `AGENTS.md` 与 `docs/superpowers/specs/`。
- Index/log -> 项目知识整理索引和活动时间线。

本页应视为一次 `synthesis` 类型 wiki 产物：它把当前项目文档压缩成可导航的产品和工程共识，后续文档更新时应同步维护。

## 后续建议

- 统一 AGENTS 中“三栏研究工作台”和 UI 设计中“四栏研究驾驶舱”的表述，明确 Agent 研究过程流是否独立成常驻栏。
- 将本页内容进一步拆成更小的 concept pages，例如“AgentMarker 语义”、“Side Inquiry 隔离规则”、“RelationshipGraph 投影原则”。
- 用 `KnowledgeDigest` 或 seed fixture 固化这份文档共识，让应用内演示数据与文档保持一致。
- 在下一次提交前复核 changed files，确认没有 key、token、secret、password、`.env` 或隐私配置进入 git。
