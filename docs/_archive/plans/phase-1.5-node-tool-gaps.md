# Phase 1.5: AI 工具体系重构

> 依赖：Phase 1 (node tool + Chat)
> 阻塞：Phase 2 (Clip & Spark 需要字段写入 + 引用创建 + 批量子树)
> 预估规模：拆分现有 ~430 行 + 新增 ~250 行

---

## 背景

Phase 1 的 `node` tool 将 5 个 action 塞进一个工具，共享 20+ 参数。Phase 1.5 同时解决：

1. **拆分** — 像 Claude Code 的 Read/Write/Edit/Grep，每个工具参数聚焦
2. **补全** — 批量子树创建、字段值便利设置、引用创建、恢复/复制
3. **一切皆节点** — 不为 field/ref 创建独立工具，统一用 CRUD

---

## 设计原则

### 1. 借鉴 Claude Code 工具模式

| Claude Code | Unix 命令 | soma |
|-------------|----------|------|
| **Write** | `echo >` | **node_create** |
| **Read** | `cat` | **node_read** |
| **Edit** | `sed` | **node_edit** |
| (Bash `rm`) | `rm` | **node_delete** |
| **Grep** | `grep` | **node_search** |
| — | `ctrl-z` | **undo** |

- 每个工具做一件事，参数只有自己需要的
- 没有 `edit_python` / `edit_json` / `edit_markdown` 三个工具——一个 Edit 对所有文件

### 2. 一切皆节点 — 工具层也不例外

field value 是节点，reference 是节点。不为它们创建独立工具。

```
设置字段值 = node_create(parentId: fieldEntryId, name: "In Progress")
修改字段值 = node_edit(nodeId: valueNodeId, name: "Done")
清除字段值 = node_delete(nodeId: valueNodeId)
创建引用   = node_create(parentId: parentId, targetId: "note123")
删除引用   = node_delete(nodeId: refNodeId)
```

### 3. 便利参数 ≠ 独立工具

`tags` 是 create 的便利参数——agent 不需要手动调用 `ensureTagDefId → applyTag`。同理，`fields` 是便利参数——agent 不需要手动 `read → findFieldEntry → create(parentId: entryId)`。

便利参数和直接 CRUD 并存：agent 可以用 `node_create(tags: ["task"], fields: {"Status": "Todo"})`，也可以分步操作 field value nodes。两种方式等价。

### 4. 组合操作原子化

"创建节点 + 打标签 + 设字段" 是一个语义动作，应该 1 次 tool call、1 个 commit、1 步 undo。
"创建 Spark 骨架 + 子节点" 是一个语义动作，同理。

---

## 工具全景

```
Phase 1 (现状)                    Phase 1.5 (重构后)
─────────────────                 ─────────────────
node (5-in-1, 20+ params)        node_create  ← Write  + children, fields
  ├─ create                       node_read    ← Read   + enhanced fields
  ├─ read                         node_edit    ← Edit   + fields
  ├─ update                       node_delete  ← rm     + restore
  ├─ delete                       node_search  ← Grep   + fields, backlinks, sort
  └─ search                       undo         ← ctrl-z (不变)
undo                              ─────────────────────────────────
─────────────────                 6 tools, 每个 3-10 focused params
2 tools, 20+ shared params        组合操作原子化，批量子树，便利字段
```

---

## Agent 工作流分析

### WF1: 创建结构化内容（Spark）

Phase 2 的 Spark 需要一次性创建骨架 + 血肉的节点树。

**逐个调用 vs 批量创建：**

| | 逐个（5 calls） | 批量（1 call + children） |
|--|----------------|------------------------|
| round trips | 5 | 1 |
| commit / undo 步数 | 5 | 1 |
| agent 出错概率 | 需要在 5 步间传递 ID | 一次声明完整意图 |
| 延迟 | 5-15 秒 | 1-3 秒 |
| token 成本 | ~5x | ~1.5x |

```typescript
// 1 call 创建完整 Spark 树
node_create({
  name: "#spark", parentId: sourceNode, tags: ["spark"],
  children: [
    { name: "核心框架：预制约束 → 组装自由", children: [
      { name: "论证：模块边界由变化率决定" },
      { name: "隐形假设：假定变化率可预测" }
    ]},
    { name: "碰撞", children: [
      { targetId: "note123" }  // reference
    ]}
  ]
})
```

### WF2: 标记 + 设字段

"创建一个 #task，Status=Todo，Priority=High" 是最常见的复合操作。

**无 `fields` vs 有 `fields`：**

| | 无 fields（4 calls） | 有 fields（1 call） |
|--|---------------------|-------------------|
| 流程 | node_create → node_read → node_create × 2 | node_create(tags + fields) |
| agent 需要理解 field entry 结构 | 是 | 否 |
| round trips | 4 | 1 |

```typescript
// 1 call 完成 tag + fields
node_create({
  name: "Buy groceries",
  tags: ["task"],
  fields: { "Status": "Todo", "Priority": "High" }
})

// 给已有节点设字段：1 call
node_edit({
  nodeId: "abc",
  addTags: ["task"],
  fields: { "Status": "In Progress" }
})
```

### WF3: 探索理解

```
1. node_search(query: "API design") → 候选列表（含 snippet + fields，初步筛选）
2. node_read(nodeId) → 详情（含 fields + children）
3. node_read(childId, depth: 2) → 深入
```

search 返回 fields，agent 无需额外 read 即可按字段值筛选后续操作。

### WF4: 碰撞

```
1. node_search(searchTags: ["source"], fields: {"Domain": "architecture"}) → 精确候选
2. node_search(linkedTo: "conceptNode") → 找到引用该概念的所有笔记
3. node_create(parentId: collisionNode, children: [
     { targetId: candidate1 },
     { targetId: candidate2 }
   ])  // 批量创建引用
```

`fields` 过滤 + `linkedTo` 反向引用让碰撞从模糊猜测变为精确聚集。

### WF6: 统计 & 决策

```
1. node_search(searchTags: ["task"], fields: {"Status": "Todo"}, count: true)  → { total: 12 }
2. node_search(searchTags: ["task"], fields: {"Status": "Done"}, count: true)  → { total: 38 }
   // agent 据此生成进度报告或建议下一步
```

`count: true` 零内容传输，适合 agent 做数据驱动的判断。

### WF5: 整理

```
node_edit(nodeId, parentId: newParent)     // 移动
node_delete(nodeId)                        // 删除
node_delete(nodeId, restore: true)         // 恢复
node_create(duplicateId: "template_id")    // 复制
```

单节点操作够用，批量编辑（如给 5 个节点加同一标签）频率低，Phase 1.5 不加。

---

## 工具定义

### Tool 1: `node_create`

```
description: |
  Create new nodes. Supports single nodes, trees (via children), field values,
  references, siblings, and duplicates — everything is a node.

  Quick patterns:
  - Content node: node_create(name: "...", parentId: "...")
  - With tags + fields: node_create(name: "...", tags: ["task"], fields: {"Status": "Todo"})
  - Tree: node_create(parentId: "...", children: [{name: "...", children: [...]}])
  - Reference: node_create(parentId: "...", targetId: "nodeId")
  - Sibling: node_create(afterId: "...", name: "...")
  - Duplicate: node_create(duplicateId: "nodeId")
  - Field value (direct): node_create(parentId: "fieldEntryId", name: "value")
```

**Parameters:**

```typescript
{
  // 基础
  name?: string,                     // 节点名（内容节点必填，reference/duplicate 可省）
  parentId?: string,                 // 父节点（默认 today journal）
  afterId?: string,                  // 在此节点后插入同级（与 parentId 互斥）
  position?: number,                 // 插入位置（默认末尾）

  // 标签 & 内容
  tags?: string[],                   // 标签显示名（自动创建不存在的 tag）
  content?: string,                  // 描述文本
  fields?: Record<string, string>,   // 便利字段设值 { "Status": "Todo" }

  // 引用
  targetId?: string,                 // 创建 reference 节点指向此目标

  // 复制
  duplicateId?: string,              // 深拷贝此节点

  // 批量
  children?: CreateChildInput[],     // 递归创建子树（max depth: 3）
}

type CreateChildInput = {
  name?: string,
  tags?: string[],
  content?: string,
  fields?: Record<string, string>,
  targetId?: string,
  children?: CreateChildInput[],
}
```

**智能分发（按参数自动判断）：**

| 条件 | 行为 |
|------|------|
| `duplicateId` | `store.duplicateNode()` |
| `targetId` | `store.addReference(parentId, targetId)` |
| `afterId` | `store.createSibling(afterId, data)` |
| `parentId` 是 options field entry | `selectFieldOption()` + auto-collect |
| `parentId` 是其他 field entry | `setFieldValue()` 或 createChild |
| 其他 | `store.createChild(parentId, position, data)` |

如有 `tags` → 自动 `applyTag`。
如有 `fields` → 自动 `resolveFieldDef → setFieldValue/selectFieldOption`。
如有 `children` → 递归处理每个子项。
全部在同一个 `withCommitOrigin(AI_COMMIT_ORIGIN)` 中执行 → 1 个 commit → 1 步 undo。

**Returns:**
```json
{
  "id": "abc",
  "name": "Buy groceries",
  "parentId": "day_20260312",
  "parentName": "2026-03-12",
  "tags": ["task"],
  "fields": { "Status": "Todo", "Priority": "High" },
  "childrenCreated": 0
}
```

如有 children，`childrenCreated` 返回总数，方便 agent 确认。

---

### Tool 2: `node_read`

```
description: |
  Read a node's content, fields, and children. Fields show type and available
  options. Field entries are in the fields array, not in children — children
  only lists content nodes and references.

  Use node_read to understand a node before editing or to discover field entry IDs
  for direct manipulation.
```

**Parameters:**

```typescript
{
  nodeId: string,
  depth?: number,          // default 1, max 3
  childOffset?: number,    // default 0
  childLimit?: number,     // default 20, max 50
}
```

**Returns:**
```json
{
  "id": "abc",
  "name": "Buy groceries",
  "description": "",
  "tags": ["task"],
  "fields": [
    {
      "name": "Status",
      "type": "options",
      "value": "In Progress",
      "fieldEntryId": "fe_001",
      "valueNodeId": "vn_001",
      "options": ["Todo", "In Progress", "Done"]
    },
    {
      "name": "Priority",
      "type": "options",
      "value": "",
      "fieldEntryId": "fe_002",
      "valueNodeId": null,
      "options": ["Low", "Medium", "High"]
    }
  ],
  "checked": false,
  "parent": { "id": "day_20260312", "name": "2026-03-12" },
  "breadcrumb": ["Journal", "2026-03-12"],
  "children": {
    "total": 3,
    "offset": 0,
    "limit": 20,
    "items": [
      { "id": "c1", "name": "Buy milk", "hasChildren": false, "childCount": 0, "tags": [], "checked": null },
      { "id": "ref_1", "name": "Shopping list", "isReference": true, "targetId": "list_node", "hasChildren": false, "childCount": 0, "tags": [] }
    ]
  }
}
```

**关键设计：**

- `fields` 数组含 `fieldEntryId` + `valueNodeId` → agent 可用于直接 CRUD
- `fields` 含 `type` + `options` → agent 知道如何设值
- `children` 不含 field entry → 减少噪音，agent 不需要过滤
- `children` 标记 `isReference` + `targetId` → agent 区分引用和内容

---

### Tool 3: `node_edit`

```
description: |
  Modify an existing node. Only provided fields are changed. Works on any node
  including field value nodes and reference nodes.

  Use fields parameter to set field values by name — no need to know field entry IDs.
  Or edit field value nodes directly: node_edit(nodeId: valueNodeId, name: "new value").
```

**Parameters:**

```typescript
{
  nodeId: string,
  name?: string,
  content?: string,
  checked?: boolean | null,
  addTags?: string[],
  removeTags?: string[],
  fields?: Record<string, string>,   // 便利字段设值，与 node_create 对称
  parentId?: string,                 // 移动
  position?: number,
}
```

`fields` 处理逻辑与 node_create 一致：按 fieldName fuzzy 匹配 → 根据类型分发 → options auto-collect。

**Returns:**
```json
{ "id": "abc", "name": "...", "updated": ["name", "tags", "fields"] }
```

---

### Tool 4: `node_delete`

```
description: |
  Move a node to Trash, or restore from Trash.
  Works on any node: content, field values, references.
  Deleting a field value node clears that field.
  Deleting a reference removes the link.
```

**Parameters:**

```typescript
{
  nodeId: string,
  restore?: boolean,     // default false
}
```

**Returns:**
```json
{ "id": "abc", "name": "...", "movedToTrash": true }
```

---

### Tool 5: `node_search`

```
description: |
  Search the knowledge graph. Supports text search (fuzzy, CJK), tag filtering,
  field value filtering, backlink lookup, date range, subtree scoping, and
  structured sort. Think of it as Grep for your knowledge graph — more powerful
  than the user's manual search.

  Quick patterns:
  - Text search: node_search(query: "API design")
  - Tag + field: node_search(searchTags: ["task"], fields: {"Status": "Todo"})
  - Backlinks: node_search(linkedTo: "nodeId")  → all nodes referencing this node
  - Subtree: node_search(parentId: "projectId", query: "auth")
  - Count only: node_search(searchTags: ["task"], count: true)
```

**Parameters:**

```typescript
{
  // 文本
  query?: string,                           // fuzzy text search (name + description)

  // 结构过滤
  searchTags?: string[],                    // AND logic — 显示名
  fields?: Record<string, string>,          // 字段值过滤 { "Status": "Todo" }
  linkedTo?: string,                        // 反向引用 — 查找引用此节点的所有节点
  parentId?: string,                        // 限定搜索范围到某子树
  dateRange?: { from?: string, to?: string },

  // 排序
  sort?: {
    field: 'relevance' | 'created' | 'modified' | 'name' | 'refCount',
    order?: 'asc' | 'desc',                // default: desc
  },

  // 分页 & 模式
  limit?: number,                           // default 20, max 50
  offset?: number,                          // default 0
  count?: boolean,                          // true → 只返回 { total } 不返回 items
}
```

**基础设施映射（接线工程，不造新轮子）：**

| 参数 | 接入已有设施 |
|------|------------|
| `query` | fuzzy-search.ts（现有） |
| `searchTags` | search-engine.ts `HAS_TAG`（现有，Phase 1 未接入） |
| `fields` | filter-utils.ts `getFieldValue()` + `matchesFilter()`（现有，Phase 1 未接入） |
| `linkedTo` | backlinks.ts `computeBacklinks()`（现有，Phase 1 未接入） |
| `parentId` | tree-utils.ts `flattenSubtree()`（现有） |
| `sort` | sort-utils.ts multi-field comparators（现有，Phase 1 未接入） |
| `count` | 新增，极简 — `return { total: results.length }` |

**Returns:**
```json
{
  "total": 42,
  "offset": 0,
  "limit": 20,
  "items": [
    {
      "id": "abc",
      "name": "API Auth Design",
      "tags": ["source"],
      "snippet": "API Auth Design — JWT token rotation strategy for...",
      "createdAt": "2026-03-12T...",
      "parentName": "Architecture Notes",
      "fields": { "Status": "In Progress" }
    }
  ]
}
```

`count: true` 时只返回 `{ "total": 42 }`。

search items 新增 `fields` — 在搜索结果中直接展示字段值（如 Status），agent 无需额外 read。

---

### Tool 6: `undo`

```typescript
{ steps?: number }  // default 1, max 20
```

不变。

---

## Agent 工作流验证

确认每个典型场景在新工具下的 round trip 数：

| 场景 | Phase 1 (calls) | Phase 1.5 (calls) |
|------|-----------------|-------------------|
| 创建 Spark 骨架（5 节点 3 层） | 5 | **1** |
| 创建 #task + Status + Priority | 4 | **1** |
| 修改已有节点的字段值 | 3 (read → create × 2) | **1** (node_edit + fields) |
| 碰撞创建 3 个引用 | 3 | **1** (node_create + children) |
| 搜索 #task Status=Todo | 不支持 | **1** (node_search + fields) |
| 查找引用某节点的所有笔记 | 不支持 | **1** (node_search + linkedTo) |
| 统计 #task 完成数 | 不支持 | **1** (node_search + count) |
| 搜索 + 探索 | 2-3 | 2-3（不变） |
| 删除 + 恢复 | 2 | 2（不变） |

---

## 实施计划

### Step 1: 拆分 node-tool.ts + 共享工具函数

| 新文件 | 说明 |
|-------|------|
| `create-tool.ts` | create tool |
| `read-tool.ts` | read tool |
| `edit-tool.ts` | edit tool |
| `delete-tool.ts` | delete tool |
| `search-tool.ts` | search tool |
| `shared.ts` | normalizeTagName, findTagDefIdByName, ensureTagDefIdByName, getTagDisplayNames, stripReferenceMarkup, isSearchCandidate |

删除 `node-tool.ts`。`index.ts` 注册 6 个工具。

### Step 2: create — children + fields + afterId + duplicateId + targetId

- `children` 递归处理（max depth 3）
- `fields` → resolveFieldDef + 类型分发 + auto-collect
- `afterId` → `store.createSibling()`
- `duplicateId` → `store.duplicateNode()`
- `targetId` → `store.addReference()`
- 全部在一个 `withCommitOrigin` 中

### Step 3: read — fields 增强 + children isReference

- fields: `{ name, type, value, fieldEntryId, valueNodeId, options? }`
- children items: `+ isReference, targetId`

### Step 4: edit — fields 便利参数

- 与 create 共享 `resolveAndSetFields()` 逻辑
- 提取到 `shared.ts`

### Step 5: search — 接入已有基础设施

- `fields` → filter-utils.ts `getFieldValue()` + 值匹配
- `linkedTo` → backlinks.ts `computeBacklinks()`
- `parentId` → tree-utils.ts 限定候选集
- `sort` → sort-utils.ts comparators
- `count` → `return { total }`
- 移除 Phase 1 的 brute-force 扫描，改用 search-engine.ts 的结构化过滤

### Step 6: delete — restore

- `restore: true` → `store.restoreNode()`

### Step 7: 测试 + 文档

- 回归：现有 ai-service.test.ts 适配
- 新增：create children + fields, edit fields, ref via create, restore, search fields/linkedTo/count
- 更新：tool-definitions.md

---

## 文件变更汇总

| Action | File | Scope |
|--------|------|-------|
| Create | `src/lib/ai-tools/create-tool.ts` | ~160 行 |
| Create | `src/lib/ai-tools/read-tool.ts` | ~140 行 |
| Create | `src/lib/ai-tools/edit-tool.ts` | ~100 行 |
| Create | `src/lib/ai-tools/delete-tool.ts` | ~50 行 |
| Create | `src/lib/ai-tools/search-tool.ts` | ~160 行（接入 search-engine + filter-utils + backlinks + sort-utils） |
| Create | `src/lib/ai-tools/shared.ts` | ~120 行（含 resolveAndSetFields） |
| Modify | `src/lib/ai-tools/index.ts` | 注册 6 个工具 |
| Delete | `src/lib/ai-tools/node-tool.ts` | 拆分完成后删除 |
| Modify | `docs/plans/tool-definitions.md` | 6 个工具完整 schema |
| Modify | `tests/vitest/ai-service.test.ts` | 适配 |
| Create | `tests/vitest/create-tool.test.ts` | children + fields + ref + sibling + duplicate |
| Create | `tests/vitest/edit-tool.test.ts` | fields 便利参数 |
| Create | `tests/vitest/search-tool.test.ts` | fields filter + linkedTo + count + sort |

---

## Exact Behavior

### 批量创建子树

```
WHEN AI 调用 node_create(parentId: spark, children: [
  { name: "骨架1", children: [{ name: "细节1" }, { name: "细节2" }] },
  { name: "碰撞", children: [{ targetId: "note123" }] }
])
THEN spark 下创建完整树（5 个节点）
  AND 1 个 commit，1 步 undo
```

### 创建 + 标签 + 字段（一步完成）

```
WHEN AI 调用 node_create(name: "Buy groceries", tags: ["task"], fields: { "Status": "Todo", "Priority": "High" })
THEN 创建节点 → 打 #task 标签 → syncTemplateFields → 设 Status=Todo, Priority=High
  AND 1 个 commit，1 步 undo
```

### 编辑已有节点的字段

```
WHEN AI 调用 node_edit(nodeId: "abc", fields: { "Status": "Done" })
THEN Status 字段值从 "In Progress" 变为 "Done"
  AND 如果 "Done" 已是已有 option → selectFieldOption
  AND 如果 "Done" 不存在 → autoCollectOption 创建后选中
```

### 直接操作 field value node（一切皆节点）

```
WHEN AI 调用 node_read(nodeId: "abc")
  → fields: [{ name: "URL", fieldEntryId: "fe_003", valueNodeId: null }]
THEN AI 调用 node_create(parentId: "fe_003", name: "https://example.com")
  → URL 字段值设为 "https://example.com"
```

### 引用创建

```
WHEN AI 调用 node_create(parentId: sparkNode, targetId: "note123")
THEN sparkNode 下新增 reference 子节点指向 "note123"
```

### 批量引用（children）

```
WHEN AI 调用 node_create(parentId: collisionNode, children: [
  { targetId: "note1" }, { targetId: "note2" }, { targetId: "note3" }
])
THEN collisionNode 下创建 3 个 reference 子节点
  AND 1 个 commit，1 步 undo
```

### children 中包含 fields

```
WHEN AI 调用 node_create(parentId: journal, children: [
  { name: "Task 1", tags: ["task"], fields: { "Status": "Todo" } },
  { name: "Task 2", tags: ["task"], fields: { "Status": "Done" }, checked: true }
])
THEN journal 下创建 2 个 #task 节点，各自字段已设好
```

> 注：children 中不支持 checked，这需要在 CreateChildInput 中加 `checked?: boolean`。

### 恢复

```
WHEN AI 调用 node_delete(nodeId: "note_id", restore: true)
THEN 节点从 Trash 恢复
```

---

## 验证标准

1. 6 个工具独立调用，参数类型正确
2. 现有功能回归通过
3. `node_create` children 递归创建子树（max depth 3），1 commit 1 undo
4. `node_create` fields 便利参数正确设值（plain/options/checkbox/url/password）
5. `node_create` targetId 创建引用
6. `node_create` afterId 兄弟、duplicateId 深拷贝
7. `node_edit` fields 便利参数正确设值
8. `node_read` fields 增强输出（type/entryId/valueNodeId/options）
9. `node_read` children 标记 isReference
10. `node_delete` restore=true 恢复
11. `node_search` fields 字段值过滤正确匹配
12. `node_search` linkedTo 返回反向引用
13. `node_search` count=true 只返回 total
14. `node_search` sort 按指定字段排序
15. options 字段 auto-collect 新 option
16. 所有写操作 `AI_COMMIT_ORIGIN`，可 undo 撤销
17. `npm run typecheck && npm run test:run && npm run build` 全过

---

## 提交策略

1. `refactor: split node tool into focused tools (node_create/node_read/node_edit/node_delete/node_search)`
2. `feat: node_create — children batch, fields convenience, reference, sibling, duplicate`
3. `feat: node_read — enhanced fields (type/entryId/options) + isReference in children`
4. `feat: node_edit — fields convenience parameter`
5. `feat: node_search — field filter, backlinks, sort, subtree, count`
6. `feat: node_delete — restore from trash`
7. `test: node tools — create/edit/search fields + children + reference tests`
8. `docs: update tool-definitions.md with Phase 1.5 tools`

---

## Out of Scope

- 字段定义 CRUD → Phase 5
- 富文本 marks → 不需要
- 视图操作 → AI 不应操作
- search OR/NOT 逻辑组合 → Phase 2（基础设施已备 search-engine.ts，Phase 1.5 先用 AND）
- edit 批量（nodeIds 数组）→ 按需后加
