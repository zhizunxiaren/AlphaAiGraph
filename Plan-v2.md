# AlphaAiGraph V2 产品实施计划

> 产品方向基线：`docs/superpowers/specs/2026-07-13-alpha-ai-graph-product-philosophy.md`
>
> 当前实施规格：`docs/superpowers/specs/2026-07-14-alpha-ai-graph-project-model-alignment.md`
>
> 已完成架构基线：`docs/superpowers/specs/2026-07-13-alpha-ai-graph-knowledge-route-system.md`

## 目标

把 AlphaAiGraph 落地为 AI 驱动的认知、知识体系构建与研究平台。产品以 `Project` 表达用户目标，以单一 `KnowledgeGraph` 保存长期认知结果，以 Project Orchestration 保存工作过程，以不可变 Source Store 保存原始资料。

三类 Project 共用同一套知识、来源、Agent、Context Packet、Candidate Graph Patch、持久化和审计底座：

- `understand`：帮助用户搞清楚复杂对象。
- `systematize`：帮助用户梳理、验证、纠偏并完善已有知识体系。
- `research`：帮助用户通过主动搜索、多轮分析和验证形成可信结论。

## 核心不变量

- `ProjectMode` 表达用户意图，`SubjectKind` 表达处理对象类型，两者不得混用。
- `KnowledgeGraph` 是唯一知识主数据；脑图、网络、证据视图、报告和技术路线都是视图或子图。
- Project 保存目标、工作流、完成标准和图谱范围，不复制一套知识节点与关系。
- Knowledge Graph 保存认知结果；Project Orchestration 保存任务、轮次、搜索、验证和 Agent 运行过程。
- 原始资料不可变；事实性 Claim 必须能定位到来源，无法定位的内容不得伪装为已支持事实。
- Agent 的高影响结构变更先形成 `CandidateGraphPatch`，接受后才进入正式图谱。
- 用户知识、结论和路线决策不得被静默覆盖；纠偏通过新节点、状态、关系和历史记录表达。
- 第一张图只提供高层结构，后续由用户从任意节点选择下钻方向。

## 执行原则

- 按依赖顺序先跑通一条真实、可恢复的 Understand 黄金路径，再扩展 Systematize 和 Research。
- 每个阶段必须有行为测试、TypeScript/Rust contract 测试和构建验证。
- 新能力只进入 V2 Project/Knowledge 模型；旧 `Research*` 模型只做迁移兼容和必要 bugfix。
- Agent 角色先实现为统一 Agent Runtime 的 policy/stage，不立即拆成多个独立服务。
- 在数百节点规模前优先图遍历、索引和全文搜索，不提前引入向量数据库。
- 不批量删除旧模块。迁移完成后只列出 tracked 文件清单，等待用户确认；生成目录由用户手动清理。
- 完成声明前按顺序运行 `npm test` → `npm run build` → `cargo test --workspace`。

## 阶段 0：单一知识图谱交互骨架（已完成）

- [x] 明确 `KnowledgeGraph` 是唯一主数据。
- [x] 定义第一版 `KnowledgeNode`、`KnowledgeEdge`、`KnowledgeView`、`AnalysisSubject`、`NodeConversation`。
- [x] 同步 Rust core 第一版知识图谱结构。
- [x] 实现确定性第一层知识图谱。
- [x] 实现任意节点渐进下钻和幂等保护。
- [x] 实现节点提问、回答和局部总结入图。
- [x] 实现可见 `KnowledgeSelection / Context Packet` 和上下文范围切换。
- [x] 实现第一版 `AgentRequest -> CandidateGraphPatch -> 接受/拒绝` 治理闭环。
- [x] 应用入口切换到 V2 工作台；旧驾驶舱曾保留为兼容测试层，已在阶段 6 完成受控迁移并经用户确认后移除。
- [x] 建立 Karpathy LLM Wiki 目录约定与维护文件。
- [x] 完成浏览器视觉复核和三条全量验收命令。

阶段 0 证明了单一图谱和渐进交互可行，但仍是确定性原型。`AnalysisSubject`、按资料类型启动、全局固定技术路线视图和内存状态均为过渡实现，不作为后续产品 contract。

## 阶段 1：Project 产品模型对齐（已完成）

详细规格见 `docs/superpowers/specs/2026-07-14-alpha-ai-graph-project-model-alignment.md`。

- [x] 引入 `Project`、`ProjectMode`、`ProjectStatus`、`ProjectSubject` 和分模式 workflow state。
- [x] 分离 `ProjectMode` 与 `SubjectKind`；技术、文档、论文、代码库和问题只作为 Subject Kind。
- [x] 引入 `KnowledgeSpace` 或等价的共享图谱容器，使多个 Project 引用同一图谱和知识子图。
- [x] 把 `AnalysisSubject` 标记为迁移兼容类型，并提供显式适配路径。
- [x] 将首页入口改为 Understand、Systematize、Research 三种用户意图，再在下一步选择或输入 Subject。
- [x] 将技术路线从全局固定主视图移除，只保留为 Research Project 可创建的专业化子图。
- [x] 对齐 TypeScript 与 Rust 的 Project、KnowledgeNode、SourceRef 和 Patch 序列化 contract。
- [x] 保持阶段 0 的下钻、提问、总结、Context Packet 和 Patch 审核行为不回退。

阶段验收：用户意图和资料类型可以独立组合；三个入口创建不同 mode 的 Project；三个 Project 可引用同一 KnowledgeGraph；普通 Understand Project 不再自动生成技术路线。

## 阶段 2：可信知识与来源内核

- [x] 定义通用 `IngestRequest`、`IngestResult`、`KnowledgeSourceAsset`、`SourceAnchor` 和 parser-neutral `SourceParser` contract。
- [x] 实现 Markdown、纯文本的内置最小解析路径；Markdown 按标题层级切分，纯文本按段落切分，并保留章节、行号与原文 quote。
- [x] 安装并精确锁定 `pdfjs-dist@6.1.200` 作为首选 PDF 解析库；生产依赖审计为 0 个已知漏洞。
- [x] 实现 `PdfJsSourceParser` adapter，通过现有 `SourceParser` contract 接入，配置同版本本地 worker，并加入字节数、页数、单页文本项、图片像素和超时限制。
- [x] 把文档目录转换为确定性的第一层知识子图，而不是孤立摘要；Markdown 保留标题层级，纯文本保留段落，PDF 按页聚合，并让每个节点引用结构化 `SourceAnchor`。
- [x] 原始资料进入 append-only 的不可变 raw layer，按原始字节计算 SHA-256，记录逻辑来源、版本链、URI、媒体类型和字节数；重复导入去重，内容回退仍形成新版本。
- [x] 为 Claim/Evidence 强制保留版本级 Source、结构化 Anchor 和页码/章节/行号/URI locator；Evidence 无有效来源、已验证 Claim 无直接来源或支持 Evidence、伪造/漂移 locator 均无法通过 Graph Patch 接受门禁。
- [x] 扩展并同步 TypeScript/Rust 知识节点类型，支持 fact、hypothesis、inference、conclusion、uncertainty、skill、practice 和 experience；建立统一 UI 标签、语义分类和来源策略，并验证 fact → inference → conclusion 支持链。
- [x] 引入独立 `EpistemicStatus`、适用范围、时间有效性、创建者身份和来源状态；保留旧 `KnowledgeNodeStatus` 表达工作进度，并在 Patch 接受前校验状态、范围、时间与来源语义一致性。
- [x] 增加 `refines`、`corrects`、`supersedes`、`valid_in_context`、`derived_from` 认知演化关系；固定新知识指向旧知识/来源的方向，保留演化历史，并在 Patch 接受前校验端点、理由、创建者、状态和 context scope。
- [x] 扩展 Graph Patch operations，覆盖 revise/link/status/source/archive；维护操作使用 compare-and-swap before/after，所有操作记录独立 audit，Patch 保留 revision 与审核人/时间，并以原子方式拒绝 stale snapshot、重复 ID 和隐式覆盖。
- [x] 加入无来源 verified Claim、失效/漂移 locator、重复 ID 静默覆盖和 TypeScript/Rust contract 漂移测试；Rust operation contract 测试已实际捕获并防止 enum 字段 snake_case/camelCase 漂移。

PDF 选型门禁：检查依赖安全与供应链风险、许可证、维护活跃度、文本提取质量、页码与 bounding box 定位、扫描件/OCR 和加密 PDF 行为、浏览器/Node/Rust 运行环境兼容性、包体与性能。选型结果不改变上层 ingest contract。

当前选型记录（2026-07-14）：首选 Mozilla `pdfjs-dist@6.1.200`，Apache-2.0，使用包内同版本 worker，禁止从 CDN 混用 worker；`package.json` 使用精确版本而不是 caret range。最小真实 PDF fixture 已验证文本、页码和 bounding box 输出；正式接入 ingest 流程前仍需用真实中文、多栏、论文、表格、扫描件和加密 PDF 样本验证文本顺序、定位质量与失败行为。

阶段验收：任意事实性 Claim 都可打开对应原文位置；无来源推断只能处于未验证状态；纠偏不会抹掉旧知识和演化历史。

## 阶段 3：真实 Understand 黄金路径

- [x] 定义 `KnowledgeAgentProvider` provider-neutral boundary、版本化 `KnowledgeAgentInput/Output` 和严格 JSON-schema headers；provider 返回 `unknown`，经运行时校验后才进入领域层。已通过共享 OpenAI-compatible transport 适配 DeepSeek（默认 `deepseek-v4-pro`）和智谱 GLM（默认 `glm-5.2`），模型与 base URL 均可由可信运行时覆盖。
- [x] Agent 输入包含完整 Project（含目标）、当前节点、Context Packet 内的直接邻居、版本级来源与锚点、未解决问题以及用户可见 `KnowledgeSelection`；调用 provider 前使用隔离副本并递归冻结。
- [x] Agent 输出只能是 `pending_review` 的 `CandidateGraphPatch` envelope；拒绝直接 graph 输出、额外 provider 字段、请求漂移、越界节点/来源、未授权 operation 和缺失审计，不向 provider 暴露可变主图。
- [x] 实现 Agent Runtime 的逐 attempt 硬超时、外部取消、可重试错误分类、重试上限与延迟；统一记录 `AgentRun` 事件、provider request/model、token usage，并仅依据带来源和生效时间的显式价格表估算 cost。成功只追加待审核 Patch，失败/超时保留 Run 且不修改主图。
- [x] 实现 Project、KnowledgeGraph、Source、Patch、AgentRun 的版本化 save/load：以 `KnowledgeWorkspaceDocument` schema v2 保存完整知识空间，提供可替换异步 Store、内存与浏览器 localStorage adapter；加载时执行 v1→v2 Patch/audit 迁移、敏感字段拦截、引用/来源/认知演化完整性校验，并在 TypeScript 与 Rust core 共享持久化 envelope contract。
- [x] 跑通“导入真实文档 → 第一层地图 → 下钻/提问/总结 → 来源定位 → Patch 审核”的完整路径：工作台支持 Markdown/Text/PDF 文件导入，原始字节先进入不可变 Raw Source，parser 按格式懒加载；Source/Anchor 直接登记，来源目录节点和关系只通过待审核 Candidate Patch 写入主图。节点面板可显示 locator、quote 与可导航原文地址，真实 Markdown fixture 已覆盖导入、审核、下钻、问答、总结及持久化恢复的端到端测试。
- [x] 增加知识缺口、未解决问题和理解范围提示：所有指标从当前 Project 的 KnowledgeGraph、节点状态、来源状态和可见 Context Packet 实时派生，不持久化第二套结果；区分未下钻、缺证据、来源失效/冲突和未收敛不确定性，未解决问题进一步区分“尚无回答”和“已有候选回答但尚未确认理解”。工作台显示最大层级、结构探索覆盖、来源覆盖和已理解节点数，并明确探索覆盖不等于结论完整度，可从提示直接跳转到对应节点。
- [x] 由用户显式完成、重新打开并继续 Understand Project：完成评估强制先处理全部待审核 Graph Patch；仍有知识缺口或未解决问题时不替用户决定完成度，而是要求显式确认当前深度已满足目标。完成态将 Project/workflow 更新为 completed 并阻止导入、Agent 执行、下钻、问答、总结和 Patch 写入；版本化保存恢复后仍保持完成状态、当前位置和历史。用户重新打开后进入 reopened/reviewing，保留上次 completedAt，并可从同一图谱位置继续工作。
- [x] 支持确定性导出 Markdown wiki；导出不是第二套主数据：浏览器端从当前 Project/KnowledgeGraph 即时生成单文件 Wiki，稳定输出 Project 元数据、完成条件、理解范围、层级节点、语义关系、不可变来源版本、locator 和 quote；不使用导出时钟，相同快照及数组重排产生逐字节相同内容。工作台下载只创建临时 Blob，不修改主图或持久化额外状态；Rust `alpha_exporters` 同步提供 V2 KnowledgeGraph 的确定性 Markdown 投影，旧 ResearchNode API 暂留迁移兼容。

阶段验收：关闭应用后重新打开，Project、图谱、来源、Patch 审核历史和当前工作位置完整恢复；用户可以基于真实资料完成一次 Understand Project。

## 阶段 4：Systematize 知识体系构建

- [x] 支持导入用户笔记、文档、收藏索引和经验陈述，建立 `KnowledgeInventory`；四类输入统一进入不可变来源版本、解析器和 Candidate Graph Patch 审核链路，Systematize Project 默认挂载到“知识清单”子图。`KnowledgeInventory` 不持久化第二套主数据，而是按 Project 从来源注册表、正式图节点与待审核 Patch 确定性重建，展示类型数量、版本、来源定位以及已入图、待审核、未映射状态；用户笔记和经验节点保留 `user_asserted` 语义。
- [x] 实现 Interviewer policy，帮助用户外化隐性知识并明确适用上下文；Systematize 节点采用“实际目标、实际做法、判断规则、适用场景、例外与失效、观察依据”六维渐进访谈，问题随当前 Context Packet 的焦点节点和 Project 目标生成。每轮回答必须声明适用上下文，并生成 question、user-asserted knowledge、Context 节点、`answers`/`valid_in_context` 关系和 conversation 的 Candidate Graph Patch；接受前不修改主图，拒绝后可重答，六维进度从正式图和待审核 Patch 确定性派生。`interview` 作为统一 Agent Runtime 的 policy action 同步进入 TypeScript/Rust contract，不拆独立 Agent 服务。
- [x] 检测重复概念、术语不一致、知识缺口、冲突、过时和适用范围不明；从当前 Project 正式图确定性派生 `KnowledgeDiagnostic` 视图，不把诊断结果持久化成第二套主数据，也不把待审核 Patch 提前当作事实。重复概念采用规范化名称精确匹配；术语不一致采用显式术语键或相同定义签名；缺口复用未解决问题、不确定性和证据缺口；冲突读取 `contradicts`、认知状态和来源状态；过时读取 epistemic/temporal/source 状态并以图更新时间为默认基准；范围诊断检查 user-asserted/context-dependent 知识的 scope 与 `valid_in_context` 一致性。每条结果保存规则证据、置信度、严重度及相关节点/关系，Systematize 面板可按六类计数并定位节点。
- [x] 支持搜索新资料、发现相邻领域、提出反例和待验证问题；Explorer 作为统一 Agent Runtime 的 `explore` policy action，根据当前可见 Context Packet 和知识诊断确定性生成“新资料、相邻领域、反例、验证”四类探索任务，并通过可替换 `KnowledgeSearchProvider` contract 执行搜索、规范化 URL 和去重。默认工作台采用浏览器搜索 handoff，并允许把原页面实际正文或摘录收录为不可变来源；只含 listing snippet 的结果不得入源，来源解析继续生成 `source` Candidate Graph Patch。相邻领域问题、候选反例 hypothesis 和验证问题通过独立 `explore` Candidate Graph Patch 审核，接受后仍保持 unverified，不伪装成事实。本阶段不提前持久化阶段 5 的 `SearchQuery` 编排模型。
- [x] 优化 Explorer 搜索能力与体验；新增不持久化搜索清单的 `ExplorerSearchExecution`、筛选、尝试日志和 Provider disclosure contract，以及不接受浏览器 key 的 trusted backend adapter。列表按查询覆盖率、Provider 顺序和 primary → official → peer-reviewed → independent secondary → community → other 来源优先级确定性排序；规范化 URL、识别 logical URL 与版本并标注 latest/older，页面正文抓取后再按 SHA-256 跨 URL 去重。工作台在搜索前显示隐私、发送范围和费用，提供来源/最新版本/已收录筛选、最多 10 条批量抓取、明确 loading/error/retry 和无 capture 能力提示；搜索及抓取均有 timeout、最多两次尝试和取消边界。只有用户选择后的实际正文进入不可变 Source 与 `source` Candidate Patch，listing snippet 仍不能入源；未配置 Provider 时浏览器 handoff 与手动收录保持为默认回退。Provider 搜索会话不进入 workspace schema，因此 TypeScript/Rust 持久化 contract 无变化。实现与安全边界见 `docs/superpowers/specs/2026-07-16-alpha-ai-graph-explorer-search-experience.md`，专项测试覆盖排序、版本、筛选、重试、正文/内容去重、adapter 最小发送载荷和两条 UI 路径。真实浏览器在 375px 与 1440px 下确认无横向溢出、主要控件 44px 且无 console warning/error；最终门禁为 43 个前端 test files、195 个 tests 通过（另有 1 个文件、2 个 benchmark tests 按设计跳过），生产构建和 Rust workspace 20 个测试通过。
- [x] 实现纠偏建议：错误类型、支持与反对证据、修正内容和适用范围；Correction Advisor 支持事实错误、概念偏差、因果错误、知识过时、范围过度泛化、知识矛盾和不安全实践七类错误。纠偏至少需要一条支持证据、一条反对证据并覆盖两个独立不可变来源，选中的来源节点会生成显式 Evidence 节点并分别通过 `supports` / `contradicts` 表达立场，原始 locator 保持可追溯；修正内容形成带明确 Context 节点和 `valid_in_context` 关系的 context-dependent Claim。接受 `correct` Candidate Graph Patch 时，旧节点仅标记为 contested / contradicted / outdated，并由新节点通过 `corrects` 指向旧节点，旧认知、证据与审查历史均不覆盖；无来源、单一页面或只有搜索摘要时不能提出“已支持”的纠偏。`correct` action 已同步 TypeScript/Rust contract。本项不提前实现下一项 `ImpactAssessment`。
- [x] 在接受纠偏前生成 `ImpactAssessment`，显示受影响的判断、方法、总结和结论；评估由正式图按固定关系方向确定性计算，以最短路径穿过中间节点识别 judgment、method、summary、conclusion 四类下游影响，并记录分类计数、距离、完整关系路径和生成时的图版本。评估作为 `correct` Candidate Graph Patch 的本地审查附件持久化并同步 TypeScript/Rust contract，不接受 Provider 自报；接受前重新计算，图已变化或评估身份、计数、路径损坏时拒绝 stale patch。Patch 审核区可查看计数并定位受影响节点；本项只展示影响范围，不提前创建下一项待复核任务。
- [x] 为受影响节点创建待复核任务，保留接受、修改和拒绝历史；`correct` Candidate Graph Patch 只有在正式接受后，才按 `ImpactAssessment` 的 affected item 一对一创建持久化 `ImpactReviewTask`，保存来源纠偏、评估、旧/新节点、影响分类和完整路径。用户可以“接受现状”或“拒绝复核”，两者只记录明确决策而不静默改图；选择修改会生成关联任务的 user-authored `revise` Candidate Graph Patch，Patch 被接受后才更新节点并将任务标记为 modified，Patch 被拒绝则任务继续待处理。任务以 append-only history 保存 created、accepted、modification_proposed、modified、modification_rejected、rejected 事件及修改前后快照和 Patch 引用；历史、状态转换和引用关系均经过持久化校验并同步 TypeScript/Rust contract，旧 schema v1/v2 文档缺少任务集合时安全迁移为空集合。工作台显示待处理数量、节点定位、三种操作与完整复核历史。
- [x] 支持知识模块、技能树、学习依赖、学习路径和实践手册视图；五种产物作为 Systematize Project 的轻量 `KnowledgeView` 配置持久化并同步 TypeScript/Rust contract，实际内容始终从同一正式 `KnowledgeGraph` 按 graph.updatedAt 确定性投影，不复制第二套业务数据。知识模块沿根主题的 `contains` 层级分组并单列跨模块知识；技能树聚合 `skill` / `practice` / `experience` 及显式层级和依赖；学习依赖只展示正式 `depends_on` 并把 question / uncertainty 列为阻塞项；学习路径按 `depends_on`（依赖项优先）和 `precedes` 稳定拓扑排序，明确标记循环且无显式关系时拒绝臆造顺序；实践手册按方法步骤、原则结论、判断规则、适用范围、证据来源、例外与待验证组织原节点。工作台将图谱视图与体系产物分组导航，提供统计、关系依据、空状态、原节点定位、键盘焦点、跳过导航和 375px 起的响应式布局；所有列表使用稳定 ID，状态不只依赖颜色表达。

阶段验收：系统能修正一项用户旧认知，同时保留原认知、证据、修正关系、审查记录和下游影响范围。

## 阶段 5：Research 多轮研究与技术路线

- [x] 定义 `ResearchBrief`、`ResearchPlan`、`ResearchTask`、`ResearchRound`、`SearchQuery` 和 `VerificationRecord`；六类对象集中在持久化 `ResearchOrchestration` 子域，只保存研究目标、范围口径、计划、角色、依赖、轮次状态、查询参数、验证维度和正式 Graph/Source 引用，不复制事实、Claim、Evidence 或结论。Brief 明确主/次问题、时间/地域/单位、纳入排除和成功标准；Plan 明确有序任务与验证要求；Task 记录输入输出及跨轮状态；Round 分类引用来源、fact、claim、hypothesis、evidence、冲突、缺口、阶段结论、关系和验证记录；SearchQuery 记录目的、筛选、去重结果和执行状态；VerificationRecord 覆盖独立来源、原始来源、时间、地域、单位、方法、利益相关、正反证据、推断范围和替代解释。跨 Project/Plan/Round/Task/Graph/Source 的引用、终态时间、完成轮次必须产生持久进展等约束会在持久化边界确定性校验；旧 schema v1/v2 自动迁移为空编排集合。TypeScript/Rust contract 已同步并有专项往返测试；本项只定义编排契约，不提前实现下一项主动搜索。
- [x] 支持主动搜索、原始来源优先、来源筛选和去重；Research Search 从 ready `ResearchBrief` 和 active/draft `ResearchPlan` 确定性创建一轮持久化搜索编排，主动生成原始来源、支持证据、反对证据、更新检查四类 `ResearchTask` / `SearchQuery`，并将 Project workflow 推进到 researching。可替换 `ResearchSearchProvider` 明确区分 listing 搜索与原文捕获；只有实际捕获的正文/字节能够通过现有 parser 与 raw store 写入不可变 Source，snippet 不会成为证据。候选结果按显式 `SearchSourceKind` 将 primary、official、peer-reviewed 排在二手与社区来源之前，并根据 Brief 时间范围及 Query 的 domain、language、source kind、publication date 做确定性筛选；列表阶段规范化 HTTP(S) URL、移除 tracking/hash 并去重，捕获后再按 SHA-256 内容去重，跨 URL 镜像复用已有 Source ID，同一逻辑 URL 的内容变化仍沿 append-only 版本链保存。执行结果回写 Query、Task、Round 的 Source 引用与终态；Provider 失败明确记录为 failed/blocked，不伪造来源。TypeScript/Rust contract 已同步并有主动建轮、排序筛选、双层去重、不可变收录和失败状态专项测试。本项不接入具体在线搜索厂商；通用 Explorer UI、批量收录、重试、隐私与成本提示已在阶段 4 独立完成，且不把 Explorer 临时搜索会话混入 ResearchOrchestration。
- [x] 每轮研究必须产生新的来源、Claim、Evidence、冲突、缺口、验证记录或阶段判断；每个 `ResearchRound` 启动时持久化 `ResearchRoundBaseline`，记录当时的 Graph 版本及 Node、Edge、Source、Verification ID 集合。`deriveResearchRoundProgress` 只从同一 Project scope 的正式 `KnowledgeGraph`、本轮 Task/Query 产出的不可变 Source 和属于本轮的 `VerificationRecord` 自动分类 source、fact、claim、hypothesis、evidence、conflict、gap、stage judgment 和 verification，不接受调用方自报输出；pending Candidate Graph Patch 不计入进展，只有用户接受并正式入图后才会被识别。`completeResearchRound` 要求所有本轮任务离开 queued/in_progress，自动写入推导后的 outputs、outcome 和后续问题；没有有意义增量时拒绝完成，单独新增 Edge 不算研究进展，已在 baseline 中的旧 ID 也不能伪装成本轮产物。持久化校验同时约束输出类型、Project scope、Round ownership、Task/Query 来源归属和 baseline 增量关系；旧 schema v2 Round 缺少 baseline 时按“当前正式状态减去既有 outputs”安全重建。主动搜索建轮同步捕获 baseline 并遵守 Plan `maxRounds`。TypeScript/Rust contract 已同步，并覆盖候选/接受边界、进展分类、伪造旧 ID 拒绝和迁移重建测试。
- [x] 同时处理支持证据、反对证据、数据口径、时间有效性、利益相关和替代解释；`runResearchVerificationMatrix` 对同一正式 Claim/Hypothesis/Inference/Synthesis/Conclusion/Decision 创建持久化 verify Task 和逐项 `VerificationRecord`，核心矩阵固定覆盖 support_and_opposition、geography、unit、methodology、temporal_validity、conflict_of_interest、alternative_explanation，并合并 Plan 声明的 independent_sources、primary_source_traceability 和 inference_scope 要求。支持与反对立场只从正式图中的 Evidence → target `supports` / `contradicts` 关系推导，Evidence 必须先通过不可变 SourceAnchor 来源门禁；Research Search 捕获的 `SearchSourceKind` 随 Source 版本持久化，用于识别 primary/official 原始来源。地域、单位、方法和利益披露保存为结构化 `VerificationEvidenceProfile`，缺失信息产生 inconclusive，口径冲突、过期证据、缺少正反任一方或缺少正式替代解释产生 failed；披露利益相关不会被简单判为无效，而是 inconclusive 并要求结论说明。替代解释必须是同一 Project 正式图中的 claim/hypothesis/inference/uncertainty，且通过 related_to/contradicts/compares 关联目标。矩阵提供逐项 passed/failed/inconclusive、整体状态和 blocker，执行后 Project workflow 进入 verifying，记录自动回写 Round outputs；持久化边界重新校验 Evidence 类型、正式立场关系、Profile 完整性、替代解释类型和跨 Project/Plan/Round/Task 引用。旧 VerificationRecord 缺少 Profile/替代解释明细时迁移为 unknown 并将原 passed 降级为 inconclusive，要求重新验证，不伪造已知口径。TypeScript/Rust contract 已同步，并覆盖全通过、复合冲突、缺反证、伪造立场拒绝和迁移降级测试。
- [x] 支持证据不足时形成“当前资料不足以支持可靠结论”的有效结果；`completeResearchRound` 不再信任调用方自报 outcome，而是从本轮 baseline 之后新增的正式 `VerificationRecord` 确定性判断：存在 failed/inconclusive 检查时只能完成为 `insufficient_evidence`，仍有 pending 验证时不得完成，没有 blocker 时也不能伪报证据不足。每个不足结论保存结构化 `ResearchInsufficientEvidenceResult`，引用全部 blocker、目标节点、failed/inconclusive 检查种类、实际来源、支持/反对 Evidence 和正式 gap/next question；固定由 system 评估并带时间戳，属于研究编排元结果，不复制事实或伪造 Graph Conclusion。持久化门禁会把结果字段与 canonical verification 状态逐项对账，拒绝漏报 blocker、伪造检查、跨轮/跨 Project 引用和把不足结果改写为 advanced；旧 schema v2 的不足 outcome 若有正式 blocker 会确定性补建结果，若没有可审计依据则安全降级为 advanced，不保留无依据的负面结论。TypeScript/Rust contract 已同步，并覆盖自动形成、调用方伪报/隐藏、篡改拒绝、持久化往返和旧数据重建测试。
- [x] 结论以 fact → inference → synthesis → conclusion 子图表达，并记录置信度、范围和未解决问题；`proposeResearchConclusion` 只接受 active Research Round、整体 passed 的验证矩阵、同 Project 内已 verified/supported 且具有有效不可变 SourceAnchor 的 Fact，以及尚未解决的 question/uncertainty。候选结论由一个或多个 verified Inference、一个 verified Synthesis 和一个 verified Conclusion 组成，统一记录 0..1 confidence、Project scope、时间和创建者；关系方向遵守现有认知演化治理：Inference `derived_from` Fact，Synthesis `derived_from` 全部 Inference 和验证目标，Conclusion `derived_from` Synthesis，并以 `depends_on` 显式关联未解决问题。`derived_from` 已纳入来源 grounding 递归，因此 verified Conclusion 必须能够沿派生链追溯到带有效 locator 的 Fact，而不是依赖无来源文本。整条链只以 `conclude` Candidate Graph Patch 提交，接受前不改主图，拒绝后不产生 Round 结果；接受门禁重新校验验证矩阵、节点类型/状态、confidence、scope、完整派生链和未解决问题关系，接受后写入结构化 `ResearchReliableConclusionResult`，引用已接受 Patch、验证记录和正式 Graph 节点，并把 workflow 推进到 synthesizing。ResearchRoundOutputs 新增 inferenceNodeIds；完成 Round 时可靠结果保持为 advanced，验证 blocker 仍优先形成 insufficient_evidence。持久化边界逐项对账 Patch、Graph、verification、scope、confidence 和链路，拒绝漏节点、伪造边、跨 Project 引用及结果漂移；旧 schema v2 Round 缺少 inferenceNodeIds 时迁移为空。TypeScript/Rust contract 已同步，并覆盖提议/接受/拒绝、验证与来源门禁、置信度和范围、未解决问题、派生来源追溯、Round 完成、持久化往返和篡改拒绝测试。
- [x] 将技术路线实现为 Research 的专业化子图：`proposeResearchRoute` 只接受已通过验证矩阵并形成已验收 `ResearchReliableConclusionResult` 的 active Research Round，在同一个共享 `KnowledgeGraph` 内生成 goal、constraint、criterion、至少两个 route_option、decision 和有序 route_step，并用 goal `derived_from` conclusion、goal `contains` 结构节点、constraint `constrains` 每个选项、criterion `compares` 每个选项、正式 Evidence `supports`/`contradicts` 选项、decision `derived_from` 唯一选中选项、route_step `derived_from` decision 及相邻步骤 `precedes` 表达完整路线。每个候选路线必须有 verified/supported、Project scoped 且可追溯不可变 SourceAnchor 的正式支持证据；route_option 与 decision 纳入来源 grounding。整条路线只通过 `route` Candidate Graph Patch 提议，接受前不写主图，拒绝不留图数据；接受门禁和持久化加载会重新校验可靠结论、共享 scope、节点/边精确覆盖、证据有效性、唯一决策、连续步骤和 Patch/Graph 一致性，拒绝伪造或漂移。TypeScript/Rust action contract 已同步，并覆盖提议、接受、拒绝、前置条件、证据门禁、结构篡改、来源追溯和持久化往返测试；约束变化情景及选择/放弃/不确定性解释留在下一项。
- [x] 支持约束变化情景，并解释选择、放弃和不确定性；`proposeResearchRouteScenarios` 只基于 active Research Round 中已接受且语义有效的 `route` Patch，可一次提议一个或多个情景。每个情景用新的 constraint 表达变化条件，并以 `refines` 指向原约束、重新 `constrains` 全部路线候选；情景 decision 与选择/放弃 explanation 使用包含 Project 和情景约束 ID 的 `context_specific` scope，通过 `valid_in_context` 明确适用边界。decision `derived_from` 当前情景选中的 route_option；选择解释同时派生自选中路线和变化约束并 `explains` decision；每个未选 route_option 必须且只能有一个放弃 explanation，派生自对应路线和变化约束并显式 `explains` 被放弃路线。每个情景至少保留一个 open/unverified uncertainty，decision 以 `depends_on` 引用，uncertainty 以 `related_to` 标出受影响候选，避免把条件化判断伪装成无条件确定结论。全部情景节点与关系只通过 `route_scenario` Candidate Graph Patch 提交，接受前不改主图，拒绝不落图；接受门禁和持久化加载重新校验已接受路线、唯一情景归属、共享 route Patch、原约束、候选全集、完整弃选覆盖、显式不确定性、context scope、关系精确集合以及 Patch/Graph 一致性。TypeScript/Rust action contract 已同步，并覆盖多情景提议、接受/拒绝、共享图谱与来源追溯、前置条件、完整解释门禁、持久化往返和篡改拒绝测试。
- [x] 用户接受的研究结果回流共享 KnowledgeGraph，而不是复制到独立报告数据中；`projectResearchResults` 是不进入 workspace schema 的纯派生只读投影，按 Project 和 Round 从正式 `KnowledgeGraph`、不可变 Source、VerificationRecord、ResearchRound ID 引用及已接受 Candidate Graph Patch 即时重建结论、推理链、正反证据关系、路线、约束情景、决策、步骤和不确定性。投影中的 round、node、edge、source、verification 和 patch 均直接引用 workspace 的 canonical 对象，并记录 `sourceGraphUpdatedAt`，不复制标题、正文、结论或路线到第二套持久化报告模型；Round/Result/Task/Query 继续只保存 Graph、Source、Verification 和 Patch ID。读取前会重跑 ResearchOrchestration、route 和 route_scenario 语义门禁；持久化边界显式拒绝 workspace/orchestration/Round 中的 `researchReports`、`reportContent` 等独立报告副本。端到端测试已覆盖第一轮可信结论、路线和约束情景接受后直接从共享图读取，第二轮从第一轮 uncertainty 下钻、接受 Patch、完成 Round 并继续由同一投影读取，以及 baseline 之前的正式支持/反对证据关系、对象引用同一性、持久化往返和独立报告字段拒绝。报告 UI、排版和导出可在后续消费该投影，但不得成为新的知识主数据。

阶段验收：围绕真实研究问题完成至少两轮有状态推进；核心结论可追溯到支持和反对证据；技术路线能解释约束、候选、证据、决策与步骤。

## 阶段 6：知识维护、规模化与迁移收口

- [x] 实现孤儿节点、重复概念、缺来源 Claim、矛盾、过期内容和失效 locator lint；`lintKnowledgeWorkspace` 在当前 Project 的活动节点上纯派生确定性 `KnowledgeDiagnostics`，不修改或持久化诊断结果，并由工作台和 Explorer 直接消费。孤儿节点排除 Project/Graph root，只有与任一活动节点均无入边和出边时才报告；重复概念沿用保守的 NFKC、大小写、空白和标点规范化精确签名，避免未经评估的模糊合并；Claim 必须具有有效且 sourceStatus verified 的直接 SourceAnchor，或能沿正式 `supports` / `derived_from` 链追溯到带不可变 locator 的 Fact/Evidence，否则产生独立 `missing_claim_source` lint。冲突同时识别显式 `contradicts` 关系及 contested/contradicted/conflicted 状态；过期内容识别 outdated、expired、validUntil 早于 asOf 和 stale Source；失效 locator 逐条对账 Source、Anchor 所属、content hash、locator 类型/范围、格式化 locator 和 quote 快照。新增 provenance 单引用校验与来源 grounding 只读 API，诊断 contract 扩展为包含 orphan_node、missing_claim_source 和 invalid_locator 的九类结果；专项测试覆盖确定性、无状态修改、有效 Evidence 链不误报、locator 漂移、孤儿、重复、冲突、过期及工作台/Explorer 集成。
- [x] 实现局部邻居、最短路径、cluster、全文搜索和跨 Project 知识复用；新增无状态 `knowledgeGraphQuery` 作为统一查询层，默认只读取当前 Project、其显式 root 与 universal 知识，也允许调用方显式指定 Project、关系类型、方向、深度、节点上限和归档范围，避免 `whole_subject`、工作台邻居及 Agent Context Packet 静默泄漏其他 Project 数据。局部邻居和最短路径基于正式 Edge 做确定性 BFS，返回 canonical Node/Edge 引用、距离/跳数、图版本和截断状态；cluster 明确实现确定性 weak connected components（弱连通分量），不冒充统计聚类。全文搜索以 NFKC、大小写/空白/标点规范化，在 title、summary、tags、kind 和 source quote 上提供可解释 lexical 排名、命中字段与命中词，BM25/embedding 不在本项预设引入。跨 Project 发现只返回其他 Project 的 canonical node 引用；实际复用必须提交 `reuse` Candidate Graph Patch，且只能修订同一节点的 Project scope/tag 并由目标 Project root 新建 `contains` 入口，门禁明确禁止 `create_node`、Project root 复用、身份漂移、重复链接和非活动目标，接受/拒绝及持久化加载都会重跑语义校验。TypeScript/Rust action contract 已同步，专项测试覆盖查询作用域、确定性、关系过滤、路径上限、组件/单例、全文字段与排序、无状态发现、无复制接受、拒绝、持久化和伪造副本拦截。
- [x] 在数百节点真实数据上评估 BM25/embedding hybrid search，不按预设引入；新增 provider-neutral 离线评估器，统一计算 Recall@10、MRR@10、nDCG@10、mean/P95 latency，并提供 production lexical adapter、确定性中英文 BM25、真实 embedding provider 边界和基于 Reciprocal Rank Fusion 的 hybrid，不混合不可比较的原始分数。Benchmark 从仓库 7 份真实 Markdown 规格按 heading 和 360 字上限构造 320 个节点，使用 15 条人工分级相关性查询并严格拆为 7 条 calibration 与 8 条 evaluation；hybrid 只在 calibration 集比较 0.25/0.5/0.75 BM25 权重，最终用独立 evaluation 集报告。固定 `@huggingface/transformers@4.2.0`、公开 multilingual MiniLM q8 模型及 commit revision，模型只进用户缓存且 benchmark 默认跳过；专项命令可完整复现。独立集上 BM25 的 Recall/MRR/nDCG 为 0.646/0.682/0.626、P95 1.93 ms，显著优于当前 lexical 的 0.104/0.150/0.126 和 P95 68.91 ms；embedding 为 0.396/0.344/0.294，75/25 hybrid 为 0.625/0.550/0.517、P95 28.34 ms，均未超过 BM25。结论是把 BM25 产品接入留给既有搜索优化 TODO，暂不引入 embedding、hybrid production path 或向量数据库；待至少 50 条真实用户查询及跨语言/同义词判断后再评估。完整方法、逐查询观察、运行环境、门槛和局限见 `docs/superpowers/specs/2026-07-15-alpha-ai-graph-search-evaluation.md`。
- [x] 实现大图渐进加载、局部布局和性能预算；新增确定性 320/1,000/3,000 节点规模 fixture 与独立 `npm run benchmark:graph`，串行分离 fixture、scope index、邻域、路径、weak component、Selection、工作台派生、局部 projection/layout 和 48 节点 React 静态渲染成本。查询层按 Project scope、关系过滤、归档策略和 `graph.updatedAt` 缓存 canonical 邻接索引，BFS 不再逐节点全表扫描；新增绑定 graph 版本与 scope 的确定性 cursor 分页，版本或 scope 变化时明确过期。画布改为从单一 KnowledgeGraph 派生局部投影，首屏 24 节点、每次 +12、硬上限 48 节点/96 边，保留 root→focus 路径与焦点邻域；局部纯函数布局不写回 graph/view，Candidate Patch 后随 graph 版本重算，Context Packet 不因画布虚拟化缩小。3,000 节点/9,000 边下 index build 11.33 ms、邻域 P95 0.90 ms、cluster P95 15.65 ms、whole Project Selection P95 24.14 ms、渐进投影 P95 3.24 ms、局部布局 P95 0.06 ms、48 节点 React 静态渲染 P95 11.37 ms，均满足已定义预算；完整前后对照、内存估算、超限行为与限制见 `docs/superpowers/specs/2026-07-15-alpha-ai-graph-large-graph-performance.md`。
- [x] 实现 KnowledgeGraph 与 Markdown wiki 的确定性映射、round-trip 和 Obsidian-compatible 导出；保留既有单文件 `.wiki.md` 阅读投影，并新增 version 1 目录级 vault contract：Project、每个 Project-scoped/root/universal canonical node、每个实际引用的不可变 Source version 分别映射为 `Project.md`、`Nodes/*.md`、`Sources/*.md`，标准 YAML frontmatter 内保存 JSON-compatible canonical payload，正文提供 Obsidian `[[wikilink]]`、typed relation、Source、locator 和 quote，`.alpha-ai-graph/manifest.json` 只保存 identity→path 而不复制知识数据。稳定文件名由规范化标题和 canonical ID CRC32 组成；自实现 UTF-8 store ZIP 以 `graph.updatedAt` 固定 timestamp，数组重排仍逐字节一致，并设置 64 MiB archive、10,000 entry、8 MiB/file、CRC 与 path traversal 门禁。解析器可无损重建 Project、graph metadata、node、edge、Source 和 SourceAnchor；同一 vault 导回为 unchanged，title/summary/tags/scope 和 relation 差异只形成 `revise` CandidateGraphPatch，接受前主图不变；Source/Anchor/locator、受保护 node 字段、删除 node/edge、跨 Project/Graph 和 contract v1 未定义的新 node 均明确拒绝。工作台同时提供 Obsidian Vault ZIP 下载与 ZIP 导回，差异复用现有 Patch 审核。完整结构、映射、治理边界和兼容性见 `docs/superpowers/specs/2026-07-15-alpha-ai-graph-markdown-wiki-vault.md`。
- [x] 列出旧 `Research*` 模型到 Project/Knowledge/Orchestration 的迁移映射；新增阶段 6 权威静态盘点 `docs/superpowers/specs/2026-07-15-alpha-ai-graph-research-model-migration-map.md`，以当前生产入口、V1 兼容测试依赖、schema migration 字段和 Rust crate 公共 API 为证据，明确区分第 1-424 行 V1 `ResearchWorkspaceSnapshot` 模型、仍由 V2 生产代码使用的正式 `ResearchOrchestration`，以及跨代共享的 `ActorKind`，避免按 `Research*` 名称误删。文档逐字段穷举 23 个 V1 interface，将旧数据归入 Project/ProjectSubject、canonical KnowledgeNode/KnowledgeEdge、不可变 KnowledgeSourceAsset/SourceAnchor、ResearchOrchestration/Agent audit、view-only projection、history-only 或 drop candidate，并给出 node/status/edge 枚举转换。盘点确认 V1 浏览器工作台已退出生产依赖图但仍由独立测试覆盖，legacy `sourceAssets` 只保留 schema 兼容，Rust harness/exporter 仍有 `ResearchNode` 公共签名；同时标出 command/script run、完整 transcript、marker severity、order 等无可靠 V2 等价物。迁移治理明确禁止把旧 `auto_attach_evidence/auto_create_candidates` 转成自动写图权限，旧 verified 内容必须重新校验 SourceAnchor，RelationshipGraph 只能重建为 view，后续先迁 evidence/candidate/job 能力再讨论逐文件清理；本项未改运行时代码、schema 或文件布局。
- [x] 将仍有价值的 evidence/candidate/job 能力迁入新工作流；新增 `legacyResearchMigration` 受控兼容边界和工作台“迁入旧 Research”JSON 入口，独立解析 V1 `ResearchWorkspaceSnapshot`，执行 8 MiB、UTF-8、结构、enum、unique/normalized ID 与 endpoint 门禁，且不让 V2 hook 重新依赖 V1 state/UI。Evidence 只有在旧 Source 声明 `contentHash`、当前 Knowledge Space 已有 hash 完全一致的 version-specific immutable `KnowledgeSourceAsset`、locator 合法且旧 target 能唯一映射到当前 Project scope 时，才生成新的 SourceAnchor 与 verified Evidence/supports operations；Anchor 可注册，node/edge 始终先进入 `source` CandidateGraphPatch，接受前 canonical graph 保持不变。旧 pending/needs_review/merged Candidate 全部重新转换为 `drill_down` pending Patch，dismissed 只留 history，所有 declared evidence 必须完整对账，旧 auto merge policy 不获得写图权限；finding 保守转为 open Claim，Fact/Evidence 仍要求有效 SourceAnchor。非执行型 AgentJob 只在 active Research Project/Plan/Round 中按 parse/extract/analyze/synthesize 和正式 role 转为 ResearchTask，同步 Plan/Round taskIds、可映射 node/source refs、dependency 和状态并重跑 ResearchOrchestration 门禁；generate_script/run_command 不伪装成 Task 或 AgentRun。ExecutionRun 仅作为返回期脱敏 history record 暴露 ID、状态、时间、exit code、summary 和引用，command/script/stdout/stderr 不进入 workspace。确定性 entity ID 保证重复导入幂等，结果明确报告新增 IDs、skip reason 和 rawPayloadOmitted；接受后的图与完整 workspace 通过 provenance/evolution/persistence。专项测试覆盖 Evidence/Candidate 接受、旧 merged 降权、hash/endpoint/JSON/ID 篡改、幂等、Job/依赖/状态/Plan/Round、raw execution 省略和 UI 文件入口；完整 contract 见 `docs/superpowers/specs/2026-07-16-alpha-ai-graph-legacy-research-workflow-migration.md`。本项未升级 schema、未建立第二套主数据，也未删除 V1/Rust compatibility 文件。
- [x] 列出不再使用的 tracked 文件和目录，等待用户确认后逐个处理；本地生成目录由用户手动清理。权威盘点与执行记录见 `docs/superpowers/specs/2026-07-16-alpha-ai-graph-tracked-cleanup-candidates.md`。静态检查确认 V1 浏览器工作台已退出生产依赖图，但最初仍有 27 个兼容测试且 `src/App.test.tsx` 复用旧 fixture，因此没有零前置条件可删项；用户明确确认第一批范围后，新增 `src/knowledge/fixtures/legacyResearchWorkspace.ts` 作为只服务受控迁移边界的最小 V1 样本，解除 V2 UI 测试对 `src/research/fixtures.ts` 的依赖，再逐个移除 14 个 V1 TypeScript 工作台/state/research 文件，并从 `src/styles.css` 删除只服务旧工作台的 902 行 selector 块。Rust/types/styles V2 内容、历史规格、`knowledge-base/`、`wiki/` 均保留，`node_modules/`、`target/`、`dist/`、`.tmp/`、`.codegraph/` 未 tracked 且未由 Agent 清理。全量验收为 42 个前端 test files、187 个 tests 通过（另有 1 个文件、2 个测试按设计跳过），生产构建通过，Rust workspace 20 个测试通过。
- [x] 更新根 `AGENTS.md`、README 和开发者文档为新的唯一产品方向；根 `AGENTS.md` 已从旧“知识路线系统”与 `AnalysisSubject` 顶层叙述切换为 Understand/Systematize/Research 三类 Project 共用 Knowledge Space、canonical KnowledgeGraph、不可变 Source、Agent Runtime 与 Candidate Patch 的当前模型，并删除已失效的 `useResearchWorkspace`、`src/research/` 和旧测试命令指引。README 已从占位文本重写为面向使用者和新贡献者的产品、架构、当前能力、本地开发、质量门禁、benchmark、目录、权威文档与安全说明；新增 `docs/DEVELOPMENT.md`，明确分层数据流、模块所有权、变更流程、测试责任、provider 安全、schema v2 持久化和 V1 兼容边界。三份 2026 年 5 月 Research Map/Cockpit/UI 规格增加醒目的历史归档声明，阶段 0 knowledge route 基线同步为旧浏览器模块已移除的实际状态，形成“产品理念 → Project contract → Plan-v2 → 已完成架构基线 → 开发者指南”的唯一权威链。静态检查确认当前指南无过时命令、12 个关键路径和 README 6 个本地链接均有效；完整验收为 42 个前端 test files、187 个 tests 通过（另有 1 个文件、2 个测试按设计跳过），生产构建通过，Rust workspace 20 个测试通过。

阶段验收：真实大图仍可局部操作和维护；跨 Project 共享知识不复制业务数据；迁移后不存在两个继续演进的主模型。

## 第一条产品黄金路径

```text
创建 Understand Project
→ 选择 Subject Kind 并导入真实 Markdown/PDF
→ 生成带 SourceAnchor 的第一层知识地图
→ 用户选择任意节点下钻、提问或总结
→ Agent 读取可见 Context Packet
→ Agent 生成带来源和认知状态的 Candidate Graph Patch
→ 用户接受或拒绝
→ 保存并关闭 Project
→ 重新打开并从原位置继续
→ 用户显式确认已经理解到所需深度
```

在这条路径通过前，不以“三种 Project 都有页面”、节点数量、复杂图布局或多 Agent 数量作为产品完成标志。

## 阶段质量门禁

每个阶段必须满足对应行为验收，并按顺序通过：

```powershell
npm test
npm run build
cargo test --workspace
```

涉及持久化的阶段还必须增加 save/load round-trip 和版本迁移测试；涉及来源的阶段必须增加 locator 有效性测试；涉及 Agent 的阶段必须增加失败、重试、越权写入和无来源事实测试。
