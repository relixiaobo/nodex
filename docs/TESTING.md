# Nodex 测试配置

本文件为 `/self-test` Skill 提供项目特定的测试参数。Skill 本身是通用自测规范，此文件定义 Nodex 的具体配置。

## 测试职责边界（重要）

1. 本文档用于 **Agent 可执行** 的验证：脚本、构建、可自动化检查点。
2. 人工验收不是全量回归，只处理“Agent 无法可靠验证”或“核心高风险路径”。
3. 人工验收清单统一维护在 `docs/MANUAL-TEST-CHECKLIST.md`，不要在本文重复维护第二份版本。

---

## 环境配置

| 配置项 | 值 |
|--------|-----|
| **Dev server 地址** | `http://localhost:5199/standalone/index.html` |
| **启动命令** | `npm run dev:test` |
| **健康检查** | `curl -s -o /dev/null -w "%{http_code}" http://localhost:5199/standalone/index.html` (期望 200) |
| **构建命令** | `npx wxt build 2>&1` |
| **构建产物** | `.output/chrome-mv3/` |
| **最小响应宽度** | 350px (Chrome Side Panel 最小尺寸) |

### 参考产品

| 产品 | URL | 用途 |
|------|-----|------|
| Tana | `app.tana.inc` | 视觉对比参考 (仅操作 `just_for_claude` 工作区) |

---

## Phase 0.5: 渲染安全检查

每次 UI 改动后，在运行 Phase 1 之前执行渲染安全检查，确保页面没有白屏：

1. 确认 `http://localhost:5199/standalone/index.html` 返回 200
2. 通过 `chrome-devtools` evaluate_script 执行：
```js
() => ({
  hasTree: document.querySelector('[role="tree"]') !== null,
  hasPanel: document.querySelector('[class*="flex-1"]') !== null,
  errorCount: document.querySelectorAll('.error-boundary, [data-error]').length
})
```
3. **期望**: `{ hasTree: true, hasPanel: true, errorCount: 0 }`
4. 如果 `hasTree: false` → **FAIL**，页面白屏，立即报告并建议 `git stash` 回退

---

## Phase 1: Vitest 自动化套件（主回归）

目录: `tests/vitest/`

执行命令：

```bash
npm run test:run
```

### 1.1 前置检查

**测试文件**: `tests/vitest/preflight.test.ts`

**期望**: 种子数据加载成功（60+ 节点），workspace = `ws_default`，默认 panel = `ws_default_LIBRARY`

如果失败，检查：
- dev server 是否启动 (`npm run dev:test`)
- 页面是否已加载完毕（等待几秒后重试）
- 是否意外使用了 App 而非 TestApp

### 1.2 CRUD + 树操作

**测试文件**: `tests/vitest/store-crud.test.ts`

**覆盖点**:

| # | 操作 | 验证点 |
|---|------|--------|
| 1 | createSibling | entity 数量 +1 |
| 2 | indent | _ownerId 变为前兄弟 `subtask_1a` |
| 3 | outdent | _ownerId 恢复为 `task_1` |
| 4 | moveDown + moveUp | children 顺序还原 |
| 5 | trashNode | 入 trash.children 且出 parent.children |
| 6 | createChild | 出现在 parent.children 且 name 正确 |
| 7 | updateNodeName | props.name 更新后还原 |
| 8 | graph invariants | `children` / `_ownerId` / associationMap 一致性 |

### 1.3 UI Store 操作

**测试文件**: `tests/vitest/ui-store.test.ts`

**覆盖点**: navigateTo, goBack, goForward, replacePanel, expand, collapse, toggleExpand, setFocus, clearFocus, openSearch, closeSearch, toggleSidebar

### 1.4 边界条件

**测试文件**: `tests/vitest/edge-cases.test.ts`

**覆盖点**: indent 第一个子节点 (no-op)、outdent 顶层节点 (no-op)

---

## Phase 2: 视觉检查点

### Outliner 核心

截图 localhost:5199 测试页，缩放到 bullet / chevron 区域，检查：

- Bullet 圆点可见性（叶节点始终显示圆点）
- Chevron 箭头行为（有子节点 + hover 时显示）
- 缩进层级（每层 24px 左边距）
- 文本对齐（bullet 与文本基线对齐）

### Tag + Field UI

- TagBadge 显示在已标签节点旁（彩色 pill `#TagName`）
- FieldList 显示在已标签节点下方（字段名 : 字段值）
- 无标签节点不显示 TagBar 和 FieldList

### 与 Tana 对比

如果修改了 outliner 视觉样式：
1. 截图 Tana (`app.tana.inc`) 的大纲区域
2. 并排对比 bullet 大小、间距、字体
3. 记录差异（可接受 vs 需要修复）

---

## Phase 3: 构建产物检查

构建命令: `npx wxt build 2>&1`

期望: 构建成功，输出中包含 `.output/chrome-mv3/`。

---

## 结果汇报表格

| Phase | Test | Result |
|-------|------|--------|
| 0 | TypeScript 类型检查 | PASS/FAIL |
| 1.1 | Preflight | PASS/FAIL |
| 1.2 | CRUD + 树操作 + 不变量 | PASS/FAIL |
| 1.3 | UI Store 操作 | PASS/FAIL |
| 1.4 | 边界条件 (2 tests) | PASS/FAIL |
| 2 | 视觉渲染 | PASS/FAIL/SKIP |
| 3 | 扩展构建 | PASS/FAIL |

---

## 安全测试节点

| 节点 ID | 父节点 | 说明 |
|---------|--------|------|
| `subtask_1a` | `task_1` | 最安全的测试目标，父节点始终存在 |
| `note_1a` | `note_1` | 备用测试目标 |
| `idea_1` | `ws_default_LIBRARY` | 可用于 updateNodeName（操作后还原） |

**禁忌**: 不要用 `proj_1` 做 createSibling（其父是容器节点 `ws_default_LIBRARY`，操作后需要额外清理）

---

## Seed Data 速查

```
总数: 68 节点

Library:    proj_1, task_1~3, subtask_1a~1b, subtask_2a~2c,
            note_1, note_1a~1c, note_2, idea_1~2,
            note_rich, rich_1~5
Inbox:      inbox_1~3, inbox_3a~3b
Journal:    journal_1, j_1~3
Containers: ws_default_LIBRARY, ws_default_INBOX, ws_default_JOURNAL,
            ws_default_SEARCHES, ws_default_TRASH, ws_default_SCHEMA
Schema:     tagDef_task, tagDef_person,
            attrDef_status/priority/due/email/company + type tuples + option nodes
Pre-tagged: task_1 → #Task (meta_task_1, field tuples, associatedData)

默认展开: proj_1, task_1, task_2, note_rich
```

---

## 已知易错点

| # | 问题 | 文件 | 要点 |
|---|------|------|------|
| 1 | **handleBlur 竞态** | `OutlinerItem.tsx` | onBlur 须检查 `focusedNodeId === nodeId` 再清除 |
| 2 | **trashNode children** | `node-store.ts` | 必须同时更新 `trash.children` 和 `node._ownerId` |
| 3 | **Supabase 误触发** | `TestApp.tsx` | standalone 不调 `setupSupabase()`，靠 `isSupabaseReady()` guard |
| 4 | **HMR 模块隔离** | `TestApp.tsx` | 用 `window.__nodeStore` 访问，不要用 `import()` |
| 5 | **createSibling 父节点** | `node-store.ts` | 安全测试节点：`subtask_1a`（父 `task_1` 始终存在） |
| 6 | **BulletChevron** | `BulletChevron.tsx` | Tana: bullet 始终可见，chevron 仅 hover/expanded 时显示 |
| 7 | **Zustand selector 无限循环** | hooks/*.ts | React 19 + Zustand v5: selector 返回新引用 → `useShallow` 或 JSON.stringify |
| 8 | **内部结构节点泄漏** | `OutlinerItem.tsx` | 必须过滤 `tuple/metanode/associatedData` 类型子节点 |
| 9 | **outdent 容器边界** | `node-store.ts` | 父节点是容器时 outdent 应为 no-op |
| 10 | **BulletChevron rotate** | `BulletChevron.tsx` | 旋转条件必须 `hasChildren && isExpanded` |

---

## 人工验收入口

- 人工验收请使用：`docs/MANUAL-TEST-CHECKLIST.md`
- 写入原则：
  - 仅写入 Agent 无法可靠自动验证的项
  - 或核心高风险且必须由你最终确认的项
