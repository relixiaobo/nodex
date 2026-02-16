# Feature: Floating Toolbar

> Phase 1 | 已实现（2026-02-16）

## 概述

Floating Toolbar（浮动格式工具栏）在用户选中文本时自动出现，提供富文本格式化操作。这是 Nodex 编辑体验的核心 UI——当前所有格式化标记（Bold/Italic/Code/Highlight/Strikethrough）虽已在 TipTap 中实现，但缺少可见的 UI 入口。

## 当前实现状态

| 层次 | 状态 |
|------|------|
| 格式化标记（TipTap marks） | ✅ 全部已实现 |
| 键盘快捷键 | ⚠️ 仅 Mod-B（bold），Mod-I 被占用（description） |
| BubbleMenu 扩展 | ✅ 已安装并接入 `@tiptap/extension-bubble-menu` |
| Floating Toolbar UI | ✅ |
| Link 编辑弹窗 | ✅ |

### 已支持的标记

| 标记 | HTML | 快捷键 | 说明 |
|------|------|--------|------|
| Bold | `<strong>` | `Mod-B` | StarterKit 自带 |
| Italic | `<em>` | — | Mod-I 已被重新映射到 description 编辑 |
| Code | `<code>` | `Mod-E` | StarterKit 自带 |
| Highlight | `<mark>` | `Mod-Shift-H` | 自定义扩展 |
| Strikethrough | `<strike>` | `Mod-Shift-X` | StarterKit 自带 |
| Link | `<a href>` | — | `@tiptap/extension-link` + toolbar 内联编辑 |

## 行为规格

### 触发与定位

1. 用户在编辑器中**选中文本**（mouseup 或 Shift+方向键）→ 工具栏出现
2. 定位：选区**正上方居中**，与选区保持固定间距（8px）
3. 选区为空（光标无选中）→ 工具栏隐藏
4. 选区跨越全部文本（Cmd+A）→ 正常显示

### 工具栏布局

```
          ┌─────────────────────────────────────┐
          │  B   I   S   </>   H   T   🔗        │
          └─────────────────────────────────────┘
                        ▼ (箭头指向选区)
          ════════════selected text════════════
```

| 按钮 | 图标 | 功能 | 行为 |
|------|------|------|------|
| **B** | `Bold` | 粗体 | toggle `bold` mark |
| **I** | `Italic` | 斜体 | toggle `italic` mark |
| **S** | `Strikethrough` | 删除线 | toggle `strike` mark |
| **</>** | `Code` | 行内代码 | toggle `code` mark |
| **H** | `Highlighter` | 高亮 | toggle `highlight` mark |
| **T** | `Heading` | 标题格式 | toggle `heading` mark（加粗+加大，与 Bold 同级的文本格式） |
| **🔗** | `Link` | 链接 | 打开 Link 编辑弹窗 |

### 按钮状态

- **未激活**：`text-foreground-secondary`，hover 时 `bg-accent`
- **已激活**（选区内已有该标记）：`bg-accent text-foreground`，圆角高亮
- 点击已激活按钮 → 移除该标记（toggle 行为）

### Link 编辑

点击链接按钮后的行为：

**选区无链接时**：
1. 弹出 URL 输入框（替换格式按钮行，原地展开）
2. 输入 URL → Enter 确认 → 为选中文本添加 `<a href="URL">`
3. Escape → 取消，回到格式按钮行

**选区已有链接时**：
1. 弹出 URL 输入框，预填当前 URL
2. 可修改 URL → Enter 确认
3. 提供"移除链接"按钮

```
┌──────────────────────────────────────┐
│  🔗  https://example.com   [✓] [✕]  │
└──────────────────────────────────────┘
```

### 交互细节

| 场景 | 行为 |
|------|------|
| 点击工具栏按钮 | 执行格式化，选区保持不变，工具栏保持显示 |
| 点击工具栏外部 | 选区取消 → 工具栏消失 |
| 按 Escape | 关闭工具栏（如在 link 编辑模式，先退出编辑） |
| 拖动修改选区范围 | 按住拖拽期间不显示；`mouseup` 后再显示并定位到选区中心 |
| 双击选词 | 双击完成（第二次 `mouseup`）后显示工具栏 |
| 在不同节点间切换 | 旧工具栏消失，新选区出现新工具栏 |
| 编辑器失焦 | 工具栏消失 |

### 视觉样式

- 背景：`bg-popover`（与下拉菜单一致）
- 边框：`border border-border`
- 圆角：`rounded-lg`
- 阴影：`shadow-md`
- 按钮间距：`gap-0.5`，每个按钮 `h-7 w-7`（28px，符合 hit area 标准）
- 箭头：CSS triangle 或 `data-[side]` 伪元素指向选区

## 实现考量

### TipTap BubbleMenu

TipTap 提供 `@tiptap/extension-bubble-menu` 官方扩展：

```typescript
import BubbleMenu from '@tiptap/extension-bubble-menu';

// 在 editor extensions 中添加
BubbleMenu.configure({
  element: document.querySelector('.bubble-menu'),
  shouldShow: ({ editor, from, to }) => {
    // 有文本选区时显示
    return from !== to;
  },
});
```

也可以使用 React 组件版：

```tsx
import { BubbleMenu } from '@tiptap/react';

<BubbleMenu editor={editor} tippyOptions={{ placement: 'top' }}>
  <FloatingToolbar editor={editor} />
</BubbleMenu>
```

### NodeEditor 集成

当前 NodeEditor 是 per-node 实例（聚焦创建 / 失焦销毁）。BubbleMenu 需要：

1. 作为 NodeEditor 子组件挂载
2. editor 实例通过 props 或 context 传入
3. 销毁时自动清理（TipTap BubbleMenu 自带生命周期管理）

### 与 Side Panel 宽度适配

Side Panel 最小 300px，工具栏 7 个按钮 × 28px + 间距 ≈ 210px，宽度充足。无需响应式适配。

### Mod-I 快捷键冲突

当前 `Mod-I` 被映射到 description 编辑（在 NodeEditor keymap 中）。Floating Toolbar 提供了可视的 Italic 入口后，可以考虑：

- **保持现状**：Mod-I = description，toolbar 点击 = italic（两者不冲突）
- **重新映射**：Mod-I = italic，description 用其他快捷键

建议 Phase 1 保持现状，后续根据用户反馈调整。

## 实现范围

### Phase 1（本次）

| 功能 | 优先级 |
|------|--------|
| 安装 `@tiptap/extension-bubble-menu` | 高 |
| FloatingToolbar 组件（7 个格式按钮，含 Heading） | 高 |
| 按钮 toggle 状态（已激活高亮） | 高 |
| 集成到 NodeEditor | 高 |
| Link 编辑弹窗 | 中 |

### 延后

| 功能 | 原因 |
|------|------|
| 更多格式选项（字体大小、颜色等） | Tana 不支持，保持简洁 |
| 块级转换（转为代码块、标题等） | 与 Slash Command 功能重叠 |
| AI 辅助（选中文本 → AI 改写） | Phase 3 |

## 与 Tana 的已知差异

| 差异 | Tana | Nodex 决策 |
|------|------|-----------|
| 触发方式 | 选中文本后出现浮动工具栏 | 同 Tana |
| 格式选项 | Bold, Italic, Strikethrough, Code, Highlight, Link | 同 Tana |
| 定位 | 选区上方 | 同 Tana |
| 块级操作 | 工具栏中无块级转换 | 同 Tana，块级操作走 Slash Command |

## 决策记录

| 日期 | 决策 | 原因 |
|------|------|------|
| 2026-02-14 | 使用 TipTap BubbleMenu 官方扩展 | 官方维护，生命周期管理完善，与 TipTap 深度集成 |
| 2026-02-14 | 6 个格式按钮（B/I/S/Code/H/Link） | 对齐 Tana + 当前已支持的全部标记 |
| 2026-02-16 | 新增 Heading 按钮（7 按钮），Heading 为文本格式 mark | Heading 与 Bold/Italic 同级，非结构性 HTML 标题 |
| 2026-02-14 | Link 编辑原地展开（非新弹窗） | 减少弹窗层级，交互更紧凑 |
| 2026-02-14 | 暂不重映射 Mod-I | 保持 description 快捷键，避免用户习惯变化 |
| 2026-02-16 | FloatingToolbar Phase 1 实装完成 | BubbleMenu + 7 个格式按钮 + Link 原地编辑全部落地 |
| 2026-02-16 | pointer 选择门控：拖拽/双击期间延迟显示至 `mouseup` | 避免选区手势进行中 toolbar 抢焦点或闪现，保证双击选词可见性 |
