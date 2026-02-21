# Feature: References & @引用

> Phase 1.1 | MVP 已完成，增强功能待实现 | TASKS.md #19

## 行为规格

### 创建引用

- 空节点或编辑器中输入 `@` 触发 ReferenceSelector 搜索面板
- 搜索面板实时过滤所有工作区节点（按名称匹配）
- 选择节点后：
  - **空节点 `@`**：先创建树引用，再立即进入“转换模式”（显示 reference bullet + inline ref，可直接继续输入）
  - **文本中 `@`**：插入内联引用（蓝色链接文本，TipTap inline node）
- 引用创建不复制目标节点，只存储引用关系

### 树引用（Reference Node）

- Bullet 显示为同心圆（双圈），区别于普通实心圆点
- **单击 = reference 专用选中态**（`fit-content` 边框，仅包裹 bullet+文本），不进入编辑
- **双击 = 编辑**（创建 TipTap 编辑器，编辑原始节点 `props.name`）
- 选中状态与编辑状态互斥（`selectedNodeId` vs `focusedNodeId`）
- 编辑引用节点的文本 = 编辑原始节点的 `props.name`（双向同步）
- 展开引用节点显示原始节点的 children（实时）
- 引用节点有独立的展开/折叠状态（compound key: `parentId:nodeId`）
- 删除引用节点只删除引用关系，不删除原始节点

### 转换模式（Reference ↔ Inline）

- `@` 在空节点确认后进入转换模式：光标位于 inline ref atom 之后，用户可以继续输入
- 在 reference 专用选中态下：
  - `ArrowRight` 进入转换模式
  - 可打印字符输入直接进入转换模式并续写字符
- blur 时若内容仍“仅有一个 inline ref”（无额外文本），自动回退为树引用
- blur 时若已有额外文本，保留为普通内容节点（含 inline ref）

### 内联引用（Inline Reference）

- 显示为蓝色链接文本，内容为目标节点的 `props.name`
- 点击内联引用 → navigateTo 目标节点（push panel）
- 原始节点名称变更时，所有内联引用自动更新显示
- 编辑模式下内联引用显示为不可编辑的 inline chip

### 反向链接（Backlinks）— 未实现

- 节点底部显示"Referenced by"区域
- 列出所有引用该节点的位置（节点名 + 面包屑路径）
- 点击反向链接 → navigateTo 引用所在的节点
- 反向链接是实时计算的，非存储

### 引用计数 — 未实现

- 被引用的节点在某些视图中显示引用计数 badge
- 计数 = 树引用 + 内联引用总数

### 合并节点 — 未实现

- 选中多个重复节点 → 合并为一个
- 合并策略：保留第一个节点，合并所有 children 和 tags
- 所有引用更新为指向合并后的节点

## 决策记录

| 日期 | 决策 | 原因 |
|------|------|------|
| 2026-02-01 | 引用节点使用 compound expand key `parentId:nodeId` | 同一节点在不同位置引用时需要独立展开状态 |
| 2026-02-01 | 编辑引用 = 编辑原始节点 | 与 Tana 行为一致 |
| 2026-02-03 | 内联引用用 TipTap inline node extension | ProseMirror 原生支持 inline node 渲染 |
| 2026-02-12 | Reference 节点单击选中、双击编辑 | 区分选中（框选预览）和编辑（修改原始节点）两种交互意图 |

## 当前状态

- [x] `@` 触发搜索并引用节点
- [x] 树引用 bullet（同心圆）
- [x] 编辑引用即编辑原始节点
- [x] 内联引用显示（蓝色链接、可点击导航）
- [x] 引用独立展开/折叠状态
- [x] 删除引用不删除原始节点
- [x] 引用节点单击选中（fit-content 边框）、双击编辑
- [x] 空节点 `@` 创建后进入转换模式，可继续输入
- [ ] 反向链接 section
- [ ] 引用计数 badge
- [ ] 合并节点

## 与 Tana 的已知差异

- Tana 支持引用节点的拖拽排序（Nodex 已支持）
- Tana 的反向链接有更丰富的分组显示（按引用类型），Nodex 计划先做 flat 列表
