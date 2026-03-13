# Phase 1.5.1: AI Tool Data Access Layer

> **目标**：让 AI 工具和数据模型一样灵活——任何节点的任何属性，都能看、能改、能建。

## 问题

当前 AI 工具只暴露了内容节点的常见属性（name/content/checked/tags/fields），无法触达节点的底层 data 属性。具体缺失：

| 操作 | 用户能做 | AI 能做 | 根因 |
|------|---------|---------|------|
| 改字段类型（fieldType） | ✅ | ❌ | node_edit 无 data access |
| 改 tag 颜色 | ✅ | ❌ | 同上 |
| 创建 fieldDef/tagDef | ✅ | ❌ | node_create 无 type/data 参数 |
| 查看节点类型和底层属性 | ✅ | ❌ | node_read 不返回 raw data |
| 设置 tag checkbox 行为 | ✅ | ❌ | 同上 |
| 配置 field cardinality/sourceSupertag | ✅ | ❌ | 同上 |

## 设计原则

只为**需要多步逻辑的复杂变更**保留 dedicated 参数，其余统一走 `data`：

- **dedicated 参数**（保留）：`name`（富文本）、`addTags`/`removeTags`（模板同步）、`fields`（字段解析链）、`checked`（completedAt 映射）、`parentId`/`position`（树结构）
- **`data` 参数**（新增）：`Record<string, unknown>` → 直接调用 `loroDoc.setNodeDataBatch()`，覆盖所有其他属性

一条清晰的分界线：**有特殊逻辑的走 dedicated，没有的走 data**。

## 改动清单

### 1. node_read — 暴露完整节点属性

**文件**：`src/lib/ai-tools/read-tool.ts`

在返回值中增加 `nodeData` 字段，包含节点的所有底层属性。使 AI 可以看到 fieldType、color、cardinality 等。

```typescript
// 返回值新增
const result = {
  // ... 现有字段（id, name, description, tags, fields, checked, parent, breadcrumb, children）
  type: node.type ?? 'content',       // 节点类型
  createdAt: new Date(node.createdAt).toISOString(),
  updatedAt: new Date(node.updatedAt).toISOString(),
  nodeData: buildNodeData(node),       // 底层属性（按节点类型过滤，只返回有值的）
};
```

`buildNodeData(node)` 的实现：遍历 NodexNode 的属性，排除已在顶层展示的（id/name/description/children/tags/createdAt/updatedAt），只返回有值的剩余属性。这样 AI 看到 fieldDef 节点时能看到 `{ fieldType: "options", cardinality: "single", nullable: true }`。

### 2. node_edit — 新增 `data` 参数，移除 `content`

**文件**：`src/lib/ai-tools/edit-tool.ts`

```typescript
const editToolParameters = Type.Object({
  nodeId: Type.String(),
  // --- dedicated（有特殊逻辑）---
  name: Type.Optional(Type.String()),
  checked: Type.Optional(Type.Union([Type.Boolean(), Type.Null()])),
  addTags: Type.Optional(Type.Array(Type.String())),
  removeTags: Type.Optional(Type.Array(Type.String())),
  fields: Type.Optional(Type.Record(Type.String(), Type.String())),
  parentId: Type.Optional(Type.String()),
  position: Type.Optional(Type.Integer({ minimum: 0 })),
  // --- data access（直接设值）---
  data: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});
```

执行逻辑：

```typescript
if (params.data && Object.keys(params.data).length > 0) {
  // 安全检查：禁止通过 data 修改 children/tags/createdAt（有专用 API）
  const BLOCKED_KEYS = ['children', 'tags', 'createdAt', 'id'];
  const safeData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params.data)) {
    if (!BLOCKED_KEYS.includes(key)) {
      safeData[key] = value;
    }
  }
  if (Object.keys(safeData).length > 0) {
    loroDoc.setNodeDataBatch(params.nodeId, safeData);
    updated.add('data');
  }
}
```

**移除 `content` 参数**：它只是 `data: { description: "..." }` 的伪装。用 `data` 统一取代。

更新 tool description，说明 `data` 可设置的典型属性：
- tagDef: `color`, `showCheckbox`, `childSupertag`, `doneStateEnabled`
- fieldDef: `fieldType`, `cardinality`, `nullable`, `sourceSupertag`, `autocollectOptions`
- 通用: `description`, `viewMode`, `locked`

### 3. node_create — 新增 `data` 参数

**文件**：`src/lib/ai-tools/create-tool.ts`

```typescript
const createToolParameters = Type.Object({
  // ... 现有参数
  data: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});
```

执行逻辑：在 `createChild` 后、`applyNodeSetup` 前，调用 `setNodeDataBatch` 应用 `data`。同样排除 BLOCKED_KEYS。

这样 AI 可以：
```
node_create(parentId: "tagDefId", name: "Deadline", data: { type: "fieldDef", fieldType: "date", cardinality: "single" })
```

### 4. 测试

**文件**：`tests/vitest/edit-tool.test.ts`、`tests/vitest/create-tool.test.ts`、`tests/vitest/read-tool.test.ts`

新增测试：
- `node_read` 返回 nodeData（含 fieldType、color 等）
- `node_edit` 通过 `data` 修改 fieldDef 的 fieldType
- `node_edit` 通过 `data` 修改 tagDef 的 color
- `node_edit` 的 `data` 不能修改 BLOCKED_KEYS（children/tags/createdAt）
- `node_create` 通过 `data` 创建 fieldDef 节点
- 移除 `content` 参数的相关测试（如有），改为 `data: { description }` 方式

### 5. 清理

- `edit-tool.ts`：删除 `content` 参数及相关逻辑
- `shared.ts`：`stripReferenceMarkup` 如果只有 `content` 使用，检查是否仍需保留
- Tool description 更新

## 示例场景

```
// AI 读取一个 fieldDef 节点
node_read(nodeId: "attrDef_status")
→ { ..., type: "fieldDef", nodeData: { fieldType: "options", cardinality: "single" } }

// AI 修改字段类型
node_edit(nodeId: "attrDef_status", data: { fieldType: "date" })

// AI 修改 tag 颜色
node_edit(nodeId: "tagDef_task", data: { color: "amber" })

// AI 创建一个 fieldDef
node_create(parentId: "tagDef_task", name: "Deadline", data: { type: "fieldDef", fieldType: "date", cardinality: "single", nullable: true })

// AI 设置 description（替代旧 content 参数）
node_edit(nodeId: "note_1", data: { description: "Some description text" })
```

## BLOCKED_KEYS 安全限制

以下属性禁止通过 `data` 修改（有专用 API 或自动管理）：

| Key | 原因 | 正确方式 |
|-----|------|---------|
| `children` | LoroTree 管理 | `node_create(parentId)` / `node_edit(parentId)` |
| `tags` | 需要模板同步 | `node_edit(addTags/removeTags)` |
| `createdAt` | 只写一次 | 自动设置 |
| `id` | 不可变 | — |

`updatedAt` 不需要 block —— `setNodeDataBatch` 会自动更新它。

## Exact Behavior

### GIVEN 用户让 AI 修改一个 fieldDef 的类型
- WHEN AI 调用 `node_edit(nodeId: fieldDefId, data: { fieldType: "date" })`
- THEN fieldDef 节点的 fieldType 属性被更新为 "date"
- AND 返回值 `updated` 包含 "data"

### GIVEN 用户让 AI 读取一个 tagDef 节点
- WHEN AI 调用 `node_read(nodeId: tagDefId)`
- THEN 返回值包含 `type: "tagDef"` 和 `nodeData: { color: "sage", showCheckbox: true, ... }`

### GIVEN AI 尝试通过 data 修改 children
- WHEN AI 调用 `node_edit(nodeId: "x", data: { children: [...] })`
- THEN `children` 键被过滤掉，不执行
- AND 其余合法的 data 键正常设置

### GIVEN AI 使用 data.description 替代旧 content 参数
- WHEN AI 调用 `node_edit(nodeId: "x", data: { description: "new desc" })`
- THEN 节点的 description 被更新
