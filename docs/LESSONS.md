# 共享经验教训

> 所有 Agent 共享的项目经验、陷阱和设计决策。
> 每个 Agent 启动时应 `Read docs/LESSONS.md`，遇到新的经验教训时追加到对应段落。
>
> **与其他文档的关系**：
> - `CLAUDE.md` = 项目规范和技术参考（不变的规则）
> - `docs/features/*.md` = 行为规格（功能定义）
> - `docs/LESSONS.md` = 实践经验（踩坑后的教训，会持续增长）

---

## 已验证的陷阱（Gotchas）

### Zustand + React 19

- Selector 返回新对象/数组 → 无限重渲染。用 `JSON.stringify` + `useMemo` 或 `useShallow`
- Zustand v5 persist: 无顶层 `serialize`/`deserialize`，用 `createJSONStorage({ reviver, replacer })`
- Vite HMR 后 store 实例变更 → 必须用 `window.__nodeStore` 访问，不要 `import()`
- **禁止 `useNodeStore((s) => s.entities)` 全量订阅**：entities 是全局节点表，任何节点变化都会触发重渲染。在列表中大量出现的组件（TagBadge、NodePicker 选项等）尤其致命。正确做法：将 `resolveTagColor` 等计算放入 selector 内部，返回原始值或常量引用，例如 `useNodeStore((s) => resolveTagColor(s.entities, tagDefId))`

### contenteditable 切换焦点（9 轮迭代的教训）

- **focus 切换必须在 mousedown 中完成，不要等 click**。事件顺序 `mousedown → blur → click`，blur 会卸载旧编辑器导致布局偏移，click 时坐标已失准
- **mousedown 中 `e.preventDefault()`** 阻止浏览器原生 focus 行为，让 React 状态完全控制 focus 切换
- **blur 清除用 `requestAnimationFrame` 延迟**：给 mousedown 的 `setFocusedNode(newId)` 先执行，blur 的 guard `focusedNodeId === oldId` 自然失败
- **store 中的瞬态共享数据必须带身份标识**：`focusClickCoords` 须含 `nodeId + parentId`，防止快速切换时旧数据被新组件错误消费
- **`caretPositionFromPoint`（标准）优先，`caretRangeFromPoint`（webkit）兜底**

### Loro CRDT：mutations 必须 commitDoc()

**根本原因**：Loro 的 `doc.subscribe(cb)` 只在 `doc.commit()` 调用后才触发，raw mutations（`node.data.set(key, val)`、`tree.create()`、`tree.delete()`）不会触发订阅。node-store 的 `_version` 完全依赖 `doc.subscribe` 回调，React 选择器靠 `_version` 变化决定是否重渲染。

**症状**：点击 toggle/color 等控件，数据确实写入了（`getNode()` 能读到新值），但 UI 冻结不更新。

**规则**：**每个 store action 结束时必须调用 `loroDoc.commitDoc()`**，包括：
- 直接调用 `loroDoc.setNodeData/setNodeDataBatch/deleteNodeData`
- 直接调用 `loroDoc.createNode/deleteNode/moveNode`
- 调用 `loroDoc.addDoneMappingEntry/removeDoneMappingEntry` 等高层封装
- **例外**：如果 action 会调用另一个已包含 `commitDoc` 的 action，可以不重复；
  但如果同一个 action 内有"其他 action 调用之外"的额外 mutations，结束时仍需 commitDoc

**批量场景**：多步 mutations 放在同一个 action 里，最后一次 commitDoc 即可（原子性）。
不要每步都 commitDoc（会产生多次提交，但功能正确，只是产生多个历史记录）。

**`autoCollectOption` 教训**：原来调用 `get().addFieldOption()`（内含 commitDoc）导致后续 mutations 在 commit 之后执行，没有被纳入同一个原子提交。修复方法：内联 mutations，在所有步骤完成后统一 commitDoc。

**已修复的函数列表**（2026-02-20）：`setFieldValue`、`setOptionsFieldValue`、`selectFieldOption`、`clearFieldValue`、`addFieldToNode`、`addUnnamedFieldToNode`、`moveFieldEntry`、`removeField`、`renameFieldDef`、`changeFieldType`、`addFieldOption`、`removeFieldOption`、`autoCollectOption`、`toggleCheckboxField`、`replaceFieldDef`、`toggleNodeDone`、`cycleNodeCheckbox`、**`setConfigValue`**、`addDoneMappingEntry`、`removeDoneMappingEntry`、`addReference`、`removeReference`、`startRefConversion`、`applyTag`、`removeTag`、`createTagDef`、`createFieldDef`。

**种子测试数据与 UndoManager 的交互陷阱**：`seedTestDataSync()` 在初始化时调用了 store actions（如 `applyTag`），这些 action 内部调用 `commitDoc()` 时没有 `'__seed__'` origin，导致 UndoManager 记录了种子操作（pre-existing test 期望 `canUndo() === false`）。修复方法：在 `seedTestDataSync()` 末尾调用 `clearUndoHistoryForTest()`（重新初始化 UndoManager），清除种子操作产生的 undo 记录。

**detached checkout 写操作陷阱**：Loro 在 detached（时间旅行）状态下执行写操作会抛错（`The doc is readonly when detached`），不能依赖“写入后 commit no-op”。修复策略：
- `loro-doc.ts` 所有 mutation API + `commitDoc` 统一加 detached guard（忽略写入并 warning 一次）
- `node-store.ts` 对有返回值的 mutation（如 `createChild/createTagDef/createFieldDef`）加上层 guard，避免下层 no-op 后出现空节点断言崩溃

**commit origin 分层**：统一使用 `user:* / system:* / __seed__` 语义前缀，并在 UndoManager 过滤 `['__seed__', 'system:']`，确保系统提交不污染用户撤销栈。

**PeerID 恢复顺序陷阱**：`doc.setPeerId()` 必须在文档仍为空（无 oplog）时调用。恢复流程应为 `new LoroDoc()` → `setPeerId(savedPeerId)` → `import(snapshot)`；若先 `import` 再 `setPeerId`，在已有 oplog 的文档上会失败（或行为不符合预期）。

### 树操作边界条件

- **handleBlur 竞态**: onBlur 须检查 `focusedNodeId === nodeId` 再清除（现已改为 rAF 延迟）
- **trashNode**: 必须同时更新 `trash.children` 和 `node._ownerId`
- **outdentNode 容器边界**: 父节点是容器时 outdent 应为 no-op（`isWorkspaceContainer()` guard）
- **expandedNodes**: compound keys `parentId:nodeId`，清理持久化数据需清除 localStorage `nodex-ui`

### OutlinerItem 双上下文陷阱

- OutlinerItem 同时用于 **OutlinerView**（主大纲）和 **FieldValueOutliner**（字段值）
- 两个上下文的 `rootChildIds` / `rootNodeId` 作用域不同（全局 vs assocData 局部）
- **方向键导航**在字段值中会被困住——必须通过 `onNavigateOut` 回调逃逸到父上下文
- **isReference** 在字段值中可能为 true（Options 值是引用节点），这是正确行为
- **新增键盘/导航行为时**: 检查在 FieldValueOutliner 上下文中是否也正常工作
- **回调链**: OutlinerItem(parent) → FieldRow → FieldValueOutliner → OutlinerItem(child)/TrailingInput

### FIELD_TYPES 常量大小写陷阱

- `FIELD_TYPES.*` 的值全部为**小写**（`'options'`, `'date'`, `'plain'`, `'number'`, `'url'`, `'email'`, `'checkbox'`）
- 种子数据和测试中曾使用大写字符串（`'OPTIONS'`, `'DATE'`），导致字段图标逻辑匹配失败（显示 AlignLeft ≡ 而非 List 图标）
- **规则**: 所有写入 `fieldType` 的地方必须使用 `FIELD_TYPES.*` 常量，不要硬编码字符串
- 测试期望值也必须用 `FIELD_TYPES.*`，不要写裸字符串

### Node 图标系统 — 两层设计

**架构**: 颜色（语义层）+ 形状（结构层）分离

- **颜色** = supertag 成员身份 → `resolveNodeBulletColors(nodeId): string[]`
  - 0 个标签 → `[]`（灰色默认点）
  - 1 个标签 → `[color]`（纯色点）
  - 2+ 个标签 → `[c1, c2, ...]`（conic-gradient 饼图，每段等分）
  - conic-gradient 在 `BulletChevron.buildBulletStyle()` 中构建
- **形状** = 结构类型 → `resolveNodeStructuralIcon(node): AppIcon | null`
  - `node.type === 'fieldDef'` → `getFieldTypeIcon(node.fieldType ?? FIELD_TYPES.PLAIN)`
  - 其他 → `null`（使用默认圆点）
- **传播**: `effectiveBulletColors = bulletColors ?? tagBulletColors`，父组件可覆盖（ConfigOutliner 模板项传入 ownerTagDef 颜色）
- **继承项颜色**: ConfigOutliner 总是传入 `ownerColor`（无论是否有 Extend 关系），让所有 fieldDef 图标与所属 tagDef 颜色一致

### 多标签字段排序

`visibleChildren` 的排序规则：
1. **supertag 字段** — 按 `node.tags` 顺序分桶，每个 tagDefId 的字段按桶顺序输出
2. **孤立字段**（fieldEntry 的 fieldDefId 父节点不在 tagIds 中）— 在所有 supertag 字段之后
3. **content 节点**（type 为 undefined 的普通内容节点）— 最后

实现：先 `Map<tagDefId, Child[]>` 分桶，再 `for (tagId of tagIds)` 有序输出。

### 类型系统

- `CreateNodeInput.props` 和 `UpdateNodeInput.props` 都是 `Partial<NodeProps>`
- `node-service.ts` 导出 `rowToNode` 和 `NodeRow`（realtime hook 需要）
- `reorderChildren` 接收完整 children 数组，非单节点 reorder

### WXT / Vite

- WXT 0.20.x 的 `ImportMetaEnv` 通过 `src/env.d.ts` 扩展 `VITE_*` 变量
- `postinstall: "wxt prepare"` 生成类型
- Supabase in standalone: `.env` 有 `VITE_SUPABASE_URL` → `isSupabaseReady()=true`，standalone 用 TestApp 跳过
- Tana export JSON 是 16MB+ → 用 Python/Bash 处理，不要直接 Read

### FieldRow 渲染一致性

- FieldRow wrapper 三件套：`className="@container"` + `style={{ paddingLeft: 6 + 15 + 4 }}`
- `6` = indent base，`15` = ChevronButton 宽度，`4` = chevron-bullet gap
- `@container` 是 FieldRow 内部 `@sm:flex-row` 容器查询的锚点，缺失会导致布局错乱
- OutlinerView / FieldValueOutliner / ConfigOutliner 三处必须完全一致
- **嵌套边框叠加**: FieldValueOutliner/ConfigOutliner 的首/末子节点为 FieldRow 时需 `pt-1`/`pb-1`，防止与父 FieldRow border 重叠

### BulletChevron 实现要点（Side-by-side 布局）

- `BulletChevron`（15px）= 纯 bullet，`ChevronButton`（15px）= 纯 chevron，两个独立组件
- OutlinerItem 行布局：`[ChevronButton 15px][gap-1 (4px)][SelectionRing: [BulletChevron 15px][gap-2 (8px)][text]]`
- Selection ring 只包裹 bullet + text，不包裹 chevron
- ChevronButton 通过 `opacity-0 group-hover/row:opacity-100` + `pointer-events-none group-hover/row:pointer-events-auto` 按需显示
- FieldRow/AutoCollect/NodePicker/TrailingInput 只用 BulletChevron（无 chevron，不需要 `bulletOnly`）
- Collapsed-with-children 显示 `bg-foreground/[0.08]` 外环
- 空间关系：`indent line → chevron → bullet`（从左到右），三者 hover 区域互不重叠
- 缩进单位 28px（非 24px），每级 `depth * 28`
- Bullet center = paddingLeft + 15(chevron) + 4(gap) + 7.5 = depth * 28 + 32.5
- indent guide line: `left: depth*28+17, width: 16, justify-end`（视觉线在右边缘≈32.5）
- indent line 右边缘 = depth*28+33，child ChevronButton 左边缘 = depth*28+34，间隙 1px
- FieldRow/TrailingInput paddingLeft: `depth * 28 + 6 + 15 + 4`（depth=0 时 = 25）

---

## 设计原则

- **视觉一致性优先**: 不要为特定功能创造新的视觉模式。复用现有组件（如 `BulletChevron` 的 `isReference`/`dimmed`），避免创建 `ReferenceNode` 等一次性展示组件
- **组件职责完整**: 一个字段类型的值渲染器应同时负责 display + interaction，不要拆成"显示组件 + 叠加交互层"的组合。例：`OptionsPicker` 独立负责 Options 字段的显示和选择，而非 `FieldValueOutliner` + picker overlay
- **配置页同构**: 配置页 = `List<FieldRow>`，无例外。节点自身 children 通过虚拟字段（`NDX_SECTION_*`）映射为 FieldRow，不要创建特殊 section

---

## 数据所有权规则

### attrDef `_ownerId` = 创建它的 tuple（出生地 parent）

- `createAttrDef`（tagDef 模板场景）: `_ownerId = templateTupleId`
- `addUnnamedFieldToNode`（内容节点 `>` 场景）: `_ownerId = tupleId`
- **Schema.children 只包含 tagDef + 系统标签**，不包含 attrDef
- 发现所有 attrDef 通过 `_docType === 'attrDef'` 查询（`useWorkspaceFields`）
- 不存在 `createStandaloneAttrDef`（已删除，违反所有权模型）

---

## 设计模式

- **统一值渲染器**（已完成）: 所有字段类型的值区域 = `FieldValueOutliner`。OutlinerItem 通过 `fieldDataType` prop 控制特殊渲染（Checkbox → toggle）。`FieldValueEditor` 已废弃（死代码）
- **Options 值 = 节点引用**: `assocData.children = [optionNodeId]`，不是文本复制。选中后通过 store 查 option 节点名称渲染
- **Checkbox 值 = SYS_V**: 使用 `SYS_V03`(Yes)/`SYS_V04`(No)，不要用 `'1'`/`'0'`
- **Unified NodePicker**: Options/ConfigSelect/FieldTypePicker 统一为"从列表选节点"组件
- **Toggle vs Checkbox**: Toggle = 配置页滑块，Checkbox = 字段值复选框，同数据模型 `SYS_V03/V04`
- **Config field layout**: Name(bold)+description 左列 180px，control 右列
- **ConfigOutliner 通用渲染**: 同时处理 field tuple（→FieldRow）和 plain node（→OutlinerItem），tagDef/attrDef 共用

---

## 间距改动方法论

### 几何级联效应

改动一个间距值（如 chevron-bullet 加 gap）会级联影响：indent line 位置、FieldRow wrapper padding、TrailingInput padding、drop indicator margin。**改间距前必须列出完整的依赖链**，逐一更新。

### Indent 单位约束公式

`indent_unit ≥ chevron_width + gap + half_bullet_width`
- 当前: 28 ≥ 15 + 4 + 7.5 = 26.5 ✓（余量 1.5px = indent line 与 child chevron 间隙）
- 如需更大 gap，必须同步增大 indent unit

### Hover 重叠分析法

三个紧邻元素的 hover 区域分析：算出每个元素的 `[left, right]` 区间，检查区间是否重叠。z-index 不是解决重叠的正确方式（只让其中一个"赢"，另一个变死区），应从布局层面消除重叠。

### justify-end 不对称定位技巧

Click area 需偏向一侧、visual 需在另一侧时：`justify-end` + 固定宽度 + absolute → 点击区域在左侧，视觉线在右边缘。

---

## 协作纪律（血泪教训）

### 禁止直接 push main

- Dev Agent（nodex-codex / nodex-cc / nodex-cc-2）**绝对不能**直接向 main push commit
- 曾发生过 cc-2 直接 push 6 个 commit 到 main，绕过 code review，导致性能问题（entities 全量订阅）和 TASKS.md 被自行标记完成
- **唯一合入路径**：feature branch → PR → nodex review → merge
- 唯一例外：nodex 自身的小修复和紧急改动

### PR 状态管理

- **Draft** = 开发中，nodex 忽略不 review
- **Ready** = 开发完成，等待 review
- Dev Agent 开发中保持 Draft；完成自检后 `gh pr ready` 转 Ready
- 不要跳过 Draft 直接创建 Ready PR（除非改动极小且已充分自测）

### Review 检查要点（给 nodex 的提醒）

- 代码质量：架构合理性、命名一致性
- 性能：是否有 `useNodeStore((s) => s.entities)` 等全量订阅
- 测试：新功能是否有 Vitest 覆盖
- 文档：`docs/features/*.md` 和 `docs/TESTING.md` 是否同步更新
- 数据模型：`system-nodes.ts` 常量是否有 ID 冲突

---

## 数据模型简化决策（2026-02-18, PR #60 已完成）

- Tana 的 Metanode + AssociatedData 是 Firebase 时代的容器节点，PostgreSQL 不需要
- Metanode → `meta TEXT[]` 列（存 tuple ID 列表）
- AssociatedData → 值直接存 FieldTuple.children[1:]
- Tuple 保留不变，是"一切皆节点"的核心
- `tana-import.ts` 保留原始格式读取能力（`_metaNodeId` → `meta` 转换）
- NQL 方案（PR #59 Part B）被否决，改用 PostgreSQL 原生视图做读模型
