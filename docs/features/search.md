# Feature: Search Nodes / Live Queries

> Phase 2 | NQL AST + Query Builder（服务层部分实现）

## 概述

Search Node 是 Tana 中的持久化动态查询。它是一等节点（`doc_type: 'search'`），可以存在于工作区任何位置，展开时显示实时匹配结果。搜索节点与视图系统结合，可以 Table、Cards、Calendar 等形式展示结果。

在 Nodex 中，查询表达统一为 **NQL AST**（详见 `docs/features/nql.md`），Tuple 树是 NQL 的持久化载体。

## 当前实现状态

| 层次 | 状态 |
|------|------|
| 数据模型（类型定义） | ✅ `doc_type: 'search'` 已定义 |
| 服务层（search-service.ts） | ⚠️ 仅完成 tag 匹配主链，过滤/逻辑执行未完成 |
| 搜索配置提取 | ✅ `getSearchConfig()` |
| 标签树解析（多态搜索） | ✅ `getTagTree()` |
| NQL schema（规范文档） | ✅ `docs/features/nql.md` |
| Tuple ↔ NQL 映射 | ⚠️ 设计已定，执行器未落地 |
| 全文搜索 | ✅ `fullTextSearch()` |
| 反向链接查询 | ✅ `getBacklinks()` / `getInlineBacklinks()` |
| Cmd+K 快速搜索 | ✅ `CommandPalette` + `useNodeSearch` |
| `?` 触发创建搜索节点 | ❌ |
| 搜索配置 UI（标签选择 + 过滤器） | ❌ |
| 搜索结果展示 | ❌ |
| 过滤器构建器 | ❌ |
| 与视图系统集成 | ❌ |

## 数据模型

### SearchNode 结构

```
SearchNode (doc_type: 'search')
  ├── props.name: "Tasks"              ← 搜索名称
  ├── props._metaNodeId → Metanode     ← 搜索配置
  ├── props._ownerId: "{wsId}_SEARCHES" ← 默认归属 Searches 容器
  └── children: [nodeId1, nodeId2, ...] ← 预计算的搜索结果
```

### Metanode 配置

```
Metanode.children:
  ├── Tuple [SYS_A15, nqlRootTupleId]         ← 搜索表达式（目标形态）
  ├── Tuple [SYS_A16, viewDefId]              ← 结果视图配置（可选）
  └── Tuple [SYS_A14, tagDefId]              ← 新建子节点默认标签（可选）
```

兼容说明（过渡期）：

- 旧结构 `Tuple [SYS_A15, tagDefId]` 和 `Tuple [SYS_A15, tagDefId, filterTupleId]` 仍可读；
- 新结构以 `nqlRootTupleId` 为准，查询语义统一由 NQL AST 解释。

### 系统常量

| 常量 | 值 | 用途 |
|------|-----|------|
| `SYS_A.SEARCH_EXPRESSION` | `SYS_A15` | 搜索表达式 Tuple key |
| `SYS_A.VIEWS` | `SYS_A16` | 视图配置 Tuple key |
| `SYS_A.CHILD_SUPERTAG` | `SYS_A14` | 默认子标签 |

### 搜索结果存储

- 结果预计算后存入 `searchNode.children[]`
- Tana 实际数据：平均 52.2 个结果，最大 580 个
- 结果是节点 ID 引用，不是复制
- 展开搜索节点时触发重新计算

## 行为规格

### 创建搜索节点

1. 用户在编辑器中输入 `?` → 触发搜索创建流程
2. 创建搜索节点，打开 Query Builder 面板
3. 在 Query Builder 中配置搜索条件（见下文）
4. 点击 **"Done"**（保存为持久查询）或 **"Run once"**（一次性执行）

### 搜索节点在大纲中的展示

```
• test
🔍 search node test  [+] [⫞] [...]    ← 搜索节点行
│                     │    │    │
│                     │    │    └── 更多选项菜单
│                     │    └── 开启/关闭 Query Builder
│                     └── 在结果中新建节点（自动添加匹配的标签/属性）
  ┌─────────────────────────────────┐
  │ Query builder              [×]  │  ← 可折叠面板
  │ > fields, @ nodes/tags,         │
  │ plain text = keyword search     │
  │                                 │
  │  AND                            │  ← 逻辑组标签（表意图标，非按钮）
  │   ⊕ card                        │  ← 查询条件：标签/字段/文本
  │     • Empty                     │  ← 子条件占位符
  │                                 │
  │ [+AND] [+OR] [+NOT]             │  ← 逻辑组合按钮
  │ [Search operators▾]             │  ← 操作符下拉
  │ [System fields▾] [Field values▾]│  ← 过滤器快捷入口
  │ [Tag types▾] [Workspace▾]       │
  │                                 │
  │ (Tagged:card)    [▷Run once] [✓Done] │
  └─────────────────────────────────┘
  [🔍] [⊞] [📋] [⫼] [≡]              ← 视图工具栏（搜索/视图切换/过滤）
  ⊙ 结果节点 1  # card                 ← 搜索结果（引用 bullet）
  ⊙ 结果节点 2  # card
  ⊙ ...
```

### Query Builder（查询构建器）

**可折叠面板**，附着在搜索节点下方。关闭后不影响搜索结果展示。（截图确认）

**查询输入方式**（复用编辑器触发符）：
- `>` 插入字段条件
- `@` 插入节点/标签条件
- 纯文本 = 关键词搜索

**条件组合**：
- 底部工具栏提供 `+ AND`、`+ OR`、`+ NOT` 按钮，直接添加逻辑组
- 每个逻辑组内可包含多个条件
- 左侧显示当前逻辑组标签（如 "AND"）

**快捷下拉菜单**：
- `Search operators ▾` — 搜索操作符
- `System fields ▾` — 系统字段过滤
- `Field values ▾` — 字段值过滤
- `Tag types ▾` — 标签类型过滤
- `Workspace ▾` — 工作区范围

**状态栏**：底部显示解析后的查询表达式（如 `(Tagged:card)`）

**执行按钮**：
| 按钮 | 功能 |
|------|------|
| **Run once** | 一次性执行查询，显示结果，不保存为持久查询 |
| **Done** | 保存查询条件，关闭 Query Builder，结果持续更新 |

### 搜索表达式（兼容形态）

#### 简单标签搜索（旧结构，可读）

```
[SYS_A15, tagDefId]
```

搜索所有打了指定标签的节点。支持多态搜索：搜索父标签时自动包含所有子标签的实例。

#### 带过滤条件的搜索（旧结构，可读）

```
[SYS_A15, tagDefId, filterTupleId]
```

在标签搜索基础上增加字段值过滤。

### NQL 规范化表达（推荐）

查询条件在运行时先标准化为 NQL AST，再编译到执行计划：

1. Query Builder / 自然语言输入
2. 规范化为 NQL（`version=1`）
3. NQL 编译器生成执行计划（SQL 下推 + 图遍历）
4. 执行并回写 `searchNode.children`

最小 NQL 示例：

```json
{
  "version": 1,
  "from": { "tagId": "tagDef_task", "includeSubtags": true },
  "where": {
    "and": [
      { "fieldId": "attrDef_status", "op": "eq", "value": { "type": "nodeRef", "nodeId": "opt_todo" } }
    ]
  },
  "limit": 100
}
```

### 搜索操作符

#### 基础操作符

| 操作符 | SYS_V | 说明 | 示例 |
|--------|-------|------|------|
| HAS_TAG | `SYS_V19` | 节点有指定标签 | 搜索所有 #task 节点 |
| HAS_ATTRIBUTE | `SYS_V14` | 节点有指定字段 | 搜索有 "Priority" 字段的节点 |
| DEFINED | `SYS_V30` | 字段有值 | Priority 已填写 |
| NOT_DEFINED | `SYS_V31` | 字段为空 | Priority 未填写 |

#### 层级操作符

| 操作符 | SYS_V | 说明 |
|--------|-------|------|
| CHILD_OF | `SYS_V53` | 是指定节点的子节点 |
| PARENTS_DESCENDANTS | `SYS_V15` | 指定节点的所有后代 |
| OWNED_BY | `SYS_V55` | 属于指定用户 |

#### 关键词过滤器

| 关键词 | 说明 |
|--------|------|
| `TODO` | 有 checkbox 且未完成 |
| `DONE` | 有 checkbox 且已完成 |
| `NOT DONE` | DONE 的取反 |
| `OVERDUE` | 日期字段值已过期 |
| `CREATED LAST X DAYS` | 创建日期在最近 X 天内 |

#### 逻辑组合

- **AND** — 多个条件同时满足（默认）
- **OR** — 任一条件满足
- **NOT** — 排除匹配的节点

### 搜索结果展示

#### 默认展示（Outline）

- 搜索节点在大纲中显示为 🔍 放大镜图标 + 搜索名称 + `[+]` `[⊞]` `[...]` 操作按钮
- 展开后显示匹配的节点列表
- 结果节点的 bullet 显示为**引用样式（同心圆 ⊙）**（截图确认）
- 每个结果节点显示其 TagBadge（如 `# card`）
- 点击结果节点 → navigateTo 原始节点

#### 视图工具栏

Query Builder 与搜索结果之间有一行**视图工具栏**（截图确认）：
- 视图切换图标（Outline / Table / Cards 等）
- 过滤器图标
- 与普通节点的视图工具栏一致，详见 `docs/features/views.md`

#### 结合视图展示

搜索节点可关联视图（通过 `SYS_A16` Tuple），以 Table、Cards 等形式展示结果。

#### 结果更新

- 搜索节点被展开/打开时触发重新计算
- 匹配节点增删改时，结果在下次展开时更新
- 显示加载指示器（spinner）表示正在计算

### 多态搜索

搜索父标签时，自动包含所有子标签（标签继承）的实例：

```
搜索 #source → 结果包含：
  - 所有 #source 节点
  - 所有 #article 节点（#source 的子标签）
  - 所有 #tweet 节点（#source 的子标签）
  - 所有 #video 节点（#source 的子标签）
```

已在 `search-service.ts` 的 `getTagTree()` 中实现。

### 工作区容器

- 搜索节点可放在工作区**任意位置**（截图确认：示例中直接在普通节点下方）
- `{wsId}_SEARCHES` 容器存放侧栏 "Searches" 入口的搜索列表
- 搜索节点名称旁 `[+]` 按钮 → 在结果中新建节点，自动添加匹配的标签/属性（如搜索 `#card` 的结果中点 `+` → 新建节点自动打 `#card` 标签）

## 设计原则

> **搜索条件的写模型是 Tuple 树，语言模型是 NQL AST，不是 DSL 字符串。**

搜索表达式在存储层使用 Tuple 嵌套结构，在执行层统一转换为 NQL。**不要**把搜索条件序列化为 DSL 字符串（如 `"#task AND status:TODO"`）。

**Tuple 树结构**（AND/OR/NOT 组合）：

```
SearchNode Metanode:
  └── Tuple [SYS_A15, nqlRootTupleId]
        └── nqlRootTuple（递归表达 where 树）
              ├── children[0]: 逻辑节点（AND/OR/NOT）
              ├── children[1]: conditionTuple₁ [fieldDefId, operator, value]
              ├── children[2]: conditionTuple₂ [fieldDefId, operator, value]
              └── children[3]: nestedLogicTuple（递归）
```

**Tuple/NQL vs DSL 字符串**：

| 维度 | Tuple + NQL | DSL 字符串 |
|------|----------|-----------|
| 编辑 | 展开子节点直接编辑 | 需要解析器 + 语法高亮 |
| 引用 | 条件可被其他搜索引用（复用过滤模板） | 不可能 |
| 模板化 | supertag 预定义搜索条件 | 需要额外的模板语言 |
| 可视化 | Query Builder 直接渲染结构树 | 需要 DSL → AST → UI 往返转换 |
| 持久化 | 与其他节点一起自然存储 | 需要专门的 serializer |

**实现指引**：Query Builder 的每个条件行对应一个 Tuple 节点，并同步映射到 NQL predicate。逻辑组合（AND/OR/NOT）= 修改父节点嵌套关系。条件增删改 = 标准树操作（addChild / removeChild / updateNode）。

详见 `docs/features/data-model.md` § 设计守则 3。

---

## 实现考量

### 已有服务层

`search-service.ts` 当前能力（2026-02）：

| 函数 | 功能 |
|------|------|
| `getSearchConfig(searchNodeId)` | 从 Metanode 提取搜索配置 |
| `executeSearch(searchNodeId)` | 执行查询入口（当前仅标签主链） |
| `executeSearchConfig(config)` | 标签树解析 + 匹配（过滤逻辑待补） |
| `getTagTree(tagDefId)` | 递归标签继承解析 |
| `fullTextSearch(wsId, query)` | PostgreSQL 全文搜索 |
| `getBacklinks(nodeId)` | 反向引用查询 |
| `compileNqlToPlan(nql)` | ❌ 计划中（v1） |

### 客户端 vs 服务端

- **当前阶段**（单用户 + 小数据量）：客户端内存搜索（`useNodeSearch` 模式）
- **未来扩展**（多用户 + 大数据量）：Supabase 服务端查询 + Realtime 订阅更新

### Query Builder UI 复杂度

Query Builder 是较复杂的 UI 组件（截图确认）：
- 可折叠面板，不是一次性弹窗
- 复用 `>` `@` 触发符输入条件（与编辑器一致）
- AND/OR/NOT 逻辑组按钮 + 嵌套条件
- 多个快捷下拉菜单（operators / system fields / field values / tag types / workspace）
- 状态栏实时显示解析后的查询表达式
- 两种执行模式（Run once / Done）
- 建议 Phase 2 先实现简单标签搜索 + 基础 Query Builder，Phase 3 完善高级过滤

## 实现范围

### Phase 2（本次）

| 功能 | 优先级 |
|------|--------|
| `?` 触发创建搜索节点 | 高 |
| Query Builder 基础面板（可折叠，@ 输入标签条件） | 高 |
| 简单标签搜索（选择标签 → 显示结果） | 高 |
| NQL schema 校验（前端/服务层共享） | 高 |
| Tuple → NQL 规范化转换（基础版） | 高 |
| 搜索结果 Outline 展示（引用 bullet + TagBadge） | 高 |
| AND/OR/NOT 逻辑组合按钮 | 中 |
| Run once / Done 两种执行模式 | 中 |
| 基础字段值过滤（> 输入字段条件） | 中 |
| 关键词过滤器（TODO / DONE） | 中 |
| 视图工具栏 + 搜索结果配合视图展示 | 中（依赖视图系统） |

### 延后

| 功能 | 原因 |
|------|------|
| 完整 Query Builder（全部下拉菜单 + 高级操作符） | 需要先稳定基础搜索 |
| NQL Planner（SQL 下推 + 图遍历）完整优化 | 需先落 Query Facts 投影层 |
| 实时结果更新（Realtime） | 依赖 Supabase 实时同步 |
| 搜索节点转静态列表 | 低优先 |

## 与 Tana 的已知差异

| 差异 | Tana | Nodex 决策 |
|------|------|-----------|
| 结果存储 | 预计算存入 children[] | 同样预计算，但考虑展开时按需计算 |
| 结果上限 | 实测最大 580 | 暂不限制，后续按性能需要添加分页 |
| 搜索触发 | 不确定是否是 `?` | 采用 `?` 作为触发符，与 #（标签）@ （引用）>（字段）对称 |
| Query Builder | 可折叠面板，内嵌在搜索节点下方 | 跟随 Tana 设计 |
| Run once vs Done | 支持一次性执行和持久查询两种模式 | 跟随 Tana 设计 |

## 决策记录

| 日期 | 决策 | 原因 |
|------|------|------|
| 2026-02-14 | `?` 作为搜索节点触发符 | 与 Tana 一致；与 #/@/> 形成统一的触发符体系 |
| 2026-02-14 | 结果预计算存入 children[] | 与 Tana 数据模型一致；避免每次展开都全量查询 |
| 2026-02-14 | Phase 2 先做简单标签搜索 | 覆盖 80% 使用场景，逻辑组合延后 |
| 2026-02-14 | 复用 search-service.ts 作为 v0 基线 | 已有标签查询路径可复用，但过滤执行仍需补齐 |
| 2026-02-16 | 搜索条件 = Tuple 树，不是 DSL 字符串 | "一切皆节点"守则；Tuple 可编辑/引用/模板化，DSL 不行 |
| 2026-02-18 | NQL AST 作为查询语言规范层 | 统一 Query Builder 与自然语言入口，SQL 退到执行层 |
