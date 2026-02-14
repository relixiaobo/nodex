# Feature: Keyboard Shortcuts

> Phase 1 | 当前实现为分层绑定；本文档和 `src/lib/shortcut-registry.ts` 为权威定义

## 概述

Nodex 的快捷键当前按作用域分层实现（NodeEditor / TrailingInput / selected reference / global）。  
为避免文档与实现漂移，统一以以下两处为准：

- 定义源：`src/lib/shortcut-registry.ts`
- 说明文档：`docs/features/keyboard-shortcuts.md`（本文件）

## 作用域模型

- `node_editor`：节点编辑态（TipTap 编辑器）
- `trailing_input`：末尾空行输入器
- `selected_reference`：引用节点被单击选中（非编辑）时
- `global`：全局快捷键（非输入控件焦点）

## 快捷键总表（当前默认绑定）

### Node Editor

| ID | 按键 | 行为 | 触发条件 |
|------|------|------|------|
| `editor.enter` | `Enter` | 确认下拉项，或拆分/创建下一节点 | 编辑器聚焦 |
| `editor.indent` | `Tab` | 缩进当前节点 | 编辑器聚焦 |
| `editor.outdent` | `Shift+Tab` | 反缩进当前节点 | 编辑器聚焦 |
| `editor.backspace_empty` | `Backspace` | 空节点删除 | 节点文本为空 |
| `editor.arrow_up` | `ArrowUp` | 下拉上移或跳上一可见节点 | 编辑器聚焦 |
| `editor.arrow_down` | `ArrowDown` | 下拉下移或跳下一可见节点 | 编辑器聚焦 |
| `editor.escape` | `Escape` | 关闭 `#/@` 下拉 | 下拉打开 |
| `editor.dropdown_force_create` | `Mod+Enter` | 强制按 query 创建新项 | `#/@` 下拉打开 |
| `editor.move_up` | `Mod+Shift+ArrowUp` | 同级上移 | 编辑器聚焦 |
| `editor.move_down` | `Mod+Shift+ArrowDown` | 同级下移 | 编辑器聚焦 |
| `editor.edit_description` | `Mod+i` / `Ctrl+i` | 编辑 description | 编辑器聚焦 |

### Trailing Input

| ID | 按键 | 行为 | 触发条件 |
|------|------|------|------|
| `trailing.enter` | `Enter` | 选 option 或创建子节点 | TrailingInput 聚焦 |
| `trailing.indent_depth` | `Tab` | 增加“下一次创建”深度 | TrailingInput 聚焦 |
| `trailing.outdent_depth` | `Shift+Tab` | 减少“下一次创建”深度 | TrailingInput 聚焦 |
| `trailing.backspace` | `Backspace` | 回退深度或跳到上一个可见节点 | 当前输入为空 |
| `trailing.arrow_up` | `ArrowUp` | options 上移或上跳 | TrailingInput 聚焦 |
| `trailing.arrow_down` | `ArrowDown` | options 下移或向外逃逸 | TrailingInput 聚焦 |
| `trailing.escape` | `Escape` | 关闭 options 或失焦 | TrailingInput 聚焦 |

### Selected Reference

| ID | 按键 | 行为 | 触发条件 |
|------|------|------|------|
| `selected_ref.delete` | `Backspace` / `Delete` | 从父节点移除引用 | 引用被选中（非编辑） |
| `selected_ref.convert_arrow_right` | `ArrowRight` | 进入引用转换模式 | options 关闭 |
| `selected_ref.convert_printable` | 任意可打印字符 | 进入转换并追加字符 | options 关闭 |
| `selected_ref.options_up` | `ArrowUp` | 引用 options 高亮上移 | options 打开 |
| `selected_ref.options_down` | `ArrowDown` | 引用 options 高亮下移 | options 打开 |
| `selected_ref.options_confirm` | `Enter` | 确认引用 options 当前项 | options 打开 |
| `selected_ref.options_cancel` | `Escape` | 关闭 options 并清空选中 | options 打开 |
| `selected_ref.clear_selection` | `Escape` | 清空选中 | options 关闭 |

### Global

| ID | 按键 | 行为 | 触发条件 |
|------|------|------|------|
| `global.nav_undo` | `Mod+Z` / `Ctrl+Z` | 导航撤销 | 焦点不在 contentEditable/input/textarea |
| `global.nav_redo` | `Mod+Shift+Z` / `Ctrl+Shift+Z` | 导航重做 | 同上 |

## 冲突策略

- 同一作用域内，避免多个 ID 声明相同按键。
- 跨作用域允许同键（例如 `Enter` 在 editor 与 trailing 中均可存在）。
- 注册表提供冲突检查函数：`findShortcutConflicts()`。
- 异常冲突筛选函数：`findUnexpectedShortcutConflicts()`（会排除已声明白名单冲突）。
- 当前已知例外（有意保留）：`selected_reference` 作用域中的 `Escape`
  - `selected_ref.options_cancel`（options 打开）
  - `selected_ref.clear_selection`（options 关闭）
  - 两者条件互斥，运行时不会同时生效；测试中以“已知冲突快照”锁定，防止无意新增其他冲突。

## 平台约定

- `Mod` 表示：
  - macOS: `Cmd`
  - Windows/Linux: `Ctrl`
- 文档中出现 `Ctrl+...` 是显式兼容绑定（例如 `Ctrl+i`）。

## 当前实现说明

- 运行时绑定仍按作用域分散在：
  - `src/components/editor/NodeEditor.tsx`
  - `src/components/editor/TrailingInput.tsx`
  - `src/components/outliner/OutlinerItem.tsx`
  - `src/hooks/use-nav-undo-keyboard.ts`
- 其中 `NodeEditor`、`TrailingInput`、`use-nav-undo-keyboard` 已改为从 `src/lib/shortcut-registry.ts` 读取快捷键定义。
- `OutlinerItem` 的 selected-reference 快捷键仍是局部定义（后续可继续收敛到 registry）。

## 自动化测试映射

- `tests/vitest/shortcut-registry.test.ts`
  - registry 唯一性、scope 过滤、冲突检测、已知冲突快照
  - 已知冲突白名单过滤 + 非预期冲突探测
  - `matchesShortcutEvent` 的 `Mod/Ctrl/Meta/Shift` 匹配语义
- `tests/vitest/nav-undo-keyboard.test.ts`
  - 全局导航撤销/重做对编辑焦点的拦截保护
- `tests/vitest/selected-reference-shortcuts.test.ts`
  - selected-reference 作用域的按键动作解析（删除、转换、options 导航）
- `tests/vitest/node-editor-shortcuts.test.ts`
  - NodeEditor 的 Enter/Arrow/Escape/Mod+Enter 分支决策

## 相关文档

- `docs/features/outliner-interactions.md`
- `docs/features/editor-triggers.md`
- `docs/features/node-selection.md`
- `docs/features/undo-redo.md`

## 后续计划建议

- [x] 将 selected-reference 关键分支提炼为纯函数并接入 Outliner（`resolveSelectedReferenceShortcut`）。
- [x] `selected_reference` 的 options up/down/confirm/cancel 已改为读取 registry key list。
- [x] 开发态冲突检查：启动时执行 `findUnexpectedShortcutConflicts()` 并输出告警。
- [ ] 在 `docs/MANUAL-TEST-CHECKLIST.md` 增加“快捷键回归”章节（按 scope 分组验证）。
- [ ] 评估是否支持用户自定义键位（先做配置层，不改运行时行为）。
