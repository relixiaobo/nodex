# 性能优化：40K 节点场景

> 导入 Tana 数据后 soma 变卡。根因：`_version` 通知模型在大数据量下引发级联 O(N) 扫描。

## 根因

一次编辑的级联：
```
用户输入一个字
→ commitDoc() → _version++
→ 35+ 个 Zustand selector 重新执行
→ 其中 5-10 个触发 getAllNodeIds() + toNodexNode() × 40K
→ 主线程阻塞 500-2000ms
```

## 瓶颈排名

| 优先级 | 瓶颈 | 触发频率 | 复杂度 | 修法 |
|--------|------|---------|--------|------|
| 🔴 P0 | `useWorkspaceTags()` / `useWorkspaceFields()` | 每次 _version | O(N) | 缓存 + 脏标记 |
| 🔴 P0 | `CommandPalette.searchableNodes` | 每次 _version | O(N) | 延迟构建 + 仅打开时计算 |
| 🔴 P0 | `buildBacklinkCountMap()` | 每次 _version | O(N) | 增量更新 or 延迟计算 |
| 🟠 P1 | `computeBacklinks()` per visible node | 每次 _version × 可见节点数 | O(N) × M | 全局索引 + 增量 |
| 🟠 P1 | `ReferenceSelector` recency sort | 每次打开 | O(N log N) | 延迟 + 限制候选集 |
| 🟡 P2 | `runSearch()` + materialize | 搜索面板打开 | O(N×M) | 增量索引（远期） |

## 修复方案

### Phase 1: 紧急止血（立即可做，效果最大）

**1a. CommandPalette — 仅打开时计算，不跟踪 _version**

当前：`useMemo([_version, ...])` → 每次编辑重算 40K 节点
修法：改为 `useState` + `useEffect`，仅在 palette 打开时 (`open === true`) 计算。关闭时不重算。

```typescript
// Before: 每次 _version 变化都重算
const searchableNodes = useMemo(() => { /* O(N) */ }, [_version, ...]);

// After: 仅打开时计算一次
const [searchableNodes, setSearchableNodes] = useState<...>([]);
useEffect(() => {
  if (!open) return;
  setSearchableNodes(buildSearchableNodes());
}, [open]);
```

**1b. useWorkspaceTags / useWorkspaceFields — Schema-only 缓存**

当前：每次 _version 遍历所有节点找 tagDef/fieldDef
修法：缓存 tag/field 列表，仅在 SCHEMA 子节点变化时重算（监听 SCHEMA 节点的 children 变化）

```typescript
// 缓存 key = SCHEMA 的 children 列表的 JSON
const schemaChildrenKey = useNodeStore((s) => {
  void s._version;
  return JSON.stringify(loroDoc.getChildren(SYSTEM_NODE_IDS.SCHEMA));
});
const tags = useMemo(() => buildWorkspaceTags(), [schemaChildrenKey]);
```

**1c. Backlinks — 延迟计算，不阻塞渲染**

当前：useBacklinks 在每次 _version 变化时同步计算 O(N)
修法：
- `useBacklinkCount` 返回缓存值，不在每次 _version 变化时重算
- 用 `requestIdleCallback` 延迟重算，不阻塞主线程
- 或直接移除 backlink badge（40K 节点场景下价值不大）

### Phase 2: 架构优化（中期）

**2a. _version 分片**

当前：一个全局 `_version`，任何变化触发所有 selector
修法：引入分区版本号

```typescript
interface NodeStore {
  _version: number;        // 全局（保留向后兼容）
  _schemaVersion: number;  // 仅 SCHEMA 子树变化时递增
  _treeVersion: number;    // 仅树结构（parent/children）变化时递增
}
```

- `useWorkspaceTags` 只依赖 `_schemaVersion`
- `useChildren` 只依赖 `_treeVersion`
- 编辑节点名称不触发 schema/tree 重算

**2b. 搜索索引**

- 预构建 name → nodeId 的倒排索引
- 增量更新（commitDoc 时只处理变化的节点）
- CommandPalette、ReferenceSelector、useNodeSearch 共用索引

### Phase 3: 远期

- 虚拟化 OutlinerView（只渲染可见行）
- Web Worker 搜索（40K 节点的模糊搜索移到 worker）
- LoroDoc 增量通知（只通知变化的节点 ID，而非全局 _version）

## 建议执行顺序

Phase 1a + 1b + 1c 可以**一个 PR 完成**，预计将最常见操作（打字编辑）从 500-2000ms 降到 <50ms。不改架构，只改计算时机。

Phase 2 需要改 store 结构，影响面大，建议作为独立 PR。
