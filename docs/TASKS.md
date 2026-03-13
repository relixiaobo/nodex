# Task Board

> 所有任务的单一事实来源。Agent 通过 `Read docs/TASKS.md` 获取全局状态。
>
> **维护规则**：
> - 用户随手记录到「收件箱」，agent 启动时处理（归类到待办或直接处理）
> - Dev agent 接到任务后，第一步编辑此文件（更新 Agent 状态 + 移动/创建任务到「进行中」）
> - 任务完成后，nodex merge PR 时移动到「已完成」
> - **禁止 Dev Agent 执行 `gh pr merge`** — 只有 nodex 有权合并 PR。Dev Agent 完成后 `gh pr ready` 标记即可
>
> **历史记录**：已完成任务超过一周后归档到 `docs/_archive/COMPLETED-HISTORY.md`

---

## 收件箱

_(空)_

---

## Agent 状态

| Agent | 分支 | 任务 | 锁定文件 | 状态 |
|---|---|---|---|---|
| _(空)_ | | | | |

---

## 进行中

_(空)_

---

## 待办

### v0.1 — Chrome Web Store 上架

> **方法论**：本次上线聚焦 **Think → Connect** 闭环。Think 已基本完成（高亮、笔记、剪藏、Today 首屏），重点打磨 Connect 体验（搜索、视图、标签、字段）。Compound（上下文感知、AI）上线后根据用户反馈再定优先级。详见 `docs/product-philosophy.md`。

#### 上架准备

- [ ] **产品展示页** — 静态落地页（产品介绍 + 截图 + 安装链接 + 隐私政策），可托管在 Cloudflare Pages 或 GitHub Pages
- [ ] **About 101 板块** — What's New 后新增 "101" 区块（默认收起），放置产品使用指南/教程文章

#### Connect — 主战场

> Connect 的核心动作是**将相关节点聚到一起，观察和发现结构**（归纳法）。标签和链接在 Think 阶段已经完成了"标记关系"的工作，Connect 阶段需要好的"观察工具"来揭示结构。详见 `docs/research/102-connect-mechanisms-research.md`。
>
> 优先级按"降低发现和聚集摩擦"排序：

##### ~~1. View Toolbar — Filter / Sort / Group (#25)~~ ✓

> 已完成。Per-node view toolbar + Sort/Filter/Group + ViewDef 持久化 + 右键菜单。

##### 2. Search Node 字段过滤 (#23)

> **L2 查询聚集增强**。Search Node 目前只支持标签搜索，无法表达"所有 #insight 且 source 包含 'AI'"这样的条件。字段过滤让声明式聚集真正可用。

- [ ] Step 4: L1 字段过滤 UI — 芯片条增删改 + FIELD_IS/时间条件 + 计数提示
- [ ] Step 5: L2 AI 自然语言 — tool call 创建 queryCondition 树

##### 3. Supertags 完善 (#20)

> 降低打标签的摩擦 + 提升标签节点的可读性。

- [ ] Convert to supertag — 普通节点快捷转 tagDef
- [ ] Title expression — `${field name}` 动态标题
- [ ] Pinned fields — 置顶显示 + filter 优先
- [ ] Optional fields — 建议按钮 + 自动降级

##### 4. 其他 Connect 基础设施

- [ ] AttrDef "Used in" 计算字段 (#21)
- [ ] Pinned fields (#21)
- [ ] 自然语言日期解析（@next Monday / @November / @last week）(#22)
- [ ] 日记模板（#day supertag 配置）(#22)
- [ ] 日期字段链接到日节点 (#22)
- [ ] Trash 交互优化 — 批量选中删除、右键菜单、自动清理策略（30 天）
- [ ] 图片节点支持 — 节点嵌入/展示图片（上传、粘贴、拖拽），存储走 R2

---

### 上线后 — Compound & AI

> 基于 pi-mono (pi-ai + pi-agent-core) 架构，分 6 Phase 实施。Phase 0 已完成。详细计划见 `docs/plans/`。

#### 上下文感知 Sidebar

> 三层渐进披露：L1 低调 badge → L2 标题列表 → L3 导航到节点。从 URL 精确匹配起步，精确率 > 召回率。

- [ ] v1: URL 精确匹配 — 当前页 URL 匹配已有 #source → 工具栏 badge 显示关联数
- [ ] v2: 关键词/语义匹配 — 扩展到同域名、主题相关的笔记匹配
- [ ] v3: 共读模式（远期）— 用户主动激活，侧边栏持续展示与当前页相关的笔记

#### AI — 照亮你的思考

> AI 不替你思考，而是把你自己的思考照亮。

##### ~~Phase 0: 基座 — pi-mono 集成 + 最小 Chat~~ ✓ (#125, 2026-03-12)
- [x] Server: Hono `/api/stream` proxy endpoint（pi-ai streaming → ProxyAssistantMessageEvent SSE）
- [x] Client: Agent 工厂 + streamProxy 集成 + API key (chrome.storage.local)
- [x] UI: ChatDrawer（独立于 PanelStack，⌘L 切换）+ 流式消息 + 空状态 + API key 设置

##### ~~Phase 1: 画布 — node tool + Chat 成熟化~~ ✓ (#126, 2026-03-12)
> 工具定义：`docs/plans/tool-definitions.md` | 实施计划：`docs/plans/phase-1-canvas.md`
- [x] node tool（5 actions）+ undo tool（AI 操作隔离，origin `ai:chat` + 专用 aiUndoManager）
- [x] System prompt 从 #agent 节点加载 + `<system-reminder>` 动态上下文注入
- [x] API key 迁移到 Settings 节点字段 + Agent 配置（model/temp）迁移到 #agent 节点字段
- [x] Reference 渲染（`<ref>` inline + `<cite>` 角标）+ Tool call 折叠渲染
- [x] Chat 持久化（IndexedDB）+ ⌘K 集成

##### ~~Phase 1.5: AI 工具体系重构~~ ✓ (#127, 2026-03-12)
> 实施计划：`docs/plans/phase-1.5-node-tool-gaps.md`
- [x] 拆分 node tool → 6 个独立工具（node_create/node_read/node_edit/node_delete/node_search/undo）
- [x] node_create — children 批量子树 + fields 便利参数 + reference + sibling + duplicate
- [x] node_read — fields 增强（type/entryId/options）+ children isReference
- [x] node_edit — fields 便利参数
- [x] node_search — fuzzy-search + filter-utils + backlinks + sort-utils
- [x] node_delete — restore 恢复
- [x] 测试 + tool-definitions.md 更新 + 代码优化（DRY + 基础设施复用）

##### Phase 1.5.1: Data Access Layer
> 实施计划：`docs/plans/phase-1.5.1-data-access-layer.md`
- [x] node_read — 返回 type + nodeData（节点底层属性）
- [x] node_edit — 新增 `data` 参数（Record<string, unknown>）+ 移除 `content` 参数
- [x] node_create — 新增 `data` 参数
- [x] BLOCKED_KEYS 安全限制（children/tags/name/richText/marks/inlineRefs/id/timestamps；edit 禁止 type）
- [x] 测试覆盖 + tool description 更新

##### Phase 2: 阅读环 — Clip & Spark
- [x] Step 1: Spark extraction — ai-spark.ts + shadow cache + extraction presets + webclip integration
- [ ] Clip Spark 三轮认知压缩（skeleton → flesh → soul）
- [ ] 碰撞策略（graph-search，非 embedding）
- [ ] #skill 节点提取模式学习

##### Phase 3: 浏览器 — browser tool（17 actions）+ CDP
> 工具定义：`docs/plans/tool-definitions.md` | 实施计划：`docs/plans/phase-3-browser.md`
- [x] Batch 1: 观察 — get_text + get_metadata + find + get_selection（Content Script + page-capture）
- [ ] Batch 2: 截图 + 基础交互 — screenshot + click + type + scroll + navigate + tab（CDP）
- [ ] Batch 3: 深度交互 — key + fill_form + drag + wait + execute_js
- [ ] Batch 4: 调试 — read_network + read_console（CDP）

##### Phase 4: 编排 — AgentOrchestrator
- [ ] AgentMessageBus (EventTarget) + AgentOrchestrator (delegate/cancel)
- [ ] 后台任务 UI（badge + 任务列表）
- [ ] 求助流（clarification）+ 并发 subagent

##### Phase 5: 认知 — Taste 学习 + Review 引擎
- [ ] Schema evolution skill（OpLog Correction 分析 → #skill 规则派生）
- [ ] /review 命令（认知镜像：新结构、升级、矛盾、同构）

---

### 编辑器增强 & 交互完善

- [ ] 节点选中增强 (#47) — Cmd+Shift+D 批量复制、拖动选择优化
- [ ] 合并节点 — 选中多个重复节点 → 合并为一个（保留第一个，合并 children/tags）
- [ ] **数学公式渲染** — 支持 LaTeX/KaTeX 公式在节点中展示（行内 `$...$` + 块级 `$$...$$`）
- [ ] Floating Toolbar: @ Reference 按钮
- [ ] Slash Command 后续 (#48) — Paste / Search node / Image / Checklist
- [ ] 性能基线测量
- [ ] AI Command Nodes (#32) — Command Node 数据模型 + 执行引擎 + AI 字段自动填充

---

### 多工作区 & 协作

> 每个工作区 = 独立 LoroDoc，隔离存储/同步/权限。官方工作区是第一个用例。

- [ ] **工作区模型** — Workspace 元数据（id、name、role、type）+ 切换器 UI
- [ ] **独立 LoroDoc** — 每个工作区独立的 LoroDoc 实例，独立持久化和同步
- [ ] **权限模型** — role: `owner` / `editor` / `viewer`，UI 层 + LoroDoc 层双重写保护
- [ ] **官方工作区** — soma 维护的只读工作区（About / Changelog / Help Center / 设计哲学），预置或从服务端拉取
- [ ] **跨工作区引用** — 节点可链接到其他工作区的节点（link，不复制数据）
- [ ] **协作工作区** — 多用户共享工作区，基于 Loro CRDT 天然支持多人编辑

---

### 暂缓 — 需要独立窗口 / Web 版后再考虑

> 以下视图类型在 Chrome Side Panel（300-700px）中体验受限。

- [ ] Table View (#24) — 表格视图 + 列宽调整 + 列计算
- [ ] Cards View (#26) — 卡片视图 + 拖拽更新字段值
- [ ] Calendar View (#27) — 日历视图 + 日/周/月切换
- [ ] List & Tabs View (#28) — List 双面板 + Tabs 视图

---

## 已完成（最近一周）

| 日期 | 任务 | Agent | PR |
|------|------|-------|-----|
| 2026-03-12 | Phase 1.5: AI 工具体系重构 — node tool 拆分为 6 独立工具 + create/read/edit/search 增强 + shared.ts 公共层 + 代码优化 | codex + nodex | #127 |
| 2026-03-12 | Phase 1: 画布 — node tool + undo tool + #agent 系统节点 + API key 迁移 + Reference 渲染 + Chat 持久化 + ⌘K 集成 | codex | #126 |
| 2026-03-12 | Phase 0: AI 基座 — pi-mono proxy + ChatDrawer (流式聊天 + API key 管理 + Mod+L 快捷键) | codex | #125 |
| 2026-03-11 | AI 实施计划 Review — 6 Phase 计划文档交叉验证 + 3 轮修正（MV3 宿主模型、contract 收敛、并行策略） | codex | #124 |
| 2026-03-11 | 网页抓取基础设施重构 — clip/x.com/Google Docs/GitHub/YouTube 的增强抓取迁移到独立 page capture 栈，orchestrator + site extractors + background transport | codex | #123 |
| 2026-03-11 | Clip 节点结构调整 — #highlight → Highlights 字段 + Source URL → URL + 旧数据自动迁移 | codex | #122 |
| 2026-03-11 | 移除 LIBRARY/INBOX 作为默认目标 — 创建路径改用 ensureTodayNode()，搜索路径遍历 workspace children | codex | #121 |
| 2026-03-11 | 统一散落的复用模式 — resolveEffectiveId() + useDragDropRow() hook + isNodeInTrash() + SYSTEM_NODE_IDS 重命名 | codex | #120 |
| 2026-03-10 | 消除 Container Node 概念 — Container 变为普通 node + locked；Settings 改为标准节点页面 | codex | #119 |
| 2026-03-07 | 高亮点击呼出笔记 — 点击高亮文本打开笔记浮窗，链接/按钮放行原生行为 | nodex | main |
| 2026-03-07 | 高亮交互清理 — 移除 HIGHLIGHT_CLICK 死代码 + updateSaveButtonState no-op | nodex | main |
| 2026-03-06 | About 分离为 app panel + Settings 数据迁移 — About 从节点→纯 UI 路由(`app:about`)；Settings highlightEnabled 从 ui-store→LoroDoc 字段 + chrome.storage 投影 | nodex | main |
> 更早的已完成记录见 `docs/_archive/COMPLETED-HISTORY.md`

### 已关闭的远期/非开发任务

以下 issue 属远期规划或非当前迭代范围：
Supabase 实时同步 (#34，已被 Cloudflare Sync 取代)、离线模式增强 (#35)、导入/导出 (#36)、Command Nodes (#37)、Title Expressions (#38)、Publishing (#39)、Input API (#40)。
