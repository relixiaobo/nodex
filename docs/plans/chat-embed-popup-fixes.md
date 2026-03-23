# Chat Embed Popup Fixes

> NodeEmbed 内嵌大纲的弹窗交互修复 + 剩余 absolute 下拉迁移

## 问题

NodeEmbed 在 ChatDrawer 内渲染完整 OutlinerItem，用户可以展开、编辑、操作字段。但 ChatDrawer 有多层 `overflow-hidden`/`overflow-clip` 容器：

```
ChatDrawer (absolute, inset-0)
  └─ Card body (overflow-clip, rounded-t-[22px])
      └─ DrawerContent (overflow-hidden)
          └─ contentRef (overflow-hidden)
              └─ ChatPanel (overflow-hidden)
                  └─ scrollRef (overflow-y-auto)
                      └─ NodeEmbed
                          └─ OutlinerItem (with fields, editors, pickers)
```

两类问题：

1. **NodeEmbed 无高度限制** — 深层节点展开后撑开整个聊天消息，推动其他内容
2. **少数下拉仍用 `absolute` 定位** — 被 overflow-clip 裁剪

## 现状审计

### 已安全（portal + fixed）

| 组件 | 机制 | 备注 |
|------|------|------|
| NodePicker (OptionsPicker) | `createPortal` + fixed | 字段选项 |
| FieldValueOutliner (DatePicker) | `createPortal` + fixed | 日期字段 |
| OutlinerItem options dropdown | `createPortal` + fixed | inline options |
| TrailingInput options dropdown | `createPortal` + fixed | trailing options |
| TagSelector | `createPortal` + fixed | # 触发 |
| ReferenceSelector | `createPortal` + fixed | @ 触发 |
| SlashCommandMenu | `createPortal` + fixed | / 触发 |
| FloatingToolbar | `createPortal` + fixed | 选中文本工具栏 |
| NodeContextMenu | `createPortal` + fixed | 右键菜单 |
| NodePopover | PopoverShell (portal) | chat 内 ref 浮窗 |
| DropdownPanel | `createPortal` + fixed | 通用下拉（可复用） |
| Tooltip | Radix Portal | hover 提示 |

> **结论**：字段系统（options picker、date picker、node picker）和编辑器触发器全部已 portal 化。ChatDrawer 内嵌大纲的字段弹窗本身不会被裁剪。

### 需迁移（absolute 定位）

| 组件 | 当前定位 | 位置 | 风险 |
|------|---------|------|------|
| SessionHistoryDropdown | `absolute top-full z-50` | ChatDrawer 标题栏内 | **高** — 在 overflow-clip 链中 |
| ToolbarUserMenu | `absolute right-0 top-full z-50` | TopBar | 低 — TopBar 无 overflow-hidden |
| Breadcrumb ellipsis | `absolute top-full left-0 z-50` | Panel header | 低 — header 无 overflow-hidden |

### NodeEmbed 容器问题

NodeEmbed 当前无 `max-height`。展开多层子节点会撑开整个消息气泡。需要：
- 添加 `max-h-[60vh] overflow-y-auto` 到 NodeEmbed 容器
- 确保 scrollable 容器不影响 portal dropdown 的定位（`closest('.overflow-y-auto')` 可能找到 NodeEmbed 而非 scrollRef）

### ChatDrawer click-outside 交互

ChatDrawer 的关闭逻辑（`pointerdown` on document）需要排除 portal 内容：
- 当前已排除 `.shadow-paper` class — 大多数 portal dropdown 有这个 class
- 需确认 DropdownPanel（`data-dropdown-panel`）、field overlay portal 等都被排除

## 修改清单

### Phase 1: NodeEmbed 容器 + click-outside 加固

**文件：`src/components/chat/NodeEmbed.tsx`**

1. 外层容器添加 `max-h-[60vh] overflow-y-auto`
2. 添加 `data-chat-embed` 属性供 CSS / event delegation 使用

**文件：`src/components/layout/ChatDrawer.tsx`**

3. click-outside handler 增加排除条件：
   - `target.closest('[data-dropdown-panel]')` — DropdownPanel portal
   - `target.closest('[style*="position: fixed"]')` 或更精确的 `target.closest('.shadow-paper, [data-dropdown-panel]')`
   - 建议统一方案：所有 portal dropdown 添加 `data-portal-dropdown` 属性，click-outside 统一排除

### Phase 2: SessionHistoryDropdown portal 迁移

**文件：`src/components/layout/ChatDrawer.tsx` (SessionHistoryDropdown)**

4. 用 `DropdownPanel` 替换 `absolute` 定位的内联 div：
   - 添加 `anchorRef` 指向标题按钮
   - 用 `<DropdownPanel anchorRef={anchorRef} onClose={...}>` 包裹内容
   - 移除 inline `absolute` 样式
   - 保留现有的 session 列表 + rename 功能

### Phase 3: ChatInput model menu 统一

**文件：`src/components/chat/ChatInput.tsx`**

5. 当前 model menu 用 ad-hoc `createPortal`，迁移到 `DropdownPanel`：
   - 用 `anchorRef` 指向 model 按钮
   - 用 `<DropdownPanel>` 替换 ad-hoc portal div
   - 移除手动定位逻辑和 `modelMenuPortalRef`

### Phase 4: 统一 portal 标记（可选）

6. 所有 portal-based dropdown 统一添加 `data-portal-dropdown` 属性
7. ChatDrawer / ChatInput 等组件的 click-outside handler 统一用 `target.closest('[data-portal-dropdown]')` 排除

## 不需要改的

- **ToolbarUserMenu** — TopBar 无 overflow-hidden，不会被裁剪。保持 absolute
- **Breadcrumb ellipsis** — Panel header 无 overflow-hidden。保持 absolute
- **字段系统 portal** — 已全部 portal 化，无需改动
- **编辑器触发器** — TagSelector/ReferenceSelector/SlashCommand 已 portal 化

## 测试要点

1. **NodeEmbed 高度限制**：展开深层节点，确认出现滚动条而非撑开消息
2. **SessionHistoryDropdown**：在 ChatDrawer 中点击标题，下拉正常显示且不被裁剪
3. **ChatInput model menu**：在 ChatDrawer 中切换模型，菜单正常显示
4. **Click-outside**：点击 portal dropdown 内部不关闭 ChatDrawer
5. **Escape 优先级**：在 portal dropdown 打开时按 Escape 先关闭 dropdown，不关闭 ChatDrawer
6. **字段操作**：在 NodeEmbed 中操作 options/date/reference 字段，弹窗正常显示和交互
7. **回归**：主 outliner 中所有 field picker / context menu / editor trigger 正常

## 注意事项

- DropdownPanel 已内置 Escape + click-outside + scroll 重定位，不需要重复实现
- `FIELD_OVERLAY_Z_INDEX` = 1200 > DropdownPanel 的 z-50，field picker 会盖住 DropdownPanel — 这是正确的层级
- NodeEmbed 添加 `overflow-y-auto` 后，NodePicker 的 `closest('.overflow-y-auto')` 可能找到 NodeEmbed 容器而非 ChatPanel scrollRef — 需要验证定位是否仍然正确（应该没问题，因为 dropdown 用 `getBoundingClientRect` 计算 fixed 坐标）
