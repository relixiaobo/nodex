# Editor 回归：Enter 新建空节点后中文 IME 组合输入异常

**状态**: ⏸ 已延期（已记录根因分析，待后续迭代解决）
**负责人**: 待分配
**优先级**: P1
**关联任务**: `Editor 迁移: TipTap → ProseMirror`（`codex/editor-migration`，已合入 main）

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

## 根因分析（ProseMirror 源码级）

通过深入 ProseMirror 源码确认，核心问题是 **PM 在 focus 后通过多条路径延迟调用 `selectionToDOM()`**，该函数使用 `Selection.collapse()` / `setBaseAndExtent()` 修改 DOM Selection，会重置 Chrome 的 IME 输入上下文。

### selectionToDOM 触发路径（已确认）

1. **PM focus handler** (`input.ts:780-791`)：`setTimeout(() => selectionToDOM(view), 20)` — focus 事件后 20ms 延迟调用
2. **DOMObserver.flush "browser reset" 启发式** (`domobserver.ts:219-230`)：`lastFocus > Date.now() - 200` 时自动调用 selectionToDOM
3. **DOMObserver.stop() 残留 flush** (`domobserver.ts:106-117`)：`stop()` 调度匿名 `setTimeout(() => this.flush(), 20)`，**不可取消**
4. **selectionchange → flush** (`domobserver.ts`)：浏览器 selectionchange 事件触发 flush → 可能再次 selectionToDOM

### 时序竞态

- **Click-to-edit 不受影响**：用户从鼠标切到键盘 >100ms，selectionToDOM 早已完成
- **Enter-to-edit 稳定触发**：用户在 20-50ms 内开始输入拼音，恰好与 selectionToDOM 延迟窗口重叠

### 为什么难以在外部修复

- PM 的 focus handler 可通过 `handleDOMEvents.focus` 返回 `true` 拦截
- 但 `domObserver.stop()` 调度的匿名 setTimeout 无法取消（无引用可清理）
- 即使清空 `domObserver.queue`，仍有 selectionchange → flush 路径可触发
- PM 内部无"组合输入期间跳过 selectionToDOM"的守卫机制

## 已尝试修复（摘要）

### 外部层面（1-7，已合入代码中生效）

1. IME 事件识别（`isComposing` / `Process` / `keyCode=229`）统一守卫 `isImeComposingEvent()`；
2. `selection-keyboard` / `selected-reference-shortcuts` 组合态不触发 `type_char/convert_printable`；
3. `pendingInputChar` 升级为定向 payload（`char+nodeId+parentId`）；
4. `RichTextEditor` 在 `beforeinput/compositionstart` 清理 pending；
5. Enter 创建后的异步 `setFocusedNode` 改为非抢占回补；
6. `syncInitialFocus` 改为"立即聚焦 + 非抢占 rAF 回补"；
7. `RichTextEditor` 挂载从 `useEffect` 提前到 `useLayoutEffect`。

### PM 内部层面（8-9，已尝试并回退）

8. **拦截 PM focus handler**：通过 `handleDOMEvents.focus` 返回 `true` 跳过 PM 内置 focus handler 的 `setTimeout(selectionToDOM, 20)`，手动复制必要的 focus 初始化逻辑。
   - **结果**：首字母 `n` 可进入 IME（进步），但第二个字母 `i` 仍中断组合态。
   - **原因**：`domObserver.stop()` 的匿名 `setTimeout(flush, 20)` 仍在触发 selectionToDOM。

9. **清空 domObserver mutation queue**：在 `stop()/start()` 后执行 `domObserver.queue.length = 0`，使匿名 flush 无操作。
   - **结果**：仍有相同问题。
   - **原因**：还有 selectionchange → flush 等其他触发路径，无法在外部穷举拦截。

> 结论：纯外部（wrapper 层面）修复无法覆盖 PM 所有 selectionToDOM 路径。

## 可行方案（待后续验证）

1. **ProseMirror 补丁方案**：fork `prosemirror-view`，在 `selectionToDOM` 入口处添加 `view.composing` 守卫——当 IME 组合中时跳过 DOM Selection 操作。影响面最小，但需维护 fork。
2. **保活 EditorView**：不在 blur/focus 时销毁/创建 EditorView，改为始终保活。Enter 新建节点后仅转移焦点到已存在的 EditorView，避免走 PM 完整初始化路径（含 focus handler + domObserver setup）。需要较大架构调整。
3. **延迟聚焦方案**：Enter 创建节点后等 50-100ms 再聚焦新编辑器。缺点是引入可感知的延迟。
4. **监控 compositionstart 期间强制恢复**：在 compositionstart 事件中记录 DOM Selection 状态，并在 selectionToDOM 影响后立即恢复。需要精确的事件时序控制。
