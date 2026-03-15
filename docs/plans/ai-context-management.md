# AI Chat 架构方案

> Chat 持久化、上下文压缩、跨设备同步的统一设计。
>
> **更新**：2026-03-15 — 代码现状 review + 开源调研 + 参考实现分析（assistant-ui / Vercel AI SDK）+ pi-agent-core 事件系统全面采用

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

## 参考实现分析

调研了 assistant-ui（8.8k stars）的 `MessageRepository` 和 Vercel AI SDK PR #5085 的分支工具函数。两者验证了我们的设计方向，同时提供了几个值得采纳的模式：

### 采纳的模式

| 模式 | 来源 | 说明 |
|------|------|------|
| **虚拟根节点** | assistant-ui | `mapping` 中有一个 `message: null` 的合成根节点，所有顶层消息挂在它下面。消除 `parentId === null` 的特殊处理 |
| **`level` 字段加速路径构建** | assistant-ui | 每个节点缓存深度值，`getLinearPath()` 预分配 `new Array(head.level + 1)` 然后反向填充，无需 `unshift` 或 reverse |
| **`currentChild` 指针** | assistant-ui | 每个有 children 的节点记住"上次选中的子节点"，切换分支后再切回来不丢失位置 |
| **切换分支时自动选最新叶** | Vercel AI SDK | 点击一个中间兄弟节点时，自动沿后代走到 `createdAt` 最大的叶节点，而非停在点击处 |
| **统一变异函数** | assistant-ui | 所有树结构修改通过一个 `performOp(parent, child, "cut" \| "link" \| "relink")` 执行，含环检测 + `currentChild` 回退 |
| **引入 idb** | 调研结论 | 用 Jake Archibald 的 `idb`（1.2KB）替换手写 IndexedDB 样板代码 |

### 不采纳的模式

| 模式 | 来源 | 不采纳原因 |
|------|------|-----------|
| 运行时 linked-list 图 (`prev`/`next` 指针) | assistant-ui | 我们的持久层是 `mapping: Record<string, MessageNode>`（可直接序列化到 IndexedDB），运行时操作通过查字典实现。linked-list 图适合纯内存场景，但增加序列化/反序列化复杂度 |
| `parentId` 存在消息 annotations 中 | Vercel AI SDK | 关系应在树结构中管理，不应侵入消息 payload |
| 每次渲染重建 adjacency map | Vercel AI SDK | O(n) 重建在消息量大时有性能问题，不如直接维护 `children[]` |

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
  currentChild: string | null;           // 当前选中的子节点（记住分支选择，切回时不丢失）
  level: number;                         // 深度（根=0），用于 O(depth) 路径构建
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
// ai-chat-tree.ts

/** 从 currentNode 向上走到根，用 level 作为数组索引，O(depth) 无需 reverse */
function getLinearPath(session: ChatSession): MessageNode[] {
  const head = session.mapping[session.currentNode];
  if (!head) return [];
  const path = new Array<MessageNode>(head.level + 1);
  for (let cur: MessageNode | null = head; cur; cur = cur.parentId ? session.mapping[cur.parentId] : null) {
    if (cur.message) path[cur.level] = cur;       // 跳过合成根节点
  }
  return path.filter(Boolean);                     // 合成根在 level=0 且 message=null，被跳过
}

/** 差量追加：agent 的消息数组是树路径的超集，只追加多出的部分 */
function syncAgentToTree(session: ChatSession, agentMessages: AgentMessage[]): void {
  const linearPath = getLinearPath(session);
  const existingCount = linearPath.length;
  for (let i = existingCount; i < agentMessages.length; i++) {
    appendMessage(session, agentMessages[i]);       // 分配 nanoid + 设置 level + 更新 currentChild
  }
}
```

核心思路：agent 的消息数组是树的线性路径的**超集**——前 N 条与树一致，后面多出的是新消息。`syncAgentToTree` 只追加差量。`level` 字段让路径构建无需 `unshift` 或 reverse（来自 assistant-ui 的模式）。

**安全前提**：streaming 期间不执行 edit/regenerate/switchBranch（这些操作会改变树的线性路径，导致位置对不上）。这在当前 UI 中天然成立——streaming 时输入和按钮都 disabled。

### 双源同步：agent ↔ 树的时序

运行时有两个事实源：`session.mapping`（持久层）和 `agent.state.messages`（运行时）。同步规则：

| 时机 | 方向 | 操作 |
|------|------|------|
| **加载 session** | 树 → agent | `getLinearPath(session)` → `agent.replaceMessages()` |
| **`turn_end` 事件** | agent → 树 | 每轮 tool-call 结束 → `syncAgentToTree` 增量追加 + 持久化（断点恢复） |
| **`agent_end` 事件** | agent → 树 | prompt 完整结束 → 最终同步（兜底确认一致性） |
| **编辑/重新生成** | 树 → agent | 在树中创建新分支 → `getLinearPath()` → `agent.replaceMessages()` |
| **切换分支** | 树 → agent | 更新 `currentNode` → `getLinearPath()` → `agent.replaceMessages()` |
| **压缩后** | 双向 | 树中记录 bridge → `agent.replaceMessages(compressedPath)` |

**同步由 typed event 驱动**：pi-agent-core 的 `AgentEvent` 类型联合包含三个关键事件：
- `turn_end`：每轮 tool-call 结束时触发 — 用于增量同步到树 + 持久化，实现断点恢复（browser tool chain 可达 10+ 轮）
- `agent_end`：`agent.prompt()` 完整结束时触发，携带 `event.messages` — 最终同步确认 + cleanup
- `message_end`：每条消息结束时触发 — 用于 overflow 检测（Phase 3）

**不变式**：任意时刻，`agent.state.messages` 的前 N 条消息必须与 `getLinearPath(session)` 前 N 条一一对应。agent 可以比树多（streaming 追加的新消息），但不能比树少或乱序。

### 持久化时机

**现状**：250ms debounce on `${messages.length}:${lastTimestamp}` 变化 — streaming 中频繁触发。

**改为事件驱动**（利用 pi-agent-core `AgentEvent` 类型系统）：

| 事件 | 触发持久化 | 说明 |
|------|-----------|------|
| `turn_end` 事件 | ✅ | 每轮 tool-call 结束 → 增量持久化，browser 操作链可达 10+ 轮，中途断开不丢进度 |
| `agent_end` 事件 | ✅ | prompt 完整结束 → 最终持久化（兜底确认） |
| 用户操作（newChat / switchSession / edit / regenerate） | ✅ | UI 层直接调用 |
| visibilitychange（切标签页 / 关浏览器） | ✅ | 兜底保障 |
| streaming 进行中（token by token） | ❌ | 不保存半成品 |

**替代了 `isStreaming` 轮询**：现有 `use-agent.ts` 的 250ms debounce 依赖状态轮询（检测 `messages.length` + `lastTimestamp` 变化）。`turn_end` / `agent_end` 事件是精确的完成信号，无需轮询和 debounce。

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
| `src/lib/ai-chat-tree.ts` | 新建 | 树操作：`performOp` / `appendMessage` / `getLinearPath` / `syncAgentToTree` / `findLatestLeaf` + nanoid 分配 |
| `src/lib/ai-persistence.ts` | 重写 | `ChatSession` 树模型 + DB_VERSION=2 migration + 去掉限制；用 `idb`（1.2KB）替换手写 IndexedDB 样板 |
| `src/lib/ai-service.ts` | 修改 | `streamChat` 加 syncAgentToTree；`restoreSession` 加 getLinearPath |
| `src/hooks/use-agent.ts` | 修改 | persist 改为事件驱动；暴露 session title |
| `tests/vitest/ai-persistence.test.ts` | 新建 | 树操作 + migration + 持久化测试 |

---

## Phase 2: 编辑 + 重新生成 + 分支导航

### 树变异：统一 `performOp` 模式

借鉴 assistant-ui，所有树结构修改通过一个统一函数执行（避免散落的手动指针维护）：

```typescript
/** 原子树操作 — 所有 append/edit/regenerate/delete 最终都调用这个 */
function performOp(
  session: ChatSession,
  child: MessageNode,
  op: 'cut' | 'link' | 'relink',
  newParentId?: string,
): void {
  if (op === 'cut' || op === 'relink') {
    // 从旧 parent 的 children[] 中移除
    // 如果 child 是旧 parent 的 currentChild，回退到 children.at(-1)
  }
  if (op === 'link' || op === 'relink') {
    // 环检测：沿 newParent 的 parentId 向上走，确保不遇到 child.id
    // 加入新 parent 的 children[]
    // 设为新 parent 的 currentChild
    // 递归更新 child 及后代的 level
  }
}
```

### 操作语义

| 操作 | 机制 |
|------|------|
| **正常对话** | `performOp(link)` 新消息到 `currentNode` 下 → 更新 `currentNode` 指向新叶 |
| **编辑消息** | `performOp(link)` 新 user 消息到被编辑消息的**父节点**下 → 触发新 assistant → `currentNode` 指向新叶 |
| **重新生成** | `performOp(link)` 新 assistant 消息到被 regenerate 消息的**同一 parent** 下 → `currentNode` 指向新叶 |
| **切换分支** | 设置 parent 的 `currentChild` → `findLatestLeaf()` 沿 `currentChild` 走到最深叶 → 更新 `currentNode` |
| **展示对话** | `getLinearPath()` 从 `currentNode` 向上走，用 `level` 索引填充数组 |

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

`children.length > 1` 时，在子消息上显示 `← 2/3 →` 箭头。切换时调用 `findLatestLeaf()`（来自 Vercel AI SDK 的模式）：自动沿 `currentChild` 指针走到最深叶节点，而非停在点击的兄弟节点上。这保证切换分支后看到的是该分支的最新对话。

**现状对比**：当前 `ChatMessage` 组件无任何编辑/重新生成/分支 UI。Phase 2 需要：

| 组件 | 改动 |
|------|------|
| `ChatMessage` | hover 时显示 edit（user）/ regenerate（assistant）按钮 + 分支箭头 |
| `ChatDrawer` | 处理 edit/regenerate action → 调用 tree 操作 → replaceMessages |
| `ChatInput` | 编辑模式：pre-fill 被编辑消息的文本 |

### 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/lib/ai-chat-tree.ts` | 修改 | 新增 `editMessage` / `regenerate` / `switchBranch`（均基于 `performOp`） |
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

  // 2. 订阅事件：增量同步 + 持久化 + overflow 检测
  const unsubscribe = agent.subscribe((event: AgentEvent) => {
    // 每轮 tool-call 结束 → 增量同步到树 + 持久化（断点恢复）
    if (event.type === 'turn_end') {
      syncAgentToTree(session, agent.state.messages);
      persistSession(session);
    }
    // prompt 完整结束 → 最终同步确认 + cleanup
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
| **每轮 tool-call 结束** | 增量同步 + 持久化 | `turn_end` 事件 → 断点恢复（browser chain 可达 10+ 轮） |
| **prompt 完成** | 最终同步 + 持久化 | `agent_end` 事件，携带完整 `event.messages` |

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
| `AgentEvent.turn_end` | 每轮 tool-call 结束 → 增量同步 + 持久化（断点恢复，browser chain 可达 10+ 轮） | 1 |
| `AgentEvent.agent_end` | prompt 完整结束信号，携带 `event.messages` → 最终同步确认 | 1 |
| `AgentEvent.message_end` | 每条消息结束信号 → overflow 检测 | 3 |
| `isContextOverflow()` | 检测 LLM 返回的 context overflow 错误 | 3 |
| `agent.continue()` | overflow 后压缩上下文并重试（不重新发送用户消息） | 3 |
| `agent.replaceMessages()` | 树 → agent 同步、压缩后替换上下文 | 1, 2, 3 |
| `agent.state.messages` | 运行时消息数组，与树保持位置映射 | 1 |
| `CustomAgentMessages` 声明合并 | 定义 `bridge` 消息类型 | 3 |
| `transformContext` hook | 纯变换（stripOldImages + injectReminder），不做压缩 | 已有 |
| `convertToLlm` hook | 过滤消息类型（新增 bridge → user 转换） | 3 |

**仅用于 UI 渲染的能力**：

| 能力 | 用途 | 不用于同步/持久化的原因 |
|------|------|----------------------|
| `agent.state.isStreaming` | UI 渲染：禁用发送按钮、显示 loading/stop 按钮、typing indicator | 状态适合驱动声明式 UI（"现在怎样"），但不适合触发副作用（"刚发生了什么"）——后者用事件 |

---

## 开源调研结论

2026-03-15 调研了 LibreChat（36k stars）、assistant-ui（8.8k stars）、LobeChat（77k stars）、Vercel AI SDK PR #5085、Forky、Dexie.js、idb、LangChain ConversationSummaryBufferMemory、gpt-tokenizer 等方案。

| 问题 | 结论 | 理由 |
|------|------|------|
| **消息树** | 自建（~300 行），参考 assistant-ui | 无独立库可用。所有成熟项目（LibreChat / LobeChat / assistant-ui）都用 flat messages + parentId 模式，与我们设计一致 |
| **IndexedDB** | 引入 `idb`（1.2KB） | 替换手写 IDBRequest 样板代码。Dexie.js（15KB）功能过重 |
| **上下文压缩** | 自建（~100-150 行） | 无可用库。LangChain 依赖链太重。行业标准是 DIY rolling summary（Claude Code / OpenCode / Cline 均如此） |
| **跨设备同步** | 复用现有 Cloudflare R2 + D1 | 已有基础设施。Chat session 是简单 JSON blob，不需要新的同步库 |
| **Token 计数** | 用 LLM 返回的 `usage` 数据 | 不引入客户端 tokenizer（gpt-tokenizer 等），避免编码不匹配风险 |

---

## 决策记录

### D1: 消息树数据结构 — flat mapping vs linked-list 图

**决策**：`mapping: Record<string, MessageNode>`（flat 字典）

- **考虑过的替代方案**：assistant-ui 的 `prev`/`next` 链表指针图
- **选择理由**：flat 字典可直接序列化到 IndexedDB（JSON.stringify），无需额外的序列化/反序列化逻辑。链表图适合纯内存场景（O(1) 导航），但持久化时需要拆解指针重建引用
- **取舍**：查 parent/children 需要一次字典查找（O(1) 但有哈希开销），比指针解引用慢；但在 chat 消息量级（数百条）下无实际影响

### D2: 消息身份 — 位置映射 vs 给 AgentMessage 附加 ID

**决策**：位置映射（`syncAgentToTree` 差量追加）

- **考虑过的替代方案**：monkey-patch `AgentMessage` 加 `_nodeId` 字段
- **选择理由**：不侵入 pi-agent-core 的类型系统。位置映射在 streaming 期间 UI 锁定（按钮 disabled）的前提下是安全的
- **风险**：如果未来允许 streaming 中编辑，位置映射会失效。届时需要切换到 ID 映射

### D3: Bridge 存储 — session 级元数据 vs 树节点

**决策**：Option B — `ChatSession.bridges[]` 数组

- **考虑过的替代方案**：Option A — Bridge 作为 `MessageNode`（`message.role === 'bridge'`）插入树中
- **选择理由**：树的职责是存储用户可见的对话消息。Bridge 是系统压缩产物，作为树节点会污染 `getLinearPath()`、`children.length`（分支计数）、UI 渲染逻辑
- **取舍**：需要独立的 `getCompressedPath()` 函数组装 LLM 上下文（检查 bridges 位置 → 截断早期消息）

### D4: 压缩层 — 调用层 vs transformContext hook

**决策**：在 `streamChat()` 调用层执行

- **考虑过的替代方案**：在 `transformContext` hook 中压缩
- **选择理由**：压缩有持久化副作用（写 `session.bridges`、写 IndexedDB）。`transformContext` 应是纯变换（每轮 LLM 调用都执行，无副作用）。压缩是一次性决策，应在 prompt 前显式执行
- **pi-agent-core 约束**：`agent.prompt()` 包住整个 tool loop，调用层无法在 tool loop 中途插入压缩。靠 `message_end` + `isContextOverflow()` + `agent.continue()` 兜底

### D5: 事件系统 — 三事件分工

**决策**：`turn_end`（增量持久化）+ `agent_end`（最终确认）+ `message_end`（overflow 检测）

- **考虑过的替代方案**：只用 `agent_end`（更简单）；只用 `isStreaming` 轮询（现有模式）
- **选择理由**：browser tool chain 可达 10+ 轮，只用 `agent_end` 在中途断开时丢失全部进度。`turn_end` 增量持久化实现断点恢复。`isStreaming` 是状态（适合 UI），不是事件（适合副作用）
- **`syncAgentToTree` 幂等性**：`turn_end` 和 `agent_end` 都调用 `syncAgentToTree`，后者只追加差量，多次调用安全

### D6: 同步冲突 — server-side CAS vs LWW

**决策**：Server-side compare-and-swap（push 带 `baseRevision`）

- **考虑过的替代方案**：静默 last-write-wins
- **选择理由**：消息树模型下，静默覆盖会丢失整个分支，违反"原始消息永远不删"原则。CAS 在版本不匹配时返回 409 + 远端数据，让用户选择处理方式
- **已知限制**：不做 mapping-level merge（不自动合并两边各自创建的分支）

### D7: IndexedDB 封装 — idb vs Dexie vs 手写

**决策**：引入 `idb`（1.2KB）

- **考虑过的替代方案**：继续手写 IDBRequest（现状）；Dexie.js（15KB，含 reactive hooks）
- **选择理由**：`idb` 是 Promise 薄封装，API 与原生 IndexedDB 一致，学习成本为零。Dexie 功能丰富但 15KB 对我们的 IndexedDB 使用量级过重。手写样板代码冗长且容易出错（忘记关 transaction 等）

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
- 不采用 assistant-ui 组件库 — Chat UI 已定制化，只参考其 `MessageRepository` 数据结构
- 不采用 LangChain memory — 依赖链过重（~100 行 DIY 即可）
