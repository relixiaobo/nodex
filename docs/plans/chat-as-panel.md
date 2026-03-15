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

改动只有一格：窄屏 + chatOpen 时 Chat 占满 body 区域。

### 实现方式

**不是隐藏 PanelLayout**，而是让 PanelLayout 的 body 区域显示 ChatDrawer。PanelLayout 的 header 行（Notes 下拉 + GlobalTools）始终可见，用户可以随时通过 Notes 下拉切回面板或通过 ✦ toggle 关闭 Chat。

DeskLayout 通过新 prop `bodyOverride` 传递 Chat 内容：

```tsx
// DeskLayout.tsx — 窄屏分支

const narrowChat = chatOpen && !isWideLayout;

<PanelLayout
  toolbar={<GlobalTools />}
  bodyOverride={narrowChat ? (
    <Suspense fallback={<ChatFallback />}>
      <ChatDrawer />
    </Suspense>
  ) : undefined}
/>
```

PanelLayout 内部：有 `bodyOverride` 时渲染它替代面板 body，header 行不受影响。

```diff
  // PanelLayout.tsx — tab 模式末尾
  {/* Panel body */}
- <div className="...">
-   {isApp ? <AppPanel .../> : <NodePanel .../>}
- </div>
+ {bodyOverride ?? (
+   <div className="...">
+     {isApp ? <AppPanel .../> : <NodePanel .../>}
+   </div>
+ )}
```

窄屏单面板时也一样——`bodyOverride` 在 side-by-side 模式下同样生效（替换面板卡片的 body 区域）。

**副作用**：窄屏不再需要垂直 resize handle。DeskLayout 的窄屏 + chatOpen 分支（resize handle + 固定高度 Chat）整段删除。`useChatResize` 的 height 逻辑保留（无害），不阻塞本次改动。

---

## 2. Chat Toggle 按钮

在 GlobalTools 中添加显式 Chat toggle 按钮，跟 Tana 右上角的气泡图标一样——点击展开 Chat，再次点击收起。

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

位置：在 `ToolbarUserMenu` 前面（`NavButtons` → `SearchTrigger` → **ChatToggle** → `ToolbarUserMenu`）。

同时从 `ToolbarUserMenu` 的下拉菜单中移除 `openChat()` 菜单项——GlobalTools 的 ✦ 按钮是更直接的入口，菜单里不再需要。

---

## 3. Notes Dropdown（窄屏 tab 模式）

### 触发条件

Notes 下拉**只替换现有 tab 模式**。当前 tab 模式条件：`panels.length > 1 && containerWidth / panels.length < MIN_PANEL_WIDTH`。单面板窄屏不进 tab 模式，继续用现有 shaped tab 布局，不受影响。

### 布局

窄屏 tab 模式的 header 行变为：

```
[▾ Active Panel Name] ────── flex-1 spacer ────── [GlobalTools]
```

`GlobalTools`（含 ✦ Chat toggle）始终在右侧。与宽屏的 shaped tab + toolbar 布局一致——左侧面板标识，右侧全局工具。

点击 `[▾ Active Panel Name]` 展开下拉：

```
┌────────────────────────────┐
│ ● Panel 1 Name         ✕  │  ← 当前激活（● 高亮）
│   Panel 2 Name         ✕  │
│   Panel 3 Name         ✕  │
└────────────────────────────┘
```

- 选择面板 → `setActivePanel(panelId)`，下拉关闭
- ✕ 按钮 → `closePanel(panelId)`（最后一个面板不可关闭）
- 当前激活面板有 `●` 标记或背景高亮

实现：Radix `DropdownMenu` 或简单的 state-controlled Popover + 面板列表。

### Body 区域

- 正常情况（`bodyOverride` 无）：渲染活跃面板
- 窄屏 + chatOpen（`bodyOverride` 有）：渲染 ChatDrawer

Header 行不受 `bodyOverride` 影响，始终显示 Notes 下拉和 GlobalTools。

---

## 4. 文件清单

| 文件 | 改动 | 大小 |
|------|------|------|
| `src/components/layout/DeskLayout.tsx` | 窄屏 + chatOpen：通过 `bodyOverride` 传 ChatDrawer，删除垂直 resize 分支 | 小 |
| `src/components/toolbar/TopToolbar.tsx` | GlobalTools 加 Chat toggle 按钮 | 小 |
| `src/components/toolbar/ToolbarUserMenu.tsx` | 移除下拉菜单中的 `openChat()` 项 | 小 |
| `src/components/panel/PanelLayout.tsx` | 新增 `bodyOverride` prop；tab 模式：N tabs → Notes dropdown | 中 |

**不改的**：`ui-store.ts`、`ChatDrawer.tsx`、`ai-service.ts`、`use-agent.ts`、`use-chat-shortcut.ts`、`use-chat-resize.ts`。

**测试**：当前无 DeskLayout / PanelLayout / TopToolbar 的测试文件。`check:test-sync` 要求 `src/` 有变动时 `tests/vitest/` 也必须有变动。需要至少新增或更新一个测试文件（如 PanelLayout Notes dropdown 的基本渲染测试）。

---

## 5. Checklist

- [ ] `TopToolbar.tsx` — GlobalTools 加 Chat toggle 按钮（✦ Sparkles + `toggleChat`）
- [ ] `ToolbarUserMenu.tsx` — 移除 `openChat()` 菜单项
- [ ] `PanelLayout.tsx` — 新增 `bodyOverride` prop；tab 模式重写为 `[▾ ActivePanelName]` dropdown
- [ ] `DeskLayout.tsx` — 窄屏 + chatOpen：`bodyOverride={<ChatDrawer />}`，删除垂直 resize 分支
- [ ] 新增测试文件（满足 `check:test-sync`）
- [ ] `npm run verify`（typecheck → test-sync → test → build）
