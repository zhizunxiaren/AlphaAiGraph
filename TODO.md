## 下一步任务

### 代码审查与修正
- [x] 对当前代码库做一次完整 codereview，检查类型安全、React 模式、错误处理
- [x] 检查 vitest.config.ts 是否独立（S0.3 要求独立文件，避免与 vite.config.ts 耦合）

### Rust 模型补齐（issue #14–#15）
- [x] 补齐缺失的 Rust structs：ResearchSession、ResearchThread、SourceAsset、ExecutionRun、SideInquirySession、InquiryMessage、ConceptNote、KnowledgeDigest、ParallelAnalysisGroup、CandidateResearchNode、Provenance
- [x] 补齐已有 structs 缺失字段：ResearchObject(createdAt/updatedAt)、ResearchNode(parentNodeId/expansionState/actionIds/createdAt/updatedAt/provenance)、ResearchMap(sessionId/threadId/createdAt/updatedAt)、ResearchEdge(mapId/createdAt/provenance)、AgentMarker(rationale/confidence)、EvidenceAnchor(quote、locator 缺 page/lineStart/lineEnd/section)、AgentJob(nodeIds/sourceAssetIds/outputIds/groupId/previousJobId/createdAt/updatedAt)、RelationshipGraph(generatedAt/edges)

### 类型与建模修正（issue #3–#4, #16–#19）
- [x] AgentMarkerKind 职责分离：考虑将 recommended_drilldown 和 needs_validation 拆分为独立 ResearchAction（或在 JSDoc 中显式标注 marker 与 action 的关系）
- [x] core_entry marker 语义澄清：确认是"节点是核心入口"还是"节点应出现在核心入口列表"
- [x] ResearchMap 添加父子索引或查询层缓存，避免 O(n) 遍历子节点
- [x] CandidateResearchNode 的 node 字段冗余问题：评估内嵌 vs 引用方案，防止 merge 时 ID 碰撞

### 语义边界补齐（issue #5–#6）
- [x] expandResearchNode 去重语义：定义对同一方向重复下钻时的行为（去重/追加/报错）
- [x] mergeCandidateNode 冲突语义：定义 candidate node title 与已有节点同名时的检测与处理

### 测试补充（issue #7–#9）
- [x] Stage 3 类型形状检查：验证 agent 产物结构符合 S1 类型定义
- [x] Stage 5 状态边界测试：已 expanded 节点再次下钻、不存在的 nodeId 下钻、marker 空列表操作
- [x] Stage 6–8 空态/加载态/错误态 UI 测试

### Plan 工程顺序调整（issue #10）
- [x] 评估是否将 Rust core model (S9) 提前到 S1 完成后执行，减少 TS 类型调整后的返工

### 提交策略（issue #21）
- [x] 重新评估提交边界：当前工作量远超 1 个 commit，建议按阶段或按 types→fixtures→logic→UI 分组提交

### 验证
- [x] 运行 `npm test` 确保所有现有测试通过
- [x] 运行 `cargo test` 确保 Rust 测试通过
- [x] 运行 `npm run build` 确保 TypeScript 编译通过

## 待确认任务

- [ ] 提交当前修改（AGENTS.md + issue.md 变更）

## 里程碑状态
未完成
