# Phase 4: 编排 — AgentOrchestrator

> 依赖：Phase 1 (稳定的 agent + tool 体系)
> 可并行：Phase 2 (Clip & Spark)
> 来源：`docs/research/multi-agent-orchestration.md` (完整调研) + ai-strategy.md §7 "Subagent" + §15 "多 Agent 通信架构"

---

## 目标

复杂任务不阻塞 Chat。主 agent 委派 subagent 并发执行，立即回到对话。

来源：ai-strategy.md §7

> Chat 永不阻塞。主 agent 接到复杂任务 → 创建 subagent 并发执行 → **立即回到 Chat 继续对话**。

**交付物**：用户说"从这 5 个页面提取定价信息" → 主 agent 委派 subagent → Chat 不阻塞 → 任务指示器显示进度 → 完成后 Chat 中报告。

### MV3 约束：Sidepanel-Only 模型

来源：README.md 跨 Phase 决策 #8 "运行时宿主模型"

**Subagent 不是"后台进程"——它们是 Side Panel 进程内的并发 async 任务。** 关闭 Side Panel = 所有 subagent 终止。

这意味着：
- Subagent 和主 agent 共享同一个 JS 事件循环（已在"并发模型"章节描述）
- 不存在"面板关闭后继续执行"的场景
- "后台任务"在这里指"不阻塞 Chat 的并发任务"，不是"操作系统级后台进程"
- EventTarget message bus 是进程内通信，不是跨进程 IPC

---

## 选型决策

来源：multi-agent-orchestration.md §2-§5

调研了 10+ 框架（Google ADK、OpenAI Agents SDK、LangGraph.js、KaibanJS、Vercel AI SDK 6、CrewAI、AutoGen、Mastra、Claude Agent SDK）后的结论：

> **没有现成框架满足我们的约束**——浏览器单进程 + CRDT 数据层 + mid-task clarification + 轻量 bundle。在 pi-agent-core 上自建 AgentOrchestrator。

| 约束 | 现有框架覆盖 | 差距 |
|------|------------|------|
| 浏览器单进程 | 只有 KaibanJS 和 pi-agent-core | 多数假设 Node.js |
| 并发独立 agent | Google ADK、LangGraph | 但紧耦合其 LLM 层 |
| 中途求助（clarification） | **无框架解决** | 全部假设单向委派 |
| 共享 CRDT 数据层 | **无框架集成** | 全部用自己的状态管理 |
| 轻量 bundle | pi-agent-core ~201KB | 其余 500KB+ |
| steer/followUp | 只有 pi-agent-core | 唯一支持流式中途注入 |

来源：multi-agent-orchestration.md §5 "What Existing Frameworks Don't Solve for Us"

---

## 双层通信模型

来源：multi-agent-orchestration.md §4 Pattern 4 (Hybrid) + §6

**数据通过 Loro CRDT（blackboard），协调通过 EventTarget（message bus）**：

```
Loro CRDT (Blackboard — 数据交换)       EventTarget (Message Bus — 协调信号)
├── 结果节点                           ├── task-delegated
├── 进度节点                           ├── task-progress
└── 协作数据（Agent A → B）            ├── task-completed / task-failed
                                       ├── clarification-needed / response
                                       ├── task-cancelled
                                       └── data-available
```

**为什么不用单一方案**：
- 纯 Blackboard：无法实现结构化的 request/response（clarification 需要）
- 纯 Message Bus：数据在消息中传递不持久化，违背"一切皆节点"

---

## 核心抽象

来源：multi-agent-orchestration.md §6 "Core Abstractions"

### Message Bus

```typescript
interface AgentMessage {
  id: string
  from: string              // agent ID
  to: string | '*'          // 目标 agent 或广播
  type: AgentMessageType
  payload: unknown
  timestamp: number
}

type AgentMessageType =
  | 'task-delegated'
  | 'task-progress'
  | 'task-completed'
  | 'task-failed'
  | 'clarification-needed'
  | 'clarification-response'
  | 'task-cancelled'
  | 'data-available'
```

**实现**：EventTarget（浏览器原生 API，零依赖）

来源：multi-agent-orchestration.md §6 "Message Bus Implementation"

```typescript
class AgentMessageBus {
  private target = new EventTarget()
  private queues = new Map<string, AgentMessage[]>()

  send(msg: AgentMessage): void {
    this.target.dispatchEvent(new CustomEvent(msg.to, { detail: msg }))
    this.target.dispatchEvent(new CustomEvent(msg.type, { detail: msg }))
  }

  subscribe(agentId: string, handler: (msg: AgentMessage) => void): () => void { ... }
  subscribeType(type: AgentMessageType, handler: (msg: AgentMessage) => void): () => void { ... }
}
```

### SubagentHandle

```typescript
interface SubagentHandle {
  id: string
  agent: Agent              // pi-agent-core Agent 实例
  task: TaskDescriptor
  status: 'running' | 'waiting-clarification' | 'completed' | 'failed' | 'cancelled'
  abortController: AbortController
}

interface TaskDescriptor {
  id: string
  description: string       // 自然语言任务描述
  skills: string[]          // #skill 节点 ID
  tools: AgentTool[]        // 可用工具
  parentTaskId?: string     // 子任务链
  outputNodeIds?: string[]  // 结果写入的 Loro 节点 ID
}
```

### AgentOrchestrator

```typescript
class AgentOrchestrator {
  private mainAgent: Agent
  private subagents: Map<string, SubagentHandle>
  private bus: AgentMessageBus

  async delegate(task: TaskDescriptor): Promise<string>  // 返回 subagent ID
  async cancel(subagentId: string): Promise<void>
  getStatus(): SubagentStatus[]
  on(event: OrchestratorEvent, handler: Function): Unsubscribe
}
```

预估代码量：~200-300 行 TypeScript，零新依赖。

---

## 四种通信场景

来源：multi-agent-orchestration.md §6

| 场景 | 方向 | 机制 |
|------|------|------|
| **委派** | 主 → subagent | 创建 Agent 实例 + `task-delegated` 消息 |
| **求助** | subagent → 主 | `clarification-needed` → 主判断或转问用户 → `clarification-response` |
| **完成** | subagent → 主 | 结果写入 Loro CRDT + `task-completed` 消息 |
| **取消** | 主 → subagent | `agent.abort()` + `task-cancelled` 消息 |
| **协作** | subagent ↔ subagent | Loro CRDT 节点写入 + subscription 监听 |

### 求助流（关键差异化能力）

来源：multi-agent-orchestration.md §6 "Clarification Flow"

```
Subagent 执行中遇到歧义
  → clarification-needed { question: "页面有两个价格表，用哪个？" }
  → subagent 状态: running → waiting-clarification

主 agent 收到 → 判断：
    ├── 自行回答（有足够上下文）
    └── 转问用户（在 Chat 中显示）

主 agent 回复
  → clarification-response { answer: "用 Enterprise 的" }
  → subagent 恢复执行
```

利用 pi-agent-core 的 `steer()` 机制——clarification 消息通过 steer() 注入主 agent 的对话流。

来源：ai-strategy.md §15 "pi-agent-core 的 steering 机制"

### 取消流

来源：multi-agent-orchestration.md §6 "Cancellation"

```typescript
async cancel(subagentId: string): Promise<void> {
  const handle = this.subagents.get(subagentId)
  handle.abortController.abort()      // 信号 abort
  handle.agent.abort()                 // pi-agent-core abort
  this.bus.send({ type: 'task-cancelled', ... })
  handle.status = 'cancelled'
  this.subagents.delete(subagentId)
}
```

### Inter-Subagent 协作

来源：multi-agent-orchestration.md §6 "Inter-Subagent Collaboration"

首选 **Pipeline via Loro CRDT**（"一切皆节点"）：

```
Agent A 写 URL 节点到特定父节点
  → Agent B 通过 Loro subscription 监听该父节点的 children
  → 新 URL 出现 → Agent B 自动开始提取
```

数据持久化在节点图谱中（用户可见），CRDT 自动处理并发写入。

---

## 并发模型（进程内异步）

来源：multi-agent-orchestration.md §7 + README.md 跨 Phase 决策 #8

所有 agent 运行在 Side Panel 同一 JS 进程中，共享事件循环。每个 agent 的 LLM 调用是 async（fetch/SSE），天然并发：

```
时间 ───────────────────────────────→
Main Agent:  [等LLM]     [处理用户输入]  [等LLM]
Subagent A:         [执行工具]   [等LLM]        [执行工具]
Subagent B:              [等LLM]    [执行工具]
```

**为什么不用 Web Worker**：
- Web Worker 不能访问 DOM、chrome.* API、共享 Loro CRDT
- Agent 是 I/O 密集型（等 LLM API），不是 CPU 密集型
- 序列化 state 的开销大于收益

来源：multi-agent-orchestration.md §7 "Why no Web Workers"

---

## 并发任务 UI

来源：ai-strategy.md §7

> Chat 面板右上角显示并发任务指示器（badge + 任务列表），用户可查看进度、取消任务。

### 任务指示器设计

```
ChatDrawer header:
┌──────────────────────────────┐
│ Chat            [●2] [⚙]    │  ← ●2 = 2 个并发任务
└──────────────────────────────┘

点击 badge 展开任务列表：
┌──────────────────────────────┐
│ Running Tasks                │
│                              │
│ ● Extracting pricing...  [✕] │  ← running, 可取消
│ ◐ Waiting: which table?  [→] │  ← waiting-clarification, 可回答
│ ✓ Data extraction done       │  ← completed
└──────────────────────────────┘
```

---

## 分步实施

来源：multi-agent-orchestration.md §9 "Implementation Phases"

### Step 1: 单 subagent, fire-and-forget

- AgentOrchestrator + delegate() + cancel()
- 主 agent 一次只 spawn 一个 subagent
- Subagent 结果写入 Loro CRDT
- 完成通知 via EventTarget
- UI: Chat header 中的 badge

### Step 2: 并发 subagent + 进度

- 多个同时运行的 subagent
- Progress 更新 via message bus
- 任务列表 UI（running / completed / failed）
- 取消单个任务

### Step 3: 求助流

- Subagent-to-main clarification
- 主 agent 决策：自行回答 or 转问用户
- Waiting 状态

### Step 4: Inter-agent 协作

- Pipeline via Loro CRDT subscriptions
- Agent A 写数据 → Agent B 观察并处理
- 任务间依赖追踪

---

## 文件变更

| Action | File | Scope |
|--------|------|-------|
| **Create** | `src/lib/ai-orchestrator.ts` | AgentOrchestrator (~200-300 行) |
| **Create** | `src/lib/ai-message-bus.ts` | EventTarget message bus (~50 行) |
| **Create** | `src/lib/ai-orchestrator-types.ts` | AgentMessage / TaskDescriptor / SubagentHandle 类型 |
| **Modify** | `src/lib/ai-service.ts` | 主 agent 处理 clarification routing |
| **Create** | `src/components/chat/TaskIndicator.tsx` | 并发任务 badge (~40 行) |
| **Create** | `src/components/chat/TaskList.tsx` | 任务列表（running/waiting/completed）(~80 行) |
| **Modify** | `src/components/chat/ChatPanel.tsx` | header 加 TaskIndicator |
| **Create** | `tests/vitest/ai-orchestrator.test.ts` | Orchestrator 测试 |
| **Create** | `tests/vitest/ai-message-bus.test.ts` | Message bus 测试 |

---

## Exact Behavior

### 委派后台任务

```
GIVEN Chat 已打开，agent 可用
WHEN 用户输入 "从 Anthropic、OpenAI、Google 三个定价页提取所有模型价格"
THEN 主 agent 判断这是复杂任务，需要后台执行
  AND 主 agent 在 Chat 中回复 "我会在后台处理这个任务，你可以继续聊天"
  AND 创建 subagent，状态为 running
  AND Chat header 出现任务 badge (●1)
  AND 用户可以继续在 Chat 中对话（主 agent 不阻塞）
```

### 任务完成通知

```
GIVEN 一个 subagent 在后台执行
WHEN subagent 完成任务
THEN 结果节点写入 Loro CRDT（outliner 中出现新节点）
  AND task-completed 消息发送
  AND 主 agent 在 Chat 中报告 "定价信息提取完成，已创建 [[LLM 价格对比]] 节点"
  AND badge 数字减少
```

### 求助流

```
GIVEN 一个 subagent 在后台执行
WHEN subagent 遇到歧义
THEN subagent 发送 clarification-needed
  AND subagent 状态变为 waiting-clarification
  AND 主 agent 在 Chat 中显示 "后台任务需要你的输入：页面有两个价格表，用哪个？"
WHEN 用户回答
THEN 主 agent 发送 clarification-response
  AND subagent 恢复执行
```

### 取消任务

```
GIVEN 一个 subagent 在后台执行
WHEN 用户点击任务列表中的 ✕ 按钮
THEN agent.abort() 终止 subagent
  AND task-cancelled 消息发送
  AND 任务从列表中移除
  AND 已创建的部分结果保留在 Loro CRDT 中（不自动删除）
```

---

## 验证标准

1. 主 agent 委派 subagent → Chat 不阻塞（用户可继续对话）
2. Subagent 完成 → 结果出现在 outliner + Chat 中报告
3. Subagent 求助 → Chat 中出现问题 → 用户回答 → subagent 恢复
4. 取消 → subagent 正确终止（无残留 Promise/listener）
5. 多个 subagent 并发执行无冲突
6. `npm run typecheck && npm run test:run && npm run build` 全过

---

## 提交策略

1. `feat: AgentMessageBus — EventTarget-based coordination bus`
2. `feat: AgentOrchestrator — single subagent delegation + cancellation`
3. `feat: concurrent task UI — badge + task list in ChatDrawer`
4. `feat: concurrent subagents + progress updates`
5. `feat: clarification flow — subagent mid-task question routing`
6. `test: orchestrator + message bus unit tests`

---

## Out of Scope

- Inter-agent 协作 pipeline → Phase 4 Step 4（内部分步）
- Subagent 专用 system prompt 从 #skill 节点加载 → Phase 5
- 任务依赖图可视化 → 未排期
- 跨会话任务恢复（面板关闭后恢复中断的 subagent）→ 未排期（Sidepanel-Only 模型下关闭 = 终止）
