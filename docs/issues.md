# Issues

> 纯文本 issue 跟踪，方便多 agent 协作。格式：`[状态] #ID 标题`

## Open Bugs

### #42 Field name 按 Enter 创建的节点层级错误 + 无焦点

**状态**: open
**发现**: 2026-02-13
**相关**: system fields 实现过程中发现，但影响所有 field 类型

**现象**:
1. 在任意 field name 中按 Enter，新节点应出现在该 field 下方（作为同级 child）
2. 实际：新节点出现在错误的层级（更高层），且高度异常偏大
3. 光标没有聚焦到新创建的节点

**已尝试**:

| 轮次 | 方案 | 结果 |
|------|------|------|
| 1 | `createSibling(tupleId)` | 节点层级错误——tuple._ownerId 不一定匹配视觉父节点 |
| 2 | 改为 `createChild(nodeId, position)` | 仍有问题，待排查 |

**根因分析**:
- `createSibling` 依赖 `tuple._ownerId` 定位父节点，导入数据中 `_ownerId` 可能不匹配视觉父节点
- 已改为 `createChild(nodeId, position)` 但问题仍在，需进一步排查：
  - `nodeId` 是否是正确的视觉父节点（FieldRow 接收的 nodeId 来自哪里）
  - `createChild` 后 `setFocusedNode` 的 parentId 是否正确
  - 新节点高度异常可能是 FieldList/TagBar 渲染在空节点上导致

**相关代码**:
- `src/components/fields/FieldRow.tsx` — `handleEnterConfirm`
- `src/stores/node-store.ts` — `createChild`, `createSibling`

---

### #41 Node Description 编辑：高度跳动 + Ctrl+I 快捷键不生效

**状态**: open
**发现**: 2026-02-13

**Bug 1: 点击 description 进入编辑时高度跳动**
- 静态显示：`text-xs leading-tight`（12px font, 15px line-height）
- 编辑态：增加了 `min-h-4`（16px），比文本行高多 1px
- 可能修复：移除 `min-h-4`，统一 `leading-[15px]`

**Bug 2: Ctrl+I (Mod-i) 快捷键不触发 Add Description**
- 已尝试：StarterKit 禁用 italic + `Mod-i` keymap → 不生效
- 可能根因：Mac 上 `Mod-i` = `Cmd+I`，用户可能按的是 `Ctrl+I`
- 下一步：添加 console.log 确认回调是否被调用

**相关代码**:
- `src/components/editor/NodeEditor.tsx`
- `src/components/outliner/OutlinerItem.tsx`
- `src/components/panel/NodeDescription.tsx`

**相关 commit**: 361d4a8, 8222558

---

## Closed Bugs

| # | 标题 | 关闭日期 |
|---|------|----------|
| 18 | 无 child node 的节点展开后 backspace 应删除空子节点并收起 | 2026-02-13 |
| 17 | 在子节点中 @ 创建对兄弟节点的 reference 时出错 | 2026-02-13 |
| 16 | 聚焦末尾含 # 或 @ 的 node 时不应触发菜单 | 2026-02-13 |
| 15 | 光标移动到 inline code 内部时光标消失 | 2026-02-13 |
| 14 | 长文本 node 失去焦点时文本布局宽度变窄 | 2026-02-13 |
| 13 | #tag 与所在行文本的垂直居中对齐 | 2026-02-13 |
| 12 | @ 创建 reference node 后光标在末尾继续输入应转换为 inline reference | 2026-02-13 |
| 11 | reference node → ArrowRight → 输入文本 → 可逆转换为 inline reference | 2026-02-13 |
| 10 | 检查所有 outliner 部分逻辑一致性 | 2026-02-13 |
| 9 | field node 的 _ownerId 应指向创建它的 tuple 而非 Schema | 2026-02-13 |
| 8 | options type field 的 value 也应支持完整 outliner 操作 | 2026-02-13 |
| 7 | Field 各类型的配置项需要检查是否多余或不合适 | 2026-02-13 |
| 6 | 带行内引用的节点进入编辑模式后行内引用变成 Untitled | 2026-02-13 |
| 5 | 新建空 node 不应显示 untitled 暗文本 | 2026-02-13 |
| 4 | node reference 在原节点编辑时没有实时更新 | 2026-02-13 |
| 3 | 后续进入包含 # 或 @ 的节点不应触发选择框 | 2026-02-13 |
| 2 | field node 的 value 中不能将普通节点转换为 field node | 2026-02-13 |
| 1 | 点击未聚焦节点的格式化文本时光标定位不准 | 2026-02-13 |

## Feature Roadmap

> 功能规划见 `docs/ROADMAP.md`，每个功能的详细行为规格见 `docs/features/*.md`

| # | 功能 | Phase | 状态 |
|---|------|-------|------|
| 19 | References 增强 — 反向链接、引用计数、合并节点 | 1 | open |
| 20 | Supertags 完善 — Checkbox, Default Child, Color, 继承等 | 1 | open |
| 21 | Fields 全类型 — Options, Date, Number, URL, Email, Checkbox 等 | 1 | open |
| 22 | Date 节点 & 日记 | 1 | open |
| 23 | Search Nodes / Live Queries | 2 | open |
| 24 | Table View | 2 | open |
| 25 | Filter / Group / Sort 工具栏 | 2 | open |
| 26 | Cards View | 2 | open |
| 27 | Calendar View | 2 | open |
| 28 | List & Tabs View | 2 | open |
| 29 | AI Chat | 3 | open |
| 30 | 网页剪藏 | 3 | open |
| 31 | 网页 AI 辅助 | 3 | open |
| 32 | AI Command Nodes | 3 | open |
| 33 | AI 字段增强 | 3 | open |
| 34 | Supabase 实时同步 | 4 | open |
| 35 | 离线模式增强 | 4 | open |
| 36 | 导入/导出 | 4 | open |
| 37 | Command Nodes — 自动化 | 5 | open |
| 38 | Title Expressions — 动态标题模板 | 5 | open |
| 39 | Publishing — 节点发布为公开网页 | 5 | open |
| 40 | Input API — REST API 接入 | 5 | open |
