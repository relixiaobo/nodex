# Task Board

> 所有任务的单一事实来源。Agent 通过 `Read docs/TASKS.md` 获取全局状态。
>
> **维护规则**：
> - nodex 创建 feature branch + Draft PR（PR body 是 Dev Agent 唯一指令来源）
> - Dev Agent 在对应 worktree 中 checkout branch 执行，完成后 push + `gh pr ready`
> - **禁止 Dev Agent 执行 `gh pr merge`** — 只有 nodex 有权合并 PR
> - nodex merge 后更新此文件 + `docs/changelog-next.md`
>
> **历史记录**：已完成任务超过一周后归档到 `docs/_archive/COMPLETED-HISTORY.md`

---

## 收件箱

_(空)_

---

## Agent 状态

| 工作区 | 分支 | 任务 | 状态 |
|--------|------|------|------|
| nodex-claude | feat/phase-2-reading-loop | Phase 2: 阅读环 (#130) | 待开始 |

---

## 进行中

- [ ] **Phase 2: 阅读环** (#130) — Review 现有 Spark 实现 → Round 3 Soul → 碰撞策略 → #skill 节点 `→ nodex-claude`

---

## 待办

### v0.1 — Chrome Web Store 上架

> **方法论**：本次上线聚焦 **Think → Connect** 闭环。Think 已基本完成（高亮、笔记、剪藏、Today 首屏），重点打磨 Connect 体验（搜索、视图、标签、字段）。Compound（上下文感知、AI）上线后根据用户反馈再定优先级。详见 `docs/product-philosophy.md`。

#### 上架准备

- [ ] **产品展示页** — 静态落地页（产品介绍 + 截图 + 安装链接 + 隐私政策），可托管在 Cloudflare Pages 或 GitHub Pages
- [ ] **About 101 板块** — What's New 后新增 "101" 区块（默认收起），放置产品使用指南/教程文章

#### Connect — 主战场

> Connect 的核心动作是**将相关节点聚到一起，观察和发现结构**（归纳法）。标签和链接在 Think 阶段已经完成了"标记关系"的工作，Connect 阶段需要好的"观察工具"来揭示结构。详见 `docs/research/102-connect-mechanisms-research.md`。

##### 1. Search Node 字段过滤 (#23)

> Search Node 目前只支持标签搜索，无法表达"所有 #insight 且 source 包含 'AI'"这样的条件。

- [ ] Step 4: L1 字段过滤 UI — 芯片条增删改 + FIELD_IS/时间条件 + 计数提示
- [ ] Step 5: L2 AI 自然语言 — tool call 创建 queryCondition 树

##### 2. Supertags 完善

> 降低打标签的摩擦 + 提升标签节点的可读性。

- [ ] Convert to supertag — 普通节点快捷转 tagDef
- [ ] Title expression — `${field name}` 动态标题
- [ ] Pinned fields — 置顶显示 + filter 优先
- [ ] Optional fields — 建议按钮 + 自动降级

##### 3. 其他 Connect 基础设施

- [ ] 自然语言日期解析（@next Monday / @November / @last week）(#22)
- [ ] 日记模板（#day supertag 配置）(#22)
- [ ] 日期字段链接到日节点 (#22)
- [ ] Trash 交互优化 — 批量选中删除、右键菜单、自动清理策略（30 天）
- [ ] 图片节点支持 — 节点嵌入/展示图片（上传、粘贴、拖拽），存储走 R2

---

### AI — 照亮你的思考

> AI 不替你思考，而是把你自己的思考照亮。基于 pi-mono 架构，分 Phase 实施。详细计划见 `docs/plans/`。

#### 已完成

- ~~Phase 0: 基座~~ ✓ — pi-mono proxy + ChatDrawer + API key (#125)
- ~~Phase 1: 画布~~ ✓ — node/undo tool + #agent 配置 + Reference/ToolCall 渲染 + Chat 持久化 (#126)
- ~~Phase 1.5: 工具重构~~ ✓ — 拆分为 6 独立工具 + create/read/edit/search 增强 (#127)
- ~~Phase 1.5.1: Data Access Layer~~ ✓ — node_read/edit/create 的 `data` 参数 + BLOCKED_KEYS (#129)
- ~~Phase 2 Step 1: Spark 提取~~ ✓ — ai-spark.ts + shadow cache + extraction presets + webclip 集成
- ~~Phase 3 Batch 1: 浏览器观察~~ ✓ — get_text + get_metadata + find + get_selection
- ~~Phase 3: 浏览器工具~~ ✓ — CDP screenshot + interaction + debugging
- ~~Context Refactor Step 1~~ ✓ — transformContext + convertToLlm + getApiKey (#132)

#### Phase 2: 阅读环 — Clip & Spark

- [ ] Spark 三轮认知压缩（skeleton → flesh → soul）
- [ ] 碰撞策略（graph-search，非 embedding）
- [ ] #skill 节点提取模式学习

#### Phase 3: 浏览器 — browser tool + CDP

> 工具定义：`docs/plans/tool-definitions.md` | 实施计划：`docs/plans/phase-3-browser.md`

- [x] Batch 2: 截图 + 基础交互 — screenshot + click + type + scroll + navigate + tab（CDP）
- [x] Batch 3: 深度交互 — key + fill_form + drag + wait + execute_js
- [x] Batch 4: 调试 — read_network + read_console（CDP）
- [ ] YouTube 抓取增强 — 获取视频 transcript（`/transcript` 或 API），替代当前仅 author 元数据的提取

#### Phase 4: 编排 — AgentOrchestrator

- [ ] AgentMessageBus (EventTarget) + AgentOrchestrator (delegate/cancel)
- [ ] 后台任务 UI（badge + 任务列表）
- [ ] 求助流（clarification）+ 并发 subagent

#### Phase 5: 认知 — Taste 学习 + Review 引擎

- [ ] Schema evolution skill（OpLog Correction 分析 → #skill 规则派生）
- [ ] /review 命令（认知镜像：新结构、升级、矛盾、同构）

#### 上下文感知 Sidebar

> 三层渐进披露：L1 低调 badge → L2 标题列表 → L3 导航到节点。

- [ ] v1: URL 精确匹配 — 当前页 URL 匹配已有 #source → 工具栏 badge 显示关联数
- [ ] v2: 关键词/语义匹配 — 扩展到同域名、主题相关的笔记匹配
- [ ] v3: 共读模式（远期）— 侧边栏持续展示与当前页相关的笔记

---

### 编辑器增强 & 交互完善

- [ ] 节点选中增强 (#47) — Cmd+Shift+D 批量复制、拖动选择优化
- [ ] 合并节点 — 选中多个重复节点 → 合并为一个（保留第一个，合并 children/tags）
- [ ] **数学公式渲染** — 支持 LaTeX/KaTeX 公式在节点中展示（行内 `$...$` + 块级 `$$...$$`）
- [ ] Floating Toolbar: @ Reference 按钮 (#46)
- [ ] Slash Command 后续 (#48) — Paste / Search node / Image / Checklist
- [ ] 性能基线测量

---

### 多工作区 & 协作

> 每个工作区 = 独立 LoroDoc，隔离存储/同步/权限。官方工作区是第一个用例。

- [ ] **工作区模型** — Workspace 元数据（id、name、role、type）+ 切换器 UI
- [ ] **独立 LoroDoc** — 每个工作区独立的 LoroDoc 实例，独立持久化和同步
- [ ] **权限模型** — role: `owner` / `editor` / `viewer`，UI 层 + LoroDoc 层双重写保护
- [ ] **官方工作区** — soma 维护的只读工作区（About / Changelog / Help Center / 设计哲学）
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
| 2026-03-13 | AI 上下文图片生命周期 — 滑动窗口 + 持久化剥离 + 轻量签名，修复多轮截图崩溃 | codex | #133 |
| 2026-03-13 | AI Context Refactor Step 1 — transformContext + convertToLlm + getApiKey + ai-proxy 提取 | codex | #132 |
| 2026-03-13 | Browser tool 审计优化 — 修正参数描述、移除冗余返回值、添加分页提示 | nodex | main |
| 2026-03-13 | Phase 3: 浏览器工具 (#131) — CDP screenshot + interaction + debugging | codex | #131 |
| 2026-03-13 | 多 Agent 工作流重构 — 固定 worktree + PR 协作流程，移除 dispatcher/subagent 模式 | nodex | main |
| 2026-03-13 | Phase 3 Batch 1: browser tool 观察能力 — get_text + get_metadata + find + get_selection | codex | main |
| 2026-03-13 | Phase 2 Step 1: Spark 结构提取 — ai-spark.ts + shadow cache + extraction presets + webclip 集成 | claude | main |
| 2026-03-13 | Chat/Panel UI 优化调研计划 — 详细实施方案 `docs/plans/ui-chat-panel-redesign.md` | gemini + nodex | — |
| 2026-03-12 | Phase 1.5.1: Data Access Layer — node_read/edit/create data 参数 + BLOCKED_KEYS 安全限制 | codex | #129 |
| 2026-03-12 | Phase 1.5: AI 工具体系重构 — node tool 拆分为 6 独立工具 + 增强 + 代码优化 | codex + nodex | #127 |
| 2026-03-12 | Phase 1: 画布 — node tool + undo tool + #agent + Reference 渲染 + Chat 持久化 + ⌘K | codex | #126 |
| 2026-03-12 | Phase 0: AI 基座 — pi-mono proxy + ChatDrawer + API key 管理 | codex | #125 |
| 2026-03-11 | AI 实施计划 Review — 6 Phase 计划文档交叉验证 + 3 轮修正 | codex | #124 |
| 2026-03-11 | 网页抓取基础设施重构 — page capture 栈独立化 | codex | #123 |
| 2026-03-11 | Clip 节点结构调整 — #highlight → Highlights 字段 + Source URL → URL | codex | #122 |
| 2026-03-11 | 移除 LIBRARY/INBOX — 创建路径改用 ensureTodayNode() | codex | #121 |
| 2026-03-11 | 统一复用模式 — resolveEffectiveId() + useDragDropRow() + isNodeInTrash() | codex | #120 |
| 2026-03-10 | 消除 Container Node — Container 变为 node + locked；Settings 标准页面 | codex | #119 |
> 更早的已完成记录见 `docs/_archive/COMPLETED-HISTORY.md`

### 已关闭的远期/非开发任务

以下 issue 属远期规划或非当前迭代范围：
Supabase 实时同步 (#34，已被 Cloudflare Sync 取代)、离线模式增强 (#35)、导入/导出 (#36)、Command Nodes (#37)、Title Expressions (#38)、Publishing (#39)、Input API (#40)。
