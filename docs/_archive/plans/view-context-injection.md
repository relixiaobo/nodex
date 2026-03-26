# View Context Injection — 让 AI 看到用户看到的

> 2026-03-23

## 核心原则

**格式一致**：上下文注入的数据结构与 `node_read` 工具返回值完全相同。AI 只需要理解一种数据格式——JSON ChildSummary。不引入自定义标记（`▼ expanded`、`▶ 3 children` 等），避免 AI 在工具调用中模仿错误格式。

## 现状

`buildPanelContext()` 在 `ai-context.ts` 中已存在，注入到 system-reminder：

```xml
<panel-context>
Current panel: Journal > Week 13 > Today (ID: ws_JOURNAL_day_2026-03-23)
Children (3):
  - "伊朗战争" (id: abc123, 5 children, checkbox: undone)
  - "你好" (id: def456, 0 children)
  - "test" (id: ghi789, 1 children)
</panel-context>
```

### 问题

1. **自定义格式** — 不是 JSON，与 `node_read` 返回的 ChildSummary 格式不同
2. **不跟随展开状态** — 只列直接子节点，不知道用户展开了哪些
3. **无焦点信息** — 不知道用户在编辑哪个节点
4. **无增量机制** — 每次都发完整快照

## 方案

### 数据格式

直接复用 `node_read` 的 `summarizeChildren` 输出的 ChildSummary 结构。上下文注入的 JSON 与 `node_read` 返回值的 `children` 字段完全一致：

```json
{
  "currentView": {
    "id": "ws_JOURNAL_day_2026-03-23",
    "name": "Today, Mon, Mar 23",
    "tags": ["day"],
    "breadcrumb": ["Journal", "2026", "Week 13"],
    "focusedNodeId": "timeline_node_1",
    "children": {
      "total": 3,
      "items": [
        {
          "id": "abc123",
          "name": "2026年伊朗战争",
          "hasChildren": true,
          "childCount": 5,
          "tags": ["地缘政治"],
          "checked": null,
          "children": {
            "total": 5,
            "items": [
              { "id": "c1", "name": "别名", "hasChildren": true, "childCount": 1, "tags": [], "checked": null },
              { "id": "c2", "name": "开战时间", "hasChildren": false, "childCount": 0, "tags": [], "checked": null },
              {
                "id": "c3", "name": "时间线", "hasChildren": true, "childCount": 12, "tags": [], "checked": null,
                "children": {
                  "total": 12,
                  "items": [
                    { "id": "c3a", "name": "第一周", "hasChildren": true, "childCount": 4, "tags": [], "checked": null },
                    { "id": "c3b", "name": "第二周", "hasChildren": true, "childCount": 3, "tags": [], "checked": null }
                  ]
                }
              }
            ]
          }
        },
        { "id": "def456", "name": "你好", "hasChildren": false, "childCount": 0, "tags": [], "checked": null }
      ]
    }
  }
}
```

### 关键规则

| 规则 | 说明 | 原因 |
|------|------|------|
| **展开的节点**递归返回 children | AI 看到用户展开了什么 | 跟用户视角一致 |
| **折叠的节点**只返回 `hasChildren: true, childCount: N` | AI 知道可以用 `node_read(nodeId)` 查看 | 省 token |
| **叶子节点** `hasChildren: false, childCount: 0` | AI 不会尝试展开 | 减少无效工具调用 |
| **每层最多 10 个子节点** | 超出的不包含 | 控制 token 上限 |
| **最多 3 层递归** | 即使用户展开更深也截断 | 防止 token 爆炸 |
| **标签只到前 2 层** | 深层不包含 tags | 减少噪音 |
| **包含 focusedNodeId** | AI 知道用户在编辑什么 | 高价值低成本 |

### 展开状态跟随逻辑

```typescript
function summarizeVisibleTree(
  nodeId: string,
  expandedNodes: Set<string>,
  panelId: string,
  depth: number = 0,
  maxDepth: number = 3,
  maxChildrenPerLevel: number = 10,
): ChildSummary {
  const node = loroDoc.toNodexNode(nodeId);
  const contentChildIds = getReadableChildIds(nodeId);
  const expandKey = buildExpandedNodeKey(panelId, parentId, nodeId); // PR #173 之后
  const isExpanded = expandedNodes.has(expandKey);

  const summary: ChildSummary = {
    id: nodeId,
    name: node?.name ?? '',
    hasChildren: contentChildIds.length > 0,
    childCount: contentChildIds.length,
    tags: depth <= 1 ? getTagDisplayNames(node?.tags ?? []) : [],
    checked: toCheckedValue(nodeId),
  };

  // 只递归展开的节点，且未超过最大深度
  if (isExpanded && depth < maxDepth && contentChildIds.length > 0) {
    const pagedIds = contentChildIds.slice(0, maxChildrenPerLevel);
    summary.children = {
      total: contentChildIds.length,
      items: pagedIds.map(childId =>
        summarizeVisibleTree(childId, expandedNodes, panelId, depth + 1, maxDepth, maxChildrenPerLevel)
      ),
    };
  }

  return summary;
}
```

### 注入时机

| 场景 | 注入内容 | token 估算 |
|------|---------|-----------|
| 用户发第一条消息 | 完整可见树快照 | ~100-300 tokens |
| 后续消息，节点未变 | 不注入 | 0 |
| 后续消息，切换了根节点 | 新的完整快照 | ~100-300 tokens |
| 后续消息，展开/折叠了节点 | 增量描述 | ~30-50 tokens |
| 后续消息，编辑了节点 | `editedNodes` 列表 | ~20-40 tokens |

### 增量策略

保留上次注入的快照（`lastInjectedSnapshot`）。每次发消息时：

1. 构建当前快照
2. 与上次快照 diff：
   - 根节点变了 → 发完整快照
   - 根节点没变但展开状态变了 → 只描述变化
   - 什么都没变 → 不注入
3. 保存当前快照为 `lastInjectedSnapshot`

增量格式（也用 JSON，与 `node_read` 兼容）：

```json
{
  "viewChanges": {
    "expanded": ["timeline_node_1"],
    "collapsed": ["impact_node_2"],
    "edited": [
      { "id": "c3a", "name": "第一周 → 开战日" }
    ],
    "created": [
      { "id": "new1", "name": "第三周", "parentId": "c3" }
    ]
  }
}
```

### 与 system-reminder 的整合

替换现有的 `buildPanelContext()`。新的 `buildViewContext()` 返回：

```xml
<view-context>
{JSON 格式的 currentView}
</view-context>
```

JSON 在 XML 标签内——system-reminder 的结构不变，只是内容升级为 JSON。AI 看到的数据结构与 `node_read` 完全一致。

### 实施顺序

1. **PR #173 先合并**（scoped expand keys）— 需要 panelId 参数
2. **实现 `summarizeVisibleTree`** — 复用 `node_read` 的 helper 函数
3. **替换 `buildPanelContext`** — 新的 `buildViewContext`
4. **加 `focusedNodeId`** — 从 ui-store 读取
5. **增量策略** — 保留 lastSnapshot，diff

### 不做的事情

- **不用自定义标记格式** — 不用 `▼`、`▶`、`leaf` 等，纯 JSON
- **不注入字段值** — AI 要看字段用 `node_read`
- **不注入节点描述** — 太长，AI 按需获取
- **不持久化快照** — 只在会话内保留
