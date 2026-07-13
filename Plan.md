# AlphaAiGraph 研究地图分阶段实施计划（V1 历史归档）

> **已被 V2 取代：** 当前实施计划见 `Plan-v2.md`，产品规格见
> `docs/superpowers/specs/2026-07-13-alpha-ai-graph-knowledge-route-system.md`。
> 本文件只保留旧模型的历史背景，不再用于安排新功能。

> **给 agentic workers：** 执行本计划时必须使用 `superpowers:subagent-driven-development` 或 `superpowers:executing-plans`。按阶段推进：每个阶段先完成实现拆分，再补齐并运行该阶段的自动化验收测试。

**目标：** 将 AlphaAiGraph 建成一个 AI Agent 驱动的渐进式研究工作流脑图产品，支持证据、节点下钻、旁路临时会话、并行候选工作、执行结果，以及 Obsidian-style 关系图谱投影。

**架构：** 产品主数据源是研究工作台：`ResearchObject -> ResearchSession -> ResearchThread -> ResearchMap -> ResearchNode`。研究工作流脑图是当前研究过程的主画布。Obsidian-style 关系图谱是从研究数据派生出来的投影视图，不是第二套主数据源。旧的学习、综合、导出能力保留为辅助动作。

**技术栈：** React 19、TypeScript、Vite、Vitest、Cytoscape、lucide-react、Tauri 2、Rust workspace crates：`alpha_graph_core`、`alpha_agent_harness`、`alpha_exporters`。

---

## 执行规则

- 这是完整产品的分阶段实施计划，不是缩小范围的交付计划。
- 每个阶段内部先完成实现拆分。
- 阶段实现完成后，再创建或更新该阶段的自动化验收测试。
- 标记阶段完成前，必须运行该阶段的验收命令。
- 禁止使用批量删除命令：`del /s`、`rd /s`、`rmdir /s`、`Remove-Item -Recurse`、`rm -rf`。
- 需要删除文件时，只能删除一个明确路径的文件。若需要批量删除，停止操作并让用户手动删除。
- 不要提交包含 key、token、secret、password、API key、`.env` 或隐私配置的文件。
- 不要触发 Unreal Engine 或 UE 插件编译。
- 优先使用聚焦的 TypeScript 和 Rust library tests。除非某个阶段明确需要，否则不要把完整 Tauri build 当作默认验证手段。
- Agent 不能自主 merge candidate，也不能自主 promote side inquiry。合并和沉淀必须来自用户显式动作或计划中明确写出的审核策略。
- 阶段 0 到阶段 8 必须能在纯 browser-local 模式下独立验证。Tauri 2 集成阻塞不能阻塞这些阶段的前端、状态和研究模型验收。

## 产品北极星

AlphaAiGraph 不是通用知识图谱、PDF 总结器、静态脑图、学习卡片工具或聊天优先助手。它的主循环是：

```text
输入复杂对象
-> AI Agent 扫描对象
-> 生成第一层研究工作流脑图
-> 标注重点、难点、风险、推荐下钻点和待验证点
-> 用户选择一个节点
-> AI 将选中节点展开到下一层
-> 用户提问、查看证据、运行验证、记录结论
-> 结果回填到研究地图
-> 长期关系投影为 Obsidian-style 关系图谱
```

第一版实现仍然要表达完整产品方向，但不能自动把整个对象一次性深度分析完。第一张图是高层研究地图；下钻方向由用户选择。

## LLM Wiki 对齐

Karpathy 的 LLM Wiki 模式有三个有用层次：

- Raw sources：用户提供的不可变原始资料。
- Wiki：LLM 维护的 markdown 知识页。
- Schema：定义结构约定和工作流的说明文件。

在 AlphaAiGraph 中：

- Raw sources 对应 `SourceAsset`。
- Wiki pages 对应 `ConceptNote`、`KnowledgeDigest` 和未来导出的 markdown 产物。
- Schema 对应 `AGENTS.md` 以及 `docs/superpowers/specs/` 下的产品规格。
- Index/log 对应未来的项目知识整理结果和活动时间线。

不要把 AlphaAiGraph 做成普通 wiki。LLM Wiki 模式用于支持长期复利式知识沉淀；主产品表面仍然是研究工作流脑图。

## 阶段 0：仓库基线与工程骨架

### 目标

让当前仓库具备执行后续计划的基本工程结构。这个阶段存在的原因是：当前被 git 跟踪的仓库可能只有文档和配置文件，而后续阶段会假设已经存在 React/Vite/Tauri/Rust workspace。

### 实施拆分

- [ ] **S0.1：确认基线模式**
  - 检查 `git ls-files`、`package.json`、`Cargo.toml`、`src/`、`crates/`。
  - 如果应该从已有应用分支或 worktree 恢复代码，先在本计划中记录来源分支或 commit，再复制代码。
  - 如果没有需要恢复的已有应用，就在当前仓库创建工程骨架。

- [ ] **S0.2：缺失时创建前端骨架**
  - 创建 `package.json`，包含脚本：
    - `dev`
    - `test`
    - `build`
    - `preview`
  - 创建 `index.html`。
  - 创建 `vite.config.ts`。
  - 创建 `tsconfig.json`。
  - 如果 Vite 配置需要，创建 `tsconfig.node.json`。
  - 创建 `src/main.tsx`。
  - 创建 `src/App.tsx`。
  - 创建 `src/styles.css`。
  - 创建 `src/vite-env.d.ts`。

- [ ] **S0.3：创建前端测试骨架**
  - 添加 Vitest 和 React Testing Library 依赖。
  - 创建 `src/App.test.tsx`。
  - 创建独立的 `vitest.config.ts` 配置测试环境。
  - `vite.config.ts` 只负责 Vite 构建配置；测试专属配置不要混在 Vite 构建配置里。

- [ ] **S0.4：缺失时创建 Rust workspace 骨架**
  - 创建根目录 `Cargo.toml`。
  - 创建 `crates/alpha_graph_core/Cargo.toml`。
  - 创建 `crates/alpha_graph_core/src/lib.rs`。
  - 创建 `crates/alpha_agent_harness/Cargo.toml`。
  - 创建 `crates/alpha_agent_harness/src/lib.rs`。
  - 创建 `crates/alpha_exporters/Cargo.toml`。
  - 创建 `crates/alpha_exporters/src/lib.rs`。

- [ ] **S0.5：创建后端边界骨架**
  - 创建 `src/backend/tauriClient.ts`。
  - 创建 `src/backend/tauriClient.test.ts`。
  - browser-local fallback 必须在没有 Tauri shell 时也能工作。

- [ ] **S0.6：创建应用模块骨架**
  - 创建 `src/types.ts`。
  - 创建 `src/data/seed.ts`。
  - 创建 `src/state/useKnowledgeApp.ts`。
  - 创建 `src/components/AppShell.tsx`。
  - 创建 `src/components/LeftPanel.tsx`。
  - 创建 `src/components/GraphCanvas.tsx`。
  - 创建 `src/components/AgentPanel.tsx`。

### 阶段自动化验收

在 S0 实现完成后创建或更新自动化检查：

- [ ] **A0.1：前端 smoke test**
  - `src/App.test.tsx` 能渲染 app shell，且不抛错。

- [ ] **A0.2：后端 fallback 测试**
  - `src/backend/tauriClient.test.ts` 证明 browser-local fallback 能返回确定性结果。

- [ ] **A0.3：Rust smoke tests**
  - 每个 Rust crate 至少有一个单元测试，证明 crate 能编译并导出公共符号。

### 验收命令

```powershell
npm test
npm run build
cargo test --workspace
```

预期结果：所有命令都存在，并能给出确定性的通过或失败输出。如果失败原因是项目结构不存在，则阶段 0 不能算完成。

## 阶段 1：研究领域模型

### 目标

把产品概念中心从旧的 `KnowledgeGraph` 状态切换到研究工作台模型，同时只把旧图谱类型保留为兼容和投影用途。

### 实施拆分

- [ ] **S1.1：在 `src/types.ts` 添加对象、会话、线程类型**
  - `ResearchObjectKind`
  - `ResearchObjectStatus`
  - `ResearchObject`
  - `ResearchSessionStatus`
  - `ResearchSession`
  - `ResearchThreadKind`
  - `ResearchThreadStatus`
  - `ResearchThread`

- [ ] **S1.2：在 `src/types.ts` 添加研究工作流脑图类型**
  - `ResearchMap`
  - `ResearchNodeKind`
  - `ResearchNodeStatus`
  - `ResearchExpansionState`
  - `ResearchNode`
  - `ResearchEdgeKind`
  - `ResearchEdge`

- [ ] **S1.3：在 `src/types.ts` 添加 Agent marker 类型**
  - `AgentMarkerKind`
  - `AgentMarker`
  - marker kind 必须包含 `focus`、`difficulty`、`risk`、`recommended_drilldown`、`needs_validation`、`low_priority`、`uncertain`、`core_entry`。
  - 不要把 focus、difficulty、risk 或 validation 加进 `ResearchNodeKind`。
  - `recommended_drilldown` 和 `needs_validation` 仍然是 Agent 判断信号，用于解释“为什么建议下一步做某事”。
  - 真正可点击、可排队或可执行的下一步必须同时表示为 `ResearchAction`。
  - `core_entry` 表示“该节点是理解当前对象的核心入口节点”，不是一个单独列表成员标记。

- [ ] **S1.4：在 `src/types.ts` 添加资料、证据和动作类型**
  - `SourceAssetKind`
  - `SourceAsset`
  - `EvidenceAnchor`
  - `ResearchActionKind`
  - `ResearchAction`

- [ ] **S1.5：在 `src/types.ts` 添加异步工作和执行类型**
  - `AgentJobKind`
  - `AgentJob`
  - `ParallelAnalysisMode`
  - `ParallelAnalysisGroup`
  - `ExecutionRun`

- [ ] **S1.6：在 `src/types.ts` 添加旁路会话和知识整理类型**
  - `InquiryContextPolicy`
  - `SideInquirySession`
  - `InquiryMessage`
  - `ConceptNote`
  - `KnowledgeDigest`

- [ ] **S1.7：在 `src/types.ts` 添加关系图谱投影类型**
  - `RelationshipGraphNodeKind`
  - `RelationshipGraphNode`
  - `RelationshipGraphEdge`
  - `RelationshipGraph`

- [ ] **S1.8：定义研究节点到关系图谱节点的字段映射表**
  - 在 `src/research/projection.ts` 或相邻文档注释中固定映射规则。
  - `ResearchNode.id` 映射到 `RelationshipGraphNode.sourceId`。
  - `ResearchNode.title` 映射到 `RelationshipGraphNode.title`；UI 若需要 label，也必须从该 title 派生。
  - `ResearchNode.summary` 映射到 `RelationshipGraphNode.summary`。
  - `ResearchNode.kind`、`ResearchNode.status`、`AgentMarker.kind` 映射到 tags。
  - `ResearchEdge.fromNodeId` 和 `ResearchEdge.toNodeId` 映射到 relationship edge 的两端。
  - `EvidenceAnchor.id` 映射到 evidence graph node 的 `sourceId`。
  - 不允许 UI 层直接把 `ResearchNode` 当作 `RelationshipGraphNode` 使用。

- [ ] **S1.9：提前同步 Rust core 研究模型**
  - 在 `crates/alpha_graph_core/src/lib.rs` 中同步核心 research enums 和 structs 的第一版。
  - 这一版只关注模型对齐、serde shape 和构造测试，不实现 agent 编排逻辑。
  - 后续阶段 9 只做 Rust 模型补齐、复核和后端集成前的稳定化，不再首次引入模型。

- [ ] **S1.10：保留旧图谱兼容性**
  - 如果已有 UI 代码导入旧 graph exports，需要继续保留。
  - 用注释标记为兼容或投影类型。

### 阶段自动化验收

在 S1 实现完成后创建或更新自动化检查：

- [ ] **A1.1：类型构造测试**
  - 创建 `src/types.test.ts`。
  - 构造完整的 `ResearchObject -> ResearchSession -> ResearchThread -> ResearchMap -> ResearchNode` 对象图。

- [ ] **A1.2：marker 不变量测试**
  - 测试重点、难点、风险、下钻推荐和验证建议都通过 `AgentMarker.kind` 表达。
  - 测试数据不能把这些概念表达为 `ResearchNode.kind`。

- [ ] **A1.3：关系图谱投影类型测试**
  - 构造一个 `RelationshipGraph`，来源是 typed nodes 和 edges，而不是旧 graph 主数据。

- [ ] **A1.4：投影字段映射表测试**
  - 构造一个 research node 和一个 evidence anchor，断言映射后的 relationship graph node 使用 `sourceId` 追溯原对象。
  - 断言 UI label 来源只能是 mapped title，而不是直接混用两种 node 类型。

- [ ] **A1.5：Rust/TypeScript 模型同步测试**
  - `alpha_graph_core` 添加构造 research object、map、node、marker、evidence 的 Rust 单元测试。
  - 测试 serde snake_case 枚举输出，避免后续 Tauri payload 重写。

### 验收命令

```powershell
npm test -- src/types.test.ts
npm run build
cargo test -p alpha_graph_core
```

预期结果：TypeScript 类型测试、前端构建和 Rust core 模型测试通过。

## 阶段 2：研究 Fixtures 与种子数据

### 目标

在真实 agent 或后端集成前，用确定性数据展示 AlphaAiGraph 预期的第一屏产品体验。

### 实施拆分

- [ ] **S2.1：创建 `src/research/fixtures.ts`**
  - 导出 `researchNow = "2026-05-09T00:00:00.000Z"`。
  - 导出一个 AlphaAiGraph 的 `ResearchObject`。
  - 导出一个 active `ResearchSession`。
  - 导出一个 main `ResearchThread`。

- [ ] **S2.2：创建第一层研究地图 fixture**
  - 根节点标题：`AlphaAiGraph 研究对象`。
  - 子节点：
    - `产品定位`
    - `研究工作流脑图`
    - `并行研究`
    - `旁路临时会话`
    - `证据与验证`
    - `关系图谱投影`

- [ ] **S2.3：补齐 marker fixture 覆盖**
  - 至少使用一次 `focus`。
  - 至少使用一次 `difficulty`。
  - 至少使用一次 `risk`。
  - 至少使用一次 `recommended_drilldown`。
  - 至少使用一次 `needs_validation`。

- [ ] **S2.4：添加资料和证据 fixtures**
  - 为 `AGENTS.md`、`Plan.md`、`docs/superpowers/specs/2026-05-09-alpha-ai-graph-agent-research-map.md` 添加 `SourceAsset`。
  - 添加和 source assets、research nodes 关联的 `EvidenceAnchor`。

- [ ] **S2.5：添加动作、任务、旁路会话和候选示例**
  - 添加 drill-down、side inquiry、validation 的 `ResearchAction` 示例。
  - 添加 source scan、map generation、parallel extraction 的 `AgentJob` 示例。
  - 添加一个 `SideInquirySession`。
  - 添加一个带 candidate output 元数据的 `ParallelAnalysisGroup`。

- [ ] **S2.6：更新 `src/data/seed.ts`**
  - 重新导出 research fixtures。
  - 在 UI 迁移移除旧导入前，继续保留 legacy seed exports。

- [ ] **S2.7：添加手写关系图谱 golden fixture**
  - 在 `src/research/fixtures.ts` 中导出一个手写 `expectedRelationshipGraph`。
  - 该 golden graph 只覆盖 fixture 中最关键的对象、研究节点、证据和边。
  - 该样本用于阶段 4 校验 `projectRelationshipGraph` 的字段映射和边语义。
  - Golden fixture 必须使用 `RelationshipGraphNode.sourceId` 保存原 research/evidence 对象 ID。

### 阶段自动化验收

在 S2 实现完成后创建或更新自动化检查：

- [ ] **A2.1：fixture 完整性测试**
  - 创建 `src/research/fixtures.test.ts`。
  - 断言 object、session、thread、map、source assets、evidence、actions、jobs、side inquiry 都存在。

- [ ] **A2.2：第一层节点测试**
  - 断言六个必需的一层节点都在 root 下。

- [ ] **A2.3：marker 覆盖测试**
  - 断言所有必需 marker kind 至少出现一次。

- [ ] **A2.4：证据链接测试**
  - 断言每个 fixture evidence anchor 都引用已有 source asset，并且至少有一个 node 引用了该 evidence ID。

- [ ] **A2.5：Golden projection fixture 测试**
  - 断言 `expectedRelationshipGraph` 中的 nodes 和 edges 都能追溯到 fixture 中的 research object、research nodes、research edges 或 evidence anchors。
  - 断言 golden graph 不引用 legacy graph 数据。

### 验收命令

```powershell
npm test -- src/research/fixtures.test.ts
npm run build
```

预期结果：fixture 完整性测试和前端构建通过。

## 阶段 3：确定性 Research Agent 流程

### 目标

先实现一个本地确定性 research agent，用于表达目标工作流：生成高层地图、打 guidance marker、附加 evidence/action，并且只展开用户选中的节点。

### 实施拆分

- [ ] **S3.1：创建 `src/research/researchAgent.ts`**
  - 导出 `generateFirstLayerResearchMap`。
  - 导出 `expandResearchNode`。

- [ ] **S3.2：实现第一层地图生成**
  - 输入：object id、kind、title、source assets。
  - 输出：object、session、thread、map、evidence、actions、jobs。
  - 只生成高层地图。

- [ ] **S3.3：添加 marker 生成**
  - 根据确定性节点模板附加 focus、difficulty、risk、recommended drill-down、validation markers。

- [ ] **S3.4：添加 evidence 和 action 生成**
  - 如果提供 source assets，evidence anchors 应指向这些资料。
  - actions 至少包含 drill-down、inspect source、create side inquiry、validation suggestions。

- [ ] **S3.5：实现选中节点展开**
  - `expandResearchNode(map, nodeId)` 只在选中节点下添加一层子节点。
  - 将选中节点的 `expansionState` 设置为 `expanded`。
  - 不展开无关节点。
  - 同一次调用中不创建孙节点。
  - 重复下钻同一个已 expanded 节点时必须幂等：返回原 map，不追加重复 children。
  - 如果生成模板里出现同 title child，按同一 parent 下 title 去重，保留已有节点。
  - 如果 `nodeId` 不存在，返回原 map，并由调用方状态层记录或展示不可执行原因。

- [ ] **S3.6：保持确定性行为**
  - IDs 和 timestamps 必须稳定，便于测试。
  - 不调用网络 API，不要求 API key。

### 阶段自动化验收

在 S3 实现完成后创建或更新自动化检查：

- [ ] **A3.1：第一层生成测试**
  - 创建 `src/research/researchAgent.test.ts`。
  - 断言生成的 map 有 root node、高层子节点、markers、evidence、actions、jobs。

- [ ] **A3.2：渐进式展开测试**
  - 断言 `expandResearchNode` 只在选中节点下添加 children。
  - 断言不会创建超过一层的新深度节点。

- [ ] **A3.3：禁止全量自动分析测试**
  - 断言第一层生成不会把所有节点标记为 expanded，也不会创建深层 descendants。

- [ ] **A3.4：类型形状测试**
  - 断言 agent 产物中的每个 node 都有 `id`、`mapId`、`kind`、`title`、`depth`、`status`、`expansionState`。
  - 断言每条 edge 都有明确的源节点、目标节点、kind 和 confidence。

- [ ] **A3.5：重复下钻和缺失 node 测试**
  - 对已 expanded 节点再次调用 `expandResearchNode`，断言不会新增重复 children。
  - 对不存在的 nodeId 调用 `expandResearchNode`，断言返回原 map。

### 验收命令

```powershell
npm test -- src/research/researchAgent.test.ts
npm run build
```

预期结果：确定性 agent 测试和前端构建通过。

## 阶段 4：关系图谱投影

### 目标

把 Obsidian-style graph 实现为 research data 的投影，而不是另一套并行主数据模型。

### 实施拆分

- [ ] **S4.1：创建 `src/research/projection.ts`**
  - 导出 `projectRelationshipGraph`。
  - 实现阶段 1 固定的字段映射表。
  - 将映射表作为代码注释或导出的只读配置保留，避免 UI 层混用 `ResearchNode` 和 `RelationshipGraphNode`。

- [ ] **S4.2：投影研究对象和地图**
  - `ResearchObject` 变成 `research_object` graph node。
  - root research nodes 通过 `contains` 从 object 连接出来。
  - Research nodes 变成 `research_node` graph nodes。

- [ ] **S4.3：投影 research edges**
  - 将 `ResearchEdge.kind` 转换为 relationship graph edge relations。
  - 尽可能保留 confidence。

- [ ] **S4.4：投影证据**
  - `EvidenceAnchor` 变成 `evidence` graph nodes。
  - 带 `evidenceIds` 的 research nodes 通过 `references` 或 `supports` 连接到 evidence。

- [ ] **S4.5：投影执行结果**
  - `ExecutionRun` 变成 `execution_run` graph nodes。
  - Execution runs 通过 `validated_by` 连接到 nodes。

- [ ] **S4.6：投影概念笔记和知识整理**
  - `ConceptNote` 变成 `concept_note`。
  - `KnowledgeDigest` 变成 `knowledge_digest`。
  - Notes 通过 `explains` 连接到 related nodes。
  - Digests 通过 `derived_from` 连接到 included nodes 和 notes。

- [ ] **S4.7：保持投影无状态**
  - 不增加手工编辑的 relationship graph primary state。
  - Relationship graph 必须能从 research inputs 重新生成。

- [ ] **S4.8：对齐 golden projection fixture**
  - 使用阶段 2 的 `expectedRelationshipGraph` 校验投影输出。
  - 如果 deterministic projection 需要额外节点，测试应明确区分 required subset 和 derived extra nodes。

### 阶段自动化验收

在 S4 实现完成后创建或更新自动化检查：

- [ ] **A4.1：投影覆盖测试**
  - 创建 `src/research/projection.test.ts`。
  - 断言 object、research nodes、evidence、execution runs、concept notes、digests 在提供输入时都会出现为 graph nodes。

- [ ] **A4.2：边投影测试**
  - 断言 research edges 和 evidence references 会出现为 relationship graph edges。

- [ ] **A4.3：来源可追溯测试**
  - 断言每个 relationship graph node 都有 `sourceId`。

- [ ] **A4.4：派生视图不变量测试**
  - 断言同一输入可以重新生成相同 ID 的 projection output。

- [ ] **A4.5：Golden projection 对齐测试**
  - 断言 `projectRelationshipGraph` 输出至少包含 `expectedRelationshipGraph` 中的 required nodes 和 edges。
  - 断言 `ResearchNode.id` 不会被误用为 `RelationshipGraphNode.id` 的唯一语义来源，追溯必须通过 `sourceId`。

### 验收命令

```powershell
npm test -- src/research/projection.test.ts
npm run build
```

预期结果：projection tests 和前端构建通过。

## 阶段 5：研究工作台状态

### 目标

让应用状态围绕 research objects、sessions、threads、maps、nodes、markers、evidence、actions、jobs、side inquiries、candidates 和 derived relationship graph 运转。

### 实施拆分

- [ ] **S5.1：修改 `src/state/useKnowledgeApp.ts`**
  - 如果已有组件导入这个 hook，保留导出的 hook 名称。
  - 内部把 research workspace 当作主状态。

- [ ] **S5.2：添加核心研究状态**
  - `researchObject`
  - `researchSession`
  - `researchThreads`
  - `researchMap`
  - `sourceAssets`

- [ ] **S5.3：添加研究产物状态**
  - `evidenceAnchors`
  - `researchActions`
  - `agentJobs`
  - `parallelGroups`
  - `executionRuns`
  - `sideInquiries`
  - `conceptNotes`
  - `knowledgeDigests`

- [ ] **S5.4：添加派生关系图谱状态**
  - 使用 `projectRelationshipGraph` 计算 relationship graph。
  - 不把单独手工编辑的 relationship graph 存成主数据。

- [ ] **S5.5：实现研究地图动作**
  - `drillDownNode(nodeId): void`
  - `markResearchNode(nodeId, status): void`
  - 对已 expanded 节点再次下钻时保持幂等，不追加重复节点。
  - 对不存在的 `nodeId` 下钻时不修改 state，并暴露可测试的错误或 warning 状态。

- [ ] **S5.6：实现旁路会话动作**
  - `createSideInquiry(nodeId, question): void`
  - `promoteSideInquiry(inquiryId): void`
  - 创建旁路会话不能修改主地图。
  - promotion 可以创建 `ConceptNote`。

- [ ] **S5.7：实现并行研究动作**
  - `startParallelAnalysis(nodeIds): void`
  - `mergeCandidateNode(nodeId): void`
  - 并行输出先作为 candidate output。
  - candidate output 只能通过显式 merge action 合并。
  - candidate 与已有 node 同 title、同 parent 或同语义来源冲突时，不直接合并，标记为 `needs_review`。
  - candidate edge 与已有 edge 的源、目标、kind 冲突时，不覆盖已有 edge，标记为 `needs_review`。

- [ ] **S5.8：保留旧辅助动作**
  - 在 UI 迁移将其降级前，保持 `generateStudy`、`generateSynthesis`、`createExport` 可用。

### 阶段自动化验收

在 S5 实现完成后创建或更新自动化检查：

- [ ] **A5.1：下钻状态测试**
  - 创建 `src/state/useKnowledgeApp.test.ts`。
  - 断言 `drillDownNode` 更新选中节点，并且只添加一层子节点。

- [ ] **A5.2：节点状态测试**
  - 断言 `markResearchNode` 会改变 node status，但不改变 node kind 或 markers。

- [ ] **A5.3：旁路会话隔离测试**
  - 断言 `createSideInquiry` 会新增 side inquiry，但 `researchMap.nodes` 和 `researchMap.edges` 不变。

- [ ] **A5.4：旁路会话 promotion 测试**
  - 断言 `promoteSideInquiry` 创建 concept note，并且 relationship projection 包含它。

- [ ] **A5.5：并行候选测试**
  - 断言 `startParallelAnalysis` 创建 group、jobs、candidate outputs，但不把它们合并进 main map。

- [ ] **A5.6：显式合并测试**
  - 断言 `mergeCandidateNode` 更新 main map，并保留 provenance 元数据。

- [ ] **A5.7：重复下钻状态边界测试**
  - 对已 expanded 节点再次调用 `drillDownNode`，断言 state 不新增重复 children。

- [ ] **A5.8：不存在 nodeId 状态边界测试**
  - 对不存在的 nodeId 调用 `drillDownNode`，断言 research map 不变，并出现可测试错误或 warning 状态。

- [ ] **A5.9：空 marker 节点状态测试**
  - 对 `markers: []` 的节点调用状态更新和详情渲染相关状态逻辑，断言不会抛错，也不会自动补 marker。

- [ ] **A5.10：候选合并冲突测试**
  - 同 title candidate node 或冲突 candidate edge 不能直接合并，必须进入 `needs_review`。

### 验收命令

```powershell
npm test -- src/state/useKnowledgeApp.test.ts
npm run build
```

预期结果：状态行为测试和前端构建通过。

## 阶段 6：三栏研究工作台 UI

### 目标

把第一屏做成研究工作台：左侧用于对象、会话、线程、资料导航；中间用于研究工作流脑图或关系图谱投影；右侧用于证据、动作、旁路会话、任务、候选结果和执行结果。

### 实施拆分

- [ ] **S6.1：修改 `src/components/AppShell.tsx`**
  - 保持三栏布局。
  - 增加中心画布模式切换：`research_map` 和 `relationship_graph`。
  - 将 `useKnowledgeApp` 的共享状态传入各 panel。

- [ ] **S6.2：修改 `src/components/LeftPanel.tsx`**
  - 显示 Agent section。
  - 显示当前 `ResearchObject.title`。
  - 显示 active `ResearchSession.title`。
  - 显示 main thread status。
  - 显示 source asset count。
  - 显示当前选中研究路径。
  - 使用主标签：`研究地图`、`候选结果`、`资料`、`关系图谱`、`输出`。

- [ ] **S6.3：修改 `src/components/GraphCanvas.tsx`**
  - 渲染 `ResearchNode` 和 `ResearchEdge`。
  - 节点标签来自 `ResearchNode.title`。
  - 节点 class 包含 kind、status、expansion state、marker kinds。
  - 展示 focus、difficulty、risk、recommended drill-down、validation 的 marker badges。

- [ ] **S6.4：添加选中节点详情**
  - 显示选中节点 title、summary、status、markers、evidence count、actions。
  - 当选中节点有 drill-down action 时，显示 `深入研究`。
  - 点击 `深入研究` 调用 `drillDownNode`。

- [ ] **S6.5：修改 `src/components/AgentPanel.tsx`**
  - 显示选中节点的 evidence anchors。
  - 显示 suggested research actions。
  - 显示 side inquiry sessions。
  - 显示 parallel job queue。
  - 显示等待 merge 的 candidate results。
  - 显示 execution runs。

- [ ] **S6.6：渲染关系图谱模式**
  - 使用投影得到的 `RelationshipGraph`。
  - 让该视图在视觉和概念上区别于研究工作流脑图。
  - 不允许 relationship graph edits 绕过 research data。

- [ ] **S6.7：补齐空态、加载态和错误态 UI**
  - 无选中节点时，右侧显示明确空态。
  - research map 为空时，中间画布显示可恢复空态。
  - agent job running 时显示加载态。
  - 状态层暴露错误或 warning 时，面板显示可诊断错误态。

### 阶段自动化验收

在 S6 实现完成后创建或更新自动化检查：

- [ ] **A6.1：App shell 渲染测试**
  - 在 `src/components/` 下创建或更新组件测试。
  - 断言三栏主面板都能渲染。

- [ ] **A6.2：左侧研究导航测试**
  - 断言 object title、session title、thread status、source count 和主标签都能渲染。

- [ ] **A6.3：Graph canvas marker 测试**
  - 断言 research nodes 和 marker badges 能从 research state 渲染。

- [ ] **A6.4：下钻交互测试**
  - 点击 `深入研究`，断言选中节点被展开。

- [ ] **A6.5：Agent panel 证据和候选测试**
  - 断言选中节点的 evidence、actions、jobs、candidates、side inquiries 分开展示。

- [ ] **A6.6：关系图谱模式测试**
  - 切换到 relationship graph mode，断言 projected graph content 出现。

- [ ] **A6.7：空态、加载态和错误态测试**
  - 断言无选中节点、空 research map、running job 和错误状态都有明确 UI 表达。

### 验收命令

```powershell
npm test -- src/components
npm run build
```

预期结果：UI 组件测试和前端构建通过。

## 阶段 7：旁路临时会话工作流

### 目标

实现临时概念或澄清会话，帮助用户理解当前内容，但默认不污染主研究地图；只有显式 promotion 后才沉淀。

### 实施拆分

- [ ] **S7.1：添加旁路会话创建 UI**
  - 在 `AgentPanel` 中允许从选中节点创建 side inquiry。
  - 用户输入问题。
  - 默认 context policy 是 `local_node`。

- [ ] **S7.2：添加 context policy 选择**
  - 支持 `local_node`。
  - 支持 `current_branch`。
  - 支持 `whole_project`。
  - 选中的 policy 存到 `SideInquirySession`。

- [ ] **S7.3：添加 inquiry message 处理**
  - 将用户消息保存为 `InquiryMessage`。
  - 在真实 LLM 集成前，保存确定性本地 agent 回复。
  - 回复必须在元数据或文本中引用 local context policy。

- [ ] **S7.4：默认保持隔离**
  - 创建或继续 side inquiry 时，不能：
    - 修改主研究地图 nodes
    - 修改主研究地图 edges
    - 改变选中 node status
    - 触发 node expansion
    - 将内容作为 accepted knowledge 合并进 relationship graph

- [ ] **S7.5：实现 promotion**
  - Promotion 创建 `ConceptNote`。
  - Concept note 通过 `sourceInquiryId` 链回原 inquiry。
  - Promoted concept notes 可以出现在 relationship graph projection 中。

- [ ] **S7.6：添加 inquiry status transitions**
  - `open`
  - `resolved`
  - `discarded`
  - `promoted`

- [ ] **S7.7：补齐旁路会话空态和错误态**
  - 没有 side inquiry 时显示空态。
  - 发送空问题时不创建 inquiry，并显示可测试错误。
  - promote 已 discarded 的 inquiry 时不修改 research map，并显示错误或 warning。

### 阶段自动化验收

在 S7 实现完成后创建或更新自动化检查：

- [ ] **A7.1：创建隔离测试**
  - 断言创建 side inquiry 后 research map 不变。

- [ ] **A7.2：消息持久化测试**
  - 断言用户和 agent 消息按顺序保存在 inquiry 下。

- [ ] **A7.3：Context policy 测试**
  - 断言三种 context policy 都可以被选择并持久化。

- [ ] **A7.4：Promotion 测试**
  - 断言 promote 会创建 concept note，并把 inquiry 标记为 promoted。

- [ ] **A7.5：Promotion 后投影测试**
  - 断言只有 promoted 内容会进入 relationship graph projection。

- [ ] **A7.6：Side inquiry 空态和错误态测试**
  - 断言无 inquiry、空问题、discarded inquiry promotion 都有明确且可测试的行为。

### 验收命令

```powershell
npm test -- src/state/useKnowledgeApp.test.ts src/components
npm run build
```

预期结果：side inquiry 行为在状态层和 UI 层都有测试覆盖。

## 阶段 8：并行研究与候选合并审核

### 目标

支持多线程研究，但避免不受控的上下文混合。并行工作先产出候选产物；只有显式 merge 才把选中结果写入主研究地图。

### 实施拆分

- [ ] **S8.1：实现 parallel group 创建**
  - `startParallelAnalysis(nodeIds)` 创建一个 `ParallelAnalysisGroup`。
  - 多选节点时 group mode 默认是 `fan_out`。
  - group merge policy 默认是 `manual_review`。

- [ ] **S8.2：实现 job 创建**
  - 在 group 下创建一个或多个 `AgentJob`。
  - 每个 job 记录 node scope、source asset scope、status、output IDs。

- [ ] **S8.3：实现独立 job 状态流转**
  - Jobs 可以独立流转：queued、running、completed、failed、cancelled。
  - 同一 group 内，一个 job 失败不能让已完成 job 失效。

- [ ] **S8.4：实现 candidate outputs**
  - Candidate nodes、candidate evidence、candidate conclusions、execution outputs 与 merged map content 分离。
  - Candidate artifacts 保留 group ID 和 job ID provenance。
  - Candidate artifact 需要有状态字段，至少支持 `pending_review`、`needs_review`、`merged`、`dismissed`。
  - 当 candidate node 与已有 node 同 parent 下同 title，或 candidate edge 与已有 edge 源/目标/kind 冲突时，状态必须设为 `needs_review`。

- [ ] **S8.5：实现 merge review UI**
  - `AgentPanel` 显示等待 review 的 candidate results。
  - 每个 candidate 显示 source node、job、status、merge action。
  - Merged candidates 变成普通 research map artifacts。
  - `needs_review` candidates 必须显示冲突原因，不能直接自动合并。

- [ ] **S8.6：实现 retry/cancel/ignore 控制**
  - Retry 创建一个链接到 previous job 的新 job。
  - Cancel 只改变选中的 job。
  - Ignore 隐藏或 dismiss 一个 candidate，但不删除 provenance。

### 阶段自动化验收

在 S8 实现完成后创建或更新自动化检查：

- [ ] **A8.1：Parallel group 创建测试**
  - 断言从选中 node IDs 可以创建 group、jobs 和 source scopes。

- [ ] **A8.2：独立 job 状态测试**
  - 断言同一 group 内，一个 job 可以失败，另一个 job 可以完成。

- [ ] **A8.3：Candidate 隔离测试**
  - 断言 candidate outputs 在 merge 前不会出现在 main `researchMap.nodes` 中。

- [ ] **A8.4：Merge provenance 测试**
  - 断言 merged outputs 保留 group、job、source provenance。

- [ ] **A8.5：Merge review UI 测试**
  - 断言 candidates 与 merged nodes 分开展示，并且可通过 UI 合并。

- [ ] **A8.6：候选冲突检测测试**
  - 断言同 title candidate node 和冲突 candidate edge 会进入 `needs_review`。
  - 断言 `needs_review` candidate 显示冲突原因，不会自动合并。

- [ ] **A8.7：并行研究空态、加载态和错误态测试**
  - 断言无 jobs、jobs running、job failed、group partially failed 都有明确 UI 表达。

### 验收命令

```powershell
npm test -- src/state/useKnowledgeApp.test.ts src/components
npm run build
```

预期结果：并行研究可见、可审核，并且不能静默改写主地图。

## 阶段 9：Rust Core 模型补齐与一致性复核

### 目标

在阶段 1 已提前同步 Rust core 模型的基础上，补齐并复核 Rust 研究模型，让未来 Tauri 和 agent harness 可以与前端交换 typed research payloads。

### 实施拆分

- [ ] **S9.1：修改 `crates/alpha_graph_core/src/lib.rs`**
  - 复核并补齐 Rust enums：object kind、session status、thread kind/status、node kind/status、expansion state、marker kind、edge kind、source kind、action kind、job kind、relationship graph node kind。

- [ ] **S9.2：添加 Rust structs**
  - 如果阶段 1 已添加基础 structs，本阶段只做补齐和字段对齐。
  - `ResearchObject`
  - `ResearchSession`
  - `ResearchThread`
  - `ResearchMap`
  - `ResearchNode`
  - `AgentMarker`
  - `ResearchEdge`
  - `SourceAsset`
  - `EvidenceAnchor`
  - `ResearchAction`
  - `AgentJob`
  - `ParallelAnalysisGroup`
  - `ExecutionRun`
  - `SideInquirySession`
  - `InquiryMessage`
  - `ConceptNote`
  - `KnowledgeDigest`
  - `RelationshipGraph`

- [ ] **S9.3：添加 serde 兼容**
  - Derive `Serialize` 和 `Deserialize`。
  - 对需要外部 payload 兼容的 enums 和 structs 使用 `#[serde(rename_all = "snake_case")]`。

- [ ] **S9.4：只在有用时添加 constructor helpers**
  - Helpers 保持小而直接。
  - 不要把编排逻辑放进 `alpha_graph_core`。

- [ ] **S9.5：导出稳定 public types**
  - 让 `alpha_agent_harness` 可以使用 core crate。

### 阶段自动化验收

在 S9 实现完成后创建或更新自动化检查：

- [ ] **A9.1：Rust model 构造测试**
  - 在 `crates/alpha_graph_core/src/lib.rs` 中添加单元测试，构造 research object、map、root node、child node、marker、evidence anchor。

- [ ] **A9.2：Serde snake_case 测试**
  - 断言序列化后的 enum values 是 snake_case。

- [ ] **A9.3：Relationship graph 构造测试**
  - 断言 Rust structs 可以表示 projected relationship graph payload。

### 验收命令

```powershell
cargo test -p alpha_graph_core
```

预期结果：Rust core model tests 通过。

## 阶段 10：Agent Harness 与 Tauri Payload Normalization

### 目标

让后端结果形状与 research workspace 对齐，并将 Rust snake_case payloads 规范化为 TypeScript camelCase objects。

### 实施拆分

- [ ] **S10.1：修改 `crates/alpha_agent_harness/src/lib.rs`**
  - 添加 research-oriented agent result shape，包含：
    - `research_map`
    - `evidence_anchors`
    - `actions`
    - `jobs`
    - `events`

- [ ] **S10.2：添加确定性 harness output**
  - 提供一个不需要 LLM key 的本地确定性函数，用来产出 research map result。
  - 复用 `alpha_graph_core` 类型。

- [ ] **S10.3：修改 `src/backend/tauriClient.ts`**
  - 将 snake_case Rust payloads 规范化为 camelCase TypeScript research objects。
  - 保持 browser-local fallback 可用。
  - 只将 legacy graph normalization 作为兼容路径保留。

- [ ] **S10.4：将前端状态接入 normalized result**
  - 提供一条路径，让 normalized research result 可以更新 research workspace state。

- [ ] **S10.5：保持执行显式化**
  - Agent 提出的 commands 和 scripts 都是 actions。
  - 运行命令需要在后续 execution integration 中由用户显式批准。

### 阶段自动化验收

在 S10 实现完成后创建或更新自动化检查：

- [ ] **A10.1：Rust harness result 测试**
  - 断言 `alpha_agent_harness` 输出包含 research map、evidence anchors、actions、jobs、events 的 result。

- [ ] **A10.2：Payload normalization 测试**
  - 在 `src/backend/tauriClient.test.ts` 中传入 snake_case research payload，并断言输出是 camelCase TypeScript 结构。

- [ ] **A10.3：Browser fallback 测试**
  - 断言 browser-local fallback 仍返回有效的 research-oriented result。

- [ ] **A10.4：Legacy compatibility 测试**
  - 断言 legacy graph payload 支持不会成为 primary state path。

### 验收命令

```powershell
npm test -- src/backend/tauriClient.test.ts
cargo test -p alpha_agent_harness
npm run build
```

预期结果：后端 normalization、Rust harness tests 和前端构建通过。

## 阶段 11：旧 Study/Synthesis/Export 流程降级

### 目标

保留已有学习、综合、导出能力作为有用的辅助动作，但不能让它们继续成为产品主轴。

### 实施拆分

- [ ] **S11.1：重新定位 Study Mode**
  - 将 study output 呈现为 research node action 或 generated artifact。
  - 不要让 study cards 成为默认第一屏结果。

- [ ] **S11.2：重新定位 Synthesis Mode**
  - 将 synthesis 呈现为 map/session summary action。
  - 将 synthesis output 链回 research nodes 和 evidence。

- [ ] **S11.3：重新定位 Export Center**
  - 将 exports 呈现为来自 research maps、relationship graph、concept notes 或 digests 的输出。
  - 不要让 export 成为主 workflow destination。

- [ ] **S11.4：更新 UI 词汇**
  - 主词汇：research object、research session、research thread、research map、research node、marker、evidence、action、job、side inquiry、candidate、relationship graph。

- [ ] **S11.5：移除旧方向主导感**
  - 避免产品文案让 AlphaAiGraph 看起来像 PDF 总结器、静态脑图、学习卡片生成器或聊天工具。

### 阶段自动化验收

在 S11 实现完成后创建或更新自动化检查：

- [ ] **A11.1：导航优先级测试**
  - 断言主导航使用研究地图、候选结果、资料、关系图谱、输出。

- [ ] **A11.2：辅助动作测试**
  - 断言 study、synthesis、export actions 只作为 secondary actions 可访问。

- [ ] **A11.3：文案回归测试**
  - 断言第一屏 labels 不再使用旧主轴标签作为主要产品框架。

- [ ] **A11.4：数据链接测试**
  - 断言生成的辅助产物会链接回 research nodes 或 evidence。

### 验收命令

```powershell
npm test -- src/components src/state/useKnowledgeApp.test.ts
npm run build
```

预期结果：旧功能仍可用，但不再定义产品主路径。

## 阶段 12：完整产品验收与提交边界

### 目标

验证完整产品方向已经实现，自动化测试通过，并且仓库可以安全 staged 或 commit。

### 实施拆分

- [ ] **S12.1：产品行为审查**
  - 第一屏是研究工作台。
  - 中间画布默认是研究工作流脑图。
  - 节点显示 markers。
  - 选中节点可以下钻一层。
  - 证据显示在选中节点旁边。
  - Side inquiry 默认不修改主地图。
  - Parallel outputs 在 merge 前是 candidates。
  - Relationship graph 从 research data 派生。

- [ ] **S12.2：自动化测试全量检查**
  - 运行所有前端测试。
  - 运行前端构建。
  - 运行所有 Rust workspace tests。

- [ ] **S12.3：隐私与安全审查**
  - 运行 `git status --short`。
  - 检查 changed file names 是否包含 `key`、`secret`、`token`、`password`、`.env` 或 private config names。
  - commit 前检查 staged files。
  - 确认没有触发 UE 或 Unreal Engine 编译。
  - 确认没有使用批量删除命令。

- [ ] **S12.4：提交边界**
  - 当前仓库新增文件较多，提交边界必须按阶段或职责拆分，避免把 S0 到 S12 压成一个不可审查的大提交。
  - 建议 commit 1：仓库工程骨架、依赖、Vite/Vitest 配置、Rust workspace 空 crate。
  - 建议 commit 2：TypeScript 研究领域模型和类型测试。
  - 建议 commit 3：research fixtures、golden projection fixture、确定性 research agent。
  - 建议 commit 4：relationship projection 和字段映射测试。
  - 建议 commit 5：workspace state、节点下钻、side inquiry、parallel candidate 状态逻辑。
  - 建议 commit 6：三栏研究工作台 UI、空态/加载态/错误态测试。
  - 建议 commit 7：Rust core 模型对齐、agent harness payload、Tauri normalization。
  - 建议 commit 8：legacy flow demotion、隐私检查、最终验收修复。
  - 如果某个阶段仍然包含大量新文件，继续按 `types -> fixtures -> logic -> UI -> backend` 拆小。

### 阶段自动化验收

在 S12 实现完成后创建或更新自动化检查：

- [ ] **A12.1：完整前端测试套件**
  - 所有前端测试通过。

- [ ] **A12.2：完整前端构建**
  - 生产构建通过。

- [ ] **A12.3：完整 Rust 测试套件**
  - Workspace tests 通过。

- [ ] **A12.4：隐私扫描命令**
  - 有一个明确命令或脚本，在 staging 前检查 changed file names 是否包含敏感词。

### 验收命令

```powershell
npm test
npm run build
cargo test --workspace
git status --short
```

预期结果：测试和构建通过，变更文件符合预期，没有 secret 或 private files 被 staged。

## 全局验收标准

- 应用主词汇是 research object、session、thread、map、node、marker、evidence、action、job、side inquiry、candidate、execution run、relationship projection。
- `AgentMarker` 承载重点、难点、风险、下钻、验证、不确定性和优先级指导。
- `ResearchNode.kind` 描述节点是什么，不能被 marker 概念污染。
- 第一张生成地图是高层地图，并且可以渐进式展开。
- Side inquiries 默认隔离，除非被 promote。
- Parallel task outputs 默认是 candidates，除非被 merge。
- Agent 不能自主 merge candidate，也不能自主 promote side inquiry；这些动作必须由用户显式触发或经过明确审核策略。
- Obsidian-style graph 从 research data 投影而来。
- 现有 browser-local mode 可用。
- Study、synthesis、export 是辅助能力。
- 声称实现完成前，`npm test`、`npm run build`、`cargo test --workspace` 必须通过。
