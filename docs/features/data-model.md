# Nodex 数据模型

> 权威参考文档。描述 Nodex 的核心数据结构、设计原理和实现约定。
> 数据来源：Tana 导出数据逆向分析（41,753 节点）+ 多轮迭代验证。

---

## 核心哲学：一切皆节点

Nodex 忠实复刻 Tana 的 "Everything is a Node" 数据模型。所有实体——用户内容、标签定义、字段定义、搜索查询、视图配置、系统命令——都是同一种底层数据结构 `NodexNode`，通过 `_docType` 属性区分类型。

**为什么选择单一节点模型**：

- **统一操作**：所有节点共享相同的 CRUD、树操作、引用、搜索能力。tagDef 本身也是节点，可以被引用、被搜索、有自己的 children
- **递归一致性**：配置页面 = 标准 NodePanel 渲染被系统标签标记的节点。不需要为每种类型建独立的编辑 UI
- **图谱而非文档**：数据模型是有类型的知识图谱 G = (V, E)，节点间通过 children（树形边）、引用（引用边）、标签（类型边）、字段（属性边）构成网络

**数据库实现**：单表 `nodes` 存储所有类型。这是刻意的设计选择——虽然多表方案有 schema 约束优势，但单表保证了节点操作的统一性，避免了跨表 JOIN 和类型判断逻辑散落到各处。

---

## 节点结构

### NodexNode 完整定义

```
NodexNode
  ├── id: string                    ← 全局唯一标识符
  ├── props: NodeProps              ← 节点属性（见下）
  ├── children?: string[]           ← 子节点 ID 有序列表
  ├── associationMap?: Record<string, string>  ← children 到 associatedData 的通用映射
  ├── touchCounts?: number[]        ← 编辑者访问计数
  ├── modifiedTs?: number[]         ← 编辑者修改时间戳
  │
  │   ── Nodex 扩展字段 ──
  ├── workspaceId: string           ← 工作区 ID（直接存储）
  ├── version: number               ← 乐观锁版本号
  ├── updatedAt: number             ← 最后修改时间戳
  ├── createdBy: string             ← 创建者用户 ID
  ├── updatedBy: string             ← 最后修改者用户 ID
  ├── aiSummary?: string            ← AI 摘要
  └── sourceUrl?: string            ← 来源 URL（网页剪藏）
```

### NodeProps 属性

| 属性 | 类型 | 说明 |
|------|------|------|
| `created` | `number` | 创建时间戳（毫秒），**所有节点必有** |
| `name` | `string?` | 节点名称/内容，支持 HTML 富文本 |
| `description` | `string?` | 节点描述，UI 显示为灰色小字 |
| `_docType` | `DocType?` | 文档类型，无此字段 = 普通内容节点 |
| `_ownerId` | `string?` | 父/所有者节点 ID |
| `_metaNodeId` | `string?` | 关联元节点 ID |
| `_sourceId` | `string?` | 模板来源 ID |
| `_flags` | `number?` | 位标志 |
| `_done` | `number?` | 完成时间戳（毫秒），非布尔值 |
| `_view` | `ViewMode?` | 视图模式 |
| `_imageWidth` | `number?` | 图片宽度 |
| `_imageHeight` | `number?` | 图片高度 |
| `_published` | `number?` | 发布时间戳 |
| `_editMode` | `boolean?` | 编辑模式标记 |
| `searchContextNode` | `string?` | 搜索上下文节点 |

### ID 生成策略

| 类型 | 格式 | 示例 |
|------|------|------|
| 用户节点 | nanoid（21 字符，URL-safe base64） | `qwcopMAOrB5v_x3kL2mNp` |
| 系统节点 | `SYS_` 前缀 | `SYS_A13`, `SYS_D06`, `SYS_V03` |
| 工作区容器 | `{workspaceId}_{SUFFIX}` | `ws001_SCHEMA`, `ws001_TRASH` |

---

## DocType 类型体系

22 种 Tana 原生类型 + 1 种 Nodex 新增类型。**无 `_docType` 的节点为普通用户内容节点**（占总节点数 46.6%）。

### 核心结构类型（间接层）

| DocType | 占比 | 用途 | 详见 |
|---------|------|------|------|
| `tuple` | 29.3% | 万能键值对容器 | §三大间接层 |
| `metanode` | 13.5% | 元信息代理节点 | §三大间接层 |
| `associatedData` | 6.3% | 字段值索引数据 | §三大间接层 |

### 定义类型

| DocType | 数量 | 用途 |
|---------|------|------|
| `tagDef` | 39 | 超级标签定义 |
| `attrDef` | 170 | 字段/属性定义 |
| `viewDef` | 53 | 视图定义 |

### 内容类型

| DocType | 数量 | 用途 |
|---------|------|------|
| `codeblock` | 870 | 代码块（`name` 存代码，children 含语言 Tuple） |
| `visual` | 58 | 图片/视觉内容 |
| `url` | 28 | URL 链接 |
| `chat` | 4 | 聊天对话 |

### 日志类型

| DocType | 数量 | 用途 |
|---------|------|------|
| `journal` | 1 | 日记根容器（每个工作区 1 个） |
| `journalPart` | 142 | 年/周/日节点（通过系统标签 SYS_T124/125/126 区分） |

### 搜索 & 系统类型

| DocType | 数量 | 用途 |
|---------|------|------|
| `search` | 44 | 持久化动态查询 |
| `command` | 45 | 系统命令 |
| `systemTool` | 30 | 系统工具 |
| `chatbot` | — | 聊天机器人定义 |
| `syntax` | — | 语法定义 |
| `placeholder` | — | 占位符 |
| `workspace` | 308 | 工作区/布局节点 |
| `home` | 1 | 主页根节点 |
| `settings` | 1 | 设置容器 |
| `webClip` | — | **Nodex 新增**：网页剪藏 |

---

## 三大间接层

这是 Tana 数据模型最精巧也最容易困惑的部分。三层间接结构看似复杂，但每一层都有明确的设计理由。

### 为什么需要间接层？

直觉方案是把标签、字段值直接存在节点属性上。但 Tana 选择了间接层设计，原因是：

1. **可扩展性**：标签/字段的数量不确定，不能为每个可能的字段创建一个 column
2. **统一操作**：标签绑定、字段赋值、搜索配置都是"给节点附加一条信息"——Tuple 统一了这些操作
3. **模板继承**：通过 `_sourceId` 追踪"这个字段值是从哪个模板实例化来的"
4. **关注点分离**：内容节点的 `children` 混合了用户内容和字段 Tuple，但元信息（标签）存在独立的 Metanode 中，不污染内容树

### 第一层：Tuple — 万能键值对

```
Tuple (doc_type: 'tuple')
  ├── _ownerId: 父节点 ID
  ├── _sourceId?: 模板来源（从 tagDef 实例化时）
  └── children:
        [0] = 键（SYS_A* 系统属性 ID 或 attrDef 字段定义 ID）
        [1] = 值（节点 ID 或 SYS_V* 枚举值 ID）
        [2+] = 可选附加参数
```

**设计原理**：Tuple 把"键-值关联"从属性层面提升为节点层面。键和值都是节点 ID，这意味着：
- 键可以是任意 attrDef（用户自定义字段）或 SYS_A*（系统属性）
- 值可以是任意节点（引用其他节点作为值）或系统枚举值
- Tuple 本身也是节点，可以被引用、可以有 _sourceId 追踪来源

**统计**：占总节点数 29.3%，96.97% 恰好 2 个 children（标准键值对）。

**使用场景全表**：

| 上下文 | children[0]（键） | children[1]（值） | 示例 |
|--------|-------------------|-------------------|------|
| 标签绑定 | `SYS_A13` | tagDefId | 节点的标签是 #task |
| 启用 checkbox | `SYS_A55` | `SYS_V03`(Yes) | 节点显示复选框 |
| 锁定状态 | `SYS_A12` | `SYS_V03`/`SYS_V04` | 节点是否锁定 |
| 字段值实例 | attrDefId | valueNodeId | Status = "Backlog" |
| 字段模板（tagDef 中） | attrDefId | defaultValueId | 模板定义默认值 |
| 搜索表达式 | `SYS_A15` | tagDefId | 搜索所有 #task 节点 |
| 视图配置 | `SYS_A16` | viewDefId | 使用 Table 视图 |
| 子节点默认标签 | `SYS_A14` | tagDefId | 新建子节点自动打 #task |
| 代码块语言 | `SYS_A70` | languageNodeId | 代码语言是 JavaScript |
| 节点颜色 | `SYS_A11` | colorValue | 节点颜色为红色 |
| 日志日期 | `SYS_A169` | dateRef | 日节点的日期元数据 |
| 字段类型配置 | `SYS_A02` | `SYS_D*` | 字段数据类型为 Options |
| 字段基数 | `SYS_A10` | `SYS_V01`/`SYS_V02` | 单值 vs 多值 |
| 隐藏字段条件 | `NDX_A01` | `SYS_V54`/`SYS_V52`/... | Nodex 自定义 |

### 第二层：Metanode — 元信息代理

```
Metanode (doc_type: 'metanode')
  ├── _ownerId: 内容节点 ID          ← 反向链接：谁的元信息
  └── children: [tupleId1, tupleId2, ...]  ← 全部是 Tuple
```

内容节点通过 `_metaNodeId` 指向 Metanode，形成双向链接：

```
ContentNode._metaNodeId → Metanode
Metanode._ownerId → ContentNode
```

**设计原理**：为什么不直接把标签 Tuple 放在内容节点的 children 里？

- **关注点分离**：内容节点的 `children` 是用户可见可编辑的内容树（普通子节点 + 字段 Tuple），标签等元信息不应出现在这里
- **按需加载**：大多数 UI 场景只需渲染 children，不需要 Metanode。分离后可以延迟加载元信息
- **多条元信息聚合**：一个 Metanode 可以有多个 Tuple（多个标签、checkbox 配置等），集中管理

**Metanode 中最常见的 Tuple 键**：

| Tuple key (children[0]) | 数量 | 含义 |
|--------------------------|------|------|
| `SYS_A12` (Locked) | 3,378 | 锁定状态 |
| `SYS_A75` (External alias) | 2,512 | 外部节点别名 |
| `SYS_A13` (Node supertags) | 2,088 | **标签绑定（最核心）** |
| `SYS_A169` (Journal date) | 142 | 日志日期 |
| `SYS_A55` (Show checkbox) | 133 | 启用复选框 |
| `SYS_A16` (Views) | 53 | 视图配置 |
| `SYS_A15` (Search expression) | 37 | 搜索表达式 |

### 第三层：AssociatedData — 字段值索引

```
AssociatedData (doc_type: 'associatedData')
  ├── _ownerId: 内容节点 ID
  └── children: [valueNodeId, ...]    ← 字段值节点列表
```

通过 `associationMap` 映射到内容节点（当前实现是通用映射，不只用于字段 Tuple）：

```
ContentNode.associationMap = {
  "childNodeOrTupleId": "associatedDataId"
}
```

**设计原理**：为什么仍需要 AssociatedData？

- **多值字段**：一个 Options 字段可以有多个选中值。AssociatedData 的 children 是一个列表，天然支持多值
- **值的独立生命周期**：值节点可以是引用（指向其他真实节点），也可以是独立创建的值节点。AssociatedData 提供了一个稳定的"值容器"
- **索引查找**：`associationMap` 提供 O(1) 的 childId → associatedData 查找，无需遍历 children

**统计**：2,605/2,606 的 associationMap 值指向 `associatedData` 类型节点（几乎 100%）。

### 三层协作全链路示例

以"为节点 N 添加标签 #task 并实例化字段模板"为例：

```
第 1 步：创建 Metanode M
  M = { _docType: 'metanode', _ownerId: N }
  N._metaNodeId = M.id

第 2 步：标签绑定（Metanode + Tuple）
  TagTuple = { _docType: 'tuple', children: [SYS_A13, taskDefId] }
  M.children.push(TagTuple.id)

第 3 步：checkbox 配置（Metanode + Tuple）
  CbTuple = { _docType: 'tuple', children: [SYS_A55, SYS_V03] }
  M.children.push(CbTuple.id)

第 4 步：字段模板实例化（Tuple + AssociatedData）
  FieldTuple = { _docType: 'tuple', children: [statusAttrDefId], _sourceId: templateTupleId }
  AssocData = { _docType: 'associatedData', _ownerId: N, children: [] }
  N.children.push(FieldTuple.id)
  N.associationMap[FieldTuple.id] = AssocData.id
```

最终数据结构：

```
ContentNode N
  ├── _metaNodeId → Metanode M
  │     └── children: [TagTuple, CbTuple]
  │           ├── TagTuple.children: [SYS_A13, taskDefId]
  │           └── CbTuple.children: [SYS_A55, SYS_V03]
  ├── children: [...userContent..., FieldTuple.id]
  │     └── FieldTuple.children: [statusAttrDefId]
  │         └── FieldTuple._sourceId → tagDef 中的模板 Tuple
  └── associationMap: { FieldTuple.id: AssocData.id }
        └── AssocData.children: []
```

---

## 所有权模型

### _ownerId：单一所有者

每个节点恰好有一个 `_ownerId`（永久归属地），但可以出现在多个父节点的 `children` 中（引用）。

```
节点 A.children = [..., nodeX, ...]   ← nodeX 的 Owner
节点 B.children = [..., nodeX, ...]   ← nodeX 的引用
nodeX._ownerId = A                    ← 只有一个 Owner
```

**设计原理**：大纲工具需要"同一节点出现在多处"的能力（引用），但节点必须有一个明确的"家"——`_ownerId` 就是这个家。删除引用只是从 B.children 移除 nodeX，不影响原始节点。删除 Owner（trash）则软删除节点。

### attrDef 的特殊所有权

attrDef（字段定义）的 `_ownerId` 指向**创建它的 Tuple**，而非 Schema 容器：

| 场景 | _ownerId |
|------|----------|
| tagDef 模板中创建字段 | 模板 Tuple ID |
| 内容节点 `>` 创建字段 | 字段 Tuple ID |

**为什么**：这种循环所有权（attrDef → Tuple → 回到 attrDef 所在的上下文）确保了字段定义与使用它的上下文紧密绑定。Schema.children 只包含 tagDef + 系统标签，**不包含 attrDef**——所有 attrDef 通过 `_docType === 'attrDef'` 查询发现。

### _sourceId：模板继承追踪

当 tagDef 的字段模板被实例化到内容节点时，实例 Tuple 的 `_sourceId` 指向模板 Tuple：

```
TagDef.children → TemplateTuple (模板)
ContentNode.children → InstanceTuple (_sourceId → TemplateTuple)
```

**用途**：
- 判断字段是从哪个标签模板来的
- 移除标签时，可以通过 `_sourceId` 找到需要清理的字段
- 多标签共享同一 attrDef 时，通过 `_sourceId` 追踪各自的模板来源

---

## 标签系统（Supertag）

### TagDef 结构

```
TagDef (doc_type: 'tagDef')
  ├── name: "task"
  ├── _ownerId: "{wsId}_SCHEMA"      ← 归属 Schema 容器
  ├── _metaNodeId → 自身的 Metanode   ← tagDef 自身被 SYS_T01 标记
  ├── description?: "任务标签"
  └── children: [templateTuple1, templateTuple2, ...]  ← 字段模板
```

### 标签应用六步链路

> 说明：下述是服务层目标链路；当前前端 `node-store.applyTag` 会把模板配置项按 Tuple 实例化到 `node.children`，实现细节与服务层存在阶段性差异。

```
applyTag(nodeId, tagDefId):
  1. 获取或创建 Metanode（_docType: 'metanode', _ownerId: nodeId）
  2. 创建标签 Tuple（children: [SYS_A13, tagDefId]）→ 加入 Metanode.children
  3. 设置 Node._metaNodeId = metanodeId
  4. 检查是否已应用该标签（避免重复）
  5. 遍历 tagDef.children（模板 Tuple），为每个模板：
     a. 创建实例 Tuple（_sourceId → 模板 Tuple）
     b. 创建 AssociatedData
     c. 加入 Node.children + Node.associationMap
  6. 完成
```

### 标签移除

当前前端主流程（`node-store.removeTag`）会：

1. 删除 Metanode 中的 SYS_A13 Tuple
2. 删除该标签模板实例化出来的字段 Tuple（按 `_sourceId` 匹配）
3. 同步删除关联的 AssociatedData

> 说明：`services/tag-service.ts` 仍保留“只删标签 Tuple、不删字段 Tuple”的实现注释，但 UI 当前走的是 store 路径。

### 配置页 = 系统标签模板

tagDef 被系统标签 `SYS_T01` (SUPERTAG) 标记，其配置页面的每个配置项（Show checkbox、Default child supertag、Color 等）都是 SYS_T01 模板字段的实例。渲染时使用标准 NodePanel + FieldRow。

attrDef 同理，被 `SYS_T02` (FIELD_DEFINITION) 标记。

**这是核心设计模式**：配置页不需要专门的 UI 代码，它只是"渲染一个被特定系统标签标记的节点"。

---

## 字段系统（Field）

### AttrDef 结构

```
AttrDef (doc_type: 'attrDef')
  ├── name: "Status"
  ├── _ownerId: tupleId              ← 创建它的 Tuple
  ├── _metaNodeId → 自身的 Metanode   ← 被 SYS_T02 标记
  └── children: [typeChoiceTuple]     ← 字段配置
```

### 字段数据类型

通过 Tuple `[SYS_A02, SYS_D*]` 配置：

| SYS_D* | 类型 | 说明 |
|--------|------|------|
| `SYS_D06` | Plain | 默认类型，最灵活 |
| `SYS_D12` | Options | 预定义下拉选项 |
| `SYS_D05` | Options from supertag | 特定标签的实例作为选项 |
| `SYS_D03` | Date | 日期 |
| `SYS_D08` | Number | 数字 |
| `SYS_D02` | Integer | 整数 |
| `SYS_D10` | URL | 链接 |
| `SYS_D11` | Email | 邮箱 |
| `SYS_D01` | Checkbox | 布尔值（SYS_V03/SYS_V04） |

### 字段值三层存储

```
ContentNode
  ├── children: [..., fieldTupleId, ...]
  │     └── FieldTuple.children: [attrDefId, ...optionalValueIds]
  ├── associationMap: { fieldTupleId: assocDataId }
  │     └── AssocData.children: [valueNodeId, ...]
  └── 读取字段值：
        1. 遍历 children 找到 Tuple
        2. Tuple.children[0] = 字段定义 ID
        3. 值可能在 Tuple.children[1]（部分路径）或 AssocData.children（Options/Checkbox 等）
        4. 通过 associationMap 可快速查找对应 AssocData
```

### 系统字段

Nodex 实现了 8 种系统字段（`NDX_SYS_*`），值从节点元数据自动派生，只读：

| Key | 名称 | 数据源 |
|-----|------|--------|
| `NDX_SYS_DESCRIPTION` | Node description | `props.description` |
| `NDX_SYS_CREATED` | Created time | `props.created` |
| `NDX_SYS_LAST_EDITED` | Last edited time | `updatedAt` |
| `NDX_SYS_LAST_EDITED_BY` | Last edited by | `updatedBy` |
| `NDX_SYS_OWNER` | Owner node | `props._ownerId` → 节点名 |
| `NDX_SYS_TAGS` | Tags | Metanode → SYS_A13 Tuple → tagDef 名 |
| `NDX_SYS_WORKSPACE` | Workspace | `workspaceId` → 工作区名 |
| `NDX_SYS_DONE_TIME` | Done time | `props._done` |

### 配置虚拟字段（NDX_SECTION）

ConfigOutliner 使用虚拟字段把节点自身的 children 映射为 FieldRow，实现"配置页 = FieldRow 列表"的同构渲染：

| 虚拟字段 | 用途 |
|----------|------|
| `NDX_SECTION_PRE_OPTIONS` | 预定义选项列表 |
| `NDX_SECTION_DEFAULT_CONTENT` | 默认内容模板 |

---

## 工作区容器

每个工作区有一组系统容器节点，ID 格式为 `{workspaceId}_{SUFFIX}`：

| 后缀 | 用途 | 说明 |
|------|------|------|
| `SCHEMA` | 标签/字段定义 | Schema.children 包含 tagDef + 系统标签 |
| `LIBRARY` | 用户内容根 | 侧栏 "Library" 入口 |
| `INBOX` | 快速收集 | 侧栏 "Inbox" 入口 |
| `JOURNAL` | 日记根容器 | `doc_type: 'journal'`，侧栏 "Daily notes" |
| `SEARCHES` | 保存的搜索 | 侧栏 "Searches" 入口 |
| `TRASH` | 回收站 | 软删除目标 |
| `WORKSPACE` | 工作区布局配置 | |
| `CLIPS` | 网页剪藏 | **Nodex 新增** |
| `STASH` | 暂存区 | |
| `SIDEBAR_AREAS` | 侧边栏区域 | |
| `PINS` | 固定节点 | |
| `QUICK_ADD` | 快速添加配置 | |
| `USERS` | 用户列表 | |

**软删除机制**：trashNode 不是物理删除，而是设置 `_ownerId = "{wsId}_TRASH"`。节点本身和所有引用都保留。

---

## 富文本编码

`props.name` 支持 HTML 富文本编码：

### 格式化标签

| HTML 标签 | 用途 | TipTap 标记 |
|-----------|------|-------------|
| `<strong>` | 粗体 | bold |
| `<em>` | 斜体 | italic |
| `<code>` | 行内代码 | code |
| `<mark>` | 高亮 | highlight |
| `<strike>` | 删除线 | strike |
| `<a href="URL">` | 超链接 | link |

### 内联引用编码

| 类型 | HTML | 说明 |
|------|------|------|
| 节点引用 | `<span data-inlineref-node="nodeId"></span>` | 行内引用 |
| 日期引用 | `<span data-inlineref-date='{"dateTimeString":"2026-01-26","timezone":"Asia/Shanghai"}'></span>` | 行内日期 |
| Wiki 引用 | `[[节点名^nodeId]]` | 旧式格式（已少用） |

---

## 数据库映射

### PostgreSQL 单表设计

NodeProps 与 Nodex 扩展字段映射到 PostgreSQL 列（snake_case），通过 `rowToNode()` / `nodeToRow()` 转换。

| TypeScript (camelCase) | PostgreSQL (snake_case) | 类型 |
|------------------------|-------------------------|------|
| `id` | `id` | `TEXT PRIMARY KEY` |
| `workspaceId` | `workspace_id` | `TEXT NOT NULL` |
| `props.created` | `created` | `BIGINT NOT NULL` |
| `props.name` | `name` | `TEXT NOT NULL DEFAULT ''` |
| `props.description` | `description` | `TEXT` |
| `props._docType` | `doc_type` | `TEXT` (NULL = 普通内容节点) |
| `props._ownerId` | `owner_id` | `TEXT` |
| `props._metaNodeId` | `meta_node_id` | `TEXT` |
| `props._sourceId` | `source_id` | `TEXT` |
| `props._flags` | `flags` | `INTEGER NOT NULL DEFAULT 0` |
| `props._done` | `done` | `BIGINT` |
| `props._imageWidth` | `image_width` | `INTEGER` |
| `props._imageHeight` | `image_height` | `INTEGER` |
| `props._view` | `view` | `TEXT` |
| `props._published` | `published` | `BIGINT` |
| `props._editMode` | `edit_mode` | `BOOLEAN` |
| `props.searchContextNode` | `search_context_node` | `TEXT` |
| `children` | `children` | `TEXT[] NOT NULL DEFAULT '{}'` |
| `associationMap` | `association_map` | `JSONB NOT NULL DEFAULT '{}'` |
| `touchCounts` | `touch_counts` | `INTEGER[] NOT NULL DEFAULT '{}'` |
| `modifiedTs` | `modified_ts` | `BIGINT[] NOT NULL DEFAULT '{}'` |
| `aiSummary` | `ai_summary` | `TEXT` |
| `sourceUrl` | `source_url` | `TEXT` |
| `version` | `version` | `INTEGER NOT NULL DEFAULT 1` |
| `updatedAt` | `updated_at` | `BIGINT NOT NULL` |
| `createdBy` | `created_by` | `TEXT NOT NULL` |
| `updatedBy` | `updated_by` | `TEXT NOT NULL` |

### 关键索引

| 索引 | 类型 | 用途 |
|------|------|------|
| `idx_nodes_workspace` | B-tree | 工作区级查询 |
| `idx_nodes_owner` | B-tree | 树形遍历（按 _ownerId） |
| `idx_nodes_doc_type` | B-tree (partial) | 按类型过滤（tagDef/attrDef 等） |
| `idx_nodes_meta_node` | B-tree (partial) | Metanode 查找 |
| `idx_nodes_children` | GIN | children 数组包含查询 |
| `idx_nodes_name_fts` | GIN | 全文搜索（simple 配置，中英文通用） |
| `idx_nodes_association_map` | GIN | AssociationMap 查询 |
| `idx_nodes_ws_doctype` | B-tree (composite) | 工作区 + 类型复合查询 |

### 乐观锁

每次更新时 `version` +1，更新语句中 `WHERE version = expected_version`。失败时回滚客户端乐观更新。

### RLS（行级安全）

通过 `workspace_members` 表实现工作区级别的数据隔离：

```sql
CREATE POLICY "Users can access workspace nodes" ON nodes
  FOR ALL USING (
    workspace_id IN (
      SELECT wm.workspace_id FROM workspace_members wm
      WHERE wm.user_id = auth.uid()
    )
  );
```

---

## Nodex 扩展与差异

### 相对于 Tana 的新增

| 扩展 | 说明 | 原因 |
|------|------|------|
| `workspaceId` 列 | 直接存储工作区归属 | Tana 通过 `_ownerId` 链向上遍历推导，PostgreSQL 中直接存储提升查询效率 |
| `version` 列 | 乐观锁 | Tana 用 Firebase 事务，Nodex 用 PostgreSQL 乐观锁 |
| `updatedAt` / `createdBy` / `updatedBy` | 标准审计字段 | Tana 用 `touchCounts`/`modifiedTs` 数组 |
| `sourceUrl` | 来源 URL | 网页剪藏功能 |
| `aiSummary` | AI 摘要 | AI 功能 |
| `webClip` docType | 网页剪藏节点 | Nodex 新增内容类型 |
| `NDX_A*` / `NDX_V*` | 自定义系统属性/枚举 | Hide field 条件、Min/Max 值等 Nodex 特有配置 |
| `NDX_SYS_*` | 系统字段 | 8 种只读派生字段 |
| `NDX_SECTION_*` | 虚拟配置字段 | 配置页渲染用 |

### 保留但暂未使用的 Tana 概念

| 概念 | 说明 |
|------|------|
| `touchCounts` / `modifiedTs` | 多编辑者追踪，单用户阶段暂不需要 |
| `_flags` | 位标志，保留但当前默认 0 |
| `_published` / `_editMode` | 发布功能，Phase 5 |
| `searchContextNode` | 搜索上下文，暂未使用 |

---

## 系统常量速查

### SYS_A*（系统属性） — 高频使用

| 常量 | 值 | 用途 | 在 Tuple 中的位置 |
|------|----|------|------------------|
| `NODE_SUPERTAGS` | `SYS_A13` | 标签绑定 | Metanode Tuple key |
| `SHOW_CHECKBOX` | `SYS_A55` | 启用复选框 | Metanode Tuple key |
| `TYPE_CHOICE` | `SYS_A02` | 字段数据类型 | AttrDef Tuple key |
| `CHILD_SUPERTAG` | `SYS_A14` | 默认子标签 | Metanode Tuple key |
| `SEARCH_EXPRESSION` | `SYS_A15` | 搜索表达式 | Metanode Tuple key |
| `VIEWS` | `SYS_A16` | 视图配置 | Metanode Tuple key |
| `LOCKED` | `SYS_A12` | 锁定状态 | Metanode Tuple key |
| `COLOR` | `SYS_A11` | 节点颜色 | Metanode Tuple key |
| `HIDE_FIELD` | `NDX_A01` | 隐藏字段条件 | AttrDef config Tuple key |

### SYS_D*（字段数据类型）

| 常量 | 值 | 类型名 |
|------|----|--------|
| `PLAIN` | `SYS_D06` | Plain（默认） |
| `OPTIONS` | `SYS_D12` | Options |
| `DATE` | `SYS_D03` | Date |
| `NUMBER` | `SYS_D08` | Number |
| `INTEGER` | `SYS_D02` | Integer |
| `URL` | `SYS_D10` | URL |
| `EMAIL` | `SYS_D11` | Email |
| `CHECKBOX` | `SYS_D01` | Checkbox |

### SYS_V*（系统枚举值）

| 常量 | 值 | 用途 |
|------|----|------|
| `YES` | `SYS_V03` | 布尔 Yes / Checkbox 已完成 |
| `NO` | `SYS_V04` | 布尔 No / Checkbox 未完成 |
| `SINGLE_VALUE` | `SYS_V01` | 字段基数：单值 |
| `LIST_OF_VALUES` | `SYS_V02` | 字段基数：多值列表 |
| `ALWAYS` | `SYS_V52` | 隐藏字段：总是 |
| `NEVER` | `SYS_V54` | 隐藏字段：从不 |
| `WHEN_EMPTY` | `SYS_V56` | 隐藏字段：为空时 |
| `WHEN_NOT_EMPTY` | `SYS_V57` | 隐藏字段：不为空时 |

### SYS_T*（系统标签）

| 常量 | 值 | 标签名 | 用途 |
|------|----|--------|------|
| `SUPERTAG` | `SYS_T01` | — | tagDef 的元标签（配置页渲染源） |
| `FIELD_DEFINITION` | `SYS_T02` | — | attrDef 的元标签（配置页渲染源） |
| `DAY` | `SYS_T124` | #day | 日节点 |
| `WEEK` | `SYS_T125` | #week | 周节点 |
| `YEAR` | `SYS_T126` | #year | 年节点 |

---

## 客户端数据管理

### Zustand 归一化存储

```
nodeStore.entities: Record<string, NodexNode>  ← 扁平 Map，按 ID 索引
```

所有节点（无论类型）存储在同一个 Map 中。UI 组件通过 selector 订阅特定节点。

### 乐观更新模式

所有 store 写操作遵循：

```
1. 快照旧值
2. 乐观更新 entities（立即反映到 UI）
3. 异步持久化到 Supabase
4. 失败时回滚到快照
```

### 树操作原子性

涉及多节点的树操作（indent/outdent/move）在单个 `set()` 调用中完成所有 entity 变更，确保 UI 不会看到中间状态：

```
set((state) => {
  // 原子地修改 3 个节点
  state.entities[oldParent].children = remove(nodeId);
  state.entities[newParent].children = add(nodeId);
  state.entities[node].props._ownerId = newParentId;
});
```

### Window 全局访问

在 `standalone/TestApp.tsx` 测试入口中，Vite HMR 后 store 实例会变更，测试和调试时可通过全局变量访问：

```
window.__nodeStore   // 节点 store
window.__uiStore     // UI store
window.__wsStore     // 工作区 store
```

---

## 决策记录

| 日期 | 决策 | 原因 |
|------|------|------|
| — | 忠实复刻 Tana 三大间接层（Tuple/Metanode/AssocData） | 简化间接层会导致与 Tana 数据不兼容，且牺牲扩展性 |
| — | 单表 `nodes` 存储所有类型 | 保证节点操作统一性，避免跨表 JOIN |
| — | 新增 `workspaceId` 列 | PostgreSQL WHERE 子句需要直接字段，不支持 Tana 的 _ownerId 链遍历 |
| — | 新增 `version` 乐观锁 | 替代 Firebase 事务模型，适配 PostgreSQL |
| — | attrDef._ownerId = 创建它的 Tuple | 与 Tana 一致；确保字段定义与使用上下文紧密绑定 |
| — | Schema.children 不包含 attrDef | 与 Tana 一致；attrDef 通过 `_docType` 查询发现 |
| — | 当前前端标签移除会清理模板实例字段 | 与当前 `node-store.removeTag` 行为保持一致 |
| — | 系统字段用 `NDX_SYS_*` 前缀 | 与 SYS_A* 区分；系统字段不是 Tuple，是客户端派生值 |
| — | 配置页 = 系统标签模板渲染 | 与 Tana 一致；避免为每种配置创建专门 UI |
