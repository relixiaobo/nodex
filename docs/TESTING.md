# Nodex 测试配置

本文件为 `/self-test` Skill 提供项目特定的测试参数。Skill 本身是通用自测规范，此文件定义 Nodex 的具体配置。

## 测试职责边界（重要）

1. 本文档用于 **Agent 可执行** 的验证：脚本、构建、可自动化检查点。
2. 人工验收不是全量回归，只处理“Agent 无法可靠验证”或“核心高风险路径”。
3. 人工验收清单统一维护在 `docs/MANUAL-TEST-CHECKLIST.md`，不要在本文重复维护第二份版本。

---

## 一键验证

统一命令：

```bash
npm run verify
```

执行顺序：`typecheck` → `check:test-sync` → `test:run` → `build`

---

## CI 门禁

GitHub Actions 工作流：`.github/workflows/ci.yml`

PR / main push 会执行以下检查：

1. `npm ci`
2. `npm run typecheck`
3. `npm run check:test-sync`
4. `npm run test:run`
5. `npm run build`

### Test Sync Gate（新增）

命令：`npm run check:test-sync`

规则：

1. 若改动了 `src/`，必须同时改动 `tests/vitest/*.test.ts`
2. 若改动了 `tests/vitest/`，必须同时更新 `docs/TESTING.md`

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

说明：

1. `tests/scripts/*.js`（DevTools evaluate_script 方案）已退役，不再作为回归入口。
2. 自动化回归统一以 `tests/vitest/` 为唯一权威。

### 1.1 前置检查

**测试文件**: `tests/vitest/preflight.test.ts`

**期望**: 种子数据加载成功（80+ 节点），workspace = `ws_default`，默认 panel = `ws_default_LIBRARY`

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

### 1.3.1 内容模型联动（Node Store）

**测试文件**: `tests/vitest/node-store-content.test.ts`

**覆盖点**:

1. `setNodeContentLocal` 同步写入 `name + _marks + _inlineRefs`
2. `updateNodeName` 路径保留已有 `_marks/_inlineRefs`（兼容旧调用）

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
5. inline reference 纯度判断（兼容 legacy HTML + 新模型 `\uFFFC + _inlineRefs`）

### 1.5.1 富文本 marks / ProseMirror 基础设施

**测试文件**:
- `tests/vitest/editor-marks.test.ts`
- `tests/vitest/pm-schema.test.ts`
- `tests/vitest/pm-doc-utils.test.ts`

**覆盖点**:

1. `htmlToMarks`：HTML → `text + marks + inlineRefs`
2. `marksToHtml`：`text + marks + inlineRefs` → HTML
3. `mergeAdjacentMarks`：同类 mark 合并
4. `pmSchema`：单段落 + `inlineReference` atom + 7 marks 注册
5. `marksToDoc` / `docToMarks`：PM 文档往返
6. `splitMarks` / `combineMarks`：拆分与偏移合并

### 1.5.2 ProseMirror EditorView 操作工具

**测试文件**:
- `tests/vitest/pm-editor-view.test.ts`

**覆盖点**:

1. `deleteEditorRange`：删除范围并回到起始光标
2. `replaceEditorRangeWithText`：范围替换文本
3. `replaceEditorRangeWithInlineRef`：范围替换为 `inlineReference` atom
4. `toggleHeadingMark`：选区 heading mark 切换
5. `setEditorPlainTextContent`：整段内容替换为纯文本
6. `isEditorViewAlive`：EditorView 生命周期判断

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
3. reference ↔ inline conversion 临时节点替换链路（临时节点内容为 `\uFFFC + _inlineRefs`）

### 1.8 字段状态流（Node Store）

**测试文件**: `tests/vitest/node-store-fields.test.ts`

**覆盖点**:

1. `setFieldValue` 对已有字段值节点的创建/复用/更新
2. 缺失字段时自动创建 tuple + value + associatedData
3. `addFieldToNode` 去重与 `setOptionsFieldValue` 单选写入
4. `removeField` 清理 associationMap 并将 tuple/associatedData 移入 Trash
5. `removeField` 系统配置保护：tuple key 为 SYS_*/NDX_* 前缀时跳过删除（防误删 config field）
6. `toggleCheckboxField` 的 `YES/NO` 切换链路
7. `addUnnamedFieldToNode` 的原地插入（`afterChildId`）与 attrDef 初始化
8. `autoCollectOption` 的值回填与 autocollect tuple 引用追加
9. `removeFieldOption` 从 attrDef children 移除并删除 option 节点
10. `replaceFieldAttrDef` 的占位 attrDef 置换与重复字段保护
11. `changeFieldType` / `setConfigValue` 配置 tuple 原地更新
12. `moveFieldTuple` 跨父节点迁移 tuple 时同步 `associationMap` 与 `_ownerId`

### 1.9 Schema / Supertag 构建链路

**测试文件**: `tests/vitest/node-store-schema.test.ts`

**覆盖点**:

1. `createTagDef` 自动归属 SCHEMA + 自动应用 `SYS_T01`（7 个 config tuple：checkbox/childtag/color/extends/done_mapping/checked/unchecked）
2. **统一配置字段架构验证**: 所有 config tuple 通过 associationMap 关联 AssociatedData（与用户字段同结构）
3. Config tuple key 为真实 attrDef 实体节点（`attrDef_show_checkbox` 等），非裸 SYS_A* ID
4. `createAttrDef` 的 template tuple/type tuple/`SYS_T02` 配置链路（含 AssociatedData 默认值）
5. 新建 `attrDef` 在后续 `applyTag` 中被正确实例化到内容节点（含 associationMap 验证）

### 1.10 Supertag Extend（继承）

**测试文件**: `tests/vitest/node-store-extend.test.ts`

**覆盖点**:

1. `getExtendsChain` 无继承时返回空数组
2. `getExtendsChain` 单级继承返回父 tagDef
3. `getExtendsChain` 多级继承按 ancestor-first 顺序
4. `getExtendsChain` 循环引用安全（不死循环，排除自身）
5. `applyTag` 子标签同时实例化父标签和自有字段
6. `applyTag` 跨继承链按 attrDef ID 去重
7. `applyTag` 直接应用父标签仍正常工作
8. `removeTag` 清理继承链上所有模板来源的字段
9. `removeTag` 正确移除 metanode 中的 tag binding

### 1.11 Guard Rails（错误输入防护）

**测试文件**: `tests/vitest/node-store-guard-rails.test.ts`

**覆盖点**:

1. `setConfigValue` 对非 tuple ID 的保护（防止误写）
2. `addFieldOption` 仅允许 `attrDef` 目标，非法目标返回空 ID
3. `removeFieldOption` 仅删除目标 attrDef 挂载的 option，避免误删
4. `replaceFieldAttrDef` 的 owner/oldAttrDef 一致性保护

**注意**: `removeField` 的系统配置字段保护（SYS_*/NDX_* key guard）在 1.8 node-store-fields 中覆盖。

### 1.12 Trash 语义（TagDef / AttrDef）

**测试文件**: `tests/vitest/node-store-trash-semantics.test.ts`

**覆盖点**:

1. `trashNode(tagDef)` 不级联清理既有标签绑定与模板实例字段
2. `trashNode(attrDef)` 保留已实例化字段引用，同时模板 tuple key 解绑
3. `tagDef` 已入 Trash 后，`removeTag` 仍可清理模板来源字段

### 1.13 拖拽落点语义（纯函数）

**测试文件**: `tests/vitest/drag-drop-utils.test.ts`

**覆盖点**:

1. `before / after / inside` 三态落点决策
2. `after + expanded children` 解释为“放入第一个子节点”
3. 无效拖拽上下文（空 drag/self/无 parent/空 dropPosition）返回 no-op
4. `after + hasChildren 但未展开` 仍保持同级插入

### 1.14 moveNodeTo 结构安全

**测试文件**: `tests/vitest/node-store-move-node-to.test.ts`

**覆盖点**:

1. 防自环、防后代放置
2. 同父移动时索引修正（remove 后 insert 位置偏移）
3. 跨父节点移动的 children/owner 一致性

### 1.15 Drag UI Store 状态机

**测试文件**: `tests/vitest/ui-store-drag-state.test.ts`

**覆盖点**:

1. `setDrag` 会重置历史 `dropTarget/dropPosition`
2. `setDropTarget` 与 `setDrag(null)` 的状态收敛

### 1.16 导航撤销与焦点语义（UI Store）

**测试文件**: `tests/vitest/ui-store-undo-focus.test.ts`

**覆盖点**:

1. `navUndo/navRedo` 历史回放与"新导航清空 redo"
2. `focusedNode` 与 `selectedNode` 的互斥关系
3. `parentId` 消歧值的归一化（未传时为 `null`）
4. `clearFocus` 保留 selection（Escape 编辑→选中过渡）
5. `setFocusedNode(null)` 清空 focus + selection（blur 到空白区域）
6. `setFocusedNode` 多选时收窄为单选（设计意图：进入编辑=放弃多选）

### 1.17 快捷键注册表一致性

**测试文件**: `tests/vitest/shortcut-registry.test.ts`

**覆盖点**:

1. registry ID 唯一性
2. `findShortcutConflicts` 的规范化冲突检测（含伪键忽略）
3. `getShortcutsByScope` 的作用域过滤
4. 当前已知冲突快照（`selected_ref.options_cancel` vs `selected_ref.clear_selection` 条件互斥场景）
5. `findUnexpectedShortcutConflicts` 白名单过滤后的异常冲突探测
6. `matchesShortcutEvent` 对 `Ctrl+Shift+Z`（`+` 分隔）与 `command/option` 别名兼容
7. `matchesShortcutEvent` 对字母键大小写归一化（`Ctrl+I` 事件键值为 `I` 时仍匹配 `Ctrl-i`）

### 1.18 全局导航快捷键拦截保护

**测试文件**: `tests/vitest/nav-undo-keyboard.test.ts`

**覆盖点**:

1. contentEditable / input / textarea 焦点下不拦截
2. 非编辑焦点与空 activeElement 下允许触发全局导航撤销/重做逻辑

### 1.19 Selected Reference 快捷键解析

**测试文件**: `tests/vitest/selected-reference-shortcuts.test.ts`

**覆盖点**:

1. `delete / convert_arrow_right / convert_printable` 分支解析
2. options 打开时的 `ArrowUp/Down/Enter/Escape` 解析
3. options 关闭时 `Escape` 的 clear-selection 语义

### 1.21 TrailingInput onUpdate 决策纯函数

**测试文件**: `tests/vitest/trailing-input-actions.test.ts`

**覆盖点**:

1. `>` 触发 `create_field`
2. `#/@/` 触发 `create_trigger_node`（`/` 为 slash command 触发）
3. Options 字段下的 open/close dropdown 决策
4. 普通文本（非 Options）返回 no-op

### 1.22 TrailingInput 键盘导航决策纯函数

**测试文件**: `tests/vitest/trailing-input-navigation.test.ts`

**覆盖点**:

1. `Backspace` 空输入下的优先级决策（reset/collapse/focus/noop）
2. `ArrowDown` 在 options 与 navigate-out 场景下的分支决策
3. `ArrowUp` 在 options/focus-last-visible/navigate-out 场景下的分支决策
4. `Escape` 的 close-options vs blur-editor 决策

### 1.23 NodeEditor 键盘决策纯函数

**测试文件**: `tests/vitest/node-editor-shortcuts.test.ts`

**覆盖点**:

1. `Enter` 在 reference/hashTag/slash dropdown 下的优先级决策
2. `ArrowUp/Down` 的 dropdown（含 slash）vs boundary 导航决策
3. `Escape` 与 `Mod+Enter` 的 reference/hashTag/slash 分支决策
4. slash active 时 `Mod+Enter` 返回 `noop`（不切换 checkbox）

### 1.24 拖拽 hover 落点分区纯函数

**测试文件**: `tests/vitest/drag-drop-position.test.ts`

**覆盖点**:

1. 目标行上中下三等分到 `before/inside/after` 的分区语义
2. 非法高度（`<=0`）下的安全回退（`inside`）
3. 临界值 `1/3` 与 `2/3` 命中中间区（`inside`）

### 1.25 Tag 颜色映射 + Color Swatch Selector

**测试文件**: `tests/vitest/tag-colors.test.ts`

**覆盖点**:

1. `getTagColor` 确定性哈希：相同 ID → 相同颜色
2. 返回值必须来自 `TAG_COLORS` 调色板
3. 多个 tagDefId 的分布不应退化为单一颜色
4. `resolveTagColor` 优先级：SYS_T* → gray; SYS_A11 config → 命名色; fallback → hash
5. `resolveTagColor` 配置写入后读取 SYS_A11 值
6. `resolveTagColor` 未知色名 → fallback to hash
7. `SWATCH_OPTIONS` 10 项 + 键映射完整性
8. SYS_A11 attrDef 使用 `NDX_D02` (COLOR) 数据类型

### 1.26 UI Store 当前面板选择器

**测试文件**: `tests/vitest/ui-store-selector.test.ts`

**覆盖点**:

1. panelIndex 越界时返回 `null`
2. panelIndex 命中时返回当前 panel nodeId

### 1.27 UI Store 持久化与迁移辅助函数

**测试文件**: `tests/vitest/ui-store-persist.test.ts`

**覆盖点**:

1. `partializeUIStore` 仅保留持久化白名单字段
2. `migrateUIStoreState` 将 v0 `panelStack` 迁移为 `panelHistory/panelIndex`
3. 无需迁移场景下保持原对象语义

### 1.28 图结构不变量 helper 自检

**测试文件**: `tests/vitest/invariants-helper.test.ts`

**覆盖点**:

1. 有效最小图返回空错误列表
2. owner 缺失 / owner-child 不一致 / child 重复 ID 报错
3. tuple value 引用节点不触发 owner-child mismatch 误报
4. associationMap key/value 缺失报错

### 1.29 Field Utils 解析与映射

**测试文件**: `tests/vitest/field-utils.test.ts`

**覆盖点**:

1. attrDef 配置 tuple 解析（dataType/sourceTag/hide/required/min/max）及默认值
2. 非法 min/max 数值回退为 `undefined`
3. options 与 autocollect 节点解析（含开关关闭场景）
4. metanode + supertag tuple 的 tagged node 解析
5. field type label/icon/plain 判定映射

### 1.30 Chrome Storage 适配层

**测试文件**: `tests/vitest/chrome-storage.test.ts`

**覆盖点**:

1. `Set` 的 JSON 序列化与反序列化恢复
2. missing key 返回 `null`
3. `removeItem` 删除语义

### 1.31 Supabase Service 生命周期

**测试文件**: `tests/vitest/supabase-service.test.ts`

**覆盖点**:

1. init 前 `getSupabase` 抛错
2. `initSupabase` 调用 `createClient` 且 `isSupabaseReady` 变为 `true`
3. `resetSupabase` 后恢复未初始化状态

### 1.32 UI Store 历史边界保护

**测试文件**: `tests/vitest/ui-store-history-guards.test.ts`

**覆盖点**:

1. `navigateTo` 命中当前页面时 no-op（不新增历史/undo）
2. `goBack/goForward` 在边界位置 no-op
3. 空 undo/redo 栈下 `navUndo/navRedo` no-op
4. 空历史下 `replacePanel` 的初始化行为

### 1.33 Checkbox 三态模型与 Done 状态

**测试文件**: `tests/vitest/checkbox-utils.test.ts`

**覆盖点**:

shouldNodeShowCheckbox（7 cases）:
1. 无标签节点 → showCheckbox=false
2. 有标签但 SYS_A55=NO → showCheckbox=false
3. 有标签且 SYS_A55=YES → showCheckbox=true, isDone=false
4. 标签 SYS_A55=YES + `_done>0` → showCheckbox=true, isDone=true
5. `_done=0`（手动 undone）→ showCheckbox=true, isDone=false
6. `_done>0`（手动 done）→ showCheckbox=true, isDone=true
7. 不存在的节点 → 安全回退

resolveCheckboxClick（4 cases）:
8. undone→done（manual）: 返回 timestamp
9. done→undone=0（manual）: 保留 checkbox
10. undone→done（tag-driven）: 返回 timestamp
11. done→undefined（tag-driven）: tag 保持 checkbox

resolveCmdEnterCycle（5 cases）:
12. manual: No→Undone(0)
13. manual: Undone→Done(timestamp)
14. manual: Done→No(undefined)
15. tag-driven: undone→done
16. tag-driven: done→undone(undefined)

Store integration（2 cases）:
17. `toggleNodeDone` click toggle undone↔done
18. `cycleNodeCheckbox` 3-state cycle for manual nodes

### 1.34 Editor isEmpty / handleDelete 零宽空格 + Hash Cleanup Safety

**测试文件**: `tests/vitest/editor-isEmpty.test.ts`

**覆盖点**:

editor isEmpty（7 cases）:
1. 纯 `\u200B`（零宽空格）视为空（Bug #54 回归）
2. 多个 `\u200B` 视为空
3. `\u200B` + 空白符混合视为空
4. `\u200B` + 实际文本视为非空
5. 空字符串与纯空白符边界

handleDelete isEmpty（6 cases, Bug #54 回归）:
6. HTML name 仅含 `\u200B` → 允许删除
7. 空 HTML / HTML 标签包裹 `\u200B` → 允许删除
8. 真实文本 / `\u200B` + 真实文本 → 阻止删除

hash trigger cleanup safety（2 cases, Bug #53 回归）:
9. DOM cleanup 失败后检测残留 `#` 触发词
10. DOM cleanup 成功后无残留

### 1.35 节点搜索 SKIP_DOC_TYPES 过滤

**测试文件**: `tests/vitest/node-search-filter.test.ts`

**覆盖点**:

1. `tagDef` 节点被过滤（不出现在搜索结果中）
2. `attrDef` 节点被过滤
3. `tuple` / `metanode` 节点被过滤
4. 普通内容节点正常返回

### 1.36 Workspace Store 认证状态与持久化

**测试文件**: `tests/vitest/workspace-store.test.ts`

**覆盖点**:

1. 默认状态为未登录（`currentWorkspaceId/userId = null`，`isAuthenticated = false`）
2. `setWorkspace + setUser` 后状态一致，且写入 `nodex-workspace` 持久化键
3. `logout` 清空用户与工作区上下文，并恢复未登录状态

### 1.37 Slash Command 注册与导航

**测试文件**: `tests/vitest/slash-commands.test.ts`

**覆盖点**:

1. `filterSlashCommands` 按命令名和关键词过滤（含 `clip_page`）
2. 空 query 返回全量基线命令列表（11 项）
3. `getFirstEnabledSlashIndex` 跳过禁用项返回首个可用索引（`clip_page`）
4. `getNextEnabledSlashIndex` 仅在 enabled 项间上下移动（含 `heading`），边界 clamp
5. `heading` 命令处于 enabled 状态
6. 全部禁用时返回 `-1`

### 1.43 Floating Toolbar 循环渲染防回归

**测试文件**: `tests/vitest/floating-toolbar.test.ts`

**覆盖点**:

1. `FloatingToolbar` 监听 `selectionUpdate` / `transaction` / `focus` / `blur`，并在组件卸载时正确清理
2. 非空 `TextSelection` 且编辑器聚焦时显示
3. 空选区或 `NodeSelection` 时隐藏
4. 鼠标拖拽选区期间保持隐藏，`mouseup` 后再显示
5. 双击选词路径在第二次点击 `mouseup` 后即可显示（不需要额外点击）
6. 失焦（blur）立即隐藏

### 1.38 Done State Mapping（checkbox ↔ Options 联动，统一字段模型）

**测试文件**: `tests/vitest/done-state-mapping.test.ts`

**说明**: DoneMappingEntries 从 AssociatedData 读取映射数据（统一配置字段架构）。DoneMappingEntries selectors 使用 JSON.stringify 防止 React 19 无限循环。

**覆盖点**:

纯函数 — getDoneStateMappings（8 cases）:
1. 无标签 → 空
2. 有标签但无映射配置 → 空
3. 新格式 (toggle+嵌套 NDX_A07/A08) → 返回映射 (checked only)
4. 含 uncheckedOptionIds 配置
5. 多个 checked option IDs
6. 多个 unchecked option IDs
7. Toggle OFF → 空
8. 沿 Extend 链继承
9. 不存在节点 → 空

纯函数 — 旧格式向后兼容（3 cases）:
10. 旧格式 (NDX_A06 children>=3) 正常解析
11. 旧格式含 uncheckedOptionId
12. 旧格式 Extend 链继承

嵌套结构验证（3 cases）:
35. 嵌套 NDX_A07/A08 在 NDX_A06 toggle 子节点中正确读取
36. toggle OFF 时嵌套子节点存在但不返回映射
37. 嵌套结构 Extend 链继承

纯函数 — resolveForwardDoneMapping（5 cases）:
13. isDone=true → 第一个 checkedOptionId
14. isDone=true + 多 checked → 仍取第一个
15. isDone=false + unchecked → 第一个 uncheckedOptionId
16. isDone=false 无 unchecked → 空
17. 无映射 → 空

纯函数 — resolveReverseDoneMapping（7 cases）:
18. checkedOption → newDone=true
19. 多 checked 中任一匹配 → newDone=true
20. uncheckedOption → newDone=false
21. 多 unchecked 中任一匹配 → newDone=false
22. 无关 option → null
23. attrDefId 不匹配 → null
24. 无 unchecked + non-checked option → null

Store 集成 — setOptionsFieldValue（3 cases）:
25. `setOptionsFieldValue`（opt_done）→ checkbox 自动勾选
26. `setOptionsFieldValue`（opt_todo）→ checkbox 自动取消
27. `setOptionsFieldValue`（opt_in_progress）→ checkbox 不变

Store 集成 — selectFieldOption / UI 路径（4 cases）:
28. `selectFieldOption` via assocDataId（opt_done）→ checkbox 自动勾选
29. `selectFieldOption` via assocDataId（opt_todo）→ checkbox 自动取消
30. `selectFieldOption` via assocDataId（opt_in_progress）→ checkbox 不变
31. `selectFieldOption` old→new option swap（children 替换正确）

Store 集成 — forward mapping（2 cases）:
32. `toggleNodeDone`（undone→done）→ Status 设为 opt_done
33. `toggleNodeDone`（done→undone）→ Status 设为 opt_todo

Store 集成 — 安全性（1 case）:
34. 原子 set() 无循环：forward + reverse 独立操作

Store 集成 — addDoneMappingEntry（2 cases）:
38. 创建 mapping entry tuple，追加到 toggle children
39. 新条目被 getDoneStateMappings 正确读取

Store 集成 — removeDoneMappingEntry（2 cases）:
40. 从 toggle children 中移除并删除 entity
41. 移除后 getDoneStateMappings 结果为空

### 1.39 Web Clip 落库服务

**测试文件**: `tests/vitest/webclip-service.test.ts`

**覆盖点**:

findTagDefByName（4 cases）:
1. 按名称查找已有 tagDef（大小写不敏感）
2. 不同大小写匹配
3. 不存在的 tagDef 返回 undefined
4. 不存在的 schema 返回 undefined

findTemplateAttrDef（3 cases）:
5. 在 tagDef 模板中查找 attrDef
6. 不存在的字段名返回 undefined
7. 不存在的 tagDef 返回 undefined

saveWebClip（8 cases）:
8. 在 Inbox 创建节点（默认 parentId，title + ownerId 正确）
9. 在自定义 parentId 下创建节点（非 Inbox）
10. 自动打 `#web_clip` 标签（复用已有 tagDef）
11. 写入 Source URL 字段值
12. 设置 description（如有）
13. description 为空时不写入
14. 首次剪藏时自动创建 tagDef
15. 重复剪藏复用同一 tagDef

applyWebClipToNode（5 cases）:
16. 就地改名为页面标题
17. 就地打 `#web_clip` 标签
18. 就地写入 Source URL 字段值
19. 就地设置 description
20. 不改变节点 ownership（留在原父节点）

### 1.42 Default Child Supertag (SYS_A14)

**测试文件**: `tests/vitest/child-supertag.test.ts`

**覆盖点**:

resolveChildSupertags 纯函数（4 cases）:
1. 无标签父节点 → 空
2. 有标签但无 SYS_A14 → 空
3. SYS_A14 已配置 → 返回 child tag ID
4. 不存在的父节点 → 空

createChild 自动标签（4 cases）:
5. 父有 SYS_A14 → 新子节点自动标签
6. 父无 SYS_A14 → 无自动标签
7. 父无标签 → 无自动标签
8. 多标签各有 SYS_A14 → 全部应用

createSibling 自动标签（2 cases）:
9. 兄弟父有 SYS_A14 → 新兄弟自动标签
10. 兄弟父无 SYS_A14 → 无自动标签

### 1.39 Selection Mode 键盘决策纯函数

**测试文件**: `tests/vitest/selection-keyboard.test.ts`

**覆盖点**:

1. `ArrowUp` → `navigate_up`（退出选中，编辑上一节点，光标在末尾）
2. `ArrowDown` → `navigate_down`（退出选中，编辑下一节点，光标在开头）
3. `Enter` → `enter_edit`（编辑选中节点，光标在末尾）
4. `Escape` → `clear_selection`（清除所有选中）
5. 可打印字符 → `type_char`（编辑选中节点 + 追加字符）
6. `Shift+↑` → `extend_up`（从锚点向上扩展选区）
7. `Shift+↓` → `extend_down`（从锚点向下扩展选区）
8. `Cmd+A` / `Ctrl+A` → `select_all`（选中所有顶层节点）
9. `Cmd/Ctrl+非a` / `Alt+key` → `null`（其他修饰键组合不处理）
10. 特殊键（F1/Shift/Control）→ `null`
11. `Enter` + 非批量修饰键（Shift/Alt）→ `null`
12. `Backspace` / `Delete` → `batch_delete`（批量删除选中节点）
13. `Tab` → `batch_indent`（批量缩进）
14. `Shift+Tab` → `batch_outdent`（批量取消缩进）
15. `Cmd+Shift+D` → `batch_duplicate`（批量复制，含大小写兼容）
16. `Cmd+Enter` / `Ctrl+Enter` → `batch_checkbox`（批量 checkbox 切换）

### 1.40 Multi-Select 纯函数工具库

**测试文件**: `tests/vitest/selection-utils.test.ts`

**覆盖点**:

1. `isNodeOrAncestorSelected` — 空选区/自身/父/祖父/兄弟/未知节点
2. `hasSelectedAncestor` — 空选区/仅自身/父选中/根节点
3. `toggleNodeInSelection` — 新增/移除/忽略后代/吸收后代/嵌套吸收
4. `computeRangeSelection` — 正向/反向/单节点/全范围/缺失锚点回退
5. `filterToRootLevel` — 过滤子节点/全保留/空集/深嵌套链
6. `filterToRootLevel` with flatList — 显示层级过滤/reference 节点不被错误过滤/display parent 选中时过滤
7. `getFirstSelectedInOrder` — 多选首项/空选区/单选
8. `getSelectedIdsInOrder` — 可见顺序排列/空选区/过滤/忽略不在 flatList 中的 ID
9. `getSelectionBounds` — 首尾边界/单选/空选区/非连续选区
10. `getEffectiveSelectionBounds` with reference — 显示层级 reference 节点隐式选中
11. `computeRangeSelection` with reference — 跨 reference 范围选择/不振荡

### 1.45 ConfigOutliner TrailingInput 显示规则

**测试文件**: `tests/vitest/config-outliner.test.ts`

**覆盖点**:

1. 空 ConfigOutliner 显示 TrailingInput
2. 最后一项为 field 时显示 TrailingInput
3. 最后一项为 content 时隐藏 TrailingInput

### 1.46 FieldValueOutliner TrailingInput 显示规则

**测试文件**: `tests/vitest/field-value-outliner.test.ts`

**覆盖点**:

1. 空 FieldValueOutliner 显示 TrailingInput
2. 最后一项为 field 时显示 TrailingInput
3. 最后一项为 content 时隐藏 TrailingInput

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
| 1.10 | Supertag Extend（继承） | PASS/FAIL |
| 1.11 | Guard Rails（错误输入防护） | PASS/FAIL |
| 1.12 | Trash 语义（TagDef / AttrDef） | PASS/FAIL |
| 1.13 | 拖拽落点语义（纯函数） | PASS/FAIL |
| 1.14 | moveNodeTo 结构安全 | PASS/FAIL |
| 1.15 | Drag UI Store 状态机 | PASS/FAIL |
| 1.16 | 导航撤销与焦点语义（UI Store） | PASS/FAIL |
| 1.17 | 快捷键注册表一致性 | PASS/FAIL |
| 1.18 | 全局导航快捷键拦截保护 | PASS/FAIL |
| 1.19 | Selected Reference 快捷键解析 | PASS/FAIL |
| 1.21 | TrailingInput onUpdate 决策纯函数 | PASS/FAIL |
| 1.22 | TrailingInput 键盘导航决策纯函数 | PASS/FAIL |
| 1.23 | NodeEditor 键盘决策纯函数 | PASS/FAIL |
| 1.24 | 拖拽 hover 落点分区纯函数 | PASS/FAIL |
| 1.25 | Tag 颜色映射稳定性 | PASS/FAIL |
| 1.26 | UI Store 当前面板选择器 | PASS/FAIL |
| 1.27 | UI Store 持久化与迁移辅助函数 | PASS/FAIL |
| 1.28 | 图结构不变量 helper 自检 | PASS/FAIL |
| 1.29 | Field Utils 解析与映射 | PASS/FAIL |
| 1.30 | Chrome Storage 适配层 | PASS/FAIL |
| 1.31 | Supabase Service 生命周期 | PASS/FAIL |
| 1.32 | UI Store 历史边界保护 | PASS/FAIL |
| 1.33 | Checkbox 可见性与 Done 状态 | PASS/FAIL |
| 1.34 | Editor isEmpty 零宽空格 | PASS/FAIL |
| 1.35 | 节点搜索 SKIP_DOC_TYPES 过滤 | PASS/FAIL |
| 1.36 | Workspace Store 认证状态与持久化 | PASS/FAIL |
| 1.37 | Slash Command 注册与导航 | PASS/FAIL |
| 1.38 | Done State Mapping | PASS/FAIL |
| 1.39 | Web Clip 落库服务 | PASS/FAIL |
| 1.42 | Default Child Supertag (SYS_A14) | PASS/FAIL |
| 1.43 | Floating Toolbar 循环渲染防回归 | PASS/FAIL |
| 1.44 | PM EditorView 操作工具 | PASS/FAIL |
| 1.45 | ConfigOutliner TrailingInput 显示规则 | PASS/FAIL |
| 1.46 | FieldValueOutliner TrailingInput 显示规则 | PASS/FAIL |
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
总数: ~85 节点

Library:    proj_1, task_1~3, subtask_1a~1b, subtask_2a~2c,
            note_1, note_1a~1c, note_2, idea_1~2,
            note_rich, rich_1~5
Inbox:      inbox_1~3, inbox_3a~3b, webclip_1
Journal:    journal_1, j_1~3
Containers: ws_default_LIBRARY, ws_default_INBOX, ws_default_JOURNAL,
            ws_default_SEARCHES, ws_default_TRASH, ws_default_SCHEMA
Schema:     tagDef_task, tagDef_person, tagDef_dev_task, tagDef_web_clip,
            attrDef_status/priority/due/email/company/source_url + type tuples + option nodes
Pre-tagged: task_1 → #Task (meta_task_1, field tuples, associatedData, checkbox=YES)
            webclip_1 → #web_clip (Source URL = https://medium.com/example-article)

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
