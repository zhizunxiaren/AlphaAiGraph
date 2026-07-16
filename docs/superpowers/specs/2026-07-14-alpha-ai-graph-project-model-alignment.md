# AlphaAiGraph Project 产品模型对齐规格

> 状态：已完成
>
> 日期：2026-07-14
>
> 上位产品基线：`2026-07-13-alpha-ai-graph-product-philosophy.md`
>
> 作用：定义 `Plan-v2.md` 阶段 1 的工程 contract、迁移边界和验收标准。

## 意图

把当前以 `AnalysisSubject` 和资料类型为中心的 V2 交互原型，对齐为以用户目标为中心的 `Project` 产品模型。完成后，用户先选择 Understand、Systematize 或 Research，再选择技术、文档、论文、代码库、行业、主题或问题等 Subject；三个 Project 共用同一 KnowledgeGraph、来源、Agent Runtime、Context Packet、Candidate Graph Patch 和历史。

本阶段产物是可编译、可序列化、可迁移的 TypeScript/Rust contract，以及使用该 contract 的三意图产品入口。它不接入真实 LLM、PDF 解析、数据库或完整研究工作流。

## 假设

- 第一批产品形态仍以单用户、本地运行的 React 工作台为主。
- 阶段 0 的单一 KnowledgeGraph、渐进下钻、提问、总结和 Patch 审核行为必须保留。
- 当前内存 fixture 可继续作为本阶段交互测试数据，但必须通过新 Project contract 创建。
- Project 可以从某个已有知识节点派生，并与其他 Project 共享图谱节点；本阶段不实现跨设备同步和权限。
- `AnalysisSubject` 暂时保留为兼容适配类型，不在本阶段删除旧 `Research*` 或兼容模块。

## 第一性原理模型

- 目标：让产品顶层对象准确表达用户要完成的认知任务，而不是输入资料格式。
- 角色：用户选择目标、对象和完成标准；Project 管理工作过程；KnowledgeGraph 保存长期知识；Agent 依据 Project policy 提出 Patch。
- 输入：Project mode、目标、Subject kind、Subject 描述、来源引用、可选派生节点。
- 输出：Project、ProjectSubject、共享 KnowledgeGraph 引用、Project workflow state、Project views 和兼容 snapshot。
- 约束：不能复制知识主数据；不能破坏阶段 0 行为；TypeScript/Rust JSON 必须对齐；不能批量删除旧模块。
- 不变量：Project mode 与 Subject kind 正交；普通 Understand/Systematize Project 不自动拥有技术路线；Project 完成必须由用户确认或满足模式特定审批条件；旧模型只兼容不继续承载新能力。
- 失败模式：仅给 `AnalysisSubject` 改名；每个 Project 复制一份图谱；三入口只是三张相同页面；路线视图仍默认出现；Rust 与 TypeScript 字段继续漂移。
- 验证：类型测试、序列化 fixture、workspace reducer/hook 测试、入口交互测试、现有知识引擎回归测试和三条全量命令。

## 简化后的范围

本阶段只建立正确的 Project 边界和迁移适配器。保留确定性知识引擎作为测试替身；真实来源、真实 Agent、持久化、纠偏、主动搜索和多轮研究分别在后续阶段实现。

## 裁剪结果

### 保留

- `ProjectMode` 与 `SubjectKind` 分离：这是三类产品工作流成立的前提。
- 共享 KnowledgeGraph：防止 Project 之间复制知识并产生同步问题。
- 模式特定 workflow state 和完成标准：使三个入口具有行为差异，而不只是文案差异。
- 兼容适配器：保护阶段 0 测试和旧 Research 模块，支持渐进迁移。
- TypeScript/Rust contract 对齐：避免持久化和 Agent boundary 建立在漂移模型上。

### 延后

- 完整 Systematize/Research orchestration：本阶段只定义最小状态，不实现完整执行器。
- 真实 Agent 和 provider：先固定 Project 输入输出边界。
- 数据库和跨设备同步：先用内存 snapshot 验证模型与 UI。
- Project 模板市场、团队权限和多人协作：不阻塞单用户黄金路径。

### 删除

- 按技术、文档、代码库等资料类型定义产品模式：Subject Kind 不能替代用户目标。
- 为每个 Project 创建独立 KnowledgeGraph 副本：Project 只保存图谱引用和工作范围。
- 所有 Project 默认创建技术路线视图：路线只在 Research 产生相应子图后出现。
- 继续向 `AnalysisSubject` 和旧 `Research*` 添加新能力：它们仅作为迁移兼容层。

## 领域边界

```text
KnowledgeSpace
  -> KnowledgeGraph（唯一知识主数据）
  -> Project[]
       -> ProjectMode / goal / workflow / completion
       -> ProjectSubject
            -> SubjectKind
            -> root KnowledgeNode
       -> ProjectView[]
       -> Project Orchestration（后续阶段扩展）

KnowledgeGraph
  -> KnowledgeNode[]
  -> KnowledgeEdge[]
  -> SourceRef[]

CandidateGraphPatch
  -> AgentRequest
  -> Project + KnowledgeSelection
  -> GraphPatchOperation[]
```

`KnowledgeSpace` 表达一套可以跨 Project 复用的知识空间。当前单用户实现可以只有一个默认 Space，但 contract 不应把 `Project` 等同于整张图谱。

## 建议 TypeScript Contract

```ts
export type ProjectMode = "understand" | "systematize" | "research";

export type SubjectKind =
  | "technology"
  | "document"
  | "paper"
  | "codebase"
  | "industry"
  | "topic"
  | "question";

export type ProjectStatus =
  | "draft"
  | "active"
  | "completed"
  | "reopened"
  | "archived";

export type ProjectWorkflowState =
  | { mode: "understand"; phase: "setup" | "mapping" | "exploring" | "reviewing" | "completed" }
  | { mode: "systematize"; phase: "inventory" | "structuring" | "validating" | "converging" | "completed" }
  | { mode: "research"; phase: "brief" | "planning" | "researching" | "verifying" | "synthesizing" | "completed" };

export interface KnowledgeSpace {
  id: string;
  title: string;
  graphId: string;
  projectIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSubject {
  id: string;
  kind: SubjectKind;
  title: string;
  description: string;
  rootNodeId: string;
  sourceAssetIds: string[];
}

export interface Project {
  id: string;
  spaceId: string;
  graphId: string;
  mode: ProjectMode;
  title: string;
  goal: string;
  subject: ProjectSubject;
  status: ProjectStatus;
  workflow: ProjectWorkflowState;
  completionCriteria: string[];
  parentProjectId?: string;
  derivedFromNodeId?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}
```

### Contract 约束

- `workflow.mode` 必须与 `project.mode` 相同。
- `subject.rootNodeId` 必须存在于 `project.graphId` 指向的 KnowledgeGraph。
- `parentProjectId` 或 `derivedFromNodeId` 只表达派生关系，不复制父 Project 的节点。
- `completed` 必须记录 `completedAt`；重新打开后状态变为 `reopened`，知识历史保留。
- Project 的 `completionCriteria` 是用户可见条件，不允许 Agent 单独宣布 Understand Project 已完成。
- 当前 `KnowledgeWorkspaceSnapshot.subject` 迁移为 `project.subject`；兼容期可以通过 selector 暴露旧字段。

## View Policy

### Understand

- 默认：`mind_map`。
- 可切换：`network`、后续的 `evidence`。
- 不默认创建：`route`。

### Systematize

- 默认：`network` 或知识结构视图。
- 可切换：`mind_map`、`evidence`、后续的 inventory/impact 视图。
- 不默认创建：`route`。

### Research

- 默认：研究问题的 `mind_map` 或 `network`。
- 可切换：`evidence`。
- 只有图中存在 goal/constraint/route_option/evidence/decision 子图时才提供 `route`。

View 只保存根节点、焦点、过滤和布局配置，不拥有节点、关系、结论或路线业务数据。

## 兼容迁移策略

### 类型迁移

1. 新增 Project contract，不立即删除 `AnalysisSubject`。
2. 将 `KnowledgeSubjectKind` 重命名或别名为 `SubjectKind`。
3. 为旧 `AnalysisSubject` 提供 `toProjectSubject` 或等价纯函数适配器。
4. `KnowledgeWorkspaceSnapshot` 新增 `space` 和 `project`，兼容 selector 暂时提供 `subject`。
5. Rust core 同步对应 enum/struct，并用共享 JSON fixture 校验字段与枚举值。

### 状态迁移

1. `createKnowledgeWorkspace(title, kind)` 暂时映射为 `understand` Project。
2. 新入口使用 `createProjectWorkspace({ mode, subjectKind, title, goal })`。
3. 现有下钻、提问、总结和 Patch API 从 snapshot 中读取 `project` 与 selection。
4. 现有 fixture 的固定路线节点不再为普通 Project 自动创建；路线相关 fixture 移到 Research 专用构造器。
5. 旧入口和旧 `Research*` 测试保持兼容，但不再增加产品能力。

### UI 迁移

```text
第一步：选择用户意图
  -> 我想搞清楚一个东西
  -> 我想梳理、验证并完善已有知识体系
  -> 我想研究一个问题并得到结论

第二步：输入目标与对象
  -> Project goal
  -> Subject kind
  -> 标题/问题
  -> 可选资料

第三步：进入模式对应工作台
```

三种入口必须创建不同的 `ProjectMode` 和 workflow 初始状态；即使阶段 1 暂时复用主工作台，也不能只改变标题文案。

## 需求拆解

- R1：用户可以独立选择 Project Mode 和 Subject Kind。
- R2：所有 Project 引用共享 KnowledgeGraph，不复制知识主数据。
- R3：三种 Project 具有不同的 workflow state 和完成标准。
- R4：普通 Understand/Systematize Project 不自动生成技术路线。
- R5：阶段 0 的下钻、提问、总结、Context Packet 和 Patch 审核继续工作。
- R6：TypeScript 与 Rust 的 Project/Subject JSON contract 一致。
- R7：现有 `AnalysisSubject` 和旧 Research 模块可以渐进迁移，不批量删除。
- R8：用户能从已有知识节点派生另一种 Project，并引用同一节点。

## 功能拆解

- F1 `Project Core`：Project、Mode、Status、Subject、Workflow 和完成标准。
- F2 `Knowledge Space`：共享图谱容器和 Project 图谱引用。
- F3 `Intent Launcher`：三意图入口与独立 Subject 选择。
- F4 `View Policy`：根据 Project Mode 和图谱内容提供视图。
- F5 `Compatibility Adapter`：旧 subject/snapshot/API 的显式适配。
- F6 `Cross-language Contract`：TypeScript/Rust 结构和 JSON fixture 对齐。

## 实施路径

- S1：先增加 TypeScript Project contract、构造校验和单元测试，不改 UI。
- S2：同步 Rust enum/struct，并建立同一 JSON fixture 的序列化测试。
- S3：增加 KnowledgeSpace、Project workspace snapshot 和兼容 selector/adapter。
- S4：把确定性知识引擎改为接受 Project 输入，保留下钻、提问、总结和 Patch 行为。
- S5：移除普通 workspace 的固定路线 fixture，增加 Research 专用路线 fixture 与 View Policy。
- S6：把启动器改成“意图 → 目标与 Subject”两步流程，并显示当前 Project Mode、目标和 workflow phase。
- S7：实现从知识节点派生 Project 的最小纯状态操作，验证共享图谱引用。
- S8：运行行为测试、构建和 Rust workspace 测试，记录迁移后仍待处理的兼容项。

## 落地追踪矩阵

| 需求 | 支持功能 | 实施步骤 | 验收检查 |
| --- | --- | --- | --- |
| R1 | F1,F3 | S1,S6 | V1,V3 |
| R2 | F2 | S3,S7 | V2,V8 |
| R3 | F1,F3 | S1,S6 | V1,V3 |
| R4 | F4 | S5 | V4 |
| R5 | F5 | S3,S4 | V5 |
| R6 | F6 | S1,S2 | V6 |
| R7 | F5 | S3,S8 | V7 |
| R8 | F1,F2 | S7 | V8 |

## 验收检查

- V1：Project Mode、Subject Kind、workflow mode/phase 的类型约束和非法组合测试通过。
- V2：两个 Project 可以引用同一个 graphId 和同一个知识节点，且没有节点副本。
- V3：三个产品入口分别创建 understand、systematize、research Project，并使用各自初始 workflow state。
- V4：Understand/Systematize 默认视图中没有固定 route；Research 仅在存在路线子图时显示 route。
- V5：阶段 0 的渐进下钻幂等、问答入图、总结入图、Context Packet 和 Patch 接受/拒绝测试继续通过。
- V6：同一个 Project JSON fixture 在 TypeScript 预期和 Rust serde 测试中字段、枚举值一致。
- V7：旧入口仍可通过兼容适配器创建 understand Project；没有删除旧 tracked 文件。
- V8：从一个知识节点派生 Research Project 后，新旧 Project 引用同一节点和 KnowledgeGraph。
- V9：`npm test`、`npm run build`、`cargo test --workspace` 按顺序全部通过。

## 非目标

- 本阶段不接入真实模型、搜索服务、PDF parser 或数据库。
- 本阶段不实现完整 Research Plan、Research Round、纠偏和 Impact Assessment。
- 本阶段不自动迁移或删除旧 `Research*` 文件。
- 本阶段不引入 Redux/Zustand、向量数据库、多 Agent 服务或多人权限系统。

## 完成定义

只有当 V1-V9 全部满足，且 UI、TypeScript、Rust 和测试都以 `Project` 为新的产品入口时，本阶段才算完成。仅新增类型、仅修改启动器文案或仅把 `AnalysisSubject` 重命名，都不算完成。
