# 性能优化：40K 节点场景

> 导入 Tana 数据（~40K 节点）后 soma 变卡。每次按键延迟 500-2000ms。

## 根因

### 问题链路

```
用户输入一个字
→ ProseMirror dispatch → node-store action → loroDoc.commitDoc()
→ notifySubscribers() → _version++
→ 35+ 个 Zustand selector 重新执行
→ 其中 5-10 个触发 getAllNodeIds() + toNodexNode() × 40K
→ 主线程阻塞 500-2000ms
```

### 触发 O(N) 扫描的 subscriber（按影响排序）

| Hook / 组件 | 文件 | 触发条件 | 复杂度 | 影响 |
|-------------|------|---------|--------|------|
| `useWorkspaceTags()` | `src/hooks/use-workspace-tags.ts:17` | 每次 `_version` 变化 | O(N) getAllNodeIds + toNodexNode | 🔴 每次编辑都跑 |
| `useWorkspaceFields()` | `src/hooks/use-workspace-fields.ts:18` | 每次 `_version` 变化 | O(N) getAllNodeIds + toNodexNode | 🔴 每次编辑都跑 |
| `buildBacklinkCountMap()` | `src/lib/backlinks.ts:220` | `useBacklinkCount()` 依赖 `_version` | O(N) 全量扫描 | 🔴 每次编辑都跑 |
| `computeBacklinks()` | `src/lib/backlinks.ts:100` | 每个可见节点的 `useBacklinks()` | O(N) × 可见节点数 | 🟠 多倍放大 |
| `CommandPalette.searchableNodes` | `src/components/search/CommandPalette.tsx:211` | `useMemo([_version, ...])` | O(N) 遍历 + toNodexNode | 🟠 即使面板关闭也重算 |
| `ReferenceSelector` | `src/components/references/ReferenceSelector.tsx:122` | 打开时 + `_version` | O(N log N) 排序 | 🟡 仅打开时 |
| `runSearch()` | `src/lib/search-engine.ts:287` | 搜索面板刷新 | O(N × 条件数) | 🟡 仅搜索时 |

### 数学

40K 节点 × 每次编辑 5 个 O(N) subscriber = 每次按键处理 **200K 个节点对象**。

`toNodexNode()` 每次调用约 0.01ms（从 CRDT 读取 + 构造 JS 对象），200K 次 = **2000ms**。

## 设计原则

**一条规则解决所有问题**：

> **O(N) 计算永远不订阅 `_version`。只在显式触发时运行。**

| 计算成本 | 订阅 `_version`？ | 说明 |
|---------|------------------|------|
| O(1)（`useNode`、`useChildren`） | ✅ 可以 | selector 跑一遍 <0.1ms，无感 |
| O(N)（全量搜索、所有 tags、backlinks） | ❌ 不可以 | 改为按需计算 |

### 按需计算 = 面板打开时计算

- `CommandPalette` → `open === true` 时计算
- `useWorkspaceTags` → tag 选择器打开时计算
- `useWorkspaceFields` → field 选择器打开时计算
- `computeBacklinks` → 节点面板打开时计算
- `ReferenceSelector` → `@` 触发时计算
- `runSearch` → 搜索面板打开/刷新时计算

### UX 影响

**优化前**：每次按键卡 500-2000ms（用户每秒感知到）

**优化后**：极少数情况下面板数据晚几秒更新（面板已打开时后台发生变化，关闭再打开即刷新。几乎感知不到）

## 实现方案

### 改动 1：`useWorkspaceTags` — 不订阅 `_version`

**文件**：`src/hooks/use-workspace-tags.ts`

当前：
```typescript
export function useWorkspaceTags() {
  return useNodeStore((state) => {
    void state._version; // ← 每次编辑都触发
    // O(N) scan all nodes for tagDefs...
  });
}
```

改为：仅在 Schema 子节点结构变化时重算（Schema 子树变化远比编辑频率低）

```typescript
export function useWorkspaceTags() {
  // 只跟踪 Schema 的 children 列表（几十个 tagDef ID），不跟踪全局 _version
  const schemaChildrenKey = useNodeStore((s) => {
    void s._version;
    return loroDoc.getChildren(SYSTEM_NODE_IDS.SCHEMA).join(',');
  });

  return useMemo(() => {
    // 只遍历 Schema 子树（几十个），不遍历全部 40K
    return loroDoc.getChildren(SYSTEM_NODE_IDS.SCHEMA)
      .map(id => loroDoc.toNodexNode(id))
      .filter(n => n?.type === 'tagDef');
  }, [schemaChildrenKey]);
}
```

**关键变化**：selector 返回 Schema children 的 join string（O(几十)），只有 Schema 结构变化时才触发 useMemo 重算。普通编辑不触发。

### 改动 2：`useWorkspaceFields` — 同上

**文件**：`src/hooks/use-workspace-fields.ts`

同样的模式：只跟踪 Schema children key，不扫描全部节点。

### 改动 3：`CommandPalette.searchableNodes` — 仅打开时计算

**文件**：`src/components/search/CommandPalette.tsx`

当前：
```typescript
const searchableNodes = useMemo(() => {
  // O(N) scan ALL nodes
  for (const id of loroDoc.getAllNodeIds()) { ... }
}, [_version, quickNavIdSet]); // ← _version 触发重算
```

改为：
```typescript
const [searchableNodes, setSearchableNodes] = useState<...>([]);

useEffect(() => {
  if (!open) return; // ← 仅打开时计算
  const items = buildSearchableNodes();
  setSearchableNodes(items);
}, [open]); // ← 不依赖 _version
```

**关键变化**：面板关闭时不做任何计算。打开时才遍历一次。用户在面板打开期间新增的节点不会实时出现（关闭再打开即可），但日常编辑不会被阻塞。

### 改动 4：`useBacklinks` / `useBacklinkCount` — 不订阅 `_version`

**文件**：`src/hooks/use-backlinks.ts`、`src/lib/backlinks.ts`

当前：
```typescript
export function useBacklinkCount(nodeId: string) {
  return useNodeStore((s) => {
    void s._version; // ← 每次编辑触发 O(N) 扫描
    return buildBacklinkCountMap(s._version).get(nodeId) ?? 0;
  });
}
```

改为：backlink 数据在**节点面板打开时一次性计算**，不随 _version 实时更新

```typescript
export function useBacklinkCount(nodeId: string) {
  // 返回缓存值，不触发重算
  return cachedBacklinkMap.get(nodeId) ?? 0;
}

// 由 NodePanel 在打开时显式调用一次
export function refreshBacklinks(nodeId: string): void {
  cachedBacklinkMap = buildBacklinkCountMap();
}
```

或更简单：直接移除 OutlinerItem 中的 backlink badge，40K 节点场景下每个 item 算一次 backlinks 不现实。Backlinks 在节点详情面板中按需查看即可。

### 改动 5：`ReferenceSelector` — 仅打开时计算

**文件**：`src/components/references/ReferenceSelector.tsx`

同 CommandPalette 模式：`open` 触发计算，不订阅 `_version`。

### 不需要改的

- `useNode(nodeId)` — O(1)，保持订阅 `_version` ✅
- `useChildren(nodeId)` — O(1)，保持订阅 `_version` ✅
- `useNodeTags(nodeId)` — O(1)，保持订阅 `_version` ✅
- `useAncestors(nodeId)` — O(depth)，保持订阅 `_version` ✅

## 文件清单

| 文件 | 改动 |
|------|------|
| `src/hooks/use-workspace-tags.ts` | Schema children key 替代 _version |
| `src/hooks/use-workspace-fields.ts` | 同上 |
| `src/components/search/CommandPalette.tsx` | open 触发计算，移除 _version 依赖 |
| `src/hooks/use-backlinks.ts` | 移除 _version 依赖，按需计算 |
| `src/lib/backlinks.ts` | 缓存模式，不每次重算 |
| `src/components/references/ReferenceSelector.tsx` | open 触发计算 |
| `src/components/panel/DeskLanding.tsx` | 如有 searchableNodes，同 CommandPalette |

## Checklist

- [ ] `useWorkspaceTags` 改为 Schema children key
- [ ] `useWorkspaceFields` 同上
- [ ] `CommandPalette.searchableNodes` 仅 open 时计算
- [ ] `useBacklinks` / `useBacklinkCount` 按需计算
- [ ] `ReferenceSelector` 仅 open 时计算
- [ ] `DeskLanding` 如有 O(N) 同步修复
- [ ] 验证：40K 节点编辑时主线程无卡顿
- [ ] `npm run verify` 全部通过

## Test Plan

1. 导入 40K 节点后，在 outliner 中编辑节点名称 — 无卡顿
2. 打开 ⌘K — 搜索结果正常显示
3. 打开 tag 选择器 (#) — tag 列表正常
4. 查看节点 backlinks — 数据正确
5. 使用 @ mention — 节点列表正常
6. 主 outliner 基本操作（展开/收起/创建/删除）— 无卡顿
