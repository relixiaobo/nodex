# Feature: Slash Command Menu

> Phase 1 | 规格更新于 2026-02-15（以评审截图为 UI/功能基线）

## 概述

Slash Command 是在编辑器内输入 `/` 后出现的命令菜单，用于快速执行节点内操作。  
本功能与 Cmd+K 共存：

- `/`：当前节点上下文命令（就地操作）
- `Cmd+K`：全局搜索与导航

本次规格统一为“**先完整呈现菜单信息架构，再逐项点亮功能**”：

- 菜单项顺序固定，和评审截图一致
- 已实现能力可点击执行
- 未实现能力保留在对应位置，灰色禁用

## 当前实现状态

| 层次 | 状态 |
|------|------|
| TipTap 触发扩展模式（可复用 `#/@/>`） | ✅ |
| SlashCommandExtension | ❌ |
| Slash 菜单 UI | ❌ |
| 命令注册（含 enabled/disabled） | ❌ |

## 行为规格

### 触发与关闭

1. 在编辑器中输入 `/`，打开 Slash 菜单
2. 菜单跟随光标下方展开（与 `#` / `@` 下拉一致）
3. 持续输入，按关键词过滤命令
4. 无匹配时显示 `No results`
5. 以下情况关闭菜单：
   - 光标离开当前触发上下文
   - 删除 `/`（Backspace）
   - 按 `Escape`

### 键盘导航

| 按键 | 行为 |
|------|------|
| `↑` / `↓` | 在可用项之间移动高亮 |
| `Enter` | 执行高亮命令（仅可用项） |
| `Escape` | 关闭菜单，保留已输入文本 |
| 继续输入 | 实时过滤 |

说明：禁用项不参与确认执行；键盘导航应跳过禁用项。

## 命令列表（基线顺序）

> 下表顺序必须与 UI 一致，不按分类重排。

| 顺序 | 命令 | 快捷提示 | 状态 | 行为 |
|------|------|----------|------|------|
| 1 | Paste | `⌘V` | 🟡 禁用 | 占位，灰色不可点击 |
| 2 | Search node | — | 🟡 禁用 | 占位，灰色不可点击（待 Search Node UI） |
| 3 | Field | `>` | ✅ 可用 | 等价 `>` 触发（新增字段） |
| 4 | Reference | `@` | ✅ 可用 | 等价 `@` 触发（引用节点） |
| 5 | Image / file | — | 🟡 禁用 | 占位，灰色不可点击 |
| 6 | Heading | `!` | 🟡 禁用 | 占位，灰色不可点击 |
| 7 | Checkbox | `⌘↩` | ✅ 可用 | 等价 `Cmd+Enter`（为节点启用/切换 checkbox 状态） |
| 8 | Checklist | — | 🟡 禁用 | 占位，灰色不可点击 |
| 9 | Start live transcription | — | 🟡 禁用 | 占位，灰色不可点击 |
| 10 | More commands | `⌘K` | ✅ 可用 | 打开 Cmd+K CommandPalette |

## 菜单 UI（结构）

```text
┌─────────────────────────────────────────┐
│ Paste                              ⌘V  │
│ Search node                            │
│ Field                               >  │
│ Reference                           @  │
│ Image / file                           │
│ Heading                             !  │
│ Checkbox                          ⌘↩   │
│ Checklist                              │
│ Start live transcription               │
│ More commands                      ⌘K  │
└─────────────────────────────────────────┘
```

视觉规则：

- 菜单宽度对齐现有下拉（约 240px）
- 可用项：正常前景色 + hover/highlight
- 禁用项：灰色（如 `text-foreground-tertiary` + `opacity-50`），`cursor-not-allowed`
- 禁用项不可点击，需带 `aria-disabled="true"`

## 实现考量

### 复用现有触发扩展模式

可直接复用 `HashTagExtension` / `ReferenceExtension` / `FieldTriggerExtension` 的结构：

```text
SlashCommandExtension.ts
  ├── ProseMirror Plugin 监听 doc/selection 变化
  ├── 匹配光标前 /query
  ├── onActivate(query, from, to)
  └── onDeactivate()
```

建议匹配规则：

- `/` 在行内任意位置触发
- 仅匹配“光标前最后一个 `/query` 片段”
- 执行命令前，先删除该触发片段（`/query`）

### 命令注册建议

```ts
interface SlashCommand {
  id: string;
  name: string;
  shortcutHint?: string;
  keywords: string[];
  enabled: boolean;
  run: () => void;
}
```

`enabled=false` 的命令也参与渲染（保持布局稳定），但不执行。

命令实现约束：

- 与编辑器已有能力重复的 Slash 命令必须复用现有逻辑，不单独开发一套新流程
- `Checkbox` 命令复用 `Cmd+Enter` 同一逻辑（节点 checkbox 三态/二态切换规则保持一致）

## 实现范围

### Phase 1（本次）

| 功能 | 优先级 |
|------|--------|
| SlashCommandExtension | 高 |
| Slash 菜单 UI（顺序与样式对齐基线） | 高 |
| 可用命令：Field / Reference / Checkbox / More commands | 高 |
| 禁用占位命令渲染（其余 6 项） | 高 |

### 后续点亮（非本次）

| 命令 | 依赖 |
|------|------|
| Search node | Search Node UI（`docs/features/search.md`） |
| Heading / Checklist | 对应样式与交互规则 |
| Image / file | 上传与存储流程 |
| Paste | 剪贴板内容类型与插入策略 |
| Start live transcription | 语音转写能力 |

## 决策记录

| 日期 | 决策 | 原因 |
|------|------|------|
| 2026-02-15 | Slash 菜单以评审截图为基线 | 先统一产品预期，减少实现偏差 |
| 2026-02-15 | 未实现命令先灰置禁用而非移除 | 保持信息架构稳定，便于逐项点亮 |
| 2026-02-15 | `/` 与 `Cmd+K` 分工并存 | 局部编辑命令与全局导航职责不同 |
