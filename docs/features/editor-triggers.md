# Feature: 编辑器触发符（`#` / `@` / `>`）

> Phase 1 | 三种触发符已实现；`?` 与 `/` 仍在规划

## 概述

Nodex 当前在编辑器里支持三类即时触发符：

- `#`：标签选择（TagSelector）
- `@`：引用选择（ReferenceSelector）
- `>`：字段创建（Field Trigger）

触发符同时支持两条输入路径：

- 节点编辑器（`NodeEditor` + TipTap 插件扩展）
- 尾部输入器（`TrailingInput`，用 onUpdate 直接处理）

## 触发矩阵（当前实现）

| 触发符 | NodeEditor | TrailingInput | 当前状态 |
|------|------|------|------|
| `#` | `HashTagExtension` 识别 `#query`，弹 TagSelector | 输入单个 `#` 时先建子节点，再通过 `triggerHint` 打开 TagSelector | ✅ |
| `@` | `ReferenceExtension` 识别 `@query`，弹 ReferenceSelector | 输入单个 `@` 时先建子节点，再通过 `triggerHint` 打开 ReferenceSelector | ✅ |
| `>` | `FieldTriggerExtension` 在空行首位 fire-once | 输入单个 `>` 直接创建 unnamed field，不保留中间节点 | ✅ |
| `?` | 无 | 无 | ❌（见 `search.md`） |
| `/` | 无 | 无 | ❌（见 `slash-command.md`） |

## 行为规格

### `#` 标签触发

- 正则：`/#(\\w*)$/`（匹配光标前末尾 hashtag）。
- 为避免聚焦时误触，插件要求“本次 mount 后至少发生一次 docChanged”才激活。
- 激活后支持：
  - `Enter` 选择当前项
  - `ArrowUp/Down` 切换高亮
  - `Esc` 关闭
  - `Mod+Enter` 强制创建新标签
- 选择/创建后会清理输入中的 `#query` 文本，再应用标签。

### `@` 引用触发

- 正则：`/@([^\\s]*)$/`（比 `#` 更宽，允许更多字符）。
- 同样采用“有真实编辑后才可激活”的保护逻辑。
- 激活后支持：
  - `Enter` 选择当前项
  - `ArrowUp/Down` 切换高亮
  - `Esc` 关闭
  - `Mod+Enter` 强制创建新引用目标节点
- 选择行为分两种：
  - 纯 `@query` 空节点场景：进入“引用转换”流程（临时节点 + inlineRef 内容，可继续输入文本）
  - 行内 `@query` 场景：插入 inline reference node

### `>` 字段触发

- 仅在空行首位输入 `>` 时触发（fire-once）。
- NodeEditor 路径：
  - 在当前节点后插入 unnamed field tuple
  - 删除当前触发节点
  - 自动进入字段名编辑态
- TrailingInput 路径：
  - 直接在 `effectiveParentId` 下创建 unnamed field
  - 不创建中间内容节点
  - 自动进入字段名编辑态

## TrailingInput 的触发兼容策略

TrailingInput 没有挂 `HashTagExtension` / `ReferenceExtension` / `FieldTriggerExtension`，而是用 `onUpdate` 做“单字符触发”：

- 文本恰好为 `>`：立即字段创建
- 文本恰好为 `#` 或 `@`：
  - 先创建一个子节点（内容为该字符）
  - 写入 `uiStore.triggerHint`
  - 聚焦新节点，由 OutlinerItem 在 mount/focus 时读取 hint 打开对应下拉

对应判定逻辑已下沉为纯函数：`src/lib/row-interactions.ts#resolveTrailingRowUpdateAction`。

该策略保证了 TrailingInput 与普通编辑节点在交互上保持一致。

## 键盘优先级

在 NodeEditor 中，键盘处理顺序为：

1. 若引用/标签下拉打开，`Enter/Arrow/Escape/Mod+Enter` 优先交给下拉
2. 否则执行 Outliner 编辑语义（拆分、创建、导航、删除等）

在 TrailingInput 中：

1. 若 Options 下拉打开，`Enter/Arrow/Escape` 优先处理 options
2. 否则执行提交/导航语义

## 当前状态

- [x] `#` 标签触发（编辑器 + TrailingInput）
- [x] `@` 引用触发（编辑器 + TrailingInput）
- [x] `>` 字段触发（编辑器 + TrailingInput）
- [x] 下拉键盘转发（Enter/Arrow/Escape/Mod+Enter）
- [x] `triggerHint` 桥接机制
- [ ] `?` 搜索节点触发
- [ ] `/` 命令面板触发

## 相关实现文件

- `src/components/editor/HashTagExtension.ts`
- `src/components/editor/ReferenceExtension.ts`
- `src/components/editor/FieldTriggerExtension.ts`
- `src/components/editor/NodeEditor.tsx`
- `src/components/editor/TrailingInput.tsx`
- `src/lib/row-interactions.ts`
- `src/lib/editor-html.ts`
- `src/components/outliner/OutlinerItem.tsx`
- `src/stores/ui-store.ts`

## 自动化测试映射

- `tests/vitest/trailing-input-actions.test.ts`
  - TrailingInput `onUpdate` 触发决策（`>` / `#` / `@` / options open-close）
- `tests/vitest/trailing-input-navigation.test.ts`
  - TrailingInput `Backspace/Arrow/Escape` 分支决策（纯函数）
- `tests/vitest/editor-html.test.ts`
  - TipTap 内容包裹/去壳归一化（`stripWrappingP` / `wrapInP`）
- `tests/vitest/node-editor-shortcuts.test.ts`
  - NodeEditor 触发符相关键盘分支决策（Enter/Arrow/Escape/Mod+Enter）

## 相关文档

- `docs/features/keyboard-shortcuts.md`
- `docs/features/outliner-interactions.md`
