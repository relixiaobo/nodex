# Issues

> 索引表 + 独立详情文件。协作规范见 `docs/AGENT-COLLABORATION.md`。
> - Bug/Feature 一行一条，详情放 `docs/issues/<number>.md`
> - 简单 bug 无需详情文件，索引表一行描述即可

---

## Open Bugs

| # | 标题 | 状态 | 负责人 | 优先级 | 创建 | 详情 |
|---|------|------|--------|--------|------|------|
| 59 | 网页正文内容抓取与保存（剪藏 V2） | 📋 待认领 | — | P2 | 02-15 | — |
| 49 | Cmd+Enter 在编辑器内无法切换 Checkbox 状态 | 📋 待认领 | — | P1 | 02-14 | [详情](issues/49.md) |

## Closed Bugs

| # | 标题 | 关闭人 | 关闭日期 | 备注 |
|---|------|--------|----------|------|
| 58 | 字段值节点 `_ownerId` 指向内容节点导致 reference 样式渲染 | nodex-cc | 02-15 | `_ownerId` 改为指向 `assocDataId` |
| 57 | `createAttrDef` 仅创建 TYPE_CHOICE tuple，配置页不完整 | nodex-cc | 02-15 | 补齐 Auto-initialize / Required / Hide field 配置 |
| 56 | Source URL 字段值未写入 `assocData.children`，UI 无法渲染 | nodex-cc | 02-15 | `setFieldValue` 同时写入 tuple 和 assocData |
| 55 | `/clip` 后节点标题空白，需移开焦点才显示 | nodex-cc | 02-15 | clip 完成后 `editor.setContent()` 主动同步 |
| 54 | Schema 空子节点 Backspace 无法删除 | claude-main | 02-15 | 回退到 TipTap，raw contentEditable 已废弃 |
| 53 | `#tag` 选中后触发词文本残留 | claude-main | 02-15 | 回退到 TipTap，raw contentEditable 已废弃 |
| 52 | `@` reference 下拉菜单导航/确认失败 | claude-main | 02-15 | 回退到 TipTap，raw contentEditable 已废弃 |
| 51 | 新建节点首次输入后需按两次 Enter 才创建下一节点 | claude-main | 02-15 | 回退到 TipTap，raw contentEditable 已废弃 |
| 50 | `#query` 选中 tag 后触发词未清理 | claude-main | 02-15 | 回退到 TipTap，raw contentEditable 已废弃 |
| 43 | Field name 末尾 Enter 不应切换建议字段；父节点末尾为 field 时需保留空白输入行 | claude-main | 02-14 |
| 42 | Field name 按 Enter 创建的节点层级错误 + 无焦点 | claude-main | 02-14 |
| 41 | Node Description 编辑：高度跳动 + Ctrl+I 快捷键不生效 | claude-main | 02-14 |
| 18 | 无 child node 的节点展开后 backspace 应删除空子节点并收起 | claude-main | 02-13 |
| 17 | 在子节点中 @ 创建对兄弟节点的 reference 时出错 | claude-main | 02-13 |
| 16 | 聚焦末尾含 # 或 @ 的 node 时不应触发菜单 | claude-main | 02-13 |
| 15 | 光标移动到 inline code 内部时光标消失 | claude-main | 02-13 |
| 14 | 长文本 node 失去焦点时文本布局宽度变窄 | claude-main | 02-13 |
| 13 | #tag 与所在行文本的垂直居中对齐 | claude-main | 02-13 |
| 12 | @ 创建 reference node 后光标在末尾继续输入应转换为 inline reference | claude-main | 02-13 |
| 11 | reference node → ArrowRight → 输入文本 → 可逆转换为 inline reference | claude-main | 02-13 |
| 10 | 检查所有 outliner 部分逻辑一致性 | claude-main | 02-13 |
| 9 | field node 的 _ownerId 应指向创建它的 tuple 而非 Schema | claude-main | 02-13 |
| 8 | options type field 的 value 也应支持完整 outliner 操作 | claude-main | 02-13 |
| 7 | Field 各类型的配置项需要检查是否多余或不合适 | claude-main | 02-13 |
| 6 | 带行内引用的节点进入编辑模式后行内引用变成 Untitled | claude-main | 02-13 |
| 5 | 新建空 node 不应显示 untitled 暗文本 | claude-main | 02-13 |
| 4 | node reference 在原节点编辑时没有实时更新 | claude-main | 02-13 |
| 3 | 后续进入包含 # 或 @ 的节点不应触发选择框 | claude-main | 02-13 |
| 2 | field node 的 value 中不能将普通节点转换为 field node | claude-main | 02-13 |
| 1 | 点击未聚焦节点的格式化文本时光标定位不准（9 轮迭代） | claude-main | 02-13 |

---

## Open Features

| # | 功能 | Phase | 状态 | 负责人 | 文档 |
|---|------|-------|------|--------|------|
| 19 | References 增强 — 反向链接、引用计数、合并节点 | 1 | 📋 待认领 | — | [references.md](features/references.md) |
| 20 | Supertags 完善 — Checkbox, Default Child, Color 等 | 1 | 🔧 进行中 | claude-main | [supertags.md](features/supertags.md) |
| 21 | Fields 全类型 — Options from Supertag 等 | 1 | 🔧 进行中 | claude-main | [fields.md](features/fields.md) |
| 22 | Date 节点 & 日记 — 年/周/日层级、Today 入口 | 1 | 📋 待认领 | — | [date-nodes.md](features/date-nodes.md) |
| 23 | Search Nodes / Live Queries | 2 | 📋 待认领 | — | [search.md](features/search.md) |
| 24 | Table View | 2 | 📋 待认领 | — | [views.md](features/views.md) |
| 25 | Filter / Group / Sort 工具栏 | 2 | 📋 待认领 | — | [views.md](features/views.md) |
| 26 | Cards View | 2 | 📋 待认领 | — | [views.md](features/views.md) |
| 27 | Calendar View | 2 | 📋 待认领 | — | [views.md](features/views.md) |
| 28 | List & Tabs View | 2 | 📋 待认领 | — | [views.md](features/views.md) |
| 29 | AI Chat — Side Panel 内 AI 对话 | 3 | 📋 待认领 | — | — |
| 30 | 网页剪藏 | 3 | 🔧 进行中 | claude-main | [web-clipping.md](features/web-clipping.md) |
| 31 | 网页 AI 辅助 | 3 | 📋 待认领 | — | — |
| 32 | AI Command Nodes | 3 | 📋 待认领 | — | — |
| 33 | AI 字段增强 — AttrDef Config 扩展 | 3 | 📋 待认领 | — | — |
| 34 | Supabase 实时同步 | 4 | 📋 待认领 | — | — |
| 35 | 离线模式增强 | 4 | 📋 待认领 | — | — |
| 36 | 导入/导出 | 4 | 📋 待认领 | — | — |
| 37 | Command Nodes — 自动化 | 5 | 📋 待认领 | — | — |
| 38 | Title Expressions — 动态标题模板 | 5 | 📋 待认领 | — | — |
| 39 | Publishing — 节点发布为公开网页 | 5 | 📋 待认领 | — | — |
| 40 | Input API — REST API 接入 | 5 | 📋 待认领 | — | — |
| 44 | 节点选中 — 多选、批量操作 | 1-2 | 📋 待认领 | — | [node-selection.md](features/node-selection.md) |
| 45 | 撤销与重做 — 节点操作撤销 | 2 | 📋 待认领 | — | [undo-redo.md](features/undo-redo.md) |
| 46 | 用户认证 — Google 登录 | 4 | 📋 待认领 | — | — |
| 47 | Slash Command Menu | 1 | 📋 待认领 | — | [slash-command.md](features/slash-command.md) |
| 48 | Floating Toolbar — 选中文本浮动格式工具栏 | 1 | 📋 待认领 | — | [floating-toolbar.md](features/floating-toolbar.md) |

### Feature 待办详情

> 以下为各 Feature 的具体子任务清单。认领 Feature 后在此更新进度。

#### #20 Supertags 完善

- [x] Show as Checkbox（标签开启 checkbox + 点击 toggle + done dimming）— 2026-02-14（⚠️ Cmd+Enter 不工作，见 #49）
- [ ] Done state mapping（checkbox ↔ Options 字段值双向映射）
- [ ] Default Child Supertag（新增子节点自动继承指定标签）
- [ ] Color picker（真实色板 swatches）
- [ ] Pinned fields（置顶显示 + filter 优先）
- [ ] Optional fields（建议按钮 + 自动降级）
- [ ] applyTag 复制 default content 中的普通节点
- [ ] Convert to supertag（普通节点快捷转 tagDef）
- [ ] 批量标签操作（多选 add/remove）
- [ ] 标签继承/Extend（子标签继承父标签模板字段）
- [ ] Title expression（${field name} 动态标题）
- [ ] 标签页（点击 supertag → 显示所有打该标签的节点列表/表格）

#### #21 Fields 全类型

- [x] Options 下拉选择（预设选项 + 自动收集）
- [ ] Options from Supertag（特定标签的节点作为选项源）
- [x] Date 日期选择器
- [x] Number 数字输入
- [x] URL 链接输入
- [x] Email 邮箱输入
- [x] Checkbox 布尔切换
- [x] 字段隐藏规则运行时（4/5 种模式 + pill click-to-reveal）
- [x] Required 字段运行时
- [x] Number 字段 Min/Max 配置
- [x] 值验证（Number/URL/Email 格式 + Number min/max 范围）
- [x] 系统字段（8/12 种）
- [ ] AttrDef "Used in" 计算字段
- [ ] Auto-initialize（6 种策略）
- [ ] Pinned fields
- [ ] Merge fields

#### #19 References 增强

- [ ] 反向链接 section
- [ ] 引用计数 badge
- [ ] 合并节点

#### #22 Date 节点 & 日记

- [ ] 年/周/日节点层级
- [ ] Today 快捷入口
- [ ] 日记模板
- [ ] 自然语言日期解析 — 延后
- [ ] 日期字段链接到日节点 — 延后

#### #30 网页剪藏

- [x] 消息类型定义 — 2026-02-14
- [x] Content Script 提取 — 2026-02-14
- [x] Background 中转 — 2026-02-14
- [x] Sidebar 剪藏按钮 — 2026-02-14（已移除，迁移至 slash command）
- [x] 提取器切换为 `defuddle`（不保留 `innerText` fallback）— 2026-02-14
- [x] `Capture Tab` 复制 `defuddle` 原始 `content` 到剪贴板（临时验收路径）— 2026-02-14
- [x] 将捕获数据保存为 Inbox 节点 — 2026-02-15
- [x] 自动打 `#web_clip` 标签（find-or-create） — 2026-02-15
- [x] Source URL 字段写入 — 2026-02-15
- [x] 剪藏结果反馈 + 导航到新节点 — 2026-02-15
- [x] `/clip` slash command 入口（就地转换当前节点，不切换页面）— 2026-02-15
- [x] Bug fix: `/clip` 后编辑器立即同步标题（#55）— 2026-02-15
- [x] Bug fix: Source URL 值写入 assocData.children（#56）— 2026-02-15
- [x] Bug fix: `createAttrDef` 完整配置 tuples（#57）— 2026-02-15
- [x] Bug fix: 字段值 `_ownerId` 指向 assocDataId（#58）— 2026-02-15
- [ ] 网页正文内容抓取与保存（#59）：提取 `defuddle` content → 转为 outliner 子节点树

#### #44 节点选中

- [ ] Escape 退出编辑 → 选中状态（Phase 1）
- [ ] 选中模式下 ↑/↓ 导航、Enter 回到编辑（Phase 1）
- [ ] Cmd+Click 多选（Phase 2）
- [ ] Shift+Click 范围选中（Phase 2）
- [ ] Shift+Arrow 扩展选区（Phase 2）
- [ ] 批量删除 / 缩进 / 反缩进（Phase 2）

#### #45 撤销与重做

- [x] 文本编辑撤销（TipTap 内置）
- [x] 导航撤销（navUndoStack）
- [ ] 创建/删除节点撤销
- [ ] 缩进/反缩进/移动撤销
- [ ] 拖拽排序撤销
- [ ] Cmd+Z 三层优先级统一
- [ ] 标签/字段操作撤销

#### #47 Slash Command Menu

- [ ] 空节点输入 `/` 触发命令菜单（交互基线对齐 2026-02-15 评审截图）
- [ ] 菜单项顺序固定：Paste / Clip Page / Search node / Field / Reference / Image / file / Heading / Checkbox / Checklist / Start live transcription / More commands
- [x] Clip Page（`/clip`）— 就地将当前节点转为网页剪藏 — 2026-02-15
- [ ] 已实现命令可点击执行：Field（等价 `>`）/ Reference（等价 `@`）/ Checkbox（等价 `Cmd+Enter`）/ More commands（打开 Cmd+K）
- [ ] 未实现命令保留在对应位置，灰色禁用（不可点击）：Paste / Search node / Image / file / Heading / Checklist / Start live transcription

#### #48 Floating Toolbar

- [ ] TipTap BubbleMenu 集成
- [ ] 格式按钮
- [ ] @ Reference 按钮
- [ ] # Tag 按钮
