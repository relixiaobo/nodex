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
                                    │   └── /{wsId}/updates/{seq}.bin │
                                    │                                 │
                                    │ Supabase Postgres               │
                                    │   ├── sync_workspaces (元数据)   │
                                    │   └── sync_devices (游标)        │
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
  "clientVV": "<base64>"         // Uint8Array — 当前客户端 VersionVector
}

Response 200:
{
  "seq": 42,                     // 服务端分配的序号
  "serverVV": "<base64>"         // 当前服务端最新 VV（供客户端参考）
}
```

**服务端处理**：
1. 验证 JWT → 提取 user_id
2. 校验 user 对 workspaceId 有写权限
3. 生成下一个 seq（原子递增）
4. 存 update blob 到 R2: `/{wsId}/updates/{seq}.bin`
5. 更新 Postgres: `sync_devices` 表的 `last_push_seq`
6. 返回 seq + 当前 serverVV

### 3.3 Pull（服务端 → 客户端）

```
POST /sync/pull
Authorization: Bearer <supabase-jwt>
Content-Type: application/json

{
  "workspaceId": "ws_abc123",
  "deviceId": "peer_12345",
  "lastSeq": 35                  // 客户端已收到的最大 seq（0 = 首次同步）
}

Response 200 (增量):
{
  "type": "incremental",
  "updates": [
    { "seq": 36, "data": "<base64>", "deviceId": "peer_67890" },
    { "seq": 37, "data": "<base64>", "deviceId": "peer_12345" }
  ],
  "latestSeq": 42,
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
  "hasMore": false
}
```

**服务端处理**：
1. 验证 JWT + 权限
2. 查 `sync_workspaces` 获取当前 `latest_seq` 和 `snapshot_seq`
3. 如果 `lastSeq < snapshot_seq`（客户端落后于快照）→ 返回全量快照 + 快照后的增量
4. 如果 `lastSeq == 0`（首次同步）→ 同上
5. 否则 → 从 R2 读取 `lastSeq+1` 到 `latest_seq` 的 update blobs → 返回增量
6. 每次最多返回 50 条 updates（`hasMore: true` 分页）
7. 不返回客户端自己推送的 updates（通过 `deviceId` 过滤，避免 echo）

### 3.4 幂等保证

- **Push 幂等**：每次 push 附带 `clientVV`，服务端可以用 SHA-256 hash 检测重复。相同内容重复 push 返回已有 seq，不产生新记录。
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
  last_pull_seq BIGINT NOT NULL DEFAULT 0,       -- 该设备最后 pull 到的 seq
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, device_id)
);

-- RLS: 只允许 workspace owner 访问
ALTER TABLE sync_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_access" ON sync_workspaces
  FOR ALL USING (owner_id = auth.uid());

CREATE POLICY "owner_access" ON sync_devices
  FOR ALL USING (user_id = auth.uid());
```

### 4.2 R2 存储结构

```
nodex-sync/                          ← R2 Bucket 名
  {workspaceId}/
    snapshot.bin                      ← 最新全量快照（compaction 产出）
    updates/
      000001.bin                     ← seq=1 的增量 update
      000002.bin
      ...
      000042.bin                     ← 最新 update
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
    002_sync_tables.sql              # sync_workspaces + sync_devices
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

**目标**：`sync_workspaces` 和 `sync_devices` 表在 Supabase 中创建。

**产出**：
- `supabase/migrations/002_sync_tables.sql`
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
- `server/src/lib/seq.ts`（seq 原子递增：读 `sync_workspaces.latest_seq` → +1 → 写回）
- `server/src/lib/protocol.ts`（请求体解析 + Base64 解码）

**处理流程**：
1. 解析请求体 `{ workspaceId, deviceId, updates, clientVV }`
2. Base64 解码 `updates` 和 `clientVV` → `Uint8Array`
3. 校验 user 对 workspace 有权限（查 `sync_workspaces.owner_id`，首次 push 自动创建记录）
4. 原子递增 `latest_seq` → 得到新 seq
5. R2 `PUT /{wsId}/updates/{seq.toString().padStart(9, '0')}.bin` ← update bytes
6. 更新 `sync_devices`: `last_push_seq = seq`, `last_seen_at = now()`
7. 返回 `{ seq, serverVV: null }`（v1 serverVV 暂不维护，后续 compaction 时填入）

**预计改动**：5-6 个新文件

**边界条件**：
- 首次 push：`sync_workspaces` 不存在 → `INSERT` 新记录（`owner_id = jwt.sub`）
- 空 update bytes → 400 拒绝
- 请求体超过 50 MB → 413 拒绝（预留安全余量）

### Step 5: 服务端 Pull 端点 → (Step 4)

**目标**：客户端可以拉取缺失的增量 updates 或全量快照。

**产出**：
- `server/src/routes/pull.ts`

**处理流程**：
1. 解析请求体 `{ workspaceId, deviceId, lastSeq }`
2. 查 `sync_workspaces` 获取 `latest_seq`, `snapshot_seq`, `snapshot_key`
3. 如果 `lastSeq >= latest_seq` → 返回 `{ type: "incremental", updates: [], latestSeq, hasMore: false }`（已是最新）
4. 如果 `lastSeq < snapshot_seq` 或 `lastSeq == 0`（需要快照）：
   - 从 R2 读取 `snapshot.bin` → Base64 编码
   - 从 R2 读取 `snapshot_seq+1` 到 `latest_seq` 的 updates（最多 50 条）
   - 返回 `{ type: "snapshot", snapshot, snapshotSeq, updates, latestSeq, hasMore }`
5. 否则（增量）：
   - 从 R2 读取 `lastSeq+1` 到 `latest_seq` 的 updates（最多 50 条）
   - 过滤掉 `deviceId` 等于请求者的条目（避免 echo）
   - 返回 `{ type: "incremental", updates, latestSeq, hasMore }`
6. 更新 `sync_devices`: `last_pull_seq = 实际返回的最大 seq`, `last_seen_at = now()`

**预计改动**：1-2 个新文件

**边界条件**：
- workspace 不存在 → 返回空（`{ type: "incremental", updates: [], latestSeq: 0 }`）
- 快照不存在但有 updates → 只返回 updates（客户端从本地状态 + updates 合并）
- R2 读取失败 → 500 + 错误日志

**echo 过滤的设计说明**：
- 客户端 push 的 update 包含自己的操作，pull 时不需要再收到
- 通过在 R2 存储时把 `deviceId` 作为 object metadata（`x-amz-meta-device-id`），pull 时读取并过滤
- 或者：在 Postgres 中记录每个 seq 的来源 deviceId（更简单但多一列）
- **推荐后者**：在 `sync_workspaces` 逻辑中增加一个 `sync_updates` 辅助表，或把 deviceId 存在 update key 的命名中（如 `{seq}_{deviceId}.bin`）

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

**存储**：复用 `loro-persistence.ts` 的 IndexedDB 实例（`nodex` 数据库），新增 `pending_updates` object store。需要 DB version 升级（1 → 2）。

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
1. `push()`：从 pending queue 取出所有待推送 updates → 合并为单次 POST `/sync/push` → 成功后从 queue 删除
2. `pull()`：发送 `lastSeq` → 收到 updates → 逐条 `importUpdates()` → 更新本地 `lastSeq`
3. 每 30 秒执行一次（`setInterval`）
4. 页面 `visibilitychange` 时立即触发一次（切回前台 = 立即同步）
5. `subscribeLocalUpdates` 入队后也触发一次（有新本地变更 = 尽快推送）

**`lastSeq` 持久化**：存 `chrome.storage.local`（key: `sync_last_seq_{workspaceId}`）。

**sync-protocol.ts**：
```typescript
// HTTP 请求封装
export async function pushUpdates(params: PushRequest): Promise<PushResponse>;
export async function pullUpdates(params: PullRequest): Promise<PullResponse>;

// Base64 编解码
export function uint8ArrayToBase64(bytes: Uint8Array): string;
export function base64ToUint8Array(base64: string): Uint8Array;
```

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
  6. pull echo 过滤（不收到自己 push 的内容）
  7. 断网恢复后 pending queue 正确 drain
  8. JWT 过期 → 401 → 状态变 error → 刷新 token 后恢复

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

---

## 十、待 Review 的开放问题

以下问题请 reviewer 评估：

1. **echo 过滤实现方式**：在 R2 key 中嵌入 deviceId（如 `{seq}_{deviceId}.bin`）vs Postgres 辅助列 vs R2 object metadata。推荐 R2 key 嵌入方案（最简单，pull 时 list + filter）。

2. **update 合并策略**：push 时是否应该把 pending queue 中多条 update 合并为一条？Loro 支持合并多个 updates（`doc.import` 多次后 `doc.export` 一次），但合并需要在客户端加载临时 LoroDoc。v1 可以先不合并，逐条推送。

3. **Seq 原子递增**：Workers 是无状态的，`latest_seq` 存在 Postgres 中。并发 push 时需要原子递增。方案：`UPDATE sync_workspaces SET latest_seq = latest_seq + 1 WHERE workspace_id = $1 RETURNING latest_seq`（单条 SQL 原子操作）。

4. **首次同步无快照**：如果还没跑过 compaction，新设备首次 pull 时 `snapshot_seq = 0`、无 snapshot。此时返回 `lastSeq=0` 到 `latest_seq` 的所有 updates。客户端依次 import 到空 LoroDoc。这是否可接受？（update 数量少时没问题，多时可能慢）。

5. **多 workspace 同步**：当前设计按 workspace 隔离。登录用户如果有多个 workspace，需要分别启动 SyncManager 实例。v1 是否只支持单 workspace？

6. **离线编辑合并顺序**：两台设备离线各编辑，联网后的 push/pull 顺序是否影响最终状态？答案：不影响（CRDT 保证），但请 reviewer 确认 Loro 的 `import` 对乱序 updates 的处理。

7. **Workers 部署区域**：是否启用 Smart Placement（自动靠近 Supabase 所在区域）？推荐启用。

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
