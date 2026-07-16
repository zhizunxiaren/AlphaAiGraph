# AlphaAiGraph tracked 清理候选清单

> 盘点时间：2026-07-16  
> 状态：用户已确认，第一批清理已完成  
> 执行时间：2026-07-16

## 结论

静态盘点时没有“零前置条件即可安全删除”的 tracked 文件。用户确认第一批范围后，已先把 V2 迁移入口 UI 测试改用 `src/knowledge/fixtures/legacyResearchWorkspace.ts` 专用样本，再逐个移除下列 14 个 V1 TypeScript 文件，并删除 `src/styles.css` 中只服务旧工作台的 902 行连续 selector 块。

Rust crate、`src/types.ts`、`src/styles.css` 的 V2 部分、历史规格、`knowledge-base/` 和 `wiki/` 均按清单保留；本地生成目录未处理。

## 第一批候选：V1 TypeScript 兼容岛

以下 14 个 tracked 文件合计 101,694 bytes；它们不在当前 `src/App.tsx` 的浏览器生产依赖图内：

### 旧工作台组件

- `src/components/AgentFeed.tsx`
- `src/components/AppShell.test.tsx`
- `src/components/AppShell.tsx`
- `src/components/GraphCanvas.tsx`
- `src/components/NodeInspector.tsx`
- `src/components/ProjectRail.tsx`
- `src/components/SourceDrawer.tsx`

### 旧状态层

- `src/state/useResearchWorkspace.test.tsx`
- `src/state/useResearchWorkspace.ts`

### 旧 Research 引擎与 fixture

- `src/research/fixtures.ts`
- `src/research/projection.test.ts`
- `src/research/projection.ts`
- `src/research/researchAgent.test.ts`
- `src/research/researchAgent.ts`

这批文件内部仍构成完整的兼容测试依赖图：`AppShell.test.tsx` 覆盖旧工作台，`useResearchWorkspace.test.tsx` 覆盖旧 hook，另外两个测试文件分别覆盖 projection 和 deterministic research agent。若整批移除，现有旧兼容测试将减少 27 个；这不影响 V2 专项测试，但必须在验收记录中明确说明。

## 已执行的处理前置条件

删除前及删除后已依次完成：

1. 把 `src/App.test.tsx` 对 `src/research/fixtures.ts` 中 `initialWorkspace` 的直接依赖，替换为 `src/knowledge/fixtures/` 下的专用 V1 导入样本或测试本地 builder。该样本只服务 `legacyResearchMigration` 安全边界，不应重新引入 V1 hook 或 UI。
2. 用户已明确确认不再保留旧 AppShell 兼容岛及其 27 个回归测试。
3. 每次只处理一个明确路径，禁止递归或批量删除命令。
4. 文件处理完后，再从 `src/styles.css` 中识别并编辑只服务旧组件的 selector。`src/styles.css` 是 V1/V2 混合文件，不能整文件删除。
5. 按 `npm test` → `npm run build` → `cargo test --workspace` 顺序完整验收，并复查 diff、tracked 状态、staged 列表和敏感路径。

## 必须保留或先重构的混合文件

### TypeScript

- `src/types.ts`：仍是 V2 权威模型文件；`src/knowledge/legacyResearchMigration.ts` 还显式使用 V1 `ResearchWorkspaceSnapshot`、`EvidenceAnchor`、`CandidateResult`、`AgentJob` 和 `ExecutionRun` 类型作为受控导入 contract。只能在未来迁移 contract 版本退出后做字段级重构，不能删除文件。
- `src/styles.css`：同时包含旧工作台样式和当前 `.knowledge-app` 样式。第一批候选处理完成后，只能做 selector 级清理。

### Rust

- `crates/alpha_graph_core/src/lib.rs`：同时包含 V2 graph contract 与旧 `ResearchNode` / `ResearchMap` 兼容结构。
- `crates/alpha_agent_harness/src/lib.rs`：已有 V2 provider boundary，但公开 smoke API 仍引用 `ResearchNode`。
- `crates/alpha_exporters/src/lib.rs`：已有 V2 graph exporter，但 `export_node_title` 仍引用 `ResearchNode`。
- `crates/alpha_graph_core/`、`crates/alpha_agent_harness/`、`crates/alpha_exporters/`：均是 Cargo workspace 成员，整个目录都不是清理候选。

Rust 侧必须先另立任务切换公共 API 和测试，再讨论删除旧 symbol；本轮不做该重构。

## 已核对并建议保留的 tracked 内容

- `Plan.md`：文件头已标明 V1 历史归档，根 `AGENTS.md` 仍将其作为历史计划引用。
- `issue.md`：仍由 `TODO.md` 和历史 wiki 引用，属于用户工作流与审查记录。
- `docs/superpowers/specs/2026-05-09-alpha-ai-graph-agent-research-map.md`：V1 产品历史及旧 fixture/wiki 的背景来源。
- `docs/superpowers/specs/2026-05-11-alpha-ai-graph-research-cockpit-ux-design.md`
- `docs/superpowers/specs/2026-05-13-alpha-ai-graph-ui-design.md`
  - 上述两份文档当前是 `src/knowledge/searchEvaluation.benchmark.test.ts` 的真实语料，删除会改变人工 relevance judgments 和基准报告。
- `knowledge-base/`：当前 V2 knowledge route 规格直接引用的产品知识库，不是旧 wiki 的重复副本。
- `wiki/`：满足项目关于 Karpathy LLM Wiki 的既有约定，并保存历史索引；与 `knowledge-base/` 内容和职责不同。
- `docs/product-research/assets/ponder-ing/`：每张图片均被产品分析文档引用。
- `TODO.md`：由用户和 Spec Workflow 管理，不能作为普通清理对象。
- `scripts/start-web.ps1`：人工开发入口；没有代码 import 不能证明未使用。

## 本地生成目录：只列出，不自动处理

下列目录当前存在，但都不在 `git ls-files` 中：

- `node_modules/`
- `target/`
- `dist/`
- `.tmp/`
- `.codegraph/`

根据项目操作红线，如需释放空间，由用户手动清理；Agent 不执行递归删除。

## 已确认并执行的范围

用户确认的第一批范围是：

1. 先把 `src/App.test.tsx` 使用的旧 fixture 迁到 V2 migration 专用测试 fixture；
2. 再逐个处理“第一批候选”列出的 14 个文件；
3. 随后只编辑 `src/styles.css` 中确认已无引用的 V1 selector；
4. 不处理 Rust 兼容 symbol、历史文档、`knowledge-base/`、`wiki/` 或本地生成目录。

执行结果：14 个候选文件均已逐个移除，旧 CSS 根 selector 搜索结果为 0，V2 migration 专用 fixture 已通过 UI 测试。完整验收结果为 `npm test` 42 个 test files、187 个 tests 通过（另有 1 个文件、2 个测试按设计跳过），`npm run build` 通过，`cargo test --workspace` 20 个测试通过。`Plan-v2.md` 对应任务可以完成。
