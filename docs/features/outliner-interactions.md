# Feature: Outliner 交互（输入与导航）

> Phase 1 | 核心交互已实现（以当前代码为准）

## 概述

本文档描述 Outliner 在「节点编辑态 + 非编辑态 + TrailingInput」下的真实交互行为，覆盖：

- 节点创建（Enter / 拆分）
- 缩进与反缩进（Tab / Shift+Tab）
- 上下导航（ArrowUp / ArrowDown）
- 删除（Backspace 空节点）
- 同级重排（Mod+Shift+Arrow）
- TrailingInput 的深度偏移与提交策略

## 关键状态模型

- 焦点：`focusedNodeId + focusedParentId`（编辑态）
- 选中：`selectedNodeId + selectedParentId`（引用单击选中态）
- 焦点与选中互斥：进入编辑会清空选中，进入选中会清空编辑
- 展开状态 key：`parentId:nodeId`（同一节点在不同引用位置可独立展开）

## 行为规格

### 可见节点与导航范围

- 键盘上下导航基于 `getFlattenedVisibleNodes()` 的可见扁平列表。
- `tuple` 属于结构节点，不作为可导航内容项。
- 引用节点通过 `(nodeId, parentId)` 共同定位，避免同一节点多处出现时歧义。

### Enter（编辑节点）

- 当 `#` 或 `@` 下拉打开时，`Enter` 优先确认下拉项。
- 光标在行尾：保存当前节点内容，并触发「创建下一节点」。
- 光标在行中：执行“节点拆分”：
  - 当前节点保留光标前内容
  - 光标后内容序列化为 HTML，放入新节点
- 在单值字段类型（`NUMBER`/`INTEGER`/`URL`/`EMAIL`）的值编辑中，`Enter` 不创建新值节点，而是向下逃逸到父级导航（`onNavigateOut('down')`）。

### 新节点落位规则

- 若当前节点已展开且有子节点：`Enter` 新建为第一个子节点（index=0）。
- 否则：新建为当前节点后一个同级节点。
- 创建采用乐观更新，随后异步持久化；失败时回滚。

### Tab / Shift+Tab（编辑节点）

- `Tab`：缩进到前一个兄弟节点之下。
- `Shift+Tab`：提升到父节点之后（成为祖父节点的子节点）。
- 引用节点不允许缩进/反缩进（避免 ownership 冲突）。

### ArrowUp / ArrowDown（编辑节点）

- 下拉打开时：优先在下拉中移动高亮项。
- 否则：
  - 光标在行首 + ArrowUp：跳到上一可见节点
  - 光标在行尾 + ArrowDown：跳到下一可见节点
- 当位于边界且提供 `onNavigateOut` 时，向外层上下文逃逸（用于字段值 mini outliner）。

### Backspace（编辑节点）

- 非空内容：
  - 光标在行首（且无 #/@/slash 下拉）：与上一内容节点合并（保留 marks + inlineRefs），当前节点删除
  - 其他位置：交给编辑器默认行为
- 空内容：
  - 若是引用项：仅移除引用关系（不删除原节点）
  - 否则：`trashNode()`
- 删除后焦点跳到上一可见节点；若不存在则清空焦点。

### Mod+Shift+Arrow（编辑节点）

- `Mod+Shift+ArrowUp`：同级上移。
- `Mod+Shift+ArrowDown`：同级下移。
- 本质是父节点 `children[]` 重排（乐观更新 + 可回滚）。

### TrailingInput（空行输入器）

- 始终位于当前层级末尾；用于快速连续创建节点。
- `Enter`：
  - 有内容：创建子节点并转焦新节点
  - 空内容：也会创建空节点，保证连续输入流
- `Tab/Shift+Tab` 不立即建节点，只改变“下一个 Enter 的目标层级”（`effectiveParentId/effectiveDepth`）。
- `Backspace` 空内容：
  - 若做过层级偏移，先回到原层级
  - 否则聚焦到上一个可见节点；若父节点无子项则折叠并聚焦父节点
- `Blur` 有内容会自动提交，避免输入丢失。

### 缩进线交互

- 节点展开后，左侧缩进引导线可点击。
- 点击行为：切换该节点“所有直接子节点”的展开状态（全开/全关）。

## 当前状态

- [x] Enter 行尾创建下一节点
- [x] Enter 行中拆分节点
- [x] Tab/Shift+Tab 缩进体系（含边界保护）
- [x] 上下键跨可见节点导航
- [x] 空 Backspace 删除节点并回退焦点
- [x] Mod+Shift+Arrow 同级重排
- [x] TrailingInput 深度偏移 + Blur 自动提交
- [x] 结构节点跳过（不参与内容导航）
- [x] content/trailing 共享 intent 决策层（`row-interactions`，含 trailing onUpdate 触发）

## 相关实现文件

- `src/components/outliner/OutlinerItem.tsx`
- `src/components/outliner/OutlinerView.tsx`
- `src/components/editor/NodeEditor.tsx`
- `src/components/editor/TrailingInput.tsx`
- `src/lib/editor-html.ts`
- `src/lib/row-interactions.ts`
- `src/lib/drag-drop-position.ts`
- `src/lib/tree-utils.ts`
- `src/stores/node-store.ts`
- `src/stores/ui-store.ts`

## 相关文档

- `docs/features/keyboard-shortcuts.md`
- `docs/features/editor-triggers.md`
