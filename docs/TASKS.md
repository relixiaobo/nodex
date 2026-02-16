# Task Board

> 所有任务的单一事实来源。Agent 通过 `Read docs/TASKS.md` 获取全局状态。
>
> **维护规则**：
> - 用户随手记录到「收件箱」，agent 启动时处理（归类到待办或直接处理）
> - Dev agent 接到任务后，第一步编辑此文件（更新 Agent 状态 + 移动/创建任务到「进行中」）
> - 任务完成后，nodex merge PR 时移动到「已完成」
>
> **迭代日志规则**：
> - 每个「进行中」任务带 `迭代日志` 字段（追加式，不删改历史条目）
> - 格式：`[日期 agent-id] 摘要`
> - 记录：尝试了什么、为什么失败、最终选择了什么方案、关键代码位置
> - 通用经验教训（非任务特定的）沉淀到 `docs/LESSONS.md`

---

## 收件箱

用户随手记录，agent 启动时处理（归类到待办或进行中，处理完从此处删除）。

_(空)_

---

## Agent 状态

| Agent | 当前任务 | 分支 | 修改中的文件 |
|-------|---------|------|-------------|
| nodex-cc | — | — | — |
| nodex-cc-2 | — | — | — |
| nodex-codex | Floating Toolbar BUG（无限渲染循环）修复 | codex/fix-floating-toolbar-render-loop | docs/TASKS.md, src/components/editor/FloatingToolbar.tsx, tests/vitest/floating-toolbar.test.ts, docs/TESTING.md, docs/features/floating-toolbar.md |

---

## 进行中

### Floating Toolbar BUG 修复（无限渲染循环）

- **Owner**: nodex-codex
- **Branch**: `codex/fix-floating-toolbar-render-loop`
- **Files**: `docs/TASKS.md`, `src/components/editor/FloatingToolbar.tsx`, `tests/vitest/floating-toolbar.test.ts`, `docs/TESTING.md`, `docs/features/floating-toolbar.md`
- **目标**:
  1. 修复 BubbleMenu 交易循环导致的 `Maximum update depth exceeded`，恢复选中文字后的浮动工具栏显示
  2. 保持已验证的设计系统样式修复一起落地（toolbar 阴影/hover/focus、inline mark 样式）
- **Progress**:
  - [x] 确认 `FloatingToolbar.tsx` 已移除 `editor.on('transaction', ...)` 监听，仅保留 `selectionUpdate` + `blur`
  - [x] 确认 `shouldShow` / `options` 已稳定引用（`useCallback` + `useMemo`）
  - [x] 新增回归测试 `tests/vitest/floating-toolbar.test.ts`，覆盖循环渲染防回归
  - [x] 更新 `docs/TESTING.md` 覆盖映射并通过 `typecheck/check:test-sync/test:run/build`
- **迭代日志**:
  - [2026-02-16 nodex-codex] 认领任务，更新 TASKS，准备创建分支与 Draft PR。
  - [2026-02-16 nodex-codex] 确认代码中修复逻辑已在主干（去掉 transaction 监听 + 稳定 BubbleMenu props），补充 `floating-toolbar.test.ts` 回归测试并完成全量验证。
  - [2026-02-16 nodex-codex] 创建并更新 PR #57，状态已转 Ready for review。
  - [2026-02-16 nodex-codex] 修复交互细节：拖拽选中文本时延迟到 mouseup 才显示 toolbar，双击选词在 mouseup 后恢复显示；新增回归测试覆盖该行为。
  - [2026-02-16 nodex-codex] 根因修复：仅改 `shouldShow` 判断不足以触发 BubbleMenu 重新评估；改为 `isPointerSelecting` state 驱动 `shouldShow` 引用，确保 mouseup 后插件收到更新并显示。
  - [2026-02-16 nodex-codex] 继续修复：`currentEditor.isFocused` 在当前交互链路下不稳定，导致 shouldShow 常驻 false；改为 `view.hasFocus()` + `isEditable` 判定，恢复文本选中可见性。

---

## 待办

### P2

#### References 增强 (#19)
> MVP 已完成（@触发搜索、树引用+内联引用、引用 bullet、删除引用）

- [ ] 反向链接 section（节点底部显示所有引用位置 + 面包屑路径）
- [ ] 引用计数 badge
- [ ] 合并节点（选中重复节点 → 合并 children/tags，更新所有引用）
- **Spec**: `docs/features/references.md`

#### Supertags 完善 (#20)
> 基础已完成（#触发、标签应用/移除、配置页、模板字段、TagBadge 右键菜单）
> 已完成子项：Show as Checkbox、标签继承/Extend Phase 1、applyTag 复制 default content、Color 继承

- [x] Done state mapping — checkbox ↔ Options 字段值双向映射 ✓ PR #54
- [x] 统一 config field 架构（系统配置字段与用户字段共享数据模型） ✓ PR #54
- [x] BOOLEAN 数据类型 + toggle switch ✓ PR #54
- [x] Default Child Supertag（新增子节点自动继承指定标签）✓ nodex-cc-2
- [x] Color Swatch Selector（10 色预置色板 + ColorSwatchPicker + resolveTagColor）✓ nodex-cc-2
- [ ] Pinned fields（置顶显示 + filter 优先）
- [ ] Optional fields（建议按钮 + 自动降级）
- [ ] Convert to supertag（普通节点快捷转 tagDef）
- [ ] 批量标签操作（多选 add/remove）
- [ ] Title expression（`${field name}` 动态标题）
- [ ] 标签页（点击 supertag → 显示所有打该标签的节点列表/表格）
- **Spec**: `docs/features/supertags.md`

#### Fields 全类型 (#21)
> 基础已完成（>触发、字段名编辑+自动完成、交错渲染、字段值编辑器、配置页）
> 已完成子项：Options 下拉、Date 选择器、Number/URL/Email 输入、Checkbox、字段隐藏规则、Required 字段、Number Min/Max、值验证、系统字段(8/12)

- [x] Options from Supertag（特定标签的节点作为选项源）✓ PR #54 + nodex-cc-2
- [ ] AttrDef "Used in" 计算字段
- [ ] Auto-initialize（6 种策略）
- [ ] Pinned fields
- [ ] Merge fields
- **Spec**: `docs/features/fields.md`

#### Date 节点 & 日记 (#22)

- [ ] 年/月/周/日节点层级（自动生成）
- [ ] Today 快捷入口（侧栏按钮 + 快捷键 Ctrl+Shift+D）
- [ ] 自然语言日期解析（@today / @next Monday / @November）
- [ ] 日记模板（#day supertag 配置）
- [ ] 日期字段链接到日节点

#### 网页剪藏 (#30)
> 已完成：消息类型定义、Content Script 提取（defuddle）、Background 中转、Sidebar 剪藏按钮、Capture Tab 复制到剪贴板

- [ ] 将捕获数据保存为节点（Supertag Extend 已就绪）
- [ ] 自动打 web_clip 标签
- [ ] Source URL 字段写入
- [ ] 剪藏结果 Toast 反馈
- [ ] 一键保存到 Inbox / Today / 指定节点
- [ ] 保留源 URL 引用
- **Spec**: `docs/features/web-clipping.md`

#### 撤销与重做 (#44)
> 已完成：文本编辑撤销（TipTap 内置）、导航撤销（navUndoStack）

- [ ] 创建/删除节点撤销
- [ ] 缩进/反缩进/移动撤销
- [ ] 拖拽排序撤销
- [ ] Cmd+Z 三层优先级统一
- [ ] 标签/字段操作撤销
- **Spec**: `docs/features/undo-redo.md`

#### 节点选中 — 后续增强 (#47)
> Phase 1-3 已合并（PR #51）。以下为未覆盖的后续项：

- [ ] Cmd+Shift+D 批量复制
- [ ] 拖动选择优化（跨面板边界防护）
- **Spec**: `docs/features/node-selection.md`

### P3

#### Search Nodes / Live Queries (#23)

- [ ] `?` 触发创建搜索节点（放大镜图标）
- [ ] 基础搜索操作符（#tag / field 值 / 文本 / 日期）
- [ ] 搜索结果实时更新（展开时执行）
- [ ] AND / OR / NOT 逻辑组合
- [ ] 关键词操作符（TODO / DONE / OVERDUE / CREATED LAST X DAYS）
- [ ] 搜索结果配合视图展示

#### Table View (#24)

- [ ] 表格视图（行=节点，列=字段）
- [ ] 列宽调整、列拖拽排序
- [ ] 列计算（Sum / Avg / Median / Min / Max / Count）
- [ ] 单元格内直接编辑字段值

#### Filter / Group / Sort 工具栏 (#25)

- [ ] 通用视图工具栏（适用于所有视图）
- [ ] 按字段值过滤
- [ ] 按字段值分组（Outline / Cards / List 视图）
- [ ] 多级排序（升序/降序、堆叠排序条件）

#### Cards View (#26)

- [ ] 卡片视图
- [ ] 卡片间拖拽更新字段值
- [ ] Banner 图片显示

#### Calendar View (#27)

- [ ] 日历视图（按日期字段排列节点）
- [ ] 日/周/月粒度切换
- [ ] 拖拽未排期节点到日历添加日期

#### List & Tabs View (#28)

- [ ] List 视图（左侧列表 + 右侧详情双面板）
- [ ] Tabs 视图（顶部 tab 切换内容）

#### 用户认证 — Google 登录 (#45)
> 上线前必需

- [ ] Supabase Auth 配置
- [ ] Google OAuth provider 设置
- [ ] 登录/登出 UI
- [ ] 工作区绑定

#### Floating Toolbar (#46)
> Phase 1 已完成（PR #55）：BubbleMenu + 7 格式按钮 + Link 原地编辑 + Heading mark

- [x] TipTap BubbleMenu 集成 ✓ PR #55
- [x] 格式按钮（Bold / Italic / Code / Highlight / Strikethrough / Heading） ✓ PR #55
- [x] Link 编辑弹窗 ✓ PR #55
- [ ] **BUG: BubbleMenu 无限渲染循环 — 选中文字后浮动工具栏不出现**（进行中：`nodex-codex`，分支 `codex/fix-floating-toolbar-render-loop`）
  - 根因：`FloatingToolbar.tsx` 中 `editor.on('transaction', rerender)` 与 BubbleMenu 内部 `updateOptions` transaction 形成无限循环，触发数百次 "Maximum update depth exceeded" 错误，导致 BubbleMenu 组件静默崩溃
  - 修复方案（已验证可行，未提交）：
    1. 移除 `transaction` 事件监听（只保留 `selectionUpdate` + `blur`）
    2. `useCallback` 包裹 `shouldShow`，`useMemo` 包裹 `options` — 防止引用变化触发 BubbleMenu useEffect
  - 同时需合入的设计系统合规修复（已改好）：`shadow-lg`、`focus:ring-2 ring-primary/40`、`hover:bg-foreground/5`、inline mark 样式（`<s>` opacity、`<code>` border-radius、`<mark>` dark mode）
  - 涉及文件：`src/components/editor/FloatingToolbar.tsx`、`src/assets/main.css`
- [ ] @ Reference 按钮
- [ ] # Tag 按钮
- **Spec**: `docs/features/floating-toolbar.md`

#### Slash Command — 后续命令点亮 (#48)
> 基线已合并（PR #42）。已完成：SlashCommandExtension + 菜单 UI + Field / Reference / Checkbox / More commands

- [x] Heading（文本格式 mark） ✓ PR #55
- [ ] Paste（剪贴板内容类型判断）
- [ ] Search node（依赖 Search Node UI #23）
- [ ] Image / file（依赖上传与存储）
- [ ] Checklist（批量 checkbox）
- [ ] Start live transcription（语音转写）
- **Spec**: `docs/features/slash-command.md`

---

## 已完成

| 日期 | 任务 | Agent | PR |
|------|------|-------|-----|
| 2026-02-16 | Ctrl+I Description 切换修复 — registry 匹配 + 光标位置恢复 | nodex-codex | #56 |
| 2026-02-16 | Supertags + Fields 增强批次 — Default Child Supertag + Color Swatch + Options from Supertag (#20+#21) | nodex-cc-2 | main |
| 2026-02-16 | 文本格式化 — Floating Toolbar + Heading Mark + Link 编辑 (#46+#48) | nodex-codex | #55 |
| 2026-02-16 | 节点选中 UI 设计系统合规检查 + reference 修复 + drag-select 重构 (#52) | nodex-cc | #53 |
| 2026-02-16 | 统一 config field 架构 + Done state mapping + BOOLEAN 类型 (#20) | nodex-cc-2 | #54 |
| 2026-02-16 | 节点选中 Phase 1-3 — 单选/多选/批量操作/双层高亮 (#47) | nodex-cc | #51 |
| 2026-02-15 | Cmd+Enter 编辑器内切换 Checkbox (#43) | — | — |
| 2026-02-14 | Web Clipping 修复 — title sync, field value rendering, attrDef config | nodex-codex | #49 |
| 2026-02-14 | Node Description 编辑：高度跳动 + Ctrl+I 快捷键 (#41) | — | — |
| 2026-02-13 | 无 child 节点展开后 backspace 删除空子节点并收起 (#18) | — | — |
| 2026-02-13 | @ 创建 reference 对兄弟节点出错 (#17) | — | — |
| 2026-02-13 | 聚焦末尾含 # 或 @ 的 node 时不应触发菜单 (#16) | — | — |
| 2026-02-13 | 光标移动到 inline code 内部时光标消失 (#15) | — | — |
| 2026-02-13 | 长文本 node 失焦时文本布局宽度变窄 (#14) | — | — |
| 2026-02-13 | #tag 与所在行文本垂直居中对齐 (#13) | — | — |
| 2026-02-13 | @ 创建 reference 后光标继续输入应转为 inline reference (#12) | — | — |

### 已关闭的远期/非开发任务

以下 issue 在 #29-40 范围内已关闭，属远期规划或非当前迭代范围：
AI Chat (#29)、AI 网页辅助 (#31)、AI Command Nodes (#32)、AI 字段增强 (#33)、Supabase 实时同步 (#34)、离线模式增强 (#35)、导入/导出 (#36)、Command Nodes (#37)、Title Expressions (#38)、Publishing (#39)、Input API (#40)。
