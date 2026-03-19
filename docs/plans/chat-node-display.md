# Chat 节点展示改造

> Chat 中自然地展示节点信息，让用户不离开对话就能查看、展开、编辑节点。
>
> **2026-03-19** — 产品讨论收敛

## 背景

### 产品方向

soma v5 确立 Chat 为主界面（见 `ai-first-product-vision.md`）。用户通过对话思考，AI 的回答中自然地包含节点信息。节点在 Chat 中的呈现需要从"链接/工具日志"升级为"可交互的 outliner 视图"。

### 当前状态

Chat 中有三种节点呈现方式：

| 方式 | 组件 | 行为 | 问题 |
|------|------|------|------|
| `<ref id="xxx">文本</ref>` | `NodeReference.tsx` | 蓝色链接，点击**跳转到节点面板** | 跳走打断对话心流 |
| `<cite id="xxx">N</cite>` | `CitationBadge.tsx` | 上标数字，点击**跳转到节点面板** | 同上 |
| 工具执行块 | `ToolCallBlock.tsx` | 折叠灰色块，展开显示 JSON | 用户看不到节点内容 |

### 设计讨论过程

**核心洞察**：用户在 Chat 里的心流是对话。看到 AI 提到一个节点时，用户想要的是：

1. **扫一眼** — 知道是什么（标题、标签）
2. **了解更多** — 展开看内容/子节点/字段，不离开对话
3. **可能编辑** — 直接在原地修改
4. **或者继续聊** — 基于看到的信息继续对话
5. **偶尔跳转** — 需要深度编辑时才去 Outliner 面板

大部分时候停在第 1-3 步，跳转到面板是最后手段。

**三种呈现方式的重新定义**：

- **`<ref>` / `<cite>` 是引用** — "AI 在文字中提到了这个节点" → 点击弹**浮窗**查看详情
- **`<node />` 是展示** — "AI 要把这个节点的内容展示给用户" → **内嵌 outliner**，作为回答的一部分
- **工具执行块保持现状** — 它是执行过程，有存在意义

**关键决策**：

- 浮窗和内嵌 outliner **复用现有 OutlinerView / OutlinerItem 组件**，样式保持一致
- 不限制只读，不限制展开深度 — Chat 中的 outliner 跟面板里的**完全一样**，能编辑、能无限展开、能拖拽
- `<node />` 是新增的 block-level markup，独占一行，渲染为 mini outliner

---

## 改造内容

### 改造 1：`<ref>` / `<cite>` 点击 → 浮窗

**现在**：点击直接调用 `navigateTo(nodeId)` 跳转到节点面板。

**改为**：点击弹出 Popover 浮窗，内容是该节点的 OutlinerView。

**交互**：
- 点击 `<ref>` 或 `<cite>` → 弹出 Popover
- Popover 内容：`OutlinerView`，渲染该节点（标题 + 标签 + 字段 + 子节点）
- 用户可以在浮窗内展开子节点、编辑内容
- 浮窗底部/右上有"在面板中打开"按钮 → 调用 `navigateTo(nodeId)`
- 点击浮窗外部 / Esc → 关闭浮窗
- 节点不存在 → 保持现有的灰色删除线样式，点击无反应

**组件变更**：

| 文件 | 变更 |
|------|------|
| `src/components/chat/NodeReference.tsx` | 点击从 `navigateTo` 改为打开 Popover；Popover 内渲染 `OutlinerView` |
| `src/components/chat/CitationBadge.tsx` | 同上 |

**实现要点**：
- 使用 Radix UI `Popover`（项目已有 shadcn/ui 依赖）
- Popover 内的 `OutlinerView` 需要一个合理的固定宽度（跟 Chat 消息区域宽度一致或稍窄）和最大高度（带滚动）
- `OutlinerView` 在 Popover 中是否有依赖问题需要验证（见下方"OutlinerView 在 Chat 上下文中的依赖"）

### 改造 2：`<node />` 内嵌 outliner

**新增 markup**：AI 在回复中使用 `<node id="nodeId" />` 标记，渲染层将其替换为内嵌的 OutlinerView。

**三种 markup 的完整对比**：

| markup | 用途 | 位置 | 渲染 |
|--------|------|------|------|
| `<ref id="xxx">文本</ref>` | 行内提及 | 段落内 | 蓝色链接 → 点击弹浮窗 |
| `<cite id="xxx">N</cite>` | 引用证据 | 段落内 | 上标数字 → 点击弹浮窗 |
| `<node id="xxx" />` | 展示节点 | 独占一行 | 内嵌 OutlinerView |

**AI 回复示例**：

```
找到 3 条相关笔记：

<node id="abc123" />
<node id="def456" />
<node id="ghi789" />

这三条结合来看，涨 15% 比竞品激进但有用户数据支撑。
```

渲染效果：

```
找到 3 条相关笔记：

  ▸ 竞品定价对比  #source
  ▸ Q3 涨价决策  #decision
  ▸ 用户调研：价格敏感度  #research

这三条结合来看，涨 15% 比竞品激进但有用户数据支撑。
```

每个节点可展开，展开后显示子节点（完整的 OutlinerView），可继续展开、可编辑。

**组件变更**：

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/components/chat/NodeEmbed.tsx` | 新建 | 内嵌节点组件：加载节点数据 + 渲染 `OutlinerView` + 处理节点不存在 |
| `src/components/chat/MarkdownRenderer.tsx` | 修改 | `extractInlineMarkup()` 新增 `<node />` 自闭合标签解析；block-level 渲染为 `NodeEmbed` |

**Markdown 渲染管线变更**：

现有管线：
1. `extractInlineMarkup()` — 提取 `<ref>` / `<cite>`，替换为 `%%SOMA_N%%` 占位符
2. `splitMarkdownBlocks()` — markdown 分块
3. 渲染时 `injectPlaceholders()` — 占位符替换为 React 组件

新增处理：
1. 在 `extractInlineMarkup()` 中新增正则匹配 `<node\s+id="([^"]+)"\s*\/>`
2. `<node />` 是 block-level 的（独占一行），占位符应该生成为独立的 markdown 段落（不嵌在其他段落内）
3. `injectPlaceholders()` 中 `<node />` 的占位符替换为 `<NodeEmbed nodeId="xxx" />`

**streaming 容错**：
- AI 流式输出时可能出现不完整标签 `<node id="xxx`
- 现有 `<ref>` 处理已有类似容错（部分标签不替换，等完整后再处理）
- `<node />` 同样处理：正则只匹配完整的自闭合标签

**节点不存在处理**：
- `NodeEmbed` 组件内部用 `useNode(nodeId)` 加载数据
- 节点不存在 → 显示灰色提示文字 "Node not found"，不崩溃

**多个连续 `<node />`**：
- 连续的 `<node />` 标签渲染为紧凑列表（减小间距）
- 可以通过检测相邻的 `NodeEmbed` 组件来调整 margin

### 改造 3：首屏即 Chat

**现在**：打开 soma 侧边栏，默认显示 Outliner（最近节点面板）。

**改为**：打开 soma 侧边栏，默认显示 Chat 面板。

**实现**：修改初始面板栈配置，将默认面板从 node panel 改为 chat panel。

| 文件 | 变更 |
|------|------|
| `src/stores/ui-store.ts` 或 `src/entrypoints/sidepanel/App.tsx` | 修改初始 `panelHistory` 默认值，首屏指向 Chat |

### 改造 4：system reminder 注入已提及节点的编辑状态

**场景**：AI 在回答中提到了节点 A（通过 `<ref>` / `<cite>` / `<node />`）。用户随后在 Chat 内嵌的 outliner 中编辑了节点 A。AI 下一轮应该知道节点 A 被编辑过了。

**方案**：

1. **追踪已提及节点**：每次 AI 回复完成后（`agent_end` 事件），扫描回复内容中的 `<ref>` / `<cite>` / `<node />` 标签，提取 node ID + 提及时间，存在 session 级的内存状态中

2. **检测编辑**：在 `transformContext` / `buildSystemReminder()` 中，对已提及节点列表比对各节点的 `updatedAt`，找出提及后被编辑过的节点

3. **注入 system reminder**：

```
Nodes mentioned in this conversation that were edited since you last referenced them:
- "竞品定价对比" (id: abc123) — edited 3 minutes ago
- "Q3 涨价决策" (id: def456) — edited just now

Consider using node_read to check the latest content before referencing these nodes.
```

**范围限定**：只追踪**本次会话中 AI 提及过的节点**。不是所有最近编辑的节点（那样太多太吵）。

**组件变更**：

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/lib/ai-context.ts` | 修改 | `buildSystemReminder()` 新增已提及节点编辑状态检测 |
| `src/lib/ai-service.ts` | 修改 | `agent_end` 事件处理中新增提及节点扫描逻辑 |

---

## OutlinerView 在 Chat 上下文中的依赖

`OutlinerView` 和 `OutlinerItem` 目前在 `NodePanel` 中使用。嵌入 Chat（浮窗或内嵌）时需要验证以下依赖：

| 依赖 | 是否在 Chat 中可用 | 处理方式 |
|------|-------------------|----------|
| `useNode(nodeId)` | ✅ 全局 store | 无需处理 |
| `useChildren(nodeId)` | ✅ 全局 store | 无需处理 |
| 面板导航（`navigateTo`） | ✅ 全局 ui store | 无需处理 |
| 选择状态（`selectedNodeIds`） | ✅ 全局 ui store | 无需处理 |
| 拖拽（DragHandle） | ⚠️ 需要验证 | 浮窗内的拖拽可能需要限制拖拽边界 |
| 编辑器（NodeEditor） | ✅ 独立组件 | 聚焦/失焦创建销毁，无面板依赖 |

如果 `OutlinerView` 对面板上下文有强耦合（比如通过 Context Provider），需要在 Chat 上下文中提供等价的 Provider，或者将耦合解除。实际实现时逐个验证。

---

## system prompt 更新

在 `src/lib/ai-agent-node.ts` 的 system prompt 中添加 `<node />` 使用指导：

```
Node display in responses:
- Use <ref id="nodeId">display text</ref> for inline mentions within text.
- Use <cite id="nodeId">N</cite> for citations as evidence.
- Use <node id="nodeId" /> on its own line to display a node's content to the user.
  This renders as an interactive outliner the user can expand, browse, and edit.

Use <node /> when:
- Showing search results (list of found nodes)
- Showing a node you just created or edited
- Showing nodes the user should review or compare

Use <ref> when:
- Mentioning a node within a sentence ("your note <ref>xxx</ref> is relevant")
- The node is supplementary context, not the focus

Do not use <node /> for every node you mention. Reserve it for nodes
the user would benefit from seeing the content of.
```

---

## Checklist

### 改造 1：ref / cite → 浮窗

- [ ] `NodeReference.tsx`：点击行为从 `navigateTo` 改为打开 Radix Popover
- [ ] Popover 内容：渲染目标节点的 `OutlinerView`
- [ ] Popover 布局：合理的固定宽度 + 最大高度 + 滚动
- [ ] Popover 内"在面板中打开"按钮 → `navigateTo(nodeId)` + 关闭 Popover
- [ ] `CitationBadge.tsx`：同样改为 Popover（复用相同的 Popover 内容组件）
- [ ] 节点不存在时：保持现有灰色删除线样式，点击无反应（不弹 Popover）
- [ ] 验证 `OutlinerView` 在 Popover 上下文中正常工作（展开、编辑、拖拽）

### 改造 2：`<node />` 内嵌 outliner

- [ ] 新建 `src/components/chat/NodeEmbed.tsx`
  - [ ] Props: `nodeId: string`
  - [ ] 使用 `useNode(nodeId)` 加载节点数据
  - [ ] 渲染 `OutlinerView`（该节点为根，展示子节点）
  - [ ] 节点不存在 → 灰色 "Node not found" 提示
  - [ ] 紧凑样式：适合在 Chat 消息流中嵌入（减小上下间距）
- [ ] 修改 `MarkdownRenderer.tsx`
  - [ ] `extractInlineMarkup()` 新增 `<node\s+id="([^"]+)"\s*\/>` 正则
  - [ ] 将 `<node />` 替换为 block-level 占位符（独立段落）
  - [ ] `injectPlaceholders()` 中替换为 `<NodeEmbed nodeId="xxx" />`
  - [ ] streaming 容错：不完整的 `<node` 标签不替换，等完整后处理
- [ ] 连续多个 `<node />` 的紧凑渲染（减小相邻间距）
- [ ] system prompt 更新：在 `ai-agent-node.ts` 添加 `<node />` 使用指导

### 改造 3：首屏即 Chat

- [ ] 修改默认面板配置，打开 soma 时首屏显示 Chat
- [ ] 确保 Chat 面板的加载/恢复逻辑在首屏场景下正常工作

### 改造 4：已提及节点编辑状态注入

- [ ] 实现提及节点追踪：`agent_end` 事件后扫描回复中的 ref/cite/node 标签，记录 node ID + 时间
- [ ] 存储在 session 级内存状态中（不需要持久化，会话结束即清除）
- [ ] `buildSystemReminder()` 中对比已提及节点的 `updatedAt`，注入编辑提示
- [ ] 只注入"提及后被编辑过的"节点，不注入未变化的

### 通用

- [ ] 测试：新建 `tests/vitest/chat-node-display.test.ts`
  - [ ] `<node />` 标签解析（完整标签、不完整标签、多个连续标签）
  - [ ] NodeEmbed 组件（正常节点、不存在的节点）
  - [ ] 提及节点追踪（扫描 ref/cite/node、记录时间、检测编辑）
- [ ] `npm run verify`（typecheck → test-sync → test → build）

## 注意事项

1. **复用现有组件**：浮窗和内嵌都用 `OutlinerView` / `OutlinerItem`，不新建 outliner 渲染组件。样式跟面板中的 outliner 完全一致
2. **不限制交互**：Chat 中的 outliner 可编辑、可无限展开、可拖拽——跟面板里一样。人为限制反而要写额外代码
3. **`<node />` 是 block-level**：必须独占一行，不能嵌在段落内。markdown 解析时作为独立段落处理
4. **工具执行块保持现状**：`ToolCallBlock` 不做改动，它展示的是执行过程，有存在意义
5. **参考现有 markup 处理**：`<node />` 的解析逻辑参考 `<ref>` / `<cite>` 的 `extractInlineMarkup()` 实现，加入同一个管线
6. **AI 不应滥用 `<node />`**：system prompt 中明确指导——只在用户需要看到节点内容时使用，不是每次提到节点都用
7. **改造 4 依赖改造 2**：需要先有 `<node />` 标签，才能追踪提及的节点
