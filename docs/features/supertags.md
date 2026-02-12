# Feature: Supertags

> Phase 1.2 | 基础已完成，完善功能待实现

## 行为规格

### 标签应用

- 节点编辑器中输入 `#` 触发 TagSelector 搜索面板
- 搜索面板列出所有 tagDef 节点（按名称匹配）
- 可选择已有标签或创建新标签（输入不存在的名称 → 新建 tagDef）
- 选择标签后：
  - 节点名称右侧出现彩色 TagBadge（`#TagName`，pill 样式）
  - 底层创建 Metanode → Tuple[SYS_A13, tagDefId] 链路
  - 标签模板定义的字段自动添加到节点 children 中
- 一个节点可以有多个标签（多个 TagBadge 依次排列）

### 移除标签 — 未实现

- Hover TagBadge 时显示 `×` 关闭按钮
- 点击 `×` 移除标签：
  - 删除 Metanode 中对应的 SYS_A13 Tuple
  - 不删除节点上已有的字段实例（字段数据保留）
- 如果移除的是最后一个标签，Metanode 仍保留（可能有其他 config tuple）

### TagBadge 显示

- 显示在节点名称右侧，编辑器外部
- 格式：`# TagName`，彩色背景 pill
- 点击 TagBadge → navigateTo tagDef 节点（进入标签配置页）
- 多标签时按应用顺序排列

### 标签模板 — 未实现

- tagDef 可以定义"模板字段"（Template Fields）
- 应用标签时，自动为节点创建模板中定义的字段 Tuple
- 字段 Tuple 的 `_sourceId` 指向模板中的源 Tuple（标记为"来自模板"）
- 后续手动添加的字段没有 `_sourceId`

### 标签配置页 — 未实现

- 点击 tagDef 节点（或 TagBadge）→ 进入配置页
- 配置页是标准 NodePanel 渲染被 SYS_T01 (SUPERTAG) 标记的节点
- 配置项（来自 SYS_T01 的模板字段）：
  - **Description**: 标签描述文本
  - **Fields**: 模板字段列表（可添加/删除/排序）
  - **Default Child Supertag**: 新增子节点自动继承的标签
  - **Show as Checkbox**: 启用后节点显示 checkbox（Done 状态映射）
  - **Color**: 标签颜色
  - **Icon**: 标签图标

### Show as Checkbox — 未实现

- tagDef 配置中开启 "Show as Checkbox" → SYS_A55 = SYS_V03
- 被该标签标记的节点在 bullet 位置显示 checkbox
- 勾选 checkbox → 设置节点 `props._done = true`
- 取消勾选 → `props._done = false`
- Done 状态可配合搜索（TODO / DONE 操作符）

### Default Child Supertag — 未实现

- tagDef 配置中设置 SYS_A14 = 另一个 tagDefId
- 当被该标签标记的节点创建子节点时，子节点自动应用指定的标签
- 例如：`#Project` 设 Default Child = `#Task` → Project 下新建子节点自动变成 Task

### 标签继承 / Extend — 未实现

- tagDef 可以"继承"另一个 tagDef
- 子标签包含父标签的所有模板字段 + 自己的额外字段
- 应用子标签 = 同时应用父标签的所有字段

### 标签页 — 未实现

- 点击 supertag → 除了配置页，还可以查看"所有打该标签的节点"
- 本质上是一个预设搜索（`#tagName` 作为 query）
- 支持 Table / List / Cards 视图切换（依赖 Phase 2 视图系统）

## 决策记录

| 日期 | 决策 | 原因 |
|------|------|------|
| 2026-01-28 | 标签配置页复用 NodePanel（非定制 UI） | 与 Tana 一致，系统标签模板模式 |
| 2026-02-05 | tagDef typeChoice key 是 SYS_T06 不是 SYS_A02 | 逆向验证结果 |
| 2026-02-06 | 标签模板字段通过 _sourceId 追踪来源 | 区分"模板自动添加"和"手动添加"的字段 |

## 当前状态

- [x] `#` 触发 TagSelector
- [x] 应用标签（Metanode + SYS_A13 Tuple 链路）
- [x] TagBadge 显示
- [x] TagBadge 点击导航到 tagDef
- [x] 多标签支持
- [ ] 移除标签（hover `×`）
- [ ] 标签模板自动填充字段
- [ ] 标签配置页（SYS_T01 渲染）
- [ ] Show as Checkbox
- [ ] Default Child Supertag
- [ ] 标签继承 / Extend
- [ ] 标签页（搜索 + 视图）

## 与 Tana 的已知差异

- Tana TagBadge 有自定义颜色，Nodex 暂用固定色
- Tana 支持 tag 内嵌 description（在 TagBadge tooltip 中显示），Nodex 暂不支持
- Tana 的"标签页"是完整的 Search Node + View 组合，Nodex 需等 Phase 2
