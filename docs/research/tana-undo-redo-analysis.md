# Tana Undo/Redo 调研分析

> 调研日期: 2026-02-23
> 目的: 了解 Tana 及竞品的 undo/redo 覆盖范围，为 Nodex 统一 undo 设计提供参考

---

## 1. Tana 当前 Undo/Redo 状态

### 快捷键

- Undo: `⌘Z` (Mac) / `Ctrl+Z` (PC)
- Redo: `⌘⇧Z` (Mac) / `Ctrl+⇧Z` (PC)

### 已知覆盖的操作

| 操作 | 可撤销 | 来源 |
|------|--------|------|
| 文本编辑（打字、删除字符、格式化） | 是 | 基础编辑功能 |
| 缩进 / 反缩进 (Tab / Shift+Tab) | 是（推测） | Outline editor 基础操作 |
| 上移 / 下移节点 (⌘⇧↑/↓) | 是（推测） | Outline editor 基础操作 |

### 已知**不可**撤销的操作（用户投诉）

来源: [Ability to undo supertag removals (Tana Ideas #154)](https://ideas.tana.inc/posts/154-ability-to-undo-supertag-removals)

| 操作 | 可撤销 | 用户反馈 |
|------|--------|----------|
| Supertag 添加 | **否** | 用户明确报告 |
| Supertag 移除 | **否** | 用户明确报告，误删 supertag 后无法恢复 |
| 节点添加 | **否** | 用户报告 |
| 节点删除 | **否** | 用户报告 |
| Inline reference 添加/删除 | **否** | 用户报告 |

### 核心设计问题

Tana 存在隐式的"文本编辑模式"和"结构操作模式"区分：

> "undo/redo should always affect 'last user's action performed', not 'last user's action from the mode where undo is applicable' which sometimes is not the last one user performed."
> — Artem Ushanov, Tana Ideas #154

用户的核心不满：⌘Z 只能撤销"文本编辑"，结构性操作（标签、节点增删、引用）不在 undo 栈中。这导致用户必须手动到 Trash 恢复误删节点，或手动重新添加误删的 supertag。

### Tana Ideas 投票

- [#154 Ability to undo supertag removals](https://ideas.tana.inc/posts/154-ability-to-undo-supertag-removals) — 用户要求统一 undo
- [#155 Improved undo/redo commands](https://ideas.tana.inc/posts/155-improved-undoredo-commands) — 用户要求改进

用户引用 Workflowy 和 Roam 作为更好的参考实现。

## 2. 竞品对比

### Workflowy

来源: [Meet your new friends: Undo & Redo (Workflowy Blog)](https://blog.workflowy.com/meet-your-new-friends-undo-redo/)

**统一 undo 栈**，覆盖所有操作：

| 操作 | 可撤销 |
|------|--------|
| 文本编辑（打字、删除） | 是 |
| 格式化（Bold / Italic / Underline） | 是 |
| 缩进 / 反缩进 (indent / outdent) | 是 |
| 上移 / 下移 (move up / move down) | 是 |
| 添加节点 | 是 |
| 删除节点 | 是 |
| 完成标记 (complete) | 是 |
| 复制 (duplicate) | 是 |
| 添加 note | 是 |
| 镜像 (mirror) | 是 |
| 链接 (copy link / link selected text) | 是 |
| 鼠标拖拽移动 | 是 |

Workflowy 的 undo 是**用户感知的统一时间线**——无论什么操作，⌘Z 总是回退"上一步"。

### Roam Research

来源: [The single biggest problem with Roam: Undo/Redo (Roam Forum)](https://forum.roamresearch.com/t/the-single-biggest-problem-with-roam-undo-redo/754), [GitHub Issue #488](https://github.com/Roam-Research/issues/issues/488)

Roam 的 undo/redo 被用户评为"最大的问题"：

- 使用数据库级 undo 栈（非页面级）
- 多用户场景下会撤销他人操作
- 撤销若干步后随机失效
- 跨页面操作时 undo 行为不可预期

**教训**: 数据库级统一栈在协作场景下问题严重，需要 per-peer undo。

## 3. Nodex 当前实现

### 三层撤销栈（已实现）

| 层次 | 实现 | 覆盖操作 |
|------|------|----------|
| 文本编辑 | ProseMirror History | 打字、删除字符、格式化（Bold/Italic/Code/Highlight/Strikethrough/Heading） |
| 结构操作 | Loro UndoManager | createChild、moveNodeTo、indentNode、outdentNode、moveNodeUp、moveNodeDown、trashNode、restoreNode |
| 导航 | navUndoStack | navigateTo 面板导航 |

### 优先级穿透

```
⌘Z → ProseMirror（编辑器聚焦时）→ Loro UndoManager → navUndo
```

### 未覆盖的操作

| 操作 | 当前状态 |
|------|----------|
| applyTag / removeTag | 不可撤销 |
| 字段值编辑 | 不可撤销 |
| checkbox 切换 | 不可撤销 |
| 展开 / 折叠 | 不记录（设计决策） |
| 拖拽排序 | 已覆盖（moveNodeTo） |
| 节点名编辑（LoroText） | ProseMirror History 覆盖（编辑器聚焦时），失焦后不可撤销 |

### Loro UndoManager 能力

- **已支持统一栈**: Loro UndoManager 天然跟踪 LoroDoc 上的所有 commit，包括 LoroText 变更和 LoroTree 操作
- **mergeInterval**: 控制连续操作合并为一步的时间窗口（当前 500ms）
- **groupStart/groupEnd**: 可显式将多步操作合并为一步 undo
- **excludeOriginPrefixes**: 排除特定 origin 的提交（如种子数据）
- **per-peer undo**: 协作场景下只撤销本地操作，不影响远端
- **cursor 变换**: 可跟踪光标位置随 undo/redo 变化

## 4. 差距总结

| 维度 | Tana（问题） | Workflowy（标杆） | Nodex（当前） |
|------|-------------|------------------|--------------|
| undo 模型 | 多模式分离，结构操作不可撤销 | 统一时间线 | 三栈穿透，部分覆盖 |
| 标签操作 | 不可撤销 | N/A（无标签） | 不可撤销 |
| 节点增删 | 不可撤销 | 可撤销 | 可撤销（Loro） |
| 缩进/移动 | 推测可撤销 | 可撤销 | 可撤销（Loro） |
| 展开/折叠 | 未知 | 未知 | 不记录 |
| 导航 | 无 undo（有 Back 按钮） | 无 undo | 有 navUndo |

**核心差距**: Nodex 相比 Tana 已经领先（结构操作可撤销），但 applyTag/removeTag/字段/checkbox 还不在 undo 栈中。目标是达到 Workflowy 水平的统一体验。

## 5. 参考资料

- [Tana Ideas #154 — Ability to undo supertag removals](https://ideas.tana.inc/posts/154-ability-to-undo-supertag-removals)
- [Tana Ideas #155 — Improved undo/redo commands](https://ideas.tana.inc/posts/155-improved-undoredo-commands)
- [Workflowy Blog — Meet your new friends: Undo & Redo](https://blog.workflowy.com/meet-your-new-friends-undo-redo/)
- [Roam Forum — The single biggest problem with Roam: Undo/Redo](https://forum.roamresearch.com/t/the-single-biggest-problem-with-roam-undo-redo/754)
- [Roam GitHub Issue #488 — usability fixes for undo/redo](https://github.com/Roam-Research/issues/issues/488)
- [Loro Undo Documentation](https://loro.dev/docs/advanced/undo)
- [Tana Navigation Docs](https://tana.inc/docs/navigation)
- [Tana Outline Editor Docs](https://tana.inc/docs/outline-editor)
