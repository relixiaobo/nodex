# Issue: 点击未聚焦节点的格式化文本时光标定位不准

> 状态: 未解决 | 优先级: 中 | 影响范围: 编辑体验

## 目标

点击任意未聚焦节点的文本（包括加粗、代码、高亮、删除线等格式化文本），光标应精确定位到点击位置，而非跳到末尾。**一次点击即可**，不需要二次点击。

## 当前表现

| 场景 | 表现 |
|------|------|
| 刷新后首次点击任意节点文本 | 光标正确定位 ✓ |
| 已聚焦节点 A → 点击节点 B 的**纯文本** | 大部分情况正确 |
| 已聚焦节点 A → 点击节点 B 的**格式化文本** | 光标跳到末尾，需再点一次 ✗ |
| 节点 B 已聚焦 → 点击 B 内格式化文本 | 正确（ProseMirror 原生处理）✓ |

## 根因分析

核心问题是**节点切换时的 blur → layout shift → caretRangeFromPoint 失准**。

### 事件时序

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

## 已尝试的方案

| # | 方案 | 结果 |
|---|------|------|
| 1 | textOffset（替代 screen coords），同步 setTextSelection | React Strict Mode 双执行覆盖光标位置 |
| 2 | clickInfoRef 缓存 textOffset 跨 Strict Mode | 格式化文本仍间歇失败 |
| 3 | rAF 延迟 setTextSelection | 间歇有效，时序不稳定 |
| 4 | 先 dispatch(tr) 设 PM selection 再 view.focus() | 完全破坏光标插入 |
| 5 | useState initializer + editor.commands.focus(pmPos) | 首次有效，切换节点时格式化文本失败 |
| 6 | mousedown 捕获 textOffset（在 blur 之前） | 改善但未完全修复 |

## 当前实现（方案 5+6 组合）

- `OutlinerItem.onMouseDown` → `caretRangeFromPoint` → 计算 textOffset → 存入 `ui-store.focusClickCoords`
- `OutlinerItem.onClick` → `setFocusedNode(nodeId, parentId)`
- `NodeEditor` mount → `useState(() => readFocusClickCoords())` → `editor.commands.focus(pmPos)`

## 可能的后续方向

1. **TipTap `autofocus` 选项**: 将 pmPos 传入 `useEditor({ autofocus: pmPos })`，让 TipTap 内部处理 focus + selection，减少手动干预
2. **mousedown 中直接记录 Range 对象**: 不转换为 textOffset，而是保存 DOM Range，click 后用 Range 信息在编辑器中定位
3. **延迟 blur 处理**: 在 handleBlur 中用 `requestAnimationFrame` 延迟 `setFocusedNode(null)`，让 click 事件先执行完再触发布局变化
4. **完全不同的架构**: 不在 blur 时卸载编辑器，改为隐藏/禁用，避免高度变化引起的布局偏移

## 相关文件

| 文件 | 职责 |
|------|------|
| `src/components/editor/NodeEditor.tsx` | 编辑器挂载、光标定位 |
| `src/components/outliner/OutlinerItem.tsx` | click/mousedown 处理、textOffset 计算 |
| `src/stores/ui-store.ts` | `focusClickCoords` 状态 |

## 相关 commit

- `4f3b42a` fix: 格式化文本点击光标定位 — 改用 textOffset 方案
- `d541b4e` fix: React Strict Mode 导致点击光标定位失效
- `99a479d` fix: 点击光标定位 — rAF 延迟 setTextSelection
- `05c4164` fix: 系统性修复点击光标定位 — dispatch+focus 消除竞态
- `a77c82b` fix: 简化点击光标定位 — useState + TipTap focus(pos)
- `2b43dc0` fix: mousedown 捕获 textOffset 避免 blur 导致的布局偏移
