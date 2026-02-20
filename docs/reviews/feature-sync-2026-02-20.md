# 功能盘点 & 代码 Review 地图 (2026-02-20)

> 目的：提供已实现功能的全量清单、每个特性的代码入口、测试覆盖情况、以及待 Review 的已知缺口。
> 供代码 Review agent 逐模块深入验证使用。

---

## Findings — nodex-codex Review (2026-02-20)

### P0 Issues (must fix before next feature)

- [ ] **[src/stores/node-store.ts:357-386] `applyTag` missing `commitDoc()`** — `applyTag` calls `loroDoc.addTag()` and up to N `loroDoc.createNode()` + `loroDoc.setNodeDataBatch()` calls but never calls `loroDoc.commitDoc()`. Every call site that applies a tag (TagSelector, `#` trigger, `createTagDef` auto-apply) will freeze UI after tag application. Root cause: it is the most frequently called mutation action and is the only one in the "fixed" list that was not actually fixed. Suggested fix: add `loroDoc.commitDoc()` at the end of `applyTag`.

- [ ] **[src/stores/node-store.ts:388-402] `removeTag` missing `commitDoc()`** — `removeTag` calls `loroDoc.removeTag()` and up to N `loroDoc.deleteNode()` calls with no terminal `commitDoc()`. UI will freeze after tag removal. Same fix needed as `applyTag`.

- [ ] **[src/stores/node-store.ts:404-414] `createTagDef` missing `commitDoc()`** — `createTagDef` calls `loroDoc.createNode()` + `loroDoc.setNodeDataBatch()` with no terminal `commitDoc()`. The node is created in Loro but the subscriber is never fired; the SCHEMA container list will not visually update. Suggested fix: add `loroDoc.commitDoc()` before the `return` statement.

- [ ] **[src/stores/node-store.ts:418-429] `createFieldDef` missing `commitDoc()`** — Same pattern as `createTagDef`. `createFieldDef` creates a node and sets data but never commits. Field creation in the config page will not trigger re-render. Suggested fix: add `loroDoc.commitDoc()` before `return`.

- [ ] **[src/stores/node-store.ts:647-664] `toggleNodeDone` double-commitDoc when `doneMappings` present** — When `result.doneMappings` is non-empty, the loop calls `get().selectFieldOption(feId, optionId, undefined)` (line 660), which itself calls `loroDoc.commitDoc()` (line 506). After the loop, `toggleNodeDone` calls `loroDoc.commitDoc()` again (line 664). This creates N+1 commits for one logical user action, fragmenting the undo history. Each intermediate `commitDoc` inside `selectFieldOption` produces a separate undo step. Root cause: `selectFieldOption` always commits, but it is being used here as an internal sub-operation inside a larger action. Suggested fix: either inline the `selectFieldOption` mutations without calling `commitDoc` inside the loop, or refactor into a private `_selectFieldOptionNoCommit` helper, and call a single `commitDoc` at the end of `toggleNodeDone`.

- [ ] **[src/stores/node-store.ts:263-274] `outdentNode` missing container guard** — `outdentNode` does not call `isWorkspaceContainer(grandParentId)` before moving. If a node is two levels deep from a container (e.g. child of a child of LIBRARY), outdenting to the container level is blocked by the `grandParentId` check being non-null. However if someone manages to place a node directly under a container, outdenting it further could attempt `loroDoc.moveNode(nodeId, 'LIBRARY')` which makes the node a direct child of LIBRARY — that is expected. But outdenting a node whose immediate parent IS a container is not guarded. Per LESSONS.md: "outdentNode 容器边界: 父节点是容器时 outdent 应为 no-op (`isWorkspaceContainer()` guard)". The guard at line 265-267 only checks `!parentId` and `!grandParentId`, but does NOT check `isWorkspaceContainer(parentId)`. If `parentId` is LIBRARY or SCHEMA, the node will be moved to the grandParent of LIBRARY (which is null in Loro, causing a move to root), corrupting the tree. Suggested fix: add `if (isWorkspaceContainer(parentId)) return;` after line 265.

- [ ] **[src/stores/node-store.ts:331-333] `setNodeName` / `setNodeNameLocal` / `updateNodeContent` / `updateNodeDescription` missing `commitDoc()`** — These four functions mutate Loro data (`loroDoc.setNodeData` / `loroDoc.setNodeDataBatch`) with no `commitDoc()`. They are intentionally excluded — name edits are high-frequency (every keystroke) and the Loro doc subscriber fires only on commit. This means name changes typed in the editor will NOT trigger a UI version update. This is apparently the intended design (ProseMirror is source of truth for in-progress edits), but it is a latent risk: if another component reads the `_version` to know when to re-query a node name, it will get a stale value until the next unrelated commit fires. This is an **observation** rather than a confirmed bug, but requires verification that no component relies on `_version` refreshing after `setNodeName`.

### P1 Issues (fix soon)

- [ ] **[src/components/fields/FieldValueOutliner.tsx:166] `useNodeStore.getState()` in render body for CHECKBOX value** — Line 166 calls `useNodeStore.getState().getNode(valueNodeId)` directly in the component render body (not inside a hook or `useCallback`). This bypasses Zustand's subscription mechanism: if the value node's name changes, `FieldValueOutliner` will not re-render because there is no selector subscription for that specific value. The `_version` counter drives `contentChildIds` via `childIdsJson` (line 53), but `valueNode` at line 166 is read imperatively. In practice `_version` changes on every commit so it likely re-renders, but the pattern is fragile. Similarly at line 187 for DATE field type. Suggested fix: use the `_version`-gated `childIds` array already available, or read via the existing `contentChildIds` which is derived from subscribed state.

- [ ] **[src/stores/node-store.ts:623-637] `toggleCheckboxField` writes `'true'` (string) but `FieldValueOutliner` reads against `SYS_V.YES`** — In `toggleCheckboxField` (line 634), when checking, the value node is created with `name: 'true'` (plain string). In `FieldValueOutliner` (line 167), the checked state is evaluated as `valueNode?.name === SYS_V.YES`. If `SYS_V.YES` is not `'true'` (check `src/types/index.ts`), the checkbox field will always appear unchecked after being toggled on. Per LESSONS.md: "Checkbox 值 = SYS_V: 使用 `SYS_V03`(Yes)/`SYS_V04`(No)，不要用 `'1'`/`'0'`". The LESSONS rule applies to node-level checkbox, but the same pattern should apply to field checkbox type for consistency. If `SYS_V.YES !== 'true'`, this is a confirmed data/read mismatch bug.

- [ ] **[src/hooks/use-node-fields.ts:136-152] Virtual config fields emitted twice for `fieldDef` nodes** — For a `fieldDef` node (line 136 `if (isFieldDef)`), the function first emits any real `fieldEntry` children at the top of the loop (lines 64-123), then appends the virtual config entries (lines 138-150), then sorts all entries by the `ATTRDEF_CONFIG_FIELDS` order map. A real `fieldEntry` whose `fieldDefId` matches a config key (i.e. `isSysConfig === true`) would be emitted at line 71-100 AND again as a virtual entry at line 145. The guard at line 95-99 (`if (isFieldDef && configDef.appliesTo !== '*')`) filters based on field type, but does not prevent the config field from appearing twice if a real `fieldEntry` and a virtual entry for the same config key both exist. This can produce duplicate rows in the config page. A defensive deduplication check (e.g., skipping virtual entries whose `fieldEntryId` matches an already-emitted real entry) is missing.

- [ ] **[src/components/fields/ConfigOutliner.tsx:87-90] Config field inclusion filter uses string prefix, not constant** — Line 90: `if (keyId.startsWith('SYS_') || keyId.startsWith('NDX_')) continue;` — hardcoded string prefixes for filtering config fields. This is brittle: if a new system constant prefix is added, config fields won't be filtered. The preferred approach would use `isSystemConfigField(keyId)` from `field-utils.ts` (already imported at line 18 in `use-node-fields.ts`, but not used in `ConfigOutliner`). Low severity but inconsistent with the rest of the codebase.

- [ ] **[src/components/outliner/OutlinerView.tsx:64-65] `useNodeStore.getState()` called in `useMemo` body** — Line 64: `const nodeType = useNodeStore.getState().getNode(cid)?.type;`. The `useMemo` depends on `[allChildIds, fieldMap, _version, showTemplateTuples]`. When `_version` changes, the memo re-runs and calls `getState()` imperatively. This is technically correct (re-runs on version change), but is the same fragile pattern as in `FieldValueOutliner`. If a child node's `type` changes without touching `_version` (which cannot currently happen, but is still a pattern to avoid), the classification would be stale. Minor consistency issue — same pattern exists in `OutlinerItem.tsx:267`.

- [ ] **[src/components/outliner/OutlinerItem.tsx:312] `isReference` computed via Loro in render** — Line 312: `const isReference = !!node && loroDoc.getParentId(nodeId) !== parentId;`. This calls `loroDoc.getParentId()` directly in the component body on every render. Because `loroDoc.getParentId` reads from Loro tree data (not from a React subscription), if the parent changes due to a move operation, `isReference` will only update when `_version` causes the component to re-render from some other subscription. This is likely correct in practice (any tree mutation commits and bumps `_version`), but is an implicit dependency. Consider computing inside the `useNode(nodeId)` hook or via a subscribed selector.

### P2 Issues (nice to fix)

- [ ] **[src/lib/loro-doc.ts:181] Production `UndoManager` created without `excludeOriginPrefixes`** — The test `initLoroDocForTest` (line 219) sets `excludeOriginPrefixes: ['__seed__']` so seed-data commits don't pollute the undo stack. The production `initLoroDoc` (line 181) creates `UndoManager` with only `mergeInterval: 500` and no `excludeOriginPrefixes`. If any production code calls `commitDoc({ origin: '__seed__' })` or similar system-level origins (e.g., import operations), those commits will be incorrectly tracked in the undo history. Low priority unless import/bulk operations are added.

- [ ] **[src/lib/loro-doc.ts:587-591] `commitDoc()` vs `commit()` semantic** — `commitDoc` (line 588-591) unconditionally calls `doc.commit(origin ? { origin } : undefined)`. There is no early return when doc is in detached (checkout) mode. In `isDetached()` state, `doc.commit()` is a no-op per Loro docs, so this does not cause data corruption. However, `commitDoc` called during time-travel checkout silently succeeds without producing a commit. No caller currently guards against this, which is acceptable for now but should be documented.

- [ ] **[src/lib/tree-utils.ts:186-189] `getLastVisibleNode` filters by `!n.type` only** — Lines 186-189: visible children are filtered by `n && !n.type` (only plain content nodes, no type). This matches the same convention used in `OutlinerView` and `OutlinerItem` for `rootChildIds`. However, `fieldEntry` and `reference` nodes are excluded from "visible" here, which means `TrailingInput` navigation (`ArrowUp` from trailing input) will never land on a field entry row or a reference node row. This is consistent with the intent (trailing input is for content creation), but means `getLastVisibleNode` is not the right function to use if navigation needs to account for field rows. Confirm this is intentional and document accordingly.

- [ ] **[src/components/panel/Breadcrumb.tsx:43] `isRootView` logic includes container nodes correctly but ancestor chain may be empty when viewing SCHEMA** — When `nodeId === CONTAINER_IDS.SCHEMA`, `getAncestorChain` returns `{ ancestors: [], workspaceRootId: null }` (because SCHEMA is a container, so the while-loop breaks immediately with `workspaceRootId = 'SCHEMA'`, then `isRootView = !!workspaceRootId && nodeId === workspaceRootId` = `true`). This means when navigating to the SCHEMA config panel, the breadcrumb hides all content (isRootView=true), which may be incorrect — the SCHEMA panel should show its title. Verify via visual test.

- [ ] **[src/lib/checkbox-utils.ts:94-109] `resolveCheckboxClick` tag-driven undone path returns `undefined`** — Lines 97-99: when a tag-driven node is done and user clicks (done → undone), `resolveCheckboxClick` returns `{ completedAt: undefined }`. In `toggleNodeDone` (node-store.ts:651-652), `completedAt === undefined` triggers `loroDoc.deleteNodeData(nodeId, 'completedAt')`. After deletion, `completedAt` is `undefined`, which means `shouldNodeShowCheckbox` will still return `showCheckbox: true` (because `hasTagShowCheckbox` is still true). The 3-state rule says undone for tag-driven = empty checkbox visible. The data model says `completedAt = 0` = undone sentinel. But here `completedAt = undefined` after the delete. This means a tag-driven node can be in state `completedAt=undefined, hasTagCheckbox=true` = "shows unchecked checkbox", which is correct visually. However, it differs from the explicitly defined sentinel for undone (`completedAt=0`). Verify this is intentional and document that for tag-driven nodes `completedAt=undefined` IS the undone state (not `completedAt=0`). Currently `shouldNodeShowCheckbox` treats both correctly (checks `> 0` for done, truthy for unchecked-but-visible), so no functional bug.

### Test Coverage Gaps

- [ ] **[applyTag / removeTag / createTagDef / createFieldDef commitDoc]** — No Vitest test verifies that `_version` increments after these four actions. Add tests in `tests/vitest/node-store-tags-refs.test.ts` and `tests/vitest/node-store-schema.test.ts` that call each action and assert `_version` changed.

- [ ] **[toggleNodeDone with doneMappings — double-commitDoc]** — No test covers the case where `toggleNodeDone` fires when `doneMappings` is non-empty. A test should assert the undo stack produces exactly one step after toggling done with an active done-state mapping.

- [ ] **[outdentNode container guard]** — No test covers the case where a node's parent is a container (e.g., parent === LIBRARY). `tests/vitest/node-store-guard-rails.test.ts` should add a case: create node under LIBRARY directly, call `outdentNode`, assert the node is not moved.

- [ ] **[toggleCheckboxField SYS_V consistency]** — No test verifies that a checkbox field toggled on produces a value node whose `name === SYS_V.YES`. Add to `tests/vitest/node-store-fields.test.ts`.

- [ ] **[Breadcrumb ancestor chain for SCHEMA container]** — No Vitest for `getAncestorChain` on container node IDs. Add to `tests/vitest/` (new `tree-utils.test.ts` or extend existing).

### Observations (not bugs, just notes)

- `loro-doc.ts` is well-structured. The read cache (`_nodeCache`, `_childrenCache`) with version invalidation is correct. No issues found in the core Loro wrapper beyond the production `UndoManager` missing `excludeOriginPrefixes`.

- `tree-utils.ts` boundary conditions are sound: the `visited` set in `getAncestorChain` and `getNavigableParentId` correctly prevents infinite loops. Container detection via `isContainerNode` is consistent.

- `use-node-fields.ts` selector pattern (JSON.stringify comparison) is the correct approach per LESSONS.md. The `useMemo` over parsed JSON is correctly memoized.

- `ConfigOutliner.tsx` is now in `src/components/fields/` (not `src/components/config/`). The P2 review task description had the wrong path.

- **[CONFIRMED BUG — should be P1] `FieldValueOutliner:295-298` `SupertagPickerField.selectedId` reads wrong node ID** — `selectedId` is set to `tuple?.children?.[0]` which returns the nanoid of the value-wrapper node created by `setFieldValue`. However `options` contains `{ id: t.id }` where `t.id` is the actual supertag ID. The `setFieldValue` call (line 456 in node-store.ts) creates a value-node with `name = tagId` (not `id = tagId`). So `selectedId` (value-wrapper nanoid) will never equal any `option.id` (supertag ID). `NodePicker` will always show the picker as unselected even when a supertag is already set. Fix: `selectedId` should be `s.getNode(tuple?.children?.[0])?.name || undefined` to read the stored tag ID from the value node's `name` field.

---

## 一、全局架构概览

### 数据层

| 层 | 技术 | 状态 |
|----|------|------|
| **本地 CRDT** | Loro（`src/lib/loro-doc.ts`） | ✅ Phase 1 完成（PR #62/#63） |
| **持久化** | `loro-persistence.ts` → chrome.storage.local | ✅ |
| **远程同步** | Supabase Realtime | ⏸ 已有基础设施，未激活 |
| **认证** | Supabase Auth + Google OAuth | ✅ 已实现（PR #61），standalone 跳过 |

### 状态层

| Store | 文件 | 职责 |
|-------|------|------|
| `useNodeStore` | `src/stores/node-store.ts` | 节点 CRUD + 树操作 + 标签字段操作 |
| `useUIStore` | `src/stores/ui-store.ts` | 面板导航栈 + 焦点/选中状态 + 拖拽状态 |
| `useWorkspaceStore` | `src/stores/workspace-store.ts` | 当前工作区 + 用户身份 |

### 关键约束（Review 必查）

- `node-store.ts` 中每个 mutation action 末尾**必须**有 `loroDoc.commitDoc()`，否则 `_version` 不更新，React UI 冻结
- `useNodeStore((s) => s.entities)` 是**禁止**的全量订阅，会导致任何节点变化触发全量重渲染
- `selectFieldOption` / `setOptionsFieldValue` 调用链：UI → store → loroDoc mutations → commitDoc → `_version++`

---

## 二、功能模块盘点

### 2.1 Outliner 交互

**规格文档**: `docs/features/outliner-interactions.md`
**已实现度**: ✅ 核心完整

| 功能 | 状态 | 代码入口 |
|------|------|---------|
| Enter 行尾创建 / 行中拆分 | ✅ | `NodeEditor.tsx` onKeyDown |
| Tab / Shift+Tab 缩进 | ✅ | `node-editor-shortcuts.ts` |
| ArrowUp/Down 跨节点导航 | ✅ | `NodeEditor.tsx` |
| 空 Backspace 删除节点 | ✅ | `NodeEditor.tsx` |
| Mod+Shift+Arrow 同级重排 | ✅ | `node-store.ts:moveNodeUp/Down` |
| TrailingInput 深度偏移 | ✅ | `TrailingInput.tsx` + `trailing-input-actions.ts` |
| TrailingInput Blur 自动提交 | ✅ | `TrailingInput.tsx` |
| 缩进线点击展开/折叠 | ✅ | `OutlinerItem.tsx` indent guide |

**测试覆盖**:
- `tests/vitest/trailing-input-actions.test.ts` — trailing 创建策略
- `tests/vitest/trailing-input-navigation.test.ts` — 键盘导航
- `tests/vitest/node-editor-shortcuts.test.ts` — NodeEditor 快捷键分支
- `tests/vitest/edge-cases.test.ts` — 边界条件

**已知缺口**:
- IME（中文/日文输入法）Enter 后空节点 CJK 组合输入异常（P1 bug，见 `docs/issues/editor-ime-enter-empty-node.md`）
- 多行纯文本粘贴不拆分节点（P3 待实现）

---

### 2.2 节点选中（单选 + 多选）

**规格文档**: `docs/features/node-selection.md`
**已实现度**: ✅ Phase 1-3 全量完成（PR #51, #53）

| 功能 | 状态 |
|------|------|
| Escape 退出编辑 → 选中 | ✅ |
| 选中模式 ↑/↓ 导航 + Enter 回编辑 | ✅ |
| Shift+↑/↓ 从编辑进入选中 | ✅ |
| Cmd+Click 多选 + 子树合并吸收 | ✅ |
| Shift+Click 范围选中 | ✅ |
| Shift+Arrow 扩展选区 | ✅ |
| 拖动选择（Drag Select） | ✅ |
| Cmd+A 全选 | ✅ |
| 批量删除 / 缩进 / 复制 / Checkbox | ✅ |
| Tana-style 独立行高亮（双层遮罩） | ✅ |

**测试覆盖**:
- `tests/vitest/selection-keyboard.test.ts`
- `tests/vitest/selection-utils.test.ts`
- `tests/vitest/selected-reference-shortcuts.test.ts`
- `tests/vitest/ui-store-drag-state.test.ts`

**已知缺口**:
- Cmd+Shift+D 批量复制（已在 spec，待确认实现状态）
- 跨面板边界拖选防护

---

### 2.3 拖拽排序

**规格文档**: `docs/features/drag-drop.md`
**已实现度**: ✅ 核心完整

| 功能 | 状态 |
|------|------|
| before / after / inside 三态 Drop | ✅ |
| 自动展开 inside 目标 | ✅ |
| 同级与跨层移动 | ✅ |
| 防自环 / 防后代放置 | ✅ |
| 乐观更新 + 失败回滚 | ✅ |

**测试覆盖**:
- `tests/vitest/drag-drop-position.test.ts`
- `tests/vitest/drag-drop-utils.test.ts`
- `tests/vitest/node-store-move-node-to.test.ts`
- `tests/vitest/ui-store-drag-state.test.ts`

**已知缺口**:
- 引用节点拖拽语义（文档已有 placeholder，实现待定义）
- 拖到列表边缘时自动滚动

---

### 2.4 Supertags（标签系统）

**规格文档**: `docs/features/supertags.md`
**已实现度**: ✅ 配置页全量完成，高级功能待续

| 功能 | 状态 | 代码入口 |
|------|------|---------|
| `#` 触发 TagSelector | ✅ | `NodeEditor.tsx` / `SlashCommandMenu.tsx` |
| 应用 / 移除标签 | ✅ | `node-store.ts:applyTag/removeTag` |
| TagBadge 显示 + 颜色 + 右键菜单 | ✅ | `OutlinerItem.tsx` |
| TagBadge 点击 → 配置页 | ✅ | `navigateTo(tagDefId)` |
| 标签配置页（ConfigOutliner + FieldList） | ✅ | `ConfigOutliner.tsx` + `FieldList.tsx` |
| Color Swatch Selector | ✅ | `ColorSwatchPicker.tsx` |
| Show as checkbox toggle | ✅ | `FieldValueOutliner.tsx` → `setConfigValue` |
| Done state mapping | ✅ | `DoneMappingEntries.tsx` |
| Default Child Supertag | ✅ | `node-store.ts:resolveChildSupertags` |
| 标签继承 Extend Phase 1 | ✅ | `node-store.ts:getExtendsChain` |
| applyTag 克隆 default content | ✅ | `node-store.ts:applyTag` |
| 配置值存储（setConfigValue + commitDoc） | ✅ Bug 已修复 2026-02-20 | `node-store.ts:setConfigValue` |
| createTagDef 自动 applyTag(SYS_T01) | ✅ | `node-store.ts:createTagDef` |

**测试覆盖**:
- `tests/vitest/node-store-tags-refs.test.ts`
- `tests/vitest/node-store-schema.test.ts`
- `tests/vitest/child-supertag.test.ts`
- `tests/vitest/done-state-mapping.test.ts`
- `tests/vitest/tag-colors.test.ts`
- `tests/vitest/config-outliner.test.ts`
- `tests/vitest/node-store-extend.test.ts`

**已知缺口**:
- `trashNode(tagDef)` 级联清理（当前仅移入 Trash，不清除所有引用节点）
- `trashNode(attrDef)` 同上
- Pinned fields / Optional fields
- Extend Phase 2（父变更自动传播 + 配置页继承项锁定）
- Convert to supertag
- 标签页（搜索 + 视图）
- Title expression

**Review 重点**:
- `setConfigValue` 调用链：`FieldValueOutliner` → `store.setConfigValue` → `loroDoc.setNodeData` → `loroDoc.commitDoc()`（确保所有路径都有 commitDoc）
- `applyTag` 的 Extend 链字段去重逻辑（祖先优先）
- `resolveForwardDoneMapping` / `resolveReverseDoneMapping` 双向映射防无限循环

---

### 2.5 Fields（字段系统）

**规格文档**: `docs/features/fields.md`
**已实现度**: ✅ 全类型完成，部分高级功能待续

| 功能 | 状态 | 代码入口 |
|------|------|---------|
| `>` 触发字段创建 | ✅ | `TrailingInput.tsx` / `NodeEditor.tsx` |
| 字段名编辑 + 自动完成 | ✅ | `FieldNameInput.tsx` |
| 字段/内容交错渲染 | ✅ | `OutlinerItem.tsx` / `FieldRow.tsx` |
| Plain 字段值（FieldValueOutliner） | ✅ | `FieldValueOutliner.tsx` |
| Options 下拉 + Auto-collect | ✅ | `OptionsPicker.tsx` + `AutoCollectSection.tsx` |
| Options from Supertag | ✅ | `use-field-options.ts` |
| Date 日期选择器（Notion 风格） | ✅ | `DatePicker.tsx` |
| Number / Integer + Min/Max 验证 | ✅ | `FieldValueOutliner.tsx` + `field-validation.tsx` |
| URL + Email 格式验证 | ✅ | `field-validation.tsx` |
| Checkbox 字段值 | ✅ | `OutlinerItem.tsx` fieldDataType |
| AttrDef 配置页（Field type / Required / Hide） | ✅ | `FieldList.tsx` + `ConfigOutliner.tsx` |
| 字段隐藏规则（4/5 种 + pill click-to-reveal） | ✅ | `FieldRow.tsx` |
| Required 字段视觉提示（红色 *） | ✅ | `FieldRow.tsx` |
| 系统字段（8/12 种） | ✅ | `field-utils.ts:resolveSystemFieldValue` |

**测试覆盖**:
- `tests/vitest/node-store-fields.test.ts`
- `tests/vitest/field-utils.test.ts`
- `tests/vitest/field-validation.test.ts`
- `tests/vitest/field-value-outliner.test.ts`

**已知缺口**:
- Auto-initialize（6 种策略）未实现
- Pinned fields 未实现
- 系统字段 4 种延后（Edited by / Number of references / Date from calendar / Number with tag）
- `trashNode(attrDef)` 级联清理未实现
- Merge fields 未实现

**Review 重点**:
- `autoCollectOption` 的批量 mutation 原子性（已重构，不再调用 `addFieldOption`，避免中途 commitDoc）
- `use-node-fields.ts:computeFields` 虚拟 fieldEntry 生成逻辑（`__virtual_${def.key}__` ID）
- `FieldValueOutliner` 对虚拟 tupleId 的读写路径（config values vs real field entries）

---

### 2.6 References（引用系统）

**规格文档**: `docs/features/references.md`
**已实现度**: ✅ MVP 完整

| 功能 | 状态 |
|------|------|
| `@` 触发搜索并引用节点 | ✅ |
| 树引用（同心圆 bullet + 单击选中 / 双击编辑） | ✅ |
| 内联引用（蓝色链接 + 点击导航） | ✅ |
| 引用独立展开状态 | ✅ |
| 删除引用不删原始节点 | ✅ |

**测试覆盖**:
- `tests/vitest/node-store-tags-refs.test.ts`

**已知缺口**:
- 反向链接 section（显示"哪些节点引用了我"）
- 引用计数 badge
- 合并节点（Merge）

---

### 2.7 富文本编辑器

**规格文档**: `docs/features/editor-migration.md`, `docs/features/floating-toolbar.md`, `docs/features/slash-command.md`, `docs/features/editor-triggers.md`
**已实现度**: ✅ Phase 完成

| 功能 | 状态 | 代码入口 |
|------|------|---------|
| ProseMirror RichTextEditor | ✅ (PR #58) | `RichTextEditor.tsx` + `pm-schema.ts` |
| text marks（Bold/Italic/Code/Highlight/Strike/Link/Heading） | ✅ | `editor-marks.ts` |
| Floating Toolbar（选区驱动 Portal） | ✅ (PR #55/#57) | `FloatingToolbar.tsx` |
| Slash Command 菜单 | ✅ | `SlashCommandMenu.tsx` + `slash-commands.ts` |
| `#` / `@` trigger + dropdown | ✅ | `NodeEditor.tsx` |
| Node Description 编辑（Ctrl+I） | ✅ | `NodeDescription.tsx` |

**测试覆盖**:
- `tests/vitest/pm-schema.test.ts`
- `tests/vitest/pm-doc-utils.test.ts`
- `tests/vitest/pm-editor-view.test.ts`
- `tests/vitest/editor-marks.test.ts`
- `tests/vitest/editor-isEmpty.test.ts`
- `tests/vitest/floating-toolbar.test.ts`
- `tests/vitest/slash-commands.test.ts`

**已知缺口**:
- CJK IME Enter 后空节点输入异常（P1，`docs/issues/editor-ime-enter-empty-node.md`）
- 多行粘贴结构化处理
- Floating Toolbar `@` Reference 按钮 / `#` Tag 按钮（P3）

---

### 2.8 撤销与重做

**规格文档**: `docs/features/undo-redo.md`
**已实现度**: ✅ 三层全量完成（2026-02-20 Loro UndoManager）

| 层次 | 状态 |
|------|------|
| ProseMirror 文本撤销 | ✅ |
| Loro UndoManager 结构性操作撤销 | ✅ |
| 导航撤销（navUndoStack） | ✅ |
| Cmd+Z 三层优先级 | ✅ |

**测试覆盖**:
- `tests/vitest/nav-undo-keyboard.test.ts`
- `tests/vitest/nav-undo-shortcuts.test.ts`
- `tests/vitest/ui-store-undo-focus.test.ts`
- `tests/vitest/loro-undo.test.ts`

**已知缺口**:
- 标签/字段操作撤销（当前不记录，Phase 2）
- 批量操作撤销

---

### 2.9 拖拽排序（已在 2.3 合并）

---

### 2.10 键盘快捷键注册表

**规格文档**: `docs/features/keyboard-shortcuts.md`
**已实现度**: ✅ 注册表完整

- 冲突检测：`src/lib/shortcut-registry.ts:findUnexpectedShortcutConflicts()`
- 启动时自动检测：`App.tsx` dev 模式

**测试覆盖**:
- `tests/vitest/shortcut-registry.test.ts`
- `tests/vitest/selected-reference-shortcuts.test.ts`

---

### 2.11 面板导航系统（Zoom / PanelStack）

**当前状态**: ✅ 核心完整，无独立规格文档
**代码入口**: `PanelStack.tsx`, `NodePanel.tsx`, `NodePanelHeader.tsx`, `Breadcrumb.tsx`

| 功能 | 状态 |
|------|------|
| 面板推入 / 弹出 / 替换 | ✅ |
| Breadcrumb 导航（ancestor chain + 折叠） | ✅ |
| 面板跳转（navigateTo） | ✅ |
| panelHistory 持久化 | ✅ chrome.storage |

**已知缺口**:
- `isRootView` 在 container nodes 的行为（已修复 2026-02-20）
- `[W]` avatar 在无 workspaceRootId 时 fallback（已修复 2026-02-20）

---

### 2.12 侧栏 + 搜索

**代码入口**: `Sidebar.tsx`, `SidebarNav.tsx`, `CommandPalette.tsx`

| 功能 | 状态 |
|------|------|
| 侧栏容器导航（Library/Inbox/Journal/Searches/Trash） | ✅ |
| Cmd+K 命令面板 + 节点搜索 | ✅ |
| 节点搜索 SKIP_DOC_TYPES 过滤 | ✅ |

**测试覆盖**:
- `tests/vitest/node-search-filter.test.ts`

---

### 2.13 Loro CRDT 基础设施

**规格文档**: `docs/features/undo-redo.md` §架构, TASKS.md P0 已完成项
**代码入口**: `src/lib/loro-doc.ts`, `src/lib/loro-persistence.ts`
**已实现度**: ✅ Phase 1 + 7 项基础设施 API（PR #62/#63）

| 功能 | 状态 |
|------|------|
| Loro CRDT 本地数据引擎 | ✅ |
| subscribeNode 容器级隔离订阅 | ✅ |
| 增量同步（exportFrom + merge） | ✅ |
| 时间旅行（getVersionHistory + checkout） | ✅ |
| LoroText Peritext 基础设施 | ✅ |
| forkDoc（fork + merge 回主 doc） | ✅ |
| Awareness 纯内存模块 | ✅ |
| UndoManager（mergeInterval 500ms） | ✅ |

**测试覆盖**:
- `tests/vitest/loro-infra.test.ts`
- `tests/vitest/loro-step0-validation.test.ts`
- `tests/vitest/loro-undo.test.ts`
- `tests/vitest/invariants-helper.test.ts`

---

### 2.14 数据完整性

**代码入口**: `src/lib/tree-utils.ts`, `tests/vitest/invariants-helper.test.ts`

| 功能 | 状态 |
|------|------|
| children / _ownerId 一致性验证 | ✅ |
| Trash 语义（软删除）| ✅ |
| Container 边界保护 | ✅ |
| outdentNode 容器边界 | ✅ |

**测试覆盖**:
- `tests/vitest/node-store-guard-rails.test.ts`
- `tests/vitest/node-store-trash-semantics.test.ts`
- `tests/vitest/node-store-content.test.ts`

---

### 2.15 Web Clipping（网页剪藏）

**规格文档**: `docs/features/web-clipping.md`
**已实现度**: ⚠️ 基础设施完成，保存节点流程待接入

| 功能 | 状态 |
|------|------|
| Content Script 提取（defuddle） | ✅ |
| Background 消息中转 | ✅ |
| Sidebar 剪藏按钮 + Capture Tab | ✅ |
| 保存为节点 + #web_clip 标签 | ⏸ 未实现 |
| Source URL 字段写入 | ⏸ 未实现 |
| 剪藏结果 Toast | ⏸ 未实现 |

**测试覆盖**:
- `tests/vitest/webclip-service.test.ts`

---

## 三、文档与代码对齐度

| 特性文档 | 对齐度 | 主要过时内容 |
|----------|--------|------------|
| `outliner-interactions.md` | ✅ 准确 | 无 |
| `supertags.md` | ✅ 准确 | `setConfigValue` commitDoc bug 已修复（加决策记录即可） |
| `fields.md` | ✅ 准确 | 无 |
| `references.md` | ✅ 准确 | 无 |
| `node-selection.md` | ✅ 准确 | 无 |
| `drag-drop.md` | ✅ 准确 | 无 |
| `keyboard-shortcuts.md` | ✅ 准确 | 无 |
| `undo-redo.md` | ✅ 准确 | 已含 Loro UndoManager 记录 |
| `floating-toolbar.md` | ✅ 准确 | 无 |
| `editor-migration.md` | ✅ 准确 | 无 |
| `web-clipping.md` | ✅ 准确 | 当前状态已标注未实现 |
| `search.md` | ⚠️ 规格超前 | 搜索节点系统未实现（当前仅 Cmd+K 面板搜索） |
| `views.md` | ⚠️ 规格超前 | 所有视图系统未实现（P3） |
| `date-nodes.md` | ⚠️ 规格超前 | 日期节点系统未实现（P2） |
| `slash-command.md` | ⚠️ 部分超前 | Heading 已实现，其余 Slash Commands 未实现 |

---

## 四、代码 Review 优先级建议

按"风险 × 复杂度"排序：

### 高优先级（P0 — 数据正确性）

1. **`src/stores/node-store.ts`** — `commitDoc` 覆盖完整性 + `applyTag/removeTag` Extend 链 + `resolveForwardDoneMapping/resolveReverseDoneMapping` 双向映射防无限循环
2. **`src/lib/loro-doc.ts`** — `rebuildMappings` 调用时机 + `commitDoc` vs `commit(origin)` 区别 + UndoManager excludeOriginPrefixes 正确性
3. **`src/lib/tree-utils.ts`** — `getNavigableParentId` + `getAncestorChain` + `flattenVisibleNodes` 边界条件

### 中优先级（P1 — 功能正确性）

4. **`src/hooks/use-node-fields.ts`** — `computeFields` 虚拟 fieldEntry 生成逻辑 + TAGDEF_CONFIG_FIELDS 排序 + `resolveConfigValue` 读取路径
5. **`src/components/fields/FieldValueOutliner.tsx`** — 虚拟 tupleId 判断 + boolean/color 读写分支 + `selectFieldOption` 回调链
6. **`src/components/outliner/OutlinerItem.tsx`** — 多选状态传递 + drag-drop 事件分离 + reference 节点的 `onNodeClick` 路径
7. **`src/components/outliner/OutlinerView.tsx`** — `getFlattenedVisibleNodes` 可见性计算 + 滚动行为

### 低优先级（P2 — 代码质量）

8. **`src/components/fields/ConfigOutliner.tsx`** — `ownItems` 循环 `type==='fieldDef'` 包含逻辑
9. **`src/components/editor/RichTextEditor.tsx`** — ProseMirror 插件链 + `pm-schema.ts` node/mark 定义完整性
10. **`src/lib/checkbox-utils.ts`** — `resolveCheckboxClick` / `resolveCmdEnterCycle` 三态逻辑
11. **`src/components/panel/Breadcrumb.tsx`** — `isRootView` 条件 + `[W]` avatar 显示逻辑

---

## 五、测试覆盖缺口

| 功能 | 当前状态 | 建议补充 |
|------|---------|---------|
| `setConfigValue` + commitDoc 响应性 | ⚠️ 无 Vitest 覆盖 | 添加 vitest 验证 commitDoc 触发 `_version` 变化 |
| `autoCollectOption` 原子性 | ⚠️ 无专项 | 确认 option + fieldEntry 在同一 commit 内 |
| `applyTag` Extend 链多级继承 | ✅ `node-store-extend.test.ts` | 已有，可审查覆盖完整性 |
| 面包屑 ancestor chain | ⚠️ 无 Vitest | 建议 `tree-utils.test.ts` 追加 |
| 导航历史持久化恢复 | ✅ `ui-store-persist.test.ts` | 已有 |
| Loro commitDoc 覆盖 | ⚠️ 无 | 建议系统性 smoke test：所有 store mutations 验证 `_version` 更新 |

---

## 六、已废弃 / 已清理的代码（Review 时无需关注）

- `FieldValueEditor.tsx` — 已废弃，被 FieldValueOutliner 替代（仍在代码库中，但已成死代码，可在下一轮清理时删除）
- Metanode + AssociatedData — 已在 PR #60 消除，不存在于当前代码
- `createStandaloneAttrDef` — 已删除（违反所有权模型）
- Supabase node-service / tag-service / field-service — 已被 Loro 替代为主要数据层（服务文件仍存在，但主路径不走它们）
