# Search Node 设计文档

> 基于 2026-02-26 深度讨论的完整设计决策记录。
> 覆盖数据模型、刷新策略、交互方式、操作符体系、数据结构影响分析。
>
> **定位**：本文档是 Search Node 功能的唯一设计来源。执行 agent 应完全基于此文档实施，不依赖其他上下文。
> **前置文档**：`docs/_archive/features/search.md`（旧 spec）、`docs/_archive/plans/search-nodes-impl.md`（旧实施计划）。本文档取代两者中的设计决策，但旧文档中的代码位置参考仍有效。

---

## 一、核心定义

**Search Node = 规则驱动的动态集合。**

一个 children 由规则自动填充的节点。与普通节点的唯一区别：children 的来源是规则匹配，而不是用户手动添加。

```
SearchNode (type: 'search', name: "未完成的 task")
  ├── queryCondition nodes ...   ← 查询规则（持久化）
  ├── reference → node_A         ← 物化结果（持久化，可排序）
  ├── reference → node_B
  └── reference → node_C
```

搜索结果是**真实的 reference 节点**，和手动 `@` 创建的 reference 行为完全一致：
- 展开可看到原始节点的 children
- 编辑、改 tag、设 field、改 description 等操作穿透到原始节点
- 原始节点的反向链接（backlinks）中能看到该 search node
- 用户可以手动拖拽排序

### 1.1 为什么选物化引用（而非动态计算）

最初计划是动态计算结果（不存储 reference 节点）。以下两个需求推翻了该方案：

1. **手动排序**：用户需要拖拽排序搜索结果。动态计算每次重新生成列表，无法持久化用户的排列顺序。物化引用的 children 顺序天然就是排序。
2. **反向链接可见性**：用户打开结果节点的 NodePanel 时，References section 应显示该 search node。动态计算的虚拟结果不会被反向链接系统扫描到。物化 reference 节点天然出现在 backlinks 中。

### 1.2 search node 的存放与命名

- **存放位置**：创建后自动放入 `SEARCHES` 系统容器（固定容器 ID `SYSTEM_NODE_IDS.SEARCHES`，已在 `system-node-registry.ts` 注册）
- **name 命名**：L0（点击标签）自动命名为标签名（如 "task"）；L2（AI）自动生成描述性名称；用户可随时编辑 name

---

## 二、数据模型

### 2.1 新增 NodeType

```typescript
export type NodeType =
  | 'fieldEntry' | 'reference' | 'tagDef' | 'fieldDef'
  | 'viewDef' | 'search'
  | 'queryCondition';  // ← 新增
```

### 2.2 queryCondition 节点属性

采纳「子节点树」模式（而非扁平属性模式），与 fieldEntry 存储方式统一：

```typescript
/** 查询条件节点的逻辑类型（仅 group 节点） */
queryLogic?: 'AND' | 'OR' | 'NOT';

/** 查询条件节点的操作符（仅 leaf 节点） */
queryOp?: QueryOp;

/** HAS_TAG 条件的目标标签 ID */
queryTagDefId?: string;

/** 字段条件指向的 fieldDef 节点 ID */
queryFieldDefId?: string;

/** 条件的值 = 子节点（不是属性） */
// children: [valueNode1, valueNode2, ...]
// 多子节点 = OR 语义（如 FIELD_IS: Status = "To Do" OR "In Progress"）
```

**互斥约束**：`queryLogic` 和 `queryOp` 互斥。group 节点设置 `queryLogic` 且不应设置 `queryOp`；leaf 节点设置 `queryOp` 且不应设置 `queryLogic`。该约束由搜索引擎和创建 API 校验。

**根条件约定**：每个 search node 至少有 1 个根 queryCondition，且根节点必须是 `queryLogic='AND'` 的 group。即使只有一个条件（如 L0 单标签），也包裹在 AND group 下，保证结构一致。

**设计原则**：字段条件的值不存为属性，而是作为子节点挂在条件节点下面——与 fieldEntry 的 children 存值模式统一，符合「一切皆节点」。

**为什么采纳子节点树模式（而非扁平属性）**：

之前的方案（旧 Phase 2）在 queryCondition 节点上用 `queryField: string` + `queryValue: string` 两个属性存储字段条件。这有三个问题：
1. **无法表达多值条件** — "Status = To Do OR In Progress" 需要数组或 JSON，违反「一切皆节点」
2. **与 fieldEntry 不一致** — 普通节点的字段值用 children 存储，查询条件的值却用属性，两套模式
3. **值不能是引用** — 属性只能存字符串，不能引用选项节点

子节点树模式解决了全部三个问题：多子节点 = OR；值是子节点 = 与 fieldEntry 同构；子节点的 `targetId` 可以引用选项节点。

### 2.2.1 数值参数的存储

对于需要数字参数的操作符（如 `DONE_LAST_DAYS(7)`、`CREATED_LAST_DAYS(30)`、`LT(100)`），参数也存为子节点：

```
condition (queryOp: 'DONE_LAST_DAYS')
  └── child: node (name: "7")    ← 子节点的 name 存储参数值
```

搜索引擎读取第一个子节点的 `name`，`parseInt()` 得到数值。这与 `FIELD_CONTAINS` 的处理方式一致（第一个子节点的 name 作为搜索词）。

### 2.2.2 search node 自身的额外属性

```typescript
/** search node 上次执行完整 diff 的时间戳 */
lastRefreshedAt?: number;  // ms timestamp，存在 search node 上（不是 queryCondition 上）
```

此字段用于计数提示：Loro commit 后比较当前匹配数与 reference 数，如不一致则显示「N 条新结果」。

### 2.3 QueryOp 完整类型定义

上线前一次性定义完整，未实现的搜索引擎抛 "not supported"。上线后只加不改。

```typescript
export type QueryOp =
  // Phase 1: Tag + Checkbox
  | 'HAS_TAG'
  | 'TODO'               // 有 checkbox（无论勾选与否）
  | 'DONE'               // completedAt != null
  | 'NOT_DONE'           // showCheckbox && !completedAt

  // Phase 2: Field conditions
  | 'FIELD_IS'           // 字段值匹配任一条件值（多子节点 = OR）
  | 'FIELD_IS_NOT'       // 字段值不匹配所有条件值
  | 'IS_EMPTY'           // 字段无值（= Not Set）
  | 'IS_NOT_EMPTY'       // 字段有值（= Set）
  | 'FIELD_CONTAINS'     // 文本子串匹配（第一个子节点 name 为搜索词）
  | 'LT'                 // 小于（数字/日期）
  | 'GT'                 // 大于（数字/日期）

  // Phase 2: Time conditions
  | 'CREATED_LAST_DAYS'  // createdAt 在 N 天内
  | 'EDITED_LAST_DAYS'   // updatedAt 在 N 天内
  | 'DONE_LAST_DAYS'     // completedAt 在 N 天内

  // Phase 2: Content & Relationship
  | 'HAS_FIELD'          // 含有任意字段
  | 'LINKS_TO'           // 有 inline ref 或 tree ref 指向目标节点
  | 'STRING_MATCH'       // 节点名称文本匹配
  | 'REGEXP_MATCH'       // 节点名称正则匹配

  // Phase 3: Relationships & Type
  | 'CHILD_OF'           // 指定节点的直接子节点
  | 'IS_TYPE'            // 节点类型检查（tagDef, fieldDef, search 等）
  | 'FOR_DATE'           // 含有指向特定日期节点的引用
  | 'FOR_RELATIVE_DATE'  // 含有相对日期引用（today, yesterday, next week 等）

  // Phase 3: Scope
  | 'PARENTS_DESCENDANTS'     // 搜索节点父节点的所有后代
  | 'IN_LIBRARY'              // Library 容器的直接子节点
  | 'ON_DAY_NODE'             // 日历日节点的直接子节点

  // Future（依赖未实现的功能）
  | 'EDITED_BY'          // 依赖 Sync Phase 2 Loro PeerID → userId 映射
  | 'OWNED_BY'           // 依赖 ownerId 概念恢复（当前已消除）
  | 'OVERDUE'            // !completedAt && dueDate < today
  | 'HAS_MEDIA';         // 依赖媒体功能
```

### 2.4 条件树示例

**最简：单标签搜索（L0 创建）**
```
SearchNode (type: 'search')
  └── AND group (queryLogic: 'AND')        ← 根必须是 AND group（即使只有一个条件）
        └── condition (queryOp: 'HAS_TAG', queryTagDefId: tagDef_task)
```

**简单：所有未完成的 #task**
```
SearchNode (type: 'search')
  └── AND group (queryLogic: 'AND')
        ├── condition (queryOp: 'HAS_TAG', queryTagDefId: tagDef_task)
        └── condition (queryOp: 'NOT_DONE')
```

**复杂：优先级为 P2 或 P3 的未完成 task，排除分配给某人的**
```
SearchNode (type: 'search')
  └── AND group (queryLogic: 'AND')
        ├── condition (queryOp: 'HAS_TAG', queryTagDefId: tagDef_task)
        ├── condition (queryOp: 'NOT_DONE')
        ├── OR group (queryLogic: 'OR')
        │     ├── condition (queryOp: 'FIELD_IS', queryFieldDefId: priorityFieldDef)
        │     │     ├── child → "P2" option node
        │     │     └── child → "P3" option node
        │     (注：FIELD_IS 天然支持多值 OR，也可以不用 OR group)
        └── NOT group (queryLogic: 'NOT')
              └── condition (queryOp: 'FIELD_IS', queryFieldDefId: assigneeFieldDef)
                    └── child → "Fei" person node
```

### 2.5 与 Tana 的关键差异

| 方面 | Tana | soma |
|------|------|-------|
| 查询配置存储 | Metanode → 旧配置子树（SYS_A15） | children 子节点树（queryCondition 节点） |
| 结果存储 | 预计算，混在 children 里 | 物化 reference 节点，与 queryCondition 分开 |
| children 语义 | 混用（配置 + 结果） | 清晰分离（queryCondition + reference） |
| 操作符编码 | SYS_V* 不可读 ID | 可读字符串联合类型 |
| 条件值存储 | 旧配置节点属性 | 子节点（与 fieldEntry 统一） |

---

## 三、刷新策略

### 3.1 三种触发方式

| 触发 | 时机 | 行为 |
|------|------|------|
| **自动 diff** | 用户打开/展开 search node | 静默执行完整 diff |
| **计数提示** | search node 在视口内，Loro commit 后 | 轻量计数查询，不匹配时显示提示条 |
| **手动刷新** | 用户点击「N 条新结果 · 刷新」 | 执行完整 diff |

### 3.2 Diff 算法

```
1. 运行查询 → matchedIds: Set<string>
2. 排除自身：matchedIds.delete(searchNodeId)  ← 防止自引用循环
3. 读取现有 reference children → existingRefs: Map<targetId, refNodeId>
4. 新增：matchedIds - existingRefs.keys()
   → 创建 reference 节点，追加到 children 末尾
5. 失效：existingRefs.keys() - matchedIds
   → 移除 reference 节点
6. 仍匹配：保持原有位置（保护手动排序）
```

**自引用排除**：search node 的查询结果始终排除自身。例如 `IS_TYPE(search)` 会匹配所有 search node，但不包括执行该查询的 search node 本身。

### 3.3 计数提示实现

- search node 记录 `lastRefreshedAt` 时间戳
- 在视口内时，每次 Loro commit 后运行纯计数查询（遍历 entities，不创建节点）
- 匹配数 ≠ 当前 reference 数 → 顶部显示 `「N 条新结果 · 刷新」`
- 用户点击 → 执行完整 diff
- **已知局限**：count-only 对比在"数量相同但成员不同"（一进一出）时不会提示。用户再次打开/展开 search node 时完整 diff 会纠正。后续可升级为摘要哈希降低漏报。

### 3.4 搜索候选集与排除规则

搜索引擎遍历所有节点时，仅将**可作为结果展示的内容节点**纳入匹配候选。这是搜索语义的一部分，不能只靠 UI 过滤兜底。

**必须排除**：
- 执行中的 search node 自身（防止自引用循环，3.2 步骤 2）
- `queryCondition` 节点（内部结构节点）
- `fieldEntry` 节点（字段值载体，不是独立内容）

**建议排除**：
- `reference` 节点（避免"搜索结果引用到引用节点"）
- `tagDef` / `fieldDef` 节点（schema 定义节点，非用户内容）
- `viewDef` 节点（视图配置节点）

**不排除**：
- 普通内容节点（`type === undefined`）
- `search` 节点（search node 可以搜索其他 search node）

实现方式：搜索引擎入口处统一过滤，类似 `use-node-search.ts` 的 `SKIP_DOC_TYPES`。

---

## 四、创建入口（三层渐进）

数据模型统一为 queryCondition 子节点树，三种入口只是创建方式不同。

**为什么不做 Tana 式 Query Builder 作为主入口**：

Tana 用一个完整的 Query Builder 面板（AND/OR/NOT 条件树编辑器 + 5 个下拉菜单）覆盖所有搜索场景。这对 power user 很强大，但对 80% 的「我就想看所有 #task」场景来说步骤太多（7 步）。

soma 的选择：按使用频率分层，最常见的操作最简单，复杂查询交给 AI。三层共享同一个 queryCondition 数据模型，只是创建入口不同。Query Builder 式的条件树编辑不作为 Phase 1-2 的目标。

### L0：点击标签（零步骤，最高频）

```
用户点击任意 TagBadge
  → 自动创建 SearchNode，name = tagDef.name
  → children: [ queryCondition(HAS_TAG, tagDefId) ]
  → 导航到 search node
  → 自动执行首次 diff，结果填充
```

覆盖场景：「看所有 #task」「看所有 #project」— 约 60% 的搜索需求。

### L1：字段过滤（手动选择，常用）

```
用户在 search node 上点击「+ 条件」
  → 选择字段（如 author）+ 选择值（如 "张三"）
  → 追加 queryCondition(FIELD_IS, authorFieldDefId)
  →   └── child: reference → "张三" node
  → 刷新结果
```

覆盖场景：组合过滤 — 约 20% 的搜索需求。

### L2：AI 自然语言（一句话描述，万能）

```
用户输入: "最近一周创建的未完成 task"
  → AI 通过 tool use 调用 createSearchFromAI()
  → 函数内部做 name → ID 解析 + 创建 queryCondition 节点树
  → 展示为可编辑的条件芯片，用户确认
  → 刷新结果
```

覆盖场景：复杂条件、自然语言 — 约 20% 的搜索需求。

**AI 角色**：通过 function calling 直接创建节点树，不是运行时依赖。调用完退出，后续执行纯本地。

**无中间语言**：不设计独立的「结构化搜索语言」。AI 的输出就是 tool call 的参数，参数 schema 就是接口契约：

```typescript
// AI tool definition — 参数 schema 即为 AI 与搜索系统的唯一接口
function createSearchFromAI(params: {
  name: string;
  conditions: SearchConditionParam[];
}): void {
  // 内部做 name → ID 解析（"task" → tagDefId）+ 创建 queryCondition 节点树
}

type SearchConditionParam =
  // Tag + Checkbox
  | { op: 'HAS_TAG'; tag: string }               // tag = tagDef 名称，函数内解析为 ID
  | { op: 'TODO' | 'DONE' | 'NOT_DONE' }
  // Time
  | { op: 'CREATED_LAST_DAYS' | 'EDITED_LAST_DAYS' | 'DONE_LAST_DAYS'; days: number }
  // Field conditions
  | { op: 'FIELD_IS' | 'FIELD_IS_NOT'; field: string; values: string[] }
  | { op: 'IS_EMPTY' | 'IS_NOT_EMPTY'; field: string }
  | { op: 'FIELD_CONTAINS'; field: string; text: string }
  | { op: 'LT' | 'GT'; field: string; value: string }
  // Content & Relationship
  | { op: 'LINKS_TO' | 'CHILD_OF'; node: string }
  | { op: 'STRING_MATCH'; text: string }
  | { op: 'REGEXP_MATCH'; pattern: string }
  | { op: 'IS_TYPE'; type: string }
  | { op: 'FOR_DATE'; date: string }
  | { op: 'FOR_RELATIVE_DATE'; term: string }
  // Logic groups
  | { logic: 'AND' | 'OR'; conditions: SearchConditionParam[] }
  | { logic: 'NOT'; condition: SearchConditionParam };
```

**三个入口的数据流**：

```
L0 点击标签  → 直接创建节点树（零序列化）
L1 字段过滤  → 直接创建节点树（零序列化）
L2 AI        → tool call 参数 → name→ID 解析 → 节点树
```

**离线降级**：L0 和 L1 完全离线可用，L2 需要网络。

---

## 五、UI 交互设计

### 5.1 搜索结果展示

```
📍 未完成的 task              [3 条新结果 · 刷新]
  🔗 → node_A  #task          ← 可展开、编辑、拖拽排序
  🔗 → node_B  #task  ✅
  🔗 → node_C  #task
```

- 结果行 = OutlinerItem 的 reference 渲染模式（`isSearchResult: true`）
- BulletChevron 显示放大镜图标（区别于普通节点的圆点）
- 所有操作穿透到原始节点

### 5.2 条件展示（芯片条）

```
[#task ×] [未完成 ×] [7 天内创建 ×]  [+ 条件] [✨ AI]
```

- 每个 queryCondition 渲染为一个可移除的芯片
- 点击芯片可编辑（弹 popover）
- `+ 条件` → 手动添加（L1 入口）
- `✨ AI` → 自然语言输入（L2 入口）

芯片文本从节点树**单向生成**（不需要反向解析）：

| queryOp | 芯片显示文本 |
|---------|------------|
| `HAS_TAG(task)` | `#task` |
| `NOT_DONE` | `未完成` |
| `DONE` | `已完成` |
| `TODO` | `有 checkbox` |
| `CREATED_LAST_DAYS(7)` | `7 天内创建` |
| `EDITED_LAST_DAYS(30)` | `30 天内编辑` |
| `FIELD_IS(priority, [P1, P2])` | `priority: P1, P2` |
| `IS_EMPTY(status)` | `status: 空` |
| `STRING_MATCH("hello")` | `名称含 "hello"` |
| `NOT(DONE)` | `排除: 已完成` |

### 5.3 反向链接中的 search node

用户打开 node_A 的 NodePanel 时，References section 显示：

```
Mentioned in
  📍 未完成的 task     ← 因为 search node 的 reference 子节点指向 node_A
```

这是物化引用的自然结果，不需要额外逻辑。

### 5.4 children 排列规则

search node 的 children 分为两类，按固定顺序排列：

```
SearchNode.children = [queryCondition..., reference...]
                       ↑ 规则区（不渲染）    ↑ 结果区（渲染）
```

- **queryCondition 节点**排在 children 最前面，由芯片条渲染，OutlinerView 按 `type === 'queryCondition'` 过滤掉（不在大纲中显示）
- **reference 节点**跟在后面，正常渲染为大纲行
- 这与 fieldEntry 的处理方式一致：OutlinerView 已有按 type 分类 children 的逻辑

### 5.5 TrailingInput 行为（预设模板创建）

search node 底部**保留 TrailingInput**，但语义升级为「创建符合筛选条件的节点」：

```
📍 未完成的 task
  🔗 → node_A  #task
  🔗 → node_B  #task
  [输入新节点...]           ← TrailingInput：创建 + 自动打标签 + 引用回来
```

用户在 search node 的 TrailingInput 中输入时：

1. **创建实体节点**到 Library（节点的真实归属位置）
2. **自动应用搜索条件**：如 search node 筛选 `#task`，新节点自动打上 `#task` tag；如筛选 `FIELD_IS(status, "To Do")`，自动设置该字段值
3. **创建 reference** 到 search node 的 children 末尾

这相当于 search node 的筛选条件充当了**创建模板** — 用户在任何 search node 里创建的节点天然满足该搜索条件。

**仅自动应用的条件类型**：`HAS_TAG`、`FIELD_IS`（可自动设值的）。时间条件（`CREATED_LAST_DAYS`）、关系条件（`CHILD_OF`）等无法自动应用，忽略。

### 5.6 L0 点击标签的交互细节

**tag name click = 创建/导航 search node**（替代当前的 tagDef 配置页导航）：

- 点击 TagBadge 上的标签名 → 创建或导航到该标签的 search node
- 「配置标签」移到 TagBadge 的 context menu（右键）
- 使用现有的 `onSearch` 回调路径（TagContextMenu 已有 "Everything tagged #tagName" 占位）

### 5.7 queryCondition 节点的操作权限

queryCondition 节点在 `node-capabilities.ts` 中需限制：

- 不可在 outliner 中直接编辑 name
- 不可拖拽移动
- 不可被用户手动删除（通过芯片条的 `×` 按钮删除）
- 不在 CommandPalette 搜索结果中出现

### 5.8 Undo 与刷新

`refreshSearchResults` 的 reference 创建/删除属于**系统行为**，不进入 undo 栈：

- 使用 `'system:refresh'` 作为 commit origin
- 现有 `UNDO_EXCLUDED_ORIGIN_PREFIXES` 已支持 `'system:'` 前缀排除
- 用户 Cmd+Z 不会撤销一次 refresh 的 100+ reference 变更

---

## 六、Tana 全量操作符覆盖分析

### 现有数据结构即可支持（无需改动）

| 类别 | 操作符 | 依赖的现有字段 |
|------|--------|---------------|
| Tag | `HAS_TAG` | `tags` (LoroList) |
| Checkbox | `TODO` / `DONE` / `NOT_DONE` | `showCheckbox` + `completedAt` |
| Checkbox | `DONE_LAST_DAYS` | `completedAt` (ms timestamp) |
| Time | `CREATED_LAST_DAYS` | `createdAt` |
| Time | `EDITED_LAST_DAYS` | `updatedAt` |
| Time | `FOR_DATE` / `FOR_RELATIVE_DATE` | content `inlineRefs` 中的日期节点引用 |
| Field | `FIELD_IS` / `FIELD_IS_NOT` | fieldEntry children 遍历 |
| Field | `IS_EMPTY` / `IS_NOT_EMPTY` | 字段值存在性检查 |
| Field | `FIELD_CONTAINS` / `LT` / `GT` | 字段值比较 |
| Content | `HAS_FIELD` | children 中 `type === 'fieldEntry'` |
| Content | `LINKS_TO` | content `inlineRefs` + children reference |
| Content | `STRING_MATCH` / `REGEXP_MATCH` | `name` 文本匹配 |
| Type | `IS_TYPE` | `type` 字段 |
| Scope | `PARENTS_DESCENDANTS` / `IN_LIBRARY` / `ON_DAY_NODE` | Loro tree 遍历 + `searchContext` |
| Relation | `CHILD_OF` | Loro tree parent 查找 |
| Value | `Set` / `Not Set` / `Defined` / `Not Defined` | 字段值 + tagDef 模板检查 |
| Value | `PARENT` / `GRANDPARENT` / 点表示法 / 日期运算 | 树遍历 + 字段访问 + 日期数学 |
| Checkbox | `OVERDUE` | `completedAt` + due date 字段 |

### 存在缺口（2 项）

| 操作符 | 缺少的字段 | 影响 | 建议 |
|--------|-----------|------|------|
| `EDITED_BY` (2 个变体) | `updatedBy` | 中 | 依赖 Sync Phase 2 的 Loro PeerID → userId 映射，不需要在 NodexNode 加字段，从 Loro 版本历史推导 |
| `OWNED_BY` | `_ownerId` | 低 | Loro 迁移时已消除，单工作区场景弱需求，如需要可加回 `ownerId?: string` |

### 依赖未实现功能（延后）

| 操作符 | 依赖功能 |
|--------|---------|
| `HAS_MEDIA` / `HAS_AUDIO` / `HAS_VIDEO` / `HAS_IMAGE` | 媒体上传功能 |
| `IS_COMMAND` / `IS_PUBLISHED` / `IS_CHAT` | Command / Publishing / AI Chat |
| `DATE_OVERLAPS` | 日期范围字段 |

---

## 七、实现分 Phase

### Phase 1：最小可用（单标签搜索 + checkbox）

- 数据模型：`queryCondition` NodeType + `QueryOp` 完整类型定义 + Loro 读写
- 搜索引擎：`HAS_TAG` + `TODO` + `DONE` + `NOT_DONE`
- 创建入口：L0（点击标签）+ `?` 触发器
- 渲染：BulletChevron 放大镜 + 结果物化为 reference + 手动排序
- 刷新：打开时自动 diff

### Phase 2：字段过滤 + 时间条件 + AI 入口

- 搜索引擎：`FIELD_IS` / `FIELD_IS_NOT` / `IS_EMPTY` / `IS_NOT_EMPTY` / `FIELD_CONTAINS` / `LT` / `GT` / `CREATED_LAST_DAYS` / `EDITED_LAST_DAYS` / `DONE_LAST_DAYS` / `HAS_FIELD` / `LINKS_TO` / `STRING_MATCH` / `REGEXP_MATCH`
- 创建入口：L1（字段过滤 UI）+ L2（AI 自然语言）
- UI：条件芯片条 + 新结果计数提示 + 手动刷新

### Phase 3：关系 + 作用域 + 高级功能

- 搜索引擎：`CHILD_OF` / `IS_TYPE` / `FOR_DATE` / `FOR_RELATIVE_DATE` / `PARENTS_DESCENDANTS` / `IN_LIBRARY` / `ON_DAY_NODE`
- UI：作用域选择器
- 视图集成：搜索结果配合 Table / Cards / Calendar 视图

---

## 八、与其他功能的关系

### 8.1 Search Query vs View Toolbar（正交关系）

Search Node 的 queryCondition 和 View Toolbar 的 Filter/Sort/Group 是**两个独立系统**，解决不同问题：

| | Search Query（查询） | View Toolbar（视图） |
|---|---|---|
| **回答的问题** | 哪些节点是这个集合的成员？ | 成员如何展示？ |
| **适用范围** | 仅 search node | **所有节点**（content、search、container） |
| **数据存储** | queryCondition 子节点树 | ViewDef 节点树（SYS_A16/18/19/20） |
| **影响** | 增删 children（物化 reference） | 不改变 children，只改变显示顺序/可见性 |
| **UI 入口** | 条件芯片条（Section 5.2） | View Toolbar（右键菜单 → "Show view toolbar"） |

**对于 Search Node**：两者叠加使用。queryCondition 定义成员集合，View Toolbar 进一步控制展示（如"搜索结果按 priority 排序，隐藏已完成的"）。

**对于普通节点**：只有 View Toolbar。children 是手动添加的，View Toolbar 控制排列和过滤。

### 8.2 功能关系表

| 功能 | 与 Search Node 的关系 |
|------|----------------------|
| **标签页** | = 内置 HAS_TAG 条件的 search node。点击标签就创建 |
| **View Toolbar (#25)** | 正交系统。Search Node 的查询决定成员，View Toolbar 决定展示。Search Node 和普通节点共享同一套 View Toolbar |
| **Table View (#24)** | 搜索结果可以表格视图展示（viewMode = 'table'） |
| **Views 系统** | search node 的 viewDef 配置决定结果展示方式（与普通节点的 viewDef 机制相同） |
| **References / Backlinks** | 物化引用天然出现在反向链接中 |
| **Undo/Redo** | 用户手动 reference 操作进入 undo 栈；search refresh 产生的系统 reference 变更不进入 undo（`system:refresh` origin，见 5.8） |

---

## 九、现有代码基础

执行 agent 不需要从零开始，以下内容已经存在于代码库中：

| 已有内容 | 位置 | 状态 |
|---------|------|------|
| `'search'` 在 NodeType 中 | `src/types/node.ts` | 已定义 |
| `searchContext?: string` 属性 | `src/types/node.ts` → NodexNode | 已定义，Loro 已读写 |
| `SYS_A.SEARCH_EXPRESSION` (`SYS_A15`) | `src/types/system-nodes.ts` | 已定义 |
| `SYS_A.VIEWS` (`SYS_A16`)、`SYS_A.TAG_SEARCH_NODE` (`SYS_A146`) 等 | `src/types/system-nodes.ts` | 已定义 |
| `SYS_V.HAS_TAG` (`SYS_V19`)、`SYS_V.CHILD_OF` (`SYS_V53`) 等操作符常量 | `src/types/system-nodes.ts` | 已定义（Tana 兼容，soma 使用可读字符串替代） |
| `SEARCHES` 系统容器 | `src/types/node.ts` → `SYSTEM_NODE_IDS.SEARCHES` | 固定容器 ID，已定义 |
| SEARCHES 容器在侧栏/命令面板显示 | `src/lib/system-node-registry.ts` | 已注册 |
| `search_node` slash command | `src/lib/slash-commands.ts` | 已注册但 `enabled: false` |
| `useNodeSearch` hook（名称模糊搜索） | `src/hooks/use-node-search.ts` | 已实现（用于 CommandPalette/ReferenceSelector，非 Search Node 查询引擎） |
| `isOutlinerContentNodeType` 类型过滤 | `src/lib/node-type-utils.ts` | 当前仅允许 `undefined` 和 `'reference'`，需扩展以支持 `'search'` |

**需要新建的文件**：
- `src/lib/search-engine.ts` — 核心查询引擎
- `src/hooks/use-search-results.ts` — 搜索结果 React hook
- `tests/vitest/search-engine.test.ts` — 搜索引擎测试

**需要修改的文件**：
- `src/types/node.ts` — 添加 `'queryCondition'` NodeType + query 属性 + `QueryOp` 类型 + `lastRefreshedAt`
- `src/lib/loro-doc.ts` — queryCondition 字段读写（通过 `toNodexNode` 映射 + `setNodeData(Batch)` 路径）
- `src/lib/node-type-utils.ts` — `isOutlinerContentNodeType` 扩展，使 `'search'` 节点在 Outliner 中可渲染
- `src/lib/node-capabilities.ts` — queryCondition 节点的操作权限限制（不可编辑/拖拽/删除）
- `src/stores/node-store.ts` — `createSearchNode()` + `refreshSearchResults()` actions（refresh 使用 `'system:refresh'` commit origin）
- `src/components/outliner/BulletChevron.tsx` — 放大镜 bullet 图标
- `src/components/outliner/OutlinerItem.tsx` — `isSearchResult` 渲染模式
- `src/components/outliner/OutlinerView.tsx` — search node 的 children 渲染分支（过滤 queryCondition、TrailingInput 预设模板创建）
- `src/components/tags/TagBadge.tsx` — tag name click → 创建/导航 search node（L0 入口，替代当前 onNavigate）
- `src/hooks/use-node-search.ts` — 将 `queryCondition` 加入 `SKIP_DOC_TYPES`
- `src/entrypoints/test/seed-data.ts` — 添加 search node 种子数据

---

## 十、开放问题

> 以下问题在实现时再决定，不阻塞 Phase 1。

1. **search node 的 searchContext**：当 search node 被移动到不同位置时，作用域条件（PARENTS_DESCENDANTS）是否跟随变化？
2. **AI 生成的 prompt 设计**：给 AI 的 system prompt 需要包含完整的 QueryOp 定义 + 用户工作区中的 tagDef/fieldDef 列表，使 AI 能生成合法的 queryCondition 节点树
3. **大量结果的性能**：Tana 单个 search node 最多 580 个结果。如果结果过多（>100），是否分页或限制物化 reference 数量？
4. **结果节点被删除时**：reference 的 targetId 指向的节点被 trash 时，reference 自动移除还是标记为失效？

已决策（已写入正文）：
- ~~children 排列~~ → 5.4 节
- ~~TrailingInput~~ → 5.5 节
- ~~L0 点击目标~~ → 5.6 节
- ~~queryCondition 操作权限~~ → 5.7 节
- ~~Undo 与刷新~~ → 5.8 节
- ~~重复 search node 防护~~ → L0 优先导航到已有同标签 search node（见下方 Step 2）
- ~~批量提交~~ → refresh 批量增删 + 单次 `commitDoc('system:refresh')`（见 5.8 节）
- ~~候选集排除~~ → 3.4 节
- ~~根条件约定~~ → 2.2 节
- ~~容器命名~~ → 1.2 节（固定 `SYSTEM_NODE_IDS.SEARCHES`）

---

## 十一、实施计划与执行建议

### 11.1 总体思路

Search Node 不需要一次性全部实现。按以下分步策略，既保证上线前数据模型完备，又避免在核心功能（Sync Production）之外投入过多时间。

### 11.2 分步执行

#### Step 0：数据模型锁定（上线前，~100 行代码）

**时机**：Sync Production 上线之前完成。一旦数据落盘，schema 变更代价极高。

**改动范围**：

| 文件 | 改动 |
|------|------|
| `src/types/node.ts` | 添加 `'queryCondition'` 到 `NodeType`；添加 `queryLogic`, `queryOp`, `queryTagDefId`, `queryFieldDefId`, `lastRefreshedAt` 属性；导出 `QueryOp` 类型定义 |
| `src/lib/loro-doc.ts` | queryCondition 节点的 Loro 读写支持（`queryLogic`, `queryOp`, `queryTagDefId`, `queryFieldDefId` 字段的 serialize/deserialize） |
| `tests/vitest/` | 对应的类型和序列化测试 |

**交付标准**：`typecheck` + `vitest` + `build` 全绿。无 UI 改动，不影响现有功能。

**执行方式**：nodex 自行完成（改动小且是高风险文件）。

---

#### Step 1-3：L0 标签页 + checkbox 过滤 + 刷新排序（上线后，一个 PR）

**指派 Agent**：nodex-codex（或可用的 Dev Agent）

**时机**：Sync Production 上线后的第一个迭代。

**PR 包含内容**：

**前置兼容（Step 1 之前）**：
- `node-type-utils.ts`：扩展 `isOutlinerContentNodeType`，使 `'search'` 节点在 Outliner 中可渲染（否则 search node 创建成功也不会在 SEARCHES 容器中显示）
- 确认 NodePanel 导航链路可正常打开 `type='search'` 的节点

**Step 1：搜索引擎核心**
- 创建 `src/lib/search-engine.ts`
  - `evaluateCondition(node, condition)` — 递归求值条件树
  - `runSearch(searchNodeId)` → `Set<string>` — 遍历 Loro 所有实体，返回匹配 ID
  - 候选集过滤：排除 `queryCondition`/`fieldEntry`/`reference`/`tagDef`/`fieldDef`/`viewDef` + search node 自身（见 3.4 节）
  - 未实现的 QueryOp 显式抛 "not supported" 并打日志，禁止静默忽略
  - 支持操作符：`HAS_TAG`, `TODO`, `DONE`, `NOT_DONE`
- 创建 `tests/vitest/search-engine.test.ts` — 搜索引擎单元测试
- node-store 添加 `createSearchNode(tagDefId)` + `refreshSearchResults(searchNodeId)` actions
  - refresh 使用批量增删 reference + 单次 `commitDoc('system:refresh')`

**Step 2：L0 点击标签创建**
- `TagBadge.tsx`：点击 → 调用 `createSearchNode(tagDefId)`
- **去重策略**：若 SEARCHES 容器中已存在同一 `tagDefId` 的单条件 search node，优先导航到已有节点，不重复创建
- 新建 search node → 自动加入 SEARCHES 容器 → 导航到 NodePanel
- 首次打开自动执行 diff

**Step 3：结果渲染 + 手动排序**
- `BulletChevron.tsx`：search node 显示放大镜 bullet（lucide `Search` icon）
- `OutlinerItem.tsx` / `OutlinerView.tsx`：search node children 渲染分支（queryCondition 隐藏，reference 正常显示）
- 条件芯片条（简化版）：只读显示 `#tagName` 芯片
- 结果可拖拽排序（复用现有拖拽逻辑）
- 打开/展开时自动 diff
- TrailingInput：Phase 1 仅对 `HAS_TAG` 条件自动打标签（创建到 Library + reference 回来）；复杂条件的模板创建延后到 Phase 2+
- `use-node-search.ts`：`queryCondition` 加入 `SKIP_DOC_TYPES`
- `seed-data.ts`：添加 search node 种子数据

**交付标准**：`typecheck` → `check:test-sync` → `vitest` → `build` 全绿。种子数据中可看到 search node + 结果。

---

#### Step 4：L1 字段过滤 UI（后续迭代）

- 条件芯片条完整版：增删改条件 + popover 编辑
- `+ 条件` 按钮 → 选择字段 + 选择值
- 搜索引擎扩展：`FIELD_IS`, `FIELD_IS_NOT`, `IS_EMPTY`, `IS_NOT_EMPTY`, `FIELD_CONTAINS`, `LT`, `GT`
- 时间条件：`CREATED_LAST_DAYS`, `EDITED_LAST_DAYS`, `DONE_LAST_DAYS`
- 新结果计数提示 + 手动刷新按钮

---

#### Step 5：L2 AI 自然语言（后续迭代）

- AI tool definition：`createSearchFromAI(params)` 函数
- System prompt 设计：包含 QueryOp 定义 + 工作区 tagDef/fieldDef 列表
- name → ID 解析逻辑
- UI：`✨ AI` 按钮 → 自然语言输入框

### 11.3 依赖关系

```
Step 0（数据模型）→ Sync Production 上线 → Step 1-3（一个 PR）→ Step 4 → Step 5
                                              ↑
                                     可与其他功能并行
```

### 11.4 风险控制

- **Step 0 为什么必须在上线前**：QueryOp 类型和 queryCondition 属性一旦随 Loro 数据落盘，后续 rename/restructure 需要迁移脚本。提前锁定避免技术债。
- **Step 1-3 合为一个 PR**：search node 的最小可用体验需要引擎+创建+渲染三者齐全。拆成 3 个 PR 会导致中间态不可用。
- **高风险文件**：`node-store.ts`、`OutlinerItem.tsx` 是高风险文件（参见 CLAUDE.md），Step 1-3 开发期间需确保无其他 Agent 同时修改。

---

## 附录 A：Tana Search Node 筛选条件完整参考

> 以下为 Tana 支持的全部搜索条件，供实现时逐项对照。soma 的 QueryOp 命名可能与 Tana 关键字不同，但语义应覆盖。

### A.1 逻辑运算符

| 运算符 | 说明 |
|--------|------|
| AND | 所有条件都必须满足。顶层默认 AND 包裹 |
| OR | 任一条件满足即匹配。需嵌套在 AND 内部 |
| NOT | 取反/排除。否定单个条件 |

采用前缀（波兰）表示法。示例：`AND(HAS_TAG(task), NOT_DONE, OR(FIELD_IS(priority, P2), FIELD_IS(priority, P3)))`

### A.2 比较运算符（字段级）

| 运算符 | Tana 前缀 | 说明 | soma QueryOp |
|--------|-----------|------|---------------|
| LT | `>LT` | 小于（数字/日期） | `LT` |
| GT | `>GT` | 大于（数字/日期） | `GT` |
| LINKS_TO | `>LINKS TO` | 匹配有内联引用或链接到指定节点的节点 | `LINKS_TO` |
| CHILD_OF | `>CHILD OF` | 匹配指定节点的直接子节点 | `CHILD_OF` |
| OWNED_BY | `>OWNED BY` | 匹配被指定节点"拥有"的节点（永久 owner） | `OWNED_BY`（延后） |
| DATE OVERLAPS | `>DATE OVERLAPS` | 匹配日期范围有重叠的节点 | 延后 |

注：OWNED_BY vs CHILD_OF — 节点只有一个永久 owner，但可以是多个节点的 child（通过引用）。

### A.3 Checkbox 关键字

| 关键字 | 说明 | soma QueryOp |
|--------|------|---------------|
| TODO | 有 checkbox 的节点（无论勾选与否） | `TODO` |
| DONE | 已勾选的待办 | `DONE` |
| NOT DONE | 未勾选的待办 | `NOT_DONE` |
| DONE LAST [N] DAYS | 最近 N 天内勾选完成的待办 | `DONE_LAST_DAYS` |
| OVERDUE | 未勾选且 Due Date 早于今天 | `OVERDUE`（延后） |

### A.4 时间/创建/编辑关键字

| 关键字 | 说明 | soma QueryOp |
|--------|------|---------------|
| CREATED LAST [N] DAYS | 最近 N 天内创建 | `CREATED_LAST_DAYS` |
| EDITED LAST [N] DAYS | 最近 N 天内修改 | `EDITED_LAST_DAYS` |
| EDITED BY [email] LAST [N] DAYS | 指定用户最近 N 天内修改 | `EDITED_BY`（延后，依赖 Loro PeerID） |
| EDITED BY [email] ANYTIME | 指定用户任何时候修改过 | `EDITED_BY`（延后） |
| FOR DATE [yyyy-mm-dd] | 含有指向特定日期的内联引用 | `FOR_DATE` |
| FOR RELATIVE DATE [term] | 相对日期（yesterday/today/tomorrow/last week 等） | `FOR_RELATIVE_DATE` |

### A.5 节点类型（IS 系列）

| 关键字 | 说明 | soma QueryOp |
|--------|------|---------------|
| IS TAG | Supertag 定义节点 | `IS_TYPE` (value: 'tagDef') |
| IS FIELD | Field 定义节点 | `IS_TYPE` (value: 'fieldDef') |
| IS CALENDAR NODE | 日历节点（年/周/日） | `IS_TYPE` (value: 'calendarNode') |
| IS SEARCH NODE | Search Node 本身 | `IS_TYPE` (value: 'search') |
| IS COMMAND | Command 节点 | 延后 |
| IS PUBLISHED | 已发布节点 | 延后 |
| IS CHAT | AI Chat 节点 | 延后 |
| IS ENTITY | 带 supertag 或从移动端捕获的节点 | `IS_TYPE` (value: 'entity') |

### A.6 节点内容（HAS 系列）

| 关键字 | 说明 | soma QueryOp |
|--------|------|---------------|
| HAS FIELD | 含有任意字段 | `HAS_FIELD` |
| HAS TAG | 应用了 supertag 的节点 | `HAS_TAG`（无指定标签时） |
| HAS MEDIA / AUDIO / VIDEO / IMAGE | 含有媒体附件 | `HAS_MEDIA`（延后） |

### A.7 作用域运算符

| 关键字 | 说明 | soma QueryOp |
|--------|------|---------------|
| PARENTS DESCENDANTS | 搜索节点的父节点的所有后代（不含引用） | `PARENTS_DESCENDANTS` |
| PARENTS DESCENDANTS WITH REFS | 同上，包含引用 | `PARENTS_DESCENDANTS` + flag |
| GRANDPARENTS DESCENDANTS | 祖父节点的所有后代 | `PARENTS_DESCENDANTS` (depth: 2) |
| IN LIBRARY | Library 节点的直接子节点 | `IN_LIBRARY` |
| ON DAY NODE | 日历日节点的直接子节点 | `ON_DAY_NODE` |
| SIBLING NAMED "[name]" | 指定名称的兄弟节点的后代 | Phase 3+ |

### A.8 字段值 & 系统节点值

| 值 | 说明 | soma 处理方式 |
|---|------|---------------|
| PARENT | 相对于搜索节点的父节点 | 搜索引擎通过 `searchContext` 解析 |
| GRANDPARENT | 相对于搜索节点的祖父节点 | 同上，多一层 |
| Set | 字段有值 | `IS_NOT_EMPTY` |
| Not Set | 字段为空或未定义 | `IS_EMPTY` |
| Defined | 字段在 supertag 模板中有定义 | 检查 tagDef 的 template fields |
| Not Defined | 字段在 supertag 模板中未定义 | 同上取反 |

高级语法：
- **点表示法**：`PARENT.Description` → 先解析 PARENT 节点，再读取其 Description 字段
- **日期运算**：`PARENT-7`（7天前）、`PARENT+3`（3天后）
- **组合**：`PARENT.Due date+3`

### A.9 文本与正则匹配

| 方式 | Tana 语法 | soma QueryOp |
|------|-----------|---------------|
| Supertag 匹配 | `#TagName` | `HAS_TAG` |
| 字段值匹配 | `fieldName==value` | `FIELD_IS` |
| 纯文本匹配 | `StringMatch:"hello"` | `STRING_MATCH` |
| 正则表达式 | `RegexpMatch:/regex/` | `REGEXP_MATCH` |
