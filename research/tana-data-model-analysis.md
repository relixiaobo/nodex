# Tana 数据模型深度分析

> 基于真实导出数据 `b8AyeCJNsefK@2026-01-30.json` (41,753 nodes)、Tana 官方文档、以及 Tana UI 逆向分析的完整数据模型还原。

---

## 1. 核心哲学：Everything is a Node

Tana 的基础架构原则是 **一切皆节点（Everything is a Node）**。这不是比喻——内容、标签定义、字段定义、搜索查询、视图、命令、工作区设置，全部是同一种底层数据结构：**Node（文档/Doc）**。

不同"类型"的区别仅在于节点上附加的 **元数据（metadata）** 和 UI 的 **渲染方式（projection）**。

---

## 2. 顶层文件结构

```json
{
  "editors": [                         // 编辑者列表（用户 + 系统账号）
    ["lixiaobock@gmail.com", 0],       // [email, editorIndex]
    ["system+ai@tagr", 1],
    ["system@tagr", 2],
    ["system+migration@tagr", 3]
  ],
  "lastTxid": 1769766906612,          // 最后事务 ID
  "lastFbKey": "-OkDJyPWAuQs8e_cvMcA",// 最后 Firebase key
  "optimisticTransIds": [],            // 乐观事务 ID 列表
  "currentWorkspaceId": "eFpfUa7bAE_v",// 当前工作区 ID
  "formatVersion": 1,                 // 导出格式版本
  "docs": [...],                       // 41,753 个文档节点（核心数据）
  "workspaces": {...}                  // 工作区配置
}
```

---

## 3. Node（节点）—— 核心数据结构

每个节点是一个 JSON 对象，拥有以下结构：

```typescript
interface TanaNode {
  // === 必须字段 ===
  id: string;                    // 唯一标识符（如 "SYS_T01", "qwcopMAOrB5v"）
  props: {
    created: number;             // 创建时间戳（毫秒）

    // === 可选属性 ===
    name?: string;               // 节点内容/名称（支持 HTML 富文本）
    description?: string;        // 节点描述

    // === 类型与所有权 ===
    _docType?: DocType;          // 文档类型（见下文枚举）
    _ownerId?: string;           // 父/所有者节点 ID（每个节点恰好一个 owner）
    _metaNodeId?: string;        // 关联的元节点 ID（存储标签、配置）
    _sourceId?: string;          // 克隆来源 ID（从标签模板继承时）

    // === 状态标记 ===
    _flags?: number;             // 位标志（1=普通, 2, 64, 65）
    _done?: number;              // 完成时间戳（checkbox 勾选时间）

    // === 视觉/媒体 ===
    _imageHeight?: number;       // 图片高度
    _imageWidth?: number;        // 图片宽度
    _view?: ViewType;            // 视图类型
    _published?: number;         // 发布时间戳
    _editMode?: boolean;         // 编辑模式标志
  };

  // === 可选字段 ===
  children?: string[];           // 子节点 ID 列表（有序）
  associationMap?: {             // 字段 -> 值 的映射
    [fieldNodeId: string]: string; // fieldChildId -> valueNodeId
  };
  touchCounts?: [number, number, number, number];  // 各编辑者的访问/修改计数
  modifiedTs?: [number, number, number, number];   // 各编辑者的最后修改时间戳
  migrateTime?: number;          // 数据迁移时间戳
  splitFraction?: number;        // UI 分栏比例
  scrollSize?: number;           // 滚动区域大小
  scrollY?: number;              // 滚动位置
  history?: any[];               // 编辑历史
  expanded?: any[];              // 展开状态
}
```

### 3.1 DocType 枚举（22 种文档类型）

```typescript
type DocType =
  // 定义类型
  | "tagDef"          // 超级标签定义（39个）
  | "attrDef"         // 字段/属性定义（170个）
  | "metanode"        // 元节点 —— 存储节点的标签和配置（5,626个）
  | "tuple"           // 元组 —— 配对关系的容器（12,224个）

  // 内容类型
  | "journalPart"     // 日记条目 —— 每日页面（142个）
  | "journal"         // 日记容器（1个）
  | "search"          // 保存的搜索/动态查询（44个）
  | "home"            // 工作区首页根节点（1个）

  // UI & 配置类型
  | "viewDef"         // 视图定义（53个）
  | "workspace"       // 工作区定义（308个）
  | "settings"        // 设置容器（1个）

  // 富内容类型
  | "visual"          // 图片/视觉内容（58个）
  | "codeblock"       // 代码块（870个）
  | "url"             // URL 引用（28个）
  | "chat"            // 聊天对话（4个）
  | "associatedData"  // 关联数据（2,612个）

  // 系统/工具类型
  | "command"         // 系统命令（45个）
  | "systemTool"      // 系统工具（30个）
  | "chatbot"         // 聊天机器人定义（1个）
  | "syntax"          // 语法定义（20个）
  | "placeholder";    // 占位符节点（1个）

  // 无类型 —— 普通用户内容节点（19,475个）

type ViewType = "list" | "table" | "tiles" | "navigationList" | "cards";
```

---

## 4. 关系模型

Tana 的关系模型有四层：

### 4.1 树形层级（Parent-Child）

```
Node._ownerId   →  父节点 ID（所有权，每个节点恰好一个 owner）
Node.children[]  →  子节点 ID 列表（有序）
```

这构成了大纲树的基本结构。`_ownerId` 是永久归属地，`children` 数组决定了渲染顺序。

### 4.2 引用（References）

引用是同一个节点出现在多个位置。在 `name` 字段中有两种编码：

```html
<!-- 行内引用（Inline Reference） -->
<span data-inlineref-node="Lgdr5_g94__D"></span>

<!-- 节点引用 -->
[[What makes a great ChatGPT app^lj5xyDUdBwqV]]
```

在 `children` 数组中，引用节点的 ID 直接出现在多个父节点的 children 中，但只有一个 `_ownerId`。

### 4.3 元节点关系（Metanode）

每个需要附加元信息的节点通过 `_metaNodeId` 链接到一个 **metanode**：

```
Node._metaNodeId → Metanode
Metanode._ownerId → Node（反向引用）
Metanode._docType = "metanode"
Metanode.children[] → [Tuple, Tuple, ...]
```

Metanode 的子节点是 **Tuple** 节点，每个 Tuple 存储一对键值：

```
Tuple.children = [SystemAttributeId, ValueNodeId]
```

### 4.4 字段值关联（AssociationMap）

```typescript
// 节点的 associationMap 将字段子节点映射到值节点
Node.associationMap = {
  "fieldChildNodeId": "valueNodeId"
}

// fieldChildNodeId 同时出现在 Node.children[] 中
// valueNodeId 指向值节点（可以是普通节点、选项节点等）
```

---

## 5. 超级标签（Supertag）系统

### 5.1 标签定义结构

Supertag 是 `_docType: "tagDef"` 的特殊节点：

```json
{
  "id": "jDc2ISPtN3v3",
  "props": {
    "name": "task",
    "_docType": "tagDef",
    "_ownerId": "b8AyeCJNsefK_SCHEMA",  // 归属于 Schema 容器
    "_metaNodeId": "b4HnZKTVEqgG"
  },
  "children": [          // 子节点是 Tuple，每个 Tuple 定义一个字段
    "2BdD6fhwKKq9",      // Tuple: Status 字段
    "5FA0IvNrUYjr",      // Tuple: Project 字段
    "UClVbiPxirpE"       // Tuple: Date 字段
  ]
}
```

### 5.2 标签字段定义（通过 Tuple）

每个 Tuple 节点包含一对子节点：`[FieldDefinition, DefaultValue]`

```
TagDef
  └── Tuple (_docType: "tuple")
        ├── children[0]: AttrDef (_docType: "attrDef") —— 字段定义
        └── children[1]: DefaultValueNode —— 默认值（可为空节点）
```

实例分析（task 标签的 Status 字段）：

```
task (tagDef: jDc2ISPtN3v3)
  └── Tuple (2BdD6fhwKKq9)
        ├── AttrDef "Status" (FcH-bv_pHVIt)
        │     └── children: [m80TkGG5-bbD, WzJFa6Mq_bmK]  // 字段配置
        └── "Backlog" (lp0DfFXn2aEA) —— 默认值
```

### 5.3 标签继承（Extends）

标签支持继承。例如 `article` 继承自 `source`：

```
article (tagDef) → Extends → source (tagDef)
```

继承的字段被合并显示。子标签可以覆盖默认值但不能删除继承的字段。

### 5.4 标签应用机制

当一个节点被打上 supertag 时，通过 **Metanode + Tuple** 存储：

```
ContentNode._metaNodeId → Metanode
  Metanode.children = [
    Tuple: [SYS_A13("Node supertags(s)"), tagDefNodeId]  // 标签引用
    Tuple: [SYS_A55("Show done/not done"), SYS_V03("Yes")]  // checkbox 配置
  ]
```

具体示例（一个完成的 task 节点）：

```
Node "优化 deep research 的prompt" (Joh0FUZf2dlb)
  _done: 1763716131457
  _metaNodeId: dIQnXG4wVND8
    └── Metanode (dIQnXG4wVND8)
          ├── Tuple: [SYS_A55, SYS_V03]  → "启用 checkbox"
          └── Tuple: [SYS_A13, jDc2ISPtN3v3]  → "标记为 #task"
```

### 5.5 系统标签层级

```
SYS_T00: System Supertags (根)
  ├── SYS_T01: supertag（核心标签定义的标签）
  ├── SYS_T02: field-definition（字段定义的标签，27 个子字段）
  ├── SYS_T16: meta information（56 个子配置项）
  ├── SYS_T98: meeting (base type)
  ├── SYS_T99: person (base type)
  ├── SYS_T100: task (base type)
  ├── SYS_T101: organization (base type)
  ├── SYS_T102: location (base type)
  ├── SYS_T103: event (base type)
  ├── SYS_T104: project (base type)
  ├── SYS_T105: topic (base type)
  ├── SYS_T117: article (base type)
  ├── SYS_T118: memo (base type)
  └── ...
```

---

## 6. 字段（Field）系统

### 6.1 字段定义

字段是 `_docType: "attrDef"` 的节点：

```json
{
  "id": "FcH-bv_pHVIt",
  "props": {
    "name": "Status",
    "_docType": "attrDef",
    "_ownerId": "2BdD6fhwKKq9",     // 所属 Tuple
    "_metaNodeId": "3a35NaQTcL9P"
  },
  "children": ["m80TkGG5-bbD", "WzJFa6Mq_bmK"]  // 字段配置（类型、选项等）
}
```

### 6.2 字段数据类型

```
SYS_D00: Data Types（根）
SYS_D01: Checkbox        —— 布尔值
SYS_D02: Integer         —— 整数
SYS_D03: Date            —— 日期
SYS_D05: Options from supertag —— 来自标签的选项
SYS_D06: Plain           —— 纯文本/列表
SYS_D07: Formula         —— 公式
SYS_D08: Number          —— 数字
SYS_D09: Tana User       —— 用户引用
SYS_D10: Url             —— URL
SYS_D11: E-Mail          —— 邮箱
SYS_D12: Options         —— 自定义选项
```

### 6.3 字段值存储

字段值通过 **两个维度** 关联到节点：

1. **children 数组**：字段子节点按顺序排列在节点的 children 中
2. **associationMap**：建立 fieldChildId → valueNodeId 的映射

```json
{
  "id": "-t-roJbnoHTF",
  "props": { "name": "接入 GPT-image-1 模型" },
  "children": [
    "s19m5qCXR448",     // Tuple（来自标签模板 _sourceId）
    "mZGX15KYiZ3X",     // 字段：GPT-image-1 API
    "UsdfRtAS_D-J",     // 字段：备注
    "tWQmMQgbgqcM",     // 字段：代码块
    "mzMyFBga2T1P",     // 字段：示例Prompt
    "EDM39S4RzngJ"      // 字段：修改说明
  ],
  "associationMap": {
    "mZGX15KYiZ3X": "XadB0CmTSGKL",  // fieldChild → valueNode
    "mzMyFBga2T1P": "SnjWEFVtTwMI",
    "tWQmMQgbgqcM": "nzmw3t0Xytzz",
    "EDM39S4RzngJ": "R8uRr-3eKi-V",
    "UsdfRtAS_D-J": "NM5QW3CeFWxS"
  }
}
```

### 6.4 关键系统属性（SYS_A*）

| ID | 名称 | 用途 |
|---|---|---|
| SYS_A01 | Nullable | 字段是否可为空 |
| SYS_A02 | typeChoice | 字段数据类型 |
| SYS_A03 | Values | 字段的值选项 |
| SYS_A06 | Selected source supertag | 选项来源标签 |
| SYS_A08 | Selected backreference | 反向引用属性 |
| SYS_A10 | Cardinality | 单值/多值 |
| SYS_A12 | Locked | 标题锁定 |
| SYS_A13 | Node supertags(s) | **节点的标签列表** |
| SYS_A14 | Child supertag | 子节点默认标签 |
| SYS_A15 | Search expression | 搜索表达式 |
| SYS_A16 | Views for node | 视图列表 |
| SYS_A55 | Show done/not done | 启用 checkbox |
| SYS_A90 | Date | 日期字段 |

---

## 7. 工作区（Workspace）结构

工作区根节点的 children 是系统容器：

```
Workspace Root (b8AyeCJNsefK)
  ├── b8AyeCJNsefK_STASH            // 暂存区
  ├── b8AyeCJNsefK_CAPTURE_INBOX    // 收件箱
  ├── b8AyeCJNsefK_SEARCHES         // 保存的搜索
  ├── b8AyeCJNsefK_SCHEMA           // Schema（标签定义容器）
  ├── oYZ09RyO9Abq                  // Library（用户内容根）
  ├── b8AyeCJNsefK_TRASH            // 回收站
  ├── b8AyeCJNsefK_MOVETO           // 移动目标配置
  ├── b8AyeCJNsefK_WORKSPACE        // 工作区设置
  ├── b8AyeCJNsefK_CHATDRAFTS       // 聊天草稿
  ├── b8AyeCJNsefK_SIDEBAR_AREAS    // 侧边栏区域
  ├── b8AyeCJNsefK_QUICK_ADD        // 快速添加配置
  ├── b8AyeCJNsefK_AVATAR           // 头像
  ├── b8AyeCJNsefK_USERS            // 用户列表
  ├── b8AyeCJNsefK_TRAILING_SIDEBAR // 尾部侧边栏
  └── b8AyeCJNsefK_PINS             // 固定节点
```

---

## 8. 日历/日记系统

日记系统使用层级结构：

```
Calendar (journal)
  └── Year Node (journalPart)
        └── Week Node (journalPart)
              └── Day Node (journalPart, name="2025-10-27 - Monday")
                    ├── 用户内容节点...
                    └── 用户内容节点...
```

日期字段值（`SYS_D03` 类型）链接到 Day 节点，不是日历节点本身。

---

## 9. 搜索节点（Search / Live Query）

搜索节点（`_docType: "search"`）是动态查询：

```json
{
  "id": "N120DO-uN9kV",
  "props": {
    "name": "To Do",
    "_docType": "search",
    "_metaNodeId": "KKFRgqt4K6qX"
  },
  "children": ["4DXNUiw4-Sm7"]
}
```

搜索配置存储在 Metanode 中，通过 Tuple 引用：
- `[SYS_A15, tagDefId, filterNodeId]` → 搜索表达式（基于标签 + 过滤条件）
- `[SYS_A16, viewDefId]` → 视图定义
- `[SYS_A14, tagDefId]` → 子节点默认标签

---

## 10. 富文本编码

### 10.1 Node name 中的 HTML

`name` 字段支持内嵌 HTML：

```html
<!-- 删除线 -->
<strike>chart_create</strike>

<!-- 强调 -->
上下文优化（Prompt Caching<em> </em>）

<!-- 行内引用 -->
write_stdin（配合 <span data-inlineref-node="Lgdr5_g94__D"></span>）

<!-- 代码块的 name 存储完整内容（支持 \n 换行） -->
"name": "#### `generate_image`\n- Use for: ..."
```

### 10.2 节点引用编码

```
[[节点名称^nodeId]]
```

---

## 11. Tuple 的核心角色

**Tuple（元组）** 是 Tana 数据模型中最关键的结构化节点，它是一个通用的"键值对容器"：

```typescript
interface Tuple {
  id: string;
  props: {
    _docType: "tuple";
    _ownerId: string;      // 父节点
    _sourceId?: string;    // 从标签模板克隆的来源
    created: number;
  };
  children: [
    string,    // children[0]: 键（通常是 SYS_A* 或 AttrDef ID）
    string,    // children[1]: 值（节点 ID 或 SYS_V* 值）
    string?    // children[2]: 可选的附加参数
  ];
}
```

### Tuple 的使用场景

| 上下文 | children[0] | children[1] | 含义 |
|---|---|---|---|
| Metanode 子节点 | SYS_A13 | tagDefId | 节点被打上此标签 |
| Metanode 子节点 | SYS_A55 | SYS_V03("Yes") | 启用 checkbox |
| TagDef 子节点 | AttrDef Id | DefaultValue Id | 标签的字段定义 + 默认值 |
| 搜索元数据 | SYS_A15 | tagDefId, filterId | 搜索表达式 |
| 内容节点子节点 | (来自 _sourceId) | AttrDef Id, value | 字段实例 |

---

## 12. 编辑者与版本追踪

```typescript
// touchCounts 和 modifiedTs 的数组索引对应 editors 数组中的编辑者
editors: [
  ["lixiaobock@gmail.com", 0],    // index 0
  ["system+ai@tagr", 1],           // index 1
  ["system@tagr", 2],              // index 2
  ["system+migration@tagr", 3]     // index 3
]

// 例如：
touchCounts: [245, 0, 1, 0]  // 用户访问245次，system 1次
modifiedTs: [1769758362451, 0, 1763540826362, 0]  // 用户和 system 的最后修改时间
```

---

## 13. 数据模型关系图总结

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Workspace Root                               │
│  children: [SCHEMA, LIBRARY, TRASH, INBOX, CALENDAR, ...]          │
└──────────┬──────────────────────────────────────────────────────────┘
           │
    ┌──────┴──────┐
    │   SCHEMA    │─── children ──→ [tagDef, tagDef, ...]
    └─────────────┘
           │
    ┌──────┴──────────────────────────────────────────────┐
    │  TagDef (e.g., "task")                               │
    │  _docType: "tagDef"                                  │
    │  children: [Tuple, Tuple, ...]                       │
    └──────┬───────────────────────────────────────────────┘
           │
    ┌──────┴──────────────────────────────────────────────┐
    │  Tuple                                               │
    │  _docType: "tuple"                                   │
    │  children: [AttrDef("Status"), DefaultValue("Backlog")]│
    └──────┬───────────────────────────────────────────────┘
           │
    ┌──────┴──────────────────────────────────────────────┐
    │  AttrDef (e.g., "Status")                            │
    │  _docType: "attrDef"                                 │
    │  children: [配置节点...]  ← 类型、选项等              │
    └─────────────────────────────────────────────────────┘


    ┌─────────────────────────────────────────────────────┐
    │  Content Node (e.g., 一个 task)                      │
    │  name: "优化 deep research"                          │
    │  _done: 1763716131457                                │
    │  _metaNodeId → Metanode                              │
    │  children: [Tuple(from template), field1, field2...] │
    │  associationMap: { field1: value1, field2: value2 }  │
    └──────┬──────────────────────────────────────────────┘
           │
    ┌──────┴──────────────────────────────────────────────┐
    │  Metanode                                            │
    │  _docType: "metanode"                                │
    │  _ownerId → ContentNode                              │
    │  children: [                                         │
    │    Tuple: [SYS_A13, "task" tagDef]  ← 标签关联       │
    │    Tuple: [SYS_A55, SYS_V03]       ← checkbox 启用   │
    │  ]                                                   │
    └─────────────────────────────────────────────────────┘
```

---

## 14. 统计概览

| 指标 | 数量 |
|---|---|
| 总节点数 | 41,753 |
| 有子节点的节点 | 23,431 |
| 有字段值(associationMap)的节点 | 789 |
| 有时间戳的节点 | 38,811 |
| 文档类型数 | 22 |
| 字段定义(attrDef) | 170 |
| 标签定义(tagDef) | 39 |
| 元节点(metanode) | 5,626 |
| 元组(tuple) | 12,224 |
| 代码块(codeblock) | 870 |
| 图片(visual) | 58 |
| 搜索节点(search) | 44 |
| URL 节点 | 28 |
| 日记条目(journalPart) | 142 |
| 无类型用户内容节点 | 19,475 |
| 工作区 | 102 |
| 编辑者 | 4 |

---

## 15. 关键设计模式总结

1. **统一节点模型**：所有实体共享相同的基础 Node 结构，通过 `_docType` 区分角色
2. **元节点模式**：通过独立的 Metanode 存储节点的标签和配置，实现关注点分离
3. **元组模式**：Tuple 是通用的键值对容器，用于标签定义中的字段声明、metanode 中的标签关联、搜索配置等
4. **单一所有者 + 多引用**：每个节点只有一个 `_ownerId`（归属地），但可以出现在多个父节点的 `children` 中
5. **AssociationMap 字段索引**：字段值通过 associationMap 高效索引，key 是字段子节点 ID，value 是值节点 ID
6. **HTML 富文本**：`name` 字段支持内嵌 HTML（`<span>`, `<strike>`, `<em>` 等），行内引用通过 `data-inlineref-node` 属性
7. **系统前缀约定**：系统节点以 `SYS_` 开头（`SYS_T*` 标签、`SYS_A*` 属性、`SYS_D*` 数据类型、`SYS_V*` 值）
8. **工作区容器**：工作区 ID 作为后缀生成系统容器（`{wsId}_SCHEMA`, `{wsId}_TRASH` 等）
9. **编辑者追踪**：`touchCounts` 和 `modifiedTs` 使用固定长度数组，索引对应 `editors` 数组中的编辑者
10. **软删除**：删除的内容通过 `_ownerId` 指向 `{wsId}_TRASH`
