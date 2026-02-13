# Feature: Fields 全类型

> Phase 1.3 | 全类型值编辑器已实现 | [GitHub Issue #21](https://github.com/relixiaobo/nodex/issues/21)

## 行为规格

### 字段创建

- 节点编辑器中输入 `>` 触发字段创建
- 弹出字段名搜索面板（自动完成已有 attrDef）
- 选择已有字段或创建新字段名
- 创建后在节点 children 中插入 field Tuple：`[attrDefId, valueNodeId?]`
- 同时创建 associatedData 并建立 associationMap 映射

### 字段渲染

- 字段和内容节点在 children 中**交错显示**（保持原始顺序，不分离）
- 字段行布局：`[icon] [字段名 130px] [字段值区域]`
- 字段名可编辑（点击进入编辑模式，自动完成已有 attrDef 名）
- 字段名为空时自动聚焦到字段名编辑器

### 字段值统一模型（设计原则）

**所有字段类型的值区域本质上都是 outliner**。数据模型层面，值永远是 `assocData.children[]` —— 一组节点。dataType 只决定值节点的**输入方式**和**显示格式**，不改变值区域的底层结构。

统一行为（所有类型共享）：
- 值区域 = `FieldValueOutliner`（mini outliner）
- 支持多个值节点（assocData.children 可以有多项）
- 支持嵌套子节点
- 支持 `>` 转 field tuple（创建嵌套字段）
- TrailingInput 添加新值
- 完整的树操作（Enter/Tab/Shift+Tab）

类型特有行为（由 dataType 控制）：
- **Plain**（默认）：标准文本编辑
- **Options**：文本编辑 + 可从预置选项中选取（值 = 节点引用）
- **Date**：日期选择器
- **Number/Integer**：数字输入
- **URL**：URL 输入 + 链接样式显示
- **Email**：邮箱输入
- **Checkbox**：复选框 toggle

> **已完成统一**：所有字段类型（含 Checkbox）的值区域统一通过 FieldValueOutliner 渲染。OutlinerItem 通过 `fieldDataType` prop 控制特殊渲染（如 Checkbox → toggle）。FieldValueEditor 已成为死代码。

### 字段配置页（AttrDef Config）

- 点击字段名 → navigateTo attrDef 节点（进入配置页）
- 配置页是标准 NodePanel 渲染被 SYS_T02 (FIELD_DEFINITION) 标记的节点
- 配置项（所有类型通用）：
  - **Field type**: 下拉选择数据类型（Plain / Options / Date / Number / URL / Email / Checkbox）
  - **Required**: 开关，空值时视觉警告
  - **Hide field**: 下拉选择（Never / When empty / Always）
- 配置项（特定类型）：
  - **Auto-collect values**: Options 类型，自动收集使用过的值
  - **Auto-initialize**: Options/Date 类型，自动从祖先继承值
  - **Pre-determined options**: Options 类型，预设选项列表（outliner 编辑）
  - **Minimum value / Maximum value**: Number 类型，数值范围校验
  - **Options from Supertag**: Options 类型，用特定标签的节点作为选项源

### Plain 类型（默认）

- 值区域渲染为标准 OutlinerView（子节点列表）
- 支持添加子节点、编辑、拖拽等所有大纲操作
- 这是默认类型，不选择其他类型时就是 Plain

### Options 类型 — 已实现

- 值区域渲染为 `OptionsPicker` combobox（输入 + 下拉选择 + 新建）
- 选项来源：Pre-determined options（attrDef 配置的固定选项列表）
- **Display 模式**：选中选项以 reference bullet（dotted）+ name 显示；无值时 dimmed bullet + "Select option"
- **Editing 模式**（点击进入）：
  - 输入框自动聚焦，可输入文字过滤已有选项
  - 下拉列表实时匹配；已选项带 primary 高亮点
  - Enter 选择高亮项，或在无匹配时创建新选项节点
  - Escape / click outside → 关闭不改变
- **新建选项（Auto-collect）**：输入不匹配文字 + Enter → `autoCollectOption` 创建值节点：
  - **原节点留在 field value**（assocData.children），不是 attrDef 的直接子节点
  - **引用存入 autocollect Tuple**：attrDef 的 autocollect Tuple (`[SYS_A44, toggle, ...ids]`) children[2+] 存放引用
  - 下次选择同字段时，auto-collected 值与 pre-determined 选项合并显示在下拉中
- **Auto-collect 配置页**：attrDef 配置页显示 Auto-collect values 区段：
  - Toggle（ON/OFF）控制是否将 auto-collected 值作为可选项
  - 名称列显示 "(N)" 计数
  - Toggle 下方显示 auto-collected 值列表（reference bullet 样式）
- 待扩展：Options from Supertag

### Date 类型 — 已实现

- 值区域渲染为 `FieldValueEditor` click-to-edit 日期输入
- 点击 "Empty" 显示 `<input type="date">`，选择后自动保存并关闭
- 值存储为 ISO 日期字符串（YYYY-MM-DD）
- 待扩展：链接到日节点、自然语言输入

### Number 类型 — 已实现

- 值区域渲染为 `FieldValueEditor` click-to-edit 数字输入
- INTEGER 类型 step=1, NUMBER 类型 step=any
- Enter 确认、Escape 取消、blur 自动保存
- 待扩展：min/max 校验

### URL 类型 — 已实现

- 值区域渲染为 `FieldValueEditor` click-to-edit URL 输入
- 有值时显示为蓝色带下划线的链接样式
- 待扩展：点击链接在新标签页打开

### Email 类型 — 已实现

- 值区域渲染为 `FieldValueEditor` click-to-edit Email 输入
- 待扩展：显示为 `mailto:` 可点击链接

### Checkbox 类型 — 已实现

- 值区域渲染为内联复选框（直接 toggle，无 click-to-edit）
- 数据模型：值节点 name = SYS_V03 (Yes) 或 SYS_V04 (No)
- 注意区分：这是字段值的 checkbox，与 Supertag 的 "Show as Checkbox" 是不同功能

### Tana User 类型 — 未实现

- 字段值为 workspace 用户（@ mention 选择）
- 提示选择工作区成员

### 字段隐藏规则 — 未实现

- 根据 attrDef "Hide field" 配置 + 当前值状态：
  - **Never**: 始终显示
  - **When empty**: 值为空时隐藏（hover 区域时短暂显示）
  - **When not empty**: 有值时隐藏
  - **When value is default**: 值等于默认值时隐藏
  - **Always**: 始终隐藏（仅在配置页可见）
- 注意: Tana 有 5 种模式，我们之前只记了 3 种

### Required 字段 — 未实现

- attrDef "Required" = true 时：
  - 字段值为空 → 字段名显示红色星号 `*`
  - 不阻止操作，只是视觉提示

### Auto-initialize 规则 — 未实现

- 字段可配置自动填充策略（applyTag 或手动添加字段时触发）：
  1. **Ancestor field value**: 从祖先节点继承同字段值
  2. **Ancestor supertag reference**: 引用祖先的某个标签节点
  3. **Random node from supertag**: 从指定标签的所有节点中随机选一个
  4. **Current date**: 自动填入当前日期
  5. **Ancestor day node date**: 从祖先日节点继承日期
  6. **Current user**: 自动填入当前用户
- 适用于多种字段类型（不仅是 Options/Date）

### Pinned Fields — 未实现

- 在 supertag 配置中标记字段为 pinned
- Pinned 字段置顶显示在节点实例顶部，带 border 样式
- Filter/Sort/Group 工具栏优先展示 pinned 字段
- 多标签节点中跨所有标签统一显示

### 删除字段级联清理

- trashNode(attrDefId) 时自动级联：
  - 遍历所有节点（含 tagDef 模板），移除引用该 attrDef 的字段 tuple
  - 清理对应 associatedData + associationMap
  - attrDef 本身移到 Trash
- Tana 行为：被删字段在节点上显示废纸篓图标（Nodex 当前直接清除引用）

### Merge Fields — 未实现

- 合并重复字段定义，所有引用指向合并后的 attrDef

### 字段嵌套限制

- Tana 文档说明：嵌套在其他节点/字段下的字段不能用于搜索、表格显示或标题表达式
- Nodex 应遵循相同约束

## 决策记录

| 日期 | 决策 | 原因 |
|------|------|------|
| 2026-02-08 | 字段和内容交错渲染（非分离） | 保持 children 原始顺序，与 Tana 一致 |
| 2026-02-08 | addUnnamedFieldToNode 需要 applyTag(SYS_T02) | 确保新字段有完整配置项 |
| 2026-02-06 | 所有类型通用配置 + 特定配置分离 | ATTRDEF_CONFIG_MAP 用 appliesTo 控制可见性 |
| 2026-02-06 | Options/Checkbox 使用 SYS_V03/V04 布尔值 | 与 Tana 数据模型一致 |
| 2026-02-06 | Unified NodePicker 设计模式 | Options、Config Select 等统一为"从列表选节点"组件 |
| 2026-02-12 | trashNode(attrDef) 级联清理所有引用 | 删除字段后，所有使用该字段的节点自动移除字段 tuple |
| 2026-02-12 | 对比 Tana 官方文档补全遗漏（Hide 5 种模式、Auto-init 6 种策略等） | 确保功能清单完整 |
| 2026-02-12 | FieldRow 按 dataType 分发到 3 种渲染器 | Options→OptionsFieldValue, Plain→FieldValueOutliner, 其余→FieldValueEditor |
| 2026-02-12 | FieldValueEditor 移除 Options 分支 | Options 由 OptionsFieldValue 独立处理（支持 ReferenceNode 显示） |
| 2026-02-12 | OptionsPicker 改为 combobox 模式 | 支持输入搜索 + 新建选项，与 Tana 交互一致 |
| 2026-02-12 | Auto-collect: 原节点在 field value，引用在 autocollect Tuple | 分离 pre-determined 与 auto-collected，Tuple children[2+] 存引用 |
| 2026-02-12 | **统一值渲染器**：所有字段类型值区域 = FieldValueOutliner | 数据模型层面值永远是 assocData.children[]，dataType 只决定值节点的输入方式和显示格式，不改变底层结构。替代当前 3 渲染器分发 |
| 2026-02-12 | Checkbox 统一：OutlinerItem 支持 fieldDataType prop | Checkbox 值节点渲染为 toggle 而非编辑器，FieldValueEditor 变为死代码 |

## 当前状态

- [x] `>` 触发字段创建
- [x] 字段名编辑 + 自动完成
- [x] 字段/内容交错渲染
- [x] 字段值编辑器（Plain 类型 = OutlinerView）
- [x] AttrDef 配置页（Field type / Required / Hide / Auto-collect / Auto-initialize）
- [x] 新字段自动应用 SYS_T02 标签
- [x] Delete field 按钮 + 级联清理
- [x] Options combobox（OptionsPicker: 搜索 + 选择 + 新建选项 + Auto-collect）
- [x] Date 日期选择器（click-to-edit date input）
- [x] Number 数字输入（click-to-edit, Integer/Number）
- [x] URL 链接输入（click-to-edit, 蓝色链接样式）
- [x] Email 邮箱输入（click-to-edit）
- [x] Checkbox 复选框（inline toggle, SYS_V03/V04）
- [x] FieldRow 统一值渲染器（所有类型 → FieldValueOutliner，含 Checkbox）
- [x] Options 自动补全（TrailingInput 集成，输入时下拉匹配预置/auto-collected 选项，Enter 添加引用）
- [ ] Options from Supertag（独立类型）
- [ ] Tana User 类型
- [ ] 字段隐藏规则运行时（5 种模式）
- [ ] Required 字段视觉提示
- [ ] Auto-initialize（6 种策略）
- [ ] Pinned fields
- [ ] Number Min/Max 配置
- [ ] Page size 配置
- [ ] Merge fields
- [ ] 系统字段（Created time / Modified time / Owner）
- [ ] "Used in" 统计
- [ ] Semantic functions

## 与 Tana 的已知差异

- ~~Tana 的 Options 值区域本质是 outliner~~ **已解决**：统一值渲染器完成后，Options 值区域 = FieldValueOutliner，支持自由输入、嵌套、`>` 转字段。TrailingInput 集成自动补全，输入时匹配预置/auto-collected 选项
- Tana 的 Options 支持更丰富的 UI（彩色 pill、多列选择器），Nodex 已实现 combobox 但尚无 pill 样式
- Tana 字段隐藏有 5 种模式（Never/When empty/When not empty/When default/Always），我们需全部实现
- Tana Auto-initialize 有 6 种策略，适用于多种字段类型
- Tana 的 "Used in" 计算字段显示所有使用该字段的 supertag，Nodex 延后
- Tana 删除字段后节点显示 trash icon，Nodex 直接清除引用
- Tana 有 Pinned fields 机制（置顶 + filter 优先），Nodex 暂不支持
- Tana 有 Audio-enabled / AI-enhanced / AI instructions 字段功能，属 Tana 特有，Nodex 跳过
