# Feature: References & @引用

> Phase 1.1 | MVP 已完成，增强功能待实现 | TASKS.md #19

## 行为规格

### 创建引用

- 空节点或编辑器中输入 `@` 触发 ReferenceSelector 搜索面板
- 搜索面板实时过滤所有工作区节点（按名称匹配），并按最近编辑时间（`updatedAt`）降序排序
- 当 `@` 后 query 为空时，下拉显示 `Recently used`：
  - 优先展示 panel navigation history（最近打开）
  - 若历史不足则用全局最近编辑节点补齐（过滤 container/结构节点）
- 日期快捷方式：输入 `@today`、`@tomorrow`、`@yesterday` 匹配对应日期节点
  - 前缀匹配：`@to` 同时匹配 today 和 tomorrow
  - 选中后自动创建/查找对应的 Journal 日节点并插入引用
  - 显示为 "Dates" 分区，附带 Calendar 图标和日期预览
- 选择节点后：
  - **空节点 `@`**：先创建树引用，再立即进入“转换模式”（显示 reference bullet + inline ref，可直接继续输入）
  - **文本中 `@`**：插入内联引用（蓝色链接文本，TipTap inline node）
- 引用创建不复制目标节点，只存储引用关系

### 引用合法性规则（允许 / 禁止）

> 核心原则：**树引用参与大纲展开递归，必须保证显示图无环；内联引用只是文本链接，不参与递归。**

#### 树引用（Reference Node，`type='reference'`）

- **允许**：
  - 引用普通内容节点（只要创建后不会形成显示循环）
  - 引用兄弟节点 / 跨分支节点（只要不会形成显示循环）
- **禁止**：
  - 引用自己（`parentId === targetId`）
  - 任何会让显示图形成环路的引用（包括“引用祖先”和跨分支互引闭环）
  - 引用不存在的节点
- **交互反馈**：
  - 在“空节点 `@` → 树引用”上下文中，ReferenceSelector 会直接禁用非法目标（hover/高亮时显示原因）
  - 若仍通过其他入口触发非法树引用，创建层会拒绝，并给出 warning 提示（防线兜底）

#### 内联引用（Inline Reference）

- **允许**：
  - 引用自己 / 祖先 / 后代 / 任意节点（只要目标存在）
- **原因**：
  - 内联引用不展开 children，不会引入大纲递归环路

#### 渲染层防御（历史脏数据 / 旧版本数据）

- 即使已有数据中存在循环树引用，渲染层也必须停止继续展开该分支，避免 UI 卡死
- 渲染层防御是兜底，不替代创建时的合法性校验

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

### 反向链接（Backlinks）

> 研究文档：`docs/research/tana-backlinks-ui.md`

#### 整体结构

- 位于**节点内容最底部**（zoom into 节点后可见，在 children / fields 之后）
- 与节点内容之间有明显留白分隔
- 可折叠：标题行显示 `N references ∨`，点击展开/折叠
- **默认折叠**，每次 zoom in 重新折叠

#### 引用分组（匹配 Tana）

**分组 1: "Mentioned in..."** — 普通 @引用（树引用 + 内联引用）
- 灰色小字号标题 `Mentioned in...`
- 每条引用显示：
  - **面包屑路径**: 引用所在节点的祖先层级（如 `📂 Daily notes / 2026 / Week 08 / Yesterday, Sat, Feb 21`），每层可点击导航
  - **引用节点内容**: 浅色高亮背景框，显示完整节点文本
- 按引用所在面包屑位置分组（同一父链下的引用归在同一面包屑下）

**分组 2: "Appears as [Field Name] in..."** — 字段值引用
- 当前节点被用作某字段的值时出现
- 灰色小字号标题 `Appears as [Field Name] in...`（Field Name 动态替换为实际字段定义名）
- 每条引用显示为标准 outliner item 行：reference bullet ◎ + 节点文本 + tag badge
- 不显示面包屑（字段关系已提供上下文）

#### 交互

- 点击引用节点 → navigateTo 引用所在的节点（push panel）
- 点击面包屑层级 → 导航到对应层级节点
- 反向链接是**实时计算**的，非存储（基于反向索引）

#### 布局规则

- 行布局与 OutlinerItem depth-0 完全一致：`paddingLeft: 6` → `flex gap-1` → `[ChevronButton 15px]` + `flex gap-2` → `[Bullet 15px][text]`
- 高亮区域（mention 背景、hover）使用 absolute overlay，`left: 21px`（跳过 chevron），覆盖 gap + bullet + text，与 OutlinerItem 的 `showRowHighlight` 一致
- 分组标签（"N references"、"Mentioned in..."、"Appears as..."）对齐 bullet 列（`paddingLeft: 25px`），非文本列
- 面包屑路径也对齐 bullet 列
- Tag badge 以 `inline-flex` 跟在文本后面（与 OutlinerItem 的 TagBar 模式一致），不用 `ml-auto` 推到右侧

#### 数据查询

- **树引用**: 所有 `type='reference' && targetId === nodeId` 的节点（排除 parent 为 fieldEntry 的，避免与字段值引用重复）
- **内联引用**: 所有节点 `inlineRefs` 中 `targetNodeId === nodeId` 的条目
- **字段值引用**: `type='fieldEntry'` 的节点，其 children 包含 `nodeId`
- **去重规则**: 同一引用不会同时出现在 "Mentioned in" 和 "Appears as [Field] in" 中（`computeBacklinks` 和 `buildBacklinkCountMap` 均跳过 fieldEntry 内的树引用）
- **性能**:
  - `buildBacklinkCountMap(version)` 按 `_version` 缓存，同一渲染周期内多个 `useBacklinkCount` 调用 O(1)
  - `computeBacklinks(nodeId, version)` 按 `(version, nodeId)` 缓存，同一 `_version` 内同一节点不重复扫描
  - `buildBacklinkCountMap` 预计算 trash set（从 TRASH 根节点 BFS），避免每个节点重复走 parent chain

### 引用计数 Badge

- 节点行**右侧**浮现半透明引用计数数字
- 仅在节点**未聚焦/未 zoom in** 时显示
- 计数 = 树引用 + 内联引用 + 字段值引用总数
- 点击计数数字 → 展开引用列表（或导航到该节点显示 references section）
- 可通过设置开关控制显示/隐藏

### 合并节点 — 未实现（P3）

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
| 2026-02-22 | `@today/tomorrow/yesterday` 日期快捷方式 | 匹配 Tana 行为，自然语言引用日期节点 |
| 2026-02-22 | 树引用禁止显示图成环；内联引用允许 self/ancestor 引用 | 树引用会参与递归展开，必须从数据层保证无环；内联引用不展开 |
| 2026-02-22 | 反向链接分两组: "Mentioned in" + "Appears as [Field] in" | 匹配 Tana 分组逻辑，字段引用比普通引用有更强语义 |
| 2026-02-22 | 反向链接默认折叠，标题显示总计数 | 避免页面过长，与 Tana 一致 |
| 2026-02-22 | 暂不实现 Unlinked mentions | 需要全文索引支持，P3 再考虑 |
| 2026-02-22 | 反向链接 section 实现（computeBacklinks + BacklinksSection） | 全量扫描 LoroDoc，三类引用（tree/inline/fieldValue），TRASH 排除 |
| 2026-02-22 | 引用计数 badge（useBacklinkCount + OutlinerItem） | 行右侧 10px 半透明数字，点击 navigateTo zoom in 查看完整 references |
| 2026-02-22 | 字段值引用检测：检查 child.targetId 而非 child.type==='reference' | Options 字段的值节点没有 type='reference'，只有 targetId 属性 |
| 2026-02-22 | buildBacklinkCountMap 添加 version 缓存 | 每个 OutlinerItem 独立调用 useBacklinkCount → 同一 _version 内复用缓存避免 O(N×M) |
| 2026-02-22 | 树引用在 fieldEntry 内时跳过 "Mentioned in" | 避免与 "Appears as [Field] in..." 重复计数 |
| 2026-02-22 | BacklinksSection 行布局复用 OutlinerItem depth-0 结构 | paddingLeft/flex gap/absolute highlight overlay 与 OutlinerItem 完全一致 |
| 2026-02-22 | 标签/分组标签对齐 bullet 列（25px），非文本列（48px） | 信息层级：标签是分组元数据，不是内容文本 |
| 2026-02-22 | 删除未使用的 useBacklinkCountMap hook | 仅 useBacklinkCount（单节点）在使用，全量 map hook 无消费者 |
| 2026-02-23 | buildBacklinkCountMap 也跳过 fieldEntry 内的树引用 | PR review: badge 计数必须与展开后 section 一致，不能双重计数 |
| 2026-02-23 | computeBacklinks 添加 (version, nodeId) 缓存 | PR review: Zustand selector 每次 _version 变化触发，缓存避免冗余全量扫描 |
| 2026-02-23 | buildBacklinkCountMap 预计算 trash set（BFS from TRASH root） | PR review: 替代逐节点 isInTrash() parent chain walk，O(T) 预计算 vs O(N×D) 逐条 |

## 当前状态

- [x] `@` 触发搜索并引用节点（含 `@today`/`@tomorrow`/`@yesterday` 日期快捷方式）
- [x] 树引用 bullet（同心圆）
- [x] 编辑引用即编辑原始节点
- [x] 内联引用显示（蓝色链接、可点击导航）
- [x] 引用独立展开/折叠状态
- [x] 删除引用不删除原始节点
- [x] 引用节点单击选中（fit-content 边框）、双击编辑
- [x] 空节点 `@` 创建后进入转换模式，可继续输入
- [x] 反向链接 section（"Mentioned in..." + "Appears as [Field] in..." 分组）
- [x] 引用计数 badge（OutlinerItem 行右侧半透明数字）
- [ ] 合并节点

## 与 Tana 的已知差异

- Tana 支持引用节点的拖拽排序（Nodex 已支持）
- Tana 有 "Unlinked mentions" 功能（名称文本匹配但未正式链接），Nodex 暂不实现（需全文索引）
- Tana 有 `LINKS_TO` 系统字段用于 Live Search 自定义反向链接视图，Nodex 依赖 Search Nodes (#23)
- Tana 引用计数 badge 可在设置中开关，Nodex 初始实现默认显示
