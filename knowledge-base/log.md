# Knowledge Base Log

## [2026-07-13] migration | Knowledge graph as primary data

将产品主模型从 `ResearchMap -> RelationshipGraph projection` 调整为单一 `KnowledgeGraph`；脑图、全局网络和技术路线成为 rooted views。建立 Raw / Wiki / Schema / Index / Log 基础结构。

## [2026-07-13] synthesis | Visible Agent context and governed graph changes

借鉴 Ponder 的“节点选择即上下文”，将单个 `selectedNodeId` 升级为可见 `KnowledgeSelection`。下钻、回答和总结不再直接写入主图，而是生成包含结构化 operations、置信度和审核状态的 `CandidateGraphPatch`；用户接受后才写入，拒绝则保持正式图谱不变。
