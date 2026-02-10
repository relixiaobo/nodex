# Tana JSON 导出数据模型逆向分析报告

> 数据源: `b8AyeCJNsefK@2026-01-30.json` (16MB, 41,753 个节点)
> 分析日期: 2026-02-09

---

## 一、顶层结构

```json
{
  "editors": [["lixiaobock@gmail.com", 0], ["system+ai@tagr", 1], ["system+migration@tagr", 3], ["system@tagr", 2]],
  "lastTxid": 1769766906612,
  "lastFbKey": "-OkDJyPWAuQs8e_cvMcA",
  "optimisticTransIds": [],
  "currentWorkspaceId": "eFpfUa7bAE_v",
  "formatVersion": 1,
  "docs": [...],           // 41,753 个文档
  "workspaces": {...}      // UI 工作区状态（JSON 字符串形式）
}
```

### 关键发现

- **editors**: 编辑者数组，每项为 `[email/id, index]`。index 用于 `touchCounts` 和 `modifiedTs` 数组的索引位置。共 4 位编辑者: 用户本人(0)、AI系统(1)、系统(2)、迁移系统(3)。
- **workspaces**: 纯 UI 状态（面板布局、滚动位置、历史记录等），以 JSON 字符串形式存储，**不属于数据模型核心**。包含 `{wsId}_SIDEBAR_AREAS` 和 `{wsId}_TRAILING_SIDEBAR` 等特殊键。
- **formatVersion**: 固定为 `1`。

---

## 二、文档节点结构

每个文档（doc）是一个扁平的 JSON 对象，包含以下字段:

| 字段 | 出现次数 | 说明 |
|------|---------|------|
| `id` | 41,753 | 全局唯一标识符 |
| `props` | 41,753 | 属性对象 |
| `touchCounts` | 38,811 | 编辑计数数组，索引对应 editors |
| `modifiedTs` | 38,811 | 最后修改时间戳数组，索引对应 editors |
| `children` | 23,431 | 有序子节点 ID 数组 |
| `migrateTime` | 16,445 | 迁移时间戳 |
| `associationMap` | 789 | 关联映射（字段值索引） |

### props 属性键频率

| 属性 | 出现次数 | 含义 |
|------|---------|------|
| `created` | 41,753 | 创建时间戳（毫秒） |
| `_ownerId` | 41,111 | 父容器/所属节点 ID |
| `_docType` | 22,278 | 文档类型标识 |
| `name` | 16,512 | 节点名称/内容（含富文本编码） |
| `_metaNodeId` | 5,781 | 指向元节点的 ID（承载标签信息） |
| `_sourceId` | 2,449 | 模板来源 ID（继承自标签模板） |
| `_flags` | 1,664 | 位标志字段 |
| `description` | 1,172 | 描述文本 |
| `_done` | 153 | 完成时间戳（非布尔值，存储完成的时刻） |
| `_imageHeight/_imageWidth` | 61 | 图片/视觉节点尺寸 |
| `_view` | 56 | 视图模式 (`list`/`table`/`tiles`/`cards`/`navigationList`) |
| `_published` | 7 | 发布标记 |
| `searchContextNode` | 6 | 搜索上下文节点 |
| `_editMode` | 3 | 编辑模式 |

### _flags 位标志

| 值 | 二进制 | 数量 | 推测含义 |
|----|--------|------|---------|
| 1 | `0b1` | 1,641 | 标记为"已展开"或基础标志 |
| 2 | `0b10` | 20 | 次要标志 |
| 64 | `0b1000000` | 2 | 特殊标志 |
| 65 | `0b1000001` | 1 | 组合标志 |

### _done 语义

`_done` 不是布尔值，而是**完成时间戳**（毫秒精度）。表示节点被标记为"完成"的时刻。

---

## 三、_docType 分类全表（22 种）

| _docType | 数量 | 说明 |
|----------|------|------|
| *(无)* | 19,475 | 普通内容节点（笔记、段落等） |
| `tuple` | 12,224 | 元组 —— Tana 数据模型的核心关联结构 |
| `metanode` | 5,626 | 元节点 —— 承载节点的标签、锁定等元信息 |
| `associatedData` | 2,612 | 关联数据 —— 存储字段值的索引数据 |
| `codeblock` | 870 | 代码块节点 |
| `workspace` | 308 | 工作区/布局节点 |
| `attrDef` | 170 | 字段定义（用户创建的字段） |
| `journalPart` | 142 | 日志分区（日/周/月/年） |
| `visual` | 58 | 图片/视觉节点 |
| `viewDef` | 53 | 视图定义（列表/表格/卡片等配置） |
| `command` | 45 | 系统命令定义 |
| `search` | 44 | 搜索/Live Search 节点 |
| `tagDef` | 39 | 标签定义（Supertag 定义） |
| `systemTool` | 30 | 系统工具（AI 工具等） |
| `url` | 28 | URL 链接节点 |
| `syntax` | 20 | 语法定义节点 |
| `chat` | 4 | 聊天会话节点 |
| `chatbot` | 1 | 聊天机器人定义 |
| `placeholder` | 1 | 占位符节点 |
| `journal` | 1 | 日志根节点 |
| `home` | 1 | 主页节点 |
| `settings` | 1 | 设置节点 |

---

## 四、Tuple（元组）模式 —— 核心数据关联机制

### 4.1 概述

Tuple 是 Tana 数据模型中**最核心**的结构。共 12,224 个，用途是将**键（key）**和**值（value）**关联起来。

**核心规则**: Tuple 的 `children` 数组中，`children[0]` 是**键**，`children[1:]` 是**值**。

### 4.2 子节点数量分布

| 子节点数 | 数量 | 含义 |
|----------|------|------|
| 0 | 66 | 空元组（孤儿节点或占位） |
| **2** | **11,853** | **标准键值对**（占 96.97%） |
| 3 | 150 | 三元组（键 + 选项列表或条件） |
| 4+ | 155 | 多值元组（复合值列表） |

### 4.3 按父节点类型分类

| 父节点类型 | 数量 | 含义 |
|-----------|------|------|
| `metanode` | 8,651 | 元节点中的配置元组（标签应用、锁定等） |
| *(无类型)* | 1,687 | 系统配置元组（选项定义、约束等） |
| `codeblock` | 1,242 | 代码块中的语言标记元组 |
| `attrDef` | 151 | 字段定义中的类型配置元组 |
| `tuple` | 145 | 嵌套元组（复合筛选条件等） |
| `tagDef` | 91 | 标签定义中的字段模板元组 |
| `viewDef` | 77 | 视图定义中的搜索/排序/列元组 |
| `url` | 28 | URL 节点中的链接元组 |
| `chat` | 4 | 聊天节点配置元组 |

### 4.4 标准键值对模式 (children = [key, value])

**实例: 元节点中的标签应用**
```
Tuple SYS_T01_META_SYS_A13
  children: [SYS_A13, SYS_T01]
  含义: 键=SYS_A13("Node supertags(s)"), 值=SYS_T01("supertag")
  解读: 此元组声明"该节点的 supertag 是 supertag 本身"
```

**实例: 元节点中的锁定状态**
```
Tuple SYS_C01_META_SYS_A12
  children: [SYS_A12, SYS_V03]
  含义: 键=SYS_A12("Locked"), 值=SYS_V03("Yes")
  解读: 此节点已被锁定
```

**实例: 代码块语言标记**
```
Tuple DR0FxdjwZyDp (parent: codeblock nI1F_Dt8a3az)
  children: [SYS_A70, UfgGPofIU4ia]
  含义: 键=SYS_A70("Code block language"), 值="plaintext"
```

**实例: 用户内容节点的字段值**
```
Tuple q3fT4Q_IYOdU (parent: node "o3-mini", tagged #model)
  children: [o7NB0nXGY3va, tCF_gCc-oUWx]
  含义: 键=o7NB0nXGY3va("Input Price ($)"), 值="1.1"
```

### 4.5 三元组模式 (children = [options_key, option1, option2])

用于定义选项列表:

```
Tuple SYS_T05 (name="Optional_Choices")
  children: [SYS_T03("Options"), SYS_V03("Yes"), SYS_V04("No")]
  含义: 定义一组选项: Options -> [Yes, No]

Tuple SYS_T09 (name="Cardinality_Choices")
  children: [SYS_T03("Options"), SYS_V01("Single value"), SYS_V02("List of values")]
  含义: 定义基数选项: Options -> [Single value, List of values]
```

### 4.6 关键洞察

1. **Tuple 是万能关联结构**: 无论是标签应用、字段值、选项定义、搜索表达式、视图配置，全部通过 Tuple 实现。
2. **children[0] 始终是键/属性标识符**: 指向 `SYS_A*` 系统属性节点或用户定义的 `attrDef` 节点。
3. **children[1:] 是值**: 可以是枚举值（`SYS_V*`）、引用节点、或普通内容节点。

---

## 五、Metanode（元节点）机制

### 5.1 概述

Metanode 共 5,626 个，是节点**元信息的容器**。每个需要元信息的文档节点通过 `_metaNodeId` 属性指向一个 metanode。

### 5.2 元节点子节点为 Tuple

元节点的 children 全部是 Tuple，每个 Tuple 承载一条元信息:

| Tuple 键 (children[0]) | 数量 | 含义 |
|------------------------|------|------|
| `SYS_A12` (Locked) | 3,378 | 锁定状态 |
| `SYS_A75` (Alias for external node only) | 2,512 | 外部节点别名标记 |
| `SYS_A13` (Node supertags(s)) | 2,088 | **标签应用 —— 最核心** |
| `SYS_A169` (Journal date) | 142 | 日志日期 |
| `SYS_A55` (Show done/not done) | 133 | 显示复选框 |
| `SYS_T15` (media) | 69 | 媒体类型 |
| `SYS_T157` (MIME Type) | 62 | MIME 类型 |
| `SYS_A16` (Views for node) | 53 | 视图配置 |
| `SYS_A15` (Search expression) | 37 | 搜索表达式 |
| `SYS_A84` (Merged into) | 34 | 合并到 |
| `SYS_A62` (Field defaults) | 26 | 字段默认值 |
| `SYS_A11` (Color) | 21 | 颜色 |
| `SYS_A47` (Target node(s)) | 21 | 目标节点 |
| `SYS_A14` (Child supertag) | 14 | 子节点默认标签 |

### 5.3 标签应用链 (SYS_A13 模式)

**这是 Tana 标签系统的核心机制**:

1. 用户为节点添加 `#task` 标签
2. 系统创建一个 `metanode`
3. 在 metanode 中创建 Tuple: `children: [SYS_A13, jDc2ISPtN3v3]`
   - `SYS_A13` = "Node supertags(s)" (键)
   - `jDc2ISPtN3v3` = "task" tagDef (值)
4. 原节点的 `_metaNodeId` 指向该 metanode

**完整示例**:
```
节点: 57k1aCfT7OfE (name="用户可能会觉得...")
  _metaNodeId: BVhh6hzsQmD0

Metanode: BVhh6hzsQmD0
  children:
    - D_FM-EeytIab: [SYS_A55("Show checkbox"), SYS_V03("Yes")]
    - AK2oW9cIxTvV: [SYS_A13("Node supertags"), jDc2ISPtN3v3("task")]
```

### 5.4 锁定状态

SYS_A12 (Locked) 的值分布:
- `SYS_V04` (No): 2,357 个
- `SYS_V03` (Yes): 1,021 个

### 5.5 元节点子节点数量分布

| 子节点数 | 数量 | 典型含义 |
|----------|------|---------|
| 0 | 374 | 空元节点 |
| 1 | 1,995 | 仅锁定或仅标签 |
| **2** | **3,146** | 锁定 + 标签（最常见） |
| 3 | 91 | 锁定 + 标签 + 额外配置 |
| 4-6 | 20 | 复杂配置 |

### 5.6 _metaNodeId 使用方的 docType 分布

| docType | 数量 |
|---------|------|
| `associatedData` | 2,610 |
| *(无类型)* | 2,316 |
| `tuple` | 393 |
| `attrDef` | 170 |
| `journalPart` | 142 |
| `visual` | 58 |
| `search` | 44 |
| `tagDef` | 39 |
| `chat` | 4 |

---

## 六、AssociationMap（关联映射）

### 6.1 概述

共 789 个节点拥有 `associationMap`。它是一个**字段值到 associatedData 节点的索引**。

### 6.2 语义

```
associationMap: {
  "子节点ID": "associatedData节点ID"
}
```

- **键**: 总是当前节点 `children` 数组中的某个子节点 ID（2,510 个在 children 中，96 个不在）
- **值**: 指向一个 `associatedData` 类型的节点（2,605 个，仅 1 个未找到）

### 6.3 使用场景

1. **普通内容节点**（490 个）: 为子节点（通常是字段元组）建立索引
2. **Tuple 节点**（275 个）: 为字段值建立反向引用
3. **journalPart**（19 个）: 日志条目的字段索引

### 6.4 实例

```
节点: Y5yRMXHA5Lyw (name="2025-10-27 - Monday", dt="journalPart")
  assocMap:
    PwDfi7y-rBia("stats 管理后台") -> xnHpJjihJtFi (associatedData)
    RnTw1_WSqPKt("更新本地 n8n 流程") -> l43neA7CFLql (associatedData)
```

含义: 日志节点的每个子节点（待办事项）都有一个 `associatedData` 节点与之关联，用于存储额外的元数据或反向引用索引。

### 6.5 Tuple 中的 AssociationMap

```
Tuple A4B7L4T2GxOH
  children: [vu5P2d_3gmFC, oJoxadwxWTd9]
  assocMap: {vu5P2d_3gmFC: Fh2kgzQPg_cz("Product")}
```

这里 `vu5P2d_3gmFC` 是字段键节点，`assocMap` 将其映射到 `Fh2kgzQPg_cz`（指向 "Product" attrDef），用于反向查找。

---

## 七、TagDef（标签定义）与字段模板

### 7.1 概述

共 39 个 tagDef 节点（20 个系统标签 + 19 个用户标签）。

### 7.2 系统标签

| ID | 名称 | 说明 |
|----|------|------|
| `SYS_T01` | supertag | 元标签 —— 标签的标签 |
| `SYS_T02` | field-definition | 字段定义的标签 |
| `SYS_T16` | meta information | 元信息标签 |
| `SYS_T41` | tagr app | Tana 应用标签 |
| `SYS_T29` | row defaults | 行默认值标签 |
| `SYS_T98` | meeting (base type) | 会议基础类型 |
| `SYS_T99` | person (base type) | 人物基础类型 |
| `SYS_T100` | task (base type) | 任务基础类型 |
| `SYS_T101` | organization (base type) | 组织基础类型 |
| `SYS_T102` | location (base type) | 地点基础类型 |
| `SYS_T103` | event (base type) | 事件基础类型 |
| `SYS_T104` | project (base type) | 项目基础类型 |
| `SYS_T105` | topic (base type) | 主题基础类型 |
| `SYS_T117` | article (base type) | 文章基础类型 |
| `SYS_T118` | memo (base type) | 备忘录基础类型 |
| `SYS_T119` | reflection (base type) | 反思基础类型 |
| `SYS_T124` | day (base type) | 天基础类型 |
| `SYS_T125` | week (base type) | 周基础类型 |

### 7.3 用户标签示例

**#model 标签**（`Icqw_LVmr1eH`）:
```
children (字段模板):
  37VjNMpUETAD: [o7NB0nXGY3va("Input Price ($)"), pWIRGeXvR-tz("")]
  ZwVfbPHUkBig: [AfDLEMq1h4Il("Output Price ($)"), AmShPcpVM7PZ("")]
  RlhXIg5o7eEg: [PJ7Dc9sGf9lm("Context Window (K)"), 3r92NxuZbaI4("")]
  c2Z1cJy6mt-q: [muK0DU9TXlPN("Knowledge Cutoff"), lNc0Z7ptPiFj("")]
```

**#task 标签**（`jDc2ISPtN3v3`）:
```
children (字段模板):
  2BdD6fhwKKq9: [FcH-bv_pHVIt("Status"), lp0DfFXn2aEA("Backlog")]  ← 默认值
  5FA0IvNrUYjr: [-39AYC5q-h7g("Project"), exsaqpaBwiga("")]
  UClVbiPxirpE: [SYS_A90("Date"), CCNeTvDbjkP_("")]
```

### 7.4 标签应用到内容节点的完整链

1. **TagDef** 定义字段模板: `children` 中的 Tuple 定义了 `[字段Key, 默认值]`
2. **内容节点**添加标签后:
   - 创建 metanode，包含 `[SYS_A13, tagDefId]` 元组
   - 内容节点 `_metaNodeId` 指向该 metanode
   - 系统为内容节点创建**字段实例 Tuple**（从模板复制）
   - 字段实例的 `_sourceId` 指向模板中对应的 Tuple

**完整实例 —— "o3-mini" 节点（#model 标签）**:
```
节点: -EUdB4zxWEjI (name="o3-mini")
  _metaNodeId -> metanode（包含 SYS_A13 -> Icqw_LVmr1eH("model")）

  children (字段实例):
    q3fT4Q_IYOdU: [o7NB0nXGY3va("Input Price ($)"), tCF_gCc-oUWx("1.1")]
    6d2ZlLTwCBSL: [AfDLEMq1h4Il("Output Price ($)"), kmtofmIlDMJd("4.4")]
    0RjMLdP_TAvF: [PJ7Dc9sGf9lm("Context Window (K)"), 294FwuyXG_qn("200")]
    b3YvfyDatz1k: [muK0DU9TXlPN("Knowledge Cutoff"), UAZF636i5M7P("<span data-inlineref-date...>")]
```

---

## 八、attrDef（字段定义）

### 8.1 概述

共 170 个 `attrDef` 节点，每个代表一个用户定义的字段。

### 8.2 特征

- 每个 attrDef 都有一个 metanode
- metanode 中必有一个 `[SYS_A13, SYS_T02]` 元组，表示"此节点是一个 field-definition"
- 部分 attrDef 有 `typeChoice` 子元组，指定数据类型
- 部分有 `SYS_A38` (option search) 子元组，指定选项来源

### 8.3 实例

```
attrDef: Y2jQak4nefGX (name="Product")
  children:
    srubpf9utnKE: [SYS_T06("Datatype"), SYS_D05("Options from supertag")]
    noMAZaLuu9uP: [SYS_A38, uQMKEvcJNsAh]
  metanode:
    [SYS_A13, SYS_T02("field-definition")]
```

---

## 九、_sourceId 继承机制

### 9.1 概述

共 2,449 个节点有 `_sourceId`，用于追踪**模板来源**。

### 9.2 分类

| 使用方 docType | 数量 |
|---------------|------|
| `tuple` | 1,287 |
| *(无类型)* | 953 |
| `metanode` | 169 |
| `url` | 14 |
| `codeblock` | 13 |
| `search` | 8 |
| `viewDef` | 5 |

### 9.3 指向目标

| 目标 docType | 数量 |
|-------------|------|
| `tuple` | 1,285 |
| `NOT_FOUND` | 971 |
| `metanode` | 177 |
| `search` | 8 |
| `viewDef` | 8 |

### 9.4 含义

当用户为节点添加标签时，tagDef 的字段模板（Tuple）会被"实例化"到内容节点上。实例化后的 Tuple 通过 `_sourceId` 指向原始模板 Tuple。

**示例**:
```
任务节点的字段实例:
  dfqZxvZUyBho (dt=tuple, _sourceId="2BdD6fhwKKq9")
  指向 -> 2BdD6fhwKKq9 (task tagDef 中的 Status 字段模板)
```

`NOT_FOUND` (971 个) 的情况说明某些模板来源节点已被删除或来自外部/系统定义。

---

## 十、富文本编码

### 10.1 概述

`name` 字段支持以下富文本编码方式:

### 10.2 HTML 标签

| 标签 | 出现次数 | 含义 |
|------|---------|------|
| `<strong>` | 755 | 粗体 |
| `<code>` | 649 | 行内代码 |
| `<b>` | 247 | 粗体（旧式） |
| `<span>` | 241 | 内联引用容器 |
| `<a>` | 64 | 链接 |
| `<mark>` | 50 | 高亮 |
| `<strike>` | 29 | 删除线 |
| `<em>` | 16 | 斜体 |

### 10.3 内联引用节点 (`data-inlineref-node`)

用于在文本中内联引用另一个节点:

```html
<span data-inlineref-node="Lgdr5_g94__D"></span>
```

总计 62 个节点使用此模式。引用的目标节点会被渲染为可点击的链接。

### 10.4 内联日期 (`data-inlineref-date`)

用于在文本中嵌入日期:

```html
<span data-inlineref-date="{&quot;dateTimeString&quot;:&quot;2026-01-26&quot;,&quot;timezone&quot;:&quot;Asia/Shanghai&quot;}"></span>
```

总计 176 个节点使用此模式。JSON 结构包含 `dateTimeString`（ISO 格式日期）和 `timezone`。

### 10.5 Wiki 风格引用 (`[[name^nodeId]]`)

```
[[What makes a great ChatGPT app^lj5xyDUdBwqV]]
```

总计 7 个节点使用此模式。`^` 后面是目标节点 ID。

### 10.6 多行文本

代码块节点的 `name` 字段直接存储多行文本（使用 `\n`），共 744 个节点。

---

## 十一、系统节点完整目录

### 11.1 SYS_A* (系统属性)

这些是 Tana 预定义的"字段键"，用作 Tuple 的 `children[0]`:

| ID | 名称 | 用途 |
|----|------|------|
| `SYS_A11` | Color | 节点颜色 |
| `SYS_A12` | Locked | 锁定状态 |
| `SYS_A13` | Node supertags(s) | **标签应用（最核心）** |
| `SYS_A14` | Child supertag | 子节点默认标签 |
| `SYS_A15` | Search expression | 搜索表达式 |
| `SYS_A16` | Views for node | 视图配置 |
| `SYS_A17` | Column definitions | 列定义 |
| `SYS_A18` | Filter expressions | 过滤表达式 |
| `SYS_A19` | Sort order definition | 排序定义 |
| `SYS_A20` | Sort field definition | 排序字段 |
| `SYS_A21` | Node name | 节点名称 |
| `SYS_A22` | Node description | 节点描述 |
| `SYS_A23` | Title expression | 标题表达式 |
| `SYS_A24` | Side note | 侧注 |
| `SYS_A25` | Banner image | 横幅图片 |
| `SYS_A26` | Formula | 公式 |
| `SYS_A27` | *(聊天相关)* | 聊天配置 |
| `SYS_A31` | Read cursor | 阅读游标 |
| `SYS_A38` | *(选项搜索)* | 选项搜索 |
| `SYS_A44` | Autocollect options | 自动收集选项 |
| `SYS_A47` | Target node(s) | 目标节点 |
| `SYS_A55` | Show done/not done | 显示复选框 |
| `SYS_A62` | Field defaults | 字段默认值 |
| `SYS_A70` | Code block language | 代码块语言 |
| `SYS_A75` | Alias for external node only | 外部节点别名 |
| `SYS_A78` | URL | URL 字段 |
| `SYS_A84` | Merged into | 合并到目标 |
| `SYS_A89` | *(聊天机器人)* | 聊天机器人配置 |
| `SYS_A90` | Date | 日期字段 |
| `SYS_A100` | Node published? | 发布状态 |
| `SYS_A105` | Publish settings | 发布设置 |
| `SYS_A121` | Field suggestions | 字段建议 |
| `SYS_A129` | Shadow tag nodes | 影子标签节点 |
| `SYS_A130` | Tag suggestions | 标签建议 |
| `SYS_A131` | Path | 路径 |
| `SYS_A133` | Content config | 内容配置 |
| `SYS_A134` | Form | 表单 |
| `SYS_A136` | Original audio | 原始音频 |
| `SYS_A139` | Chat context | 聊天上下文 |
| `SYS_A141` | Is field hoisted | 字段是否提升 |
| `SYS_A142` | Attendees | 参与者 |
| `SYS_A143` | Icon | 图标 |
| `SYS_A144` | Related content | 相关内容 |
| `SYS_A146` | Tag search node | 标签搜索节点 |
| `SYS_A148` | Schema | 架构 |
| `SYS_A156` | Optional fields | 可选字段 |
| `SYS_A157` | Field nursery | 字段苗圃 |
| `SYS_A160` | AI instructions | AI 指令 |
| `SYS_A169` | Journal date | 日志日期 |
| `SYS_A173` | Number of references (raw) | 引用数量 |
| `SYS_A174` | Side filters | 侧边过滤器 |
| `SYS_A175` | Commands (full menu) | 命令菜单 |
| `SYS_A176` | AI payload | AI 负载 |
| `SYS_A179` | Supertag instances are entities | 标签实例为实体 |
| `SYS_A199` | Source material | 源材料 |
| `SYS_A200` | Links to | 链接到 |
| `SYS_A201` | Linked path | 链接路径 |
| `SYS_A202` | Node source | 节点来源 |
| `SYS_A203` | Inline date | 内联日期 |
| `SYS_A204` | Inline node | 内联节点 |
| `SYS_A205` | Display density | 显示密度 |
| `SYS_A206` | Drafts | 草稿 |
| `SYS_A207` | Template is verified | 模板已验证 |
| `SYS_A208` | Attribute prototype | 属性原型 |
| `SYS_A209` | Assigned to | 指派给 |
| `SYS_A214` | Heading style | 标题样式 |
| `SYS_A215` | Reference search node | 引用搜索节点 |
| `SYS_A216` | Alias tag names | 标签别名 |
| `SYS_A250` | Hide from searches and menus | 隐藏 |
| `SYS_A251` | Promote for | 推广给 |
| `SYS_A252` | Speaker | 发言人 |

### 11.2 SYS_D* (数据类型)

| ID | 名称 |
|----|------|
| `SYS_D01` | Checkbox |
| `SYS_D02` | Integer |
| `SYS_D03` | Date |
| `SYS_D05` | Options from supertag |
| `SYS_D06` | Plain（默认） |
| `SYS_D07` | Formula |
| `SYS_D08` | Number |
| `SYS_D09` | Tana User |
| `SYS_D10` | Url |
| `SYS_D11` | E-Mail |
| `SYS_D12` | Options |
| `SYS_D13` | Options |

### 11.3 SYS_V* (枚举值)

关键枚举值:

| ID | 名称 | 用于 |
|----|------|------|
| `SYS_V01` | Single value | Cardinality |
| `SYS_V02` | List of values | Cardinality |
| `SYS_V03` | Yes | 通用布尔 |
| `SYS_V04` | No | 通用布尔 |
| `SYS_V14` | HAS_ATTRIBUTE | 搜索表达式关键字 |
| `SYS_V15` | PARENTS_DESCENDANTS | 搜索表达式 |
| `SYS_V16` | GRANDPARENTS_DESCENDANTS | 搜索表达式 |
| `SYS_V19` | HAS_TAG | 搜索表达式关键字 |
| `SYS_V30` | Defined | 过滤条件 |
| `SYS_V31` | Not defined | 过滤条件 |
| `SYS_V33` | PARENTS_DESCENDANTS_WITH_REFS | 搜索表达式 |
| `SYS_V36` | PARENT | 搜索表达式 |
| `SYS_V49` | LINKS TO | 搜索操作符 |
| `SYS_V52` | Always | 条件 |
| `SYS_V53` | CHILD OF | 搜索操作符 |
| `SYS_V54` | Never | 条件 |
| `SYS_V55` | OWNED BY | 搜索操作符 |
| `SYS_V56` | When empty | 条件 |
| `SYS_V57` | When not empty | 条件 |
| `SYS_V62` | Part of | 语义函数 |
| `SYS_V64` | COMPONENTS REC | 搜索操作符 |
| `SYS_V86` | Tana | 聊天机器人 |

---

## 十二、Search（搜索）节点

### 12.1 概述

共 44 个搜索节点，每个代表一个 **Live Search / Smart Node**。

### 12.2 结构

搜索节点通过 metanode 存储搜索配置:

```
Search: b-Iw9OQd4oNp (name="Projects")
  _metaNodeId -> 0MS9a31fguU4 (metanode)
  metanode children:
    Tuple: [SYS_A15("Search expression"), kMhD-NKosQ45("project")]
    Tuple: [SYS_A16("Views for node"), nxraVAxn6v-7("Default")]
    Tuple: [SYS_A14("Child supertag"), kMhD-NKosQ45("project")]
```

### 12.3 搜索表达式模式

搜索表达式 (SYS_A15) 的 Tuple 结构:

- **简单搜索**: `[SYS_A15, tagDefId]` — 搜索所有 tagged 节点
  - 例: `[SYS_A15, kDONVvtcQnBh("tool_call")]` — 搜索所有 #tool_call

- **带过滤条件的搜索**: `[SYS_A15, tagDefId, filterTuple]`
  - 例: `[SYS_A15, jDc2ISPtN3v3("task"), Svw06aqmeiC5("...")]` — 搜索 #task 并过滤
  - `filterTuple` 是嵌套的 Tuple，包含 `[fieldDefId, filterValue]`

- **带 NOT DONE 条件**: `[SYS_A15, tagDefId, "NOT DONE"]`

### 12.4 搜索节点的 children

搜索节点的 `children` 直接存储**搜索结果**（引用 ID 列表），平均 52.2 个，最多 580 个。

---

## 十三、Workspace 容器命名约定

```
{workspaceId}_WORKSPACE  — 布局列表
{workspaceId}_SCHEMA     — 标签/字段架构
{workspaceId}_TRASH      — 回收站
{workspaceId}_SIDEBAR_AREAS — 侧边栏区域
{workspaceId}_TRAILING_SIDEBAR — 尾部侧边栏
```

**实例** (workspaceId = `b8AyeCJNsefK`):

| ID | 名称 | 子节点数 |
|----|------|---------|
| `b8AyeCJNsefK_WORKSPACE` | List of layouts | 169 |
| `b8AyeCJNsefK_SCHEMA` | Schema | 19 |
| `b8AyeCJNsefK_TRASH` | Deleted Nodes | 4,891 |
| `b8AyeCJNsefK_SIDEBAR_AREAS` | Sidebar areas | 3 |
| `b8AyeCJNsefK_TRAILING_SIDEBAR` | Trailing sidebar | 1 |

`_SCHEMA` 的 children 是该工作区所有用户自定义标签:
```
children: [c-YgdZIHB4uz("day"), gNhuC6apo_ej("week"), kCCG1uRQajkL("year"),
           kMhD-NKosQ45("project"), -vHeZaLpwMPM("product"), ...]
```

---

## 十四、日志（Journal）结构

### 14.1 层级

```
Journal (eMRB8YyMqNtA, name="Calendar")
  └── JournalPart "2026" (年)
       └── JournalPart "Week 05" (周)
            └── JournalPart "2026-01-26 - Monday" (日)
                 └── 普通内容节点...
  └── JournalPart "2025" (年)
       └── ...
```

### 14.2 日志日期

每个 journalPart 的 metanode 中有 `SYS_A169` (Journal date) 元组，存储对应的日期/周/年信息。

---

## 十五、Codeblock 结构

每个 codeblock 节点:
- `name`: 存储代码内容（多行文本，用 `\n` 分隔）
- `children`: 恰好 1 个 Tuple，结构为 `[SYS_A70("Code block language"), 语言节点]`

**语言分布**:

| 语言 | 数量 |
|------|------|
| plaintext | 475 |
| CSS | 302 |
| C | 117 |
| JavaScript | 90 |
| C++ | 88 |
| Java | 38 |
| yaml | 26 |
| markdown | 24 |
| Python | 20 |
| Ruby | 19 |
| json | 16 |
| xml | 11 |
| Go | 9 |
| PHP | 6 |
| bash | 1 |

---

## 十六、Visual（图片）节点

共 58 个图片节点:
- `_imageWidth`、`_imageHeight`: 存储图片尺寸
- `_metaNodeId`: 指向包含媒体类型信息的 metanode
- 部分有 children（含 Tuple，通常指向 "From" 来源引用）

---

## 十七、_ownerId 所有权模型

`_ownerId` 表示节点所属的**父容器**:

| 顶级所有者 | 数量 | 含义 |
|-----------|------|------|
| `b8AyeCJNsefK_TRASH` | 4,832 | 回收站（已删除） |
| `SYS_0` (System Nodes) | 407 | 系统节点 |
| 日志 journalPart | ~多个~ | 按日分布的日志内容 |
| `b8AyeCJNsefK_WORKSPACE` | 169 | 工作区布局 |
| `SYS_V00` (System Enums) | 70 | 系统枚举值 |
| `SYS_T16` (meta information) | 50 | 元信息标签下的子定义 |

**重要发现**: 4,832 个节点在回收站中，占总数的 11.6%。

---

## 十八、TouchCounts 与 ModifiedTs

### 18.1 touchCounts

数组长度与 editors 数量对应:
- 长度 4: 14,278 个节点 — 基础格式 `[user, ai, system, migration]`
- 长度 7: 23,869 个节点 — 扩展格式
- 每个位置的值表示该编辑者对该节点的编辑次数

### 18.2 modifiedTs

数组长度分布:
- 长度 4: 14,278 个节点
- 长度 19: 24,524 个节点
- 每个位置的值是该编辑者最后修改该节点的时间戳（0 表示从未修改）

---

## 十九、数据模型总结图

```
┌─────────────────────────────────────────────────────┐
│                    Tana Data Model                    │
├─────────────────────────────────────────────────────┤
│                                                       │
│  ┌─────────┐    _metaNodeId    ┌──────────┐          │
│  │  Node    │ ────────────────→│ Metanode  │          │
│  │(任何类型)│                   │           │          │
│  └────┬────┘                   └─────┬────┘          │
│       │ children                     │ children       │
│       ▼                              ▼               │
│  ┌─────────┐                   ┌──────────┐          │
│  │ Tuple   │                   │  Tuple   │          │
│  │(字段值) │                   │(元信息)  │          │
│  └────┬────┘                   └────┬────┘          │
│       │ children[0]=key             │ children       │
│       │ children[1:]=values         │                │
│       ▼                              ▼               │
│  ┌─────────┐ ┌──────────┐    ┌────────┐ ┌────────┐ │
│  │attrDef  │ │  Value   │    │SYS_A13 │ │tagDef  │ │
│  │(字段键) │ │(字段值)  │    │(标签键)│ │(标签值)│ │
│  └─────────┘ └──────────┘    └────────┘ └────────┘ │
│                                                       │
│  ┌─────────┐    _sourceId     ┌──────────┐          │
│  │实例Tuple│ ────────────────→│模板Tuple │          │
│  │(在内容中)│                  │(在tagDef中)│         │
│  └─────────┘                   └──────────┘          │
│                                                       │
│  ┌─────────┐  associationMap  ┌──────────────┐      │
│  │  Node   │ ────────────────→│associatedData│      │
│  │(有字段) │  {childId: adId} │  (索引数据)  │      │
│  └─────────┘                   └──────────────┘      │
│                                                       │
└─────────────────────────────────────────────────────┘
```

---

## 二十、关键设计模式总结

### 20.1 一切皆节点

Tana 中的所有实体（内容、标签、字段、元数据、搜索、视图等）都是 `doc` 节点。不同的 `_docType` 赋予节点不同的语义。

### 20.2 Tuple 是万能粘合剂

Tuple 节点通过 `children = [key, value1, value2, ...]` 的约定将任意两个或多个概念关联起来。这是 Tana 数据模型中最重要的设计模式:
- 标签应用: `[SYS_A13, tagDefId]`
- 字段赋值: `[attrDefId, valueNode]`
- 选项定义: `[SYS_T03, option1, option2, ...]`
- 搜索表达式: `[SYS_A15, tagDefId, filterTuple]`
- 视图配置: `[SYS_A17, columnDefNode]`
- 代码块语言: `[SYS_A70, languageNode]`
- URL: `[SYS_A78, urlValueNode]`

### 20.3 Metanode 是元信息代理

每个需要元信息的节点通过 `_metaNodeId` 指向一个 metanode。metanode 的 children 全部是 Tuple，每个 Tuple 承载一条元信息。这种间接设计避免了在原节点上直接存储复杂的元数据。

### 20.4 模板继承通过 _sourceId

TagDef 的字段模板 Tuple 在节点标签应用时被"实例化"为新 Tuple，通过 `_sourceId` 维持指向原模板的引用。这实现了模板-实例的关系追踪。

### 20.5 AssociationMap 是反向索引

`associationMap` 将内容节点的子节点（通常是字段 Tuple）映射到 `associatedData` 节点，用于快速查找和反向引用。

### 20.6 搜索是实时的

搜索节点的 `children` 直接存储匹配结果的节点 ID 列表，搜索配置通过 metanode 中的 Tuple 定义（搜索表达式、过滤器、排序、视图等）。

---

## 二十一、统计汇总

| 指标 | 值 |
|------|-----|
| 总节点数 | 41,753 |
| 有 children 的节点 | 23,431 (56.1%) |
| 有 _metaNodeId 的节点 | 5,781 (13.8%) |
| 有 _sourceId 的节点 | 2,449 (5.9%) |
| 有 associationMap 的节点 | 789 (1.9%) |
| 在回收站中的节点 | 4,832 (11.6%) |
| 系统节点 (SYS_*) | ~600+ |
| 用户自定义标签 | 19 |
| 用户自定义字段 | 170 |
| 搜索节点 | 44 |
| 代码块 | 870 |
| 日志部分 | 142 |
