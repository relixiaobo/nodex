# Issue: 点击未聚焦节点的格式化文本时光标定位不准

> 状态: **已解决** | 优先级: 中 | 影响范围: 编辑体验

## 目标

点击任意未聚焦节点的文本（包括加粗、代码、高亮、删除线等格式化文本），光标应精确定位到点击位置，而非跳到末尾。**一次点击即可**，不需要二次点击。

## 根因分析

核心问题是**节点切换时的 blur → layout shift → caretRangeFromPoint 失准**。

### 原始事件时序（问题根源）

```
mousedown on B → focusout on A → [layout shift] → click on B
```

1. `mousedown` 在 B 上触发
2. A 的 TipTap 编辑器 `focusout` → `handleBlur` → `setFocusedNode(null)`
3. React 重渲染：A 的 NodeEditor 卸载（高度从编辑器变为静态文本）→ **B 位移**
4. `click` 触发 → `caretRangeFromPoint(e.clientX, e.clientY)` 使用原始鼠标坐标，但 B 的 DOM 已上移

### 为什么格式化文本更敏感

- 编辑器与静态文本的高度差异通常很小（几 px）
- 纯文本在小偏移下仍能命中同一字符，格式化文本（`<code>`/`<strong>` 等）边界精确，小偏移就可能命中容器外或空白区域
- `container.contains(range.startContainer)` 检查失败 → textOffset 为 null → fallback 到 `focus('end')`

## 解决方案（经 9 轮迭代）

最终方案由三个互补修复组成：

### 1. mousedown 中完成 focus 切换（消除 blur 布局偏移）

```
mousedown B → e.preventDefault() + textOffset 捕获 + setFocusedNode(B)
           → blur A 触发时 focusedNodeId=B≠A → guard 失败 → no-op
```

- `handleContentMouseDown` 调用 `e.preventDefault()` 阻止浏览器原生 focus 行为
- 直接在 mousedown 中调用 `setFocusedNode(nodeId, parentId)`，不再依赖 click
- 布局偏移从根本上消除：focus 在 mousedown 同步切换，blur 的 guard 条件检测到 focusedNodeId 已变更

### 2. rAF 延迟 blur 清除（安全网）

`handleBlur` 中 `setFocusedNode(null)` 通过 `requestAnimationFrame` 延迟一帧：
- 即使 mousedown 的 `setFocusedNode` 未及时执行，rAF 也确保 blur 在下一帧执行
- 此时新节点的 focus 已设置，guard 条件自然失败

### 3. focusClickCoords 标识匹配（防止跨节点污染）

`focusClickCoords` 包含 `{ nodeId, parentId, textOffset }`：
- NodeEditor mount 时仅消费 nodeId+parentId 匹配的数据
- 防止快速点击不同节点时，旧数据被新编辑器错误消费

## 已尝试的方案（历史记录）

| # | 方案 | 结果 |
|---|------|------|
| 1 | textOffset（替代 screen coords），同步 setTextSelection | React Strict Mode 双执行覆盖光标位置 |
| 2 | clickInfoRef 缓存 textOffset 跨 Strict Mode | 格式化文本仍间歇失败 |
| 3 | rAF 延迟 setTextSelection | 间歇有效，时序不稳定 |
| 4 | 先 dispatch(tr) 设 PM selection 再 view.focus() | 完全破坏光标插入 |
| 5 | useState initializer + editor.commands.focus(pmPos) | 首次有效，切换节点时格式化文本失败 |
| 6 | mousedown 捕获 textOffset（在 blur 之前） | 改善但未完全修复 |
| 7 | focusClickCoords 增加 nodeId+parentId 标识 | 防止跨节点数据污染 |
| 8 | rAF 延迟 blur + click fallback textOffset | 进一步改善 |
| 9 | **mousedown 中 preventDefault + setFocusedNode** | **完全修复** ✓ |

## 相关文件

| 文件 | 职责 |
|------|------|
| `src/components/editor/NodeEditor.tsx` | 编辑器挂载、光标定位 |
| `src/components/outliner/OutlinerItem.tsx` | mousedown focus 切换、textOffset 计算、rAF blur |
| `src/stores/ui-store.ts` | `focusClickCoords` 状态 |

## 相关 commit

- `4f3b42a` fix: 格式化文本点击光标定位 — 改用 textOffset 方案
- `d541b4e` fix: React Strict Mode 导致点击光标定位失效
- `99a479d` fix: 点击光标定位 — rAF 延迟 setTextSelection
- `05c4164` fix: 系统性修复点击光标定位 — dispatch+focus 消除竞态
- `a77c82b` fix: 简化点击光标定位 — useState + TipTap focus(pos)
- `2b43dc0` fix: mousedown 捕获 textOffset 避免 blur 导致的布局偏移
- `71bf78c` fix: 编辑器切换时格式化文本光标定位 — 分离 focus 和 selection
- `7277ccf` fix: focusClickCoords 增加 nodeId+parentId 标识，防止跨节点数据污染
- `208323a` fix: 点击光标定位 — mousedown 中完成 focus 切换，消除 blur 布局偏移
