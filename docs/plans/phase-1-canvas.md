# Phase 1: 画板 — node tool + Chat 成熟

> 依赖：Phase 0 (基座)
> 可并行：Phase 3 (browser tool)
> 来源：ai-strategy.md §9 "Tool 1: node" + §10 "通道 2: Chat" + §13 "Reference 原则"

---

## 目标

Agent 从"只能聊天"升级为**"能在 outliner 上行动"**——这是 ai-strategy.md 中**执行模式**的核心。

来源：ai-strategy.md §10 "通道 2: Chat"

> 主 agent 接收指令 → 理解意图 → 匹配 #skill → 直接在画板上执行 → 在 Chat 中报告 → 接受反馈。

**交付物**：
1. 用户说"帮我整理今天的笔记" → agent 操作节点 → outliner 实时更新
2. Agent 执行结果可 undo（Loro CRDT）
3. Chat 对话持久化（关闭重开恢复）
4. System prompt 从 #agent 节点加载
5. Agent 文本中的节点引用可点击跳转

---

## node tool（5 actions）

来源：ai-strategy.md §9 "Tool 1: node（知识图谱操作）"

### Action 定义

```typescript
const nodeTool: AgentTool = {
  name: 'node',
  description: 'Create, read, update, delete, or search knowledge graph nodes',
  parameters: Type.Object({
    action: StringEnum(['create', 'read', 'update', 'delete', 'search']),
    // 各 action 的参数（见下方详细定义）
  }),
  execute: async (toolCallId, params, signal, onUpdate) => {
    // 路由到具体 action handler
    // 所有写操作通过 node-store → loroDoc.commitDoc()
  }
}
```

### create

```typescript
// 创建节点
{
  action: 'create',
  name: string,           // 节点名称
  parentId?: string,      // 父节点 ID（默认当天日记节点）
  position?: number,      // 在 children 中的位置
  tags?: string[],        // 标签 ID 列表
  content?: string,       // 描述文本
}
// → 返回 { id, name, parentId }
```

### read（渐进式披露）

来源：ai-strategy.md §9 "read 的渐进式披露"

```typescript
// 读取节点（不一次获得整棵子树）
{
  action: 'read',
  nodeId: string,
}
// → 返回 {
//   id, name, tags, fields,
//   children: [
//     { id, name, hasChildren, childCount }  // 摘要，不展开
//   ]
// }
```

**关键**：children 只返回摘要（id / name / hasChildren / childCount），agent 需要多次 read 来探索子树。这避免了一次返回几千个节点撑爆 context。

### update

```typescript
// 更新节点属性
{
  action: 'update',
  nodeId: string,
  name?: string,
  tags?: { add?: string[], remove?: string[] },
  parentId?: string,       // 移动到新父节点
  position?: number,       // 新位置
  content?: string,        // 更新描述
}
// → 返回 { id, name, updated: true }
```

### delete

```typescript
// 删除节点（移到 Trash）
{
  action: 'delete',
  nodeId: string,
}
// → 返回 { id, deleted: true }
```

**安全**：delete 实际是移到 Trash 节点（可恢复），不是永久删除。locked 节点不可删除（`node-capabilities.ts` 检查）。

### search

```typescript
// 搜索节点
{
  action: 'search',
  query?: string,          // 文本搜索
  tags?: string[],         // 按标签过滤
  dateRange?: {            // 按日期过滤
    start?: string,        // ISO date
    end?: string,
  },
  limit?: number,          // 结果数量限制（默认 20）
}
// → 返回 [{ id, name, tags, snippet, createdAt }]
```

**复用**：search 复用现有的搜索基础设施（CommandPalette 使用的 fuzzy search + 节点遍历）。

### 与 node-store 的集成

所有写操作（create / update / delete）通过 `node-store.ts` 的 actions 执行：

```
node tool execute()
  → node-store action (createNode / updateNode / deleteNode)
    → Loro CRDT 修改
      → loroDoc.commitDoc()
        → UI 自动更新（subscribe 触发）
```

**关键陷阱**（CLAUDE.md）：每个 store action 结束必须调用 `loroDoc.commitDoc()`，否则 `doc.subscribe` 不触发 → UI 不更新。

---

## undo tool

来源：ai-strategy.md §9 "Tool 3: undo"

```typescript
const undoTool: AgentTool = {
  name: 'undo',
  description: 'Undo recent node operations',
  parameters: Type.Object({
    steps: Type.Optional(Type.Number({ default: 1 }))
  }),
  execute: async (toolCallId, params) => {
    for (let i = 0; i < (params.steps ?? 1); i++) {
      loroDoc.undoDoc()
    }
    return { undone: params.steps ?? 1 }
  }
}
```

基于 Loro CRDT 的 `undoDoc()`。Agent 的安全网——做错了直接撤回。

---

## System Prompt 从 #agent 节点加载

来源：ai-strategy.md §7 "#agent vs #skill"

Phase 0 硬编码的 system prompt 迁移为从 `#agent` 节点读取。

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

**#agent 节点是普通节点 + #agent 标签**——用户可在 outliner 中查看和编辑。不 locked。

### System prompt 构建

```
Agent 初始化时：
  1. 读取 #agent 节点的身份定义
  2. 加载 Always Active #skill 节点的 Rules
  3. 拼接为 system prompt
  4. agent.setSystemPrompt(combined)
```

Phase 1 只实现 #agent 节点加载。#skill 匹配和加载在 Phase 2+ 完善。

---

## Reference 渲染

来源：ai-strategy.md §13 "Reference 原则"

### 在 Chat 中的 Reference

> Chat 中的 reference = 可点击**导航链接**（不创建图谱边）。

Agent 返回的文本中引用节点时使用格式：`[[nodeId|显示文本]]`

```
Agent: "我已经给 [[ws1_abc123|今天的会议笔记]] 加了 #meeting 标签，
        并把 [[ws1_def456|待办事项]] 移到了日记下面。"
```

Chat 消息渲染时：
- 解析 `[[nodeId|text]]` 格式
- 渲染为带颜色的可点击文本
- 点击 → `navigateTo(nodeId)`

### 在画板上的 Reference

> 画板上的 reference = 真实图谱边（持久化）。

Agent 通过 node tool 创建的 reference 是真实的 inline reference 节点，出现在 outliner 中。

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

## API Key 服务端迁移

来源：ai-strategy.md §15

> BYOK 用户的 key 也通过 Worker 代理（加密传输，不在客户端明文存储）

Phase 0 的 chrome.storage.local 临时方案迁移到 D1 加密存储：

```
设置 key 流程：
  用户在 ChatDrawer 中输入 API key
  → POST /api/ai/keys { provider: 'anthropic', key: 'sk-ant-...' }
  → Worker 加密后存入 D1
  → 客户端只保存 { hasKey: true, provider: 'anthropic' }

使用 key 流程：
  Agent streamProxy 请求不再携带 API key
  → Worker 从 D1 读取并解密
  → Worker 用解密后的 key 调用 LLM
```

**加密方案**：AES-GCM，密钥从 Worker 环境变量 `AI_KEY_ENCRYPTION_SECRET` 派生。

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

Agent 执行 tool call 时，Chat 中需要展示 agent 做了什么：

```
┌──────────────────────────────┐
│ 🤖 Assistant                  │
│                              │
│ 我来帮你整理今天的笔记。     │
│                              │
│ ┌─ node.update ──────────┐   │
│ │ 给 "会议笔记" 加了      │   │
│ │ #meeting 标签           │   │
│ └────────────────────────┘   │
│                              │
│ ┌─ node.update ──────────┐   │
│ │ 把 "待办" 移到日记下面  │   │
│ └────────────────────────┘   │
│                              │
│ 整理完成，你看看？           │
└──────────────────────────────┘
```

Tool call 块样式：
- 浅灰背景 `bg-foreground/[0.03]`
- 小字体显示 action + 参数摘要
- 可折叠（默认展开，用户可折叠）

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
| **Modify** | `server/src/routes/ai.ts` | API key 加密存储/检索端点 |
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
THEN agent 调用 node.create({ name: '测试', parentId: todayJournalId })
  AND outliner 中当天日记下出现新节点 "测试"
  AND Chat 中显示 tool call 块 + agent 报告
```

### node.update（标签操作）

```
GIVEN outliner 中有节点 "会议笔记"
WHEN 用户输入 "给会议笔记加上 #meeting 标签"
THEN agent 调用 node.search({ query: '会议笔记' }) 定位节点
  AND agent 调用 node.update({ nodeId, tags: { add: ['meetingTagId'] } })
  AND 节点标签实时更新
  AND Chat 中报告
```

### undo

```
GIVEN agent 刚执行了一系列操作
WHEN 用户输入 "撤回"
THEN agent 调用 undo({ steps: N })
  AND Loro CRDT 回退 N 步
  AND outliner 恢复到操作前状态
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

1. Chat 中输入"创建一个笔记" → outliner 中出现新节点
2. "给 X 加 #Y 标签" → 节点标签变更 → Chat 中显示 tool call 块
3. "撤回" → Loro undo → outliner 恢复
4. 关闭/重开 ChatDrawer → 对话历史恢复
5. ⌘K 中输入自然语言 → "Ask AI" 选项出现 → 点击跳转到 Chat
6. Agent 文本中的 `[[nodeId|text]]` 渲染为可点击链接
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

- API key D1 加密存储 → 可在 Phase 1 后期或独立 PR
- #skill 匹配和加载 → Phase 2
- browser tool → Phase 3
- Subagent 后台任务 → Phase 4
- Taste 学习 → Phase 5
- Markdown 渲染（Chat 消息）→ 独立排期
- 多 session 管理 UI（对话历史列表）→ 独立排期
