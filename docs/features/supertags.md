# Feature: Supertags

> Phase 1.2 | 配置页基础已实现，高级功能待完善 | [GitHub Issue #20](https://github.com/relixiaobo/nodex/issues/20)

## 行为规格

### 标签应用

- 节点编辑器中输入 `#` 触发 TagSelector 搜索面板
- 搜索面板列出所有 tagDef 节点（按名称匹配）
- 可选择已有标签或创建新标签（输入不存在的名称 → 新建 tagDef）
- 选择标签后：
  - 节点名称右侧出现彩色 TagBadge（`#TagName`，pill 样式）
  - 底层创建 Metanode → Tuple[SYS_A13, tagDefId] 链路
  - 标签模板定义的字段自动添加到节点 children 中（通过 applyTag）
  - 每个字段 tuple 的 `_sourceId` 指向 tagDef 中的模板 tuple
- 一个节点可以有多个标签（多个 TagBadge 依次排列）

### 移除标签

- Hover TagBadge 时 `#` 变为 `×` 关闭按钮
- 点击 `×` 移除标签：
  - 删除 Metanode 中对应的 SYS_A13 Tuple
  - **同时清理**由该标签模板创建的字段 tuple（通过 `_sourceId` 匹配模板 tuple）
  - 清理对应的 associatedData 和 associationMap 条目
- Metanode 本身保留（可能有其他标签绑定）

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
  2. **FieldList**: 系统配置项（来自 SYS_T01 模板）
     - Show as checkbox (toggle) — SYS_A55
     - Default child supertag (tag_picker, 当前 placeholder) — SYS_A14
     - Color (color_picker, 当前 placeholder) — SYS_A11
  3. **"Default content" 标签 + OutlinerView**: tagDef.children 中的用户内容
     - 模板字段 tuple（key 为 attrDefId）→ 渲染为 FieldRow
     - 普通内容节点（无 docType）→ 渲染为 OutlinerItem
     - 支持 TrailingInput 在模板中新建内容
  4. **Delete tag** 按钮

### createTagDef 自动配置

- 新建 tagDef 后自动调用 `applyTag(id, SYS_T01)`
- 创建 metanode + SYS_A13 tag binding + 3 个 config tuple（checkbox/childtag/color）
- tagDef 的 `_ownerId` 始终为 `{workspaceId}_SCHEMA`

### 删除标签级联清理 — 目标规格（未实现）

- 目标行为（未来）：
  - trashNode(tagDefId) 时自动级联
  - 遍历所有节点，移除 SYS_A13 绑定 tuple
  - 移除模板来源的字段 tuple（`_sourceId` 匹配）+ associatedData
  - tagDef 本身移到 Trash
- 当前行为（2026-02）：`trashNode` 仅将 tagDef 移入 Trash，不自动清理现有引用链路

### Show as Checkbox — 未实现

- tagDef 配置中开启 "Show as Checkbox" → SYS_A55 = SYS_V03
- 被该标签标记的节点在 bullet 位置显示 checkbox
- 勾选 checkbox → 设置节点 `props._done = Date.now()`（毫秒时间戳）
- 取消勾选 → 清空节点 `props._done`
- **Done state mapping**（Tana 高级）: checkbox 状态可双向映射到特定字段值

### Default Child Supertag — 未实现

- tagDef 配置中设置 SYS_A14 = 另一个 tagDefId
- 当被该标签标记的节点创建子节点时，子节点自动应用指定的标签
- 例如：`#Project` 设 Default Child = `#Task` → Project 下新建子节点自动变成 Task

### 标签继承 / Extend — 未实现

- tagDef 可以"继承"另一个 tagDef（Tana "Building blocks" 功能）
- 子标签包含父标签的所有模板字段 + 自己的额外字段
- 应用子标签 = 同时应用父标签的所有字段
- **继承约束**: 继承来的内容不可移动/删除，但可添加字段和修改默认值

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
| Show checkbox toggle | FieldList config row (SYS_A55) |
| Default content 区域（字段 + 普通节点）| OutlinerView with showTemplateTuples |
| Schema 面包屑 | Breadcrumb SCHEMA container |
| Delete 按钮 | "Delete tag" button |

### 待实现（后续 Phase）

| Tana 功能 | 说明 | 优先级 |
|-----------|------|--------|
| **Color picker** (色板选择) | 当前 placeholder "Default"，需实现真实色板 swatches | P2 |
| **"Add description"** 字段 | 标签描述文本，显示在标签名下方 | P3 |
| **Building blocks** 折叠面板 | Tag 继承 / Extend 功能 | P3 |
| **Optional fields** 独立区域 | 与 Default content 分离的可选字段区 | P3 |
| **"New field" / "Insert existing field" 按钮** | Default content 区域底部的快捷操作 | P2 |
| **"Used N times"** 统计 | 底部使用次数展示 | P3 |
| **AI and Commands** 面板 | Nodex 不需要（Tana 特有） | — |
| **Voice chat** 面板 | Nodex 不需要（Tana 特有） | — |
| **Advanced options** 折叠面板 | 包含 build title, shortcuts 等高级配置 | P3 |
| **折叠面板 UI 结构** | Tana 用折叠卡片组织配置区，Nodex 当前是扁平列表 | P3 |
| **applyTag 复制普通内容节点** | 当前 applyTag 只复制 field tuples，不复制 default content 中的普通节点 | P2 |

## 决策记录

| 日期 | 决策 | 原因 |
|------|------|------|
| 2026-01-28 | 标签配置页复用 NodePanel（非定制 UI） | 与 Tana 一致，系统标签模板模式 |
| 2026-02-05 | AttrDef typeChoice key 使用 SYS_A02 | 与当前实现和系统常量一致 |
| 2026-02-06 | 标签模板字段通过 _sourceId 追踪来源 | 区分"模板自动添加"和"手动添加"的字段 |
| 2026-02-12 | removeTag 同时清理模板来源的字段 tuple | 与 Tana 一致（移除标签不保留模板字段数据） |
| 2026-02-12 | 配置页分 FieldList (config) + OutlinerView (default content) | 配置项用特殊控件，模板内容用标准 outliner |
| 2026-02-12 | Default content 支持字段 tuple 和普通内容节点混合 | 与 Tana 一致（template 不仅有 field） |
| 2026-02-12 | trashNode(tagDef) 级联清理所有引用节点（目标规格） | 作为未来目标行为，避免遗留悬挂引用 |
| 2026-02-12 | 对比 Tana 官方文档补全遗漏功能清单 | 记录 Pinned/Optional/Convert/Batch/TitleExpr 等 |

## 当前状态

- [x] `#` 触发 TagSelector
- [x] 应用标签（Metanode + SYS_A13 Tuple 链路）
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
- [ ] applyTag 复制 default content 中的普通节点
- [ ] Show as Checkbox + Done state mapping
- [ ] Default Child Supertag（真实 tag_picker）
- [ ] Color picker（真实色板）
- [ ] Pinned fields
- [ ] Optional fields
- [ ] 标签继承 / Extend
- [ ] Convert to supertag
- [ ] 批量标签操作
- [ ] 标签页（搜索 + 视图）
- [ ] Title expression
- [ ] 模板实例分离
- [ ] Merge tags
- [ ] "New field" / "Insert existing field" 按钮

## 与 Tana 的已知差异

- Tana 配置页用折叠卡片（Building blocks / Content template / AI / Advanced），Nodex 用扁平列表
- Tana TagBadge 有自定义颜色，Nodex 用 ID 哈希确定色系
- Tana 支持 tag 内嵌 description（在标签名下方显示），Nodex 暂不支持
- Tana 的"标签页"是完整的 Search Node + View 组合，Nodex 需等 Phase 2
- Tana applyTag 会复制 default content 中的普通节点到目标节点，Nodex 当前只复制 field tuples
- Tana 删除 tag 后节点显示 trash icon，Nodex 直接清除引用
- Tana 有 Pinned/Optional fields 两级机制，Nodex 当前所有模板字段平等
- Tana 支持 "Convert to supertag" 快捷转换，Nodex 暂不支持
