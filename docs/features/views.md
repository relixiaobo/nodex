# Feature: 视图系统（Views）

> Phase 3+ | 低优先级（仅 Outline 默认视图可用，其余视图延后）

## 概述

Tana 中同一组数据可以用不同视图呈现。视图是节点的渲染方式，配置存储在节点上（而非全局）。每个节点可以有多个视图定义，用户通过工具栏切换。

视图系统包含 3 个正交维度：
- **视图类型**：Outline / Table / Cards / Calendar / List / Tabs / Side Menu（Tana 共 7 种）
- **过滤**（Filter）：按字段值、标签、文本筛选显示内容
- **分组**（Group）：按字段值将节点归组
- **排序**（Sort）：按字段值多级排序

**Nodex 优先级**：Outline 已实现且满足当前需求，其余视图类型全部延后到 Phase 3+。

## 当前实现状态

| 功能 | 状态 |
|------|------|
| Outline 视图（默认） | ✅ OutlinerView |
| Table 视图 | ❌ |
| Cards 视图 | ❌ |
| Calendar 视图 | ❌ |
| List 视图（双面板） | ❌ |
| Tabs 视图 | ❌ |
| Filter 工具栏 | ❌ |
| Group By | ❌ |
| Sort By | ❌ |
| 视图切换 UI | ❌ |

## 数据模型

### ViewDef 节点

```
ViewDef (doc_type: 'viewDef')
  ├── props.name: "Default"
  ├── props._view: "table" | "cards" | "list" | "navigationList" | ...
  ├── props._ownerId: parentNodeId
  └── children: [columnDef1, columnDef2, ...]  ← Table 的列定义
```

Tana 导出数据中有 53 个 viewDef 节点。

### 视图配置存储（SYS_A16）

视图通过 meta Tuple 关联到节点：

```
ContentNode.meta:
  └── Tuple [SYS_A16, viewDefId]   ← 视图配置
```

一个节点可以有多个 `SYS_A16` Tuple（多个可切换的视图）。

### 系统常量

| 常量 | 值 | 用途 |
|------|-----|------|
| `SYS_A.VIEWS` | `SYS_A16` | 视图配置 Tuple key |
| `SYS_A.COLUMN_DEFS` | `SYS_A17` | 列定义 Tuple key |
| `SYS_A.FILTER_EXPRESSIONS` | `SYS_A18` | 过滤表达式 |
| `SYS_A.SORT_ORDER` | `SYS_A19` | 排序方向 |
| `SYS_A.SORT_FIELD` | `SYS_A20` | 排序字段 |
| `SYS_A.BANNER_IMAGE` | `SYS_A25` | 横幅图片（Cards） |
| `SYS_A.DISPLAY_DENSITY` | `SYS_A205` | 显示密度 |

### _view 属性值

| 值 | 视图类型 |
|----|---------|
| `"list"` | Outline（默认大纲） |
| `"table"` | Table（表格） |
| `"cards"` | Cards（卡片） |
| `"navigationList"` | List（左列表 + 右详情） |
| _(special)_ | Calendar / Tabs / Side Menu |

## 行为规格

### 视图切换

- 每个节点面板右上角显示视图切换按钮（图标组）
- 点击切换按钮 → 切换当前节点的渲染方式
- 视图选择持久化到节点的 ViewDef 配置
- 默认视图 = Outline

### 视图工具栏

节点面板标题下方可展开工具栏，提供：

```
[Filter ▾] [Group ▾] [Sort ▾] [···]
```

- 工具栏在所有视图类型中通用
- 通过 "..." 菜单或快捷键展开/收起

---

## 视图类型

### Outline 视图（已实现）— P0

当前默认视图。层级缩进的树状大纲。

- 渲染组件：OutlinerView → OutlinerItem（递归）
- 支持展开/折叠、拖拽排序、键盘导航
- 字段交错渲染（FieldRow）
- 搜索结果中显示为引用 bullet（⊙）+ TagBadge

### Table 视图 — P0

将节点的子节点渲染为表格行，字段作为列。

**Tana 截图确认**：
```
┌───┬──────────────┬──────────┬──────────┬───┬───────┐
│   │ Name         │ Status   │ Date     │ ▾ │ + Add │
├───┼──────────────┼──────────┼──────────┼───┼───────┤
│ ☐ │ ⊙ Task 1 #   │ TODO     │ Feb 15   │   │       │
│ ☑ │ ⊙ Task 2 #   │ Done     │ Feb 10   │   │       │
│ ☐ │ ⊙ Task 3 #   │ In Prog  │          │   │       │
└───┴──────────────┴──────────┴──────────┴───┴───────┘
```

**列 = 字段**：
- 每列对应一个 attrDef（通过 ViewDef 的 columnDef children 配置）
- 第一列固定为节点名称（`props.name`），前方有 checkbox（若标签启用）和引用 bullet
- TagBadge 在名称列中显示为缩写 `#`（空间不足时截断）
- 可拖拽调整列顺序
- 可拖拽调整列宽
- `+ Add` 列头按钮 → 添加新列（选择字段）

**单元格编辑**：
- 点击单元格 → 直接编辑字段值（内联编辑）
- 编辑行为与 FieldRow 值编辑一致
- 不同字段类型使用对应的编辑器（文本 / 日期选择器 / Options 下拉等）

**列聚合**：
- 列底部可显示聚合函数结果
- 支持：Count / Sum / Avg / Median / Min / Max
- 仅对 Number 类型字段有意义（Count 例外，适用于所有类型）

**行为**：
- 行 = 直接子节点（不递归显示孙节点）
- 点击行名称 → navigateTo 该节点
- 支持新建行（底部空行或 + 按钮）
- 支持删除行

**Side Panel 适配**：
- 窄屏（<500px）时需水平滚动，固定名称列
- 考虑仅显示 2-3 列 + 水平滚动

### Cards 视图 — P1

将节点的子节点渲染为卡片网格。

**Tana 截图确认**：
```
                                    [+ Add]
┌───────────────────┐  ┌───────────────────┐
│ ⊙ Task 1 # tag    │  │ ⊙ Task 3 # tag    │
│ ☐                  │  │ ☐                  │
└───────────────────┘  └───────────────────┘
┌───────────────────┐  ┌───────────────────┐
│ ⊙ Task 2 # tag    │  │ ⊙ Task 4 # tag    │
│ ☑                  │  │ ☐                  │
└───────────────────┘  └───────────────────┘
```

**卡片内容**（截图确认）：
- 引用 bullet（⊙）+ 节点名称 + TagBadge（缩写 `#`）
- Checkbox 状态（若标签启用）
- 横幅图片（`SYS_A25`，可选）
- 显示选定字段的值（可配置哪些字段显示在卡片上）
- `+ Add` 按钮在右上角

**交互**：
- 点击卡片 → navigateTo 该节点
- 拖拽卡片 → 可更新字段值（如拖拽到不同分组列）
- 响应式网格布局：2 列（截图确认），窄屏可降为 1 列

**Side Panel 适配**：
- 400px+ 显示 2 列，<400px 降为 1 列
- 卡片内容精简（仅名称 + 关键字段）

### Calendar 视图 — P2

按日期字段将节点排列在日历上。

**Tana 截图确认**：
```
[Day] [Week] [Month]     < February 2026 >
┌────┬────┬────┬────┬────┬────┬────┐
│ W6 │ Mon│Tue │Wed │Thu │Fri │Sat │Sun│
├────┼────┼────┼────┼────┼────┼────┤
│ W7 │  9 │ 10 │ 11 │ 12 │ 13 │ 14 │ 15│
│    │    │    │    │    │    │node│   │
├────┼────┼────┼────┼────┼────┼────┤
│ W8 │ 16 │ ...                        │
└────┴────┴────────────────────────────┘
133 nodes with no dates >
```

**关键细节**（截图确认）：
- 月视图（默认），左侧显示 ISO 周编号（W6, W7, W8...）
- 顶部粒度切换：Day / Week / Month
- `< >` 按钮切换月份
- 底部 "X nodes with no dates >" → 点击展开未排期节点列表

**前置条件**：节点的子节点必须有日期类型字段。

**交互**：
- 粒度切换：日 / 周 / 月
- 未排期面板：没有日期值的节点（底部折叠区）
- 拖拽未排期节点到日历 → 自动设置日期字段值
- 点击节点 → navigateTo

**Side Panel 适配**：
- 月视图在 300px 下每格极小，考虑列表模式 fallback
- 周视图更适合窄屏
- 依赖 #22 Date 节点完成

### List 视图 — P2

**Tana 截图确认**：两种不同的 List 样式。

#### Checklist 样式

```
☐ Task 1                           #
☑ Task 2                           #
☐ Task 3                           #
```

- 简洁列表，无 bullet，仅 checkbox + 名称 + TagBadge（右侧）
- 适合快速浏览和勾选

#### 双面板样式（navigationList）

```
┌──────────────┬──────────────────────────────┐
│ Task 1       │  Task 1                      │
│ Task 2       │  Priority: High              │
│ > Task 3     │  Status: TODO                │
│              │  Due: Feb 15                 │
│              │                              │
│              │  • Subtask 1                 │
│              │  • Subtask 2                 │
└──────────────┴──────────────────────────────┘
```

- 左面板：扁平节点列表（直接子节点）
- 右面板：选中节点的完整内容（含字段、子节点）
- 点击列表项 → 右面板显示对应节点详情

**Side Panel 适配**：
- 双面板在 <500px 时无法并排 → 降级为全屏列表 + 点击导航进入详情
- Checklist 样式窄屏友好，但与 Outline + checkbox 功能重叠

### Tabs 视图 — P3

**Tana 截图确认**：子节点名称以 flow/wrap 布局排列为 inline 文本块。

```
┌──────────────────────────────────────────┐
│ [Task 1] [Task 2] [Task 3] [Task 4]     │
│ [Task 5] [Task 6]                        │
└──────────────────────────────────────────┘
```

- 每个文本块 = 一个子节点，点击进入详情
- flow/wrap 布局，类似标签云
- 使用场景偏窄

### Side Menu 视图 — 不实现

侧边栏菜单导航样式。与 Chrome Side Panel 本身的侧栏功能重叠，Nodex 不实现。

---

## Filter / Group / Sort

### Filter（过滤）

按条件筛选显示哪些子节点。

**过滤条件类型**：

| 条件 | 说明 | 示例 |
|------|------|------|
| 标签过滤 | 有/无指定标签 | 只显示 #task 节点 |
| 字段值过滤 | 字段等于/包含/为空 | Priority = "High" |
| 文本过滤 | 名称包含关键词 | 名称含 "bug" |
| 状态过滤 | checkbox 完成/未完成 | 只显示未完成 |
| 日期过滤 | 日期在范围内 | Due date 在本周内 |

**过滤 UI**：
- 点击 [Filter ▾] → 弹出过滤条件编辑器
- 添加条件：选择字段 → 选择操作符 → 输入值
- 多条件默认 AND 关系
- 已应用的过滤器在工具栏显示为 pill（可点击移除）
- 过滤器配置持久化到 ViewDef

**数据模型**：

```
ViewDef meta:
  └── Tuple [SYS_A18, filterTupleId]
        └── filterTuple.children: [fieldDefId, operatorValue, filterValue]
```

### Group（分组）

按字段值将节点归组显示。

```
▾ Priority: High
  • Fix login bug
  • Security patch

▾ Priority: Medium
  • Add search
  • Refactor API

▾ Priority: Low
  • Write docs
```

**分组 UI**：
- 点击 [Group ▾] → 选择分组字段
- 每个唯一字段值创建一个分组
- 分组标题 = 字段值
- 分组可展开/折叠
- 适用于 Outline / Cards / List 视图
- Table 视图中分组表现为行间分隔符

**数据模型**：

Group 配置作为 Tuple 存储在 ViewDef 的 meta 中（与 Filter/Sort 对称）：

```
ViewDef meta:
  └── Tuple [NDX_A_GROUP_FIELD, fieldDefId]   ← 分组字段
```

> 注：`NDX_A_GROUP_FIELD` 系统常量待分配。Tana 导出数据中未发现 Group 专用 SYS_A 常量，推测 Tana 使用客户端状态或未导出的属性。Nodex 自定义此常量以保持 Tuple 存储一致性。

### Sort（排序）

按字段值排序节点。

**排序 UI**：
- 点击 [Sort ▾] → 选择排序字段 + 方向（升序/降序）
- 支持多级排序（主排序 + 次排序 + ...）
- Table 视图中点击列头也可排序
- 排序配置持久化到 ViewDef

**数据模型**：

```
ViewDef meta:
  ├── Tuple [SYS_A19, sortDirection]   ← 升序/降序
  └── Tuple [SYS_A20, fieldDefId]      ← 排序字段
```

多级排序 = 多组 SYS_A19 + SYS_A20 Tuple。

---

## 视图与搜索节点的关系

搜索节点（`doc_type: 'search'`）的结果可以用任意视图展示：

```
SearchNode meta:
  ├── Tuple [SYS_A15, tagDefId]       ← 搜索表达式
  ├── Tuple [SYS_A16, viewDefId]      ← 结果视图
  └── Tuple [SYS_A14, defaultTagId]   ← 新建结果时的默认标签
```

这意味着搜索节点 + Table 视图 = 类似 Notion Database 的体验。详见 `docs/features/search.md`。

## 设计原则

> **Filter/Sort/Group 是持久化节点数据，不是临时 UI 状态。**

实现时的硬约束：

1. **不要**把 Filter/Sort/Group 存为 React state 或 Zustand 临时状态。它们必须是 ViewDef 关联的 Tuple 节点，随 ViewDef 一起持久化
2. 视图切换时，新视图的 Filter/Sort/Group 从新 ViewDef 的 Tuple 加载，旧视图的配置自然保留在旧 ViewDef 上
3. 搜索节点的 Filter 与普通节点的 Filter 共享同一数据模型（都是 Tuple），不需要两套实现
4. ViewDef 可通过 supertag 模板继承 — tagDef 模板中的 `[SYS_A16, viewDefId]` Tuple 在标签应用时实例化，实例 ViewDef 的 Filter/Sort/Group Tuple 继承模板的默认配置

详见 `docs/features/data-model.md` § 设计守则 1-2。

---

## 实现考量

### 渲染架构

建议视图系统的渲染架构：

```
NodePanel
  └── ViewContainer (根据 _view 类型分发)
        ├── OutlinerView        ← _view: "list" (已有)
        ├── TableView           ← _view: "table"
        ├── CardsView           ← _view: "cards"
        ├── CalendarView        ← _view: "calendar"
        ├── ListView            ← _view: "navigationList"
        └── TabsView            ← _view: "tabs"
```

ViewContainer 负责：
- 读取节点的 ViewDef 配置
- 应用 Filter / Group / Sort
- 将处理后的节点列表传递给具体视图组件

### Filter/Group/Sort 管道

三者形成数据处理管道，在渲染前应用：

```
原始 children → Filter → Sort → Group → 传给视图组件渲染
```

- Filter 减少节点数量
- Sort 确定顺序
- Group 添加分组标题（可选）
- 管道结果缓存，仅在数据或配置变更时重新计算

### Chrome Side Panel 适配

| 约束 | 应对 |
|------|------|
| 窄宽度（300-700px） | Table 横向滚动；Cards 单列或双列自适应 |
| 无固定宽度 | CSS container queries 响应式切换 |
| Calendar 空间不足 | 移动端风格日历（列表模式 fallback） |
| List 双面板 | 窄屏时切换为全屏列表 + 导航进入详情 |

## 实现范围

### 已完成

- Outline 视图（OutlinerView，默认且唯一的视图）

### 延后（Phase 3+）

除 Outline 外的所有视图和视图基础设施全部延后，当前聚焦核心大纲体验。

| 功能 | 说明 |
|------|------|
| ViewContainer 抽象层 | 视图分发 + 工具栏 |
| 视图切换 UI | 工具栏图标组 |
| Table 视图 | 搜索节点 + Table = 数据库 |
| Cards 视图 | 2 列网格概览 |
| Filter / Sort / Group | 通用数据管道 |
| Calendar 视图 | 依赖日期节点 |
| List 视图 | 双面板，窄屏受限 |
| Tabs / Side Menu | 场景窄 / 与 Side Panel 重叠，窄屏适配困难 |

## 与 Tana 的已知差异

| 差异 | Tana | Nodex 决策 |
|------|------|-----------|
| Side Panel 宽度 | 桌面应用全屏 | Table 需横向滚动（固定名称列）；Cards 自适应列数 |
| 视图数量 | 7 种（Outline/Table/Cards/Calendar/List/Tabs/Side Menu） | 目标阶段优先实现 3 种（Outline/Table/Cards）；当前仅 Outline |
| Side Menu 视图 | 侧边栏菜单导航 | 不实现（与 Side Panel 侧栏功能重叠） |
| Tabs 视图 | flow/wrap inline 文本块布局 | 延后（使用场景窄） |
| List 视图 | 双面板（左列表 + 右详情） | 延后（窄屏空间不足，降级后与 Outline 重叠） |
| Calendar 视图 | 月视图 + 周编号 + 未排期面板 | 延后（依赖日期节点；窄屏月视图几乎不可用） |

## 决策记录

| 日期 | 决策 | 原因 |
|------|------|------|
| 2026-02-14 | Table 优先实现 | 最高用户价值；搜索节点 + Table = 类 Notion Database |
| 2026-02-14 | Filter/Sort 独立于视图类型 | 避免每个视图重复实现；统一数据管道 |
| 2026-02-14 | ViewDef 存储在 meta Tuple 中 | 与 Tana 数据模型一致（Metanode 已简化为 meta 数组） |
| 2026-02-14 | 不实现 Side Menu 视图 | Chrome Side Panel 本身就是侧栏，Side Menu 视图功能重叠 |
| 2026-02-14 | Calendar 依赖日期节点 | 需要先完成 #22 Date 节点才能确定日历定位字段 |
| 2026-02-14 | 合并 5 种视图 + Filter/Group/Sort 为一份文档 | 它们是同一个系统的不同维度，分开文档会导致重复描述数据模型 |
| 2026-02-16 | Filter/Sort/Group 必须是 ViewDef 的 Tuple，不是 UI 状态 | "一切皆节点"守则；确保视图切换自动保存/恢复配置 |
| 2026-02-16 | Group By 使用 `NDX_A_GROUP_FIELD` Tuple 存储 | 与 Filter(SYS_A18)/Sort(SYS_A19+20) 对称；Tana 无导出对应常量 |
| 2026-02-16 | 视图配置可通过 supertag 模板继承 | tagDef 模板中定义默认视图 → 应用标签时实例化 |
| 2026-02-14 | 目标阶段聚焦 Outline + Table + Cards | 截图分析后确认：Table 在窄屏可用（横向滚动），Cards 2列适配良好；Calendar/List/Tabs 在 300-700px 宽度下体验受限 |
| 2026-02-14 | Tabs 视图确认为 flow/wrap 文本块布局 | 截图确认非传统 tab 切换，而是 inline 文本块排列，使用场景窄 |
