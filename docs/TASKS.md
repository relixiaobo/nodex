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
| nodex-cc | _(idle — PR #63 merged)_ | — | — |
| nodex-cc-2 | _(idle — PR #61 merged)_ | — | — |
| nodex-codex | Loro 收口 Phase 2（LoroText 主编辑链路迁移） | codex/loro-phase2-lorotext | docs/TASKS.md, src/lib/loro-doc.ts, src/components/editor/*.ts, src/components/outliner/OutlinerItem.tsx, tests/vitest/loro-*.test.ts, docs/TESTING.md |

---

## 进行中

### Refactor — Loro 收口 Phase 2：LoroText 主编辑链路迁移 (2026-02-21)
> **Owner**: nodex-codex | **Branch**: codex/loro-phase2-lorotext
> **目标**: 将主编辑读写从 `name+marks+inlineRefs` 迁移到 `LoroText` 容器，建立后续多端协同一致性基础
> **Files**: `src/lib/loro-doc.ts`, `src/components/editor/*.ts`, `src/components/outliner/OutlinerItem.tsx`, `tests/vitest/loro-*.test.ts`, `docs/TESTING.md`
> **Progress**:
> - [x] 设计并落地 LoroText <-> 当前编辑器数据桥接层
> - [x] Outliner 主编辑输入路径切换到 LoroText
> - [x] 兼容旧数据读取与惰性迁移
> - [x] 补齐回归测试并更新 `docs/TESTING.md`
> **迭代日志**:
> - [2026-02-21 nodex-codex] 任务认领，启动 Phase 2 开发
> - [2026-02-21 nodex-codex] 完成 Phase 2 第一批收口：新增 `loro-text-bridge`（TextMark/inlineRef 双向桥接），`node-store` 内容写入路径改为 legacy 字段 + `richText` 双写，`toNodexNode` 优先读 `richText`（旧字段 fallback），并补齐 `loro-text-bridge`/`loro-infra`/`node-store-content` 回归测试
> - [2026-02-21 nodex-codex] 完成主编辑创建链路补齐：`createChild` 与 `startRefConversion` 在创建节点时即时写入 `richText`，避免“首次创建无 richText 需二次编辑才迁移”；新增 `node-store-content` / `node-store-tags-refs` 断言覆盖
> - [2026-02-21 nodex-codex] 继续收口：主编辑写入停止 mirror `marks/inlineRefs` 到 legacy 节点字段（仅保留 `name` 镜像 + `richText` 真实源），并在 `setNodeRichTextContent` 统一刷新 `updatedAt`
> - [2026-02-21 nodex-codex] 继续收口：`setNodeName/setNodeNameLocal/updateNodeContent` 停止实时写 `raw name`，编辑链路仅写 `richText`（`toNodexNode` 读路径不变，仍优先 `richText`）

### Refactor — Loro 收口 Phase 1：detached guard + origin 策略 (2026-02-21)
> **Owner**: nodex-codex | **Branch**: codex/loro-phase1-guards
> **目标**: 为 Loro 主链路增加写操作安全边界与可追踪提交语义，作为 LoroText 主链路迁移前置
> **Files**: `src/lib/loro-doc.ts`, `src/stores/node-store.ts`, `tests/vitest/loro-*.test.ts`, `tests/vitest/node-store-*.test.ts`, `docs/TESTING.md`, `docs/LESSONS.md`
> **Progress**:
> - [x] detached checkout 状态下 mutation 统一 guard（禁止写）
> - [x] commit origin 规范落地（user/system/seed）
> - [x] UndoManager 过滤规则与 origin 对齐
> - [x] 补齐回归测试并更新 `docs/TESTING.md`
> **迭代日志**:
> - [2026-02-21 nodex-codex] 任务认领，按收口计划启动 Phase 1
> - [2026-02-21 nodex-codex] 完成 Phase 1：`loro-doc` 增加 detached mutation/commit guard、`commitDoc` 默认 `user:implicit`、UndoManager 统一过滤 `['__seed__','system:']`；`node-store` 为返回值 mutation 增加 detached 兜底；新增/更新 `loro-infra`、`loro-undo`、`node-store-guard-rails` 用例并同步测试文档与 LESSONS

### Bugfix — Loro 全量 Review 问题修复 (2026-02-21)
> **Owner**: nodex-codex | **Branch**: codex/loro-review-fixes
> **目标**: 修复 `docs/reviews/loro-full-review-2026-02-21.md` 中全部问题（P0/P1/P2）并补齐测试缺口
> **Files**: `src/stores/node-store.ts`, `src/components/outliner/OutlinerItem.tsx`, `src/components/outliner/OutlinerView.tsx`, `src/components/fields/FieldValueOutliner.tsx`, `src/lib/node-type-utils.ts`, `src/lib/tree-utils.ts`, `src/hooks/use-realtime.ts`, `tests/vitest/*`, `docs/TESTING.md`
> **Progress**:
> - [x] 修复引用创建误删目标节点 + 引用节点可见性
> - [x] 修复 removeTag 共享字段误删
> - [x] 修复 toggleNodeDone 多次 commit（Undo 原子性）
> - [x] 修复 Options-from-supertag 回显 + Date commit 路径
> - [x] 增加容器节点不可变守卫
> - [x] 清理废弃兼容代码（无运行路径）
> - [x] 补齐测试并更新 `docs/TESTING.md`
> **迭代日志**:
> - [2026-02-21 nodex-codex] 任务认领，创建修复分支并开始实现
> - [2026-02-21 nodex-codex] 完成修复并通过 `npm run typecheck` / `npm run test:run` / `npm run build`：修正引用转换误删目标、reference 渲染分类、removeTag 共享字段保护、toggleNodeDone 单 commit、Date 与 Options-from-supertag 值路径；新增 `node-type-utils` 与对应测试；删除无运行路径 `src/hooks/use-realtime.ts`

### 代码 Review — Loro 迁移全量 (2026-02-21)
> **Owner**: nodex-codex | **Branch**: main（只读，不修改代码）
> **目标**: 以全新视角对 `8b722f1^..HEAD`（Loro 迁移启动至今，31 commits，~80 文件）做系统 Review
> **角度**: ① 数据完整性 & 不变量 ② React 渲染正确性 ③ Loro API 使用正确性 ④ NodeType 重构完整性
> **产出**: 将发现写入 `docs/reviews/loro-full-review-2026-02-21.md`（Findings + 测试缺口清单）
> **迭代日志**:
> - [2026-02-21 nodex] 任务创建，合并 feature-sync-2026-02-20 + loro-migration 两份文档，换视角重新 Review

### 代码 Review — feature-sync-2026-02-20 ✅
> **Owner**: nodex-codex | **Branch**: main（只读，不修改代码）
> **目标**: 按 `docs/reviews/feature-sync-2026-02-20.md` 优先级清单逐文件 Review，找出 Bug / 架构问题 / 测试缺口
> **产出**: 将问题写回 `docs/reviews/feature-sync-2026-02-20.md`（Findings 段落），或直接 DM nodex
> **迭代日志**:
> - [2026-02-20 nodex] 任务创建，分配给 nodex-codex
> - [2026-02-20 nodex-codex] Review 完成，发现 6 个 Bug（P0×5, P1×1）+ 5 个测试缺口
> - [2026-02-20 nodex] 修复全部 6 个 Bug（commit ee0c83a）：applyTag/removeTag/createTagDef/createFieldDef 缺 commitDoc，outdentNode 缺容器边界守卫，toggleCheckboxField 存储值不一致

### P0 Loro 基础设施 — 7项底层API ✅
> **Owner**: nodex-cc | **Branch**: cc/loro-infra | **PR**: #63
> **迭代日志**:
> - [2026-02-20 cc] 探索 Loro API，确认全部可行，实现完成：
>   - ② subscribeNode: LoroMap.subscribe() 容器级隔离订阅，rebuildMappings 后自动重挂载
>   - ⑤ getVersionVector/exportFrom: oplogVersion + export({mode:'update',from}) 增量同步
>   - ④ getVersionHistory/checkout/checkoutToLatest: getAllChanges lamport排序 + doc.checkout
>   - ③ getNodeText/getOrCreateNodeText: LoroText Peritext marks 基础设施
>   - ① LoroMovableList评估: LoroTree.move()已是Kleppmann算法，tags保持LoroList
>   - ⑥ forkDoc: doc.fork() + merge()增量合并回主doc
>   - ⑦ Awareness: src/lib/awareness.ts 纯内存模块
> - 484 tests pass, typecheck clean, build 4.1MB

### P0 Loro 迁移后 UI 回归修复 ✅
> **Owner**: nodex | **Branch**: main（直接修复）
> **迭代日志**:
> - [2026-02-20 nodex] 修复 PR #62/#63 引入的三个 UI 回归：
>   - Bug 1: `tree-utils.ts:getAncestorChain` — 容器节点（LIBRARY 等）不加入 ancestors，面包屑缺"Library"层级
>   - Bug 2: `ConfigOutliner.tsx` — own items 循环跳过 `type==='fieldDef'` 节点，"Default content" 下模板字段（Status/Priority/Due/Done）不显示
>   - Bug 3: `use-node-fields.ts:computeFields` — tagDef/fieldDef 只生成 outliner 类型虚拟条目，非 outliner 配置字段（Color/Show as checkbox 等）不显示
>   - 同步修复 `FieldValueOutliner` + `ColorSwatchPicker` 支持虚拟 tupleId 读写节点属性（boolean/color）
>   - 485 tests pass, typecheck clean
> - [2026-02-20 nodex] 追加修复 4 个运行时回归（用户测试发现）：
>   - Bug 4: `SidebarNav.tsx` — 用 `${wsId}_${suffix}` 构造容器 ID，但 Loro 迁移后 ID 为短格式（LIBRARY 等），导致侧栏点击导航到不存在的节点（"Untitled" + 空树）
>   - Bug 5: `CommandPalette.tsx` — 同上，容器快速跳转也用了旧格式
>   - Bug 6: `Breadcrumb.tsx` — `isRootView` 未处理直接浏览容器节点的情况（workspaceRootId=null）
>   - Bug 7: `App.tsx` bootstrap — 不等待 UIStore persist hydration，stale panel ID 不被清除；同步修复 `seed-data.ts` 的 `?fresh` 清理逻辑
>   - 485 tests pass, typecheck clean

---

## 待办

### P0

#### ~~Loro 基础设施 — 7 项底层 API~~ ✅ 已完成 (PR #63)

---

### P1

#### NodePanel Header 重设计
> **Owner**: 待分配（nodex-cc）| **Spec**: `docs/features/node-panel-header.md`

统一 NodePanel 标题区布局，建立 Header → OutlinerView 连贯的三列对齐网格。

- [ ] 新建 `NodeHeader.tsx`，替换现有 `PanelTitle.tsx`
  - Icon 区块（32px，条件显示）
  - Name 行：drag handle（列A）+ checkbox（列B，条件）+ 节点名称（列C）
  - Supertag 行：TagBar，条件显示（有 tag 且非 tagDef/fieldDef）
  - Extra 行：插槽，预留 + 日期节点占位
- [ ] `NodePanel.tsx` 接入 `NodeHeader`，移除旧 PanelTitle
- [ ] `ui-store.ts` 新增 `expandedHiddenFields: Set<string>` 及 toggle action
- [ ] `OutlinerView.tsx` 顶部渲染隐藏字段占位行（`⊕ FieldName`），临时展开逻辑
- [ ] Drag handle 右键触发 context menu（替代 `...` 按钮）
- [ ] 对齐验证：drag handle 与 chevron 同列A，checkbox 与 field 图标/bullet 同列B

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
> 已完成：文本编辑撤销（ProseMirror History）、导航撤销（navUndoStack）、结构性操作撤销（Loro UndoManager）

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
| 2026-02-20 | Node 图标系统 — supertag bullet 彩色（conic-gradient）+ fieldDef 结构化图标 + 字段颜色继承 + 字段排序 | nodex | — |
| 2026-02-20 | FIELD_TYPES 大小写修复 — seed-data.ts + field-utils.test.ts 统一使用小写常量 | nodex | — |
| 2026-02-20 | Loro CRDT 迁移 Phase 1 — 本地数据引擎 + 数据模型 + 命名 + UndoManager | nodex-cc | #62 |
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
