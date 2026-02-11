# Nodex Roadmap

基于 Tana 完整功能分析的开发路线图。按优先级分阶段，逐步迭代。

> 最后更新: 2026-02-11

---

## 当前进度

### 已完成
- [x] 数据模型设计 (TypeScript 类型 + PostgreSQL Schema)
- [x] 核心服务层 (CRUD / 标签 / 字段 / 搜索 / 导入)
- [x] 数据迁移验证 (41,753 节点 100% 转换成功)
- [x] 技术选型 (WXT + React 19 + Tailwind 4 + TipTap + Zustand + shadcn/ui)
- [x] WXT 项目初始化 + 基础骨架
- [x] TipTap 编辑器 (Per-Node Editor, 富文本 bold/italic/code/highlight/strikethrough)
- [x] 键盘导航 (Enter/Tab/Shift+Tab/↑↓/Backspace/Cmd+Shift+↑↓)
- [x] 离线/Demo 模式
- [x] Lucide 图标 + UI 优化
- [x] 搜索面板 Cmd+K
- [x] 拖拽排序 (HTML5 DnD, before/after/inside)
- [x] Supertags 基础 (#触发、应用标签、TagBadge 显示、TagSelector)
- [x] Fields 基础 (>触发、字段名编辑+自动完成、交错渲染、字段值编辑器)

---

## Phase 1: 数据基础 — 让数据真正可用

> 没有这些，节点只是文本列表，无法成为知识图谱

### 1.1 References & @引用
> **优先做**：Supertags 和 Fields 的高级功能依赖引用机制

- [ ] `@` 触发搜索并引用节点（空节点/文本内均可）
- [ ] 内联引用显示（灰色背景、可点击导航）
- [ ] 引用节点显示（虚线圆点 bullet、编辑即更新原始节点）
- [ ] 反向链接 section（节点底部显示所有引用位置 + 面包屑路径）
- [ ] 引用计数 badge
- [ ] 合并节点（选中重复节点 → 合并 children/tags，更新所有引用）

### 1.2 Supertags 完善

- [ ] 移除标签（hover tag chip → X 按钮）
- [ ] 标签模板自动填充字段（应用标签时自动添加模板定义的字段）
- [ ] 标签配置页（点击标签定义节点 → 配置字段/默认值/可选字段）
- [ ] Show as Checkbox（标签开启 checkbox 行为，Done 状态双向映射）
- [ ] Default Child Supertag（被打标签的节点，新增子节点自动继承指定标签）
- [ ] 标签继承/Extend（子标签继承父标签模板字段）
- [ ] 标签页（点击 supertag → 显示所有打该标签的节点列表/表格）

### 1.3 Fields 全类型

- [ ] Options 下拉选择（预设选项 + 自动收集）
- [ ] Options from Supertag（特定标签的节点作为选项源）
- [ ] Date 日期选择器（链接到日节点、日历 UI）
- [ ] Number 数字输入（min/max 校验）
- [ ] URL 链接输入
- [ ] Email 邮箱输入
- [ ] Checkbox 布尔切换
- [ ] 字段隐藏规则（Never / When empty / When not empty / Always）
- [ ] Required 字段标记（空值时视觉警告）
- [ ] 系统字段（Created time / Modified time / Owner）

### 1.4 Date 节点 & 日记

- [ ] 年/月/周/日节点层级（自动生成）
- [ ] Today 快捷入口（侧栏按钮 + 快捷键 Ctrl+Shift+D）
- [ ] 自然语言日期解析（@today / @next Monday / @November）
- [ ] 日记模板（#day supertag 配置）
- [ ] 日期字段链接到日节点

---

## Phase 2: 视图 & 搜索 — 让数据有多种展现方式

> Tana 区别于普通大纲工具的核心竞争力

### 2.1 Search Nodes / Live Queries

- [ ] `?` 触发创建搜索节点（放大镜图标）
- [ ] 基础搜索操作符（#tag / field 值 / 文本 / 日期）
- [ ] 搜索结果实时更新（展开时执行）
- [ ] AND / OR / NOT 逻辑组合
- [ ] 关键词操作符（TODO / DONE / OVERDUE / CREATED LAST X DAYS）
- [ ] 搜索结果配合视图展示

### 2.2 Table View

- [ ] 表格视图（行=节点，列=字段）
- [ ] 列宽调整、列拖拽排序
- [ ] 列计算（Sum / Avg / Median / Min / Max / Count）
- [ ] 单元格内直接编辑字段值

### 2.3 Filter / Group / Sort 工具栏

- [ ] 通用视图工具栏（适用于所有视图）
- [ ] 按字段值过滤
- [ ] 按字段值分组（Outline / Cards / List 视图）
- [ ] 多级排序（升序/降序、堆叠排序条件）

### 2.4 Cards View

- [ ] 卡片视图
- [ ] 卡片间拖拽更新字段值（如拖拽到不同分组 → 更新分组字段）
- [ ] Banner 图片显示

### 2.5 Calendar View

- [ ] 日历视图（按日期字段排列节点）
- [ ] 日/周/月粒度切换
- [ ] 拖拽未排期节点到日历添加日期

### 2.6 List & Tabs View

- [ ] List 视图（左侧列表 + 右侧详情双面板）
- [ ] Tabs 视图（顶部 tab 切换内容）

---

## Phase 3: AI & 网页 — Chrome Side Panel 独特优势

> Nodex 作为浏览器扩展的差异化方向

### 3.1 AI Chat

- [ ] Side Panel 内 AI 对话界面
- [ ] `@` 引用工作区节点作为上下文
- [ ] 多模型切换（OpenAI / Anthropic / Google）
- [ ] AI 回复应用 supertag
- [ ] 对话分支（Alt+click）

### 3.2 网页剪藏

- [ ] Content Script 提取页面标题/URL/选中文本
- [ ] 一键保存到 Inbox / Today / 指定节点
- [ ] 自动打标签（根据内容类型）
- [ ] 保留源 URL 引用

### 3.3 网页 AI 辅助

- [ ] 选中网页文本 → 发送给 AI 提问/摘要
- [ ] 基于当前网页内容生成笔记
- [ ] 网页内容与已有笔记关联

### 3.4 AI Command Nodes

- [ ] AI 命令节点（Ask AI / Transcribe / Generate Image）
- [ ] 提示模板变量（${fieldname} / ${sys:context}）
- [ ] 批量处理（长上下文拆分）

---

## Phase 4: 同步 & 可靠性

> 让数据安全持久

### 4.1 Supabase 实时同步

- [ ] 乐观更新 + Realtime 推送
- [ ] 冲突解决策略（last-write-wins + version check）
- [ ] 多标签页同步验证

### 4.2 离线模式增强

- [ ] chrome.storage 缓存队列
- [ ] 断线检测 + 重连 + 队列化更新回放
- [ ] 离线编辑 → 上线后自动同步

### 4.3 导入/导出

- [ ] Tana JSON 导入（服务层已完成，需 UI）
- [ ] Markdown 导出
- [ ] Tana Paste 格式支持

---

## Phase 5: 高级功能

### 5.1 Command Nodes (自动化)

- [ ] 命令节点（顺序执行子命令）
- [ ] 可用命令：添加标签 / 设字段 / 移动节点 / 插入日期
- [ ] 事件触发（标签添加/移除、子节点添加/移除、checkbox 切换）

### 5.2 Title Expressions

- [ ] `${field name}` 动态标题模板
- [ ] 条件显示 `${field|?}`、截断 `${field|30...}`
- [ ] 系统变量 `${cdate}` / `${mdate}` / `${sys:owner}`

### 5.3 Publishing

- [ ] 节点发布为公开网页链接
- [ ] Article View（静态阅读页）
- [ ] Tana View（交互式，可展开/折叠）
- [ ] 密码保护

### 5.4 Input API

- [ ] REST API 接入节点数据
- [ ] 支持创建节点 / 应用标签 / 设字段
- [ ] Email-to-Nodex（通过 API 桥接）

---

## Tana 功能覆盖对照表

| 功能 | Tana | Nodex | 计划阶段 |
|------|------|-------|---------|
| Outliner 核心 | ✅ | ✅ | — |
| 键盘快捷键 | ✅ | ✅ | — |
| 拖拽排序 | ✅ | ✅ | — |
| Cmd+K 命令面板 | ✅ | 部分 | — |
| Supertags 基础 | ✅ | 部分 | Phase 1.2 |
| Supertags 高级 | ✅ | ❌ | Phase 1.2 |
| Fields (9 种) | ✅ | 部分 | Phase 1.3 |
| References | ✅ | ❌ | Phase 1.1 |
| 日期节点/日记 | ✅ | ❌ | Phase 1.4 |
| Search Nodes | ✅ | ❌ | Phase 2.1 |
| Table View | ✅ | ❌ | Phase 2.2 |
| Cards View | ✅ | ❌ | Phase 2.4 |
| Calendar View | ✅ | ❌ | Phase 2.5 |
| Filter/Group/Sort | ✅ | ❌ | Phase 2.3 |
| AI Chat | ✅ | ❌ | Phase 3.1 |
| 网页剪藏 | 社区 | ❌ | Phase 3.2 |
| 实时同步 | ✅ | ❌ | Phase 4.1 |
| Command Nodes | ✅ | ❌ | Phase 5.1 |
| Publishing | ✅ | ❌ | Phase 5.3 |
| Input API | ✅ | ❌ | Phase 5.4 |
