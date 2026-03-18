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
| nodex-claude | claude/command-palette-chat-integration | ⌘K Chat 融合 (#150) | 待执行 |
| nodex-gemini | — | 空闲 | — |
| nodex-codex | — | 空闲 | — |

---

## 进行中

- [ ] **⌘K Chat 融合** — nodex-claude (#150)
- [ ] **Chat 持久化 Phase 4 方案设计** — nodex（出设计方案中）

---

## 待办

### v0.1 — Chrome Web Store 上架

> **方法论**：本次上线聚焦 **Think → Connect** 闭环。Think 已基本完成（高亮、笔记、剪藏、Today 首屏），重点打磨 Connect 体验（搜索、视图、标签、字段）。Emerge（上下文感知、AI 认知工作流）上线后根据用户反馈再定优先级。详见 `docs/product-philosophy.md`。

#### 上架准备

- [ ] **产品展示页** — 静态落地页（产品介绍 + 截图 + 安装链接 + 隐私政策），可托管在 Cloudflare Pages 或 GitHub Pages
- [ ] **About 101 板块** — What's New 后新增 "101" 区块（默认收起），放置产品使用指南/教程文章

#### Connect — 主战场

> Connect 的核心动作是**将相关节点聚到一起，观察和发现结构**（归纳法）。标签和链接在 Think 阶段已经完成了"标记关系"的工作，Connect 阶段需要好的"观察工具"来揭示结构。详见 `docs/research/102-connect-mechanisms-research.md`。

##### 1. Search Node AI 自然语言过滤 (#23)

> Search Node 目前只支持标签搜索。queryCondition 节点默认隐藏，用户只看到一行可编辑的自然语言搜索描述。编辑后提交 → AI 重新生成 queryCondition 树 → 刷新搜索结果。

- [ ] Search Node 自然语言条件编辑 — 可编辑描述行 + AI 生成/更新 queryCondition（隐藏） + 结果刷新

##### 2. Table View (#24)

> Search Node + Table View + AI 是核心组合：AI 创建结构化节点（带 tag + fields） → Table View 按字段列展示 → 用户可排序/编辑。Side Panel 宽度足够显示 3-5 列的简洁表格。

- [ ] Table View 基础 — viewDef 节点 + 字段列渲染 + 列宽调整
- [ ] Search Node 结果以 Table 展示 — viewDef 关联到 search node

---

### AI — 照亮你的思考

> AI 不替你思考，而是把你自己的思考照亮。基于 pi-mono 架构，按 Infrastructure Layer × Feature Track 实施。架构概览见 CLAUDE.md「AI 架构概览」。

#### 已完成

- ~~Layer 0: Agent Runtime~~ ✓ — pi-mono proxy + ChatDrawer + 6 node tools + undo + data access layer + #agent 配置 + Chat 持久化
- ~~Layer 1: 多 Agent 运行时~~ ✓ — Spark 直接 LLM 调用 + #agent 节点配置（绕过 createAgent）
- ~~Layer 2 Step 1~~ ✓ — transformContext + convertToLlm + getApiKey (#132)
- ~~Layer 2 Step 2~~ ✓ — Skill 渐进式披露 (#134)
- ~~Context 图片生命周期~~ ✓ — 滑动窗口 + 持久化剥离 (#133)
- ~~Track C: Browser~~ ✓ — 页面观察 + CDP 截图/交互/调试
- ~~Spark #agent 重构~~ ✓ — 系统提示词存为子节点，删除 extraction-presets.ts

#### Wave 1: 清理 + 验证

- [x] 清理 is/has/about — 删除 `ensureSourceMetadataFieldDefs()` + NDX_F17-19
- [x] Spark 提示词重构 — napkin 极限压缩 + 骨架/血肉自然嵌套 + 零术语/自检/承重区分规则
- [x] 验证 Spark 端到端 — clip 页面 → #spark 子节点生成（餐巾纸 name + 递归 children）

#### Wave 1.5: Spark 交互优化（Clip → Spark 闭环）

> ✅ 已完成。三态 #spark 节点 + 统一 clip 管线。

- [x] #spark 节点三态交互 — pending（✦ Generate Spark 按钮）/ loading（bullet 转圈）/ complete（餐巾纸 + children）
- [x] 主动 clip 自动触发 — ⌘K / /clip 路径自动进入 loading
- [x] 被动 clip 不触发 — 高亮/笔记路径只创建 pending 节点
- [x] 统一 clip 管线 — 4 条 clip 路径共享 `applyClipData()` 管线，修复 `/clip` 路径缺失 content cache 的问题
- [x] Spark API 简化 — 4 个清晰公开函数（ensureSparkPlaceholder / triggerSparkExtraction / autoTriggerSpark / handleSparkClick）
- [x] BulletChevron 泛化 — `isSparkNode` 改为通用 `spinnerStyle?: 'pulse' | 'spin'`
- [x] Spark commit origin 修正 — 使用 `SPARK_COMMIT_ORIGIN ('ai:spark')` 替代错误的 `AI_COMMIT_ORIGIN ('ai:chat')`
- [x] 无 API key 态 — 点击 Generate Spark 自动跳转 Settings 配置页

#### Wave 2: #skill 基础设施 + 渐进式披露 ✅

- [x] `#skill` tagDef + Skills field（options_from_supertag）+ `buildAgentSystemPrompt()` 渐进式 `<available-skills>` 索引
- [x] 默认 Skill creator 技能 — 教 AI 帮用户创建/编辑 #skill 节点（替换早期 3 个 generic 占位 skill）
- [x] 测试覆盖 — readSkillIds、索引渲染、空 skill、description fallback
- [x] 修复 options value 导航 — `resolvePanelNavigationNodeId` 统一解析任何指针节点的 `targetId`

#### Wave 3+: 后续

> 以下按 Wave 分组。

**Track A: Chat** — 设计：`ai-context-management.md`（统一方案，含持久化 + 压缩 + 同步）

- [x] Chat UI 打磨 — 视觉对齐 + 消息分组 + Z 轴层次 (#135, Gemini → nodex)
- [x] Chat Debug 模式 — 隐藏上下文检查器 (#136, Codex)
- [x] Desk/Card 布局 — Z 轴分层 + Chrome-tab + resize handle | nodex | main
- [x] Chat Phase 1A — 消息树数据模型 + 算法 + 测试（`ai-chat-tree.ts` 新建）(#138, Codex)
- [x] Chat Phase 1B — 集成 + IndexedDB 迁移 + 事件驱动持久化（`ai-persistence.ts` 重写 + `ai-service.ts` + `use-agent.ts`）(#139, Codex)
- [x] Chat Phase 2 — 编辑消息 + 重新生成 + 分支导航 UI（`← 2/3 →` 箭头）(#141, Codex)
- [x] Chat Phase 3 — Context 自动压缩（Bridge Message + Handoff Memo）(#140, Codex)
- [x] **截图工具结果修复** — 占位符统一为 `IMAGE_PLACEHOLDER` 常量（模型可理解的文案），ToolCallBlock UI 检测占位符显示图片图标而非原始文本
- [x] **Extended Thinking** — 模型选择器 toggle + Low/Med/High 等级 + 会话持久化 + 可折叠 Thought block + server 端 `streamSimple` 修复 (#146)
- [x] **Chat 分支消息审计** — regenerate 改用 `agent.continue()` 替代 `agent.prompt()`，修复重复 user 消息 + switchBranch 持久化 + toolResult 续接 (#148)
- [ ] **⌘K Chat 融合** — Chat 历史搜索 + AI 模式 Tab 切换 + Ask AI 始终可见 + New Chat 命令（设计：`command-palette-chat-integration.md`）
- [ ] Chat 持久化 Phase 4 — 跨设备同步完整原始对话历史（Sync API + D1/R2）

**Track B: 阅读环** — 设计：`phase-2-reading-ring.md`

- [ ] Spark 质量提升 — 三轮认知压缩优化 + 进度 UI
- [ ] 碰撞策略 v0→v1 — agent 驱动 node_search 渐进式碰撞
- [ ] #skill 提取模式 — 依赖 Layer 2 Step 2

**Layer 3: 编排** — 设计：`phase-4-orchestration.md`

- [ ] AgentOrchestrator + subagent delegation
- [ ] 后台任务 UI（badge + 任务列表）
- [ ] 求助流（clarification）

**Track D: 认知** — 设计：`phase-5-cognition.md`

- [ ] Taste 学习 — Schema evolution skill（OpLog Correction → #skill 规则）
- [ ] /review 命令 — 认知镜像（新结构、升级、矛盾、同构）

**其他 AI**

- [ ] YouTube 抓取增强 — 获取视频 transcript
- [ ] 上下文感知 Sidebar — URL 匹配 → 关键词匹配 → 共读模式

---

### 图片节点支持

> 设计：`docs/plans/image-node-support.md`（v3，已 review）

- [ ] **Phase 1a: 后端基础设施** — R2 桶 + POST 上传 + GET 读取(media token 鉴权) + D1 images 表 + quota/rate limit
- [ ] **Phase 1b: 客户端管线 + Editor 粘贴** — image-upload.ts（智能压缩 + hash + IndexedDB 暂存）+ media token 管理 + ProseMirror handlePaste + ImageNodeRenderer loading/error/retry
- [ ] **Phase 1c: Slash command** — 启用 /image 命令 + 文件选择器
- [ ] **Phase 2: AI 集成** — node_read 返回 ImageContent + node_create 支持 imageData + NDX_F.IMAGE_DESCRIPTION fieldDef + 客户端异步描述生成 + ToolCallBlock 图片渲染
- [ ] **Phase 3: 生态** — Chat 输入图片粘贴 + 剪藏图片重存(webclip-service) + Tana 存量迁移 + 离线队列 + lightbox

---

### 编辑器增强 & 交互完善

- [ ] 节点选中增强 (#47) — Cmd+Shift+D 批量复制、拖动选择优化
- [ ] 合并节点 — 选中多个重复节点 → 合并为一个（保留第一个，合并 children/tags）
- [ ] **数学公式渲染** — 支持 LaTeX/KaTeX 公式在节点中展示（行内 `$...$` + 块级 `$$...$$`）
- [ ] Floating Toolbar: @ Reference 按钮 (#46)
- [ ] Slash Command 后续 (#48) — Paste / Search node / Checklist
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

### 暂缓

#### Connect 增强（上线后根据反馈定优先级）

- [ ] Supertags 完善 — Convert to supertag / Title expression / Pinned fields / Optional fields
- [ ] 日期增强 — 自然语言日期解析 / 日记模板 / 日期字段链接到日节点 (#22)
- [ ] Trash 交互优化 — 批量选中删除、右键菜单、自动清理策略（30 天）

#### 视图类型（需要独立窗口 / Web 版）

- [ ] Cards View (#26) — 卡片视图 + 拖拽更新字段值
- [ ] Calendar View (#27) — 日历视图 + 日/周/月切换
- [ ] List & Tabs View (#28) — List 双面板 + Tabs 视图

---

## 已完成（最近一周）

| 日期 | 任务 | Agent | PR |
|------|------|-------|-----|
| 2026-03-18 | ⌘K Chat 融合计划 + 图片节点计划 v3 合并 + 窄屏单面板布局修复 + NodeReference inline 修复 + ChatInput 圆角对齐 | nodex | main |
| 2026-03-17 | Chat 自动摘要标题 + AI Debug 迁移 Settings + ref 渲染修复 + 设计系统合规 + overscroll 修复 | nodex | main |
| 2026-03-17 | Chat 分支消息审计 — regenerate/edit 改用 `agent.continue()`，修复重复 user 消息 + switchBranch 持久化 + toolResult 续接 | codex | #148 |
| 2026-03-16 | Extended thinking 修复 — server 端 `stream` → `streamSimple` 使 reasoning 参数正确传递 | codex | #146 |
| 2026-03-16 | 多 Provider AI 设置 — Settings 多 provider 配置 + Composer model 选择器 + 旧设置迁移 + Chat Debug 增强 | codex | #145 |
| 2026-03-15 | Chat as Panel — Chat 晋升为面板级，与 NodePanel 同层同权，Agent 注册表支持多 Chat 并排 | codex | #144 |
| 2026-03-15 | Chat toggle + Notes dropdown — 窄屏全屏切换 + 下拉面板选择器 + ✦ 按钮 | codex | #143 |
| 2026-03-15 | Chat Phase 1B — 集成 + IndexedDB 迁移 + 事件驱动持久化 | codex | #139 |
| 2026-03-15 | Chat Phase 1A — 消息树数据模型 + 算法 + 测试 (`ai-chat-tree.ts`) | codex | #138 |
| 2026-03-15 | 多面板 Phase 2.5 — 窄屏 Chrome-tab 标签模式 + 凹角连接器 + 桌面底色加深 + Breadcrumb dead code 清理 | nodex | main |
| 2026-03-14 | 多面板 Phase 2 — N 面板并排 + 独立浮动卡片 + 全局 navHistory + 异形标签 + 活跃指示器 | nodex | main |
| 2026-03-14 | Desk/Card Z 轴布局 — 桌面/纸张双层 + Chrome-tab 面包屑 + 可拖拽 resize + 设计系统更新 | nodex | main |
| 2026-03-14 | Chat UI 视觉打磨 — 设计系统对齐 + 消息分组 + 空态引导按钮 + Z 轴层次 | nodex | main |
| 2026-03-14 | Chat Debug 模式 — 隐藏上下文检查器（system prompt / dynamic context / messages / tools / token 估算）| codex | #136 |
| 2026-03-14 | Skill 重设计 — 删除 3 个 generic skill，新增 Skill creator + 修复 options value 导航 | nodex | main |
| 2026-03-14 | #skill 基础设施 + 渐进式披露 — `<available-skills>` 索引 + 测试 | codex | #134 |
| 2026-03-14 | Spark 交互优化 + clip 管线统一 — 三态 #spark 节点 + `applyClipData()` 共享管线 + API 简化 + commit origin 修正 | nodex | main |
| 2026-03-13 | x.com 抓取深度增强 — per-tweet author/timestamp/repost/pinned + quote tweet 提取 | nodex | main |
| 2026-03-13 | 修复 Chat 历史不显示 — StrictMode 双重 effect race condition (restorePromise 共享) | nodex | main |
| 2026-03-13 | 修复 AI browser tool get_text — stripHtml 保留块级标签换行 | nodex | main |
| 2026-03-13 | AI 上下文图片生命周期 — 滑动窗口 + 持久化剥离 + 轻量签名，修复多轮截图崩溃 | codex | #133 |
| 2026-03-13 | AI Context Refactor Step 1 — transformContext + convertToLlm + getApiKey + ai-proxy 提取 | codex | #132 |
| 2026-03-13 | Browser tool 审计优化 — 修正参数描述、移除冗余返回值、添加分页提示 | nodex | main |
| 2026-03-13 | Track C: 浏览器工具 (#131) — CDP screenshot + interaction + debugging | codex | #131 |
| 2026-03-13 | 多 Agent 工作流重构 — 固定 worktree + PR 协作流程，移除 dispatcher/subagent 模式 | nodex | main |
| 2026-03-13 | Track C Batch 1: browser tool 观察能力 — get_text + get_metadata + find + get_selection | codex | main |
| 2026-03-13 | Spark 结构提取 — ai-spark.ts + shadow cache + extraction presets + webclip 集成 | claude | main |
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
> 更早的已完成记录见 `docs/_archive/COMPLETED-HISTORY.md`

### 已关闭的远期/非开发任务

以下 issue 属远期规划或非当前迭代范围：
Supabase 实时同步 (#34，已被 Cloudflare Sync 取代)、离线模式增强 (#35)、导入/导出 (#36)、Command Nodes (#37)、Title Expressions (#38)、Publishing (#39)、Input API (#40)。
