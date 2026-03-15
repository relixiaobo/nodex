# AI Chat 架构方案

> Chat 持久化、上下文压缩、跨设备同步的统一设计。
>
> **更新**：2026-03-15 — 上下文管线 Step 1-2 已完成；消息树 + 压缩 + 同步方案设计完成

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

```
streamChat()
  → configureAgent()                     // model + temperature + tools + systemPrompt
  → agent.prompt()
      → transformContext(messages)        // ✅ stripOldImages + injectReminder
      → convertToLlm(messages)           // ✅ 过滤非 LLM 消息类型
      → streamFn → streamProxyWithApiKey  // ✅ 纯网络转发
```

已完成的关键变化：
- `transformContext` / `convertToLlm` / `getApiKey` 各司其职（#132）
- Skill name+description 索引在 system prompt，详细规则通过 `node_read` 按需拉取（#134）
- 动态上下文（panel/page/time）通过 `transformContext` 注入到消息流，不进 system prompt

---

## Phase 1: 消息树数据模型

### 设计原则

1. **去掉所有限制** — 不限会话数、不限消息数，全量保留。用户的聊天记录不应被静默删除
2. **消息树结构** — 支持编辑消息、重新生成、分支导航
3. **会话标题** — 首次 assistant 回复后自动生成。MVP 先用第一条用户消息前 30 字截断
4. **原始消息永远不删** — 压缩只影响发给 LLM 的上下文，不影响存储和 UI
5. **图片剥离** — 保持当前策略（替换为占位符），图片体积大不适合存储和同步

### 行业调研：对话分支模型

| | ChatGPT | Claude Code | OpenCode |
|---|---|---|---|
| **数据结构** | 消息树（`mapping` dict + `parent_id`/`children`） | DAG（`parentUuid` 链，JSONL 追加） | 线性数组 |
| **编辑消息** | 在父节点下创建兄弟节点 → 新分支 | 不支持，用 `/rewind` 替代 | 不支持，undo + 重新输入 |
| **重新生成** | 在同一父节点下创建 assistant 兄弟 | 不支持 | 不支持 |
| **分支导航** | `← 2/3 →` 箭头，即时切换 | 无 UI（数据保留但不可见） | 无（线性） |
| **旧分支** | 永久保留，随时切回 | 保留在文件但不可导航 | **永久删除** |
| **核心洞察** | 编辑和重新生成是**同一操作**（创建兄弟节点） | — | — |

**结论**：采用 ChatGPT 的消息树模型——编辑和重新生成用统一机制，所有历史永久保留。

### 数据模型

```typescript
interface ChatSession {
  id: string;
  title: string | null;
  mapping: Record<string, MessageNode>;  // 所有消息节点的平铺字典
  currentNode: string;                   // 当前活跃分支的叶节点 ID
  createdAt: number;
  updatedAt: number;
  syncedAt: number | null;               // 同步状态追踪（Phase 4 使用）
}

interface MessageNode {
  id: string;
  parentId: string | null;       // null = 根节点
  children: string[];            // 子节点 ID 列表（多个 = 有分支）
  message: AgentMessage | null;  // null 为合成根节点
}
```

存储：保持 IndexedDB（`soma-ai-chat`），去掉 `MAX_SESSIONS` / `MAX_MESSAGES_PER_SESSION` 限制。

### 与 pi-agent-core 的关系

树是**存储模型**，pi-agent-core 始终看到线性数组：

```
加载会话 → 从树导出线性路径 → agent.replaceMessages(linearPath)
用户发消息 → agent 追加到 messages → 同步写入树的 currentNode 分支
编辑/重新生成 → 在树中创建新分支 → 导出新线性路径 → agent.replaceMessages(newPath)
```

### 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/lib/ai-persistence.ts` | 重写 | `ChatSession` 改为 `mapping` + `currentNode` 树模型；去掉限制 |
| `src/lib/ai-service.ts` | 修改 | 加载时从树导出线性路径；保存时同步回树 |
| `src/hooks/use-agent.ts` | 修改 | 适配新 session 结构 |
| `tests/vitest/ai-persistence.test.ts` | 新建 | 树操作测试 |

---

## Phase 2: 编辑 + 重新生成 + 分支导航

### 操作语义

| 操作 | 机制 |
|------|------|
| **正常对话** | 新消息作为 `currentNode` 的子节点，更新 `currentNode` 指向新叶 |
| **编辑消息** | 在被编辑消息的**父节点**下创建新 user 兄弟 → 触发新 assistant 子节点 → `currentNode` 指向新叶 |
| **重新生成** | 在 user 消息下创建新 assistant 兄弟 → `currentNode` 指向新叶 |
| **切换分支** | 改变选中的子节点 → 沿后代走到叶 → 更新 `currentNode` |
| **展示对话** | 从 `currentNode` 沿 `parentId` 向上到根 → 反转 → 线性路径 → 渲染 |

**分支导航 UI**：`children.length > 1` 时，在子消息上显示 `← 2/3 →` 箭头。

### 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/lib/ai-chat-tree.ts` | 新建 | `appendMessage` / `editMessage` / `regenerate` / `switchBranch` / `getLinearPath` |
| `src/components/chat/ChatMessage.tsx` | 修改 | 分支导航箭头 |
| `src/components/chat/ChatDrawer.tsx` | 修改 | 编辑消息、重新生成按钮 |
| `tests/vitest/ai-chat-tree.test.ts` | 新建 | 分支操作 + 路径切换测试 |

---

## Phase 3: Context 自动压缩

### 行业调研

| 维度 | Claude Code | OpenCode |
|------|-------------|----------|
| **触发阈值** | 接近 context window 上限（具体值未公开） | `总 token >= context - maxOutputTokens`（硬阈值） |
| **检测数据** | 未公开 | LLM 返回的实际 `usage` token 数 |
| **两阶段** | 先清旧工具输出 → 再摘要对话 | 先 prune 工具输出（保护最近 40K）→ 再摘要 |
| **摘要定位** | "同事交接" | 同——"another agent can read it and continue" |
| **摘要模型** | 同模型（命中 prompt cache） | 可配置不同模型 |
| **用户感知** | 自动无感 | 自动无感 |

**soma 共同遵循的模式**：
1. 压缩是系统行为，用户无感
2. 原始消息始终保留
3. 摘要 = 交接备忘
4. 用实际 token 数据触发（不估算）

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
- **LLM 层**：`convertToLlm` 将其转为标准 user message

### 触发逻辑

```typescript
async function compactIfNeeded(messages, agent, signal) {
  const threshold = agent.state.model.contextWindow * 0.7;
  const lastInputTokens = getLastKnownInputTokens(messages); // 从最近 AssistantMessage.usage
  if (lastInputTokens < threshold) return messages;
  return await compact(messages, agent, signal);
}
```

在 `transformContext` 管线中的位置：

```typescript
transformContext: async (messages, signal) => {
  let ctx = messages;
  ctx = await compactIfNeeded(ctx, agent, signal);    // 1. 压缩（按需）
  ctx = injectReminder(ctx, await buildSystemReminder()); // 2. 动态上下文注入
  return ctx;
},
```

溢出兜底：LLM 返回 `isContextOverflow` 时，强制压缩 + `agent.continue()` 重试。

### 压缩流程

```
超阈值 → 触发压缩：

1. 发送 Compact Prompt（同一模型，命中 prompt cache）
   → 模型生成 Handoff Memo

2. 构建 Bridge Message → 填入 Bridge Template
   → { role: 'bridge', content: bridgeContent, timestamp }

3. 重建上下文
   → [Bridge Message] + [Current User Message]
   → agent.replaceMessages(newMessages)
```

压缩是透明的中间步骤——用户发消息后，如果 token 超阈值，压缩在下一次 LLM 调用前自动执行，然后模型继续处理用户的任务。

### 与消息树的关系

**待定设计**：Bridge 信息的存放位置有两个选项，需要 review 时确认。

**选项 A — Bridge 作为树中的内联节点**：压缩时在 A₅₀ 和 U₅₁ 之间插入 Bridge 节点（re-parent U₅₁），`transformContext` 从最后一个 bridge 节点开始取路径。

```
树结构:  Root → U₁ → A₁ → ... → A₅₀ → Bridge → U₅₁ → A₅₁
UI 展示: 全部可见（Bridge 渲染为折叠分隔线）
LLM 收到: Bridge → U₅₁ → A₅₁
```

优点：bridge 随树持久化，session restore 自动恢复压缩状态。
缺点：压缩会修改树拓扑（re-parent），增加复杂度。

**选项 B — Bridge 作为 session 级元数据**：树拓扑不变，bridge 存在 session 上。

```typescript
interface ChatSession {
  // ...
  bridges: Array<{
    afterNodeId: string;   // 此节点之后的路径被压缩
    content: string;       // Handoff Memo
    timestamp: number;
  }>;
}
```

```
树结构:  Root → U₁ → A₁ → ... → A₅₀ → U₅₁ → A₅₁  (不变)
LLM 收到: [bridges.last.content as user message] → U₅₁ → A₅₁
```

优点：树拓扑永远不变，逻辑更简单。
缺点：bridge 和树是两个独立数据，需要保持一致。

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
| `src/lib/ai-compress.ts` | 新建 | Handoff 压缩逻辑 |
| `src/lib/ai-context.ts` | 修改 | `transformContext` 中加入 `compactIfNeeded()` |
| `tests/vitest/ai-compress.test.ts` | 新建 | 压缩触发条件 + 边界保护测试 |

---

## Phase 4: 跨设备同步

### 核心原则

**同步完整原始对话，不是压缩后的摘要。** 用户在乎原始聊天记录，压缩是系统内部优化，两者独立。

### 方案：Sync API 独立通道

不走 Loro CRDT，原因：
- Chat 是追加写入，不需要 CRDT 冲突合并
- 节点 LoroDoc 已经很大，不应再塞 chat 数据
- Last-write-wins 对 chat 场景完全够用

```
D1: chat_sessions 表（id, user_id, workspace_id, title, message_count, timestamps）
R2: chat/{workspace_id}/{session_id}.json（完整 ChatSession JSON）
```

### 同步流程

- **Push**：`updatedAt > syncedAt` → PUT D1 行 + PUT R2 对象 → 更新本地 `syncedAt`
- **Pull**：查 D1 `updated_at > lastPullAt` → GET R2 → last-write-wins 合并 → 写入本地 IndexedDB
- **时机**：复用 SyncManager 的 30s 定时 + visibilitychange 触发

### 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/lib/ai-persistence.ts` | 修改 | push/pull 逻辑 |
| `src/lib/sync/sync-manager.ts` | 修改 | 加入 `syncChatSessions()` 步骤 |
| Backend: `worker/` | 新建 | D1 表 + R2 存储的 API 端点 |

---

## 不做的事

- 不用 Loro CRDT 同步 chat — 追加写入，last-write-wins 足够
- 不引入精确 tokenizer — 用 `AssistantMessage.usage` 实际数据
- 不自建溢出检测 — 用 pi-ai 的 `isContextOverflow()`
- 不拆 IndexedDB 为 session + message 两个 store — 当前会话量级不需要
