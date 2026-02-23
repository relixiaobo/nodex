# Feature: Date 节点 & 日记

> Phase 1.4 | Phase 1 已实现 (2026-02-21)

## 概述

日记系统是 Tana 的核心功能之一。每天自动生成日节点，用户在其中记录笔记、待办、想法。所有日节点组织在 **年 → 周 → 日** 三级层次结构中（无月层级），以 ISO 8601 周编号为中间层。

侧栏 "Today" 入口一键跳转到今日节点，如不存在则自动创建整条路径。

## 数据模型

### 节点层级

```
{wsId}_JOURNAL              ← 工作区容器 (doc_type: 'journal')
│                             Tana 面包屑显示为 "Daily notes"
│
└── 2026                    ← 年节点 (doc_type: 'journalPart', #year, tagDef=`sys:year`)
      ├── Week 01           ← 周节点 (doc_type: 'journalPart', #week, tagDef=`sys:week`)
      │     ├── Mon, Dec 29 ← 日节点 (doc_type: 'journalPart', #day, tagDef=`sys:day`)
      │     ├── Tue, Dec 30
      │     └── ...
      ├── Week 02
      │     └── ...
      └── Week 07
            ├── Sun, Feb 09
            ├── Mon, Feb 10
            └── ...（用户笔记作为日节点的 children）
```

### DocType

| doc_type | 用途 | 数量（Tana 导出统计） |
|----------|------|----------------------|
| `journal` | 日记根容器（每个工作区 1 个） | 1 |
| `journalPart` | 年/周/日节点 | 142 |

### 系统标签

| 常量 | 值 | 标签名 | 用途 |
|------|-----|--------|------|
| `SYSTEM_TAGS.DAY` | `sys:day` | `#day` | 日节点标签（普通 tagDef，固定 ID） |
| `SYSTEM_TAGS.WEEK` | `sys:week` | `#week` | 周节点标签（普通 tagDef，固定 ID） |
| `SYSTEM_TAGS.YEAR` | `sys:year` | `#year` | 年节点标签（普通 tagDef，固定 ID） |

### 系统属性

| 常量 | 值 | 用途 |
|------|-----|------|
| `SYS_A.JOURNAL_DATE` | `SYS_A169` | 日志日期元数据（存储在 node.meta Tuple 中） |

### 节点命名规则

| 层级 | `props.name` 格式 | 示例 |
|------|-------------------|------|
| 年 | `YYYY` | `2026` |
| 周 | `Week WW` | `Week 07` |
| 日 | `Weekday, Mon DD` | `Sun, Feb 09` |

> **Tana 实际格式**（截图确认）：面包屑中当天显示 `Today, Sat, Feb 14`，非当天显示 `Sat, Feb 14`。节点名称不含年份（年份已由父层级体现）。

### 周编号

采用 **ISO 8601 周编号**（与 Tana 一致）：
- 每周从**周一**开始
- 第 1 周 = 包含该年第一个周四的那一周
- 跨年周归属：按 ISO 规则，12 月末可能属于下一年第 1 周，1 月初可能属于上一年最后一周
- 例：2025-12-29（周一）属于 2026 年 Week 01

### 日节点 Meta 结构

```
日节点.meta: [tagTupleId, dateTupleId]
  ├── Tuple [SYS_A13, SYS_T124]     ← #day 标签绑定
  └── Tuple [SYS_A169, dateRef]      ← 日志日期元数据
```

`SYS_A169` Tuple 存储日期信息，用于系统字段 "Date from calendar node" 的向上遍历解析。

### 工作区容器

- 容器 ID: `{workspaceId}_JOURNAL`
- 容器 `doc_type`: `journal`
- 已在 `WORKSPACE_CONTAINERS.JOURNAL` 中定义
- Tana 面包屑中显示为 **"Daily notes"**（非 "Journal"）
- 侧栏当前显示 "Journal"（`SidebarNav.tsx`，CalendarDays 图标），实现时考虑改为 "Daily notes"

## 行为规格

### Today 入口

- 侧栏新增 **"Today"** 按钮（位于 Journal 之上或替代 Journal）
- 快捷键：`Ctrl+Shift+D`（Windows/Linux）/ `Cmd+Shift+D`（Mac）
- 点击/快捷键行为：
  1. 计算今日日期 → 确定所属年份和 ISO 周
  2. 在 `{wsId}_JOURNAL` 下查找或创建年节点
  3. 在年节点下查找或创建周节点
  4. 在周节点下查找或创建日节点
  5. `navigateTo` 日节点（push panel）
- 如果今日节点已存在，直接导航，不重复创建
- 新创建的日节点自动应用 `#day`（`sys:day`）标签

### 自动创建路径

当用户导航到 Today 时，缺失的层级自动补全：

```typescript
ensureTodayNode(wsId, userId):
  1. journalId = `${wsId}_JOURNAL`
  2. yearNode = findOrCreate(journalId, '2026', { _docType: 'journalPart' })
     → applyTag(yearNode, SYSTEM_TAGS.YEAR /* sys:year */)
  3. weekNode = findOrCreate(yearNode, 'Week 07', { _docType: 'journalPart' })
     → applyTag(weekNode, SYSTEM_TAGS.WEEK /* sys:week */)
  4. dayNode = findOrCreate(weekNode, 'Sat, Feb 14', { _docType: 'journalPart' })
     → applyTag(dayNode, SYSTEM_TAGS.DAY /* sys:day */)
     → createMetaTuple(dayNode, SYS_A169, dateRef)
  5. return dayNode
```

### Journal 浏览

- 点击侧栏 "Journal" → `navigateTo({wsId}_JOURNAL)` → 显示年节点列表
- 展开年节点 → 显示周节点列表
- 展开周节点 → 显示日节点列表
- 点击日节点 → 进入日记页面，children 为当天笔记

### 日节点排序

- 年节点按年份**降序**（最新年在上）
- 周节点按周编号**降序**（最新周在上）
- 日节点按日期**降序**（最新日在上）
- 用户在日节点内的笔记保持用户排序

### 面包屑路径

日节点的面包屑显示（Tana 截图确认）：
```
Daily notes / 2026 / Week 07 / Today, Sat, Feb 14    ← 当天
Daily notes / 2026 / Week 07 / Sat, Feb 14           ← 非当天
```

面包屑中当天日节点自动添加 "Today" 前缀。

### 日期导航栏

日节点 zoom-in 后，标题下方显示日期导航栏（Tana 截图确认）：

```
[<] [>]  [Today]  [📅]  [🗓️]              [Switch workspace ▾]
```

| 元素 | 功能 |
|------|------|
| `< >` | 切换到前一天 / 后一天 |
| `Today` | 跳转回今天 |
| 📅 日历图标 | 打开日期选择器（跳转到任意日期） |
| 🗓️ Google Calendar | Google Calendar 集成（Nodex 暂不实现） |
| Switch workspace | 切换工作区（已有功能） |

> Nodex 实现时：`< >` 和 `Today` 按钮为 Phase 1 必需，日期选择器为中优先级，Google Calendar 集成暂不实现。

### 日记模板（#day supertag）

- `#day`（固定 ID `sys:day`）是普通 `tagDef`，可配置模板字段
- 用户可为 `#day` 添加模板字段（如 "Mood"、"Top 3"）
- 新创建的日节点自动应用 `#day` 标签 → 自动添加模板字段
- `#week` 和 `#year` 同理，可配置各自的模板

### 日期字段值 = 日节点引用（核心设计原则）

> **日期类型字段的值是对日节点的引用，不是日期字符串。**
> 这是"一切皆节点"在日期领域的关键实践。

**当前状态**：实现延后，但设计原则已确立。

**目标行为**：
- 日期字段值存储为对 journalPart 日节点的引用（nodeId），而非字符串 `"2026-02-16"`
- 日期选择器选中一个日期 → `ensureDayNode()` 确保日节点存在 → 值 = 日节点 ID
- 点击日期字段值 → `navigateTo` 对应日节点
- 日期节点可以有 children（当天笔记）、tag（`#day` 模板）、field（天气、心情）

**Tana 验证**：
- 内联日期引用 `<span data-inlineref-date='{"dateTimeString":"2026-01-26","timezone":"..."}'></span>` — 日期是引用对象
- Tana meta Tuple `[SYS_A169, dateRef]` — 日志日期是节点引用
- 日历视图通过日期字段值定位节点到日历格子

**实现顺序**：
1. 先完成日节点层级创建（ensureTodayNode）— Phase 1
2. 再让日期字段值引用日节点（日期选择器 → find-or-create 日节点 → 存引用）— Phase 2
3. 最后支持内联日期引用（TipTap extension）— Phase 3

### 自然语言日期 — 延后

- `@today` / `@tomorrow` / `@next Monday` / `@November 15` 等
- 在编辑器中输入 `@` + 日期关键词 → 解析为日期引用
- 插入内联日期 chip（显示格式化日期，点击跳转到日节点）
- 依赖：inline date extension（TipTap）、日期解析库

## 实现范围

### Phase 1（本次）

| 功能 | 说明 |
|------|------|
| 年/周/日节点自动创建 | `ensureTodayNode` + 路径补全 |
| Today 侧栏入口 | 按钮 + Ctrl+Shift+D 快捷键 |
| Daily notes 浏览 | 展开年 → 周 → 日层级 |
| 日期导航栏 | `< >` 前后天切换 + Today 跳转按钮 |
| 日期选择器 | 日历弹窗跳转到任意日期 |
| #day 模板 | 日节点自动应用标签 + 模板字段 |

### 延后

| 功能 | 原因 |
|------|------|
| 自然语言日期解析 | 需 TipTap inline date extension + 解析库 |
| 日期字段链接到日节点 | 需日期字段值的 click handler |
| 系统字段 "Date from calendar node" | 需向上遍历 `_ownerId` 链找 journalPart 祖先 |

## 与 Tana 的已知差异

| 差异 | Tana 行为 | Nodex 决策 |
|------|----------|-----------|
| 容器显示名 | 面包屑显示 "Daily notes" | 跟随 Tana，侧栏和面包屑显示 "Daily notes" |
| 月层级 | Tana 无月层级 | Nodex 同样**不设月层级**，年 → 周 → 日 |
| 日节点命名 | `Today, Sat, Feb 14`（当天）/ `Sat, Feb 14`（非当天） | 跟随 Tana 格式，`props.name` 存 `Sat, Feb 14`，面包屑中当天加 "Today" 前缀 |
| Google Calendar 集成 | 日期导航栏有 Google Calendar 图标 | Nodex 暂不实现第三方日历集成 |

## 决策记录

| 日期 | 决策 | 原因 |
|------|------|------|
| 2026-02-14 | 不设月层级，采用年/周/日 | 与 Tana 一致；月层级会导致周跨月时归属歧义 |
| 2026-02-14 | 采用 ISO 8601 周编号 | 与 Tana 一致；国际标准，跨年处理明确 |
| 2026-02-14 | doc_type 使用 `journalPart`（非自定义类型） | 与 Tana 数据模型一致，年/周/日共用同一 doc_type，通过标签区分 |
| 2026-02-14 | 自然语言日期解析延后 | 需额外依赖（解析库 + TipTap extension），非 MVP 必需 |
| 2026-02-14 | 日节点命名跟随 Tana 格式 `Sat, Feb 14` | 截图确认 Tana 实际格式；"Today" 前缀仅在面包屑中动态添加，不存入 props.name |
| 2026-02-14 | 日期导航栏（`< >` / Today / 日历）Phase 1 实现 | 截图确认为日记核心交互，非可选功能 |
| 2026-02-16 | 日期字段值 = 日节点引用（非字符串） | "一切皆节点"守则；让日期成为可挂 children/tag/field 的一等公民 |
| 2026-02-23 | `day/week/year` 使用固定 ID 普通 tagDef（`sys:day/week/year`） | 简化模型：无映射层、无额外预置类型；journal 仅按 ID 识别 |
| 2026-02-21 | Phase 1 实现：Loro 模型（无 doc_type/meta） | 使用 SYSTEM_TAGS.DAY/WEEK/YEAR 直接标签，无 meta Tuple；容器 ID 为 CONTAINER_IDS.JOURNAL（无 wsId 前缀） |
| 2026-02-21 | 侧栏 "Daily notes" + Today 按钮 | 重命名 Journal → Daily notes，CalendarCheck 图标按钮触发 ensureTodayNode |
| 2026-02-21 | Cmd+Shift+D 全局快捷键 | 非编辑/选中模式下触发（编辑模式下 batch_duplicate 优先） |
| 2026-02-21 | DateNavigationBar 日期导航栏 | `< >` 前后天 + Today + Calendar 占位；仅日节点面板显示 |
| 2026-02-21 | 面包屑 "Today" 前缀 | resolveBreadcrumbLabel 检测当日日节点并添加 "Today, " 前缀 |
