# Feature: 撤销与重做（统一时间线）

> 目标: Workflowy 水平的统一 undo — ⌘Z 永远撤销「上一步」，覆盖所有用户操作
>
> 竞品调研见 `docs/research/tana-undo-redo-analysis.md`
> 实施计划见 `docs/plans/unified-undo.md`

## 概述

用户通过 `⌘Z` 撤销上一步操作，`⌘⇧Z` 重做被撤销的操作。所有用户操作——文本编辑、节点结构操作、标签/字段/checkbox、展开/折叠、面板导航——进入同一个按时间排列的撤销栈。⌘Z 永远撤销时间线上最近的操作，不区分操作类型。

## 目标架构

### 核心原则

**Loro UndoManager 是唯一的 undo/redo 处理器。**

所有用户操作都产生 Loro commit，进入同一个 undo 栈。不再有多个独立撤销栈，不再有优先级穿透。

```
⌘Z 按下
  └── undoManager.undo()
        ├── Loro 自动回退数据变更（文本 / 树结构 / 标签 / 字段 / checkbox）
        └── onPop 回调恢复 UI 状态（展开/折叠 / 导航 / 光标位置）
```

### 操作分类与覆盖

| 操作类型 | 示例 | 进入 Loro 方式 | 撤销机制 |
|---------|------|---------------|---------|
| 文本编辑 | 打字、删除字符、格式化 | ProseMirror → LoroText 实时同步 | Loro 回退 LoroText → 编辑器重新同步 |
| 节点结构 | 创建、删除、缩进、移动、拖拽 | commitDoc()（已实现） | Loro 回退 LoroTree |
| 标签 | applyTag / removeTag | commitDoc() | Loro 回退 LoroList(tags) |
| 字段 | setFieldValue / removeField | commitDoc() | Loro 回退字段 Tuple 数据 |
| Checkbox | toggleCheckbox | commitDoc() | Loro 回退 showCheckbox / completedAt |
| 展开/折叠 | toggleExpanded | Loro 标记提交（marker commit） | onPop 回调恢复 expandedNodes |
| 导航 | navigateTo / goBack / goForward | Loro 标记提交（marker commit） | onPop 回调恢复 panelHistory/panelIndex |

### Loro 标记提交（Marker Commit）

展开/折叠和导航不是 CRDT 数据，但用户期望它们在 undo 时间线中。解决方案是在 LoroDoc 中维护一个轻量计数器 `_ui.seq`，每次 UI 操作时递增，产生一个 Loro commit 进入 undo 栈。实际的 UI 状态恢复通过 `onPop` 回调完成。

```ts
function commitUIMarker() {
  const uiMap = doc.getMap('_ui');
  uiMap.set('seq', (uiMap.get('seq') ?? 0) + 1);
  commitDoc('user:ui');
}
```

`_ui` Map 的数据本身无意义（仅用于创建 undo 条目），真正的状态保存/恢复通过 `onPush`/`onPop` 元数据回调完成。

### onPush / onPop 元数据回调

Loro UndoManager 支持在每个 undo 条目上附着自定义元数据：

- **onPush**: 新 commit 入栈时调用，返回值作为元数据存储
- **onPop**: undo/redo 时调用，接收对应的元数据

```ts
const undoManager = new UndoManager(doc, {
  mergeInterval: 500,
  maxUndoSteps: 100,
  excludeOriginPrefixes: ['__seed__', 'system:'],
  onPush: (isUndo, counterRange) => ({
    expandedNodes: new Set(uiStore.expandedNodes),
    panelHistory: [...uiStore.panelHistory],
    panelIndex: uiStore.panelIndex,
    focusedNodeId: uiStore.focusedNodeId,
    cursor: getCurrentEditorCursor(),
  }),
  onPop: (isUndo, meta, counterRange) => {
    // Loro 已自动回退数据，这里恢复 UI 状态
    if (meta.expandedNodes) {
      uiStore.setState({ expandedNodes: meta.expandedNodes });
    }
    if (meta.panelHistory) {
      uiStore.setState({
        panelHistory: meta.panelHistory,
        panelIndex: meta.panelIndex,
      });
    }
    if (meta.cursor && meta.focusedNodeId) {
      restoreEditorCursor(meta.focusedNodeId, meta.cursor);
    }
  },
});
```

### 移除 ProseMirror History

当前文本编辑使用 ProseMirror 内置的 `prosemirror-history` 插件——这是独立于 Loro 的第二个 undo 栈，阻碍统一时间线。

**变更**：

1. 移除 `history({ depth: 100 })` 插件及相关的 `undo`/`redo` keymap
2. 编辑器从"仅 blur 时同步到 Loro"改为"每次 ProseMirror transaction 实时同步到 LoroText"
3. `mergeInterval: 500ms` 自然将连续快速打字合并为一步 undo
4. ⌘Z 时 Loro 回退 LoroText → 编辑器从 LoroText 重新读取内容并更新视图

**光标恢复**：通过 onPush/onPop 保存和恢复 ProseMirror selection 状态。

**已有桥接函数可复用**：
- `writeRichTextToLoroText()` — ProseMirror → LoroText
- `readRichTextFromLoroText()` — LoroText → ProseMirror

### 单一键盘处理器

替换当前的三层 fallthrough 逻辑：

```ts
// 旧：三层 fallthrough
// ProseMirror（编辑器聚焦时）→ canUndoDoc() → navUndo()

// 新：全局唯一入口
function handleUndo(e: KeyboardEvent) {
  e.preventDefault();
  flushPendingEditorChanges();  // 确保编辑器 pending 变更已同步到 Loro
  undoManager.undo();
}
```

不再需要 `shouldHandleNavUndo()`、`focusedNodeId` 判断、`canUndoDoc()` fallthrough。

## 行为规格

### 可撤销的操作（完整列表）

| 类别 | 操作 | 合并行为 |
|------|------|---------|
| 文本编辑 | 打字、删除字符 | 500ms 内连续打字合并为一步 |
| 文本格式 | Bold / Italic / Strike / Code / Highlight / Heading | 每次格式切换独立一步 |
| 节点创建 | 回车新建节点 | 独立一步 |
| 节点删除 | 移入回收站 | 独立一步 |
| 节点恢复 | 从回收站恢复 | 独立一步 |
| 节点移动 | 缩进 / 反缩进 / 上移 / 下移 / 拖拽 | 独立一步 |
| 标签操作 | applyTag / removeTag | 独立一步 |
| 字段操作 | setFieldValue / removeField | 独立一步 |
| Checkbox | toggleCheckbox | 独立一步 |
| 展开/折叠 | toggleExpanded | 独立一步 |
| 导航 | navigateTo / goBack / goForward | 独立一步 |

### 不可撤销的操作

| 操作 | 原因 |
|------|------|
| 永久删除（清空回收站） | 不可逆 |
| 应用来自远端同步的变更 | 非本地操作（per-peer undo 排除） |
| 种子数据 / 系统操作 | `excludeOriginPrefixes: ['__seed__', 'system:']` |

### 历史管理规则

| 规则 | 说明 |
|------|------|
| 新操作清空 redo | 执行新操作后，被撤销的操作不可再重做 |
| 最大步数 | 100 步（Loro UndoManager 配置） |
| 合并间隔 | 500ms 内连续同类操作合并为一步 |
| 空操作不记录 | 操作结果与原状态相同时不入栈 |
| 撤销失败 | 跳过该步，其余历史正常可用 |
| Per-peer undo | 协作场景下只撤销本地操作，不影响远端 |

### 特殊场景

| 场景 | 行为 |
|------|------|
| 创建标签并应用到节点 | 一步操作。撤销时移除标签关系，tagDef 保留 |
| 打字后立即展开节点（500ms 内） | 可能合并为一步（mergeInterval）。实际场景极少，合并效果正确 |
| 展开/折叠夹在两次打字之间 | 三个独立 undo 步骤。用户需按三次 ⌘Z 回到最初状态（符合预期） |
| 编辑器聚焦时按 ⌘Z | 编辑器 keymap 直接调用 `undoDoc()`（同一 Loro 时间线） |
| 撤销导航 | 恢复之前的 panelHistory + panelIndex（通过 onPop） |
| 多标签页/多窗口 | 每个 Side Panel 实例有独立的 UndoManager |

## 当前实现状态

| 层次 | 状态 | 说明 |
|------|------|------|
| 节点结构撤销 | ✅ 已实现 | Loro UndoManager，2026-02-20 |
| 文本编辑撤销 | ✅ 已实现（进行中验证） | ProseMirror transaction 实时 `commitDoc('user:text')`，PM History 已移除 |
| 标签/字段/checkbox 撤销 | ⚠️ 部分覆盖 | 部分路径缺 commitDoc()，待补全 |
| 展开/折叠撤销 | ✅ 已实现（marker） | `commitUIMarker()` + UndoManager `onPop` 恢复 `expandedNodes` |
| 导航撤销 | ✅ 已实现（marker） | `commitUIMarker()` + UndoManager `onPop` 恢复 `panelHistory/panelIndex` |
| 统一时间线 | ✅ 核心路径已切换 | 编辑器 keymap 与全局非编辑态键盘入口都走 Loro UndoManager |

## 实现范围

### 已完成

| 功能 | 说明 |
|------|------|
| 结构性节点操作撤销 | Loro UndoManager，2026-02-20 |
| commitDoc() 覆盖 | 大部分结构操作已有 |
| rebuildMappings() | undo/redo 后同步 TreeID 映射 |

### 待实现（按 Phase 排列）

| Phase | 功能 | 说明 |
|-------|------|------|
| 1 | 补全 commitDoc() | tags / fields / checkbox 所有路径（待补全） |
| 2 | ProseMirror → Loro 实时同步 | ✅ 已完成 PR #91 — `commitDoc('user:text')` + PM History 已移除 |
| 3 | UI 状态 marker commit | ✅ 已完成 PR #91 — 导航/展开折叠 `commitUIMarker()` + `onPush/onPop` UI snapshot |
| 4 | 统一 ⌘Z handler | ✅ 已完成 PR #91 — 编辑器 keymap + 全局非编辑态统一走 `undoDoc/redoDoc`；navUndoStack 已移除 |

## 决策记录

| 日期 | 决策 | 原因 |
|------|------|------|
| 2026-02-14 | 三层优先级：文本 → 节点操作 → 导航 | ~~与用户直觉一致~~（已废弃，见 2026-02-23） |
| 2026-02-14 | 节点操作撤销栈 100 步上限 | 平衡内存开销与实用性 |
| 2026-02-14 | ~~展开/折叠不入撤销栈~~ | ~~视图偏好不是数据变更~~（已废弃，见 2026-02-23） |
| 2026-02-14 | 创建标签/字段并应用 = 一步撤销 | 用户感知为单一动作；撤销时 tagDef/attrDef 保留以防被其他节点引用 |
| 2026-02-20 | 使用 Loro UndoManager 而非 Command Pattern | Phase 1 已迁移到 Loro CRDT，UndoManager 是零成本升级 |
| 2026-02-20 | rebuildMappings() 在 undo/redo 后调用 | Loro undo/redo 会创建新 TreeID，必须同步映射 |
| 2026-02-23 | **统一时间线：所有操作进入同一个 Loro undo 栈** | 三栈 fallthrough 无法按时间交错，用户期望 ⌘Z = "上一步"。Workflowy 为标杆 |
| 2026-02-23 | **展开/折叠入 undo 栈** | 用户明确要求。展开/折叠夹在两次编辑之间，多按一次 ⌘Z 是符合预期的 |
| 2026-02-23 | **导航入 undo 栈** | 所有用户操作统一到同一时间线 |
| 2026-02-23 | **移除 ProseMirror History，文本 undo 由 Loro 接管** | ProseMirror History 是独立于 Loro 的第二个 undo 栈，阻碍统一 |
| 2026-02-23 | **UI 状态通过 Loro marker commit + onPush/onPop 元数据实现** | 不污染数据模型，不自建 undo 栈，复用 Loro 基础设施 |
| 2026-02-23 | **以 Workflowy 为标杆（非 Tana）** | Tana undo 弱于 Nodex 当前实现；Workflowy 是统一时间线的业界最佳实践 |
| 2026-02-24 | **Bootstrap 用 replacePanel 不用 navigateTo** | navigateTo 会创建 Loro undo 条目，其快照为空 panelHistory → 连续 ⌘Z 导致白屏 |
| 2026-02-24 | **restore 回调防御空 panelHistory** | 即使 undo 栈中泄露了空快照，也不实际应用 |
| 2026-02-24 | **seedWorkspace 末尾 commitDoc('system:bootstrap')** | 防止容器创建 pending ops 泄入后续 user-origin commit |
| 2026-02-24 | **导航后同步聚焦 undo-shortcut-sink** | Chrome Side Panel 在 DOM 替换后焦点落到 body，浏览器拦截 ⌘Z 不传给 JS。提取 `focusUndoShortcutSink` 到 `src/lib/focus-utils.ts`，`ensureUndoFocusAfterNavigation()` 在所有导航路径（bullet zoom-in、面包屑、命令面板）同步聚焦 |
| 2026-02-24 | **TrailingInput 补 Mod-z/Mod-Shift-z keymap** | 无子节点 zoom-in 时 TrailingInput autoFocus 抢焦点，全局 handler 跳过 contentEditable，但 TrailingInput 无 undo 绑定 → ⌘Z 被静默丢弃 |

## 参考

- 竞品调研：`docs/research/tana-undo-redo-analysis.md`
- 实施计划：`docs/plans/unified-undo.md`
- Loro Undo 文档：https://loro.dev/docs/advanced/undo
