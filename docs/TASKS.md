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

> **上线门槛**：用户可以日常使用的最小完整产品。核心功能已就绪（大纲编辑、Supertags、Fields、Date 节点、Web Clipping、Highlight & 批注、Undo/Redo、⌘K 搜索、Sync）。

- [ ] **产品展示页** — 静态落地页（产品介绍 + 截图 + 安装链接 + 隐私政策），可托管在 Cloudflare Pages 或 GitHub Pages
- [ ] **新用户引导数据** — 准备一批引导用的种子数据，帮助新用户了解操作方式和功能
- [ ] **About 面板** — 独立于用户内容的静态面板（入口：ToolbarUserMenu 下拉项 → push AboutPanel 到 PanelStack）
  - 版本号（`chrome.runtime.getManifest().version`）
  - 本地 Changelog（`changelog.ts` 随扩展打包，跟版本走）
  - 反馈入口（Tally 表单外链）

---

### P1 — 核心差异化（上线后第一优先级）

#### 上下文感知 Sidebar — 浏览器原生知识助手
> soma 最核心的差异化功能。Tana/Notion/Obsidian 做不到——因为它们不在浏览器里。

- [ ] **Phase 1: URL 匹配** — 检测当前标签页 URL，匹配已有 web_clip 的 Source URL 字段
- [ ] **Phase 2: 内容相似度** — 提取网页关键词/实体，与笔记内容模糊匹配
- [ ] **Phase 3: 标签关联** — AI 推断相关标签 → 显示同标签下的笔记
- [ ] **Phase 4: 主动建议** — "你可能想把这段内容加到 XXX 笔记中"
- [ ] Content Script 增强：网页内高亮已剪藏内容、锚点引用

#### 网页剪藏增强 (#30)
> 基础版已完成（消息/提取/保存/标签/URL/Toast/正文→子节点 + 默认保存到 Today）。需升级为智能剪藏。

- [ ] 保存目标选择 UI — 允许用户选择保存到 Inbox / Today / 指定节点
- [ ] **AI 智能剪藏** — 自动打标签、提取结构化信息、推荐关联到已有笔记
- [ ] 选中文本剪藏（Content Script 右键菜单 / 浮动按钮 → 剪藏选中段落）

#### AI Chat & 网页辅助 (#29 + #31)
> 浏览器 + AI = soma 的第二个差异化维度。

- [ ] **AI Chat 基础** — Side Panel 内嵌对话界面，可引用笔记节点作为上下文
- [ ] **网页问答** — 选中网页内容 → 在侧边栏中提问/总结/翻译
- [ ] **笔记问答** — 基于全部笔记回答问题（RAG / 全文搜索 + LLM）
- [ ] **AI 辅助组织** — 自动打标签建议、推荐关联笔记、内容分类

---

### P2 — 知识管理核心能力

#### Search Nodes (#23)
> Step 0-3 已完成（数据模型 + 搜索引擎 + L0 标签搜索 + 芯片条渲染）。**Design**: `docs/plans/search-node-design.md`

- [ ] Step 4: L1 字段过滤 UI — 芯片条增删改 + FIELD_IS/时间条件 + 计数提示
- [ ] Step 5: L2 AI 自然语言 — tool call 创建 queryCondition 树

#### Supertags 完善 (#20)
> 基础已完成（#触发、应用/移除、配置页、模板字段、标签页搜索、批量标签操作）

- [ ] Convert to supertag（普通节点快捷转 tagDef）
- [ ] Pinned fields（置顶显示 + filter 优先）
- [ ] Optional fields（建议按钮 + 自动降级）
- [ ] Title expression（`${field name}` 动态标题）

#### Fields 全类型 (#21)
> 基础已完成（Options/Date/Number/URL/Email/Checkbox/隐藏/Required/Min-Max/验证/系统字段/去重/删除联动/默认值克隆/Auto-init/Merge/字段类型图标）

- [ ] AttrDef "Used in" 计算字段
- [ ] Pinned fields

#### Date 节点 & 日记 (#22)
> Phase 1 已完成 (PR #73): Year→Week→Day 层级 + Today 入口 + DateNavigationBar + 日历选择器

- [ ] 自然语言日期解析扩展（@next Monday / @November / @last week）
- [ ] 日记模板（#day supertag 配置）
- [ ] 日期字段链接到日节点

#### View Toolbar — Filter / Sort / Group (#25)
- [ ] Per-node view toolbar UI（Sort by / Filter by / Group by 图标栏）
- [ ] Sort by：单/多级排序
- [ ] Filter by：按字段值/标签/checkbox 状态过滤
- [ ] Group by：按字段值分组
- [ ] ViewDef Tuple 持久化（SYS_A16/18/19/20）

#### 其他
- [ ] Trash 交互优化 — 批量选中删除、右键菜单、自动清理策略（30 天）
- [ ] 图片节点支持 — 节点嵌入/展示图片（上传、粘贴、拖拽），存储走 R2

---

### P3 — 编辑器增强 & 交互完善

- [ ] 节点选中增强 (#47) — Cmd+Shift+D 批量复制、拖动选择优化
- [ ] 合并节点 — 选中多个重复节点 → 合并为一个（保留第一个，合并 children/tags）
- [ ] Floating Toolbar: @ Reference 按钮
- [ ] Slash Command 后续 (#48) — Paste / Search node / Image / Checklist
- [ ] 性能基线测量
- [ ] AI Command Nodes (#32) — Command Node 数据模型 + 执行引擎 + AI 字段自动填充

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
| 2026-03-04 | 高亮 hover 工具栏重做 — 两层检测 + click 透传 + 250ms 延迟防抖 + Note popover ⌘↵ 提示 | nodex | main |
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
