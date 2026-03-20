# Tab + Split 布局重构

> 从"N 面板并排"到"Tab + 双栏分割"，参考 Arc 浏览器交互模型。
>
> **2026-03-20** — 产品讨论

## 背景

### 当前问题

现有布局是 N 个面板并排（Panel 模型）：
- 每个面板是平等的，没有主次
- 窄屏时用标签切换，宽屏时并排显示
- ← → 按钮同时管理 tab 间切换和 tab 内导航，用户搞不清
- 工具栏（← → ⌘K 头像）为 Outliner 设计，Chat-first 体验下不适配
- Side Panel 宽度有限（300-700px），3+ 面板时每个面板太窄

### Chat-first 的矛盾

现在产品方向是 Chat-first，但布局仍然是 Outliner 时代的多面板模型。Chat 面板和 Node 面板是"平等的"，用户需要自己管理面板的打开/关闭/排列。

实际上用户的心智模型不是"我有 5 个并排的面板"，而是"我有几个工作上下文在同时进行"。

## 新模型：Tab + Split

### 核心概念

参考 Arc 浏览器的交互：

- **Tab** = 一个独立的工作上下文（像浏览器标签页）
- **Split** = tab 内最多两栏并排（主内容 + 参考内容）
- Tab 之间切换不影响彼此的 split 状态

```
Tab 1: Chat with AI          Tab 2: Research          Tab 3: Today
┌──────────┬──────────┐   ┌──────────┬──────────┐   ┌──────────────┐
│ Chat     │ 节点详情  │   │ 文章笔记  │ 竞品对比  │   │ Journal      │
│ (主内容)  │ (split)  │   │ (主内容)  │ (split)  │   │ (无 split)   │
└──────────┴──────────┘   └──────────┴──────────┘   └──────────────┘
```

### 设计规则

**Tab**：
- 用户可以打开多个 tab
- 每个 tab 有自己的标题（Chat 标题 / 节点名 / "Today" 等）
- Tab 之间切换不进 back/forward 历史
- 关闭 tab 可以 undo（类似浏览器 Ctrl+Shift+T）

**Split（双栏）**：
- 每个 tab 内最多 2 栏——不支持 3+（Side Panel 宽度不够）
- 左栏 = 主内容（固定），右栏 = 参考内容（可打开/关闭）
- 打开 split 的方式：点击 Chat 中的节点引用、"Open in split" 按钮等
- 关闭 split：点击 × 或再次点击触发元素
- 每个 tab 的 split 状态独立（切换 tab 再切回来，split 保持）
- 窄屏时：不显示 split，参考内容用其他方式呈现（浮层或新 tab）

**Back/Forward**：
- 只在 tab 内部工作（split 的导航历史）
- 不跨 tab

### Chat 交互的统一

Tab + Split 统一了 Chat 中查看节点的所有交互：

| 交互 | 当前设计 | Tab + Split |
|------|---------|-------------|
| `<ref>` 点击 | 弹 Popover 浮窗 | 右侧 split 打开节点 |
| `<node />` 内嵌 | 内嵌 OutlinerView | 保留内嵌，"Open in split" 深入编辑 |
| `<cite>` 点击 | 弹 Popover | 右侧 split 打开来源 |
| "Open in panel" 按钮 | 跳到独立面板 | 变为 "Open in split"，不离开 tab |
| AI 创建节点 | 工具调用日志 | 右侧 split 显示新节点 |

用户在 Chat tab 中从头到尾不离开：

```
Chat 中看到节点
  → 点击 <ref>
    → 右侧 split 打开该节点
      → 直接编辑
        → 关闭 split，回到纯 Chat
        → 或保持 split，继续聊
```

### 对比 Popover

| 维度 | Popover | Split |
|------|---------|-------|
| 空间 | 小浮窗，遮挡 Chat 内容 | 半屏，不遮挡 |
| 编辑 | 受限（浮窗内 OutlinerView） | 完整编辑体验 |
| 持久性 | 点外面就关 | 保持打开，切 tab 再回来还在 |
| 多节点 | 每次只看一个 | split 内可以导航（back/forward） |

Split 比 Popover 更自然、更有用。Popover 可以降级为 tooltip（hover 预览），split 处理所有深入查看/编辑的需求。

## 去掉的东西

| 现有功能 | 处理 |
|---------|------|
| N 面板并排 | 去掉，改为 tab + 最多 2 栏 |
| 面板 resize handle | 去掉，2 栏 50/50 或预设比例 |
| 活跃面板指示器 | 去掉，tab 本身就是指示器 |
| 全局 ← → 跨面板 | 改为 tab 内 split 导航 |
| 窄屏标签切换模式 | 简化为纯 tab 切换（无 split） |

## 保留的东西

| 功能 | 说明 |
|------|------|
| ⌘K 命令面板 | 保留，搜索节点/Chat/命令 |
| 用户头像菜单 | 保留，移到标题栏或 tab 栏 |
| Chat 面板内容 | 保留，成为 Chat tab 的主内容 |
| Node 面板（OutlinerView） | 保留，成为 Node tab 或 split 内容 |
| ChatPanelHeader | 保留/调整，成为 tab header |

## 窄屏处理

Side Panel 宽度 < 500px 时：
- 不显示 split（只有主内容）
- 点击 `<ref>` → 打开新 tab（而非 split）
- tab 切换保持现有的标签模式

## 不确定的问题

1. **Tab 栏的位置**——顶部标题栏下方？还是侧面？Side Panel 垂直空间有限
2. **默认 tab 数量**——新用户只有一个 Chat tab？还是默认 Chat + Today 两个？
3. **Tab 数量限制**——最多几个 tab？太多 tab 标签栏放不下
4. **Split 比例**——固定 50/50？还是可拖拽？还是预设几种比例（50/50、60/40）？
5. **Popover 是否完全去掉**——还是保留为 hover 预览（tooltip），split 处理点击？

## 实施考虑

这是一个大的架构调整，涉及：
- `ui-store.ts`：从 `panels[]` 改为 `tabs[]`，每个 tab 有 `mainContent` + `splitContent`
- `PanelLayout.tsx`：重写为 TabLayout
- `ChatPanel.tsx`：ref/cite/node 点击改为打开 split
- `NavigationEvent`：简化，只处理 tab 内 split 导航
- 所有面板管理逻辑（openPanel、closePanel、setActivePanel 等）重写

建议分阶段：
1. **Phase 1**: Tab 模型（单栏，去掉多面板）— 简化现有代码
2. **Phase 2**: Split 支持（tab 内双栏）— 新增分栏能力
3. **Phase 3**: Chat 交互统一（ref/cite/node → split）— 替换 Popover
