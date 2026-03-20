# Node Tools Redesign — Tana Paste 统一格式

> 解决 node_create JSON 嵌套数组导致的解析错误，统一所有 node 工具的参数风格。
>
> **2026-03-20** — 产品讨论定稿

## 背景

### 问题

`node_create` 有 10 个参数，其中 `children` 是递归嵌套的 JSON 数组。LLM 生成复杂嵌套 JSON 时频繁出错（未闭合字符串、尾部逗号、结构混乱），导致工具调用失败。

此外 `node_create` 和 `node_edit` 使用不同的"语言"描述同一件事：
- 创建时：`tags: ["task"]`, `fields: {"Status": "Todo"}`, `children: [{name: "..."}]`
- 编辑时：`addTags: ["task"]`, `fields: {"Status": "Todo"}`

LLM 在同一对话中交替调用两个工具时，容易混淆格式。

### 设计原则

1. **文本优于 JSON 结构** — LLM 生成自然文本远比生成正确嵌套 JSON 可靠
2. **格式一致** — create 和 edit 用同一套"语言"描述节点内容
3. **复用已有格式** — Tana Paste 是成熟的文本格式，LLM 训练数据中已大量存在
4. **纯 ID 引用** — soma 与 Tana 一样"一切皆节点"，引用通过 ID 而非名字，使用 `[[name^id]]` 格式
5. **统一顶层 verb，区分底层 payload** — 创建动作统一在 `node_create`，通过 `type` 区分 content node 与 search node，但不强制共享同一个 payload 结构
6. **读写分离** — `node_search` 保持纯 read-only，不混入写副作用

---

## 竞品调研：引用格式

| 应用 | 引用语法 | 存储方式 | 重名策略 |
|------|----------|----------|----------|
| **Roam** | `[[Page Name]]` / `((uid))` | 页面按名字，block 按 UID | 不允许重名页面 |
| **Tana** | `@` picker → ID | 纯 ID | 允许重名，picker + 面包屑区分 |
| **Obsidian** | `[[File Name]]` | 文件名 | 路径消歧 |
| **Logseq** | `[[Page Name]]` / `((uuid))` | 页面按名字，block 按 UUID | 不允许重名 |
| **Notion** | `@` picker → UUID | 纯 UUID | 允许重名，picker + 面包屑 |

soma 采用 **Tana/Notion 路线**：纯 ID 引用，允许重名。AI 工具使用 `[[显示文本^nodeId]]` 格式（Tana Paste 标准）。

---

## Tana Paste 格式规范（node 工具子集）

```
- 节点名 #tag1 #tag2
  - field1:: value
  - field2::
    - value1
    - value2
    - [[引用节点名^nodeId]]
  - field3:: [X]
  - 普通子节点
  - 另一个子节点 #tag3
    - 孙节点
```

### 语法规则

| 元素 | 语法 | 说明 |
|------|------|------|
| 节点名 | 第一行文本 | 节点的 name |
| 层级 | 缩进（2 空格） | 子节点关系 |
| 标签 | `#tagName` | 不存在则自动创建 tagDef |
| 字段（单值） | `field:: value` | 行内直接写值 |
| 字段（多值） | `field::\n  - v1\n  - v2` | 无行内值，子行是值 |
| 字段（清除） | `field::` | 空值 = 清除（仅 edit） |
| 引用 | `[[显示文本^nodeId]]` | Tana Paste 标准，纯 ID 定位 |
| Checkbox | `[X]` / `[ ]` | true / false |
| 日期 | `2026-03-20` | 普通日期字符串（date picker） |

---

## 工具定义

### node_create — 创建节点

通过 `type` 参数区分创建模式。省略 `type` 时默认创建 content node。

#### Content node（默认）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `text` | string | 否* | Tana Paste 格式。第一行=节点名，后续行=子节点/字段 |
| `parentId` | string | 否 | 父节点 ID。省略=今日日记 |
| `afterId` | string | 否 | 插入在此兄弟节点之后。省略=追加到末尾 |

\* `text` 是主要参数，几乎所有场景都需要。

#### Search node（`type: "search"`）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `"search"` | 是 | 创建搜索节点 |
| `name` | string | 是 | 搜索节点名称 |
| `rules` | object | 是 | 搜索规则（可持久化的查询定义） |
| `parentId` | string | 否 | 父节点 ID。省略=今日日记 |
| `afterId` | string | 否 | 插入位置 |

`rules` 对象包含**可持久化**的查询条件（不含 `limit`/`offset`/`count` 等执行态参数）：

```ts
rules: {
  searchTags?: string[];    // 标签过滤（AND 逻辑）
  fields?: Record<string, string>;  // 字段值过滤
  linkedTo?: string;        // 反向链接
  parentId?: string;        // 子树作用域
  after?: string;           // 日期下限
  before?: string;          // 日期上限
  sortBy?: string;          // 默认排序，如 "created:desc"
}
```

#### 为什么 search node 不用 `text`

- Content `text` 是"把人类表达解析成节点树"——适合 Tana Paste
- Search `rules` 是"持久化的结构化查询定义"——适合 JSON 对象
- 二者不是同一种信息，硬塞进同一个 `text` 会变成"一字段两种语言"
- Search rules 最终落为 queryCondition 节点树，创建入口就应该承认它是结构化定义

#### 示例

**创建简单节点**（content，省略 type）
```json
{ "text": "买菜 #task" }
```

**创建带字段的节点**
```json
{
  "text": "竞品分析 #research\nSource:: https://example.com\nStatus:: In Progress\n  观点1\n  观点2"
}
```

**创建引用节点**
```json
{
  "text": "[[竞品分析^abc123]]",
  "parentId": "todayNodeId"
}
```

**创建多层级树**
```json
{
  "text": "项目计划 #project\nDue:: 2026-04-01\n  Phase 1\n    设计文档\n    技术调研\n  Phase 2\n    开发\n    测试",
  "parentId": "parentNodeId"
}
```

**指定位置插入**
```json
{
  "text": "新任务 #task",
  "parentId": "projectId",
  "afterId": "task3Id"
}
```

**创建搜索节点**
```json
{
  "type": "search",
  "name": "未完成的任务",
  "rules": {
    "searchTags": ["task"],
    "fields": { "Status": "Todo" }
  }
}
```

**创建带日期范围的搜索节点**
```json
{
  "type": "search",
  "name": "本月研究笔记",
  "rules": {
    "searchTags": ["research"],
    "after": "2026-03-01",
    "before": "2026-03-31",
    "sortBy": "created:desc"
  },
  "parentId": "projectId"
}
```

---

### node_edit — 编辑节点

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `nodeId` | string | 是 | 要编辑的节点 ID |
| `text` | string | 否 | Tana Paste 格式，表达要设置/追加的内容 |
| `removeTags` | string[] | 否 | 要移除的标签名（Tana Paste 无法表达"删除"） |
| `parentId` | string | 否 | 移动到新父节点 |
| `afterId` | string | 否 | 移动到此兄弟之后 |

#### `text` 在 edit 中的语义

与 create 不同，edit 的 `text` 是 **增量/设置** 语义：

| text 内容 | 效果 |
|-----------|------|
| 第一行文本 | 重命名节点 |
| `#tag` | 添加标签 |
| `field:: value` | 设置字段值 |
| `field::` | 清除字段值 |
| `[X]` / `[ ]` | 设置 checkbox 状态 |

#### 示例

**重命名**
```json
{ "nodeId": "abc123", "text": "新名字" }
```

**添加标签 + 设置字段**
```json
{ "nodeId": "abc123", "text": "#task\nStatus:: Done\n[X]" }
```

**移除标签**
```json
{ "nodeId": "abc123", "removeTags": ["task"] }
```

**移动节点**
```json
{ "nodeId": "abc123", "parentId": "newParentId", "afterId": "siblingId" }
```

**组合操作（改名 + 加标签 + 移动）**
```json
{
  "nodeId": "abc123",
  "text": "更新后的名字 #important",
  "parentId": "newParentId"
}
```

---

### node_read — 读取节点（不变）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `nodeId` | string | 否 | 节点 ID。省略=工作区根。快捷值：`"journal"`, `"schema"` |
| `depth` | integer | 否 | 递归深度 0-3，默认 1 |
| `childOffset` | integer | 否 | 子节点分页偏移，默认 0 |
| `childLimit` | integer | 否 | 每页子节点数 1-50，默认 20 |

无需修改。4 个参数，全是简单值。

---

### node_delete — 删除节点（不变）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `nodeId` | string | 是 | 节点 ID |
| `restore` | boolean | 否 | `true`=从回收站恢复，省略=移到回收站 |

无需修改。2 个参数。

---

### node_search — 搜索节点（纯 read-only，小幅简化）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `query` | string | 否 | 模糊文本搜索（CJK 感知） |
| `searchTags` | string[] | 否 | 按标签过滤（AND 逻辑） |
| `fields` | object | 否 | 按字段值过滤，如 `{"Status": "Todo"}` |
| `linkedTo` | string | 否 | 查找引用了此节点的所有节点（反向链接） |
| `parentId` | string | 否 | 限制在此节点的子树内搜索 |
| `after` | string | 否 | 创建日期下限（含），ISO 格式 |
| `before` | string | 否 | 创建日期上限（含），ISO 格式 |
| `sortBy` | string | 否 | 排序，如 `"created:desc"`, `"modified:asc"`, `"relevance"` |
| `limit` | integer | 否 | 每页结果数 1-50，默认 20 |
| `offset` | integer | 否 | 分页偏移，默认 0 |
| `count` | boolean | 否 | `true`=只返回总数 |

**变化**：
- `dateRange: {from, to}` → `after` + `before`（消除 JSON 对象，与 past_chats 一致）
- `sort: {field, order}` → `sortBy` 单个字符串（如 `"created:desc"`）
- **移除 `saveName`** — `node_search` 保持纯 read-only，search node 创建统一走 `node_create(type: "search")`
- `fields` 保留 JSON 对象（搜索过滤是 query 语义，扁平 map 可接受）

---

### undo — 撤销（不变）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `steps` | integer | 否 | 撤销步数 1-20，默认 1 |

无需修改。1 个参数。

---

## 变更总结

| 工具 | 现状 | 新方案 | 参数数 |
|------|------|--------|--------|
| **node_create** | 10 参数，含递归 JSON 数组 | content: 3 参数 (Tana Paste) / search: 5 参数 (structured rules) | 10 → 3~5 |
| **node_edit** | 9 参数，JSON 对象，与 create 格式不一致 | 5 参数，Tana Paste 文本，与 create 一致 | 9 → 5 |
| **node_read** | 4 参数 | 不变 | 4 |
| **node_delete** | 2 参数 | 不变 | 2 |
| **node_search** | 10 参数，3 个 JSON 对象 | 11 参数，1 个 JSON 对象，纯 read-only | 消除 2 个对象 |
| **undo** | 1 参数 | 不变 | 1 |

### 核心收益

1. **Tana Paste 统一格式** — create 和 edit 用同一套语法描述节点内容
2. **消除嵌套 JSON** — node_create 不再有 `children` 递归数组
3. **LLM 友好** — 文本格式比 JSON 结构更可靠，且 LLM 对 Tana Paste 有训练数据
4. **减少认知负担** — 标签始终是 `#tag`，字段始终是 `field:: value`，引用始终是 `[[name^id]]`
5. **读写分离** — `node_search` 纯 read-only，search node 创建统一在 `node_create`
6. **统一创建入口** — content node 和 search node 都通过 `node_create`，用 `type` 区分

---

## 实施计划

### Phase 1：Tana Paste 解析器 + node_create content
- 新建 Tana Paste 解析器（`text` → 节点树）
- 替换现有 `children` 递归逻辑
- 保留 `parentId` / `afterId`
- 测试覆盖：简单节点、多层级、标签、字段、引用、checkbox

### Phase 2：node_create search
- 新增 `type: "search"` 分支
- 实现 `rules` → queryCondition 节点树转换
- 测试覆盖：各种 rules 组合

### Phase 3：node_edit 统一
- 替换 `name`/`addTags`/`fields`/`checked`/`data` 为 `text` 参数
- 保留 `removeTags`（Tana Paste 无法表达删除）
- 保留 `parentId`/`afterId`（移动功能）
- 移除 `position`（改用 `afterId`）

### Phase 4：node_search 简化
- `dateRange` → `after` + `before`
- `sort` → `sortBy`
- 移除 `saveName`

### Phase 5：更新 system prompt
- 工具描述中加入 Tana Paste 格式说明和示例
- 加入 search node 创建示例
- 移除旧参数文档
