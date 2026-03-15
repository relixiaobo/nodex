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

改动只有一格：窄屏 + chatOpen 时隐藏面板，Chat 占满空间。

```diff
  // DeskLayout.tsx — narrow + chatOpen 分支

- {/* 窄屏：面板上 + resize handle + Chat 下 */}
- <div className="flex-1 min-h-0"><PanelLayout ... /></div>
- <ResizeHandle />
- <div style={{ height: chatHeight }}><ChatDrawer /></div>

+ {/* 窄屏 + chatOpen：Chat 全屏 */}
+ <Suspense fallback={<ChatFallback />}>
+   <ChatDrawer />
+ </Suspense>
```

窄屏 + !chatOpen 时渲染面板（现状不变）。

**副作用**：窄屏不再需要垂直 resize handle。`useChatResize` 的 height 逻辑可以保留（无害）或后续清理，不阻塞本次改动。

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

---

## 3. Notes Dropdown（窄屏 tab 模式）

当前窄屏 tab 模式：N 个等宽 Chrome 风格标签，每个面板一个。

替换为 `[Notes ▾]` 下拉选择器：

```
┌──────────────────────────────────────────────────┐
│ [▾ Active Panel Name          ]  [✦] [🔍] [👤]  │
├──────────────────────────────────────────────────┤
│                                                  │
│            Active Panel (full height)             │
│                                                  │
└──────────────────────────────────────────────────┘
```

点击 `[▾ Active Panel Name]` 展开下拉：

```
┌────────────────────────────┐
│  Panel 1 Name          ✕  │  ← 当前激活（高亮）
│  Panel 2 Name          ✕  │
│  Panel 3 Name          ✕  │
└────────────────────────────┘
```

- 选择面板 → `setActivePanel(panelId)`，下拉关闭
- ✕ 按钮 → `closePanel(panelId)`（最后一个面板不可关闭）
- 当前激活面板有视觉高亮（如 `bg-foreground/8`）

实现：`PanelLayout` 的 `tabMode` 分支替换为 Dropdown 组件（Radix `DropdownMenu` 或简单的 Popover + 列表）。

### Tab bar 行整体布局

窄屏时 tab bar 行变为：

```
[▾ Notes dropdown] ────── flex-1 spacer ────── [GlobalTools]
```

`GlobalTools`（含 Chat toggle）始终在右侧。这与宽屏的 shaped tab + toolbar 布局一致——左侧是面板标识，右侧是全局工具。

---

## 4. 文件清单

| 文件 | 改动 | 大小 |
|------|------|------|
| `src/components/layout/DeskLayout.tsx` | 窄屏 + chatOpen：渲染 Chat 全屏，隐藏面板 | 小 |
| `src/components/toolbar/TopToolbar.tsx` | GlobalTools 加 Chat toggle 按钮 | 小 |
| `src/components/panel/PanelLayout.tsx` | tab 模式：N tabs → Notes dropdown | 中 |

**不改的**：`ui-store.ts`（`chatOpen` toggle 保留）、`ChatDrawer.tsx`、`ai-service.ts`、`use-agent.ts`、`use-chat-shortcut.ts`、`use-chat-resize.ts`。

---

## 5. Checklist

- [ ] `TopToolbar.tsx` — GlobalTools 加 Chat toggle 按钮（Sparkles icon + `toggleChat`）
- [ ] `DeskLayout.tsx` — 窄屏 + chatOpen 分支：只渲染 ChatDrawer，不渲染 PanelLayout
- [ ] `PanelLayout.tsx` — tab 模式重写：`[▾ ActivePanelName]` dropdown + 面板列表
- [ ] 测试同步
- [ ] `npm run verify`
