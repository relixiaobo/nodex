# Task Board

> 所有任务的单一事实来源。Agent 通过 `Read docs/TASKS.md` 获取全局状态。
>
> **维护规则**：
> - 用户随手记录到「收件箱」，agent 启动时处理（归类到待办或直接处理）
> - Dev agent 接到任务后，第一步编辑此文件（更新 Agent 状态 + 移动/创建任务到「进行中」）
> - 任务完成后，nodex merge PR 时移动到「已完成」
> - **禁止 Dev Agent 执行 `gh pr merge`** — 只有 nodex 有权合并 PR。Dev Agent 完成后 `gh pr ready` 标记即可
>
> **迭代日志规则**：
> - 每个「进行中」任务带 `迭代日志` 字段（追加式，不删改历史条目）
> - 格式：`[日期 agent-id] 摘要`
> - 记录：尝试了什么、为什么失败、最终选择了什么方案、关键代码位置
> - 通用经验教训（非任务特定的）沉淀到 `docs/LESSONS.md`

---

## 收件箱

用户随手记录，agent 启动时处理（归类到待办或进行中，处理完从此处删除）。

1. **Field name 中鼠标拖选无法选中节点** — 鼠标在 field node 的 field name 区域按住左键上下拖动时，无法触发大纲的节点拖选（单个或多个节点选中）。鼠标拖选被 field name 的文本选中行为吞掉了。

2. **Field name 聚焦不应触发字段选择下拉框** — 当 field name 已有文本时，点击将光标插入其中不应立即弹出字段选择下拉框。下拉框只应在用户开始输入时触发，不能仅通过聚焦触发。

---

## Agent 状态

| Agent | 当前任务 | 分支 | 修改中的文件 |
|-------|---------|------|-------------|
| nodex-codex | _(idle)_ | — | — |
| antigravity | UI 细节打磨 — 浮层/间距/色彩协调 | `cc/ui-polish-round2` | 见 PR |

---

## 进行中

### UI 细节打磨 — 浮层/间距/色彩协调
> **Agent**: antigravity | **分支**: `cc/ui-polish-round2` | **PR**: TBD

- [ ] **1. 日期选择器视觉优化** — CalendarGrid 日历弹窗 + DatePicker 字段弹窗整体打磨（间距、圆角、排版与 Paper 设计系统对齐）
- [ ] **2. DateNavigationBar 间距收紧** — 日期面板标题下方的 `< Today > 📅` 导航条左右间距松散，需要收紧到与大纲内容对齐
- [ ] **3. 用户菜单浮层优化** — 点击头像后的下拉菜单视觉优化（间距、排版、分隔线）
- [ ] **4. CommandPalette (⌘K) 全面对齐** — 左右 padding 与 NodePanel 匹配；搜索框高度与搜索按钮匹配；头部高度与 TopToolbar 对齐；整体间距统一
- [ ] **5. 容器图标底色协调** — NodePanel 头部的容器图标（Inbox/Library 等）底色在暖纸色背景下不协调，需调整为融入背景的色调

---

## 待办

### v0.1 — 首次上线（Chrome Web Store 发布）

> **上线门槛**：用户可以日常使用的最小完整产品。已有功能（大纲编辑、Supertags、Fields、Date 节点、Web Clipping 基础、Undo/Redo、⌘K 搜索）+ Sync = v0.1。

#### Sync Production 部署
> Steps 0-9 + Staging 已完成。**Plan**: `docs/plans/sync-incremental-impl.md`

- [ ] Production 部署（Cloudflare Workers + D1 + R2 + Google OAuth）
- [ ] Step 10: Compaction（上线后尽快完成）

#### Chrome Web Store 上架准备

- [ ] **扩展图标** — 16/32/48/128px PNG（manifest `icons` 字段）
- [ ] **商店图标** — 128x128 PNG（商店页面展示）
- [ ] **商店截图** — 1-5 张（1280x800，展示 Side Panel 使用场景）
- [ ] **商店描述** — 详细功能介绍（最长 16,000 字符）
- [ ] **隐私政策页面** — 说明数据收集/存储/同步方式（`<all_urls>` + `identity` + `storage` 审核必须）
- [ ] **产品展示页** — 静态落地页（产品介绍 + 截图 + 安装链接 + 隐私政策），可托管在 Cloudflare Pages 或 GitHub Pages
- [ ] **Production build 清理** — 移除 manifest `key` 字段 + 移除 `host_permissions` 中的 localhost 地址
- [ ] **开发者账号** — Chrome Web Store 注册（$5）
- [ ] `npm run zip` → 上传发布

---

### P1 — 核心差异化（上线后第一优先级）

#### 上下文感知 Sidebar — 浏览器原生知识助手
> **Nodex 最核心的差异化功能**。Tana/Notion/Obsidian 做不到——因为它们不在浏览器里。
> 用户浏览网页时，侧边栏自动显示与当前页面相关的笔记，实现”阅读 ↔ 知识”双向连接。

- [ ] **Phase 1: URL 匹配** — 检测当前标签页 URL，匹配已有 web_clip 的 Source URL 字段，显示”你之前记过这个网页”
- [ ] **Phase 2: 内容相似度** — 提取当前网页关键词/实体，与笔记内容做模糊匹配，显示相关笔记列表
- [ ] **Phase 3: 标签关联** — 当前网页内容 → AI 推断相关标签 → 显示同标签下的笔记
- [ ] **Phase 4: 主动建议** — “你可能想把这段内容加到 XXX 笔记中” / “这个页面提到了你的 #project 笔记”
- [ ] Content Script 增强：网页内高亮已剪藏内容、锚点引用

#### 网页剪藏增强 (#30)
> 浏览器产品的核心价值。基础版已完成，需升级为智能剪藏。

- [x] 基础剪藏链路 ✓（消息/提取/保存/标签/URL/Toast/正文→子节点）
- [ ] 一键保存到 Inbox / Today / 指定节点（UI 入口 + 目标选择）
- [ ] **AI 智能剪藏** — 自动打标签、提取结构化信息（作者/日期/关键词）、推荐关联到已有笔记
- [ ] 选中文本剪藏（Content Script 右键菜单 / 浮动按钮 → 剪藏选中段落）
- [ ] 剪藏模板 — 不同网站类型（文章/产品/视频/论文）使用不同 Supertag 模板
- **Spec**: `docs/features/web-clipping.md`

#### AI Chat & 网页辅助 (#29 + #31)
> 浏览器 + AI = Nodex 的第二个差异化维度。不只是聊天框，而是理解上下文的知识助手。

- [ ] **AI Chat 基础** — Side Panel 内嵌对话界面，可引用笔记节点作为上下文
- [ ] **网页问答** — 选中网页内容 → 在侧边栏中提问/总结/翻译（Content Script + Side Panel 联动）
- [ ] **笔记问答** — 基于全部笔记回答问题（RAG / 全文搜索 + LLM）
- [ ] **AI 辅助组织** — 自动打标签建议、推荐关联笔记、内容分类

### P2 — 知识管理核心能力

#### Search Nodes (#23)
> 规则驱动的动态集合。物化 reference 结果 + queryCondition 子节点树。
> **Design**: `docs/plans/search-node-design.md`（唯一设计来源）
>
> Step 0 已完成（数据模型锁定），Step 1-3 上线后一个 PR 交付。

- [x] Step 0: 数据模型锁定 ✓ nodex（2026-02-26）
- [ ] Step 1: 搜索引擎核心 — `search-engine.ts`（条件树递归 + 候选集排除 + HAS_TAG/TODO/DONE/NOT_DONE）
- [ ] Step 2: L0 点击标签创建 — TagBadge click → `createSearchNode(tagDefId)` + 去重导航
- [ ] Step 3: 结果渲染 — BulletChevron 放大镜 + OutlinerView 搜索分支 + 芯片条（只读）+ 手动排序 + TrailingInput（HAS_TAG 自动打标签）
- [ ] Step 4: L1 字段过滤 UI — 芯片条增删改 + FIELD_IS/时间条件 + 计数提示
- [ ] Step 5: L2 AI 自然语言 — tool call 创建 queryCondition 树

#### AI Chat & 网页辅助 (#29 + #31)
> 浏览器 + AI = Nodex 的第二个差异化维度。不只是聊天框，而是理解上下文的知识助手。

- [ ] **AI Chat 基础** — Side Panel 内嵌对话界面，可引用笔记节点作为上下文
- [ ] **网页问答** — 选中网页内容 → 在侧边栏中提问/总结/翻译（Content Script + Side Panel 联动）
- [ ] **笔记问答** — 基于全部笔记回答问题（RAG / 全文搜索 + LLM）
- [ ] **AI 辅助组织** — 自动打标签建议、推荐关联笔记、内容分类

#### Supertags 完善 (#20)
> 基础已完成（#触发、标签应用/移除、配置页、模板字段、TagBadge 右键菜单）

- [ ] 标签页（= Search Nodes L0 入口，点击 supertag → 创建/导航 search node，见 #23）
- [ ] Convert to supertag（普通节点快捷转 tagDef）
- [ ] Pinned fields（置顶显示 + filter 优先）
- [ ] Optional fields（建议按钮 + 自动降级）
- [ ] 批量标签操作（多选 add/remove）
- [ ] Title expression（`${field name}` 动态标题）
- **Spec**: `docs/features/supertags.md`

#### Fields 全类型 (#21)
> 基础已完成（Options/Date/Number/URL/Email/Checkbox/隐藏/Required/Min-Max/验证/系统字段）

- [ ] AttrDef “Used in” 计算字段
- [ ] Auto-initialize（6 种策略）
- [ ] Pinned fields
- [ ] Merge fields
- **Spec**: `docs/features/fields.md`

#### Date 节点 & 日记 (#22)
> Phase 1 已完成 (PR #73): Year→Week→Day 层级 + Today 入口 + DateNavigationBar + 日历选择器

- [ ] 自然语言日期解析扩展（@next Monday / @November / @last week）
- [ ] 日记模板（#day supertag 配置）
- [ ] 日期字段链接到日节点
- **Spec**: `docs/features/date-nodes.md`

#### View Toolbar — Filter / Sort / Group (#25)
> **通用节点功能**：任意节点的 children 展示控制。与 Search Nodes 正交。
> **Design**: `docs/plans/view-toolbar-design.md`（待创建）| **Archived Spec**: `docs/_archive/features/views.md`

- [ ] Per-node view toolbar UI（Sort by / Filter by / Group by 图标栏）
- [ ] 右键菜单 “Show view toolbar” 入口
- [ ] Sort by：单字段排序（升序/降序）→ 多级排序
- [ ] Filter by：按字段值/标签/checkbox 状态过滤 children
- [ ] Group by：按字段值分组
- [ ] ViewDef Tuple 持久化（SYS_A16/18/19/20）

### P3 — 编辑器增强 & 交互完善

#### NodePanel Title 交互补全
- [ ] 标题编辑器支持 `@` 触发 ReferenceSelector（插入 inline reference）
- [ ] 标题编辑器支持 `#` 触发 TagSelector（应用 supertag）
- [ ] 标题编辑器支持 `Cmd+Enter` 切换 checkbox 状态

#### Shift+Arrow 连续多选中断问题
- [ ] 排查 Shift+↑/↓ 遍历逻辑对 TrailingInput 虚拟节点的处理（应跳过）
- [ ] 排查 Shift+↑/↓ 遍历逻辑对 field tuple 节点的处理（应纳入或跳过，保持连续）
- [ ] 补 Vitest 回归用例（含 trailing input + field row 场景）

#### 节点选中 — 后续增强 (#47)
- [ ] Cmd+Shift+D 批量复制
- [ ] 拖动选择优化（跨面板边界防护）
- **Spec**: `docs/features/node-selection.md`

#### 合并节点（Merge Nodes）
- [ ] 选中多个重复节点 → 合并为一个（保留第一个，合并 children/tags）
- [ ] 所有引用更新为指向合并后的节点
- **Spec**: `docs/features/references.md`

#### Floating Toolbar 后续 (#46)
- [ ] @ Reference 按钮
- [ ] # Tag 按钮
- **Spec**: `docs/features/floating-toolbar.md`

#### Slash Command — 后续命令点亮 (#48)
- [ ] Paste（剪贴板内容类型判断）
- [ ] Search node（依赖 #23）
- [ ] Image / file（依赖上传与存储）
- [ ] Checklist（批量 checkbox）
- **Spec**: `docs/features/slash-command.md`

#### Editor 粘贴增强（结构化粘贴）
- [ ] 多行纯文本粘贴：按行拆分为多个节点
- [ ] Markdown 列表粘贴：根据缩进重建节点树
- [ ] 富文本粘贴：保留基础结构语义
- [ ] 与撤销/重做集成
- **Spec**: `docs/features/editor-migration.md`

#### 性能基线测量
> **产出**: `docs/research/performance-baseline.md`

#### AI Command Nodes (#32) & AI 字段增强 (#33)
> AI 深度集成：Command Node（prompt/参数/输出全部是节点）、字段自动填充、AI 生成选项
- [ ] Command Node 数据模型 + 执行引擎
- [ ] AI 字段自动填充（基于上下文推断字段值）

### 暂缓 — 需要独立窗口 / Web 版后再考虑

> 以下视图类型在 Chrome Side Panel（300-700px）中体验受限。待支持独立窗口或 Web 版后重新评估。

#### Table View (#24)
- [ ] 表格视图（行=节点，列=字段）
- [ ] 列宽调整、列拖拽排序
- [ ] 列计算（Sum / Avg / Median / Min / Max / Count）
- **Spec**: `docs/_archive/features/views.md`

#### Cards View (#26)
- [ ] 卡片视图 + 拖拽更新字段值 + Banner 图片

#### Calendar View (#27)
- [ ] 日历视图 + 日/周/月切换 + 拖拽排期

#### List & Tabs View (#28)
- [ ] List 视图（双面板）+ Tabs 视图

---

## 已完成

| 日期 | 任务 | Agent | PR |
|------|------|-------|-----|
| 2026-02-26 | UI 设计系统合规优化 — Paper Shadow 浮层 + hover/selected token 统一（16 文件） | nodex-cc | #98 |
| 2026-02-26 | Search Node Step 0 数据模型锁定 — `queryCondition` NodeType + `QueryOp`(32 op) + query 属性 + Loro 读写 + `isOutlinerContentNodeType('search')` + 6 Vitest | nodex | main |
| 2026-02-26 | UI 细节打磨全部完成 — TopToolbar 对齐 + Breadcrumb 滚动规则 + TrailingInput 缩进 + 空节点光标 + 第二轮 review | antigravity | #96 #97 |
| 2026-02-26 | v5.0 UI 重构全量完成 — Phase 1-7（Token 迁移 + 硬编码色值 + 阴影移除 + 排版 15px/24px + 大纲几何 + Tag 排印化 + 隐形 UI + 顶栏重构） | antigravity | #93 #96 |
| 2026-02-24 | 统一时间线 Undo/Redo (#44) 全量完成 — Phase 1-4（commitDoc 覆盖 + PM→Loro 同步 + UI marker commit + 统一 ⌘Z handler） | nodex-codex + nodex-cc | #91 #92 |
| 2026-02-24 | Side Panel 布局改造 全量完成 — Phase 1-4（TopToolbar + ⌘K 重写 + Undo/Redo 按钮 + 清理废弃文件） | nodex-cc | #88 |
| 2026-02-24 | Undo/Redo Bug 1+3 修复 — bootstrap replacePanel + seed clearUndoHistory + 导航后 sink 聚焦 + TrailingInput Mod-z | nodex-cc + nodex | #92 + main |
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

以下 issue 属远期规划或非当前迭代范围：
Supabase 实时同步 (#34，已被 Cloudflare Sync 取代)、离线模式增强 (#35)、导入/导出 (#36)、Command Nodes (#37)、Title Expressions (#38)、Publishing (#39)、Input API (#40)。
