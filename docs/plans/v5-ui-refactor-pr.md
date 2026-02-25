# PR: v5.0 UI Refactor — Clean Paper & Invisible Outline

> antigravity 创建 Draft PR 时直接复制下方内容作为 body。

---

## Summary

设计系统从 v1.0（Liquid Glass + 荧光紫赛博风）迁移到 v5.0（Clean Paper & Invisible Outline）。

**核心变更**：
- 底色从冷白 `#FAFAFA` → 暖纸色 `#F5F4EE`
- 三功能色体系：Sage Green `#5E8E65` / Warm Amber `#E1A15E` / Brick Red `#AA5048`（提取自同一灵感图）
- 墨色三级：`#1A1A1A` / `#666666` / `#999999`
- 大纲正文 13px → 15px，行高 21px → 24px
- 零 Z 深度（移除所有阴影，浮层改用边框）
- Tag 排印化（纯文本着色，移除色块 badge）
- 字重简化为 400/500 二级
- 圆角简化为三级：0 / Container(8/12px) / Pill

**设计规范**：`docs/design-system.md`（已更新至 v5.0）

## Phase 1: Token 迁移（main.css）

完成后 ~70% UI 自动跟随变色。

- [ ] Background `#FAFAFA` → `#F5F4EE`
- [ ] Foreground 三级：`#0F0F12` → `#1A1A1A`、`#6B6B80` → `#666666`、`#A0A0B0` → `#999999`
- [ ] Primary 全家族：`#8B5CF6` → `#5E8E65`（含 hover `#4D7A54` / muted `rgba(94,142,101,0.08)` / ring）
- [ ] 新增 Secondary 全家族：`--secondary: #E1A15E` / `--secondary-hover: #CC8D4E` / `--secondary-muted: rgba(225,161,94,0.12)` / `--secondary-foreground: #1A1A1A`
- [ ] Destructive：`#E11D48` → `#AA5048`，新增 `--destructive-hover: #8E3F38` / `--destructive-muted: rgba(170,80,72,0.08)`
- [ ] Warning `#D97706` → `#A07830`、Success `#0D9488` → `#5E8E65`、新增 `--info: #5A8AB5`
- [ ] Border 三级：`0.04` → `0.06`、`0.08` → `0.10`、`0.15` → `0.18`
- [ ] Selection：`rgba(139,92,246,0.08)` → `rgba(94,142,101,0.07)`、`#E8E0FA` → `rgba(94,142,101,0.15)`
- [ ] 清理废弃 token（`muted` / `card` / `popover` / `surface-raised` / `surface-overlay` 精简或移除）
- [ ] 统一 opacity 写法（~47 处散落的 `foreground/5` / `/[0.05]` / `/[0.06]` → 统一为 `foreground/4`）
- [ ] `typecheck` ✅ / `vitest` ✅ / `build` ✅

## Phase 2: 内联硬编码色值

绕过 CSS 变量的颜色引用，涉及 6-8 个文件。

- [ ] `tag-colors.ts`：整套 Tag 10 色替换为 v5.0 低饱和色板（纯文本色，移除 bg 值）

  | # | 名称 | 色值 |
  |---|------|------|
  | 0 | Faded Violet | `#7B6B8D` |
  | 1 | Brick Rose | `#9B6E6E` |
  | 2 | Slate Blue | `#5E7A92` |
  | 3 | Olive | `#697A4D` |
  | 4 | Ochre | `#8A7142` |
  | 5 | Deep Indigo | `#515C96` |
  | 6 | Smoke Rose | `#8E5E70` |
  | 7 | Dark Teal | `#4D7A7A` |
  | 8 | Rust Orange | `#8E6242` |
  | 9 | Charcoal | `#616161` |

- [ ] `DatePicker.tsx`：`rgba(139,92,246,...)` 热力图色阶 → 基于 `#5E8E65` 的新色阶；`TEAL_SOLID` / `PURPLE_SOLID` → v5.0 功能色
- [ ] `main.css`：mark 高亮 `rgba(250,204,21,0.4)` → `rgba(200,170,80,0.25)`
- [ ] `main.css`：inline ref 选中态蓝色 `rgba(147,197,253,...)` → primary green
- [ ] `TagBadge.tsx:128`：`hover:bg-black/[0.06]` → `hover:bg-foreground/[0.06]`
- [ ] `typecheck` ✅ / `vitest` ✅ / `build` ✅

## Phase 3: 阴影移除（零 Z 深度）

13+ 处浮层组件，`shadow-lg` → 移除，确认 `border-border` 存在。

- [ ] 移除 `shadow-lg`：TagSelector / SlashCommandMenu / TagBadge tooltip / TrailingInput / FloatingToolbar / FieldNameInput / ToolbarUserMenu / ReferenceSelector / DatePicker / NodePicker / OutlinerItem / FieldValueOutliner / DateNavigationBar
- [ ] 移除 `App.tsx:175` 内联 `boxShadow: '0 4px 12px rgba(0,0,0,0.08)'`
- [ ] 逐个确认浮层有 `border-border`，缺的补上
- [ ] `typecheck` ✅ / `vitest` ✅ / `build` ✅

---

> **Phase 1-3 合并为本 PR。Phase 4-6 各开独立 PR。**

---

## Phase 4: 排版更新（独立 PR）

字号 + 字重变化影响布局，需仔细验证。

- [ ] 大纲正文 `text-sm` → `text-base`（**仅** OutlinerItem 节点正文 / NodeEditor / TrailingInput）
- [ ] `font-bold` → `font-medium`：NodeHeader 标题 / Breadcrumb / LoginScreen logo
- [ ] `font-semibold` → `font-medium`：NodeHeader 编辑器 / 面板标题
- [ ] ⚠️ **不改**的 `text-sm`：Dropdown 项、字段标签、辅助信息、CommandPalette 项、Tag 文本
- [ ] ⚠️ **不改**的 `font-bold`：Tag badge `#` 符号（BulletChevron / NodePicker，保留 600 用于小字号辨识度）
- [ ] `typecheck` ✅ / `vitest` ✅ / `build` ✅

## Phase 5: 大纲几何 — 行高 + 容器（独立 PR）

⚠️ **高风险**：OutlinerItem.tsx 是核心文件，行高变化影响拖拽/选中/缩进所有计算。

- [ ] `h-7`(28px) → 24px：BulletChevron / DragHandle / OutlinerItem 行容器 / FieldRow / FieldValueOutliner / TrailingInput
- [ ] `min-h-7` → `min-h-6`：OutlinerItem / BacklinksSection / NodeHeader / OutlinerView
- [ ] ⚠️ **不改**的 `h-7`：DatePicker 按钮 / FloatingToolbar 按钮 / ToolbarUserMenu 头像（独立 UI，保持 28px）
- [ ] 按钮圆角 `rounded-md` → `rounded-full`（pill）
- [ ] 新增 `--radius-pill: 9999px` 到 main.css @theme
- [ ] `typecheck` ✅ / `vitest` ✅ / `build` ✅

## Phase 6: Tag Badge 重构 — 排印化（独立 PR）

Tag 从色块 badge 改为纯文本着色。

- [ ] `TagBadge.tsx`：移除 `bg-[var(--tag-bg)]`，保留 `color: var(--tag-text)`
- [ ] `BulletChevron.tsx:62`：tag badge 移除内联 `backgroundColor`
- [ ] `NodePicker.tsx:26,225`：tag badge 移除内联 bg
- [ ] Tag 文本前缀 `#` 添加（Ink-Tertiary 色 `#999999`）
- [ ] `tag-colors.ts` 简化：移除 `bg` 字段，只保留 `text` 色值（Phase 2 已替换色板）
- [ ] `typecheck` ✅ / `vitest` ✅ / `build` ✅

## 验证分工

| 角色 | 验证方式 |
|------|---------|
| antigravity | `typecheck` → `vitest` → `build`（每个 Phase 完成后） |
| nodex（主仓库） | Chrome 扩展视觉验证（`npm run dev` → Side Panel 截图比对） |

## 注意事项

- **高风险文件**（同一时间只有一个 Agent 改）：`node-store.ts`、`OutlinerItem.tsx`、`system-nodes.ts`
- Phase 5 改 OutlinerItem 前先 `git stash` 保存，如果白屏立即回退
- `main.css` @theme 块是 Phase 1 唯一修改点，完成后大部分组件自动变色
- Tag 10 色的色值已在 `docs/design-system.md` §2 确定，直接使用
- `--color-accent`（shadcn hover 背景）不要映射为 primary green，保持中性 hover 效果

## Test plan

- [ ] Phase 1 后：打开 Side Panel，确认整体色调从冷紫变为暖绿/纸色
- [ ] Phase 2 后：打开日历，确认热力图色阶从紫色变为绿色；Tag 颜色为低饱和新色板
- [ ] Phase 3 后：打开任意 Dropdown/Popover，确认无阴影、有细边框
- [ ] Phase 4 后：打开大纲，确认正文字号明显增大（13→15px），标题不再粗体
- [ ] Phase 5 后：确认大纲行高变化后拖拽、选中、缩进线对齐正常
- [ ] Phase 6 后：确认 Tag 显示为纯文本（无背景色块），`#` 前缀为浅灰色
