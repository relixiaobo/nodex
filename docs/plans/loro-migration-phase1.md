# Loro CRDT 迁移方案 — Phase 1: 本地数据引擎

> **目标**: 用 Loro CRDT 替换 Zustand entities + Supabase，同时全面原生化数据模型、统一命名。
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

### 迁移范围：不只是换存储，而是全面原生化

**没有历史数据包袱是我们最大的优势。** 本次迁移不是把旧模型搬进 Loro，而是：
1. **消除 Tana 的 Firebase 时代间接层**（meta Tuple、_ownerId、Tuple-as-key-value）
2. **统一命名**（去掉 `_` 前缀、扁平化 `props`、语义化字段名）
3. **用 Loro 原生类型替代手动模拟**（LoroTree 替代 children 数组、LoroList 替代 meta Tuple）

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
- 监听 Loro 事件触发 React re-render（通过 `_version` 计数器）

## 2. 数据模型：全面原生化

### 2.1 设计原则

> **核心判断标准**：Tana 的这个间接层是因为 Firebase 限制才存在的吗？如果是，用 Loro 原生类型替代。

消除清单：

| Tana 遗留 | 原因 | Loro 替代 |
|-----------|------|----------|
| `meta: string[]` + Meta Tuple 节点 | Firebase 无 Map 类型，用 Tuple 模拟 kv | LoroMap 直接属性 + LoroList |
| `_ownerId` 字段 | 手动维护父子关系 | LoroTree.parent() |
| `children: string[]` 数组 | 手动维护有序子节点 | LoroTree.children() |
| `version` 乐观锁 | Supabase 冲突检测 | Loro 版本向量 |
| `workspaceId` per-node | Supabase WHERE 子句 | 一个 LoroDoc = 一个工作区 |
| Field Tuple `children[0]` = key | Tuple 编码 kv | `data.fieldDefId` 属性 |
| `touchCounts` / `modifiedTs` | Tana 协作审计 | 删除（从未使用） |
| `createdBy` / `updatedBy` | Supabase 审计 | Phase 1 删除，Phase 2 用 PeerID |
| `props` 包装层 | Tana 内部分层 | 扁平化到节点顶层 |

### 2.2 新 NodexNode 接口（改造后）

```typescript
/**
 * Nodex 核心节点 —— "一切皆节点"。
 *
 * 与旧接口相比：
 * - 扁平化：消除 props 包装层
 * - 去 _ 前缀：所有属性直接命名
 * - 消除间接层：meta Tuple → 直接 tags 属性
 * - 语义化：_done → completedAt, _sourceId → templateId
 */
export interface NodexNode {
  /** 全局唯一标识符 (nanoid 21 字符) */
  id: string;

  // ─── 核心属性 ───

  /** 节点类型。无此字段 = 普通内容节点 */
  type?: NodeType;

  /** 节点名称/内容（纯文本，\uFFFC 为内联引用占位符） */
  name?: string;

  /** 辅助描述文本 */
  description?: string;

  // ─── 关系（均从 LoroTree 衍生） ───

  /** 有序子节点 ID 列表（LoroTree children 衍生，不存储） */
  children: string[];

  /** 已应用的标签定义 ID 列表（替代 meta→TagTuple 链） */
  tags: string[];

  // ─── 时间戳（统一 *At 后缀） ───

  /** 创建时间 (ms) */
  createdAt: number;

  /** 最后修改时间 (ms) */
  updatedAt: number;

  /** 完成时间 (ms)。null = 未完成。(旧 _done) */
  completedAt?: number;

  /** 发布时间 (ms)。(旧 _published) */
  publishedAt?: number;

  // ─── 富文本（Phase 2 → LoroText 替代） ───

  /** 文本格式标记 (旧 _marks) */
  marks?: TextMark[];

  /** 行内引用 (旧 _inlineRefs) */
  inlineRefs?: InlineRefEntry[];

  // ─── 其他属性 ───

  /** 模板来源 ID (旧 _sourceId) */
  templateId?: string;

  /** 视图模式 (旧 _view) */
  viewMode?: ViewMode;

  /** 编辑模式 */
  editMode?: boolean;

  /** 位标志 */
  flags?: number;

  /** 图片宽度 (px) */
  imageWidth?: number;

  /** 图片高度 (px) */
  imageHeight?: number;

  /** 搜索上下文节点 ID (旧 searchContextNode) */
  searchContext?: string;

  // ─── Nodex 扩展 ───

  /** AI 生成摘要 */
  aiSummary?: string;

  /** 来源 URL (网页剪藏) */
  sourceUrl?: string;
}
```

**与旧接口的完整映射**（供 nodex-cc 逐字段对照）：

| 旧字段 | 新字段 | 变化 |
|--------|--------|------|
| `props.name` | `name` | 扁平化 |
| `props._docType` | `type` | 扁平化 + 重命名 |
| `props._ownerId` | **消除** | LoroTree.parent() 替代 |
| `props._sourceId` | `templateId` | 扁平化 + 语义化 |
| `props.created` | `createdAt` | 扁平化 + 统一 *At 后缀 |
| `props._done` | `completedAt` | 扁平化 + 语义化 |
| `props._marks` | `marks` | 扁平化 + 去 `_` |
| `props._inlineRefs` | `inlineRefs` | 扁平化 + 去 `_` |
| `props.description` | `description` | 扁平化 |
| `props._flags` | `flags` | 扁平化 + 去 `_` |
| `props._view` | `viewMode` | 扁平化 + 语义化 |
| `props._published` | `publishedAt` | 扁平化 + 统一 *At |
| `props._editMode` | `editMode` | 扁平化 + 去 `_` |
| `props._imageWidth` | `imageWidth` | 扁平化 + 去 `_` |
| `props._imageHeight` | `imageHeight` | 扁平化 + 去 `_` |
| `props.searchContextNode` | `searchContext` | 扁平化 + 去冗余 "Node" |
| `children` | `children` | 不变（但来源改为 LoroTree） |
| `meta` | **消除** → `tags` | meta Tuple 消除，标签直接属性 |
| `workspaceId` | **消除** | 一个 LoroDoc = 一个工作区 |
| `version` | **消除** | Loro 版本向量替代 |
| `updatedAt` | `updatedAt` | 不变 |
| `createdBy` | **消除(P1)** | Phase 2 用 PeerID |
| `updatedBy` | **消除(P1)** | Phase 2 用 PeerID |
| `touchCounts` | **消除** | 从未使用 |
| `modifiedTs` | **消除** | 从未使用 |
| `aiSummary` | `aiSummary` | 不变 |
| `sourceUrl` | `sourceUrl` | 不变 |

### 2.3 类型重命名

```typescript
// ─── DocType → NodeType ───
// "Doc" 是 Firebase 遗留。我们的核心概念是 Node。

export type NodeType =
  | 'fieldEntry'        // 旧 'tuple'。字段实例（key + values）
  | 'tagDef'            // 不变
  | 'fieldDef'          // 旧 'attrDef'。统一为 "field"
  | 'viewDef'           // 不变
  | 'codeblock'         // 不变
  | 'visual'            // 不变
  | 'url'               // 不变
  | 'chat'              // 不变
  | 'journal'           // 不变
  | 'journalPart'       // 不变
  | 'search'            // 不变
  | 'command'           // 不变
  | 'systemTool'        // 不变
  | 'chatbot'           // 不变
  | 'syntax'            // 不变
  | 'placeholder'       // 不变
  | 'workspace'         // 不变
  | 'home'              // 不变
  | 'settings'          // 不变
  | 'webClip';          // 不变
```

### 2.4 常量重命名

```typescript
// ─── SYS_D* → FIELD_TYPES（可读值替代 opaque ID）───

export const FIELD_TYPES = {
  CHECKBOX: 'checkbox',
  INTEGER: 'integer',
  DATE: 'date',
  OPTIONS_FROM_SUPERTAG: 'options_from_supertag',
  PLAIN: 'plain',
  FORMULA: 'formula',
  NUMBER: 'number',
  TANA_USER: 'tana_user',
  URL: 'url',
  EMAIL: 'email',
  OPTIONS: 'options',
  BOOLEAN: 'boolean',    // Nodex 扩展
  COLOR: 'color',        // Nodex 扩展
} as const;
export type FieldType = typeof FIELD_TYPES[keyof typeof FIELD_TYPES];

// ─── SYS_V* 布尔值 → 原生类型 ───
// SYS_V03 (YES) → true
// SYS_V04 (NO) → false
// SYS_V01 (SINGLE_VALUE) → 'single'
// SYS_V02 (LIST_OF_VALUES) → 'list'
// 搜索操作符等保留为可读字符串枚举

// ─── SYS_T* → SYSTEM_TAGS（可读 ID）───

export const SYSTEM_TAGS = {
  SUPERTAG: 'sys:supertag',
  FIELD_DEFINITION: 'sys:field-definition',
  OPTIONS: 'sys:options',
  DAY: 'sys:day',
  WEEK: 'sys:week',
  YEAR: 'sys:year',
  // ... 其他系统标签
} as const;

// ─── SYS_A* → 大部分消除 ───
// Meta Tuple 消除后，SYS_A13/A55/A12/A11/A14 等不再需要作为 Tuple key。
// 剩余的 SYS_A* 用于 fieldEntry 和 view/search 配置，
// 可逐步替换为可读属性名。
// 迁移期间保留 SYS_A 常量对象以便过渡，但逐步减少引用。
```

**系统节点在 LoroTree 中的归属**：

| 类别 | 是否为 LoroTree 节点 | 说明 |
|------|---------------------|------|
| 用户可见系统标签（TASK, MEETING, PERSON 等） | **是** | 有 name、showCheckbox、color 等配置，需要树节点。ID 用 SYSTEM_TAGS 值 |
| 元标签（SUPERTAG, FIELD_DEFINITION） | **否** | 旧模型中用于 meta-circular 标识节点角色。新模型用 `type: 'tagDef'` / `type: 'fieldDef'` 直接标识，不再需要 |
| FIELD_TYPES 值（'checkbox', 'plain' 等） | **否** | 纯字符串枚举，不是节点 |
| SYSTEM_TAGS 值（'sys:supertag' 等） | 仅用户可见的 | 元标签的值只作为历史参考常量，不创建节点 |

种子数据中需要创建的系统节点示例：
```typescript
// 用户可见系统标签 → LoroTree 节点
doc.createNode(SYSTEM_TAGS.TASK, CONTAINERS.SCHEMA);
doc.setNodeDataBatch(SYSTEM_TAGS.TASK, {
  type: 'tagDef', name: 'Task', showCheckbox: true,
});

// 元标签（SUPERTAG, FIELD_DEFINITION）→ 不创建节点
// 识别方式：node.type === 'tagDef' 即为标签定义，无需额外标记
```

### 2.5 LoroDoc 结构

```typescript
// loro-doc.ts — 全局单例（每个工作区一个 LoroDoc）

import { LoroDoc } from 'loro-crdt';

const doc = new LoroDoc();
const tree = doc.getTree("nodes");

// 每个 LoroTree 节点自带 .data (LoroMap)，用于存储属性
// tree.createNode() 返回 TreeID
// node.data.set("key", value) 设置属性
```

### 2.6 NodexNode 字段 → Loro 存储映射

| NodexNode 字段 | Loro 存储 | 说明 |
|---------------|-----------|------|
| `id` | `node.data.set("id", nanoid)` | Loro 有内部 TreeID，额外存 Nodex ID 做映射 |
| `type` | `node.data.set("type", str)` | NodeType 枚举值 |
| `name` | `node.data.set("name", str)` | 纯文本（Phase 2 升级为 LoroText） |
| `description` | `node.data.set("description", str)` | |
| `children` | **LoroTree 子节点列表**（衍生值，不存储） | `tree.children(nodeId)` |
| `tags` | `node.data.setContainer("tags", LoroList)` | 直接存 tagDefId 列表，替代 meta Tuple |
| `createdAt` | `node.data.set("createdAt", number)` | |
| `updatedAt` | `node.data.set("updatedAt", number)` | |
| `completedAt` | `node.data.set("completedAt", number\|null)` | |
| `publishedAt` | `node.data.set("publishedAt", number\|null)` | |
| `marks` | `node.data.set("marks", json)` | Phase 2 升级为 LoroText marks |
| `inlineRefs` | `node.data.set("inlineRefs", json)` | Phase 2 合入 LoroText |
| `templateId` | `node.data.set("templateId", str)` | |
| `viewMode` | `node.data.set("viewMode", str)` | |
| `editMode` | `node.data.set("editMode", bool)` | |
| `flags` | `node.data.set("flags", number)` | |
| `imageWidth` | `node.data.set("imageWidth", number)` | |
| `imageHeight` | `node.data.set("imageHeight", number)` | |
| `searchContext` | `node.data.set("searchContext", str)` | |
| `aiSummary` | `node.data.set("aiSummary", str)` | |
| `sourceUrl` | `node.data.set("sourceUrl", str)` | |

**消除的字段不在 Loro 中存储**：`_ownerId`（LoroTree parent）、`workspaceId`（LoroDoc 隔离）、`version`（Loro 版本向量）、`meta`（直接属性）、`touchCounts/modifiedTs/createdBy/updatedBy`（删除）。

### 2.7 Meta Tuple 消除 — 直接属性化

**旧模式**（3 级间接）：
```
node.meta → [tupleId1, tupleId2]
  tuple1.children → [SYS_A13, tagDefId]    ← 标签
  tuple2.children → [SYS_A55, SYS_V03]     ← checkbox
```

**新模式**（直接属性）：
```typescript
// 标签 — LoroList，并发 insert 自动合并
node.data.getList("tags")  // [tagDefId1, tagDefId2]

// ⚠️ 去重约定（重要）：
// LoroList 并发 insert 可能产生重复（两端同时 addTag 同一 tagDefId）。
// - addTag() 操作必须 check-before-push（本地去重）
// - toNodexNode() 读取 tags 时做去重保护：[...new Set(tagsContainer.toArray())]
// - Phase 2 同步场景下重复概率更高，此约定从 Phase 1 就必须遵守

// 其他原 meta 属性 — 直接存储
node.data.get("completedAt")     // timestamp (旧 _done，来自 SYS_A55 checkbox)
// _locked, _color 等 → 如果 TagDef 级别控制，存在 TagDef 节点上（见 §2.8）
```

**Checkbox 特殊说明**：`SYS_A55`（SHOW_CHECKBOX）是 **TagDef 的模板属性**，不是内容节点的属性。它决定"应用了这个标签的节点是否显示 checkbox"。应直接存在 TagDef 节点：

```typescript
tagDefNode.data.set("showCheckbox", true);
// UI 渲染时：检查节点的 tags → 任一 tagDef 有 showCheckbox → 显示
```

### 2.8 TagDef / FieldDef 配置直接化

TagDef 和 FieldDef（旧 attrDef）的配置也用 Tuple 间接存储。同样原生化：

```typescript
// TagDef 节点
tagDefNode.data = {
  id: "tag_xxx",
  type: "tagDef",
  name: "Task",
  showCheckbox: true,           // 旧 [SYS_A55, SYS_V03] config tuple
  childSupertag: "tag_yyy",     // 旧 [SYS_A14, tagDefId] config tuple
  color: "blue",                // 旧 [SYS_A11, value] config tuple
  templateFields: LoroList,     // [fieldDefId1, fieldDefId2]
}

// FieldDef 节点 (旧 attrDef)
fieldDefNode.data = {
  id: "field_xxx",
  type: "fieldDef",
  name: "Status",
  fieldType: "options",         // 旧 [SYS_A02, SYS_D06] → 现在直接用可读字符串
  cardinality: "single",        // 旧 [SYS_A10, SYS_V01] → 'single' | 'list'
  options: LoroList,            // 选项列表
}
```

### 2.9 Field Tuple（fieldEntry）改进

Field Tuple 保留为 LoroTree 节点（它在大纲中可见），但内部结构改进：

**旧模式**：
```
FieldTuple.children = [attrDefId, valueNode1, valueNode2]
//                      ↑ key       ↑ values（混在一起）
```

**新模式**：
```typescript
// fieldEntry 树节点
fieldEntry.data = {
  type: 'fieldEntry',
  fieldDefId: 'field_xxx',     // key 存属性（旧 children[0]）
}
// fieldEntry 的 LoroTree children = [valueNode1, valueNode2]
// 纯粹是值节点，key 不再混入 children
```

**收益**：key 不会被树操作意外影响，`getChildren()` 返回纯值列表。

### 2.10 Trash 操作改进

**旧模式**：改 `_ownerId = "{ws}_TRASH"` + 手动 splice children。

**新模式**：`tree.move(nodeId, trashContainerId)` — 一步完成。

恢复时需要知道原位置：
```typescript
// 移入 Trash 时，在节点 data 上记录来源
// ⚠️ Phase 2 并发注意：这三步不是原子的。并发 peer 可能覆盖 _trashedFrom。
// 解决方案：Phase 2 用 doc.commit() 事务包裹，使其在 CRDT 版本向量中为单一操作。
node.data.set("_trashedFrom", parentId);
node.data.set("_trashedIndex", childIndex);
tree.move(nodeId, trashContainerId);

// 恢复时
const from = node.data.get("_trashedFrom");
const index = node.data.get("_trashedIndex");
tree.move(nodeId, from, index);
node.data.delete("_trashedFrom");
node.data.delete("_trashedIndex");
```

### 2.11 ID 映射策略

Loro 的 TreeID 是内部类型（`{ peer: bigint, counter: number }`），不适合直接当 Nodex ID 用。

**方案**：维护双向映射 `Map<string, TreeID>` + `Map<serialized_TreeID, string>`

```typescript
// loro-doc.ts

// ⚠️ TreeID 是对象，不能直接做 Map key（引用相等）。
// 必须序列化为字符串。bigint 不能 JSON.stringify，需显式 toString()。
function treeIdStr(id: TreeID): string {
  return `${id.peer.toString()}_${id.counter}`;
}

const nodexIdToTreeId = new Map<string, TreeID>();
const treeIdToNodexId = new Map<string, string>(); // key = treeIdStr(treeId)

function createNode(nodexId: string, parentNodexId: string | null, index?: number): TreeID {
  // parentNodexId === null → 挂在 LoroTree 虚拟根下
  const parentTreeId = parentNodexId ? nodexIdToTreeId.get(parentNodexId) : undefined;
  const treeNode = tree.createNode(parentTreeId, index);
  const treeId = treeNode.id;
  nodexIdToTreeId.set(nodexId, treeId);
  treeIdToNodexId.set(treeIdStr(treeId), nodexId);
  treeNode.data.set("id", nodexId);
  return treeId;
}
```

**持久化**：映射表不需要单独持久化——从 Loro snapshot 恢复时遍历所有树节点重建。

### 2.12 工作区隔离与树根结构

**旧模式**：每个节点存 `workspaceId`，用于 Supabase WHERE 子句。

**新模式**：一个 LoroDoc = 一个工作区。

```typescript
// IndexedDB 结构
// nodex_db / loro_snapshots / {workspaceId} → Uint8Array
```

工作区切换 = 加载不同的 LoroDoc。`workspaceId` 从节点上消除。

**LoroTree 根结构**：

LoroTree 有一个隐式虚拟根（parent = `null`/`undefined`）。工作区节点直接挂在虚拟根下：

```
LoroTree 虚拟根 (null)
  └── 工作区根节点 (id: WS_ID)
        ├── LIBRARY 容器
        ├── INBOX 容器
        ├── TRASH 容器
        ├── SCHEMA 容器
        └── ...
```

```typescript
// 常量定义
const LORO_ROOT = null; // LoroTree 虚拟根，createNode 的 parent 传 null 表示挂在虚根

// 创建工作区根
doc.createNode(WS_ID, LORO_ROOT);
```

**容器 ID 简化**：一个 LoroDoc = 一个工作区后，容器 ID 不再需要 `{wsId}_` 前缀。

```typescript
// 旧模式
const LIBRARY_ID = `${workspaceId}_LIBRARY`; // "ws_001_LIBRARY"

// 新模式 — 固定 ID（LoroDoc 已隔离工作区）
export const CONTAINERS = {
  LIBRARY: 'LIBRARY',
  INBOX: 'INBOX',
  TRASH: 'TRASH',
  SCHEMA: 'SCHEMA',
  JOURNAL: 'JOURNAL',
  SEARCHES: 'SEARCHES',
  CLIPS: 'CLIPS',
  // ... 其他容器
} as const;

// getContainerId() 不再需要 workspaceId 参数
export function getContainerId(suffix: ContainerSuffix): string {
  return suffix;  // 直接返回常量
}
```

## 3. 核心模块设计

### 3.1 `src/lib/loro-doc.ts` — Loro 文档单例（新建）

```typescript
export interface LoroDocManager {
  // 初始化
  init(): Promise<void>;

  // 树操作
  createNode(id: string, parentId: string, index?: number): void;
  moveNode(id: string, newParentId: string, index?: number): void;
  deleteNode(id: string): void;

  // 节点属性
  getNodeData(id: string): Record<string, unknown> | null;
  setNodeData(id: string, key: string, value: unknown): void;
  setNodeDataBatch(id: string, data: Record<string, unknown>): void;

  // 标签操作（LoroList 原生，addTag 内部 check-before-push 去重）
  addTag(nodeId: string, tagDefId: string): void;
  removeTag(nodeId: string, tagDefId: string): void;
  getTags(nodeId: string): string[];  // 返回去重后的列表

  // 查询
  getChildren(parentId: string): string[];
  getParentId(id: string): string | null;
  hasNode(id: string): boolean;
  getAllNodeIds(): string[];

  // 持久化
  save(): Promise<void>;

  // 事件
  subscribe(callback: () => void): () => void;

  // 导出（Phase 2）
  exportSnapshot(): Uint8Array;
  exportUpdates(since: VersionVector): Uint8Array;
  importUpdates(data: Uint8Array): void;
}
```

### 3.2 `src/stores/node-store.ts` — 重构后的 Zustand Store

```typescript
interface NodeStore {
  // === 读取 ===
  getNode(id: string): NodexNode | null;
  getChildren(parentId: string): NodexNode[];

  // === 树操作（同步，Loro WASM 调用） ===
  createChild(parentId: string, index?: number, data?: Partial<NodexNode>): NodexNode;
  createSibling(siblingId: string, data?: Partial<NodexNode>): NodexNode;
  moveNodeTo(nodeId: string, newParentId: string, index?: number): void;
  indentNode(nodeId: string): void;
  outdentNode(nodeId: string): void;
  moveNodeUp(nodeId: string): void;
  moveNodeDown(nodeId: string): void;
  trashNode(nodeId: string): void;
  restoreNode(nodeId: string): void;

  // === 内容编辑（同步） ===
  setNodeName(id: string, name: string): void;
  updateNodeContent(id: string, data: Partial<NodexNode>): void;

  // === 标签/字段操作（大幅简化） ===
  applyTag(nodeId: string, tagDefId: string): void;
  removeTag(nodeId: string, tagDefId: string): void;
  createTagDef(name: string, options?: { showCheckbox?: boolean }): NodexNode;
  createFieldDef(name: string, fieldType: FieldType): NodexNode;  // 旧 createAttrDef
  setFieldValue(nodeId: string, fieldDefId: string, values: string[]): void;

  // === 响应式 ===
  _version: number;
}
```

**关键变化**：

1. **删除** `entities`, `loading`, `_dirtyContentIds`, `_pendingChildrenOps`
2. **删除** 所有 `nodeService.*` 调用
3. **删除** `fetchNode`/`fetchChildren`（数据在本地 Loro Doc）
4. **所有操作变为同步**（Loro WASM 调用无网络 I/O）
5. **`applyTag` 大幅简化**：旧 9 步 → 新 3 步
   - 旧：创建 TagTuple → 设 children → 设 _ownerId → push meta → 持久化 × 2 → 解析模板 → 创建 FieldTuple → 持久化
   - 新：`loroDoc.addTag(nodeId, tagDefId)` → 解析模板 → 创建 fieldEntry 树节点

### 3.3 `toNodexNode()` 转换函数

```typescript
// src/lib/loro-doc.ts

export function toNodexNode(nodexId: string): NodexNode | null {
  const treeId = nodexIdToTreeId.get(nodexId);
  if (!treeId) return null;
  const treeNode = tree.getNodeByID(treeId);
  if (!treeNode) return null;

  const data = treeNode.data;
  const childIds = treeNode.children()
    .map(c => treeIdToNodexId.get(treeIdStr(c.id)))
    .filter(Boolean) as string[];

  // 读取 tags LoroList（去重保护，防止并发 insert 产生重复）
  const tagsContainer = data.getOrCreateContainer("tags", "List");
  const tags = [...new Set(tagsContainer.toArray() as string[])];

  return {
    id: nodexId,
    type: data.get("type"),
    name: data.get("name"),
    description: data.get("description"),
    children: childIds,
    tags,
    createdAt: data.get("createdAt") ?? Date.now(),
    updatedAt: data.get("updatedAt") ?? Date.now(),
    completedAt: data.get("completedAt"),
    publishedAt: data.get("publishedAt"),
    marks: data.get("marks"),
    inlineRefs: data.get("inlineRefs"),
    templateId: data.get("templateId"),
    viewMode: data.get("viewMode"),
    editMode: data.get("editMode"),
    flags: data.get("flags"),
    imageWidth: data.get("imageWidth"),
    imageHeight: data.get("imageHeight"),
    searchContext: data.get("searchContext"),
    aiSummary: data.get("aiSummary"),
    sourceUrl: data.get("sourceUrl"),
  };
}
```

### 3.4 React Hooks

```typescript
// use-node.ts — 简化
export function useNode(nodeId: string | null): NodexNode | null {
  const version = useNodeStore((s) => s._version);
  return useNodeStore((s) => nodeId ? s.getNode(nodeId) : null);
}

// use-children.ts — 简化
export function useChildren(nodeId: string | null): NodexNode[] {
  const version = useNodeStore((s) => s._version);
  return useNodeStore((s) => nodeId ? s.getChildren(nodeId) : []);
}

// use-realtime.ts — Phase 1 整个删除
```

### 3.5 持久化 — IndexedDB

```typescript
// src/lib/loro-persistence.ts

const DB_NAME = 'nodex';
const STORE_NAME = 'loro_snapshots';

export async function saveSnapshot(workspaceId: string, data: Uint8Array): Promise<void>;
export async function loadSnapshot(workspaceId: string): Promise<Uint8Array | null>;
```

**保存时机**：
- 每次操作后 debounce 保存（1-2 秒）
- `visibilitychange`（切换标签页时）
- `beforeunload`（关闭页面时）

## 4. 命名迁移指南

### 4.1 全局替换规则（供 nodex-cc 执行）

```
# 高频替换（props 扁平化）
props.name          → name
props._docType      → type
props._ownerId      → (删除，用 loroDoc.getParentId())
props._sourceId     → templateId
props.created       → createdAt
props._done         → completedAt
props._marks        → marks
props._inlineRefs   → inlineRefs
props.description   → description
props._flags        → flags
props._view         → viewMode
props._published    → publishedAt
props._editMode     → editMode
props._imageWidth   → imageWidth
props._imageHeight  → imageHeight
props.searchContextNode → searchContext

# 类型替换
DocType             → NodeType
'tuple'             → 'fieldEntry'
'attrDef'           → 'fieldDef'
createAttrDef       → createFieldDef

# 接口替换
NodeProps           → (消除，属性直接在 NodexNode 上)
CreateNodeInput     → (重新设计，匹配新接口)
UpdateNodeInput     → (重新设计，匹配新接口)
```

### 4.2 组件适配策略

40 个文件使用 `props.` 访问节点属性。按影响分类：

| 文件类型 | 数量 | 策略 |
|----------|------|------|
| `src/stores/node-store.ts` | 1 | 完全重写（Loro 迁移） |
| `src/services/*.ts` | 5 | 删除或重写 |
| `src/lib/*.ts` | 6 | 更新属性访问 |
| `src/hooks/*.ts` | 10 | 更新属性访问 |
| `src/components/**/*.tsx` | 18 | 全局替换 `props.xxx` → `xxx` |

**执行顺序**：先改类型定义 → 再用 TypeScript 编译器报错引导修改所有消费方。

## 5. 删除/新建/修改清单

### 5.1 删除的文件

| 文件 | 原因 |
|------|------|
| `src/services/node-service.ts` | Supabase CRUD，Phase 1 无网络 |
| `src/services/supabase.ts` | Supabase 客户端单例 |
| `src/hooks/use-realtime.ts` | Supabase Realtime 订阅 |
| `src/lib/supabase.ts` | Supabase 初始化 |
| `src/lib/meta-utils.ts` | meta Tuple 系统消除 |

**注意**：不物理删除，标记 deprecated + 注释掉 import。Phase 2 同步时可能复用 Supabase 代码。

### 5.2 新建的文件

| 文件 | 说明 |
|------|------|
| `src/lib/loro-doc.ts` | Loro 文档单例 + ID 映射 + 树操作 + toNodexNode |
| `src/lib/loro-persistence.ts` | IndexedDB 持久化 |
| `tests/vitest/loro-doc.test.ts` | Loro 层单元测试 |
| `tests/vitest/node-store-loro.test.ts` | Store 层集成测试 |

### 5.3 重写的文件

| 文件 | 变化 |
|------|------|
| `src/types/node.ts` | NodexNode 新接口 + NodeType + 消除 NodeProps |
| `src/types/system-nodes.ts` | FIELD_TYPES + SYSTEM_TAGS + 精简 SYS_A |
| `src/stores/node-store.ts` | 去 Supabase/entities，底层改 Loro，新 API 签名 |
| `src/entrypoints/test/seed-data.ts` | 用 Loro API + 新命名 |

### 5.4 修改的文件

| 文件 | 变化 |
|------|------|
| `src/hooks/use-node.ts` | 去 useEffect fetch |
| `src/hooks/use-children.ts` | 去 useEffect fetch |
| `src/hooks/use-node-tags.ts` | 读 `node.tags` 替代 meta Tuple 查找 |
| `src/hooks/use-node-checkbox.ts` | 读 TagDef.showCheckbox 替代 meta Tuple |
| `src/hooks/use-node-fields.ts` | fieldEntry 新模型 |
| `src/hooks/use-has-fields.ts` | 同上 |
| `src/hooks/use-field-options.ts` | 同上 |
| `src/hooks/use-workspace-tags.ts` | 适配新命名 |
| `src/hooks/use-workspace-fields.ts` | 适配新命名 |
| `src/entrypoints/sidepanel/App.tsx` | 去 Supabase 初始化，加 Loro 初始化 |
| `src/entrypoints/test/TestApp.tsx` | 适配 Loro 初始化 |
| `src/lib/tree-utils.ts` | 适配 getNode + 新命名 |
| `src/lib/field-utils.ts` | 适配 fieldEntry 新模型 + 新命名 |
| `src/lib/checkbox-utils.ts` | 大幅简化（读 TagDef 直接属性） |
| `src/components/**/*.tsx` (~18 files) | 全局替换 `props.xxx` → `xxx` + 类型名 |
| `tests/vitest/helpers/test-state.ts` | 适配 Loro |
| `wxt.config.ts` | WASM 支持配置 |
| `package.json` | 添加 `loro-crdt` |

### 5.5 保留不变的文件

| 文件 | 原因 |
|------|------|
| `src/stores/ui-store.ts` | UI 状态与节点数据无关 |
| `src/stores/workspace-store.ts` | 工作区/用户状态保留 |
| `src/lib/chrome-storage.ts` | UI 持久化适配器 |
| `src/lib/editor-marks.ts` | marks 工具函数（操作 TextMark 对象） |
| `src/lib/pm-doc-utils.ts` | ProseMirror ↔ marks 转换 |

## 6. 实施步骤

### Step 0: 环境准备 + 技术验证

```bash
npm install loro-crdt
```

**技术验证**（在 standalone 环境下）：
1. 验证 WASM 在 Vite + WXT 中加载正常
2. 创建 LoroDoc + LoroTree，基本 CRUD 操作
3. 测量 Side Panel 冷启动时间（WASM 初始化耗时）
4. 验证 CSP `wasm-unsafe-eval` 配置（如需）

**验证通过才继续**。如果 WASM 有问题，先在 standalone（http://localhost）上开发，Extension 适配最后做。

### Step 1: 类型系统重构

**先改类型定义，让编译器报错引导后续修改。**

1. 重写 `src/types/node.ts`：新 NodexNode 接口（§2.2）、NodeType（§2.3）、消除 NodeProps
2. 重写 `src/types/system-nodes.ts`：FIELD_TYPES + SYSTEM_TAGS + 精简 SYS_A
3. `npm run typecheck` — 预期大量报错，这些报错就是后续步骤的改动清单

**验证**：类型文件本身无语法错误。报错数量记录下来作为进度 baseline。

### Step 2: 实现 `loro-doc.ts`（纯库层）

1. 创建 `src/lib/loro-doc.ts`
2. 实现 LoroDoc 单例 + ID 映射
3. 实现所有树操作
4. 实现节点属性读写 + tags LoroList 操作
5. 实现 `toNodexNode()` 转换函数
6. 实现 IndexedDB 持久化
7. 实现事件订阅

**验证**：`tests/vitest/loro-doc.test.ts`
- 创建节点 + 读取属性
- 移动节点 + 验证父子关系
- 循环检测（移动到后代 → 应 no-op 或报错）
- 兄弟排序
- tags LoroList 操作
- fieldEntry 创建（验证 fieldDefId 在 data 上，children 只有值节点）
- Trash 操作（move to trash + 记录 _trashedFrom）
- 导出 → 导入 → 状态一致
- ID 映射恢复

### Step 3: 重构 node-store.ts

**最大的一步，分 4 个子步骤：**

#### 3a. 基础读写
1. 删除 `entities`, `loading`, `_dirtyContentIds`, `_pendingChildrenOps`
2. 新增 `_version: number`
3. 实现 `getNode(id)` → `toNodexNode(id)`
4. 实现 `getChildren(parentId)`
5. 订阅 Loro 变更 → `_version++`

#### 3b. 树操作
逐个重写 createChild / createSibling / moveNodeTo / indent / outdent / moveUp / moveDown / trashNode / restoreNode。

#### 3c. 标签/字段操作
- `applyTag`：简化为 `loroDoc.addTag()` + 模板字段创建
- `removeTag`：简化为 `loroDoc.removeTag()` + 清理 fieldEntry
- `createTagDef` / `createFieldDef`：直接属性化配置
- `setFieldValue`：更新 fieldEntry children

#### 3d. 内容编辑
- `setNodeName(id, name)` → `loroDoc.setNodeData(id, "name", name)`
- `updateNodeContent(id, data)` → `loroDoc.setNodeDataBatch(id, data)`

### Step 4: 种子数据重写

用 Loro API + 新命名重写 `seed-data.ts`：

```typescript
export function seedTestData() {
  const doc = getLoroDoc();

  // 工作区根（挂在 LoroTree 虚拟根下，parent = null）
  doc.createNode(WS_ID, null);
  doc.setNodeDataBatch(WS_ID, {
    type: 'workspace',
    name: 'My Workspace',
    createdAt: Date.now(),
  });

  // 容器
  doc.createNode(libraryId, WS_ID);
  doc.setNodeDataBatch(libraryId, { name: 'Library', createdAt: Date.now() });

  // 内容
  doc.createNode('proj_1', libraryId);
  doc.setNodeDataBatch('proj_1', {
    name: 'My Project',
    description: 'A sample project',
    createdAt: Date.now(),
  });

  // 标签应用 — 直接操作 LoroList（不再创建 TagTuple）
  doc.addTag('proj_1', 'tag_project');

  // 字段实例 — fieldEntry 节点
  doc.createNode('fe_status', 'proj_1');
  doc.setNodeDataBatch('fe_status', {
    type: 'fieldEntry',
    fieldDefId: 'field_status',
    createdAt: Date.now(),
  });
  // 字段值作为 fieldEntry 的 tree children
  doc.createNode('val_in_progress', 'fe_status');
  doc.setNodeDataBatch('val_in_progress', { name: 'In Progress', createdAt: Date.now() });
}
```

**验证**：standalone 页面正常渲染种子数据。

### Step 5: Hooks + 工具函数适配

1. `use-node.ts` / `use-children.ts` — 去 useEffect，加 `_version`
2. `use-node-tags.ts` — 读 `node.tags` 替代 meta Tuple 查找
3. `use-node-checkbox.ts` — 读 TagDef.showCheckbox
4. `use-node-fields.ts` / `use-has-fields.ts` — fieldEntry 新模型
5. `tree-utils.ts` — 适配 `getNode()` + 新属性名
6. `field-utils.ts` — 适配 fieldEntry 新模型
7. `checkbox-utils.ts` — 大幅简化
8. 删除 `meta-utils.ts` 的所有引用

### Step 6: 组件层全局替换

40 个文件的 `props.xxx` 替换。推荐策略：

1. **先确保 Step 1 的类型变更已完成**
2. `npm run typecheck` 输出所有 TS 报错
3. 按报错逐文件修复（大部分是机械性的 `props.name` → `name`）
4. 同时替换 `_docType` → `type`、`_done` → `completedAt` 等

### Step 7: 测试 + 清理

1. **Vitest**：
   - `loro-doc.test.ts`（Step 2 验证）
   - `node-store-loro.test.ts`（新 store 测试）
   - 删除 `realtime-echo-protection.test.ts`（前提不再存在）
2. **Standalone 功能验证**：
   - 创建/删除/移动节点
   - 缩进/反缩进
   - 标签应用/移除
   - 字段值设置
   - 刷新后数据恢复（IndexedDB）
3. **清理**：
   - 删除未使用的 import
   - 确认无 `props.` 残留
   - 确认无 `_docType` / `_ownerId` / `meta` 残留

## 7. 性能考量

### 7.1 `toNodexNode()` 开销

每次 selector 调用从 Loro 读取并构造对象。优化策略：
1. **Memoize**：LRU 缓存，Loro 版本不变时返回缓存
2. **细粒度订阅**：Loro 支持 per-container 事件

### 7.2 保存频率

- 全量 snapshot：~50-100ms（debounce 2s）
- Phase 2 可优化为增量保存

### 7.3 WASM 初始化

~50-100ms。在 App 初始化流程中预加载。

### 7.4 WASM 体积

- `loro_wasm_bg.wasm` raw 3.1MB，gzip ~1MB
- 当前扩展总量 1.03MB
- Chrome Extension 本地安装，体积增加不影响用户体验
- 重点关注 **冷启动时间**，非下载体积

## 8. 风险与缓解

| 风险 | 缓解 |
|------|------|
| WASM 在 WXT/Vite 中加载失败 | Step 0 最先验证 |
| Chrome MV3 CSP 阻止 WASM | standalone 先行，`wasm-unsafe-eval` 配置 |
| Loro API 行为与预期不符 | Step 2 写充分单元测试 |
| `toNodexNode()` 性能不足 | memoize + 细粒度更新 |
| 命名全局替换遗漏 | TypeScript 编译器 + `npm run typecheck` 兜底 |
| 种子数据遗漏节点关系 | 对比前后节点数量和树结构 |

## 9. 验收标准

Phase 1 完成的定义：

- [ ] `npm run typecheck` 通过
- [ ] `npm run test:run` 通过
- [ ] standalone 页面所有现有交互正常
- [ ] 刷新后数据从 IndexedDB 恢复
- [ ] 不再有任何 Supabase 调用
- [ ] node-store.ts 行数从 2176 显著减少
- [ ] 无 `_pendingChildrenOps`、无 `_dirtyContentIds`、无 3s timeout hack
- [ ] 无 `props.` 访问残留（全部扁平化）
- [ ] 无 `meta` / `_ownerId` / `workspaceId` / `version` 残留
- [ ] 无 `DocType` / `_docType` / `'tuple'` / `'attrDef'` 残留
- [ ] 标签应用不再创建 meta Tuple 节点
- [ ] Trash 操作通过 `tree.move()` 实现

## 10. Phase 2 预留

- 网络同步（Loro exportUpdates/importUpdates over WebSocket/HTTP）
- LoroText 替换 `name` + `marks` + `inlineRefs`（TipTap ↔ LoroText 双向同步）
- `createdBy` / `updatedBy` 复活（基于 Loro PeerID）
- Tana JSON 导入适配（新数据模型）
- 多工作区支持（多 LoroDoc 切换）
- Chrome Extension 打包验证

## 11. 给 nodex-cc 的执行建议

1. **严格按 Step 0→1→2→3→4→5→6→7 顺序**。每步 typecheck + 提交
2. **Step 1（类型系统）先行**：改完类型定义后，编译器报错就是你的 todo list
3. **Step 3 是最大风险**：先 3a+3b 让 standalone 能渲染，再 3c+3d
4. **命名替换用 TypeScript 兜底**：不要手动 grep，让编译器告诉你哪里还没改
5. **Step 0 技术验证不通过就停**：不要在 WASM 问题未解决时写业务代码
6. **分支**: `cc/loro-migration-phase1`，Draft PR 开工即创建
7. **高风险文件声明**: `node-store.ts`、`node.ts`、`system-nodes.ts`（TASKS.md 声明文件锁）
