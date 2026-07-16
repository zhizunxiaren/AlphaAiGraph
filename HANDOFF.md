# AlphaAiGraph 会话交接

> 交接时间：2026-07-16 14:45 +08:00  
> 当前分支：`project-mvp`  
> HEAD：`7303519 Build V2 knowledge graph foundation`  
> 当前计划：`Plan-v2.md`  
> 重要状态：工作树包含尚未提交的 V2 连续实现，**不要 reset、checkout、批量删除或清理未跟踪文件**。

## 一句话状态

AlphaAiGraph 已完成 V2 阶段 0-6 的全部计划项；当前计划完成 **67/67（100%）**，阶段 6 完成 **9/9**。Explorer 可信搜索 Provider 边界、排序/版本/去重、正文抓取、筛选/批量收录、重试、隐私与成本提示均已实现并验收；默认仍不接入外部厂商，并保留浏览器 handoff 与手动原文收录。

## 产品与架构基线

AlphaAiGraph 是 AI 驱动的认知、知识体系构建与研究平台。Understand、Systematize、Research 三类 Project 以用户目标区分，共用同一个 Knowledge Space、canonical KnowledgeGraph、不可变 Source Store、Agent Runtime、Context Packet、Candidate Graph Patch、持久化和审计底座。

必须保持以下不变量：

1. `KnowledgeGraph` 是唯一知识主数据；mind map、network、route、Systematize 产物和 Research report 都是视图或纯派生投影。
2. Project 只保存目标、工作流、范围和 graph 引用，不复制知识节点。
3. 原始 Source 不可变；事实性 Claim 必须能追溯 SourceAnchor。
4. Agent 对图的结构修改先形成 `CandidateGraphPatch`，用户接受后才正式入图。
5. 不静默覆盖用户结论、路线决策、认知状态或历史。
6. 新能力进入 `src/knowledge/` 的 V2 模型；旧 `src/research/` 已移除，V1 数据只通过 `legacyResearchMigration` 受控导入。

产品基线文档：

- `docs/superpowers/specs/2026-07-13-alpha-ai-graph-product-philosophy.md`
- `docs/superpowers/specs/2026-07-13-alpha-ai-graph-knowledge-route-system.md`
- `docs/superpowers/specs/2026-07-14-alpha-ai-graph-project-model-alignment.md`
- `Plan-v2.md`

## 已完成阶段

- 阶段 0：单一 KnowledgeGraph、三视图、渐进下钻、Context Packet 和 Candidate Patch 审核。
- 阶段 1：Understand / Systematize / Research Project 模型与 Subject Kind 解耦。
- 阶段 2：认知状态、不可变 Source、SourceAnchor、revision/link/status/source/archive Patch 和持久化。
- 阶段 3：真实 Markdown/PDF 导入、`pdfjs-dist@6.1.200`、第一层地图、Agent provider/runtime、DeepSeek/GLM。
- 阶段 4：KnowledgeInventory、Interviewer、Explorer、纠偏、影响审查、Project 生命周期和 Systematize 产物视图。
- 阶段 5：Research 编排、主动搜索、多轮研究、验证矩阵、证据不足结果、可信结论、技术路线、约束情景和共享图投影。
- 阶段 6：知识 lint、图查询与跨 Project canonical 复用、BM25/embedding/hybrid 离线评估、大图渐进投影、Markdown Wiki round-trip、旧 Research 迁移、用户确认的 tracked 清理和开发文档统一。

详细完成说明全部写在 `Plan-v2.md` 对应勾选项中，不要另建第二套进度主数据。

## 最近完成：图查询与跨 Project 复用

关键文件：

- `src/knowledge/knowledgeGraphQuery.ts`
- `src/knowledge/knowledgeGraphQuery.test.ts`
- `src/knowledge/knowledgeReuse.ts`
- `src/knowledge/knowledgeEngine.ts`
- `src/knowledge/agentBoundary.ts`
- `src/knowledge/workspacePersistence.ts`

已实现：

- 当前 Project scoped 的局部邻居查询、方向/关系过滤、深度和节点上限。
- 确定性 BFS 最短路径。
- weak connected components；没有把它描述成统计聚类。
- explainable lexical full-text search，返回命中字段和命中词。
- 工作台邻居、Agent Context Packet、`whole_subject` 使用统一 scope，避免跨 Project 泄漏。
- 跨 Project 发现返回 canonical node 引用。
- 真正复用使用 `reuse` Candidate Patch，只允许修订同一 node 的 Project scope/tag，并由目标 root 增加 `contains` 入口；禁止 `create_node` 复制。
- 接受、拒绝和持久化加载都会重跑 reuse 语义门禁。

## 最近完成：搜索评估

完整报告：

- `docs/superpowers/specs/2026-07-15-alpha-ai-graph-search-evaluation.md`

实现文件：

- `src/knowledge/searchEvaluation.ts`
- `src/knowledge/searchEvaluation.test.ts`
- `src/knowledge/searchEvaluation.benchmark.test.ts`
- `scripts/run-search-benchmark.mjs`

评估设置：

- 7 份真实仓库规格文档。
- 320 个按 heading 和 360 字切片形成的检索节点。
- 15 条人工分级相关性查询：7 calibration + 8 evaluation。
- 指标：Recall@10、MRR@10、nDCG@10、mean/P95 latency。
- 对比 production lexical、BM25、multilingual embedding、BM25 + embedding RRF hybrid。
- Embedding runtime：`@huggingface/transformers@4.2.0`。
- 模型：`Xenova/paraphrase-multilingual-MiniLM-L12-v2`，q8、mean pooling、normalized。
- 固定 revision：`2c4055b12046f11709e9df2c122e59ffbdc2f900`。
- 模型只写入用户缓存，没有进入仓库或生产 bundle。

独立 evaluation 结果：

| 方案 | Recall@10 | MRR@10 | nDCG@10 | P95 |
| --- | ---: | ---: | ---: | ---: |
| Production lexical | 0.104 | 0.150 | 0.126 | 68.91 ms |
| **BM25** | **0.646** | **0.682** | **0.626** | **1.93 ms** |
| Embedding | 0.396 | 0.344 | 0.294 | 27.17 ms |
| BM25 0.75 + embedding 0.25 | 0.625 | 0.550 | 0.517 | 28.34 ms |

决策：

- BM25 值得在既有“搜索优化”TODO 中产品化。
- **当前生产搜索仍是 lexical**；本轮没有绕过产品验收直接替换。
- 暂不引入 embedding production path、hybrid search 或向量数据库。
- 至少收集 50 条真实用户查询并补跨语言/同义词判断后，再重新评估 embedding。

复现真实模型 benchmark：

```powershell
npm run benchmark:search
```

普通 `npm test` 默认跳过真实模型推理，只验证语料、判断规则和评估器。固定 revision 首次 cold load 可能超过两分钟，320 节点 embedding index build 约 32 秒。

## 当前验证状态

最后一次完整代码验收已按项目规定顺序通过：

1. `npm test`：43 个 test files、195 tests passed；另有 1 个 test file、2 个 benchmark tests 按设计 skipped。
2. `npm run build`：通过；主 bundle 约 438.37 kB，旧 Research 迁移器为按需加载的 21.28 kB 独立 chunk；Transformers.js 未进入生产 bundle。
3. `cargo test --workspace`：20 passed。
4. `git diff --check`：通过，只有 LF/CRLF 提示。
5. 暂存区为空；敏感文件名与模型权重扫描无命中。

构建仍有一个已知非阻塞提示：

- `pdfJsSourceParser` minified chunk 约 534.81 kB，超过 Vite 500 kB warning threshold。

## 依赖与安全状态

- `pdfjs-dist` 固定为 `6.1.200`。
- `@huggingface/transformers` 仅为 devDependency，用于可复现 benchmark。
- `npm audit` 当前报告 6 项：3 moderate、2 high、1 critical。
- 新增 Transformers.js 不在漏洞链中。
- critical 来自现有 Vitest 2.1.9；high 涉及 Vitest 嵌套 Vite 和 jsdom 的 `form-data`。
- 没有自动执行 `npm audit fix` 或 major upgrade；测试框架升级应单独评估和回归。

## 工作树状态

当前分支自 `7303519` 之后包含完整 V2 连续实现，尚未提交。`git status --short` 中存在大量 modified 和 untracked 文件，尤其是整个 `src/knowledge/` V2 能力。

接手时：

1. 先运行 `git status --short`。
2. 把现有 modified/untracked 文件视为用户和前序会话成果。
3. 不要使用 `git reset --hard`、`git checkout --` 或任何递归删除。
4. 不要因为文件未跟踪就判断它们是临时产物。
5. 未经用户明确要求，不要 stage、commit、push 或创建 PR。

当前暂存区为空。交接时没有发现 `.env`、key、token、credential、database、ONNX 或 safetensors 文件进入工作区状态。

## 最近完成：大图渐进加载、局部布局和性能预算

完整报告：

- `docs/superpowers/specs/2026-07-15-alpha-ai-graph-large-graph-performance.md`

关键实现：

- `src/knowledge/knowledgeGraphQuery.ts`：Project-scoped canonical 邻接索引、cursor 分页和版本/scope 失效。
- `src/knowledge/knowledgeGraphProjection.ts`：24 首屏、每次 +12、48 node/96 edge 硬上限的局部投影和纯布局。
- `src/components/KnowledgeGraphCanvas.tsx`：只接受有界局部投影的渲染表面。
- `src/knowledge/fixtures/largeKnowledgeGraph.ts`、`graphScale.benchmark.test.ts`、`scripts/run-graph-scale-benchmark.mjs`：确定性规模 fixture 和独立 benchmark。

3,000 节点/9,000 边结果：index build 11.33 ms、邻域 P95 0.90 ms、cluster P95 15.65 ms、whole Project Selection P95 24.14 ms、渐进投影 P95 3.24 ms、局部布局 P95 0.06 ms、48 节点 React 静态渲染 P95 11.37 ms。画布虚拟化不改变 canonical graph，也不缩小可见 Context Packet。

复现：

```powershell
npm run benchmark:graph
```

普通 `npm test` 默认跳过真实性能运行，只执行轻量 contract 测试。

## 最近完成：Markdown wiki 确定性 round-trip

完整 contract：

- `docs/superpowers/specs/2026-07-15-alpha-ai-graph-markdown-wiki-vault.md`

关键实现：

- `src/knowledge/markdownWikiVault.ts`：Project/node/source 多文件映射、manifest、parser、round-trip、Candidate Patch 导回和浏览器下载。
- `src/knowledge/deterministicZip.ts`：无第三方依赖的确定性 UTF-8 store ZIP、CRC/path/size 门禁。
- `src/knowledge/markdownWikiVault.test.ts`、`deterministicZip.test.ts`：数组重排、ZIP、Source/Anchor/locator、篡改和 Patch 接受测试。
- `src/components/KnowledgeWorkspaceShell.tsx`、`src/state/useKnowledgeWorkspace.ts`：工作台 ZIP 导出与导回。

Vault 解压后可直接由 Obsidian 打开：`Nodes/*.md` 保存完整 canonical node 与 outgoing typed edges，`Sources/*.md` 保存不可变 Source/Anchor metadata，正文使用标准 `[[wikilink]]`。同一 snapshot 逐字节确定；无差异导回为 unchanged，可编辑 node/relation 只形成 pending Patch；Source、locator、受保护字段、删除和跨 Project 导入明确拒绝。既有单文件 `.wiki.md` 导出继续保留。

## 最近完成：旧 Research 模型迁移映射

权威映射：

- `docs/superpowers/specs/2026-07-15-alpha-ai-graph-research-model-migration-map.md`

已完成：

- 逐字段覆盖 `src/types.ts` 第 1-424 行 23 个 V1 interface，映射到 Project、KnowledgeGraph、Source/Anchor、ResearchOrchestration、view-only、history-only 或 drop candidate。
- 区分 V1 兼容模型、V2 正式 `ResearchOrchestration` 和跨代共享 `ActorKind`，不按名称批量判断。
- 当前浏览器生产入口不再引用 V1 `AppShell/useResearchWorkspace`，但 V1 组件、hook、fixture 和测试仍相互引用。
- Rust harness/exporter 仍有 `ResearchNode` 公共 API；不能在后续清理项直接删除 core 类型。
- `sourceAssets` 只在 V2 schema 作为 migration-only 空字段存在，正式来源使用 `knowledgeSourceAssets/sourceAnchors`。
- 旧自动 merge policy 不获得 V2 写图权限；旧 verified 内容必须重新校验不可变 SourceAnchor；RelationshipGraph 只作为可重建 view。
- 标记 command/script execution、完整 transcript、marker severity、显式 order 等当前没有可靠 V2 等价物，等待下一项按价值迁移，而不是塞入图节点文本。

本项只增加可审计文档并更新计划，没有修改运行时代码、schema、V1 文件或 Rust API。

## 最近完成：旧 Research 工作流受控迁移

完整 contract：

- `docs/superpowers/specs/2026-07-16-alpha-ai-graph-legacy-research-workflow-migration.md`

关键实现：

- `src/knowledge/legacyResearchMigration.ts`：V1 JSON 解析、node/source binding、Evidence/Candidate/Job 迁移、脱敏 ExecutionRun history 和逐项 skip report。
- `src/knowledge/legacyResearchMigration.test.ts`：hash/locator/endpoint/ID 门禁、Patch 接受、Job 编排、幂等和 persistence。
- `src/state/useKnowledgeWorkspace.ts`、`src/components/KnowledgeWorkspaceShell.tsx`：8 MiB UTF-8 JSON 文件入口和可见迁移汇总。
- `src/App.test.tsx`：真实 V1 fixture 无可信 hash/active round 时保持 unchanged，显示跳过项且不持久化命令内容。

治理结论：

- 旧 Source 不能直接升级；必须与当前已摄取的 immutable source version 做 `contentHash` 精确对账。
- Evidence 生成 SourceAnchor 和 pending `source` Patch；接受前 graph 不变。
- 旧 pending/needs_review/merged Candidate 全部重新变为 pending V2 Patch；dismissed 不复活，auto merge policy 无效。
- AgentJob 只在 active Research Plan/Round 中转 ResearchTask；命令/脚本运行不伪装成 AgentRun。
- ExecutionRun 返回脱敏 history-only 摘要，command/script/stdout/stderr 永不进入 V2 workspace。
- 重复导入使用确定性 ID 幂等；完整 workspace 经过 ResearchOrchestration 和 persistence 验证。

## 已完成：第一批 tracked 清理

静态引用、tracked 状态、Rust 混合 API、历史文档与本地生成目录的权威盘点和执行记录是：

- `docs/superpowers/specs/2026-07-16-alpha-ai-graph-tracked-cleanup-candidates.md`

用户确认后已完成：

- 新增 `src/knowledge/fixtures/legacyResearchWorkspace.ts`，解除 `src/App.test.tsx` 对旧 `src/research/fixtures.ts` 的依赖。
- 逐个移除清单中的 14 个 V1 TypeScript 兼容文件；没有使用递归或批量删除命令。
- 删除 `src/styles.css` 中只服务旧工作台的 902 行 selector；保留全局基线和全部 V2 样式。
- 保留 Rust compatibility symbol、`src/types.ts` 的迁移 contract、历史规格、`knowledge-base/` 与 `wiki/`。
- 未处理 `node_modules/`、`target/`、`dist/`、`.tmp/`、`.codegraph/`。

验收：`npm test` 42 个文件、187 个测试通过（另有 1 个文件、2 个测试按设计跳过）；`npm run build` 通过；`cargo test --workspace` 20 个测试通过。

## 最近完成：唯一产品方向文档

已完成：

- 根 `AGENTS.md` 以三类 Project 和共享 Knowledge Graph 为唯一当前方向，移除已失效的旧工作台/测试指引。
- `README.md` 从占位文本扩展为产品、架构、开发、测试、benchmark、目录和安全入口。
- 新增 `docs/DEVELOPMENT.md`，定义模块所有权、变更流程、测试责任、provider 和持久化边界。
- 三份 2026 年 5 月 Research Map/Cockpit/UI 文档标记为 V1 历史归档，保留为迁移审计和 benchmark 语料。
- 权威顺序统一为：产品理念 → Project contract → Plan-v2 → 阶段 0 架构基线 → 开发者指南。

## 最近完成：Explorer 搜索体验增强

- `KnowledgeSearchProvider` 现在明确区分 listing 搜索与用户选择后的正文 capture，并要求隐私、发送范围和费用 disclosure。
- 新增 trusted backend adapter：远程只允许 HTTPS，本地 bridge 可用 localhost；不接受浏览器 API key，固定 `credentials: omit`，搜索只发送 query/limit，抓取只发送所选 URL。
- 结果按相关性与原始来源优先级排序，规范化 URL，识别 logical source 版本；正文按 SHA-256 跨 URL 去重后才进入 immutable Source 与待审核 Patch。
- 工作台支持来源/最新版本/已收录筛选、最多 10 条批量收录、loading/error/retry、费用与隐私说明，以及无 capture/no Provider 回退。
- 搜索 session 不进入 workspace schema，Rust 持久 contract 无新增字段；完整说明见 `docs/superpowers/specs/2026-07-16-alpha-ai-graph-explorer-search-experience.md`。
- UI/UX skill 复核后补齐 44px 主要交互目标、明确空结果建议和 reduced-motion；真实浏览器 375px/1440px 均无横向溢出、console 无 warning/error。

## 关键文件导航

- 权威 TypeScript model：`src/types.ts`
- 使用者与贡献者入口：`README.md`
- 开发者指南：`docs/DEVELOPMENT.md`
- V2 主状态：`src/state/useKnowledgeWorkspace.ts`
- 工作台：`src/components/KnowledgeWorkspaceShell.tsx`
- 图引擎与 Selection：`src/knowledge/knowledgeEngine.ts`
- 图查询：`src/knowledge/knowledgeGraphQuery.ts`
- 大图局部投影与布局：`src/knowledge/knowledgeGraphProjection.ts`
- 有界图画布：`src/components/KnowledgeGraphCanvas.tsx`
- 跨 Project 复用：`src/knowledge/knowledgeReuse.ts`
- Patch CAS 与审计：`src/knowledge/graphPatch.ts`
- 持久化与迁移门禁：`src/knowledge/workspacePersistence.ts`
- 来源与 provenance：`src/knowledge/sourceIngest.ts`、`src/knowledge/provenance.ts`
- PDF parser：`src/knowledge/pdfJsSourceParser.ts`
- Agent boundary/runtime：`src/knowledge/agentBoundary.ts`、`src/knowledge/agentRuntime.ts`
- Provider adapters：`src/knowledge/providers/`
- Research 编排：`src/knowledge/researchOrchestration.ts`、`researchSearch.ts`、`researchRound.ts`、`researchVerification.ts`
- Research 结论与路线：`researchConclusion.ts`、`researchRoute.ts`、`researchRouteScenario.ts`、`researchResults.ts`
- Search evaluation：`src/knowledge/searchEvaluation.ts`
- Markdown Wiki Vault：`src/knowledge/markdownWikiVault.ts`、`deterministicZip.ts`
- 旧 Research 字段迁移映射：`docs/superpowers/specs/2026-07-15-alpha-ai-graph-research-model-migration-map.md`
- 旧 Research 工作流迁移：`src/knowledge/legacyResearchMigration.ts`
- 旧 Research 工作流迁移 contract：`docs/superpowers/specs/2026-07-16-alpha-ai-graph-legacy-research-workflow-migration.md`
- tracked 清理候选清单：`docs/superpowers/specs/2026-07-16-alpha-ai-graph-tracked-cleanup-candidates.md`
- Rust contract：`crates/alpha_graph_core/src/lib.rs`

## 操作红线

必须重新阅读根目录 `AGENTS.md`。特别注意：

- 禁止 `del /s`、`rd /s`、`rmdir /s`、`Remove-Item -Recurse`、`rm -rf`。
- 不要自动清理 `node_modules/`、`target/`、`dist/`、`.tmp/` 等生成目录。
- 删除 tracked 文件前必须列清单并等待用户确认。
- 所有 key、token、secret、password、credential、私有配置和本地数据库都不能提交。
- 完成任何阶段项前必须依次运行：

```powershell
npm test
npm run build
cargo test --workspace
```

随后检查：

```powershell
git diff --check
git status --short
git diff --cached --name-only
```

## 下次会话启动建议

向新会话发送：

```text
阅读 AGENTS.md、README.md、docs/DEVELOPMENT.md、HANDOFF.md 和 Plan-v2.md。阶段 0-6 的 67/67 计划项已完成并通过完整验收；下一步只从用户明确提出的新目标开始，不默认接入外部搜索厂商或读取密钥。保留现有未提交工作树，不恢复已删除的 V1 工作台，不清理生成目录，不暂存或提交。
```
