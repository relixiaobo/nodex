# TipTap 移除交接说明（2026-02-14）

## 背景

项目在最近迭代中持续遇到 TipTap 相关稳定性问题，主要集中在：

- 光标定位不稳定（点击位置与实际插入位置不一致）
- 输入法（尤其 macOS 中文 IME）组合输入过程中被快捷键/状态更新打断
- `#`/`@` trigger 与 dropdown 的 range/caret 不一致，造成残留字符、光标跳转
- inline reference 点击与编辑态焦点切换竞态
- 新建空节点/TrailingInput 与正式编辑器行为不一致

结论是：当前需求以“单行大纲编辑 + trigger + inline reference”为主，继续维护 TipTap 的复杂抽象收益低于成本，因此执行了 TipTap 移除。

## 本次改造目标

- 用轻量 `contentEditable` 替换 TipTap editor（每个聚焦节点实例化）
- 保留既有快捷键与大纲语义（Enter/Tab/Shift+Tab/Backspace/Arrow）
- 兼容 `#` tag trigger、`@` reference trigger、inline reference 插入
- 维持“点击定位光标”体验，并尽量规避 StrictMode/focus 竞态

## 关键代码变更

### 1) 编辑器实现替换

- 删除 TipTap 扩展文件：
  - `src/components/editor/FieldTriggerExtension.ts`
  - `src/components/editor/HashTagExtension.ts`
  - `src/components/editor/InlineRefNode.ts`
  - `src/components/editor/ReferenceExtension.ts`
- 新增编辑器桥接接口：
  - `src/components/editor/editor-handle.ts`
- 核心编辑器改为 contentEditable：
  - `src/components/editor/NodeEditor.tsx`

### 2) Outliner 事件与触发器清理

- `OutlinerItem` 中接入新的 `NodeEditorHandle`
- Enter 分裂语义重构（有/无 child 的行为分支）
- Backspace 行首合并语义补齐
- `#`/`@` 触发词清理与 reference 插入路径多次修补
- 文件：
  - `src/components/outliner/OutlinerItem.tsx`

### 3) TrailingInput 行为与样式调整

- 增加 IME 组合态防护
- 与正式节点编辑行对齐（focus/样式/键盘语义）
- 文件：
  - `src/components/editor/TrailingInput.tsx`

### 4) 配套

- shortcut registry 测试同步更新：
  - `tests/vitest/shortcut-registry.test.ts`
- 依赖与 lockfile 有更新：
  - `package.json`
  - `package-lock.json`

## 目前状态

### 已基本修复（用户确认过至少一轮）

- 节点中间 Enter 分裂语义（有/无 child）
- Backspace 合并（主流程可用）
- inline reference 单击跳转
- `@` trigger 的主要失效问题

### 仍待解决（当前 open issues）

- `#query` 选中 tag 后触发词残留（如 `#per` 仍在文本）
  - 见 `docs/issues/50.md`
- 新建节点首次输入后需按两次 Enter 才创建下一节点
  - 见 `docs/issues/51.md`

## 为什么 `#` 问题反复出现

已多次尝试 range/caret/fallback 方案，但仍复现，推测不是单点 bug，而是“触发选择当下 editor 状态”不具备事务一致性：

- 保存/重渲染/焦点切换与 dropdown 选择时机交错
- 读取到的 range/caret 与最终生效 DOM 不是同一快照
- 结果是 delete 操作偶发 no-op，触发词残留

建议接手者改成“单事务 apply”流程：

1. 读取当前 editor 的文本+selection（同 tick）
2. 计算并删除触发词
3. 应用 tag/reference
4. 最后统一写回 store

而不是分散在多个 callback 和状态副作用中逐步完成。

## 建议另一个 Agent 的接手顺序

1. 先解决 `#50`（触发词残留）
2. 再解决 `#51`（新建节点首次 Enter 双击）
3. 最后回归中文 IME 与点击定位

## 建议回归清单

- `#p` / `#per` / `#person` + Enter/鼠标选择
- `@` 输入、筛选、插入、菜单关闭
- 新建节点首次输入后 Enter
- 已有节点 Enter
- macOS 中文输入法（`ni`/`zhong` 等）
- 点击文本不同位置插入光标

## 运行与验证

- Typecheck: `npm run typecheck`
- Tests: `npm run test:run`

当前本地验证：以上命令均通过（34 files / 129 tests）。
