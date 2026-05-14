# Plan.md 审查问题

## 语义/建模

### 1. "双重节点" 投影映射表缺失

`ResearchNode` 和 `RelationshipGraphNode` 是不同类型，S1.7 定义类型，S4 实现投影逻辑。但中间缺少显式的字段映射表（title→label、nodeId→sourceId 等），UI 层容易用混两个模型。

### 2. S1.7 与 S4 的时间差验证困难

S2–S3 产出的 fixtures 和 agent 产物缺乏黄金标准 projection 对照。建议在 S2 就附上手写 `RelationshipGraph` 样本，供 S4 的 `projectRelationshipGraph` 对齐验证。

---

## 类型设计

### 3. `AgentMarkerKind` 职责混合

当前 marker kind 包含两类：

| 类别 | marker |
|------|--------|
| 信号标记 | focus, difficulty, risk, low_priority, uncertain |
| 行动标记 | recommended_drilldown, needs_validation |

`recommended_drilldown` 和 `needs_validation` 暗示下一步动作，更适合作为独立 `ResearchAction` 挂在节点上，而非混在 marker 里。否则 marker 同时承担"静态标签"和"待办事项"两个职责。

### 4. `core_entry` marker 含义模糊

是"该节点是核心入口"还是"该节点应出现在核心入口列表"？建议在类型定义中加一行注释说明。

---

## 边界语义缺失

### 5. `expandResearchNode` 去重语义 (S3.5)

未定义用户对同一方向重复下钻时的行为：
- 去重（同 title 跳过）？
- 追加新 node？
- 报错？

建议在 `src/research/researchAgent.ts` 接口中写明策略。

### 6. `mergeCandidateNode` 冲突语义 (S5.7, S8.5)

未定义以下情况：
- candidate node title 与已有 node 同名
- candidate edge 源/目标与已有 edge 冲突

建议在 S8.4–S8.5 增加 merge conflict detection：冲突时标记为 `needs_review`。

---

## 验收测试缺口

### 7. Stage 3 缺少类型形状检查

A3.1 只验证 agent 产物存在，未验证结构符合 S1 类型定义（node 有 kind、edge 有 sourceNodeId/targetNodeId 等）。

### 8. Stage 5 缺少状态边界测试

以下场景无验收条目：
- 对已 expanded 节点再次下钻
- 对不存在的 nodeId 下钻
- marker 空列表节点的 marker 操作

### 9. Stage 6–8 缺少空/加载/错误态 UI 测试

面板有条件渲染逻辑（选中节点 vs 无选中节点），但各阶段验收无对应的空态检查条目。

---

## 工程顺序

### 10. Rust model (S9–S10) 位置偏后

S9 放在 S8（并行研究 UI）之后。如果前 8 阶段 TS 类型在 UI 验证中大面积调整，Rust 模型需返工。建议将 Rust core model (S9) 提前到 S1 完成后执行，与 TS 类型同期对齐。

---

## 细微问题

### 11. 测试配置歧义 (S0.3)

"通过 `vite.config.ts` 或 `vitest.config.ts` 配置测试环境"——建议明确使用 `vitest.config.ts` 独立文件。

### 12. Agent 安全边界缺失

全局验收标准有 "Side inquiries 默认隔离" 和 "Parallel outputs 默认是 candidates"，但缺少 **"Agent 不能自主 merge 或 promote"**，建议写入执行规则。

### 13. Tauri 2 阻塞风险

技术栈包含 Tauri 2，但直到 S10 才实际使用。如遇阻塞，Stage 0–8 应能在纯 browser 模式下独立验证——建议将此豁免条件写入 Plan。

---

## 2026-05-12 审查补充

### 14. Rust 模型滞后于 TS 端

`crates/alpha_graph_core/src/lib.rs`（224 行）仅覆盖约 60% 的 TS 类型。缺失的 Rust structs：

- `ResearchSession`、`ResearchThread`
- `SourceAsset`、`ExecutionRun`
- `SideInquirySession`、`InquiryMessage`
- `ConceptNote`、`KnowledgeDigest`
- `ParallelAnalysisGroup`、`CandidateResearchNode`
- `Provenance`

S1.9 已声明"提前同步 Rust core 研究模型"，但实际只做了核心 9 个 struct/enum。S9 的补齐工作量可能比计划的"复核并补齐"要大得多。如果 S10（Tauri Payload Normalization）依赖完整模型，建议现在就开始补齐缺失 structs，避免阻塞。

### 15. Rust Struct 字段不完整

已存在的 Rust structs 字段少于 TS 端对应类型：

| Struct | 缺失字段 |
|--------|---------|
| `ResearchObject` | `createdAt`、`updatedAt` |
| `ResearchNode` | `parentNodeId`、`expansionState`、`actionIds`、`createdAt`、`updatedAt`、`provenance` |
| `ResearchMap` | `sessionId`、`threadId`、`createdAt`、`updatedAt` |
| `ResearchEdge` | `mapId`、`createdAt`、`provenance` |
| `AgentMarker` | `rationale`、`confidence` |
| `EvidenceAnchor` | `quote`，locator 缺少 `page`、`lineStart`、`lineEnd`、`section` 字段 |
| `AgentJob` | `nodeIds`、`sourceAssetIds`、`outputIds`、`groupId`、`previousJobId`、`createdAt`、`updatedAt` |
| `RelationshipGraph` | `generatedAt`、`edges` 字段缺失，且无 `RelationshipGraphEdge` struct |

这些字段在 TS 端已定义，Rust 端补齐时必须对齐，否则 Tauri payload 序列化会丢数据。

### 16. `AgentMarkerKind` 职责混合

`recommended_drilldown` 和 `needs_validation` 暗示下一步动作，与 `focus`/`difficulty`/`risk` 这类纯标签混在同一个 enum 中。Plan S1.3 解释了设计理由：

> recommended_drilldown 和 needs_validation 仍然是 Agent 判断信号，用于解释"为什么建议下一步做某事"。真正可点击、可排队或可执行的下一步必须同时表示为 ResearchAction。

但理解成本仍在：开发者需要额外认知开销去区分"marker 是信号" vs "action 才是可执行项"。建议在 `AgentMarkerKind` 的 JSDoc 中显式标注这个关系。

### 17. `core_entry` marker 与 `AgentMarkerKind` 的语义张力

Plan S1.3 对 `core_entry` 的定义是"该节点是理解当前对象的核心入口节点"。但从建模角度看，一个节点是否为"核心入口"是相对于某个 object/session 而言的，不本质上是 agent 的判断标记。如果后续出现用户手动指定入口节点的需求，`core_entry` 放在 `AgentMarkerKind` 中会显得不合适。建议考虑是否将入口标记独立为 `ResearchNode` 的一个字段或单独的标记类型。

### 18. `ResearchMap` 缺少父子索引

`ResearchNode` 使用 `parentNodeId?: string` 表达树结构，但 `ResearchMap` 本身不维护任何父子索引。查找某个节点的所有子节点需要 O(n) 遍历全部 `nodes` 数组。对于大规模地图（1000+ 节点），在频繁展开/折叠/渲染时可能成为性能瓶颈。

建议在 `ResearchMap` 上增加一个派生索引，或在投影/查询层建立 `Map<string, string[]>` 的 parent→children 缓存。

### 19. `CandidateResearchNode` 的 `node` 字段冗余

`CandidateResearchNode` 内嵌了完整的 `ResearchNode`，但同时 candidate 本身又有 `status` 和 `conflictReason`。merge 时将内嵌 node 直接注入主地图，会导致 node ID 碰撞风险。建议 candidate 用独立的 `candidateNodeId` + 引用而非内嵌完整 node，或将 candidate node 存入独立的候选池。

### 20. `vitest.config.ts` 可能未独立

S0.3 要求创建独立的 `vitest.config.ts`，但目录中未发现该文件。如果 vitest 配置内联在 `vite.config.ts` 中，测试环境和构建配置耦合在一起，不符合"测试专属配置不要混在 Vite 构建配置里"的要求。

### 21. 建议的提交边界需要重新评估

S12.4 建议 6 个 commit，但当前 `git status` 显示几乎所有文件都是 untracked/new。实际上从 S0 到当前状态的工作量远超 1 个 commit 能承载的范围。建议将建议改为更细的粒度，例如按阶段分组或按 types → fixtures → logic → UI 分组。
