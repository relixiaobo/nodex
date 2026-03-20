# 布局设计：Side Panel Toggle + 桌面端 Tab-Split

> 两种平台，两种布局，共享视图组件。
>
> **2026-03-20** — 产品讨论最终收敛

## 核心原则

视图组件（ChatPanel、NodePanel）跟布局逻辑完全分离。组件不知道自己在什么布局里——它们接收一个容器就渲染。布局决策在上层。

```
ChatPanel ──┐
            ├── SidePanelLayout（toggle 模式）
NodePanel ──┤
            ├── DesktopLayout（tab + split 模式）
            │
            └── 未来其他平台
```

---

## Part 1：Side Panel 布局（当前优先）

### 为什么不做多 Tab / 分栏

浏览器 Side Panel 是一个窄而不稳定的辅助界面（300-700px），不是完整工作台。在这里做多 tab、分栏、split 会：

1. **心智冲突**——用户已经有浏览器 tab，产品内再做一层 tab 太重
2. **载体限制**——宽度随时可能被拉窄，复杂布局迅速退化
3. **优先级错误**——当前最关键的体验是 Chat ↔ Outliner 的丝滑切换，不是"同时打开多少个面板"

### 设计方案：双视角 Toggle

系统里始终只有一个全屏视图。Chat 和 Node 是同一个工作空间的两个视角，通过顶部 toggle 切换。

#### 顶部布局

```
Chat 选中时：
┌──────────────────────────────────┐
│ 💬 会话标题...          📋    👤 │
├──────────────────────────────────┤
│                                  │
│  Chat 全屏                       │
│                                  │
│  ┌──────────────────────────┐    │
│  │ Ask about your notes...  │    │
│  └──────────────────────────┘    │
└──────────────────────────────────┘

Node 选中时：
┌──────────────────────────────────┐
│ 💬    📋 ← ... / 竞品定价    👤 │
├──────────────────────────────────┤
│                                  │
│  Outliner 全屏                   │
│                                  │
│                                  │
└──────────────────────────────────┘
```

三个元素：
- **Chat 图标** — 选中时展开为图标 + 会话标题，未选中时只有图标
- **Node + 面包屑** — 选中时展开为图标 + ← back + 面包屑，未选中时只有图标
- **头像** — 用户菜单（含 ⌘K 入口）

活跃的视角获得最大空间，另一个压缩为图标。

#### Node 视角的导航

```
📋 ← ... / Week 12 / Today
   ↑  ↑         ↑
   │  │         └── 面包屑：点击跳到祖先节点
   │  └── ...：点击展开完整祖先列表
   └── ←：back，回到上一个浏览过的节点
```

- `←` = back（节点浏览历史回退）
- 面包屑 = 层级导航（向上）
- 不需要独立的 ← → 按钮——back 融入面包屑，forward 自然省略

Chat 视角没有导航——就是对话流，不需要 back/forward 或面包屑。

#### 切换行为

**点击 Chat 图标**：
- 切换到 Chat 全屏
- 恢复上次的对话状态（滚动位置、输入草稿、streaming 进度）

**点击 Node 图标**：
- 切换到 Outliner 全屏
- 显示的节点取决于上下文：
  - 当天首次进入 → Today
  - 非首次进入 → 上次打开的节点
  - 从 Chat 中点击 `<ref>` / `<node />` → 那个具体节点

**从 Chat 中点击节点引用**：
- 自动切换到 Node 视角
- 直接定位到被点击的节点
- 顶部 Chat 图标变为未选中状态（一键可回）

**过渡动画**：
- 平滑滑入（Chat 向左淡出，Node 从右淡入，或交叉淡化）
- 200-300ms，让用户感觉是"焦点移动"而非"页面跳转"

#### Node 视角进入逻辑

| 场景 | 显示什么 |
|------|---------|
| 当天首次点击 Node 图标 | Today（日记节点） |
| 非首次点击 Node 图标 | 上次打开的节点 |
| Chat 中点击 `<ref>` | 那个节点 |
| Chat 中点击 `<node />` 的"全屏编辑" | 那个节点 |
| ⌘K 搜索选中某个节点 | 那个节点 |

#### 状态保持

这是方案成立的生命线：

- **Chat 状态**：对话滚动位置、输入框草稿、streaming 进度、已选模型——切到 Node 再回来一切如初
- **Node 状态**：当前节点、展开/折叠状态、滚动位置、编辑焦点——切到 Chat 再回来一切如初
- **导航历史**：Node 视角有独立的 back 栈——浏览过的节点可以回退
- **编辑同步**：在 Node 中编辑的内容，回到 Chat 时 AI 能感知（system reminder 已实现）

#### 去掉的东西

| 现有功能 | 处理 |
|---------|------|
| N 面板并排 | 去掉，改为 toggle |
| 面板 resize handle | 去掉 |
| 活跃面板指示器 | 去掉，toggle 本身就是指示器 |
| 全局 ← → 按钮 | 去掉，back 融入 Node 面包屑 |
| 窄屏标签切换模式 | 去掉，不需要了（始终全屏） |
| 多面板状态管理 | 大幅简化 |

#### 保留的东西

| 功能 | 说明 |
|------|------|
| ChatPanel 组件 | 保留，成为 Chat 视角的内容 |
| NodePanel / OutlinerView | 保留，成为 Node 视角的内容 |
| 面包屑组件 | 保留，移到顶部 Node 选中区域 |
| ⌘K 命令面板 | 保留，移入头像菜单 |
| Chat 中的 `<node />` 内嵌 | 保留，作为"不切换就能看"的轻量方式 |
| 节点 Popover（ref/cite 点击） | 待定——可能被 toggle 切换替代 |

#### 设计红线

1. **切换不能丢状态** — 只要丢一次草稿/滚动位置，用户就会回避切换
2. **不能重新长出多面板** — 不出现 tab 栈、抽屉叠抽屉、隐藏版面板历史
3. **Chat 中 `<node />` 是"不切换就能看"** — 全屏切换是"需要深入时切"
4. **过渡必须连续** — 不能闪白/闪黑/硬切

---

## Part 2：桌面端 / Web 端布局（未来方向）

> 以下是未来独立窗口 / Web 版的方向，当前不实施。

桌面端屏幕空间充裕，采用 **Tab + Split** 模型（参考 Arc 浏览器）：

### 核心概念

- **Tab** = 独立工作上下文（像浏览器标签页）
- **Split** = tab 内最多两栏并排（主内容 + 参考内容）
- Tab 之间切换不影响彼此的 split 状态

```
Tab 1: Chat with AI          Tab 2: Research          Tab 3: Today
┌──────────┬──────────┐   ┌──────────┬──────────┐   ┌──────────────┐
│ Chat     │ 节点详情  │   │ 文章笔记  │ 竞品对比  │   │ Journal      │
│ (主内容)  │ (split)  │   │ (主内容)  │ (split)  │   │ (无 split)   │
└──────────┴──────────┘   └──────────┴──────────┘   └──────────────┘
```

### 与 Side Panel 的关系

| 维度 | Side Panel | Desktop |
|------|-----------|---------|
| 空间 | 300-700px 窄 | 全屏宽 |
| 并行 | 不支持（toggle） | 支持（tab + split） |
| 复杂度 | 最低 | 更高 |
| 视图组件 | **共享** | **共享** |
| 布局组件 | SidePanelLayout | DesktopLayout |

ChatPanel 和 NodePanel 完全复用。只有 Layout 层不同。

### 桌面端设计规则

- 多 tab：用户可以打开多个独立工作上下文
- Tab 内 split：最多 2 栏（主内容 + 参考内容）
- Chat 中点击节点 → 右侧 split 打开（不离开 Chat tab）
- 每个 tab 独立的 back/forward 历史
- Tab 之间切换不进 back/forward

---

## Part 3：组件架构

### 平台无关（保留）

```
src/components/chat/ChatPanel.tsx      — 自包含，不含布局假设
src/components/panel/NodePanel.tsx     — 自包含，不含布局假设
src/components/panel/Breadcrumb.tsx    — 自包含，接收 nodeId
src/components/search/CommandPalette.tsx — 全局
src/stores/ui-store.ts                 — 视图状态（scroll、expand、draft）
src/stores/node-store.ts               — 数据层
```

### 平台专属（替换）

```
现有：
  src/components/panel/PanelLayout.tsx  — 多面板并排 + 窄屏标签

Side Panel：
  src/components/layout/ToggleLayout.tsx — Chat/Node toggle + 顶部栏

桌面端（未来）：
  src/components/layout/DesktopLayout.tsx — Tab + Split
```

### 实施建议

**Phase 1**：ToggleLayout 替换 PanelLayout
- 新建 ToggleLayout（toggle + 顶部栏 + 过渡动画）
- ChatPanel / NodePanel 不改
- 去掉多面板逻辑
- 状态保持（ui-store per view）

**Phase 2**：打磨过渡体验
- 平滑动画
- 精确的节点定位（从 Chat 点击 → Node 视角定位）
- 面包屑 + back 融合

**Phase 3**：桌面端 DesktopLayout（未来）
- 复用 ChatPanel / NodePanel
- 新增 tab 管理 + split 逻辑
