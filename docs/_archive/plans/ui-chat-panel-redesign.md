# Chat & Panel UI 设计调研与实现计划

> 日期: 2026-03-12
> 来源: Gemini 3.1 Pro 分析 + nodex 补充细节
> 状态: 待执行

---

## 一、现状审计

### 1.1 非标字号 `text-[12px]`

design-system §3 字号阶梯只允许 11/13/15/17/20/24px。`12px` 不在梯度中，应统一为 `text-xs` (11px)。

| 文件 | 行 | 当前 | 改为 |
|------|-----|------|------|
| `ChatDrawer.tsx` | 178 | `text-[12px] font-medium uppercase tracking-[0.08em]` | `text-xs font-medium uppercase tracking-[0.08em]` |
| `ChatDrawer.tsx` | 185 | `rounded-xl border border-border bg-background px-3 py-2 text-[12px] text-foreground-secondary` | `rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground-secondary` |
| `ChatDrawer.tsx` | 191 | `mb-1.5 block text-[12px] font-medium uppercase tracking-[0.08em]` | `mb-1.5 block text-xs font-medium uppercase tracking-[0.08em]` |
| `ChatDrawer.tsx` | 206 | `mt-3 text-[12px] text-destructive` | `mt-3 text-xs text-destructive` |
| `ChatDrawer.tsx` | 233 | `mt-4 inline-flex items-center gap-1 text-[12px] text-foreground-tertiary` | `mt-4 inline-flex items-center gap-1 text-xs text-foreground-tertiary` |
| `ChatInput.tsx` | 34 | `mb-2 rounded-lg border border-destructive/15 bg-destructive/5 px-2.5 py-2 text-[12px] text-destructive` | `mb-2 rounded-lg border border-destructive/15 bg-destructive/5 px-2.5 py-2 text-xs text-destructive` |
| `ChatInput.tsx` | 57 | `inline-flex h-10 items-center gap-1.5 rounded-xl border border-border px-3 text-[12px] font-medium` | `inline-flex h-10 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-medium` |
| `ToolCallBlock.tsx` | 53 | `min-w-0 flex-1 truncate text-[12px] font-medium text-foreground-secondary` | `min-w-0 flex-1 truncate text-xs font-medium text-foreground-secondary` |

### 1.2 非标圆角 `rounded-xl` / `rounded-2xl`

design-system §5: 容器/输入框 = `rounded-lg` (8px)，按钮 = `rounded-full` (pill)。`rounded-xl` (12px) 和 `rounded-2xl` (16px) 均不在三级圆角系统中。

| 文件 | 行 | 元素 | 当前 | 改为 |
|------|-----|------|------|------|
| `ChatDrawer.tsx` | 123 | 窄屏容器 | `rounded-t-[20px]` | `rounded-t-xl` *(此处保留 — 抽屉顶部圆角比容器标准大一级合理)* |
| `ChatDrawer.tsx` | 176 | 设置卡片 | `rounded-2xl border border-border bg-foreground/[0.02] p-4` | `rounded-lg border border-border bg-foreground/4 p-4` |
| `ChatDrawer.tsx` | 185 | saved key 容器 | `rounded-xl border` | `rounded-lg border` |
| `ChatDrawer.tsx` | 201 | API key input | `rounded-xl border border-border bg-background px-3 py-2` | `rounded-lg border border-border bg-background px-3 py-2` |
| `ChatDrawer.tsx` | 214 | Save 按钮 | `rounded-xl bg-foreground px-3` | `rounded-full bg-foreground px-3` |
| `ChatDrawer.tsx` | 222 | Clear 按钮 | `rounded-xl border border-border px-3` | `rounded-full border border-border px-3` |
| `ChatMessage.tsx` | 126 | 用户消息气泡 | `rounded-2xl bg-foreground/[0.04] px-3 py-2` | `rounded-lg bg-foreground/[0.04] px-3 py-2` |
| `ChatInput.tsx` | 45 | textarea | `rounded-xl border border-border bg-background` | `rounded-lg border border-border bg-background` |
| `ChatInput.tsx` | 57 | Stop 按钮 | `rounded-xl border border-border px-3` | `rounded-full border border-border px-3` |
| `ChatInput.tsx` | 67 | Send 按钮 | `rounded-xl bg-foreground px-3` | `rounded-full bg-foreground px-3` |
| `ToolCallBlock.tsx` | 44 | 工具调用容器 | `rounded-xl border border-border bg-foreground/[0.02]` | `rounded-lg border border-border bg-foreground/4` |

### 1.3 非标不透明度 `bg-foreground/[0.02]`

design-system §2 不透明度系统最低为 `/4` (0.04)。`0.02` 不在系统中。

| 文件 | 行 | 当前 | 改为 |
|------|-----|------|------|
| `ChatDrawer.tsx` | 176 | `bg-foreground/[0.02]` | `bg-foreground/4` |
| `ToolCallBlock.tsx` | 44 | `bg-foreground/[0.02]` | `bg-foreground/4` |

### 1.4 错误的颜色 Token

`text-muted-foreground` 不是 design-system token，应为 `text-foreground-tertiary`。

| 文件 | 行 | 当前 | 改为 |
|------|-----|------|------|
| `NodePanel.tsx` | 31 | `text-muted-foreground text-sm` | `text-foreground-tertiary text-sm` |
| `PanelStack.tsx` | 12 | `text-muted-foreground text-sm` | `text-foreground-tertiary text-sm` |

### 1.5 按钮样式不一致

`ChatInput.tsx` 的 Stop 按钮是描边 (`border border-border`)，Send 按钮是实心 (`bg-foreground`)。设计上两者是互斥出现的（streaming 时显示 Stop，否则显示 Send），应统一视觉重量。

**改法**: Stop 按钮改为实心 ghost 风格，与 Send 按钮同重量但颜色更温和。

```
当前 Stop (L56-59):
  className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border px-3 text-[12px] font-medium text-foreground transition-colors hover:bg-foreground/4"

改为:
  className="inline-flex h-10 items-center gap-1.5 rounded-full bg-foreground/8 px-3 text-xs font-medium text-foreground transition-colors hover:bg-foreground/15"
```

### 1.6 ToolCallBlock 非标字号 `text-[10px]`

`ToolCallBlock.tsx` L65, L72 使用 `text-[10px]`（Input/Output 标签），不在字号阶梯中。但这是展开后的调试信息，`10px` 比 `11px` 的 `text-xs` 更合理地压缩了辅助内容。**保留不改**——调试区属例外。

---

## 二、设计见解

### 2.1 消息视觉处理

**当前问题**: 用户消息有 `bg-foreground/[0.04]` 气泡包裹，AI 消息是裸文本。不对称本身是有意为之（用户=输入，AI=输出），但 AI 消息缺乏容器感，多条消息之间视觉边界模糊。

**建议**:
- 不给 AI 消息加背景（保持"纸上书写"感）
- 连续同发送者消息**分组**：只在组首显示 sender 标签，组内消息间距从 `space-y-4` (16px) 收紧到 `space-y-1` (4px)

**实现**: `ChatDrawer.tsx` 渲染 messages 时，比较 `messages[i].role` 和 `messages[i-1].role`：
```tsx
// ChatDrawer.tsx L250 附近
messages.map((message, index) => {
  const isGrouped = index > 0 && messages[index - 1].role === message.role;
  return (
    <ChatMessage
      key={...}
      message={message}
      toolResults={toolResults}
      streaming={...}
      grouped={isGrouped}  // 新 prop
    />
  );
})
```

`ChatMessage.tsx` 接收 `grouped` prop：
```tsx
// grouped 时：隐藏 sender 标签，减少顶部间距
<div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} ${grouped ? 'mt-1' : 'mt-4'}`}>
  <div className={...}>
    {!grouped && (
      <span className="text-xs text-foreground-tertiary">
        {isUser ? 'You' : 'soma'}
      </span>
    )}
    ...
  </div>
</div>
```

### 2.2 发送者标签

**当前**: `text-[11px] font-medium uppercase tracking-[0.08em]` — 大写+字间距，有表单标签的生硬感。

**改为**: `text-xs text-foreground-tertiary` — 去掉 `uppercase`、`font-medium`、`tracking-[0.08em]`。小写普通字重，安静地标识发送者。

```
当前 (ChatMessage.tsx L122):
  <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-foreground-tertiary">

改为:
  <span className="text-xs text-foreground-tertiary">
```

### 2.3 空状态

**当前** (`ChatDrawer.tsx` L244-248): 居中灰色文本 "Ask about your notes, clips, or the page you are reading."

**改为**: 更具引导性的"待命助理"设计——保留说明文本 + 添加 2-3 个示例操作按钮。

```tsx
// 替换 ChatDrawer.tsx L243-249
{messages.length === 0 ? (
  <div className="flex h-full min-h-40 flex-col items-center justify-center gap-4 px-6">
    <div className="text-center text-sm text-foreground-tertiary">
      Ask about your notes, clips, or the page you're reading.
    </div>
    <div className="flex flex-col gap-2 w-full max-w-[260px]">
      {[
        'Summarize this page',
        'Organize my notes from today',
        'What did I clip this week?',
      ].map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          onClick={() => void sendMessage(suggestion)}
          className="rounded-lg border border-border px-3 py-2 text-left text-sm text-foreground-secondary transition-colors hover:bg-foreground/4 hover:text-foreground"
        >
          {suggestion}
        </button>
      ))}
    </div>
  </div>
) : (
```

### 2.4 输入框占位符

**当前**: `'Type a message…'` — 太通用。

**改为**: `'Ask about your notes…'` — 体现 AI 与知识库的关系，和空状态文案呼应。

```
ChatInput.tsx L44:
  placeholder={disabled ? 'Claude is responding…' : 'Type a message…'}
改为:
  placeholder={disabled ? 'Responding…' : 'Ask about your notes…'}
```

同时简化底部提示文本：
```
ChatInput.tsx L76-77:
  {disabled ? 'Streaming response…' : 'Send with Cmd/Ctrl+Enter'}
改为:
  {disabled ? '' : '⌘↵ to send'}
```

### 2.5 Z 轴层级预备

**目标**: Chat 视觉上"低于" Node Panel，为未来多面板架构做准备。

**方法**: 在 `main.css` 新增一个"退后色" CSS 变量，比 Paper 底色稍暗，应用到 ChatDrawer。

```css
/* src/assets/main.css @theme 块内新增 */
--color-background-recessed: #EEEEE8;  /* 比 #F5F4EE 暗约 3%，同色相 */
```

```
ChatDrawer.tsx L120-121 (宽屏):
  当前: bg-background
  改为: bg-[var(--color-background-recessed)]

ChatDrawer.tsx L123 (窄屏):
  当前: bg-background shadow-paper
  改为: bg-[var(--color-background-recessed)] shadow-paper
```

**注意**: 窄屏时 Chat 是覆盖物（抽屉），退后色仍适用——抽屉从"桌面层"滑出，视觉上应比纸张更沉。

### 2.6 Chat header 精简

**当前**: header 高度 `h-12` (48px)，包含 Sparkles 图标圆形背景 + "Chat" 文本。图标圆形背景 (`rounded-full bg-primary/10`) 视觉重量过大。

**改为**: 去掉图标圆形背景，只保留 Sparkles 图标 + "Chat" 文本，降低 Chat header 视觉重量（配合 Z 轴退后）。

```
ChatDrawer.tsx L130-132:
  当前:
    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
      <Sparkles size={14} strokeWidth={1.75} />
    </span>
    Chat

  改为:
    <Sparkles size={14} strokeWidth={1.75} className="text-foreground-tertiary" />
    Chat
```

---

## 三、实现计划

### Phase A: 对齐设计系统（纯 CSS，零风险）

共 14 处改动，全部是 className 字符串替换，不改组件结构。

| # | 文件 | 改动 |
|---|------|------|
| 1 | `ChatDrawer.tsx` | 设置卡片 `rounded-2xl ... bg-foreground/[0.02]` → `rounded-lg ... bg-foreground/4` |
| 2 | `ChatDrawer.tsx` | saved key `rounded-xl` → `rounded-lg` |
| 3 | `ChatDrawer.tsx` | API key input `rounded-xl` → `rounded-lg` |
| 4 | `ChatDrawer.tsx` | Save 按钮 `rounded-xl` → `rounded-full` |
| 5 | `ChatDrawer.tsx` | Clear 按钮 `rounded-xl` → `rounded-full` |
| 6 | `ChatDrawer.tsx` | 5 处 `text-[12px]` → `text-xs` |
| 7 | `ChatMessage.tsx` | 用户气泡 `rounded-2xl` → `rounded-lg` |
| 8 | `ChatInput.tsx` | textarea `rounded-xl` → `rounded-lg` |
| 9 | `ChatInput.tsx` | Stop 按钮 `rounded-xl border border-border` → `rounded-full bg-foreground/8` |
| 10 | `ChatInput.tsx` | Send 按钮 `rounded-xl` → `rounded-full` |
| 11 | `ChatInput.tsx` | Stop 按钮 `text-[12px]` → `text-xs` |
| 12 | `ToolCallBlock.tsx` | 容器 `rounded-xl bg-foreground/[0.02]` → `rounded-lg bg-foreground/4` |
| 13 | `ToolCallBlock.tsx` | 摘要 `text-[12px]` → `text-xs` |
| 14 | `NodePanel.tsx` + `PanelStack.tsx` | `text-muted-foreground` → `text-foreground-tertiary` |

### Phase B: 视觉增强（低风险，涉及少量 prop 添加）

| # | 文件 | 改动 |
|---|------|------|
| 1 | `ChatMessage.tsx` | sender 标签去掉 `uppercase font-medium tracking-[0.08em]` |
| 2 | `ChatMessage.tsx` | 新增 `grouped?: boolean` prop，grouped 时隐藏 sender 标签 + 收紧间距 |
| 3 | `ChatDrawer.tsx` | 渲染 messages 时计算 `isGrouped` 并传入 |
| 4 | `ChatDrawer.tsx` | 空状态改为示例操作按钮（见 §2.3 代码） |
| 5 | `ChatInput.tsx` | placeholder `'Type a message…'` → `'Ask about your notes…'` |
| 6 | `ChatInput.tsx` | 底部提示 `'Send with Cmd/Ctrl+Enter'` → `'⌘↵ to send'` |
| 7 | `ChatDrawer.tsx` | Chat header Sparkles 图标去掉圆形背景 |

### Phase C: Z 轴层级预备（1 处 CSS 变量 + 2 处应用）

| # | 文件 | 改动 |
|---|------|------|
| 1 | `main.css` | `@theme` 块新增 `--color-background-recessed: #EEEEE8` |
| 2 | `ChatDrawer.tsx` | 宽屏 `bg-background` → `bg-[var(--color-background-recessed)]` |
| 3 | `ChatDrawer.tsx` | 窄屏 `bg-background` → `bg-[var(--color-background-recessed)]` |

### Phase D: 留待多面板架构

- 窄屏 Chat 覆盖 Node Panel 的问题（AI 操作结果被抽屉遮挡）
- 需要可拖动分屏视图或新的紧凑布局模式
- 等多面板导航架构一起规划

### 不要动

- `NodePanel.tsx` 的 `pt-12`：为 TopToolbar 留空，正确
- `ChatMessage.tsx` 用户气泡 `bg-foreground/[0.04]`：`/4` 在不透明度系统中，正确
- `ToolCallBlock.tsx` 展开区的 `text-[10px]`：调试信息例外，保留
- lucide 图标 `strokeWidth`：保持 1.5-1.75，不改为 2
- `ChatDrawer.tsx` 窄屏 `rounded-t-[20px]`：抽屉顶部大圆角是合理例外
