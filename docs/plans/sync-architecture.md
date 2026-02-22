# Sync Architecture Plan

> 状态: **规划中** | 创建: 2026-02-22 | 最后更新: 2026-02-22 (基础设施选型)

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
| Auth | **Better Auth + D1**（Cloudflare-only） | Google OAuth；PoC 验证后替代 Supabase Auth。评估见 `auth-cloudflare-only.md` |
| 同步协议 | 采用 `loro-dev/protocol` 官方线协议 | 已有 WebSocket 客户端/服务端、room 复用、E2E 加密、auth hook |
| Awareness | 已有 `awareness.ts` + 未来 `LoroEphemeralAdaptor` | presence 不落库，与持久 update 分通道 |
| Blob 存储 | **Cloudflare R2** | 零出口费（CRDT 同步场景关键）、$0.015/GB/月、10 GB 免费、S3 兼容 |
| 同步网关 | **Cloudflare Workers** | 100 MB 请求体（CRDT 大快照无障碍）、<5ms 冷启动、$5/月基价 |
| 同步元数据 | **Cloudflare D1** | Worker 原生 binding，消除 Hyperdrive 配置与 RLS 歧义；免费额度覆盖 sync 元数据需求 |

### 延后决策（各 Phase 开始时再定）

| 决策 | 时机 | 选项 |
|------|------|------|
| 实时层 | Phase 3 | Cloudflare Durable Objects（首选，自然演进）vs `loro-websocket` SimpleServer |
| 全套方案 vs 自建 | Phase 2 | 基于 `loro-protocol` 自建（首选）vs `@loro-extended` 适配器 |

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

// 构造后立即设置（必须在 import/commit/本地写操作之前）
doc.setPeerId(savedPeerId);  // 接受 number | bigint | `${number}`

// 读取
doc.peerIdStr;  // `${number}` 格式字符串
doc.peerId;     // bigint
```

**安全规则**：
- 绝不允许两个并行 peer 共享同一 PeerID（会导致文档分叉）
- Chrome Side Panel 单实例，可安全复用 PeerID（保存/恢复模式）
- `setPeerId()` 必须在文档仍为空（无 oplog）时调用；**先 `import(snapshot)` 再 `setPeerId()` 是错误顺序**

### VersionVector 序列化

```typescript
// 二进制（网络传输用）
const bytes = vv.encode();              // → Uint8Array
const restored = VersionVector.decode(bytes);

// 结构化克隆 / 调试（注意：toJSON() 返回 Map，不可直接 JSON.stringify）
const map = vv.toJSON();                // → Map<PeerID, number>
const restored = VersionVector.parseJSON(map);

// 如需 JSON 字符串持久化，先转 entries 数组
const entries = [...vv.toJSON().entries()];
const json = JSON.stringify(entries);
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
| 无 Background Sync API | 用 `chrome.alarms` 触发批量 HTTP 同步（Chrome 120+ 最短 30s；实现上先按 1 分钟基线） |
| `unlimitedStorage` 权限 | 放宽扩展存储配额（尤其大快照/队列场景）；**不要**将其视为“永不清除”保证 |
| Side Panel 同一时间通常只有一个可见实例 | 可简化 PeerID 管理，但初始化/恢复逻辑仍应保持幂等（应对快速重开/重载） |

**同步生命周期**：
1. Side Panel 打开 → WebSocket 连接 → 实时同步
2. Side Panel 关闭 → 断开 WebSocket → pending 状态写 IndexedDB
3. `chrome.alarms` 定期唤醒 SW → HTTP 批量同步 pending updates（实现上按 1 分钟基线；Chrome 120+ 可到 30s）
4. Side Panel 重新打开 → 读 IndexedDB → 重连 WebSocket → delta sync

---

## 基础设施选型调研（2026-02-22）

> **结论（最终修订）**：采用 **Cloudflare-only 全栈**：Workers + R2 + D1 + Better Auth。
> 完全消除 Supabase 依赖。Auth 迁移评估见 `docs/plans/auth-cloudflare-only.md`。

### 选型驱动因素

CRDT 同步场景有两个特殊需求，直接决定了选型方向：

1. **大二进制 payload**：Loro 快照/增量 update 是 `Uint8Array`，典型大小 1-50 MB。API 端点必须能接收和返回这个量级的二进制数据。
2. **高频读取出口**：每次 pull 同步都要从存储下载数据。用户越多、设备越多，出口流量线性增长。出口计费模型直接影响可持续性。

### 方案 A：Supabase 全家桶（Storage + Edge Functions）

**优势**：
- 一站式控制台，Auth / Postgres / Storage / Functions 统一管理
- Edge Functions 对 Supabase Auth JWT 验证开箱即用（一行代码）
- 已有 Google OAuth 集成，无需额外接入
- 团队只需掌握一套体系

**劣势**：
- **Edge Functions 请求体限制 ~4 MB**——无法直接传输大 CRDT 快照，必须分片或走 presigned URL 绕过
- Storage 出口流量 $0.09/GB（Pro 含 250 GB 后），同步场景下成本增长快
- Realtime 是行级变更流，不适合 CRDT 传输，Phase 3 需另找方案
- Edge Functions 冷启动较慢（几十到几百毫秒）

| 资源 | 免费额度 | Pro ($25/月) |
|------|---------|-------------|
| Storage 存储 | 1 GB | 100 GB 含 |
| Storage 出口 | 2 GB | 250 GB 含，超出 $0.09/GB |
| Edge Functions 调用 | 50 万次/月 | 含在 Pro 内 |
| Edge Functions CPU | 2s/请求 | 2s/请求 |
| Edge Functions 请求体 | ~4 MB | ~4 MB |
| Edge Functions 墙钟 | 150s | 400s |
| Edge Functions 内存 | 256 MB | 256 MB |

### 方案 B：Cloudflare 组合（R2 + Workers）

**优势**：
- **R2 零出口费**——同步场景下成本可控
- **Workers 100 MB 请求体**——CRDT 大快照无障碍
- < 5ms 冷启动（V8 isolate 模型，冷启动在 TLS 握手期间完成）
- **D1 原生 binding**——Worker 直连元数据，无需 Hyperdrive/连接池
- **Better Auth + D1**——Auth 也在 Cloudflare 内完成，单一平台运维
- Durable Objects 为 Phase 3 实时协作提供天然升级路径
- $5/月基价 vs Supabase $25/月

**劣势**：
- Auth 需自建（Better Auth 框架降低成本，但仍需 PoC 验证 Chrome Extension 集成）
- Workers 内存 128 MB，50 MB 快照需流式处理不能全缓冲
- D1 为 SQLite 方言，需维护独立 schema（但 sync + auth 表结构简单）

| 资源 | 免费额度 | 付费 ($5/月) |
|------|---------|-------------|
| R2 存储 | 10 GB | $0.015/GB/月 |
| R2 出口 | **无限** | **无限** |
| R2 写操作 | 100 万次/月 | $4.50/百万次 |
| R2 读操作 | 1000 万次/月 | $0.36/百万次 |
| Workers 请求 | 10 万次/天 | 1000 万次/月 含 |
| Workers CPU | 10ms/请求 | 30s/请求 |
| Workers 请求体 | 100 MB | 100 MB |
| Workers 墙钟 | 无硬限制 | 无硬限制 |
| Workers 内存 | 128 MB | 128 MB |
| D1 存储 | 5 GB | 按量计费 |
| D1 读取 | 500 万次/天 | 按量计费 |
| D1 写入 | 10 万次/天 | 按量计费 |

### 对比决策矩阵

| 维度 | Supabase | Cloudflare | 胜出 |
|------|----------|-----------|------|
| 请求体大小 | ~4 MB | 100 MB | **Cloudflare**（决定性） |
| 出口流量费 | $0.09/GB | $0 | **Cloudflare**（决定性） |
| 基础月费 | $25 | $5 | Cloudflare |
| 冷启动 | 几十~几百 ms | < 5 ms | Cloudflare |
| Auth 集成 | 原生一行代码 | Better Auth + D1（需 PoC） | Supabase（略优） |
| 开发体验 | 一站式 | 全栈单平台（Auth + Sync + 存储） | **Cloudflare** |
| Phase 3 扩展 | 需另选实时层 | DO 天然升级 | Cloudflare |
| 同步元数据访问 | Postgres 原生 | D1 原生 binding | **Cloudflare** |

### 成本估算（5 设备 × 20 次/天 × 5 MB 平均）

| 项目 | Supabase | Cloudflare |
|------|----------|-----------|
| 基础月费 | $25 | $5 |
| 存储（10 GB） | $0.21 | $0.15 |
| 计算（~3000 次/月） | 含在 Pro 内 | 含在 $5 内 |
| 出口（~150 GB/月） | ~$13.50 | $0 |
| **合计** | **~$38.71/月** | **~$5.15/月** |

### 最终决策

**采用 Cloudflare-only 全栈**：Workers + R2 + D1 + Better Auth。

决策理由：
1. **4 MB 请求体限制是硬伤**——绕过它的分片协议/presigned URL 复杂度不亚于直接用 Workers
2. **零出口费在同步场景下价值巨大**——用户和设备增长后差距会持续放大
3. **Phase 3 升级路径清晰**——Workers → Durable Objects 是同一平台的自然演进
4. **D1 消除了 Hyperdrive 与 RLS 语义歧义**——sync 元数据查询全部走 Worker 应用层鉴权 + D1 binding
5. **单一平台运维**——Auth (Better Auth + D1) + Sync (Workers + R2 + D1)，消除 Supabase 依赖，降低运维复杂度和成本（$5/月 vs $25/月）
6. **Auth PoC 前置验证**——Better Auth + D1 作为 Sync Phase 1 Step 0，在写 sync 代码前验证 Chrome Extension OAuth 集成

### Phase 3 展望：Durable Objects

Cloudflare Durable Objects 几乎为 CRDT 实时协作量身打造：

| 能力 | 说明 |
|------|------|
| 每工作区一个 DO 实例 | 天然的文档级"房间"，强一致性 |
| 原生 WebSocket | 单 DO 可管理数千并发连接 |
| WebSocket Hibernation | 空闲连接近零成本（不计 duration） |
| 内置 SQLite | 每 DO 10 GB，可存 update log |
| WebSocket 计费 | 20 条消息 = 1 次请求（极低） |
| Alarms | 定时 compaction / 清理 |

| 资源 | 免费/天 | 付费（含/月） | 超出 |
|------|--------|-------------|------|
| DO 请求 | 10 万 | 100 万 | $0.15/百万 |
| DO duration | 13K GB-s | 40 万 GB-s | $12.50/百万 GB-s |
| SQLite 读 | 500 万/天 | 250 亿 | $0.001/百万 |
| SQLite 写 | 10 万/天 | 5000 万 | $1.00/百万 |
| SQLite 存储 | 5 GB | 5 GB-月 | $0.20/GB-月 |

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

// loro-doc.ts initLoroDoc() — 恢复 peer 身份（顺序关键）
const saved = await loadSnapshotRecord(workspaceId);
doc = new LoroDoc();
if (saved?.peerIdStr) doc.setPeerId(saved.peerIdStr);
if (saved?.snapshot) doc.import(saved.snapshot);
```

**实现注意**：
- `peerIdStr` 恢复失败（格式非法/损坏）时应降级为随机 PeerID，并记录 warning，避免启动失败
- 当前项目未上线，**允许不兼容旧快照格式**（旧 `Uint8Array` 记录可直接作废）；Phase 0 可直接升级到 `SnapshotRecord` 存储结构，必要时清空本地开发数据并重建测试数据

#### 准备项 2: VersionVector 持久化

**问题**：VV 只在内存中。重启后无法计算"上次同步以来的增量"。

**方案**：与 snapshot 一起保存在同一条 IndexedDB 记录（见上方 `SnapshotRecord`），保证 snapshot / peerId / VV 原子一致。

#### 准备项 3: `subscribeLocalUpdates` hook 点

**问题**：当前没有捕获增量 updates 的机制。未来 sync 需要知道"哪些操作还没上传"。

**方案**：在 `initLoroDoc()` 末尾注册，Phase 0 为 no-op。

```typescript
// loro-doc.ts initLoroDoc() 末尾（保存 unsubscribe，切换 workspace/reset 时清理）
const unsubLocalUpdates = doc.subscribeLocalUpdates((_bytes: Uint8Array) => {
  // Phase 0: no-op，仅预留入口
  // Phase 2+: syncManager.bufferUpdate(bytes)
});
```

**实现注意**：
- `subscribeLocalUpdates` 只捕获**本地**提交；`doc.import(remoteBytes)` 不应回灌进 pending queue（这是期望行为）
- 预留 hook 点时需保存并清理 unsubscribe，避免未来切换工作区后重复注册

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

D1 (元数据):
  workspace_backups (
    workspace_id TEXT PRIMARY KEY,
    snapshot_key  TEXT,              -- 对象存储 key
    version_vector BLOB,            -- 快照对应的 VV
    size_bytes    INTEGER,
    updated_at    TEXT
  )
```

**触发时机**：
- 手动：用户点击"备份"按钮
- 自动：每 N 分钟（如果有变更）

**基础设施**：Cloudflare R2（存储）+ Cloudflare Workers（API）+ Cloudflare D1（元数据）+ Better Auth（鉴权）。详见 §基础设施选型调研。

### Phase 2: 多端同步（非实时）

**目标**：多设备间自动同步，基于增量 updates，HTTP 推拉。

**架构**：

```
LoroDoc
  ├── subscribeLocalUpdates → pending queue (IndexedDB) → HTTP push
  └── On open → HTTP pull → doc.import()

服务端:
  对象存储: /{wsId}/updates/{hash}.bin (bytes by SHA-256)
  对象存储: /{wsId}/snapshot.bin (定期 compaction)
  D1: sync_workspaces + sync_devices + sync_updates
```

**同步协议（HTTP 包装 Loro 二进制 updates；实时阶段再复用 `loro-protocol` WebSocket 线协议）**：

```
POST /sync/push
  Body: { workspaceId, deviceId, updates, updateHash, clientVV }
  → 查重（workspaceId + updateHash）→ R2 存 bytes → DB 事务分配 seq 并写 `sync_updates`
  ← { seq, deduped, serverVV }

POST /sync/pull
  Body: { workspaceId, deviceId, lastSeq }   // lastSeq = 扫描进度 cursor
  ← { type, updates, latestSeq, nextCursorSeq, hasMore, ...snapshotFields }
  → 客户端 doc.import() 每个 update
```

**传输格式约束（必须明确）**：
- Phase 2 v1 已定：**JSON + Base64**
- 原因：实现简单、调试友好；个人同步场景下体积膨胀可接受
- 后续可升级为 `application/octet-stream`（二进制 envelope/帧）

**幂等保证**：
- 每个 update 附带 `updateHash`（SHA-256），服务端按 `(workspace_id, update_hash)` 去重
- `seq` 单调递增；客户端通过 `lastSeq`/`nextCursorSeq`（扫描进度 cursor）拉取
- 断网重试安全（同一 update 多次上传 = 幂等）

**v1 额外约束（实施计划 review 后定案）**：
- echo 过滤基于 `sync_updates.device_id`（不依赖 R2 object metadata）
- `nextCursorSeq` 可能大于本页返回 updates 的最大 seq（因为 echo 过滤），客户端必须用 `nextCursorSeq` 推进 cursor
- v1 客户端 push 不合并 pending updates，按队列逐条 push（先求正确性）

**Compaction 策略**：
- 当 update log 超过 N 条（如 1000）或总大小超过 M MB
- 服务端加载 snapshot + 所有 updates → 导出新 snapshot（或 shallow-snapshot）→ 清理旧 updates
- 若使用 shallow-snapshot，需记录其覆盖边界（frontiers/seq），并在 `pull` 时检测客户端是否仍在覆盖范围内；不在范围内时返回全量/较新 snapshot 回退
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

**基础设施**：Cloudflare Durable Objects（首选，与 Phase 1-2 的 Workers + R2 同一平台，天然升级路径）。详见 §基础设施选型调研 > Phase 3 展望。

### Phase 4: 权限与共享

**目标**：workspace 成员角色、文档级权限、审计与恢复。

**架构**：
- D1: `workspace_members (workspace_id, user_id, role)`
- Auth hook: `loro-websocket` 的 `authenticate` 回调检查权限
- 审计：保留 update log + snapshot 恢复工具
- 角色：owner / editor / viewer

---

## 现有 Supabase 资产处理

| 资产 | 处理 | 理由 |
|------|------|------|
| Supabase Auth (Google OAuth) | **迁移到 Better Auth + D1** | Auth PoC 通过后替代；Step 0 前置验证 |
| Supabase Postgres | **冻结，不再新增表** | 现有 `nodes` 表保留为历史存档；sync 元数据迁入 D1 |
| `nodes` 表 (5 个 migration) | **冻结，不继续开发** | 为行级同步设计，CRDT sync 不需要。未来可降级为搜索索引 |
| RLS 策略 | **不再使用** | sync 路径走 Worker + D1 应用层鉴权 |
| Realtime publication | **不再使用** | 行级变更流不适合 CRDT sync |
| `supabase-js` SDK | **移除** | Auth 迁移完成后删除依赖 |

---

## 风险清单

### Phase 1-2 (同步)

| 风险 | 缓解措施 |
|------|---------|
| 幂等与重复上传（断网重试） | `updateHash` 去重（`UNIQUE (workspace_id, update_hash)`） |
| snapshot 与 update 边界错位 | `seq/cursor` 单调递增 + `snapshot.covers_seq` |
| 本地 pending queue 损坏 | pending queue 持久化到 IndexedDB + 启动重放 |
| Auth 过期误以为数据丢失 | 明确 UI 状态区分"认证过期"vs"数据丢失" |
| 对象存储与 D1 部分写入成功 | 先写对象存储 → 成功后更新 D1（允许 orphan blob，异步清理） |
| echo 过滤导致 cursor 停滞 | Pull 响应返回 `nextCursorSeq`（扫描进度），客户端按该值推进 |
| D1 无 RLS | Worker 应用层鉴权为主；所有 sync 路径统一鉴权中间件 |
| Auth 迁移风险 | Better Auth PoC 前置验证（Step 0）；通过后再写 sync 代码 |
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

### 基础设施（Cloudflare）
- [Cloudflare Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare R2 Pricing](https://developers.cloudflare.com/r2/pricing/)
- [Cloudflare R2 Limits](https://developers.cloudflare.com/r2/platform/limits/)
- [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
- [Cloudflare Durable Objects + SQLite](https://blog.cloudflare.com/sqlite-in-durable-objects/)
- [Durable Objects Pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Hyperdrive + Supabase](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/supabase/)
- [Workers Smart Placement](https://developers.cloudflare.com/workers/configuration/smart-placement/)
- [Eliminating Cold Starts](https://blog.cloudflare.com/eliminating-cold-starts-2-shard-and-conquer/)

### 基础设施（Supabase）
- [Supabase Pricing](https://supabase.com/pricing)
- [Supabase Edge Functions Limits](https://supabase.com/docs/guides/functions/limits)
- [Supabase Storage Pricing](https://supabase.com/docs/guides/storage/pricing)

### Chrome 扩展
- [Chrome Extension Storage](https://developer.chrome.com/docs/extensions/mv3/storage-and-cookies)
- [Chrome MV3 Service Worker Lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
