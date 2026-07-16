# AlphaAiGraph 旧 Research 模型迁移映射

> 日期：2026-07-15  
> 状态：阶段 6 权威静态盘点；本文件不授权删除或迁移代码  
> 范围：`src/types.ts` 第 1-424 行的 V1 workspace 模型、其 TypeScript 消费者，以及 Rust 中同构的 V1 contract

## 1. 结论

旧 `Research*` 不是一组可以按名称整体删除的类型。当前仓库存在三类不同对象：

1. **V1 兼容模型**：`ResearchObject`、`ResearchSession`、`ResearchThread`、`ResearchMap`、`ResearchNode`、`ResearchEdge` 及同一 `ResearchWorkspaceSnapshot` 下的辅助类型。它们已退出浏览器生产入口，但仍被 V1 测试、fixture 和 Rust 公共 API 引用。
2. **V2 正式研究编排**：`ResearchBrief`、`ResearchPlan`、`ResearchTask`、`ResearchRound`、`SearchQuery`、`VerificationRecord`、`ResearchOrchestration`。这些类型以 ID 引用 Project、KnowledgeGraph、Source 和 Patch，是当前生产模型，**不属于待淘汰范围**。
3. **跨代共享类型**：`ActorKind` 仍被 V2 `KnowledgeNode`、Patch audit 和知识演化直接使用；不能随 V1 类型移动或删除。V1 `SourceAsset` 仍以空的 migration-only 字段保留在 schema v2 持久化边界。

迁移原则是：Project 保存目标和流程，KnowledgeGraph 保存知识，KnowledgeSourceAsset/SourceAnchor 保存不可变来源，ResearchOrchestration 保存研究执行引用，视图只做派生，审计历史不可伪装成知识。旧字段没有可靠等价物时必须显式保留为 history-only 或列为 drop candidate，不能塞入 `KnowledgeNode.summary`。

## 2. 引用证据与状态

状态代码：

- **P**：由当前浏览器生产入口可达。
- **C**：只在 V1 兼容模块中可达；模块本身仅由测试入口加载。
- **R**：仍是 Rust crate 的非测试公共 API。
- **T**：仅测试或 fixture 直接引用。
- **M**：只作为 schema migration 兼容字段存在。
- **N**：仓库中没有独立消费者；只作为父结构的内嵌字段出现。

证据：

- `src/App.tsx` 只导入 `KnowledgeWorkspaceShell` 和 `useKnowledgeWorkspace`；`src/main.tsx` 只渲染该 V2 `App`。
- `AppShell`/`useResearchWorkspace` 的外部根引用只有 `src/components/AppShell.test.tsx` 和 `src/state/useResearchWorkspace.test.tsx`。其下 `AgentFeed`、`GraphCanvas`、`NodeInspector`、`ProjectRail`、`SourceDrawer` 因而是 C/T，不是 P。
- `src/research/researchAgent.ts` 和 `src/research/projection.ts` 的根消费者是各自测试及 V1 hook；`src/research/fixtures.ts` 是 V1 默认 seed。
- `crates/alpha_agent_harness::deterministic_root_node` 与 `crates/alpha_exporters::export_node_title` 仍在公共签名中返回/接收 `ResearchNode`，所以 Rust V1 core 不能在后续清理项直接删除。
- `src/knowledge/knowledgeEngine.ts` 将 `sourceAssets` 初始化为空；`workspacePersistence.ts` 只为 schema 兼容读取它。V2 来源数据使用 `knowledgeSourceAssets` 与 `sourceAnchors`。
- V2 `ResearchOrchestration` 被 `researchSearch`、`researchRound`、`researchVerification`、`researchConclusion`、`researchRoute*`、`researchResults` 和 persistence 生产代码直接使用，状态为 P。

| V1 类型/族 | 当前状态 | V2 归属 | 结论 |
| --- | --- | --- | --- |
| `ResearchObject` | C/T；Rust core R | Project + ProjectSubject + Source | 已有分拆等价物 |
| `ResearchSession` | C/T；Rust core R | Project lifecycle + history | 大部分已有，session identity 无需继续演进 |
| `ResearchThread` | C/T；Rust core R | ResearchOrchestration + KnowledgeSelection | 部分已有；merge policy 语义必须收紧 |
| `ResearchMap/Node/Edge` | C/T；Rust core R | KnowledgeGraph + KnowledgeView | 主体已有；若迁移必须转换语义而非复制 |
| `AgentMarker` | C/T；Rust core R | Knowledge metadata + view diagnostics | 部分已有，无一对一持久化类型 |
| `SourceAsset/EvidenceAnchor` | C/T，另有 M | KnowledgeSourceAsset + SourceAnchor + Evidence node | 已有更严格等价物 |
| `ResearchAction` | C/T | AgentRequest + CandidateGraphPatch + AgentRun | 部分已有；脚本/命令能力尚缺 |
| `AgentJob/ParallelAnalysisGroup` | C/T | ResearchTask/Plan/Round + AgentRun | 仍有价值，留给下一计划项迁移 |
| `ExecutionRun` | C/T | AgentRun + history-only execution record | provider run 已有；本地命令运行尚无等价物 |
| `SideInquirySession/InquiryMessage` | C/T | question/answer nodes + NodeConversation + AgentRequest | 核心结果已有；完整 chat transcript 尚无等价物 |
| `ConceptNote/KnowledgeDigest` | C/T | concept/synthesis node + derived view | 已有图表达；digest 不应成为第二主数据 |
| `RelationshipGraph*` | C/T | `KnowledgeView(kind=network)` 的纯派生 projection | 持久化副本是 drop candidate |
| `Provenance` | C/T；Rust core R | SourceRef/Anchor + Patch audit + orchestration output IDs | 必须拆分，不能原样复制 |
| `CandidateResult` | C/T | CandidateGraphPatch | 有正式等价物，但接受门禁完全不同 |
| `ResearchWorkspaceSnapshot` | C/T | KnowledgeWorkspaceSnapshot | 已被 V2 workspace 取代 |
| V2 `ResearchBrief` 至 `ResearchOrchestration` | P | ResearchOrchestration | 正式模型，保留并继续维护 |

## 3. 字段级迁移映射

下列字段组穷举 V1 interface 的全部字段；斜线分隔的字段使用同一迁移规则。

### 3.1 ResearchObject、Session 与 Thread

| 旧字段 | 目标类别与字段 | 等价状态/动作 |
| --- | --- | --- |
| `ResearchObject.id` | Project：`Project.id`；对象主题 identity 用 `ProjectSubject.id` | 需在导入器中选择稳定主键，不复制成两个无关 ID |
| `kind` | Project/Subject：`Project.mode` 与 `ProjectSubject.kind`；`pdf` 还映射 Source `format=pdf` | `codebase/topic` 可直映；`project/document_collection/pdf` 需按实际主题拆分 |
| `title/description` | `Project.title`、`ProjectSubject.title/description` | 已有等价物 |
| `rootUri` | Source：`KnowledgeSourceAsset.uri` 或导入请求 URI | 不进入 Project；无来源时可丢弃空值 |
| `createdAt/updatedAt` | `Project.createdAt/updatedAt` | 已有等价物 |
| `status` | Project：`Project.status/workflow`；扫描失败属于 IngestResult/ResearchTask | 不能把 scanning/failed 硬映射为 Project status |
| `metadata` | Source metadata、受治理的 Knowledge metadata，或 history-only import metadata | 无通用 KV 容器；逐 key 白名单迁移 |
| `ResearchSession.id` | history-only import/session ID | Project 已承担持久工作单元；不新建第二 session 主体 |
| `objectId` | Project：解析为 `Project.id` | 重写引用 |
| `title/goal` | `Project.title/goal` | 已有等价物；空 goal 不覆盖现值 |
| `activeMapId` | KnowledgeGraph/KnowledgeView：`Project.graphId` + `activeViewId` | map identity 不保留为第二 graph |
| `activeThreadIds` | ResearchOrchestration：由 active Plan/Round/Task 状态派生 | 不持久化冗余索引 |
| `status` | Project：active/paused/completed/archived → workflow/status；paused 仅 history-only，V2 无直接值 | 部分等价 |
| `createdAt/updatedAt` | Project 或 history-only migration record | 合并时取可审计时间，不覆盖更新历史 |
| `ResearchThread.id/parentThreadId` | ResearchOrchestration：Plan/Round/Task identity/dependency | 无通用 Thread 实体；按 kind 转换 |
| `sessionId/mapId` | Project/Knowledge：`projectId/graphId` | 重写引用；编排对象不直接拥有图 |
| `kind` | ResearchOrchestration：main/source_analysis/node_deep_dive/parallel_batch/validation/comparison → Plan/Task/Round 的 strategy/kind/role | 部分等价，需确定性转换表 |
| `title/goal` | ResearchPlan.strategy 或 ResearchTask `title/objective` | 已有承载位 |
| `focusNodeIds` | KnowledgeSelection 或 ResearchTask `inputNodeIds` | 已有等价物 |
| `sourceAssetIds` | ResearchTask `inputSourceIds` | 先重写为不可变 source version ID |
| `jobIds` | ResearchPlan `taskIds` / ResearchRound `taskIds` | 需 AgentJob→ResearchTask ID 映射 |
| `mergePolicy` | CandidateGraphPatch 审核治理 | `manual_review` → pending review；两个 auto 值禁止直映，V2 不允许自动写图 |
| `status` | ResearchPlan/Task/Round status | failed 进入 run/task error history；paused 无直接值 |
| `createdAt/updatedAt` | 对应编排实体时间 | 已有等价物 |

### 3.2 ResearchMap、Node、Marker 与 Edge

| 旧字段 | 目标类别与字段 | 等价状态/动作 |
| --- | --- | --- |
| `ResearchMap.id` | KnowledgeGraph：目标使用 `Project.graphId` 指向的 canonical graph | 旧 map ID 只保留在 migration ledger |
| `sessionId` | Project：`Project.id` | 重写引用 |
| `title` | KnowledgeView title；仅新建独立 graph 时才可作为 graph title | 通常 view-only |
| `rootNodeId` | ProjectSubject `rootNodeId` + graph `rootNodeIds` | 已有等价物 |
| `nodes/edges` | KnowledgeGraph `nodes/edges` | 转换后并入同一图，不保留数组副本 |
| `createdAt/updatedAt` | KnowledgeView 无时间字段；graph 时间只在新图导入时采用 | 否则 history-only |
| `ResearchNode.id` | KnowledgeGraph node：`KnowledgeNode.id` | canonical ID 冲突时必须显式重映射 |
| `mapId` | 由 graph containment 隐含 | drop candidate；KnowledgeNode 不反向持有 graph ID |
| `parentId` | KnowledgeEdge：`parent contains node` | 转为 edge，不保留双写 parent pointer |
| `kind` | KnowledgeNode.kind | 见下方枚举转换 |
| `title/summary` | KnowledgeNode `title/summary` | 已有等价物 |
| `detail` | 子级 concept/fact/synthesis node，或导入时合并 summary | 无独立 detail 字段；禁止无界文本静默拼接 |
| `depth` | KnowledgeNode.depth | 已有字段，但应以结构校验 |
| `order` | view-only layout/order | 当前 V2 无持久 order；history-only 或 drop candidate |
| `expansionState` | view-only loading 状态，或 ResearchTask/AgentRun 状态 | 不属于知识节点主数据 |
| `status` | KnowledgeNode `status/epistemicStatus` | 见下方状态转换，需拆分工作流与认知状态 |
| `markers` | Knowledge tags、uncertainty/risk node、lint/view decoration | 逐 marker kind 转换；不新增第二 marker 主数据 |
| `evidenceIds` | KnowledgeEdge `evidence supports target` + node `sourceRefs` | 由图关系派生，不保留 ID 数组 |
| `actionIds` | AgentRequest/Run history 或 ResearchTask | history/orchestration，不进入 node |
| `inquiryIds` | question nodes + NodeConversation | 由边/会话查询，不保留 ID 数组 |
| `conceptNoteIds` | concept/synthesis nodes + typed edges | 由图查询，不保留 ID 数组 |
| `createdBy/createdAt/updatedAt` | KnowledgeNode 同名字段；`creatorId` 由迁移 actor identity 生成 | 已有等价物 |
| `provenance` | Source/Anchor、Patch audit、ResearchTask/Round refs | 拆分迁移，见 3.7 |
| `AgentMarker.id` | history-only migration ID | 当前没有 marker entity |
| `kind/label/reason` | tags；或 uncertainty/constraint node 与 edge rationale；view diagnostics | risk/uncertain/needs_validation 不应降级成纯 tag |
| `confidence` | 新节点/边 confidence 或 diagnostics confidence | 只在语义目标一致时迁移 |
| `severity` | view diagnostic severity 或受治理 metadata | 当前无 canonical 一对一字段 |
| `ResearchEdge.id/fromNodeId/toNodeId` | KnowledgeEdge 同名 identity/endpoints | 已有等价物 |
| `kind` | KnowledgeEdge.kind | 见下方枚举转换 |
| `label/confidence/createdBy/createdAt` | KnowledgeEdge 同名字段 | 已有等价物 |
| `provenance` | Patch audit/Source/Orchestration refs | KnowledgeEdge 当前无 provenance 字段，不能丢进 label |

枚举转换：

- `ResearchNodeKind`: `root→subject`，`module/section→topic`，`concept/question/hypothesis/conclusion/evidence` 同名，`finding→fact|claim`（按是否是直接观察区分），`risk→uncertainty|constraint`，`action→route_step|ResearchTask`，`file→SourceAsset + 可选 topic`，`script→history-only execution artifact`，`result→fact|synthesis`。不能靠字符串默认选取带 `|` 的目标。
- `ResearchNodeStatus`: `new→open/unverified`，`in_progress→exploring/unverified`，`understood→understood/supported|unverified`，`verified→verified/supported`（必须重验 provenance），`deferred→open/context_dependent`，`blocked→open/unverified + blocked ResearchTask`。
- `ResearchEdgeKind`: `decomposes_to→contains`，`depends_on/supports/contradicts/explains` 同义直映，`relates_to→related_to`，`evidence_for→supports`，`next_step→precedes`，`validates→VerificationRecord + supports`，`produces→derived_from`，但 `produces` 必须先校正边方向。

### 3.3 SourceAsset 与 EvidenceAnchor

| 旧字段 | 目标类别与字段 | 等价状态/动作 |
| --- | --- | --- |
| `SourceAsset.id` | Source：`KnowledgeSourceAsset.id/logicalSourceId` | 内容版本 ID 与逻辑 ID 必须分开生成 |
| `objectId` | Source：由 Project 解析 `spaceId` | KnowledgeSourceAsset 不绑定单 Project |
| `parentAssetId` | Source inventory hierarchy 的 view-only 关系 | 当前无 canonical 父字段；drop candidate 或外部 manifest |
| `kind` | `KnowledgeSourceAsset.format/inventoryKind` | pdf→pdf；file/document→markdown|text；project_directory→inventory/view；pdf_page→SourceAnchor；web_page 需 URI/text ingest；command_output→execution history |
| `title/uri/contentHash/createdAt` | KnowledgeSourceAsset 同义字段 | 必须重新读取内容校验 hash，不能信任旧声明 |
| `analysisState` | IngestResult 或 ResearchTask status | 不进入不可变 Source |
| `defaultMapId` | KnowledgeView/Project graph 引用 | drop candidate；source 不默认拥有 map |
| `metadata` | parser output/history-only import metadata | 逐 key 白名单；不可改写 immutable source |
| `EvidenceAnchor.id` | SourceAnchor.id | 已有更严格等价物 |
| `objectId` | 由 source→space 推导 | drop candidate 冗余字段 |
| `sourceAssetId` | SourceAnchor.sourceId | 重写为 version-specific source ID |
| `uri/page/lineStart/lineEnd` | SourceAnchor.locator tagged union | URI/text/PDF 三选一并校验范围 |
| `quote` | SourceAnchor.quote + KnowledgeSourceRef.quote snapshot | 已有等价物 |
| `text` | Evidence/Fact KnowledgeNode summary，必要时引用 anchor | 不复制为 SourceAnchor 第二正文 |
| `title/reason` | Evidence node title/summary 或 supports edge rationale | 不属于 locator |
| `createdAt` | Evidence node createdAt 或 migration ledger | SourceAnchor 当前无时间字段 |

### 3.4 Action、Job、并行组与执行记录

| 旧字段 | 目标类别与字段 | 等价状态/动作 |
| --- | --- | --- |
| `ResearchAction.id` | AgentRequest.id | 已有身份承载位 |
| `nodeId` | KnowledgeSelection.focusNodeId / CandidateGraphPatch.targetNodeId | 已有等价物 |
| `kind` | AgentRequest.action 或 ResearchTask.kind | drill_down/ask_question/summarize 可直映；inspect/analyze/compare 映射 task；generate_script/run_command 当前无正式执行能力 |
| `title/description` | AgentRequest.prompt；必要时 ResearchTask title/objective | 合并时保留语义，不把 title 伪装成 prompt |
| `proposedCommand/proposedScript` | history-only execution proposal | 无 V2 等价物；下一项决定是否引入受控 execution contract |
| `status` | AgentRequest/AgentRun/ResearchTask status | approved/suggested 仍不能跳过 CandidateGraphPatch review |
| `createdBy/createdAt/updatedAt` | request/patch audit/history | AgentRequest 无 updatedAt，保留 migration ledger |
| `AgentJob.id` | ResearchTask.id 或 AgentRun.id | 依 kind 分流，不双写同一 job |
| `sessionId/threadId/mapId` | projectId/planId/roundId；graph 从 Project 推导 | 重写引用 |
| `nodeIds/sourceAssetIds` | ResearchTask `inputNodeIds/inputSourceIds` | 已有等价物 |
| `actionId` | AgentRequest.id | 编排引用 |
| `kind/title` | ResearchTask.kind/title/objective 或 AgentRun provider invocation | 见迁移决策；scan/generate/expand/digest 不是全都属于 ResearchTaskKind |
| `status/priority` | ResearchTask/AgentRun status；priority 当前无等价物 | priority history-only，不能编码进 title |
| `dependsOnJobIds` | ResearchTask.dependsOnTaskIds | 已有等价物 |
| `outputNodeIds/outputEvidenceIds` | ResearchTask.outputNodeIds + ResearchRoundOutputs | evidence 统一为正式 node IDs |
| `outputRunIds` | AgentRun IDs/history | Workspace 已有 `agentRuns`，ResearchTask 暂无 runIds 字段 |
| `outputDigestIds` | synthesis node IDs | digest 转图后写 outputNodeIds |
| `errorMessage/startedAt/finishedAt/createdAt` | AgentRun attempts/events 或 ResearchTask blocked/completed time | 部分已有；失败详情属 history-only |
| `ParallelAnalysisGroup.id/sessionId/mapId/threadId` | ResearchPlan/Round identity 与 Project refs | 无独立 group 必要性 |
| `title/mode` | ResearchPlan.strategy + task roles | fan_out/compare/validation/evidence sweep 拆为 tasks |
| `inputNodeIds/inputSourceAssetIds` | ResearchTask inputs | 已有等价物 |
| `jobIds` | Plan/Round taskIds | 重写 ID |
| `mergePolicy` | CandidateGraphPatch review | 所有自动 merge 值降级为 manual pending review |
| `status` | Plan/Round/Task 聚合派生状态 | `ready_to_review/merged` 由 Patch 状态派生，不双写 |
| `createdAt/updatedAt` | Plan/Round 时间或 history | 部分已有 |
| `ExecutionRun.id` | AgentRun.id 或新的 history-only command-run ID | provider 调用可映射；本地命令不可伪装为 provider run |
| `jobId/actionId/nodeId` | ResearchTask/AgentRequest/KnowledgeNode refs | history 引用 |
| `command/script` | history-only execution input | 无 canonical V2 类型 |
| `startedAt/finishedAt/status` | AgentRun/attempt 时间与状态 | passed→succeeded；其余需转换 |
| `exitCode/stdout/stderr/resultSummary` | history-only command result；有知识价值的结果另提 Fact/Evidence Patch | 不能把原始 stdout 直接写入 graph |
| `evidenceId` | 接受后的 Evidence node ID | 必须经 SourceAnchor/Graph Patch 门禁 |

### 3.5 Inquiry、ConceptNote 与 Digest

| 旧字段 | 目标类别与字段 | 等价状态/动作 |
| --- | --- | --- |
| `SideInquirySession.id/researchSessionId` | AgentRequest/NodeConversation history + projectId | 无独立 session 主数据 |
| `sourceNodeId` | KnowledgeSelection.focusNodeId | 已有等价物 |
| `title/triggerText/initialQuestion` | question KnowledgeNode + AgentRequest.prompt | question 是图中正式知识对象 |
| `contextPolicy` | KnowledgeSelection.contextPolicy | local_node→selected_node，current_branch→selected_and_neighbors（近似），whole_project→whole_subject |
| `status` | question node status + request/patch state | promoted 仅表示结果已接受；discarded/rejected 属历史 |
| `messages` | question/answer nodes + NodeConversation；完整 transcript 为 history-only | V2 当前只保存一问一答索引，不应虚构完整对话等价 |
| `createdAt/updatedAt` | AgentRequest/NodeConversation/history | 部分已有 |
| `InquiryMessage.id/inquiryId` | history-only message/conversation identity | 当前无通用 message store |
| `role/content/createdAt` | ActorKind + question/answer node content/history | system 消息通常只进 run event/history |
| `ConceptNote.id` | concept/synthesis KnowledgeNode.id | 已有图表达 |
| `objectId` | Project scope | 写入 KnowledgeScope，不绑定旧 object |
| `sourceInquiryId` | derived_from/answers edge 到 question/answer | 由图关系表达 |
| `title/summary/explanation` | node title/summary + 必要的子节点 | explanation 无独立大字段，需结构化 |
| `relatedNodeIds/evidenceIds` | related_to/supports/derived_from edges | 不保留 ID 数组 |
| `status` | KnowledgeNode status/archivedAt | draft→open，accepted 仍需 Patch 接受，archived→archived |
| `createdAt/updatedAt` | KnowledgeNode 同名字段 | 已有等价物 |
| `KnowledgeDigest.id/objectId` | synthesis node ID + Project scope | 不创建 digest 主数据表 |
| `scope` | KnowledgeScope/KnowledgeSelection | project/session/branch/node/inquiries 需转换成明确 context IDs |
| `title/summary` | synthesis node | 已有等价物 |
| `conceptNoteIds/researchNodeIds/unresolvedQuestionIds` | typed edges 与 question nodes | 由图查询派生 |
| `createdAt` | synthesis node createdAt | 已有等价物 |

### 3.6 RelationshipGraph projection

| 旧字段 | 目标类别与字段 | 等价状态/动作 |
| --- | --- | --- |
| `RelationshipGraphNode.id/sourceId` | view-only projection identity/canonical node ID | projection 可重建，不进入 workspace |
| `kind` | 由 KnowledgeNode.kind、Source 与 AgentRun 投影 | `research_object/research_node/...` 不是第二套 canonical kind |
| `title/summary/weight/tags` | view-only display data | 从 canonical 对象即时派生 |
| `RelationshipGraphEdge.id/fromNodeId/toNodeId/relation/confidence` | view-only KnowledgeEdge projection | 正式知识关系必须存在 KnowledgeGraph；展示关系可派生 |
| `RelationshipGraph.id/objectId/sessionId/generatedFromMapIds/generatedAt` | KnowledgeView + projection metadata | 仅 `KnowledgeView` 的 root/focus/depth 持久；其余 drop candidate |
| `nodes/edges` | view-only arrays | 禁止持久化为第二知识图 |

### 3.7 Provenance、CandidateResult 与 Snapshot

| 旧字段 | 目标类别与字段 | 等价状态/动作 |
| --- | --- | --- |
| `Provenance.groupId/jobId` | ResearchPlan/Round/Task 或 AgentRun refs | orchestration/history |
| `sourceNodeId` | KnowledgeEdge `derived_from`/`refines`/`corrects` | 需按真实语义选择关系 |
| `sourceAssetIds` | KnowledgeNode.sourceRefs → immutable Source/Anchor | 只有 source ID 不足，必须补合法 locator/anchor |
| `CandidateResult.id` | CandidateGraphPatch.id | 已有正式审核实体 |
| `groupId/jobId` | ResearchPlan/Round/Task refs | CandidateGraphPatch 当前不直接存这些字段；保留在 request/orchestration ledger |
| `parentNodeId` | patch target/focus + contains edge | 已有图操作表达 |
| `node/edge` | CandidateGraphPatch `create_node/create_edge` operations | 必须补 audit、revision、scope、source 和语义门禁 |
| `status` | CandidateGraphPatch.status | pending_review/needs_review→pending_review，merged→accepted，dismissed→rejected |
| `conflictReason` | review history/rejection reason | CandidateGraphPatch 当前无 reason 字段；history-only，后续可扩展审计 |
| `createdAt` | CandidateGraphPatch.createdAt | 已有等价物 |
| `ResearchWorkspaceSnapshot.object/session/threads/map` | Project + KnowledgeGraph/View + ResearchOrchestration | 按上文转换 |
| `sourceAssets/evidenceAnchors` | KnowledgeSourceAssets/sourceAnchors + evidence nodes | 按不可变来源门禁转换 |
| `actions/jobs/parallelGroups/executionRuns` | AgentRequest/Run + ResearchOrchestration + history | 下一项迁移仍有价值能力 |
| `sideInquiries/conceptNotes/knowledgeDigests` | KnowledgeGraph + conversations/views | 结果入图，过程留历史 |
| `candidates` | CandidateGraphPatches | 不允许绕过审核直接合并 |

## 4. 后续实施边界

下一计划项只迁移仍有价值的 evidence/candidate/job 能力，建议按以下顺序：

1. 先为旧 snapshot 建立只读 converter 与 migration ledger，验证所有 ID、endpoint、source hash 和 locator；不要让 `useKnowledgeWorkspace` 重新依赖 V1 hook。
2. 先迁移 Source/Anchor 和 Evidence，再迁移 node/edge；没有可靠 SourceAnchor 的 `verified` 内容必须降为 unverified，不能保留虚假 verified 状态。
3. CandidateResult 转 CandidateGraphPatch 时一律保持 pending review；旧 `auto_attach_evidence/auto_create_candidates` 不获得写图权限。
4. AgentJob 按语义分为 ResearchTask、AgentRun 或 history-only command run；不要创建一个同时复制三者数据的 `V2Job`。
5. 迁移成功后才能列出可清理文件；Rust `ResearchNode` 公共签名必须先切换到 `KnowledgeNode`，再进入用户确认的逐文件删除流程。

本项明确不做：修改运行时代码、删除 V1 文件、改变 schema version、将 V1 fixture 自动导入当前 workspace、重命名 V2 `ResearchOrchestration`，或把旧 RelationshipGraph 保存为第二套图。

## 5. 验收条件

- V1 与 V2 `Research*` 名称边界清晰，V2 正式编排没有被列为清理对象。
- 每个 V1 interface 字段均在上表出现，并有目标类别或明确的 history/drop 决策。
- 生产、兼容测试、Rust 公共 API、migration-only 和无独立消费者状态有证据区分。
- 后续迁移不得违反单一 KnowledgeGraph、不可变 Source、有效 SourceAnchor 和 Candidate Patch 人工审核不变量。
