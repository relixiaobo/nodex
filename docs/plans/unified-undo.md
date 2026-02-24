# 统一时间线 Undo/Redo 实施计划

> 状态：已设计，待实施
> 特性规格：`docs/features/undo-redo.md`
> 竞品调研：`docs/research/tana-undo-redo-analysis.md`

## 目标

将当前的三栈 fallthrough（ProseMirror History → Loro UndoManager → navUndoStack）替换为 **Loro UndoManager 单一时间线**。⌘Z 永远撤销「上一步」，覆盖所有用户操作。

## 当前架构（要替换的）

```
⌘Z → ProseMirror History（编辑器聚焦时）
   → Loro UndoManager（结构操作）
   → navUndoStack（导航）

三个独立栈，按优先级穿透。无法按时间交错。
```

**问题**：用户操作 A(文本)→B(导航)→C(文本)，按 ⌘Z 会先撤销 C+A（ProseMirror），再撤销 B（navUndo）。顺序错误。

## 目标架构

```
⌘Z → Loro UndoManager.undo()
       ├── 数据回退（Loro 自动处理）
       └── UI 状态恢复（onPop 回调）

所有操作进入同一个 Loro undo 栈。
```

## 实施 Phase

### Phase 1：补全 commitDoc() 覆盖

**目标**：确保所有数据变更操作都有 `commitDoc()` 调用，进入 Loro UndoManager。

**风险**：低 — 只增代码，不改架构。当前三栈 fallthrough 继续工作。

**变更文件**：
- `src/stores/node-store.ts` — 审查所有 tag / field / checkbox 操作路径

**具体工作**：

1. 审查 `node-store.ts` 中所有 `addTag` / `removeTag` / `setNodeData` 调用链
2. 确认以下操作末尾有 `commitDoc()`：
   - `applyTag()` / `removeTag()`
   - `setFieldValue()` / `removeFieldTuple()`
   - `toggleCheckbox()` / `setDoneState()`
3. 补充缺失的 `commitDoc()` 调用
4. 添加 Vitest 回归测试验证撤销/重做

**验收标准**：
- 应用标签后 ⌘Z 可撤销（Loro 层面，仍需编辑器失焦）
- 修改字段值后 ⌘Z 可撤销
- 切换 checkbox 后 ⌘Z 可撤销
- 所有已有 undo 测试继续通过

### Phase 2：ProseMirror → Loro 实时同步 + 移除 PM History

**目标**：文本编辑 undo 从 ProseMirror History 迁移到 Loro UndoManager。

**风险**：中 — 编辑器行为变更，需仔细测试文本编辑体验。

**变更文件**：
- `src/components/editor/RichTextEditor.tsx` — 核心变更
- `src/lib/loro-doc.ts` — UndoManager 配置（onPush/onPop）
- `src/lib/pm-editor-view.ts` — 可能需要调整
- `package.json` — 可选：移除 `prosemirror-history` 依赖

**具体工作**：

#### 2a. ProseMirror → LoroText 实时同步

当前编辑器仅在 blur 时将内容同步到 LoroText。需要改为每次 ProseMirror transaction 后同步。

```ts
// RichTextEditor.tsx — 新增 dispatchTransaction 逻辑
dispatchTransaction(tr) {
  const newState = view.state.apply(tr);
  view.updateState(newState);
  if (tr.docChanged) {
    // 实时同步到 LoroText（已有桥接函数）
    syncEditorToLoro(nodeId, newState);
    commitDoc('user:text');
  }
}
```

**注意**：`commitDoc()` 配合 `mergeInterval: 500ms`，连续打字会自动合并为一步 undo。

#### 2b. 移除 ProseMirror History

```ts
// RichTextEditor.tsx — 移除
- import { history, redo, undo } from 'prosemirror-history';
- history({ depth: 100 }),
- 'Mod-z': (state, dispatch) => undo(state, dispatch),
- 'Mod-y': (state, dispatch) => redo(state, dispatch),
- 'Mod-Shift-z': (state, dispatch) => redo(state, dispatch),
```

⌘Z 不再由 ProseMirror keymap 处理，而是由全局 handler 统一处理（Phase 4）。

#### 2c. Loro → ProseMirror 反向同步（undo 时）

当 Loro undo 回退了 LoroText 内容，需要更新当前聚焦的编辑器：

```ts
// 在 undoDoc() 后触发
function syncLoroToEditor(nodeId: string) {
  const richText = getNodeText(nodeId);
  if (!richText) return;
  const payload = readRichTextFromLoroText(richText);
  // 用 payload 重建 ProseMirror 文档
  updateEditorContent(nodeId, payload);
}
```

已有的 `readRichTextFromLoroText()` 和 `writeRichTextToLoroText()` 可直接复用。

#### 2d. UndoManager 添加 onPush/onPop 回调

```ts
undoManager = new UndoManager(doc, {
  mergeInterval: 500,
  maxUndoSteps: 100,
  excludeOriginPrefixes: ['__seed__', 'system:'],
  onPush: (isUndo, counterRange) => ({
    // 保存 UI 快照作为元数据
    focusedNodeId: uiStore.focusedNodeId,
    cursor: getCurrentEditorCursor(),
    expandedNodes: new Set(uiStore.expandedNodes),
    panelHistory: [...uiStore.panelHistory],
    panelIndex: uiStore.panelIndex,
  }),
  onPop: (isUndo, meta, counterRange) => {
    // 恢复 UI 状态
    if (meta.expandedNodes) {
      uiStore.setState({ expandedNodes: meta.expandedNodes });
    }
    if (meta.panelHistory) {
      uiStore.setState({
        panelHistory: meta.panelHistory,
        panelIndex: meta.panelIndex,
      });
    }
    if (meta.focusedNodeId) {
      syncLoroToEditor(meta.focusedNodeId);
      restoreEditorCursor(meta.focusedNodeId, meta.cursor);
    }
  },
});
```

**验收标准**：
- 打字后 ⌘Z 撤销文本（通过 Loro，非 ProseMirror History）
- 连续快速打字合并为一步 undo
- 格式化（Bold/Italic 等）可撤销
- 打字 → 创建节点 → ⌘Z → 先撤销创建，再按 ⌘Z 撤销打字（时间线正确）
- 光标位置在 undo 后正确恢复

### Phase 3：UI 状态 Marker Commit

**目标**：展开/折叠和导航操作进入 Loro undo 时间线。

**风险**：低 — 新增代码为主，不改已有行为。

**变更文件**：
- `src/lib/unified-undo.ts` — 新文件，封装统一 undo 管理
- `src/stores/ui-store.ts` — 展开/折叠和导航调用 marker commit
- `src/lib/loro-doc.ts` — 暴露 `_ui` Map API

**具体工作**：

#### 3a. 新建 `src/lib/unified-undo.ts`

封装统一 undo 的公共逻辑：

```ts
// src/lib/unified-undo.ts

import { getLoroDoc, commitDoc } from './loro-doc.js';

/**
 * 为 UI-only 操作创建 Loro undo 条目。
 *
 * 在 LoroDoc 中递增 _ui.seq 计数器，产生一个 Loro commit。
 * 实际的 UI 状态保存/恢复通过 UndoManager 的 onPush/onPop 回调完成。
 */
export function commitUIMarker(): void {
  const doc = getLoroDoc();
  const uiMap = doc.getMap('_ui');
  uiMap.set('seq', ((uiMap.get('seq') as number) ?? 0) + 1);
  commitDoc('user:ui');
}
```

#### 3b. 修改 ui-store.ts 的展开/折叠

```ts
// 旧
toggleExpanded: (expandKey) =>
  set((s) => {
    const next = new Set(s.expandedNodes);
    if (next.has(expandKey)) next.delete(expandKey); else next.add(expandKey);
    return { expandedNodes: next };
  }),

// 新
toggleExpanded: (expandKey) => {
  commitUIMarker();  // 创建 Loro undo 条目
  set((s) => {
    const next = new Set(s.expandedNodes);
    if (next.has(expandKey)) next.delete(expandKey); else next.add(expandKey);
    return { expandedNodes: next };
  });
},
```

#### 3c. 修改 ui-store.ts 的导航

```ts
// 旧
navigateTo: (nodeId) =>
  set((s) => {
    // ... push navUndoStack ...
    return { panelHistory, panelIndex, navUndoStack, navRedoStack: [] };
  }),

// 新
navigateTo: (nodeId) => {
  commitUIMarker();  // 创建 Loro undo 条目
  set((s) => {
    // ... 不再 push navUndoStack（由 onPush/onPop 处理）...
    return { panelHistory, panelIndex };
  });
},
```

#### 3d. 删除 navUndoStack / navRedoStack

从 `ui-store.ts` 中移除：
- `navUndoStack` / `navRedoStack` 状态
- `navUndo()` / `navRedo()` 方法
- `navigateTo` / `goBack` / `goForward` 中的 snapshot push 逻辑

**验收标准**：
- 展开节点 → ⌘Z → 节点折叠
- 导航到新页面 → ⌘Z → 回到上一页
- 打字 → 展开 → 打字 → ⌘Z×3 → 依次撤销打字、展开、打字（时间线正确）

### Phase 4：统一 ⌘Z Handler + 清理

**目标**：删除旧的三层 fallthrough 代码，替换为单一 handler。

**风险**：低 — 代码简化。

**变更文件**：
- `src/hooks/use-nav-undo-keyboard.ts` — 重写或删除
- `src/components/editor/RichTextEditor.tsx` — 确认 ⌘Z keymap 已移除
- `src/entrypoints/sidepanel/App.tsx` — 挂载新 hook

**具体工作**：

#### 4a. 全局 ⌘Z handler

```ts
// 重写 use-nav-undo-keyboard.ts → use-unified-undo-keyboard.ts

export function useUnifiedUndoKeyboard() {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (!isUndoRedoShortcut(e)) return;
      e.preventDefault();

      // 确保编辑器 pending 变更已同步到 Loro
      flushPendingEditorChanges();

      if (isRedo(e)) {
        redoDoc();
      } else {
        undoDoc();
      }
    }

    document.addEventListener('keydown', handler, { capture: true });
    return () => document.removeEventListener('keydown', handler, { capture: true });
  }, []);
}
```

使用 `capture: true` 确保在 ProseMirror keymap 之前拦截。

#### 4b. 删除旧代码

| 删除 | 位置 |
|------|------|
| `navUndoStack` / `navRedoStack` / `navUndo()` / `navRedo()` | `ui-store.ts` |
| `shouldHandleNavUndo()` / `resolveNavUndoAction()` | `use-nav-undo-keyboard.ts` |
| ProseMirror `history()` 插件 | `RichTextEditor.tsx` |
| ProseMirror `undo` / `redo` keymap | `RichTextEditor.tsx` |
| `prosemirror-history` 导入 | `RichTextEditor.tsx` |

#### 4c. 更新测试

- `tests/vitest/nav-undo-keyboard.test.ts` → 重写为统一 undo 测试
- `tests/vitest/nav-undo-shortcuts.test.ts` → 合并或重写
- 新增统一时间线集成测试

**验收标准**：
- 全部旧 undo 代码已删除
- `prosemirror-history` 可选从 package.json 移除
- 所有测试通过
- 所有操作类型的 undo/redo 正常工作

## 修改文件清单

| 文件 | Phase | 变更 |
|------|-------|------|
| `src/stores/node-store.ts` | 1 | 补全 commitDoc() |
| `src/components/editor/RichTextEditor.tsx` | 2, 4 | 实时同步 + 移除 PM History + 移除 undo keymap |
| `src/lib/loro-doc.ts` | 2 | UndoManager onPush/onPop 配置 |
| `src/lib/unified-undo.ts` | 3 | 新文件：commitUIMarker() + flushPendingEditorChanges() |
| `src/stores/ui-store.ts` | 3, 4 | marker commit 调用 + 删除 navUndo/navRedo |
| `src/hooks/use-nav-undo-keyboard.ts` | 4 | 重写为 `use-unified-undo-keyboard.ts` |
| `src/lib/pm-editor-view.ts` | 2 | 可能：Loro → PM 反向同步 |
| `tests/vitest/nav-undo-*.test.ts` | 4 | 重写 |
| `package.json` | 4 | 可选移除 prosemirror-history |

## 依赖关系

```
Phase 1（补全 commitDoc）
  ↓ 无阻塞，可独立交付
Phase 2（PM → Loro 实时同步 + onPush/onPop）
  ↓ 必须先完成，Phase 3 依赖 onPush/onPop 基础设施
Phase 3（UI marker commit）
  ↓ 必须先完成，Phase 4 依赖所有操作已入栈
Phase 4（统一 handler + 清理）
```

Phase 1 可独立完成并交付价值（扩展 Loro undo 覆盖范围）。Phase 2-4 是统一时间线的核心变更，建议连续实施。

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| ProseMirror → Loro 实时同步性能 | 使用 `mergeInterval: 500ms` 批量合并；只同步 docChanged 的 transaction |
| Loro undo 后编辑器显示不同步 | onPop 回调中显式调用 `syncLoroToEditor()` 更新编辑器 |
| 展开/折叠频繁操作污染 undo 栈 | `mergeInterval` 自动合并 500ms 内的连续操作 |
| `_ui` Map 数据同步到其他设备 | 数据极小（单个 int），无实际影响；后续可在 sync 层过滤 |
| ProseMirror inline reference 同步复杂性 | 已有 `writeRichTextToLoroText` 完整处理 inline refs |
| rebuildMappings() 在频繁 undo 时的性能 | 当前实现已 OK（全量遍历 Loro tree nodes），如有问题可改为增量 |

## 设计优势

1. **单一 undo 入口**：`undoManager.undo()` — 没有 if/else fallthrough
2. **单一数据源**：LoroDoc 是所有可撤销数据的唯一来源
3. **零自定义 undo 栈**：不维护自己的 `UndoEntry[]`，完全复用 Loro 基础设施
4. **元数据附着模式**：UI 状态不污染数据模型，通过 onPush/onPop "搭便车"
5. **CRDT 友好**：per-peer undo 天然支持多设备协作
6. **可增量交付**：Phase 1 独立有价值，每个 Phase 都可单独验证
7. **代码量净减少**：删除 navUndoStack、PM History、三层 fallthrough 逻辑
