# Issues

> 纯文本 issue 跟踪，方便多 agent 协作。
> Bug 格式：详细描述（现象、已尝试方案、根因分析、相关代码）。
> Feature 格式：待办清单 + 相关文档。

---

## Open Bugs

### #49 Cmd+Enter 在编辑器内无法切换 Checkbox 状态

**现象**: 在节点编辑器中按 Cmd+Enter 期望触发 checkbox 三态循环（无→未完成→已完成→无），但实际不生效（可能插入换行或无响应）。点击 checkbox 本身可以正常 toggle。

**预期**: Cmd+Enter 在编辑器聚焦状态下应切换 checkbox 状态，与点击 checkbox 行为一致（仅操作方式不同）。

**已尝试方案**:

| # | 方案 | 结果 |
|---|------|------|
| 1 | `resolveNodeEditorForceCreateIntent` 返回 `toggle_done`，outlinerKeymap 调用 `onToggleDone` | 未生效 |
| 2 | StarterKit `hardBreak: false` 禁用 Mod-Enter → `<br>` 拦截 | 未生效 |

**相关代码**:
- `src/components/editor/NodeEditor.tsx` — `outlinerKeymap` 的 `KEY_EDITOR_DROPDOWN_FORCE_CREATE` handler（L362-378）
- `src/lib/node-editor-shortcuts.ts` — `resolveNodeEditorForceCreateIntent` 返回 `'toggle_done'`
- `src/components/outliner/OutlinerItem.tsx` — `handleCycleCheckbox` → `cycleNodeCheckbox`
- `src/stores/node-store.ts` — `cycleNodeCheckbox` action

**可能根因**: Mod-Enter 在 TipTap 中可能被更早的 keymap（如 StarterKit 其他扩展）或浏览器默认行为拦截，导致 outlinerKeymap handler 未执行。需进一步排查 ProseMirror keymap 优先级链。

**调试方向**:
1. 在 `KEY_EDITOR_DROPDOWN_FORCE_CREATE` handler 入口加 `console.log` 确认是否被调用
2. 检查 TipTap keymap 注册顺序（extensions 数组中 StarterKit vs outlinerKeymap）
3. 检查 `Mod-Enter` 在 Mac 上是否被系统快捷键拦截（系统偏好设置）
4. 验证 `getPrimaryShortcutKey('editor.dropdown_force_create', 'Mod-Enter')` 返回值是否正确

---

## Closed Bugs

| # | 标题 | 关闭日期 |
|---|------|----------|
| 43 | Field name 末尾 Enter 不应切换建议字段；父节点末尾为 field 时需保留空白输入行 | 2026-02-14 |
| 42 | Field name 按 Enter 创建的节点层级错误 + 无焦点 | 2026-02-14 |
| 41 | Node Description 编辑：高度跳动 + Ctrl+I 快捷键不生效 | 2026-02-14 |
| 18 | 无 child node 的节点展开后 backspace 应删除空子节点并收起 | 2026-02-13 |
| 17 | 在子节点中 @ 创建对兄弟节点的 reference 时出错 | 2026-02-13 |
| 16 | 聚焦末尾含 # 或 @ 的 node 时不应触发菜单 | 2026-02-13 |
| 15 | 光标移动到 inline code 内部时光标消失 | 2026-02-13 |
| 14 | 长文本 node 失去焦点时文本布局宽度变窄 | 2026-02-13 |
| 13 | #tag 与所在行文本的垂直居中对齐 | 2026-02-13 |
| 12 | @ 创建 reference node 后光标在末尾继续输入应转换为 inline reference | 2026-02-13 |
| 11 | reference node → ArrowRight → 输入文本 → 可逆转换为 inline reference | 2026-02-13 |
| 10 | 检查所有 outliner 部分逻辑一致性 | 2026-02-13 |
| 9 | field node 的 _ownerId 应指向创建它的 tuple 而非 Schema | 2026-02-13 |
| 8 | options type field 的 value 也应支持完整 outliner 操作 | 2026-02-13 |
| 7 | Field 各类型的配置项需要检查是否多余或不合适 | 2026-02-13 |
| 6 | 带行内引用的节点进入编辑模式后行内引用变成 Untitled | 2026-02-13 |
| 5 | 新建空 node 不应显示 untitled 暗文本 | 2026-02-13 |
| 4 | node reference 在原节点编辑时没有实时更新 | 2026-02-13 |
| 3 | 后续进入包含 # 或 @ 的节点不应触发选择框 | 2026-02-13 |
| 2 | field node 的 value 中不能将普通节点转换为 field node | 2026-02-13 |
| 1 | 点击未聚焦节点的格式化文本时光标定位不准（9 轮迭代） | 2026-02-13 |

---

## Open Features

### #19 References 增强 — 反向链接、引用计数、合并节点

**Phase**: 1 | **前置**: MVP 已完成（@触发搜索、树引用+内联引用、引用 bullet、删除引用）

**待办**:
- [ ] 反向链接 section（节点底部显示所有引用位置 + 面包屑路径）
- [ ] 引用计数 badge
- [ ] 合并节点（选中重复节点 → 合并 children/tags，更新所有引用）

**文档**: `docs/features/references.md`

---

### #20 Supertags 完善 — Checkbox, Default Child, Color, 继承等

**Phase**: 1 | **前置**: 基础已完成（#触发、标签应用/移除、配置页、模板字段、TagBadge 右键菜单）

**待办**:
- [x] Show as Checkbox（标签开启 checkbox 行为 + Cmd+Enter toggle + done visual）— 2026-02-14
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

**文档**: `docs/features/supertags.md`

---

### #21 Fields 全类型 — Options, Date, Number, URL, Email, Checkbox 等

**Phase**: 1 | **前置**: 基础已完成（>触发、字段名编辑+自动完成、交错渲染、字段值编辑器、配置页）

**待办**:
- [x] Options 下拉选择（预设选项 + 自动收集）
- [ ] Options from Supertag（特定标签的节点作为选项源）
- [x] Date 日期选择器（Notion 风格：自定义日历 + masked input + 范围/时间）
- [x] Number 数字输入（min/max 校验）
- [x] URL 链接输入
- [x] Email 邮箱输入
- [x] Checkbox 布尔切换
- [x] 字段隐藏规则运行时（4/5 种模式 + pill click-to-reveal）
- [x] Required 字段运行时（空值时红色 * 号）
- [x] Number 字段 Min/Max 配置
- [x] 值验证（Number/URL/Email 格式 + Number min/max 范围）
- [x] 系统字段（8/12 种：Description/Created/LastEdited/Owner/Tags/Workspace/Done）
- [ ] AttrDef "Used in" 计算字段
- [ ] Auto-initialize（6 种策略）
- [ ] Pinned fields
- [ ] Merge fields

**文档**: `docs/features/fields.md`

---

### #22 Date 节点 & 日记 — 年/周/日层级、Today 入口、自然语言解析

**Phase**: 1

**待办**:
- [ ] 年/周/日节点层级（自动生成，无月层级）
- [ ] Today 快捷入口（侧栏按钮 + 快捷键 Ctrl+Shift+D）
- [ ] 日记模板（#day supertag 配置）
- [ ] 自然语言日期解析（@today / @next Monday / @November）— 延后
- [ ] 日期字段链接到日节点 — 延后

**文档**: `docs/features/date-nodes.md`

---

### #23 Search Nodes / Live Queries

**Phase**: 2

**待办**:
- [ ] `?` 触发创建搜索节点（放大镜图标）
- [ ] 基础搜索操作符（#tag / field 值 / 文本 / 日期）
- [ ] 搜索结果实时更新（展开时执行）
- [ ] AND / OR / NOT 逻辑组合
- [ ] 关键词操作符（TODO / DONE / OVERDUE / CREATED LAST X DAYS）
- [ ] 搜索结果配合视图展示

**文档**: `docs/features/search.md`

---

### #24 Table View — 表格视图

**Phase**: 2

**待办**:
- [ ] 表格视图（行=节点，列=字段）
- [ ] 列宽调整、列拖拽排序
- [ ] 列计算（Sum / Avg / Median / Min / Max / Count）
- [ ] 单元格内直接编辑字段值

**文档**: `docs/features/views.md`

---

### #25 Filter / Group / Sort 工具栏

**Phase**: 2

**待办**:
- [ ] 通用视图工具栏（适用于所有视图）
- [ ] 按字段值过滤
- [ ] 按字段值分组（Outline / Cards / List 视图）
- [ ] 多级排序（升序/降序、堆叠排序条件）

**文档**: `docs/features/views.md`

---

### #26 Cards View — 卡片视图

**Phase**: 2

**待办**:
- [ ] 卡片视图
- [ ] 卡片间拖拽更新字段值
- [ ] Banner 图片显示

**文档**: `docs/features/views.md`

---

### #27 Calendar View — 日历视图

**Phase**: 2

**待办**:
- [ ] 日历视图（按日期字段排列节点）
- [ ] 日/周/月粒度切换
- [ ] 拖拽未排期节点到日历添加日期

**文档**: `docs/features/views.md`

---

### #28 List & Tabs View

**Phase**: 2

**待办**:
- [ ] List 视图（左侧列表 + 右侧详情双面板）
- [ ] Tabs 视图（顶部 tab 切换内容）

**文档**: `docs/features/views.md`

---

### #29 AI Chat — Side Panel 内 AI 对话

**Phase**: 3

**待办**:
- [ ] Side Panel 内 AI 对话界面
- [ ] `@` 引用工作区节点作为上下文
- [ ] 多模型切换（OpenAI / Anthropic / Google）
- [ ] AI 回复应用 supertag
- [ ] 对话分支（Alt+click）

---

### #30 网页剪藏

**Phase**: 3

**待办**:
- [ ] Content Script 提取页面标题/URL/选中文本
- [ ] 一键保存到 Inbox / Today / 指定节点
- [ ] 自动打标签（根据内容类型）
- [ ] 保留源 URL 引用

**文档**: `docs/features/web-clipping.md`

---

### #31 网页 AI 辅助

**Phase**: 3

**待办**:
- [ ] 选中网页文本 → 发送给 AI 提问/摘要
- [ ] 基于当前网页内容生成笔记
- [ ] 网页内容与已有笔记关联

---

### #32 AI Command Nodes

**Phase**: 3

**待办**:
- [ ] AI 命令节点（Ask AI / Transcribe / Generate Image）
- [ ] 提示模板变量（${fieldname} / ${sys:context}）
- [ ] 批量处理（长上下文拆分）

---

### #33 AI 字段增强 — AttrDef Config 扩展

**Phase**: 3

**待办**:
- [ ] Audio-enabled field（语音输入字段）
- [ ] AI instructions（字段级 AI 提示）
- [ ] Autofill（AI 自动填充）
- [ ] AI-enhanced field（AI 增强字段）

---

### #34 Supabase 实时同步

**Phase**: 4

**待办**:
- [ ] 乐观更新 + Realtime 推送
- [ ] 冲突解决策略（last-write-wins + version check）
- [ ] 多标签页同步验证

---

### #35 离线模式增强

**Phase**: 4

**待办**:
- [ ] chrome.storage 缓存队列
- [ ] 断线检测 + 重连 + 队列化更新回放
- [ ] 离线编辑 → 上线后自动同步

---

### #36 导入/导出

**Phase**: 4

**待办**:
- [ ] Tana JSON 导入（服务层已完成，需 UI）
- [ ] Markdown 导出
- [ ] Tana Paste 格式支持

---

### #37 Command Nodes — 自动化

**Phase**: 5

**待办**:
- [ ] 命令节点（顺序执行子命令）
- [ ] 可用命令：添加标签 / 设字段 / 移动节点 / 插入日期
- [ ] 事件触发（标签添加/移除、子节点添加/移除、checkbox 切换）

---

### #38 Title Expressions — 动态标题模板

**Phase**: 5

**待办**:
- [ ] ${field name} 动态标题模板
- [ ] 条件显示 ${field|?}、截断 ${field|30...}
- [ ] 系统变量 ${cdate} / ${mdate} / ${sys:owner}

---

### #39 Publishing — 节点发布为公开网页

**Phase**: 5

**待办**:
- [ ] 节点发布为公开网页链接
- [ ] Article View（静态阅读页）
- [ ] Tana View（交互式，可展开/折叠）
- [ ] 密码保护

---

### #40 Input API — REST API 接入

**Phase**: 5

**待办**:
- [ ] REST API 接入节点数据
- [ ] 支持创建节点 / 应用标签 / 设字段
- [ ] Email-to-Nodex（通过 API 桥接）

---

### #44 节点选中 — 多选、批量操作

**Phase**: 1-2

**待办**:
- [ ] Escape 退出编辑 → 选中状态（Phase 1）
- [ ] 选中模式下 ↑/↓ 导航、Enter 回到编辑（Phase 1）
- [ ] Cmd+Click 多选（Phase 2）
- [ ] Shift+Click 范围选中（Phase 2）
- [ ] Shift+Arrow 扩展选区（Phase 2）
- [ ] 批量删除 / 缩进 / 反缩进（Phase 2）
- [ ] 鼠标拖拽框选（Phase 2，低优先）

**文档**: `docs/features/node-selection.md`

---

### #45 撤销与重做 — 节点操作撤销

**Phase**: 2

**待办**:
- [x] 文本编辑撤销（TipTap 内置）
- [x] 导航撤销（navUndoStack）
- [ ] 创建/删除节点撤销
- [ ] 缩进/反缩进/移动撤销
- [ ] 拖拽排序撤销
- [ ] Cmd+Z 三层优先级统一（文本 → 节点操作 → 导航）
- [ ] 焦点恢复
- [ ] 标签/字段操作撤销
- [ ] 批量操作撤销

**文档**: `docs/features/undo-redo.md`

---

### #47 Slash Command Menu — `/` 斜杠命令菜单

**Phase**: 1

**待办**:
- [ ] 空节点输入 `/` 触发命令菜单（TipTap Suggestion 扩展）
- [ ] 菜单项：Search node / Field / Reference / Heading / Checkbox
- [ ] 菜单项可搜索过滤（输入关键词缩小列表）
- [ ] 选中菜单项后执行对应操作（等同于 `?` `>` `@` 等触发符）
- [ ] "More commands" 入口 → 打开 CommandPalette (Cmd+K)

---

### #48 Floating Toolbar — 选中文本浮动格式工具栏

**Phase**: 1

**待办**:
- [ ] TipTap BubbleMenu 集成（选中文本时浮现）
- [ ] 格式按钮：Bold / Italic / Underline / Strikethrough / Code / Highlight / Heading
- [ ] 清除格式按钮
- [ ] @ Reference 按钮（选中文本转内联引用）
- [ ] # Tag 按钮（为当前节点添加标签）

---

### #46 用户认证 — Google 登录

**Phase**: 4（上线前必需）

**待办**:
- [ ] Supabase Auth 集成 Google OAuth
- [ ] 登录/注册 UI（Side Panel 内）
- [ ] 用户会话管理（token 刷新、登出）
- [ ] 未登录状态拦截（引导到登录页）
- [ ] 用户数据隔离（RLS 基于 auth.uid()）
