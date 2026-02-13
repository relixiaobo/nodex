# Nodex Roadmap

> 最后更新: 2026-02-13

## 已完成

- 数据模型设计 (TypeScript 类型 + PostgreSQL Schema)
- 核心服务层 (CRUD / 标签 / 字段 / 搜索 / 导入)
- 数据迁移验证 (41,753 节点 100% 转换成功)
- WXT + React 19 + Tailwind 4 + TipTap + Zustand + shadcn/ui
- TipTap 富文本编辑器 (bold/italic/code/highlight/strikethrough)
- 键盘导航 (Enter/Tab/Shift+Tab/↑↓/Backspace/Cmd+Shift+↑↓)
- 拖拽排序 (HTML5 DnD)
- Cmd+K 搜索面板
- Supertags 基础 (#触发、应用/移除、TagBadge、配置页)
- Fields 基础 (>触发、字段名编辑、交错渲染、AttrDef 配置页)
- References MVP (@触发、树引用+内联引用、引用 bullet)

## Milestones

### Phase 1: 数据基础
- References 增强 — 反向链接、引用计数、合并节点
- Supertags 完善 — Checkbox, Default Child, Color, 继承等
- Fields 全类型 — Options, Date, Number, URL, Email, Checkbox 等
- Date 节点 & 日记 — 年/月/周/日层级、Today 入口

### Phase 2: 视图 & 搜索
- Search Nodes / Live Queries
- Table View — 表格视图
- Filter / Group / Sort 工具栏
- Cards View — 卡片视图
- Calendar View — 日历视图
- List & Tabs View

### Phase 3: AI & 网页
- AI Chat — Side Panel 内 AI 对话
- 网页剪藏
- 网页 AI 辅助
- AI Command Nodes
- AI 字段增强 — AttrDef Config 扩展

### Phase 4: 同步 & 可靠性
- Supabase 实时同步
- 离线模式增强
- 导入/导出

### Phase 5: 高级功能
- Command Nodes — 自动化
- Title Expressions — 动态标题模板
- Publishing — 节点发布为公开网页
- Input API — REST API 接入

## 文档索引

| 文档 | 内容 |
|------|------|
| `docs/features/*.md` | 特性行为规格（实现时的权威参考） |
| `docs/issues.md` | Bug 跟踪 + 功能工作项 |
| `docs/research/` | Tana 逆向分析 |
| `docs/design-system.md` | UI 视觉标准 |
