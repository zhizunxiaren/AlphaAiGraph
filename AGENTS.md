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

## 技术栈与工程结构

**前端：** React 19 + TypeScript + Vite 6 + Vitest（jsdom）。V2 主状态用 React hooks（`useKnowledgeWorkspace`），无 Redux/Zustand；`useResearchWorkspace` 暂留作迁移兼容层。

**后端：** Rust workspace，三个 crate：
- `alpha_graph_core` — 知识图谱领域模型（enums + structs + serde），无业务逻辑；旧 research structs 暂留兼容
- `alpha_agent_harness` — 依赖 core，目前只有 smoke test
- `alpha_exporters` — 依赖 core，导出 markdown 格式

**关键目录：**
- `src/types.ts` — 所有 TypeScript 类型定义，权威数据模型
- `src/knowledge/` — V2 知识图谱引擎、fixtures 和测试
- `src/research/` — V1 迁移兼容层，新能力不要继续加入这里
- `src/state/useKnowledgeWorkspace.ts` — V2 主状态 hook
- `src/components/KnowledgeWorkspaceShell.tsx` — V2 主工作台
- `src/test/setup.ts` — Vitest setup
- `crates/` — Rust workspace crates
- `docs/superpowers/specs/` — 产品规格文档

## 开发命令

```powershell
# 前端
npm run dev          # Vite dev server
npm run build        # tsc -b && vite build
npm test             # vitest run
npm test -- src/research/researchAgent.test.ts  # 单个测试文件
npm test -- src/types.test.ts                   # 单个测试文件

# Rust
cargo test --workspace
cargo test -p alpha_graph_core
```

**验证顺序：** `npm test` → `npm run build` → `cargo test --workspace`。声称实现完成前这三条必须全部通过。

## 产品方向

AlphaAiGraph 是 **AI Agent 驱动的知识路线系统**。核心循环：

```text
输入技术/文档/复杂问题 -> AI 生成第一层知识脑图 -> 用户从任意节点下钻/提问/总结/补证据 -> 每次有效分析直接进入同一知识图谱 -> 从全局关联中形成带证据的技术路线
```

不要一次性把对象彻底分析完。第一张图是高层知识地图；下钻方向由用户选择。知识图谱从第一步就是主数据，不是分析结束后的投影。脑图、全局网络和技术路线只是同一图谱的不同视图。

## 数据模型要点

完整数据模型以 `docs/superpowers/specs/2026-07-13-alpha-ai-graph-knowledge-route-system.md` 为准。

核心概念：
- `AnalysisSubject` 指向一个 root `KnowledgeNode`
- `KnowledgeGraph` 是唯一主数据；`KnowledgeView` 只保存根节点、焦点、过滤和布局配置
- 任意 `KnowledgeNode` 都可以继续下钻、提问、总结和关联来源
- `KnowledgeSelection` 明确记录焦点节点、上下文节点、来源与范围，并在 Agent 输入区对用户可见
- 问题、回答和阶段总结通过 typed nodes/edges 进入同一图谱，不只保留在聊天记录
- 技术路线用 goal/constraint/route_option/evidence/decision/route_step 子图表达
- 原始来源不可变；事实性 claim 必须能追溯来源，无来源推断标记为待验证
- Agent 下钻、回答、总结等结构变更先生成 `CandidateGraphPatch`，接受后才写入主图；不能静默覆盖用户结论或路线决策

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

当前分阶段实施计划在 `Plan-v2.md`；`Plan.md` 是 V1 历史归档。当前状态：
- V2 阶段 0（产品模型重置）：已完成 — 单一知识图谱、三视图、渐进下钻、提问总结、可见 Context Packet、候选 Graph Patch 审核和任务式入口已实现并通过验收
- V2 阶段 1-6：待实现 — 来源解析、真实 Agent、技术路线推演、持久化、知识维护和迁移收口

每个阶段完成后必须运行验收命令（见 `Plan-v2.md`）。
