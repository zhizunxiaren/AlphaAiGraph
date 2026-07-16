# AGENTS.md

## 操作红线

禁止批量删除文件或目录。不要使用：

- `del /s`
- `rd /s`
- `rmdir /s`
- `Remove-Item -Recurse`
- `rm -rf`

需要删除文件时，只能一次删除一个明确路径的文件。正确示例：

```powershell
Remove-Item "C:\path\to\file.txt"
```

如果需要批量删除文件，应停止操作，并请求用户手动删除。

如果用户要求清理分支、只保留部分文件或移除某类产物，先列出将受影响的 tracked 文件和目录，等待用户确认后再处理。对 `node_modules/`、`target/`、`dist/`、`.tmp/`、`.codegraph/` 等本地生成目录，只列出并请求用户手动删除；不要用递归命令自动清理。

所有带密钥、token、secret、password、API key、凭证、私有配置或本地数据库的文件都不要提交 git。典型例子包括 `.env*`、`.npmrc`、`.pypirc`、`.cargo/credentials*`、SSH key、`*.pem`、`*.key`、`*.sqlite`、`*.db`、`*.db-journal` 以及本地工具生成的私有目录。提交前必须检查 `git status --short` 和 staged 文件列表；如果路径或文件名包含敏感词，停止并让用户确认。

## 唯一产品方向

AlphaAiGraph 是 **AI 驱动的认知、知识体系构建与研究平台**。产品以用户目标而不是资料类型区分三类 Project：

- `understand`：搞清楚一个复杂对象，由用户确认理解已达到所需深度。
- `systematize`：外化、梳理、验证、纠偏并持续完善已有知识体系。
- `research`：通过主动搜索、多轮分析和验证形成可追溯结论；技术路线只是这一模式可产生的专业化子图。

技术、文档、论文、代码库、行业、主题和问题属于 `SubjectKind`，不能代替 `ProjectMode`。三类 Project 共用同一个 Knowledge Space、Knowledge Graph、不可变 Source Store、Agent Runtime、Context Packet、Candidate Graph Patch、持久化和审计底座。

权威文档按以下顺序解释；下位文档不得覆盖上位不变量：

1. `docs/superpowers/specs/2026-07-13-alpha-ai-graph-product-philosophy.md` — 唯一产品方向。
2. `docs/superpowers/specs/2026-07-14-alpha-ai-graph-project-model-alignment.md` — 当前 Project 工程 contract。
3. `Plan-v2.md` — 当前实施状态和下一步。
4. `docs/superpowers/specs/2026-07-13-alpha-ai-graph-knowledge-route-system.md` — 已完成的阶段 0 架构基线。
5. `docs/DEVELOPMENT.md` — 当前开发者入口和模块导航。

2026-05-09、2026-05-11、2026-05-13 的 Research Map/Cockpit 文档和 `Plan.md` 是 V1 历史资料，不是当前产品或实现依据。

## 技术栈与工程结构

**前端：** React 19 + TypeScript + Vite 6 + Vitest（jsdom）。当前主状态使用 React hooks（`useKnowledgeWorkspace`），无 Redux/Zustand。旧 `useResearchWorkspace`、Research Cockpit 组件和 `src/research/` 已在用户确认后移除，不得恢复为第二套工作台或主数据。

**Rust contract workspace：**

- `alpha_graph_core` — Project、Knowledge Graph、Source、Patch、Research Orchestration 等 serde contract；旧 research structs 仅保留公共 API 兼容。
- `alpha_agent_harness` — provider-neutral Agent 边界及兼容 smoke API。
- `alpha_exporters` — Knowledge Graph Markdown 导出及兼容导出 API。

**关键目录：**

- `src/types.ts` — TypeScript 权威数据模型；文件前部仍有 V1 导入 contract，不能按名称批量删除。
- `src/knowledge/` — 当前知识图谱、来源、Agent、Research 编排、持久化、导出、查询、性能与测试实现。
- `src/knowledge/legacyResearchMigration.ts` — V1 JSON 的唯一受控迁移边界。
- `src/state/useKnowledgeWorkspace.ts` — 当前主状态 hook。
- `src/components/KnowledgeWorkspaceShell.tsx` — 当前唯一主工作台。
- `src/test/setup.ts` — Vitest setup。
- `crates/` — Rust workspace crates。
- `docs/DEVELOPMENT.md` — 开发者入口。
- `docs/superpowers/specs/` — 产品、contract、评估和迁移规格。

## 开发命令

```powershell
# 前端
npm run dev          # Vite dev server
npm run start:web    # PowerShell 启动脚本
npm run build        # tsc -b && vite build
npm test             # vitest run
npm test -- src/App.test.tsx                    # 单个测试文件
npm test -- src/knowledge/knowledgeEngine.test.ts
npm run benchmark:graph                         # 大图性能基准
npm run benchmark:search                        # 搜索质量基准；模型评估可能使用本地缓存

# Rust
cargo test --workspace
cargo test -p alpha_graph_core
```

**验证顺序：** `npm test` → `npm run build` → `cargo test --workspace`。声称实现完成前这三条必须全部通过。

## 数据模型要点

完整产品模型以上述权威顺序为准，运行时 contract 以 `src/types.ts` 和对应 Rust serde 类型为准。

核心概念：

- `Project` 保存目标、模式、工作流、完成标准和图谱范围；`ProjectSubject` 指向 root `KnowledgeNode`。
- `KnowledgeSpace` 容纳多个 Project；`KnowledgeGraph` 是唯一知识主数据，Project 不复制节点和边。
- `KnowledgeView`、脑图、网络、报告、Systematize 产物和技术路线都是纯派生视图或同一图谱的子图。
- Knowledge Graph 保存认知结果；Project Orchestration 保存 Task、Round、Search、Verification 和 Agent 运行过程。
- 任意 `KnowledgeNode` 都可以继续下钻、提问、总结、纠偏和关联来源。
- `KnowledgeSelection` 明确记录焦点、上下文、来源和范围，并作为可见 Context Packet 进入 Agent。
- 原始来源按版本不可变；事实性 Claim 必须定位到有效 SourceAnchor，无来源推断只能保持待验证。
- Agent 的结构变更先生成 `CandidateGraphPatch`，接受后才写入正式图；不能静默覆盖用户知识、结论或路线决策。
- 技术路线用 goal/constraint/criterion/route_option/evidence/decision/route_step 子图表达，只属于 Research 专业能力。
- `AnalysisSubject` 和 V1 `ResearchWorkspaceSnapshot` 仅用于兼容/导入，不得承载新能力。

## Spec Workflow

- 当用户说"启动交互式工作流"时，扫描 `TODO.md` 内的下一步任务，执行任务，执行完后标记完成。继续执行下一个任务。
- 如果所有下一步任务都执行完毕，则等待600秒，启动命令行工具，停止思考，再次读取 `TODO.md` 查看是否有未完成的下一步任务
- 待确认任务列表不要执行
- `TODO.md` 随时会被用户修改，每次都重新读取
- 交互式会话只有一种退出条件，就是当 `TODO.md` 的里程碑状态被改为已完成
- AGENT 只能修改 `TODO.md` 的任务完成状态，其他都不能修改
- 不要帮用户建立自动化任务
- 如果程序触发 crash 或无响应，需要关闭程序，选择其他方式

## 实施计划

当前分阶段实施计划在 `Plan-v2.md`；`Plan.md` 是 V1 历史归档。阶段 0-6 的计划内主能力已经实现：Project model、来源解析、Agent boundary/runtime、Systematize、Research 多轮验证与路线、持久化、知识维护、大图、Wiki round-trip 和 V1 迁移收口均有专项测试。具体在线搜索厂商、真实用户相关性数据、远程同步和多人协作等后续增强不得改写上述产品与数据不变量。Explorer 已有可信后端 adapter contract，但默认不接入厂商、不在浏览器保存 key，并保留浏览器 handoff。

每个阶段或跨模块变更完成前必须按顺序运行验收命令（见 `Plan-v2.md` 和 `docs/DEVELOPMENT.md`）。
