---
name: self-test
description: Run Nodex self-tests after code changes. Use this after modifying stores, components, hooks, or services to verify nothing is broken. Covers store operations, UI rendering, and extension build.
---

# Nodex Self-Test Suite

每次代码改动后，执行本流程验证功能正确性。根据 `$ARGUMENTS` 决定测试范围：

- `all`（默认）: 运行全部测试
- `store`: 仅 Phase 0 + Phase 1
- `visual`: 仅 Phase 2
- `build`: 仅 Phase 0 + Phase 3

---

## Phase 0: 环境准备

1. **确认 dev server 运行中**：
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:5199/standalone/index.html
```
如果返回非 200，启动 dev server：
```bash
npm run dev:test
```
等待 server ready 后继续。

2. **TypeScript 类型检查**（快速拦截编译错误）：
```bash
npm run typecheck
```
如果有错误，**立即停止**，报告错误并修复，不要继续后续测试。

---

## Phase 1: Store 操作验证

通过 `chrome-devtools` MCP 的 `evaluate_script` 在 localhost:5199 页面执行。

**执行方式**：用 Read 工具读取脚本文件内容，然后传给 `evaluate_script` 执行。

### 1.1 前置检查

**脚本**: `scripts/preflight.js`

读取并执行该脚本。**期望**: `ok: true`, entities ≥ 36, workspace = `'ws_default'`。

如果失败，检查：
- dev server 是否启动 (`npm run dev:test`)
- 页面是否已加载完毕（等待几秒后重试）
- 是否意外使用了 App 而非 TestApp

### 1.2 CRUD + 树操作

**脚本**: `scripts/store-crud.js`

读取并执行。**期望**: `allPassed: true`，7 项全部 `pass: true`。

测试项：
| # | 操作 | 验证点 |
|---|------|--------|
| 1 | createSibling | entity 数量 +1 |
| 2 | indent | _ownerId 变为前兄弟 `subtask_1a` |
| 3 | outdent | _ownerId 恢复为 `task_1` |
| 4 | moveDown + moveUp | children 顺序还原 |
| 5 | trashNode | 入 trash.children 且出 parent.children |
| 6 | createChild | 出现在 parent.children 且 name 正确 |
| 7 | updateNodeName | props.name 更新后还原 |

### 1.3 UI Store 操作

**脚本**: `scripts/ui-store.js`

读取并执行。**期望**: `allPassed: true`，11 项全部 `pass: true`。

测试项：pushPanel, popPanel, replacePanel, expand, collapse, toggleExpand, setFocus, clearFocus, openSearch, closeSearch, toggleSidebar。

### 1.4 边界条件

**脚本**: `scripts/edge-cases.js`

读取并执行。**期望**: `allPassed: true`，2 项全部 `pass: true`。

测试项：indent 第一个子节点 (no-op)、outdent 顶层节点 (no-op)。

---

## Phase 2: 视觉渲染验证

使用 `claude-in-chrome` MCP 工具进行截图和视觉检查。

### 2.1 Nodex 截图

1. 对 standalone 测试页截图（确保 tab 已打开 localhost:5199）
2. 缩放到 bullet / chevron 区域，检查：
   - Bullet 圆点可见性（叶节点始终显示圆点）
   - Chevron 箭头行为（有子节点 + hover 时显示）
   - 缩进层级（每层 24px 左边距）
   - 文本对齐（bullet 与文本基线对齐）

### 2.2 与 Tana 对比（可选）

如果修改了 outliner 视觉样式：
1. 截图 Tana (app.tana.inc) 的大纲区域
2. 并排对比 bullet 大小、间距、字体
3. 记录差异（可接受 vs 需要修复）

### 2.3 响应式检查

1. 将页面调整为 350px 宽度（Side Panel 最小尺寸）
2. 截图检查：布局是否溢出、文本是否截断
3. 调整回 700px+，确认正常展示

---

## Phase 3: 扩展构建

```bash
npx wxt build 2>&1
```

**期望**: 构建成功，无错误。输出中包含 `.output/chrome-mv3/`。

如果构建失败，报告错误详情并立即修复。

---

## 结果汇报格式

测试完成后，输出汇总表格：

| Phase | Test | Result |
|-------|------|--------|
| 0 | TypeScript 类型检查 | PASS/FAIL |
| 1.1 | Store 前置检查 | PASS/FAIL |
| 1.2 | CRUD + 树操作 (7 tests) | PASS/FAIL |
| 1.3 | UI Store 操作 (11 tests) | PASS/FAIL |
| 1.4 | 边界条件 (2 tests) | PASS/FAIL |
| 2 | 视觉渲染 | PASS/FAIL/SKIP |
| 3 | 扩展构建 | PASS/FAIL |

如果有 FAIL 项，详细列出失败原因和建议修复方案。

---

## 已知注意点

### 安全测试节点
- `subtask_1a` — 父节点 `task_1` 始终存在，最安全的测试目标
- `note_1a` — 父节点 `note_1` 存在
- 不要用 `proj_1` 做 createSibling（其父是容器节点 `ws_default_LIBRARY`，操作后需要额外清理）

### 常见失败原因
1. **handleBlur 竞态**: Enter 创建新节点时 onBlur 清除了新设焦点 → 检查 `focusedNodeId === nodeId` guard
2. **trashNode 未更新 children**: 节点移到 Trash 后检查 `trash.children` 是否包含该 ID
3. **Supabase 误触发**: standalone 模式下 `isSupabaseReady()` 返回 true → store 操作被远程失败回滚
4. **Vite HMR 模块隔离**: 热更新后 import() 拿到新实例 → 用 `window.__nodeStore` 访问

### Seed Data 速查
```
总数: 36 节点
Library:  proj_1, task_1~3, subtask_1a~1b, subtask_2a~2c, note_1, note_1a~1c, note_2, idea_1~2, note_rich, rich_1~5
Inbox:    inbox_1~3, inbox_3a~3b
Journal:  journal_1, j_1~3
Containers: ws_default_LIBRARY, ws_default_INBOX, ws_default_JOURNAL, ws_default_SEARCHES, ws_default_TRASH
默认展开: proj_1, task_1, task_2, note_rich
```

### 新增测试指南

当需要新增测试时：
1. 在 `scripts/` 目录创建新的 `.js` 脚本，遵循现有模式（IIFE、返回 `{ allPassed, results }` 格式）
2. 在 SKILL.md 中添加对应的 Phase/Step 描述
3. 更新结果汇报表格
4. 所有测试节点在操作后必须清理或还原
