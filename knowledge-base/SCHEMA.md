# AlphaAiGraph Knowledge Base Schema

本目录采用 Raw Sources / Wiki / Schema / Index / Log 五部分结构，用于让项目知识持续积累，而不是每次从原始文档重新推导。

## Authority

- `raw/`：不可变来源。Agent 可以读取，不修改来源正文。
- `wiki/`：Agent 维护的综合知识页。新来源和新问题应优先更新既有概念页，避免一问一页。
- `index.md`：内容导航。每个 wiki 页面一行链接、一句摘要和状态。
- `log.md`：append-only 操作记录。只追加 ingest、query、synthesis、lint 和 migration 事件。
- `SCHEMA.md`：本文件，定义命名、frontmatter、关系和维护流程。

## Wiki page contract

每个页面使用 YAML frontmatter：

```yaml
---
id: stable-kebab-case-id
type: concept | decision | route | source-summary | system
status: draft | grounded | verified | contested | stale
updated: YYYY-MM-DD
source_ids: []
related: []
---
```

正文优先包含：定义/结论、关键关系、证据与来源、未解决问题、下一步。事实和结论必须区分；无来源推断标记为“待验证”。

## Operations

### Ingest

1. 读取一个 raw source。
2. 提取会改变现有知识的内容。
3. 更新已有概念页；只有形成可独立复用的概念/决策时才新建页面。
4. 更新 `index.md`。
5. 向 `log.md` 追加 ingest 记录。

### Query

1. 先读 `index.md`，再读取最相关的少量页面。
2. 回答时引用 source id 或 wiki page。
3. 有长期复用价值的综合结果更新进已有页面或新建 synthesis/decision 页面。
4. 向 `log.md` 追加 query 或 synthesis 记录。

### Lint

检查缺来源结论、孤儿页、重复概念、矛盾、过期状态、失效链接和缺失反向关系。lint 只报告或创建候选修复；不静默覆盖用户决策。

## Relationship vocabulary

`contains`、`explains`、`depends_on`、`supports`、`contradicts`、`answers`、`summarizes`、`compares`、`constrains`、`recommends`、`precedes`、`related_to`。

关系名应表达语义，不使用无意义的 `link`。同一事实不在多个页面复制；通过稳定 id 与链接复用。
