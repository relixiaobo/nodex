# Phase 1: 画板 — node tool + Chat 成熟

> 依赖：Phase 0 (基座)
> 可并行：Phase 3 (browser tool)
> 工具定义：`tool-definitions.md`（参数 schema + 返回值 + 设计模式）
> 研究文档：`docs/research/ai-context-engineering-gaps.md`（CiC 分析 + 决策清单）

---

## 目标

Agent 从"只能聊天"升级为**"能在 outliner 上行动"**。

> 主 agent 接收指令 → 理解意图 → 直接在画板上执行 → 在 Chat 中报告 → 接受反馈。

**交付物**：
1. 用户说"帮我整理今天的笔记" → agent 操作节点 → outliner 实时更新
2. Agent 执行结果可 undo（AI 操作与用户操作隔离）
3. Chat 对话持久化（关闭重开恢复）
4. System prompt 从 #agent 节点加载（英文编写，回复跟随用户语言）
5. Agent 文本中的节点引用可点击跳转（`<ref>` / `<cite>` 格式）

---

## node tool（5 actions）

> 完整参数 schema + 返回值 + 设计模式见 `tool-definitions.md`。本节只列实现要点。

### 关键设计决策

- **Tags 用显示名**：`tags: ['task', 'source']`，不用 ID。execute 层自动 fuzzy 匹配 → 解析为 tagDefId，未匹配则自动创建 tagDef
- **AI origin 隔离**：所有写操作 commit 用 origin `'ai:chat'`（与用户操作隔离，见 undo tool）
- **Content 支持 `<ref>`**：`content` 参数中的 `<ref id="nodeId">text</ref>` 会被转换为 ProseMirror inlineReference

### Action 定义

```typescript
const nodeTool: AgentTool = {
  name: 'node',
  description: '...', // 见 tool-definitions.md — CiC 质量标准
  parameters: Type.Object({
    action: StringEnum(['create', 'read', 'update', 'delete', 'search']),
    // 各 action 的参数见 tool-definitions.md
  }),
  execute: async (toolCallId, params, signal, onUpdate) => {
    // 路由到具体 action handler
    // 所有写操作通过 node-store → loroDoc.commitDoc('ai:chat')
  }
}
```

### create

- `parentId` 默认当天日记节点
- `tags` 用显示名，自动解析/创建
- `position` 默认末尾追加

### read（渐进式披露）

- `depth`：子树深度（default 1, max 3）
- `childOffset` + `childLimit`：分页（default 20, max 50）
- 返回 `children.total` 供翻页判断
- 包含 `fields`、`breadcrumb`、`parent` 信息

**关键**：children 只返回摘要（id / name / hasChildren / childCount / tags），agent 需要多次 read 来探索子树。避免一次返回几千节点撑爆 context。

### update

- `addTags` / `removeTags`（不是 `tags: { add, remove }`）
- `checked`：设置 checkbox 状态（true/false/null）
- `parentId` + `position`：移动节点
- Partial update — 只传需要改的字段

### delete

- 移到 Trash（可恢复），不是永久删除
- locked 节点拒绝删除（`node-capabilities.ts` 检查）

### search

- `query`：fuzzy 文本搜索（支持 CJK）
- `searchTags`：AND 过滤，用显示名
- `dateRange`：`{ from?, to? }` ISO 格式
- `limit` / `offset`：分页（default 20, max 50）

### 与 node-store 的集成

```
node tool execute()
  → node-store action (createChild / setNodeName / applyTag / trashNode / ...)
    → Loro CRDT 修改
      → loroDoc.commitDoc('ai:chat')  ← AI origin 前缀
        → UI 自动更新（notifySubscribers 触发）
```

**关键陷阱**（CLAUDE.md）：每个 store action 结束必须调用 `loroDoc.commitDoc()`，否则 UI 不更新。

---

## undo tool（AI 操作隔离）

> 完整定义见 `tool-definitions.md`。

### AI Undo 隔离机制

AI 的 undo 与用户的 ⌘Z 使用**独立的 UndoManager**，互不干扰：

```
AI 写操作 → commitDoc('ai:chat')
                ↓
主 UndoManager（⌘Z）        AI UndoManager（undo tool）
├── 不排除 'ai:' origin     ├── 排除所有非 'ai:' origin
├── 用户 ⌘Z 可撤销 AI 操作   ├── 只追踪 AI 操作
└── 也可撤销用户自己的操作    └── 不影响用户操作
```

**两个 UndoManager 共存于同一 LoroDoc**，各自通过 `excludeOriginPrefixes` 过滤不同 origin。

### 实现

```typescript
const undoTool: AgentTool = {
  name: 'undo',
  description: 'Undo recent AI operations. Only undoes AI operations — user edits are never affected.',
  parameters: Type.Object({
    steps: Type.Optional(Type.Number({ default: 1, maximum: 20 }))
  }),
  execute: async (toolCallId, params) => {
    let undone = 0;
    for (let i = 0; i < (params.steps ?? 1); i++) {
      if (aiUndoManager.undo()) undone++;
      else break;
    }
    return { undone, remaining: aiUndoManager.canUndo() ? '...' : 0 }
  }
}
```

---

## System Prompt 架构

### 语言与格式

- **系统 prompt 用英文编写**（LLM 理解英文指令最准确）
- **回复跟随用户语言**（系统 prompt 中明确说明）
- **XML 分层结构**（借鉴 CiC 模式）：role / capabilities / context / output_rules / safety

### #agent 系统节点

```
#agent: soma (主 agent)
  ├── 身份定义（system prompt 文本）
  ├── Always Active Skills
  │     ├── → ref to #skill "基础整理"
  │     └── → ref to #skill "标签建议"
  └── Rules（子节点）
        ├── 用户说"整理"时，保持现有结构，只加标签
        └── 不要在 Node 输入时插话
```

**#agent 节点是普通节点 + #agent 标签**——用户可在 outliner 中查看和编辑。**不 locked**（用户需要编辑 prompt、rules、模型配置等）。

### 动态上下文注入（`<system-reminder>`）

每轮对话注入动态上下文，统一用 `<system-reminder>` 标签（与 CiC 同一模式）：

```xml
<system-reminder>
<panel-context>
Current panel: Journal > 2026-03-12 (ID: ws_xxx_day_20260312)
Children (3):
  - "AI Research Notes" (id: abc123, 5 children)
  - "Meeting Record" (id: def456, 0 children)
  - "#task Buy coffee beans" (id: ghi789, checkbox: done)
</panel-context>

<page-context>
User is browsing: https://arxiv.org/abs/2403.xxxxx — "Attention Is All You Need"
</page-context>

<time-context>
Current time: 2026-03-12T14:30:00+08:00
</time-context>
</system-reminder>
```

按需注入——没有活动页面就不注入 `<page-context>`，没有选中节点就不注入 `<selection-context>`。

### System prompt 构建流程

```
Agent 初始化时：
  1. 读取 #agent 节点身份定义 → 基础 system prompt
  2. 加载 Always Active #skill 节点 Rules → 追加为 <skill-context>
  3. agent.setSystemPrompt(combined)

每轮对话前：
  4. 收集面板/页面/选中/时间上下文 → 注入 <system-reminder>
```

Phase 1 只实现 #agent + Always Active #skill 加载。按需 #skill 匹配在 Phase 2+ 完善。

---

## Reference 渲染

### 统一引用格式

Agent 输出两种引用，统一用 XML 标签：

| 类型 | 格式 | 用途 |
|------|------|------|
| Inline reference | `<ref id="nodeId">display text</ref>` | 正文中引用节点（作为回答的一部分） |
| Citation | `<cite id="nodeId">N</cite>` | 角标引用（作为证据，不直接作为回答） |

```
Agent: "I've added #meeting to <ref id="abc123">today's meeting notes</ref>
        and moved <ref id="def456">todos</ref> under today's journal.
        <cite id="ghi789">1</cite>"
```

### Consumer-side Materialization

**同一格式，不同消费场景各自物化**：

| 消费场景 | `<ref>` 物化为 | `<cite>` 物化为 |
|----------|---------------|----------------|
| Chat 消息渲染 | 可点击导航链接（不创建图谱边） | 角标数字，hover 显示节点摘要 |
| node.create `content` | ProseMirror `inlineReference` atom 节点 | ProseMirror `inlineReference` |
| node.create `children` | Reference 节点 (`type: 'reference', targetId`) | Reference 节点 |

### 失效处理

nodeId 指向已删除/不存在的节点 → 灰色 + 删除线，不可点击。

---

## Chat 持久化

来源：ai-strategy.md v6 "Chat 独立持久化"

> Chat 对话不作为节点存储在图谱中，独立于 outliner 持久化。避免对话消息混入知识节点。

### 存储方案

将 `agent.state.messages` 序列化到 IndexedDB：

```typescript
interface ChatSession {
  id: string
  messages: AgentMessage[]
  createdAt: number
  updatedAt: number
}
```

- 每次 agent 事件更新后，debounce 保存到 IndexedDB
- 打开 ChatDrawer → 从 IndexedDB 恢复上次对话
- "新对话" 按钮 → 清空当前 session，创建新 session
- **不存入 Loro CRDT**（Chat 不是节点）

### 存储大小控制

- 单个 session 最大保留 100 条消息（旧消息裁剪）
- Session 列表最大保留 10 个（旧 session 自动删除）

---

## API Key & Agent 配置（节点存储）

> "一切皆节点"原则——API key 和 agent 配置都存为节点字段，不走独立存储系统。

### API Key → Settings 节点字段

Phase 0 的 chrome.storage.local 临时方案迁移到 Settings 节点：

- **Settings 节点** 新增字段：`AI Provider`（下拉）、`API Key`（password 类型，显示为 `sk-ant-••••`）
- 数据在 Loro 中，随工作区同步
- 仍通过 Worker proxy 调用 LLM（key 在请求中传递，Worker 不存储）

### Agent 配置 → #agent 节点字段

- **Model**（下拉：claude-sonnet-4-5 / claude-opus-4 / ...）
- **Temperature**（数值）
- **Max Tokens**（数值）

**两者分开**：Settings = 全局配置（provider + key），#agent = agent 自身配置（model + params）。

---

## ⌘K 集成

来源：multi-panel-design.md §6 "与 AI Chat 的关系"

```
用户按 ⌘K → 输入 "帮我整理今天的笔记"
  → CommandPalette 检测到非搜索/非命令的自然语言输入
  → 打开 ChatDrawer + 发送指令
  → Chat 中显示对话
  → AI 在 Node 面板的 outliner 上执行操作
  → 用户在 Node 面板看到结果
```

### 判断逻辑

在 `palette-commands.ts` 或 `CommandPalette.tsx` 中添加：

```
输入匹配规则：
  1. 以 / 开头 → 命令模式（已有）
  2. 匹配已有节点名 → 搜索/导航模式（已有）
  3. 以"帮我"/"请"/"整理"等动词开头，或长度 > 20 字符且不匹配节点
     → AI Chat 模式 → openChat() + 发送
```

Phase 1 的判断逻辑可以简单——如果输入不匹配任何搜索结果和命令，提供一个 "Ask AI: {input}" 选项。

---

## Tool Call 渲染

Agent 执行 tool call 时，Chat 中展示操作摘要：

- **默认折叠**，显示工具图标 + 一行摘要（如 "Created node: 会议记录"）
- 点击展开显示完整参数和结果
- 错误的 tool call 以红色高亮

> Tool call 渲染**不阻塞主流程**，UI 优化后续迭代。Phase 1 实现最小可用版本。

---

## 执行 → 报告 → 反馈闭环

来源：ai-strategy.md §10 "通道 2: Chat 执行模式"

```
用户: "帮我整理一下今天记录的笔记"
  ↓
Agent 执行: node.search → node.update × N → node.create × M
  ↓
Agent 报告: "我做了以下整理：
    · 给 3 条笔记加了 #meeting 标签
    · 把 2 条 AI 相关的归到一起
    · 创建了 People 字段"
  ↓
用户三种反馈路径:
  "好"          → 接受，结束
  "#meeting 应该是 #1on1"  → Agent 调用 node.update 修正
  "撤回"         → Agent 调用 undo tool
```

来源：ai-strategy.md §10 "pi-agent-core 的 steering 机制"

> agent.steer(message) 可以在 agent 执行中途注入用户反馈——跳过剩余 tool call，注入新消息，agent 重新规划。

---

## 文件变更

| Action | File | Scope |
|--------|------|-------|
| **Create** | `src/lib/ai-tools/node-tool.ts` | node tool 定义 + 5 action handlers (~250 行) |
| **Create** | `src/lib/ai-tools/undo-tool.ts` | undo tool (~30 行) |
| **Create** | `src/lib/ai-tools/index.ts` | 工具注册表 |
| **Modify** | `src/lib/ai-service.ts` | Agent 初始化加载 tools + #agent system prompt |
| **Create** | `src/lib/ai-persistence.ts` | Chat 对话 IndexedDB 持久化 (~100 行) |
| **Create** | `src/lib/ai-agent-node.ts` | #agent 节点读取 + system prompt 构建 (~60 行) |
| **Create** | `src/components/chat/ToolCallBlock.tsx` | Tool call 渲染块 (~60 行) |
| **Create** | `src/components/chat/NodeReference.tsx` | 节点引用渲染 (~40 行) |
| **Modify** | `src/components/chat/ChatMessage.tsx` | 支持 tool call + reference 解析 |
| **Modify** | `src/components/chat/ChatDrawer.tsx` | "新对话" 按钮 + 持久化恢复（Phase 0 创建的根容器） |
| **Modify** | `src/lib/palette-commands.ts` | "Ask AI" 选项 |
| **Modify** | `src/components/search/CommandPalette.tsx` | AI Chat 模式入口 |
| **Create** | `src/lib/ai-context.ts` | 动态上下文收集 + `<system-reminder>` 构建 (~80 行) |
| **Modify** | `src/types/system-nodes.ts` | #agent 系统标签定义 |
| **Create** | `tests/vitest/node-tool.test.ts` | node tool 测试 |
| **Create** | `tests/vitest/undo-tool.test.ts` | undo tool 测试 |
| **Create** | `tests/vitest/ai-persistence.test.ts` | Chat 持久化测试 |

**高风险文件**：`node-store.ts`（node tool 调用 store actions）、`system-nodes.ts`（#agent 定义）

---

## Exact Behavior

### node.create

```
GIVEN Chat 已打开，agent 有 node tool
WHEN 用户输入 "帮我创建一个笔记，标题是'测试'"
THEN agent 调用 node.create({ name: '测试' })  ← parentId 默认 today journal
  AND outliner 中当天日记下出现新节点 "测试"
  AND Chat 中显示折叠的 tool call 摘要 + agent 报告
```

### node.update（标签操作）

```
GIVEN outliner 中有节点 "会议笔记"
WHEN 用户输入 "给会议笔记加上 #meeting 标签"
THEN agent 调用 node.search({ query: '会议笔记' }) 定位节点
  AND agent 调用 node.update({ nodeId, addTags: ['meeting'] })  ← 显示名，自动解析
  AND 节点标签实时更新
  AND Chat 报告用 <ref id="nodeId">会议笔记</ref> 引用
```

### undo（AI 操作隔离）

```
GIVEN agent 刚执行了一系列操作
  AND 用户在 AI 操作前有自己的编辑
WHEN 用户输入 "撤回"
THEN agent 调用 undo({ steps: N })
  AND aiUndoManager 回退 N 步 AI 操作
  AND 用户自己的编辑不受影响
  AND outliner 恢复到 AI 操作前状态
```

### Chat 持久化

```
GIVEN 用户与 agent 有一段对话（5+ 条消息）
WHEN 用户关闭浏览器，重新打开 Side Panel
THEN ChatDrawer 恢复上次对话内容
  AND 用户可以继续对话
```

### ⌘K → Chat

```
GIVEN 用户按 ⌘K 打开 CommandPalette
WHEN 用户输入 "帮我整理今天的笔记"
  AND 输入不匹配任何搜索结果/命令
THEN 列表中出现 "Ask AI: 帮我整理今天的笔记" 选项
WHEN 用户选择该选项
THEN ChatDrawer 打开
  AND 消息自动发送给 agent
```

---

## 验证标准

1. Chat 中输入"创建一个笔记" → outliner 中出现新节点（commit origin = `ai:chat`）
2. "给 X 加 #Y 标签" → 节点标签变更（tags 用显示名自动解析）→ Chat 显示 tool call 摘要
3. "撤回" → aiUndoManager 回退 → 只撤销 AI 操作，用户编辑不受影响
4. 关闭/重开 ChatDrawer → 对话历史恢复
5. ⌘K 中输入自然语言 → "Ask AI" 选项出现 → 点击跳转到 Chat
6. Agent 文本中的 `<ref id="...">text</ref>` 渲染为可点击导航链接
7. `npm run typecheck && npm run test:run && npm run build` 全过

---

## 提交策略

1. `feat: node tool — create/read/update/delete/search via Loro CRDT`
2. `feat: undo tool — Loro undoDoc wrapper`
3. `feat: tool call rendering — ToolCallBlock + NodeReference in Chat`
4. `feat: #agent system node — load system prompt from node tree`
5. `feat: Chat persistence — IndexedDB session storage`
6. `feat: ⌘K AI mode — natural language input opens ChatDrawer`
7. `test: node tool + undo tool + persistence unit tests`

---

## Out of Scope

- #skill 按需匹配和动态加载 → Phase 2
- browser tool → Phase 3（工具定义已在 `tool-definitions.md`）
- Planning mode（操作前确认） → Phase 3（browser 操作风险高时引入）
- Subagent 后台任务 → Phase 4
- Taste 学习 → Phase 5
- Markdown 渲染（Chat 消息）→ 独立排期
- 多 session 管理 UI（对话历史列表）→ 独立排期

---

## 历史备注

> **Phase 1.5 重构**：Phase 1 完成后，实际使用中发现单 `node` 工具（5 actions）存在多项问题——便利参数缺失导致 AI 需要多次 round-trip、搜索能力未接入已有基础设施（search-engine / filter-utils / backlinks / sort-utils）等。Phase 1.5 将其拆分为 6 个独立工具（`node_create` / `node_read` / `node_edit` / `node_delete` / `node_search` / `undo`），详见 `phase-1.5-node-tool-gaps.md`。
>
> 本文档保留原始 Phase 1 设计作为历史参考。后续 Phase 应基于 Phase 1.5 的工具定义（`tool-definitions.md`）。
