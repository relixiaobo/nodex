# 性能优化：40K 节点场景

> 导入 Tana 数据（~40K 节点）后 soma 变卡。每次按键延迟 500-2000ms。

## 根因

```
用户输入一个字
→ commitDoc() → _version++
→ 35+ 个 Zustand selector 重新执行
→ 其中 5-10 个触发 getAllNodeIds() + toNodexNode() × 40K
→ 主线程阻塞 500-2000ms
```

## 设计原则

> **O(N) 计算永远不订阅 `_version`。只在显式触发时运行。**

| 计算成本 | 订阅 `_version`？ |
|---------|------------------|
| O(1)（`useNode`、`useChildren`） | ✅ 可以 |
| O(N)（全量扫描、搜索、backlinks） | ❌ 改为按需计算 |

## 瓶颈与修法

### 策略 A：打开时构建快照

适用于面板/弹窗类 UI——关闭时不计算，打开时一次性构建。

**1. CommandPalette.searchableNodes**

文件：`src/components/search/CommandPalette.tsx:211`
当前：`useMemo([_version])` → 每次编辑重算 40K 节点
修法：`useState` + `useEffect([open])`，仅打开时计算

```typescript
const [searchableNodes, setSearchableNodes] = useState<...>([]);
useEffect(() => {
  if (!open) return;
  setSearchableNodes(buildSearchableNodes());
}, [open]);
```

**2. useNodeSearch（⌘K + @ mention 共用）**

文件：`src/hooks/use-node-search.ts:31-88`
当前：selector 依赖 `_version`，每次 query 变化遍历 `getAllNodeIds()` × 40K
修法：预构建候选集（同 CommandPalette 的 searchableNodes），搜索只在候选集上跑

```typescript
// 候选集在面板打开时构建一次（O(N)），后续按键只在候选集上搜索（O(candidates)）
export function useNodeSearch(query: string, candidates: SearchCandidate[], excludeId?: string) {
  return useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return candidates
      .filter(c => c.id !== excludeId && c.name.toLowerCase().includes(q))
      .sort(...)
      .slice(0, MAX_RESULTS);
  }, [query, candidates, excludeId]);
}
```

调用方（CommandPalette、ReferenceSelector）在打开时构建 candidates 并传入。

**3. ReferenceSelector recent list**

文件：`src/components/references/ReferenceSelector.tsx:122`
当前：打开时 O(N log N) 排序
修法：同上，共用 candidates 快照

### 策略 B：子树级别失效

适用于 Schema 相关的 hook——只在 Schema 子树变化时重算，但要覆盖重命名/类型修改。

**4. useWorkspaceTags**

文件：`src/hooks/use-workspace-tags.ts`
当前：`void state._version` + `getAllNodeIds()` O(N) 扫描全部节点找 tagDef

**问题**：如果只监听 `SCHEMA.children`（列表），重命名 tag 不改列表，selector 不会重算。
**修法**：监听 `_version` 但只遍历 Schema 的子节点（几十个），不遍历全部 40K

```typescript
export function useWorkspaceTags() {
  const json = useNodeStore((state) => {
    void state._version;
    const tags: Array<{ id: string; name: string }> = [];
    // 只遍历 Schema 子树（几十个 tagDef），不遍历全部 40K
    for (const id of loroDoc.getChildren(SYSTEM_NODE_IDS.SCHEMA)) {
      const node = loroDoc.toNodexNode(id);
      if (node?.type === 'tagDef' && node.locked !== true) {
        tags.push({ id, name: node.name ?? 'Untitled' });
      }
    }
    tags.sort((a, b) => a.name.localeCompare(b.name));
    return JSON.stringify(tags);
  });
  return useMemo(() => JSON.parse(json), [json]);
}
```

**关键变化**：从 `getAllNodeIds()`（40K）→ `getChildren(SCHEMA)`（几十个）。仍然订阅 `_version`（所以重命名/类型修改能感知到），但每次 selector 只读几十个节点而非 4 万个。JSON.stringify 确保返回值不变时不触发 re-render。

**5. useWorkspaceFields — 同上**

### 策略 C：badge 与排序分离

适用于 backlinks——badge 可滞后，排序必须同步。

**6. Backlinks**

文件：`src/hooks/use-backlinks.ts`、`src/lib/backlinks.ts`、`src/lib/view-pipeline.ts:132`

当前：`useBacklinkCount` 订阅 `_version` → `buildBacklinkCountMap()` O(N) 扫描

**问题**：`buildBacklinkCountMap` 被两个消费者使用——
- OutlinerItem badge（显示引用数）— 可以滞后
- view-pipeline refCount 排序 — 必须同步正确

**修法**：

**Badge（OutlinerItem）**：不订阅 `_version`，导航到节点时计算一次。

```typescript
// useBacklinkCount 不再订阅 _version
export function useBacklinkCount(nodeId: string): number {
  // 返回缓存值（可能滞后），不触发 O(N) 重算
  return getCachedBacklinkCount(nodeId);
}
```

**排序（view-pipeline）**：保持同步，但只在 refCount 排序激活时才计算。当前代码已有 `needsRefCount` 守卫（line 132），只有用户配置了 refCount 排序时才调用 `buildBacklinkCountMap`。这本身已是按需。对于 40K 节点 + refCount 排序的场景，这仍然是 O(N)，但这是用户显式选择的排序方式，不是默认行为。

## 不需要改的

- `useNode(nodeId)` — O(1) ✅
- `useChildren(nodeId)` — O(1) ✅
- `useNodeTags(nodeId)` — O(1) ✅
- `useAncestors(nodeId)` — O(depth) ✅
- `view-pipeline refCount sort` — 已有 `needsRefCount` 守卫，按需 ✅

## 文件清单

| 文件 | 改动 | 策略 |
|------|------|------|
| `src/hooks/use-workspace-tags.ts` | `getAllNodeIds` → `getChildren(SCHEMA)` | B |
| `src/hooks/use-workspace-fields.ts` | 同上 | B |
| `src/components/search/CommandPalette.tsx` | open 触发，移除 _version | A |
| `src/hooks/use-node-search.ts` | 接受 candidates 参数，不自己扫描 | A |
| `src/components/references/ReferenceSelector.tsx` | open 触发 candidates 构建 | A |
| `src/hooks/use-backlinks.ts` | badge 不订阅 _version | C |
| `src/lib/backlinks.ts` | badge 缓存，排序保持同步 | C |
| `src/components/panel/DeskLanding.tsx` | 如有 O(N)，同 A | A |

## Checklist

- [ ] `useWorkspaceTags` 改为只遍历 Schema 子树
- [ ] `useWorkspaceFields` 同上
- [ ] `CommandPalette.searchableNodes` 仅 open 时计算
- [ ] `useNodeSearch` 接受外部 candidates，不自己 getAllNodeIds
- [ ] `ReferenceSelector` open 时构建 candidates
- [ ] `useBacklinkCount` badge 不订阅 _version
- [ ] view-pipeline refCount 排序保持现有逻辑不变
- [ ] 验证：40K 节点编辑无卡顿
- [ ] `npm run verify` 全部通过

## Test Plan

1. 40K 节点下编辑节点名称 — 无卡顿
2. ⌘K 搜索 — 结果正确
3. Tag 选择器 (#) — 列表正确，重命名后打开能看到新名称
4. @ mention 输入 — 按键无卡顿，结果正确
5. Backlinks badge — 显示正确（导航后刷新）
6. refCount 排序视图 — 排序正确
7. 展开/收起/创建/删除 — 无卡顿
