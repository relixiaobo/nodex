# Feature: Supertags

> Phase 1.2 | 配置页基础已实现，高级功能待完善 | TASKS.md #20

## 行为规格

### 标签应用

- 节点编辑器中输入 `#` 触发 TagSelector 搜索面板
- 搜索面板列出所有 tagDef 节点（按名称匹配）
- 可选择已有标签或创建新标签（输入不存在的名称 → 新建 tagDef）
- 选择标签后：
  - 节点名称右侧出现彩色 TagBadge（`#TagName`，pill 样式）
  - 底层创建 Tuple[SYS_A13, tagDefId] 并加入 node.meta
  - 标签模板定义的字段自动添加到节点 children 中（通过 applyTag）
  - 每个字段 tuple 的 `_sourceId` 指向 tagDef 中的模板 tuple
- 一个节点可以有多个标签（多个 TagBadge 依次排列）

### 移除标签

- Hover TagBadge 时 `#` 变为 `×` 关闭按钮
- 点击 `×` 移除标签：
  - 从 node.meta 中移除对应的 SYS_A13 Tuple ID，并删除该 Tuple
  - **同时清理**由该标签模板创建的字段 tuple（通过 `_sourceId` 匹配模板 tuple）

### TagBadge 显示与交互

- 显示在节点名称右侧，编辑器外部
- 格式：`# TagName`，彩色背景 pill（哈希确定色系）
- **左键点击 TagBadge 名称** → navigateTo tagDef 节点（进入标签配置页）
- **右键菜单**：
  - "Remove tag" — 移除标签
  - "Everything tagged #tagName" — TODO：导航到搜索结果
  - "Configure tag" — navigateTo tagDef（与左键点击效果相同）
- 多标签时按应用顺序排列

### 标签配置页

- 点击 tagDef 节点（或 TagBadge）→ 进入配置页
- 配置页是标准 NodePanel 渲染被 SYS_T01 (SUPERTAG) 标记的节点
- 面包屑显示 `[#] Schema` 作为根容器
- **页面结构**：
  1. **PanelTitle**: 标签名（可编辑）+ TagBar（`#Supertag` badge）
  2. **FieldList**: 系统配置字段（来自 SYS_T01 模板，`isSystemConfig=true`）
     - Show as checkbox (toggle) — SYS_A55
     - Default child supertag (tag_picker, 当前 placeholder) — SYS_A14
     - Color (color_swatch, 10 色圆点选择器) — SYS_A11
     - Extends (tag_picker) — NDX_A05
     - Done state mapping (toggle + nested entries) — NDX_A06/A07/A08
  3. **"Default content" 标签 + ConfigOutliner**: tagDef.children 中的用户模板内容
     - **Loro 模型**：tagDef.children 直接存放 `type='fieldDef'` 模板字段节点 → 渲染为 OutlinerItem
     - 普通内容节点（无 type）→ 渲染为 OutlinerItem
     - 支持 TrailingInput 在模板中新建内容
     - ConfigOutliner 的 own items 循环包含 `!type || type==='fieldDef'`（fieldDef 节点在新模型中是模板字段）
  4. **Delete tag** 按钮

#### 配置字段架构（Loro 迁移后，2026-02-20 更新）

**Loro 新模型**：配置值直接存储为 NodexNode 扁平属性（`showCheckbox`, `color`, `extends` 等），不再有 Tuple 间接层。

- **读**: `loroDoc.toNodexNode(tagDefId)?.showCheckbox` / `.color` / `.extends`
- **写**: `setConfigValue(tagDefId, 'showCheckbox', true)` → `loroDoc.setNodeData(tagDefId, 'showCheckbox', true)`
- **虚拟 FieldEntry**: `computeFields` 为所有 `TAGDEF_CONFIG_FIELDS` 生成 `fieldEntryId=__virtual_${def.key}__` 的虚拟条目
  - outliner 类型 → `dataType='__outliner__'` → FieldRow 渲染 ConfigOutliner
  - toggle 类型 → `dataType=SYS_D.BOOLEAN` → FieldValueOutliner 检测虚拟 tupleId，从节点属性读取
  - color_picker 类型 → `dataType=SYS_D.COLOR` → ColorSwatchPicker 检测虚拟 tupleId，从 `node.color` 读取
  - 其他类型（tag_picker / done_map_entries 等）→ `dataType=FIELD_TYPES.PLAIN`（值显示待完善）
- **SYS_A_TO_PROP 映射**: `field-utils.ts` 中维护 SYS_A* key → NodexNode propName 的映射，用于 `resolveConfigValue` 和 `configKeyToPropName`

### createTagDef 自动配置

- 新建 tagDef 后自动调用 `applyTag(id, SYS_T01)`
- 创建 SYS_A13 tag binding 加入 meta + 5 个直接 config tuple（checkbox/childtag/color/extends/done_mapping）
- 每个 config tuple 的值直接存储在 children 中（统一字段架构）
- Config tuple 的 key 是真实 attrDef 实体节点（如 `attrDef_show_checkbox`），value 存储在 Tuple.children[1:] 中
- NDX_A07/A08 嵌套在 NDX_A06 实例的 children 中（递归模板实例化）
- tagDef 的 `_ownerId` 始终为 `{workspaceId}_SCHEMA`

### 删除标签级联清理 — 目标规格（未实现）

- 目标行为（未来）：
  - trashNode(tagDefId) 时自动级联
  - 遍历所有节点，移除 SYS_A13 绑定 tuple
  - 移除模板来源的字段 tuple（`_sourceId` 匹配）
  - tagDef 本身移到 Trash
- 当前行为（2026-02）：`trashNode` 仅将 tagDef 移入 Trash，不自动清理现有引用链路

### Show as Checkbox — 已实现

**三态模型**（`_done` 编码）:

| `_done` 值 | 状态 | 视觉 |
|------------|------|------|
| `undefined` | 无 checkbox | 正常文本，不显示 checkbox |
| `0` | Undone | 空 checkbox，正常文本 |
| `> 0` (timestamp) | Done | 绿色勾选，dimmed 文本（无删除线） |

`_done = 0` 是哨兵值：epoch-zero 不是合法完成时间，安全表达"有 checkbox 但未完成"。

**可见性规则**:
- tagDef 配置中 SYS_A55 = SYS_V03 → 被该标签标记的节点自动显示 checkbox（tag-driven）
- `_done !== undefined` → 显示 checkbox（manual，通过 Cmd+Enter 添加）

**布局**: checkbox 位于 bullet 和文本之间（`[chevron][bullet][checkbox][text]`），不替换 bullet

**Click 行为**（点击 checkbox）:
- 仅 toggle undone ↔ done，永远不移除 checkbox
- Tag-driven: done → `_done=undefined`（tag 保持 checkbox 可见），undone → `_done=Date.now()`
- Manual: done → `_done=0`（保留 checkbox），undone → `_done=Date.now()`

**Cmd+Enter 行为**:
- Manual 节点: 三态循环 No → Undone → Done → No（`undefined → 0 → timestamp → undefined`）
- Tag-driven 节点: 二态 toggle undone ↔ done（tag 始终保持 checkbox 可见）

**Done 视觉**: `text-foreground/50`（dimmed，无删除线）

**未实现**:
- 批量操作（需多选功能）

### Done State Mapping — 已实现（嵌套多值模型）

**数据模型**（嵌套 tuple 树）:

```
tagDef.children:
  Tuple_A [NDX_A06, SYS_V.YES]                            ← 开关（visibleWhen: Show checkbox = YES）
    Tuple_A.children (嵌套):
      Tuple [NDX_A07, attrDefId, optionId]                 ← checked 映射（可多个）
      Tuple [NDX_A08, attrDefId, optionId]                 ← unchecked 映射（可多个）
```

- `NDX_A06` = `SYS_A.DONE_STATE_MAPPING` — 独立 toggle（YES/NO），NDX_A07/A08 作为其**嵌套子节点**
- `NDX_A07` = `SYS_A.DONE_MAP_CHECKED` — 每个 tuple = 一个 checked 映射
- `NDX_A08` = `SYS_A.DONE_MAP_UNCHECKED` — 每个 tuple = 一个 unchecked 映射
- NDX_A06 tuple 的 `children` = `[NDX_A06, SYS_V.YES, nestedCheckedId, nestedUncheckedId, ...]`（前两个是 key+value，后续是嵌套子节点 ID）
- NDX_A07/A08 的 `_ownerId` = NDX_A06 实例 ID（嵌套归属）
- 同一 key 可有**多个** tuple → 多值（如 Status→Done 和 Status→Cancelled 都映射为 checked）
- 按 attrDefId 分组为 `DoneStateMapping { checkedOptionIds[], uncheckedOptionIds[] }`
- 条件可见性: NDX_A06 仅在 SYS_A55=YES 时可见；NDX_A07/A08 嵌套可见性由树结构决定（toggle ON 时展开）
- 配置页缩进渲染: NDX_A07/A08 相对 NDX_A06 缩进 28px（depth=1）
- **UI 控件**: "Map checked to" / "Map unchecked to" 的 value 使用普通 outliner（`FieldValueOutliner`）。用户通过 `>` 选择字段，并在该字段 value 中设置对应 option。
- **配置项排序**: Color → Extends → Show checkbox → Done mapping → Map checked → Map unchecked → Default content → Default child supertag

**向后兼容**: 旧格式 `[NDX_A06, attrDefId, checkedOptionId, uncheckedOptionId?]`（children.length >= 3）仍可读取。

**正向映射**（checkbox → Options field）:
- `toggleNodeDone` / `cycleNodeCheckbox` 计算 newDone 后，调用 `resolveForwardDoneMapping` 获取要更新的字段
- isDone=true → 每个 mapping 的 `checkedOptionIds[0]`（取第一个）
- isDone=false → 每个 mapping 的 `uncheckedOptionIds[0]`
- 在同一个 `set()` 调用内同时更新 `_done` 和 Tuple.children 中的 option 值

**反向映射**（Options field → checkbox）:
- `setOptionsFieldValue` / `autoCollectOption` 设置 option 值后，调用 `resolveReverseDoneMapping`
- `selectFieldOption`（UI 路径，从 tupleId 反查内容节点和 attrDefId）— 用于 OutlinerItem inline picker 和 TrailingInput option 选择
- newOptionId ∈ 任一 mapping 的 `checkedOptionIds` → `{ newDone: true }`
- newOptionId ∈ 任一 mapping 的 `uncheckedOptionIds` → `{ newDone: false }`
- 在同一个 `set()` 调用内更新 `_done`

**无限循环防护**: 正向和反向都在各自的 `set()` 内完成，不会互相触发 store action。

**继承支持**: Done state mapping 沿 Extend 链继承（子标签自动继承父标签的映射配置）。

**Seed data**: `tagDef_task` 预配置 toggle=YES + `NDX_A07 → [attrDef_status, opt_done]` + `NDX_A08 → [attrDef_status, opt_todo]`

### Default Child Supertag — 已实现

- tagDef 配置中设置 SYS_A14 = 另一个 tagDefId（通过 tag_picker 控件选择）
- 当被该标签标记的节点创建子节点（`createChild`/`createSibling`）时，子节点自动应用指定的标签
- 例如：`#Project` 设 Default Child = `#Task` → Project 下新建子节点自动变成 Task
- 多标签场景：父节点有多个标签各自配了不同的 default child → 全部应用到新子节点
- 无标签/无 SYS_A14 配置 → 不触发自动标签（安全降级）
- 实现：`resolveChildSupertags(entities, parentId)` 遍历父节点所有标签的 SYS_A14 配置，`createChild`/`createSibling` 在 optimistic set 后 fire-and-forget 调用 `applyTag`

### 标签继承 / Extend — Phase 1 已实现

> Extend 是 Web Clipping (#30) 的前置依赖：`#web_clip` 需要 `#article`/`#video`/`#tweet` extend 它。
> 以下行为规格基于 2026-02-15 对 Tana 官方文档的交叉验证。

**核心概念**: 子标签（child tag）"extends" 父标签（parent tag），继承父标签的 **全部模板内容**（字段 + 普通节点），并可添加自己的额外内容。

**Phase 1 已实现（2026-02-15）**:
- 数据模型：`NDX_A05` (EXTENDS) 属性绑定，存储在 tagDef meta 中作为 `Tuple [NDX_A05, parentTagDefId]`
- `applyTag(childTag)` 沿 Extend 链收集所有祖先字段模板，依次实例化到目标节点
- 字段按 attrDef ID 去重（同一 attrDef 跨继承链只实例化一次）
- `removeTag(childTag)` 清理继承链上所有模板来源的字段
- 配置页上 "Extends" 显示为 tag_picker 控件（与 Default child supertag 同类型）
- 支持多级继承（grandparent → parent → child）和循环引用防护
- Seed data 包含 `#Dev Task` extends `#Task` 的测试示例

**Phase 1.1 已实现（2026-02-15，2026-02-20 更新）— 配置页颜色继承**:
- 子标签配置页的 "Default content" 区域合并显示继承模板 + 自有模板
- 每个模板项（字段/节点）的图标和 bullet 颜色标识所属 tagDef
- 继承自父标签的项 → 父标签颜色，子标签自有的项 → 子标签颜色
- **颜色始终显示**（不论是否有 Extend 关系）— ConfigOutliner 对所有项传入 ownerTagDef 颜色
- 颜色来自 `resolveTagColor(tagDefId)`: SYS_A11 配置 → 命名色; 无配置 → 确定性哈希 fallback
- fieldDef 节点显示**结构化图标**（由 `resolveNodeStructuralIcon` 根据 fieldType 选择图标），图标颜色 = ownerTagDef 颜色

**Phase 2 待实现**:
- 父标签模板变更后自动传播到所有子标签实例（无需手动同步）
- 配置页中继承字段标记为"来自 #parent_tag"（锁定/不可编辑）
- 多态搜索：搜索父标签时自动返回所有子标签的实例

**继承范围**:
- 继承的不仅是字段（field tuples），还包括父标签 default content 中的**普通节点**（Phase 2）
- 父标签模板变更后自动传播到所有子标签实例（Phase 2）
- 支持多重继承（一个标签可以 extend 多个父标签）— 数据模型支持，UI 待完善

**继承约束**:
- 继承来的内容（字段和节点）不可移动、不可删除（Phase 2 UI）
- 但可以**覆写默认值**（如修改字段的默认选项）
- 子标签可以在继承内容之外添加自己的字段和节点

**字段身份规则**:
- 字段按 **attrDef 节点 ID** 识别身份，不按名称
- 父子标签中同一个 attrDef ID 的字段 → 去重，只实例化一次（祖先优先）
- 不同 attrDef ID 但同名的字段 → 两个都显示

**多态搜索**（Phase 2）:
- 搜索父标签时，自动返回所有子标签的实例
- 例如：搜索 `#web_clip` 会返回 `#article`、`#video`、`#tweet` 的所有节点

**Tana 使用模式参考**:
- `#todo` → `#dev task` / `#design task` / `#bug`
- `#meeting` → `#onboarding` / `#followup`
- `#person` → `#candidate` / `#employee`
- `#web_clip` → `#article` / `#video` / `#tweet`（Nodex 目标）

**数据模型**:
```
tagDef_article
  meta:
    - tuple [SYS_A13, SYS_T01]           ← 被 SUPERTAG 系统标签标记
    - tuple [NDX_A05, tagDef_webclip]     ← Extend 绑定（Nodex 自定义属性）
  children:
    - tuple [NDX_A05, tagDef_webclip]     ← config tuple (tag_picker 控件)
    - (inherited from tagDef_webclip)      ← 运行时展开，不物理复制
    - tuple [attrDef_article_type]         ← 子标签自有字段
```

**applyTag 行为**:
- `applyTag(nodeId, tagDef_article)` 执行：
  1. `getExtendsChain()` 沿 Extend 链收集所有祖先标签 ID（ancestor-first 顺序）
  2. 依次实例化 grandparent → parent → child 的所有字段 tuple
  3. 按 attrDef ID 去重（祖先先到先得）
  4. 在 meta 中只绑定子标签（`SYS_A13 → tagDef_article`）

**配置页展示**（Phase 1.1 已实现）:
- 子标签配置页中，继承模板项通过**颜色**区分所属（父标签颜色 vs 子标签颜色）
- 继承字段不可拖拽排序，不显示删除按钮（Phase 2 UI 锁定）

### Supertag Bullet 颜色 — 已实现（2026-02-20）

**视觉规则**（基于节点的 `node.tags` 数组）:

| 标签数量 | Bullet 样式 |
|---------|------------|
| 0 个 | 灰色实心点（默认） |
| 1 个 | 该 tagDef 的纯色实心点 |
| 2+ 个 | conic-gradient 饼图，每段等分，颜色对应各 tagDef |

**实现**:
- `resolveNodeBulletColors(nodeId): string[]` — 读取 `node.tags`，返回对应颜色数组
- `BulletChevron.buildBulletStyle(colors)` — 1 色返回 `backgroundColor`，多色构建 `conic-gradient`
- `OutlinerItem` 计算 `effectiveBulletColors = bulletColors ?? tagBulletColors`（父组件可覆盖）
- ConfigOutliner 中 fieldDef/content 模板项传入 `bulletColors=[ownerColor]`（ownerTagDef 颜色）

**fieldDef 图标**（结构化图标）:
- `resolveNodeStructuralIcon(node): AppIcon | null` — `node.type === 'fieldDef'` 时返回对应字段类型图标
- 图标颜色 = `bulletColors?.[0] ?? var(--color-foreground-secondary)`（继承 ownerTagDef 颜色）
- tagDef 配置页中所有模板字段（fieldDef 节点）显示字段类型图标 + ownerTagDef 颜色

### 字段排序规则 — 已实现（2026-02-20）

打了多个 supertag 的节点，子节点显示顺序：

1. **Supertag 字段** — 按 `node.tags` 顺序分桶，每个 tagDef 的 fieldEntry 按桶顺序连续输出
2. **其他字段**（fieldEntry 的 fieldDef 父节点不在 tagIds 中，如手动添加的字段）— 在 supertag 字段之后
3. **Content 节点**（无 `type` 的普通内容节点）— 最后

**目的**: 让 supertag 注入的字段始终出现在节点内容顶部，与 Tana 一致的字段视觉层级。

**实现**: `visibleChildren` useMemo 先 `Map<tagDefId, Child[]>` 分桶，再 `for (tagId of tagIds)` 有序输出，最后追加 content 节点。

### Base Type — 参考（暂不实现）

> Tana 的 Building Blocks 区域包含 Base Type 和 Extend 两个功能。Base Type 主要服务于 AI，
> 帮助 AI 识别对象语义类型（不论用户给标签取什么名字）。Nodex 的 AI 不一定需要此机制，仅作参考记录。

**Tana Base Type 列表**（13 种，对应 SYS_T98–SYS_T125）:

| Base Type | 语义 |
|-----------|------|
| Meeting | 会议 |
| Task | 任务 |
| Project | 项目 |
| Person | 人物 |
| Organization | 组织 |
| Product | 产品 |
| Location | 地点 |
| Event | 事件 |
| Creative Work | 创意作品 |
| Concept | 概念 |
| Metric | 指标 |
| Tool | 工具 |
| Custom Type | 自定义（兜底） |

**作用**: 纯 AI 辅助——Tana AI 根据 Base Type 理解对象语义。例如 `#collaborator` 设 Base Type = Person，AI 就知道这是一个人。

**数据模型**: 通过 meta Tuple `[SYS_A_BASE_TYPE, SYS_T98..SYS_T125]` 绑定。

**Nodex 决策**: 暂不实现。如果未来 Nodex AI 需要对象语义识别，可按需引入。Extend 功能不依赖 Base Type。

### Convert to Supertag — 未实现

- 选中普通节点 → Cmd+K → "Convert to supertag"
- 子字段和子节点自动转为模板项
- 节点变为 tagDef，移入 Schema

### 批量标签操作 — 未实现

- 多选节点后同时 add/remove tag
- 批量应用时每个节点走标准 applyTag 流程

### Pinned Fields — 未实现

- 在 supertag 配置中标记字段为 pinned
- Pinned 字段：置顶显示在节点实例顶部（带 border）+ filter toolbar 优先展示
- 多标签节点中，pinned 字段跨所有标签统一显示

### Optional Fields — 未实现

- 在 supertag 配置中标记为 optional 的字段
- 不随 applyTag 自动添加，以建议按钮呈现
- 同一字段在不同节点添加两次 → 自动转为 optional
- 右键模板字段 → "Make optional" 降级

### 标签页 — 未实现

- 点击 supertag → 除了配置页，还可以查看"所有打该标签的节点"
- 本质上是一个预设搜索（`#tagName` 作为 query）
- 支持 Table / List / Cards 视图切换（依赖 Phase 2 视图系统）

### Title Expression — 未实现

- tagDef "Advanced options" 中配置 "Build title from fields"
- 格式: `${field name}` 自动组合标题
- 支持: 固定文本、`${name}`、截断 `${field|30…}`、可选 `${field|?}`、系统变量 `${cdate}` / `${mdate}`

### 模板实例分离 — 未实现

- 编辑模板实例后与模板脱钩，后续模板修改不反映到已编辑实例
- Hard delete (Cmd+Shift+Backspace) 可从模板刷新

### Merge Tags — 未实现

- 合并重复标签定义，所有引用指向合并后的 tagDef

## 与 Tana 配置页的差异分析

> 基于 Tana `#card` 配置页截图 (2026-02-12)

### 已实现

| Tana 功能 | Nodex 对应 |
|-----------|-----------|
| 标签名（可编辑）| PanelTitle |
| Show checkbox toggle | FieldList config row (SYS_A55) + 运行时 checkbox 渲染 + Cmd+Enter toggle |
| Default content 区域（字段 + 普通节点）| OutlinerView with showTemplateTuples |
| Schema 面包屑 | Breadcrumb SCHEMA container |
| Delete 按钮 | "Delete tag" button |

### 待实现（后续 Phase）

| Tana 功能 | 说明 | 优先级 |
|-----------|------|--------|
| ~~**Color Swatch Selector**~~ ✅ | 已实现：10 色 swatch（含灰色）+ `NDX_D02` COLOR 数据类型 + `resolveTagColor` 优先级（SYS_T*→gray, SYS_A11→命名色, fallback→hash）+ ColorSwatchPicker 组件 | ✅ |
| **"Add description"** 字段 | 标签描述文本，显示在标签名下方 | P3 |
| **Building blocks** 折叠面板 | Tag 继承 / Extend Phase 2（传播 + 继承标记 UI） | P2 |
| **Optional fields** 独立区域 | 与 Default content 分离的可选字段区 | P3 |
| **"New field" / "Insert existing field" 按钮** | Default content 区域底部的快捷操作 | P2 |
| **"Used N times"** 统计 | 底部使用次数展示 | P3 |
| **AI and Commands** 面板 | Nodex 不需要（Tana 特有） | — |
| **Voice chat** 面板 | Nodex 不需要（Tana 特有） | — |
| **Advanced options** 折叠面板 | 包含 build title, shortcuts 等高级配置 | P3 |
| **折叠面板 UI 结构** | Tana 用折叠卡片组织配置区，Nodex 当前是扁平列表 | P3 |
| **applyTag 深度克隆内容节点** | 当前 shallow clone（顶层），Tana 递归克隆含子节点 | P3 |

## 决策记录

| 日期 | 决策 | 原因 |
|------|------|------|
| 2026-01-28 | 标签配置页复用 NodePanel（非定制 UI） | 与 Tana 一致，系统标签模板模式 |
| 2026-02-05 | AttrDef typeChoice key 使用 SYS_A02 | 与当前实现和系统常量一致 |
| 2026-02-06 | 标签模板字段通过 _sourceId 追踪来源 | 区分"模板自动添加"和"手动添加"的字段 |
| 2026-02-12 | removeTag 同时清理模板来源的字段 tuple | 与 Tana 一致（移除标签不保留模板字段数据） |
| 2026-02-12 | 配置页分 FieldList (config) + ConfigOutliner (default content) | 配置项用 FieldList 渲染，模板内容用 ConfigOutliner |
| 2026-02-12 | Default content 支持字段 tuple 和普通内容节点混合 | 与 Tana 一致（template 不仅有 field） |
| 2026-02-12 | trashNode(tagDef) 级联清理所有引用节点（目标规格） | 作为未来目标行为，避免遗留悬挂引用 |
| 2026-02-12 | 对比 Tana 官方文档补全遗漏功能清单 | 记录 Pinned/Optional/Convert/Batch/TitleExpr 等 |
| 2026-02-15 | Extend 继承范围 = 全部模板内容（字段 + 普通节点） | Tana 官方文档验证：template objects 整体继承 |
| 2026-02-15 | 字段身份按 attrDef ID 匹配，非名称 | 同 ID → 合并，不同 ID 同名 → 两个都显示 |
| 2026-02-15 | 父标签模板变更自动传播到子标签实例 | Tana 文档明确说明 auto-propagation |
| 2026-02-15 | Extend 提升为 P1（原 P3） | 阻塞 #30 Web Clipping（`#web_clip` → `#article` 等） |
| 2026-02-15 | Base Type 暂不实现，仅记录参考 | 主要服务 AI 语义识别，Nodex AI 不一定需要 |
| 2026-02-15 | Extend Phase 1 使用 NDX_A05（非 SYS_A*） | Tana 的 Extend 机制未被逆向确认，使用 Nodex 自有命名空间 |
| 2026-02-15 | Extend 绑定存储在 meta 和 config tuple 双写 | meta 用于 `getExtendsChain()` 遍历，config tuple 用于配置页 tag_picker 渲染 |
| 2026-02-15 | 字段去重按 attrDef ID，祖先优先 | 同一 attrDef 跨继承链只实例化一次，`_sourceId` 指向最早祖先的模板 |
| 2026-02-15 | 配置页继承项通过 owning tagDef 颜色区分 | OOP 继承视觉：父标签项 = 父色，子标签项 = 子色，无 extend 时无色 |
| 2026-02-16 | Done state mapping 使用 NDX_A06 Tuple 存储在 tagDef.children | 遵循现有 config tuple 模式，与 SYS_T01 模板一致 |
| 2026-02-16 | 正向/反向映射在同一 set() 中原子完成 | 避免无限循环，无需额外防护标志 |
| 2026-02-16 | Done state mapping 沿 Extend 链继承 | 子标签自动继承父标签的映射配置 |
| 2026-02-16 | 新增 `selectFieldOption` store action 用于 UI 路径反向映射 | UI 使用 `addReference` 而非 `setOptionsFieldValue`，需独立路径从 assocDataId 反查 |
| 2026-02-16 | Done State Mapping 升级为多值模型（NDX_A06 toggle + NDX_A07/A08 multi-tuple） | 支持多个 checked/unchecked option，匹配 Tana 实际行为 |
| 2026-02-16 | NDX_A06 改为 toggle，NDX_A07/A08 新增用于 checked/unchecked 映射 | 保持旧格式向后兼容（children.length >= 3 自动识别） |
| 2026-02-16 | ConfigFieldDef 新增 visibleWhen 条件可见性 | Done state mapping toggle 仅在 Show checkbox=YES 时可见 |
| 2026-02-16 | NDX_A07/A08 从扁平同级重构为 NDX_A06 的嵌套子节点 | 遵循"一切皆节点"原则，嵌套关系由节点树决定而非渲染层 visibleWhen 元数据 |
| 2026-02-16 | applyTag 递归实例化嵌套 config template | SYS_T01 模板中 NDX_A07/A08 作为 NDX_A06 的嵌套模板，applyTag 自动递归创建对应实例 |
| 2026-02-16 | removeTag 级联清理嵌套 config 子节点 | 删除 NDX_A06 实例时同时清理其 NDX_A07/A08 嵌套子节点，防止孤儿实体 |
| 2026-02-16 | FieldEntry 新增 depth 属性支持配置页缩进渲染 | NDX_A06 depth=0，NDX_A07/A08 depth=1，FieldList 通过 paddingLeft 渲染层级 |
| 2026-02-16 | NDX_A07/A08 控件从 tag_picker 改为 done_map_entries | "Map checked/unchecked to" value 使用普通 outliner，支持 `>` 选字段后设置 option 值 |
| 2026-02-16 | TagDef 配置项重排序 | Color → Extends → Show checkbox → Done mapping → Map checked/unchecked → Default content → Default child supertag |
| 2026-02-16 | use-node-fields 聚合 NDX_A07/A08 为两个 FieldEntry | 不再逐个嵌套 child 发射，而是聚合为 "Map checked to" + "Map unchecked to" 两个条目，组件内部扫描 toggle children |
| 2026-02-16 | 统一配置字段架构（issue #20 重构） | Config fields 使用真实 attrDef 实体节点作为 key，values 存储在 Tuple.children 中（与用户字段完全统一） |
| 2026-02-16 | 删除 5 个专用 config 组件 | ConfigTagPicker/ConfigSelect/ConfigNumberInput/FieldTypePicker/ConfigToggle → FieldValueOutliner 统一渲染 |
| 2026-02-16 | ~~applyTag 统一创建 AssociatedData~~ 已简化 | config 和 user field tuple 值直接存 Tuple.children，无需 AssociatedData |
| 2026-02-16 | removeField 增加系统配置保护 | tuple key 为 SYS_*/NDX_* 前缀时跳过删除，防止用户误删系统配置字段 |
| 2026-02-16 | ConfigOutliner 使用 isSystemConfig 标志 | 不再用 dataType 前缀判断，改用 FieldEntry.isSystemConfig 语义标志区分系统配置与用户模板 |
| 2026-02-16 | DoneMappingEntries 读取 Tuple.children | 统一模型下映射条目直接从 Tuple.children 读取 |
| 2026-02-16 | Color Swatch 预置 10 色（含灰色），不开放自由取色 | 设计系统一致性 + 避免用户选择不协调颜色；灰色保留给系统预置 supertag（SYS_T*） |
| 2026-02-16 | Color 使用新增 NDX_D* 数据类型，不复用 Options | Color 是固定色板索引，非用户可编辑选项列表，语义不同 |
| 2026-02-16 | getTagColor() 优先级：SYS_A11 配置值 → 确定性哈希 fallback | 向后兼容：未配置颜色的标签保持现有哈希行为 |
| 2026-02-16 | Default Child Supertag 在 optimistic set 后 fire-and-forget 调用 applyTag | UI 立即显示标签，不阻塞 createChild 返回 |
| 2026-02-16 | resolveChildSupertags 遍历父节点所有标签读取 SYS_A14 | 多标签场景各自独立的 default child 全部应用，结果去重 |
| 2026-02-16 | Color Swatch 实现为 ColorSwatchPicker 组件 | 10 个圆点，click 选择/toggle 清除，存储命名色 key (e.g. "violet") |
| 2026-02-16 | 所有颜色消费者统一切换到 resolveTagColor | TagBadge/OutlinerItem/NodePicker/ConfigOutliner 四处统一，需要 entities 参数 |
| 2026-02-16 | NDX_D02 (COLOR) 注册为新数据类型 | FieldValueOutliner 新增 COLOR 分支渲染 ColorSwatchPicker |
| 2026-02-18 | 消除 Metanode 间接层，用 node.meta TEXT[] 替代 | PostgreSQL 原生数组替代 Firebase 容器节点 |
| 2026-02-18 | 消除 AssociatedData，值直接存 Tuple.children[1:] | Tuple 本身就是列表，无需额外容器 |
| 2026-02-20 | 所有 store mutation action 末尾必须调用 `loroDoc.commitDoc()` | Loro `doc.subscribe` 仅在 `doc.commit()` 后触发，缺失会导致 `_version` 不更新、React UI 冻结；系统性修复 22 个 functions（见 `docs/LESSONS.md` § Loro CRDT：mutations 必须 commitDoc()） |
| 2026-02-20 | Bullet 颜色 = supertag 成员身份（颜色语义层），图标/形状 = NodeType（结构语义层） | 两层分离：颜色传达"打了哪些标签"，图标传达"这个节点是什么结构类型"，互不耦合 |
| 2026-02-20 | 多标签 conic-gradient 饼图（等分色段），而非混色/叠加 | 最多 5 色，等分饼图在小 bullet（5px）上可清晰区分；叠加色会产生无意义混色 |
| 2026-02-20 | ConfigOutliner ownerColor 始终传入（不再限定于有 Extend 关系时） | 所有模板项（自有 + 继承）都属于某个 tagDef，始终显示颜色更一致；之前的"无 Extend 不显色"逻辑是初始保守设计，已无必要 |
| 2026-02-20 | 字段排序：supertag 字段按 tagIds 顺序排在最前，content 节点排在最后 | 与 Tana 一致：字段作为 supertag 的语义元数据，优先于用户自由内容显示 |

## 当前状态

- [x] `#` 触发 TagSelector
- [x] 应用标签（node.meta + SYS_A13 Tuple 链路）
- [x] TagBadge 显示 + 彩色哈希
- [x] TagBadge 点击导航到 tagDef
- [x] TagBadge 右键菜单（Remove / Configure tag）
- [x] 多标签支持
- [x] 移除标签（hover × + 清理模板字段）
- [x] 标签模板自动填充字段（applyTag）
- [x] 标签配置页（SYS_T01 渲染 + FieldList + OutlinerView）
- [x] createTagDef 自动 applyTag(SYS_T01)
- [x] Schema 面包屑导航
- [x] Delete tag / Delete field 按钮（当前行为为 trashNode）
- [ ] trashNode(tagDef) 级联清理（移除所有标签绑定与模板来源字段）
- [ ] trashNode(attrDef) 级联清理（移除所有引用该字段的 tuple）
- [x] applyTag 克隆 default content 中的普通节点（shallow clone, `_sourceId` 追踪来源）
- [x] Show as Checkbox（toggle + done visual + Cmd+Enter）
- [x] Done state mapping（checkbox ↔ Options 字段双向映射, NDX_A06）
- [x] Default Child Supertag（tag_picker 配置 + createChild/createSibling 自动应用）
- [x] Color Swatch Selector（10 色预置色板 + ColorSwatchPicker + resolveTagColor）
- [ ] Pinned fields
- [ ] Optional fields
- [x] 标签继承 / Extend Phase 1（applyTag/removeTag 字段继承 + config UI）
- [x] Extend Phase 1.1 — 配置页颜色继承（owning tagDef 颜色标识模板项归属）
- [x] Supertag bullet 彩色渲染 — 0 标签灰点 / 1 标签纯色 / 多标签 conic-gradient 饼图
- [x] 大纲节点字段顺序 — supertag 字段按标签顺序排在 content 子节点之前
- [ ] Extend Phase 2（父变更传播 + 配置页继承项锁定 + 多态搜索）
- [ ] Convert to supertag
- [ ] 批量标签操作
- [ ] 标签页（搜索 + 视图）
- [ ] Title expression
- [ ] 模板实例分离
- [ ] Merge tags
- [ ] "New field" / "Insert existing field" 按钮

## 与 Tana 的已知差异

- Tana 配置页用折叠卡片（Building blocks / Content template / AI / Advanced），Nodex 用扁平 FieldList + ConfigOutliner
- Tana 配置字段可能使用专用 UI 控件，Nodex 统一使用 FieldValueOutliner 渲染所有字段类型（config 和 user 共享同一套渲染管线）
- Tana TagBadge 有自定义颜色，Nodex 用 ID 哈希确定色系
- Tana 支持 tag 内嵌 description（在标签名下方显示），Nodex 暂不支持
- Tana 的"标签页"是完整的 Search Node + View 组合，Nodex 需等 Phase 2
- Tana applyTag 深度克隆 default content（含子节点），Nodex 当前为 shallow clone（仅顶层节点，子节点不递归）
- Tana 删除 tag 后节点显示 trash icon，Nodex 直接清除引用
- Tana 有 Pinned/Optional fields 两级机制，Nodex 当前所有模板字段平等
- Tana 支持 "Convert to supertag" 快捷转换，Nodex 暂不支持
- Tana Extend 支持多重继承 + 自动传播父标签变更，Nodex Phase 1 支持继承链字段实例化但不支持自动传播
- Tana Base Type（13 种语义类型）服务于 AI，Nodex 暂不需要
- Tana 多标签节点 bullet 颜色：Nodex 用 conic-gradient 饼图，Tana 具体实现未逆向确认
