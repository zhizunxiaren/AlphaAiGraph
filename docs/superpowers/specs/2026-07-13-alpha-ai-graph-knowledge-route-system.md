# AlphaAiGraph 知识路线系统重构规格

日期：2026-07-13

## 意图

AlphaAiGraph 要把“分析一项技术、一篇文档或一个复杂问题”的过程变成一张持续生长的知识图谱。用户先看到以脑图形式呈现的高层结构，然后可以从任意知识点下钻、展开关联、提问、总结、补证据和比较方案。分析过程不是临时对话；每次有效探索都会成为可追溯的知识节点或语义关系。最终产物既是用户长期积累的知识体系，也是能够解释“为什么选择这条技术路线”的决策图谱。

## 根本判断

旧模型把 `ResearchMap` 作为主数据，把 `RelationshipGraph` 作为分析结束后的派生投影。这会导致三个问题：

1. 脑图表达研究流程，知识图谱表达最终结果，两套结构需要同步。
2. 节点提问和总结被隔离为旁路产物，不能自然成为图谱的一部分。
3. 技术路线只是一类研究结论，没有目标、约束、候选方案、证据和推荐步骤之间的显式关系。

V2 采用相反的不变量：

> `KnowledgeGraph` 从分析开始就是唯一主数据。脑图、全局网络、阶段总结和技术路线都是它的视图或子图。

## 假设

- 第一批用户是需要理解技术、文档并做工程路线决策的个人研究者和工程师。
- 第一版先使用确定性本地 Agent 证明交互闭环，真实模型调用、持久化和多人协作后接。
- 原始资料不可变；Agent 只能创建知识节点、关系和来源锚点，不能改写原始资料。
- Agent 生成内容必须保留 `createdBy`、来源和置信度；没有来源的内容只能是问题、假设或待验证综合。
- 旧 `ResearchMap` 模块作为迁移兼容层暂时保留，但不再是应用入口或新能力承载点。

## 第一性原理模型

- 目标：把一次次分析变成可复用、可追溯、可继续生长的个人知识体系，并从证据中生成可解释的技术路线。
- 角色：用户负责选择方向、判断价值和批准决策；Agent 负责结构化、关联、总结、发现缺口和提出候选路线；来源提供可验证事实。
- 输入：技术主题、文档/PDF、代码仓库、用户问题、约束、已有知识图谱。
- 输出：知识节点、语义关系、来源锚点、问题与回答、阶段综合、路线候选、决策和执行步骤。
- 约束：渐进式展开；原始来源不可变；不把无来源推断伪装成事实；用户可追溯每个结论；图谱必须能持续增量更新。
- 不变量：一份知识只保存在主图一次；任何视图不拥有独立业务数据；任意知识节点都可成为新的分析根；提问和总结不会只留在聊天记录中；路线决策必须显式连接目标、约束、证据与候选方案。
- 失败模式：生成漂亮但不可继续操作的静态脑图；每次提问都重新 RAG 而不积累；总结产生孤立文档；图谱节点没有证据或来源状态；技术路线只有一句推荐结论。
- 验证：模型构造测试、下钻幂等测试、问答/总结入图测试、视图共享主图测试、Rust/TypeScript 序列化对齐、UI 交互测试和浏览器截图复核。

## 简化后的范围

当前切片只建立正确的产品骨架：单一知识图谱、三个视图、任意节点下钻、节点级提问、阶段总结与路线子图。真实文档解析、LLM provider、数据库和大规模图布局暂不进入这一切片，因为它们不应先于主数据模型。

## 裁剪结果

### 保留

- 单一 `KnowledgeGraph`：直接决定系统能否长期复利。
- 脑图 / 知识网络 / 技术路线三种视图：对应理解、关联和决策三个真实任务。
- 任意节点下钻、提问、总结：构成最小但完整的知识生长循环。
- 来源锚点、置信度、创建者：保证图谱可以验证和维护。
- 旧模块兼容层：避免一次性破坏已有行为和测试。
- Raw / Wiki / Schema / Index / Log 知识库骨架：把项目自身也按 LLM Wiki 模式维护。

### 延后

- PDF/OCR/代码解析器：先等通用 ingest contract 稳定。
- 真实 LLM 编排和 provider 选择：先用确定性引擎固定输入输出边界。
- 向量数据库和 embeddings：数百页内优先 index + graph traversal + 文本搜索。
- 自动合并和自动重构图谱：需要来源策略、冲突策略和用户信任机制。
- 多人协作与权限：不阻塞个人知识系统闭环。
- 3D 图、复杂物理布局：不是知识质量或路线质量的前置条件。

### 删除

- “研究流程图是主数据，知识图谱是最终投影”的双主面设计。
- 把所有节点级提问默认隔离为不影响主图的旁路会话。
- 以 Agent 任务流、队列和运行日志占据第一屏中心的驾驶舱结构。
- 把“最终导出知识图谱”理解为最后一步；知识图谱从第一步就存在。

## 需求拆解

- R1：用户输入任意分析对象后，系统生成一张高层知识脑图，但不自动穷尽所有深度。
- R2：用户可把任意知识节点设为焦点，从该点继续下钻任意层级。
- R3：用户可围绕任意节点提问，问题和回答都进入同一知识图谱并与上下文关联。
- R4：用户可对任意节点及其局部网络生成阶段总结，总结保持对覆盖节点的显式关系。
- R5：脑图、全局知识网络和技术路线使用同一组节点与边，不复制业务数据。
- R6：技术路线必须表达目标、约束、候选方案、证据、决策和步骤，而不是一段无结构文本。
- R7：知识节点应支持来源、状态、创建者、置信度和后续验证。
- R8：随着新资料和新问题进入，系统应更新既有知识而不是每次从原文重新推导全部结论。
- R9：用户必须能看见并控制 Agent 当前使用的节点、来源和关系范围。
- R10：Agent 生成的节点、关系、回答和总结必须先形成候选 graph patch，高影响内容只有显式接受后才进入正式图谱。

## 功能拆解

- F1 `KnowledgeGraph Core`：节点、边、来源引用与单一主图。
- F2 `Rooted Views`：脑图、网络和路线子图的根节点/过滤/布局配置。
- F3 `Progressive Expansion`：只展开用户选中的节点，重复操作保持幂等。
- F4 `Node Inquiry`：节点问题、回答、上下文边和沉淀状态。
- F5 `Synthesis`：局部总结节点与 `summarizes` 关系。
- F6 `Route Reasoning`：目标、约束、方案、决策和步骤的 typed subgraph。
- F7 `Source Provenance`：原始来源、定位信息、证据关系与验证状态。
- F8 `Knowledge Maintenance`：index、日志、孤儿节点、冲突和过期知识检查。
- F9 `Context Packet`：把焦点节点、相邻节点、来源和上下文策略组合成用户可见的 `KnowledgeSelection`。
- F10 `Candidate Graph Patch`：保存 Agent request、结构化 operations、置信度、接受/拒绝状态和审计历史。

## 核心领域模型

```text
AnalysisSubject
  -> root KnowledgeNode
  -> KnowledgeGraph (唯一主数据)
       -> KnowledgeNode[]
       -> KnowledgeEdge[]
       -> SourceRef[]

KnowledgeView
  -> rootNodeId
  -> focusNodeId
  -> kind: mind_map | network | route
  -> filters / visibleDepth / layout

NodeConversation
  -> question KnowledgeNode
  -> answer/synthesis KnowledgeNode
  -> answers / related_to edges

KnowledgeSelection
  -> focusNodeId
  -> nodeIds / sourceIds
  -> selected_node | selected_and_neighbors | whole_subject

AgentRequest
  -> KnowledgeSelection
  -> CandidateGraphPatch
       -> create_node / create_edge / create_conversation
       -> pending_review | accepted | rejected
```

`KnowledgeNodeKind` 第一版：

```text
subject | topic | concept | claim | evidence | question | synthesis | goal |
criterion | constraint | route_option | decision | route_step
```

`KnowledgeRelationKind` 第一版：

```text
contains | explains | depends_on | supports | contradicts | answers |
summarizes | compares | constrains | recommends | precedes | related_to
```

节点类型描述“它是什么”，关系类型描述“它如何连接”；重点、风险、置信度、状态和来源不应滥用为节点类型。

## 主交互闭环

```text
输入技术 / 文档 / 问题
  -> 生成第一层知识脑图
  -> 选择任意节点
  -> 下钻 / 提问 / 总结 / 补来源 / 比较
  -> 新知识以节点和关系进入同一图谱
  -> 从任意新节点继续展开
  -> 切换全局网络检查关联与缺口
  -> 切换技术路线视图比较目标、约束和候选方案
  -> 形成带证据的决策与执行步骤
```

## 视图定义

### 分析脑图

以任意节点为根的局部树形/径向视图，适合逐层理解。它只决定可见范围和布局，不创建独立的 `MindMapNode`。

### 知识网络

显示跨层级、跨分析对象的语义关系，突出中心节点、孤儿节点、矛盾、证据密度和未回答问题。

### 技术路线

显示与路线决策有关的子图。最小有效链路为：

```text
目标 -> 约束 -> 候选方案 -> 比较证据 -> 决策 -> 路线步骤
```

没有约束和证据连接的推荐只能标记为“待验证建议”，不能成为已确定路线。

## LLM Wiki 对齐

- `knowledge-base/raw/`：不可变原始资料。
- `knowledge-base/wiki/`：Agent 维护的可读知识页，是知识图谱的 Markdown 表达。
- `knowledge-base/SCHEMA.md`：页面、关系、来源和维护工作流约定。
- `knowledge-base/index.md`：内容目录和导航入口。
- `knowledge-base/log.md`：append-only 的 ingest/query/lint 记录。

产品不会退化成文件 wiki；Markdown 层用于可读、可版本化和可导出，`KnowledgeGraph` 仍是应用运行时的统一语义模型。

## 落地追踪矩阵

| 需求 | 支持功能 | 实施步骤 | 验收检查 |
| --- | --- | --- | --- |
| R1,R2 | F1,F2,F3 | S1,S2 | V1,V2 |
| R3 | F4 | S3 | V3 |
| R4 | F5 | S4 | V4 |
| R5 | F1,F2 | S1,S2 | V1,V5 |
| R6 | F6 | S5 | V6 |
| R7 | F7 | S6 | V7 |
| R8 | F8 | S7 | V8 |
| R9 | F9 | S2,S3 | V10 |
| R10 | F10 | S3,S4 | V11 |

## 实施路径

- S1：在 TypeScript 与 Rust 中引入 `KnowledgeGraph` V2，并把旧 research 类型标记为迁移兼容模型。
- S2：实现基于单一图谱的 `mind_map / network / route` rooted views，应用入口切换到 V2。
- S3：实现节点级提问，问题和回答以节点与边进入图谱。
- S4：实现局部总结，记录覆盖节点和 `summarizes` 关系。
- S5：实现路线分析模板、约束/方案比较和决策状态机。
- S6：实现原始资料 ingest contract、来源锚点和 evidence lifecycle。
- S7：实现 Markdown 持久化、index/log、增量更新和图谱 lint。
- S8：接入真实 Agent/provider、候选 patch 审核、持久化和大图检索。
- S9：在 V2 验收稳定后逐文件迁移或归档旧 research 模块；任何批量删除由用户手动执行。

## 验收检查

- V1：三个视图引用同一个 `KnowledgeGraph`，不存在第二套节点主数据。
- V2：任意叶节点可展开一层；重复展开不会生成重复子节点。
- V3：节点提问后图中出现 question、answer/synthesis 节点和 `answers` 关系。
- V4：总结后出现 synthesis 节点，并通过 `summarizes` 连接目标及局部关联节点。
- V5：切换视图不会复制、丢失或静默改写知识节点。
- V6：路线视图能表达目标、约束、至少两个方案、推荐决策和执行步骤。
- V7：事实性 claim 可追溯来源；无来源内容不会伪装成 verified evidence。
- V8：知识库 index/log 可增量更新，lint 能识别孤儿、矛盾、过期和缺来源节点。
- V9：`npm test`、`npm run build`、`cargo test --workspace` 全部通过。
- V10：切换节点或上下文范围时，输入区明确显示焦点节点、上下文节点数、来源数和关系深度。
- V11：下钻、回答和总结在接受前不改变正式图谱；接受后按结构化 operations 幂等写入，拒绝后图谱保持不变。
