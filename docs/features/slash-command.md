# Feature: Slash Command Menu

> Phase 1 | 未实现

## 概述

Slash Command 是输入 `/` 后弹出的命令菜单，提供快速插入内容、转换节点类型等操作。这是 Nodex 特有功能（Tana 使用 Cmd+K 命令面板而非 `/` 触发），与 Notion / Coda 的 slash command 模式对齐。

与已有的触发符体系对称：

| 触发符 | 功能 | 状态 |
|--------|------|------|
| `#` | 应用标签 | ✅ |
| `@` | 插入引用 | ✅ |
| `>` | 添加字段 | ✅ |
| `?` | 创建搜索节点 | 📋 已规划 |
| `/` | **命令菜单** | 📋 本文档 |

## 当前实现状态

| 层次 | 状态 |
|------|------|
| TipTap 触发扩展模式 | ✅ 已有 `#`/`@`/`>` 的成熟模式可复用 |
| SlashCommandExtension | ❌ |
| 命令菜单 UI | ❌ |
| 命令定义与注册 | ❌ |

## 行为规格

### 触发与显示

1. 用户在编辑器中输入 `/` → 弹出命令菜单
2. 菜单出现在光标下方，向下展开（与 `#`/`@` 下拉一致）
3. 继续输入文字 → 实时过滤命令列表（模糊匹配命令名）
4. 无匹配时显示 "No results"
5. 空格或光标离开 → 关闭菜单

### 键盘导航

| 按键 | 行为 |
|------|------|
| `↑` / `↓` | 在命令列表中移动高亮 |
| `Enter` | 执行高亮命令 |
| `Escape` | 关闭菜单，保留已输入文字 |
| 继续输入 | 过滤命令列表 |
| `Backspace` 删除 `/` | 关闭菜单 |

### 命令列表

#### Phase 1 命令

| 命令 | 图标 | 说明 | 执行行为 |
|------|------|------|----------|
| **Heading** | `Heading` | 转为标题样式 | 当前节点 name 添加 `<strong>` 包裹（Tana 标题 = 加粗节点） |
| **Code block** | `Code` | 转为代码块 | 当前节点转为 `_docType: 'codeblock'` |
| **Horizontal rule** | `Minus` | 插入分隔线 | 在当前节点后插入分隔线节点 |
| **Date** | `Calendar` | 插入日期引用 | 插入 `<span data-inlineref-date>` |
| **Search node** | `Search` | 创建搜索节点 | 等价于 `?` 触发（`_docType: 'search'`） |
| **Reference** | `AtSign` | 插入节点引用 | 等价于 `@` 触发 |
| **Tag** | `Hash` | 应用标签 | 等价于 `#` 触发 |
| **Field** | `ChevronRight` | 添加字段 | 等价于 `>` 触发 |

#### 延后命令

| 命令 | 依赖 |
|------|------|
| Image | 图片上传（Phase 3） |
| Table view | 视图系统（Phase 3） |
| AI Chat | AI 功能（Phase 3） |
| Web clip | 网页剪藏（Phase 3） |

### 菜单 UI

```
┌──────────────────────────────┐
│ 🔍 Filter commands...       │  ← 输入的 `/` 后文字作为过滤词
├──────────────────────────────┤
│ INSERT                       │  ← 分类标题（灰色小字）
│  ⊙ Reference    @mention     │
│  # Tag          #supertag    │
│  > Field        add field    │
│  🔍 Search node              │
│  📅 Date                     │
├──────────────────────────────┤
│ CONVERT                      │
│  B  Heading                  │
│  <> Code block               │
│  ── Horizontal rule          │
└──────────────────────────────┘
```

- 分类：INSERT（插入内容） / CONVERT（转换类型）
- 每项：图标 + 命令名 + 可选描述（灰色）
- 高亮项：`bg-accent` 背景
- 最大高度：8 项可见，超出滚动
- 宽度：240px（与 `#`/`@` 下拉一致）

## 实现考量

### 复用现有扩展模式

已有三个 TipTap 触发扩展（`HashTagExtension`、`ReferenceExtension`、`FieldTriggerExtension`）提供了成熟的模式：

```
SlashCommandExtension.ts
  ├── ProseMirror Plugin 监听文档变化
  ├── 检测光标前 /query 模式
  ├── onActivate(query, from, to) 回调
  └── NodeEditor 管理下拉状态
```

与 `#`/`@` 不同的是：
- `/` 在行内**任意位置**触发（不限于行首）
- 匹配正则：`/[^\s/]*$`（`/` 后跟非空白非 `/`）
- 执行命令后**删除 `/` 及过滤文字**（replace from-to 范围）

### 命令注册

```typescript
interface SlashCommand {
  id: string;
  name: string;          // 显示名
  keywords: string[];    // 搜索别名（如 "hr" → Horizontal rule）
  icon: LucideIcon;
  category: 'insert' | 'convert';
  execute: (editor: Editor, nodeId: string, parentId: string) => void;
}
```

命令列表定义在独立文件中（如 `slash-commands.ts`），方便扩展。

### 与 Cmd+K 的关系

| 特性 | `/` Slash Command | `Cmd+K` CommandPalette |
|------|-------------------|------------------------|
| 触发方式 | 编辑器内输入 | 全局快捷键 |
| 作用范围 | 当前编辑中的节点 | 全局搜索 + 导航 |
| 命令类型 | 节点内操作（插入/转换） | 全局操作（搜索/导航/切换） |
| 位置 | 光标下方内联 | 屏幕中央弹窗 |

两者互补，不冲突。

## 实现范围

### Phase 1（本次）

| 功能 | 优先级 |
|------|--------|
| SlashCommandExtension（TipTap 扩展） | 高 |
| 命令菜单 UI（过滤 + 键盘导航） | 高 |
| 基础命令（Reference/Tag/Field/Search 快捷入口） | 高 |
| Heading / Code block 转换 | 中 |
| Date 插入 | 中 |
| Horizontal rule | 低 |

### 延后

| 功能 | 原因 |
|------|------|
| Image / Table / AI 相关命令 | 依赖 Phase 3 功能 |
| 自定义命令（用户定义 slash command） | Phase 5 |
| 命令分组折叠 | 命令数量少时不需要 |

## 与 Tana 的已知差异

| 差异 | Tana | Nodex 决策 |
|------|------|-----------|
| 命令触发 | Cmd+K 全局命令面板 | `/` 编辑器内命令 + Cmd+K 全局搜索，两者共存 |
| 触发位置 | 无 `/` 触发 | 行内任意位置输入 `/` |
| 设计参考 | — | 对齐 Notion / Coda 的 slash command 交互模式 |

## 决策记录

| 日期 | 决策 | 原因 |
|------|------|------|
| 2026-02-14 | `/` 作为命令触发符 | 与 Notion/Coda 一致的用户心智模型；与 #/@/>/?  形成完整触发符体系 |
| 2026-02-14 | 独立于 Cmd+K，不合并 | 两者作用域不同：`/` = 节点内操作，Cmd+K = 全局导航 |
| 2026-02-14 | Phase 1 只做基础命令 | 覆盖高频操作，高级命令随对应功能实现后逐步添加 |
| 2026-02-14 | 复用 TipTap 触发扩展模式 | 已有 #/@/> 三个成熟实现，架构一致性 |
