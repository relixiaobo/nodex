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
| nodex-cc | Loro CRDT 迁移 Phase 1 | `cc/loro-migration-phase1` | `node-store.ts`, `node.ts`, `system-nodes.ts` |
| nodex-cc-2 | _(idle — PR #61 merged)_ | — | — |
| nodex-codex | _(idle)_ | — | — |

---

## 进行中

#### Loro CRDT 迁移 Phase 1 — 本地数据引擎 + 数据模型原生化 + 命名统一
> **详细方案**: `docs/plans/loro-migration-phase1.md`
> **Owner**: nodex-cc
> **分支**: `cc/loro-migration-phase1`
> **锁定文件**: `node-store.ts`、`node.ts`、`system-nodes.ts`

三位一体迁移：Loro CRDT 引擎 + 消除 Firebase 时代间接层 + 全局命名重构。纯本地，不含网络同步。

**三个维度**:
1. **存储引擎**: Loro (`LoroTree` + `LoroMap` + `LoroList`) 替换 Zustand entities + Supabase
2. **数据模型原生化**: 消除 meta Tuple、`_ownerId`、`workspaceId`、`version` 等间接层，标签/配置直接存 LoroMap 属性
3. **命名统一**: 扁平化 `props`、去 `_` 前缀、`DocType→NodeType`、`tuple→fieldEntry`、`attrDef→fieldDef`、`_done→completedAt` 等

**实施步骤**:
- [x] Step 0: 安装 `loro-crdt`，验证 WASM 加载 + 冷启动时间
- [x] Step 1: 类型系统重构（新 NodexNode 接口 + NodeType + FIELD_TYPES + SYSTEM_TAGS）
- [x] Step 2: 实现 `loro-doc.ts`（Loro 单例 + ID 映射 + 树操作 + tags LoroList + toNodexNode）
- [x] Step 3: 重构 `node-store.ts`（去 Supabase，底层改 Loro，applyTag 简化）
  - [x] 3a: 基础读写（替换 entities map）
  - [x] 3b: 树操作（createChild/moveNodeTo/trashNode 等；修复 moveNodeTo 循环检测 + 同父索引调整）
  - [x] 3c: Tag/Field 操作（applyTag 写 node.tags + 创建 fieldEntry 子节点）
  - [x] 3d: 内容编辑
- [x] Step 4: 种子数据重写（Loro API + 新命名 + 无 meta Tuple）
- [x] Step 5: Hooks + 工具函数适配（use-node-tags 读 node.tags，checkbox-utils 简化）
- [x] Step 6: 组件层全局替换（40+ 文件 `props.xxx` → `xxx`，TypeScript 编译器引导）
- [x] Step 7: 测试 + 清理（14 个失败测试全部重写，全部 436 tests / 55 files 通过）

**验收标准** ✅:
- ✅ `npm run typecheck` 通过（0 错误）
- ✅ `npm run check:test-sync` 通过
- ✅ `npm run test:run` 通过（436/436 tests）
- ✅ `npm run build` 通过（已添加 vite-plugin-wasm）
- ⏳ standalone 交互验证 + IndexedDB 持久化（待 PR review 后验证）

**Phase 2（后续）**: 同步层 + LoroText 替换 name+marks+inlineRefs + createdBy/updatedBy 复活

迭代日志:
- [2026-02-20 nodex-cc] Step 0 完成：npm install loro-crdt@1.10.6，Node.js 环境冷启动 0.03ms，7 项验证全通过（LoroTree CRUD、LoroList tags、树移动、快照持久化、循环检测）。关键 API 确认：setContainer 需传实例 `new LoroList()` 而非字符串；getOrCreateContainer 是幂等写法；MV3 CSP 已配置 `wasm-unsafe-eval`。浏览器 WASM 加载耗时预计 50-100ms，在 App 初始化时预加载可隐藏。
- [2026-02-20 nodex-cc] Phase 1 完成：Steps 1-7 全部实现。436 vitest tests 全通过，typecheck 0 错误，build 成功。关键完成项：loro-doc.ts 单例 + toNodexNode；node-store.ts 全面 Loro 化；14 个失败测试全部重写适配新 API；修复 moveNodeTo 循环检测 + 同父索引调整；vite-plugin-wasm 解决 WASM build 问题。

---

## 待办

### P0

_(Loro 迁移已移到「进行中」)_

#### BUG: Supabase Realtime echo 导致节点错乱（已被 Loro 迁移取代）
> **状态**: 不再单独修复。Loro 迁移从根本上消除此问题。`_pendingChildrenOps` 在迁移完成后移除。

---

### P1

#### Editor Bug: Enter 新建空节点后 CJK IME 组合输入异常
> 详见 `docs/issues/editor-ime-enter-empty-node.md`

- 根因：ProseMirror focus 后多条路径延迟调用 `selectionToDOM()`，重置 Chrome IME 上下文
- 已尝试 9 种外部修复方案均无法完全覆盖所有 `selectionToDOM` 路径
- 可行方案：fork `prosemirror-view` 添加 composing 守卫 / 保活 EditorView 避免重建

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
> 执行顺序 ①（"一切皆节点"系列首项，后续 Search/Views 依赖日期节点）

- [ ] 年/月/周/日节点层级（自动生成）
- [ ] Today 快捷入口（侧栏按钮 + 快捷键 Ctrl+Shift+D）
- [ ] 自然语言日期解析（@today / @next Monday / @November）
- [ ] 日记模板（#day supertag 配置）
- [ ] 日期字段链接到日节点
- **Spec**: `docs/features/date-nodes.md`

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
> 执行顺序 ②（搜索条件 = Tuple 树，依赖 #22 的日期节点做日期操作符）

- [ ] `?` 触发创建搜索节点（放大镜图标）
- [ ] 基础搜索操作符（#tag / field 值 / 文本 / 日期）
- [ ] 搜索结果实时更新（展开时执行）
- [ ] AND / OR / NOT 逻辑组合
- [ ] 关键词操作符（TODO / DONE / OVERDUE / CREATED LAST X DAYS）
- [ ] 搜索结果配合视图展示
- **Spec**: `docs/features/search.md`

#### Table View (#24)
> 执行顺序 ④（依赖 #25 的 Filter/Sort/Group 基础设施）

- [ ] 表格视图（行=节点，列=字段）
- [ ] 列宽调整、列拖拽排序
- [ ] 列计算（Sum / Avg / Median / Min / Max / Count）
- [ ] 单元格内直接编辑字段值
- **Spec**: `docs/features/views.md`

#### Filter / Group / Sort 工具栏 (#25)
> 执行顺序 ③（视图基础设施，Filter/Sort/Group = ViewDef 的 Tuple，所有视图共用）

- [ ] 通用视图工具栏（适用于所有视图）
- [ ] 按字段值过滤
- [ ] 按字段值分组（Outline / Cards / List 视图）
- [ ] 多级排序（升序/降序、堆叠排序条件）
- **Spec**: `docs/features/views.md`

#### Cards View (#26)
> 执行顺序 ⑤（依赖 #25 的 Filter/Sort/Group 基础设施）

- [ ] 卡片视图
- [ ] 卡片间拖拽更新字段值
- [ ] Banner 图片显示
- **Spec**: `docs/features/views.md`

#### Calendar View (#27)
> 执行顺序 ⑥（依赖 #22 的日期节点 + #25 的视图基础设施）

- [ ] 日历视图（按日期字段排列节点）
- [ ] 日/周/月粒度切换
- [ ] 拖拽未排期节点到日历添加日期
- **Spec**: `docs/features/views.md`

#### List & Tabs View (#28)
> 执行顺序 ⑦（依赖 #25 的视图基础设施）

- [ ] List 视图（左侧列表 + 右侧详情双面板）
- [ ] Tabs 视图（顶部 tab 切换内容）
- **Spec**: `docs/features/views.md`

#### 性能基线测量
> 已延迟：等数据模型简化完成后再测量（原始目的"编辑器迁移对比"已过期，重构后重新建立基线更有意义）
> **产出**: `docs/research/performance-baseline.md`

#### Floating Toolbar (#46)
> Phase 1 已完成（PR #55）：BubbleMenu + 7 格式按钮 + Link 原地编辑 + Heading mark

- [x] TipTap BubbleMenu 集成 ✓ PR #55
- [x] 格式按钮（Bold / Italic / Code / Highlight / Strikethrough / Heading） ✓ PR #55
- [x] Link 编辑弹窗 ✓ PR #55
- [x] **BUG: BubbleMenu 无限渲染循环 — 选中文字后浮动工具栏不出现** ✓ PR #57
  - 根因：BubbleMenu 插件内部 transaction/updateOptions 与外部显示门控逻辑互相反馈
  - 已修复：移除 BubbleMenu，改为自管理 Portal 浮层（selection/focus/mouseup 驱动 + `coordsAtPos` 定位）
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

#### Editor 粘贴增强（结构化粘贴）
> 来源：Editor 迁移验收备注（Phase 2.9），本轮先保持当前纯文本粘贴行为

- [ ] 多行纯文本粘贴：按行拆分为多个节点（而不是单节点空格拼接）
- [ ] Markdown 列表粘贴：根据缩进/列表层级重建节点树
- [ ] 富文本粘贴：保留基础结构语义（段落/列表/强调）并映射到 `text + marks + inlineRefs`
- [ ] 与撤销/重做集成：一次粘贴可完整撤销
- **Spec**: `docs/features/editor-migration.md`（待补充“结构化粘贴”小节）

---

## 已完成

| 日期 | 任务 | Agent | PR |
|------|------|-------|-----|
| 2026-02-19 | Editor Bug: 首次点击行尾空白光标落到开头 | nodex | — |
| 2026-02-19 | 数据模型简化：消除 Metanode + AssociatedData (Phase 0-3) | nodex-cc | #60 |
| 2026-02-19 | 用户认证 — Google OAuth 登录 + Supabase Auth | nodex-cc-2 | #61 |
| 2026-02-18 | Editor 迁移 TipTap → ProseMirror（Phase 1-4 + text+marks 数据模型 + 交互修复 30+ 轮）| nodex-codex | #58 |
| 2026-02-17 | Floating Toolbar BUG 修复 — 移除 BubbleMenu，改为自管理 Portal 浮层 | nodex-codex | #57 |
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
