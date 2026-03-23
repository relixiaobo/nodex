# Chat Drawer 详细设计

> Outliner 为底，Chat 为抽屉。笔记是焦点，AI 是环境。
>
> **2026-03-23** — 方案 D 细化

---

## 单层布局

去掉多面板时代的双层结构（desk 底色 + card 浮层）。Side Panel 内只有一层——Outliner 直接 full-bleed 填满整个面板。

```
旧（双层）：                      新（单层）：
┌─ desk #EBEBE6 ──────────┐     ┌─ bg-background #F5F4EE ──┐
│  p-1.5                  │     │                          │
│  ┌─ card #F5F4EE ─────┐ │     │  顶栏                    │
│  │  rounded-xl shadow  │ │     │  内容                    │
│  │  内容               │ │  →  │  ...                    │
│  └─────────────────────┘ │     │  悬浮输入栏               │
└──────────────────────────┘     └──────────────────────────┘
```

**去掉的**：
- `p-1.5` 外层 padding
- `rounded-xl` 卡片圆角
- `shadow-card` 卡片阴影
- `bg-background-recessed` desk 底色

**收益**：
- 多出 ~12px 垂直空间 + ~12px 水平空间
- 更像原生应用（Workflowy 风格），flat full-bleed
- 组件结构简化，不需要嵌套容器

---

## 三种状态

### 状态 1：Outliner 全屏（默认）

```
┌──────────────────────────────┐
│ ← →  W / ... / Week 12   👤 │  ← 顶栏
├──────────────────────────────┤
│  # day                  ···  │
│  Today, Sun, Mar 23          │
│  < Today >  | 📅             │
│                              │
│  • 节点 1                     │
│  • 节点 2                     │
│    • 子节点                   │
│  • 节点 3                     │
│                              │
│  ┌──────────────────────────┐│
│  │ 💬 Ask about your notes..││  ← 悬浮输入栏
│  └──────────────────────────┘│
└──────────────────────────────┘
```

用户 80% 时间在此状态。输入栏安静地待在底部。

### 状态 2：Chat 抽屉半高

```
┌──────────────────────────────┐
│ ← →  W / ... / Week 12   👤 │  ← 顶栏始终可见
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  ← 半透明遮罩
│┌────────────────────────────┐│
││ ━━━━                       ││  ← 拖拽条
││ 💬 会话标题       ⟳ ✕      ││
││                            ││
││  对话内容...                ││
││                            ││
││  ┌────────────────────────┐││
││  │ 继续对话...             │││
││  └────────────────────────┘││
│└────────────────────────────┘│
└──────────────────────────────┘
```

发送消息后进入。抽屉占约 75% 高度，顶栏始终露出。

### 状态 3：Chat 全屏

```
┌──────────────────────────────┐
│ ← →  W / ... / Week 12   👤 │  ← 顶栏始终可见
│┌────────────────────────────┐│
││ ━━━━                       ││  ← 下拉恢复到半高
││ 💬 会话标题       ⟳ ✕      ││
││                            ││
││  对话内容...                ││
││                            ││
││  ┌────────────────────────┐││
││  │ 继续对话...             │││
││  └────────────────────────┘││
│└────────────────────────────┘│
└──────────────────────────────┘
```

拖拽到顶部吸附。下拉可恢复半高。

---

## 顶栏

```
┌──────────────────────────────────┐
│ ← →  W / ... / Week 12      👤  │
└──────────────────────────────────┘
  ↑导航   ↑ 面包屑（flex-1）    ↑头像
```

三个区域：
- **左侧：← → Back/Forward** — 节点浏览历史前进后退。位置与浏览器一致
- **中间：面包屑**（flex-1）— W 图标 + 祖先路径，点击导航
- **右侧：👤 用户头像** — 用户菜单（设置、⌘K、登出等）

顶栏是页面的一部分（不是独立标签栏），无间距/圆角问题。抽屉打开时顶栏始终可见——用户始终知道自己在哪个节点。

---

## 悬浮输入栏

### 视觉

```
┌──────────────────────────────┐
│ 💬  Ask about your notes...  │
└──────────────────────────────┘
```

- 位置：Outliner 底部，悬浮在内容之上（`position: sticky bottom` 或 `absolute bottom-0`）
- 宽度：full-bleed（与页面等宽）
- 高度：约 44px（单行输入 + padding）
- 左侧：💬 Chat 图标（点击打开上一次对话）
- 背景：`bg-background` + 顶部渐变遮罩（让下方内容不干扰）
- 样式：安静、不抢眼

### 交互

| 操作 | 行为 |
|------|------|
| 点击输入框 | 聚焦，可输入文字 |
| 输入文字 + Enter | 发送消息 → 打开抽屉（状态 2） |
| 点击 💬 图标 | 打开上一次对话的抽屉（不发送新消息） |
| `Cmd+L` | 聚焦输入框 |

### 设计决策

**不展开**。保持单行。理由：
- Side Panel 宽度有限，展开多行会遮挡 Outliner
- 发送后抽屉打开，后续对话在抽屉内的完整 ChatInput 中进行
- 定位是"快速入口"，不是"完整编辑器"

**不显示模型选择器**。模型选择在抽屉打开后的 ChatInput 中完成。

---

## 抽屉行为

### 打开

- **触发**：发送消息 / 点击 💬 图标 / `Cmd+L`（无输入时）
- **动画**：从底部滑出，250ms `ease-out`
- **默认高度**：75% 视口高度
- **顶栏始终露出**：抽屉不遮挡顶栏

### 关闭

- **下拉拖拽**：拖拽条下拉超过阈值 → 关闭
- **点击遮罩**：点击顶栏下方的半透明遮罩区域 → 关闭
- **关闭按钮**：抽屉头部 ✕
- **`Escape`**：关闭抽屉
- **动画**：滑回底部，200ms `ease-in`

### 高度调节

- **拖拽条**：抽屉顶部短横线，可上下拖拽
- **三个吸附点**：75%（默认）/ 100%（全屏）/ 关闭
- **记住偏好**：用户调整的高度在会话内保持

### 抽屉内结构

```
┌────────────────────────────┐
│ ━━━━ (拖拽条)               │  4px
│ 💬 会话标题    ⟳  ✕         │  36px header
├────────────────────────────┤
│  对话消息列表               │  flex-1, scroll
│  (复用 ChatPanel)           │
├────────────────────────────┤
│  ChatInput (完整版)          │  模型选择器 + 多行输入
└────────────────────────────┘
```

---

## Chat 历史

1. **💬 图标点击**：打开上一次对话（最常用）
2. **⌘K 命令面板**：搜索历史对话
3. **抽屉内 ⟳ 按钮**：新建对话
4. **抽屉内标题点击**：下拉显示最近对话列表（可选）

---

## 节点引用交互

| 场景 | 行为 |
|------|------|
| Chat 中点击 `<ref>` | 关闭抽屉 → Outliner 导航到该节点 |
| Chat 中 `<node />` 内嵌 | 抽屉内正常渲染 |
| `<node />` 的 "Open in outliner" | 关闭抽屉 → Outliner 导航到该节点 |
| 悬浮输入栏中 `@` | 触发节点选择器（注入 AI 上下文）|

---

## 快捷键

| 快捷键 | 行为 |
|--------|------|
| `Cmd+L` | 聚焦悬浮输入框 / 聚焦抽屉内输入框 |
| `Escape` | 关闭抽屉 |
| `Cmd+Shift+D` | Outliner 导航到 Today |
| `Cmd+K` | 命令面板 |

---

## 状态管理

```typescript
interface UIStore {
  // Outliner（始终存在）
  currentNodeId: string | null;
  nodeHistory: string[];
  nodeHistoryIndex: number;

  // Chat 抽屉
  chatDrawerOpen: boolean;
  chatDrawerHeight: number;          // 0-1，默认 0.75
  currentChatSessionId: string | null;

  // 操作
  openChatDrawer(sessionId?: string): void;
  closeChatDrawer(): void;
  setChatDrawerHeight(height: number): void;
  navigateToNode(nodeId: string): void;
  goBackNode(): void;
  goForwardNode(): void;

  // 移除
  // activeView — Outliner 始终活跃
  // switchToChat / switchToNode — 不需要
}
```

### 持久化

- `currentNodeId`、`currentChatSessionId` → chrome.storage
- `chatDrawerOpen` → 不持久化（默认关闭）
- `chatDrawerHeight` → chrome.storage（记住偏好）

---

## 组件架构

```
App.tsx
  └── DrawerLayout.tsx (新，替换 ToggleLayout)
        ├── TopBar (← → + 面包屑 + 👤)
        ├── NodePanel (始终可见，flex-1 scroll)
        ├── FloatingChatBar (新, sticky bottom)
        │     ├── 💬 图标
        │     └── 输入框
        └── ChatDrawer (覆盖层, 条件渲染)
              ├── DragHandle
              ├── DrawerHeader (标题 + ⟳ + ✕)
              ├── ChatPanel (复用, hideHeader=true)
              └── ChatInput (复用)
```

### 新建

- `DrawerLayout.tsx` — 替换 ToggleLayout，单层 full-bleed
- `FloatingChatBar.tsx` — 底部悬浮输入栏
- `ChatDrawer.tsx` — 抽屉容器（拖拽 + 遮罩 + 动画）

### 保留

- `ChatPanel.tsx`、`NodePanel.tsx`、`OutlinerView.tsx`、`ChatInput.tsx`、`CommandPalette.tsx`

### 删除

- `ToggleLayout.tsx`

---

## 实施计划

### Phase 1：基础结构

- DrawerLayout 替换 ToggleLayout（单层 full-bleed）
- 顶栏（← → + 面包屑 + 👤，恢复 NavButtons）
- FloatingChatBar（单行输入 + 发送 → 打开抽屉）
- ChatDrawer（固定高度 75%，无拖拽）
- 关闭：Escape + ✕ + 点击遮罩

### Phase 2：交互打磨

- 拖拽调整高度（三个吸附点）
- 动画（spring slide）
- 💬 图标打开上次对话
- 抽屉内 ⟳ 新建 / 切换对话

### Phase 3：细节完善

- 高度偏好持久化
- 节点引用交互（关闭抽屉 + 导航）
- 键盘快捷键适配

---

## 设计红线

1. **Outliner 始终可见** — 抽屉关闭 = 全屏 Outliner，抽屉打开 = 顶栏仍可见
2. **输入即对话** — 打字+回车就开始，不需要先"打开 Chat"
3. **不丢状态** — 关闭抽屉再打开，对话仍在
4. **不加层级** — 只有 Outliner + 抽屉两层
5. **单层布局** — 无 desk/card 双层，full-bleed 填满面板
6. **输入栏不膨胀** — 始终单行
