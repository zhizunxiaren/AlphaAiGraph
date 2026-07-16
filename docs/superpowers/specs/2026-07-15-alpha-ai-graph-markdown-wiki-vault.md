# AlphaAiGraph Markdown Wiki Vault Contract

> 日期：2026-07-15  
> Contract version：1  
> 实现：`src/knowledge/markdownWikiVault.ts`

## 目标

把当前 Project 可见的 canonical `KnowledgeGraph` 映射为人类可读、Obsidian 可直接打开、又能无损导回的 Markdown vault。Vault 是可编辑导出物，不是第二套运行时主数据；任何导回差异都先形成 `CandidateGraphPatch`，用户接受后才进入正式图谱。

既有单文件 `.wiki.md` 导出继续保留，适合阅读和分享。目录级 `.obsidian.zip` 承担逐节点文件、双向映射和导回职责。

## Vault 结构

```text
<project>.obsidian/
├── README.md
├── Index.md
├── Project.md
├── Nodes/
│   └── <normalized-title>--<stable-crc32>.md
├── Sources/
│   └── <normalized-title>--<stable-crc32>.md
└── .alpha-ai-graph/
    └── manifest.json
```

文件名由 NFKC 规范化标题和 canonical ID 的稳定 CRC32 token 组成，不使用数组位置或导出时钟。同一 snapshot 以及 node/edge/source 数组重排产生逐字节相同的文件集合与 ZIP。

ZIP 使用 UTF-8、store method（无压缩）、固定 `graph.updatedAt` DOS timestamp 和 CRC32。实现不引入第三方压缩依赖。导入限制为 64 MiB、10,000 entries、单文件 8 MiB，并拒绝绝对路径、父目录、drive/URI 冒号、重复路径、CRC 漂移和压缩 method，避免 path traversal 与 zip bomb 风险。

## 确定性映射

### Project.md

Frontmatter 保存：

- `alphaAiGraphProject`：完整 Project contract。
- `alphaAiGraphSpace`：KnowledgeSpace identity 和共享 graph 引用。
- `alphaAiGraphGraph`：不含 node/edge 数组的 graph metadata。

正文提供 Project 目标、状态、graph ID 和 root node wikilink。

### Nodes/*.md

每个 Project-scoped、root-visible 或 universal canonical node 对应一个 note：

- `alphaAiGraphNode`：完整 `KnowledgeNode` JSON-compatible YAML payload。
- `alphaAiGraphOutgoingEdges`：该 node 拥有的全部 typed outgoing edges。
- `aliases`、`tags`：供 Obsidian 搜索与导航使用。
- 正文：标题、summary、认知/来源状态、typed `[[wikilink]]` 关系、Source note 链接、locator 和 quote。

Edge 只保存在 `fromNode` 的 note 中，避免双份 payload；正文可在人类阅读时显示正向关系，manifest 和 canonical ID 负责无歧义 round-trip。

### Sources/*.md

每个当前 Project 实际引用的不可变 Source version 对应一个 note：

- `alphaAiGraphSource`：完整 `KnowledgeSourceAsset` metadata。
- `alphaAiGraphSourceAnchors`：属于该 Source version 的全部 locator、quote 和 content hash。
- 正文：logical source、version、URI、hash 和格式化 locator。

Vault 不复制 raw source body。原始资料仍只属于不可变 Raw Source Store。

### manifest.json

Manifest 只保存 contract version、Project/Graph identity、`graphUpdatedAt` 和 entity ID → path 映射。Canonical payload 位于 Markdown frontmatter，不在 manifest 再复制一套 node/edge/source 数据。

## 导回治理

导回流程：

```text
ZIP CRC/path/size 校验
→ manifest 与 frontmatter identity 校验
→ node/edge/source/anchor/locator 引用完整性校验
→ 与当前 canonical graph 做 compare-and-swap 差异
→ 无差异：返回 unchanged
→ 有差异：生成 pending CandidateGraphPatch
→ 用户接受后写入 KnowledgeGraph
```

Contract v1 允许：

- 修改 node title、summary、tags 和 scope；生成 `revise_node`。
- 修改现有 relation 或新增 relation；生成 `link_nodes`。

Contract v1 明确拒绝：

- 修改 node identity、kind、status、epistemic status、temporal validity、source refs、creator/archive history。
- 修改 Source 或 SourceAnchor metadata、content hash、locator 或 quote。
- 通过删除 note/edge 静默删除或归档 canonical knowledge。
- 新建 node；需要产品先定义 Wiki 新节点的来源、creator 和 scope 交互。
- 导入另一个 Project/Graph 的 vault。

这些限制不是 Markdown 能力限制，而是当前 Graph Patch operation vocabulary 与治理 UI 的安全边界。后续若支持 Wiki 新建/删除 node，必须分别映射为受审查的 `create_node` / `archive_node`，不能把文件系统删除直接解释为用户决策。

## Obsidian 兼容性

- 所有知识页是普通 `.md` 文件。
- 关系和来源使用 vault-root-relative `[[wikilink|alias]]`。
- Frontmatter 的结构化值使用 JSON-compatible YAML，Obsidian 可保留并由 AlphaAiGraph 精确解析。
- 解压 `.obsidian.zip` 后可直接“Open folder as vault”。
- `.obsidian/` 本地 UI 配置不属于导出 contract；导回时忽略 manifest 未引用的额外文件。

## 测试门禁

- 数组重排仍产生完全相同的 vault 和 ZIP。
- ZIP encode/decode 保持逐字节一致并验证 CRC/path budget。
- Project、node、edge、Source、SourceAnchor 和 locator 完整 round-trip。
- 无差异导回不创建 Patch。
- node 可编辑字段只创建 pending Patch，接受前 graph 不变。
- Source/locator/protected field 篡改被拒绝。
- 工作台能下载 ZIP 并把同一 vault 导回为 unchanged。
