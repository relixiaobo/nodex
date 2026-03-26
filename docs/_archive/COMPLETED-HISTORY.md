# 已完成任务归档

> 从 `docs/TASKS.md` 迁出的历史已完成条目。TASKS.md 只保留最近一周。

## 2026-03-07

| 任务 | Agent | PR |
|------|-------|-----|
| 高亮点击呼出笔记 — 点击高亮文本打开笔记浮窗，链接/按钮放行原生行为 | nodex | main |
| 高亮交互清理 — 移除 HIGHLIGHT_CLICK 死代码 + updateSaveButtonState no-op | nodex | main |

## 2026-03-06

| 任务 | Agent | PR |
|------|-------|-----|
| About 分离为 app panel + Settings 数据迁移 — About 从节点→纯 UI 路由(`app:about`)；Settings highlightEnabled 从 ui-store→LoroDoc 字段 + chrome.storage 投影 | nodex | main |

## 2026-03-05

| 任务 | Agent | PR |
|------|-------|-----|
| About 面板 — 版本号 + Changelog + Tally 反馈 + GitHub 链接，ToolbarUserMenu 入口 | nodex | main |
| 新用户引导数据 — Welcome/Article Clip/Tasks/Shortcuts 4 段教程树 + #task schema + 9 tests | nodex | main |
| Google Docs 剪藏 + 两阶段 Loading UX — export HTML 抓取 + kix 列表嵌套 + 空 shell 占位 + pulse 动画 + 加载中禁止交互 | nodex | main |
| Options 字段 auto-collect 修复 — OutlinerItem blur/Enter 路径补 registerCollectedOption + autoCollected 标志位 + visibleWhen 条件 + 4 test | nodex | main |

## 2026-03-04

| 任务 | Agent | PR |
|------|-------|-----|
| 高亮交互重设计 — chat bubble 标记 + 点击呼出笔记浮窗 + IME 修复 + 设计规范对齐 | nodex | main |
| x.com clip 修复 + 高亮色系统统一 — Soft Banana 高亮色 + Harvest Yellow 色板 + #highlight 迁移 amber→yellow | nodex | main |
| Field 配置页打磨 — Auto-init toggle 组 + 字段类型图标 + FieldValueRow 共享布局 + 配置页对齐统一 | nodex | main |
| Review: Sync 架构全面审查 — 6 commit + compaction CAS 修复 + update 区间校验 | nodex | #117 |
| 离线高亮排队 — SP 关闭暂存 chrome.storage.local + BG 检测路由 + 页面刷新恢复 + SP bootstrap 消费 | nodex | main |

## 2026-03-03

| 任务 | Agent | PR |
|------|-------|-----|
| NodeHeader 富文本编辑 + Reference 编辑修复 — useEditorTriggers 提取 + #/@/Cmd+Enter 支持 | nodex | main |
| 系统节点只读编辑器 — 容器/workspace home/queryCondition 聚焦变灰、输入无效 | nodex | main |
| 节点右键菜单扩展 — Copy link / Duplicate / Move to / Add tag / Add checkbox / Add description | nodex | main |
| Web Clip 默认保存到 Today — #source 节点存入当天日记 | nodex | main |
| 匿名→登录数据丢失修复 — reparent + deferred 迁移 + 孤儿 snapshot 清理 + WASM recovery | nodex | main |

## 2026-03-01

| 任务 | Agent | PR |
|------|-------|-----|
| Sync 数据恢复修复 — subscribeLocalUpdates 时序竞态 + sync 启动前全量 export | nodex | main |
| Highlight 交互重设计（Readwise 风格）— 图标化网页工具栏 + Note 内联输入 + 评论图标 | codex | #115 |
| Highlight 数据模型重构 — highlight 改为 clip page 子节点 + auto-init + 去重复创建 | nodex | main |
| Field & Supertag 功能补全 — Merge Fields + Auto-initialize + 批量标签操作 + 22 test | nodex | main |

## 2026-02-28

| 任务 | Agent | PR |
|------|-------|-----|
| Highlight 系统 Review — BG loop guard + SP listener + highlight-sidepanel 模块 + clipPageId 树遍历修复 + 9 test | codex | #113 |
| Highlight 系统 Phase 1 — highlight-service CRUD + TagSelectorPopover + FloatingToolbar # Tag + PM 选区→inline ref + highlight bullet 颜色 + 25 test | Agent A | #111 |
| Highlight 系统 Phase 2-3 — anchor-utils + messaging 协议 + Shadow DOM 网页工具栏 + `<soma-hl>` DOM 渲染 + 4-step 锚点还原 + URL clip 查找 + Background 路由 + 87 test | Agent B | #112 |
| Paste Pipeline 重设计 — 统一 markdown/HTML 解析 + codeBlock 一等节点 + Google Docs/Sheets/Wikipedia 硬化 + paste debug 开关 + 6 test files | codex | #110 |
| 模板字段默认值克隆 — applyTag 克隆 template fieldEntry 默认值，syncTemplateFields 不克隆（只影响新实例）+ 4 test | nodex | main |
| Unified OutlinerRow — 统一行交互架构（OutlinerRow 提取 + FieldRow 委托 + 共享导航工具），消除 content/field 行交互不一致 + 16 test | nodex | main |
| Outliner 行渲染收敛 — row-model.ts + RowHost.tsx 共享行派生/渲染，迁移 4 个 outliner 组件 + 2 test 文件 | codex | #108 |

## 2026-02-27

| 任务 | Agent | PR |
|------|-------|-----|
| Field / Default Content 删除联动 — 模板字段删除联动清理 + attrDef 删除灰色删除线 + 14 test | field-cascade | #107 |
| Highlight + Comment 研究 — 竞品分析 + 数据模型 + 锚点策略 + 3-Phase 实现方案 | research | main |
| Options 语义验证 + Untitled 占位 + Clip Toast 静默 — 3 个小修复 | nodex | main |
| Search Nodes Step 3 — SearchChipBar（只读芯片条）+ TrailingInput 自动打标签 + queryCondition 过滤 + 12 test | search-step3 | #103 |
| Field ⚠ icon 垂直居中 + 同节点重复 field 去重（store dedup + render dedup）+ 3 test | field-fixes | #104 |
| Editor Paste Phase 1 — ⌘V 多行拆分为兄弟节点 + 6 test | paste-phase1 | #105 |
| Trash 彻底删除 — Restore / Delete permanently / Empty Trash（两步确认）+ 10 test | trash-delete | #106 |
| 粘贴多行 + 验证 icon 修复 — TrailingInput 虚拟节点粘贴多行支持 + RichTextEditor paste 移至 handleDOMEvents + FieldRow ⚠ icon 垂直居中 | nodex | main |
| Bug 四连修 — 日期字段白屏（hooks 违规）+ 链接单击打开 + 拖选文本不误触 + 粘贴不触发 #@ | nodex | main |
| ⌘K 常用搜索/命令排前 — paletteUsage 持久化（频率 log + 7天时效衰减，max 25 分加权）+ 9 test | nodex | main |
| 点击 Supertag 进入搜索结果页 — Search Nodes L0（搜索引擎 + 结果物化 + TagBadge 导航 + 24 test） | tag-search | #102 |
| Field Node 交互四连修 — 拖选/下拉触发/确认/拖动（4 bug + 14 test） | field-fix | #101 |
| 默认进入 Today 节点面板 — App.tsx replacePanel(ensureTodayNode()) | nodex | main |
| ⌘K 搜索引擎切换 uFuzzy — CJK + 拼写容错 + 消除散乱匹配，55k 节点 <5ms | nodex-codex | #100 |
| Radix Tooltip + 智能粘贴 + 链接 hover — 全图标 Tooltip（含快捷键）+ ⌘V URL 自动转链接 + ⌘⇧V 纯文本粘贴 + 链接 hover 显示地址 | nodex | main |

## 2026-02-26

| 任务 | Agent | PR |
|------|-------|-----|
| UI 设计系统合规优化 — Paper Shadow 浮层 + hover/selected token 统一（16 文件） | nodex-cc | #98 |
| Search Node Step 0 数据模型锁定 — `queryCondition` NodeType + `QueryOp`(32 op) + query 属性 + Loro 读写 + 6 Vitest | nodex | main |
| UI 细节打磨全部完成 — TopToolbar 对齐 + Breadcrumb 滚动规则 + TrailingInput 缩进 + 空节点光标 + 第二轮 review | antigravity | #96 #97 |
| v5.0 UI 重构全量完成 — Phase 1-7（Token 迁移 + 硬编码色值 + 阴影移除 + 排版 15px/24px + 大纲几何 + Tag 排印化 + 隐形 UI + 顶栏重构） | antigravity | #93 #96 |

## 2026-02-24

| 任务 | Agent | PR |
|------|-------|-----|
| 统一时间线 Undo/Redo (#44) 全量完成 — Phase 1-4 | nodex-codex + nodex-cc | #91 #92 |
| Side Panel 布局改造 全量完成 — Phase 1-4（TopToolbar + ⌘K 重写 + Undo/Redo 按钮 + 清理废弃文件） | nodex-cc | #88 |
| Undo/Redo Bug 1+3 修复 — bootstrap replacePanel + seed clearUndoHistory + 导航后 sink 聚焦 + TrailingInput Mod-z | nodex-cc + nodex | #92 + main |

## 2026-02-23

| 任务 | Agent | PR |
|------|-------|-----|
| Staging + Production 双环境部署 — D1/Worker/Secrets/Google OAuth + HTTPS cookie 前缀修复 | nodex | — |
| Inline ref fallback 虚线 bullet 修复 + outliner backlink count badge 移除 | nodex-codex | #87 |
| Reference node Backspace 选中/删除流程修复 | nodex-codex | #86 |
| 容器节点 registry 收口 — `system-node-registry.ts` 统一 bootstrap/sidebar/command palette 定义 + 5 Vitest | nodex-codex | #85 |
| 系统节点锁定约束 — `node-capabilities.ts` 规则中心 + store hard guard + UI soft guard + 7 Vitest | nodex-codex | #84 |
| Sync 客户端 Steps 6-8 — Pending Queue (IndexedDB) + SyncManager + SyncStatusIndicator | nodex-cc | #83 |
| 日期系统标签节点化 — `sys:day/week/year` 普通 tagDef + 模板字段/默认内容实例化 + 删除保护 | nodex-codex | #82 |
| Auth + Sync Server (Steps 0–5) — Better Auth + D1 + Google OAuth + Extension flow + Push/Pull + R2 blob | nodex-cc | #80 |
| 空白 NodePanel 导航修复 — reference bullet 导航到目标节点 + 系统标签导航守卫 + 兜底视图 | nodex-codex | #81 |
| References 增强 (#19) — 反向链接 section + 引用计数 badge + 11 Vitest | nodex-cc-2 | #76 |

## 2026-02-22

| 任务 | Agent | PR |
|------|-------|-----|
| Sync 增量同步计划 Review | nodex-codex | #79 |
| Sync Phase 0 实现复审 + 修复 | nodex-codex | #78 |
| Sync Phase 0 Step 2 — 客户端 Sync-Ready 实施 | nodex-cc | #77 |
| Sync Phase 0 Step 1 — Review & 优化方案 | nodex-codex | #75 |
| Reference 引用环路防护 + 轻量 i18n 基础层 | nodex-codex | #74 |
| Outliner 选区统一 & Reference UX 优化 | nodex-codex | #72 |
| Calendar Heatmap + `@today`/`@tomorrow`/`@yesterday` 日期快捷引用 | nodex | — |
| 网页剪藏增强 — sonner toast + URL/Email 链接 + V2 HTML→子节点树 | nodex-cc-2 | #71 |
| Date 节点 & 日记 Phase 1 — Year→Week→Day 层级 + Today 入口 + DateNavigationBar | nodex-cc | #73 |

## 2026-02-21

| 任务 | Agent | PR |
|------|-------|-----|
| Editor Bug: CJK IME 组合输入异常（fork prosemirror-view） | nodex-codex | — |
| Refactor — Row 交互统一（content/trailing/field-value 共享 intent 层） | nodex-codex | #70 |
| P1 Reference 交互收口（单击选中/Esc/框选 + inline 转换） | nodex-codex | #69 |
| Refactor — Loro 收口 Phase 2: LoroText 主编辑链路迁移 | nodex-codex | #68 |
| Refactor — Loro 收口 Phase 1: detached guard + origin 策略 | nodex-codex | #67 |
| P1 NodePanel Header 重设计（三列对齐网格 + 隐藏字段占位行） | nodex-cc | #66 |
| Bugfix — Loro 全量 Review 问题修复 | nodex-codex | #65 |
| 代码 Review — Loro 迁移全量 | nodex-codex | — |

## 2026-02-20

| 任务 | Agent | PR |
|------|-------|-----|
| 代码 Review — feature-sync-2026-02-20（6 Bug + 5 测试缺口） | nodex-codex | — |
| Node 图标系统 — supertag bullet 彩色 + fieldDef 结构化图标 | nodex | — |
| FIELD_TYPES 大小写修复 | nodex | — |
| Loro CRDT 迁移 Phase 1 — 本地数据引擎 + 数据模型 + UndoManager | nodex-cc | #62 |

## 2026-02-19 及更早

| 任务 | Agent | PR |
|------|-------|-----|
| Editor Bug: 首次点击行尾空白光标落到开头 | nodex | — |
| 数据模型简化：消除 Metanode + AssociatedData (Phase 0-3) | nodex-cc | #60 |
| 用户认证 — Google OAuth 登录 + Supabase Auth | nodex-cc-2 | #61 |
| Editor 迁移 TipTap → ProseMirror（Phase 1-4） | nodex-codex | #58 |
| Floating Toolbar BUG 修复 | nodex-codex | #57 |
| Ctrl+I Description 切换修复 | nodex-codex | #56 |
| Supertags + Fields 增强批次 | nodex-cc-2 | main |
| 文本格式化 — Floating Toolbar + Heading Mark + Link 编辑 | nodex-codex | #55 |
| 节点选中 UI + reference 修复 + drag-select 重构 | nodex-cc | #53 |
| 统一 config field 架构 + Done state mapping + BOOLEAN 类型 | nodex-cc-2 | #54 |
| 节点选中 Phase 1-3 — 单选/多选/批量操作/双层高亮 | nodex-cc | #51 |
| Cmd+Enter 编辑器内切换 Checkbox | — | — |
| Web Clipping 修复 — title sync, field value rendering | nodex-codex | #49 |
| Node Description 编辑：高度跳动 + Ctrl+I 快捷键 | — | — |
| 无 child 节点展开后 backspace 删除空子节点并收起 | — | — |
| @ 创建 reference 对兄弟节点出错 | — | — |
| 聚焦末尾含 # 或 @ 的 node 时不应触发菜单 | — | — |
| 光标移动到 inline code 内部时光标消失 | — | — |
| 长文本 node 失焦时文本布局宽度变窄 | — | — |
| #tag 与所在行文本垂直居中对齐 | — | — |
| @ 创建 reference 后光标继续输入应转为 inline reference | — | — |
| 2026-03-10 | 消除 Container Node — Container 变为 node + locked；Settings 标准页面 | codex | #119 |

## v0.2.0 — v0.3.1 (2026-03-20 ~ 2026-03-23)

| 日期 | 任务 | Agent | PR |
|------|------|-------|-----|
| 2026-03-21 | Toggle Layout — Chat/Node 双视角切换 + 状态保持 | codex | #171 |
| 2026-03-21 | Node 工具重构 — Tana Paste 统一格式 + search node 创建 | codex | #170 |
| 2026-03-20 | v0.2.0 发版 — Think with your AI | nodex | — |
| 2026-03-20 | AI 人格设计文档 + system prompt 重写 + skills 升级 | nodex | — |
| 2026-03-20 | 新用户引导 — 强制登录 + 内联 API key + 启动偏好 | codex | #163 |
| 2026-03-20 | 工具调用分组折叠（单消息内） | claude | #164 |
| 2026-03-20 | Chat 面板头部一致性 | codex | #162 |
| 2026-03-20 | node_read 无参数浏览 + Settings AI 分组 | codex | #161 |
| 2026-03-20 | extensible cite types (node/chat/url) | claude | #160 |
| 2026-03-20 | past_chats fuzzy search 升级 | codex | #159 |
| 2026-03-20 | Chat 节点展示 — ref/cite 浮窗 + node 内嵌 + 首屏 Chat | claude | #158 |
| 2026-03-20 | past_chats 跨会话记忆工具 + prompt 架构重构 | codex | #157 |
| 2026-03-20 | 多项 UI 修复 | nodex | — |
