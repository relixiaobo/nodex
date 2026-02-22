# Sync 增量同步实施计划

> 状态: **待 Review** | 创建: 2026-02-22 | Reviewer: nodex-codex | Executor: nodex-cc
>
> 本计划跳过纯备份（Phase 1），直接实现多端增量同步（Phase 2）。
> 基础设施选型见 `docs/plans/sync-architecture.md` § 基础设施选型调研。

---

## 一、目标

用户登录 Google 账号后，多台设备上的 Nodex 数据自动增量同步，离线编辑在联网后自动合并，无需用户干预。

**用户可感知的效果**：
1. 公司电脑写了笔记 → 回家打开笔记本 → 登录同一账号 → 笔记已在
2. 两台设备离线各自编辑 → 联网后自动合并（CRDT 无冲突）
3. 新设备首次登录 → 自动拉取全量数据
4. 状态栏显示同步状态（已同步 / 同步中 / 待同步 / 离线）

---

## 二、架构总览

```
客户端 (Chrome Side Panel)                    服务端 (Cloudflare)
┌────────────────────────────┐      ┌─────────────────────────────────┐
│ LoroDoc (本地 CRDT)         │      │ Cloudflare Worker               │
│   ↓ subscribeLocalUpdates  │      │   ├── POST /sync/push           │
│ PendingQueue (IndexedDB)   │      │   ├── POST /sync/pull           │
│   ↓ SyncManager            │──────│   └── JWT 验证 (Supabase Auth)  │
│ sync-store (Zustand)       │ HTTP │                                 │
│   ↓ UI 状态指示             │      │ Cloudflare R2                   │
└────────────────────────────┘      │   ├── /{wsId}/snapshot.bin      │
                                    │   └── /{wsId}/updates/{hash}.bin │
                                    │                                 │
                                    │ Supabase Postgres               │
                                    │   ├── sync_workspaces (元数据)   │
                                    │   ├── sync_devices (设备游标)    │
                                    │   └── sync_updates (增量元数据)  │
                                    └─────────────────────────────────┘
```

**核心设计原则**：
- 服务端不理解 CRDT 内容，只做"存储 + 转发"，冲突解决完全由客户端 Loro 处理
- 常规 push/pull 用 seq-based append log（服务端无需加载 LoroDoc）
- Compaction（合并 update log → 新快照）由定时任务完成，初期可手动触发

---

## 三、同步协议

### 3.1 传输格式

v1 使用 JSON + Base64 编码二进制字段：
- 实现简单，调试友好（浏览器 DevTools 可读）
- 33% 体积膨胀在个人同步场景下可接受
- 未来可优化为 `application/octet-stream` + 二进制帧

### 3.2 Push（客户端 → 服务端）

```
POST /sync/push
Authorization: Bearer <supabase-jwt>
Content-Type: application/json

{
  "workspaceId": "ws_abc123",
  "deviceId": "peer_12345",
  "updates": "<base64>",         // Uint8Array — 本次增量 bytes
  "updateHash": "<hex-sha256>",  // 幂等去重键（客户端计算）
  "clientVV": "<base64>"         // Uint8Array — 当前客户端 VersionVector（观测/调试用，v1 不参与服务端 diff）
}

Response 200:
{
  "seq": 42,                     // 服务端分配的序号（若重复 push 返回已有 seq）
  "deduped": false,              // true = 命中幂等去重，无新写入
  "serverVV": null               // v1 暂不维护，保留字段
}
```

**服务端处理**：
1. 验证 JWT → 提取 user_id
2. 校验 user 对 workspaceId 有写权限
3. 用 `(workspaceId, updateHash)` 查重（命中则直接返回已有 seq）
4. 先写 R2 update blob（key 不依赖 seq，避免 seq hole）
5. Postgres 事务内：原子递增 seq + 写入 `sync_updates` 元数据 + 更新 `sync_devices.last_push_seq`
6. 返回 seq + `deduped` + 当前 serverVV（v1 为 `null`）

### 3.3 Pull（服务端 → 客户端）

```
POST /sync/pull
Authorization: Bearer <supabase-jwt>
Content-Type: application/json

{
  "workspaceId": "ws_abc123",
  "deviceId": "peer_12345",
  "lastSeq": 35                  // 客户端已扫描/确认的 cursor seq（0 = 首次同步）
}

Response 200 (增量):
{
  "type": "incremental",
  "updates": [
    { "seq": 36, "data": "<base64>", "deviceId": "peer_67890" }
  ],
  "latestSeq": 42,
  "nextCursorSeq": 37,           // 本次服务端扫描到的最大 seq（含被 echo 过滤掉的项）
  "hasMore": false               // true 时客户端应继续拉取
}

Response 200 (全量快照 — 首次同步或落后太多):
{
  "type": "snapshot",
  "snapshot": "<base64>",        // 全量快照 bytes
  "snapshotSeq": 40,             // 快照覆盖到的 seq
  "updates": [                   // 快照之后的增量
    { "seq": 41, "data": "<base64>", "deviceId": "peer_67890" }
  ],
  "latestSeq": 42,
  "nextCursorSeq": 41,
  "hasMore": false
}
```

**服务端处理**：
1. 验证 JWT + 权限
2. 查 `sync_workspaces` 获取当前 `latest_seq` 和 `snapshot_seq`
3. 如果 `lastSeq < snapshot_seq`（客户端落后于快照）→ 返回全量快照 + 快照后的增量
4. 如果 `lastSeq == 0`（首次同步）→ 同上
5. 否则 → 先查 `sync_updates`（`seq > lastSeq ORDER BY seq LIMIT 50`）得到扫描窗口
6. 按 `sync_updates.r2_key` 从 R2 读取 bytes；对请求者 `deviceId` 做 echo 过滤（仅过滤响应项，不影响 cursor 前进）
7. 返回 `nextCursorSeq = 扫描窗口最大 seq`；客户端必须用它推进 cursor（而非用返回 updates 最大 seq）
8. 每次最多扫描 50 条（`hasMore: true` 分页）

### 3.4 幂等保证

- **Push 幂等**：每次 push 附带 `updateHash`（SHA-256），服务端按 `(workspace_id, update_hash)` 去重。相同内容重复 push 返回已有 seq，不产生新记录。
- **Pull 幂等**：`lastSeq` 是确定性游标，重复 pull 返回相同结果。
- **Import 幂等**：Loro CRDT `doc.import()` 天然幂等，重复导入相同 bytes 无副作用。

---

## 四、数据库 Schema

### 4.1 Supabase Postgres 新增表

```sql
-- 工作区同步元数据
CREATE TABLE sync_workspaces (
  workspace_id  TEXT PRIMARY KEY,
  owner_id      UUID NOT NULL REFERENCES auth.users(id),
  latest_seq    BIGINT NOT NULL DEFAULT 0,
  snapshot_seq  BIGINT NOT NULL DEFAULT 0,       -- 最新快照覆盖到的 seq
  snapshot_key  TEXT,                             -- R2 key: /{wsId}/snapshot.bin
  snapshot_vv   TEXT,                             -- Base64 encoded VersionVector
  snapshot_size BIGINT DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 设备同步游标
CREATE TABLE sync_devices (
  workspace_id  TEXT NOT NULL REFERENCES sync_workspaces(workspace_id),
  device_id     TEXT NOT NULL,                   -- PeerID string
  user_id       UUID NOT NULL REFERENCES auth.users(id),
  last_push_seq BIGINT NOT NULL DEFAULT 0,       -- 该设备最后 push 的 seq
  last_pull_seq BIGINT NOT NULL DEFAULT 0,       -- 该设备最后确认的 cursor seq（扫描进度，不等于返回给客户端的最后一条）
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, device_id)
);

-- 增量元数据（服务端 append log 索引；R2 存 bytes，Postgres 存 seq/device/hash/key）
CREATE TABLE sync_updates (
  workspace_id  TEXT NOT NULL REFERENCES sync_workspaces(workspace_id),
  seq           BIGINT NOT NULL,                 -- workspace 内单调递增序号
  device_id     TEXT NOT NULL,                   -- 来源设备（用于 echo 过滤）
  user_id       UUID NOT NULL REFERENCES auth.users(id),
  update_hash   TEXT NOT NULL,                   -- SHA-256 hex（幂等去重）
  r2_key        TEXT NOT NULL,                   -- R2 object key（不依赖 seq）
  size_bytes    INTEGER NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, seq),
  UNIQUE (workspace_id, update_hash)
);

-- RLS: 只允许 workspace owner 访问
ALTER TABLE sync_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_access" ON sync_workspaces
  FOR ALL USING (owner_id = auth.uid());

CREATE POLICY "owner_access" ON sync_devices
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "owner_access" ON sync_updates
  FOR ALL USING (user_id = auth.uid());
```

**实现注意（RLS 与 Worker 直连）**：
- Cloudflare Worker 通过 Hyperdrive 直连 Postgres 时，`auth.uid()` 不会自动注入请求 JWT claims。
- 因此 v1 **不能把 RLS 当作主鉴权机制**；服务端仍需在应用层用 `jwt.sub` 显式校验 `workspace.owner_id` / `user_id`。
- 上述 RLS 保留用于 Supabase 控制台/未来 REST 路径的兜底，不替代 Worker 中间件鉴权。

### 4.2 R2 存储结构

```
nodex-sync/                          ← R2 Bucket 名
  {workspaceId}/
    snapshot.bin                      ← 最新全量快照（compaction 产出）
    updates/
      a1b2c3...f0.bin                ← SHA-256(update bytes) 命名（seq 在 Postgres `sync_updates`）
      6f7e8d...1a.bin
      ...
      9c0d1e...ab.bin
```

---

## 五、文件结构

### 5.1 服务端（新建）

```
server/
  wrangler.toml                      # Workers 配置（R2 binding、环境变量）
  package.json                       # Workers 依赖
  tsconfig.json
  src/
    index.ts                         # Worker 入口（路由分发）
    routes/
      push.ts                        # POST /sync/push 处理
      pull.ts                        # POST /sync/pull 处理
    middleware/
      auth.ts                        # Supabase JWT 验证
    lib/
      r2.ts                          # R2 读写封装
      db.ts                          # Postgres 查询封装（通过 Hyperdrive）
      seq.ts                         # Seq 原子递增逻辑
      protocol.ts                    # 请求/响应类型 + Base64 编解码
    types.ts                         # 共享类型定义
  test/
    push.test.ts
    pull.test.ts
```

### 5.2 客户端（修改 + 新增）

```
src/
  lib/
    sync/
      pending-queue.ts               # [新] IndexedDB pending update 队列
      sync-manager.ts                # [新] 同步协调器（push/pull 循环）
      sync-protocol.ts               # [新] HTTP 请求封装 + Base64 编解码
  stores/
    sync-store.ts                    # [新] 同步状态 Zustand store
  components/
    sync/
      SyncStatusIndicator.tsx        # [新] 状态栏同步图标
  lib/
    loro-doc.ts                      # [改] subscribeLocalUpdates 回调改为写 pending queue
```

### 5.3 数据库迁移（新增）

```
supabase/
  migrations/
    002_sync_tables.sql              # sync_workspaces + sync_devices + sync_updates
```

---

## 六、实施步骤

> 每步对应一个可 review 的 commit 或 PR 节点。前后依赖用 → 标注。

### Step 1: 服务端项目骨架

**目标**：能在 `wrangler dev` 启动一个空 Worker，绑定 R2 bucket。

**产出**：
- `server/` 目录结构
- `wrangler.toml`：配置 R2 binding (`SYNC_BUCKET`)、环境变量 (`SUPABASE_JWT_SECRET`, `SUPABASE_URL`)、Hyperdrive binding (`DB`)
- `server/package.json`：`wrangler`、`@cloudflare/workers-types`、`jose`（JWT 验证）
- `server/src/index.ts`：空路由骨架，返回 404/405
- 验证：`cd server && wrangler dev` 能启动

**预计改动**：5-6 个新文件

### Step 2: Supabase 数据库迁移 → (Step 1)

**目标**：`sync_workspaces`、`sync_devices`、`sync_updates` 表在 Supabase 中创建。

**产出**：
- `supabase/migrations/002_sync_tables.sql`（含去重索引与 `sync_updates` 元数据表）
- 本地 `supabase db push` 或远程 migration 验证通过

**预计改动**：1 个新文件

### Step 3: 服务端 JWT 验证中间件 → (Step 1)

**目标**：所有 `/sync/*` 请求必须携带有效 Supabase JWT。

**产出**：
- `server/src/middleware/auth.ts`
  - 用 `jose` 库验证 JWT 签名（HS256，用 `SUPABASE_JWT_SECRET`）
  - 提取 `sub`（user_id）放入请求上下文
  - 无效/过期 token 返回 401
- 路由入口集成 auth 中间件
- 测试：无 token → 401，伪造 token → 401，有效 token → 通过

**预计改动**：2-3 个文件

**实现注意**：
- Supabase JWT 默认用 HS256 算法 + project JWT secret 签名
- JWT payload 中 `sub` 字段是 user UUID，`role` 字段区分 `authenticated` vs `anon`
- 需从 Supabase Dashboard → Settings → API 获取 JWT Secret，配置到 Workers 环境变量

### Step 4: 服务端 Push 端点 → (Step 2, Step 3)

**目标**：客户端可以上传增量 update，服务端存入 R2 + 更新 Postgres。

**产出**：
- `server/src/routes/push.ts`
- `server/src/lib/r2.ts`（R2 读写封装）
- `server/src/lib/db.ts`（Postgres 查询封装）
- `server/src/lib/seq.ts`（seq 原子递增辅助：事务内 `UPDATE ... RETURNING latest_seq`）
- `server/src/lib/protocol.ts`（请求体解析 + Base64 编解码）
- `server/src/lib/hash.ts`（SHA-256 / hex）

**处理流程**：
1. 解析请求体 `{ workspaceId, deviceId, updates, updateHash, clientVV }`
2. Base64 解码 `updates` 和 `clientVV` → `Uint8Array`
3. 服务端重算 SHA-256 并校验 `updateHash`（防篡改/实现统一）
4. 校验 user 对 workspace 有权限（查 `sync_workspaces.owner_id`，首次 push 自动创建记录）
5. 查 `sync_updates (workspace_id, update_hash)`：若已存在 → 返回已有 `{ seq, deduped: true }`
6. 先写 R2 `PUT /{wsId}/updates/{updateHash}.bin` ← update bytes（避免先分配 seq 造成 hole）
7. Postgres 事务内：
   - 原子递增 `sync_workspaces.latest_seq` → 得到新 seq
   - 插入 `sync_updates(workspace_id, seq, device_id, user_id, update_hash, r2_key, size_bytes)`
   - upsert `sync_devices.last_push_seq = seq, last_seen_at = now()`
8. 返回 `{ seq, deduped: false, serverVV: null }`（v1 `serverVV` 暂不维护）

**预计改动**：5-6 个新文件

**边界条件**：
- 首次 push：`sync_workspaces` 不存在 → `INSERT` 新记录（`owner_id = jwt.sub`）
- 空 update bytes → 400 拒绝
- 请求体超过 50 MB → 413 拒绝（预留安全余量）
- R2 写成功但 DB 事务失败 → 返回 500；允许留下 orphan blob，后续离线清理（以 `sync_updates` 为准）
- 并发重复 push（相同 `updateHash`）→ 以 `UNIQUE (workspace_id, update_hash)` 为最终裁决；冲突时读取已有 seq 并返回 `deduped: true`

### Step 5: 服务端 Pull 端点 → (Step 4)

**目标**：客户端可以拉取缺失的增量 updates 或全量快照。

**产出**：
- `server/src/routes/pull.ts`

**处理流程**：
1. 解析请求体 `{ workspaceId, deviceId, lastSeq }`
2. 查 `sync_workspaces` 获取 `latest_seq`, `snapshot_seq`, `snapshot_key`
3. 如果 `lastSeq >= latest_seq` → 返回 `{ type: "incremental", updates: [], latestSeq, nextCursorSeq: lastSeq, hasMore: false }`（已是最新）
4. 如果 `lastSeq < snapshot_seq` 或 `lastSeq == 0`（需要快照）：
   - 从 R2 读取 `snapshot.bin` → Base64 编码
   - 查 `sync_updates`（`seq > snapshot_seq ORDER BY seq LIMIT 50`）得到扫描窗口
   - 按 `r2_key` 从 R2 读取 updates，并过滤 echo（响应层）
   - 返回 `{ type: "snapshot", snapshot, snapshotSeq, updates, latestSeq, nextCursorSeq, hasMore }`
5. 否则（增量）：
   - 查 `sync_updates`（`seq > lastSeq ORDER BY seq LIMIT 50`）得到扫描窗口
   - 按 `r2_key` 从 R2 读取 updates
   - 过滤掉 `deviceId` 等于请求者的条目（避免 echo）
   - 返回 `{ type: "incremental", updates, latestSeq, nextCursorSeq, hasMore }`
6. 更新 `sync_devices`: `last_pull_seq = nextCursorSeq`, `last_seen_at = now()`（cursor=扫描进度）

**预计改动**：1-2 个新文件

**边界条件**：
- workspace 不存在 → 返回空（`{ type: "incremental", updates: [], latestSeq: 0, nextCursorSeq: 0, hasMore: false }`）
- 快照不存在但有 updates → 只返回 updates（客户端从本地状态 + updates 合并）
- R2 读取失败 → 500 + 错误日志
- 扫描窗口全部被 echo 过滤 → `updates=[]` 但 `nextCursorSeq` 仍前进（客户端必须继续用 `nextCursorSeq`）

**echo 过滤的设计说明**：
- 客户端 push 的 update 包含自己的操作，pull 时不需要再收到
- v1 采用 `sync_updates.device_id` 做过滤（不依赖 R2 metadata / key 命名）
- 这样同时解决：echo 过滤、幂等去重（`update_hash`）、分页扫描与调试审计

### Step 6: 客户端 Pending Queue → (无依赖，可与 Step 1-5 并行)

**目标**：本地操作产生的增量 bytes 写入 IndexedDB 队列，断网也不丢。

**产出**：
- `src/lib/sync/pending-queue.ts`

**接口设计**：
```typescript
// pending-queue.ts
export interface PendingUpdate {
  id: string;          // nanoid — 用于去重和删除
  workspaceId: string;
  data: Uint8Array;    // subscribeLocalUpdates 回调的 bytes
  createdAt: number;
}

export async function enqueuePendingUpdate(update: PendingUpdate): Promise<void>;
export async function dequeuePendingUpdates(workspaceId: string, limit?: number): Promise<PendingUpdate[]>;
export async function removePendingUpdates(ids: string[]): Promise<void>;
export async function getPendingCount(workspaceId: string): Promise<number>;
export async function clearPendingUpdates(workspaceId: string): Promise<void>;
```

**存储**：复用 `loro-persistence.ts` 的 IndexedDB 实例（`nodex` 数据库），新增 `pending_updates` object store，并预留 `sync_cursors`（或将 cursor 合并进 `SnapshotRecord`）。统一一次 DB version 升级（1 → 2）。

**改动 `loro-doc.ts`**：
- `subscribeLocalUpdates` 回调从 no-op 改为调用 `enqueuePendingUpdate()`
- 仅在用户已登录时入队（未登录 = local-only 模式，不排队）
- `importUpdates()` 不会触发 `subscribeLocalUpdates`（Loro 原生行为），所以远程 update 不会回灌

**预计改动**：1 个新文件 + 改 1 个文件（loro-persistence.ts DB 升级 + loro-doc.ts 回调）

### Step 7: 客户端 Sync Manager → (Step 5, Step 6)

**目标**：登录后自动启动同步循环（push 本地变更 + pull 远程变更）。

**产出**：
- `src/lib/sync/sync-manager.ts`
- `src/lib/sync/sync-protocol.ts`

**SyncManager 核心逻辑**：

```typescript
// sync-manager.ts
export class SyncManager {
  private intervalId: number | null = null;
  private isSyncing = false;

  start(workspaceId: string, accessToken: string, deviceId: string): void;
  stop(): void;

  // 单次同步周期
  async syncOnce(): Promise<SyncResult>;

  // Push: pending queue → 服务端
  private async push(): Promise<void>;

  // Pull: 服务端 → doc.import()
  private async pull(): Promise<void>;
}
```

**同步周期**：
1. `push()`：v1 **不合并** pending updates；按队列顺序逐条 POST `/sync/push`（每轮可设最大条数）→ 成功后删除对应队列项
2. `pull()`：发送 `lastSeq` → 收到 updates → 逐条 `importUpdates()` → 用 `nextCursorSeq` 更新本地 cursor（即使本页被 echo 过滤后 `updates=[]`）
3. 每 30 秒执行一次（`setInterval`）
4. 页面 `visibilitychange` 时立即触发一次（切回前台 = 立即同步）
5. `subscribeLocalUpdates` 入队后也触发一次（有新本地变更 = 尽快推送）

**`lastSeq` 持久化（修订）**：
- 不使用 `chrome.storage.local` 单独持久化 cursor（避免与本地 Loro 状态分离）
- 将 `lastSeq` checkpoint 持久化到 `loro-persistence.ts` 的 IndexedDB（`sync_cursors` store 或扩展 `SnapshotRecord`）
- `pull()` 成功应用一批 updates 后，按顺序执行：`doc.import()` → 持久化本地 checkpoint（至少含 `lastSeq`，建议同写 `versionVector`/snapshot 元数据）→ 再标记本轮成功
- 目标：避免“cursor 已前进，但本地状态未落盘”导致重启后漏拉数据

**sync-protocol.ts**：
```typescript
// HTTP 请求封装
export async function pushUpdates(params: PushRequest): Promise<PushResponse>;
export async function pullUpdates(params: PullRequest): Promise<PullResponse>;

// Base64 编解码
export function uint8ArrayToBase64(bytes: Uint8Array): string;
export function base64ToUint8Array(base64: string): Uint8Array;
```

**请求/响应语义约束（新增）**：
- PushRequest 必含 `updateHash`（hex SHA-256）
- PullResponse 必含 `nextCursorSeq`（扫描进度）；客户端推进 cursor 只能用该字段

**与 workspace-store 集成**：
- `initAuth()` 中，`SIGNED_IN` 事件 → `syncManager.start()`
- `SIGNED_OUT` 事件 → `syncManager.stop()`
- workspace 切换 → `stop()` 旧的 + `start()` 新的

**预计改动**：2 个新文件 + 改 1 个文件（workspace-store.ts 或 App.tsx 集成启动）

### Step 8: 客户端 Sync 状态 UI → (Step 7)

**目标**：用户能看到当前同步状态。

**产出**：
- `src/stores/sync-store.ts`
- `src/components/sync/SyncStatusIndicator.tsx`

**sync-store.ts**：
```typescript
interface SyncState {
  status: 'local-only' | 'synced' | 'syncing' | 'pending' | 'error' | 'offline';
  lastSyncedAt: number | null;
  pendingCount: number;
  error: string | null;
}
```

**状态转换**：
- 未登录 → `local-only`
- 登录 + push/pull 进行中 → `syncing`
- push/pull 成功 + pending queue 为空 → `synced`
- push/pull 成功 + pending queue 有数据 → `pending`
- push/pull 失败 → `error`（显示错误信息，自动重试）
- 网络断开 → `offline`（`navigator.onLine` 监听）

**SyncStatusIndicator.tsx**：
- 放在侧栏底部或 Header 区域
- 图标：云 + 对号（synced）/ 云 + 旋转（syncing）/ 云 + 数字 badge（pending）/ 云 + 叉（error）/ 云 + 横线（offline）/ 无图标（local-only）
- 点击展开 tooltip 显示详情（上次同步时间、待同步数量、错误信息）

**预计改动**：2 个新文件 + 改 1 个文件（Sidebar.tsx 或 layout 集成）

### Step 9: 端到端测试 → (Step 7)

**目标**：验证完整同步链路。

**测试用例**（Vitest）：

```
sync-e2e.test.ts:
  1. push 单条 update → pull 从另一个 deviceId 收到
  2. push 多条 → pull 批量收到（顺序正确）
  3. 两个 device 各自 push → 各自 pull 对方的 update
  4. 首次同步（lastSeq=0）→ 收到 snapshot 或全量 updates
  5. push 幂等（相同内容重复 push）
  6. pull echo 过滤（不收到自己 push 的内容）+ `nextCursorSeq` 仍正确前进
  7. R2 成功 / DB 失败场景不产生可见 seq hole（以 `sync_updates` 查询为准）
  8. 断网恢复后 pending queue 正确 drain
  9. JWT 过期 → 401 → 状态变 error → 刷新 token 后恢复

sync-pending-queue.test.ts:
  1. enqueue → dequeue 顺序一致
  2. remove 后不再 dequeue
  3. clearPendingUpdates 清空
  4. 并发 enqueue 不丢数据
```

**测试方式**：
- 服务端：`wrangler dev` 或 miniflare 本地启动
- 客户端：Vitest + jsdom + 复用 `sync-phase0.test.ts` 的 IndexedDB test double
- E2E：可能需要集成测试脚本同时启动 Worker + 客户端测试

**预计改动**：2-3 个测试文件

### Step 10: Compaction（可延后到上线后）

**目标**：update log 过长时合并为新快照，加速新设备同步。

**方案**：
- Cloudflare Workers Cron Trigger（每小时检查一次）
- 条件：`latest_seq - snapshot_seq > 500` 或 update 总大小 > 50 MB
- 流程：
  1. 从 R2 读取当前 snapshot（如有）+ 所有新 updates
  2. 在 Worker 内创建 LoroDoc → 依次 import → export snapshot
  3. 写新 snapshot 到 R2
  4. 更新 `sync_workspaces.snapshot_seq` + `snapshot_key`
  5. 删除已被快照覆盖的旧 update blobs

**风险**：Workers 128 MB 内存限制。大文档的 LoroDoc import 可能超限。缓解：
- 用流式处理（逐条 import，不一次性缓冲所有 updates）
- Cron Worker 有 15 分钟 CPU 限制（vs 普通请求 30s），足够处理
- 极端情况下降级为 Durable Object（独立内存空间）

**初期策略**：暂不实现自动 compaction。新设备首次同步时回放所有 updates。当 update 数量达到影响体验的量级时再加。

---

## 七、实施顺序与依赖图

```
Step 1 (服务端骨架)
  ├──→ Step 2 (DB 迁移)
  │      └──→ Step 4 (Push 端点)
  │             └──→ Step 5 (Pull 端点)
  │                    └──→ Step 7 (Sync Manager) ←── Step 6
  │                           └──→ Step 8 (UI)
  │                                  └──→ Step 9 (E2E 测试)
  └──→ Step 3 (JWT 中间件) ──→ Step 4
                                        Step 10 (Compaction, 延后)
Step 6 (Pending Queue) ← 无服务端依赖，可与 Step 1-5 并行
```

**建议分 3 个 PR 提交**：

| PR | 包含 Steps | 可独立验证 |
|----|-----------|-----------|
| PR-A | Step 1 + 2 + 3 | `wrangler dev` 启动，JWT 验证通过 |
| PR-B | Step 4 + 5 + 6 | `curl` 测试 push/pull + pending queue 单元测试 |
| PR-C | Step 7 + 8 + 9 | 完整同步链路 + UI + E2E 测试 |

---

## 八、配置与环境变量

### 服务端 (wrangler.toml)

```toml
name = "nodex-sync"
main = "src/index.ts"
compatibility_date = "2024-09-23"

[vars]
SUPABASE_URL = "https://xxx.supabase.co"

# 敏感变量用 wrangler secret 设置，不写 toml
# wrangler secret put SUPABASE_JWT_SECRET
# wrangler secret put DATABASE_URL

[[r2_buckets]]
binding = "SYNC_BUCKET"
bucket_name = "nodex-sync"

[[hyperdrive]]
binding = "DB"
id = "<hyperdrive-config-id>"
```

### 客户端

- Sync API URL：`VITE_SYNC_API_URL`（加到 `src/env.d.ts`）
  - 开发：`http://localhost:8787`
  - 生产：`https://nodex-sync.<account>.workers.dev`（或自定义域名）

---

## 九、安全考量

| 风险 | 缓解 |
|------|------|
| JWT 伪造 | Workers 验证签名（HS256 + Supabase JWT Secret） |
| 越权访问他人 workspace | 校验 `sync_workspaces.owner_id == jwt.sub` |
| 恶意大 payload | 服务端限制请求体 ≤ 50 MB |
| 重放攻击 | CRDT import 天然幂等，重放无副作用 |
| Token 泄露 | HTTPS only；JWT 短有效期 + refresh token |
| R2 直接访问 | R2 不开放公共访问，只通过 Workers 代理 |
| 误把 RLS 当 Worker 主鉴权 | Worker 直连 Postgres 仍以应用层鉴权为准；RLS 仅作兜底 |

---

## 十、Review 结论与剩余开放问题

### 10.1 本轮 Review 已定案（已反映到上文）

1. **echo 过滤实现**：采用 Postgres `sync_updates.device_id` 做过滤；不使用 R2 object metadata / key 嵌入 deviceId。
2. **push 幂等实现**：PushRequest 增加 `updateHash`，`sync_updates` 上建 `UNIQUE (workspace_id, update_hash)`。
3. **seq hole 风险**：先写 R2（key 使用 `updateHash`，不依赖 seq），再在 DB 事务内分配 seq + 写 `sync_updates`，避免“先分 seq 后 R2 失败”。
4. **cursor 语义**：PullResponse 增加 `nextCursorSeq`，表示服务端扫描进度；客户端推进 cursor 只能使用该字段（避免 echo 过滤导致停滞）。
5. **v1 push 策略**：先不合并 pending updates，按队列逐条 push，降低实现复杂度与临时 LoroDoc 成本。
6. **本地 checkpoint 持久化**：`lastSeq` 不单独存 `chrome.storage.local`；改为存 IndexedDB（与 Loro 持久化同域）。
7. **鉴权边界**：Worker + Hyperdrive 直连 Postgres 路径不依赖 RLS，主鉴权在 Worker 应用层完成。

### 10.2 剩余开放问题（执行前/执行中确认）

1. **首次同步无快照**：未 compaction 时，新设备 `lastSeq=0` 直接回放全量 updates。v1 可接受；需在 PR-C 前实测启动耗时阈值（如 >3s 时再优先补 snapshot 兜底）。

2. **多 workspace 同步**：v1 是否只支持单 workspace 自动同步（当前 UI/状态机更简单），还是允许多实例 `SyncManager` 并行？建议 v1 明确单 workspace，后续再扩展。

3. **离线编辑合并顺序**：理论上 CRDT 保证最终一致；执行时用 E2E 用例确认 Loro 对乱序导入的行为与预期一致（尤其跨设备交错 push/pull）。

4. **Workers 部署区域**：是否启用 Smart Placement（更靠近 Supabase 区域）作为默认部署配置。建议在首个 staging 部署时启用并观察延迟。

---

## 十一、参考文件

| 文件 | 用途 |
|------|------|
| `docs/plans/sync-architecture.md` | 总体架构 + 基础设施选型 |
| `src/lib/loro-doc.ts` | 当前 LoroDoc 单例 + subscribeLocalUpdates hook |
| `src/lib/loro-persistence.ts` | IndexedDB 快照持久化 |
| `src/lib/workspace-id.ts` | Workspace ID 生成 |
| `src/stores/workspace-store.ts` | Auth 状态 + Google OAuth |
| `tests/vitest/sync-phase0.test.ts` | Phase 0 测试（24 cases） |
