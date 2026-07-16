# AlphaAiGraph Explorer 搜索体验与可信 Provider 边界

状态：已实现。本文记录 `Plan-v2.md` 阶段 4 Explorer 搜索体验增强的工程决策。

## 目标与边界

Explorer 为 Systematize Project 当前焦点节点生成“新资料、相邻领域、反例、验证”四类任务。直接搜索用于临时发现资料，不创建第二套 SearchQuery 主数据：查询、列表结果、筛选与选择只保存在当前 React 会话；只有用户明确收录的实际页面正文才进入不可变 Source Store，并继续生成待审核 `source` Candidate Graph Patch。

默认不接入任何外部厂商，不读取浏览器 API key，也不扩大网络权限。未配置可信 Provider 时，浏览器搜索 handoff 和手动粘贴原文始终可用；listing snippet 不能成为来源。

## Provider contract

`KnowledgeSearchProvider` 分开定义：

- `search({ query, limit, signal })`：返回 listing 元数据；
- 可选 `capture({ result, signal })`：只为用户选中的结果抓取实际正文或字节；
- `disclosure`：声明发送范围、隐私说明、费用说明和 free / metered / unknown 价格状态。

`createTrustedExplorerSearchProvider` 是浏览器安全的可信后端适配器：

- 远程 endpoint 强制 HTTPS，本地 bridge 可使用 localhost HTTP；
- 不接受 API key，HTTP 请求固定 `credentials: omit` 和 `referrerPolicy: no-referrer`；
- 搜索只发送 `query` 与 `limit`，正文抓取只发送用户选择的 URL；
- 不发送 Knowledge Graph、Context Packet、来源正文或本地状态；
- 搜索响应限制 2 MiB，单页正文限制 8 MiB；
- host 可在应用启动前注入 `globalThis.__ALPHA_AI_GRAPH_EXPLORER__`，未注入时返回 `undefined` 并保持 handoff。

可信后端 HTTP contract：

```text
POST <endpoint>/search   { "query": string, "limit": number }
POST <endpoint>/capture  { "url": string }
```

后端持有搜索厂商凭证并负责访问控制、速率限制和计费治理；凭证不得进入前端配置、workspace 或 git。

## 排序、去重与版本

搜索结果先规范化 HTTP(S) URL，移除 hash 和常见 tracking 参数，再按以下稳定信号排序：

1. 查询词对标题、摘要和 URL 的覆盖率；
2. 原始来源、官方来源、同行评审、独立二手、社区、其他的显式优先级；
3. Provider 原始顺序；
4. 发布日期、标题和 URL 的确定性 tie-breaker。

同一 logical URL 与同一版本只保留一个 listing；`logicalUrl`、`versionLabel`、发布日期或 URL 中的版本线索用于标注 latest / older / single / unknown。页面抓取后再次按 SHA-256 正文字节去重，因此不同 URL 的镜像不会生成重复 Source；已存在的相同正文复用现有 Source ID。新正文仍通过 append-only Source ingest 进入正式版本链。

## 交互与失败治理

工作台在搜索前展示 Provider、发送范围、隐私和费用提示。结果支持来源类型、最新版本和已收录状态筛选；每条结果同时显示来源类型文本、相关度、版本状态和排序依据，不依赖颜色传达状态。用户每批最多选择 10 条；只有支持 capture 的 Provider 才启用批量收录，否则引导逐条手动收录。

搜索与正文抓取均有 timeout、最多两次尝试和明确失败状态。搜索失败可从结果区重试，也可随时改用浏览器 handoff。取消不会继续重试。页面没有实际正文、URL 非 HTTP(S)、响应格式错误或超过安全上限时均拒绝入源。

## Contract 与持久化结论

本能力新增的 execution、result、filter 和 disclosure 都是 Explorer 本地运行时类型，不进入 `KnowledgeWorkspaceDocument`。因此 workspace schema 仍为 v2，Rust serde contract 无需新增持久字段。收录后的 canonical `KnowledgeSourceAsset`、SourceAnchor、Candidate Graph Patch 和审计仍使用现有 TypeScript/Rust contract。

## 验证

专项测试覆盖：

- 原始来源优先、相关性、URL 去重、existing 标记和版本筛选；
- 搜索失败重试与可重试终态；
- 实际正文抓取、抓取重试、跨 URL 内容去重和 snippet 拒绝；
- HTTPS / localhost endpoint、无 credentials 请求、最小发送载荷和错误响应；
- 有 Provider 的搜索、筛选、批量收录 UI，以及无 Provider 的 handoff / 手动收录回退。
