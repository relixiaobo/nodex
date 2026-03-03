# soma Design System

> v5.0 | Clean Paper & Invisible Outline

---

## §1 设计哲学

### Clean Paper & Invisible Outline

soma 追求的视觉体验是：打开工具如同展开一张温润的纸——没有边框争夺注意力，没有阴影制造层级焦虑，没有色彩叫嚣存在感。结构隐于内容之下，只在需要时浮现。

| 原则 | 含义 | soma 应用 |
|------|------|------------|
| **纸质底色** | 暖色纸张替代冷白屏幕，减轻长时间阅读的视觉疲劳 | 全局底色 `#F5F4EE`，近似手工纸 |
| **墨色书写** | 三级灰阶模拟不同浓度的墨水，创造自然的信息层级 | `#1A1A1A` / `#666666` / `#999999` |
| **隐形结构** | 大纲线、缩进、层级不靠视觉重量表达，靠空间关系暗示 | 零 Z 深度、极细结构线、呼吸式显隐 |
| **排印即 UI** | 用字号、字重、颜色差异完成所有信息分层，减少装饰性 UI 元素 | 标签 = 彩色文本、标题 = 字号阶梯 |
| **克制用色** | 三功能色源自同一灵感图，共享低饱和暖调，大面积留给墨色与纸色 | Sage Green / Warm Amber / Brick Red |

### 设计态度

- **亮色优先**：Light mode 为默认体验，Dark mode 作为完整支持的备选
- **功能导向**：每一个视觉元素都服务于信息层级或交互反馈，拒绝装饰
- **零 Z 深度**：文档流内不使用阴影，浮层用细边框替代
- **呼吸式显现**：次要控件（chevron、拖拽手柄、操作按钮）仅在 hover/focus 时出现

---

## §2 色彩系统

### 基础面与文字（Paper / Ink）

| 语义名 | CSS 变量 | Light 值 | 用途 |
|--------|---------|----------|------|
| Paper | `--background` | `#F5F4EE` | 全局底色（暖纸色） |
| Surface | `--surface` | `#FFFFFF` | 输入框内、浮层底 |
| Surface-Hover | — | `rgba(26,26,26,0.04)` | 通用 hover 底色 |
| Ink-Primary | `--foreground` | `#1A1A1A` | 主要文本、标题 |
| Ink-Secondary | `--foreground-secondary` | `#666666` | 次要文本、字段标签 |
| Ink-Tertiary | `--foreground-tertiary` | `#999999` | 占位符、禁用文本、时间戳 |

### 结构线与表面

| 语义名 | CSS 变量 | Light 值 | 用途 |
|--------|---------|----------|------|
| Line-Faint | `--border-subtle` | `rgba(0,0,0,0.06)` | 弱分隔线、大纲缩进线 |
| Line-Default | `--border` | `rgba(0,0,0,0.10)` | 默认边框、浮层边框 |
| Line-Prominent | `--border-emphasis` | `rgba(0,0,0,0.18)` | 强调边框、输入框 focus |

### 三功能色

三色均提取自同一灵感图（Cyberpunk Tech 2025 海报），共享低饱和暖调——"同一家旧工厂里不同设备上褪色的油漆"。

#### Accent-Primary — Sage Green（灰橄榄）

| 语义名 | CSS 变量 | Light 值 | 用途 |
|--------|---------|----------|------|
| Accent-Primary | `--primary` | `#5E8E65` | 链接、引用、选中高亮、活跃标签 |
| Accent-Hover | `--primary-hover` | `#4D7A54` | Primary hover 加深 |
| Accent-Muted | `--primary-muted` | `rgba(94,142,101,0.08)` | 选中行背景、badge 背景 |
| Accent-Foreground | `--primary-foreground` | `#FFFFFF` | Primary 色上的文本 |

**限定用途**：链接、引用（@mention）、选中行高亮、活跃/当前项标记、进度指示器。不用于大面积背景填充或正文文本着色。

#### Accent-Secondary — Warm Amber（暖琥珀）

提取自灵感图 `#E1A15E`。因原值在纸底上对比度仅 ~2.0:1，拆分为**填充色**和**文本色**两个用法：

| 语义名 | CSS 变量 | Light 值 | 对比度 | 用途 |
|--------|---------|----------|--------|------|
| Amber-Fill | `--secondary` | `#E1A15E` | — | 日期节点背景、特殊卡片底色、进度条填充 |
| Amber-Hover | `--secondary-hover` | `#CC8D4E` | — | Secondary hover 加深 |
| Amber-Muted | `--secondary-muted` | `rgba(225,161,94,0.12)` | — | 暖强调背景色（浅底色） |
| Amber-Text | `--warning` | `#A07830` | ~3.7:1 | Warning 文本、日期标签、提醒文字 |
| Amber-Foreground | `--secondary-foreground` | `#1A1A1A` | — | Amber 填充色上的文本（深色） |

**限定用途**：日期/时间类信息、提醒、starred/收藏、Warning 状态。Amber-Fill 用于大色块场景（节点背景、进度条），Amber-Text 用于小字场景（标签、警告文本）。

#### Accent-Destructive — Brick Red（砖陶红）

提取自灵感图 `#AA5048`（对比度 ~4.8:1），比纯红更沉稳，带有砖陶/铁锈感。

| 语义名 | CSS 变量 | Light 值 | 用途 |
|--------|---------|----------|------|
| Destructive | `--destructive` | `#AA5048` | 删除、错误、危险操作 |
| Destructive-Hover | `--destructive-hover` | `#8E3F38` | Destructive hover 加深 |
| Destructive-Muted | `--destructive-muted` | `rgba(170,80,72,0.08)` | 危险色背景 |
| Destructive-Foreground | `--destructive-foreground` | `#FFFFFF` | Destructive 色上的文本 |

**限定用途**：删除确认、错误状态、逾期提醒。也可用于"热"强调（如 starred 的替代方案——starred 用 Amber，逾期用 Brick Red）。

### 其他功能色

| 语义名 | CSS 变量 | Light 值 | 用途 |
|--------|---------|----------|------|
| Info | `--info` | `#5A8AB5` | 信息提示 |
| Success | `--success` | `#5E8E65` | 成功确认（复用 Accent-Primary） |

### Tag 10 色色板

v5.0 标签为**排印化**（纯文本着色，无背景）。10 色均为低饱和纸质色调，在 `#F5F4EE` 底色上 ≥ 3:1 对比度。通过 hash 分配。

| 序号 | 色相分类 | 名称 | 色值 | 色相描述 |
|------|----------|------|------|----------|
| 0 | Red | Vintage Red | `#A6535B` | 复古红，经典泛红 |
| 1 | Orange | Terracotta | `#BA6C43` | 陶土橙，明亮温暖 |
| 2 | Yellow | Antique Gold | `#9B7C38` | 古董金，金属质感 |
| 3 | Green | Moss Green | `#608A55` | 苔藓绿，偏冷翠绿 |
| 4 | Teal | Verdigris | `#40857A` | 铜绿/翡翠，蓝绿中间态 |
| 5 | Blue | Denim Blue | `#4B7C9E` | 丹宁蓝，纯正天蓝 |
| 6 | Indigo | Muted Indigo | `#6064A6` | 柔靛蓝，复古蓝紫 |
| 7 | Violet | Dusty Plum | `#8E5B8E` | 灰紫/梅色，紫红色 |
| 8 | Brown | Cocoa Brown | `#8A6754` | 可可棕，土棕色系 |
| 9 | Grey | Soft Slate | `#788691` | 石板灰，带蓝调质感 |

### 不透明度系统

用于前景色叠加（`foreground/XX`）：

| 不透明度 | 用途 |
|----------|------|
| `/4` (0.04) | Surface hover 背景 |
| `/6` (0.06) | 弱分隔线、大纲缩进线 |
| `/7` (0.07) | 选中子树遮罩 |
| `/10` (0.10) | 默认边框、浮层边框 |
| `/15` (0.15) | 选中行高亮、强调边框 |
| `/25` (0.25) | 禁用元素 |
| `/40` (0.40) | 次要图标、reference bullet 虚线 |
| `/50` (0.50) | 普通 bullet 实心点 |
| `/70` (0.70) | 次要文本 |

### Dark Mode（结构预留，色值待适配）

保留 Light Mode token 结构，未来适配时遵循以下方向：

| 原则 | 说明 |
|------|------|
| 暖暗底色 | 使用带暖意的深灰（非纯黑），呼应 Paper 的温度感 |
| Ink 反转 | Ink-Primary 变为浅色，保持三级层级 |
| 三功能色保持 | Sage Green / Warm Amber / Brick Red 在暗底上适当调亮 |
| Tag 提亮 | 10 色在暗底上需要提高明度，保持可读性 |
| 边框加强 | 暗底下边框不透明度适当提高 |

> 具体 Dark Mode 色值将在实施阶段确定，此处仅记录结构约束。

---

## §3 排版系统

### 字体栈

| 用途 | 字体 | 备注 |
|------|------|------|
| **正文** | `Inter, system-ui, -apple-system, sans-serif` | Inter 的 x-height 高，小字号可读性好 |
| **等宽** | `JetBrains Mono, Fira Code, monospace` | 代码块、行内代码 |

### 字号阶梯（~1.17 比率）

| Token | 大小 | 行高 | 字重 | 用途 |
|-------|------|------|------|------|
| `text-xs` | 11px | 16px | 400 | 面包屑、徽章计数、次要元数据 |
| `text-sm` | 13px | 20px | 400 | 字段标签、辅助信息、Tag 文本 |
| `text-base` | 15px | 24px | 400 | **大纲节点正文、编辑器正文** |
| `text-lg` | 17px | 24px | 500 | 面板标题 |
| `text-xl` | 20px | 28px | 500 | 页面标题（Library / Inbox 等） |
| `text-2xl` | 24px | 32px | 500 | 工作区名称 |

> **关键变更**：大纲正文从 13px 升至 15px，line-height 从 21px 升至 24px。所有 `text-base` 场景统一为 15px/24px。

### 字重

| 值 | 用途 |
|----|------|
| 400 (Regular) | 正文、描述、所有日常内容 |
| 500 (Medium) | 面板标题、页面标题、字段名、导航项 |

> v5.0 仅使用两级字重。不使用 600 (Semibold) 和 700 (Bold) 作为排版阶梯——需要强调时通过字号和颜色区分。用户在编辑器内手动加粗仍使用 `font-weight: 600`。

### 行内样式

| 元素 | 样式 |
|------|------|
| **加粗** | `font-weight: 600` |
| *斜体* | `font-style: italic` |
| ~~删除线~~ | `text-decoration: line-through; opacity: 0.5` |
| `代码` | 等宽字体、0.85em、`rgba(0,0,0,0.04)` 背景、`rounded-sm` |
| ==高亮== | `rgba(200,170,80,0.25)`（暖黄，与纸色协调） |
| [链接]() | `color: var(--primary); text-decoration: underline` |
| @引用 | `color: var(--primary); cursor: pointer; hover: underline` |

---

## §4 空间网格

### 基准网格：4px

所有间距必须是 4px 的整数倍。

| Token | 值 | 用途 |
|-------|------|------|
| `space-0.5` | 2px | 图标与文本微间距（例外：仅此值非 4px 倍） |
| `space-1` | 4px | 最小间距：列表项内边距、元素间微间隙 |
| `space-1.5` | 6px | Outliner 缩进基准（depth × 28 + 6） |
| `space-2` | 8px | 标准内边距：按钮内、输入框内、dropdown 项间 |
| `space-3` | 12px | 卡片内边距、分组间距 |
| `space-4` | 16px | 区域间距：面板内边距、面板头与内容间 |
| `space-5` | 20px | 大区域间距 |
| `space-7` | 28px | Outliner 层级缩进步长（depth × 28） |
| `space-8` | 32px | 页面边距 |

### 大纲专用间距

| 度量 | 值 | 说明 |
|------|------|------|
| **行高** | **24px** | 节点单行高度（= text-base line-height，4px 网格对齐） |
| 缩进步长 | 28px | 每层缩进距离 |
| 缩进基准 | 6px | 第 0 层左偏移（对齐 Tana） |
| **Chevron 容器高度** | **24px** | 与行高同步（替代旧 28px） |
| Chevron 宽度 | 15px | 展开/折叠按钮区域 |
| Chevron–Bullet 间隙 | 4px | gap-1，防止误触 |
| **Bullet 容器高度** | **24px** | 与行高同步（替代旧 28px） |
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
| Bullet | 24 × 15px | 与行高对齐 |
| Chevron | 24 × 15px | 与行高对齐 |
| 线性元素 | 宽度 ≥ 16px | 缩进线、分隔线等 |
| 文本行 | flex-1 容器 | click handler 绑定在 flex-1 容器上，右侧空白也可点击 |

---

## §5 几何与圆角

### 三级圆角

| 级别 | Token | 值 | 用途 |
|------|-------|------|------|
| **Zero** | `radius-none` | 0 | 大纲节点、内联元素、文本行 |
| **Container** | `radius-container` | 8px | Dropdown、Popover、输入框 |
| | `radius-container-lg` | 12px | Dialog、Modal |
| **Pill** | `radius-pill` | 9999px | 按钮、Toggle |

> v5.0 简化为三级，去除 v1.0 的七级梯度和同心圆角规则。大纲节点（占页面 90%+ 面积）为零圆角，保持纸质平整感。

---

## §6 交互物理学

### 纸上叠纸（Paper-on-Paper）

文档流内**一律不使用阴影**。浮层通过 `.shadow-paper`（五层纸叠阴影）营造"一张暖纸轻放在另一张暖纸上"的物理感——不靠色差区分层级，而靠光影暗示厚度。

| 层级 | 场景 | 表现 |
|------|------|------|
| **文档层** | 大纲、面板、内容区 | 无阴影、无边框，纯 Paper 底色 |
| **浮层** | Dropdown、Popover、Tooltip | `bg-background shadow-paper`（五层纸叠阴影，无 border） |
| **遮罩层** | Modal、Dialog | `bg-background shadow-paper` + `backdrop: rgba(0,0,0,0.3)` |

#### 浮层五层阴影（`.shadow-paper`）

```css
box-shadow:
  0 0 0 1px rgba(0,0,0, 0.015),       /* 1. 物理边缘线 — 极淡描边替代 border */
  0 -1px 2px rgba(255,255,255, 0.6),   /* 2. 顶部高光 — 区分纸张边界 */
  0 2px 5px -1px rgba(0,0,0, 0.05),    /* 3. 接触面投影 — 锐利，模拟纸张厚度 */
  0 6px 10px -3px rgba(0,0,0, 0.03),   /* 4. 中间过渡 — 柔化接触与远端之间 */
  0 12px 20px -4px rgba(0,0,0, 0.04);  /* 5. 远端扩散 — 环境光遮蔽 */
```

定义在 `src/assets/main.css` 中作为 `.shadow-paper` 工具类。所有浮层统一使用 `bg-background shadow-paper rounded-lg`。

> **设计要点**：浮层与底层使用同一 Paper 底色 (`--background`)，层级完全由阴影表达。不使用 Surface (`#FFFFFF`) 白底——白底在暖纸上会显得突兀。阴影整体极其克制（最高不透明度仅 5%），保持纸面平静感。

### 呼吸式显现

次要交互元素默认隐藏，仅在 hover/focus 时浮现，实现"需要时出现，不需要时消失"的隐形大纲效果：

| 元素 | 默认态 | 显现条件 |
|------|--------|---------|
| Chevron（展开/折叠） | 隐藏（有子节点但未展开时显示为 bullet） | `group-hover` |
| Drag Handle | 隐藏 | `group-hover` |
| 行操作按钮 | 隐藏 | `group-hover` |
| 缩进辅助线 | 极淡（`foreground/6`） | 始终可见但不抢眼 |

### 过渡动画

| 属性 | 时长 | 缓动 |
|------|------|------|
| 背景色 | 150ms | ease-out |
| 边框色 | 150ms | ease-out |
| 不透明度 | 150ms | ease-out |
| Chevron 旋转 | 200ms | ease-in-out |
| Popover 出现 | 150ms | ease-out（opacity 0→1） |

> v5.0 移除所有 `scale` transform 过渡（active 微缩、popover 缩放出现），保持纸面平静感。

### 交互状态映射

| 状态 | 背景变化 | 边框变化 | 文本变化 | 其他 |
|------|----------|----------|----------|------|
| **Default** | 无 | — | `--foreground` | — |
| **Hover** | `foreground/4` | — | — | cursor: pointer |
| **Focus** | — | `--primary` (ring) | — | `ring-2 ring-primary/40` |
| **Active/Pressed** | `foreground/8` | — | — | 无 scale |
| **Selected** | `primary-muted` | `--primary/20` (ring) | — | `ring-1` |
| **Disabled** | `foreground/3` | `foreground/5` | `--foreground-tertiary` | cursor: not-allowed, opacity: 0.5 |
| **Destructive hover** | `destructive-muted` | — | `--destructive` | — |

### 两级选中态（Tana-style）

选中节点使用两层半透明叠加，均基于 Accent-Primary：

| 层 | Token | 值 | 覆盖范围 | 圆角 |
|----|-------|----|---------|------|
| **子树遮罩** | `--selection` | `rgba(94,142,101,0.07)` | 选中节点展开时覆盖整个子树区域 | `rounded-b-sm` (4px) |
| **直接行高亮** | `--selection-row` | `rgba(94,142,101,0.15)` | 仅直接选中的行 | `rounded-sm` (4px) |

实现细节：

- 行高亮有 1px 垂直内缩（`top: 1; bottom: 1`），相邻行产生 2px 可见间隙
- 子树遮罩有 1px 底部内缩（`bottom: 1`），与下一兄弟节点保持 2px 一致间隙
- 子树遮罩仅在节点展开时显示（`isExpanded`）
- 子节点**不单独渲染行高亮**，仅由子树遮罩覆盖
- reference 选中框必须使用绝对定位 overlay（`::before`）绘制，不可给布局盒添加 `padding/margin/border`

### 大纲节点状态

| 状态 | 表现 |
|------|------|
| 默认 | 无背景，文本 Ink-Primary |
| Hover 行 | `group-hover` 显示 chevron + drag handle |
| 编辑中 (focused) | TipTap 编辑器激活，无特殊视觉 ring |
| 选中 (selected) | 两级选中态（子树遮罩 + 行高亮） |
| 拖拽中 | `opacity-40`，目标行显示 Accent-Primary 色插入线 |
| Done (完成) | `text-foreground/50`（50% 不透明度） |

---

## §7 图标系统

### 扩展图标（App Icon）

#### 设计理念：纸生纸 — Paper begets Paper

soma 的 icon 不是"三张纸摆在一起"，是**从同一个根长出来的三片叶子**。

- **陪伴** = 共享同一个根。它们不是被放在一起的独立物体，而是天生在一起的有机体
- **成长** = 从小到大，从种子到枝叶。大小按黄金比例 (1 : φ : φ²) 自然递进

三功能色对应生命阶段：**Brick Red = 种子**（最小叶，第一个笔记），**Warm Amber = 生长**（中间叶），**Sage Green = 成熟**（最大叶，知识丰盛）。

#### 构成

| 要素 | 说明 |
|------|------|
| **形态** | 三片有机叶形纸张，从共同根部向外舒展（蕨类新芽意象） |
| **比例** | 叶长 27 : 43 : 70 ≈ 1 : φ : φ²（黄金比例） |
| **展角** | Green +28° / Amber -12° / Red -58°（从根部扇形展开） |
| **质感** | 每片叶有纸张叠加投影（Paper-on-Paper）和极淡白色边缘高光 |
| **背景** | 透明（Chrome toolbar 需要透明底才能与其他扩展等大） |

#### 尺寸与文件

| 尺寸 | 用途 | 路径 |
|------|------|------|
| 16 × 16 | Chrome toolbar | `public/icon/16.png` |
| 32 × 32 | Chrome toolbar (Retina) | `public/icon/32.png` |
| 48 × 48 | 扩展管理页 | `public/icon/48.png` |
| 128 × 128 | Chrome Web Store | `public/icon/128.png` |

源文件：`docs/icon-drafts/concept-l2-paper-unfurl.svg`。WXT 自动从 `public/icon/` 发现并写入 `manifest.json`。

### UI 图标（界面内）

| 属性 | 值 |
|------|------|
| 图标库 | lucide-react |
| 默认尺寸 | 16 × 16px |
| 小尺寸 | 14 × 14px（导航项） |
| 大尺寸 | 20 × 20px（面板头按钮） |
| 线条宽度 | 1.5px（lucide 默认，不要改为 2） |
| 默认颜色 | `text-foreground-secondary` |
| 交互态颜色 | hover → `text-foreground` |

### 图标对齐

- 图标 + 单行文本：`items-center`
- 图标 + 多行文本（name + description）：`items-start`（对齐首行）
- 图标容器固定宽度（16px/20px），防止文本变化导致偏移

---

## §8 核心界面模式

### 排印化标签

v5.0 标签不再使用色块 badge，改为**纯文本着色**：

```
Meeting notes  #project-alpha  #design
               ↑ Moss Green 色文本    ↑ Denim Blue 色文本
```

| 属性 | 值 |
|------|------|
| 字号 | `text-sm` (13px) |
| 字重 | 500 |
| 颜色 | Tag 10 色色板，hash 分配 |
| 背景 | 无 |
| 前缀 | `#`（Ink-Tertiary 色） |
| 间距 | 标签间 `space-2` (8px) |
| hover | 下划线 + 色值保持 |

### 次要元数据行

节点正文下方可选显示元数据行，用于日期、字段值、引用计数等：

| 属性 | 值 |
|------|------|
| 字号 | `text-xs` (11px) |
| 颜色 | Ink-Tertiary (`#999999`) |
| 行高 | 16px |
| 与正文间距 | 0（紧贴，共享节点行内空间） |
| 分隔符 | ` · `（middle dot，Ink-Tertiary） |

### 大纲结构线

| 元素 | 样式 |
|------|------|
| 缩进辅助线 | `width: 1px`，`background: foreground/6`，垂直连续 |
| 面板头下边框 | `border-bottom: 1px solid var(--border-subtle)` |
| 分组分隔线 | `height: 1px`，`background: var(--border-subtle)`，水平 |

---

## §9 组件模式

### Dropdown / Popover

```
┌─────────────────────────────┐  ← radius-container (8px), p-1 (4px), shadow-paper
│ ┌─────────────────────────┐ │
│ │ 🔧 Item text            │ │  ← gap-2.5, px-2 py-1.5, rounded-md
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │  Selected item ████████ │ │  ← bg: primary-muted (keyboard nav)
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

- 容器：`rounded-lg bg-background shadow-paper p-1`（纸叠阴影，无 border）
- 项：`gap-2.5 rounded-md px-2 py-1.5 text-sm text-foreground-secondary`
- 项图标：`size={14} strokeWidth={1.5}` 在 `w-4` 固定宽度容器内，`text-foreground-tertiary`
- 项 hover：`hover:bg-foreground/4 hover:text-foreground`
- 选中项（当前值）：`bg-primary text-primary-foreground`
- 高亮项（键盘导航）：`bg-primary-muted`
- 分隔线：`h-px bg-border-subtle mx-1 my-1`
- 参考实现：`ToolbarUserMenu.tsx`、`NodeContextMenu.tsx`

### 按钮

| 变体 | 背景 | 边框 | 文本 | 圆角 |
|------|------|------|------|------|
| Primary | `--primary` | 无 | `--primary-foreground` | `radius-pill` |
| Secondary | `--surface` | `--border` | `--foreground` | `radius-pill` |
| Ghost | 透明 | 无 | `--foreground-secondary` | `radius-pill` |
| Destructive | `--destructive` | 无 | `#fff` | `radius-pill` |
| Icon | 透明 | 无 | `--foreground-secondary` | `radius-pill` |

- Hover: 每个变体都有 hover 色变化（见交互状态映射）
- 尺寸：高度 28px（sm）/ 32px（default）/ 36px（lg）

### 输入框

- 高度：32px（default）、28px（compact, 用于大纲内）
- 边框：`border-border`，focus 时 `ring-2 ring-primary/40`
- 圆角：`radius-container` (8px)
- 内边距：`px-2 py-1`
- placeholder 色：`--foreground-tertiary`
- 背景：`--surface`

### 键盘快捷键 (Kbd)

统一组件：`src/components/ui/Kbd.tsx`

机械键帽风格：

| 属性 | 值 |
|------|------|
| 背景 | `rgba(0,0,0,0.04)` |
| 边框 | `1px solid rgba(0,0,0,0.08)` |
| 底边框 | `2px solid rgba(0,0,0,0.12)`（模拟键帽厚度） |
| 圆角 | 4px |
| 高度 | 20px (`h-5`) |
| 最小宽度 | 20px (`min-w-5`) |
| 内边距 | `px-1.5` |
| 字号 | `text-[10px]` |
| 字重 | `font-medium` (500) |
| 文本色 | Ink-Secondary (`--foreground-secondary`) |
| 可点击 hover | `bg-foreground/8 text-foreground` |

使用场景：

| 位置 | 示例 |
|------|------|
| CommandPalette 搜索栏 | `<Kbd onClick={close}>Esc</Kbd>` |
| CommandPalette 行内快捷键 | `<Kbd>⌘⇧D</Kbd>` |
| CommandPalette 操作栏 | `<Kbd>↵</Kbd>` |
| SearchTrigger 提示 | `<Kbd>⌘K</Kbd>` |
| SlashCommandMenu | `<Kbd>⌘⇧9</Kbd>` |

### 面板头

- 高度：44px
- 下边框：`border-border-subtle`
- 内边距：`px-3`
- 标题：`text-lg font-medium`（17px, weight 500）
- 按钮间距：`gap-1`

---

## §10 主题切换实现

### CSS 变量策略

在 `main.css` 的 `@theme` 块中定义 Light mode 为默认值，Dark mode 通过 `[data-theme="dark"]` 覆盖：

```css
@theme {
  /* Light mode — Paper & Ink */
  --color-background: #F5F4EE;
  --color-surface: #FFFFFF;
  --color-foreground: #1A1A1A;
  --color-foreground-secondary: #666666;
  --color-foreground-tertiary: #999999;

  /* Sage Green — Primary */
  --color-primary: #5E8E65;
  --color-primary-hover: #4D7A54;
  --color-primary-muted: rgba(94,142,101,0.08);
  --color-primary-foreground: #FFFFFF;

  /* Warm Amber — Secondary */
  --color-secondary: #E1A15E;
  --color-secondary-hover: #CC8D4E;
  --color-secondary-muted: rgba(225,161,94,0.12);
  --color-secondary-foreground: #1A1A1A;

  /* Brick Red — Destructive */
  --color-destructive: #AA5048;
  --color-destructive-hover: #8E3F38;
  --color-destructive-muted: rgba(170,80,72,0.08);
  --color-destructive-foreground: #FFFFFF;

  /* Borders */
  --color-border: rgba(0,0,0,0.10);
  --color-border-subtle: rgba(0,0,0,0.06);
  --color-border-emphasis: rgba(0,0,0,0.18);

  /* Functional */
  --color-warning: #A07830;
  --color-success: #5E8E65;
  --color-info: #5A8AB5;
  --color-selection: rgba(94,142,101,0.07);
  --color-selection-row: rgba(94,142,101,0.15);
}

[data-theme="dark"] {
  /* Dark mode — 待适配，见 §2 Dark Mode 结构约束 */
}
```

> **shadcn/ui 注意**：shadcn 组件使用 `bg-accent` 作为中性 hover 背景。CSS 中 `--color-accent` 应映射为 `foreground/4` 的效果（不是 Accent-Primary），避免 hover 变绿。Accent-Primary 通过 `--color-primary` 使用。

### 颜色命名规范

| 层级 | Token 命名 | 说明 |
|------|-----------|------|
| 基础层 | `background`, `surface` | 底色层级 |
| 语义前景 | `foreground`, `foreground-secondary`, `foreground-tertiary` | 文本重要性递减 |
| 边框 | `border-subtle`, `border`, `border-emphasis` | 分隔强度递增 |
| 功能色 | `primary`, `secondary`, `destructive`, `warning`, `success`, `info` | 交互与状态 |
| 衍生色 | `{color}-hover`, `{color}-muted`, `{color}-foreground` | hover / 低透明度背景 / 上层文本 |

### Tailwind 工具类使用

| 推荐 | 避免 |
|------|------|
| `bg-primary` | `bg-[#5E8E65]`（硬编码色值） |
| `text-foreground-secondary` | `text-gray-500`（语义不明） |
| `rounded-lg` | `rounded-[8px]`（除非特殊需要） |
| `border-border` | `border-gray-200` |

---

## §11 响应式策略

Chrome Side Panel 宽度范围：300px ~ 700px+。

| 断点 | 宽度 | 布局调整 |
|------|------|---------|
| 紧凑 | < 380px | 侧栏收起，FieldRow name/value 垂直堆叠 |
| 标准 | 380px ~ 500px | 侧栏可切换，FieldRow 水平布局 |
| 宽松 | > 500px | 侧栏常驻，更多横向空间 |

使用 `@container` 查询实现组件级响应式（非 viewport 断点），因为 Side Panel 宽度与 viewport 无关。

---

## §12 设计原则速查 + Agent 执行指令

### 原则速查

| # | 原则 | 检查问题 |
|---|------|---------|
| 1 | **内容优先** | 这个 UI 元素是在帮助用户看到内容，还是在分散注意力？ |
| 2 | **纸质克制** | 是否只用了三功能色（Green/Amber/Red）之一？有没有多余的颜色？ |
| 3 | **纸上叠纸** | 文档流内是否完全无阴影？浮层是否用 `.shadow-paper`（非 border）？ |
| 4 | **4px 网格** | 所有间距是否是 4px 的整数倍？ |
| 5 | **排印层级** | 信息层级是否通过字号/字重/颜色完成，而非装饰元素？ |
| 6 | **状态可见** | hover/focus/selected/disabled 状态是否都有视觉反馈？ |
| 7 | **最小点击** | 所有可交互元素是否满足最小点击区域？ |
| 8 | **一致性** | 同类元素是否使用相同的 token？ |

### Agent 执行自问自答

实现或审查 UI 时，逐条核对：

| 问 | 答 |
|----|----|
| 我要加颜色了？ | 只能用三功能色（Green/Amber/Red）、Ink 三级、Tag 10 色、Info/Success 之一 |
| 我要加阴影了？ | 文档流内禁止。浮层用 `.shadow-paper`（§6 Paper Shadow），不用 border |
| 我要加圆角了？ | 大纲节点 = 0，容器 = 8/12px，按钮 = pill |
| 我要加背景了？ | 优先用 Paper (`--background`)；hover 用 `foreground/4`；选中用 `primary-muted` |
| 这个字号对吗？ | 只能从 11/13/15/17/20/24 中选，基准正文 15px |
| 这个字重对吗？ | 只用 400/500；用户手动加粗例外 (600) |
| 这个元素要一直显示吗？ | 非核心交互元素应使用呼吸式显现（hover 时出现） |
| 标签怎么渲染？ | 纯文本着色，无背景 badge，色值从 Tag 10 色 hash 分配 |
