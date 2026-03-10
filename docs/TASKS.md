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

##### 1. View Toolbar — Filter / Sort / Group (#25)

> **L0 标签聚集的最后一公里**。用户能打标签、能搜索，但结果是一个平铺列表，无法 filter/sort/group。没有视图工具栏，标签和字段只是装饰。

- [x] Per-node view toolbar UI（Sort / Filter / Group 图标栏）
- [x] Sort by：单级排序（Name / Created / 标签字段 + asc/desc）
- [x] ViewDef 节点持久化（type='viewDef' + sortField/sortDirection 直接属性）
- [x] 右键菜单 "Sort by" 子菜单
- [x] Filter by：按字段值/标签/checkbox 状态过滤
- [x] Group by：按字段值分组

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

> 笔记积累到一定量后才有价值。上线后根据用户使用数据和反馈决定优先级。详见 `docs/product-philosophy.md` § Compound。

#### 上下文感知 Sidebar

> 三层渐进披露：L1 低调 badge → L2 标题列表 → L3 导航到节点。从 URL 精确匹配起步，精确率 > 召回率。

- [ ] v1: URL 精确匹配 — 当前页 URL 匹配已有 #source → 工具栏 badge 显示关联数
- [ ] v2: 关键词/语义匹配 — 扩展到同域名、主题相关的笔记匹配
- [ ] v3: 共读模式（远期）— 用户主动激活，侧边栏持续展示与当前页相关的笔记

#### AI — 照亮你的思考

> AI 不替你思考，而是把你自己的思考照亮。详见 `docs/product-philosophy.md` § AI 照亮的时机。

- [ ] **笔记问答** — 基于用户笔记回答问题（On-Demand Fetch + RAG）
- [ ] **Spark Review** — AI 精选有隐藏关联的旧笔记并置呈现，用户主动进入
- [ ] **AI 反思对话** — 苏格拉底式提问，引导用户发现跨主题脉络（远期）

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
| 2026-03-10 | 消除 Container Node 概念 — Container 变为普通 node + locked；Settings 改为标准节点页面 | codex | #119 |
| 2026-03-07 | 高亮点击呼出笔记 — 点击高亮文本打开笔记浮窗，链接/按钮放行原生行为 | nodex | main |
| 2026-03-07 | 高亮交互清理 — 移除 HIGHLIGHT_CLICK 死代码 + updateSaveButtonState no-op | nodex | main |
| 2026-03-06 | About 分离为 app panel + Settings 数据迁移 — About 从节点→纯 UI 路由(`app:about`)；Settings highlightEnabled 从 ui-store→LoroDoc 字段 + chrome.storage 投影 | nodex | main |
| 2026-03-05 | About 面板 — 版本号 + Changelog + Tally 反馈 + GitHub 链接，ToolbarUserMenu 入口 | nodex | main |
| 2026-03-05 | 新用户引导数据 — Welcome/Article Clip/Tasks/Shortcuts 4 段教程树 + #task schema + 9 tests | nodex | main |
| 2026-03-05 | Google Docs 剪藏 + 两阶段 Loading UX — export HTML 抓取 + kix 列表嵌套 + 空 shell 占位 + pulse 动画 + 加载中禁止交互 | nodex | main |
| 2026-03-05 | Options 字段 auto-collect 修复 — OutlinerItem blur/Enter 路径补 registerCollectedOption + autoCollected 标志位 + visibleWhen 条件 + 4 test | nodex | main |
| 2026-03-04 | 高亮交互重设计 — chat bubble 标记 + 点击呼出笔记浮窗 + IME 修复 + 设计规范对齐 | nodex | main |
| 2026-03-04 | x.com clip 修复 + 高亮色系统统一 — Soft Banana 高亮色 + Harvest Yellow 色板 + #highlight 迁移 amber→yellow | nodex | main |
| 2026-03-04 | Field 配置页打磨 — Auto-init toggle 组 + 字段类型图标 + FieldValueRow 共享布局 + 配置页对齐统一 | nodex | main |
| 2026-03-04 | Review: Sync 架构全面审查 — 6 commit + compaction CAS 修复 + update 区间校验 | nodex | #117 |
| 2026-03-04 | 离线高亮排队 — SP 关闭暂存 chrome.storage.local + BG 检测路由 + 页面刷新恢复 + SP bootstrap 消费 | nodex | main |
| 2026-03-03 | NodeHeader 富文本编辑 + Reference 编辑修复 — useEditorTriggers 提取 + #/@/Cmd+Enter 支持 | nodex | main |
| 2026-03-03 | 系统节点只读编辑器 — 容器/workspace home/queryCondition 聚焦变灰、输入无效 | nodex | main |
| 2026-03-03 | 节点右键菜单扩展 — Copy link / Duplicate / Move to / Add tag / Add checkbox / Add description | nodex | main |
| 2026-03-03 | Web Clip 默认保存到 Today — #source 节点存入当天日记 | nodex | main |
| 2026-03-03 | 匿名→登录数据丢失修复 — reparent + deferred 迁移 + 孤儿 snapshot 清理 + WASM recovery | nodex | main |
| 2026-03-01 | Sync 数据恢复修复 — subscribeLocalUpdates 时序竞态 + sync 启动前全量 export | nodex | main |
| 2026-03-01 | Highlight 交互重设计（Readwise 风格）— 图标化网页工具栏 + Note 内联输入 + 评论图标 | codex | #115 |
| 2026-03-01 | Highlight 数据模型重构 — highlight 改为 clip page 子节点 + auto-init + 去重复创建 | nodex | main |
| 2026-03-01 | Field & Supertag 功能补全 — Merge Fields + Auto-initialize + 批量标签操作 + 22 test | nodex | main |

> 更早的已完成记录见 `docs/_archive/COMPLETED-HISTORY.md`

### 已关闭的远期/非开发任务

以下 issue 属远期规划或非当前迭代范围：
Supabase 实时同步 (#34，已被 Cloudflare Sync 取代)、离线模式增强 (#35)、导入/导出 (#36)、Command Nodes (#37)、Title Expressions (#38)、Publishing (#39)、Input API (#40)。
