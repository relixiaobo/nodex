# Loro 迁移后全量系统 Review (2026-02-21)

> **任务**: 对 Loro 迁移启动（`8b722f1`）到当前 HEAD（`55ca100`）的所有代码做全面 Review
> **Owner**: nodex-codex（只读，不修改代码）
> **产出**: 将所有发现写入本文档「Findings」和「测试缺口」段落，完成后 DM nodex

---

## 范围

Loro CRDT 迁移分三阶段落地，外加一轮 bugfix 和两次重构：

| 阶段 | PR/分支 | 内容 |
|------|---------|------|
| Phase 1 | PR #62 | 核心迁移 — `loro-doc.ts` 重写、全 store 接入、14 个测试重写 |
| Phase 2 | PR #63 | 7 项底层 API — subscribeNode / 增量同步 / 时间旅行 / LoroText / fork / Awareness |
| Post-migration | main | UI 回归修复 7 项、commitDoc 补丁（6 个函数）、NodeType 重构（22→6）、图标系统 |

**提交范围**: `8b722f1^..HEAD`（31 commits，~80 个文件，2800+ 行净增）

---

## 上次 Review 历史（2026-02-20，已修复，不必重复验证）

以下 6 个 Bug 已在 `ee0c83a` 修复，本轮跳过：

| 问题 | 位置 |
|------|------|
| `applyTag` 缺 `commitDoc()` | `node-store.ts` |
| `removeTag` 缺 `commitDoc()` | `node-store.ts` |
| `createTagDef` 缺 `commitDoc()` | `node-store.ts` |
| `createFieldDef` 缺 `commitDoc()` | `node-store.ts` |
| `outdentNode` 缺容器边界守卫 | `node-store.ts` |
| `toggleCheckboxField` 写 `'true'` 非 `SYS_V.YES` | `node-store.ts` |

以下 5 个 P1 issue 上次标注为"发现但未确认修复"，请重新验证当前状态：

- `FieldValueOutliner.tsx:166` — `useNodeStore.getState()` 在 render body（CHECKBOX + DATE 两处）
- `FieldValueOutliner.tsx:295-298` — `SupertagPickerField.selectedId` 读 node nanoid 而非 tagId
- `use-node-fields.ts:136-152` — `fieldDef` 节点虚拟 config entry 可能重复生成
- `OutlinerView.tsx:64` + `OutlinerItem.tsx:267` — `getState()` 在 `useMemo` 中命令式读取
- `OutlinerItem.tsx:312` — `isReference` 通过 `loroDoc.getParentId()` 在 render 中直接读取

---

## Findings

> 请按优先级分组。格式：
>
> ```
> ### P0/P1/P2 — [文件:行号] 问题标题
> **描述**: ...
> **建议**: ...
> ```

### P0 — [src/components/outliner/OutlinerItem.tsx:1549 + src/stores/node-store.ts:721-737] `@` 选中已有节点会误删目标节点
**描述**: 空节点 `@` 选择已有节点时，`handleReferenceSelect()` 把“目标节点 ID”传给 `startRefConversion(refNodeId, ...)`。但 `startRefConversion()` 的语义是“把 reference 节点转为临时编辑节点”，内部第一步会 `deleteNode(refNodeId)`。结果是会删除被引用的真实目标节点，而不是创建引用节点。  
**建议**: 空节点 `@` 分支改为 `addReference(parentId, targetNodeId, pos)`（或新增 `startTargetRefConversion` 专用 API），禁止复用 `startRefConversion`。

### P0 — [src/components/outliner/OutlinerView.tsx:64-65 + src/components/outliner/OutlinerItem.tsx:285-287] `reference` 类型节点被列表分类直接过滤，无法渲染
**描述**: 两处子节点分类逻辑都以 `if (!nodeType) => content` 判定可渲染内容；`type='reference'` 会被排除。即使 `addReference()` 成功创建了引用节点，也不会出现在 outliner。  
**建议**: 分类规则应显式包含 `reference`（例如 `!type || type === 'reference'`），并在渲染层区分 reference 的展示与交互。

### P1 — [src/stores/node-store.ts:395-403] `removeTag` 会删除“仍被其他标签需要”的共享字段实例
**描述**: `removeTag()` 按当前标签及 extends 链直接删除对应 `fieldEntry`，未检查节点上其余标签是否也需要同一 `fieldDef`。在多标签/继承重叠场景（如同时应用父标签与子标签）会错误删字段。  
**建议**: 删除前先计算“剩余标签集合”的可见 `fieldDef` 闭包，仅删除不再被任何剩余标签覆盖的 `fieldEntry`。

### P1 — [src/stores/node-store.ts:654-671 + src/stores/node-store.ts:486-513] `toggleNodeDone` 在 done-mapping 场景产生多次 commit，Undo 被拆分
**描述**: `toggleNodeDone()` 内调用 `selectFieldOption()`，后者会 `commitDoc()`；外层 `toggleNodeDone()` 结尾再次 `commitDoc()`。一次用户操作会产生多步提交，破坏“单操作单撤销步”的原子性。  
**建议**: 抽出 `selectFieldOptionNoCommit` 内部版本，`toggleNodeDone()` 仅在末尾统一 commit 一次。

### P1 — [src/components/fields/FieldValueOutliner.tsx:295-298] `OPTIONS_FROM_SUPERTAG` 的已选中值读取错误
**描述**: `selectedId` 读取的是 `tuple.children[0]`（值节点 ID），但 `NodePicker` 匹配的是 supertag ID。`setFieldValue()` 实际把 supertag ID 存在值节点 `name` 中，因此 picker 无法显示已选值。  
**建议**: 读取 `tuple.children[0]` 对应节点，再取其 `name` 作为 `selectedId`。

### P2 — [src/components/fields/FieldValueOutliner.tsx:196-200 + src/stores/node-store.ts:334-336] Date 字段更新路径与 commit 机制不一致
**描述**: DatePicker 编辑已有日期走 `setNodeName(valueNodeId, v)`，而 `setNodeName` 不触发 `commitDoc()`。这条路径不会触发 `_version` 变更，且与其他字段值修改（通常 commit）行为不一致。  
**建议**: Date 字段写值改为 `setFieldValue`/专用 action（带 commit），或为该路径增加显式 commit。

### P2 — [src/stores/node-store.ts:228-311] 工作区容器缺少不可变性守卫
**描述**: `moveNodeTo()` / `trashNode()` 没有拦截 `CONTAINER_IDS.*`。虽然 UI 主路径不直接暴露此操作，但 store 层缺少防护，容器被移动/回收后会破坏工作区根结构不变量。  
**建议**: 在 store 层对容器 ID 增加硬守卫（no-op + warning），避免调用方误用破坏根结构。

### P2 — [src/services/*.ts + src/lib/meta-utils.ts + src/hooks/use-realtime.ts + src/types/node.ts:246-260] 废弃代码/兼容层仍保留，语义噪音较高
**描述**: Loro 迁移后仍保留一批几乎不再参与运行路径的兼容文件与导出：  
- `src/services/node-service.ts` / `field-service.ts` / `tag-service.ts` / `search-service.ts`（Supabase 旧服务层）  
- `src/lib/meta-utils.ts`（meta tuple 兼容存根）  
- `src/hooks/use-realtime.ts`（no-op）  
- `src/types/node.ts` 中旧 `CONTAINERS` 映射（含 `SCHEMA: 'LIBRARY'` 历史值）  
这些代码虽然“可编译”，但会增加认知负担和误用风险。  
**建议**: 分批清理（先标记 internal/deprecated 并移出 barrel，再删代码与测试），确保文档与运行时模型一致。

---

## 测试缺口清单

> 格式：`- [ ] [模块] 缺失场景描述 → 建议添加到 tests/vitest/xxx.test.ts`

- [ ] [references] 空节点 `@` 选择已有节点不应删除目标节点；应创建可见引用节点/引用态 → `tests/vitest/reference-flow.test.ts`（新增）
- [ ] [outliner-render] `type='reference'` 子节点在 OutlinerView/OutlinerItem 中应可见 → `tests/vitest/outliner-reference-render.test.ts`（新增）
- [ ] [supertag-extend] 节点同时带父/子标签时，移除父标签不应删掉子标签仍需要的字段实例 → `tests/vitest/node-store-extend.test.ts`
- [ ] [undo-atomicity] `toggleNodeDone` + done-mapping 应只产生一个 undo step → `tests/vitest/done-state-mapping.test.ts` 或 `tests/vitest/loro-undo.test.ts`
- [ ] [field-config] `OPTIONS_FROM_SUPERTAG` 需要正确回显已选值（selectedId=tagDefId）→ `tests/vitest/field-value-outliner.test.ts`
- [ ] [date-field] DatePicker 修改已有值后应触发可观察更新（_version / UI 刷新）→ `tests/vitest/field-value-outliner.test.ts`
- [ ] [guard-rails] 禁止移动/回收 `CONTAINER_IDS.*` 容器节点 → `tests/vitest/node-store-guard-rails.test.ts`
