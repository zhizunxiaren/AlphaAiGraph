# AlphaAiGraph 数百节点搜索评估

> 日期：2026-07-15  
> 结论：**规划 BM25 接入；暂不引入 embedding、hybrid search 或向量数据库。**

## 目标

在不预设技术方案的前提下，回答两个问题：

1. 当前可解释 lexical search 在数百节点中文/英文混合知识上是否足够？
2. BM25、multilingual embedding 或 BM25 + embedding hybrid 是否带来足够质量收益，值得增加产品复杂度？

本评估只建立可复现的离线证据，不修改生产搜索默认行为。搜索产品接入继续放在既有搜索优化 TODO 中。

## 方法

### 语料

- 来源：仓库 `docs/` 下 7 份真实产品研究、产品理念、领域模型和 UX 规格 Markdown。
- 切分：按 Markdown heading 保留层级，再按最多 360 字切片；没有合成、复制或伪造正文。
- 规模：320 个 KnowledgeNode-shaped 检索节点。
- 检索字段：title、summary、heading path tags、kind 和 source quote。

### 查询与相关性

- 15 条人工编写的中文产品问题。
- 7 条 calibration query 只用于选择 hybrid 权重。
- 8 条 evaluation query 只用于最终报告。
- 每条查询使用 1/2/3 级显式相关性判断；算法不参与标签生成。
- 指标：Recall@10、MRR@10、nDCG@10、mean latency、P95 latency。

### 对比方案

1. `production_lexical`：与当前生产全文搜索完全相同的规范化、字段加权和子串匹配。
2. `BM25`：`k1=1.2`、`b=0.75`，title boost 2；中英文确定性 tokenizer 对连续汉字生成 unigram/bigram。
3. `embedding`：Transformers.js 本地 CPU feature extraction，mean pooling + normalization。
4. `hybrid`：BM25 与 embedding 通过 Reciprocal Rank Fusion 合并，不混合不可比较的原始分数。

Hybrid 在 calibration 集上比较 BM25 权重 0.25、0.5、0.75，最终选择 0.75 BM25 + 0.25 embedding：

| BM25 权重 | Recall@10 | MRR@10 | nDCG@10 |
| ---: | ---: | ---: | ---: |
| 0.75 | 0.524 | 0.468 | 0.466 |
| 0.50 | 0.524 | 0.454 | 0.454 |
| 0.25 | 0.393 | 0.440 | 0.380 |

### Embedding runtime

- Runtime：`@huggingface/transformers@4.2.0`（devDependency，不进入生产入口）。
- Model：`Xenova/paraphrase-multilingual-MiniLM-L12-v2`。
- Revision：`2c4055b12046f11709e9df2c122e59ffbdc2f900`。
- Dtype：q8。
- 模型文件只进入用户缓存，不写入仓库。

### 运行环境

- Windows x64，Node.js v24.15.0。
- Intel 2.90 GHz，48 logical cores，112 GiB RAM。
- 所有 evaluation retriever 串行运行，避免共享 CPU 推理污染 latency。

## Evaluation 结果

| 方案 | Recall@10 | MRR@10 | nDCG@10 | Mean latency | P95 latency |
| --- | ---: | ---: | ---: | ---: | ---: |
| Production lexical | 0.104 | 0.150 | 0.126 | 45.75 ms | 68.91 ms |
| **BM25** | **0.646** | **0.682** | **0.626** | **1.11 ms** | **1.93 ms** |
| Multilingual embedding | 0.396 | 0.344 | 0.294 | 25.19 ms | 27.17 ms |
| BM25 0.75 + embedding 0.25 | 0.625 | 0.550 | 0.517 | 24.72 ms | 28.34 ms |

额外启动成本：固定 revision 的 cold model load 约 142 秒，320 节点 embedding index build 约 32 秒。它们不计入单查询 latency，但会影响首次启动、缓存管理和索引更新体验。

## 观察

- BM25 相对 production lexical 的 nDCG@10 从 0.126 提升到 0.626，Recall@10 从 0.104 提升到 0.646，同时 P95 从 68.91 ms 降到 1.93 ms。当前 lexical 在多词中文查询上容易因严格整句/子串匹配返回空结果。
- Embedding 在“证据不足应输出什么”和“证据靠近决策”等语义问题上有优势，但在并行审核隔离、Project reopen、旁路探索和 Obsidian 等精确领域概念上不稳定。
- Hybrid 恢复了部分 embedding 召回，但整体 nDCG、MRR 仍低于 BM25，并增加模型加载、索引、缓存和约 23 ms P95 查询成本。
- BM25 的最佳结果仍不完美：Project reopen、证据靠近决策等查询需要更完整的相关性标签、字段权重或 query analysis。

## 决策门槛与结论

本次预先使用以下门槛：

- 候选相对当前基线的 nDCG@10 至少提升 0.05，或 Recall@10 至少提升 0.10。
- BM25 在 320 节点上的 P95 不高于 100 ms。
- Hybrid 必须在 BM25 之上再满足同样的质量增益，且 P95 不高于 250 ms，才值得评估产品接入。

结果：

- BM25 通过质量和 latency 门槛。
- Hybrid latency 通过，但没有超过 BM25 的质量门槛。
- Embedding 单路质量也低于 BM25。

因此：

1. 在既有搜索优化 TODO 中规划 BM25 index、增量更新、Project scope/filter 和 UI explainability 接入。
2. 当前阶段不把 benchmark BM25 直接替换成生产搜索，避免绕过产品验收和大图增量索引设计。
3. 暂不引入 embedding 持久化、向量数据库或 hybrid production path。
4. 收集至少 50 条真实用户查询及人工判断，并增加跨语言/同义词查询后，再重新评估 embedding。

## 可复现命令

```powershell
npm run benchmark:search
```

首次执行需要访问 Hugging Face；模型下载后使用本地缓存。普通 `npm test` 只验证 320 节点语料、相关性规则和评估器，不执行模型 benchmark。

## 局限

- 语料来自单一仓库产品域，不代表通用知识库。
- 15 条查询规模较小；evaluation split 防止直接调参，但不能替代真实用户日志。
- 相关性判断由当前开发者视角建立，可能遗漏同样相关的章节。
- 只测试一个多语言 embedding 模型、一个量化配置和 CPU runtime。
- 未测量长期模型缓存大小、峰值内存、增量 embedding 更新和多 Project 权限过滤。
