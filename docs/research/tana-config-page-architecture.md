# Tana 配置页面架构（逆向分析）

> 通过运行时 DOM 分析 + React DevTools 研究 Tana 字段配置页面的底层 node 结构。
> 核心发现：配置页面不是定制 UI，而是标准 NodePanel 渲染被系统标签标记的节点。

---

## 核心设计模式：System Tag as Config Schema

Tana 的 "Everything is a Node" 哲学贯穿到配置页面：

**配置页面 = 标准 NodePanel + 系统标签(SYS_T*)的模板字段**

attrDef、tagDef、viewDef 等定义节点本身也是被系统标签标记的普通节点，
它们的配置页通过渲染系统标签的模板字段来呈现，无需任何定制 UI 组件。

---

## 字段配置页（AttrDef Config Page）详细分析

### 1. AttrDef 节点的真实结构

```
AttrDef "test field" (WSSgX9_XhMuR)
  _docType: attrDef
  _metaNodeId → Metanode (JbJoI1aeK728)
    └── Tuple [SYS_A13, SYS_T02]    ← attrDef 被标记为 #FIELD_DEFINITION

  直接子节点（仅 1 个）:
    └── Tuple (ilkR_b-P74jN)
        children: [SYS_T06("Datatype"), SYS_D12("Options")]
        _sourceId: SYS_A02   ← 从 SYS_T02 模板实例化
        _ownerId: WSSgX9_XhMuR
```

**关键发现**：
- AttrDef 的直接子节点**仅有 1 个** Tuple（typeChoice）
- 该 Tuple 的 key 不是 `SYS_A02` 而是 `SYS_T06`（"Datatype" tag），`_sourceId` 才指向 `SYS_A02`
- 配置页上的其他 16 项配置都来自 `SYS_T02` 系统标签的模板字段

### 2. 配置项 → Node 映射（16 项）

#### A. TupleAsPicker（下拉选择器）— 2 项

| UI 标签 | Tuple Key (children[0]) | Tuple Value (children[1]) | _ownerId | _sourceId |
|---------|------------------------|--------------------------|----------|-----------|
| **Field type** | `SYS_T06` ("Datatype") | `SYS_D12` ("Options") | 用户 AttrDef | `SYS_A02` |
| **Hide field** | `SYS_T61` ("Hide field conditions") | `SYS_V54` ("Never") | `SYS_T02` (系统) | — |

组件层级：`TupleAsPicker-module_el` > `TupleAsPicker-module_picker` > `fieldIcon + label + chevron`

#### B. Outliner 节点列表（可编辑区域）— 5 项

| UI 标签 | Tuple Key (children[0]) | _ownerId | Metanode 来源 |
|---------|------------------------|----------|--------------|
| **Pre-determined options** | `SYS_T03` ("Options") | `SYS_T02` | `SYS_A03_META` |
| **Sources of options** | `SYS_A52` ("Options List") | `SYS_T02` | `SYS_T51_META` |
| **AI instructions** | `SYS_A160` ("AI instructions") | `SYS_T16` | `SYS_T115_META` |
| **Commands** | `SYS_A88` ("Commands compact menu") | `SYS_T02` | `SYS_T85_META` |
| **Page size** | `SYS_A110` ("Page Size") | `SYS_T02` | `SYS_T90_META` |

这些渲染为标准大纲区域（NodeAsListElement），data-id 路径格式：`{attrDefId}|{tupleId}|{valueNodeId}`

#### C. ToggleButton（布尔开关）— 6 项

| UI 标签 | 默认状态 | 说明 |
|---------|---------|------|
| **Auto-collect values** | ON | Options 类型默认开启 |
| **Auto-initialize** | OFF | |
| **Required** | OFF | |
| **Audio-enabled field** | OFF | |
| **AI-enhanced field** | OFF | 仅桌面端 |
| **Field has semantic function** | OFF | Advanced 区域 |

Toggle 可能通过 Tuple[SYS_A*, SYS_V03/SYS_V04] 存储在 Metanode 中，未 toggle 时不存在对应 Tuple。

#### D. 其他 UI 元素

| UI 标签 | 类型 | 说明 |
|---------|------|------|
| **Autofill - extract tagged entities** | Search/picker | Supertag 选择器 |
| **Used in** | Search link | "Q 1 node" 链接 |
| **Actions** | Button | "Make discoverable" |
| **Advanced** | 折叠区域 | 含 Commands, Page size, Semantic function |

### 3. DOM 组件层级

```
ContentPositionerRoot (PanelContentPositionerRoot)
  SharedComponents-module_content
    SharedComponents-module_section
      SharedComponents-module_field
        SharedComponents-module_labelText     ← "Field type", "Options" 等标签
        SharedComponents-module_value
          TupleAsPicker-module_el             ← 下拉型
          ToggleButton-module_wrapper          ← 开关型
          NodeAsListElement (data-id=...)      ← 列表型
```

### 4. 核心架构推论

配置页渲染流程：

```
1. 用户点击 attrDef 的 type icon
2. pushPanel(attrDefId) → NodePanel 渲染 attrDef 节点
3. attrDef 被 SYS_T02 标记 → 读取 SYS_T02 的模板字段
4. 对每个模板字段，根据字段类型选择渲染组件：
   - Picker 型字段 → TupleAsPicker
   - Boolean 型字段 → ToggleButton
   - Node 列表型字段 → OutlinerItem (标准大纲)
5. 用户修改值时，在 attrDef 上创建/更新实例 Tuple
```

**关键区别**：绝大多数模板 Tuple 的 `_ownerId = SYS_T02`（系统级），
不是用户的 AttrDef。它们是**系统模板**，仅在服务端存在，Tana JSON 导出中不包含。

---

## 设计模式推广

此模式不仅用于 attrDef，同样适用于：

| 节点类型 | 系统标签 | 配置页内容 |
|---------|---------|-----------|
| **attrDef** | `SYS_T02` (FIELD_DEFINITION) | Field type, Options, Hide, Required... |
| **tagDef** | `SYS_T01` (SUPERTAG) | Building blocks, Content template, AI, Advanced... |
| **viewDef** | *(待研究)* | Columns, Sort, Filter... |
| **search** | *(待研究)* | Search expression, Default tag... |

**通用模式**：定义类型节点(Def) = 普通节点 + 系统标签(SYS_T*) → 配置页 = 标准 NodePanel 渲染系统标签的模板字段

---

## 新发现的 SYS 常量

以下常量在 field config 页面中发现，但尚未在代码中定义：

| ID | 名称 | 分类 | 用途 |
|----|------|------|------|
| `SYS_A52` | "Options List" | SYS_A | Sources of options key |
| `SYS_A88` | "Commands (compact menu)" | SYS_A | Commands key |
| `SYS_A110` | "Page Size" | SYS_A | Page size key |
| `SYS_T06` | "Datatype" | SYS_T | Field type picker key |
| `SYS_T61` | "Hide field conditions" | SYS_T | Hide field picker key |

---

## Nodex 实现策略

### MVP 简化（当前阶段）

由于 SYS_T02 系统标签的完整模板体系过于复杂（16 项配置），MVP 阶段只需：

1. **typeChoice**：AttrDef 的直接子 Tuple，使用 TupleAsPicker 渲染
2. **Options 列表**：AttrDef 的非 Tuple 子节点，使用标准 Outliner 渲染
3. **字段名**：AttrDef.props.name，inline 编辑
4. **删除**：trashNode

### 长期目标

完整实现 SYS_T02 系统标签 + 模板字段体系，使配置页面完全由 node 组合驱动，
与 Tana 的 "Everything is a Node" 架构完全一致。
