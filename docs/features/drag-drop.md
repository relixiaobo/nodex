# Feature: 节点拖拽排序（Drag & Drop）

> Phase 1 | 基础拖拽已实现（List/Outliner）

## 概述

当前拖拽系统用于 Outliner 中的节点重排与层级调整，目标是覆盖常见的三种放置语义：

- `before`：放到目标节点之前
- `after`：放到目标节点之后
- `inside`：放到目标节点内部（首个子节点）

## 交互模型

### 拖拽状态

由 `ui-store` 维护三元状态：

- `dragNodeId`
- `dropTargetId`
- `dropPosition`（`before` / `after` / `inside`）

### 可拖拽条件

- 行处于编辑态（focused）时不可拖拽：`draggable={!isFocused}`。
- 其他节点默认可拖拽。

### Drop 区域判定

`dragover` 时按目标行高度三等分：

- 上 1/3 => `before`
- 中 1/3 => `inside`
- 下 1/3 => `after`

> 该判定后的“实际落点决策”已提炼为纯函数 `resolveDropMove()`，便于 Vitest 覆盖与回归锁定。

## 放置规则

### before

- 调用 `moveNodeTo(dragNodeId, dropParentId, siblingIndex)`。
- 结果：被拖节点成为目标节点的前一个同级。

### after

- 默认：`moveNodeTo(dragNodeId, dropParentId, siblingIndex + 1)`。
- 特殊：若目标节点有子节点且当前已展开，`after` 会解释为“放入其内部第一个子节点”（更接近大纲使用习惯）。

### inside

- 调用 `moveNodeTo(dragNodeId, nodeId, 0)`。
- 同时强制展开目标节点，立即可见新位置。

## 安全约束

`moveNodeTo()` 层有以下保护：

- 禁止拖到自己身上（`nodeId === newParentId`）。
- 禁止拖到自己后代（沿 `_ownerId` 向上检查）。
- 同父重排时自动修正插入索引（先删后插导致索引偏移）。
- 后端持久化失败会回滚本地变更。

## 视觉反馈

- `before` / `after`：目标行上方或下方显示蓝色横线。
- `inside`：目标行高亮背景 + ring。
- 被拖拽行：透明度降低（`opacity-40`）。

## 与引用节点的关系（当前实现）

- 拖拽逻辑按 `nodeId` 操作，不区分“拥有节点视图”与“引用出现位置”。
- 当前文档仅保证普通拥有节点的拖拽语义；引用节点拖拽的精细语义需单独定义。

## 当前状态

- [x] 三态 drop（before/after/inside）
- [x] 自动展开 inside 目标
- [x] 同级与跨层移动
- [x] 防自环、防后代放置
- [x] 乐观更新 + 失败回滚
- [ ] 引用节点拖拽语义专项规范
- [ ] 自动滚动（drag 到列表边缘时）

## 相关实现文件

- `src/components/outliner/OutlinerItem.tsx`
- `src/lib/drag-drop.ts`
- `src/stores/ui-store.ts`
- `src/stores/node-store.ts`
- `tests/vitest/drag-drop-utils.test.ts`
- `tests/vitest/node-store-move-node-to.test.ts`
- `tests/vitest/ui-store-drag-state.test.ts`
