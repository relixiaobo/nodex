# NodePanel Header 重设计

## 目标

将 NodePanel 的标题区（当前 `PanelTitle.tsx`）重构为统一、清晰、优雅的"节点标识区"，使其在视觉上与下方 OutlinerView 形成连贯的纵向网格，而不是割裂的两个区域。

---

## 垂直对齐网格

整个 NodePanel（Header + OutlinerView）共享同一套三列坐标系：

| 列 | 宽度 | Header 中 | OutlinerView 中 |
|----|------|-----------|----------------|
| **列 A** | ~20px | `⠿` drag handle | `⌄` chevron（展开/折叠） |
| **列 B** | ~24px | `☐` checkbox、supertag badges 起始、icon 左边缘 | field 图标、`•` bullet、`⊕` 隐藏字段图标 |
| **列 C** | flex | 节点名称 | field 名称、内容文字 |

drag handle 与 chevron 严格对齐（相同 X 坐标），checkbox 与 field 图标/bullet 严格对齐。

---

## 布局结构

```
Breadcrumb（不变）
──────────────────────────────────────
[col B: Icon 32px]                    ← 区块①：条件显示

[col A: ⠿] [col B: ☐] [col C: 名称]  ← 区块②：Name 行（必须）

           [col B: # tag  # tag]      ← 区块③：Supertag 行（条件）

           [col B: < Today > 🗓]      ← 区块④：Extra 行（条件）

──────── OutlinerView（无缝续接）────
[col A: ⌄] [col B: ⊕] [col C: FieldName]  ← 隐藏字段占位行（条件，置顶）
[col A: ⌄] [col B: 🏷] [col C: Project  •  Select option]
[col A: ⌄] [col B: •]  [col C: content child]
```

---

## 各区块行为规格

### 区块① — Icon

- **显示条件**：`resolveNodeIcon(nodeId)` 返回的不是普通 bullet（即节点有语义图标）
- **尺寸**：32×32px，左边缘对齐列 B
- **不显示时**：整行不渲染，不占空间

### 区块② — Name 行（必须渲染）

三个元素从左到右：

1. **`⠿` Drag handle**（列 A）
   - 右键触发节点 context menu（替代原 `...` 按钮）
   - 拖拽语义：将当前节点移动到其他位置（与 bullet 拖拽相同，未来并列面板支持后激活）
   - Hover 时显示，平时不可见

2. **`☐` Checkbox**（列 B）
   - 显示条件：节点有 checkbox（`shouldNodeShowCheckbox` 返回 true）
   - 不显示时：该位置留白，名称仍从列 B 开始
   - 点击行为：与 OutlinerItem 中的 checkbox 行为一致（`toggleNodeCheckbox`）

3. **节点名称**（列 C）
   - 可点击编辑（contentEditable，与现有 PanelTitle 行为一致）
   - 字号：`text-xl font-semibold`（比现有 `text-lg` 略大）
   - Enter / Escape / blur 保存，行为不变

### 区块③ — Supertag 行

- **显示条件**：节点有至少一个 supertag，**且** 节点类型不是 `tagDef` 或 `fieldDef`
- **不显示时**：整行不渲染，不占空间
- **内容**：TagBar 组件，左边缘对齐列 B
- **无 `...` 按钮**：context menu 已移至 drag handle 右键

### 区块④ — Extra 行（插槽）

- **设计**：预留渲染插槽，各节点类型自行注册 extra 组件
- **当前唯一实现**：日期节点（Day/Week 等）显示 `< Today >` 导航行
- **显示条件**：由各 extra 组件自行决定是否渲染
- **不显示时**：整行不渲染

---

## 隐藏字段占位行（⊕）

### 位置
OutlinerView 内容区的**最顶部**，在所有 field rows 之前。

### 显示条件
节点有至少一个字段当前处于隐藏状态（`hideMode` 评估后为隐藏）。

### 交互
- 每个隐藏字段渲染一行 `⊕ FieldName`，`⊕` 图标对齐列 B
- 点击某行：该字段在 UIStore 中标记为"临时展开"，原地替换为完整 FieldRow
- **状态是临时的**：存入 `UIStore`（不持久化），切换面板或刷新后恢复隐藏
- 数据结构：`UIStore.expandedHiddenFields: Set<string>`（key = `${panelNodeId}:${fieldEntryId}`）

---

## 现有组件的变更

| 组件 | 变更 |
|------|------|
| `PanelTitle.tsx` | 重构为 `NodeHeader.tsx`，整合 Icon / Name行 / Supertag行 / Extra行 |
| `NodePanel.tsx` | 将 `<PanelTitle>` 替换为 `<NodeHeader>`，移除 TagDef 渐变色（可移入 NodeHeader） |
| `NodePanelHeader.tsx` | 保持不变（仅 Breadcrumb） |
| `OutlinerView.tsx` | 在顶部渲染隐藏字段占位行（读取 UIStore 展开状态） |
| `ui-store.ts` | 新增 `expandedHiddenFields: Set<string>` 及对应 action |
| `TagBar.tsx` | 无需改动，复用 |

---

## 不在本次范围内

- Date 导航行的具体实现（Extra 插槽预留即可，Date 节点是独立任务 #22）
- Drag handle 的实际拖拽功能（现阶段 hover 显示即可，拖拽逻辑等并列面板支持后实现）
- `...` context menu 的完整命令列表

---

## 当前状态

- [x] NodeHeader.tsx 替代 PanelTitle.tsx（PR #66）
  - Block ①: Icon 行 — tagDef 32px 彩色 #，fieldDef 20px 字段图标
  - Block ②: Name 行 — drag handle (col A) + checkbox (col B) + 可编辑名称 (col C, text-xl)
  - Block ③: Supertag 行 — TagBar，条件：has tags && not definition node
  - Block ④: Extra 行 — 插槽预留（空）
- [x] UIStore expandedHiddenFields — session-only Set<string>，toggleHiddenField/clearExpandedHiddenFields
- [x] OutlinerView 隐藏字段 reveal 从 useState 迁移到 UIStore
- [x] 三列对齐：drag handle = chevron (w-15px), checkbox = bullet (w-15px), paddingLeft 6px
- [ ] Drag handle 右键 context menu（预留，未实现完整命令列表）
- [ ] Extra 行 Date 导航实现（依赖 Date 节点 #22）
