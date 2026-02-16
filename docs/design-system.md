# Nodex Design System

> v1.0 | 长期视觉标准，覆盖所有 UI 场景。
> 设计哲学融合 Apple Liquid Glass 的层级/协调/同心原则，色彩取自暗色赛博美学。

---

## 设计哲学

### 三大支柱（源自 Liquid Glass）

| 支柱 | 原则 | Nodex 应用 |
|------|------|------------|
| **Hierarchy（层级）** | 控件浮于内容之上，内容永远是主角 | 弹出层/面板用玻璃材质，正文区域保持纯净 |
| **Harmony（协调）** | 硬件与软件、元素与元素之间的视觉节奏统一 | 间距、圆角、色彩遵循统一的数学比例 |
| **Concentricity（同心）** | 嵌套元素的圆角、间距围绕共享中心对齐 | 容器圆角 = 子元素圆角 + 内边距 |

### 设计态度

- **亮色优先**：Light mode 为默认体验，Dark mode 作为完整支持的备选
- **克制用色**：仅 2 个强调色（主色 + 辅助色），大面积留给灰阶
- **荧光感**：主色高饱和高亮度，在任何底色上都有"发光"质感；正文用黑/白保证可读
- **功能导向**：每一个视觉元素都服务于信息层级或交互反馈，拒绝装饰

---

## 色彩系统

### 设计理念

从参考图提取的色彩策略：深沉底色 + 高饱和强调色的极简对比。

主色选择 **荧光紫（Electric Violet `#8B5CF6`）** —— 高饱和、高亮度，视觉上有"发光"质感。
正文始终使用黑/白前景色，primary 仅用于按钮填充、ring、badge、链接等强调场景。
辅助色选择 **青绿（Teal）** —— 与主色形成冷暖互补，用于成功/确认/次要强调。

### 语义色板

#### Light Mode（默认）

| Token | 值 | 用途 |
|-------|------|------|
| `--background` | `#FAFAFA` | 最底层背景 |
| `--surface` | `#FFFFFF` | 卡片/面板 |
| `--surface-raised` | `#FFFFFF` | 浮层 |
| `--surface-overlay` | `#FFFFFF` | 下拉菜单 |
| `--border` | `rgba(0,0,0,0.08)` | 默认边框 |
| `--border-subtle` | `rgba(0,0,0,0.04)` | 弱分隔线 |
| `--border-emphasis` | `rgba(0,0,0,0.15)` | 强调边框 |
| `--foreground` | `#0F0F12` | 主要文本 |
| `--foreground-secondary` | `#6B6B80` | 次要文本 |
| `--foreground-tertiary` | `#A0A0B0` | 占位符 |
| `--primary` | `#8B5CF6` | 主色（荧光紫，HSL 258°/90%/66%） |
| `--primary-hover` | `#7C3AED` | 主色 hover（加深） |
| `--primary-muted` | `rgba(139,92,246,0.08)` | 主色背景（选中行、badge） |
| `--primary-foreground` | `#FFFFFF` | 主色上的文本 |
| `--accent` | `#0D9488` | 辅助色（深青，白底对比度 ≥ 4.5:1）† |
| `--accent-hover` | `#0F766E` | 辅助色 hover |
| `--accent-muted` | `rgba(13,148,136,0.08)` | 辅助色背景 |
| `--destructive` | `#E11D48` | 危险 |
| `--destructive-muted` | `rgba(225,29,72,0.06)` | 危险背景 |
| `--warning` | `#D97706` | 警告 |
| `--success` | `#0D9488` | 成功（复用 accent） |

> **† accent Token 实现说明**：`--accent` 在设计规格中为 teal `#0D9488`，但 shadcn/ui 组件（CommandPalette、ContextMenu、Dropdown）使用 `bg-accent` 作为**中性 hover 背景**。CSS 中 `--color-accent` 保持 `#f1f5f9`（shadcn 默认），teal 通过 `--color-success` (`#0D9488`) 使用。

#### Dark Mode

| Token | 值 | 用途 |
|-------|------|------|
| `--background` | `#0C0D11` | 最底层背景（近黑，微蓝） |
| `--surface` | `#13141A` | 卡片/面板背景 |
| `--surface-raised` | `#1A1B24` | 浮层/弹出层背景 |
| `--surface-overlay` | `#22232E` | 下拉菜单/tooltip 背景 |
| `--border` | `rgba(255,255,255,0.08)` | 默认边框 |
| `--border-subtle` | `rgba(255,255,255,0.05)` | 弱分隔线 |
| `--border-emphasis` | `rgba(255,255,255,0.15)` | 强调边框（输入框 focus 等） |
| `--foreground` | `#E8E8ED` | 主要文本 |
| `--foreground-secondary` | `#9394A1` | 次要文本（描述、标注） |
| `--foreground-tertiary` | `#5C5D6E` | 占位符、禁用文本 |
| `--primary` | `#8B5CF6` | 主色（同 Light mode，暗底上自带荧光感） |
| `--primary-hover` | `#A78BFA` | 主色 hover（提亮） |
| `--primary-muted` | `rgba(139,92,246,0.15)` | 主色背景（选中行、badge） |
| `--primary-foreground` | `#FFFFFF` | 主色上的文本 |
| `--accent` | `#2DD4A8` | 辅助色（青绿，暗底提亮） |
| `--accent-hover` | `#45DEAD` | 辅助色 hover |
| `--accent-muted` | `rgba(45,212,168,0.12)` | 辅助色背景 |
| `--destructive` | `#F43F5E` | 危险操作（玫红，非纯红） |
| `--destructive-muted` | `rgba(244,63,94,0.12)` | 危险色背景 |
| `--warning` | `#F59E0B` | 警告 |
| `--success` | `#2DD4A8` | 成功（复用 accent） |

### Tag 色板（10 色）

Tag badge 使用固定 10 色调色板，通过 hash 分配。每色提供 `bg`（Light 8% / Dark 15% 不透明度）+ `text` 两个值：

| 序号 | 名称 | Dark text | Dark bg | Light text | Light bg |
|------|------|-----------|---------|------------|----------|
| 0 | Violet | `#A78BFA` | `rgba(139,92,246,0.15)` | `#8B5CF6` | `rgba(139,92,246,0.08)` |
| 1 | Pink | `#F472B6` | `rgba(236,72,153,0.15)` | `#DB2777` | `rgba(219,39,119,0.08)` |
| 2 | Purple | `#C084FC` | `rgba(192,132,252,0.15)` | `#9333EA` | `rgba(147,51,234,0.08)` |
| 3 | Cyan | `#22D3EE` | `rgba(6,182,212,0.15)` | `#0891B2` | `rgba(8,145,178,0.08)` |
| 4 | Emerald | `#34D399` | `rgba(16,185,129,0.15)` | `#059669` | `rgba(5,150,105,0.08)` |
| 5 | Amber | `#FBBF24` | `rgba(245,158,11,0.15)` | `#D97706` | `rgba(217,119,6,0.08)` |
| 6 | Rose | `#FB7185` | `rgba(244,63,94,0.15)` | `#E11D48` | `rgba(225,29,72,0.08)` |
| 7 | Blue | `#60A5FA` | `rgba(59,130,246,0.15)` | `#2563EB` | `rgba(37,99,235,0.08)` |
| 8 | Teal | `#2DD4BF` | `rgba(20,184,166,0.15)` | `#0D9488` | `rgba(13,148,136,0.08)` |
| 9 | Orange | `#FB923C` | `rgba(249,115,22,0.15)` | `#EA580C` | `rgba(234,88,12,0.08)` |

### 不透明度系统

用于前景色叠加（`foreground/XX`）：

| 不透明度 | 用途 |
|----------|------|
| `/5` (0.05) | 微弱分隔线、展开箭头背景 |
| `/8` (0.08) | 默认边框、hover 背景 |
| `/12` (0.12) | Tag badge 背景、选中行底色 |
| `/15` (0.15) | 强调边框、collapsed bullet 外环 |
| `/25` (0.25) | 禁用元素 |
| `/40` (0.40) | 次要图标、reference bullet 虚线 |
| `/50` (0.50) | 普通 bullet 实心点 |
| `/70` (0.70) | 次要文本 |

---

## 排版系统

### 字体栈

| 用途 | 字体 | 备注 |
|------|------|------|
| **正文** | `Inter, system-ui, -apple-system, sans-serif` | Inter 的 x-height 高，小字号可读性好 |
| **等宽** | `JetBrains Mono, Fira Code, monospace` | 代码块、行内代码 |

### 字号阶梯（基于 4px 倍数）

| Token | 大小 | 行高 | 字重 | 用途 |
|-------|------|------|------|------|
| `text-xs` | 11px | 16px | 400 | 面包屑、徽章计数 |
| `text-sm` | 13px | 20px | 400 | 大纲节点正文、字段标签 |
| `text-base` | 14px | 21px | 400 | 编辑器正文（TipTap 默认） |
| `text-lg` | 16px | 24px | 600 | 面板标题 |
| `text-xl` | 20px | 28px | 700 | 页面标题（Library/Inbox 等） |
| `text-2xl` | 24px | 32px | 700 | 工作区名称 |

> **注意**: 大纲节点使用 `text-sm` (13px)，与 Tana 一致。编辑器使用 `text-base` (14px)。

### 字重

| 值 | 用途 |
|----|------|
| 400 (Regular) | 正文、描述 |
| 500 (Medium) | 侧栏导航项、字段名 |
| 600 (Semibold) | 面板标题、加粗文本、配置项名称 |
| 700 (Bold) | 页面标题 |

### 行内样式

| 元素 | 样式 |
|------|------|
| **加粗** | `font-weight: 600` |
| *斜体* | `font-style: italic` |
| ~~删除线~~ | `text-decoration: line-through; opacity: 0.5` |
| `代码` | 等宽字体、0.85em、muted 背景、`rounded-sm` |
| ==高亮== | `#FBBF24/20`（暗模式）/ `#FEF08A`（亮模式） |
| [链接]() | `color: primary; text-decoration: underline` |
| @引用 | `color: primary; cursor: pointer; hover: underline` |

---

## 间距系统

### 基准网格：4px

所有间距必须是 4px 的整数倍。

| Token | 值 | 用途 |
|-------|------|------|
| `space-0.5` | 2px | 图标与文本微间距（例外：仅此值非 4px 倍） |
| `space-1` | 4px | 最小间距：列表项内边距、元素间微间隙 |
| `space-1.5` | 6px | Outliner 缩进基准（depth × 28 + 6） |
| `space-2` | 8px | 标准内边距：按钮内、输入框内、dropdown 项间 |
| `space-3` | 12px | 卡片内边距、分组间距 |
| `space-4` | 16px | 区域间距：侧栏内边距、面板头与内容间 |
| `space-5` | 20px | 大区域间距 |
| `space-7` | 28px | Outliner 层级缩进步长（depth × 28） |
| `space-8` | 32px | 页面边距 |

### 大纲专用间距

| 度量 | 值 | 说明 |
|------|------|------|
| 行高 | 21px | 节点单行高度（text-sm 行高 = 20px + 1px 呼吸） |
| 缩进步长 | 28px | 每层缩进距离 |
| 缩进基准 | 6px | 第 0 层左偏移（对齐 Tana） |
| Chevron 宽度 | 15px | 展开/折叠按钮区域 |
| Chevron–Bullet 间隙 | 4px | gap-1，防止误触 |
| Bullet 宽度 | 15px | 圆点按钮区域 |
| Bullet 直径 | 5px | 实心圆点视觉尺寸 |
| Bullet 外环 | 15px | collapsed-with-children 外环 |
| Bullet–文本间距 | 8px | gap-2，4px 网格对齐 |
| Indent line 宽度 | 16px | 点击区域，偏左于 bullet 中心（justify-end） |
| FieldRow 左偏移 | 25px | 6 (基准) + 15 (chevron) + 4 (间隙) |

### 点击区域标准

| 元素 | 最小点击区域 | 说明 |
|------|------------|------|
| 图标按钮 | 28 × 28px | 外层透明容器撑大，内层保持视觉尺寸 |
| Bullet | 28 × 15px | 与行高对齐（h-7） |
| Chevron | 28 × 15px | 与行高对齐（h-7） |
| 线性元素 | 宽度 ≥ 16px | 缩进线、分隔线等 |
| 文本行 | flex-1 容器 | click handler 绑定在 flex-1 容器上，右侧空白也可点击 |

---

## 圆角系统（同心原则）

### 基准值

| Token | 值 | 用途 |
|-------|------|------|
| `radius-xs` | 2px | 内联代码、高亮 mark |
| `radius-sm` | 4px | 小元素：tag badge、inline chip、选中节点 ring |
| `radius-md` | 6px | 中等元素：dropdown 内项、按钮、输入框 |
| `radius-lg` | 8px | 容器：dropdown、popover、卡片 |
| `radius-xl` | 12px | 大容器：对话框、模态窗 |
| `radius-2xl` | 16px | 面板、侧栏 |
| `radius-full` | 9999px | 胶囊形：toggle、圆形按钮 |

### 同心规则（Concentricity）

嵌套容器的圆角必须满足：

```
外层圆角 = 内层圆角 + 间距（padding）
```

| 场景 | 外层 | 内边距 | 内层 | 满足同心 |
|------|------|--------|------|----------|
| Dropdown → 项 | 8px (lg) | 4px (p-1) | 6px (md) | 8 ≈ 6+4 ✓ 近似 |
| Dialog → 内容区 | 12px (xl) | 16px (p-4) | 8px (lg) | 12 < 8+16 ✓ 视觉嵌套 |
| Card → 按钮 | 8px (lg) | 12px (p-3) | 6px (md) | 8 < 6+12 ✓ |

> 当间距远大于圆角差时，同心约束自动满足。紧凑布局（p-1, p-2）需要严格遵守。

---

## 阴影与深度

### 深度层级

| 层级 | 场景 | 阴影 | 背景 |
|------|------|------|------|
| **Layer 0** | 页面底层 | 无 | `--background` |
| **Layer 1** | 卡片、面板 | `shadow-sm` | `--surface` |
| **Layer 2** | 侧栏、固定工具栏 | `shadow-md` | `--surface-raised` |
| **Layer 3** | Dropdown、Popover | `shadow-lg` | `--surface-overlay` |
| **Layer 4** | Modal、Dialog | `shadow-xl` + backdrop | `--surface-overlay` |

### 阴影值（Dark Mode 优化）

```css
--shadow-sm:  0 1px 2px rgba(0,0,0,0.3);
--shadow-md:  0 2px 8px rgba(0,0,0,0.35);
--shadow-lg:  0 4px 16px rgba(0,0,0,0.4);
--shadow-xl:  0 8px 32px rgba(0,0,0,0.5);
```

> Dark mode 阴影需要更高不透明度才能在深色背景上可见。

### 玻璃材质（Glass Material）

用于 Layer 3+ 的浮层，借鉴 Liquid Glass 的毛玻璃效果：

```css
.glass {
  background: rgba(19, 20, 26, 0.85);  /* surface + 85% 不透明度 */
  backdrop-filter: blur(12px) saturate(1.2);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.glass-light {
  background: rgba(255, 255, 255, 0.75);
  backdrop-filter: blur(12px) saturate(1.2);
  border: 1px solid rgba(0, 0, 0, 0.06);
}
```

> 注意：Chrome Side Panel 内 backdrop-filter 性能良好，但不要滥用——仅 popover/tooltip/command-palette 使用。

---

## 交互状态

### 通用状态映射

| 状态 | 背景变化 | 边框变化 | 文本变化 | 其他 |
|------|----------|----------|----------|------|
| **Default** | 无 | `--border` | `--foreground` | — |
| **Hover** | `foreground/5` | — | — | cursor: pointer |
| **Focus** | — | `--primary` (ring) | — | `ring-2 ring-primary/40` |
| **Active/Pressed** | `foreground/8` | — | — | `scale-[0.98]` 微缩（可选） |
| **Selected** | `primary-muted` | `--primary/40` (ring) | — | `ring-1` |
| **Disabled** | `foreground/3` | `foreground/5` | `foreground-tertiary` | cursor: not-allowed, opacity: 0.5 |
| **Destructive hover** | `destructive-muted` | — | `--destructive` | — |

### 大纲节点状态

| 状态 | 表现 |
|------|------|
| 默认 | 无背景，文本 `--foreground` |
| Hover 行 | `group-hover` 显示 chevron + drag handle |
| 编辑中 (focused) | TipTap 编辑器激活，无特殊视觉 ring |
| 选中 (selected) | 独立行高亮（见下方） |
| 拖拽中 | `opacity-40`，目标行显示 primary 色插入线 |
| Done (完成) | `text-foreground/50`（50% 不透明度前景色） |

### 节点选中 — 子树边框 + 独立行高亮（Tana-style）

选中节点使用三层半透明叠加，均基于 primary 色：

| 层 | Token | 值 | 覆盖范围 | 圆角 |
|----|-------|----|---------|------|
| **子树边框** | `--selection` | `rgba(139,92,246,0.06)` | 选中节点 + 所有展开子节点（含边框 `primary/12%`） | `rounded-sm` (4px) |
| **直接行高亮** | `--selection-row` | `rgba(139,92,246,0.18)` | 直接选中的根节点行 | `rounded-sm` (4px) |
| **子节点行高亮** | `--selection-child` | `rgba(139,92,246,0.10)` | 被祖先隐式选中的子节点行 | `rounded-sm` (4px) |

- 行高亮有 1px 垂直内缩（`top: 1; bottom: 1`），相邻行产生 2px 可见间隙
- 子节点行高亮**左对齐到选中祖先**（`ancestorSelectedDepth * 28 + 25`），不随自身缩进
- 子树边框仅在节点展开时显示（`isExpanded`）
- 通过 `ancestorSelectedDepth` prop 向下传递选中祖先的深度
- 引用节点（reference）使用相同方案

### 过渡动画

| 属性 | 时长 | 缓动 |
|------|------|------|
| 背景色 | 150ms | ease-out |
| 边框色 | 150ms | ease-out |
| 不透明度 | 150ms | ease-out |
| transform (scale) | 100ms | ease-out |
| Chevron 旋转 | 200ms | ease-in-out |
| Popover 出现 | 150ms | ease-out (scale 0.95→1 + opacity 0→1) |

---

## 图标系统

### 规格

| 属性 | 值 |
|------|------|
| 图标库 | lucide-react |
| 默认尺寸 | 16 × 16px |
| 小尺寸 | 14 × 14px（侧栏导航） |
| 大尺寸 | 20 × 20px（面板头按钮） |
| 线条宽度 | 1.5px（lucide 默认，不要改为 2） |
| 默认颜色 | `text-foreground-secondary` |
| 交互态颜色 | hover → `text-foreground` |

### 图标对齐

- 图标 + 单行文本：`items-center`
- 图标 + 多行文本（name + description）：`items-start`（对齐首行）
- 图标容器固定宽度（16px/20px），防止文本变化导致偏移

---

## 组件模式

### Dropdown / Popover

```
┌─────────────────────────────┐  ← rounded-lg (8px), p-1 (4px), shadow-lg
│ ┌─────────────────────────┐ │
│ │  Item text              │ │  ← rounded-md (6px), px-2, py-1
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │  Item text              │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │  Selected item ████████ │ │  ← bg: primary, text: primary-foreground
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

- 容器：`rounded-lg border border-border bg-popover p-1 shadow-lg`
- 项：`rounded-md px-2 py-1 text-sm`
- 选中项：`bg-primary text-primary-foreground`
- 高亮项（键盘导航）：`bg-accent text-accent-foreground`
- 分隔线：`h-px bg-border mx-1 my-1`

### 按钮

| 变体 | 背景 | 边框 | 文本 | 圆角 |
|------|------|------|------|------|
| Primary | `--primary` | 无 | `--primary-foreground` | `radius-md` |
| Secondary | `--surface-raised` | `--border` | `--foreground` | `radius-md` |
| Ghost | 透明 | 无 | `--foreground-secondary` | `radius-md` |
| Destructive | `--destructive` | 无 | `#fff` | `radius-md` |
| Icon | 透明 | 无 | `--foreground-secondary` | `radius-md` |

- Hover: 每个变体都有 hover 色变化（见交互状态）
- 尺寸：高度 28px（sm）/ 32px（default）/ 36px（lg）

### 输入框

- 高度：32px（default）、28px（compact, 用于大纲内）
- 边框：`border-border`，focus 时 `ring-2 ring-primary/40`
- 圆角：`radius-md` (6px)
- 内边距：`px-2 py-1`
- placeholder 色：`--foreground-tertiary`

### Tag Badge

- 圆角：`radius-sm` (4px)
- 内边距：`px-1.5 py-0`
- 字号：`text-xs` (11px)
- 字重：500
- 行高：20px
- 背景 + 文本色：从 Tag 色板 hash 分配

### 侧栏导航项

- 高度：32px
- 圆角：`radius-md` (6px)
- 内边距：`px-2`
- 图标：14px，`text-foreground-secondary`
- 文本：`text-sm`，`font-weight: 500`
- 激活态：`bg-primary-muted text-primary`
- Hover：`bg-foreground/5`

### 面板头

- 高度：44px
- 下边框：`border-border-subtle`
- 内边距：`px-3`
- 标题：`text-lg font-semibold`
- 按钮间距：`gap-1`

---

## 主题切换实现

### CSS 变量策略

在 `main.css` 的 `@theme` 块中定义 Light mode 为默认值，Dark mode 通过 `[data-theme="dark"]` 覆盖。用户可选择跟随系统（`prefers-color-scheme`）或手动切换：

```css
@theme {
  /* Light mode — 默认 */
  --color-background: #FAFAFA;
  --color-surface: #FFFFFF;
  /* ... */
}

[data-theme="dark"] {
  /* Dark mode — 覆盖 */
  --color-background: #0C0D11;
  --color-surface: #13141A;
  /* ... */
}
```

### 颜色命名规范

| 层级 | Token 命名 | 说明 |
|------|-----------|------|
| 基础层 | `background`, `surface`, `surface-raised`, `surface-overlay` | 从深到浅的背景层级 |
| 语义前景 | `foreground`, `foreground-secondary`, `foreground-tertiary` | 文本重要性递减 |
| 边框 | `border`, `border-subtle`, `border-emphasis` | 分隔强度递增 |
| 功能色 | `primary`, `accent`, `destructive`, `warning`, `success` | 交互与状态 |
| 衍生色 | `{color}-hover`, `{color}-muted`, `{color}-foreground` | hover/低透明度背景/上层文本 |

---

## 响应式策略

Chrome Side Panel 宽度范围：300px ~ 700px+。

| 断点 | 宽度 | 布局调整 |
|------|------|---------|
| 紧凑 | < 380px | 侧栏收起，FieldRow name/value 垂直堆叠 |
| 标准 | 380px ~ 500px | 侧栏可切换，FieldRow 水平布局 |
| 宽松 | > 500px | 侧栏常驻，更多横向空间 |

使用 `@container` 查询实现组件级响应式（非 viewport 断点），因为 Side Panel 宽度与 viewport 无关。

---

## 命名约定

### CSS 变量

```
--color-{category}[-{variant}]

例：
--color-primary
--color-primary-hover
--color-primary-muted
--color-foreground-secondary
--color-surface-raised
```

### Tailwind 工具类使用

| 推荐 | 避免 |
|------|------|
| `bg-primary` | `bg-[#7C6BF4]` (硬编码) |
| `text-foreground-secondary` | `text-gray-500` (语义不明) |
| `rounded-lg` | `rounded-[8px]` (除非特殊需要) |
| `border-border` | `border-gray-200` |
| `shadow-lg` | 自定义 box-shadow 内联 |

---

## 迁移路径

迁移分阶段进行：

### Phase 1: Token 体系升级 ✅
- 主色迁移至荧光紫 `#8B5CF6`
- 新增 `surface`/`surface-raised`/`surface-overlay` 背景层级
- 新增 `foreground-secondary`/`foreground-tertiary` 语义前景 token
- 新增 `border-subtle`/`border-emphasis` 边框层级

### Phase 2: Light Mode 对齐 + 语义 Token 迁移 ✅
- 基础 token 值对齐 Light Mode 规格（background `#FAFAFA`、foreground `#0F0F12`、border `rgba(0,0,0,0.08)` 等）
- `muted-foreground` 对齐 `foreground-secondary`（`#6B6B80`）
- Tag 色板 bg opacity `0.12` → `0.08`，slot 6 从 red → rose
- 组件内 `text-muted-foreground/40`/`/50`/`/60` 不透明度 hack 迁移至 `text-foreground-tertiary`/`text-foreground-secondary`
- 新增 `--color-primary-muted: rgba(139,92,246,0.08)`

### Phase 3: 剩余组件迁移 ✅
- `border-border/40`/`/50`/`/60`/`/80` → `border-border-subtle`/`border-border`/`border-border-emphasis`
- `bg-muted-foreground/25`（ConfigToggle off 态）→ `bg-foreground/[0.15]`
- `bg-green-500`（ConfigToggle on 态）→ `bg-success`
- `text-amber-500` → `text-warning`
- `outline-border/60` → `outline-border-emphasis`
- `text-destructive/50`/`/70`/`/80` → 语义 token
- `bg-primary/10`（SidebarNav）→ `bg-primary-muted`

### Phase 4: Dark Mode
- 实现 `[data-theme="dark"]` 覆盖
- 新增主题切换 UI（设置 → 外观）
- Tag 色板切换为 Dark 列值

### Phase 5: 玻璃材质
- Popover/Dropdown 添加 `backdrop-filter`
- Command Palette 添加玻璃效果
- 性能测试确认 Side Panel 内无卡顿

---

## 设计原则速查

| # | 原则 | 检查问题 |
|---|------|---------|
| 1 | **内容优先** | 这个 UI 元素是在帮助用户看到内容，还是在分散注意力？ |
| 2 | **克制用色** | 是否只用了 primary/accent/destructive 之一？有没有多余的颜色？ |
| 3 | **同心圆角** | 嵌套容器的圆角 + 内边距关系是否协调？ |
| 4 | **4px 网格** | 所有间距是否是 4px 的整数倍？ |
| 5 | **层级分明** | 浮层是否通过阴影/背景色与下层明确区分？ |
| 6 | **状态可见** | hover/focus/selected/disabled 状态是否都有视觉反馈？ |
| 7 | **最小点击** | 所有可交互元素是否满足 28px 最小点击区域？ |
| 8 | **一致性** | 同类元素（所有 dropdown、所有按钮）是否使用相同的 token？ |
