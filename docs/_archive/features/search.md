# Feature: Search Nodes / Live Queries

> 执行顺序 ② | 尚未实现
>
> **数据层上下文**：原 `search-service.ts`（Supabase 版）已随 Loro 迁移删除。
> 搜索引擎需基于 Loro 内存查询构建，查询配置用子节点树（"一切皆节点"）。

## 概述

Search Node 是持久化动态查询。它是一等节点（`type: 'search'`），可存在于工作区任何位置，展开时动态计算并显示匹配结果。搜索结果用 OutlinerItem 渲染，具备完整交互能力（展开、编辑、查看字段）。

用户通过 `?` 触发创建搜索节点，选择目标标签后，系统自动查找所有匹配节点并展示。

## 当前实现状态

| 层次 | 状态 | 说明 |
|------|------|------|
| 类型定义 | ✅ | `NodeType` 包含 `'search'`（`src/types/node.ts`） |
| 系统常量 | ✅ | `SYS_A15` (SEARCH_EXPRESSION)、`SYS_A16` (VIEWS) 已定义 |
| SEARCHES 容器 | ✅ | `system-node-registry.ts` 中已注册，⌘K 可导航 |
| ⌘K 模糊搜索 | ✅ | `CommandPalette` + `fuzzy-search.ts`（按名称模糊匹配） |
| `useNodeSearch` hook | ✅ | 内存子串过滤 + 面包屑（用于 ReferenceSelector 等） |
| Slash command 注册 | ✅ | `search_node` 已在 `slash-commands.ts` 注册（`enabled: false`） |
| 搜索查询引擎 | ❌ | 需基于 Loro 内存遍历构建 |
| 查询条件节点类型 | ❌ | `queryCondition` 类型待定义 |
| `?` 触发 | ❌ | Slash command 已注册但禁用，无 handler |
| 搜索节点创建 | ❌ | `node-store.ts` 无 `createSearchNode()` |
| 搜索结果渲染 | ❌ | OutlinerView 无搜索分支 |
| Query Builder UI | ❌ | Phase 2 |

## 数据模型

### 核心设计：查询配置 = 子节点树

搜索节点的 children 是查询条件节点树，搜索结果动态计算、不存储。

```
SearchNode (type: 'search', name: "Tasks")
  └── children (Loro 树):
        └── QueryGroup (type: 'queryCondition', queryLogic: 'AND')
              └── Condition (type: 'queryCondition', queryOp: 'HAS_TAG', queryTargetTag: tagDefId)
```

### NodeType 扩展

```typescript
export type NodeType =
  | 'fieldEntry' | 'reference' | 'tagDef' | 'fieldDef' | 'viewDef'
  | 'search'
  | 'queryCondition';   // 查询组（有 queryLogic）或叶条件（有 queryOp）
```

### NodexNode 新增属性

```typescript
// 仅 type: 'queryCondition' 使用
queryLogic?: 'AND' | 'OR' | 'NOT';      // 组节点：子条件的逻辑关系
queryOp?: string;                         // 叶节点：操作符（见下方操作符表）
queryTargetTag?: string;                  // HAS_TAG 操作符的目标 tagDefId
queryField?: string;                      // 字段条件的 attrDefId（Phase 2）
queryValue?: string;                      // 比较值（Phase 2）
```

### 条件树结构示例

**单标签搜索**（Phase 1）：

```
SearchNode (type: 'search', name: "Tasks")
  └── AND group (type: 'queryCondition', queryLogic: 'AND')
        └── Condition (queryOp: 'HAS_TAG', queryTargetTag: taskTagDefId)
```

**复合查询**（Phase 2）：

```
SearchNode (type: 'search', name: "High Priority Tasks")
  └── AND group (queryLogic: 'AND')
        ├── Condition (queryOp: 'HAS_TAG', queryTargetTag: taskTagDefId)
        ├── Condition (queryOp: 'FIELD_EQUALS', queryField: priorityAttrId, queryValue: 'High')
        └── Condition (queryOp: 'TODO')
```

**嵌套逻辑**（Phase 2）：

```
AND group
  ├── HAS_TAG: #task
  └── OR group (queryLogic: 'OR')
        ├── FIELD_EQUALS: Priority = High
        └── FIELD_EQUALS: Priority = Urgent
```

### 搜索结果

- **动态计算**：搜索结果不存入 `children[]`，每次展开时由搜索引擎实时计算
- **永远最新**：节点变更后结果自动刷新（通过 Loro `_version` 订阅）
- **零额外节点**：不创建临时引用节点，不污染数据模型

| | 动态计算（Nodex） | 预存 children（Tana） |
|--|-------------------|---------------------|
| 结果新鲜度 | 永远最新 | 可能过期，需触发刷新 |
| 额外节点 | 无 | 每个结果一个引用 |
| 性能 | <1000 节点微秒级 | 展开即显示 |
| children 语义 | 干净（仅查询配置） | 混合（配置 + 结果） |

## 行为规格

### 创建搜索节点

1. 用户在编辑器中输入 `?` → 弹出标签选择器（复用 `#` 的 TagSelector UI）
2. 选择目标标签（如 `#task`）
3. 系统创建 3 个节点：
   - SearchNode（`type: 'search'`，`name: tagDef.name`）
   - AND root group（`type: 'queryCondition'`，`queryLogic: 'AND'`）
   - HAS_TAG condition（`type: 'queryCondition'`，`queryOp: 'HAS_TAG'`，`queryTargetTag: tagDefId`）
4. 搜索节点创建后立即展示结果

### 搜索节点在大纲中的展示

**Phase 1**（无 Query Builder）：

```
🔍 Tasks                            ← SearchNode：放大镜 bullet
  ⊙ Buy groceries  #task            ← 搜索结果：引用 bullet，完全可交互
  ⊙ Review PR      #task                可展开查看 children
  ⊙ Fix login bug  #task                可内联编辑
                                         点击 bullet → navigateTo 原节点
```

**Phase 2**（带 Query Builder）：

```
🔍 High Priority Tasks
  ┌── Query Builder ──────────┐      ← 可折叠面板：渲染/编辑条件子节点树
  │ AND                        │
  │   Tagged: #task             │
  │   Priority = High           │
  │ [+AND] [+OR] [+NOT]        │
  │             [▷Run once] [✓Done] │
  └────────────────────────────┘
  ⊙ Buy groceries  #task  High
  ⊙ Fix login bug  #task  High
```

### 搜索结果渲染

搜索结果**必须用 OutlinerItem 渲染**，继承全部交互能力：
- 展开查看 children
- 内联编辑节点内容
- 查看/编辑字段值
- TagBadge 显示
- 右键菜单
- 拖拽（Phase 2 考虑）

OutlinerView 渲染逻辑：

```typescript
if (parentNode.type === 'search') {
  // 跳过真实 children（条件节点），渲染动态搜索结果
  const resultIds = useSearchResults(parentNodeId);
  return resultIds.map(id =>
    <OutlinerItem nodeId={id} isSearchResult depth={depth} />
  );
} else {
  // 正常 children 渲染
  return childIds.map(id =>
    <OutlinerItem nodeId={id} depth={depth} />
  );
}
```

OutlinerItem 仅新增 `isSearchResult` prop → 影响 bullet 样式（引用同心圆 ⊙），其他逻辑不变。

### 搜索引擎

基于 Loro 内存遍历，递归评估条件树：

```typescript
// src/lib/search-engine.ts

function executeSearch(searchNodeId: string): string[] {
  // 从 children 中找到根条件组
  const rootGroupId = loroDoc.getChildren(searchNodeId)
    .find(id => loroDoc.toNodexNode(id)?.type === 'queryCondition');
  if (!rootGroupId) return [];

  const candidates = getAllSearchableNodes();
  return candidates.filter(id => evaluateNode(rootGroupId, id));
}

function evaluateNode(conditionId: string, nodeId: string): boolean {
  const cond = loroDoc.toNodexNode(conditionId);

  // 组节点：递归评估子条件
  if (cond.queryLogic) {
    const children = loroDoc.getChildren(conditionId);
    switch (cond.queryLogic) {
      case 'AND': return children.every(c => evaluateNode(c, nodeId));
      case 'OR':  return children.some(c => evaluateNode(c, nodeId));
      case 'NOT': return !children.some(c => evaluateNode(c, nodeId));
    }
  }

  // 叶节点：执行具体操作符
  switch (cond.queryOp) {
    case 'HAS_TAG': {
      const hierarchy = collectTagHierarchy(cond.queryTargetTag!);
      return loroDoc.getTags(nodeId).some(t => hierarchy.has(t));
    }
    case 'TODO':  { const n = loroDoc.toNodexNode(nodeId); return !!n?.showCheckbox && !n.completedAt; }
    case 'DONE':  { const n = loroDoc.toNodexNode(nodeId); return !!n?.showCheckbox && !!n.completedAt; }
    // Phase 2: FIELD_EQUALS, DEFINED, NOT_DEFINED...
    default: return false;
  }
}
```

**`getAllSearchableNodes()`** 过滤规则：
- 跳过结构类型（`fieldEntry`, `fieldDef`, `reference`, `queryCondition`, `search`）
- 跳过工作区容器（`isWorkspaceContainer()`）
- 跳过回收站内节点（TRASH 容器后代）

**`collectTagHierarchy(tagDefId)`**：多态搜索
- 遍历所有 `type: 'tagDef'` 节点
- 检查 `extends` 属性链，收集以 `tagDefId` 为祖先的所有 tagDef
- 返回 `Set<string>` 包含目标 + 所有后代

### 搜索操作符

#### Phase 1

| 操作符 | queryOp 值 | 说明 |
|--------|-----------|------|
| HAS_TAG | `'HAS_TAG'` | 节点有指定标签（含子标签多态搜索） |

#### Phase 2

| 操作符 | queryOp 值 | 说明 |
|--------|-----------|------|
| FIELD_EQUALS | `'FIELD_EQUALS'` | 字段值等于指定值 |
| DEFINED | `'DEFINED'` | 字段有值 |
| NOT_DEFINED | `'NOT_DEFINED'` | 字段为空 |
| TODO | `'TODO'` | 有 checkbox 且未完成 |
| DONE | `'DONE'` | 有 checkbox 且已完成 |

#### 延后

| 操作符 | 说明 |
|--------|------|
| CHILD_OF | 子节点过滤 |
| DESCENDANTS_OF | 后代过滤 |
| OVERDUE | 日期字段值已过期 |
| CREATED_LAST_N_DAYS | 创建日期在最近 N 天内 |
| 全文搜索 | 关键词匹配节点内容 |

### Query Builder — Phase 2

**可折叠面板**，附着在搜索节点下方，直接编辑条件子节点树。

- `@` 插入标签条件 → 创建 HAS_TAG 子节点
- `>` 插入字段条件 → 创建 FIELD_EQUALS 子节点
- `+AND` / `+OR` / `+NOT` → 创建逻辑组子节点
- 删除条件 = 删除子节点
- 所有操作都是标准树操作（addChild / removeChild / updateNode）

### 工作区容器

- 搜索节点可放在工作区**任意位置**
- SEARCHES 容器（`system-node-registry.ts` 已注册）存放从 ⌘K 创建的搜索节点
- `?` 在编辑器中触发时，搜索节点创建在当前位置（与 `#` `@` `>` 行为一致）

## 实现范围

### Phase 1（最小可用）

| 功能 | 说明 |
|------|------|
| 类型定义 | `queryCondition` NodeType + 查询属性 |
| 搜索引擎 | `search-engine.ts`：递归条件树评估 + 多态标签搜索 |
| 搜索节点创建 | `createSearchNode()`：3 节点（search + AND group + HAS_TAG） |
| `?` 触发 | 启用 slash command + 标签选择器 |
| 搜索 bullet | BulletChevron 放大镜图标 |
| 结果渲染 | OutlinerView 搜索分支 + OutlinerItem `isSearchResult` |
| 结果刷新 | Loro `_version` 变更自动重算 |
| Seed data | 1-2 个搜索节点 + 匹配节点 |

### Phase 2（Query Builder + 高级操作符）

| 功能 | 说明 |
|------|------|
| Query Builder 面板 | 可折叠，渲染/编辑条件子节点树 |
| 多条件搜索 | AND/OR/NOT 逻辑组合 UI |
| 字段值过滤 | FIELD_EQUALS / DEFINED / NOT_DEFINED |
| TODO/DONE | Checkbox 状态过滤 |
| Run once / Done | 两种执行模式 |

### 延后

| 功能 | 原因 |
|------|------|
| 视图集成（Table/Cards/Calendar） | 依赖视图系统（P3） |
| 层级操作符（CHILD_OF / DESCENDANTS_OF） | 低频需求 |
| 全文搜索 | 需要索引策略 |
| 搜索结果排序配置 | 依赖 Sort 基础设施 |

## 可复用的现有代码

| 模块 | 复用点 |
|------|--------|
| `slash-commands.ts` | `search_node` 注册项（启用 + 加 handler） |
| `BulletChevron.tsx` | `isReference` 引用 bullet 样式（搜索结果复用） |
| TagSelector / ReferenceSelector | `?` 触发后的标签选择 UI |
| `loroDoc.getTags()` / `getAllNodeIds()` / `toNodexNode()` | 搜索遍历基础 API |
| `use-node-search.ts` | 跳过结构类型的模式可参考 |
| `system-node-registry.ts` | SEARCHES 容器已定义 |

## 与 Tana 的已知差异

| 差异 | Tana | Nodex |
|------|------|-------|
| 搜索配置 | meta Tuple 树 | 子节点树（`type: 'queryCondition'`） |
| 结果存储 | 预计算存入 children[] | 动态计算（永远最新） |
| 结果交互 | 引用 bullet，可展开/编辑 | 同（OutlinerItem 渲染） |
| children 语义 | 混合（配置 + 结果引用） | 纯查询配置（结果不存储） |

## 决策记录

| 日期 | 决策 | 原因 |
|------|------|------|
| 2026-02-14 | `?` 作为搜索节点触发符 | 与 Tana 一致；与 #/@/> 形成统一的触发符体系 |
| 2026-02-16 | 搜索条件 = 节点树 | "一切皆节点"守则 |
| 2026-02-24 | 搜索引擎基于 Loro 内存遍历 | 原 Supabase search-service.ts 已删除；单用户 <1000 节点 O(n) 可接受 |
| 2026-02-24 | 搜索结果动态计算（不存 children[]） | 永远最新，children 语义干净（仅查询配置） |
| 2026-02-24 | 搜索结果用 OutlinerItem 渲染 | 继承全部交互能力（展开/编辑/字段/拖拽） |
| 2026-02-24 | 查询配置用子节点树（`type: 'queryCondition'`） | Phase 2 只需加 Query Builder UI 编辑已有的条件树，无数据模型变更 |
| 2026-02-24 | Phase 1 直接上子节点树（非临时属性） | 避免"Phase 2 迁移"技术债；创建 3 节点成本可忽略 |
