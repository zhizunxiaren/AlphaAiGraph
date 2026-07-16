# AlphaAiGraph 旧 Research 工作流受控迁移

> 日期：2026-07-16  
> 状态：阶段 6 implementation contract  
> 前置映射：`2026-07-15-alpha-ai-graph-research-model-migration-map.md`

## 目标

将 V1 `ResearchWorkspaceSnapshot` 中仍有独立价值的 Evidence、Candidate 和 AgentJob 迁入 V2 工作流，同时保持以下不变量：

- KnowledgeGraph 仍是唯一知识主数据。
- 旧 Source 声明不能绕过 V2 不可变来源摄取和 `contentHash` 对账。
- 旧 Candidate 的 merged/auto policy 不获得 V2 写图权限。
- AgentJob 只能进入已有的正式 Research Plan/Round；本地命令运行不能伪装成 provider AgentRun。
- V1 hook、component 和 fixture 不成为 V2 生产依赖。

实现位于 `src/knowledge/legacyResearchMigration.ts`；工作台通过 `useKnowledgeWorkspace.importLegacyResearchWorkspace` 和“迁入旧 Research”JSON 文件入口调用。

## 输入边界

`parseLegacyResearchWorkspace` 只接受 V1 workspace envelope，不复用 schema-v2 persistence loader。运行时检查包括：

- `object/session/map` 及所有 V1 collection 必须存在且类型正确。
- node、edge、source、anchor、job、execution run 和 candidate ID 必须唯一。
- 迁移后会进入 ID 的值还必须在规范化后唯一，避免不同 V1 ID 生成同一 V2 ID。
- Candidate endpoint、node kind、edge kind、status、confidence、marker，以及 Job kind/status/ref arrays 都做结构检查。
- 浏览器文件入口限制为 8 MiB 且要求有效 UTF-8 JSON。
- active Project 必须可写；completed Project 需要先 reopen。

可选 `LegacyResearchMigrationBindings` 允许可信调用方显式提供 legacy→canonical node/source ID，以及目标 plan/round。没有显式映射时：

- node 先按 active Project scope 内同 ID 匹配，再按唯一规范化 title 匹配；歧义时跳过。
- Source 先按显式 ID或同 ID匹配，再按唯一 `contentHash` 匹配；任一目标都必须与旧 `contentHash` 完全相等。

## Evidence 迁移

只有同时满足以下条件的 `EvidenceAnchor` 才能迁移：

1. 关联的旧 Source 声明了 `contentHash`。
2. 当前 Knowledge Space 已存在相同 hash 的 version-specific immutable `KnowledgeSourceAsset`；迁移器不凭旧 JSON 创建 Source。
3. page、line range 或绝对 URI locator 合法且与 Source format 相容。
4. 至少一个引用该 anchor 的 V1 ResearchNode 能唯一映射到当前 Project 的 canonical node，或该 anchor 被可迁移 Candidate 使用。

迁移器生成新的 immutable `SourceAnchor` 和带完整 `KnowledgeSourceRef` 的 verified/supported Evidence node，再以 `Evidence supports canonical target` 建立关系。SourceAnchor 可以随 proposal 注册，但 Evidence node/edge 只进入 `source` CandidateGraphPatch；接受前 graph 对象保持同一引用且无节点变化。

旧 `verified` 声明本身不被信任。验证状态来自 V2 source version、anchor `contentHash`、locator 和 quote 的重新校验。

## Candidate 迁移

- `pending_review`、`needs_review` 和旧 `merged` Candidate 均重新生成 V2 `drill_down` CandidateGraphPatch，状态固定为 `pending_review`。
- `dismissed` Candidate 只报告为 history-only，不重新提议。
- `parentNodeId` 必须与旧 edge source 一致，candidate node ID 必须与 edge target 一致；endpoint drift 直接跳过。
- Candidate 声明的每个 evidence ID 都必须能转换为有效 V2 SourceAnchor；部分对账成功仍视为失败，避免悄悄丢 provenance。
- `finding` 保守映射为 open Claim，不升级为 Fact；Fact/Evidence 必须有已验证 SourceAnchor。
- V1 merge policy 完全不参与 V2 决策，用户仍需通过现有 Patch 审核区接受或拒绝。

## AgentJob 与 ExecutionRun

非执行型 AgentJob 只在 active Research Project、Plan 和 Round 都存在时转换为 `ResearchTask`：

| V1 Job | V2 Task / Role |
| --- | --- |
| scan_source | parse / researcher |
| generate_map、expand_node | analyze / analyst |
| summarize_source、create_digest | synthesize / synthesizer |
| extract_concepts | extract / analyst |
| extract_evidence | extract / researcher |
| compare_sources | analyze / critic |

输入/输出 node 只保留能映射到当前 canonical graph 的 ID；输入 Source 仍要求 hash 对账。依赖只保留同批或已存在的正式 ResearchTask；无法迁移的依赖形成显式 skip。Plan.taskIds 与 Round.taskIds 同步更新，并在返回前运行 `assertResearchOrchestration`。

`generate_script`、`run_command` 以及所有 `ExecutionRun` 不写入 ResearchTask 或 AgentRun。返回结果只提供脱敏 `LegacyExecutionHistoryRecord`：ID、状态、时间、exit code、result summary 和可选引用；command、script、stdout、stderr 永不进入 V2 snapshot，并以 `rawPayloadOmitted` 明确标记。这避免秘密文本或任意执行内容进入持久化主数据。

## 原子性、幂等与持久化

- 迁移函数是纯 proposal 变换：输入 snapshot 不被原地修改。
- Evidence/Candidate 使用确定性 request/patch/node/edge/anchor ID；同一旧 workspace 重复导入不产生副本。
- 新 Job ID 转换为确定性 `legacy-task-*`，已存在 task 不重复附加。
- graph 在 proposal 阶段完全不变；SourceAnchor、Project source refs、AgentRequest、CandidateGraphPatch 和 ResearchTask 作为各自正式 V2 数据进入 snapshot。
- 返回 `status=unchanged|proposed`、新增 entity IDs、脱敏 execution history 和逐项 skip reason，工作台展示汇总而不隐藏损失。
- 接受后的 Evidence/Candidate 重新经过 graph operation audit、provenance、knowledge evolution 与 persistence 验证；专项测试也对完整 schema-v2 workspace 执行序列化。

本实现没有提高 workspace schema version，没有新增第二套 Job/Candidate/Evidence 数据表，没有持久化旧命令输出，也没有删除任何 V1 或 Rust compatibility 文件。

## 验收覆盖

`src/knowledge/legacyResearchMigration.test.ts` 覆盖：

- hash 匹配的 EvidenceAnchor → SourceAnchor + pending Patch → 接受后 verified Evidence/supports edge。
- 旧 merged Candidate 降为 pending Patch 并可通过 V2 审核接受。
- hash mismatch、endpoint drift、malformed JSON、duplicate/normalized-collision ID 拒绝。
- 重复导入幂等。
- Job 进入 active Plan/Round、依赖和状态转换，以及 workspace persistence。
- command job 不进入 ResearchTask/AgentRun，ExecutionRun raw payload 被省略。

`src/App.test.tsx` 覆盖真实文件入口：现有 V1 fixture 因没有可验证 source hash/active round 而安全地返回 unchanged，同时明确显示 skip 数与脱敏历史说明。
