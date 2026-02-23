# Side Panel 布局改造方案

> 状态: Draft — 等待 Review
> 创建: 2026-02-23
> 关联: Undo/Redo (#44)、CommandPalette 增强

---

## 1. 动机

Chrome Side Panel 宽度受限（300–700px），当前 Sidebar（w-56 = 224px）占用过多横向空间。即使可以折叠，Sidebar 的展开/折叠切换本身就是交互负担。

**核心改动**: 移除 Sidebar，将其功能重新分配到更高效的交互载体上。

## 2. 设计决策（已确认）

| 决策 | 结论 |
|------|------|
| Sidebar | 完全移除 |
| 容器导航 (Library/Inbox/Journal/Trash) | 移入 ⌘K 命令面板 |
| Search (搜索) | 移入 ⌘K 命令面板 |
| 同步状态 | 用户头像旁的彩色小圆点（IM 通知风格） |
| 用户头像 | 顶栏右侧，点击弹出菜单 |
| ←→ 按钮 | 操作 Undo/Redo（Loro UndoManager），不是浏览器历史 |
| 面包屑 `<` | 保留，仅做父级导航 |

## 3. 新布局规格

### 3.1 整体结构

```
┌─────────────────────────────────────┐
│ [←][→]  [🔍 Search...  ⌘K]  [●🧑‍] │  ← 顶栏 (h-11, 44px)
├─────────────────────────────────────┤
│ [< W › parent ›]                   │  ← 面包屑 (h-8, 32px)
├─────────────────────────────────────┤
│                                     │
│            PanelStack               │  ← 主内容区 (flex-1)
│                                     │
└─────────────────────────────────────┘
```

对比当前布局：
```
┌──────────┬──────────────────────────┐
│ Sidebar  │ [≡ < W › ...  🔍]       │  ← 面包屑
│ w-56     ├──────────────────────────┤
│          │                          │
│ - Search │       PanelStack         │  ← 主内容区
│ - Nav    │                          │
│ - Sync   │                          │
│ - User   │                          │
└──────────┴──────────────────────────┘
```

### 3.2 顶栏 (TopToolbar)

```
┌─────────────────────────────────────┐
│ [←][→]     [🔍 Search...  ⌘K]  [●🧑‍] │
│  ↑           ↑                  ↑   │
│  Undo/Redo   搜索入口           头像 │
└─────────────────────────────────────┘
```

**布局**: `flex items-center h-11 px-3 gap-2`
- 左侧: Undo (←) + Redo (→) 按钮
- 中部: 搜索输入框（`flex-1`，点击打开 ⌘K 面板，非真实输入框）
- 右侧: 同步状态圆点 + 用户头像

#### Undo/Redo 按钮
- 图标: `Undo2` / `Redo2`（lucide）
- 尺寸: 28×28px (h-7 w-7)
- 状态: 无可撤销操作时 `opacity-30 cursor-default`
- 快捷键: `⌘Z` / `⌘⇧Z`
- ⌘Z/⌘⇧Z 覆盖**所有用户操作**的撤销/重做（编辑、展开/收起、导航等），不仅仅是数据变更
- 详细设计留给 #44 Undo/Redo 任务，本方案只放按钮占位

#### 搜索入口（SearchTrigger）
- 外观: 纯文本占位符风格的按钮，无图标。圆角、浅灰背景，左侧灰色 placeholder 文字 `Search...`，右侧 `⌘K` 快捷键 badge
- 效果: `[ Search...              ⌘K ]` — 干净、一眼可识别用途，快捷键提示降低学习成本
- 行为: **纯触发器**，点击后打开 CommandPalette 弹层（不是内联输入）
- 宽度: `flex-1 max-w-xs`（不超过 240px，避免挤压两侧按钮）

#### 同步状态圆点
- 位置: 用户头像左上角或左侧
- 尺寸: 8×8px 圆形
- 颜色映射:
  | 状态 | 颜色 | 说明 |
  |------|------|------|
  | local-only | 不显示 | 未登录 |
  | synced | `bg-green-500` | 已同步 |
  | syncing | `bg-blue-500 animate-pulse` | 同步中 |
  | pending | `bg-amber-500` | 有待同步 |
  | error | `bg-red-500` | 同步错误 |
  | offline | `bg-gray-400` | 离线 |
- Tooltip: hover 显示详细状态文本（沿用现有 `buildTooltip` 逻辑）

#### 用户头像
- 尺寸: 24×24px (h-6 w-6)
- 已登录: Google 头像或 initials
- 未登录: 通用用户图标 + 点击触发 Google 登录
- 点击: 弹出下拉菜单（用户信息 + Sign out）

### 3.3 面包屑 (Breadcrumb) 精简

移除 Sidebar toggle 按钮（Sidebar 不再存在），移除搜索按钮（已在顶栏），保留：
- `<` 父级导航按钮
- `[W]` 工作区 avatar
- 祖先链 (`›` 分隔)
- 当前节点名（滚动后显示）

高度从 `h-11` (44px) 缩减为 `h-8` (32px)，因为内容更少。

## 4. ⌘K 命令面板重设计（Raycast 风格）

### 4.1 设计原则

参考 Raycast 的核心交互理念：
- **键盘优先**: 所有操作都可以纯键盘完成
- **即时搜索**: 输入即过滤，无需确认
- **分类引导**: 空输入时展示 Suggestions（最近 + 容器）和 Commands，而非空白
- **Fuzzy matching**: 模糊搜索（`fzf` 风格），而非当前的 substring 匹配
- **命令与搜索统一**: 同一个入口既能搜索节点，也能执行命令
- **底部操作栏**: 固定在面板底部，显示当前选中项的可用操作（随选中项动态变化）
- **右侧类型标签**: 每个列表项右侧显示类型（Node / Container / Command），替代严格分组
- **混排搜索结果**: 搜索时节点和命令混排到同一个 "Results" 组，靠类型标签区分

### 4.2 三层结构

面板由三层组成（参考 Raycast 截图）：

```
┌──────────────────────────────────┐
│ Search nodes and commands... Esc │  ← 搜索栏 + Esc 关闭
├──────────────────────────────────┤
│                                  │
│         列表区（可滚动）           │  ← 分组 + 列表项
│                                  │
├──────────────────────────────────┤
│                 Open  [↵]       │  ← 底部操作栏（固定）
└──────────────────────────────────┘
```

### 4.3 交互流程

#### 打开状态（空输入）

```
┌────────────────────────────────────────────┐
│ Search nodes and commands...         [Esc] │
├────────────────────────────────────────────┤
│ Suggestions                                │
│ ┌──────────────────────────────────────┐   │
│ │ [📄] Meeting notes 2/23        Node  │   │  ← 选中态（高亮背景）
│ └──────────────────────────────────────┘   │
│   [📄] Project roadmap            Node     │
│   [📄] Weekly review              Node     │
│   [📚] Library              Container      │
│   [📥] Inbox                Container      │
│   [📅] Journal              Container      │
│   [🗑] Trash                Container      │
│                                            │
│ Commands                                   │
│   [📅] Go to Today    ⌘⇧D    Command      │
├────────────────────────────────────────────┤
│                          Open  [↵]        │
└────────────────────────────────────────────┘
```

**默认分组**:
- **Suggestions** — 最近访问节点（从 `panelHistory` 去重，最多 5 个）+ 容器导航（Library / Inbox / Journal / Trash）混排，最近项在前
- **Commands** — 系统命令

**为什么混排 Suggestions 而非分开 Recent / Navigate**:
- Raycast 的 Suggestions 组把常用应用和最近使用混在一起，强调"你最可能想去的地方"
- 容器（Library 等）本质上也是"导航目标"，和最近节点是同一类操作
- 减少视觉分组噪音，让面板更紧凑

#### 输入搜索时

```
┌────────────────────────────────────────────┐
│ meeting                              [Esc] │
├────────────────────────────────────────────┤
│ Results                                    │
│ ┌──────────────────────────────────────┐   │
│ │ [📄] Meeting notes 2/23        Node  │   │
│ └──────────────────────────────────────┘   │
│   [📄] Team meeting agenda       Node      │
│   [📄] 1:1 meeting template      Node      │
│   [📅] Go to Today    ⌘⇧D    Command      │
├────────────────────────────────────────────┤
│                          Open  [↵]        │
└────────────────────────────────────────────┘
```

**搜索时单一 "Results" 组**（Raycast 行为）:
- 节点和命令混排在一起，按 fuzzy match 分数排序
- 右侧类型标签（Node / Command）让用户一眼区分
- 不再像之前设计那样分开 Nodes / Commands 两组
- 匹配度高的排前面，无论类型

### 4.4 列表项布局

每个列表项的布局参考 Raycast：

```
┌──────────────────────────────────────────┐
│ [icon]  Label     subtitle    TypeLabel  │
│  24px   flex-1    muted       right      │
└──────────────────────────────────────────┘
```

- **icon**: 24×24px（比当前 14px 大，提高辨识度），节点用 `FileText`，容器用各自图标，命令用对应图标
- **Label**: 主文本，`text-sm font-normal`，截断
- **subtitle**: 可选，灰色辅助文本。命令显示快捷键（如 `⌘⇧D`），节点可显示标签名
- **TypeLabel**: 右对齐，`text-xs text-foreground-tertiary`，显示 "Node" / "Container" / "Command"
- **选中态**: `bg-accent` 整行高亮（Raycast 用浅灰色背景）

### 4.5 底部操作栏

Raycast 的底部栏是关键 UX 差异点。固定在面板底部，不随列表滚动。

```
┌────────────────────────────────────────────┐
│ (预留)               [action label]  [↵]   │
│                                            │
│  左侧留空              动态操作    Enter 键  │
└────────────────────────────────────────────┘
```

**布局**: `flex items-center h-8 px-3 border-t`
- 左侧: 留空（后续迭代可放二级操作入口等）
- 右侧: 主操作标签 + `↵` 键图标

**操作栏内容随选中项类型变化**:

| 选中项类型 | 主操作标签 | 说明 |
|-----------|-----------|------|
| Node | Open | 导航到该节点 |
| Container | Navigate | 导航到容器 |
| Command | Run | 执行命令 |

**后续迭代**:
- 左侧可放 "Actions" 入口，展开选中项的二级操作菜单（rename、delete、copy link 等）
- 当前只做 Enter 主操作，保持简洁

### 4.6 搜索栏设计

参考 Raycast 的搜索栏（干净、无前缀图标），Esc badge 放在搜索栏右侧（而非底部栏）：

```
┌────────────────────────────────────────────┐
│ Search nodes and commands...         [Esc] │
│                                            │
│ ↑ 纯文本输入，无搜索图标        关闭面板 ↗    │
└────────────────────────────────────────────┘
```

- 无左侧搜索图标（Raycast 也没有）
- 右侧: `Esc` 键 badge（点击或按 Esc 关闭面板）
- Placeholder: `"Search nodes and commands..."`
- 字号: `text-base` (16px)，比当前 `text-sm` 大
- 高度: `h-12` (48px)，给输入足够呼吸感
- 下方有 `border-b` 分割线

### 4.7 搜索算法

**从 substring → fuzzy matching**:
- 使用轻量 fuzzy 库（如 `fuse.js` ~6KB 或自写简单 fuzzy scorer）
- 评分因子: 连续匹配 > 分散匹配、前缀匹配加分、大小写完全匹配加分
- 节点和命令混排，按 fuzzy score 统一排序
- 最大结果数: 20 个节点 + 全部匹配命令
- 空输入时不搜索，展示默认 Suggestions + Commands

### 4.8 命令注册表

```typescript
interface PaletteCommand {
  id: string;
  label: string;                    // 显示名
  icon: AppIcon;                    // lucide 图标
  keywords?: string[];              // 辅助搜索关键词
  shortcut?: string;                // 显示的快捷键（如 "⌘⇧D"）
  category?: string;                // 命令分类（预留）
  action: () => void;               // 执行函数
  when?: () => boolean;             // 条件可见性
}

type PaletteItemType = 'node' | 'container' | 'command';

interface PaletteItem {
  id: string;
  label: string;
  icon: AppIcon;
  type: PaletteItemType;            // 用于右侧类型标签 + 底部操作栏
  subtitle?: string;                // 辅助文本（快捷键、标签名等）
  score?: number;                   // fuzzy match 分数
  action: () => void;
}
```

**初始命令列表**:

| 命令 | 图标 | 快捷键 | 类型标签 | 说明 |
|------|------|--------|---------|------|
| Go to Library | Library | | Container | 导航到 Library |
| Go to Inbox | Inbox | | Container | 导航到 Inbox |
| Go to Journal | CalendarDays | | Container | 导航到 Journal |
| Go to Trash | Trash2 | | Container | 导航到 Trash |
| Go to Today | CalendarCheck | ⌘⇧D | Command | 导航到今日日记 |
| Toggle Dark Mode | Moon/Sun | | Command | 切换深色模式（预留） |
| Sign In with Google | — | | Command | 未登录时显示 |
| Sign Out | LogOut | | Command | 已登录时显示 |

> 注: 容器导航虽然是"命令"实现，但 type 设为 `container`，因为用户心理模型中它们是导航目标而非操作。

### 4.9 键盘导航

| 按键 | 行为 |
|------|------|
| `⌘K` | 打开/关闭面板 |
| `↑` / `↓` | 选择上/下一项 |
| `↵` Enter | 执行选中项主操作（底部栏显示的操作） |
| `Esc` | 关闭面板（搜索栏右侧也有 Esc badge 提示） |

### 4.10 视觉规格

```
面板整体:
  位置: 居中偏上 pt-[12%]
  宽度: max-w-md (448px)
  圆角: rounded-xl (12px)
  背景: bg-popover
  阴影: shadow-2xl
  边框: border border-border

搜索栏:
  高度: h-12 (48px)
  字号: text-base (16px)
  内边距: px-4
  右侧: Esc 键 badge
  分割: border-b border-border

列表区:
  最大高度: max-h-80 (320px)，超出滚动
  内边距: py-2

列表项:
  高度: h-10 (40px)
  内边距: px-3
  图标: 24×24px (h-6 w-6)
  选中态: bg-accent rounded-lg mx-1
  间距: gap-3 (icon ↔ label)

分组标题:
  字号: text-[11px]
  样式: font-medium text-foreground-tertiary
  内边距: px-4 py-2
  大写: 否（Raycast 用正常大小写: "Suggestions", "Commands"）

底部操作栏:
  高度: h-9 (36px)
  背景: 与面板一致
  边框: border-t border-border
  内边距: px-3
  字号: text-xs text-foreground-secondary
  左侧: 留空（预留后续扩展）
  右侧: 操作标签 + ↵ 键图标
  键图标样式: inline-flex h-5 px-1.5 rounded border text-[10px] font-medium
```

## 5. 文件修改清单

### 新建文件

| 文件 | 说明 |
|------|------|
| `src/components/toolbar/TopToolbar.tsx` | 顶栏组件 |
| `src/components/toolbar/UndoRedoButtons.tsx` | Undo/Redo 按钮 |
| `src/components/toolbar/SearchTrigger.tsx` | 搜索触发器（假输入框） |
| `src/components/toolbar/SyncDot.tsx` | 同步状态圆点 |
| `src/components/toolbar/ToolbarUserMenu.tsx` | 顶栏版用户菜单 |
| `src/components/search/ActionBar.tsx` | 命令面板底部操作栏 |
| `src/lib/palette-commands.ts` | 命令注册表 + PaletteItem 类型 |
| `src/lib/fuzzy-search.ts` | 轻量 fuzzy 搜索实现 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `src/entrypoints/sidepanel/App.tsx` | 移除 Sidebar 引用，添加 TopToolbar |
| `src/components/search/CommandPalette.tsx` | 重写：fuzzy 搜索 + 命令系统 + Recent + 分组 |
| `src/components/panel/Breadcrumb.tsx` | 移除 Sidebar toggle + 搜索按钮，缩减高度 |
| `src/stores/ui-store.ts` | 移除 `sidebarOpen` / `toggleSidebar`，可能新增 Recent 节点追踪 |
| `src/hooks/use-nav-undo-keyboard.ts` | Phase 3 重构为全操作 Undo/Redo（留给 #44 详细设计） |

### 可删除文件

| 文件 | 说明 |
|------|------|
| `src/components/sidebar/Sidebar.tsx` | 完全移除 |
| `src/components/sidebar/SidebarNav.tsx` | 功能移入命令面板 |
| `src/components/sync/SyncStatusIndicator.tsx` | 被 SyncDot 替代 |
| `src/components/auth/UserMenu.tsx` | 被 ToolbarUserMenu 替代（或重构复用） |

## 6. 实施分步

### Phase 1: 顶栏 + 移除 Sidebar（骨架）
1. 创建 `TopToolbar` 组件（Undo/Redo 占位 + SearchTrigger + UserMenu + SyncDot）
2. 修改 `App.tsx`：移除 Sidebar，插入 TopToolbar
3. 精简 `Breadcrumb.tsx`：移除 sidebar toggle 和搜索按钮
4. 验证：布局正确，无白屏

### Phase 2: ⌘K 命令面板重写
1. 实现 `fuzzy-search.ts`（或引入 fuse.js）
2. 创建 `palette-commands.ts` 命令注册表 + `PaletteItem` 统一类型
3. 重写 `CommandPalette.tsx`：三层结构（搜索栏 + 列表区 + 底部操作栏）
4. 实现 `ActionBar.tsx`：底部操作栏，根据选中项类型动态显示操作提示
5. 空输入: Suggestions（最近节点 + 容器混排）+ Commands
6. 搜索时: 单一 Results 组，节点和命令混排 + 右侧类型标签
7. 验证：搜索、导航、命令执行、操作栏动态变化正常

### Phase 3: Undo/Redo 集成
1. 依赖 Loro UndoManager API（需要先完成 #44 Undo/Redo 任务）
2. 连接 `UndoRedoButtons` 到 UndoManager
3. 验证：创建/删除/移动节点后可以 undo/redo

### Phase 4: 清理
1. 删除 Sidebar 相关文件和导入
2. 移除 `ui-store.ts` 中 sidebar 相关状态
3. 更新测试和文档

## 7. 依赖与风险

| 项目 | 风险 | 缓解 |
|------|------|------|
| Undo/Redo (#44) | 全操作 Undo 尚未设计 | Phase 3 可独立于 Phase 1/2，按钮先置灰，详细设计留给 #44 |
| 容器导航 | 用户习惯从 Sidebar 直接点击 | ⌘K 空输入时展示 Suggestions 分组，学习成本低 |
| Fuzzy 搜索性能 | 节点数量大时可能卡顿 | 延迟搜索 (debounce 150ms) + 结果数上限 |
| 搜索入口可见性 | 新用户不知道 ⌘K | 顶栏保留可见的搜索触发器 |

## 8. 参考资料

- [Raycast](https://www.raycast.com/) — 键盘优先的统一命令入口
- [Designing a Command Palette](https://destiner.io/blog/post/designing-a-command-palette/) — 命令面板设计模式综述
- [Command Palette Interfaces](https://philipcdavis.com/writing/command-palette-interfaces) — 多产品命令面板分析
- [Raycast List API](https://developers.raycast.com/api-reference/user-interface/list) — Raycast 分组、过滤、action 机制
- [cmdk](https://cmdk.paco.me/) — 当前使用的命令面板基础库
