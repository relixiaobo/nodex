# Sync Architecture Plan

> 状态: **规划中** | 创建: 2026-02-22 | 最后更新: 2026-02-22

## 目标

为 Nodex 规划从"纯本地"到"云端实时协作"的渐进式同步架构。
当前阶段（Phase 0）继续打磨本地功能，同时做好客户端架构预留。

---

## 核心决策

### 已确定

| 决策 | 结论 | 依据 |
|------|------|------|
| 本地数据引擎 | Loro CRDT (LoroDoc + LoroTree) | 已完成迁移，所有操作同步，支持富文本 Peritext marks |
| 同步方式 | Loro 原生增量同步（snapshot + updates） | 不走 Supabase 行级同步。CRDT 管内容冲突，SQL 管元数据/权限 |
| Auth | Supabase Google OAuth | 已实现。JWT 可移植，不绑定 sync 层 |
| 同步协议 | 采用 `loro-dev/protocol` 官方线协议 | 已有 WebSocket 客户端/服务端、room 复用、E2E 加密、auth hook |
| Awareness | 已有 `awareness.ts` + 未来 `LoroEphemeralAdaptor` | presence 不落库，与持久 update 分通道 |

### 延后决策（各 Phase 开始时再定）

| 决策 | 时机 | 选项 |
|------|------|------|
| Blob 存储 | Phase 1 | Supabase Storage（集成简单） vs Cloudflare R2（零出口费） |
| 同步网关 | Phase 2 | Supabase Edge Functions vs Cloudflare Workers |
| 实时层 | Phase 3 | `loro-websocket` SimpleServer vs Cloudflare Durable Objects vs PartyKit |
| 全套方案 vs 自建 | Phase 2 | `@loro-extended` 适配器 vs 基于 `loro-protocol` 自建 |

---

## 当前架构（Phase 0）

```
用户操作
  ↓
node-store.ts (Zustand 薄 wrapper)
  ↓
loro-doc.ts (LoroDoc 单例，同步操作)
  ↓
loro-persistence.ts (IndexedDB 全量快照，1.5s 防抖)
```

### 已具备的 Sync 原语

| 能力 | API | 位置 |
|------|-----|------|
| 增量导出 | `doc.export({ mode: "update", from: vv })` | `loro-doc.ts:exportFrom()` |
| 版本向量 | `doc.oplogVersion()` | `loro-doc.ts:getVersionVector()` |
| 全量快照 | `doc.export({ mode: "snapshot" })` | `loro-doc.ts:exportSnapshot()` |
| 增量导入 | `doc.import(bytes)` | `loro-doc.ts:importUpdates()` |
| 文档分支 | `doc.fork()` | `loro-doc.ts:forkDoc()` |
| 版本历史 | `doc.getAllChanges()` | `loro-doc.ts:getVersionHistory()` |
| Time Travel | `doc.checkout(frontiers)` | `loro-doc.ts:checkout()` |
| Awareness | 完整 cursor/selection/user 状态 | `awareness.ts` |
| Detached 守卫 | `canApplyMutation()` | `loro-doc.ts` |

### 当前缺口（Phase 0 准备项）

详见下方 §Phase 0 准备工作。

---

## Loro Sync 生态（调研结果）

Loro 官方和社区提供了三层同步基础设施：

### Tier 1: `loro-crdt` — 核心原语

已安装（`1.10.6`）。提供 `export/import/subscribeLocalUpdates/VersionVector` 等底层 API。

### Tier 2: `loro-dev/protocol` — 官方线协议 + 最小服务端

- `loro-protocol`: 传输层无关的线协议编解码
- `loro-websocket`: WebSocket 客户端 + `SimpleServer`
- `loro-adaptors`: `LoroAdaptor`（持久数据）+ `LoroEphemeralAdaptor`（presence）

特性：
- 单 WebSocket 连接复用多个 room
- 256KB 消息自动分片/重组
- E2E 加密支持（AES-GCM，`EloAdaptor`）
- 内置 auth hook（`authenticate` 回调返回 `'read' | 'write' | null`）
- Rust 版服务端（可选 SQLite 持久化）

```typescript
// 服务端
const server = new SimpleServer({
  port: 8787,
  authenticate: async (roomId, crdt, auth) => "write",
  onLoadDocument: async (roomId, crdt) => loadFromStorage(roomId),
  onSaveDocument: async (roomId, crdt, data) => saveToStorage(roomId, data),
  saveInterval: 60_000,
});

// 客户端
const client = new LoroWebsocketClient({ url: "ws://..." });
await client.waitConnected();
const adaptor = new LoroAdaptor();
const room = await client.join({ roomId: "ws-123", crdtAdaptor: adaptor });
```

### Tier 3: `@loro-extended/*` — SchoolAI 全套引擎（第三方）

提供 IndexedDB/Postgres/LevelDB 存储适配器 + SSE/WebSocket/WebRTC 网络适配器 + React hooks (`useDocument`, `usePresence`)。作为参考架构有价值，但第三方维护，生产就绪度未知。

### `@loro-dev/peer-lease` — PeerID 安全复用

通过 Web Locks API 管理跨 Tab 的 PeerID 分配。Nodex 的 Chrome Side Panel 同一时间只有一个实例，可以不用此包，但知道有这个选项。

---

## Loro 关键 API 速查

### PeerID 管理

```typescript
// 构造函数不接受 peerID 参数，始终随机生成
const doc = new LoroDoc();

// 构造后设置（必须在任何操作之前）
doc.setPeerId(savedPeerId);  // 接受 number | bigint | `${number}`

// 读取
doc.peerIdStr;  // `${number}` 格式字符串
doc.peerId;     // bigint
```

**安全规则**：
- 绝不允许两个并行 peer 共享同一 PeerID（会导致文档分叉）
- Chrome Side Panel 单实例，可安全复用 PeerID（保存/恢复模式）

### VersionVector 序列化

```typescript
// 二进制（网络传输用）
const bytes = vv.encode();              // → Uint8Array
const restored = VersionVector.decode(bytes);

// JSON（存储/调试用）
const map = vv.toJSON();                // → Map<PeerID, number>
const restored = VersionVector.parseJSON(map);
```

### 增量同步（两轮交换）

```typescript
// 1. B 告诉 A 自己的版本
const vvB = docB.oplogVersion().encode();

// 2. A 导出 B 缺少的增量
const delta = docA.export({ mode: "update", from: VersionVector.decode(vvB) });

// 3. B 导入增量
docB.import(delta);
```

### 实时本地更新流

```typescript
// 每次本地操作自动触发，bytes 可直接发送给 peer
const unsub = doc.subscribeLocalUpdates((bytes: Uint8Array) => {
  ws.send(bytes);  // 或 buffer 到 pending queue
});
```

### Shallow Snapshot（历史截断）

```typescript
// 截断旧历史，只保留当前状态
const compacted = doc.export({
  mode: "shallow-snapshot",
  frontiers: doc.oplogFrontiers()
});
// 加载时间: 0.37ms（vs 全量快照 1ms，vs 完整文档 16ms）
```

约束：shallow snapshot 之后无法导入与截断点并发的 updates，只能导入严格在其之后的 updates。

### Blob 元数据检查

```typescript
import { decodeImportBlobMeta } from 'loro-crdt';
// 服务端不需要加载完整文档就能检查版本信息
const meta = decodeImportBlobMeta(blob, true);
// meta.mode, meta.startFrontiers, meta.changeNum, etc.
```

---

## Chrome 扩展同步约束

| 约束 | 应对 |
|------|------|
| SW 空闲 30s 后终止，无法维持长连接 | WebSocket 放 Side Panel（打开时持久），不放 SW |
| SW 重启丢失内存状态 | sync 状态持久化到 IndexedDB |
| 无 Background Sync API | `chrome.alarms`（最短 1 分钟间隔）触发批量 HTTP 同步 |
| `unlimitedStorage` 权限 | 豁免配额 + 不被清除（即使用户清浏览数据） |
| Side Panel 同一时间只有一个实例 | 不需要多 Tab 协调（BroadcastChannel），简化 PeerID 管理 |

**同步生命周期**：
1. Side Panel 打开 → WebSocket 连接 → 实时同步
2. Side Panel 关闭 → 断开 WebSocket → pending 状态写 IndexedDB
3. `chrome.alarms` 定期唤醒 SW → HTTP 批量同步 pending updates
4. Side Panel 重新打开 → 读 IndexedDB → 重连 WebSocket → delta sync

---

## 竞品参考

| 产品 | 架构 | 要点 |
|------|------|------|
| **Linear** | LWW + 单调 sync ID，无 CRDT | 证明非富文本场景不需要 CRDT；10K 用户 $80/月 |
| **Figma** | 自定义 CRDT-ish，服务端权威 | 100 万 tombstone 触发 compaction，文件减 90% |
| **Notion** | 文本用 Peritext CRDT，属性用 LWW | 2025.8 上线离线，页面级动态迁移到 CRDT |

**对 Nodex 的启示**：Loro 的 LoroText + Peritext marks 正好覆盖了富文本协同编辑——CRDTs 真正不可替代的场景。对节点树结构，Loro 的 LoroTree（Kleppmann 2021 并发安全移动算法）是加分项而非必需项。整体来说，Loro 全量 CRDT 是合理选择。

---

## 分阶段计划

### Phase 0: 本地优先 + Sync 预留（当前）

**目标**：继续打磨本地功能，做好 4 项客户端准备。

#### 准备项 1: PeerID 持久化

**问题**：每次 `initLoroDoc()` 创建 `new LoroDoc()` 生成随机 PeerID。同一设备每次重启都变成"新用户"，版本向量不断膨胀。

**方案**：保存 `peerIdStr` 到 IndexedDB，下次启动时 `doc.setPeerId()` 恢复。

```typescript
// loro-persistence.ts — 扩展存储格式
interface SnapshotRecord {
  snapshot: Uint8Array;
  peerIdStr: string;           // doc.peerIdStr — 设备身份
  versionVector: Uint8Array;   // doc.oplogVersion().encode()
  savedAt: number;
}

// loro-doc.ts initLoroDoc() — 恢复 peer 身份
const saved = await loadSnapshotRecord(workspaceId);
doc = new LoroDoc();
if (saved?.snapshot) doc.import(saved.snapshot);
if (saved?.peerIdStr) doc.setPeerId(saved.peerIdStr);
```

#### 准备项 2: VersionVector 持久化

**问题**：VV 只在内存中。重启后无法计算"上次同步以来的增量"。

**方案**：与 snapshot 一起保存到 IndexedDB（见上方 `SnapshotRecord`）。

#### 准备项 3: `subscribeLocalUpdates` hook 点

**问题**：当前没有捕获增量 updates 的机制。未来 sync 需要知道"哪些操作还没上传"。

**方案**：在 `initLoroDoc()` 末尾注册，Phase 0 为 no-op。

```typescript
// loro-doc.ts initLoroDoc() 末尾
doc.subscribeLocalUpdates((_bytes: Uint8Array) => {
  // Phase 0: no-op，仅预留入口
  // Phase 2+: syncManager.bufferUpdate(bytes)
});
```

#### 准备项 4: Workspace ID 规范化 + unlimitedStorage

**问题**：未登录时 `workspaceId = 'ws_default'`，不唯一，无法区分不同用户的离线数据。

**方案**：

```typescript
// 未登录用户：生成持久化唯一 ID，不再用 'ws_default'
const wsId = (await chromeStorage.get('defaultWorkspaceId'))
  ?? (() => { const id = `ws_${nanoid()}`; chromeStorage.set('defaultWorkspaceId', id); return id; })();
```

同时在 `manifest.json` 中添加 `unlimitedStorage` 权限。

### Phase 1: 云备份

**目标**：自动上传 Loro snapshot，新设备可恢复。单向备份，非实时同步。

**架构**：

```
LoroDoc → IndexedDB (本地)
       → HTTP POST snapshot → 服务端 (对象存储)

新设备启动 → HTTP GET snapshot → doc.import()
```

**服务端最小 Schema**：

```
对象存储:
  /{workspaceId}/snapshot.bin        ← 最新快照

Postgres (元数据):
  workspace_backups (
    workspace_id TEXT PRIMARY KEY,
    snapshot_key  TEXT,              -- 对象存储 key
    version_vector BYTEA,           -- 快照对应的 VV
    size_bytes    INTEGER,
    updated_at    TIMESTAMPTZ
  )
```

**触发时机**：
- 手动：用户点击"备份"按钮
- 自动：每 N 分钟（如果有变更）

**基础设施选择（Phase 1 开始时决定）**：
- 简单路线：Supabase Storage + Edge Function
- 性能路线：Cloudflare R2 + Worker

### Phase 2: 多端同步（非实时）

**目标**：多设备间自动同步，基于增量 updates，HTTP 推拉。

**架构**：

```
LoroDoc
  ├── subscribeLocalUpdates → pending queue (IndexedDB) → HTTP push
  └── On open → HTTP pull → doc.import()

服务端:
  对象存储: /{wsId}/updates/{seq}.bin (append-only)
  对象存储: /{wsId}/snapshot.bin (定期 compaction)
  Postgres: sync_cursors (workspace_id, device_id, last_seq)
```

**同步协议（基于 loro-protocol 线格式）**：

```
POST /sync/push
  Body: { workspaceId, updates: Uint8Array, clientVV: Uint8Array }
  → 服务端存 update，更新 cursor
  ← { serverVV, ack: true }

POST /sync/pull
  Body: { workspaceId, clientVV: Uint8Array }
  ← { updates: Uint8Array[], serverVV: Uint8Array }
  → 客户端 doc.import() 每个 update
```

**幂等保证**：
- 每个 update 附带 `client_update_hash`（SHA-256），服务端去重
- `seq` 单调递增，客户端通过 `last_seq` cursor 拉取
- 断网重试安全（同一 update 多次上传 = 幂等）

**Compaction 策略**：
- 当 update log 超过 N 条（如 1000）或总大小超过 M MB
- 服务端加载 snapshot + 所有 updates → 导出新 snapshot（或 shallow-snapshot）→ 清理旧 updates
- 参考 Figma：100 万 tombstone 触发 compaction

**客户端同步状态机**：

```
                    ┌──────────┐
         ┌─────────│ local-only│ (Phase 0 / 未登录)
         │         └──────────┘
         │ login + enable sync
         ▼
    ┌─────────┐  push/pull  ┌────────┐
    │ syncing  │ ──────────→│ synced │
    └─────────┘             └────────┘
         │                       │
    network error           has local changes
         ▼                       ▼
    ┌─────────┐             ┌─────────┐
    │  error  │             │ pending │
    └─────────┘             └─────────┘
         │                       │
    retry/reconnect         push succeeds
         └───────→ syncing ←─────┘
```

### Phase 3: 实时协作

**目标**：多用户同时编辑，实时广播 + presence。

**架构**：

```
Side Panel open:
  loro-websocket client → WebSocket → 服务端 (SimpleServer / Cloudflare DO)
  LoroAdaptor (持久数据) + LoroEphemeralAdaptor (presence)

Side Panel closed:
  chrome.alarms → HTTP batch sync (降级为 Phase 2 模式)
```

**关键原则**：
- **先持久化，再广播**：服务端收到 update → 写存储 → 成功后才广播给其他 peer
- **广播带 seq**：客户端检测 gap 自动补拉
- **Presence 不落库**：光标/选区通过 `LoroEphemeralAdaptor` 传输，不写持久存储
- **连接级权限校验**：权限变更时踢断 WebSocket
- **Payload 限制**：单条 update 上限（如 1MB），防止恶意/异常客户端

**基础设施选择（Phase 3 开始时决定）**：
- 简单路线：`loro-websocket` SimpleServer（Node.js/Deno）
- 扩展路线：Cloudflare Durable Objects（每文档一个 DO，内置 SQLite）
- 托管路线：PartyKit（已被 Cloudflare 收购，DO 的高级封装）

### Phase 4: 权限与共享

**目标**：workspace 成员角色、文档级权限、审计与恢复。

**架构**：
- Postgres: `workspace_members (workspace_id, user_id, role)`
- Auth hook: `loro-websocket` 的 `authenticate` 回调检查权限
- 审计：保留 update log + snapshot 恢复工具
- 角色：owner / editor / viewer

---

## 现有 Supabase 资产处理

| 资产 | 处理 | 理由 |
|------|------|------|
| Supabase Auth (Google OAuth) | **保留** | JWT 可移植，不绑定 sync 层 |
| Supabase Postgres | **保留，用于元数据** | workspace 成员、sync cursors、权限、billing |
| `nodes` 表 (5 个 migration) | **冻结，不继续开发** | 为行级同步设计，CRDT sync 不需要。未来可降级为搜索索引 |
| RLS 策略 | **保留** | workspace 级别权限模型可复用 |
| Realtime publication | **暂不使用** | 行级变更流不适合 CRDT sync；Phase 3 评估是否用于 presence 通知 |

---

## 风险清单

### Phase 1-2 (同步)

| 风险 | 缓解措施 |
|------|---------|
| 幂等与重复上传（断网重试） | `client_update_hash` 去重 |
| snapshot 与 update 边界错位 | `seq/cursor` 单调递增 + `snapshot.covers_seq` |
| 本地 pending queue 损坏 | pending queue 持久化到 IndexedDB + 启动重放 |
| Auth 过期误以为数据丢失 | 明确 UI 状态区分"认证过期"vs"数据丢失" |
| 对象存储与 Postgres 部分写入成功 | 先写对象存储 → 成功后更新 Postgres |
| 可观测性不足 | 最小同步埋点（push/pull/apply/cursor mismatch） |

### Phase 2+ (成长期)

| 风险 | 缓解措施 |
|------|---------|
| update log 过长导致冷启动慢 | 定期 shallow-snapshot compaction |
| 成本增长（存储/出口流量） | 增量优先；快照仅首次/落后很多时使用 |
| 协议升级兼容性 | 协议版本化（`protocolVersion` 字段） |
| 搜索需求但内容在 CRDT blob 里 | 单独建搜索索引层（从 CRDT 投射到行存储） |

### Phase 3 (协作期)

| 风险 | 缓解措施 |
|------|---------|
| 权限变更后连接仍可写 | 权限动态校验 + 踢连接 |
| Presence 混入持久 update log | presence 与持久更新分通道（不落库） |
| 恶意客户端发送超大 update | payload 限制 + rate limit |
| 广播时序与持久化不一致 | 先持久化成功，再广播 |
| CRDT 正确但 UX 不满意 | 多人同点编辑需 UX 层补偿（冲突高亮、用户光标） |

---

## 参考资料

### Loro 官方
- [loro-crdt npm](https://www.npmjs.com/package/loro-crdt) — v1.10.6
- [loro-dev/protocol](https://github.com/loro-dev/protocol) — 官方同步协议
- [loro-dev/peer-lease](https://github.com/loro-dev/peer-lease) — PeerID 安全复用
- [Loro Sync Tutorial](https://loro.dev/docs/tutorial/sync)
- [Loro Encoding Modes](https://loro.dev/docs/tutorial/encoding)
- [Loro Shallow Snapshot](https://loro.dev/docs/advanced/shallow_snapshot)
- [Loro Version Deep Dive](https://loro.dev/docs/advanced/version_deep_dive)
- [Loro PeerID Management](https://loro.dev/docs/concepts/peerid_management)

### 社区
- [SchoolAI/loro-extended](https://github.com/SchoolAI/loro-extended) — 全套同步引擎
- [typeonce-dev/sync-engine-web](https://github.com/typeonce-dev/sync-engine-web) — Loro + React 同步

### 竞品分析
- [Reverse engineering Linear's sync engine](https://github.com/wzhudev/reverse-linear-sync-engine)
- [How Figma's multiplayer works](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/)
- [How Notion made offline available](https://www.notion.com/blog/how-we-made-notion-available-offline)
- [Architectures for Central Server Collaboration (Weidner 2024)](https://mattweidner.com/2024/06/04/server-architectures.html)

### 基础设施
- [Cloudflare Durable Objects + SQLite](https://blog.cloudflare.com/sqlite-in-durable-objects/)
- [Cloudflare R2 Pricing](https://developers.cloudflare.com/r2/pricing/)
- [Chrome Extension Storage](https://developer.chrome.com/docs/extensions/mv3/storage-and-cookies)
- [Chrome MV3 Service Worker Lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
