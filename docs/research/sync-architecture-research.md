# Nodex 同步架构调研报告

> 调研目标：为 Nodex 选择最佳的同步/离线/冲突解决架构。
> 约束前提：不限定 Supabase，一切以项目最佳实践为准。
> 核心特征：树形数据（Everything is a Node）、Chrome Side Panel、需要离线支持。

## 1. Nodex 的核心需求

| 需求 | 优先级 | 说明 |
|------|--------|------|
| 树操作正确性 | P0 | children 有序列表、move（indent/outdent/drag-drop）、createChild/trash 不能产生空白/幽灵/循环节点 |
| 离线可用 | P0 | Chrome 侧栏随时打开，网络状态不可控。断网时完整读写，恢复后自动同步 |
| 多端同步 | P1 | 同一用户在多个标签页/设备上操作。非实时协作（暂不需要多光标） |
| 低实现复杂度 | P1 | 1-2 人团队，不能花 6 个月实现同步引擎 |
| 即时响应 | P1 | 所有操作本地优先，0ms 感知延迟 |
| 数据所有权 | P2 | 用户数据不被锁定在特定供应商 |
| 未来协作扩展 | P3 | 将来可能支持多用户实时协作 |

## 2. 候选方案概览

### 方案 A：Supabase + Client ID Echo Filter（当前改进版）

**架构**：保持现有 Supabase 后端，改用 Client ID（而非 User ID）标记写入来源。Realtime handler 过滤掉自身 client 的回显。

**离线**：chrome.storage.local 或 IndexedDB 缓存 + 自实现 mutation queue。

**冲突解决**：Last-Write-Wins（Supabase 默认）。children 数组级别的覆盖，无法合并并发 children 修改。

| 维度 | 评价 |
|------|------|
| 树操作安全 | **弱** — children 是 TEXT[] 列，LWW 覆盖整个数组。并发 addChild 会丢失 |
| 离线支持 | **需自建** — Supabase 无内置离线。需手写 mutation queue + 重连回放 |
| 多端同步 | **可行** — Client ID 区分同用户不同端 |
| 实现复杂度 | **中** — echo filter 简单，但离线 queue + 重连逻辑需要自建 |
| 数据所有权 | **好** — PostgreSQL，随时迁移 |
| 协作扩展 | **差** — LWW 无法安全合并并发操作 |

### 方案 B：Zero (Rocicorp) — Query-Driven Sync

**架构**：Replicache 的继任者。客户端持有 SQLite 副本，通过 ZQL（React hook 形式的查询语言）订阅数据。服务端处理 mutation，客户端乐观更新 + 服务端权威回放。

**离线**：本地 SQLite 副本天然离线可用。

**冲突解决**：服务端权威（server-authoritative）。所有 mutation 在服务端按序执行，客户端的乐观更新会被服务端结果覆盖（rebase）。

| 维度 | 评价 |
|------|------|
| 树操作安全 | **好** — 服务端串行执行 mutation，不会并发覆盖 |
| 离线支持 | **优秀** — 本地 SQLite，天然离线 |
| 多端同步 | **优秀** — 增量同步，query-level 订阅 |
| 实现复杂度 | **中** — 需要写 mutator 和 server-side handler，但同步逻辑由框架处理 |
| 数据所有权 | **好** — PostgreSQL 后端，但依赖 Zero server |
| 协作扩展 | **中** — 服务端串行化可以安全处理并发，但不是真正的 CRDT |

**风险**：Zero 仍处于 alpha/beta 阶段。API 不稳定。PostgreSQL-only。文档不完善。

### 方案 C：Electric SQL + TanStack DB

**架构**：Electric 作为 PostgreSQL 的同步引擎（Shape-based partial replication），TanStack DB 作为客户端响应式存储层（双层状态：synced layer + optimistic layer）。

**离线**：TanStack DB 的本地缓存层 + Electric 的增量同步。

**冲突解决**：TanStack DB 使用 txId-based rebase（类似 Replicache 的 rewind-replay）。Electric 本身用 CRDT merge。

| 维度 | 评价 |
|------|------|
| 树操作安全 | **中** — rebase 机制比 LWW 好，但 children 数组的并发修改仍需自处理 |
| 离线支持 | **好** — TanStack DB 本地缓存，Electric 增量同步 |
| 多端同步 | **好** — Shape-based 部分复制 |
| 实现复杂度 | **中** — 两个库的集成，API 在快速迭代中 |
| 数据所有权 | **好** — PostgreSQL |
| 协作扩展 | **中** — Electric 的 CRDT 合并有基础，但树操作需额外逻辑 |

**风险**：TanStack DB 非常新（2025 年中发布）。Electric + TanStack DB 的组合尚无大规模生产案例。对树结构没有特殊支持。

### 方案 D：Loro CRDT（树原生）

**架构**：Loro 是 Rust 编写的 CRDT 库（通过 WASM 在浏览器运行），**原生支持 Movable Tree** 数据结构。实现了 Kleppmann 论文的树移动算法，使用 Fractional Indexing 处理兄弟节点排序。

**离线**：CRDT 天然离线。本地操作立即生效，合并在重连时自动完成。

**冲突解决**：基于 Kleppmann 的树移动 CRDT 算法 — 自动防止循环、安全处理并发移动、保证所有副本收敛到一致状态。

| 维度 | 评价 |
|------|------|
| 树操作安全 | **优秀** — 唯一原生支持树移动 CRDT 的方案，经形式化验证 |
| 离线支持 | **优秀** — CRDT 天然支持，无需额外机制 |
| 多端同步 | **优秀** — 任意拓扑同步（P2P 或 client-server） |
| 实现复杂度 | **高** — 需要自建同步层（transport + persistence）。Loro 只是 CRDT 引擎，不含网络/存储 |
| 数据所有权 | **优秀** — 纯本地数据，格式开放 |
| 协作扩展 | **优秀** — 天生支持多用户实时协作 |

**风险**：Loro 尚未到 1.0（API 和编码格式不稳定，官方不建议生产使用）。需要自建同步服务和持久化层。WASM bundle 增加约 500KB+。数据模型需要从"节点表"改为"CRDT 文档"范式转换。

### 方案 E：自建 Linear 式同步引擎

**架构**：参考 Linear 的同步方案 — 启动时全量同步（bootstrap），之后通过 WebSocket 接收增量 SyncAction，IndexedDB 作为持久化层。Mutation queue 在离线时缓存，恢复后按序上传。

**离线**：IndexedDB 持久化 + mutation queue。

**冲突解决**：服务端权威。Mutation 在服务端按序执行，冲突由服务端逻辑处理。

| 维度 | 评价 |
|------|------|
| 树操作安全 | **好** — 服务端串行化处理 |
| 离线支持 | **好** — IndexedDB + mutation queue |
| 多端同步 | **好** — WebSocket + 增量更新 |
| 实现复杂度 | **高** — 完全自建，需要实现同步协议、冲突处理、mutation queue、持久化 |
| 数据所有权 | **优秀** — 完全自主 |
| 协作扩展 | **中** — 服务端串行化可扩展为协作，但需要大量额外工作 |

**风险**：工程量最大。Linear 投入了大量工程师和时间来完善这套系统。1-2 人团队不现实。

### 方案 F：PowerSync + PostgreSQL

**架构**：PowerSync 作为同步层，基于 WAL（Write-Ahead Log）监听 PostgreSQL 变更。客户端使用 SQLite 副本。CRUD 操作通过 upload queue 回写服务端。

**离线**：本地 SQLite，天然离线。

**冲突解决**：Last-Write-Wins + 自定义冲突处理函数。

| 维度 | 评价 |
|------|------|
| 树操作安全 | **中** — 默认 LWW，children 并发修改同样有风险。可自定义但需手写逻辑 |
| 离线支持 | **优秀** — 核心卖点 |
| 多端同步 | **好** — 增量同步 |
| 实现复杂度 | **低** — 成熟的 SDK，文档完善 |
| 数据所有权 | **好** — PostgreSQL 后端 |
| 协作扩展 | **弱** — 不是为实时协作设计的 |

**风险**：树操作安全性需要额外工作（自定义冲突函数处理 children 合并）。PowerSync 云服务是付费的。

## 3. Kleppmann 论文的关键洞察

Martin Kleppmann 等人的论文 *"A highly-available move operation for replicated trees"*（IEEE TPDS 2021）直接解决了 Nodex 面临的核心问题：

### 核心问题

并发树移动可能产生**循环**（A 移动到 B 下，同时 B 移动到 A 下）。Google Drive 和 Dropbox 都在并发移动场景下出现过 bug。

### 算法要点

1. **操作日志（OpLog）**：所有操作按因果序排列。新操作到达时可能需要插入到日志中间位置
2. **Undo-Redo 机制**：收到远程操作时，undo 所有更晚的操作 → 插入新操作 → redo 所有操作。每次 redo 时检查是否会产生循环，如果会则**跳过**该操作
3. **循环检测**：move(node, newParent) 执行前检查 newParent 是否是 node 的后代，如果是则该操作变为 no-op
4. **收敛保证**：所有副本最终看到相同的操作日志 → 相同的 undo-redo 序列 → 相同的最终状态

### 性能特征

- 每收到一个远程操作，需要约 200 次 undo-redo（论文数据）
- Loro 的实现做了优化，在大多数实际场景中性能可接受
- 替代方案（如 Evan Wallace 的方法）在检测到循环时只需 1 次操作

### 对 Nodex 的意义

Nodex 的 indent/outdent/drag-drop 都是树移动操作。如果要做**正确的多端同步**，尤其是未来支持多用户协作，Kleppmann 的算法是理论最优解。但如果只是单用户多端，服务端串行化（方案 B/E）已经足够。

## 4. Chrome Extension 特殊考量

| 约束 | 影响 |
|------|------|
| **Service Worker 生命周期** | 随时终止，不能依赖长连接。需要 alarm/wake-up 机制恢复 WebSocket |
| **存储限制** | chrome.storage.local 上限 10MB（需 unlimitedStorage 权限解锁）。IndexedDB 可用更大空间 |
| **CSP 限制** | MV3 严格 CSP，WASM 需要 `wasm-unsafe-eval`（Loro/cr-sqlite 需要） |
| **Side Panel 限制** | 无法控制宽度，UI 必须自适应 |
| **多标签页** | 同一 extension 的多个 Side Panel 实例共享 Service Worker，需要协调 |

**WASM 可行性**：Chrome MV3 支持 `wasm-unsafe-eval` CSP 指令。Loro (WASM) 和 wa-sqlite (WASM) 均可在 Chrome Extension 中运行，但需要在 manifest.json 中声明。

## 5. 方案评分矩阵

| 维度 (权重) | A: Supabase+ | B: Zero | C: Electric+TanStack | D: Loro CRDT | E: Linear式 | F: PowerSync |
|-------------|-------------|---------|----------------------|-------------|------------|-------------|
| 树操作安全 (25%) | 2 | 4 | 3 | **5** | 4 | 3 |
| 离线支持 (25%) | 2 | **5** | 4 | **5** | 4 | **5** |
| 实现复杂度 (20%) | 3 | 3 | 3 | 1 | 1 | **4** |
| 多端同步 (15%) | 3 | **5** | 4 | **5** | 4 | 4 |
| 生产就绪 (10%) | **5** | 2 | 2 | 1 | 3 | **4** |
| 协作扩展 (5%) | 1 | 3 | 3 | **5** | 3 | 2 |
| **加权总分** | **2.65** | **3.85** | **3.30** | **3.70** | **3.05** | **4.00** |

> 评分 1-5，5 最优。加权总分 = Σ(维度分 × 权重)

## 6. 推荐方案

### 首选：方案 F — PowerSync + PostgreSQL（渐进式）

**理由**：

1. **即插即用的离线支持**：PowerSync 的核心价值就是离线优先。本地 SQLite 天然离线，mutation queue 自动处理重连回放
2. **实现复杂度最低**：成熟的 SDK（React/JS），清晰的文档，不需要自建同步层
3. **保留 PostgreSQL**：后端仍是 PostgreSQL，现有 Supabase 数据可平滑迁移
4. **树操作安全的补救方案**：虽然默认 LWW，但可以在 mutation handler 中实现 children 的 operational transform（"先读后写"的服务端逻辑），避免并发覆盖
5. **务实选择**：1-2 人团队能在 1-2 周内完成集成

**树操作安全方案**：
- 客户端 mutation 发送 **操作意图**（"addChild(parentId, childId, position)"），而非 **最终状态**（"children = [a, b, c]"）
- 服务端 mutation handler 原子地执行：读取当前 children → 执行操作 → 写回。串行执行避免并发覆盖
- 这种 "intent-based mutation" 模式在 PowerSync/Replicache/Zero 中都适用

**迁移路径**：
```
Phase 1 (现在): PowerSync + PostgreSQL（替换 Supabase Realtime）
  → 获得离线支持 + 消除 echo 问题
Phase 2 (需要时): 评估是否需要 CRDT（多用户协作场景）
  → 可引入 Loro 或在 PowerSync 之上加 CRDT 逻辑
```

### 备选：方案 B — Zero (等稳定后)

如果 Zero 在 2026 年下半年达到 stable，它会是比 PowerSync 更优雅的方案（query-driven sync + 内置 rebase）。但当前 alpha 状态风险太高。

### 长期理想：方案 D — Loro CRDT（如果要做多用户协作）

如果 Nodex 的方向是 Notion/Tana 级别的多用户实时协作，Loro 的树移动 CRDT 是理论最优。但需要等它到 1.0，且需要投入显著的工程量来构建同步层。

## 7. 不推荐的方案

| 方案 | 原因 |
|------|------|
| A: Supabase 改进版 | 治标不治本。离线要自建，children LWW 覆盖无法根治 |
| E: 自建 Linear 式 | 工程量远超小团队能力。Linear 有专门的同步基础设施团队 |
| C: Electric + TanStack | 两个都太新，组合风险高。对树结构无特殊支持 |

## 8. 参考资料

- [Kleppmann et al. — A highly-available move operation for replicated trees](https://martin.kleppmann.com/papers/move-op.pdf)
- [Loro — Movable tree CRDTs and implementation](https://loro.dev/blog/movable-tree)
- [Matt Weidner — CRDT Survey Part 2: Semantic Techniques](https://mattweidner.com/2023/09/26/crdt-survey-2.html)
- [CodeSandbox crdt-tree (archived TypeScript implementation)](https://github.com/codesandbox/crdt-tree)
- [Sync Engines Compared: ElectricSQL vs Convex vs Zero](https://merginit.com/blog/24082025-sync-engines-guide-electricsql-convex-zero)
- [Hacker News — Movable tree CRDTs discussion](https://news.ycombinator.com/item?id=41099901)
- [Ink & Switch — Local-first software](https://www.inkandswitch.com/essay/local-first/)
- [LogRocket — Offline-first frontend apps in 2025](https://blog.logrocket.com/offline-first-frontend-apps-2025-indexeddb-sqlite/)
- [Zero Sync Engine](https://zerosync.dev)
- [Electric SQL](https://electric-sql.com)
- [PowerSync](https://www.powersync.com)
- [Loro CRDT](https://loro.dev)
