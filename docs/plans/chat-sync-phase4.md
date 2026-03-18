# Chat 持久化 Phase 4：跨设备同步

> 状态: Active
> 日期: 2026-03-18
> 来源: `docs/_archive/plans/ai-context-management.md` §Phase 4 + 代码审计结果

## 核心原则

**同步完整原始对话，不是压缩后的摘要。** 用户在乎原始聊天记录，压缩是系统内部优化，两者独立。

## 架构

不走 Loro CRDT（节点 LoroDoc 已经很大，Chat 冲突场景有限）。独立通道：

```
D1: chat_sessions（id, user_id, workspace_id, title, message_count, revision, timestamps）
R2: chat/{workspace_id}/{session_id}.json（完整 ChatSession JSON，图片已剥离）
```

## 代码审计结论（2026-03-18）

| 项目 | 状态 |
|------|------|
| `ChatSession.syncedAt` / `revision` | ✅ 已预留（ai-chat-tree.ts:30-31） |
| `ChatSession.bridges` | ✅ Phase 3 已实现 |
| `ChatSessionMeta { id, title, updatedAt }` | ✅ 与 D1 表设计一致 |
| `stripMappingImagesForPersistence` | ✅ 图片在持久化前剥离 |
| 后端 auth（`requireAuth`） | ✅ 可复用 |
| Per-session Agent（`agentRegistry`） | ✅ 已支持 |
| IndexedDB | v3（需升 v4 加 revision 索引） |
| `persistChatSession` | 无 debounce（需加 200ms） |

## API 设计

### `PUT /api/chat/sessions/{id}`（Push）

```
Request:
  Headers: Authorization (Bearer token)
  Body: { session: ChatSession, baseRevision: number, workspaceId: string }

Server:
  1. 验证 auth + workspace 成员资格
  2. 查 D1: SELECT revision FROM chat_sessions WHERE id = ? AND workspace_id = ?
  3. if not found → 新建，revision = 1
  4. if remote.revision == baseRevision → 接受，revision++，写 R2 + 更新 D1
  5. if remote.revision != baseRevision → 409 Conflict + 返回远端 session

Response 200: { revision }
Response 409: { conflict: true, remoteSession: ChatSession, remoteRevision: number }
```

### `GET /api/chat/sessions?workspaceId={wsId}&since={timestamp}`（Pull）

```
Request:
  Headers: Authorization (Bearer token)
  Query: workspaceId, since (updatedAt 阈值)

Server:
  1. 查 D1: SELECT * FROM chat_sessions WHERE workspace_id = ? AND updated_at > ?
  2. 批量从 R2 读取 session JSON

Response 200: { sessions: ChatSession[], metas: ChatSessionMeta[] }
```

### `DELETE /api/chat/sessions/{id}`（删除）

```
预留，v1 不实现。本地删除不同步。
```

## D1 Schema

```sql
CREATE TABLE chat_sessions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  workspace_id  TEXT NOT NULL,
  title         TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  revision      INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  UNIQUE(workspace_id, id)
);

CREATE INDEX idx_chat_sessions_ws_updated
  ON chat_sessions(workspace_id, updated_at);
```

## 客户端同步流程

### Push

```
syncChatSessions() {
  1. 从 IndexedDB 查询 updatedAt > syncedAt 的 session
  2. 逐个 PUT /api/chat/sessions/{id}
     body: { session (图片已剥离), baseRevision: session.revision }
  3. 200 → 更新本地 syncedAt + revision
  4. 409 → 冲突处理（见下方）
}
```

### Pull

```
pullChatSessions() {
  1. GET /api/chat/sessions?since={lastPullAt}
  2. 遍历返回的 sessions:
     a. 本地不存在 → 直接写入 IndexedDB
     b. 本地存在且 localSession.updatedAt <= localSession.syncedAt → 远端覆盖本地
     c. 本地存在且有未同步修改（updatedAt > syncedAt）→ 标记冲突
  3. 更新 lastPullAt
}
```

### Pull 守卫

streaming 进行中（`agent.state.isStreaming === true`）时，跳过该 session 的 pull。避免 pull 写入 IndexedDB 与 `turn_end` 持久化竞争。

### 冲突处理（v1 简化）

**不做三选一弹窗。** v1 采用 LWW（Last Write Wins）：
- Push 遇到 409 → pull 远端版本 → 如果远端 `updatedAt` > 本地 `updatedAt` → 用远端覆盖
- 否则 → 用本地强制覆盖（`baseRevision = remote.revision` 重新 push）
- toast 通知用户 "Chat synced from another device"

**已知限制**：不做 mapping-level merge。同一 session 多设备并发编辑不支持。

### SyncManager 集成

在 `syncOnce()` 中，Loro push/pull 之后追加：

```typescript
async syncOnce() {
  await this.push();      // Loro
  await this.pull();      // Loro
  await syncChatSessions(); // Chat（新增）
}
```

复用相同的 30s 定时 + visibilitychange + nudge 触发。

## persistChatSession debounce

当前每次 turn_end / title 更新直接写 IndexedDB。加 200ms trailing debounce：

```typescript
const debouncedPersist = debounce(persistChatSessionImpl, 200);

export async function persistChatSession(agent: Agent): Promise<void> {
  // 立即更新内存中的 updatedAt（保证 UI 响应）
  // 实际 IndexedDB 写入 debounce 200ms
  debouncedPersist(agent);
}
```

## IndexedDB 升级 v3 → v4

```typescript
if (oldVersion < 4) {
  // 给 sessions store 加 revision 索引（Pull 时快速判断）
  // 无需数据迁移，索引自动构建
}
```

## 文件清单

### 后端

| 文件 | 动作 | 内容 |
|------|------|------|
| `server/src/routes/chat.ts` | 新建 | PUT push + GET pull 路由 |
| `server/src/lib/db.ts` | 修改 | 新增 chat_sessions 表 |
| `server/src/index.ts` | 修改 | 注册 chat 路由 |

### 客户端

| 文件 | 动作 | 内容 |
|------|------|------|
| `src/lib/ai-persistence.ts` | 修改 | DB v4 迁移 + push/pull 逻辑 + debounce |
| `src/lib/sync/sync-manager.ts` | 修改 | `syncOnce()` 追加 `syncChatSessions()` |
| `src/lib/ai-service.ts` | 修改 | `persistChatSession` 加 debounce wrapper |

## 验证要点

- [ ] 新设备登录 → pull 所有 chat 历史 → IndexedDB 有数据 → Chat 面板可打开历史 session
- [ ] 设备 A 发消息 → 30s 后设备 B pull → 看到新消息
- [ ] 设备 A 和 B 各自发消息 → push 冲突 → LWW 解决 → toast 通知
- [ ] streaming 进行中 → pull 跳过该 session → streaming 结束后下次 pull 正常
- [ ] 大对话（100+ 轮）→ R2 存储 + pull 正常
- [ ] 图片消息 → 已剥离为 placeholder → R2 中无 base64 blob
- [ ] `npm run verify` 全通过
