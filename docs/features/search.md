# Feature: Search Nodes / Live Queries

> 执行顺序 ② | 尚未实现（服务层和 UI 均需从零构建）
>
> **重要上下文变更**：原文档引用的 `search-service.ts`（Supabase 版）已随 Loro 迁移删除。
> 当前数据层为纯客户端 Loro CRDT，所有搜索逻辑需基于 Loro 内存查询重新实现。

## 概述

Search Node 是 Tana 中的持久化动态查询。它是一等节点（`type: 'search'`），可以存在于工作区任何位置，展开时显示实时匹配结果。搜索节点与视图系统结合，可以 Table、Cards、Calendar 等形式展示结果。

用户通过 `?` 触发创建搜索节点，配置目标标签和过滤条件后，系统自动计算匹配节点并实时展示。

## 当前实现状态

| 层次 | 状态 | 说明 |
|------|------|------|
| 类型定义 | ✅ | `NodeType` 包含 `'search'`（`src/types/node.ts`） |
| 系统常量 | ✅ | `SYS_A15` (SEARCH_EXPRESSION)、`SYS_A16` (VIEWS) 已定义 |
| SEARCHES 容器 | ✅ | `system-node-registry.ts` 中已注册，侧栏可见 |
| `searchContext` 属性 | ✅ | `NodexNode.searchContext` 已定义，Loro 可读写 |
| ⌘K 模糊搜索 | ✅ | `CommandPalette` + `fuzzy-search.ts`（按名称模糊匹配） |
| `useNodeSearch` hook | ✅ | 内存子串过滤 + 面包屑（用于 ReferenceSelector 等） |
| Slash command 注册 | ✅ | `search_node` 已在 `slash-commands.ts` 注册（`enabled: false`） |
| 搜索查询引擎 | ❌ | 原 `search-service.ts`（Supabase 版）已删除，需基于 Loro 重写 |
| `?` 触发 | ❌ | Slash command 已注册但禁用，无 handler |
| 搜索节点创建 | ❌ | `node-store.ts` 无 `createSearchNode()` |
| Query Builder UI | ❌ | 完全缺失 |
| 搜索结果展示 | ❌ | 无搜索结果引用 bullet 渲染 |
| 视图集成 | ❌ | 依赖视图系统（P3） |

## 数据模型

### SearchNode 结构（Loro）

```
SearchNode (type: 'search')
  ├── name: "Tasks"                  ← 搜索名称
  ├── tags: [targetTagDefId]         ← 搜索目标标签（简化：Phase 1 直接用 tags 字段）
  ├── searchContext?: parentNodeId   ← 搜索范围限定（可选）
  ├── children: [resultId1, ...]     ← 动态计算的搜索结果（引用，非复制）
  └── parent: 任意位置（SEARCHES 容器或用户自选位置）
```

**与 Tana 的简化**：

Tana 的搜索配置使用 meta Tuple 树（`[SYS_A15, tagDefId, filterTuple]`）。Nodex 当前无 meta/Tuple 机制（Loro 迁移后简化掉了），Phase 1 采用**直接属性存储**：

| 配置项 | Tana（meta Tuple） | Nodex Phase 1（直接属性） |
|--------|-------------------|------------------------|
| 目标标签 | `meta → Tuple [SYS_A15, tagId]` | `node.tags = [tagId]`（复用 tags 字段） |
| 过滤条件 | `meta → Tuple [SYS_A15, tagId, filterTuple]` | Phase 2 再设计 |
| 视图配置 | `meta → Tuple [SYS_A16, viewDefId]` | 延后到视图系统 |
| 默认子标签 | `meta → Tuple [SYS_A14, tagId]` | `node.childSupertag` |

> **设计原则**：搜索条件最终应为 Tuple 节点树（"一切皆节点"守则 #3），但 Phase 1 先用直接属性降低复杂度，Phase 2 迁移到 Tuple 树。

### 系统常量

| 常量 | 值 | 用途 | Phase 1 是否使用 |
|------|-----|------|-----------------|
| `SYS_A.SEARCH_EXPRESSION` | `SYS_A15` | 搜索表达式 Tuple key | ❌ Phase 2 |
| `SYS_A.VIEWS` | `SYS_A16` | 视图配置 | ❌ 延后 |
| `SYS_A.CHILD_SUPERTAG` | `SYS_A14` | 默认子标签 | ✅ 已有 `childSupertag` |

## 行为规格

### 创建搜索节点

1. 用户在编辑器中输入 `?` → 打开标签选择器（复用 `#` 的 TagSelector UI）
2. 选择目标标签（如 `#task`）→ 创建搜索节点：
   - `type: 'search'`
   - `name: tagDef.name`（如 "task"）
   - `tags: [selectedTagDefId]`
3. 搜索节点创建后立即执行查询，结果作为 children 展示
4. Query Builder 面板展开，允许进一步配置

### 搜索节点在大纲中的展示

```
• test
🔍 Tasks  [+] [⫞] [...]         ← 搜索节点行（放大镜 bullet）
  ┌─────────────────────────┐
  │ Query Builder      [×]  │    ← 可折叠面板（Phase 2）
  │  Tagged: #task           │
  │  [+AND] [+OR] [+NOT]    │
  │  [▷Run once] [✓Done]    │
  └─────────────────────────┘
  ⊙ Buy groceries  #task          ← 搜索结果（引用 bullet）
  ⊙ Review PR      #task
  ⊙ ...
```

**Phase 1 简化版**：

```
🔍 Tasks                          ← 搜索节点行（放大镜 bullet）
  ⊙ Buy groceries  #task          ← 结果直接展示（引用 bullet）
  ⊙ Review PR      #task
```

- 无 Query Builder 面板（Phase 1 只支持单标签搜索，标签在创建时选定）
- 搜索结果为引用样式 bullet（同心圆 ⊙），点击 navigateTo 原节点
- 每个结果节点显示 TagBadge

### 搜索引擎（Loro 内存查询）

Phase 1 搜索引擎基于 Loro 内存遍历：

```typescript
// src/lib/search-engine.ts

/** 按标签搜索所有匹配节点 */
function searchByTag(tagDefId: string): string[] {
  // 1. 收集标签树（多态搜索）
  const tagIds = collectTagHierarchy(tagDefId); // tagDef + 所有 extends 子标签

  // 2. 遍历所有节点，过滤匹配
  const allIds = loroDoc.getAllNodeIds();
  return allIds.filter(id => {
    const tags = loroDoc.getTags(id);
    return tags.some(t => tagIds.has(t));
  });
}

/** 递归收集标签继承树 */
function collectTagHierarchy(tagDefId: string): Set<string> {
  // tagDef.extends 链 → 找所有以 tagDefId 为祖先的 tagDef
  // 遍历所有 tagDef 节点，检查 extends 链是否包含 tagDefId
}
```

**性能特征**：
- O(n) 全量遍历（n = 节点总数）
- Loro WASM 同步操作，单用户场景 <1000 节点足够快
- 未来 >10k 节点需要建索引（倒排索引或 Loro 订阅）

### 搜索结果管理

**结果不存入 children[]**（与 Tana 不同的简化）：

| 方案 | 优点 | 缺点 |
|------|------|------|
| Tana：结果存入 children[] | 离线可用，展开即显示 | 结果过期需重算，children 被占用 |
| **Nodex Phase 1：动态计算** | 结果永远最新，无过期问题 | 每次展开需计算（内存操作，极快） |

Phase 1 搜索结果为**动态计算**，不持久化到 children：
- 搜索节点展开时触发 `searchByTag()` 计算
- 结果缓存在 React state / useMemo 中
- 节点变更时（Loro 订阅 `_version`）自动刷新

### 多态搜索（标签继承）

搜索父标签时自动包含所有子标签实例：

```
搜索 #source → 结果包含：
  - 所有 #source 节点
  - 所有 #article 节点（extends: sourceTagDefId）
  - 所有 #tweet 节点（extends: sourceTagDefId）
```

实现基于 `NodexNode.extends` 属性遍历所有 tagDef 节点。

### Query Builder（查询构建器）— Phase 2

**可折叠面板**，附着在搜索节点下方。关闭后不影响搜索结果展示。

**查询输入方式**（复用编辑器触发符）：
- `@` 插入标签条件
- `>` 插入字段条件
- 纯文本 = 关键词搜索

**条件组合**：
- `+ AND`、`+ OR`、`+ NOT` 按钮添加逻辑组
- 每个逻辑组内可包含多个条件

**执行按钮**：
| 按钮 | 功能 |
|------|------|
| **Run once** | 一次性执行查询，不保存 |
| **Done** | 保存查询条件，关闭 Query Builder |

### 搜索操作符 — Phase 2+

#### 基础操作符

| 操作符 | 说明 | Phase |
|--------|------|-------|
| HAS_TAG | 节点有指定标签 | Phase 1（唯一操作符） |
| HAS_FIELD | 节点有指定字段 | Phase 2 |
| DEFINED / NOT_DEFINED | 字段有值/为空 | Phase 2 |
| TODO / DONE | Checkbox 状态 | Phase 2 |

#### 层级操作符 — 延后

| 操作符 | 说明 |
|--------|------|
| CHILD_OF | 子节点过滤 |
| DESCENDANTS_OF | 后代过滤 |

#### 逻辑组合 — Phase 2

- **AND** — 多个条件同时满足（默认）
- **OR** — 任一条件满足
- **NOT** — 排除匹配的节点

## 设计原则

> **搜索条件 = Tuple 节点树，不是 DSL 字符串。**（最终目标，Phase 2 迁移）

Phase 1 使用直接属性（`tags` 字段存目标标签），Phase 2 迁移到 Tuple 树结构。

**最终目标**（Phase 2）：Query Builder 每个条件行对应一个 Tuple 节点，逻辑组合 = Tuple 嵌套关系，条件增删改 = 标准树操作。

## 实现范围

### Phase 1（最小可用）

| 功能 | 说明 |
|------|------|
| 搜索引擎 | `search-engine.ts`：`searchByTag()` + `collectTagHierarchy()` |
| `?` 触发 | 启用 slash command，打开标签选择器 |
| 搜索节点创建 | `createSearchNode(parentId, tagDefId)` |
| 搜索节点渲染 | OutlinerItem 识别 `type: 'search'`，放大镜 bullet |
| 搜索结果展示 | 展开时动态计算，引用 bullet 渲染 |
| 结果实时刷新 | Loro `_version` 变更自动重算 |
| 多态搜索 | `collectTagHierarchy()` 递归标签继承 |
| Seed data | 在种子数据中添加 1-2 个搜索节点 |

### Phase 2（Query Builder + 高级过滤）

| 功能 | 说明 |
|------|------|
| Query Builder 面板 | 可折叠，@ 输入标签条件 |
| 多条件搜索 | AND/OR/NOT 逻辑组合 |
| 字段值过滤 | `>` 输入字段条件 |
| TODO/DONE 过滤 | Checkbox 状态过滤 |
| 搜索条件迁移到 Tuple 树 | 从直接属性迁移到标准 Tuple 结构 |
| Run once / Done | 两种执行模式 |

### 延后

| 功能 | 原因 |
|------|------|
| 视图集成（Table/Cards/Calendar） | 依赖视图系统（P3） |
| 层级操作符（CHILD_OF / DESCENDANTS_OF） | 低频需求 |
| 全文搜索（关键词匹配节点内容） | 需要索引策略 |
| 搜索结果排序配置 | 依赖 Sort 基础设施 |

## 可复用的现有代码

| 模块 | 可复用点 |
|------|---------|
| `fuzzy-search.ts` | 名称模糊匹配评分（⌘K 已用） |
| `use-node-search.ts` | 内存遍历 + 跳过结构类型的模式 |
| `slash-commands.ts` | `search_node` 注册项（需启用 + 加 handler） |
| `system-node-registry.ts` | SEARCHES 容器已定义 |
| `BulletChevron.tsx` | `isReference` 引用样式 bullet（搜索结果复用） |
| `TagSelector` / `ReferenceSelector` | `?` 触发后的标签选择 UI |
| `loroDoc.getTags()` / `getAllNodeIds()` | 搜索遍历的基础 API |

## 与 Tana 的已知差异

| 差异 | Tana | Nodex 决策 |
|------|------|-----------|
| 搜索配置存储 | meta Tuple 树 | Phase 1 用直接属性，Phase 2 迁移 Tuple |
| 结果存储 | 预计算存入 children[] | 动态计算（结果永远最新） |
| 结果上限 | 实测最大 580 | 暂不限制，后续按需分页 |
| 搜索触发 | `?`（Tana 行为需确认） | `?` 触发符，与 #/@/> 对称 |
| Query Builder | 可折叠面板 + 完整操作符 | Phase 1 无 Builder，Phase 2 跟随 |

## 决策记录

| 日期 | 决策 | 原因 |
|------|------|------|
| 2026-02-14 | `?` 作为搜索节点触发符 | 与 Tana 一致；与 #/@/> 形成统一的触发符体系 |
| 2026-02-14 | Phase 1 先做单标签搜索 | 覆盖 80% 使用场景，逻辑组合延后 |
| 2026-02-16 | 搜索条件最终应为 Tuple 节点树 | "一切皆节点"守则；但 Phase 1 先用直接属性降低复杂度 |
| 2026-02-24 | 搜索结果动态计算（不存 children[]） | Loro 内存查询极快；避免结果过期问题和 children 占用 |
| 2026-02-24 | 搜索引擎基于 Loro 内存遍历 | 原 Supabase search-service.ts 已删除；单用户 <1000 节点 O(n) 可接受 |
| 2026-02-24 | Phase 1 搜索配置用直接属性 | Loro 迁移后无 meta/Tuple 机制；Phase 2 再引入 Tuple 树 |
