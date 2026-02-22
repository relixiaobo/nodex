# Tana 反向链接 UI 交互研究

> 研究日期: 2026-02-22 | Agent: nodex-cc-2
> 来源: 用户截图 + Tana 官方文档 + 社区资料

## 1. 整体结构

反向链接 section 位于**节点内容的最底部**（zoom into 某节点后可见），结构如下：

```
[节点内容 / children / fields ...]

── 分隔区域 ──

N references ∨              ← 总计数 + 折叠/展开 chevron

Mentioned in...             ← 分组 1: 普通 @引用
  📂 breadcrumb / path      ← 引用所在位置的面包屑
  • [引用节点内容]           ← 高亮框显示

Appears as [Field] in...    ← 分组 2: 字段值引用（按字段名分组）
  ◎ [引用节点内容] #tag      ← reference bullet + tag badge
  ◎ [引用节点内容] #tag
```

## 2. 引用分组（截图实证 + 文档补充）

### 分组 1: "Mentioned in..."（普通引用）

- **触发条件**: 当前节点被其他节点通过 `@` 引用（树引用 或 内联引用）
- **显示格式**:
  - 小标题 `Mentioned in...`（灰色、较小字号）
  - **面包屑路径**: 显示引用所在节点的完整层级路径（如 `📂 Daily notes / 2026 / Week 08 / Yesterday, Sat, Feb 21`）
  - 面包屑中有文件夹图标前缀，路径用 `/` 分隔
  - **引用节点内容**: 显示在浅色高亮框中（截图中为浅黄色背景 + 左侧竖线），显示引用节点的完整文本
  - 实心圆 bullet（普通节点样式）

### 分组 2: "Appears as [Field Name] in..."（字段值引用）

- **触发条件**: 当前节点被用作某个字段的值（如 Person 节点被用作 Book 的 "Author" 字段值）
- **显示格式**:
  - 小标题 `Appears as [Field Name] in...`（灰色、较小字号），`[Field Name]` 动态替换为实际字段定义名
  - 截图中为 `Appears as From in...`（"From" 是字段名）
  - **引用节点**: 显示为标准 outliner item 行（reference bullet ◎ + 节点文本 + tag badge）
  - 不显示面包屑（因为字段关系已提供足够上下文）
  - Tag badge 显示在行末（如 `# highlight`）

### 分组 3: "Referenced in..."（不同于 Mentioned in）

- 根据官方文档，还有第三类: 来自搜索节点或结构性关系的引用
- 但在常见用例中，主要是前两组

### 潜在分组: "Unlinked mentions"

- 官方文档提到，linked references 下方还有 **"Unlinked mentions"** 区域
- 显示当前节点名称文本在其他地方出现但**未正式链接**的位置
- 每条 unlinked mention 右侧有 **"Link" 按钮**，一键转换为正式引用
- **Nodex 计划**: P3 或更后期实现（需要全文索引支持）

## 3. 引用计数 Badge

### 节点底部（References Section）
- **格式**: `N references ∨`
- N = 所有类型引用的总计数
- 右侧有 chevron（∨/∧）控制展开/折叠

### 行内计数（Inline Badge）
- 每个未聚焦的节点，右侧浮现引用计数数字
- 点击计数数字可展开显示引用列表
- 可通过 Settings > Preferences > "Show Reference Counter" 开关
- **位置**: 节点行右侧，半透明显示

## 4. 展开/折叠行为

### References Section
- **默认折叠**: 首次打开节点时，references section 折叠，仅显示 `N references ∨`
- **点击展开**: 点击 `N references` 或 chevron 展开完整列表
- **记忆**: 展开状态不跨 session 保持（每次 zoom in 重新折叠）
- **全宽**: 展开后使用面板全宽（非窄列约束）

### 内联引用展开
- **Alt/Option-click**: 在引用上 Alt-click 可原地展开引用目标的内容（不导航）
- **Shift+click**: 同上
- **Cmd+Arrow Down**: 同上
- 这是 peek 功能，不是 backlinks 相关

## 5. 交互行为

### 面包屑路径
- 面包屑中每一层级**可点击**，点击后导航到对应层级节点
- 路径用 `/` 分隔，包含图标（文件夹/日历等）

### 引用节点
- **点击**: 导航到引用所在的节点（push panel）
- **展开**: 可展开查看引用节点的 children
- 字段引用项显示 reference bullet（◎ 同心圆）

### LINKS_TO 系统字段
- Tana 提供 `LINKS_TO` 系统字段，可用于 Live Search
- 允许构建自定义的过滤/排序反向链接视图
- **Nodex 计划**: 等 Search Nodes (#23) 实现后再考虑

## 6. 视觉样式总结

| 元素 | 样式 |
|------|------|
| Section 标题 | `N references` + chevron，普通文字大小，可点击 |
| 分组标题 | `Mentioned in...` / `Appears as X in...`，灰色、较小字号 |
| 面包屑 | 灰色文字，`/` 分隔，带图标，每层可点击 |
| 引用内容（Mentioned in） | 浅色背景高亮框，左侧竖线，显示完整节点文本 |
| 引用内容（Appears as） | 标准 outliner item 行，reference bullet + tag badge |
| 引用计数 badge（行内） | 节点行右侧，半透明数字 |
| 分隔 | references section 与节点内容之间有明显留白 |

## 7. Nodex 实现建议

### Phase 1 — MVP（本次任务）
1. **References Section 容器**: 节点底部可折叠区域，`N references ∨`
2. **"Mentioned in..." 分组**: 查询树引用 + 内联引用，显示面包屑 + 内容
3. **"Appears as [Field] in..." 分组**: 查询 fieldEntry 中引用当前节点的记录
4. **引用计数 badge**: 行内数字显示

### Phase 2 — 增强
5. **Unlinked mentions**: 需要全文搜索支持
6. **LINKS_TO 系统字段**: 依赖 Search Nodes

### 数据查询策略
- **树引用查询**: 遍历 LoroTree 所有节点，找 `type='reference' && targetId === nodeId` 的节点
- **内联引用查询**: 遍历所有节点的 `inlineRefs`，找 `targetNodeId === nodeId` 的条目
- **字段值引用查询**: 找 `type='fieldEntry'` 的节点，其 children 包含 `nodeId` 的
- **性能**: 需要建立反向索引（nodeId → referencing nodes），避免全表扫描
- **面包屑**: 复用现有的 `getAncestorPath()` 逻辑
