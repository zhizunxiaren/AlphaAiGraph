---
id: alpha-ai-graph-product
type: system
status: grounded
updated: 2026-07-13
source_ids:
  - product-direction-2026-07-13
related:
  - knowledge-graph-primary
  - technical-route-reasoning
---

# AlphaAiGraph 产品模型

AlphaAiGraph 是 AI Agent 驱动的知识路线系统。用户以脑图方式分析技术、文档、代码或复杂问题，并可从任意知识点继续下钻、提问和总结。所有有效分析都沉淀为同一知识图谱中的节点与关系，逐步形成个人长期知识体系。

## 核心不变量

- `KnowledgeGraph` 是唯一主数据。
- 脑图、知识网络和技术路线只是同一图谱的不同 rooted views。
- 提问和总结进入图谱，不只存在于聊天记录。
- 节点选择形成用户可见、可控制的 Context Packet。
- Agent 结构变更先进入候选 patch，接受后才写入正式图谱。
- 技术路线显式连接目标、约束、候选方案、证据、决策和步骤。
- 原始来源不可变；事实性结论必须可追溯。

## 当前实现

V2 已建立确定性第一层图谱、节点渐进下钻、节点提问、阶段总结、三个主视图、可见 Context Packet 和第一版候选 graph patch 审核。真实资料 ingest、LLM provider、持久化、update/archive patch 和知识 lint 仍待实现。

## 未解决问题

- 同一概念跨分析对象的 identity resolution（身份解析）策略。
- Agent 自动接受 graph patch 的风险分级。
- 大规模图谱下 Markdown、图数据库和本地检索的边界。
