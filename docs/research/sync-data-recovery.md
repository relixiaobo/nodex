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

### Root Cause（已解决，2026-03-01）

**问题不在 pull 侧，而在 push 侧 — 本地操作在推送前就已丢失。**

#### 诊断过程

1. **Pull 侧分析**：服务端返回 2514 条增量更新，全部为 `type: 'incremental'`（无 snapshot）。导入后 tree 节点数始终为 0（seed 容器除外）。
2. **Byte 验证**：创建空白 LoroDoc 导入 pull bytes → 0 节点。Hex header `6c 6f 72 6f`（"loro"）= 合法格式，但内容不含树操作。
3. **Push 侧验证（关键突破）**：在 `subscribeLocalUpdates` 回调中验证捕获的 bytes → 31 次捕获全部 `testNodes=0`。**bytes 在源头就不含树操作。**
4. **Vitest 对照**：独立测试确认 Loro API 工作正常（`subscribeLocalUpdates` → `import` → 树节点正确重建）。

#### Root Cause

`loro-doc.ts` 的 `subscribeLocalUpdates` 回调有一个状态门控：

```typescript
if (syncManager.getState().status === 'local-only') return; // ← 丢弃！
```

Bootstrap 时序竞态：
1. `seedWorkspace()` → `commitDoc('system:bootstrap')` → `subscribeLocalUpdates` 触发 → status = `'local-only'` → **bytes 丢弃**
2. `void initAuth()` — fire-and-forget，异步执行
3. `setReady(true)` → UI 渲染 → 用户创建节点 → `commitDoc()` → `subscribeLocalUpdates` 触发 → status 仍为 `'local-only'` → **bytes 丢弃**
4. `initAuth()` 最终完成 → `syncManager.start()` → status 变为 `'synced'`
5. 此后新操作被捕获，但**树创建操作**已在步骤 1-3 中被丢弃
6. 服务端只收到文本编辑操作（无树结构）→ pull 回来 0 节点

#### 修复

在 `startSyncIfReady()` 中，`syncManager.start()` 之前导出完整文档状态并入队：

```typescript
const doc = getLoroDoc();
const fullUpdate = doc.export({ mode: 'update' });
if (fullUpdate.length > 0) {
  await enqueuePendingUpdate(currentWorkspaceId, fullUpdate);
}
await syncManager.start(currentWorkspaceId, token, deviceId);
```

- `doc.export({ mode: 'update' })` 包含所有已提交操作（含被丢弃的树创建）
- CRDT 导入幂等 → 重复推送安全
- 首次 `syncOnce()` push 阶段会发送此全量更新

### Root Cause #2：Pull 完成后 UI 不更新（ab4714b）

修复推送后验证恢复流程，发现 pull 成功导入所有 2698 条更新，但 UI 始终显示空白。

#### 原因

`importUpdates()` 中的通知时序错误：

```typescript
export function importUpdates(data: Uint8Array): void {
  doc.import(data);       // 1. 触发 doc.subscribe() → notifySubscribers()（映射未重建）
  rebuildMappings();       // 2. 重建映射，但不再通知
}
```

`doc.subscribe()` 回调在 `doc.import()` 内部同步触发，此时 `rebuildMappings()` 尚未执行。
React 的 `useSyncExternalStore` 在 subscriber 回调中立即调用 `getSnapshot()` → 读取旧的 `nodexToTree` 映射 → 新节点返回 null（与之前相同）→ 跳过 re-render。

`rebuildMappings()` 之后映射正确了，但没有第二次通知 → UI 卡在旧状态。

#### 修复

在 `importUpdates()` 末尾显式调用 `notifySubscribers()`：

```typescript
export function importUpdates(data: Uint8Array): void {
  doc.import(data);
  rebuildMappings();
  notifySubscribers(); // ← 映射正确后通知 React
}
```

同时将 `waitForFirstSync` 超时从 15s 增加到 60s（2698 条 × 50/批 = 54 次 HTTP ≈ 17s）。

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

1. ~~**P0**: 问题一 — 数据恢复~~ ✅ 已解决（push 全量导出 66f62d1 + pull 后 UI 通知 ab4714b）
2. **P1**: 问题二 — 匿名→登录数据迁移（影响新用户体验）
