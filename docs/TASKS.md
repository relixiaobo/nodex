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
| nodex-cc | 用户认证 — Google 登录 (#45) | cc/google-auth | `src/lib/auth.ts`, `src/components/auth/*`, `workspace-store.ts` |
| nodex-cc-2 | 性能基线测量 | cc2/perf-baseline | `docs/research/performance-baseline.md` |
| nodex-codex | Editor 迁移: TipTap → ProseMirror | codex/editor-migration | `src/components/outliner/OutlinerItem.tsx`, `src/components/outliner/OutlinerView.tsx`, `src/components/fields/FieldRow.tsx`, `src/components/fields/ConfigOutliner.tsx`, `src/components/fields/FieldValueOutliner.tsx`, `src/components/editor/TrailingInput.tsx`, `src/lib/trailing-input-navigation.ts`, `src/lib/selection-keyboard.ts`, `src/lib/selected-reference-shortcuts.ts`, `src/lib/ime-keyboard.ts`, `src/stores/ui-store.ts`, `src/stores/node-store.ts`, `src/components/editor/FloatingToolbar.tsx`, `src/components/editor/RichTextEditor.tsx`, `src/components/editor/SlashCommandMenu.tsx`, `src/components/tags/TagSelector.tsx`, `src/components/references/ReferenceSelector.tsx`, `tests/vitest/floating-toolbar.test.ts`, `tests/vitest/node-store-fields.test.ts`, `tests/vitest/config-outliner.test.ts`, `tests/vitest/field-value-outliner.test.ts`, `tests/vitest/trailing-input-navigation.test.ts`, `tests/vitest/selection-keyboard.test.ts`, `tests/vitest/selected-reference-shortcuts.test.ts`, `docs/EDITOR-MIGRATION-ACCEPTANCE.md`, `docs/TESTING.md`, `docs/TASKS.md`, `docs/issues/editor-ime-enter-empty-node.md`, `docs/issues/editor-tail-click-first-open.md` |

---

## 进行中

### Editor 迁移：TipTap → 直接 ProseMirror
> **Owner: nodex-codex** | Branch: `codex/editor-migration` | Priority: P1
> **Spec**: `docs/features/editor-migration.md` | **验收**: `docs/EDITOR-MIGRATION-ACCEPTANCE.md`

去掉 TipTap 封装层，直接使用 ProseMirror API；引入 text+marks 分离的数据模型。
分 4 个 Phase 实施（详见 spec）：
1. Phase 1: 基础设施（marks 转换 + PM Schema + 测试）
2. Phase 2: RichTextEditor 核心组件
3. Phase 3: FloatingToolbar + TrailingInput 迁移
4. Phase 4: 切换 + 清理旧代码 + 删除 TipTap 依赖

- **Files**: `src/types/node.ts`, `src/services/node-service.ts`, `src/stores/node-store.ts`, `src/lib/editor-marks.ts`, `src/lib/pm-doc-utils.ts`, `src/services/search-service.ts`, `src/lib/tree-utils.ts`, `src/services/tana-import.ts`, `src/entrypoints/test/seed-data.ts`, `supabase/migrations/*`, `tests/vitest/*`, `docs/features/data-model.md`
- **迭代日志**:
  - [2026-02-17 nodex-codex] 启动实施：先落地 Phase 1 数据层与转换基础设施（类型/DB 映射/store 新接口 + marks 工具与测试），随后再切编辑器 UI 层。
  - [2026-02-17 nodex-codex] 已完成 Phase 1 首批实现：`NodeProps._marks/_inlineRefs`、`nodes.marks/inline_refs` 迁移、`setNodeContentLocal/updateNodeContent`、`htmlToMarks/marksToHtml`、`marksToDoc/docToMarks`、`tana-import` 转换、seed 切换；验证通过 `typecheck`、`check:test-sync`、`test:run`、`build`。
  - [2026-02-17 nodex-codex] 继续实施（过渡到 Phase 2 前的运行时对齐）：`NodeEditor` 改为通过 `htmlToMarks` 回写 `text+marks+inlineRefs`，`OutlinerItem` 改为基于 `marksToHtml` 展示并在 split/create 时传递富文本 payload，`createChild/createSibling` 支持携带 marks/inlineRefs；全量验证通过。
  - [2026-02-17 nodex-codex] 推进 Phase 2：新增 `RichTextEditor`（直接 PM EditorView + keymap/history + 触发器正则检测 + 外部值同步 + 纯文本粘贴），`OutlinerItem` 切换到 PM `EditorView` 引用并改用事务工具操作（替代 TipTap chain API），新增 `pm-editor-view` 工具与测试，补充 `.ProseMirror` 样式映射；全量验证通过。
  - [2026-02-17 nodex-codex] 推进 Phase 3：`FloatingToolbar` 改为同时支持 TipTap/PM 双通路并在 `RichTextEditor` 接入（`view + tick`），`TrailingInput` 从 TipTap `useEditor` 迁移到直接 PM `EditorView`（保留原有 Enter/Tab/Backspace/Arrow/Escape 与 trigger/options 语义）；全量验证通过。
  - [2026-02-17 nodex-codex] 推进 Phase 4：移除 TipTap 依赖与遗留文件（`NodeEditor`、旧 extension、`editor-html`、对应测试），源码全部切换为直接 `prosemirror-*` 包导入，`FloatingToolbar` 测试改为 PM 兼容类型，`docs/TESTING.md` 同步删除已废弃测试映射；验证通过 `typecheck`、`check:test-sync`、`test:run`、`build`。
  - [2026-02-17 nodex-codex] 验收文档对齐：`docs/EDITOR-MIGRATION-ACCEPTANCE.md` 已勾选自动可验证项（Phase 4 清理、依赖替换、代码引用清理、全量回归），并将 bundle size 项标记为 `[-]`（当前缺少迁移前同口径基线对比）。
  - [2026-02-17 nodex-codex] 自动/代码核验层复核：再次执行 `typecheck`、`check:test-sync`、`test:run`、`build`，并基于单测 + 代码映射补充勾选 Phase 1 的可自动验证条目（1.1、1.2部分、1.3部分、1.4部分、1.5-1.10）。
  - [2026-02-17 nodex-codex] 修复手工用例阻断问题（首次点击节点不出 caret）：根因是 `RichTextEditor` 在 `useLayoutEffect` 聚焦，但 `EditorView` 在 `useEffect` 才创建，首挂载未触发聚焦；改为在 `EditorView` 创建后 `requestAnimationFrame` 执行焦点/光标/pendingInput 同步，并在卸载取消 RAF；验证通过 `typecheck`、`check:test-sync`、`test:run`。
  - [2026-02-17 nodex-codex] 根据手测备注修复交互偏差：`OutlinerItem` 为 `ArrowUp` / 空节点 `Backspace` / 选择模式 `type_char` 明确写入光标定位（上移到上一节点末尾、输入字符追加到末尾），引用节点双击编辑支持按双击位置落光标；同时为空节点 `Backspace` 增加有子节点保护（不再删除整棵子树）。验证通过 `typecheck`、`check:test-sync`、`test:run`。
  - [2026-02-17 nodex-codex] 修复浮动工具栏右边界定位偏差：`FloatingToolbar` 改用 `selection.to - 1` 的字符坐标计算终点，并以 `end.right` 参与中心点计算，避免行尾选区中心误落到下一行起点；验证通过 `typecheck`、`floating-toolbar.test.ts`。
  - [2026-02-17 nodex-codex] 第二轮手测备注修复：`FloatingToolbar` 改为跟随选区“结束侧字符”定位；`#/@/Slash` 下拉改为 `onMouseDown` 即选择（修复鼠标点击不生效）并统一不透明背景（修复穿透观感）；Slash 触发规则收敛为“仅空白节点 `/` 触发”；补充 `floating-toolbar.test.ts` 定位断言。验证通过 `typecheck` + `test:run`（全量 338/338）。
  - [2026-02-17 nodex-codex] 第三轮手测反馈修复：为菜单打开行提升 z-index（修复跨行穿模与点击命中问题）；`handleContentMouseDown` 增加点击偏移兜底；`RichTextEditor` 增加“行尾右侧空白点击强制落尾”逻辑，处理光标从末尾跳回开头。验证通过 `typecheck`、`check:test-sync`、`test:run`、`build`。
  - [2026-02-17 nodex-codex] 第四轮修复（针对“仅 Enter 新建节点出现穿模/无法点击”）：`#/@/Slash` 菜单改为 `createPortal(..., document.body)`，脱离节点树 stacking context；`RichTextEditor` 行尾空白点击判定改为 PM `coordsAtPos(endPos)`（替代 DOM range），避免行尾点击误回到开头。验证通过 `typecheck`、`check:test-sync`、`test:run`、`build`。
  - [2026-02-17 nodex-codex] 第五轮修复（针对“行尾空白识别区太小”）：`OutlinerItem` 新增编辑态空白区点击拦截（直接将光标置于行尾，避免 blur/re-focus 导致跳到开头）；非编辑态 `mousedown` 也按“点击在文本右侧则落尾”强制解析。验证通过 `typecheck`、`check:test-sync`、`test:run`、`build`。
  - [2026-02-17 nodex-codex] 第六轮修复（针对“仍有大片空白点击漏判”）：新增行级 `onMouseDownCapture` 兜底，在编辑态点击整行右侧空白时统一强制光标置于行尾，并排除按钮/输入/链接/indent-line 等交互元素，避免误拦截。验证通过 `typecheck`、`check:test-sync`、`test:run`、`build`。
  - [2026-02-17 nodex-codex] 第七轮修复（继续处理剩余两项）：`Cmd+Shift+ArrowUp/Down` 移动时记录并恢复当前字符偏移，确保节点移动后光标位置不跳变；`use-nav-undo-keyboard` 增加 `focusedNodeId` 守卫，编辑态不再抢占 `Cmd+Z`，修复格式变更撤销链路。验证通过 `typecheck`、`test:run`、`build`（339/339）。
  - [2026-02-18 nodex-codex] 根据手测反馈继续修复 Arrow 导航：内容节点上下键遇到 field 行时改为进入对应 `field name`；边界场景新增聚焦灰色“系统空白输入位”（TrailingInput）兜底，避免光标消失。验证通过 `typecheck`、`test:run`、`build`。
  - [2026-02-18 nodex-codex] 继续修复 field/TrailingInput 导航闭环：`FieldNameInput` 支持无候选时 `ArrowUp/Down` 行间导航；`field name` 支持 `Tab/Shift+Tab` 直接缩进/反缩进；`FieldRow` 统一 sibling 导航并支持进入 content/trailing；`OutlinerView` 与 `OutlinerItem` 补齐 TrailingInput `onNavigateOut`，修复灰色空白位上下不可进出。验证通过 `typecheck`、`test:run`、`build`。
  - [2026-02-18 nodex-codex] 收敛灰色空白位与 field 缩进语义：`OutlinerItem` 改为基于“已渲染 sibling 行”处理 Arrow 导航，确保普通节点可稳定进入 TrailingInput；`FieldRow` 的 `Tab/Shift+Tab` 改为 `moveFieldTuple`（下方 field → 上方 field value），并修正反缩进插入点到父 field 后方；补充 `node-store-fields.test.ts` 覆盖字段 tuple 迁移与 associationMap 所有权同步。验证通过 `typecheck`、`test:run`、`build`、`check:test-sync`（340/340）。
  - [2026-02-18 nodex-codex] 调整 ConfigOutliner 灰色空白位显示规则：从“始终显示”改为“仅空列表或末行为 field 时显示”；末行为普通 content 时隐藏，符合手测预期。新增 `config-outliner.test.ts` 覆盖 3 条显示规则，并同步 `docs/TESTING.md` 覆盖映射。验证通过 `typecheck`、`test:run`、`build`、`check:test-sync`。
  - [2026-02-18 nodex-codex] 根据手测继续修复上下导航与 FieldValueOutliner 一致性：`OutlinerItem` sibling 导航改为过滤隐藏 field 后的可渲染集合，避免普通 node 跳过 trailing；`TrailingInput` 在 child outliner 的 `ArrowUp` 改为回到“最后一条渲染行”（field 则进入 field name）；`OutlinerView` root trailing 同步该规则；`FieldValueOutliner` trailing 显示规则对齐 nodepanel（空/末行=field 显示，末行=content 隐藏）并新增单测 `field-value-outliner.test.ts`。验证通过 `typecheck`、`test:run`、`build`、`check:test-sync`。
  - [2026-02-18 nodex-codex] 按最新手测反馈修复剩余 3 个交互偏差：`TrailingInput ArrowUp` 改为 `onNavigateOut` 优先（避免跳到父 content 起始），`OutlinerItem ArrowDown` 在展开态优先进入“子作用域首行/灰色 trailing”，并在 Trailing 提交创建后写入 `focusClickCoords`（光标落新节点末尾，避免下一次 Enter 在行首 split）。同步更新 `trailing-input-navigation.test.ts` 断言；验证通过 `typecheck`、`test:run`（346/346）、`build`、`check:test-sync`。
  - [2026-02-18 nodex-codex] 按“Trailing 一次 Enter 等同普通 node”再修：新增 `resolveTrailingEnterIntent`，将 trailing Enter 分为 `options_confirm` / `create_content_and_continue` / `create_empty`；有文本时一次 Enter 连续创建“内容节点 + 下一空节点”并聚焦空节点，支持持续连写。同步补充 `trailing-input-navigation.test.ts` 对 Enter 决策覆盖，并更新 `docs/TESTING.md` 覆盖点。
  - [2026-02-18 nodex-codex] 新增手测回归项：修复中文输入法（IME）组合输入被中断问题，重点排查 `RichTextEditor` 在 composition 期间的键盘桥接与外部同步时序。
  - [2026-02-18 nodex-codex] 完成 IME 保护修复：新增 `ime-keyboard` 统一识别（`isComposing` / `Process` / `keyCode=229`）；`selection-keyboard` 与 `selected-reference-shortcuts` 在组合输入期间不再触发 `type_char/convert_printable`；`RichTextEditor/TrailingInput` 在 composition 期间跳过结构快捷键并在 `compositionend` 后恢复同步，避免拼音首字母被误插入。验证通过 `typecheck`、`test:run`（349/349）、`build`、`check:test-sync`。
  - [2026-02-18 nodex-codex] 针对你最新复测继续修复 IME 漏网路径：`pendingInputChar` 升级为“定向 payload（char+nodeId+parentId）”，仅目标编辑器消费，避免残留字符串到 Enter 新建节点；`OutlinerItem` 选中态键盘新增全局 `focusedNodeId` 守卫；`type_char` 与 reference `convert_printable` 改为“字母键不强制 preventDefault/不手动注入”，reference 字母输入直接进入编辑（不再走 inline 转换），并通过 `beforeinput/compositionstart` 清理 pending，避免拼音首字母污染。验证通过 `typecheck`、`test:run`（349/349）、`build`、`check:test-sync`。
  - [2026-02-18 nodex-codex] 继续修复“仅 Enter 新建空节点触发 IME 异常”：`OutlinerItem.handleEnter` 的 createChild/createSibling 回调改为“仅必要时回补焦点”，若用户已切到其他编辑器或当前目标已在焦点则不再二次 `setFocusedNode`，避免输入法组合态被异步回调抢焦点打断。验证通过 `typecheck`、`test:run`（349/349）、`build`、`check:test-sync`。
  - [2026-02-18 nodex-codex] 继续做根因级兜底：`OutlinerItem` 选中态 document keydown 新增 `activeElement` 可编辑守卫（任何 contenteditable/input 焦点时不抢键）；`RichTextEditor.syncInitialFocus` 改为“立即聚焦 + rAF 非抢占回补”，并在回补阶段避免从其他可编辑目标偷焦点，降低 Enter 新建后一帧焦点竞态导致的 IME 组合中断。验证通过 `typecheck`、`test:run`（349/349）、`build`、`check:test-sync`。
  - [2026-02-18 nodex-codex] 继续修复 Enter 新建节点 IME 时序与点击回归：`RichTextEditor` 的 EditorView 挂载从 `useEffect` 提前到 `useLayoutEffect`，缩短 Enter 后首字符输入窗口期；`OutlinerItem` 的行尾空白点击判定改为文本节点/inline-ref 精确右边界计算（不再用容器整体 rect），并在右侧空白且误判 offset=0 时强制落尾，修复“首次点击行尾空白光标到开头”的回归。验证通过 `typecheck`、`test:run`（349/349）、`build`、`check:test-sync`。
  - [2026-02-18 nodex-codex] 按用户要求先详细记录 Enter+IME 阻断问题：新增 `docs/issues/editor-ime-enter-empty-node.md`（含稳定复现路径、边界确认、期望/实际、已尝试清单与下一步建议），作为独立跟踪文档。
  - [2026-02-18 nodex-codex] 优先修复“首次点击 node 行尾空白落到开头”回归：`handleContentMouseDown` 优先使用静态 `.node-content` 的真实右边界判定右侧空白（`getStaticNodeContentRightEdge`），仅在缺失时回退到文本 rect 推导，降低首击命中容器空白时 offset=0 的误判。
  - [2026-02-18 nodex-codex] 针对“首次点击行尾空白仍落开头”再加兜底：当点击位置在内容容器右侧 1/3 区域且解析 offset 仍为 0 时，强制视为落尾（`textOffset=textLength`），修复由浏览器 caret-from-point 在静态 HTML 上返回 0 的尾部误判。
  - [2026-02-18 nodex-codex] 用户反馈上述“首次点击行尾空白”问题仍未修复，按要求转为交接问题：新增 `docs/issues/editor-tail-click-first-open.md`（复现/实际/预期/已尝试/建议排查），交由下一位 agent 接手处理。

### 性能基线测量
> **Owner: nodex-cc-2** | Branch: `cc2/perf-baseline` | Priority: P2
> **产出**: `docs/research/performance-baseline.md`

在编辑器迁移**之前**建立性能基准，迁移完成后可量化对比。

**测量项目**：
1. **Bundle 分析**：总包体积、TipTap 相关包占比、tree-shaking 后实际大小
2. **启动性能**：Side Panel 打开到可交互的时间（First Contentful Paint + Time to Interactive）
3. **编辑器性能**：聚焦/失焦延迟、输入响应延迟（Input Latency）、长文本节点渲染帧率
4. **大纲渲染**：种子数据 68 节点全展开渲染时间、滚动帧率
5. **内存**：空闲态 / 编辑态 / 多节点展开态的 JS Heap 占用

**测量方法**：
- `npm run build` + bundle analyzer（如 `rollup-plugin-visualizer`）
- Chrome DevTools Performance 面板手动录制
- `window.performance` API 脚本化采集
- 结果记录到 `docs/research/performance-baseline.md`，含截图和数值

**注意**：此任务为纯研究，不修改 `src/` 下的代码。如需添加测量脚本，放在 `scripts/` 或 `docs/research/` 中。

- **Files**: `docs/research/performance-baseline.md`
- **迭代日志**: _(开始后追加)_

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

#### 用户认证 — Google 登录 (#45)
> **Owner: nodex-cc** | 上线前必需
> **Spec**: `docs/features/auth-and-environments.md`

- [ ] 环境配置：固定 Dev Extension ID + `.env` / `.env.production` 双套
- [ ] Supabase Auth 配置（启用 Google Provider，添加 redirect URIs）
- [ ] Google Cloud Console OAuth Client ID 创建（Dev + Prod 各一个）
- [ ] `src/lib/auth.ts` — chrome.identity + Supabase Auth 流程封装
- [ ] `workspace-store.ts` 扩展 — signInWithGoogle / onAuthStateChange / signOut
- [ ] `src/components/auth/LoginScreen.tsx` — 登录页 UI
- [ ] `src/components/auth/UserMenu.tsx` — 用户头像 + 登出菜单
- [ ] App.tsx 路由守卫（未登录 → LoginScreen）
- [ ] wxt.config.ts 新增 `identity` 权限
- [ ] 工作区绑定（登录后自动关联 workspaceId）

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
