# Tana 数据模型权威规格文档

> 综合 Web 公开文档研究、真实导出数据逆向分析（41,753 节点）、UI 交互实验三方视角的最终成果。
> 用于指导 Nodex 数据结构设计。

---

## 第一部分：核心哲学

### 1.1 一切皆节点（Everything is a Node）

Tana 中的所有实体——内容、标签定义、字段定义、搜索查询、视图配置、命令、工作区设置——都是同一种底层数据结构：**Node**。不同类型仅通过 `_docType` 属性和 UI 渲染方式区分。

### 1.2 知识图谱而非文档存储

Tana 的数据模型是一个**有类型的知识图谱** G = (V, E)：
- **节点（V）**：原子化信息单元
- **树形边（E₁）**：parent-child 关系构成大纲结构
- **引用边（E₂）**：同一节点出现在多处（Reference）
- **类型边（E₃）**：Supertag 赋予节点语义类型
- **属性边（E₄）**：Field 给节点附加结构化数据

---

## 第二部分：节点（Node）核心结构

### 2.1 完整 TypeScript 类型定义

```typescript
interface TanaNode {
  /** 全局唯一标识符。用户节点为 base64 短字符串（如 "qwcopMAOrB5v"），系统节点以 "SYS_" 前缀 */
  id: string;

  /** 节点属性 */
  props: {
    /** 创建时间戳（毫秒，JavaScript epoch） —— 所有节点必有 */
    created: number;

    /** 节点名称/内容。支持 HTML 富文本编码。代码块中支持 \n 多行 */
    name?: string;

    /** 节点描述。辅助文本，UI 显示为灰色小字 */
    description?: string;

    // ─── 类型与所有权 ───
    /** 文档类型标识。22 种枚举值（见 §2.2），无此字段表示普通内容节点 */
    _docType?: DocType;

    /** 父/所有者节点 ID。每个节点恰好一个 Owner。
     * 特殊值: "{wsId}_TRASH"(回收站), "{wsId}_SCHEMA"(架构), "SYS_0"(系统根) */
    _ownerId?: string;

    /** 关联元节点 ID。Metanode 存储标签、锁定状态等元信息 */
    _metaNodeId?: string;

    /** 模板来源 ID。从 TagDef 模板实例化时，指向原始模板 Tuple */
    _sourceId?: string;

    // ─── 状态标记 ───
    /** 位标志。1=基础标记(1641个), 2=次要(20个), 64=特殊(2个), 65=组合(1个) */
    _flags?: number;

    /** 完成时间戳（毫秒）。非布尔值，记录 checkbox 勾选的精确时刻 */
    _done?: number;

    // ─── 视觉/媒体 ───
    /** 图片宽度（像素） */
    _imageWidth?: number;
    /** 图片高度（像素） */
    _imageHeight?: number;

    /** 视图模式 */
    _view?: 'list' | 'table' | 'tiles' | 'cards' | 'navigationList';

    /** 发布时间戳 */
    _published?: number;
    /** 编辑模式标志 */
    _editMode?: boolean;
    /** 搜索上下文节点 */
    searchContextNode?: string;
  };

  // ─── 关系与数据 ───

  /** 子节点 ID 有序列表。决定 UI 中的渲染顺序 */
  children?: string[];

  /** 字段值关联映射。key=子节点ID, value=associatedData节点ID
   * 用于字段值的快速索引查找 */
  associationMap?: Record<string, string>;

  /** 各编辑者的访问/编辑计数。索引对应 editors 数组 */
  touchCounts?: number[];

  /** 各编辑者的最后修改时间戳。索引对应 editors 数组。0=未修改 */
  modifiedTs?: number[];

  /** 数据迁移时间戳 */
  migrateTime?: number;
}
```

### 2.2 DocType 枚举（22 种）

```typescript
type DocType =
  // ── 核心结构类型 ──
  | 'tuple'           // 12,224 (29.3%) 万能键值对容器
  | 'metanode'        // 5,626  (13.5%) 元信息代理节点
  | 'associatedData'  // 2,612  (6.3%)  字段值索引数据

  // ── 定义类型 ──
  | 'tagDef'          // 39     超级标签定义
  | 'attrDef'         // 170    字段/属性定义
  | 'viewDef'         // 53     视图定义

  // ── 内容类型 ──
  | 'codeblock'       // 870    代码块
  | 'visual'          // 58     图片/视觉内容
  | 'url'             // 28     URL 链接
  | 'chat'            // 4      聊天对话

  // ── 日志类型 ──
  | 'journal'         // 1      日志根容器 (Calendar)
  | 'journalPart'     // 142    日志分区 (年/周/日)

  // ── 搜索与查询 ──
  | 'search'          // 44     Live Search / 动态查询

  // ── 系统/工具类型 ──
  | 'command'         // 45     系统命令
  | 'systemTool'      // 30     系统工具
  | 'chatbot'         // 1      聊天机器人定义
  | 'syntax'          // 20     语法定义
  | 'placeholder'     // 1      占位符

  // ── 工作区类型 ──
  | 'workspace'       // 308    工作区/布局节点
  | 'home'            // 1      主页根节点
  | 'settings';       // 1      设置容器

  // 无 _docType = 普通用户内容节点 (19,475, 46.6%)
```

---

## 第三部分：四层关系模型

### 3.1 树形层级（Parent-Child）

```
Node._ownerId  →  父节点 ID（所有权，恰好一个）
Node.children  →  子节点 ID 有序列表
```

- 每个节点有且仅有一个 Owner（永久归属地）
- children 数组决定渲染顺序
- Enter 创建同级兄弟，Tab 创建子节点

### 3.2 引用（References）

引用允许同一节点出现在多个位置，共享同一个 ID：

```
节点 A.children = [..., nodeX, ...]   ← nodeX 的 Owner
节点 B.children = [..., nodeX, ...]   ← nodeX 的引用
nodeX._ownerId = A                    ← 只有一个 Owner
```

**Rich text 中的引用编码**：

| 编码方式 | 示例 | 使用场景 |
|---------|------|---------|
| HTML inline ref | `<span data-inlineref-node="Lgdr5_g94__D"></span>` | 行内节点引用（62个） |
| HTML inline date | `<span data-inlineref-date='{"dateTimeString":"2026-01-26","timezone":"Asia/Shanghai"}'></span>` | 行内日期引用（176个） |
| Wiki-style | `[[节点名^lj5xyDUdBwqV]]` | 旧式节点引用（7个） |

### 3.3 元节点关系（Metanode）

```
ContentNode._metaNodeId → Metanode
Metanode._ownerId → ContentNode （双向链接）
Metanode._docType = "metanode"
Metanode.children = [Tuple₁, Tuple₂, ...]
```

每个 Tuple 承载一条元信息。Metanode 子节点中最常见的 Tuple 键：

| Tuple key (children[0]) | 数量 | 含义 |
|------------------------|------|------|
| SYS_A12 (Locked) | 3,378 | 节点锁定状态 |
| SYS_A75 (External alias) | 2,512 | 外部节点别名 |
| **SYS_A13 (Node supertags)** | **2,088** | **标签关联 —— 最核心** |
| SYS_A169 (Journal date) | 142 | 日志日期 |
| SYS_A55 (Show checkbox) | 133 | 启用复选框 |
| SYS_A16 (Views) | 53 | 视图配置 |
| SYS_A15 (Search expression) | 37 | 搜索表达式 |

### 3.4 字段值关联（AssociationMap）

```typescript
Node.associationMap = {
  "fieldChildNodeId": "associatedDataNodeId"
}
```

**关键发现**：2,605/2,606 的 associationMap 值指向 `associatedData` 类型节点。AssociationMap 不直接存储字段值，而是通过 `associatedData` 中间节点间接索引。

---

## 第四部分：Tuple —— 万能关联结构

### 4.1 核心规则

```typescript
interface Tuple extends TanaNode {
  props: { _docType: 'tuple'; _ownerId: string; _sourceId?: string; created: number };
  children: [
    string,    // children[0]: 键（SYS_A* 或 attrDef ID）
    string,    // children[1]: 值（节点 ID 或 SYS_V* 枚举值）
    ...string[] // children[2+]: 可选附加参数
  ];
}
```

**统计**：12,224 个 Tuple，其中 96.97% 恰好有 2 个子节点（标准键值对）。

### 4.2 Tuple 使用场景全表

| 上下文 | children[0] | children[1:] | 示例 |
|-------|------------|-------------|------|
| **标签应用** | SYS_A13 | tagDefId | `[SYS_A13, "task"]` |
| **启用 checkbox** | SYS_A55 | SYS_V03("Yes") | `[SYS_A55, SYS_V03]` |
| **锁定状态** | SYS_A12 | SYS_V03/V04 | `[SYS_A12, SYS_V04("No")]` |
| **标签字段定义** | attrDefId | defaultValueId | `["Status", "Backlog"]` |
| **字段值实例** | attrDefId | valueNodeId | `["Input Price", "1.1"]` |
| **搜索表达式** | SYS_A15 | tagDefId, [filterTuple] | `[SYS_A15, "task", filter]` |
| **视图配置** | SYS_A16 | viewDefId | `[SYS_A16, "Default"]` |
| **子节点默认标签** | SYS_A14 | tagDefId | `[SYS_A14, "task"]` |
| **代码块语言** | SYS_A70 | languageNodeId | `[SYS_A70, "JavaScript"]` |
| **节点颜色** | SYS_A11 | colorValue | `[SYS_A11, "#FF0000"]` |
| **选项定义** | SYS_T03("Options") | option1, option2, ... | `["Options", "Yes", "No"]` |
| **日志日期** | SYS_A169 | dateNode | `[SYS_A169, dateRef]` |

### 4.3 按父节点类型分布

| 父节点类型 | Tuple 数量 | 用途 |
|-----------|-----------|------|
| metanode | 8,651 | 元信息（标签、锁定、checkbox 等） |
| *(无类型)* | 1,687 | 系统配置（选项、约束） |
| codeblock | 1,242 | 代码块语言标记 |
| attrDef | 151 | 字段类型配置 |
| tuple | 145 | 嵌套条件（复合搜索过滤） |
| tagDef | 91 | 标签字段模板 |
| viewDef | 77 | 视图列/排序/过滤配置 |

---

## 第五部分：超级标签（Supertag）系统

### 5.1 TagDef 结构

```typescript
interface TagDef extends TanaNode {
  props: {
    _docType: 'tagDef';
    name: string;           // 标签名称
    _ownerId: string;       // 归属 "{wsId}_SCHEMA" 或 "SYS_T00"
    _metaNodeId: string;    // 指向自身的 metanode
    description?: string;   // 标签描述
  };
  children: string[];        // 子 Tuple 列表（字段模板）
}
```

### 5.2 标签字段模板

TagDef 的 children 中每个 Tuple 定义一个字段：

```
TagDef "task" (jDc2ISPtN3v3)
  └── Tuple (2BdD6fhwKKq9)
        ├── children[0]: AttrDef "Status" (FcH-bv_pHVIt)   ← 字段定义
        └── children[1]: "Backlog" (lp0DfFXn2aEA)          ← 默认值
  └── Tuple (5FA0IvNrUYjr)
        ├── children[0]: AttrDef "Project" (-39AYC5q-h7g)
        └── children[1]: (empty) (exsaqpaBwiga)
  └── Tuple (UClVbiPxirpE)
        ├── children[0]: SYS_A90 "Date"                    ← 系统字段
        └── children[1]: (empty) (CCNeTvDbjkP_)
```

### 5.3 标签继承（Extends）

- 子标签通过 UI "Extend other supertags" 继承父标签的所有字段
- 继承链示例：`#source → #article, #tweet, #video, #book, #podcast, #github`
- **多态搜索**：搜索父标签会返回所有子标签实例节点（已通过 UI 验证）
- 继承的字段不可删除，但可覆盖默认值

### 5.4 标签应用完整链路

当用户为节点 N 添加标签 T 时：

```
1. 创建 Metanode M（_docType: "metanode", _ownerId: N）
2. 在 M 中创建 Tuple: [SYS_A13, T_id]          ← "N 的标签是 T"
3. （可选）在 M 中创建 Tuple: [SYS_A55, SYS_V03] ← "启用 checkbox"
4. 设置 N._metaNodeId = M
5. 从 T 的字段模板 Tuple 实例化到 N.children 中
6. 实例化的 Tuple._sourceId 指向 T 中的原模板 Tuple
```

### 5.5 多标签融合（Emergence）

**关键规则**：字段身份由 NodeID 决定，而非名称。

| 场景 | 行为 |
|------|------|
| 两个标签共享同一字段节点（同 ID） | 字段合并，只显示一次 |
| 两个标签各自创建同名字段（不同 ID） | 两个字段都显示 |
| 子标签继承父标签字段 | 使用父标签的字段 ID，不冲突 |

### 5.6 Done State Mapping

复选框状态与 Options 字段值的双向映射：
- 勾选 checkbox → Status 字段自动变为 "Done"
- Kanban 拖拽到 "Done" 列 → checkbox 自动打勾
- **限制**：Done time 系统字段不随映射更新

### 5.7 Supertag 配置区块（5 大区域）

| 区块 | 内容 |
|------|------|
| Building blocks | Base type, Extend other supertags |
| Content template | Default fields, Optional fields, Show checkbox, Done state mapping |
| AI and Commands | Autofill, Event triggers, AI instructions |
| Voice chat | Voice assistant config |
| Advanced options | Title expression, Default child supertag, Related content, Shortcuts |

### 5.8 系统基础类型（Base Types）

| ID | 名称 | 用途 |
|----|------|------|
| SYS_T98 | meeting | 会议 |
| SYS_T99 | person | 人物 |
| SYS_T100 | task | 任务（启用 AI 自动分类） |
| SYS_T101 | organization | 组织 |
| SYS_T102 | location | 地点 |
| SYS_T103 | event | 事件 |
| SYS_T104 | project | 项目 |
| SYS_T105 | topic | 主题 |
| SYS_T117 | article | 文章 |
| SYS_T118 | memo | 备忘录 |
| SYS_T119 | reflection | 反思 |
| SYS_T124 | day | 日（日历系统） |
| SYS_T125 | week | 周（日历系统） |

---

## 第六部分：字段（Field）系统

### 6.1 AttrDef 结构

```typescript
interface AttrDef extends TanaNode {
  props: {
    _docType: 'attrDef';
    name: string;           // 字段名称
    _ownerId: string;       // 归属的 Tuple 节点
    _metaNodeId: string;    // 指向自身的 metanode
    description?: string;
  };
  children: string[];        // 字段配置（类型、选项来源等）
}
```

### 6.2 九种字段数据类型

| SYS_D ID | 类型名 | 存储格式 | 说明 |
|----------|--------|---------|------|
| SYS_D06 | Plain | 任意内容 | 默认类型，最灵活 |
| SYS_D12 | Options | 枚举值节点 ID | 预定义下拉选项 |
| SYS_D05 | Options from supertag | 节点引用 ID | 来自特定标签实例的选项 |
| SYS_D03 | Date | 日期字符串 | 链接到 Day 节点 |
| SYS_D08 | Number | 数值字符串 | 支持计算、最小/最大值 |
| SYS_D02 | Integer | 整数字符串 | 整数值 |
| SYS_D10 | Url | URL 字符串 | 外部链接 |
| SYS_D11 | E-Mail | 邮箱字符串 | 电子邮件 |
| SYS_D01 | Checkbox | 布尔值 | 是/否切换 |
| SYS_D09 | Tana User | 用户引用 | 工作区用户 |
| SYS_D07 | Formula | 表达式 | 计算公式 |

### 6.3 字段值存储机制

字段值通过三层结构存储：

```
ContentNode
  ├── children: [..., fieldTupleId, ...]     ← 字段 Tuple 在 children 中保序
  ├── associationMap: {                      ← 快速索引
  │     "fieldTupleId": "associatedDataId"
  │   }
  └── fieldTuple.children = [attrDefId, valueNodeId]  ← 键值对
```

### 6.4 字段配置属性

| 属性 | SYS_A ID | 值 | 说明 |
|------|----------|-----|------|
| 数据类型 | SYS_A02 (typeChoice) | SYS_D* | 字段数据类型 |
| 基数 | SYS_A10 (Cardinality) | SYS_V01/V02 | 单值 vs 多值 |
| 可为空 | SYS_A01 (Nullable) | SYS_V03/V04 | 是否可留空 |
| 选项来源 | SYS_A06 | supertag ref | Options from supertag 的来源标签 |
| 反向引用 | SYS_A08 | attrDef ref | 反向关联字段 |

### 6.5 字段配置页的底层结构（逆向分析）

**核心发现**：AttrDef 的配置页面不是定制 UI，而是标准 NodePanel 渲染被 `SYS_T02` (FIELD_DEFINITION) 系统标签标记的 AttrDef 节点。

AttrDef 的直接子节点仅有 1 个 Tuple（typeChoice），其余 16 项配置来自 SYS_T02 系统标签的模板字段：

| 配置项 | 渲染组件 | Tuple Key | 说明 |
|--------|---------|-----------|------|
| Field type | TupleAsPicker | SYS_T06 ("Datatype") | 下拉选择 SYS_D* |
| Pre-determined options | Outliner | SYS_T03 ("Options") | 选项节点列表 |
| Hide field | TupleAsPicker | SYS_T61 | 下拉 Never/Always/WhenEmpty |
| Auto-collect / Required / Auto-initialize | ToggleButton | — | 布尔开关 |

typeChoice Tuple 的特殊性：`children[0]` 为 `SYS_T06`（非 SYS_A02），`_sourceId` 指向 `SYS_A02`。

详细分析见 `docs/research/tana-config-page-architecture.md`。

---

## 第七部分：富文本编码规范

### 7.1 name 字段支持的 HTML 标签

| 标签 | 出现次数 | 用途 |
|------|---------|------|
| `<strong>` | 755 | 粗体 |
| `<code>` | 649 | 行内代码 |
| `<b>` | 247 | 粗体（旧式） |
| `<span>` | 241 | 内联引用容器 |
| `<a href="URL">` | 64 | 超链接 |
| `<mark>` | 50 | 高亮 |
| `<strike>` | 29 | 删除线 |
| `<em>` | 16 | 斜体 |

### 7.2 内联引用编码

**节点引用**：
```html
<span data-inlineref-node="Lgdr5_g94__D"></span>
```

**日期引用**（含时区）：
```html
<span data-inlineref-date='{"dateTimeString":"2026-01-26","timezone":"Asia/Shanghai"}'></span>
```

**API 中的编码**（需 HTML 实体转义）：
```html
<span data-inlineref-date="{&quot;dateTimeString&quot;:&quot;2026-01-26&quot;}">Feb 9</span>
```

**Wiki-style 引用**：
```
[[节点名称^nodeId]]
```

### 7.3 Markdown 风格格式化（Tana Paste / API）

| 语法 | 渲染 |
|------|------|
| `**bold**` 或 `<b>bold</b>` | **粗体** |
| `__italic__` 或 `<i>italic</i>` | *斜体* |
| `~~striked~~` 或 `<del>striked</del>` | ~~删除线~~ |
| `^^highlight^^` 或 `<mark>highlight</mark>` | 高亮 |

---

## 第八部分：搜索系统

### 8.1 Search 节点结构

```typescript
interface SearchNode extends TanaNode {
  props: { _docType: 'search'; name: string; _metaNodeId: string; _ownerId: string };
  children: string[];  // 搜索结果节点 ID 列表（平均 52.2 个，最多 580 个）
}
```

### 8.2 搜索配置存储

搜索配置通过 Metanode 中的 Tuple 定义：

```
Metanode (of SearchNode)
  ├── Tuple: [SYS_A15, tagDefId]              ← 搜索表达式（搜索此标签）
  ├── Tuple: [SYS_A15, tagDefId, filterTuple] ← 带过滤条件的搜索
  ├── Tuple: [SYS_A16, viewDefId]             ← 视图定义
  └── Tuple: [SYS_A14, tagDefId]              ← 新增子节点的默认标签
```

### 8.3 查询语法（前缀表示法）

逻辑操作符：AND, OR, NOT
比较操作符：LT, GT, LINKS TO, CHILD OF, OWNED BY, DATE OVERLAPS, COMPONENTS REC
关键字操作符：TODO, DONE, NOT DONE, HAS FIELD, HAS TAG, IS TAG, IS SEARCH NODE, CREATED LAST X DAYS 等

### 8.4 搜索操作符系统节点

| SYS_V ID | 名称 | 用途 |
|----------|------|------|
| SYS_V14 | HAS_ATTRIBUTE | 有某字段 |
| SYS_V15 | PARENTS_DESCENDANTS | 父节点后代 |
| SYS_V19 | HAS_TAG | 有某标签 |
| SYS_V49 | LINKS TO | 链接到 |
| SYS_V53 | CHILD OF | 是...的子节点 |
| SYS_V55 | OWNED BY | 属于 |
| SYS_V62 | Part of | 语义"部分" |
| SYS_V64 | COMPONENTS REC | 递归组件 |

---

## 第九部分：工作区结构

### 9.1 工作区根节点

```
Workspace Root ({wsId})
  ├── {wsId}_STASH              // 暂存区
  ├── {wsId}_CAPTURE_INBOX      // 收件箱
  ├── {wsId}_SEARCHES           // 保存的搜索
  ├── {wsId}_SCHEMA             // Schema（19 个用户标签定义）
  ├── {libraryNodeId}           // Library（用户内容根）
  ├── {wsId}_TRASH              // 回收站（4,832 节点, 11.6%）
  ├── {wsId}_MOVETO             // 移动目标配置
  ├── {wsId}_WORKSPACE          // 工作区布局（169 个布局节点）
  ├── {wsId}_CHATDRAFTS         // 聊天草稿
  ├── {wsId}_SIDEBAR_AREAS      // 侧边栏区域
  ├── {wsId}_QUICK_ADD          // 快速添加配置
  ├── {wsId}_AVATAR             // 头像
  ├── {wsId}_USERS              // 用户列表
  ├── {wsId}_TRAILING_SIDEBAR   // 尾部侧边栏
  └── {wsId}_PINS               // 固定节点
```

### 9.2 日历/日志结构

```
Journal (Calendar)
  └── JournalPart "2026" (年)
       └── JournalPart "Week 07" (周)
            └── JournalPart "2026-02-09 - Sunday" (日)
                 └── 用户内容节点...
```

每个 JournalPart 的 Metanode 中有 `[SYS_A169, dateRef]` Tuple 存储日期信息。

---

## 第十部分：视图系统

### 10.1 七种视图

| 分类 | 视图名 | _view 值 | 说明 |
|------|--------|---------|------|
| 数据视图 | Outline | `list` | 大纲/层级（默认） |
| 数据视图 | Table | `table` | 表格，字段为列 |
| 数据视图 | Cards | `cards` | 卡片布局 |
| 导航视图 | List | `navigationList` | 简单列表导航 |
| 导航视图 | Calendar | *(特殊)* | 日历视图 |
| 导航视图 | Side menu | *(特殊)* | 侧边菜单 |
| 导航视图 | Tabs | *(特殊)* | 标签页 |

### 10.2 ViewDef 结构

```json
{
  "id": "w0IEzzOeDOzJ",
  "props": { "_docType": "viewDef", "name": "Default", "_view": "table", "_ownerId": "..." },
  "children": ["columnDef1", "columnDef2", ...]
}
```

---

## 第十一部分：代码块与特殊节点

### 11.1 代码块

```json
{
  "_docType": "codeblock",
  "name": "代码内容（支持 \\n 多行）",
  "children": ["languageTupleId"]
  // languageTuple.children = [SYS_A70, languageNodeId]
}
```

语言分布：plaintext(475), CSS(302), JavaScript(90), Python(20) 等。

### 11.2 图片/视觉节点

```json
{
  "_docType": "visual",
  "_imageWidth": 3840,
  "_imageHeight": 2160,
  "_metaNodeId": "..."  // Metanode 中含 media type, MIME type 等
}
```

### 11.3 URL 节点

```json
{
  "_docType": "url",
  "name": "https://x.com/...",
  "children": ["urlTupleId"]  // Tuple: [SYS_A78, urlValueNode]
}
```

---

## 第十二部分：后端架构

### 12.1 技术栈（UI 探索发现）

| 组件 | 技术 |
|------|------|
| 实时同步 | Firebase Realtime Database |
| 服务器 | `s-gke-euw1-nssi1-7.europe-west1.firebasedatabase.app` |
| 分片 | `tana-shard-3` 命名空间 |
| 通信 | Long Polling (`.lp` 端点) |
| REST API | `app.tana.inc/api/workspaces/{id}/entities` |
| 数据编码 | Base64 JSON |

### 12.2 事务模型

```json
{
  "txid": {"timestamp": "..."},
  "optimisticTransId": "z_p3r15QvohL/0:698",
  "changeType": 18,           // 15=导航, 16=选择, 18=创建
  "idPath": ["Q6wNDa8Kv4CQ", "root-tab0", "cI5asFIXV-G5"],
  "userEmail": "user@gmail.com"
}
```

### 12.3 编辑者追踪

```json
{
  "editors": [
    ["user@gmail.com", 0],
    ["system+ai@tagr", 1],
    ["system@tagr", 2],
    ["system+migration@tagr", 3]
  ]
}
```

`touchCounts` 和 `modifiedTs` 数组长度 = editors 数量，索引一一对应。

---

## 第十三部分：API 与数据交换格式

### 13.1 Input API（云端写入）

```
POST https://europe-west1-tagr-prod.cloudfunctions.net/addToNodeV2
Authorization: Bearer <API_TOKEN>
```

```json
{
  "targetNodeId": "LIBRARY|SCHEMA|INBOX|<nodeId>",
  "nodes": [{
    "name": "节点内容（支持 HTML 格式化）",
    "description": "可选描述",
    "dataType": "plain|field|url|date|reference|boolean|file",
    "supertags": [{"id": "<tagNodeId>"}],
    "children": [...]
  }]
}
```

限制：1 call/s/token, 100 nodes/call, 5000 chars/payload

### 13.2 Local API / MCP（本地读写）

```
MCP: http://localhost:8262/mcp
Health: http://localhost:8262/health
```

读取：list_workspaces, search_nodes, read_node, get_children, list_tags, get_tag_schema
写入：import_tana_paste, tag, set_field_option, set_field_content, create_tag, add_field_to_tag, check_node, uncheck_node, trash_node, edit_node

### 13.3 Tana Intermediate Format (TIF)

```typescript
type TanaIntermediateFile = {
  version: 'TanaIntermediateFile V0.1';
  summary: { leafNodes: number; topLevelNodes: number; totalNodes: number; calendarNodes: number; fields: number; brokenRefs: number };
  nodes: TanaIntermediateNode[];
  attributes?: TanaIntermediateAttribute[];
  supertags?: TanaIntermediateSupertag[];
};

type TanaIntermediateNode = {
  uid: string;
  name: string;
  description?: string;
  children?: TanaIntermediateNode[];
  refs?: string[];
  createdAt: number;
  editedAt: number;
  type: 'field' | 'image' | 'codeblock' | 'node' | 'date';
  mediaUrl?: string;
  codeLanguage?: string;
  supertags?: string[];
  todoState?: 'todo' | 'done';
};
```

### 13.4 Tana Paste（纯文本格式）

```
%%tana%%
- 节点 #tag
  - 子节点
  - fieldName:: fieldValue
  - [[date:2024-01-15]]
  - [x] 已完成
  - @[[引用节点]]
  - %%view:table%%
```

---

## 第十四部分：系统节点完整参考

### 14.1 SYS_A* 关键系统属性（60+）

核心属性：
- **SYS_A13**: Node supertags — 标签应用
- **SYS_A12**: Locked — 锁定状态
- **SYS_A15**: Search expression — 搜索表达式
- **SYS_A16**: Views for node — 视图配置
- **SYS_A14**: Child supertag — 子节点默认标签
- **SYS_A55**: Show checkbox — 显示复选框
- **SYS_A70**: Code block language — 代码块语言
- **SYS_A75**: External alias — 外部节点别名
- **SYS_A90**: Date — 日期字段
- **SYS_A169**: Journal date — 日志日期

字段配置属性：
- **SYS_A01**: Nullable — 可为空
- **SYS_A02**: typeChoice — 数据类型
- **SYS_A03**: Values — 值选项
- **SYS_A06**: Source supertag — 选项来源标签
- **SYS_A08**: Backreference — 反向引用
- **SYS_A10**: Cardinality — 基数（单值/多值）

### 14.2 SYS_V* 关键枚举值

- **SYS_V01/V02**: Single value / List of values
- **SYS_V03/V04**: Yes / No
- **SYS_V14**: HAS_ATTRIBUTE
- **SYS_V19**: HAS_TAG
- **SYS_V49**: LINKS TO
- **SYS_V53**: CHILD OF
- **SYS_V55**: OWNED BY

---

## 第十五部分：关键设计模式总结

### 15.1 统一节点模型
所有实体共享同一 Node 结构，通过 `_docType` 区分。22 种类型覆盖内容、定义、配置、工具。

### 15.2 Tuple 万能关联
Tuple 是通用键值对容器，`children[0]` 始终为键，`children[1:]` 为值。承担标签关联、字段赋值、搜索配置、选项定义等所有关联需求。

### 15.3 Metanode 元信息代理
节点元信息不直接存储在节点上，而是通过独立的 Metanode 间接持有。Metanode 的 children 全部是 Tuple，每个 Tuple 承载一条元信息。

### 15.4 模板-实例继承 (_sourceId)
TagDef 的字段模板 Tuple 在标签应用时被实例化到内容节点，通过 `_sourceId` 维持模板引用。

### 15.5 AssociationMap 索引层
`associationMap` 将子节点映射到 `associatedData` 节点，提供字段值的快速查找索引。

### 15.6 单一所有者 + 多引用
每个节点恰好一个 `_ownerId`（永久归属），但可以出现在多个父节点的 `children` 中（引用）。

### 15.7 工作区容器命名约定
`{wsId}_SCHEMA`, `{wsId}_TRASH`, `{wsId}_WORKSPACE` 等系统容器通过 ID 后缀命名。

### 15.8 Firebase 实时同步
基于 Firebase Realtime Database 的乐观并发事务模型，支持多用户实时协作。

---

## 第十六部分：统计概览

| 指标 | 数值 | 占比 |
|------|------|------|
| 总节点数 | 41,753 | 100% |
| 无类型内容节点 | 19,475 | 46.6% |
| Tuple（关联结构） | 12,224 | 29.3% |
| Metanode（元信息） | 5,626 | 13.5% |
| AssociatedData | 2,612 | 6.3% |
| 有 children 的节点 | 23,431 | 56.1% |
| 有 _metaNodeId 的节点 | 5,781 | 13.8% |
| 有 associationMap 的节点 | 789 | 1.9% |
| 回收站节点 | 4,832 | 11.6% |
| 用户定义标签 | 19 | - |
| 用户定义字段 | 170 | - |
| 代码块 | 870 | - |
| 搜索节点 | 44 | - |
| 日志条目 | 142 | - |
