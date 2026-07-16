# AlphaAiGraph 大图渐进加载与性能预算

> 日期：2026-07-15  
> 命令：`npm run benchmark:graph`  
> 环境：Windows 10 64-bit、Node.js v24.15.0、Intel 2.90 GHz CPU  
> 目的：为阶段 6 的渐进投影、局部布局和查询索引建立可复现基线与产品预算。

## 结论

生产画布不再按数组尾部截取节点，而是从 canonical `KnowledgeGraph` 派生 Project-scoped 局部投影。首屏显示 24 个节点，用户每次显式展开 12 个，最大显示 48 个节点与 96 条关系；达到上限后保留完整图谱与 Context Packet，只限制画布投影。

查询层按 Project scope、归档策略和关系过滤建立只引用 canonical node/edge 的邻接索引。缓存同时受 graph 对象、`graph.updatedAt`、node/edge count 和 scope signature 约束；图发生变化或 scope 改变后不会复用旧索引。节点分页 cursor 同时绑定 `graph.updatedAt` 与 scope，变化后明确过期。

在 3,000 节点、9,000 边场景，局部邻域、最短路径、cluster、渐进投影、局部布局和 48 节点 React 静态渲染均达到预算。全 Project Context Packet P95 为 24.14 ms，仍保持完整语义，不因画布虚拟化缩小 Agent 上下文。

## 数据与方法

`createLargeKnowledgeGraphFixture` 生成确定性连通图，节点数分别为 320、1,000、3,000，目标无向平均度分别为 3、4、6；对应边数为 480、2,000、9,000。所有节点属于同一 Project，包含稳定三叉 `contains` 骨架与确定性 `related_to` 关系。

每个操作先单独预热一次，再串行测量 7 次，报告 mean 与 P95，避免并发运行污染 latency。测试分离以下成本：

- fixture/build 与 scoped adjacency index 首次构建；
- scope、局部邻域、最短路径、weak connected components；
- local 与 whole Project `KnowledgeSelection`；
- 工作台 insights 派生；
- 24 节点渐进投影、48 节点局部布局；
- 48 节点/最多 96 边 React `renderToStaticMarkup` 成本。

React 指标是稳定的框架渲染近似，不包含浏览器 paint、字体和 GPU 合成；真实浏览器交互仍应在目标设备上观察长任务和掉帧。

内存以完整 workspace 的 JSON UTF-16 长度乘 2 作为保守、可重复的序列化体量估计。3,000 节点场景约 6.33 MB；索引不复制 node/edge 内容，只保存 map、array 和 canonical 引用。

## 优化前基线

| 节点 / 边 | 邻域 80 P95 | 最短路径 P95 | Cluster P95 | Local Selection P95 | Whole Project Selection P95 | Workspace Insights P95 | 估算快照 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 320 / 480 | 1.43 ms | 0.65 ms | 11.32 ms | 0.63 ms | 0.44 ms | 1.07 ms | 0.52 MB |
| 1,000 / 2,000 | 4.52 ms | 36.99 ms | 143.27 ms | 1.15 ms | 3.34 ms | 1.92 ms | 1.78 MB |
| 3,000 / 9,000 | 27.49 ms | 27.01 ms | 1,981.77 ms | 5.01 ms | 36.10 ms | 6.66 ms | 6.33 MB |

根因是每次 BFS 展开节点都会重新扫描整张边表，cluster 因此接近 `O(VE)`；画布没有可复用查询索引或明确的可见预算。

## 优化后结果

| 节点 / 边 | Index build | 邻域 80 P95 | 最短路径 P95 | Cluster P95 | Whole Project Selection P95 | 渐进投影 P95 | 局部布局 P95 | React 48 P95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 320 / 480 | 2.15 ms | 0.20 ms | 0.05 ms | 2.05 ms | 0.49 ms | 0.52 ms | 0.07 ms | 5.13 ms |
| 1,000 / 2,000 | 3.20 ms | 0.25 ms | 0.73 ms | 4.90 ms | 2.80 ms | 1.73 ms | 0.10 ms | 10.65 ms |
| 3,000 / 9,000 | 11.33 ms | 0.90 ms | 0.15 ms | 15.65 ms | 24.14 ms | 3.24 ms | 0.06 ms | 11.37 ms |

3,000 节点下，cluster P95 从约 1.98 s 降至 15.65 ms，邻域查询从 27.49 ms 降至 0.90 ms。首次索引构建为 11.33 ms，后续局部操作复用同一 scope 索引。

## 产品预算

| 项目 | 预算 | 超限行为 |
| --- | ---: | --- |
| 首屏可见节点 | 24 | 只渲染局部投影，显示完整 scoped 总数 |
| 单次展开 | +12 节点 | 重新派生局部投影和布局，不写回 graph |
| 最大可见节点 / 边 | 48 / 96 | 停止扩展画布，保留选择、搜索、分页与 Context Packet |
| Scoped index 首次构建 P95 | ≤ 50 ms @ 3,000/9,000 | 后续应迁移到 worker 或空闲任务 |
| 选择节点、展开一层、切换视图组合投影 P95 | ≤ 50 ms | 维持旧投影并提示处理中 |
| 局部查询 P95 | ≤ 16 ms | 减少可见增量，不缩小 Agent scope |
| 局部布局 P95 | ≤ 16 ms | 保留旧位置，延后重新布局 |
| 单次主线程任务 | ≤ 50 ms | 拆分 index/projection/render 阶段 |
| 3,000/9,000 workspace 序列化体量 | ≤ 8 MB | 提示拆分 Project scope；不复制 canonical node |

索引与投影失效以 `graph.updatedAt` 为版本边界；Candidate Patch 接受后产生新 graph，拒绝时主图版本不变。局部布局是纯派生位置，不进入 `KnowledgeGraph`、`KnowledgeView` 或持久化文档。

## 已知边界

- 当前规模上限以 3,000 节点/9,000 边为验收对象，不代表 30,000 节点已达标。
- React 指标未覆盖浏览器 paint；后续应在低端设备采集 Performance timeline。
- whole Project Context Packet 仍会物化全部 node ID，这是保证用户显式上下文语义的选择；超过当前规模后应考虑流式 provider input，而不是静默截断。
- 当前布局是稳定的局部径向布局，没有把坐标写回主数据；密集 48 节点视图优先保证可操作和确定性，不声称是全局最优布局。
