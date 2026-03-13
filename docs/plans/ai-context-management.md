# AI 上下文管理重构方案

> **目标**：充分利用 pi-agent-core 的标准钩子，让上下文组装清晰、分层、可扩展。不重复造轮子——pi-mono 提供的能力直接用。

## 现状问题

### 1. 职责混乱：streamFn 承担了上下文编排

```
当前流程：
streamChat()
  → configureAgent()          // 读 #agent 配置，一次性设置 systemPrompt + tools + model
      → setSystemPrompt(base prompt + ALL skill rules)   ← 全量注入
  → agent.prompt()
      → streamFn()            // 本应只负责"转发到 proxy"
          → buildSystemReminder()  ← 在这里注入 panel/page/time 上下文
          → 拼接到 systemPrompt 末尾
          → streamProxy()
```

**问题**：
- `streamFn` 同时做了"上下文注入"和"网络转发"两件事
- pi-agent-core 提供了 `transformContext` 钩子专门做上下文变换，但没有使用
- system prompt 在两个地方被修改（`configureAgent` 和 `streamFn`），难以追踪最终发给 LLM 的内容

### 2. 没有利用 pi-mono 提供的能力

| pi-mono 能力 | 用途 | 当前状态 |
|---|---|---|
| `transformContext` | 上下文变换（注入/压缩） | 未使用，逻辑散落在 streamFn |
| `convertToLlm` | 自定义消息类型 → LLM 格式 | 未使用 |
| Custom message types | 声明合并扩展 AgentMessage | 未使用 |
| `getApiKey` | Agent 构造参数，自动传给 provider | 未使用，在 streamFn 手动解析 |
| `model.contextWindow` | 模型上下文窗口大小 | 未使用 |
| `AssistantMessage.usage` | 实际 token 用量 | 未使用 |
| `isContextOverflow()` | 检测 LLM 溢出错误 | 未使用 |

### 3. Skill 全量注入，没有渐进式披露

```
当前：
systemPrompt = base prompt + <skill-context>ALL active skill rules</skill-context>

问题：
- 5 个 skill × 10 条规则 = 50+ 行始终占用 token
- AI 大部分时候不需要这些规则
- 无法根据对话上下文动态选择相关 skill
```

### 4. 没有上下文窗口管理

- 全量历史发送，无裁剪
- 长对话会超出 token 限制
- 没有利用 `transformContext` 做消息裁剪

## 目标架构

```
streamChat()
  → configureAgent()                     // 只设置 model + temperature + maxTokens
  → agent.prompt()
      → transformContext(messages)        // pi-agent-core 标准钩子
          → 1. compactIfNeeded()          // token 超阈值时 Handoff 压缩
          → 2. injectSystemReminder()     // panel/page/time 注入到最后一条 user 消息
          → return transformedMessages
      → convertToLlm(messages)           // 自定义消息类型 → LLM 格式（bridge → user）
      → streamFn()                        // 纯粹的网络转发，不做上下文操作
          → streamProxy()
```

### 关键变化

| 维度 | 现在 | 目标 |
|------|------|------|
| **system prompt** | base + all skills + system reminder（拼接） | base prompt only（稳定） |
| **skill 上下文** | 全量规则塞进 system prompt | name+description 索引 → 按需注入 |
| **dynamic context** | 在 streamFn 里手动拼接 | 通过 transformContext 标准注入 |
| **streamFn** | 上下文编排 + 网络转发 + API key 解析 | 纯网络转发 |
| **API key** | streamFn 内手动获取 | `getApiKey` 构造参数，pi-mono 自动处理 |
| **context 压缩** | 无 | transformContext 中 token 超阈值自动 Handoff 压缩 |
| **Bridge Message** | 不存在 | 自定义消息类型 `role: "bridge"`，`convertToLlm` 转换 |
| **token 追踪** | 无 | `AssistantMessage.usage` 实际用量 + `model.contextWindow` 阈值 |
| **溢出保护** | 无 | `isContextOverflow()` 兜底检测 |

## 详细设计

### 第一步：将 dynamic context 迁移到 transformContext + 清理 streamFn

**文件变更**：
- `ai-service.ts`：Agent 创建时注册 `transformContext`、`convertToLlm`、`getApiKey`，简化 `streamFn`

```typescript
// ai-service.ts — createAgent()
new Agent({
  // API key 解析交给 pi-mono
  getApiKey: async () => {
    const key = await getApiKey();
    return key ?? undefined;
  },

  // 上下文变换：注入 system reminder 到最后一条 user 消息
  transformContext: async (messages, signal) => {
    const reminder = await buildSystemReminder();
    return injectReminder(messages, reminder);
  },

  // 自定义消息类型转换（Step 4 加入 bridge 处理，此步先透传）
  convertToLlm: (messages) => {
    return messages.filter(m =>
      m.role === 'user' || m.role === 'assistant' || m.role === 'toolResult'
    );
  },

  // streamFn 只负责网络转发
  streamFn: async (activeModel, context, options = {}) => {
    const authToken = await getStoredToken();
    if (!authToken) throw new Error('Please sign in to use Chat');

    const runtime = getAgentRuntimeState(agent);
    return streamProxy(activeModel, context, {
      ...options,
      temperature: runtime.temperature,
      maxTokens: runtime.maxTokens,
      authToken,
      proxyUrl: getSyncApiUrl(),
    });
  },
});
```

**注入方式**：system reminder 作为最后一条 user message 的附加内容（而非拼接到 systemPrompt），这样：
- system prompt 保持稳定（不是每次调用都不同）
- 动态上下文与消息历史在同一层级
- 符合 pi-agent-core 的 `transformContext` 设计意图

### 第二步：Skill 渐进式披露

**核心思路**：

| 层级 | 内容 | 何时注入 |
|------|------|----------|
| L0 | skill name + description 索引 | 始终在 system prompt 中 |
| L1 | 完整 skill rules | AI 判断需要时，通过 tool call 拉取 |

**System prompt 中的 skill 索引（轻量）**：

```xml
<available-skills>
  <skill id="NDX_T05" name="从文章提取认知框架" description="提取核心论证结构、隐形假设和边界条件" />
  <skill id="NDX_T06" name="对比分析" description="识别两个概念的共性和差异" />
</available-skills>
When you need a skill's detailed rules, use node_read to read the skill node's children.
```

**复用 node_read**（不新增工具）：
- 索引中给出 skill node id，AI 用 `node_read(id, depth=1)` 读取规则
- 符合"一切皆节点"原则

### 第三步：System Prompt 分层

最终的 system prompt 结构（稳定，不随每次消息变化）：

```
[1. Identity & behavior — 从 #agent 节点 children 读取]
You are soma, an AI collaborator inside the user's knowledge graph.
...

[2. Tool usage guidance — 固定]
Use tools when the user asks you to inspect, create, edit, delete, search, or undo nodes.
When you mention an existing node, use <ref id="nodeId">display text</ref>.
...

[3. Skill index — 从 #agent.Skills 字段读取，只有 name+description]
<available-skills>
  <skill id="..." name="..." description="..." />
</available-skills>
When you need a skill's detailed rules, use node_read to read the skill node's children.
```

动态上下文（panel/page/time）不再进 system prompt，而是通过 `transformContext` 注入到消息流中。

### 第四步：Context 自动压缩（Handoff Memo 模式）

核心思想：压缩不是"总结对话"，而是**给接替你的同事写一份交接备忘录**。用同一模型生成（命中 prompt cache），用 Bridge Message 无缝衔接（用户无感知）。

#### 自定义消息类型：Bridge Message

利用 pi-agent-core 的声明合并，定义 `bridge` 消息类型：

```typescript
// ai-types.ts
declare module '@mariozechner/pi-agent-core' {
  interface CustomAgentMessages {
    bridge: {
      role: 'bridge';
      content: string;   // Handoff Memo + 节点快照，填入 Bridge Template
      timestamp: number;
    };
  }
}
```

Bridge Message 存在于 `agent.state.messages` 中：
- **UI 层**：可识别 `role: "bridge"` 做特殊处理（如不显示、或显示为折叠的"上下文已压缩"提示）
- **LLM 层**：`convertToLlm` 将其转为标准 user message 发给模型

```typescript
// convertToLlm 处理 bridge 消息
convertToLlm: (messages) => {
  return messages.flatMap(m => {
    if (m.role === 'bridge') {
      // 转为 user message 发给 LLM
      return [{ role: 'user', content: m.content, timestamp: m.timestamp }];
    }
    if (['user', 'assistant', 'toolResult'].includes(m.role)) {
      return [m];
    }
    return []; // 过滤其他自定义类型
  });
},
```

#### 信息分层模型

| 层级 | 内容 | 处理方式 |
|------|------|----------|
| **Must Keep** | 用户偏好/约束/身份、当前任务完整上下文、已创建的节点及最新状态、最近几轮完整交互 | 原文保留或精确描述 |
| **Summarize** | 中期话题的关键结论、已完成任务的结果摘要、用户反馈过的偏好 | 只保留结论，丢弃过程 |
| **Can Discard** | 已解决且不再相关的话题、闲聊寒暄、被后续覆盖的旧信息、搜索过程/中间推理步骤、被用户否定的方案 | 完全丢弃 |

#### Token 追踪与触发条件

**利用 pi-mono 提供的实际数据，而非估算**：

```typescript
// 从 model 对象获取精确的上下文窗口大小
const contextWindow = agent.state.model.contextWindow;
const threshold = contextWindow * 0.7;

// 从最近一条 AssistantMessage.usage 获取实际 token 用量
function getLastKnownInputTokens(messages: AgentMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'assistant' && msg.usage?.input) {
      return msg.usage.input;
    }
  }
  return 0; // 无历史数据时回退
}
```

**触发逻辑**（在 `transformContext` 中）：

```typescript
async function compactIfNeeded(
  messages: AgentMessage[],
  agent: Agent,
  signal?: AbortSignal,
): Promise<AgentMessage[]> {
  const contextWindow = agent.state.model.contextWindow;
  const threshold = contextWindow * 0.7;

  // 用上一次 LLM 调用的实际 input tokens 作为基线
  const lastInputTokens = getLastKnownInputTokens(messages);
  if (lastInputTokens < threshold) return messages;

  // 触发 Handoff 压缩
  return await compact(messages, agent, signal);
}
```

#### 溢出兜底：isContextOverflow

万一 token 追踪不准、压缩没触发，LLM 返回溢出错误时自动压缩重试：

```typescript
// 在 agent 事件监听中
agent.subscribe((event) => {
  if (event.type === 'message_end') {
    const msg = event.message;
    if (msg.role === 'assistant' && isContextOverflow(msg)) {
      // 强制压缩 + 重试
      // 利用 agent.continue() 从压缩后的上下文继续
    }
  }
});
```

#### 压缩流程

压缩发生在 `transformContext` 内部，即**每次 LLM 调用前**。当 token 量超过阈值时，压缩自动执行，完成后无缝继续用户当前任务——用户完全无感知。

```
每次 LLM 调用前（transformContext 内）:

  1. 读取上一次 AssistantMessage.usage.input（实际 token 量）
  2. 对比 model.contextWindow * 0.7（阈值）
  3. 未超阈值 → 跳过，正常继续
  4. 超阈值 → 触发压缩：

  Step 1: 发送压缩请求（同一模型，命中 prompt cache）
    → [Tools] + [System] + [...History...] + [Compact Prompt]
    → 模型生成 Handoff Memo

  Step 2: 构建 Bridge Message
    → 将 Handoff Memo + 节点资源快照填入 Bridge Template
    → 创建 { role: 'bridge', content: bridgeContent, timestamp }

  Step 3: 重建上下文
    → [Bridge Message] + [Current User Message]
    → agent.replaceMessages(newMessages)
    → 缓存状态：
      - [Tools] + [System] → 缓存命中（从未改变）
      - [Bridge_v1] → 新缓存创建点

  5. 返回压缩后的 messages，继续执行用户的原始请求
```

**关键**：压缩是透明的中间步骤。用户发了一条消息，可能触发了工具调用导致 token 增长超阈值，压缩在下一次 LLM 调用前自动执行，然后模型继续处理用户的任务。不是等一轮结束才压缩。

#### 压缩模型选择

**使用与对话相同的模型**（不是便宜模型），原因：
- Compact Prompt 追加到当前上下文末尾，`[Tools] + [System] + [...History...]` 的 prompt cache 完全命中
- 只需要为 Compact Prompt 本身 + Handoff Memo 输出付费
- 如果用不同模型，整个上下文 cache 失效，反而更贵

#### Compact Prompt（追加到当前上下文末尾）

```markdown
This conversation has reached its context limit and will be handed off to a fresh
assistant instance. The new assistant will have access to the knowledge graph
(any nodes created during this session) but will NOT have the conversation history.

Write a handoff memo for the next assistant so they can continue helping this user
seamlessly. Your memo should read like a colleague briefing another before taking over.

IMPORTANT: Write the handoff memo in the primary language the user has been using.

**Current situation**
- What is the user working on right now?
- Is there anything in progress or pending?
- What was just being discussed?

**Key context to pass on**
- Important conclusions, decisions, or information from this conversation
- User preferences, requirements, or constraints they've mentioned
- What's been created or accomplished (reference by node ID)
- Anything the next assistant needs to know to avoid repeating work

**What can be omitted**
- Resolved topics that won't come up again
- Casual chat or greetings
- Intermediate steps where only the outcome matters
- Old information that's been superseded
```

#### Bridge Template（填入 Bridge Message 的 content）

```xml
<system-reminder>

## Context Handoff

You are continuing a conversation previously handled by another assistant instance.
This handoff is invisible to the user—they experience this as one continuous conversation.

**Critical**:
- Do NOT mention this handoff, context limits, or "previous conversation"
- Respond naturally as if you have always been in this conversation
- The user should feel no discontinuity

## Previous Assistant's Handoff Memo

{{ handoff_memo }}

{{ #if recent_nodes }}
## Recently Referenced Nodes

{{ recent_nodes_list }}

Note: Only recently referenced nodes are listed above.
Use node_search to discover other nodes if needed.
{{ /if }}

## Your Task

Continue helping the user naturally. Use the memo above to understand the context,
but respond as if you've been here all along.

</system-reminder>
```

#### 关键设计决策

**1. System prompt 天然安全**

soma 的 system prompt 通过 `agent.state.systemPrompt` 独立注入，不在 messages 中。压缩只替换 messages，system prompt + tools 永远完整且命中缓存。

**2. 可多次叠加压缩**

- 压缩后继续对话又超阈值 → 再次压缩（Bridge + 最近消息 → 新 Handoff Memo → 新 Bridge）
- 每次压缩都操作在已压缩的内容上，信息逐步损失是预期行为
- `[Tools] + [System]` 前缀始终不变，缓存始终命中

#### 在 transformContext 中的位置

```typescript
transformContext: async (messages, signal) => {
  let ctx = messages;

  // 1. Handoff 压缩（token 超阈值时自动触发）
  //    用 AssistantMessage.usage 追踪实际 token，对比 model.contextWindow * 0.7
  ctx = await compactIfNeeded(ctx, agent, signal);

  // 2. 动态上下文注入（panel/page/time）
  ctx = injectReminder(ctx, await buildSystemReminder());

  return ctx;
},
```

**执行时序示例**：

```
用户发送消息 "帮我整理这些笔记"
  → LLM 调用 1: transformContext(messages)
    → 上次 usage.input: 45k, 阈值: 140k (200k × 0.7) → 不压缩
    → 注入 system reminder
    → LLM 返回: 调用 node_search 工具（usage.input: 46k）
  → 工具执行，结果 append 到 messages
  → LLM 调用 2: transformContext(messages)
    → 上次 usage.input: 150k, 阈值: 140k → 超阈值，触发压缩
    → 发送 Compact Prompt → 生成 Handoff Memo → 创建 Bridge Message → 重建上下文
    → token 降至 ~30k
    → 注入 system reminder
    → LLM 继续处理用户的"整理笔记"任务（用户无感知）

如果压缩没触发但 LLM 返回溢出错误：
  → isContextOverflow(assistantMessage) === true
  → 强制压缩 + agent.continue() 重试
```

## 新设计后的上下文全貌

```
═══ System Prompt（稳定，configureAgent 一次性设置）═══

You are soma, an AI collaborator inside the user's knowledge graph.
Operate carefully on the outliner and prefer precise, reversible changes.
Use tools when the user asks you to inspect, create, edit, delete, search, or undo nodes.
When you mention an existing node, use <ref id="nodeId">display text</ref>.
Reply in the user's language unless they explicitly ask otherwise.

<available-skills>
  <skill id="NDX_T05" name="从文章提取认知框架" description="..." />
  <skill id="NDX_T06" name="对比分析" description="..." />
</available-skills>
When you need a skill's detailed rules, use node_read to read the skill node's children.

═══ Messages（agent.state.messages）═══

[bridge]    ← 压缩后才有，convertToLlm 转为 user message
  <system-reminder>
  ## Context Handoff
  ...
  ## Previous Assistant's Handoff Memo
  {{ handoff_memo }}
  ## Recently Referenced Nodes
  {{ recent_nodes_list }}
  </system-reminder>

[user]      用户消息 1
[assistant] 助手回复 1（含 usage.input/output 实际 token 数据）
[toolResult] 工具结果
[assistant] 助手回复 2
...
[user]      用户最新消息 + ← transformContext 注入 system reminder
  <system-reminder>
  <panel-context>
  Current panel: Journal > 2026-03-13 (ID: ws1_JOURNAL_2026-03-13)
  Children (3):
    - "今天的计划" (id: abc123, 2 children)
    ...
  </panel-context>
  <page-context>
  User is browsing: https://example.com — "Some Article"
  </page-context>
  <time-context>
  Current time: 2026-03-13T15:30:00+08:00 (Asia/Shanghai)
  </time-context>
  </system-reminder>
```

## 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/lib/ai-service.ts` | 修改 | 添加 `transformContext`/`convertToLlm`/`getApiKey`，简化 `streamFn` |
| `src/lib/ai-types.ts` | 新建 | Bridge 自定义消息类型声明合并 |
| `src/lib/ai-agent-node.ts` | 修改 | `buildAgentSystemPrompt()` 不再全量注入 skill rules，改为 skill 索引 |
| `src/lib/ai-context.ts` | 修改 | 新增 `injectReminder()` 函数（注入到消息流而非 systemPrompt） |
| `src/lib/ai-tools/index.ts` | 不变 | 工具集保持不变（skill 读取复用 node_read） |
| `tests/vitest/ai-agent-node.test.ts` | 修改 | 更新 skill 相关测试 |
| `tests/vitest/ai-context.test.ts` | 新建 | transformContext 注入逻辑测试 |
| `src/lib/ai-compress.ts` | 新建 | Handoff 压缩逻辑（token 追踪 + Compact Prompt + Bridge 构建） |
| `tests/vitest/ai-compress.test.ts` | 新建 | 压缩触发条件 + 边界保护测试 |

## 实施顺序

1. **Step 1**：迁移到 `transformContext` + `convertToLlm` + `getApiKey`，简化 `streamFn`（纯重构，行为不变）
2. **Step 2**：Skill 渐进式披露（system prompt 只放索引，skill rules 按需读取）
3. **Step 3**：Context 自动压缩（Bridge 自定义消息类型 + token 追踪 + Handoff Memo + 溢出兜底）

## 不做的事

- 不新增 `get_skill` 专用工具 — 复用 node_read
- 不做 embedding 相关的 skill 匹配 — 索引足够小，AI 自己判断
- 不改 tool 定义和注册方式 — 当前工具的静态注册没有问题
- 不改 chat 持久化 — IndexedDB 方案足够
- 不引入精确 tokenizer — 用 `AssistantMessage.usage` 实际数据，不需要预估
- 不自建溢出检测 — 用 pi-ai 的 `isContextOverflow()`
