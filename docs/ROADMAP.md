# Nodex Roadmap

基于 Tana 完整功能分析的开发路线图。详细进度跟踪在 [GitHub Milestones](https://github.com/relixiaobo/nodex/milestones)。

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

| Milestone | 说明 | Issues |
|-----------|------|--------|
| [Phase 1: 数据基础](https://github.com/relixiaobo/nodex/milestone/1) | References 增强, Supertags 完善, Fields 全类型, Date & 日记 | #19 #20 #21 #22 |
| [Phase 2: 视图 & 搜索](https://github.com/relixiaobo/nodex/milestone/2) | Search Nodes, Table/Cards/Calendar/List View, Filter/Group/Sort | #23-#28 |
| [Phase 3: AI & 网页](https://github.com/relixiaobo/nodex/milestone/3) | AI Chat, 网页剪藏, AI Command Nodes, AI 字段增强 | #29-#33 |
| [Phase 4: 同步 & 可靠性](https://github.com/relixiaobo/nodex/milestone/4) | Supabase Realtime, 离线模式, 导入/导出 | #34-#36 |
| [Phase 5: 高级功能](https://github.com/relixiaobo/nodex/milestone/5) | Command Nodes, Title Expressions, Publishing, Input API | #37-#40 |

## 文档索引

| 文档 | 内容 |
|------|------|
| `docs/features/*.md` | 特性行为规格（实现时的权威参考） |
| `docs/research/` | Tana 逆向分析 |
| `docs/design-system.md` | UI 视觉标准 |
| [GitHub Issues](https://github.com/relixiaobo/nodex/issues) | Bug 跟踪 + 功能工作项 |
