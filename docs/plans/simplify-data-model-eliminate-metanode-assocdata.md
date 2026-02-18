# 数据模型简化：消除 Metanode + AssociatedData 间接层

## Context

### 为什么要做这个改动

Nodex 忠实复刻了 Tana 的三层间接结构（Tuple / Metanode / AssociatedData），但 Tana 这套设计是为 Firebase 优化的——Firebase 没有 JOIN、没有数组列、没有 SQL 视图，只能用文档嵌套+引用来表达关系。

Nodex 基于 PostgreSQL + Supabase。PostgreSQL 有原生数组、JSONB、视图、函数——三层间接中的两层（Metanode 和 AssociatedData）在 PostgreSQL 上是不必要的复杂度：
- Metanode 只是一个"元信息 Tuple 列表的容器"→ 用 `TEXT[]` 列直接存 Tuple ID 列表
- AssociatedData 只是一个"字段值节点列表的容器"→ 值直接放在 FieldTuple.children[1:] 中

**关键时机**：项目未上线，无历史数据兼容负担。上线后再改代价极大。

### 架构决策

| 层 | 当前 | 目标 | 理由 |
|----|------|------|------|
| Tuple | 保留 | 保留 | 键值对抽象是"一切皆节点"的核心，无可替代 |
| Metanode | `_metaNodeId → Metanode.children[]` | `node.meta TEXT[]` | Metanode 只是容器，PostgreSQL 数组可以直接担当 |
| AssociatedData | `associationMap → AssocData.children[]` | 值直接在 `Tuple.children[1:]` | AssocData 只是容器，Tuple 本身就是列表 |

### 预期收益

- 节点总量减少 ~20%（Metanode 13.5% + AssociatedData 6.3%）
- 标签查询 3-JOIN → 1-JOIN，字段查询 4-JOIN → 1-JOIN
- 代码路径大幅简化（删除 createMetanode、associationMap 逻辑等）
- PostgreSQL 视图变为 1-2 JOIN，可作为高效读模型

### 替代 codex PR #59 的 NQL 方案

codex 在 PR #59 中提出了 NQL（Nodex Query Language）+ Query Facts 的 CQRS 模式。该方案被否决，原因：
- NQL 需要客户端查询引擎 + 编译器 + 运行时，过早抽象
- Query Facts 需要写时更新维护，增加写放大
- Supabase 使用 PostgREST（REST API），无法直接运行自定义 SQL，NQL → SQL 编译无法直接执行
- PostgreSQL 原生视图已足够解决读模型问题，零维护成本

**PR #59 处置**：
- Part A（bug fixes: P0-1 日期层级"年/月/周/日→年/周/日"、P0-3 搜索状态修正）→ cherry-pick 合入 main
- Part B（NQL / Query Facts / 新增守则 7）→ 关闭，用本方案替代

---

## 第一部分：文档更新（实施前完成）

### 1.1 `docs/features/data-model.md` 更新清单

以下章节需要重写或更新（文档是行为权威，必须先于代码更新）：

**§ 三大间接层** → 重写为「两层简化：只保留 Tuple」

新内容要点：
```
原来的三层：Tuple + Metanode + AssociatedData
简化后：只保留 Tuple

- Metanode 被 node.meta TEXT[] 替代
  ContentNode.meta = [tagTupleId, checkboxTupleId, viewTupleId, ...]
  meta-tuple._ownerId = ContentNode.id

- AssociatedData 被 Tuple.children 替代
  FieldTuple.children = [attrDefId, valueNodeId1, valueNodeId2, ...]
  无需 associationMap

- Tuple 保持不变
  children[0] = key, children[1:] = values
```

**§ 三层协作全链路示例** → 重写为简化版示例：

```
applyTag(nodeId, tagDefId):
  1. 创建标签 Tuple（children: [SYS_A13, tagDefId], _ownerId: nodeId）
  2. 将 tupleId 加入 Node.meta 数组
  3. 遍历 tagDef.children（模板 Tuple），为每个模板：
     a. 创建实例 FieldTuple（_sourceId → 模板 Tuple, children: [attrDefId]）
     b. 加入 Node.children
  4. 完成

最终数据结构：
ContentNode N
  ├── meta: [TagTuple.id, CbTuple.id]
  │     ├── TagTuple.children: [SYS_A13, taskDefId]
  │     └── CbTuple.children: [SYS_A55, SYS_V03]
  └── children: [...userContent..., FieldTuple.id]
        └── FieldTuple.children: [statusAttrDefId]
            └── FieldTuple._sourceId → tagDef 中的模板 Tuple
```

**§ 标签系统 - 标签应用六步链路** → 简化为四步

**§ 字段系统 - 字段值三层存储** → 简化为两层

**§ 数据库映射** → 更新：
- 新增 `meta` → `meta TEXT[]` 映射
- 标记 `_metaNodeId` → `meta_node_id` 为废弃
- 标记 `associationMap` → `association_map` 为废弃
- 索引表：新增 `idx_nodes_meta`，标记 `idx_nodes_meta_node` 和 `idx_nodes_association_map` 为废弃

**§ DocType 类型体系 - 核心结构类型** → 标记 metanode 和 associatedData 为废弃

**§ 节点结构 - NodexNode 完整定义** → 新增 `meta?: string[]`，标记 `_metaNodeId` 和 `associationMap` 废弃

**§ 决策记录** → 新增：
```
| 2026-02-18 | 消除 Metanode 间接层，用 node.meta TEXT[] 替代 | PostgreSQL 原生数组替代 Firebase 容器节点 |
| 2026-02-18 | 消除 AssociatedData，值直接存 Tuple.children | Tuple 本身就是列表，无需额外容器 |
| 2026-02-18 | 否决 NQL 方案，改用 PostgreSQL 原生视图做读模型 | Supabase PostgREST 限制 + 视图零维护 |
```

### 1.2 `docs/features/supertags.md` 更新清单

- **§ 标签应用** 中所有"创建 Metanode → Tuple[SYS_A13]"链路描述 → 改为"创建 Tuple → 加入 node.meta"
- **§ 移除标签** 中"删除 Metanode 中对应的 SYS_A13 Tuple"→"从 node.meta 中移除 tupleId"
- **§ 移除标签** 中"清理对应的 associatedData 和 associationMap 条目"→ 删除此行
- **§ createTagDef 自动配置** 中"创建 metanode + SYS_A13 tag binding"→"SYS_A13 tag binding 加入 meta"
- **§ 统一配置字段架构** 中所有 AssociatedData 引用 → 改为 Tuple.children 直接存值
- **§ 数据模型** 中 `metanode.children` → `node.meta`
- **§ Done State Mapping** 中"从 AssociatedData 读取映射数据"→"从 Tuple.children 读取"
- **§ 决策记录** 新增数据模型简化相关条目

### 1.3 `docs/features/search.md` 更新清单

- **§ 数据模型 - SearchNode 结构** 中 `props._metaNodeId → Metanode` → `meta: [...]`
- **§ Metanode 配置** 标题改为 **Meta-Tuple 配置**，内容改为 `node.meta` 中的 tuple 列表
- **§ 行为规格** 中所有 Metanode 引用 → 改为 meta 数组
- **§ 当前实现状态** → 更新 search-service.ts 状态（标签匹配已改为 meta 路径）

### 1.4 `docs/features/views.md` 更新清单

- **§ 视图配置存储(SYS_A16)** 中 `_metaNodeId → Metanode → Tuple` → `meta → Tuple`
- **§ 视图与搜索节点的关系** 中 `SearchNode Metanode:` → `SearchNode meta:`

### 1.5 `CLAUDE.md` 更新清单

- **§ 三大间接层** → 重写（只保留 Tuple + meta 列 + 直接值存储）
- **§ 标签应用链路(六步)** → 简化为四步
- **§ 字段值存储(三层)** → 简化为两层
- **§ 数据库列名映射** → 新增 `meta` → `meta`，标记废弃列
- **§ AssociationMap 语义** → 删除或标记废弃

### 1.6 `docs/TASKS.md` 更新

新增任务到「进行中」：

```
### 数据模型简化：消除 Metanode + AssociatedData
> **Owner: nodex-cc** | Branch: `cc/simplify-data-model` | Priority: P0
> **计划文档**: `docs/plans/simplify-data-model-eliminate-metanode-assocdata.md`

简化三层间接为一层（只保留 Tuple），消除 Metanode 和 AssociatedData。

- [ ] Phase 0: 添加 meta 列 + 类型 + helper
- [ ] Phase 1a: 读路径迁移（meta 优先，fallback _metaNodeId）
- [ ] Phase 1b: 写路径迁移（不再创建 Metanode）
- [ ] Phase 1c: 种子数据 + 测试迁移
- [ ] Phase 2a: 字段读路径迁移（Tuple.children 直接读值）
- [ ] Phase 2b: 字段写路径迁移（不再创建 AssociatedData）
- [ ] Phase 2c: UI 组件迁移（FieldValueOutliner）
- [ ] Phase 2d: 种子数据 + 测试迁移
- [ ] Phase 3: 类型清理 + 数据库清理 + 视图重写 + 文档最终更新

- **Files**: node-store.ts, node.ts, seed-data.ts, tag-service.ts, field-service.ts,
  search-service.ts, checkbox-utils.ts, field-utils.ts, use-node-fields.ts,
  FieldValueOutliner.tsx, node-service.ts, meta-utils.ts (new)
- **迭代日志**: _(开始后追加)_
```

### 1.7 `docs/LESSONS.md` 更新

新增段落：

```
### 数据模型简化决策（2026-02-18）

- Tana 的 Metanode + AssociatedData 是 Firebase 时代的容器节点，PostgreSQL 不需要
- Metanode → `meta TEXT[]` 列（存 tuple ID 列表）
- AssociatedData → 值直接存 FieldTuple.children[1:]
- Tuple 保留不变，是"一切皆节点"的核心
- 实施中使用双源兼容（优先 meta，fallback _metaNodeId）保证增量安全
- 所有 Metanode/AssocData 的 feature docs（supertags.md, search.md, views.md）需同步更新
```

### 1.8 `docs/TESTING.md` 更新

**新增测试条目**（在 Phase 1 section）：

```
### 1.47 Meta-Utils 工具函数

**测试文件**: `tests/vitest/meta-utils.test.ts`

**覆盖点**:
1. `getMetaTuples` 正确返回 meta 数组中的 tuple 节点
2. `getMetaTuples` 跳过不存在的 ID
3. `findMetaTuple` 按 key 查找（如 SYS_A13）
4. `findMetaTuple` 未找到返回 undefined
5. `addMetaTupleId` 追加新 ID
6. `addMetaTupleId` 去重（已存在的 ID 不重复添加）
7. `removeMetaTupleId` 移除存在的 ID
8. `removeMetaTupleId` 对不存在的 ID 返回原数组
```

**更新现有测试条目**（标注数据模型变更）：

- 1.7 标签与引用状态流 → 补充: applyTag 写入 node.meta 而非 Metanode.children
- 1.8 字段状态流 → 补充: 值从 Tuple.children[1:] 读取，无 associationMap
- 1.9 Schema / Supertag 构建链路 → 补充: config tuple 值存 Tuple.children（无 AssocData）
- 1.28 图结构不变量 → 补充: 移除 associationMap 不变量，新增 meta 数组不变量
- 1.29 Field Utils → 补充: resolveConfigValue 直接读 Tuple.children[1]
- 1.33 Checkbox → 补充: hasTagShowCheckbox 读 node.meta（非 _metaNodeId）
- 1.38 Done State Mapping → 补充: 映射数据从 Tuple.children 读取

**Seed Data 速查更新**：

```
总数: ~65 节点（原 ~85，移除 ~20 Metanode + AssociatedData）

Pre-tagged: task_1 → #Task (meta: [tag_tuple, cb_tuple], field tuples in children)
            webclip_1 → #web_clip (meta: [...], Source URL field in tuple.children)
```

---

## 第二部分：测试用例规格（新增 + 更新）

### 新增: `tests/vitest/meta-utils.test.ts`

```typescript
// 1. getMetaTuples - 基础
test('返回 meta 数组中对应的 tuple 节点', () => {
  // node.meta = ['tuple_1', 'tuple_2']
  // entities 中有 tuple_1 (SYS_A13 tag tuple) 和 tuple_2 (SYS_A55 checkbox tuple)
  // 期望返回 [tuple_1_node, tuple_2_node]
})

// 2. getMetaTuples - 跳过缺失
test('跳过不存在的 tuple ID', () => {
  // node.meta = ['tuple_1', 'nonexistent']
  // 期望返回 [tuple_1_node]（只有存在的）
})

// 3. getMetaTuples - 空 meta
test('空 meta 返回空数组', () => {
  // node.meta = [] 或 undefined
  // 期望返回 []
})

// 4. findMetaTuple - 按 key 查找
test('按 children[0] key 查找 meta tuple', () => {
  // node.meta = [tag_tuple_id, checkbox_tuple_id]
  // tag_tuple.children = ['SYS_A13', 'tagDef_task']
  // findMetaTuple(node, 'SYS_A13', entities) → tag_tuple
})

// 5. findMetaTuple - 未找到
test('未找到返回 undefined', () => {
  // findMetaTuple(node, 'SYS_A99', entities) → undefined
})

// 6. addMetaTupleId - 添加
test('追加新 tuple ID 到 meta', () => {
  // node.meta = ['a', 'b']
  // addMetaTupleId(node, 'c') → ['a', 'b', 'c']
})

// 7. addMetaTupleId - 去重
test('已存在的 ID 不重复添加', () => {
  // node.meta = ['a', 'b']
  // addMetaTupleId(node, 'b') → ['a', 'b']
})

// 8. removeMetaTupleId - 移除
test('移除存在的 tuple ID', () => {
  // node.meta = ['a', 'b', 'c']
  // removeMetaTupleId(node, 'b') → ['a', 'c']
})

// 9. removeMetaTupleId - 不存在
test('移除不存在的 ID 返回原数组', () => {
  // node.meta = ['a', 'b']
  // removeMetaTupleId(node, 'z') → ['a', 'b']
})
```

### 更新: `tests/vitest/node-store-tags-refs.test.ts`

关键变更点（每个现有 test case 需要适配）：

```
旧: expect(metanode.children).toContain(tagTupleId)
新: expect(node.meta).toContain(tagTupleId)

旧: expect(entities[metanodeId]).toBeDefined() // metanode 存在
新: // 不再需要检查 metanode

旧: applyTag 后 node.props._metaNodeId 被设置
新: applyTag 后 node.meta 包含 tag tuple ID

旧: removeTag 后 metanode.children 不再包含 tag tuple
新: removeTag 后 node.meta 不再包含 tag tuple ID
```

### 更新: `tests/vitest/node-store-fields.test.ts`

关键变更点：

```
旧: expect(node.associationMap[tupleId]).toBe(assocDataId)
新: // 不再检查 associationMap

旧: const assocData = entities[assocDataId]; expect(assocData.children).toContain(valueId)
新: const tuple = entities[tupleId]; expect(tuple.children.slice(1)).toContain(valueId)

旧: setFieldValue 创建 AssociatedData
新: setFieldValue 直接修改 Tuple.children

旧: addFieldToNode 创建 tuple + assocData + 更新 associationMap
新: addFieldToNode 创建 tuple（children=[attrDefId]），无 assocData

旧: removeField 清理 associationMap 并将 tuple/associatedData 移入 Trash
新: removeField 将 tuple 移入 Trash（无 associatedData）

旧: moveFieldTuple 同步 associationMap
新: moveFieldTuple 无需 associationMap 同步
```

### 更新: `tests/vitest/node-store-schema.test.ts`

关键变更点：

```
旧: createTagDef 验证 AssociatedData 存在 + associationMap 关联
新: createTagDef 验证 config tuple.children[1] 存储配置值

旧: 统一配置字段架构验证 config tuple 通过 associationMap 关联 AssociatedData
新: 统一配置字段架构验证 config tuple 值直接在 children[1:]
```

### 更新: `tests/vitest/checkbox-utils.test.ts`

关键变更点：

```
旧: 构造 metanode + SYS_A55 tuple → node._metaNodeId = metanodeId
新: 构造 SYS_A55 tuple → node.meta = [checkboxTupleId]

旧: shouldNodeShowCheckbox 走 metanode.children 查找
新: shouldNodeShowCheckbox 走 node.meta 查找
```

### 更新: `tests/vitest/done-state-mapping.test.ts`

关键变更点：

```
旧: getDoneStateMappings 从 AssociatedData.children 读取映射
新: getDoneStateMappings 从 Tuple.children 读取映射

旧: addDoneMappingEntry 创建 tuple 并关联 AssociatedData
新: addDoneMappingEntry 创建 tuple（值在 children 中）
```

### 更新: `tests/vitest/helpers/invariants.ts`

```
旧: 检查 associationMap key/value 存在性
新: 移除 associationMap 不变量
新增: 检查 meta 数组中的 ID 都指向存在的 tuple 节点
新增: 检查 meta tuple 的 _ownerId = 所属 content node ID
```

### 更新: `tests/vitest/node-search-filter.test.ts`

```
旧: metanode 节点被过滤
新: metanode docType 不再存在（或标记为 legacy），搜索过滤列表需更新
```

---

## 代码审查发现（nodex-cc 2026-02-18 分析）

> 以下是实施 Agent 对代码层面的详细分析，作为计划修正的依据。

### 发现 1：已有双写但读路径不一致

`applyTag` 和 `setFieldValue` 已经同时写 `tuple.children` 和 `assoc.children`，但读路径不统一：
- `setOptionsFieldValue` → 只更新 `assoc.children`，不更新 `tuple.children[1]`
- `selectFieldOption` → 操作 `assocDataId.children`
- `toggleCheckboxField` → 从 `assoc.children` 读值节点

**结论**：Options/Checkbox 的 `tuple.children[1]` 在赋值后就是过期数据。迁移时必须确保所有读写路径统一到 `tuple.children`。

### 发现 2：两个函数接口必须改变（破坏性变更）

```typescript
// 当前：以 assocDataId 为主参数
selectFieldOption(assocDataId: string, optionNodeId: string, ...)
toggleCheckboxField(assocDataId: string, workspaceId: string, ...)

// 迁移后：改为 tupleId
selectFieldOption(tupleId: string, optionNodeId: string, ...)
toggleCheckboxField(tupleId: string, workspaceId: string, ...)
```

这是向上冒泡的破坏性变更，影响所有调用这两个函数的 UI 组件。Phase 2b 必须包含此项。

### 发现 3：Done-Mapping 条目需要新归宿

当前 DoneMappingEntries（`[NDX_A07, attrDefId, optionId]` Tuple）存在 `AssocData.children` 里。
删除 AssocData 后存储方案：

```
NDX_A06 Tuple.children = [NDX_A06, SYS_V.YES, entryTuple1Id, entryTuple2Id, ...]
```

即 `children[2+]` = 条目 Tuple ID 列表。与 Tuple 的多值语义完全一致。

### 发现 4：遗漏的代码改动点

| 遗漏项 | 影响 | 归入 Phase |
|--------|------|-----------|
| `field-utils.ts:resolveConfigValue` 先读 AssocData | 逻辑反转为只读 `tuple.children[1]` | Phase 2a |
| `applyFieldValueInPlace` 更新 `assoc.children` | 改为更新 `tuple.children[1]` | Phase 2b |
| `moveFieldTuple` 大量 `associationMap` 逻辑 | 简化后可大幅删减 | Phase 2b |
| meta Tuple 的 `_ownerId` 应该是谁 | 应为 `ContentNode.id`，保证 owner 索引可查 | Phase 1b |
| `FieldValueOutliner` 从 AssocData 渲染 | 改为从 `tuple.children[1:]` 渲染 | Phase 2c |

### 发现 5：Fallback 模式不必要

原计划 Phase 1a/2a 设计了"优先新路径，fallback 旧路径"的双源兼容。
项目未上线、无历史数据，fallback 是额外维护负担和 bug 来源。
**决定**：不做 fallback，每个 Phase 直接一次性切换。

### 发现 6：DB migration 编号

已有 `001_create_nodes.sql`（已部署到 dev），新增 meta 列应为新 migration 文件（`004_add_meta_column.sql`），不修改已有 migration。

---

## 第三部分：实现计划（已根据代码审查修正）

### Phase 0: 基础设施（纯增量，零风险）

**目标**: 添加 meta 列和工具函数，不改动任何现有逻辑。

#### 0-1. 数据库 migration

**新建文件**: `supabase/migrations/004_add_meta_column.sql`

```sql
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS meta TEXT[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_nodes_meta ON nodes USING GIN (meta);
```

#### 0-2. TypeScript 类型

**修改文件**: `src/types/node.ts`
- `NodexNode` 接口新增: `meta?: string[]`

**修改文件**: `src/services/node-service.ts`
- `rowToNode()`: `meta: row.meta ?? []`
- `nodeToRow()`: `meta: node.meta ?? []`

#### 0-3. Helper 工具函数

**新建文件**: `src/lib/meta-utils.ts`

```typescript
export function getMetaTuples(node: NodexNode, entities: Record<string, NodexNode>): NodexNode[]
export function findMetaTuple(node: NodexNode, key: string, entities: Record<string, NodexNode>): NodexNode | undefined
export function addMetaTupleId(meta: string[] | undefined, tupleId: string): string[]
export function removeMetaTupleId(meta: string[] | undefined, tupleId: string): string[]
```

#### 0-4. 新建测试

**新建文件**: `tests/vitest/meta-utils.test.ts`（9 cases，见上）

**验证**: `npm run typecheck && npm run test:run`

---

### Phase 1: 消除 Metanode（3 子阶段）

**当前**: ContentNode._metaNodeId → Metanode.children = [tupleId1, tupleId2, ...]
**目标**: ContentNode.meta = [tupleId1, tupleId2, ...]

#### Phase 1a: 读路径迁移（直接切换，无 fallback）

一次性将所有 Metanode 读路径切换到 `node.meta`。无 fallback（项目未上线，无历史数据）。

| 文件 | 函数 | 改动 |
|------|------|------|
| `src/lib/checkbox-utils.ts` | `hasTagShowCheckbox()` | 从 `node.meta` 遍历 → 找 SYS_A55 |
| `src/lib/checkbox-utils.ts` | `resolveForwardDoneMapping()` | 从 `node.meta` → 找 NDX_A06 |
| `src/lib/checkbox-utils.ts` | `resolveReverseDoneMapping()` | 从 `node.meta` → 找 NDX_A06 |
| `src/lib/field-utils.ts` | `resolveTaggedNodes()` | 从 `node.meta` → 找 SYS_A13 |
| `src/services/tag-service.ts` | `getNodeTags()` | 从 `node.meta` → filter SYS_A13 |
| `src/services/search-service.ts` | `executeSearchConfig()` L115-174 | `node.meta` → 1 步匹配 |

**验证**: typecheck + test:run + standalone 目视（标签显示、checkbox 状态不变）

#### Phase 1b: 写路径迁移

| 文件 | 函数 | 改动 |
|------|------|------|
| `src/stores/node-store.ts` | `applyTag()` | 创建 tag tuple（_ownerId = nodeId）→ 加入 node.meta |
| `src/stores/node-store.ts` | `removeTag()` | 从 node.meta 移除 tupleId |
| `src/stores/node-store.ts` | `toggleCheckboxField()` | 操作 node.meta 而非 metanode |
| `src/stores/node-store.ts` | `setConfigValue()` | meta tuple 操作 |
| `src/services/tag-service.ts` | `applyTag()` | 同 node-store |
| `src/services/node-service.ts` | upsert | 确保 meta 列持久化 |

**关键变更 — applyTag**:
```
旧: 1. 获取/创建 Metanode → 2. 创建 tag tuple(_ownerId=metanode) → 3. metanode.children.push(tupleId) → 4. node._metaNodeId = metanodeId
新: 1. 创建 tag tuple(_ownerId=nodeId) → 2. node.meta = addMetaTupleId(node.meta, tupleId)
```

**meta Tuple 的 _ownerId 规则**：所有 meta Tuple 的 `_ownerId` = 所属 ContentNode 的 ID（不再是 Metanode ID）。这保证 owner 索引查询可以直接找到归属节点。

**验证**: typecheck + test:run + standalone 目视（打标签、去标签、checkbox toggle）

#### Phase 1c: 种子数据 + 测试迁移

| 文件 | 改动 |
|------|------|
| `src/entrypoints/test/seed-data.ts` | 删除所有 Metanode 节点创建（~25个），ContentNode 直接设 meta |
| `tests/vitest/node-store-tags-refs.test.ts` | applyTag/removeTag 验证 node.meta |
| `tests/vitest/checkbox-utils.test.ts` | 构造改为 node.meta + tuple |
| `tests/vitest/done-state-mapping.test.ts` | 移除 metanode 依赖 |
| `tests/vitest/node-store-schema.test.ts` | createTagDef 验证 meta |
| `tests/vitest/node-store-extend.test.ts` | Extend 链改为 meta 路径 |
| `tests/vitest/child-supertag.test.ts` | 读取改为 meta 路径 |
| `tests/vitest/tag-colors.test.ts` | resolveTagColor 改为 meta 路径 |
| `tests/vitest/field-utils.test.ts` | resolveTaggedNodes 改为 meta |
| `tests/vitest/helpers/invariants.ts` | 移除 metanode 不变量 + 新增 meta 不变量 |

此阶段后 Metanode 完全消除，`_metaNodeId` 标记为废弃。

**验证**: `npm run verify`（typecheck + check:test-sync + test:run + build）

---

### Phase 2: 消除 AssociatedData（4 子阶段）

**当前**: ContentNode.associationMap = { fieldTupleId: assocDataId }, AssocData.children = [valueId, ...]
**目标**: FieldTuple.children = [attrDefId, valueId1, valueId2, ...]

#### Phase 2a: 字段读路径迁移（直接切换，无 fallback）

一次性将所有 AssociatedData 读路径切换到 `tuple.children[1:]`。

| 文件 | 函数/接口 | 改动 |
|------|----------|------|
| `src/hooks/use-node-fields.ts` | `FieldEntry` | 移除 `assocDataId`，值从 tuple.children[1:] |
| `src/hooks/use-node-fields.ts` | hook 主体 | `tuple.children.length > 1` 判空 |
| `src/lib/field-utils.ts` | `resolveConfigValue()` | 逻辑反转：只读 `Tuple.children[1]`（当前先读 AssocData） |
| `src/services/field-service.ts` | `getFieldValues()` | 从 tuple.children[1:] 读 |

**验证**: typecheck + test:run + standalone 目视（字段值正确显示）

#### Phase 2b: 字段写路径迁移 + 接口变更

| 文件 | 函数 | 改动 |
|------|------|------|
| `src/stores/node-store.ts` | `setFieldValue()` | 直接修改 tuple.children |
| `src/stores/node-store.ts` | `addFieldToNode()` | 只创建 tuple，无 AssocData |
| `src/stores/node-store.ts` | `setOptionsFieldValue()` | 操作 tuple.children[1:] |
| `src/stores/node-store.ts` | `selectFieldOption()` | **接口变更**: `assocDataId` → `tupleId`，操作 tuple.children[1:] |
| `src/stores/node-store.ts` | `toggleCheckboxField()` | **接口变更**: `assocDataId` → `tupleId`，从 tuple.children 读值 |
| `src/stores/node-store.ts` | `applyFieldValueInPlace()` | 改为更新 tuple.children[1]（当前更新 assoc.children） |
| `src/stores/node-store.ts` | `moveFieldTuple()` | 删除 associationMap 同步逻辑（大幅删减） |
| `src/stores/node-store.ts` | `changeFieldType()` | 清空 tuple.children 保留 [0] |
| `src/services/field-service.ts` | `setFieldValue()` | 同上 |

**关键变更 — 接口破坏性变更**:
```typescript
// 旧：以 assocDataId 为主参数
selectFieldOption(assocDataId: string, optionNodeId: string, ...)
toggleCheckboxField(assocDataId: string, workspaceId: string, ...)

// 新：改为 tupleId
selectFieldOption(tupleId: string, optionNodeId: string, ...)
toggleCheckboxField(tupleId: string, workspaceId: string, ...)
```
所有调用这两个函数的 UI 组件必须同步修改传参。在 Phase 2c 中处理调用方。

**关键变更 — Done-Mapping 条目存储**:
```
旧: AssocData.children = [entryTuple1Id, entryTuple2Id, ...]
新: NDX_A06 Tuple.children = [NDX_A06, SYS_V.YES, entryTuple1Id, entryTuple2Id, ...]
     （children[2+] = 条目 Tuple ID 列表，与 Tuple 多值语义一致）
```

**关键变更 — setFieldValue**:
```
旧: 1. 查 associationMap → 拿 assocDataId → 2. 创建/获取 AssocData → 3. AssocData.children = [valueId]
新: 1. 查 tuple → 2. tuple.children = [attrDefId, valueId]
```

**关键变更 — addFieldToNode**:
```
旧: 1. 创建 tuple → 2. 创建 AssocData → 3. node.associationMap[tupleId] = assocDataId
新: 1. 创建 tuple（children = [attrDefId]）→ 完成
```

**验证**: typecheck + test:run + standalone 目视（字段编辑操作、Options 选择、Checkbox toggle）

#### Phase 2c: UI 组件迁移 + 接口调用方修复

| 文件 | 改动 |
|------|------|
| `src/components/fields/FieldValueOutliner.tsx` | props: `assocDataId` → `tupleId`，数据源: `useNode(tupleId).children.slice(1)` |
| 所有调用 `FieldValueOutliner` 的地方 | 传 `tupleId` 而非 `assocDataId` |
| 所有调用 `selectFieldOption()` 的组件 | 传参从 `assocDataId` 改为 `tupleId` |
| 所有调用 `toggleCheckboxField()` 的组件 | 传参从 `assocDataId` 改为 `tupleId` |

> 用全局搜索找到所有调用方：`grep -rn "selectFieldOption\|toggleCheckboxField\|FieldValueOutliner" src/`

**验证**: standalone 目视 + 字段值渲染、Options 选择、Checkbox toggle 交互

#### Phase 2d: 种子数据 + 测试迁移

| 文件 | 改动 |
|------|------|
| `src/entrypoints/test/seed-data.ts` | 删除 AssociatedData 节点（~20个），值放 tuple.children |
| `tests/vitest/node-store-fields.test.ts` | 所有 assocData/associationMap 验证改为 tuple.children |
| `tests/vitest/node-store-schema.test.ts` | config 值验证改为 tuple.children |
| `tests/vitest/field-utils.test.ts` | resolveConfigValue 改为 tuple.children |
| `tests/vitest/done-state-mapping.test.ts` | 映射数据从 tuple.children 读取 |
| `tests/vitest/webclip-service.test.ts` | Source URL 值验证改为 tuple.children |
| `tests/vitest/helpers/invariants.ts` | 移除 associationMap 不变量 |
| `tests/vitest/invariants-helper.test.ts` | 同步更新 |

此阶段后 AssociatedData 完全消除，`associationMap` 标记为废弃。

**验证**: `npm run verify`

---

### Phase 3: 清理 + 视图

#### 3-1. 类型清理

| 文件 | 改动 |
|------|------|
| `src/types/node.ts` | DocType: 删除 `'metanode'` 和 `'associatedData'` |
| `src/types/node.ts` | NodeProps: 删除 `_metaNodeId` |
| `src/types/node.ts` | NodexNode: 删除 `associationMap`，`meta` 改为必选 |

#### 3-2. 代码清理

- 删除 `tag-service.ts` 的 `createMetanode()` 函数
- 删除 `node-service.ts` 的 `_metaNodeId` / `association_map` 映射
- 全局搜索确认无残留: `metanode` / `metaNode` / `associatedData` / `associationMap` / `_metaNodeId` / `meta_node_id` / `association_map`

#### 3-3. 数据库清理

**新建文件**: `supabase/migrations/005_remove_deprecated_columns.sql`

```sql
ALTER TABLE nodes DROP COLUMN IF EXISTS meta_node_id;
ALTER TABLE nodes DROP COLUMN IF EXISTS association_map;
DROP INDEX IF EXISTS idx_nodes_meta_node_id;
DROP INDEX IF EXISTS idx_nodes_association_map;
```

#### 3-4. 视图重写

**重写文件**: `supabase/migrations/003_read_model_views.sql`

旧版（已写入文件，需要替换）基于 Metanode + AssocData 3-4 JOIN。
新版基于 meta 数组 + tuple.children 1-2 JOIN。

```sql
-- v_node_tags: ContentNode.meta → Tuple[SYS_A13, tagDefId]
CREATE VIEW v_node_tags WITH (security_invoker = true) AS
SELECT
  n.id AS node_id, n.workspace_id,
  t.children[2] AS tag_def_id, t.id AS tuple_id,
  td.name AS tag_name
FROM nodes n
CROSS JOIN LATERAL unnest(n.meta) AS meta_tuple_id
JOIN nodes t ON t.id = meta_tuple_id AND t.doc_type = 'tuple' AND t.children[1] = 'SYS_A13'
LEFT JOIN nodes td ON td.id = t.children[2] AND td.doc_type = 'tagDef';

-- v_node_fields: ContentNode.children → FieldTuple → values in children[2:]
CREATE VIEW v_node_fields WITH (security_invoker = true) AS
SELECT
  n.id AS node_id, n.workspace_id,
  ft.children[1] AS attr_def_id, ft.id AS tuple_id,
  ft.source_id AS template_tuple_id,
  ft.children[2:] AS value_node_ids, ft.children[2] AS primary_value_id,
  vn.name AS value_text, attr.name AS field_name
FROM nodes n
CROSS JOIN LATERAL unnest(n.children) AS child_id
JOIN nodes ft ON ft.id = child_id AND ft.doc_type = 'tuple'
JOIN nodes attr ON attr.id = ft.children[1] AND attr.doc_type = 'attrDef'
LEFT JOIN nodes vn ON vn.id = ft.children[2];

-- search_by_tag: 简化版
CREATE FUNCTION search_by_tag(p_workspace_id TEXT, p_tag_def_ids TEXT[])
RETURNS SETOF nodes LANGUAGE SQL STABLE SECURITY INVOKER AS $$
  SELECT DISTINCT n.*
  FROM v_node_tags vt JOIN nodes n ON n.id = vt.node_id
  WHERE vt.workspace_id = p_workspace_id
    AND vt.tag_def_id = ANY(p_tag_def_ids)
    AND n.doc_type IS DISTINCT FROM 'tuple';
$$;
```

#### 3-5. 文档最终更新

确认所有 `docs/features/*.md`、`CLAUDE.md`、`docs/TESTING.md` 中已完全移除 Metanode/AssociatedData 引用，标记为最终完成状态。

**验证**: `npm run verify` 全量通过

---

## 实施顺序与里程碑

| 阶段 | 改动文件数 | 风险 | 里程碑 | Commit 时机 |
|------|-----------|------|--------|------------|
| Phase 0 | 4 | 零 | meta 列 + helper 可用 | ✅ commit |
| Phase 1a | 6 | 低 | 读路径直接切到 meta（无 fallback） | ✅ commit |
| Phase 1b | 3 | 中 | 写路径走 meta，Metanode 不再生成 | ✅ commit |
| Phase 1c | ~12 | 低 | 种子 + 测试全切换，Metanode 完全消除 | ✅ commit |
| Phase 2a | 4 | 低 | 字段读直接切到 Tuple.children（无 fallback） | ✅ commit |
| Phase 2b | 5 | **高** | 字段写 + 接口变更 + Done-Mapping 迁移 | ✅ commit |
| Phase 2c | 4+ | 中 | UI 组件 + 接口调用方全部修复 | ✅ commit |
| Phase 2d | ~10 | 低 | 种子 + 测试全切换，AssocData 完全消除 | ✅ commit |
| Phase 3 | ~10 | 低 | 清理 + 视图 + 文档最终版 | ✅ commit |

**每个子阶段后**: `npm run typecheck && npm run test:run`，通过后 commit。
**Phase 1c 和 2d 后**: `npm run verify`（完整门禁）。
**Phase 3 后**: `npm run verify` + standalone 全功能目视检查。

---

## 高风险文件注意事项

| 文件 | 约束 |
|------|------|
| `node-store.ts` (~2270 行) | 同一时间只有一个 Agent 改。本任务需要大量修改此文件 |
| `seed-data.ts` | 需要完全重构，删除 ~45 个中间层节点 |
| `OutlinerItem.tsx` | Phase 2c 涉及 FieldValueOutliner 引用变更 |

**在 TASKS.md Agent 状态表中声明文件锁**: `node-store.ts`, `seed-data.ts`, `node.ts`
