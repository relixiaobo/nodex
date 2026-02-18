# Editor 回归：Enter 新建空节点后中文 IME 组合输入异常

**状态**: 🔄 处理中  
**负责人**: nodex-codex  
**优先级**: P1  
**关联任务**: `Editor 迁移: TipTap → ProseMirror`（`codex/editor-migration`）

---

## 问题描述

在普通非空节点中按 `Enter` 创建新空节点后，立即使用中文输入法输入拼音（例如 `ni`）时，组合输入会异常：

- 拼音字母可能直接落入文档（而非输入法组合态）；
- 或者组合态被中断，候选确认行为异常；
- 该问题在“刚由 Enter 创建的空节点”最稳定复现。

## 复现步骤（稳定）

1. 聚焦一个有文本的普通节点（例如 `abc`）。
2. 按 `Enter`，创建下一个空节点并将焦点移动到新节点。
3. 立即输入拼音 `ni`（建议快速连按）。
4. 观察组合输入显示与落字行为。

## 实际结果

- 新空节点中的输入法组合态不稳定，出现“拼音直接入文”或组合中断。

## 预期结果

- Enter 新建空节点后，输入法组合态应与普通稳定编辑态一致；
- `ni` 应进入 IME 组合态，确认后才写入汉字（如 `你`），不应提前写入拼音字母。

## 已确认边界

根据当前手测反馈：

- 选中模式输入：已符合预期（先取消选中，再可输入）；
- reference 选中态输入：已符合预期；
- gray trailing 输入：已符合预期；
- **仅 Enter 新建空节点后仍复现**（当前阻断点）。

## 当前技术假设

高概率是 Enter 创建节点后的焦点与编辑器挂载时序竞争导致：

1. 新节点编辑器创建与聚焦存在短窗口期；
2. IME 首个键事件落在错误编辑器或被外层键盘处理器错误消费；
3. 异步焦点回补（或一帧后的聚焦逻辑）在组合输入开始时再次干预。

## 已尝试修复（摘要）

1. IME 事件识别（`isComposing` / `Process` / `keyCode=229`）统一守卫；
2. `selection-keyboard` / `selected-reference-shortcuts` 组合态不触发 `type_char/convert_printable`；
3. `pendingInputChar` 升级为定向 payload（`char+nodeId+parentId`）；
4. `RichTextEditor` 在 `beforeinput/compositionstart` 清理 pending；
5. Enter 创建后的异步 `setFocusedNode` 改为非抢占回补；
6. `syncInitialFocus` 改为“立即聚焦 + 非抢占 rAF 回补”；
7. `RichTextEditor` 挂载从 `useEffect` 提前到 `useLayoutEffect`。

> 以上仍未彻底消除该复现路径，需继续根因定位。

## 下一步建议

1. 增加 Enter 后“首个文本输入事件”接管策略：只允许当前新节点 editor 消费；
2. 在 `RichTextEditor` 增加可开关的调试埋点（focus/blur/compositionstart/compositionend/keydown target）；
3. 对比 Enter 新建节点与普通点击聚焦节点在 0~100ms 内的事件序列差异。
