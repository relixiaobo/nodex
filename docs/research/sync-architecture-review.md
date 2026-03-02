# Sync Architecture Review

> 完整梳理 soma 同步逻辑，供 codex review 用。
> 日期：2026-03-03

---

## 1. 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client (Chrome Extension)                 │
│                                                                   │
│  LoroDoc (CRDT)                                                   │
│    ├─ subscribeLocalUpdates() ──► pending-queue (IndexedDB)       │
│    ├─ importUpdatesBatch()    ◄── SyncManager.pull()             │
│    └─ persistSnapshot()       ──► IndexedDB (loro_snapshots)      │
│                                                                   │
│  SyncManager (singleton)                                          │
│    ├─ push(): pending-queue ──► POST /sync/push ──► Server       │
│    ├─ pull(): GET /sync/pull ──► importUpdatesBatch()            │
│    ├─ Triggers: 30s interval / visibilitychange / nudge           │
│    └─ Cursor: IndexedDB (sync_cursors)                           │
│                                                                   │
│  WorkspaceStore (Zustand)                                         │
│    ├─ signInWithGoogle() → startSyncIfReady()                    │
│    ├─ initAuth() → startSyncIfReady()                            │
│    └─ signOut() → syncManager.stop() + clearPendingUpdates()     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ HTTPS (Bearer token)
┌─────────────────────────────────────────────────────────────────┐
│                   Server (Cloudflare Workers)                     │
│                                                                   │
│  POST /sync/push                                                  │
│    ├─ Validate + hash verify                                      │
│    ├─ Dedup by updateHash (SHA-256)                              │
│    ├─ R2: putUpdate(bytes)                                        │
│    ├─ D1: allocateSeqAndInsert() (atomic batch)                  │
│    └─ Background: compactWorkspace() if threshold met             │
│                                                                   │
│  POST /sync/pull                                                  │
│    ├─ Snapshot decision: lastSeq < snapshotSeq → snapshot mode   │
│    ├─ Incremental: getUpdatesAfter(lastSeq)                      │
│    ├─ Echo filter: skip updates from requesting device            │
│    └─ Pagination: 200 per response, hasMore flag                 │
│                                                                   │
│  Compaction (background)                                          │
│    ├─ Trigger: latestSeq - snapshotSeq >= 50                    │
│    ├─ Merge snapshot + updates → new snapshot                     │
│    ├─ D1: updateSnapshotMetaIfBehind() (compare-and-swap)        │
│    └─ D1: deleteUpdatesUpTo() (GC)                               │
│                                                                   │
│  Storage                                                          │
│    ├─ D1: sync_workspaces / sync_updates / sync_devices          │
│    └─ R2: {wsId}/updates/{hash}.bin / {wsId}/snapshots/{seq}.bin │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. 数据流详解

### 2.1 Bootstrap（启动流程）

**文件**: `App.tsx` → `workspace-store.ts` → `loro-doc.ts`

```
1. App.tsx useBootstrap():
   ├─ 等待 WorkspaceStore 持久化恢复（chrome.storage）
   ├─ 获取/创建 workspaceId（ws_{nanoid}）
   ├─ seedWorkspace(wsId):
   │   ├─ initLoroDoc(wsId)  → 从 IndexedDB 加载快照 → rebuildMappings()
   │   │   └─ 设置 _hadSnapshot 标志
   │   └─ ensureContainers(wsId)  → 创建 JOURNAL/LIBRARY/SCHEMA/TRASH 根节点
   ├─ initAuth()  → 从 chrome.storage 读取 Bearer token → 验证 session
   │   ├─ 成功：set(userId, wsId, isAuthenticated=true)
   │   │   ├─ 如果 !wasLoadedFromSnapshot()：
   │   │   │   └─ 注册 onStateChange 监听 → 首次 sync 后 ensureTodayNode()
   │   │   └─ startSyncIfReady()：
   │   │       ├─ doc.export({ mode: 'update' })  → 全量导出
   │   │       ├─ enqueuePendingUpdate()  → 入队
   │   │       └─ syncManager.start()  → 开始同步循环
   │   └─ 失败：set(isAuthenticated=false)
   └─ 导航到 Today 节点（或恢复上次面板）
```

**关键设计决策**：
- `initAuth()` 是 fire-and-forget（`void initAuth()`），不阻塞 UI 渲染
- `startSyncIfReady()` 在 push 前做全量 export，确保 bootstrap 创建的节点能到达服务器
- `subscribeLocalUpdates` 在 `status === 'local-only'` 时跳过，全量 export 补偿这个间隙

### 2.2 Push 流程

**文件**: `sync-manager.ts` → `pending-queue.ts` → `sync-protocol.ts` → `server/push.ts`

```
Local mutation → doc.commit() → doc.subscribe() fires
  │
  ├─ doc.subscribeLocalUpdates(bytes):
  │   ├─ 检查 syncManager.status !== 'local-only'
  │   ├─ enqueuePendingUpdate(syncWsId, bytes)  → IndexedDB
  │   └─ syncManager.nudge()  → 触发 syncOnce()
  │
  └─ syncOnce() → push():
      ├─ dequeuePendingUpdates(wsId, limit=20)  → FIFO 从 IndexedDB
      ├─ 对每个 update:
      │   ├─ uint8ToBase64(data)
      │   ├─ sha256Hex(data)
      │   ├─ POST /sync/push { wsId, deviceId, updates, updateHash, clientVV }
      │   └─ removePendingUpdates([id])  → 成功后从 IndexedDB 删除
      └─ Session check：每步之间检查 isSessionCurrent()
```

**Server 端 push 处理**：
```
handlePush():
  ├─ 1. Base64 decode + SHA-256 验证
  ├─ 2. ensureWorkspace()  → 首次 push 自动创建
  ├─ 3. 权限检查：ws.owner_id === userId
  ├─ 4. Dedup: findUpdateByHash()  → 已存在则返回 { deduped: true }
  ├─ 5. R2: putUpdate()  → 先写 blob（避免 seq 空洞）
  ├─ 6. D1: allocateSeqAndInsert()  → 原子批量操作：
  │   ├─ UPDATE sync_workspaces SET latest_seq = latest_seq + 1 RETURNING
  │   ├─ INSERT INTO sync_updates (seq = subquery)
  │   └─ UPSERT sync_devices (last_push_seq)
  └─ 7. shouldCompact() → waitUntil(compactWorkspace())  → 后台压缩
```

### 2.3 Pull 流程

**文件**: `sync-manager.ts` → `sync-protocol.ts` → `server/pull.ts` → `loro-doc.ts`

```
syncOnce() → pull():
  ├─ while (hasMore && pages < 50):
  │   ├─ POST /sync/pull { wsId, deviceId, lastSeq: cursor }
  │   ├─ 收到响应后:
  │   │   ├─ snapshot 模式：base64→bytes 加入 bytesToImport[]
  │   │   ├─ updates[]：每条 base64→bytes 加入 bytesToImport[]
  │   │   └─ importUpdatesBatch(bytesToImport):
  │   │       ├─ 逐条 doc.import(data)
  │   │       ├─ rebuildMappings()  → 重建 nodexId ↔ TreeID 映射
  │   │       ├─ fixDuplicateContainerMappings()  → CRDT merge 后容器去重
  │   │       └─ notifySubscribers()  → React 重渲染
  │   └─ cursor = response.nextCursorSeq; hasMore = response.hasMore
  └─ 持久化：
      ├─ saveNow()  → 快照写入 IndexedDB
      └─ saveCursor(wsId, cursor)  → 游标写入 IndexedDB
```

**Server 端 pull 处理**：
```
handlePull():
  ├─ 1. 权限检查
  ├─ 2. 判断响应类型：
  │   ├─ lastSeq >= latestSeq  → 空增量（已是最新）
  │   ├─ needsSnapshot (lastSeq < snapshotSeq 或 lastSeq=0)  →
  │   │   ├─ R2: getSnapshot()
  │   │   ├─ D1: getUpdatesAfter(snapshotSeq, limit=200)
  │   │   └─ readAndFilterUpdates()  → echo filter
  │   └─ 增量模式：
  │       ├─ D1: getUpdatesAfter(lastSeq, limit=200)
  │       └─ readAndFilterUpdates()  → echo filter
  ├─ 3. Echo filter: 跳过 device_id === requestingDeviceId 的 updates
  │   （游标仍前进，只是不返回数据）
  └─ 4. updateDevicePullCursor()
```

### 2.4 Compaction（快照压缩）

**文件**: `server/compaction.ts`

```
触发条件: latestSeq - snapshotSeq >= 50
  │
  ├─ 1. 加载现有 snapshot（R2）
  ├─ 2. getUpdatesInRange(snapshotSeq, latestSeq) → 逐条 doc.import()
  │   └─ 严格校验：updates.length === expectedUpdates
  ├─ 3. doc.export({ mode: 'snapshot' })
  ├─ 4. R2: putSnapshot(wsId, latestSeq, bytes) → 版本化 key
  ├─ 5. D1: updateSnapshotMetaIfBehind()  → CAS（compare-and-swap）
  │   └─ WHERE snapshot_seq = baseSnapshotSeq AND snapshot_seq < newSeq
  └─ 6. 仅当 step 5 成功：deleteUpdatesUpTo(latestSeq)
```

### 2.5 Sign-In / Sign-Out

**Sign-In (signInWithGoogle)**:
```
1. chrome.identity.launchWebAuthFlow() → Google OAuth
2. Worker 创建 session → 返回 session_token
3. chrome.storage.local 存储 token
4. set({ userId, currentWorkspaceId: user.id, isAuthenticated })
5. 如果 prevWsId !== user.id:
   ├─ setCurrentWorkspaceId(user.id)  → 更新持久化 key
   ├─ ensureContainers(user.id)
   └─ 注册 onStateChange → 首次 sync 后导航到 Today
6. startSyncIfReady()
```

**Sign-Out (signOut)**:
```
1. 获取当前 wsId
2. syncManager.stop()
3. clearPendingUpdates(wsId)  → 清理 IndexedDB 待推送队列
4. POST /api/auth/sign-out → 服务端失效 session
5. chrome.storage.local.remove(token)
6. set({ userId: null, isAuthenticated: false, ... })
```

---

## 3. 数据恢复场景

**场景：用户卸载扩展后重装，数据应从服务器恢复**

```
1. 重装后 IndexedDB 为空 → initLoroDoc() 创建空 LoroDoc
2. _hadSnapshot = false
3. ensureContainers() 创建 JOURNAL/LIBRARY/SCHEMA/TRASH 根节点
4. bootstrap 调用 ensureTodayNode() → 在空 JOURNAL 下创建 Year/Week/Day
5. initAuth() → session token 仍在 chrome.storage → 认证成功
6. wasLoadedFromSnapshot() === false →
   ├─ 注册 onStateChange 监听器
   └─ 等待首次 sync 完成后再导航到 Today
7. startSyncIfReady():
   ├─ 全量 export（包含 bootstrap 节点）→ 入队
   ├─ syncManager.start() → syncOnce():
   │   ├─ push: 推送本地全量（服务端 hash dedup）
   │   └─ pull: lastSeq=0 → 服务端返回 snapshot + trailing updates
   │       ├─ importUpdatesBatch() → CRDT merge
   │       ├─ fixDuplicateContainerMappings():
   │       │   ├─ 两个 JOURNAL 节点（本地 bootstrap + 服务端）
   │       │   └─ 选择 children 更多的（服务端的，有实际数据）
   │       └─ notifySubscribers() → UI 更新
   └─ onStateChange 触发 → ensureTodayNode() → replacePanel()
8. 结果：用户看到恢复的数据 + 今天的日记节点
```

---

## 4. IndexedDB 存储布局

```
Database: 'nodex' (version 2)
├─ loro_snapshots (keyPath: 外部key = workspaceId)
│   └─ value: SnapshotRecord { snapshot, peerIdStr, versionVector, savedAt }
├─ pending_updates (keyPath: 'id')
│   ├─ index: by_workspace (workspaceId)
│   └─ value: PendingUpdate { id, workspaceId, data, createdAt }
└─ sync_cursors (keyPath: 外部key = workspaceId)
    └─ value: { lastSeq, savedAt }
```

---

## 5. 已修复的问题

以下问题在本次 review 中发现并已修复（见 commits on main）：

### 5.1 saveSnapshotRecord 使用 req.onsuccess 而非 tx.oncomplete
- **风险**: IndexedDB 写入可能未持久化就返回
- **修复**: 改用 `tx.oncomplete`，添加 `tx.onabort` 处理
- **Commit**: `3a6ad25`

### 5.2 Pull 循环无最大迭代限制
- **风险**: 服务端 bug 导致 `hasMore` 始终为 true → 死循环
- **修复**: 添加 `MAX_PULL_PAGES = 50`（50×200 = 10,000 updates 上限）
- **Commit**: `3a6ad25`

### 5.3 Sign-out 未清理 pending queue
- **风险**: 旧 workspace 的待推送数据留在 IndexedDB，重新登录后可能推送到错误 workspace
- **修复**: `signOut()` 中调用 `clearPendingUpdates(wsId)`
- **Commit**: `3a6ad25`

### 5.4 数据恢复后白屏（前序 session 修复）
- **风险**: 删除 bootstrap journal 节点时 panel 正在渲染 → 白屏
- **修复**: 移除 journal 清理逻辑，改为依赖 `fixDuplicateContainerMappings()` 做 CRDT 级去重
- **Commit**: `cacb5c7`

### 5.5 rebuildMappings 中调用 .children() 导致 undo/redo 不稳定
- **风险**: Loro 内部状态干扰
- **修复**: 将 `fixDuplicateContainerMappings()` 从 `rebuildMappings()` 分离，仅在 `importUpdatesBatch()` 后调用
- **Commit**: `e466792`

---

## 6. 待 Review 问题（需要 Codex 确认）

### 6.1 [P2] 快照与游标保存非原子

```typescript
// sync-manager.ts pull():
await saveNow();           // 快照 → IndexedDB loro_snapshots store
await saveCursor(wsId, cursor);  // 游标 → IndexedDB sync_cursors store
```

如果在两步之间崩溃：快照已保存但游标未更新。下次启动时会用旧游标重新 pull 已有的数据。

- **影响**: 不丢数据（CRDT import 幂等），但浪费带宽
- **当前评估**: 安全方向（宁可重下载也不跳过），可接受
- **可选改进**: 合并到同一个 IndexedDB 事务（multi-store transaction）

### 6.2 [P3] openDB 缓存不处理连接关闭

```typescript
let dbPromise: Promise<IDBDatabase> | null = null;
export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  // ...
}
```

如果 IndexedDB 连接被浏览器关闭（例如存储压力或版本升级），缓存的 promise 返回失效的 DB 对象。后续操作会静默失败或抛错。

- **影响**: 罕见场景，但会导致持久化完全失效
- **可选改进**: 监听 `db.onclose` 事件，重置 `dbPromise`

### 6.3 [P3] 全量 export 在每次 startSyncIfReady 时执行

```typescript
const fullUpdate = doc.export({ mode: 'update' });
```

即使文档有几千个节点，每次 startSyncIfReady（登录后）都导出全量。服务端通过 hash dedup 避免重复存储，但客户端仍需计算 SHA-256 + Base64 编码 + HTTP 传输。

- **影响**: 大文档时登录慢（首次 push 可能 10MB+）
- **可选改进**: 用 `exportFrom(lastSyncedVV)` 导出增量而非全量

### 6.4 [P3] Push 逐条发送（每 update 一次 HTTP）

当前 `MAX_PUSH_PER_CYCLE = 20`，每个 update 一次请求。离线后恢复时可能有大量 pending updates。

- **影响**: 20 个串行 HTTP 请求 × 多个 cycle
- **可选改进**: 批量 push API（一次请求包含多个 updates）

### 6.5 [P3] clientVV 未被服务端使用

Push 请求中的 `clientVV` 字段被服务端忽略（`serverVV: null`），仅作为预留字段。

- **影响**: 无功能影响，轻微带宽浪费
- **可选**: 要么用起来（服务端返回 serverVV），要么移除

### 6.6 [P3] 无指数退避重试

Push/pull 失败后，下次尝试在 30s 后或下次 nudge 时。没有指数退避。

- **影响**: 持续性网络问题时频繁无效请求
- **可选改进**: 错误后增加退避间隔（1s, 2s, 4s, 8s...）

### 6.7 [P3] R2 孤儿 blob 无清理

Push 时 R2 写入在 D1 之前。如果 D1 失败，R2 blob 成为孤儿。Compaction 删除 D1 行但不删除 R2 update blob。旧 snapshot 也保留在 R2。

- **影响**: R2 存储缓慢增长
- **可选改进**: 周期性清理任务，或 compaction 后清理旧 R2 blob

### 6.8 [P2] Pull echo filter 跳过但游标仍前进

```typescript
async function readAndFilterUpdates(bucket, rows, requestingDeviceId) {
  for (const row of rows) {
    if (row.device_id === requestingDeviceId) continue;  // ← 跳过
    // ...
  }
}
```

Echo filter 在读取 R2 blob 之前跳过，这是正确的（避免不必要的 R2 读取）。游标基于 rows 的最后一条，而非 updates 的最后一条，也是正确的（确保不重复拉取已 echo-filter 的条目）。

**此项无需修改，仅确认设计合理。**

---

## 7. 服务端 D1 Schema

```sql
sync_workspaces:
  workspace_id  TEXT PRIMARY KEY
  owner_id      TEXT NOT NULL
  latest_seq    INTEGER DEFAULT 0
  snapshot_seq  INTEGER DEFAULT 0
  snapshot_key  TEXT           -- R2 key
  snapshot_vv   TEXT           -- Base64 VV (unused)
  snapshot_size INTEGER DEFAULT 0

sync_updates:
  (workspace_id, seq)  PRIMARY KEY
  device_id, user_id, update_hash, r2_key, size_bytes
  UNIQUE (workspace_id, update_hash)  -- dedup index

sync_devices:
  (workspace_id, device_id)  PRIMARY KEY
  user_id, last_push_seq, last_pull_seq, last_seen_at
```

---

## 8. 关键常量

| 常量 | 值 | 位置 | 说明 |
|------|----|------|------|
| SYNC_INTERVAL_MS | 30,000 | sync-manager.ts | 定期同步间隔 |
| MAX_PUSH_PER_CYCLE | 20 | sync-manager.ts | 每次 push 最多处理的 update 数 |
| MAX_PULL_PAGES | 50 | sync-manager.ts | Pull 循环最大迭代次数 |
| PAGE_LIMIT | 200 | server/pull.ts | 每次 pull 响应的最大 update 数 |
| COMPACT_THRESHOLD | 50 | server/compaction.ts | 触发压缩的 update 数阈值 |
| MAX_UPDATE_SIZE | 50MB | server/push.ts | 单个 update 最大体积 |
| DB_VERSION | 2 | loro-persistence.ts | IndexedDB schema 版本 |

---

## 9. 文件清单

### Client
| 文件 | 职责 |
|------|------|
| `src/lib/sync/sync-manager.ts` | SyncManager 单例 — push/pull 协调、状态管理、游标持久化 |
| `src/lib/sync/sync-protocol.ts` | HTTP 客户端 — push/pull 请求、Base64/SHA-256、错误类型 |
| `src/lib/sync/pending-queue.ts` | IndexedDB 离线队列 — 捕获本地 mutation 供 push 消费 |
| `src/lib/loro-doc.ts` | LoroDoc 管理 — importUpdatesBatch、fixDuplicateContainerMappings |
| `src/lib/loro-persistence.ts` | IndexedDB 快照持久化 — SnapshotRecord 格式 |
| `src/stores/workspace-store.ts` | Auth + sync bootstrap — startSyncIfReady、signIn/Out |
| `src/stores/sync-store.ts` | Zustand 同步状态 — 驱动 UI 指示器 |
| `src/entrypoints/sidepanel/App.tsx` | 启动流程 — initLoroDoc → initAuth → sync |

### Server
| 文件 | 职责 |
|------|------|
| `server/src/routes/push.ts` | POST /sync/push — 接收增量 update |
| `server/src/routes/pull.ts` | POST /sync/pull — 返回 snapshot/增量 |
| `server/src/lib/db.ts` | D1 查询 — seq 分配、dedup、游标 |
| `server/src/lib/r2.ts` | R2 存储 — update/snapshot blob |
| `server/src/lib/compaction.ts` | 快照压缩 — merge updates → snapshot |
| `server/src/lib/protocol.ts` | 协议类型 + Base64 |
| `server/src/lib/hash.ts` | SHA-256 (Web Crypto) |
| `server/src/middleware/auth.ts` | Bearer token 验证 |

### Tests
| 文件 | 覆盖范围 |
|------|---------|
| `tests/vitest/sync-manager.test.ts` | SyncManager 生命周期、push/pull mock、错误处理 |
| `tests/vitest/sync-phase0.test.ts` | PeerID/VV 持久化、SnapshotRecord 格式、subscribeLocalUpdates |
| `tests/vitest/sync-e2e.test.ts` | 端到端（需 wrangler dev）— 真实 push/pull |
| `tests/vitest/loro-sync-roundtrip.test.ts` | CRDT roundtrip — subscribeLocalUpdates → import |
| `tests/vitest/workspace-store.test.ts` | Auth + sync 集成 — signIn/Out、initAuth |
