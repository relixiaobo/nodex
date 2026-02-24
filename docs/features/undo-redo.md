# Feature: 撤销与重做

> Phase 2 | 文本撤销已有（ProseMirror 内置 History），导航撤销已有，结构性撤销已实现（Loro UndoManager，2026-02-20），统一时间线已实现（2026-02-23）

## 概述

用户通过 `Cmd+Z` 撤销上一步操作，`Cmd+Shift+Z` 重做被撤销的操作。撤销系统覆盖三个层次：文本编辑、节点操作、导航。三者通过**统一时间线**无缝衔接，按时间顺序撤销最近的操作。

## 当前实现状态

| 层次 | 状态 | 说明 |
|------|------|------|
| 文本编辑撤销 | ✅ 已有 | ProseMirror History（`prosemirror-history` 包） |
| 导航撤销 | ✅ 已有 | `navUndoStack` / `navRedoStack`，`use-nav-undo-keyboard.ts` |
| 节点操作撤销 | ✅ 已实现 | Loro UndoManager，2026-02-20 |
| 统一时间线 | ✅ 已实现 | `undo-timeline.ts` 时间线索引 + `performTimelineUndo/Redo`，2026-02-23 |

## 架构设计

### 统一时间线（2026-02-23 升级）

旧方案使用固定优先级级联（structural → nav），不尊重时间顺序。新方案在 Loro UndoManager 和 navUndoStack 之上增加一个**轻量时间线索引**，记录操作类型的时间顺序：

```
undoTimeline: ['structural', 'nav', 'expand', 'structural', 'nav']
                                                    ↑ 最近

Cmd+Z → pop 最后一个条目 → 委派给对应子系统（Loro / navUndo）
```

#### 依赖图（无循环）

```
undo-timeline.ts  ← 纯数据结构，零导入
     ↑                    ↑
loro-doc.ts         ui-store.ts
(commitDoc 推入        (navigateTo/goBack/goForward 推入 'nav',
 'structural')          toggleExpanded/setExpanded 推入 'expand')
     ↑                    ↑
use-nav-undo-keyboard.ts
(orchestrates undo/redo via performTimelineUndo/Redo)
```

#### Loro mergeInterval 兼容

Loro UndoManager 的 `mergeInterval: 500ms` 会合并快速连续操作。时间线可能多出条目。处理方式：undo 时如果 `canUndoDoc()` 为 false（Loro 已合并/耗尽），跳过该条目继续下一个。500ms 内操作本就被用户感知为一步，丢失细粒度可接受。

### 三层撤销栈

```
┌─────────────────────────────────────────────────────┐
│  Cmd+Z 按下                                          │
│                                                      │
│  1. 编辑器内？→ ProseMirror History 处理               │
│     （focusedNodeId !== null 或 contentEditable 聚焦）│
│                                                      │
│  2. 统一时间线 → performTimelineUndo()                │
│     └ pop 时间线栈顶条目                              │
│     └ 'structural' → canUndoDoc()? undoDoc() : skip  │
│     └ 'expand' → expandUndoStack? expandUndo() :     │
│                  skip                                  │
│     └ 'nav' → navUndoStack.length > 0? navUndo() :  │
│               skip                                    │
│     └ 跳过的条目继续 pop 下一个                        │
│     └ 栈空 → 无操作                                   │
└─────────────────────────────────────────────────────┘
```

### 分派规则

当用户按下 `Cmd+Z` 时：

1. **先撤销文本编辑** — 如果当前节点的 ProseMirror 编辑器处于聚焦状态，ProseMirror History 接管撤销
2. **再按时间线分派** — 编辑器未聚焦时，从统一时间线栈顶 pop 条目，委派给对应子系统（Loro structural 或 navUndo），按时间逆序执行

## 行为规格

### 文本编辑撤销

- 所有在节点中输入的文字变更、格式变更（加粗、斜体、删除线、代码、高亮）均可撤销
- **连续快速打字视为一次操作** — 撤销时不逐字回退，而是回退到上一次停顿前的状态
  - ProseMirror History 默认实现：按输入时间自动分组
- 仅当 ProseMirror 编辑器处于挂载状态时有效
- 失焦（blur）后文本已持久化到 store，ProseMirror History 在下次聚焦时重置

### 节点操作撤销 — 已实现（Loro UndoManager）

#### 可撤销的操作

| 类别 | 操作 |
|------|------|
| 创建 | 回车新建节点 |
| 删除 | 移入回收站 / 恢复 |
| 移动 | 缩进（Tab）、反缩进（Shift+Tab）、上移（Cmd+Shift+↑）、下移（Cmd+Shift+↓）、拖拽排序 |

#### 实现机制

- `node-store.ts` 中每个结构性操作（createChild、moveNodeTo、indentNode、outdentNode、moveNodeUp、moveNodeDown、trashNode、restoreNode）结束时调用 `loroDoc.commitDoc()`
- `commitDoc()` 提交后自动推入 `pushUndoEntry('structural')` 到统一时间线
- `UndoManager` 配置 `mergeInterval: 500ms`，连续快速操作合并为一步
- `undoDoc()` / `redoDoc()` 后调用 `rebuildMappings()` 同步 TreeID 映射（Loro undo/redo 会创建新 TreeID）
- 种子数据用 `commitDoc('__seed__')` 提交，UndoManager 配置 `excludeOriginPrefixes: ['__seed__']` 防止污染历史

#### 不可撤销的操作

| 操作 | 原因 |
|------|------|
| 永久删除（清空回收站） | 数据库层面不可逆 |
| applyTag / removeTag | 作为原子操作的子步骤，由上层操作统一控制 commit |

### 导航撤销

当前已实现。`navUndoStack` / `navRedoStack` 存储 `{ panelHistory, panelIndex }` 快照。

- `navigateTo()` 自动 push 快照到 undo 栈，同时推入 `pushUndoEntry('nav')` 到统一时间线
- `goBack()` / `goForward()` 同样推入 `pushUndoEntry('nav')`
- `navUndo()` → 恢复上一个导航快照
- `navRedo()` → 恢复下一个导航快照
- Session-only，不持久化到 storage

### 历史管理规则

| 规则 | 说明 |
|------|------|
| 新操作清空 redo | 执行新操作后，统一时间线和子系统的 redo 栈都被清空 |
| 最大步数 | Loro UndoManager 默认 100 步 |
| 快速连续 Cmd+Z | 逐步回退，不跳过或重复 |
| 展开/折叠纳入时间线 | 展开/收起推入 `'expand'` 条目到时间线，Cmd+Z 可撤销 |
| 空操作不记录 | 操作结果与原状态相同时不入栈 |
| 撤销失败 | 跳过该步，其余历史正常可用 |
| Loro mergeInterval 跳过 | 时间线条目对应的 Loro 步骤被合并时自动跳过 |

### 特殊场景

| 场景 | 行为 |
|------|------|
| 创建节点后导航再 Cmd+Z | 先撤销导航（时间线最近），而非创建节点 |
| 创建标签并应用到节点 | 一步操作。撤销时移除标签关系，tagDef 保留 |
| 撤销 Zoom 导航 | 回到导航前的视图位置（navUndo 处理） |
| 展开/折叠 Cmd+Z | 先撤销展开/收起，再撤销更早的操作 |
| 文本编辑结果与原文相同 | 不记录（ProseMirror 自动处理） |
| 撤销失败 | 跳过，其余历史正常 |

## 实现范围

### 已完成

| 功能 | 说明 |
|------|------|
| 文本撤销 | ProseMirror `prosemirror-history` |
| 导航撤销 | navUndoStack + use-nav-undo-keyboard |
| 结构性节点操作撤销 | Loro UndoManager，2026-02-20 |
| 统一时间线 Undo/Redo | `undo-timeline.ts` + `performTimelineUndo/Redo`，2026-02-23 |

### Phase 2（扩展操作撤销）

| 功能 | 优先级 |
|------|--------|
| 标签应用/移除撤销 | 中 |
| 字段应用/移除撤销 | 中 |
| checkbox 切换撤销 | 中 |
| 批量操作撤销 | 中（依赖多选） |

## 决策记录

| 日期 | 决策 | 原因 |
|------|------|------|
| 2026-02-14 | 三层优先级：文本 → 节点操作 → 导航 | 与用户直觉一致：先撤销最近的细粒度操作，再撤销粗粒度操作 |
| 2026-02-14 | 节点操作撤销栈 100 步上限 | 平衡内存开销与实用性 |
| 2026-02-14 | ~~展开/折叠不入撤销栈~~ (已变更 2026-02-24) | 原因：视图偏好不是数据变更。后改为纳入时间线，解决 undo 后看不到被隐藏子节点变化的问题 |
| 2026-02-14 | 创建标签/字段并应用 = 一步撤销 | 用户感知为单一动作；撤销时 tagDef/attrDef 保留以防被其他节点引用 |
| 2026-02-20 | 使用 Loro UndoManager 而非 Command Pattern | Phase 1 已迁移到 Loro CRDT，UndoManager 是零成本升级，无需手动记录正/逆操作 |
| 2026-02-20 | rebuildMappings() 在 undo/redo 后调用 | Loro undo/redo 会创建新 TreeID，必须同步 nodexToTree/treeToNodex 映射 |
| 2026-02-23 | 统一时间线替代固定优先级级联 | 旧级联不尊重时间顺序（创建节点→导航→Cmd+Z 会跳过导航先撤销创建）。时间线索引轻量（仅字符串数组），零性能开销 |
| 2026-02-23 | pushUndoEntry 的 clearRedo 参数 | redo 恢复操作推入 undo 时不能清空 redo 栈，否则连续 redo 只能执行一步 |
| 2026-02-24 | 展开/收起纳入统一时间线 | 解决"收起父节点→Cmd+Z 撤销文本但看不到变化"的场景。展开/收起推入 `'expand'` 条目，undo 时先恢复视图状态再撤销数据操作 |
| 2026-02-24 | undoDoc/redoDoc 前 flush 未提交写入 | PM 文本编辑通过 `updateNodeContent` 写入 Loro 但不 commit。Loro UndoManager.undo() 会自动提交 pending 操作为新 undo 步骤，导致 structural undo 实际撤销的是文本而非结构操作。修复：在 undo/redo 前用 `system:` origin commit pending 变更，排除 UndoManager 跟踪 |
