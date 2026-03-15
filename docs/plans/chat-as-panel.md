# Chat Toggle + Notes Dropdown — 设计方案

> 窄屏不再挤压，Chat 和 Notes 全屏互切；宽屏保持并排，加一个显式 toggle 按钮。

## 动机

当前窄屏问题：Chat 开启时上下挤压面板空间，两边都不好用。而窄屏本来就只能看一个东西（面板已是 tab 模式），"并排"不是目标，**全屏互切**才是。

当前窄屏 tab bar 问题：多个面板挤成 N 个小 tab，区分度低，不实用。

## 核心变化

| 现状 | 目标 |
|------|------|
| 窄屏 Chat：上下挤压面板 | 窄屏 Chat：全屏显示，面板隐藏 |
| 窄屏 tab bar：N 个小标签 | `[Notes ▾]` 下拉选择器 |
| Chat 开关只在菜单/快捷键里 | GlobalTools 加显式 Chat toggle 按钮 |
| 宽屏 Chat：面板左 + Chat 右 | 不变 |

**不变的**：`chatOpen` toggle 机制、Agent 单例、Chat session 管理、ChatDrawer 组件、`useChatResize`（宽屏水平拖拽）、⌘L 快捷键。

---

## 1. DeskLayout 窄屏行为

当前四种状态和目标：

| 宽窄 | chatOpen | 现状 | 目标 |
|------|---------|------|------|
| 宽 | false | 面板铺满 | **不变** |
| 宽 | true | 面板左 + Chat 右（水平拖拽） | **不变** |
| 窄 | false | 面板铺满 | **不变** |
| 窄 | true | 面板上 + Chat 下（垂直挤压） | **Chat 全屏，面板隐藏** |

改动只有一格。窄屏二选一——Chat 或面板，像程序最大化/最小化：

```tsx
// DeskLayout.tsx — narrow 分支

const narrowChat = chatOpen && !isWideLayout;

// 窄屏：Chat 和面板互斥，全屏切换
{narrowChat ? (
  <Suspense fallback={<ChatFallback />}>
    <ChatDrawer />
  </Suspense>
) : (
  <PanelLayout toolbar={<GlobalTools />} />
)}
```

- **打开 Chat**：✦ toggle 按钮（GlobalTools 内）或 ⌘L → Chat 最大化，面板消失
- **关闭 Chat**：ChatDrawer 自带的 X 按钮或 ⌘L → Chat 消失，面板恢复

PanelLayout 完全不需要知道 Chat 的存在。无需任何新 prop。

**删除**：窄屏的垂直 resize handle 分支（resize handle + 固定高度 Chat 容器）。`useChatResize` 的 height 逻辑保留（无害），不阻塞。

---

## 2. Chat Toggle 按钮

在 GlobalTools 中添加显式 Chat toggle 按钮——点击展开 Chat，再次点击收起。

```typescript
// src/components/toolbar/TopToolbar.tsx — GlobalTools 内部

<button
  type="button"
  onClick={toggleChat}
  className={TOOL_BUTTON_CLASSES}
  aria-label={chatOpen ? 'Close chat' : 'Open chat'}
  aria-pressed={chatOpen}
>
  <Sparkles size={15} strokeWidth={1.6} />
</button>
```

图标复用 ChatDrawer header 的 `Sparkles`（✦），保持一致。按下态用颜色区分（active = `text-foreground`，inactive = `text-foreground-tertiary`）。

位置：`NavButtons` → `SearchTrigger` → **ChatToggle** → `ToolbarUserMenu`。

同时从 `ToolbarUserMenu` 下拉菜单中移除 `openChat()` 项——✦ 按钮是更直接的入口。

---

## 3. Notes Dropdown（窄屏 tab 模式）

### 触发条件

只替换现有 tab 模式。当前条件：`panels.length > 1 && containerWidth / panels.length < MIN_PANEL_WIDTH`。单面板窄屏不进 tab 模式，用现有 shaped tab 布局，不受影响。

### 布局

header 行：

```
[▾ Active Panel Name] ────── flex-1 spacer ────── [GlobalTools]
```

点击 `[▾ Active Panel Name]` 展开下拉：

```
┌────────────────────────────┐
│ ● Panel 1 Name         ✕  │  ← 当前激活（高亮）
│   Panel 2 Name         ✕  │
│   Panel 3 Name         ✕  │
└────────────────────────────┘
```

- 选择面板 → `setActivePanel(panelId)`，下拉关闭
- ✕ → `closePanel(panelId)`（最后一个面板不可关闭）

实现：Radix `DropdownMenu` 或 state-controlled Popover。

---

## 4. 文件清单

| 文件 | 改动 | 大小 |
|------|------|------|
| `src/components/layout/DeskLayout.tsx` | 窄屏二选一：chatOpen → ChatDrawer，否则 PanelLayout；删除垂直 resize 分支 | 小 |
| `src/components/toolbar/TopToolbar.tsx` | GlobalTools 加 Chat toggle 按钮 | 小 |
| `src/components/toolbar/ToolbarUserMenu.tsx` | 移除 `openChat()` 菜单项 | 小 |
| `src/components/panel/PanelLayout.tsx` | tab 模式：N tabs → Notes dropdown | 中 |

**不改的**：`ui-store.ts`、`ChatDrawer.tsx`、`ai-service.ts`、`use-agent.ts`、`use-chat-shortcut.ts`、`use-chat-resize.ts`。

**测试**：当前无 DeskLayout / PanelLayout / TopToolbar 的测试文件。`check:test-sync` 要求 `src/` 有变动时 `tests/vitest/` 必须也有变动。需要至少更新一个测试文件。

---

## 5. Checklist

- [ ] `TopToolbar.tsx` — GlobalTools 加 Chat toggle 按钮（✦ Sparkles + `toggleChat`）
- [ ] `ToolbarUserMenu.tsx` — 移除 `openChat()` 菜单项
- [ ] `DeskLayout.tsx` — 窄屏 chatOpen 分支改为全屏 ChatDrawer，删除垂直 resize
- [ ] `PanelLayout.tsx` — tab 模式：N tabs → `[▾ ActivePanelName]` dropdown
- [ ] 更新测试文件（满足 `check:test-sync`）
- [ ] `npm run verify`
