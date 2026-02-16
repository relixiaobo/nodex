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
| nodex-cc-2 | Supertags + Fields 增强（#20+#21 批次） | _(待创建)_ | node-store.ts, field-utils.ts, tag-colors.ts |
| nodex-codex | 文本格式化补齐（#46+#48 Heading） | _(待创建，codex/text-formatting)_ | NodeEditor.tsx, FloatingToolbar.tsx(新), main.css |

---

## 进行中

### Supertags + Fields 增强批次（#20 + #21）

- **Owner**: nodex-cc-2
- **Branch**: _(待创建，cc2/supertags-fields-enhance)_
- **Files**: node-store.ts, field-utils.ts, tag-colors.ts, system-nodes.ts, FieldValueOutliner 相关
- **Spec**: `docs/features/supertags.md` + `docs/features/fields.md`
- **Progress**:
  - [ ] **Default Child Supertag** — SYS_A14 config 字段实现
    - tagDef 配置页已有 placeholder（`control: 'tag_picker'`），需接通 tag picker 选择 + 存储
    - `createNode` 时检查父节点标签的 SYS_A14 配置，自动 `applyTag` 到新节点
  - [ ] **Color Swatch Selector** — 预置 10 色色板 + Swatch UI
    - 当前状态：`control: 'color_picker'` 已注册但无渲染组件；颜色来自 `getTagColor()` 确定性哈希
    - **设计约束**：预置 10 色（含 1 个灰色），不开放自由取色。色值对齐设计系统
    - 灰色用途：系统预置 supertag（SYS_T*）统一显示为灰色
    - 需要：新增 `NDX_D*` Color 数据类型（不复用 Options）+ 色板 Swatch 选择器组件（10 个圆点/方块）
    - 用户选择后存入 SYS_A11 Tuple value（值 = 色板索引或色值标识）
    - `getTagColor()` 改为：有 SYS_A11 配置 → 用配置值；无配置 → fallback 到哈希
    - TagBadge / BulletChevron / NodePicker 三处颜色源统一
  - [ ] **Options from Supertag** — SYS_D05 字段类型
    - attrDef 配置页 Field type 下拉新增 "Options from supertag" 选项
    - 新增 SYS_A06 (SOURCE_SUPERTAG) 配置 → tag picker 选择来源标签
    - OptionsPicker 查询逻辑改造：从"预定义 Options 列表"扩展到"搜索所有打了指定标签的节点"
- **迭代日志**:
  - [2026-02-16 nodex] 创建任务。承接 PR #54 的 config field 上下文，三个子项可按顺序独立提交。

### 文本格式化补齐（#46 Floating Toolbar + #48 Heading）

- **Owner**: nodex-codex
- **Branch**: _(待创建，codex/text-formatting)_
- **Files**: NodeEditor.tsx, FloatingToolbar.tsx(新), SlashCommandMenu.tsx, slash-commands.ts, main.css
- **Spec**: `docs/features/floating-toolbar.md` + `docs/features/slash-command.md`
- **核心认知**：Heading 是一种**文本格式 mark**（跟 Bold/Italic/Highlight/Strikethrough 同级），不是结构性 HTML 标题。实现为 TipTap mark extension。
- **Progress**:
  - [ ] **Heading mark 实现** — TipTap mark extension（加粗+加大显示）
    - 当前状态：StarterKit 中 `heading: false` 已禁用。Slash command 菜单已有 `heading` 占位（`enabled: false`）
    - 实现：新增自定义 mark（非 StarterKit heading），渲染为视觉上加粗/加大的文本
    - 点亮 slash command `/heading`（从禁用改为可用）
  - [ ] **Floating Toolbar 组件** — TipTap BubbleMenu 选中文本后浮动工具栏
    - 安装 `@tiptap/extension-bubble-menu`
    - FloatingToolbar 组件：6 格式按钮（B / I / S / Code / H / Link）+ toggle 状态
    - 集成到 NodeEditor 作为子组件
    - 视觉样式：`bg-popover` + `border` + `shadow-md` + `rounded-lg`，按钮 `h-7 w-7`
  - [ ] **Link 编辑弹窗** — 点击链接按钮原地展开 URL 输入
    - 选区无链接：展开 URL 输入框 → Enter 确认
    - 选区有链接：预填 URL + 修改 + 移除链接按钮
  - [ ] **Slash command `/heading` 点亮** — 从禁用改为可用
    - 执行行为：为当前选中文本或整行 toggle heading mark
- **迭代日志**:
  - [2026-02-16 nodex] 创建任务。Heading 是文本格式 mark（与 Bold 同级），不是结构性标题。Floating Toolbar 和 Slash Heading 是同一领域（文本格式化），合并为一个任务。

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
- [ ] Default Child Supertag（新增子节点自动继承指定标签）→ **进行中 nodex-cc-2**
- [ ] Color picker（真实色板 swatches，目前只有继承）→ **进行中 nodex-cc-2**
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

- [ ] Options from Supertag（特定标签的节点作为选项源）→ **进行中 nodex-cc-2**
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

#### Floating Toolbar (#46) → **进行中 nodex-codex**

- [ ] TipTap BubbleMenu 集成
- [ ] 格式按钮（Bold / Italic / Code / Highlight / Strikethrough / Heading）
- [ ] Link 编辑弹窗
- [ ] @ Reference 按钮
- [ ] # Tag 按钮
- **Spec**: `docs/features/floating-toolbar.md`

#### Slash Command — 后续命令点亮 (#48)
> 基线已合并（PR #42）。已完成：SlashCommandExtension + 菜单 UI + Field / Reference / Checkbox / More commands

- [ ] Heading（文本格式 mark）→ **进行中 nodex-codex**
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
