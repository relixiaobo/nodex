# Nodex 测试配置

本文件为 `/self-test` Skill 提供项目特定的测试参数。Skill 本身是通用自测规范，此文件定义 Nodex 的具体配置。

## 测试职责边界（重要）

1. 本文档用于 **Agent 可执行** 的验证：脚本、构建、可自动化检查点。
2. 人工验收不是全量回归，只处理“Agent 无法可靠验证”或“核心高风险路径”。
3. 人工验收清单统一维护在 `docs/MANUAL-TEST-CHECKLIST.md`，不要在本文重复维护第二份版本。

---

## CI 门禁

GitHub Actions 工作流：`.github/workflows/ci.yml`

PR / main push 会执行以下检查：

1. `npm ci`
2. `npm run typecheck`
3. `npm run test:run`
4. `npm run build`

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

### 1.5 树工具函数

**测试文件**: `tests/vitest/tree-utils.test.ts`

**覆盖点**:

1. workspace 容器/root 检测
2. ancestor chain + structural 节点跳过
3. 可见节点 flatten 与上下导航（含 reference 场景 parentId 消歧）
4. last visible node / sibling / index helpers
5. inline reference HTML 纯度判断

### 1.6 字段值验证

**测试文件**: `tests/vitest/field-validation.test.ts`

**覆盖点**:

1. Number/Integer 数值校验 + min/max 边界
2. URL/Email 格式校验
3. 非验证类型返回 null

### 1.7 标签与引用状态流

**测试文件**: `tests/vitest/node-store-tags-refs.test.ts`

**覆盖点**:

1. applyTag/removeTag（模板字段实例化与清理）
2. add/remove reference 去重与删除
3. reference ↔ inline conversion 临时节点替换链路

### 1.8 字段状态流（Node Store）

**测试文件**: `tests/vitest/node-store-fields.test.ts`

**覆盖点**:

1. `setFieldValue` 对已有字段值节点的创建/复用/更新
2. 缺失字段时自动创建 tuple + value + associatedData
3. `addFieldToNode` 去重与 `setOptionsFieldValue` 单选写入
4. `removeField` 清理 associationMap 并将 tuple/associatedData 移入 Trash
5. `toggleCheckboxField` 的 `YES/NO` 切换链路
6. `addUnnamedFieldToNode` 的原地插入（`afterChildId`）与 attrDef 初始化
7. `autoCollectOption` 的值回填与 autocollect tuple 引用追加
8. `removeFieldOption` 从 attrDef children 移除并删除 option 节点
9. `replaceFieldAttrDef` 的占位 attrDef 置换与重复字段保护
10. `changeFieldType` / `setConfigValue` 配置 tuple 原地更新

### 1.9 Schema / Supertag 构建链路

**测试文件**: `tests/vitest/node-store-schema.test.ts`

**覆盖点**:

1. `createTagDef` 自动归属 SCHEMA + 自动应用 `SYS_T01`
2. `createAttrDef` 的 template tuple/type tuple/`SYS_T02` 配置链路
3. 新建 `attrDef` 在后续 `applyTag` 中被正确实例化到内容节点

### 1.10 Guard Rails（错误输入防护）

**测试文件**: `tests/vitest/node-store-guard-rails.test.ts`

**覆盖点**:

1. `setConfigValue` 对非 tuple ID 的保护（防止误写）
2. `addFieldOption` 仅允许 `attrDef` 目标，非法目标返回空 ID
3. `removeFieldOption` 仅删除目标 attrDef 挂载的 option，避免误删
4. `replaceFieldAttrDef` 的 owner/oldAttrDef 一致性保护

### 1.11 Trash 语义（TagDef / AttrDef）

**测试文件**: `tests/vitest/node-store-trash-semantics.test.ts`

**覆盖点**:

1. `trashNode(tagDef)` 不级联清理既有标签绑定与模板实例字段
2. `trashNode(attrDef)` 保留已实例化字段引用，同时模板 tuple key 解绑
3. `tagDef` 已入 Trash 后，`removeTag` 仍可清理模板来源字段

### 1.12 拖拽落点语义（纯函数）

**测试文件**: `tests/vitest/drag-drop-utils.test.ts`

**覆盖点**:

1. `before / after / inside` 三态落点决策
2. `after + expanded children` 解释为“放入第一个子节点”
3. 无效拖拽上下文（空 drag/self/无 parent/空 dropPosition）返回 no-op
4. `after + hasChildren 但未展开` 仍保持同级插入

### 1.13 moveNodeTo 结构安全

**测试文件**: `tests/vitest/node-store-move-node-to.test.ts`

**覆盖点**:

1. 防自环、防后代放置
2. 同父移动时索引修正（remove 后 insert 位置偏移）
3. 跨父节点移动的 children/owner 一致性

### 1.14 Drag UI Store 状态机

**测试文件**: `tests/vitest/ui-store-drag-state.test.ts`

**覆盖点**:

1. `setDrag` 会重置历史 `dropTarget/dropPosition`
2. `setDropTarget` 与 `setDrag(null)` 的状态收敛

### 1.15 导航撤销与焦点语义（UI Store）

**测试文件**: `tests/vitest/ui-store-undo-focus.test.ts`

**覆盖点**:

1. `navUndo/navRedo` 历史回放与“新导航清空 redo”
2. `focusedNode` 与 `selectedNode` 的互斥关系
3. `parentId` 消歧值的归一化（未传时为 `null`）

### 1.16 快捷键注册表一致性

**测试文件**: `tests/vitest/shortcut-registry.test.ts`

**覆盖点**:

1. registry ID 唯一性
2. `findShortcutConflicts` 的规范化冲突检测（含伪键忽略）
3. `getShortcutsByScope` 的作用域过滤
4. 当前已知冲突快照（`selected_ref.options_cancel` vs `selected_ref.clear_selection` 条件互斥场景）
5. `findUnexpectedShortcutConflicts` 白名单过滤后的异常冲突探测
6. `matchesShortcutEvent` 对 `Ctrl+Shift+Z`（`+` 分隔）与 `command/option` 别名兼容

### 1.17 全局导航快捷键拦截保护

**测试文件**: `tests/vitest/nav-undo-keyboard.test.ts`

**覆盖点**:

1. contentEditable / input / textarea 焦点下不拦截
2. 非编辑焦点与空 activeElement 下允许触发全局导航撤销/重做逻辑

### 1.18 Selected Reference 快捷键解析

**测试文件**: `tests/vitest/selected-reference-shortcuts.test.ts`

**覆盖点**:

1. `delete / convert_arrow_right / convert_printable` 分支解析
2. options 打开时的 `ArrowUp/Down/Enter/Escape` 解析
3. options 关闭时 `Escape` 的 clear-selection 语义

### 1.19 编辑器 HTML 归一化工具

**测试文件**: `tests/vitest/editor-html.test.ts`

**覆盖点**:

1. `stripWrappingP` 对单层 `<p>` 包裹的去壳与 trim
2. 嵌套 `<p>` 结构保持原样（防误裁剪）
3. `wrapInP` 对纯文本与空字符串的包裹语义
4. 已有 `<p>` 内容的稳定透传

### 1.20 TrailingInput onUpdate 决策纯函数

**测试文件**: `tests/vitest/trailing-input-actions.test.ts`

**覆盖点**:

1. `>` 触发 `create_field`
2. `#/@` 触发 `create_trigger_node`
3. Options 字段下的 open/close dropdown 决策
4. 普通文本（非 Options）返回 no-op

### 1.21 TrailingInput 键盘导航决策纯函数

**测试文件**: `tests/vitest/trailing-input-navigation.test.ts`

**覆盖点**:

1. `Backspace` 空输入下的优先级决策（reset/collapse/focus/noop）
2. `ArrowDown` 在 options 与 navigate-out 场景下的分支决策
3. `ArrowUp` 在 options/focus-last-visible/navigate-out 场景下的分支决策
4. `Escape` 的 close-options vs blur-editor 决策

### 1.22 NodeEditor 键盘决策纯函数

**测试文件**: `tests/vitest/node-editor-shortcuts.test.ts`

**覆盖点**:

1. `Enter` 在 reference/hashTag dropdown 下的优先级决策
2. `ArrowUp/Down` 的 dropdown vs boundary 导航决策
3. `Escape` 与 `Mod+Enter` 的 reference/hashTag 分支决策

### 1.23 拖拽 hover 落点分区纯函数

**测试文件**: `tests/vitest/drag-drop-position.test.ts`

**覆盖点**:

1. 目标行上中下三等分到 `before/inside/after` 的分区语义
2. 非法高度（`<=0`）下的安全回退（`inside`）
3. 临界值 `1/3` 与 `2/3` 命中中间区（`inside`）

### 1.24 Tag 颜色映射稳定性

**测试文件**: `tests/vitest/tag-colors.test.ts`

**覆盖点**:

1. 相同 tagDefId 的颜色映射确定性
2. 返回值必须来自 `TAG_COLORS` 调色板
3. 多个 tagDefId 的分布不应退化为单一颜色

### 1.25 UI Store 当前面板选择器

**测试文件**: `tests/vitest/ui-store-selector.test.ts`

**覆盖点**:

1. panelIndex 越界时返回 `null`
2. panelIndex 命中时返回当前 panel nodeId

### 1.26 UI Store 持久化与迁移辅助函数

**测试文件**: `tests/vitest/ui-store-persist.test.ts`

**覆盖点**:

1. `partializeUIStore` 仅保留持久化白名单字段
2. `migrateUIStoreState` 将 v0 `panelStack` 迁移为 `panelHistory/panelIndex`
3. 无需迁移场景下保持原对象语义

### 1.27 图结构不变量 helper 自检

**测试文件**: `tests/vitest/invariants-helper.test.ts`

**覆盖点**:

1. 有效最小图返回空错误列表
2. owner 缺失 / owner-child 不一致 / child 重复 ID 报错
3. tuple value 引用节点不触发 owner-child mismatch 误报
4. associationMap key/value 缺失报错

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
| 1.5 | tree-utils 纯函数 | PASS/FAIL |
| 1.6 | 字段值验证 | PASS/FAIL |
| 1.7 | 标签与引用状态流 | PASS/FAIL |
| 1.8 | 字段状态流（Node Store） | PASS/FAIL |
| 1.9 | Schema / Supertag 构建链路 | PASS/FAIL |
| 1.10 | Guard Rails（错误输入防护） | PASS/FAIL |
| 1.11 | Trash 语义（TagDef / AttrDef） | PASS/FAIL |
| 1.12 | 拖拽落点语义（纯函数） | PASS/FAIL |
| 1.13 | moveNodeTo 结构安全 | PASS/FAIL |
| 1.14 | Drag UI Store 状态机 | PASS/FAIL |
| 1.15 | 导航撤销与焦点语义（UI Store） | PASS/FAIL |
| 1.16 | 快捷键注册表一致性 | PASS/FAIL |
| 1.17 | 全局导航快捷键拦截保护 | PASS/FAIL |
| 1.18 | Selected Reference 快捷键解析 | PASS/FAIL |
| 1.19 | 编辑器 HTML 归一化工具 | PASS/FAIL |
| 1.20 | TrailingInput onUpdate 决策纯函数 | PASS/FAIL |
| 1.21 | TrailingInput 键盘导航决策纯函数 | PASS/FAIL |
| 1.22 | NodeEditor 键盘决策纯函数 | PASS/FAIL |
| 1.23 | 拖拽 hover 落点分区纯函数 | PASS/FAIL |
| 1.24 | Tag 颜色映射稳定性 | PASS/FAIL |
| 1.25 | UI Store 当前面板选择器 | PASS/FAIL |
| 1.26 | UI Store 持久化与迁移辅助函数 | PASS/FAIL |
| 1.27 | 图结构不变量 helper 自检 | PASS/FAIL |
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
