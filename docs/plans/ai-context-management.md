# AI Chat 架构方案

> Chat 持久化、上下文压缩、跨设备同步的统一设计。
>
> **更新**：2026-03-15 — 结合代码现状完成 review；Bridge 决策落定（Option B）；补充 5 项实现细节；全面采用 pi-agent-core 事件系统

## 总览

```
已完成                              待做
──────────────────────              ──────────────────────────────────────
✅ transformContext 管线 (#132)      Phase 1: 消息树数据模型 + 去限制
✅ Skill 渐进式披露 (#134)           Phase 2: 编辑 + 重新生成 + 分支导航
                                    Phase 3: Context 自动压缩
                                    Phase 4: 跨设备同步
```

Phase 2、3、4 互相不依赖，Phase 1 完成后可并行。

## 当前架构

### 代码结构

```
ai-persistence.ts    ChatSession { id, messages[], createdAt, updatedAt }
                     IndexedDB 'soma-ai-chat', DB_VERSION=1
                     MAX_SESSIONS=10, MAX_MESSAGES_PER_SESSION=100

ai-service.ts        agentSingleton (单例 Agent)
                     streamChat() → configureAgent() → agent.prompt()
                     restoreLatestChatSession() / persistChatSession()

ai-context.ts        transformContext: stripOldImages + injectReminder
                     buildSystemReminder(): panel + page + time context

use-agent.ts         React hook: { messages, sendMessage, newChat, ... }
                     250ms debounce persist on message signature change

ChatDrawer.tsx       Drawer overlay (不在 panelHistory)
ChatMessage.tsx      纯渲染 user/assistant, 支持 <ref>/<cite> markup
ChatInput.tsx        textarea + send/stop, Cmd+Enter 发送
```

### 调用流程

```
sendMessage(prompt)
  → streamChat(prompt, agent)
    → configureAgent(agent)                // set tools, systemPrompt, model, temp, maxTokens
    → agent.prompt(normalized)
        → transformContext(messages)        // ✅ stripOldImages + injectReminder（纯变换）
        → convertToLlm(messages)           // ✅ 过滤到 user/assistant/toolResult
        → streamFn → streamProxyWithApiKey  // ✅ 纯网络转发
    → agent 内部 tool loop（可能多轮 LLM 调用）
  → useAgent effect 检测 messages 变化 → debounced persistChatSession()
```

### 当前局限

1. **线性 messages[]** — 不支持编辑消息、重新生成、分支导航
2. **硬限制** — 最多 10 个 session × 100 条消息，静默丢弃
3. **无标题** — session 列表无法区分
4. **无压缩** — 长对话会撞 context window
5. **无同步** — 聊天记录只在本地

---

## Phase 1: 消息树数据模型

### 设计原则

1. **去掉所有限制** — 不限会话数、不限消息数，全量保留
2. **消息树结构** — 为 Phase 2（编辑/重新生成/分支）打基础
3. **会话标题** — MVP 用第一条用户消息前 30 字截断
4. **原始消息永远不删** — 压缩只影响发给 LLM 的上下文，不影响存储和 UI
5. **图片剥离** — 保持当前 `stripImagesForPersistence()`（替换为占位符）

### 数据模型

```typescript
interface ChatSession {
  id: string;
  title: string | null;
  mapping: Record<string, MessageNode>;  // 所有消息节点的平铺字典
  currentNode: string;                   // 当前活跃分支的叶节点 ID
  createdAt: number;
  updatedAt: number;
  syncedAt: number | null;               // Phase 4 使用
  revision: number;                      // Phase 4 CAS 使用，本地从 0 开始
  bridges: BridgeEntry[];                // Phase 3 使用，初始为空数组
}

interface MessageNode {
  id: string;                            // nanoid 生成
  parentId: string | null;               // null = 合成根节点
  children: string[];                    // 子节点 ID 列表（多个 = 有分支）
  message: AgentMessage | null;          // null 为合成根节点
}

interface BridgeEntry {                  // Phase 3 填充
  afterNodeId: string;                   // 此节点之后的路径被压缩
  content: string;                       // Handoff Memo
  timestamp: number;
}
```

**与现状的对比**：

| 维度 | 现在 | Phase 1 后 |
|------|------|-----------|
| 会话结构 | `messages: AgentMessage[]` | `mapping: Record<string, MessageNode>` + `currentNode` |
| 限制 | 10 session × 100 message | 无限制 |
| 标题 | 无 | `title: string \| null` |
| 同步字段 | 无 | `syncedAt`, `revision`（Phase 4 前置占位） |
| 压缩字段 | 无 | `bridges: BridgeEntry[]`（Phase 3 前置占位） |

### 消息身份：树节点 ↔ agent 消息的关联

pi-agent-core 的 `AgentMessage` 没有稳定 ID 字段。树模型需要为每条消息分配 `MessageNode.id`（nanoid）。

**关联策略**：不在 AgentMessage 上附加 ID，而是维护一个**位置映射**：

```typescript
// ai-chat-tree.ts 内部
function syncAgentToTree(session: ChatSession, agentMessages: AgentMessage[]): void {
  const linearPath = getLinearPath(session);        // 树中已有的线性路径
  const existingCount = linearPath.length;

  // agent 新追加的消息 = agentMessages.slice(existingCount)
  for (let i = existingCount; i < agentMessages.length; i++) {
    appendMessage(session, agentMessages[i]);       // 为新消息创建 MessageNode（分配 nanoid）
  }
}
```

核心思路：agent 的消息数组是树的线性路径的**超集**——前 N 条与树一致，后面多出的是新消息。`syncAgentToTree` 只追加差量。

**安全前提**：streaming 期间不执行 edit/regenerate/switchBranch（这些操作会改变树的线性路径，导致位置对不上）。这在当前 UI 中天然成立——streaming 时输入和按钮都 disabled。

### 双源同步：agent ↔ 树的时序

运行时有两个事实源：`session.mapping`（持久层）和 `agent.state.messages`（运行时）。同步规则：

| 时机 | 方向 | 操作 |
|------|------|------|
| **加载 session** | 树 → agent | `getLinearPath(session)` → `agent.replaceMessages()` |
| **`agent_end` 事件** | agent → 树 | `syncAgentToTree(session, event.messages)` — 追加新消息到树 |
| **编辑/重新生成** | 树 → agent | 在树中创建新分支 → `getLinearPath()` → `agent.replaceMessages()` |
| **切换分支** | 树 → agent | 更新 `currentNode` → `getLinearPath()` → `agent.replaceMessages()` |
| **压缩后** | 双向 | 树中记录 bridge → `agent.replaceMessages(compressedPath)` |

**同步由 `agent_end` 事件驱动**：pi-agent-core 的 `AgentEvent` 类型联合包含 `agent_end`（agent.prompt() 完整结束，含 tool loop 全部轮次）和 `message_end`（每条消息结束）。`agent_end` 事件携带 `event.messages`（完整消息数组），是同步到树的精确时机——替代轮询 `isStreaming` 状态。

**不变式**：任意时刻，`agent.state.messages` 的前 N 条消息必须与 `getLinearPath(session)` 前 N 条一一对应。agent 可以比树多（streaming 追加的新消息），但不能比树少或乱序。

### 持久化时机

**现状**：250ms debounce on `${messages.length}:${lastTimestamp}` 变化 — streaming 中频繁触发。

**改为事件驱动**（利用 pi-agent-core `AgentEvent` 类型系统）：

| 事件 | 触发持久化 | 说明 |
|------|-----------|------|
| `agent_end` 事件 | ✅ | agent.prompt() 完整结束（含所有 tool-call 轮次），通过 `agent.subscribe()` 监听 |
| 用户操作（newChat / switchSession / edit / regenerate） | ✅ | UI 层直接调用 |
| visibilitychange（切标签页 / 关浏览器） | ✅ | 兜底保障 |
| streaming 进行中 | ❌ | 不保存半成品 |

**替代了 `isStreaming` 轮询**：现有 `use-agent.ts` 的 250ms debounce 依赖状态轮询（检测 `messages.length` + `lastTimestamp` 变化）。`agent_end` 事件是精确的完成信号，无需轮询和 debounce。

### IndexedDB schema 迁移

DB_VERSION 从 1 升到 2，`onupgradeneeded` 中转换现有 session：

```typescript
// ai-persistence.ts — upgrade handler
if (oldVersion < 2) {
  // 读出所有 v1 session（{ id, messages[], createdAt, updatedAt }）
  // 逐个转换为 v2 树结构：
  //   synthetic root → messages[0] → messages[1] → ... → messages[N]
  //   每条消息分配 nanoid 作为 MessageNode.id
  //   currentNode = 最后一条消息的 id
  //   title = 第一条 user 消息前 30 字
  //   bridges = [], syncedAt = null, revision = 0
}
```

### 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/lib/ai-chat-tree.ts` | 新建 | 树操作：`appendMessage` / `getLinearPath` / `syncAgentToTree` + nanoid 分配 |
| `src/lib/ai-persistence.ts` | 重写 | `ChatSession` 树模型 + DB_VERSION=2 migration + 去掉限制 |
| `src/lib/ai-service.ts` | 修改 | `streamChat` 加 syncAgentToTree；`restoreSession` 加 getLinearPath |
| `src/hooks/use-agent.ts` | 修改 | persist 改为事件驱动；暴露 session title |
| `tests/vitest/ai-persistence.test.ts` | 新建 | 树操作 + migration + 持久化测试 |

---

## Phase 2: 编辑 + 重新生成 + 分支导航

### 操作语义

| 操作 | 机制 |
|------|------|
| **正常对话** | 新消息作为 `currentNode` 的子节点，更新 `currentNode` 指向新叶 |
| **编辑消息** | 在被编辑消息的**父节点**下创建新 user 兄弟 → 触发新 assistant 子节点 → `currentNode` 指向新叶 |
| **重新生成** | 在被 regenerate 消息的**同一 parent** 下创建新 assistant 兄弟 → `currentNode` 指向新叶 |
| **切换分支** | 改变选中的子节点 → 沿后代走到叶 → 更新 `currentNode` |
| **展示对话** | 从 `currentNode` 沿 `parentId` 向上到根 → 反转 → 线性路径 → 渲染 |

### tool-call 链处理

`toolResult` 是树中的独立 `MessageNode`，不是 assistant 的附属 metadata。典型链路：

```
U₁ → A₁(tool_use) → TR₁ → A₂(final response)
```

- Regenerate A₂：A₂ 的 parent 是 TR₁ → 在 TR₁ 下创建 A₂' 作为兄弟
- Regenerate A₁：整条 A₁ → TR₁ → A₂ 子树变为旧分支，新 A₁' 在 U₁ 下创建
- `getLinearPath()` 必须包含中间的 toolResult 节点
- UI 分支导航 `← 2/3 →` 只显示在 user/assistant 消息上，不在 toolResult 上显示

### 分支导航 UI

`children.length > 1` 时，在子消息上显示 `← 2/3 →` 箭头。

**现状对比**：当前 `ChatMessage` 组件无任何编辑/重新生成/分支 UI。Phase 2 需要：

| 组件 | 改动 |
|------|------|
| `ChatMessage` | hover 时显示 edit（user）/ regenerate（assistant）按钮 + 分支箭头 |
| `ChatDrawer` | 处理 edit/regenerate action → 调用 tree 操作 → replaceMessages |
| `ChatInput` | 编辑模式：pre-fill 被编辑消息的文本 |

### 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/lib/ai-chat-tree.ts` | 修改 | 新增 `editMessage` / `regenerate` / `switchBranch` |
| `src/components/chat/ChatMessage.tsx` | 修改 | 分支导航箭头 + edit/regenerate 按钮 |
| `src/components/chat/ChatDrawer.tsx` | 修改 | 编辑消息、重新生成 action handler |
| `src/components/chat/ChatInput.tsx` | 修改 | 编辑模式支持 |
| `tests/vitest/ai-chat-tree.test.ts` | 修改 | 分支操作 + 路径切换测试 |

---

## Phase 3: Context 自动压缩

### 核心思路

压缩不是"总结对话"，而是**给接替你的同事写一份交接备忘录**。用同一模型生成（命中 prompt cache），用 Bridge Message 无缝衔接（用户无感知）。原始消息始终保留在树中。

### 行业调研

| 维度 | Claude Code | OpenCode |
|------|-------------|----------|
| **触发阈值** | 接近 context window 上限 | `总 token >= context - maxOutputTokens` |
| **检测数据** | 未公开 | LLM 返回的实际 `usage` token 数 |
| **两阶段** | 先清旧工具输出 → 再摘要 | 先 prune 工具输出（保护最近 40K）→ 再摘要 |
| **摘要模型** | 同模型（命中 prompt cache） | 可配置不同模型 |

**soma 的简化优势**：system prompt 通过 `agent.state.systemPrompt` 独立注入，不在 messages 中。压缩只替换 messages，system prompt + tools 永远完整且命中缓存。

### Bridge Message

利用 pi-agent-core 声明合并，定义 `bridge` 消息类型：

```typescript
// ai-types.ts
declare module '@mariozechner/pi-agent-core' {
  interface CustomAgentMessages {
    bridge: {
      role: 'bridge';
      content: string;   // Handoff Memo，填入 Bridge Template
      timestamp: number;
    };
  }
}
```

- **UI 层**：识别 `role: "bridge"` 做特殊处理（折叠的"上下文已压缩"提示）
- **LLM 层**：`convertToLlm` 将其转为标准 user message（现有 `convertToLlm` 只通过 user/assistant/toolResult，需新增 bridge → user 转换）

### Bridge 存储：Option B（session 级元数据）

**决策**：Bridge 存在 `ChatSession.bridges` 数组中，不作为树节点。

理由：
- 树的职责是存储**用户可见的对话消息**和分支结构
- Bridge 是系统压缩产物，不是用户内容
- 树拓扑永远不变，压缩不会 re-parent 节点，逻辑简单
- `getLinearPath` 纯粹遍历树，不需要判断节点类型
- 给 LLM 的路径由独立函数 `getCompressedPath` 组装（检查 bridges，截断早期消息）

```
树结构:  Root → U₁ → A₁ → ... → A₅₀ → U₅₁ → A₅₁  (不变)
bridges: [{ afterNodeId: A₅₀.id, content: "...", timestamp: ... }]

UI 展示:  全部消息可见，bridges[i] 位置渲染一条折叠分隔线
LLM 收到: [bridge.content as user message] → U₅₁ → A₅₁
```

### 压缩时机

**在调用层执行，不在 `transformContext` hook 中**。利用 pi-agent-core 的 typed event system 实现精确的事件驱动：

```typescript
// ai-service.ts — streamChat()
async function streamChat(text: string, session: ChatSession, agent: Agent) {
  configureAgent(agent);

  // 1. 首轮前置压缩（显式状态修改）
  await compactIfNeeded(session, agent);

  // 2. 订阅事件：同步 + 持久化 + overflow 检测
  const unsubscribe = agent.subscribe((event: AgentEvent) => {
    // agent.prompt() 完整结束（含所有 tool-call 轮次）→ 同步到树 + 持久化
    if (event.type === 'agent_end') {
      syncAgentToTree(session, event.messages);
      persistSession(session);
      unsubscribe();
    }
    // 每条 assistant 消息结束 → 检测 context overflow
    if (event.type === 'message_end' && event.message.role === 'assistant') {
      if (isContextOverflow(event.message)) {
        // 移除尾部 overflow error → 压缩 → 重试
        const msgs = agent.state.messages.slice(0, -1);
        const compressed = compact(msgs, session);
        agent.replaceMessages(compressed);
        agent.continue();  // 在压缩后的上下文中重试
      }
    }
  });

  // 3. agent.prompt() — 内部可能多轮 tool-call
  await agent.prompt(text);
  //   → transformContext: stripOldImages + injectReminder（纯变换，无副作用）
}
```

`transformContext` 保持纯函数：

```typescript
transformContext: async (messages, signal) => {
  let ctx = stripOldImages(messages);
  ctx = injectReminder(ctx, await buildSystemReminder());
  return ctx;
},
```

| 时机 | 策略 | 机制 |
|------|------|------|
| **首轮 LLM 调用前** | `compactIfNeeded()` 主动压缩 | `streamChat()` 调用层显式执行 |
| **tool loop 内后续轮** | 不主动压缩 | runtime 限制：`agent.prompt()` 包住整个 tool loop，调用层无法插入 |
| **LLM 返回 overflow** | 强制压缩 + 重试 | `message_end` 事件 + `isContextOverflow()` → `replaceMessages` → `continue()` |
| **prompt 完成** | 同步 + 持久化 | `agent_end` 事件，携带完整 `event.messages` |

### 压缩流程

```
compactIfNeeded(session, agent):
  1. 读 getLastKnownInputTokens(agent.state.messages)
  2. 对比 agent.state.model.contextWindow * 0.7
  3. 未超阈值 → 返回，不压缩
  4. 超阈值 →
     a. 发送 Compact Prompt（同一模型，命中 prompt cache）→ 模型生成 Handoff Memo
     b. 写入 session.bridges（追加 BridgeEntry）
     c. 计算压缩后的线性路径（bridge + 最近消息）
     d. agent.replaceMessages(compressedPath)
     e. 持久化 session 到 IndexedDB
```

### write-back 路径

压缩修改三层状态，顺序如下：

1. **session.bridges**：追加 `{ afterNodeId, content, timestamp }`
2. **agent 状态**：`agent.replaceMessages(getCompressedPath(session))` — bridge content 作为首条 user message
3. **IndexedDB**：持久化更新后的 `ChatSession`

### Compact Prompt

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

### Bridge Template

```xml
<system-reminder>
## Context Handoff

You are continuing a conversation previously handled by another assistant instance.
This handoff is invisible to the user—they experience this as one continuous conversation.

**Critical**:
- Do NOT mention this handoff, context limits, or "previous conversation"
- Respond naturally as if you have always been in this conversation

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

### 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/lib/ai-types.ts` | 新建 | Bridge 自定义消息类型声明合并 |
| `src/lib/ai-compress.ts` | 新建 | `compactIfNeeded` + `compact` + `getCompressedPath` + overflow retry |
| `src/lib/ai-service.ts` | 修改 | `streamChat` 加入 pre-prompt 压缩 + overflow 事件处理；`convertToLlm` 加 bridge→user |
| `tests/vitest/ai-compress.test.ts` | 新建 | 压缩触发条件 + overflow retry + bridge 路径组装测试 |

---

## Phase 4: 跨设备同步

### 核心原则

**同步完整原始对话，不是压缩后的摘要。** 用户在乎原始聊天记录，压缩是系统内部优化，两者独立。

### 方案：Sync API 独立通道

不走 Loro CRDT，原因：
- 节点 LoroDoc 已经很大，不应再塞 chat 数据
- Chat 同步的冲突场景有限（同一 session 极少在两台设备同时活跃），不需要通用 CRDT

```
D1: chat_sessions 表（id, user_id, workspace_id, title, message_count, revision, timestamps）
R2: chat/{workspace_id}/{session_id}.json（完整 ChatSession JSON）
```

### 冲突检测：server-side compare-and-swap

**不使用静默 LWW**——消息树模型下，静默覆盖会丢失整个分支，违反"原始消息永远不删"原则。

**Push（带版本检查）**：

```
客户端 → PUT /chat/sessions/{id}
  body: { session, baseRevision }        // baseRevision = 上次同步时服务端的 revision

服务端:
  if remote.revision == baseRevision → 接受写入，revision++，更新 R2
  if remote.revision != baseRevision → 返回 409 Conflict + 远端 session
```

**Pull**：

- 查 D1 `updated_at > lastPullAt` → GET R2 → 写入本地 IndexedDB
- 如果本地 session 也有未同步的修改（`updatedAt > syncedAt`）→ 标记冲突

**冲突处理 UI**：

冲突时不自动合并，提供三个选项：
1. **保留本地** — 用本地版本强制覆盖远端
2. **保留远端** — 用远端版本覆盖本地
3. **两者都保留** — 复制为两个独立 session

**已知限制**：Phase 4 不做 mapping-level merge（即不会自动合并两边各自创建的分支）。同一 session 在多设备并发编辑是已知的不支持场景。未来可升级为 mapping dict union merge。

**时机**：复用 SyncManager 的 30s 定时 + visibilitychange 触发。

### 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/lib/ai-persistence.ts` | 修改 | push/pull + 冲突检测逻辑 |
| `src/lib/sync/sync-manager.ts` | 修改 | 加入 `syncChatSessions()` 步骤 |
| `src/components/chat/` | 修改 | 冲突处理 UI |
| Backend: `worker/` | 新建 | D1 表 + R2 存储 + CAS 写入端点 |

---

## pi-agent-core 能力利用

本方案涉及的 pi-agent-core 能力及使用方式：

| 能力 | 用途 | Phase |
|------|------|-------|
| `agent.subscribe(AgentEvent)` | 事件驱动的同步和持久化（替代 isStreaming 轮询） | 1, 3 |
| `AgentEvent.agent_end` | prompt 完整结束信号，携带 `event.messages` → 同步到树 + 持久化 | 1 |
| `AgentEvent.message_end` | 每条消息结束信号 → overflow 检测 | 3 |
| `isContextOverflow()` | 检测 LLM 返回的 context overflow 错误 | 3 |
| `agent.continue()` | overflow 后压缩上下文并重试（不重新发送用户消息） | 3 |
| `agent.replaceMessages()` | 树 → agent 同步、压缩后替换上下文 | 1, 2, 3 |
| `agent.state.messages` | 运行时消息数组，与树保持位置映射 | 1 |
| `CustomAgentMessages` 声明合并 | 定义 `bridge` 消息类型 | 3 |
| `transformContext` hook | 纯变换（stripOldImages + injectReminder），不做压缩 | 已有 |
| `convertToLlm` hook | 过滤消息类型（新增 bridge → user 转换） | 3 |

**不用于同步/持久化的能力**：

| 能力 | 用途 | 不用于同步/持久化的原因 |
|------|------|----------------------|
| `AgentEvent.turn_end` | MVP 不使用；未来可用于断点恢复（长 tool-call 链中途断开时保留已完成的轮次） | 当前 tool-call 链短（1-3 轮），"丢了重来"可接受，断点恢复逻辑增加复杂度 |
| `agent.state.isStreaming` | UI 渲染：禁用发送按钮、显示 loading/stop 按钮、typing indicator | 状态适合驱动声明式 UI（"现在怎样"），但不适合触发副作用（"刚发生了什么"）——后者用 `agent_end` 事件 |

---

## 不做的事

- 不用 Loro CRDT 同步 chat — 冲突场景有限，CAS + 手动解决足够
- 不做 mapping-level 自动 merge — Phase 4 不支持多设备并发编辑同一 session
- 不在 `transformContext` 中做压缩 — 压缩有持久化副作用，提到调用层显式执行
- 不在 tool loop 内主动压缩 — 当前 runtime 限制，靠 overflow fallback 兜底
- 不给 AgentMessage 附加 ID — 用位置映射（`syncAgentToTree` 差量追加）
- 不引入精确 tokenizer — 用 `AssistantMessage.usage` 实际数据
- 不自建溢出检测 — 用 pi-ai 的 `isContextOverflow()`
- 不拆 IndexedDB 为 session + message 两个 store — 当前会话量级不需要
