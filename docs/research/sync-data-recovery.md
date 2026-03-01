# Sync 数据恢复 & 匿名登录迁移（诊断优先版）

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

### Root Cause 状态

**当前还不能下最终 root cause 结论，必须先诊断。**

已确认事实：
- 架构时序问题已在 `b4122a6` 修复（无快照时会阻塞等待首轮 sync）
- 但实际仍会出现恢复后空白 workspace

待验证候选原因（按优先级）：
1. `initAuth/startSyncIfReady` 没真正拉起 sync（auth/token/调用链断裂）
2. pull 请求发出但响应数据为空（服务端确实没数据或游标不对）
3. pull 有数据但 `importUpdates` 异常或未生效
4. 游标推进与导入结果不一致（同步看似成功但数据未进入文档）

说明：此前“回声过滤导致恢复失败”仅作为低优先候选，不作为当前主因。

### 诊断执行顺序（先做）

先不做抽象，先加 5 个临时日志，复现一次，拿证据：

1. `workspace-store.ts / initAuth`  
   输出：`user?.id`、`currentWorkspaceId`、`hasToken`
2. `workspace-store.ts / startSyncIfReady`  
   输出：是否进入 `syncManager.start`、`workspaceId`、`deviceId`
3. `sync-manager.ts / start + pull`  
   输出：`lastSeq`、pull 请求参数、响应 `type/latestSeq/nextCursorSeq/updates.length`
4. `loro-doc.ts / importUpdates`  
   输出：导入前后节点数、异常栈（若抛错）
5. `sync-manager.ts / pull 结束`  
   输出：是否保存 snapshot、是否保存 cursor、新 cursor 值

复现流程：
1. 有数据账号下确保服务端已有历史更新
2. 删除本地 IndexedDB 后重启 Side Panel
3. 抓一轮完整日志，确认断点层级（auth / pull / import / cursor）

### 修复策略（诊断后决策）

Phase 1 只做“最小修复”，不预设大抽象：

- 如果是 auth/token 问题：修 `initAuth/startSyncIfReady` 调用链
- 如果是 pull 返回空：修请求参数/游标来源/workspace 绑定
- 如果是 import 失败：修 `importUpdates` 异常处理与导入顺序
- 如果是 cursor 误推进：修 `pull` 内 cursor 保存时机

仅当 Phase 1 证据显示“恢复成功判定长期易回归”时，再在 Phase 2 引入轻量结果报告机制（而不是先建完整框架）。

### 验收标准

- 无本地快照 + 服务端有数据：恢复后节点数 > 0
- 无本地快照 + 服务端无数据：正常进入空 workspace（非假恢复）
- 日志可明确定位每次恢复失败发生在哪一层

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
- **明确采用方案 B（正确）**：创建新 workspace 对应容器，把旧容器的 `children` 搬到新容器，再删除旧容器
- **禁止方案 A（错误）**：直接 move 旧容器节点本身（会保留旧 ID 前缀，后续查找错配）
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
- `src/lib/sync/sync-manager.ts`（先加诊断日志，再按 root cause 最小修复）
- `src/entrypoints/sidepanel/App.tsx`（若命中恢复判定问题，再做最小调整）
- `tests/vitest/sync-manager.test.ts`
- `tests/vitest/workspace-store.test.ts`
- （如新增）`tests/vitest/workspace-migration.test.ts`

### 验收标准

- 匿名写入后登录：数据仍在，且后续可同步
- 重启后仍加载登录后的 workspace 且数据完整
- 迁移失败不会把用户置于“新 workspace 空白、旧数据不可达”的状态

---

## 分阶段实施建议

1. **Phase 1（先做）**：P0 加日志 + 复现 + 定位 + 最小修复
2. **Phase 2**：P1 原子迁移（明确“新容器 + 搬 children”）
3. **Phase 3**：清理 debug 日志 + 回归测试 + 可选的 `openDB` 自愈补强
