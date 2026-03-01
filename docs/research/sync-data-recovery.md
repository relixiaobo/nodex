# Sync 数据恢复 & 匿名登录迁移（Root Cause + 方案）

> 日期: 2026-03-01
> 分支: `cc/sync-data-recovery`

## 目标

解决两个高优先级问题：

1. **P0: 本地快照缺失时，pull 不恢复数据**（用户看到空白 workspace）
2. **P1: 匿名使用后登录，workspace 切换导致本地数据“消失”**

---

## P0: 本地快照缺失后无法恢复

### 现状链路（已在 `b4122a6` 修复的部分）

- `initLoroDoc()` 返回 `{ hadSnapshot }`
- 无快照时，bootstrap 会 `await initAuth()` + `await waitForFirstSync(15s)` 再渲染
- `initAuth()` 里已改为 `await startSyncIfReady()`，减少竞态

这一步解决的是“启动时序”，不是“pull 数据正确性”。

### Root Cause（已确认）

#### RC-1: 恢复路径把“sync 结束”当成“数据已恢复”

当前恢复路径只看 `SyncManager` 状态（`synced/error`），没有验证“是否真的导入了远端数据”。

`pull` 存在一种静默失败形态：

- 服务端返回 `latestSeq > lastSeq`
- 但客户端实际导入条数为 0（例如：回声过滤后为空、R2 缺 blob、或游标不一致）
- 客户端仍推进 `cursor = nextCursorSeq`，并保存快照/游标
- 最终状态是 `synced`，但文档仍为空

结果：恢复流程误判成功，用户看到空白 workspace。

#### RC-2: 缺少恢复期关键可观测性，定位成本高

当前日志无法直接回答以下关键问题：

- pull 是否真正发出
- 响应里 `latestSeq / nextCursorSeq / updates.length` 是多少
- 客户端实际 `importUpdates` 成功次数/字节数
- `waitForFirstSync` 结束时是“导入成功”还是“空同步”

因此问题会表现为“看起来同步了，但数据没回来”。

### 复现步骤（可稳定）

#### 复现 A（恢复误判）

1. 准备一个服务端 `latestSeq > 0` 的 workspace
2. 让客户端从 `lastSeq=0` 发起 pull
3. 构造返回使客户端 `updates.length = 0`（例如回声过滤后为空）
4. 观察客户端状态变为 `synced`，但节点数不变（仍为空）

#### 复现 B（快照缺失 + 恢复流程）

1. 让本地 `hadSnapshot=false` 启动恢复路径
2. pull 返回后未导入任何更新
3. `waitForFirstSync` 仍 resolve，UI 渲染空 workspace

### 最佳修复方案

#### 方案核心

把恢复流程从“状态驱动”升级为“结果驱动”：

- **必须有恢复证据**（snapshot 导入或 incremental 导入）才算恢复成功
- 否则标记为恢复失败并保留可重试状态，不推进恢复游标

#### 客户端改动（建议）

1. `sync-manager.ts`
- 为每轮 `syncOnce/pull` 生成 `SyncCycleReport`：
  - `requestedLastSeq`
  - `responseLatestSeq`
  - `responseNextCursorSeq`
  - `importedUpdateCount`
  - `importedBytes`
  - `hadSnapshotPayload`
- 恢复模式下新增判定：
  - `responseLatestSeq > requestedLastSeq` 且 `importedUpdateCount === 0` → 视为失败，不写入新 cursor，状态置 `error`（可重试）

2. `App.tsx`（bootstrap）
- `waitForFirstSync()` 不仅等待状态，还要读取首次同步报告
- 仅当报告满足“有恢复证据”或“服务端确实空 workspace（latestSeq=0）”时继续渲染

3. `sync-protocol.ts` + 服务端 pull 协议（可选但强烈建议）
- pull 响应补充诊断字段（仅 debug/内部）：
  - `filteredEchoCount`
  - `missingBlobCount`
- 用于快速区分“服务端有数据但客户端收不到”与“服务端确实无数据”

4. `loro-persistence.ts`
- `openDB()` 增强自愈：连接 `onclose/onversionchange` 时重置 `dbPromise`
- 避免 IndexedDB 被手动删除/升级后复用失效连接

### 验收标准

- 无本地快照时：
  - 若服务端有数据，首次恢复后节点数 > 0
  - 若服务端无数据，正常进入空 workspace（但报告明确 `latestSeq=0`）
- 不再出现“状态 synced 但文档为空且 cursor 已前进”的静默失败

---

## P1: 匿名使用后登录，数据丢失

### Root Cause（已确认）

`signInWithGoogle()` 当前行为：

- 直接把 `currentWorkspaceId` 从 `ws_xxx` 切到 `user.id`
- 立即启动 sync
- **没有迁移旧 workspace 数据**
- **没有重建 Loro 当前工作区上下文**

导致结果：

1. 内存里的 LoroDoc 仍是旧 workspace
2. 持久化 key（snapshot/cursor）与新的 `currentWorkspaceId` 不一致
3. 下次重启按 `user.id` 加载时拿到空快照，旧数据“看起来丢失”

### 复现步骤（可稳定）

1. 未登录状态写入若干节点（workspace=`ws_xxx`）
2. 调用 Google 登录
3. 登录后 workspace 切到 `user.id`
4. 重启 Side Panel
5. 旧节点不再出现

### 最佳修复方案

#### 方案核心

在登录时执行一次**原子 workspace 迁移**，保证“先迁移成功，再切 workspace，再启动 sync”。

#### 迁移流程（建议）

1. `workspace-store.ts / signInWithGoogle()`
- 登录前记录 `oldWsId`
- 登录成功得到 `newWsId = user.id`
- `syncManager.stop()`（防止迁移期间并发同步）

2. 若 `oldWsId !== newWsId`，执行迁移（新增 `workspace-migration.ts`）
- 确保当前 LoroDoc 处于 `oldWsId`
- 在文档内创建/确保 `newWsId` 根节点
- 将容器节点（`CONTAINER_IDS.*`）及必要根子节点挂到 `newWsId` 下
- 清理旧根节点（若空）
- `commitDoc('system:workspace-id-migration')`
- 导出当前快照并保存到 `newWsId` 的 snapshot key
- 清理 `oldWsId` 的 snapshot/cursor/pending

3. 重新初始化新 workspace 上下文
- `initLoroDoc(newWsId)`
- 更新 store：`currentWorkspaceId = newWsId`
- `await startSyncIfReady()`

4. 故障回滚策略
- 迁移任一步失败：
  - 不切换 `currentWorkspaceId`
  - 保留 `oldWsId` 可继续使用
  - 显示错误并允许用户重试迁移

### 涉及文件清单

- `src/stores/workspace-store.ts`（登录流程改造，串行化迁移）
- `src/lib/loro-doc.ts`（必要的 workspace 迁移辅助 API）
- `src/lib/loro-persistence.ts`（snapshot/cursor/pending 清理与重命名支持）
- `src/lib/sync/sync-manager.ts`（恢复报告 + 恢复成功判定）
- `src/entrypoints/sidepanel/App.tsx`（恢复渲染门槛）
- `tests/vitest/sync-manager.test.ts`
- `tests/vitest/workspace-store.test.ts`
- （如新增）`tests/vitest/workspace-migration.test.ts`

### 验收标准

- 匿名写入后登录：数据仍在，且后续可同步
- 重启后仍加载登录后的 workspace 且数据完整
- 迁移失败不会把用户置于“新 workspace 空白、旧数据不可达”的状态

---

## 分阶段实施建议

1. **Phase 1（先做）**：P0 可观测性 + 恢复成功判定（阻断静默失败）
2. **Phase 2**：P1 原子迁移（登录切换无数据丢失）
3. **Phase 3**：清理 debug 日志 + 回归测试 + 端到端验证

