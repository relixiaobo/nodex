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

_(待填写)_

---

## 测试缺口清单

> 格式：`- [ ] [模块] 缺失场景描述 → 建议添加到 tests/vitest/xxx.test.ts`

_(待填写)_
