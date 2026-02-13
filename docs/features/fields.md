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

### Date 类型 — 已实现（Notion 风格）

- 值区域渲染为 `DatePickerField`（click-to-pick，类似 Options 交互）
- **自定义日历组件**（`DatePicker.tsx`），参考 Notion 设计：
  - 顶部日期输入框：masked input（YYYY/MM/DD 模板，逐位填充，`/` 自动补全）
  - 7 列日历网格（无周数），6 行固定高度
  - 月/年标题可点击进入年/月选择器网格（Notion 无此功能，我们的优势）
  - "Today" 快捷按钮
  - 选中日期 = 填充蓝色 `rounded-md` 方块
- **范围选择**：Toggle "End date" 开启第二个输入框，点击切换编辑端
- **时间输入**：Toggle "Include time" 开启，12 小时制 + AM/PM，输入框内联显示
  - 纯 `onKeyDown` 拦截：只接受数字，小时 1-12，分钟 0-59，2 位自动跳到下一段
- **即时保存**：点击日期/修改时间立即 `onSelect()`，无 OK 按钮
- **清除**：底部 "Clear" 按钮
- 值存储格式：`YYYY-MM-DD`（单日期）/ `YYYY-MM-DD → YYYY-MM-DD`（范围）/ 含时间 `YYYY-MM-DD HH:mm`
- 待扩展：链接到日节点、自然语言输入

### Number 类型 — 已实现

- 值区域渲染为 FieldValueOutliner（统一值渲染器），值节点 = 普通文本
- INTEGER 和 NUMBER 共用同一 UI，差异仅在验证层
- **值验证**：非数字输入 → warning icon（"Value should be a number"）
- **Min/Max 范围验证**：attrDef 配置页可设 Minimum/Maximum value（NDX_A03/A04），超出范围显示 warning（"Value should be ≥ N" / "≤ N"）
- 验证为非阻塞式，仅视觉提示（warning icon + tooltip），不阻止输入

### URL 类型 — 已实现

- 值区域渲染为 FieldValueOutliner（统一值渲染器），值节点 = 普通文本
- **值验证**：不含 `://` → warning icon（"Value should be a URL"）
- 待扩展：蓝色链接样式、点击在新标签页打开

### Email 类型 — 已实现

- 值区域渲染为 FieldValueOutliner（统一值渲染器），值节点 = 普通文本
- **值验证**：不含 `@` → warning icon（"Value should be an email address"）
- 待扩展：`mailto:` 可点击链接样式

### Checkbox 类型 — 已实现

- 值区域渲染为内联复选框（直接 toggle，无 click-to-edit）
- 数据模型：值节点 name = SYS_V03 (Yes) 或 SYS_V04 (No)
- 注意区分：这是字段值的 checkbox，与 Supertag 的 "Show as Checkbox" 是不同功能

### 值验证 — 已实现（Number/URL/Email）

- **非阻塞式验证**：不阻止输入，仅在 FieldRow 右侧显示 warning icon（橙色 `CircleAlert`）+ tooltip
- 验证逻辑在 `field-validation.tsx`：
  - **Number/Integer**：非数字 → "Value should be a number"；超 min/max → "Value should be ≥ N" / "≤ N"
  - **URL**：不含 `://` → "Value should be a URL"
  - **Email**：不含 `@` → "Value should be an email address"
- FieldRow selector 读取 assocData 首个内容子节点的 `props.name`，调用 `validateFieldValue()`
- Min/Max 通过 `resolveMinValue()` / `resolveMaxValue()` 从 attrDef 的 NDX_A03/A04 Tuple 读取

### 系统字段 (System Fields) — 已实现（8/12）

- 只读字段，值从节点元数据自动派生，不可编辑
- 用户通过 `>` 添加字段时，在 field name 输入关键词可看到系统字段选项
- 系统字段 key 以 `NDX_SYS_` 前缀存储在 tuple children[0]
- 选中后 tuple 无 value children，值由 `resolveSystemFieldValue()` 实时计算
- **已实现 8 种**：
  1. **Node description** — `props.description`
  2. **Created time** — `props.created`，Intl.DateTimeFormat 格式化
  3. **Last edited time** — `updatedAt`
  4. **Last edited by** — `updatedBy`
  5. **Owner node** — `props._ownerId` → 解析节点名，可点击跳转
  6. **Tags** — metanode chain → SYS_A13 tuples → tagDef names，逗号分隔
  7. **Workspace** — `workspaceId` → 解析工作区名
  8. **Done time** — `props._done`，无值显示 "—"
- **延后 4 种**：Edited by（需多用户）、Number of references（需全量扫描）、Date from calendar node（需祖先遍历）、Number of nodes with this tag（需全量扫描）
- FieldRow 渲染：全文字 `text-foreground-tertiary`，名称列带专属图标，值列纯文本或可点击节点引用
- 不可重复添加同一系统字段（replaceFieldAttrDef 的 duplicate guard 自然生效）

### Tana User 类型 — 未实现

- 字段值为 workspace 用户（@ mention 选择）
- 提示选择工作区成员

### 字段隐藏规则 — 已实现（4/5 种模式）

- 根据 attrDef "Hide field" 配置 + 当前值状态：
  - **Never**: 始终显示（默认）
  - **When empty**: 值为空时隐藏
  - **When not empty**: 有值时隐藏
  - **When value is default**: 待实现（需要 auto-initialize default 值概念）
  - **Always**: 始终隐藏
- 实现方式：`resolveHideField()` 读取 attrDef 的 `NDX_A01` 配置 Tuple
- 空值判定：assocData 无内容子节点 = 空（通过 `isEmpty` 字段传递）
- **click-to-reveal（Tana 风格 pill）**：
  - 所有隐藏字段（含 Always）显示为紧凑的 `+ FieldName` pill 按钮行
  - pill `+` icon 与同级 BulletChevron 精确对齐（15px 居中容器）
  - pill 之间 `gap-x-3`(12px)，pill 内 `gap-0.5`(2px)，近邻性原则分组
  - hover 仅文字颜色 `tertiary → secondary`，无背景色
  - 点击临时展开为完整 FieldRow，离开节点后恢复隐藏（transient React state）
  - OutlinerItem（内联）和 OutlinerView（zoom-in）两处一致

### Required 字段 — 已实现

- attrDef "Required" (`SYS_A01` = `SYS_V03`) 时：
  - 字段值为空 → 字段名后显示红色 `*` 星号
  - 不阻止操作，只是视觉提示
  - 通过 `resolveRequired()` 读取配置，`isRequired` + `isEmpty` 传递给 FieldRow

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
| 2026-02-12 | ~~FieldRow 按 dataType 分发到 3 种渲染器~~ 已废弃 | 被统一值渲染器替代 |
| 2026-02-12 | ~~FieldValueEditor 移除 Options 分支~~ 已废弃 | FieldValueEditor 整体废弃 |
| 2026-02-12 | OptionsPicker 改为 combobox 模式 | 支持输入搜索 + 新建选项，与 Tana 交互一致 |
| 2026-02-12 | Auto-collect: 原节点在 field value，引用在 autocollect Tuple | 分离 pre-determined 与 auto-collected，Tuple children[2+] 存引用 |
| 2026-02-12 | **统一值渲染器**：所有字段类型值区域 = FieldValueOutliner | 数据模型层面值永远是 assocData.children[]，dataType 只决定值节点的输入方式和显示格式，不改变底层结构。替代当前 3 渲染器分发 |
| 2026-02-12 | Checkbox 统一：OutlinerItem 支持 fieldDataType prop | Checkbox 值节点渲染为 toggle 而非编辑器，FieldValueEditor 变为死代码 |
| 2026-02-13 | DatePicker 重写为 Notion 风格 | 自定义日历 + masked input + Toggle 控制范围/时间 + 即时保存，替代浏览器原生 date input |
| 2026-02-13 | 隐藏字段改为 pill click-to-reveal（替代 hover-to-reveal） | Tana 风格：`+ FieldName` 紧凑按钮，点击临时显示。所有隐藏模式（含 Always）都出现 pill |
| 2026-02-13 | 系统字段 key 用 NDX_SYS_* 前缀，不创建 attrDef 节点 | 系统字段无需配置/模板，值实时派生。8/12 优先实现，4 个依赖全量扫描/多用户的延后 |
| 2026-02-13 | Number Min/Max 配置 + 范围验证 | NDX_A03/A04 存储，ConfigNumberInput 编辑，validateFieldValue 支持 ≥ min / ≤ max 警告 |

## 当前状态

- [x] `>` 触发字段创建
- [x] 字段名编辑 + 自动完成
- [x] 字段/内容交错渲染
- [x] 字段值编辑器（Plain 类型 = OutlinerView）
- [x] AttrDef 配置页（Field type / Required / Hide / Auto-collect / Auto-initialize）
- [x] 新字段自动应用 SYS_T02 标签
- [x] Delete field 按钮 + 级联清理
- [x] Options combobox（OptionsPicker: 搜索 + 选择 + 新建选项 + Auto-collect）
- [x] Date 日期选择器（Notion 风格：自定义日历 + masked input + 范围/时间 Toggle + 即时保存）
- [x] Number 数字输入（click-to-edit, Integer/Number）
- [x] URL 链接输入（click-to-edit, 蓝色链接样式）
- [x] Email 邮箱输入（click-to-edit）
- [x] Checkbox 复选框（inline toggle, SYS_V03/V04）
- [x] FieldRow 统一值渲染器（所有类型 → FieldValueOutliner，含 Checkbox）
- [x] Options 自动补全（TrailingInput 集成，输入时下拉匹配预置/auto-collected 选项，Enter 添加引用）
- [ ] Options from Supertag（独立类型）
- [ ] Tana User 类型
- [x] 字段隐藏规则运行时（4/5 种模式：Never/When empty/When not empty/Always + pill click-to-reveal）
- [x] Required 字段视觉提示（红色 * 号）
- [ ] Auto-initialize（6 种策略）
- [ ] Pinned fields
- [x] Number Min/Max 配置（ConfigNumberInput + 范围验证 warning）
- [x] 值验证（Number/URL/Email 格式 + Number min/max 范围，非阻塞 warning icon）
- [ ] Page size 配置
- [ ] Merge fields
- [x] 系统字段（8/12：Description / Created / Last edited / Last edited by / Owner / Tags / Workspace / Done time）
- [ ] "Used in" 统计
- [ ] Semantic functions

## 与 Tana 的已知差异

- ~~Tana 的 Options 值区域本质是 outliner~~ **已解决**：统一值渲染器完成后，Options 值区域 = FieldValueOutliner，支持自由输入、嵌套、`>` 转字段。TrailingInput 集成自动补全，输入时匹配预置/auto-collected 选项
- Tana 的 Options 支持更丰富的 UI（彩色 pill、多列选择器），Nodex 已实现 combobox 但尚无 pill 样式
- ~~Tana 字段隐藏有 5 种模式~~ **基本完成**：已实现 4/5 种（Never/When empty/When not empty/Always），"When value is default" 需要 default 值概念后续补充
- Tana Auto-initialize 有 6 种策略，适用于多种字段类型
- Tana 的 "Used in" 计算字段显示所有使用该字段的 supertag，Nodex 延后
- Tana 删除字段后节点显示 trash icon，Nodex 直接清除引用
- Tana 有 Pinned fields 机制（置顶 + filter 优先），Nodex 暂不支持
- Tana 有 Audio-enabled / AI-enhanced / AI instructions 字段功能，属 Tana 特有，Nodex 跳过
- Tana 系统字段 12 种，Nodex 实现 8 种（延后：Edited by / Number of references / Date from calendar node / Number of nodes with this tag）
