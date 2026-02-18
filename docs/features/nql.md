# Feature: NQL（Nodex Query Language）

> Query Infra | Draft v1

## 概述

NQL 是 Nodex 的标准查询语言，形态是 **结构化 JSON AST**，不是 SQL 字符串，也不是 DSL 文本。

NQL 目标是统一三条输入链路：

1. Query Builder（可视化构建）→ NQL
2. 自然语言（LLM）→ NQL
3. 模板/配置（Tuple）→ NQL

执行层再把 NQL 编译成「SQL + 图遍历」混合计划。

---

## 架构定位

NQL 对应整体架构中的“语言模型层”：

- **写模型（Source of Truth）**：节点图（Node + Tuple + Metanode + AssociatedData）
- **读模型（Query Facts）**：查询事实投影（派生层，不是业务真值）
- **语言模型（NQL AST）**：统一查询表达

关键约束：

1. 业务真值永远在节点图，不在 Query Facts。
2. NQL 是规范化中间表示（Canonical Query Form）。
3. SQL 只是执行后端，不是用户层查询语言。

---

## NQL v1 结构

```json
{
  "version": 1,
  "scope": {
    "workspaceId": "ws_xxx",
    "rootNodeId": "optional",
    "includeArchived": false
  },
  "from": {
    "tagId": "tagDef_task",
    "includeSubtags": true
  },
  "where": {
    "and": [
      { "fieldId": "attrDef_status", "op": "eq", "value": { "type": "nodeRef", "nodeId": "opt_todo" } },
      { "fieldId": "attrDef_due", "op": "before", "value": { "type": "relativeDate", "keyword": "today" } }
    ]
  },
  "sort": [
    { "fieldId": "attrDef_priority", "dir": "desc", "nulls": "last" }
  ],
  "group": [
    { "fieldId": "attrDef_project", "bucket": "exact" }
  ],
  "limit": 100,
  "offset": 0,
  "view": {
    "mode": "table",
    "viewDefId": "viewDef_default"
  }
}
```

### 顶层字段

| 字段 | 必填 | 说明 |
|------|------|------|
| `version` | 是 | NQL 协议版本，v1 固定为 `1` |
| `scope` | 是 | 工作区和上下文范围 |
| `from` | 否 | 起始集合（例如某标签、某节点子树） |
| `where` | 否 | 过滤表达式树（AND/OR/NOT + predicate） |
| `sort` | 否 | 多级排序 |
| `group` | 否 | 分组配置 |
| `limit/offset` | 否 | 分页 |
| `view` | 否 | 结果展示偏好（与 ViewDef 对齐） |

---

## 表达式模型

### 逻辑节点

```json
{ "and": [Expr, Expr, ...] }
{ "or": [Expr, Expr, ...] }
{ "not": Expr }
```

### 条件节点（Predicate）

```json
{
  "fieldId": "attrDef_xxx",
  "op": "eq",
  "value": { "type": "text", "text": "foo" }
}
```

### v1 操作符（最小集）

- 比较：`eq`, `neq`, `gt`, `gte`, `lt`, `lte`
- 集合：`in`, `not_in`
- 存在性：`defined`, `not_defined`
- 文本：`contains`, `not_contains`
- 层级：`child_of`, `descendant_of`
- 标签：`has_tag`
- 日期：`before`, `after`, `between`

### 关键词语法糖（编译期降级）

NQL v1 不把 `TODO/DONE/OVERDUE/CREATED_LAST_X_DAYS` 当独立执行器能力，而是编译为基础 predicate 组合。

---

## 值类型（Value）

```json
{ "type": "text", "text": "hello" }
{ "type": "number", "number": 42 }
{ "type": "boolean", "boolean": true }
{ "type": "nodeRef", "nodeId": "abc" }
{ "type": "dateNodeRef", "nodeId": "day_2026_02_18" }
{ "type": "relativeDate", "keyword": "today" }
{ "type": "list", "items": [ ... ] }
```

日期规则：

1. 日期字段的业务真值是 `dateNodeRef`（day `journalPart` 节点）。
2. 运行时可借助 Query Facts 中的 `date_epoch` 做区间比较。

---

## 与节点模型的映射

NQL 不是替代 Tuple，而是 Tuple 的标准化查询视图。

### SearchNode 持久化（目标形态）

```text
SearchNode (doc_type='search')
  └── Metanode
      ├── Tuple [SYS_A15, nqlRootTupleId]  // 查询根
      ├── Tuple [SYS_A16, viewDefId]       // 结果视图
      └── Tuple [SYS_A14, tagDefId]        // 新建结果默认标签（可选）
```

### ViewDef 持久化（目标形态）

```text
ViewDef Metanode
  ├── Tuple [SYS_A18, filterTupleId]
  ├── Tuple [SYS_A19, sortDirection]
  ├── Tuple [SYS_A20, sortFieldId]
  └── Tuple [NDX_A09, groupFieldId]    // Group key（Nodex 约定）
```

> `NDX_A09` 为 Group 的预留 key 约定；落地实现时需在 `system-nodes.ts` 同步定义。

---

## 执行管线

1. **Parse/Load**：读取 Query Builder、NL、或 Tuple 输入。
2. **Normalize**：统一到 NQL v1 AST。
3. **Validate**：JSON Schema + 语义校验（字段存在、类型匹配、权限范围）。
4. **Plan**：拆分可下推 SQL 与必须图遍历的阶段。
5. **Execute**：查询事实层 + 节点图回补。
6. **Materialize**：`run_once` 直接返回；`save` 回写 SearchNode children。

---

## 错误模型（v1）

| 代码 | 含义 |
|------|------|
| `NQL_PARSE_ERROR` | 输入无法解析为合法 NQL |
| `NQL_SCHEMA_ERROR` | JSON 结构不符合 schema |
| `NQL_SEMANTIC_ERROR` | 字段/操作符/值类型不匹配 |
| `NQL_UNRESOLVED_SYMBOL` | 名称无法解析到节点 ID |
| `NQL_EXEC_PLAN_ERROR` | 查询规划失败 |
| `NQL_EXEC_RUNTIME_ERROR` | 执行阶段失败 |

---

## 与 LLM 的集成约束

1. LLM 只输出 NQL JSON，不输出 SQL。
2. 输出必须符合 NQL JSON Schema（结构化函数调用）。
3. 允许 `warnings` 字段返回不确定解析结果，UI 必须给用户确认入口。

---

## 非目标（v1 不做）

1. 不直接暴露 SQL 给用户。
2. 不支持任意脚本执行（安全边界）。
3. 不引入第二套查询真值存储（避免与 Tuple 双真值）。

---

## 决策记录

| 日期 | 决策 | 原因 |
|------|------|------|
| 2026-02-18 | NQL 采用 JSON AST（非 DSL 字符串） | 便于结构化校验、LLM 输出约束、可逆映射 |
| 2026-02-18 | SQL 定位为执行后端，不是用户语言 | 避免把存储实现泄漏到产品层 |
| 2026-02-18 | 保持写模型=节点图，读模型=查询事实 | 同时满足“一切皆节点”和执行性能 |
