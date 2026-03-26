# Chat Embed 交互修复

> 局部闭环修复：让 chat embed 中的节点支持完整 outliner 交互，不引入新抽象层。

## 问题

ChatDrawer 内嵌 OutlinerItem 已能复用渲染和数据，但交互层有 5 个具体缺口：

1. NodeEmbed 无高度限制 — 深层展开撑爆消息
2. SessionHistoryDropdown / model menu 被 overflow-clip 裁剪
3. Click-outside 误关 ChatDrawer — 点击 portal dropdown 内部导致 drawer 关闭
4. Escape 优先级 — DropdownPanel 的 Escape 没有 stopPropagation，同时关闭 dropdown 和 drawer
5. 焦点串扰 — `setFocusedNode` 不含 panelId，chat embed 操作影响主 outliner 焦点

## 审计结论

字段系统（NodePicker、DatePicker、OptionsPicker）和编辑器触发器（TagSelector、ReferenceSelector、SlashCommandMenu）**已全部 portal 化**，在 chat embed 中正常工作。不需要迁移。

仅 3 个非 portal 下拉（SessionHistoryDropdown、ChatInput model menu、ToolbarUserMenu）中，前两个在 ChatDrawer overflow 链中需要迁移，第三个在 TopBar 中不受影响。

## Exact Behavior

### B1: NodeEmbed 高度限制

**GIVEN** ChatDrawer 中渲染了 NodeEmbed
**WHEN** 用户展开多层子节点
**THEN** NodeEmbed 容器不超过 60vh，出现垂直滚动条，不撑开消息

### B2: Overlay 不被裁剪

**GIVEN** 用户在 ChatDrawer 中打开 session history 或 model menu
**WHEN** 浮层渲染
**THEN** 通过 DropdownPanel（portal + fixed）渲染，不被 overflow 链裁剪

### B3: Click-outside 边界

**GIVEN** ChatDrawer 打开，用户操作触发了 portal dropdown
**WHEN** 用户点击 portal dropdown 内部
**THEN** ChatDrawer 不关闭

### B4: Escape 优先级

**GIVEN** ChatDrawer 内有 overlay 打开
**WHEN** 用户按 Escape
**THEN** 先关闭 overlay（stopPropagation 阻止事件冒泡）；overlay 全关后再允许 Escape 关闭 drawer

### B5: 焦点隔离

**GIVEN** 同一个节点出现在主 outliner 和 chat embed 中
**WHEN** 用户在 chat embed 中点击编辑该节点
**THEN** 仅 chat embed 侧的节点进入编辑态，主 outliner 侧不受影响

### B6: 数据共通（已实现，不改）

**GIVEN** 同一节点同时出现在两侧
**WHEN** 用户在任一侧编辑
**THEN** 两侧看到同一份数据更新

## 文件清单

### Group 1: 可见 bug 修复

| 文件 | 改动 |
|------|------|
| `src/components/chat/NodeEmbed.tsx` | 外层容器添加 `max-h-[60vh] overflow-y-auto` |
| `src/components/layout/ChatDrawer.tsx` | SessionHistoryDropdown 迁移到 DropdownPanel；click-outside handler 排除 `[data-dropdown-panel]` |
| `src/components/chat/ChatInput.tsx` | model menu 迁移到 DropdownPanel，移除 ad-hoc portal |
| `src/components/ui/DropdownPanel.tsx` | Escape handler 添加 `e.stopPropagation()`（对齐 PopoverShell） |

### Group 2: 焦点隔离

| 文件 | 改动 |
|------|------|
| `src/stores/ui-store.ts` | 新增 `focusedPanelId`；`setFocusedNode` 签名加 `panelId` 参数；`isFocused` 相关的 clear 逻辑同步更新 |
| `src/components/outliner/OutlinerItem.tsx` | `isFocused` 检查加 `focusedPanelId === panelId`；所有 `setFocusedNode` 调用传入 `panelId` |
| `src/components/outliner/OutlinerRow.tsx` | 所有 `setFocusedNode` 调用传入 `panelId` |
| `src/components/outliner/OutlinerView.tsx` | 所有 `setFocusedNode` 调用传入 `panelId` |
| `src/components/editor/TrailingInput.tsx` | 所有 `setFocusedNode` 调用传入 `panelId` |
| `src/components/fields/FieldRow.tsx` | 所有 `setFocusedNode` 调用传入 `panelId` |
| `src/components/fields/FieldValueOutliner.tsx` | 所有 `setFocusedNode` 调用传入 `panelId` |
| `src/components/fields/ConfigOutliner.tsx` | 所有 `setFocusedNode` 调用传入 `panelId` |

## 实现指引

### NodeEmbed max-height

```tsx
// NodeEmbed.tsx — 外层容器
<div className="chat-node-embed my-1 max-h-[60vh] overflow-y-auto rounded-md border border-border bg-background py-1">
```

### SessionHistoryDropdown → DropdownPanel

当前 `SessionHistoryDropdown` 用 `absolute top-full` 渲染在 ChatDrawer header 内，被 overflow-clip 裁剪。改用 `<DropdownPanel anchorRef={titleBtnRef} onClose={...}>` 包裹现有内容。DropdownPanel 已内置 portal + fixed 定位 + Escape + click-outside + scroll 重定位。

### ChatInput model menu → DropdownPanel

当前 model menu 用 ad-hoc `createPortal` + 手动定位。改用 `<DropdownPanel anchorRef={modelBtnRef} onClose={...}>`，移除 `modelMenuPortalRef` 和手动定位逻辑。

### DropdownPanel Escape stopPropagation

```ts
// DropdownPanel.tsx — handleKey
const handleKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    e.stopPropagation(); // ← 加这一行，对齐 PopoverShell 的行为
    onClose();
  }
};
```

### ChatDrawer click-outside 排除 portal

```ts
// ChatDrawer.tsx — pointerdown handler
if (target.closest('[data-dropdown-panel]')) return; // ← DropdownPanel portal
if (target.closest('.shadow-paper')) return;         // ← 现有规则
```

### 焦点隔离

**ui-store.ts**:

```ts
// 新增 focusedPanelId
focusedPanelId: null as string | null,

// setFocusedNode 签名扩展
setFocusedNode: (nodeId: string | null, parentId?: string | null, panelId?: string | null) => void;

// 实现中存储 panelId
setFocusedNode: (nodeId, parentId, panelId) => {
  if (nodeId) {
    set({
      focusedNodeId: nodeId,
      focusedParentId: parentId ?? null,
      focusedPanelId: panelId ?? null,
      // ... 其余不变
    });
    return;
  }
  set({
    focusedNodeId: null,
    focusedParentId: null,
    focusedPanelId: null,
    // ... 其余不变
  });
},
```

**OutlinerItem.tsx**:

```ts
// 新增 selector
const focusedPanelId = useUIStore((s) => s.focusedPanelId);

// isFocused 检查加 panelId
const isFocused = focusedNodeId === nodeId &&
    (focusedParentId === null || focusedParentId === parentId) &&
    (focusedPanelId === null || focusedPanelId === panelId);

// 所有 setFocusedNode 调用加 panelId（约 40 处，机械改动）
setFocusedNode(nodeId, parentId, panelId);
```

**其他文件**（OutlinerRow、OutlinerView、TrailingInput、FieldRow、FieldValueOutliner、ConfigOutliner）：所有 `setFocusedNode` 调用传入 panelId。这些组件都已有 panelId prop。

## 不做的事

- 不引入 OutlinerSurfaceProvider / FloatingLayer 新抽象
- 不迁移已正常工作的 portal overlay（TagSelector、NodePicker 等）
- 不改节点数据模型
- 不为未来可能的问题预支复杂度

## Checklist

### Phase 1: 可见 bug
- [ ] NodeEmbed.tsx: 添加 `max-h-[60vh] overflow-y-auto`
- [ ] ChatDrawer.tsx: SessionHistoryDropdown 改用 DropdownPanel
- [ ] ChatDrawer.tsx: click-outside handler 排除 `[data-dropdown-panel]`
- [ ] ChatInput.tsx: model menu 改用 DropdownPanel
- [ ] DropdownPanel.tsx: Escape handler 添加 `e.stopPropagation()`

### Phase 2: 焦点隔离
- [ ] ui-store.ts: 新增 `focusedPanelId`，扩展 `setFocusedNode` 签名
- [ ] OutlinerItem.tsx: `isFocused` 检查加 panelId，所有 `setFocusedNode` 调用传 panelId
- [ ] OutlinerRow.tsx: 所有 `setFocusedNode` 调用传 panelId
- [ ] OutlinerView.tsx: 所有 `setFocusedNode` 调用传 panelId
- [ ] TrailingInput.tsx: 所有 `setFocusedNode` 调用传 panelId
- [ ] FieldRow.tsx: 所有 `setFocusedNode` 调用传 panelId
- [ ] FieldValueOutliner.tsx: 所有 `setFocusedNode` 调用传 panelId
- [ ] ConfigOutliner.tsx: 所有 `setFocusedNode` 调用传 panelId

### Phase 3: 验证
- [ ] `npm run verify` 全部通过
- [ ] 更新 vitest 测试（test-sync 要求）

## Test Plan

1. NodeEmbed 展开深层节点 → 出现滚动条，不撑开消息
2. SessionHistoryDropdown → 正常显示，不被裁剪
3. Model menu → 正常显示和选择
4. 点击 portal dropdown 内部 → ChatDrawer 不关闭
5. Escape 先关 dropdown 再关 drawer（不同时关闭）
6. 在 chat embed 中点击编辑节点 → 主 outliner 中同一节点不进入编辑态
7. 在 NodeEmbed 中操作 options/date/reference 字段 → 弹窗正常
8. 主 outliner 中所有 field picker / context menu / editor trigger / focus 正常

## 注意事项

- DropdownPanel 已内置 Escape + click-outside + scroll 重定位，不需要重复实现
- `FIELD_OVERLAY_Z_INDEX` = 1200 > DropdownPanel z-50，field picker 会盖住 DropdownPanel — 正确层级
- `focusedPanelId` 默认 null 表示"兼容旧行为"，不需要一次性改完所有调用点也能安全回退
- Group 2 的 `setFocusedNode` 改动量大（~50 处）但纯机械：每处加 `, panelId` 参数
