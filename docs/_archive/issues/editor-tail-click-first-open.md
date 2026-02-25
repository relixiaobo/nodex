# Editor 回归：首次点击节点行尾空白，光标落到行首

**状态**: ❌ 未修复（需接手）  
**负责人**: —（待接手）  
**优先级**: P1  
**关联任务**: `Editor 迁移: TipTap → ProseMirror`（`codex/editor-migration`）

---

## 问题描述

在**未聚焦状态**下，第一次点击普通节点文本右侧空白区域时，光标会落在行首（offset=0），而不是行尾。  
后续再次点击同一区域通常会落在行尾。

## 复现步骤

1. 确保当前没有正在编辑的节点（无闪烁光标）。
2. 选择一个有文本的普通节点。
3. 点击该节点文本后面的空白区域（行内右侧空白，不是下一行）。
4. 观察第一次点击的光标落点。

## 实际结果

- 第一次点击落在行首。  
- 后续点击大多数情况下落在行尾。

## 预期结果

- 第一次点击行尾空白即应直接落在行尾。

## 已尝试但仍失败的修复

1. `getRenderedTextRightEdge` 改为文本节点/inline-ref 边界计算；
2. `handleContentMouseDown` 增加“右侧空白 + offset=0”强制落尾兜底；
3. 增加“点击在容器右侧 1/3 且 offset=0 时强制落尾”的二次兜底。

> 截至用户最新反馈，上述改动后仍可复现。

## 建议接手排查方向

1. 对比 `mousedown` 与 `click` 时的 `clientX`、`focusClickCoords`、`resolvedOffset`；
2. 检查 `handleContentMouseDown` 与 `handleContentClick` 之间是否有覆盖/清空 `focusClickCoords`；
3. 检查 `RichTextEditor.syncInitialFocus` 中 click 坐标消费是否被后续逻辑重置；
4. 在首次点击路径增加临时日志（仅本地），确认 offset 从何处变为 0。

