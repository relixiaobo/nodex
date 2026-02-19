# Loro CRDT 迁移方案 — Phase 1: 本地数据引擎

> **目标**: 用 Loro CRDT 替换 Zustand entities + Supabase 作为节点数据层。
> **范围**: 纯本地（不含网络同步）。同步在 Phase 2 实施。
> **执行者**: nodex-cc
> **审核**: nodex（主仓库）

## 0. 前置知识

### Loro 是什么

[Loro](https://loro.dev) 是 Rust 实现的 CRDT 库（通过 WASM 在浏览器运行），当前版本 **1.10.6**（编码格式已稳定）。

核心容器类型：
- **LoroTree**: 原生树结构，内置 Kleppmann 移动算法（防循环、并发安全）、Fractional Indexing（兄弟排序）
- **LoroMap**: LWW（Last-Write-Wins）键值映射，per-key 粒度
- **LoroText**: 字符级 CRDT 文本（Fugue 算法）
- **LoroList**: 有序列表 CRDT

### 为什么迁移

当前 node-store.ts（2176 行）用 `Record<string, NodexNode>` + `children: string[]` **模拟**树结构。
所有树操作（createChild/moveNodeTo/trashNode）手动 `splice()` children 数组，导致：
- Supabase Realtime echo 覆盖 children（已用 `_pendingChildrenOps` 缓解但本质未解决）
- moveNode 需 2 次独立 DB 更新，无事务保证
- 循环检测需手动递归

Loro 的 `LoroTree` 将树操作变为原子调用，正确性由算法保证。

## 1. 目标架构

```
┌──────────────────────────────────────────────┐
│                  React UI                     │
│  (OutlinerItem, NodePanel, FieldRow, etc.)    │
├──────────────────┬───────────────────────────┤
│   useNode()      │   useUIStore()            │
│   useChildren()  │   Zustand (ui-store.ts)   │
│   useNodeStore() │   chrome.storage.local    │
│        ↓         │                           │
│   node-store.ts  │                           │
│   (薄 Zustand)   │                           │
│        ↓         │                           │
│   loro-doc.ts    │                           │
│   (LoroDoc 单例) │                           │
│        ↓         │                           │
│   IndexedDB      │                           │
│   (持久化)        │                           │
└──────────────────┴───────────────────────────┘
```

### 关键设计决策

**node-store.ts 保留为薄 Zustand wrapper**（不是被完全替换）：

原因：38 个文件通过 `useNodeStore(selector)` 消费数据。保留 Zustand 的 selector 机制可以：
1. **最小化 UI 组件改动**——selector 签名不变，组件无需重写
2. **利用 Zustand 的 shallow compare**——避免 Loro 事件导致不必要的 re-render
3. **保留 actions API**——`store.createChild()`、`store.trashNode()` 等签名不变

但 **Zustand store 不再持有 entities 数据**。它变为：
- Actions 调用 Loro 操作
- Selector 从 Loro Doc 读取并返回 `NodexNode` 视图对象
- 监听 Loro 事件触发 React re-render

## 2. 数据模型映射

### 2.1 LoroDoc 结构

```typescript
// loro-doc.ts — 全局单例

import { LoroDoc } from 'loro-crdt';

const doc = new LoroDoc();

// 树结构：所有节点的父子关系 + 排序
const tree = doc.getTree("nodes");

// 每个 LoroTree 节点自带 .data (LoroMap)，用于存储节点属性
// tree.createNode() 返回 TreeID
// node.data.set("key", value) 设置属性
```

### 2.2 NodexNode → LoroTree 节点映射

| NodexNode 字段 | Loro 存储位置 | 说明 |
|----------------|-------------|------|
| `id` | LoroTree 节点的 **自定义 key**（`node.data.set("id", id)`） | Loro 有内部 TreeID，我们额外存 Nodex ID 做映射 |
| `props.name` | `node.data.set("name", str)` | 纯文本名称 |
| `props._docType` | `node.data.set("_docType", str)` | 文档类型枚举 |
| `props._ownerId` | **不需要** — 由 LoroTree 的 parent 关系隐含 | `_ownerId` 在当前架构中就是"谁是我的父节点" |
| `props._sourceId` | `node.data.set("_sourceId", str)` | 模板来源 |
| `props._marks` | `node.data.set("_marks", json)` | JSON 序列化存储（Phase 2 可升级为 LoroText marks） |
| `props._inlineRefs` | `node.data.set("_inlineRefs", json)` | JSON 序列化存储 |
| `props.description` | `node.data.set("description", str)` | |
| `props._done` | `node.data.set("_done", number\|null)` | |
| `props._flags` | `node.data.set("_flags", number)` | |
| `props._view` | `node.data.set("_view", str)` | |
| `props.created` | `node.data.set("created", number)` | |
| `props._imageWidth/Height` | `node.data.set("_imageWidth", n)` | |
| `props._published` | `node.data.set("_published", n)` | |
| `props._editMode` | `node.data.set("_editMode", bool)` | |
| `props.searchContextNode` | `node.data.set("searchContextNode", str)` | |
| `children` | **LoroTree 的子节点列表**（自动管理） | 不再手动维护 `string[]` |
| `meta` | `node.data.set("meta", LoroList)` | 嵌套容器：元信息 Tuple ID 列表 |
| `workspaceId` | `node.data.set("workspaceId", str)` | |
| `version` | **不需要** — Loro 有内置版本向量 | 乐观锁由 CRDT 替代 |
| `updatedAt` | `node.data.set("updatedAt", number)` | 保留用于 UI 显示 |
| `createdBy` | `node.data.set("createdBy", str)` | |
| `updatedBy` | `node.data.set("updatedBy", str)` | |
| `aiSummary` | `node.data.set("aiSummary", str)` | |
| `sourceUrl` | `node.data.set("sourceUrl", str)` | |
| `touchCounts` | `node.data.set("touchCounts", json)` | 低优先级，JSON 序列化 |
| `modifiedTs` | `node.data.set("modifiedTs", json)` | 低优先级，JSON 序列化 |

### 2.3 特殊映射：`_ownerId` 与 LoroTree parent

**当前**：`_ownerId` 既表示"逻辑归属"也表示"树父节点"。但有例外：
- 回收站节点：`_ownerId = "{ws}_TRASH"`，但节点不在 TRASH 的 children 中
- Tuple 的 `_ownerId` = 它所属的内容节点

**Loro 方案**：
- **树父子关系** = LoroTree 的 parent（replace `children: string[]`）
- **`_ownerId`** 保留为节点属性（`node.data.set("_ownerId", ...)`），用于非树结构的逻辑归属查询
- **Trash 操作** = `tree.move(nodeId, trashContainerId)`（节点移动到 Trash 容器下）

### 2.4 ID 映射策略

Loro 的 TreeID 是内部类型（`{ peer: bigint, counter: number }`），不适合直接当 Nodex ID 用。

**方案**：维护双向映射 `Map<string, TreeID>` + `Map<TreeID, string>`

```typescript
// loro-doc.ts
const nodexIdToTreeId = new Map<string, TreeID>();
const treeIdToNodexId = new Map<string, string>(); // TreeID.toString() → nodexId

function createNode(nodexId: string, parentNodexId: string, index?: number): TreeID {
  const parentTreeId = nodexIdToTreeId.get(parentNodexId);
  const treeNode = tree.createNode(parentTreeId, index);
  const treeId = treeNode.id;
  nodexIdToTreeId.set(nodexId, treeId);
  treeIdToNodexId.set(treeIdStr(treeId), nodexId);
  treeNode.data.set("id", nodexId);
  return treeId;
}
```

**持久化**：映射表不需要单独持久化——从 Loro snapshot 恢复时遍历所有树节点重建映射。

## 3. 核心模块设计

### 3.1 `src/lib/loro-doc.ts` — Loro 文档单例（新建）

```typescript
// 职责：
// 1. LoroDoc 生命周期管理（创建/导出/导入）
// 2. ID 映射（nodexId ↔ TreeID）
// 3. 树操作 API（对外暴露 nodexId 风格的接口）
// 4. IndexedDB 持久化
// 5. 事件订阅（供 node-store 监听）

export interface LoroDocManager {
  // 初始化
  init(): Promise<void>;             // 从 IndexedDB 加载或创建新 Doc

  // 树操作
  createNode(id: string, parentId: string, index?: number): void;
  moveNode(id: string, newParentId: string, index?: number): void;
  deleteNode(id: string): void;      // 从树中移除（不可恢复）

  // 节点属性
  getNodeData(id: string): Record<string, unknown> | null;
  setNodeData(id: string, key: string, value: unknown): void;
  setNodeDataBatch(id: string, data: Record<string, unknown>): void;

  // 子节点
  getChildren(parentId: string): string[];  // 返回有序的 nodexId 列表

  // 查询
  getParentId(id: string): string | null;
  hasNode(id: string): boolean;
  getAllNodeIds(): string[];

  // 持久化
  save(): Promise<void>;             // 导出 snapshot → IndexedDB

  // 事件
  subscribe(callback: () => void): () => void;  // Loro 变更事件

  // 导出（供 Phase 2 同步使用）
  exportSnapshot(): Uint8Array;
  exportUpdates(since: VersionVector): Uint8Array;
  importUpdates(data: Uint8Array): void;
}
```

### 3.2 `src/stores/node-store.ts` — 重构后的 Zustand Store

**改动原则**：保留完整的 actions API 签名，内部实现从 "操作 entities + Supabase" 改为 "操作 LoroDoc"。

```typescript
interface NodeStore {
  // === 读取（从 Loro 投影为 NodexNode） ===

  /** 获取单个节点（从 Loro 读取，构造 NodexNode 视图对象） */
  getNode(id: string): NodexNode | null;

  /** 获取子节点列表 */
  getChildren(parentId: string): NodexNode[];

  // === 写入（代理到 Loro 操作） ===

  // 签名不变，实现改为调用 loroDoc
  createChild(...): Promise<NodexNode>;
  createSibling(...): Promise<NodexNode>;
  moveNodeTo(...): Promise<void>;
  indentNode(...): Promise<void>;
  outdentNode(...): Promise<void>;
  moveNodeUp(...): Promise<void>;
  moveNodeDown(...): Promise<void>;
  trashNode(...): Promise<void>;

  // 内容编辑（保持同步调用，Loro 操作是同步的）
  setNodeNameLocal(id: string, name: string): void;
  updateNodeContent(...): void;  // 不再需要 async（无网络）

  // Tag/Field 操作 — 签名不变
  applyTag(...): void;  // 不再 async
  removeTag(...): void;
  createTagDef(...): NodexNode;
  createAttrDef(...): NodexNode;
  setFieldValue(...): void;
  setOptionsFieldValue(...): void;

  // === 响应式触发 ===

  /** 内部版本号，Loro 变更时递增，触发 selector re-evaluate */
  _version: number;
}
```

**关键变化**：

1. **删除 `entities: Record<string, NodexNode>`** — 不再在 Zustand 中缓存节点数据
2. **删除 `loading`, `_dirtyContentIds`, `_pendingChildrenOps`** — 不再需要（无网络 I/O）
3. **删除所有 `nodeService.*` 调用** — 不再与 Supabase 通信
4. **删除 `fetchNode` / `fetchChildren`** — 数据就在本地 Loro Doc 中
5. **Actions 变为同步** — Loro 操作是同步的（WASM 调用），不需要 async/await
6. **新增 `_version` 计数器** — Loro 订阅触发 `set({ _version: v + 1 })`，驱动 React re-render

### 3.3 React Hooks 改动

**use-node.ts**：
```typescript
export function useNode(nodeId: string | null): NodexNode | null {
  // 订阅 _version 确保 Loro 变更时 re-render
  const version = useNodeStore((s) => s._version);
  return useNodeStore((s) => nodeId ? s.getNode(nodeId) : null);
}
// 删除 useEffect fetchNode — 数据在本地，不需要异步加载
```

**use-children.ts**：
```typescript
export function useChildren(nodeId: string | null): NodexNode[] {
  const version = useNodeStore((s) => s._version);
  return useNodeStore((s) => nodeId ? s.getChildren(nodeId) : []);
}
// 删除 useEffect fetchChildren + fetchedRef — 同上
```

**use-realtime.ts**：
- **Phase 1 整个删除**。没有 Supabase 就没有 Realtime。

### 3.4 持久化 — IndexedDB

```typescript
// src/lib/loro-persistence.ts

const DB_NAME = 'nodex';
const STORE_NAME = 'loro_snapshots';
const SNAPSHOT_KEY = 'main';

export async function saveSnapshot(data: Uint8Array): Promise<void> {
  // IDB put(SNAPSHOT_KEY, data)
}

export async function loadSnapshot(): Promise<Uint8Array | null> {
  // IDB get(SNAPSHOT_KEY)
}
```

**保存时机**：
- 每次树操作后 debounce 保存（1-2 秒）
- 页面 `visibilitychange`（切换标签页时）
- `beforeunload`（关闭页面时）

**数据量估算**：
- 68 个种子节点，每个约 200-500 bytes 属性 → ~30KB
- Tana 导入 41,753 节点 → 预估 5-15MB Loro snapshot（可接受）

## 4. 删除的模块

| 文件 | 原因 |
|------|------|
| `src/services/node-service.ts` | Supabase CRUD 层，Phase 1 不需要网络 |
| `src/services/supabase.ts` | Supabase 客户端单例 |
| `src/hooks/use-realtime.ts` | Supabase Realtime 订阅 |
| `src/lib/supabase.ts` | Supabase 初始化 |

**注意**：不要删除文件，标记为 deprecated 并注释掉 import。Phase 2 同步时可能复用部分代码。

## 5. 保留不变的模块

| 文件 | 原因 |
|------|------|
| `src/types/node.ts` | `NodexNode` 接口保持不变——它是 UI 的契约 |
| `src/types/system-nodes.ts` | SYS_A/D/V/T 常量不变 |
| `src/stores/ui-store.ts` | UI 状态与节点数据无关 |
| `src/stores/workspace-store.ts` | 工作区/用户状态保留 |
| `src/lib/field-utils.ts` | 字段逻辑工具函数（操作 NodexNode 对象） |
| `src/lib/checkbox-utils.ts` | Checkbox 逻辑工具函数 |
| `src/lib/tree-utils.ts` | 树遍历工具（基于 entities map，需适配但逻辑不变） |
| 所有 `src/components/**/*.tsx` | UI 组件通过 hooks/store 消费数据，签名不变则不需改 |

## 6. 实施步骤（按顺序）

### Step 0: 环境准备

```bash
npm install loro-crdt
# 验证 WASM 在 Vite + WXT 中加载正常
# 可能需要 wxt.config.ts 中配置 WASM 支持
```

**验证**：在 standalone 页面 `console.log` 创建 LoroDoc + LoroTree，确认 WASM 初始化正常。

**风险点**：Chrome Extension MV3 的 CSP 可能需要 `wasm-unsafe-eval`。在 `wxt.config.ts` 的 manifest 配置中添加。但 standalone 测试页面（http://localhost）不受此限制，可以先在 standalone 上开发。

### Step 1: 实现 `loro-doc.ts`（纯库层，无 UI 依赖）

**输入**：Loro API
**输出**：`LoroDocManager` 接口实现

1. 创建 `src/lib/loro-doc.ts`
2. 实现 LoroDoc 单例 + ID 映射
3. 实现所有树操作（createNode, moveNode, deleteNode）
4. 实现节点属性读写（getNodeData, setNodeData）
5. 实现 getChildren（返回有序 nodexId 列表）
6. 实现 IndexedDB 持久化（save/load）
7. 实现事件订阅

**验证**：纯 Vitest 单元测试，不涉及 React/UI
```
tests/vitest/loro-doc.test.ts
- 创建节点 + 读取属性
- 移动节点 + 验证父子关系
- 移动到后代（应抛错或 no-op，验证循环检测）
- 兄弟排序（createNode with index）
- 导出 → 导入 → 状态一致
- ID 映射恢复
```

### Step 2: 实现 `toNodexNode()` 转换函数

**目的**：从 Loro 树节点构造 `NodexNode` 视图对象，供 UI 消费。

```typescript
// src/lib/loro-doc.ts

export function toNodexNode(nodexId: string): NodexNode | null {
  const treeId = nodexIdToTreeId.get(nodexId);
  if (!treeId) return null;
  const treeNode = tree.getNodeByID(treeId);
  if (!treeNode) return null;

  const data = treeNode.data;
  const childTreeNodes = treeNode.children();  // Loro API
  const childIds = childTreeNodes
    .map(c => treeIdToNodexId.get(treeIdStr(c.id)))
    .filter(Boolean) as string[];

  return {
    id: nodexId,
    workspaceId: data.get("workspaceId") ?? '',
    props: {
      created: data.get("created") ?? Date.now(),
      name: data.get("name"),
      _docType: data.get("_docType"),
      _ownerId: data.get("_ownerId"),
      _sourceId: data.get("_sourceId"),
      _marks: data.get("_marks"),
      _inlineRefs: data.get("_inlineRefs"),
      description: data.get("description"),
      _done: data.get("_done"),
      _flags: data.get("_flags"),
      _view: data.get("_view"),
      _imageWidth: data.get("_imageWidth"),
      _imageHeight: data.get("_imageHeight"),
      _published: data.get("_published"),
      _editMode: data.get("_editMode"),
      searchContextNode: data.get("searchContextNode"),
    },
    children: childIds,
    meta: data.get("meta") ?? [],  // 从 LoroList 读取
    version: 0,  // 不再使用乐观锁
    updatedAt: data.get("updatedAt") ?? Date.now(),
    createdBy: data.get("createdBy") ?? '',
    updatedBy: data.get("updatedBy") ?? '',
    aiSummary: data.get("aiSummary"),
    sourceUrl: data.get("sourceUrl"),
    touchCounts: data.get("touchCounts"),
    modifiedTs: data.get("modifiedTs"),
  };
}
```

**重要**：`children` 字段从 LoroTree 的子节点列表动态读取，不再存储在节点属性中。这是核心区别——children 是树结构的衍生值，不是节点的属性。

### Step 3: 重构 `node-store.ts`

这是最大的一步。按优先级分解：

#### 3a. 基础读写（替换 entities map）

1. 删除 `entities: Record<string, NodexNode>`
2. 删除 `loading`, `_dirtyContentIds`, `_pendingChildrenOps`
3. 新增 `_version: number`（Loro 变更触发器）
4. 实现 `getNode(id)` → 调用 `toNodexNode(id)`
5. 实现 `getChildren(parentId)` → 调用 `loroDoc.getChildren(parentId).map(toNodexNode)`
6. 删除 `setNode`, `setNodes`, `removeNode`（不再需要，Loro 是数据源）
7. 删除 `fetchNode`, `fetchChildren`（不再需要异步加载）
8. 订阅 Loro 变更事件 → `set({ _version: get()._version + 1 })`

**验证**：standalone 页面能显示种子数据（下一步实现种子加载后）

#### 3b. 树操作（替换 children splice）

逐个重写：

| 方法 | 当前实现 | Loro 实现 |
|------|---------|----------|
| `createChild` | 构造 NodexNode + splice + Supabase | `loroDoc.createNode(id, parentId, pos)` + `setNodeDataBatch()` |
| `createSibling` | 找 parent + 计算 index + createChild | `loroDoc.createNode(id, parentId, siblingIndex + 1)` |
| `moveNodeTo` | splice old + splice new + Supabase × 2 | `loroDoc.moveNode(id, newParentId, pos)` |
| `indentNode` | 找 prevSibling + moveNodeTo | `loroDoc.moveNode(id, prevSiblingId, lastChildIndex)` |
| `outdentNode` | 找 grandparent + moveNodeTo | `loroDoc.moveNode(id, grandparentId, parentIndex + 1)` |
| `moveNodeUp/Down` | splice reorder | `loroDoc.moveNode(id, parentId, index ± 1)` |
| `trashNode` | 改 _ownerId + splice | `loroDoc.moveNode(id, trashContainerId)` |

**验证**：每实现一个方法后运行 typecheck + 在 standalone 中测试

#### 3c. Tag/Field 操作

这些操作主要是创建 Tuple 节点和修改属性，不涉及复杂树操作。
核心变化：所有 `nodeService.*` 调用去掉，替换为 `loroDoc.createNode()` + `setNodeData()`。

`applyTag` 的逻辑（继承链解析、去重、field tuple 创建）保持不变，只是底层存储从 entities map 变为 Loro Doc。

#### 3d. 内容编辑

`setNodeNameLocal` / `updateNodeContent` 变为：
```typescript
setNodeNameLocal(id, name) {
  loroDoc.setNodeData(id, "name", name);
  // Loro 事件会触发 _version++，驱动 re-render
}
```

不再区分"本地"和"持久化"两条路径——Loro 操作即是持久化（debounce 保存到 IndexedDB）。

### Step 4: 种子数据迁移

重写 `seed-data.ts`：用 Loro API 创建节点（不再构造 NodexNode 对象后 setNodes）。

```typescript
export function seedTestData() {
  const doc = getLoroDoc();

  // 工作区根
  doc.createNode(WS_ID, null);  // null parent = root
  doc.setNodeDataBatch(WS_ID, { name: 'My Workspace', created: Date.now(), ... });

  // 容器
  doc.createNode(libraryId, WS_ID);
  doc.setNodeDataBatch(libraryId, { name: 'Library', _ownerId: WS_ID, ... });

  // Library 内容
  doc.createNode('proj_1', libraryId);
  doc.setNodeDataBatch('proj_1', { name: 'My Project', description: '...', ... });

  // ... 同样模式创建所有 68 个种子节点
}
```

**验证**：standalone 页面正常渲染种子数据

### Step 5: Hooks 适配

1. `use-node.ts` — 删除 useEffect fetch，加 `_version` 订阅
2. `use-children.ts` — 删除 useEffect fetch + fetchedRef，加 `_version` 订阅
3. `use-realtime.ts` — 整个文件注释掉 export
4. `App.tsx` — 删除 Supabase 初始化 + Realtime 订阅

### Step 6: 工具函数适配

`src/lib/tree-utils.ts`：当前基于 `entities` map 做树遍历。需要适配为从 `node-store.getNode()` 读取。

`src/lib/field-utils.ts`、`src/lib/checkbox-utils.ts`：操作 `NodexNode` 对象，不直接访问 store。**可能不需要改动**（接收 NodexNode 参数，返回计算结果）。需要验证。

### Step 7: 测试

1. **Vitest 单元测试**：
   - `tests/vitest/loro-doc.test.ts`（Step 1 的验证）
   - `tests/vitest/node-store-loro.test.ts`（重写现有 store 测试用 Loro 后端）
   - 更新 `tests/vitest/realtime-echo-protection.test.ts` — 这些测试的前提已不存在（没有 echo 了），标记为 skip 或删除

2. **Standalone 功能验证**：
   - 创建节点（Enter）
   - 删除节点（Backspace/Delete）
   - 缩进/反缩进（Tab/Shift+Tab）
   - 拖拽移动
   - 刷新后数据恢复（IndexedDB 持久化）
   - 标签应用/移除
   - 字段值设置

## 7. 性能考量

### 7.1 `toNodexNode()` 开销

每次 selector 调用都会从 Loro 读取并构造 `NodexNode` 对象。对于频繁 re-render 的场景（输入文本时），需要：

1. **Memoize**：用 WeakMap 或 LRU 缓存 `toNodexNode` 结果，Loro 版本不变时返回缓存
2. **细粒度订阅**：Loro 支持 per-container 事件，只在相关节点变化时更新

### 7.2 保存频率

Loro snapshot 导出是 O(doc_size)。对于 5-15MB 的文档：
- 全量 snapshot：~50-100ms（可接受，debounce 2s）
- 增量 updates：更小更快（Phase 2 可优化为增量保存）

### 7.3 WASM 初始化

Loro WASM 初始化约 50-100ms。在 `App.tsx` 的初始化流程中预加载。

## 8. 风险与缓解

| 风险 | 缓解 |
|------|------|
| WASM 在 WXT/Vite 中加载失败 | Step 0 最先验证。Vite 有 WASM plugin 支持 |
| Chrome MV3 CSP 阻止 WASM | standalone 不受限。Extension 需要 `wasm-unsafe-eval` |
| Loro API 行为与预期不符 | Step 1 写充分的单元测试，早期发现 |
| `toNodexNode()` 性能不足 | memoize + 细粒度更新。必要时引入 entities 缓存层 |
| 种子数据迁移遗漏节点关系 | 对比 Step 4 前后的节点数量和树结构 |
| 某些组件依赖 entities 引用相等 | Zustand shallow compare + _version 触发应该兼容 |

## 9. 验收标准

Phase 1 完成的定义：

- [ ] `npm run typecheck` 通过
- [ ] `npm run test:run` 通过（更新后的测试）
- [ ] standalone 页面（`npm run dev:test`）所有现有交互正常工作
- [ ] 刷新页面后数据从 IndexedDB 恢复
- [ ] 不再有任何 Supabase 调用（可在 Network panel 确认）
- [ ] node-store.ts 行数从 2176 显著减少
- [ ] 无 `_pendingChildrenOps`、无 `_dirtyContentIds`、无 3s timeout hack

## 10. 不在 Phase 1 范围内

- 网络同步（Phase 2）
- LoroText 替换 TipTap 内容（Phase 2+，需要评估 TipTap ↔ Loro 集成）
- Tana JSON 导入适配（单独任务）
- 多工作区支持（单独任务）
- Chrome Extension 打包验证（可在 Phase 1 后期或 Phase 2 初期做）

## 11. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/lib/loro-doc.ts` | **新建** | Loro 文档单例 + ID 映射 + 树操作 API |
| `src/lib/loro-persistence.ts` | **新建** | IndexedDB 持久化 |
| `src/stores/node-store.ts` | **重写** | 去 Supabase，底层改为 Loro |
| `src/hooks/use-node.ts` | **修改** | 去 useEffect fetch |
| `src/hooks/use-children.ts` | **修改** | 去 useEffect fetch |
| `src/hooks/use-realtime.ts` | **注释** | 暂停使用 |
| `src/entrypoints/sidepanel/App.tsx` | **修改** | 去 Supabase 初始化，加 Loro 初始化 |
| `src/entrypoints/test/seed-data.ts` | **重写** | 用 Loro API 创建种子数据 |
| `src/entrypoints/test/TestApp.tsx` | **修改** | 适配 Loro 初始化 |
| `src/lib/tree-utils.ts` | **修改** | 适配从 store.getNode 读取 |
| `tests/vitest/loro-doc.test.ts` | **新建** | Loro 层单元测试 |
| `tests/vitest/node-store-loro.test.ts` | **新建** | Store 层集成测试 |
| `tests/vitest/helpers/test-state.ts` | **修改** | 适配 Loro 重置 |
| `wxt.config.ts` | **可能修改** | WASM 支持配置 |
| `package.json` | **修改** | 添加 `loro-crdt` 依赖 |

## 12. 给 nodex-cc 的执行建议

1. **严格按 Step 0→1→2→3→4→5→6→7 顺序执行**。每步完成后 typecheck + 提交
2. **Step 1 是基础**，必须有充分的单元测试才能继续
3. **Step 3（重构 node-store）是最大风险**，建议先实现 3a + 3b（基础读写 + 树操作），让 standalone 能渲染，再做 3c + 3d
4. **如果 WASM 在 WXT 中有问题**，先在 standalone 上完成所有开发，Extension 适配最后做
5. **不要试图一次性重写所有内容**——保留 `NodexNode` 接口不变是关键约束，UI 组件尽可能不改
6. **分支**: `cc/loro-migration-phase1`，Draft PR 开工即创建
7. **高风险文件声明**: `node-store.ts`（在 TASKS.md 声明文件锁）
