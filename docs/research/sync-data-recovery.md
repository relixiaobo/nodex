# Sync 数据恢复 & 匿名→登录数据迁移

> 研究日期: 2026-03-01 | 研究者: nodex

## 问题一：删除 IndexedDB 后数据无法从服务端恢复

### 复现步骤

1. 登录后写一些节点，确认 push 成功（Network 面板可见）
2. 在 Side Panel **未关闭**的情况下，打开 DevTools → Application → IndexedDB → 删除 `nodex` 数据库
3. 关闭 Side Panel
4. 重新打开 Side Panel
5. **预期**：从服务端拉回数据，恢复原有节点
6. **实际**：显示全新空白 soma，等很久数据也不回来

### 已完成的架构修复（b4122a6）

**Bootstrap 分两条路径**：

```
initLoroDoc() → hadSnapshot?
  ├─ YES → void initAuth()  → setReady(true)     // 正常启动
  └─ NO  → await initAuth() → await waitForFirstSync(15s)
           → re-seed → setReady(true)             // 阻塞等恢复
```

改动文件：
- `src/lib/loro-doc.ts` — `initLoroDoc()` 返回 `{ hadSnapshot: boolean }`
- `src/lib/sync/sync-manager.ts` — 新增 `waitForFirstSync(timeout)`
- `src/stores/workspace-store.ts` — `initAuth()` 内部 await `startSyncIfReady()`
- `src/entrypoints/sidepanel/App.tsx` — Bootstrap 分支逻辑

### 未解决：pull 为什么不返回数据？

尽管架构修改后 bootstrap 正确等待 sync，但 pull 仍然没有恢复数据。需要排查：

1. **Auth token 是否有效** — `initAuth()` → `getCurrentUser()` 是否返回 user？
   - 如果返回 null → sync 不启动 → 没有 pull
   - 调试方法：在 `initAuth` 添加 console.log

2. **Pull 请求是否发出** — Network 面板是否有 pull 请求？
   - 如果没有 → `startSyncIfReady()` 未执行或抛错
   - `syncManager.start()` 内部 `void this.syncOnce()` 也是 fire-and-forget

3. **Pull 响应是否包含数据** — 检查 response body
   - `response.type` 是 `'snapshot'` 还是 `'incremental'`？
   - `response.updates` 数组是否为空？
   - `response.snapshot` 是否存在？

4. **importUpdates 是否成功** — 数据导入后 `rebuildMappings()` 节点数是多少？
   - `console.log('[sync] importUpdates, nodes after:', nodexToTree.size)`

5. **dbPromise 缓存失效** — 删除 IndexedDB 时 panel 还开着
   - `openDB()` 缓存了旧连接 → `persistSnapshot()` 静默失败
   - 关闭 panel 时 `beforeunload` → `persistSnapshot()` → 写入失效的 DB 连接
   - 重启后新 `openDB()` 创建新库 → 空的

### 建议调试方案

在关键路径添加 console.log（临时，解决后删除）：

```typescript
// workspace-store.ts initAuth
console.log('[bootstrap] initAuth: user=', user?.id, 'wsId=', currentWsId);

// sync-manager.ts start()
console.log('[sync] start: wsId=', workspaceId, 'lastSeq=', this.lastSeq);

// sync-manager.ts pull()
console.log('[sync] pull response:', {
  type: response.type,
  hasSnapshot: !!response.snapshot,
  updateCount: response.updates.length,
  nextCursorSeq: response.nextCursorSeq,
});

// sync-manager.ts syncOnce() catch
console.error('[sync] syncOnce error:', err);

// loro-doc.ts importUpdates()
console.log('[sync] importUpdates, nodes after rebuild:', nodexToTree.size);
```

---

## 问题二：匿名使用 → 登录后本地数据丢失

### 场景

1. 用户未登录使用 soma，写了很多笔记
2. 用户注册/登录
3. 之前写的笔记全部消失

### 根因

**容器节点 ID 包含 workspace ID 前缀**：

```
未登录: workspaceId = "ws_Abc123xYz"
  → 容器 ID: "ws_Abc123xYz_LIBRARY", "ws_Abc123xYz_SCHEMA", ...
  → 所有用户节点挂在这些容器下

登录后: workspaceId = "user_xyz789" (server 返回的 user.id)
  → 容器 ID: "user_xyz789_LIBRARY", "user_xyz789_SCHEMA", ...
  → 完全不同的 ID → 旧数据变成孤儿节点
```

### signInWithGoogle() 当前行为

```typescript
signInWithGoogle: async () => {
  const user = await authSignIn();
  set({ currentWorkspaceId: user.id, ... }); // ← workspace ID 直接切换
  void startSyncIfReady();                    // ← 用新 ID sync
  // ❌ 没有迁移旧 ws_xxx 数据
  // ❌ 没有 re-init LoroDoc
};
```

问题列表：
1. `currentWorkspaceId` 变了但 `initLoroDoc()` 没重新调用 → 内存中 LoroDoc 还用旧 ID
2. 旧容器节点（`ws_xxx_LIBRARY` 等）变成孤儿
3. 新 sync 用 `user.id` 作为 key → push/pull 都对不上旧数据
4. 下次重启 `initLoroDoc(user.id)` 创建全新空 LoroDoc → 旧 `ws_xxx` 快照永远不再加载

### 修复方案

**登录时执行一次性数据迁移：**

```
signInWithGoogle():
  1. 记录 oldWsId = currentWorkspaceId (ws_xxx)
  2. 完成 OAuth → 获得 user.id
  3. newWsId = user.id
  4. 如果 oldWsId !== newWsId && LoroDoc 有数据:
     a. 遍历 LoroDoc 中所有 oldWsId 前缀的容器节点
     b. 创建 newWsId 对应的容器节点（如果不存在）
     c. 将旧容器的 children 移动到新容器下
     d. 删除旧容器节点
     e. 更新 workspace home node
     f. commitDoc('system:migration')
  5. 重新初始化: initLoroDoc(newWsId)
  6. 开始 sync → push 迁移后的数据到服务端
```

关键点：
- 容器 ID 列表在 `WORKSPACE_CONTAINERS` 常量中定义（后缀固定：`_LIBRARY`, `_SCHEMA`, `_INBOX` 等）
- 只需遍历已知后缀，替换前缀即可
- 迁移后旧快照可以删除（`deleteSnapshot(oldWsId)`）

### 涉及文件

| 文件 | 改动 |
|------|------|
| `src/stores/workspace-store.ts` | `signInWithGoogle()` 添加迁移逻辑 |
| `src/lib/loro-doc.ts` | 可能需要 `migrateWorkspaceId(oldId, newId)` 工具函数 |
| `src/lib/loro-persistence.ts` | 迁移后删除旧快照 |
| `src/entrypoints/sidepanel/App.tsx` | `seedWorkspace()` 调用后可能需要 re-init |

---

## 优先级

1. **P0**: 问题一 — pull 不返回数据的 root cause（用户数据丢失风险）
2. **P1**: 问题二 — 匿名→登录数据迁移（影响新用户体验）
# Sync Data Recovery — codex task
