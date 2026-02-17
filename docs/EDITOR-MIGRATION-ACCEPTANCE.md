# Editor 迁移验收清单

> 按 Phase 逐步验收。每个 Phase 完成后，执行对应章节的全部验收项。
> 标记规则：`[x]` 通过 / `[ ]` 未通过（附失败描述）/ `[-]` 不适用

---

## 0. 通用回归检查（每个 Phase 完成后都执行）

```bash
npm run typecheck          # 0 errors
npm run check:test-sync    # pass
npm run test:run           # 全量通过
npm run build              # 构建成功
```

- [x] `typecheck` 通过
- [x] `check:test-sync` 通过
- [x] `test:run` 全量通过
- [x] `build` 成功

---

## Phase 1: 基础设施验收

> 说明：`htmlToMarks` / `marksToHtml` 仅用于导入与迁移脚本；运行时编辑链路以 `text + marks + inlineRefs` 为准。

### 1.1 类型定义

- [x] `TextMark` 接口定义正确，包含 `start`, `end`, `type`, `attrs?` 字段
- [x] `TextMark.type` 联合类型覆盖全部 7 种: `bold | italic | strike | code | highlight | headingMark | link`
- [x] `InlineRefEntry` 接口定义正确，包含 `offset`, `targetNodeId`, `displayName?` 字段

### 1.2 htmlToMarks — HTML 解析为 marks 模型

纯文本：
- [x] `htmlToMarks('')` → `{ text: '', marks: [], inlineRefs: [] }`
- [ ] `htmlToMarks('Hello world')` → `{ text: 'Hello world', marks: [], inlineRefs: [] }`
- [x] `htmlToMarks('a &amp; b')` → text 正确解码 HTML 实体为 `a & b`

基础 marks：
- [ ] `<strong>Bold</strong>` → `[{ start: 0, end: 4, type: 'bold' }]`
- [ ] `<em>Italic</em>` → `[{ ..., type: 'italic' }]`
- [ ] `<code>Code</code>` → `[{ ..., type: 'code' }]`
- [ ] `<s>Strike</s>` → `[{ ..., type: 'strike' }]`（同时支持 `<strike>` 和 `<del>`）
- [ ] `<mark>Highlight</mark>` → `[{ ..., type: 'highlight' }]`
- [ ] `<span data-heading-mark="true">Heading</span>` → `[{ ..., type: 'headingMark' }]`
- [ ] `<a href="https://x.com">link</a>` → `[{ ..., type: 'link', attrs: { href: 'https://x.com' } }]`

嵌套 marks：
- [ ] `<strong><em>BI</em></strong>` → 两条 mark（bold + italic），range 相同
- [x] `<a href="..."><strong>bold link</strong></a>` → bold + link 两条

部分重叠：
- [ ] `<strong>AB</strong>CD` → bold 只覆盖 AB 部分

内联引用：
- [ ] `<span data-inlineref-node="abc">Name</span>` → text 中为 `\uFFFC`，inlineRefs 有一条 entry
- [x] 引用前后有文本：`See <span data-inlineref-node="abc">Ref</span> here` → text = `See \uFFFC here`，offset = 4
- [ ] 多个引用：两个 `<span data-inlineref-node>` → inlineRefs 有两条 entry，offset 分别正确

混合场景：
- [x] marks + 内联引用同时存在：`<strong>Bold</strong> <span data-inlineref-node="x">R</span>` → marks 和 inlineRefs 都正确

### 1.3 marksToHtml — marks 模型还原为 HTML

- [x] 空内容 → `''`
- [ ] 纯文本 → 原样输出（无多余标签）
- [x] 单 mark → 正确的 HTML 标签包裹
- [ ] 嵌套 marks → 标签正确嵌套（不交叉）
- [ ] link mark → `<a href="...">` 输出
- [ ] headingMark → `<span data-heading-mark="true">`
- [x] 内联引用 → `<span data-inlineref-node="..." class="inline-ref">displayName</span>`

### 1.4 往返一致性（最关键）

对以下每种 HTML 输入，验证 `marksToHtml(...htmlToMarks(input))` 输出与输入**语义等价**（标签顺序可不同，但渲染结果相同）：

- [ ] 纯文本
- [ ] 单 bold
- [ ] 嵌套 bold + italic
- [ ] link
- [ ] headingMark
- [ ] 内联引用
- [x] marks + 引用混合
- [ ] 导入样例 HTML fixtures（覆盖多层嵌套、引用与链接混合场景）

### 1.5 mergeAdjacentMarks

- [x] `[{0,3,bold}, {3,6,bold}]` → 合并为 `[{0,6,bold}]`
- [ ] `[{0,3,bold}, {3,6,italic}]` → 不合并（类型不同）
- [ ] `[{0,3,bold}, {4,6,bold}]` → 不合并（不相邻）
- [ ] link marks 的 attrs 不同时不合并

### 1.6 splitMarks

- [x] 在 splitPos=3 处拆分 `[{0,6,bold}]` → before `[{0,3,bold}]`, after `[{0,3,bold}]`
- [ ] mark 完全在拆分点之前 → 只出现在 before
- [ ] mark 完全在拆分点之后 → 只出现在 after，offset 已归零
- [ ] mark 跨越拆分点 → 两边都有，边界正确

### 1.7 combineMarks

- [x] 合并后 second 的 marks offset 正确偏移了 firstTextLength
- [x] 相邻同类型 marks 被 merge

### 1.8 ProseMirror Schema

- [x] Schema 创建不报错
- [x] `doc` 只允许一个 `paragraph` 子节点
- [x] `paragraph` 允许 `inline*`（text + inlineReference）
- [x] `inlineReference` 是 atom、inline
- [x] 全部 7 种 marks 注册正确
- [x] `link.inclusive === false`

### 1.9 marksToDoc / docToMarks

- [x] 空内容 → 空段落文档
- [x] 纯文本 → 单 text 节点
- [x] 带 marks 的文本 → text 节点携带正确的 PM marks
- [x] 内联引用 → inlineReference atom 节点
- [x] 完整往返：`docToMarks(marksToDoc(text, marks, refs))` 结果与输入一致

### 1.10 数据层一次性切换（同任务内）

- [x] `src/types/node.ts` 已新增 `NodeProps._marks`、`NodeProps._inlineRefs`
- [x] `supabase/migrations/*` 已新增 `nodes.marks`、`nodes.inline_refs` 列
- [x] `rowToNode` / `nodeToRow` 已映射 `marks`、`inline_refs`
- [x] `setNodeContentLocal` / `updateNodeContent`（或等价接口）可同时读写 text+marks+inlineRefs
- [x] 种子数据与导入链路已写入新三字段，不再依赖 HTML 作为运行时主存储

---

## Phase 2: RichTextEditor 核心验收

### 2.1 编辑器挂载与销毁

- [x] 点击节点文本 → 编辑器出现（光标闪烁）
- [x] 点击其他地方 → 编辑器销毁（blur 触发保存）
- [ ] 编辑器挂载后 `editorRef.current` 是 `EditorView` 实例（非 null）
- [ ] 编辑器销毁后 `editorRef.current` 是 null
- [ ] 编辑器容器有 `.editor-inline` class（保持现有样式）
- [ ] 编辑器 DOM 有 `.ProseMirror` class（PM 默认）

### 2.2 内容初始化

- [x] 纯文本节点：编辑器显示正确文本
- [x] 带 bold 格式的节点：编辑器显示粗体
- [x] 含内联引用的节点：引用显示为主题色 chip，不可编辑
- [x] 空节点：编辑器为空，光标可输入

### 2.3 光标定位

- [ ] 鼠标点击文本中某位置 → 光标精确定位到点击处（备注：末尾空白点击仍偶发跳到开头；本轮已追加修复，待复测）
- [ ] ArrowUp 到达节点 → 光标在末尾（手测路径待补充）
- [ ] ArrowDown 到达节点 → 光标在开头（手测路径待补充）
- [x] 新建空节点 → 光标在开头
- [x] 选择模式按字符键进入编辑 → 字符被插入（pendingInputChar 消费正确，插入到节点末尾）
- [x] 引用节点单击仅选中（不进编辑）；双击才进入编辑模式（光标落在双击位置）

### 2.4 内容同步（live update）

- [ ] 每次按键后，`node.props.name`、`node.props._marks`、`node.props._inlineRefs` 在 store 中实时更新（通过 `setNodeContentLocal` 或等价 action）
- [x] 其他引用此节点的 UI 实时反映变化
- [ ] blur 时调用 `updateNodeContent`（或等价 action）持久化到 Supabase
- [ ] 内容未变化时 blur 不触发 Supabase 写入（savedRef 逻辑）

### 2.5 基础键盘快捷键

| 快捷键 | 验收步骤 | 通过 |
|--------|---------|------|
| **Enter（行尾）** | 光标在行尾按 Enter → 下方出现空节点，光标在新节点 | [x] |
| **Enter（行中）** | 光标在 "Hel\|lo" 中间按 Enter → 当前节点变为 "Hel"，新节点为 "lo" | [x] |
| **Enter（行中带格式）** | 光标在 `<strong>He\|llo</strong>` 中按 Enter → 两个节点都保持 bold | [x] |
| **Enter（行中带引用）** | 光标在引用前按 Enter → 引用跟随到新节点 | [x] |
| **Backspace（空节点）** | 空节点按 Backspace → 节点删除，焦点到上一节点（注意：需正确处理浏览器插入的零宽字符 `\u200B`） | [x] |
| **Backspace（非空）** | 正常删除字符（PM 默认行为） | [x] |
| **Backspace（空节点有子节点）** | 不应删除；显示摇晃反馈，防止误删整棵子树 | [x] |
| **Tab** | 按 Tab → 节点缩进（变为前一兄弟的子节点） | [x] |
| **Shift+Tab** | 按 Shift+Tab → 节点反缩进 | [x] |
| **ArrowUp（行首）** | 光标在行首按 ↑ → 焦点到上一可见节点（并落在上一节点末尾） | [x] |
| **ArrowDown（行尾）** | 光标在行尾按 ↓ → 焦点到下一可见节点 | [x] |
| **ArrowUp（非行首）** | PM 默认行为（单行无效果） | [ ] |
| **Escape** | 按 Esc → 退出编辑，进入选择模式，当前节点高亮 | [x] |
| **Shift+ArrowUp** | 按 Shift+↑ → 保存内容，进入选择模式，范围扩展 | [x] |
| **Shift+ArrowDown** | 同上，向下扩展 | [x] |
| **Cmd+A（第一次）** | 按 Cmd+A → 选中编辑器内全部文本 | [x] |
| **Cmd+A（第二次）** | 全选状态再按 Cmd+A → 退出编辑，选中所有兄弟节点 | [x 备注：不是选中所有兄弟节点，是选中nodepanel 中的所有节点，当前的实现符合预期] |
| **Cmd+Shift+ArrowUp** | 当前节点上移 | [备注： 移动符合预期，不过光标位置应该保持在原节点的原位置不变] |
| **Cmd+Shift+ArrowDown** | 当前节点下移 | [备注： 移动符合预期，不过光标位置应该保持在原节点的原位置不变] |
| **Cmd+Enter（无下拉）** | toggle checkbox 状态 | [x] |
| **Ctrl+I** | 进入描述编辑模式（Mac 上 Ctrl 键，非 Cmd） | [x] |

### 2.6 格式快捷键

| 快捷键 | 验收步骤 | 通过 |
|--------|---------|------|
| **Cmd+B** | 选中文本 → Cmd+B → 变为粗体 | [x] |
| **Cmd+I** | 选中文本 → Cmd+I → 变为斜体（Mac 上 Cmd+I = Mod+I） | [x] |
| **Cmd+E** | 选中文本 → Cmd+E → 变为行内代码 | [x 不过要删除此快捷键，只能通过格式浮窗设置] |
| **Cmd+Shift+S** | 选中文本 → 变为删除线 | [x] |
| **Cmd+Shift+H** | 选中文本 → 变为高亮 | [x] |

### 2.7 撤销/重做

- [x] Cmd+Z → 撤销最近的文字输入
- [x] Cmd+Shift+Z / Cmd+Y → 重做
- [x] 连续输入后 Cmd+Z → 合理的撤销粒度（不是逐字符）
- [ ] 格式变更可撤销[备注：格式变更不可撤销]
- [x] 撤销后光标位置正确

### 2.8 触发器

| 触发器 | 验收步骤 | 通过 |
|--------|---------|------|
| **# HashTag** | 输入 `#ta` → 标签选择器出现，显示匹配标签 | [ ]（已修复两轮：下拉层级穿透 + 鼠标点击选择；待复测） |
| **# 选择** | 选择标签 → `#ta` 文本被清除，标签应用到节点 | [x] |
| **# 强制创建** | `#newTag` → Cmd+Enter → 创建新标签并应用 | [x] |
| **# 取消** | `#ta` → Escape → 选择器关闭，文本保留 | [x] |
| **# 下拉导航** | ↑↓ 在选择器中移动高亮 | [x] |
| **# 守卫** | 聚焦已含 `#` 的节点 → 不自动触发选择器 | [x] |
| **@ Reference** | 输入 `@no` → 引用选择器出现 | [x] |
| **@ 选择（空节点）** | 空节点输入 `@ref` 选择 → 节点转为引用节点 | [ ]（已修复两轮：鼠标点击选择 + 下拉层级；待复测） |
| **@ 选择（有文本）** | 文本中输入 `@ref` 选择 → 插入 inline ref atom | [x] |
| **@ 强制创建** | Cmd+Enter → 创建新节点引用 | [x] |
| **/ Slash** | 输入 `/` → Slash 命令菜单出现 | [x] |
| **/ 触发规则** | 仅空白节点输入 `/` 才触发 Slash 菜单；有文本节点不触发（含 `https://`） | [x] |
| **> Field** | 空节点输入 `>` → 立即创建字段（fire-once） | [x] |
| **> 不重复** | 输入 `>` 触发后，继续输入 `>a` 不再次触发 | [x] |

### 2.9 粘贴

- [x] 粘贴纯文本 → 正确插入
- [-] 粘贴多行文本 → 本轮保持“单节点纯文本插入”现状（结构化拆分为多节点改为后续任务，见 `docs/TASKS.md`）
- [-] 粘贴富文本 → 本轮保持“纯文本化”现状（富文本/Markdown 层级粘贴改为后续任务，见 `docs/TASKS.md`）

---

## Phase 3: FloatingToolbar + TrailingInput 验收

### 3.1 FloatingToolbar 显示/隐藏

- [x] 选中文本 → 工具栏出现在选区上方
- [x] 取消选中 → 工具栏消失
- [x] 拖拽选择过程中 → 工具栏不显示（mousedown 隐藏，mouseup 后显示）
- [x] 编辑器失焦 → 工具栏消失
- [ ] 选区跨越 inline ref atom → 工具栏仍然出现（测试方法：先插入一个 inline ref，然后从它前一个字拖拽到它后一个字，确认工具栏会出现）

### 3.2 FloatingToolbar 定位

- [x] 工具栏跟随“选择结束侧”的字符位置（拖拽/双击都靠近最后落点字符）
- [x] 工具栏不超出视口左边界
- [x] 工具栏不超出视口右边界
- [x] 工具栏在选区上方 40px

### 3.3 FloatingToolbar 格式按钮

| 按钮 | 验收步骤 | 通过 |
|------|---------|------|
| **Bold** | 选中文本 → 点击 Bold → 文本变粗体；再点击 → 取消粗体 | [x] |
| **Italic** | 同上，斜体 | [x] |
| **Strikethrough** | 同上，删除线 | [x] |
| **Code** | 同上，行内代码 | [x] |
| **Highlight** | 同上，高亮 | [x] |
| **Heading** | 同上，heading mark | [x] |
| **所有按钮状态** | 选中已格式化文本 → 对应按钮高亮 | [x] |
| **点击不失焦** | 点击工具栏按钮 → 编辑器不失焦，选区保留 | [x] |

### 3.4 FloatingToolbar 链接编辑（本轮不做，需求移除）

- [-] 点击 Link 按钮 → 切换到链接编辑模式（输入框出现）
- [-] 输入 URL + Enter → 链接应用到选中文本
- [-] 输入 `example.com`（无协议）→ 自动补全 `https://`
- [-] 输入无效 URL → 不应用
- [-] 已有链接的文本 → Link 按钮高亮，点击后输入框预填现有 URL
- [-] 点击 Unlink → 移除链接
- [-] 点击 Cancel / Escape → 退出链接编辑模式
- [-] 链接编辑模式下工具栏宽度正确（360px vs 默认 232px）

### 3.5 TrailingInput（白话版手测步骤）

- [ ] 在某个父节点最后一行下面点击空白处 → 出现一个可输入的小输入框（光标在里面闪烁）
- [ ] 在这个输入框里输入 `abc` 后按 Enter → 父节点下面新增一个子节点，内容是 `abc`
- [ ] 输入框里不输入内容直接按 Enter → 也会新增一个空子节点（方便连续录入）
- [ ] 在输入框按 Tab → 输入框视觉上右移一级（只改缩进，不创建节点）
- [ ] 在输入框按 Shift+Tab → 输入框视觉上左移一级
- [ ] 在输入框按 Escape → 输入框消失
- [ ] 在输入框里输入内容后，点击别处（blur）→ 也会创建子节点，避免输入丢失
- [ ] 输入框有占位提示文案（例如 `Add a node...`）
- [ ] 若该位置是 Options 字段值输入场景 → 自动补全仍可正常使用

---

## Phase 4: 切换 + 清理验收

### 4.1 旧文件删除

- [x] `NodeEditor.tsx` 已删除
- [x] `HashTagExtension.ts` 已删除
- [x] `ReferenceExtension.ts` 已删除
- [x] `SlashCommandExtension.ts` 已删除
- [x] `FieldTriggerExtension.ts` 已删除
- [x] `InlineRefNode.ts` 已删除
- [x] `HeadingMark.ts` 已删除
- [x] `editor-html.ts`（`stripWrappingP`/`wrapInP`）已删除
- [x] `editor-html.test.ts` 已删除或替换

### 4.2 TipTap 依赖移除

- [x] `package.json` 中无 `@tiptap/*` 依赖
- [x] `package-lock.json` 中无 `@tiptap/*`
- [x] `npm ls @tiptap/react` 返回空

### 4.3 ProseMirror 依赖正确

- [x] `prosemirror-model` 已安装
- [x] `prosemirror-state` 已安装
- [x] `prosemirror-view` 已安装
- [x] `prosemirror-keymap` 已安装
- [x] `prosemirror-history` 已安装
- [x] `prosemirror-commands` 已安装
- [x] `prosemirror-transform` 已安装（由 `prosemirror-commands` 传递依赖提供）
- [x] 不需要的包未安装（`prosemirror-schema-basic` 不需要）

### 4.4 代码引用清理

- [x] `grep -r "@tiptap" src/` 返回空（无残留导入）
- [x] `grep -r "from '@tiptap" src/` 返回空
- [x] `grep -r "useEditor(" src/` 返回空
- [x] `grep -r "\bEditorContent\b" src/` 返回空
- [x] `grep -r "Extension.create(" src/` 返回空

### 4.5 全量回归

- [x] `npm run typecheck` 通过
- [x] `npm run check:test-sync` 通过
- [x] `npm run test:run` 全量通过
- [x] `npm run build` 成功
- [-] bundle size 不增加（理想情况下减少，去掉了 TipTap 层）— 本轮仅验证构建成功，未与迁移前基线做同口径对比

---

## 端到端场景验收

以下是完整的用户操作场景，覆盖多步骤交互：

### E2E-1: 新建节点 + 格式化 + 拆分

1. [ ] 点击某节点 → 按 Enter 创建空节点
2. [ ] 输入 "Hello World"
3. [ ] 选中 "Hello" → Cmd+B → 变粗体
4. [ ] 光标移到 "Hello" 和 "World" 之间
5. [ ] 按 Enter → 拆分为两个节点
6. [ ] 上方节点为 `<strong>Hello</strong>`（粗体保留）
7. [ ] 下方节点为 " World"（无格式）
8. [ ] 两个节点的 `props.name` 都正确保存到 store

### E2E-2: 引用创建 + 编辑

1. [ ] 在非空节点文本中间输入 `@`
2. [ ] 输入几个字符过滤
3. [ ] 从选择器中选择一个节点
4. [ ] `@query` 文本被清除，inline ref chip 插入到正确位置
5. [ ] chip 显示为蓝色，不可编辑
6. [ ] 光标可以跳过 chip 前后（ArrowLeft/Right）
7. [ ] Backspace 可以删除 chip
8. [ ] 保存后再次聚焦，chip 正确显示

### E2E-3: 标签应用

1. [ ] 创建空节点
2. [ ] 输入 `#`
3. [ ] 标签选择器出现
4. [ ] 输入几个字符过滤
5. [ ] 按 Enter 或点击选择标签
6. [ ] `#query` 被清除，标签 pill 出现在节点旁
7. [ ] 节点内容为空（只有标签，无残留文本）

### E2E-4: 缩进/反缩进 + 编辑保持

1. [ ] 编辑某节点，输入部分文本
2. [ ] 按 Tab → 节点缩进
3. [ ] 编辑器焦点不丢失，光标位置不变
4. [ ] 继续输入文本 → 正常
5. [ ] 按 Shift+Tab → 反缩进
6. [ ] 同样焦点和光标保持

### E2E-5: 选择模式完整链路

1. [ ] 编辑某节点，按 Escape → 进入选择模式，节点高亮
2. [ ] 按 ↓ → 选中下一节点（上一个取消高亮）
3. [ ] 按 Shift+↓ → 扩展选择范围
4. [ ] 按 Tab → 所有选中节点批量缩进
5. [ ] 按 Escape → 退出选择模式
6. [ ] 按任意字符键 → 回到编辑模式，字符被插入

### E2E-6: 中文 IME 输入

1. [ ] 聚焦节点编辑器
2. [ ] 切换到中文输入法
3. [ ] 输入拼音（composition 过程中不应触发触发器或意外行为）
4. [ ] 确认中文字符
5. [ ] 文本正确显示
6. [ ] 继续输入混合中英文 → 正常

### E2E-7: 浮动工具栏完整交互

1. [ ] 选中一段文本 → 工具栏出现
2. [ ] 点击 Bold → 文本变粗体，工具栏保持显示
3. [ ] Bold 按钮变为高亮状态
4. [ ] 点击 Link → 切换到链接编辑
5. [ ] 输入 URL + Enter → 链接应用
6. [ ] 选中链接文本 → Link 按钮高亮
7. [ ] 点击 Unlink → 链接移除
8. [ ] 点击文档其他位置 → 工具栏消失

### E2E-8: Undo/Redo 基础

1. [ ] 输入 "ABC"
2. [ ] Cmd+Z → 撤销部分输入
3. [ ] Cmd+Shift+Z → 重做
4. [ ] 选中 "ABC" → Cmd+B → 加粗
5. [ ] Cmd+Z → 取消加粗
6. [ ] Cmd+Shift+Z → 重新加粗

---

## 视觉一致性验收

以下项确保迁移后 UI 无可见差异：

- [ ] 编辑器文本样式不变（font-size: text-sm, line-height: 21px）
- [ ] 粗体/斜体/代码/高亮/删除线的渲染与迁移前一致
- [ ] 行内代码背景色：`rgba(135,131,120,0.15)`，文字色：`#c7254e`
- [ ] 高亮背景色：`rgba(255,212,0,0.4)`
- [ ] 内联引用颜色：`#2563eb`，不可选中
- [ ] Heading mark 节点的字体大小和粗细不变
- [ ] 浮动工具栏外观不变（圆角、阴影、按钮大小）
- [ ] TrailingInput placeholder 样式不变
- [ ] 编辑器 outline: none（无蓝色聚焦框）
- [ ] atom 节点后无多余空行（trailingBreak CSS 生效）

---

## 数据完整性验收

> **产品尚未上线，无需兼容现有数据。** 测试数据如有问题直接准备新的种子数据。

- [ ] 新种子数据在新编辑器中正确显示（纯文本、格式化、引用）
- [ ] 编辑后保存的内容可以被再次正确加载（往返一致性）
- [ ] 内联引用的 `_inlineRefs[].targetNodeId` 不丢失，offset 与 `\uFFFC` 位置一致
- [ ] `search-service.getInlineBacklinks()` 基于 `inline_refs` 查询仍返回正确结果
- [ ] Tana 导入流程更新后，导入的节点在新编辑器中正确显示
