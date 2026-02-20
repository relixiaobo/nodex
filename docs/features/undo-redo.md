# Feature: 撤销与重做

> Phase 2 | 文本撤销已有（ProseMirror 内置 History），导航撤销已有，结构性撤销已实现（Loro UndoManager，2026-02-20）

## 概述

用户通过 `Cmd+Z` 撤销上一步操作，`Cmd+Shift+Z` 重做被撤销的操作。撤销系统覆盖三个层次：文本编辑、节点操作、导航。三者通过统一的优先级机制无缝衔接。

## 当前实现状态

| 层次 | 状态 | 说明 |
|------|------|------|
| 文本编辑撤销 | ✅ 已有 | ProseMirror History（`prosemirror-history` 包） |
| 导航撤销 | ✅ 已有 | `navUndoStack` / `navRedoStack`，`use-nav-undo-keyboard.ts` |
| 节点操作撤销 | ✅ 已实现 | Loro UndoManager，2026-02-20 |
| 三层统一优先级 | ✅ 已实现 | ProseMirror（编辑器聚焦时）→ Loro structural → navUndo |

## 架构设计

### 三层撤销栈

```
┌─────────────────────────────────────────────────────┐
│  Cmd+Z 按下                                          │
│                                                      │
│  1. 编辑器内？→ ProseMirror History 处理               │
│     （focusedNodeId !== null 或 contentEditable 聚焦）│
│                                                      │
│  2. canUndoDoc()? → undoDoc() 结构性撤销              │
│     └ Loro UndoManager 回退上一次 commit              │
│     └ rebuildMappings() 同步 TreeID 映射              │
│     └ 栈为空？→ 继续到 3                               │
│                                                      │
│  3. 导航栈有内容？→ navUndo()                          │
│     └ 撤销最近的导航                                   │
│     └ 栈为空？→ 无操作                                 │
└─────────────────────────────────────────────────────┘
```

### 优先级规则

当用户按下 `Cmd+Z` 时：

1. **先撤销文本编辑** — 如果当前节点的 ProseMirror 编辑器处于聚焦状态，ProseMirror History 接管撤销
2. **再撤销节点操作** — 编辑器未聚焦时，若 `canUndoDoc()` 为 true，回退结构性操作（创建、删除、移动等）
3. **最后撤销导航** — 结构性操作历史也用完后，回退面板导航

三者无缝衔接，用户无需感知层次切换。

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

- `navigateTo()` 自动 push 快照到 undo 栈，清空 redo 栈
- `navUndo()` → 恢复上一个导航快照
- `navRedo()` → 恢复下一个导航快照
- Session-only，不持久化到 storage

### 历史管理规则

| 规则 | 说明 |
|------|------|
| 新操作清空 redo | 执行新操作后，被撤销的操作不可再重做 |
| 最大步数 | Loro UndoManager 默认 100 步 |
| 快速连续 Cmd+Z | 逐步回退，不跳过或重复 |
| 展开/折叠不记录 | 视图状态变更不是数据操作 |
| 空操作不记录 | 操作结果与原状态相同时不入栈 |
| 撤销失败 | 跳过该步，其余历史正常可用 |

### 特殊场景

| 场景 | 行为 |
|------|------|
| 创建标签并应用到节点 | 一步操作。撤销时移除标签关系，tagDef 保留 |
| 撤销 Zoom 导航 | 回到导航前的视图位置（navUndo 处理） |
| 展开/折叠未改变状态 | 不记录 |
| 文本编辑结果与原文相同 | 不记录（ProseMirror 自动处理） |
| 撤销失败 | 跳过，其余历史正常 |

## 实现范围

### 已完成

| 功能 | 说明 |
|------|------|
| 文本撤销 | ProseMirror `prosemirror-history` |
| 导航撤销 | navUndoStack + use-nav-undo-keyboard |
| 结构性节点操作撤销 | Loro UndoManager，2026-02-20 |
| Cmd+Z 三层优先级统一 | ProseMirror → Loro → navUndo |

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
| 2026-02-14 | 展开/折叠不入撤销栈 | 视图偏好不是数据变更，频繁展开折叠会污染撤销历史 |
| 2026-02-14 | 创建标签/字段并应用 = 一步撤销 | 用户感知为单一动作；撤销时 tagDef/attrDef 保留以防被其他节点引用 |
| 2026-02-20 | 使用 Loro UndoManager 而非 Command Pattern | Phase 1 已迁移到 Loro CRDT，UndoManager 是零成本升级，无需手动记录正/逆操作 |
| 2026-02-20 | rebuildMappings() 在 undo/redo 后调用 | Loro undo/redo 会创建新 TreeID，必须同步 nodexToTree/treeToNodex 映射 |
