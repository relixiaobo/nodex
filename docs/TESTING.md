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
| 8 | graph invariants | `children` / `_ownerId` / `meta` 一致性 |

### 1.3 UI Store 操作

**测试文件**: `tests/vitest/ui-store.test.ts`

**覆盖点**: navigateTo, goBack, goForward, replacePanel, expand, collapse, toggleExpand, setFocus, clearFocus, openSearch, closeSearch, toggleSidebar

### 1.3.1 内容模型联动（Node Store）

**测试文件**:
- `tests/vitest/node-store-content.test.ts`
- `tests/vitest/node-store-inline-refs.test.ts`

**覆盖点**:

1. `updateNodeContent` 同步写入 `name + marks + inlineRefs`（并写入 `richText`）
2. `setNodeName` 保留已有 `marks/inlineRefs`，并按占位符顺序重映射 inlineRef offset
3. 清空 marks/inlineRefs 后读取结果为空数组
4. LoroDoc 作为单一事实来源：更新后立即可读
5. `createChild` 传入内容 payload 时立即初始化 `richText`（无需二次编辑触发迁移）
6. 仅更新 marks 时，`updatedAt` 也会通过 `richText` 写路径刷新
7. `setNodeName` 更新后，`raw name` 保持原值（编辑链路不再实时镜像 `name`）
8. 普通内容节点 `createChild` 后 `raw name` 为空（仅 `richText` 持有内容）
9. `remapInlineRefsByPlaceholderOrder` 独立覆盖占位符增减/重排场景（删除占位符会截断、增加占位符不生成新引用、旧 offset 先排序再映射）

### 1.3.2 Realtime 自回显保护

**测试文件**: `tests/vitest/realtime-echo-protection.test.ts`

**覆盖点**:

1. `_pendingChildrenOps` 保护 — `setNode` 跳过 children 覆盖当 parent 有 in-flight 操作
2. pending 清除后 `setNode` 恢复正常全量替换
3. pending ref count 正确追踪并发操作（+1/-1/清零）
4. pending 状态下仍更新 non-children props（version/updatedBy/description 等）
5. `trashNode` 乐观更新正确从 parent.children 移除节点

### 1.4 边界条件

**测试文件**: `tests/vitest/edge-cases.test.ts`

**覆盖点**: indent 第一个子节点 (no-op)、outdent 顶层节点 (no-op)

### 1.5 树工具函数

**测试文件**: `tests/vitest/tree-utils.test.ts`

**覆盖点**:

1. workspace 容器/root 检测
2. ancestor chain + structural 节点跳过 + **容器节点包含在 ancestors chain 中**（面包屑显示 Library/Inbox 等）
3. 可见节点 flatten 与上下导航（含 reference 场景 parentId 消歧）
4. last visible node / sibling / index helpers
5. inline reference 纯度判断（仅基于新模型 `\uFFFC + inlineRefs`）

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

1. Number/Integer 数值校验 + min/max 边界（兼容 `FIELD_TYPES.*` / `SYS_D.*`）
2. URL/Email 格式校验（兼容 `FIELD_TYPES.*` / `SYS_D.*`）
3. 非验证类型返回 null

### 1.6.1 FieldRow 配置字段渲染映射

**测试文件**:
- `tests/vitest/field-row-props.test.ts`
- `tests/vitest/use-node-fields-config.test.ts`
- `tests/vitest/field-list-config-render.test.ts`
- `tests/vitest/field-row-config-render.test.ts`
- `tests/vitest/field-row-selection.test.ts`
- `tests/vitest/options-picker.test.ts`

**覆盖点**:

1. `toFieldRowEntryProps` 保留系统配置字段渲染必需元数据（`isSystemConfig/configKey/configControl`）
2. `computeNodeFields` 为 tagDef/fieldDef 虚拟配置字段正确输出 `configControl`
3. `FieldList` 渲染配置行时，tag_picker/type_choice/select 控件保持专用 UI（不退化到灰点 outliner）
4. `FieldRow` 在 `configControl` 缺失时可基于 `configKey` 注册表兜底分发控件
5. `OutlinerItem/OutlinerView/FieldList` 统一复用同一映射，避免调用方漏传导致配置控件退化
6. `OptionsPicker` 的新建选项能力受 `autocollectOptions` 控制（未显式关闭时允许，显式关闭后禁止）
7. 字段 value 布局基线由共享常量 `FIELD_VALUE_INSET` 驱动，`FieldRow` 配置项渲染测试锁定该常量对齐
8. `computeNodeFields` 对 options value 优先按 `targetId -> option.name` 解引用，避免 UI 展示内部 optionId（如 `opt_in_progress`）
9. `number_input` 虚拟配置字段的数据类型标记为 `FIELD_TYPES.NUMBER`（`Minimum/Maximum value` 语义为 Number）
10. `number_input` 配置控件使用文本输入（不依赖原生 number spinner），与普通 Number 字段一致走 warning 校验路径
11. `number_input` 配置值为非法数字字符串时，FieldRow value 区右侧展示同款 warning 图标（与普通 Number 字段位置一致）
12. FieldRow 选中遮罩与 content row 使用同款视觉配方（`bg-selection-row + border + top/bottom inset`），并保证名称/值层级高于遮罩（避免选中后值区文本被遮盖）

### 1.7 标签与引用状态流

**测试文件**: `tests/vitest/node-store-tags-refs.test.ts`

**覆盖点（Loro 模型）**:

1. `applyTag(nodeId, tagDefId)` — 向 node.tags 写入 tagDefId，为 tagDef 所有 fieldDef 创建 fieldEntry 子节点
2. `removeTag(nodeId, tagDefId)` — 从 node.tags 移除，删除模板来源的 fieldEntry 子节点
3. applyTag 幂等（重复调用不产生重复 tag 或重复 fieldEntry）
4. removeTag 仅清理模板来源字段，手动添加字段保留
5. `addReference(parentId, targetId)` 非幂等 — 每次创建新的 reference 节点
6. `removeReference(refNodeId)` 删除 reference 节点
7. `startRefConversion(refId, parentId, idx)` 替换 ref 节点为 inline content 节点
8. `startRefConversion(targetId, parentId, idx)` 防御路径：不删除 target，本地生成 inline content 节点
9. `startRefConversion` 创建的临时 inline content 节点会立即写入 `richText` 容器

### 1.8 字段状态流（Node Store）

**测试文件**: `tests/vitest/node-store-fields.test.ts`

**覆盖点（Loro 模型）**:

1. `setFieldValue(nodeId, fieldDefId, values[])` — 清空旧值，创建新 value 节点（children of fieldEntry）
2. `clearFieldValue(nodeId, fieldDefId)` — 删除 fieldEntry 的所有 value 子节点
3. `setOptionsFieldValue(nodeId, fieldDefId, optionId)` — value 节点仅写 `targetId`（不冗余 `name`）
4. `addDoneMappingEntry/removeDoneMappingEntry` 的 option 值节点同样仅用 `targetId`，`checkbox-utils` 读取不再依赖 `name` fallback
5. `addFieldToNode(nodeId, fieldDefId)` — 幂等（已存在则返回已有 feId）
6. `removeField(nodeId, feId)` — 直接删除 fieldEntry 节点（Loro 不移入 Trash）
7. `toggleCheckboxField(feId)` — 无子节点时创建 `name:'true'` 节点；有子节点则删除全部
8. `addUnnamedFieldToNode(nodeId)` — 返回 `{ fieldEntryId, fieldDefId }`，占位 fieldDef 创建在 SCHEMA
9. `replaceFieldDef(nodeId, feId, oldFdId, newFdId)` — 直接写入 fieldDefId（无所有权校验）

### 1.9 Schema / Supertag 构建链路

**测试文件**: `tests/vitest/node-store-schema.test.ts`

**覆盖点（Loro 模型）**:

1. `createTagDef(name, opts?)` — 创建 type='tagDef' 节点归属 CONTAINER_IDS.SCHEMA，无 SYS_T01 meta / config tuples
2. 可选参数 `showCheckbox` / `color` 直接写入节点属性（平铺，无 Tuple 间接层）
3. `createFieldDef(name, fieldType, tagDefId)` — 创建 type='fieldDef' 节点归属 tagDefId
4. `changeFieldType(fieldDefId, newType)` — 直接更新 fieldType 属性

### 1.10 Supertag Extend（继承）

**测试文件**: `tests/vitest/node-store-extend.test.ts`

**覆盖点（Loro 模型）**:

1. `getExtendsChain({}, tagDefId)` 公共 API（field-utils）：无继承 → `[]`，ancestor-first 顺序，排除自身
2. 局部 `getExtendsChain` (node-store.ts 内部)：**包含自身**，applyTag/removeTag 用此版本
3. `applyTag(nodeId, tagDefId)` — 为 tagDef 及全部 ancestors 的 fieldDef 创建 fieldEntry（含自身）
4. `applyTag` 幂等 — 重复调用不产生重复 fieldEntry
5. `applyTag` 子标签 (tagDef_dev_task extends tagDef_task) 实例化全链路 fieldDef（4+1=5 条）
6. `removeTag` 删除继承链上所有模板来源的 fieldEntry 节点
7. `removeTag` 保留手动添加（非模板来源）的 fieldEntry 节点
8. `removeTag` 从 node.tags 数组移除 tagDefId
9. 多标签共享继承字段时，`removeTag` 不误删仍被其他标签需要的 fieldEntry

### 1.11 Guard Rails（错误输入防护）

**测试文件**: `tests/vitest/node-store-guard-rails.test.ts`

**覆盖点（Loro 模型）**:

1. `setConfigValue(nodeId, key, value)` — 直接写入节点属性（无 Tuple 间接层，无所有权校验）
2. `addFieldOption(fieldDefId, name)` — 在 fieldDef 下创建 option 节点，返回 optionId
3. `removeFieldOption(fieldDefId, optionId)` — 直接删除节点（无所有权校验），不存在时不报错
4. `addUnnamedFieldToNode(nodeId)` — 返回 `{ fieldEntryId, fieldDefId }` 结构
5. `replaceFieldDef(nodeId, feId, oldFdId, newFdId)` — 直接写入 fieldDefId（Loro 无 owner 校验）
6. Workspace 容器节点不可移动/不可入 Trash（move/indent/up/down/trash guard）

### 1.12 Trash 语义（TagDef / AttrDef）

**测试文件**: `tests/vitest/node-store-trash-semantics.test.ts`

**覆盖点（Loro 模型）**:

1. `trashNode(nodeId)` — 同步移至 CONTAINER_IDS.TRASH，记录 `_trashedFrom` / `_trashedIndex`
2. trashNode 将节点从原父节点 children 中移除
3. 多节点可同时在 TRASH 中
4. `trashNode(tagDefId)` 不移除其他节点 tags 数组中的 tagDefId（不级联清理）
5. `restoreNode(nodeId)` — 恢复到 `_trashedFrom` 原父节点，原位置优先
6. `restoreNode` 原父不存在时回退到 CONTAINER_IDS.LIBRARY
7. `tagDef` 已入 Trash 后，`removeTag` 仍可清理模板来源的 fieldEntry 节点

### 1.13 拖拽落点语义（纯函数）

**测试文件**: `tests/vitest/drag-drop-utils.test.ts`

**覆盖点**:

1. `before / after / inside` 三态落点决策
2. `after + expanded children` 解释为“放入第一个子节点”
3. 无效拖拽上下文（空 drag/self/无 parent/空 dropPosition）返回 no-op
4. `after + hasChildren 但未展开` 仍保持同级插入

### 1.14 moveNodeTo 结构安全

**测试文件**: `tests/vitest/node-store-move-node-to.test.ts`

**覆盖点（Loro 模型）**:

1. `moveNodeTo(nodeId, newParentId, index?)` — 防自环、防后代放置（no-op）
2. 同父重排：`note_2` 子节点 `[idea_1, idea_2]` 重排正确（LoroDoc movable list 语义）
3. 跨父移动：移出旧父 children，进入新父 children，parentId 更新
4. 末尾追加（无 index 参数）
5. 指定索引插入
6. `moveNodeUp` / `moveNodeDown` — 同父节点内上下移一位，边界为 no-op

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
7. `selectionSource` 语义：reference 单击可标记 `ref-click`，进入编辑/多选/Esc 过渡统一归一为 `global`

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
4. IME 组合输入事件（`isComposing` / `Process` / `keyCode=229`）不触发 reference 选中态快捷键

### 1.20 Row Interactions 共享意图层

**测试文件**: `tests/vitest/row-interactions.test.ts`

**覆盖点**:

1. content row 在 reference/hashTag/slash 下拉打开时的优先级决策
2. content row 边界导航与默认导航分支
3. trailing row options intent 仅在 `optionsOpen && optionCount > 0` 时生效
4. trailing row backspace/arrow/escape 的优先级与原语义一致
5. trailing row onUpdate（`#/@/>/options`）决策统一由共享层提供

### 1.21 TrailingInput onUpdate 决策纯函数（direct import `row-interactions`）

**测试文件**: `tests/vitest/trailing-input-actions.test.ts`

**覆盖点**:

1. `>` 触发 `create_field`
2. `#/@/` 触发 `create_trigger_node`（`/` 为 slash command 触发）
3. Options 字段下的 open/close dropdown 决策
4. 普通文本（非 Options）返回 no-op

### 1.22 TrailingInput 键盘导航决策纯函数（direct import `row-interactions`）

**测试文件**: `tests/vitest/trailing-input-navigation.test.ts`

**覆盖点**:

1. `Backspace` 空输入下的优先级决策（reset/collapse/focus/noop）
2. `ArrowDown` 在 options 与 navigate-out 场景下的分支决策
3. `ArrowUp` 在 options/focus-last-visible/navigate-out 场景下的分支决策
4. `Escape` 的 close-options vs blur-editor 决策
5. `Enter` 的 options-confirm / create-content-and-continue / create-empty 决策

### 1.23 NodeEditor 键盘决策纯函数（direct import `row-interactions`）

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

### 1.25 Tag 颜色映射 + Color Swatch Selector + Bullet Colors

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

**待覆盖（2026-02-20 新增函数）**:
- `resolveNodeBulletColors(nodeId)` — 0 标签返回 []；1 标签返回 [color]；多标签返回各 tagDef 颜色数组

### 1.26 UI Store 当前面板选择器

**测试文件**: `tests/vitest/ui-store-selector.test.ts`

**覆盖点**:

1. panelIndex 越界时返回 `null`
2. panelIndex 命中时返回当前 panel nodeId

### 1.27 UI Store 持久化与迁移辅助函数

**测试文件**: `tests/vitest/ui-store-persist.test.ts`

**覆盖点**:

1. `partializeUIStore` 仅保留持久化白名单字段
2. 当前持久化结构下 `panelHistory/panelIndex` 保持稳定

### 1.28 图结构不变量 helper 自检

**测试文件**: `tests/vitest/invariants-helper.test.ts`

**覆盖点（Loro 模型）**:

1. `collectNodeGraphErrors()` 无参数版本，直接读取 LoroDoc
2. 种子图（seeded graph）无错误
3. 合法操作后图结构仍有效（trashNode / createChild / moveNodeTo）
4. 孤儿节点（child 存在但父节点 children 列表未包含）可被检测
5. 子节点重复 ID 报错

### 1.29 Field Utils 解析与映射

**测试文件**: `tests/vitest/field-utils.test.ts`

**覆盖点（Loro 模型）**:

1. `resolveDataType(fieldDefId)` — 读取 fieldDef.fieldType，缺失时回退 FIELD_TYPES.PLAIN
2. `resolveFieldOptions(fieldDefId)` — 返回 fieldDef 子节点中 option 节点（按 children 顺序）
3. `getExtendsChain(tagDefId)` — 读 tagDef.extends，ancestor-first 顺序，排除自身
4. `resolveHideField(fieldDefId)` — 读 fieldDef.hideField 属性，默认 SYS_V.NEVER
5. `resolveRequired(fieldDefId)` — nullable=false → true，其他 → false
6. `resolveMinValue` / `resolveMaxValue` — 读 fieldDef.minValue/maxValue，并仅在值可解析为 finite number 时生效（非法字符串返回 undefined）
7. `resolveSourceSupertag(fieldDefId)` — 读 fieldDef.sourceSupertag
8. `resolveTaggedNodes(tagDefId)` — 返回所有含该 tagDefId 在 node.tags 中的节点 ID
9. `getFieldTypeLabel` / `getFieldTypeIcon` / `isPlainFieldType` / `isOptionsFieldType` / `isOptionsFromSupertagFieldType` / `isCheckboxFieldType` / `isDateFieldType` / `isNumberLikeFieldType` / `isUrlFieldType` / `isEmailFieldType` / `isSingleValueFieldType` — 字段类型元数据与统一判定（兼容 `FIELD_TYPES.*` 与 `SYS_D.*`）

**注意（2026-02-20 更新）**: seed-data.ts 已修正，所有 fieldType 使用 `FIELD_TYPES.*` 常量（小写），测试期望值同步更新为 `FIELD_TYPES.OPTIONS` / `FIELD_TYPES.DATE` / `FIELD_TYPES.PLAIN`，不再使用大写字符串。

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

**覆盖点（Loro 模型）**:

`shouldNodeShowCheckbox(node: NodexNode)`:
1. 无 tags → showCheckbox=false
2. 有 tags，tagDef.showCheckbox=false → showCheckbox=false
3. tagDef.showCheckbox=true, completedAt 未设 → isDone=false
4. tagDef.showCheckbox=true, completedAt>0 → isDone=true
5. completedAt=0（手动 undone）→ isDone=false
6. node.completedAt>0（独立，无 tag）→ isDone=true
7. 不存在节点 → 安全回退

`resolveCheckboxClick(node)`:
8. undone→done（manual）: 返回 timestamp
9. done→undone（manual）: completedAt=0
10. undone→done（tag-driven）: 返回 timestamp
11. done→undone（tag-driven）: completedAt=undefined

`resolveCmdEnterCycle(node)`:
12. manual: No→Undone(0)
13. manual: Undone→Done(timestamp)
14. manual: Done→No(undefined)

Store integration:
15. `toggleNodeDone` — undone↔done 切换
16. `cycleNodeCheckbox` — 3-state cycle（manual nodes）

### 1.34 Editor isEmpty / handleDelete 零宽空格 + Hash Cleanup Safety

**测试文件**: `tests/vitest/editor-isEmpty.test.ts`

**覆盖点**:

editor isEmpty（7 cases）:
1. 纯 `\u200B`（零宽空格）视为空（Bug #54 回归）
2. 多个 `\u200B` 视为空
3. `\u200B` + 空白符混合视为空
4. `\u200B` + 实际文本视为非空
5. 空字符串与纯空白符边界

handleDelete isEmpty（5 cases, Bug #54 回归）:
6. name 仅含 `\u200B` / 空字符串 → 允许删除
7. 真实文本 / `\u200B` + 真实文本 → 阻止删除

hash trigger cleanup safety（3 cases, Bug #53 + CJK hashtag 回归）:
8. DOM cleanup 失败后检测残留 `#` 触发词
9. DOM cleanup 成功后无残留
10. `#中文` 可被 hashtag trigger 正确匹配（Unicode 查询）

### 1.51 P0 Loro 基础设施 — 7项底层 API

**测试文件**: `tests/vitest/loro-infra.test.ts`

**覆盖点（P0 Loro Infrastructure）**:

② Fine-grained subscriptions:
1. `subscribeNode(nodeA, cb)` → A 数据变更触发 cb
2. `subscribeNode(nodeA, cb)` → B 数据变更**不**触发 A 的 cb（隔离性）
3. `subscribeNode(nodeB, cb)` → A 数据变更**不**触发 B 的 cb
4. 取消订阅后变更不再触发
5. 同一节点多个 callback 各自独立触发

⑤ Incremental Sync:
6. `getVersionVector()` 返回 VersionVector 对象（有 encode() 方法）
7. `exportFrom(vv)` 返回 Uint8Array delta
8. 两 LoroDoc 实例通过增量同步（delta1 全量、delta2 仅增量）达到一致
9. `importUpdates()` 幂等 — 重复导入不影响状态

④ Time Travel / Checkout:
10. `getVersionHistory()` 返回按 lamport 排序的历史（需 `setDocChangeMergeInterval(-1)`）
11. `checkout(f1)` 后 `isDetached()` = true，数据反映历史状态
12. `checkoutToLatest()` 退出历史模式，数据恢复最新
13. checkout 后历史版本不存在的节点 `hasNode()` = false
14. `getVersionHistory()` 每条记录含 id / peer / lamport / deps 字段

③ LoroText + Peritext marks:
15. `getNodeText()` 未初始化时返回 null
16. `getOrCreateNodeText()` 创建 LoroText 容器
17. LoroText insert 文本后 toString() 正确
18. LoroText mark(bold/italic) 后 toDelta() 正确
19. `getOrCreateNodeText()` 幂等
20. 不存在 nodexId 返回 null

① LoroMovableList 并发安全验证:
21. LoroTree.move() 并发安全 — 两端同时移动同一节点最终收敛（Kleppmann 算法验证）
22. `createMovableList()` 返回有效 LoroMovableList（有 insert/move 方法）
23. LoroMovableList.move() 并发安全重排序

⑥ doc.fork():
24. fork 后修改 fork doc 不影响主 doc
25. `merge()` 将 fork 变更导入主 doc（新节点在主 doc 可见）
26. `merge()` 幂等 — 多次 merge 不产生重复数据
27. fork 前的数据在 fork doc 中可见

⑦ Awareness (awareness.ts):
28. `setLocalUser()` 初始化本地用户
29. `setLocalState()` 更新光标位置
30. `setLocalState()` 未初始化用户时抛出错误
31. `applyRemoteState()` 存储远端状态
32. `removeRemoteState()` 移除远端状态
33. `getStates()` 包含本地和所有远端用户（共 3 个）
34. `onRemoteStateChange()` 在状态变化时触发回调，取消订阅后不再触发
35. `onRemoteStateChange()` 回调接收全量状态 Map（size=2）
36. `serializeLocalState()` / `deserializeAndApplyState()` 往返序列化
37. `updatedAt` 在 `setLocalState()` 后更新（单调递增）
38. detached checkout 下 `createNode/setNodeData/commitDoc` 忽略写入且不抛错

**设计要点**:
- `subscribeNode` 通过 Loro LoroMap.subscribe() 实现容器级订阅，rebuildMappings() 后自动重新挂载
- `getVersionHistory()` 依赖 `getAllChanges()` 返回 Map；需要 `setDocChangeMergeInterval(-1)` 禁用合并以获取精确历史
- `checkout(frontiers)` 进入 detached 模式后 rebuildMappings() 更新 nodexId 映射
- detached 模式写入统一在 `loro-doc.ts` guard（mutations + `commitDoc`）被忽略并发出一次性 warning
- `forkDoc()` 用 vvAtFork 记录分叉点，merge() 只导出分叉后的增量
- awareness.ts 纯内存，不含网络传输

---

### 1.52 LoroText Bridge（TextMark / InlineRef 双向桥接）

**测试文件**: `tests/vitest/loro-text-bridge.test.ts`

**覆盖点**:

1. `writeRichTextToLoroText` + `readRichTextFromLoroText` 文本 roundtrip 保真
2. `link` mark 与 `inlineRefs` 可同时编码并正确解码
3. 非法 mark 区间会被 clamp/忽略，不污染输出
4. 非法 inlineRef offset 或非占位符位置会被忽略

---

### 1.53 Test 入口 Bootstrap（防测试数据回流）

**测试文件**: `tests/vitest/test-entrypoint-bootstrap.test.ts`

**覆盖点**:

1. `src/entrypoints/test/main.tsx` 启动时调用 `seedTestData({ forceFresh: true })`
2. test 页面渲染 `App` 时传入 `skipBootstrap`，避免 sidepanel bootstrap 重新接入持久化链路

---

### 1.50 Loro UndoManager — 结构性撤销/重做

**测试文件**: `tests/vitest/loro-undo.test.ts`

**覆盖点（Loro Phase 2）**:

1. `seedTestDataSync` 以 `__seed__` origin 提交 → `canUndoDoc()` 初始为 false
2. `createChild(parentId)` 后 `canUndoDoc()` 为 true
3. `undoDoc()` → 子节点从父节点 children 中消失
4. `undoDoc()` 后 `canRedoDoc()` 为 true
5. `redoDoc()` → 子节点重新出现（含 TreeID 重建映射）
6. `moveNodeTo(nodeId, newParentId)` 后 `canUndoDoc()` 为 true
7. `undoDoc()` 后节点回到原父节点
8. N 次操作后可依次撤销（mergeInterval=0 每次独立步骤）
9. 全部撤销后 `canRedoDoc()` 为 true
10. 新操作清空 redo 栈
11. `commitDoc('system:*')` 提交不进入 undo 栈（被 `excludeOriginPrefixes` 过滤）

**设计要点**:
- `seedTestDataSync` 在 `seedBody()` 后调用 `commitDoc('__seed__')`，被 UndoManager 的 `excludeOriginPrefixes` 过滤
- 生产与测试统一过滤前缀：`['__seed__', 'system:']`
- node-store.ts 的 `createChild`、`moveNodeTo`、`trashNode`、`restoreNode`、`indent/outdent/moveUp/moveDown` 各自结尾调用 `commitDoc()` 记录撤销步骤
- undo/redo 后调用 `rebuildMappings()` 重新同步 nodexToTree / treeToNodex（Loro undo/redo 可能产生新 TreeID）

### 1.35 节点搜索 SKIP_DOC_TYPES 过滤

**测试文件**: `tests/vitest/node-search-filter.test.ts`

**覆盖点**:

1. `tagDef/fieldDef/fieldEntry/reference` 结构节点被过滤（不出现在搜索结果中）
2. workspace container（如 `LIBRARY`）按 ID 过滤
3. 普通内容节点正常返回，且支持 `excludeId` 排除当前节点
4. 匹配结果按 `updatedAt` 降序排序（最近编辑优先）

### 1.36 Workspace Store 认证状态与持久化

**测试文件**: `tests/vitest/workspace-store.test.ts`

**覆盖点**:

1. 默认状态为未登录（`currentWorkspaceId/userId = null`，`isAuthenticated = false`，`authUser = null`）
2. `setWorkspace + setUser` 后状态一致，且写入 `nodex-workspace` 持久化键
3. `logout` 清空用户与工作区上下文，并恢复未登录状态（含 `authUser`）
4. `authUser` 不被持久化到 storage（通过 `partialize` 排除）
5. `signInWithGoogle` 成功后 `userId / isAuthenticated / authUser` 正确写入

### 1.51 Breadcrumb Workspace Root 导航

**测试文件**: `tests/vitest/breadcrumb.test.ts`

**覆盖点**:

1. 头像/根节点导航目标优先指向 `currentWorkspaceId`（不再依赖节点已存在）
2. `currentWorkspaceId` 缺失时，回退到当前 ancestor chain 的 `workspaceRootId`
3. 两者都不可用时，最终回退到 `LIBRARY`

### 1.56 ReferenceSelector 空查询 Recently Used

**测试文件**: `tests/vitest/reference-selector-recent.test.ts`

**覆盖点**:

1. 空 query 时 recent 列表可由“全局最近编辑节点”补齐（避免仅显示 `Library`）
2. 历史来源优先级高于 fallback（按 panelHistory 最近访问顺序）
3. history + fallback 去重，且过滤 container/结构节点

### 1.57 Workspace Home 节点兜底创建

**测试文件**: `tests/vitest/workspace-root.test.ts`

**覆盖点**:

1. `ensureWorkspaceHomeNode` 在 workspace 根节点缺失时自动补建
2. 已存在 workspace 根节点时保持幂等（不重复创建，不覆盖已有名称）
3. 传入空 workspaceId 时安全返回

### 1.48 Auth 工具函数（Google OAuth + Supabase）

**测试文件**: `tests/vitest/auth.test.ts`

**覆盖点**:

1. `AuthUser` 类型包含 `id / email / avatarUrl / name` 字段
2. `AuthUser` 允许可选字段缺失（仅 `id` 必填）
3. `getCurrentUser` 在 Supabase 未初始化或返回错误时返回 `null`
4. `signOut / signInWithGoogle / getCurrentUser / onAuthStateChange` 全部导出

**注**：`signInWithGoogle` 需要 `chrome.identity.launchWebAuthFlow`，无法在 Vitest 中端到端测试，手工验收见 `docs/MANUAL-TEST-CHECKLIST.md`

### 1.37 Slash Command 注册与导航

**测试文件**: `tests/vitest/slash-commands.test.ts`

**覆盖点**:

1. `filterSlashCommands` 按命令名和关键词过滤（含 `clip_page`）
2. 空 query 返回全量基线命令列表（11 项）
3. `getFirstEnabledSlashIndex` 跳过禁用项返回首个可用索引（`clip_page`）
4. `getNextEnabledSlashIndex` 仅在 enabled 项间上下移动（含 `heading`），边界 clamp
5. `heading` 命令处于 enabled 状态
6. 全部禁用时返回 `-1`

### 1.48 Tana 导入 — Phase 1 Stub 契约

**测试文件**: `tests/vitest/tana-import.test.ts`

**覆盖点（Loro Phase 1 — stub 合约）**:

importTanaExport（4 cases）:
1. `importedNodes: 0`（stub 不导入任何节点）
2. `skippedNodes === totalDocs`（所有文档被跳过）
3. `errors: []`（无错误）
4. `workspaceId` 等于 `currentWorkspaceId()`

validateTanaExport（3 cases）:
5. 返回 `{ totalDocs, missingChildRefs: [], missingOwnerRefs: [], missingMetaNodeRefs: [], missingAssociationRefs: [] }`
6. 任意输入均返回空引用缺失数组
7. `docTypeDistribution` 为空 Map

### 1.43 Floating Toolbar 循环渲染防回归

**测试文件**: `tests/vitest/floating-toolbar.test.ts`

**覆盖点**:

1. `FloatingToolbar` 监听 `selectionUpdate` / `transaction` / `focus` / `blur`，并在组件卸载时正确清理
2. 非空 `TextSelection` 且编辑器聚焦时显示
3. 空选区或 `NodeSelection` 时隐藏
4. 鼠标拖拽选区期间保持隐藏，`mouseup` 后再显示
5. 双击选词路径在第二次点击 `mouseup` 后即可显示（不需要额外点击）
6. 失焦（blur）立即隐藏

### 1.38 Done State Mapping（checkbox ↔ Options 联动，Loro 模型）

**测试文件**: `tests/vitest/done-state-mapping.test.ts`

**说明（Loro 模型）**: DoneMappingEntries 存储在 `tagDef` 下的 `NDX_A07/NDX_A08` fieldEntry 子树中（普通 outliner 结构）。前置条件：`loroDoc.setNodeData(tagDefId, 'doneStateEnabled', true)`。

**覆盖点**:

纯函数 — getDoneStateMappings（4 cases）:
1. 无标签 → 空（[]）
2. 有标签，tagDef.doneStateEnabled=false → 空
3. 有标签，doneStateEnabled=true，有 mapping → 返回 `{ tagDefId, fieldDefId, checkedOptionIds, uncheckedOptionIds }`
4. 沿 Extend 链继承（父 tagDef 的 mapping 对子标签节点可见）

纯函数 — resolveForwardDoneMapping（3 cases）:
5. isDone=true → 第一个 checkedOptionId
6. isDone=false + uncheckedOptionIds → 第一个 uncheckedOptionId
7. 无映射 → 空

纯函数 — resolveReverseDoneMapping（4 cases）:
8. 选中 checkedOption → newDone=true
9. 选中 uncheckedOption → newDone=false
10. 无关 option → null
11. fieldDefId 不匹配 → null

Store 集成 — addDoneMappingEntry（2 cases）:
12. `store.addDoneMappingEntry(tagDefId, true, fieldDefId, optionId)` — 写入 `NDX_A07` fieldEntry 子树
13. 新条目被 getDoneStateMappings 正确读取（fieldDefId 分组）

Store 集成 — removeDoneMappingEntry（2 cases）:
14. `store.removeDoneMappingEntry(tagDefId, true, index)` — 从 `NDX_A07` 子树按顺序移除条目
15. 移除后 getDoneStateMappings 结果与预期一致
16. 容器中混入噪声节点/无效 fieldEntry 时，index 解析仍按“有效 mapping entry”计算，不会删错

Store 集成 — toggleNodeDone（1 case）:
17. 有 doneMapping 时仍只产生一次 commit（`_version` 仅 +1）

### 1.39 Web Clip 落库服务 + 正文解析

**测试文件**:
- `tests/vitest/webclip-service.test.ts`
- `tests/vitest/html-to-nodes.test.ts`

**覆盖点**:

findTagDefByName（4 cases，Loro 模型）:
1. 按名称查找已有 tagDef（大小写不敏感，读取 CONTAINER_IDS.SCHEMA 子节点）
2. 不同大小写匹配
3. 不存在的 tagDef 返回 undefined
4. 忽略 _schemaId 参数 — 始终读取 CONTAINER_IDS.SCHEMA（旧 ws_missing_SCHEMA 等价于存在）

findTemplateAttrDef（5 cases）:
5. 在 tagDef 的 fieldDef 子节点中按名查找（大小写不敏感）
6. 不同大小写匹配
7. 不存在的字段名返回 undefined
8. 不存在的 tagDef 返回 undefined
9. Source URL attrDef 的 fieldType = URL

saveWebClip（10 cases，Loro 模型）:
9. 在 CONTAINER_IDS.INBOX 创建节点（默认 parentId），验证 `loroDoc.getParentId(clipId)`
10. 在自定义 parentId 下创建节点（非 INBOX）
11. 自动打 `#web_clip` 标签（`node.tags.includes('tagDef_web_clip')`）
12. 写入 Source URL 字段值（fieldEntry 子节点 → value 子节点）
13. 设置 description（如有）
14. description 为空时不写入
15. 首次剪藏时自动创建 tagDef（移走 tagDef_web_clip 后验证）
16. 重复剪藏复用同一 tagDef（SCHEMA 中 web_clip tagDef 只有 1 个）
17. pageText HTML 解析后创建 content 子节点树（heading 层级 + 段落）
18. pageText 为空时不创建 content 子节点

applyWebClipToNode（8 cases）:
19. 就地改名为页面标题
20. 就地打 `#web_clip` 标签
21. 就地写入 Source URL 字段值
22. 就地设置 description
23. 不改变节点 parentId（留在原父节点）
24. pageText HTML 解析后创建 content 子节点
25. 已有子节点保留（新 content 追加在后）

parseHtmlToNodes 纯函数（25 cases）:
26. 空 HTML → 空结果
27. 单段落 / 多段落
28. bold / italic / link / code marks 保留
29. h2 → section parent，后续 p 为 children
30. h2 > h3 嵌套层级
31. heading level reset（h2 → h3 → h2 回退）
32. h1 跳过
33. 扁平 list items / 嵌套 list 递归
34. blockquote（纯文本 + 含 block children）
35. pre > code block（code mark）
36. figure/img/hr 跳过
37. table rows → pipe-joined text
38. div 透明容器
39. maxNodes 截断（扁平 + 嵌套计数）
40. 混合内容端到端

createContentNodes Loro 物化（4 cases）:
41. 扁平子节点创建
42. 嵌套子节点层级
43. marks 保留到 Loro richText
44. 空 nodes 返回空 ids

### 1.41 URL/Email 字段值渲染

**测试文件**: `tests/vitest/field-value-url.test.ts`

**覆盖点**:

isUrlFieldType（3 cases）:
1. `FIELD_TYPES.URL` → true
2. `SYS_D.URL` → true
3. 其他类型（PLAIN/DATE/undefined）→ false

isEmailFieldType（3 cases）:
4. `FIELD_TYPES.EMAIL` → true
5. `SYS_D.EMAIL` → true
6. 其他类型（PLAIN/URL/undefined）→ false

Seed data 验证（3 cases）:
7. Source URL fieldDef 的 fieldType = `FIELD_TYPES.URL`
8. Email fieldDef 的 fieldType = `FIELD_TYPES.EMAIL`
9. Website fieldDef 的 fieldType = `FIELD_TYPES.URL`

### 1.42 Default Child Supertag（Loro 模型）

**测试文件**: `tests/vitest/child-supertag.test.ts`

**覆盖点（Loro 模型）**:

resolveChildSupertags({}, parentId) 纯函数（4 cases）:
1. 无标签父节点 → 空
2. 有标签但 tagDef.childSupertag 未设 → 空
3. `store.setConfigValue(tagDefId, 'childSupertag', childTagDefId)` 后 → 返回 childTagDefId
4. 不存在的父节点 → 空

createChild 自动标签（4 cases）:
5. 父有 childSupertag → 新子节点 node.tags 含 child tagDefId
6. 父无 childSupertag → 无自动标签
7. 父无标签 → 无自动标签
8. 多标签各有 childSupertag → 全部应用（多个 tagDefId 写入 node.tags）

createSibling 自动标签（2 cases）:
9. 兄弟父有 childSupertag → 新兄弟 node.tags 含 child tagDefId
10. 兄弟父无 childSupertag → 无自动标签

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
17. IME 组合输入事件（`isComposing` / `Process` / `keyCode=229`）返回 `null`，避免误触发 `type_char`

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
4. `resolveSupertagPickerSelectedId` 仅从 value node `name` 读取已选 supertag id

### 1.47 Outliner 内容类型判定

**测试文件**: `tests/vitest/node-type-utils.test.ts`

**覆盖点**:

1. `isOutlinerContentNodeType(undefined)` = true（普通内容节点）
2. `isOutlinerContentNodeType('reference')` = true（reference 可渲染）
3. `fieldEntry/tagDef/fieldDef` 等结构类型返回 false

### 1.54 NodePanel Header 重设计

**测试文件**: `tests/vitest/node-header.test.ts`

**覆盖点**:

| # | 场景 | 验证 |
|---|------|------|
| 1 | expandedHiddenFields 初始状态 | 空 Set |
| 2 | toggleHiddenField 添加 | `panelId:fieldId` key 存在 |
| 3 | toggleHiddenField 移除 | 二次 toggle 回到空 |
| 4 | 多 panel:field 独立 | 3 个不同 key 互不干扰 |
| 5 | clearExpandedHiddenFields | 重置为空 |
| 6 | 非持久化 | partializeUIStore 不含此字段 |
| 7 | tagDef 颜色可解析 | resolveTagColor 返回 text + bg |
| 8 | fieldDef 有结构图标 | resolveNodeStructuralIcon 非 null |
| 9 | 普通节点无结构图标 | resolveNodeStructuralIcon 为 null |
| 10 | task 节点显示 checkbox | shouldNodeShowCheckbox true |
| 11 | 普通节点不显示 checkbox | shouldNodeShowCheckbox false |
| 12 | 已标记节点有 tags | tags.length > 0 |
| 13 | 未标记节点无 tags | tags.length === 0 |
| 14 | definition 节点不显示 supertag 行 | type 为 tagDef/fieldDef |
| 15–17 | 列对齐常量 | paddingLeft=6, colB=25, drop=21 |

### 1.55 TrailingInput `@` 触发后光标定位回归

**测试文件**: `tests/vitest/trailing-input-trigger-focus.test.ts`

**覆盖点**:

1. 在 `TrailingInput` 输入 `@` 会创建触发节点并设置 `triggerHint='@'`
2. 新建触发节点后会写入 `focusClickCoords.textOffset=1`（光标在 `@` 后）
3. `focusedNodeId/focusedParentId` 指向新建节点与当前父节点

### 1.56 Date Utils

**测试文件**: `tests/vitest/date-utils.test.ts`

**覆盖点**:

| # | 场景 | 验证 |
|---|------|------|
| 1 | ISO Week 普通日期 | getISOWeekNumber 返回正确 year+week |
| 2 | ISO Week 元旦边界 (Jan 1 2026) | week=1, year=2026 |
| 3 | ISO Week 跨年 (Dec 29 2025) | year=2026, week=1 |
| 4 | ISO Week 年末 | 正确处理第52/53周 |
| 5 | formatDayName | "Sat, Feb 14" 格式 |
| 6 | formatWeekName | "Week 07" 零填充 |
| 7 | formatYearName | "2026" 字符串 |
| 8–10 | parseDayNodeName | 正常解析、无效月份返回 null、无效日期返回 null |
| 11–12 | parseWeekNodeName | 正常解析 + 范围校验 |
| 13–14 | parseYearNodeName | 正常解析 + 非数字返回 null |
| 15 | getAdjacentDay 前进 | +1 天跨月正确 |
| 16 | getAdjacentDay 后退 | -1 天跨月正确 |
| 17 | isToday | 今天返回 true，其他日期返回 false |
| 18–20 | extractSortValue | 年/周/日分别返回正确排序值 |

### 1.57 Journal

**测试文件**: `tests/vitest/journal.test.ts`

**覆盖点**:

| # | 场景 | 验证 |
|---|------|------|
| 1 | ensureDateNode 创建层级 | JOURNAL → Year → Week → Day 正确嵌套 |
| 2 | ensureDateNode 幂等 | 重复调用返回相同 ID |
| 3 | 同年不同周 | 创建独立 Week 节点 |
| 4 | 跨年 ISO 周 | Dec 29 归入下一年 Week 01 |
| 5 | 年降序排列 | 最新年份在前 |
| 6 | 周降序排列 | 最新周在前 |
| 7 | 日降序排列 | 最新日在前 |
| 8 | SYSTEM_TAGS 应用 | DAY/WEEK/YEAR 标签正确 |
| 9 | ensureTodayNode | 返回有效 ID + DAY 标签 |
| 10 | getAdjacentDayNodeId +1 | 返回下一天节点 |
| 11 | getAdjacentDayNodeId -1 | 返回前一天节点 |
| 12 | getAdjacentDayNodeId 非日节点 | 返回 null |
| 13–16 | isDayNode/isWeekNode/isYearNode/isJournalNode | 正确判断 |

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
| 1.20 | Row Interactions 共享意图层 | PASS/FAIL |
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
| 1.39 | Web Clip 落库服务 + 正文解析（html-to-nodes + webclip-service 集成） | PASS/FAIL |
| 1.41 | URL/Email 字段值渲染 | PASS/FAIL |
| 1.42 | Default Child Supertag (SYS_A14) | PASS/FAIL |
| 1.43 | Floating Toolbar 循环渲染防回归 | PASS/FAIL |
| 1.44 | PM EditorView 操作工具 | PASS/FAIL |
| 1.45 | ConfigOutliner TrailingInput 显示规则 | PASS/FAIL |
| 1.46 | FieldValueOutliner TrailingInput 显示规则 | PASS/FAIL |
| 1.48 | Tana 导入 meta 填充与 DocType 安全 | PASS/FAIL |
| 1.50 | Loro UndoManager 结构性撤销/重做 | PASS/FAIL |
| 1.51 | P0 Loro 基础设施 — 7项底层API（subscribeNode/增量同步/时间旅行/LoroText/fork/Awareness） | PASS/FAIL |
| 1.52 | LoroText Bridge（TextMark/InlineRef 双向桥接） | PASS/FAIL |
| 1.53 | Test 入口 Bootstrap（防测试数据回流） | PASS/FAIL |
| 1.54 | NodePanel Header 重设计（UIStore expandedHiddenFields + block 可见性 + 列对齐） | PASS/FAIL |
| 1.55 | TrailingInput `@` 触发后光标定位回归 | PASS/FAIL |
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
总数: ~90 节点

Library:    proj_1, task_1~3, subtask_1a~1b, subtask_2a~2c,
            note_1, note_1a~1c, note_2, idea_1~2,
            note_rich, rich_1~5, rich_inline_ref
Inbox:      inbox_1~3, inbox_3a~3b, webclip_1 (+ wc1_section1~2, wc1_p1~3 正文子节点)
Journal:    journal_1, j_1~3
Containers: LIBRARY, INBOX, JOURNAL, SEARCHES, TRASH, SCHEMA（短格式，见 CONTAINER_IDS）
Schema:     tagDef_task, tagDef_person, tagDef_dev_task, tagDef_web_clip
            fieldDef 子节点（type='fieldDef'）+ option 子节点
            fieldType 使用 FIELD_TYPES.* 常量（小写值：'options', 'date', 'plain', 'number', 'url', 'email', 'checkbox'）
Pre-tagged: task_1 → #Task (node.tags=['tagDef_task'], fieldEntry 子节点)
            person_1 → #Person (node.tags=['tagDef_person'], fieldEntry 子节点)
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
| 8 | **内部结构节点泄漏** | `OutlinerItem.tsx` | 必须过滤 `tuple` 类型子节点 |
| 9 | **outdent 容器边界** | `node-store.ts` | 父节点是容器时 outdent 应为 no-op |
| 10 | **BulletChevron rotate** | `BulletChevron.tsx` | 旋转条件必须 `hasChildren && isExpanded` |

---

## 人工验收入口

- 人工验收请使用：`docs/MANUAL-TEST-CHECKLIST.md`
- 写入原则：
  - 仅写入 Agent 无法可靠自动验证的项
  - 或核心高风险且必须由你最终确认的项
