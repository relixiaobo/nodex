# Task Board

> 所有任务的单一事实来源。Agent 通过 `Read docs/TASKS.md` 获取全局状态。
>
> **维护规则**：
> - 用户随手记录到「收件箱」，agent 启动时处理（归类到待办或直接处理）
> - Dev agent 接到任务后，第一步编辑此文件（更新 Agent 状态 + 移动/创建任务到「进行中」）
> - 任务完成后，nodex merge PR 时移动到「已完成」
>
> **迭代日志规则**：
> - 每个「进行中」任务带 `迭代日志` 字段（追加式，不删改历史条目）
> - 格式：`[日期 agent-id] 摘要`
> - 记录：尝试了什么、为什么失败、最终选择了什么方案、关键代码位置
> - 通用经验教训（非任务特定的）沉淀到 `docs/LESSONS.md`

---

## 收件箱

用户随手记录，agent 启动时处理（归类到待办或进行中，处理完从此处删除）。

_(空)_

---

## Agent 状态

| Agent | 当前任务 | 分支 | 修改中的文件 |
|-------|---------|------|-------------|
| nodex-cc | _(idle)_ | — | — |
| nodex-cc-2 | Search Nodes Phase 1 (#23) | `cc2/search-nodes` | `node.ts`, `loro-doc.ts`, `search-engine.ts`, `node-store.ts`, `OutlinerItem.tsx`, `OutlinerView.tsx` |
| nodex-codex | _(idle)_ | — | — |

---

## 进行中

### Undo/Redo 行为修复（3 个 bug）
> PR #91 合并后发现的 undo/redo 边界问题。
> **Owner**: nodex-cc | **Branch**: `cc/undo-redo-fixes`
> **Spec**: `docs/features/undo-redo.md`

- [x] Bug 1: 连续 ⌘Z 回退到空白状态 — 根因：bootstrap `navigateTo` 创建 undo 条目，快照为空 panelHistory。修复：改用 `replacePanel` + `commitDoc('system:bootstrap')` + restore 防御空 panelHistory。
- [ ] Bug 2: 焦点不在 node 编辑器中时，⌘Z 无法撤回展开/收起操作（点击 chevron 或引导线后焦点丢失到 sink textarea，但 undo 未生效）— Side Panel 实测正常，暂跳过
- [x] Bug 3: 点击节点 bullet 进入 NodePanel 后 ⌘Z 无法返回 — 根因：`seedTestData` 异步路径未调 `clearUndoHistoryForTest()`，`applyTag` 内部 `commitDoc('user:implicit')` 污染 undo 栈。修复：补 `clearUndoHistoryForTest()` + seed 改用 `skipUndo/replacePanel`。

---

## 待办

### P1

#### Sync 增量同步（Phase 1-2 合并实施）— Cloudflare-only 全栈
> Phase 0 客户端预留已完成（PR #75 + #77 + #78）。基础设施：**Cloudflare-only**（Workers + R2 + D1 + Better Auth），完全消除 Supabase 依赖。
> 跳过纯备份（Phase 1），直接实现多端增量同步（Phase 2）。
> **Owner**: nodex-cc
> **Plan**: `docs/plans/sync-incremental-impl.md` | **Arch**: `docs/plans/sync-architecture.md` | **Auth**: `docs/plans/auth-cloudflare-only.md`
>
> **当前状态**: Steps 0-9 完成，Staging 部署完成，Compaction 待做

- [x] **Review**: nodex-codex review 实施计划（含 7 个开放问题） ✓ nodex-codex（2026-02-22）
- [x] **修订**: Postgres → D1 迁移 + Auth 评估 ✓ nodex-codex（2026-02-22）
- [x] **修订**: Cloudflare-only 全栈（Auth PoC 纳入 Step 0） ✓ nodex（2026-02-23）
- [x] Step 0-5: Auth + Sync Server 全链路 ✓ nodex-cc PR #80（2026-02-23）
- [x] Step 6: 客户端 Pending Queue（IndexedDB 队列） ✓ nodex-cc PR #83（2026-02-23）
- [x] Step 7: 客户端 Sync Manager（push/pull 循环 + retry/backoff） ✓ nodex-cc PR #83（2026-02-23）
- [x] Step 8: 客户端 Sync 状态 UI（SyncStatusIndicator） ✓ nodex-cc PR #83（2026-02-23）
- [x] Step 9: 端到端测试 ✓ nodex（2026-02-23）— `tests/vitest/sync-e2e.test.ts` 10 cases
- [x] Staging + Production 双环境部署 ✓ nodex（2026-02-23）— D1 + Worker + Secrets + Google OAuth
- [x] HTTPS cookie 前缀修复（`__Secure-` prefix） ✓ nodex（2026-02-23）
- [ ] Step 10: Compaction（延后到上线后）
- [ ] Production 部署（等 Chrome Web Store 发布后配置）

### P2

#### Supertags 完善 (#20)
> 基础已完成（#触发、标签应用/移除、配置页、模板字段、TagBadge 右键菜单）
> 已完成子项：Show as Checkbox、标签继承/Extend Phase 1、applyTag 复制 default content、Color 继承

- [x] Done state mapping — checkbox ↔ Options 字段值双向映射 ✓ PR #54
- [x] 统一 config field 架构（系统配置字段与用户字段共享数据模型） ✓ PR #54
- [x] BOOLEAN 数据类型 + toggle switch ✓ PR #54
- [x] Default Child Supertag（新增子节点自动继承指定标签）✓ nodex-cc-2
- [x] Color Swatch Selector（10 色预置色板 + ColorSwatchPicker + resolveTagColor）✓ nodex-cc-2
- [ ] Pinned fields（置顶显示 + filter 优先）
- [ ] Optional fields（建议按钮 + 自动降级）
- [ ] Convert to supertag（普通节点快捷转 tagDef）
- [ ] 批量标签操作（多选 add/remove）
- [ ] Title expression（`${field name}` 动态标题）
- [ ] 标签页（点击 supertag → 显示所有打该标签的节点列表/表格）
- **Spec**: `docs/features/supertags.md`

#### Fields 全类型 (#21)
> 基础已完成（>触发、字段名编辑+自动完成、交错渲染、字段值编辑器、配置页）
> 已完成子项：Options 下拉、Date 选择器、Number/URL/Email 输入、Checkbox、字段隐藏规则、Required 字段、Number Min/Max、值验证、系统字段(8/12)

- [x] Options from Supertag（特定标签的节点作为选项源）✓ PR #54 + nodex-cc-2
- [ ] AttrDef "Used in" 计算字段
- [ ] Auto-initialize（6 种策略）
- [ ] Pinned fields
- [ ] Merge fields
- **Spec**: `docs/features/fields.md`

#### Date 节点 & 日记 (#22)
> 执行顺序 ①（"一切皆节点"系列首项，后续 Search/Views 依赖日期节点）
> Phase 1 已完成 (PR #73): Year→Week→Day 层级 + Today 入口 + DateNavigationBar + 日历选择器

- [x] 年/周/日节点层级（自动生成，ISO 8601 周 + 降序排列） ✓ PR #73
- [x] Today 快捷入口（侧栏按钮 + 快捷键 Cmd+Shift+D） ✓ PR #73
- [x] DateNavigationBar（< > Today + Calendar popover） ✓ PR #73
- [x] 面包屑/标题 "Today" 前缀 ✓ PR #73
- [x] `@today`/`@tomorrow`/`@yesterday` 日期快捷引用 ✓ main + PR #72
- [ ] 自然语言日期解析扩展（@next Monday / @November / @last week）
- [ ] 日记模板（#day supertag 配置）
- [ ] 日期字段链接到日节点
- **Spec**: `docs/features/date-nodes.md`

#### 网页剪藏 (#30)
> 已完成：消息类型定义、Content Script 提取（defuddle）、Background 中转、`/clip` slash command 全链路、`#web_clip` tagDef + Source URL attrDef 惰性创建、V2 正文→子节点、Vitest 55 cases
> **Owner**: nodex-cc-2 | **Branch**: cc2/web-clipping

- [x] 将捕获数据保存为节点 ✓ `/clip` + `applyWebClipToNode`
- [x] 自动打 web_clip 标签 ✓ `applyTag(tagDef_web_clip)`
- [x] Source URL 字段写入 ✓ `setFieldValue(sourceUrlAttrDefId, url)`
- [x] 剪藏结果 Toast 反馈（成功/失败提示）✓ sonner toast
- [ ] 一键保存到 Inbox / Today / 指定节点（UI 入口 + 目标选择）
- [x] 保留源 URL 引用（URL 字段值渲染为可点击链接）✓ FieldValueOutliner URL/Email 早返回
- [x] 正文内容转子节点（V2）✓ `parseHtmlToNodes()` + `createContentNodes()` heading-based 层级树
- **Spec**: `docs/features/web-clipping.md`

#### 统一时间线 Undo/Redo (#44)
> 目标：Workflowy 水平的统一 undo — ⌘Z 永远撤销「上一步」，覆盖所有用户操作。
> Loro UndoManager 单一时间线。核心路径已完成（PR #91）。
> **Spec**: `docs/features/undo-redo.md` | **Plan**: `docs/plans/unified-undo.md` | **Research**: `docs/research/tana-undo-redo-analysis.md`

- [x] Phase 2: ProseMirror → Loro 实时同步 + 移除 `prosemirror-history` ✓ PR #91
- [x] Phase 3: UI 状态 marker commit（展开/折叠 + 导航进入 Loro undo 栈）✓ PR #91
- [x] Phase 4: 统一 ⌘Z handler + 删除旧代码（navUndoStack / 三层 fallthrough / PM History）✓ PR #91
- [ ] Phase 1: 补全 commitDoc() 覆盖（applyTag / removeTag / setFieldValue / toggleCheckbox 所有路径）

#### Side Panel 布局改造 — 移除 Sidebar + ⌘K 重设计
> Phase 1/2/4 已完成（PR #88）。Phase 3（Undo/Redo 按钮集成）待 #44 完成后执行。
> **Plan**: `docs/plans/layout-renovation.md`

- [x] Phase 1: 顶栏骨架 + 移除 Sidebar ✓ PR #88
- [x] Phase 2: ⌘K 命令面板重写 ✓ PR #88
- [ ] Phase 3: Undo/Redo 按钮集成（#44 核心已完成，可执行）
- [x] Phase 4: 清理废弃文件 ✓ PR #88

#### 节点选中 — 后续增强 (#47)
> Phase 1-3 已合并（PR #51）。PR #72 补充了字段行选中 + 全局选区清除。以下为未覆盖的后续项：

- [x] 字段行统一选中（pointer-intent + Cmd/Shift+Click） ✓ PR #72
- [x] 全局 pointerdown 选区清除（outliner 外点击自动清空） ✓ PR #72
- [ ] Cmd+Shift+D 批量复制
- [ ] 拖动选择优化（跨面板边界防护）
- **Spec**: `docs/features/node-selection.md`

### P3

#### 合并节点（Merge Nodes）
> 从 References 增强 (#19) 拆出的独立任务

- [ ] 选中多个重复节点 → 合并为一个（保留第一个，合并 children/tags）
- [ ] 所有引用（树引用 + 内联引用 + 字段值引用）更新为指向合并后的节点
- **Spec**: `docs/features/references.md`

#### Search Nodes Phase 1 — 单标签搜索 (#23)
> 查询配置 = 子节点树（`type: 'queryCondition'`），搜索结果动态计算 + OutlinerItem 渲染（完整交互）。
> **Owner**: nodex-cc-2 | **Branch**: `cc2/search-nodes`
> **Spec**: `docs/features/search.md` | **Plan**: `docs/plans/search-nodes-impl.md`

- [ ] Step 1: 类型定义（`queryCondition` NodeType + 查询属性 + loro-doc 读写）
- [ ] Step 2: 搜索引擎 `search-engine.ts`（条件树递归评估 + 多态标签搜索）
- [ ] Step 3: `createSearchNode()` — 创建 3 节点（search + AND group + HAS_TAG）
- [ ] Step 4: `?` 触发（启用 slash command + 标签选择器）
- [ ] Step 5: 搜索节点渲染（BulletChevron 放大镜 bullet）
- [ ] Step 6: 搜索结果渲染（useSearchResults hook + OutlinerView 搜索分支 + OutlinerItem isSearchResult）
- [ ] Step 7: Seed data + 集成验证
- [ ] Step 8: 文档同步

**Phase 2 待办**（本次不做）：
- [ ] Query Builder 面板（渲染/编辑条件子节点树）
- [ ] AND / OR / NOT 逻辑组合 UI
- [ ] 字段值过滤（FIELD_EQUALS / DEFINED / NOT_DEFINED）
- [ ] TODO / DONE 关键词过滤
- [ ] 搜索结果配合视图展示

#### Table View (#24)
> 执行顺序 ④（依赖 #25 的 Filter/Sort/Group 基础设施）

- [ ] 表格视图（行=节点，列=字段）
- [ ] 列宽调整、列拖拽排序
- [ ] 列计算（Sum / Avg / Median / Min / Max / Count）
- [ ] 单元格内直接编辑字段值
- **Spec**: `docs/features/views.md`

#### Filter / Group / Sort 工具栏 (#25)
> 执行顺序 ③（视图基础设施，Filter/Sort/Group = ViewDef 的 Tuple，所有视图共用）

- [ ] 通用视图工具栏（适用于所有视图）
- [ ] 按字段值过滤
- [ ] 按字段值分组（Outline / Cards / List 视图）
- [ ] 多级排序（升序/降序、堆叠排序条件）
- **Spec**: `docs/features/views.md`

#### Cards View (#26)
> 执行顺序 ⑤（依赖 #25 的 Filter/Sort/Group 基础设施）

- [ ] 卡片视图
- [ ] 卡片间拖拽更新字段值
- [ ] Banner 图片显示
- **Spec**: `docs/features/views.md`

#### Calendar View (#27)
> 执行顺序 ⑥（依赖 #22 的日期节点 + #25 的视图基础设施）

- [ ] 日历视图（按日期字段排列节点）
- [ ] 日/周/月粒度切换
- [ ] 拖拽未排期节点到日历添加日期
- **Spec**: `docs/features/views.md`

#### List & Tabs View (#28)
> 执行顺序 ⑦（依赖 #25 的视图基础设施）

- [ ] List 视图（左侧列表 + 右侧详情双面板）
- [ ] Tabs 视图（顶部 tab 切换内容）
- **Spec**: `docs/features/views.md`

#### 性能基线测量
> 已延迟：等数据模型简化完成后再测量（原始目的"编辑器迁移对比"已过期，重构后重新建立基线更有意义）
> **产出**: `docs/research/performance-baseline.md`

#### Floating Toolbar (#46)
> Phase 1 已完成（PR #55）：BubbleMenu + 7 格式按钮 + Link 原地编辑 + Heading mark

- [x] TipTap BubbleMenu 集成 ✓ PR #55
- [x] 格式按钮（Bold / Italic / Code / Highlight / Strikethrough / Heading） ✓ PR #55
- [x] Link 编辑弹窗 ✓ PR #55
- [x] **BUG: BubbleMenu 无限渲染循环 — 选中文字后浮动工具栏不出现** ✓ PR #57
  - 根因：BubbleMenu 插件内部 transaction/updateOptions 与外部显示门控逻辑互相反馈
  - 已修复：移除 BubbleMenu，改为自管理 Portal 浮层（selection/focus/mouseup 驱动 + `coordsAtPos` 定位）
- [ ] @ Reference 按钮
- [ ] # Tag 按钮
- **Spec**: `docs/features/floating-toolbar.md`

#### Slash Command — 后续命令点亮 (#48)
> 基线已合并（PR #42）。已完成：SlashCommandExtension + 菜单 UI + Field / Reference / Checkbox / More commands

- [x] Heading（文本格式 mark） ✓ PR #55
- [ ] Paste（剪贴板内容类型判断）
- [ ] Search node（依赖 Search Node UI #23）
- [ ] Image / file（依赖上传与存储）
- [ ] Checklist（批量 checkbox）
- [ ] Start live transcription（语音转写）
- **Spec**: `docs/features/slash-command.md`

#### Editor 粘贴增强（结构化粘贴）
> 来源：Editor 迁移验收备注（Phase 2.9），本轮先保持当前纯文本粘贴行为

- [ ] 多行纯文本粘贴：按行拆分为多个节点（而不是单节点空格拼接）
- [ ] Markdown 列表粘贴：根据缩进/列表层级重建节点树
- [ ] 富文本粘贴：保留基础结构语义（段落/列表/强调）并映射到 `text + marks + inlineRefs`
- [ ] 与撤销/重做集成：一次粘贴可完整撤销
- **Spec**: `docs/features/editor-migration.md`（待补充“结构化粘贴”小节）

---

## 已完成

| 日期 | 任务 | Agent | PR |
|------|------|-------|-----|
| 2026-02-24 | 统一时间线 Undo/Redo — Loro-only 单一路径（PM History 移除 + UI marker commit + onPush/onPop 状态快照 + 焦点恢复 sink textarea） | nodex-codex | #91 |
| 2026-02-24 | Side Panel 布局改造 Phase 1/2/4 — TopToolbar + ⌘K CommandPalette Raycast 风格重写 + Sidebar/SidebarNav/SyncStatusIndicator/UserMenu 移除 + Kbd 组件 + fuzzy-search + palette-commands | nodex-cc | #88 |
| 2026-02-23 | Staging + Production 双环境部署 — D1/Worker/Secrets/Google OAuth + HTTPS cookie 前缀修复 | nodex | — |
| 2026-02-23 | Inline ref fallback 虚线 bullet 修复 + outliner backlink count badge 移除 | nodex-codex | #87 |
| 2026-02-23 | Reference node Backspace 选中/删除流程修复（单 inline ref atom 行尾退格 → select_reference intent） | nodex-codex | #86 |
| 2026-02-23 | 容器节点 registry 收口 — `system-node-registry.ts` 统一 bootstrap/sidebar/command palette 定义 + 5 Vitest 回归 | nodex-codex | #85 |
| 2026-02-23 | 系统节点锁定约束 — `node-capabilities.ts` 规则中心（workspaceHome/container/general）+ store hard guard（move/trash/setNodeName/updateNodeContent/updateNodeDescription）+ UI soft guard（NodeHeader/NodeDescription 只读）+ 7 Vitest 回归 | nodex-codex | #84 |
| 2026-02-23 | Sync 客户端 Steps 6-8 — Pending Queue (IndexedDB) + SyncManager (push/pull 30s + nudge + session token) + SyncStatusIndicator + WorkspaceStore hydration fix | nodex-cc | #83 |
| 2026-02-23 | 日期系统标签节点化 — `sys:day/week/year` 普通 tagDef + 模板字段/默认内容实例化 + 删除保护 + applyTagMutationsNoCommit 提取 | nodex-codex | #82 |
| 2026-02-23 | Auth + Sync Server (Steps 0–5) — Better Auth + D1 + Google OAuth + Extension flow + Push/Pull 端点 + R2 blob 存储 + echo filtering + cursor 管理 | nodex-cc | #80 |
| 2026-02-23 | 空白 NodePanel 导航修复 — reference bullet 导航到目标节点 + 系统标签导航守卫 + ui-store backing node 校验 + NodePanel 兜底视图 | nodex-codex | #81 |
| 2026-02-23 | References 增强 (#19) — 反向链接 section（Mentioned in + Appears as [Field] in 分组）+ 引用计数 badge + 11 Vitest 用例 + 计数去重/缓存/trash set 性能修复 | nodex-cc-2 | #76 |
| 2026-02-22 | Sync 增量同步计划 Review — 补 sync_updates 表、修正 seq hole/cursor 语义/checkpoint 持久化/RLS 边界 | nodex-codex | #79 |
| 2026-02-22 | Sync Phase 0 实现复审 + 修复（workspace ID 并发竞态、SnapshotRecord 校验加固、测试真实持久化路径、VV 增量断言修正） | nodex-codex | #78 |
| 2026-02-22 | Sync Phase 0 Step 2 — 客户端 Sync-Ready 实施（PeerID/VV 持久化、subscribeLocalUpdates hook、Workspace ID 规范化、unlimitedStorage） | nodex-cc | #77 |
| 2026-02-22 | Sync Phase 0 Step 1 — Review & 优化方案（Loro API/Chrome 约束/架构审查，修订 sync-architecture.md） | nodex-codex | #75 |
| 2026-02-22 | Reference 引用环路防护 + 轻量 i18n 基础层 — 树引用显示图无环校验 + ReferenceSelector 禁用非法目标 + 渲染层循环展开兜底 + `t()` 文案迁移 | nodex-codex | #74 |
| 2026-02-22 | Outliner 选区统一 & Reference UX 优化 — row-pointer-selection 提取 + 字段行选中 + inline ref supertag 着色 + 全局选区清除 + 搜索 recency 排序 + 面包屑根导航 | nodex-codex | #72 |
| 2026-02-22 | Calendar Heatmap + `@today`/`@tomorrow`/`@yesterday` 日期快捷引用 + 日历 UI 优化（正方形 cell + 热力图 + 周末着色 + Today 按钮优化） | nodex | — |
| 2026-02-22 | 网页剪藏增强 — sonner toast 反馈 + URL/Email 字段可点击链接 + V2 HTML→子节点树（heading 层级解析 + marks 保留） | nodex-cc-2 | #71 |
| 2026-02-22 | Date 节点 & 日记 Phase 1 — Year→Week→Day 层级 + Today 入口 + DateNavigationBar + 日历 popover + 面包屑前缀 | nodex-cc | #73 |
| 2026-02-21 | Editor Bug: CJK IME 组合输入异常（fork prosemirror-view 添加 composing 守卫） | nodex-codex | — |
| 2026-02-21 | Refactor — Row 交互统一（content/trailing/field-value 共享 intent 层 + CJK hashtag 修复 + trigger caret 修复） | nodex-codex | #70 |
| 2026-02-21 | P1 Reference 交互收口（单击选中/Esc/框选 + inline 转换 + 浮窗锚点统一） | nodex-codex | #69 |
| 2026-02-21 | Refactor — Loro 收口 Phase 2: LoroText 主编辑链路迁移 + config field 重构 | nodex-codex | #68 |
| 2026-02-21 | Refactor — Loro 收口 Phase 1: detached guard + origin 策略 | nodex-codex | #67 |
| 2026-02-21 | P1 NodePanel Header 重设计（三列对齐网格 + 隐藏字段占位行） | nodex-cc | #66 |
| 2026-02-21 | Bugfix — Loro 全量 Review 问题修复（引用误删/removeTag/toggleDone/Options/Date） | nodex-codex | #65 |
| 2026-02-21 | 代码 Review — Loro 迁移全量（数据完整性/React 渲染/Loro API/NodeType 重构） | nodex-codex | — |
| 2026-02-20 | 代码 Review — feature-sync-2026-02-20（6 Bug + 5 测试缺口） | nodex-codex | — |
| 2026-02-20 | Node 图标系统 — supertag bullet 彩色（conic-gradient）+ fieldDef 结构化图标 + 字段颜色继承 + 字段排序 | nodex | — |
| 2026-02-20 | FIELD_TYPES 大小写修复 — seed-data.ts + field-utils.test.ts 统一使用小写常量 | nodex | — |
| 2026-02-20 | Loro CRDT 迁移 Phase 1 — 本地数据引擎 + 数据模型 + 命名 + UndoManager | nodex-cc | #62 |
| 2026-02-19 | Editor Bug: 首次点击行尾空白光标落到开头 | nodex | — |
| 2026-02-19 | 数据模型简化：消除 Metanode + AssociatedData (Phase 0-3) | nodex-cc | #60 |
| 2026-02-19 | 用户认证 — Google OAuth 登录 + Supabase Auth | nodex-cc-2 | #61 |
| 2026-02-18 | Editor 迁移 TipTap → ProseMirror（Phase 1-4 + text+marks 数据模型 + 交互修复 30+ 轮）| nodex-codex | #58 |
| 2026-02-17 | Floating Toolbar BUG 修复 — 移除 BubbleMenu，改为自管理 Portal 浮层 | nodex-codex | #57 |
| 2026-02-16 | Ctrl+I Description 切换修复 — registry 匹配 + 光标位置恢复 | nodex-codex | #56 |
| 2026-02-16 | Supertags + Fields 增强批次 — Default Child Supertag + Color Swatch + Options from Supertag (#20+#21) | nodex-cc-2 | main |
| 2026-02-16 | 文本格式化 — Floating Toolbar + Heading Mark + Link 编辑 (#46+#48) | nodex-codex | #55 |
| 2026-02-16 | 节点选中 UI 设计系统合规检查 + reference 修复 + drag-select 重构 (#52) | nodex-cc | #53 |
| 2026-02-16 | 统一 config field 架构 + Done state mapping + BOOLEAN 类型 (#20) | nodex-cc-2 | #54 |
| 2026-02-16 | 节点选中 Phase 1-3 — 单选/多选/批量操作/双层高亮 (#47) | nodex-cc | #51 |
| 2026-02-15 | Cmd+Enter 编辑器内切换 Checkbox (#43) | — | — |
| 2026-02-14 | Web Clipping 修复 — title sync, field value rendering, attrDef config | nodex-codex | #49 |
| 2026-02-14 | Node Description 编辑：高度跳动 + Ctrl+I 快捷键 (#41) | — | — |
| 2026-02-13 | 无 child 节点展开后 backspace 删除空子节点并收起 (#18) | — | — |
| 2026-02-13 | @ 创建 reference 对兄弟节点出错 (#17) | — | — |
| 2026-02-13 | 聚焦末尾含 # 或 @ 的 node 时不应触发菜单 (#16) | — | — |
| 2026-02-13 | 光标移动到 inline code 内部时光标消失 (#15) | — | — |
| 2026-02-13 | 长文本 node 失焦时文本布局宽度变窄 (#14) | — | — |
| 2026-02-13 | #tag 与所在行文本垂直居中对齐 (#13) | — | — |
| 2026-02-13 | @ 创建 reference 后光标继续输入应转为 inline reference (#12) | — | — |

### 已关闭的远期/非开发任务

以下 issue 在 #29-40 范围内已关闭，属远期规划或非当前迭代范围：
AI Chat (#29)、AI 网页辅助 (#31)、AI Command Nodes (#32)、AI 字段增强 (#33)、Supabase 实时同步 (#34)、离线模式增强 (#35)、导入/导出 (#36)、Command Nodes (#37)、Title Expressions (#38)、Publishing (#39)、Input API (#40)。
