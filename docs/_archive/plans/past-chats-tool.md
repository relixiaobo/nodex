# past_chats 工具设计

> 让 AI 能跨会话回忆历史对话。
>
> **2026-03-19** — 产品讨论 + 行业调研 + 工具设计收敛

## 背景

### 产品方向

soma v5 确立 Chat 为主界面，AI 为协作伙伴（见 `ai-first-product-vision.md`）。核心缺口不在工具层（node CRUD 已完备），在**记忆层**——AI 无法回忆上次聊了什么。

Chat 持久化基础设施已全部完成（Phase 1-4），IndexedDB 中有完整的消息树数据。但 AI 没有工具访问这些历史数据。

### 行业调研

调研了 Claude.ai、ChatGPT、Gemini、Cursor、Mem0、LibreChat、LobeChat 等产品的跨会话记忆设计。

**关键发现**：

| 模式 | 代表 | 做法 |
|------|------|------|
| 按需检索 | Claude.ai | AI 决定何时搜索，返回片段 |
| 始终注入 | ChatGPT | 每次注入 ~15 条摘要 + 记忆 |

- Claude 用两个工具（`recent_chats` + `conversation_search`），原因是后端架构不同（数据库时间查询 vs RAG 搜索索引）
- ChatGPT 的"记忆"和"历史"分离——soma 天然具备这个分离：节点 = 长期记忆，chat transcript = 过程历史
- Cursor 的教训：自动生成记忆太嘈杂，直接删掉了，改回手动维护规则文件
- soma 的结构优势：其他产品的记忆是 key-value 黑箱，soma 的记忆是节点（有标签/字段/可搜索/可编辑）

### 设计讨论过程

**为什么不分两个工具？**

Claude 分 `recent_chats` + `conversation_search` 是因为后端架构不同（数据库查询 vs 搜索索引）。soma 的数据全在 IndexedDB 里，一个工具即可，参数正交不互斥。AI 模型够聪明，不需要靠拆工具来引导决策。

**返回什么内容才准确高效？**

过多无关信息会影响模型回答质量。讨论了几个方案：

1. ❌ 完整 transcript — 太长，大量噪音
2. ❌ 一轮对话（user + assistant）— assistant 回复可能几千 token，仍然太粗
3. ❌ KWIC snippets（关键词前后 200 字）— 依赖关键词匹配算法做相关性判断
4. ✅ **渐进式探索** — AI 自己逐层浏览，自己做相关性判断

**渐进式探索的灵感**：

来自 `node_read` 的设计模式——用户（或 AI）先看父节点有哪些子节点，再根据相关的子节点一层一层往下探索。同样的心智模型应用到 chat 历史：

- Level 0: 看有哪些 session
- Level 1: 看某个 session 里用户说了什么（user 消息通常很短，信息密度高，天然适合做索引）
- Level 2: 展开某条消息的 assistant 回复（这里才需要内容，且支持分页）

**为什么 Level 1 只列 user 消息？**

- user 消息通常一两句话，短且信息密度高
- assistant 消息可能很长（整理笔记、分析文章），不适合作为索引
- 看 user 说了什么就能判断这段对话的主题
- 不包含 system-reminder（注入的上下文信息，对回忆无意义）

**为什么 Level 2 需要分页？**

assistant 回复可能几千 token。参考 Claude Code 读文件（200 行一轮）和 browser 工具的 `get_text`（maxChars + textOffset），长文本应该分页返回，AI 按需读取。

**语义搜索是否需要？**

不需要。关键词搜索足够，原因：
- AI 可以多次调用、换关键词重试（"定价" 搜不到就搜 "涨价"、"pricing"）
- 对话内容是自然语言，关键词命中率比代码搜索高
- 语义搜索需要 embedding + 向量存储，在浏览器扩展里太重

---

## 工具定义

### Tool: `past_chats`

```
name: "past_chats"
label: "Past Chats"
description: |
  Explore past chat conversations. Three-level progressive disclosure,
  same mental model as node_read (parent → children → detail):

  - No sessionId → list sessions (title + time + message count)
  - sessionId → list user messages in that session (short, good for scanning)
  - sessionId + messageId → read that message + corresponding assistant response

  query filters results at any level by keyword match.
  before/after filter sessions by time.

  Assistant responses can be long. Use maxChars + textOffset for pagination
  (same pattern as browser get_text).

  Quick patterns:
  - Browse recent: past_chats()
  - Time range: past_chats(after: "2026-03-01", before: "2026-03-15")
  - Search across all: past_chats(query: "定价")
  - Explore session: past_chats(sessionId: "xxx")
  - Search within session: past_chats(sessionId: "xxx", query: "涨价")
  - Read response: past_chats(sessionId: "xxx", messageId: "yyy")
  - Paginate long response: past_chats(sessionId: "xxx", messageId: "yyy", textOffset: 2000)
```

#### Parameters

```typescript
{
  sessionId: {
    type: "string",
    description: "Session to explore. Omit to list sessions.",
  },
  messageId: {
    type: "string",
    description: "Message to read in full. Requires sessionId. "
      + "Returns this user message + its corresponding assistant response.",
  },
  query: {
    type: "string",
    description: "Keyword filter (case-insensitive substring match). "
      + "Level 0: filter sessions by title and user message content. "
      + "Level 1: filter user messages by text content.",
  },
  before: {
    type: "string",
    description: "ISO datetime. Filter sessions updated before this time.",
  },
  after: {
    type: "string",
    description: "ISO datetime. Filter sessions updated after this time.",
  },
  limit: {
    type: "number",
    default: 10,
    max: 20,
    description: "Max items to return (sessions or messages). Default 10, max 20.",
  },
  offset: {
    type: "number",
    default: 0,
    description: "Pagination offset for sessions or messages.",
  },
  maxChars: {
    type: "number",
    default: 2000,
    description: "Level 2 only: max characters of assistant response to return. "
      + "Use with textOffset for pagination on long responses. Default 2000.",
  },
  textOffset: {
    type: "number",
    default: 0,
    description: "Level 2 only: character offset into assistant response. "
      + "Use when previous call returned truncated: true.",
  },
}
```

#### Return Values

**Level 0** — session list (no sessionId):

```json
{
  "total": 25,
  "offset": 0,
  "limit": 10,
  "sessions": [
    { "id": "s1", "title": "Q3 定价策略讨论", "updatedAt": "2026-03-18T14:30:00Z", "messageCount": 12 },
    { "id": "s2", "title": "AI Agent 架构设计", "updatedAt": "2026-03-17T10:00:00Z", "messageCount": 8 }
  ]
}
```

**Level 1** — user messages in session (sessionId, no messageId):

```json
{
  "sessionId": "s1",
  "title": "Q3 定价策略讨论",
  "total": 6,
  "offset": 0,
  "limit": 10,
  "messages": [
    { "id": "m1", "text": "帮我整理定价相关笔记", "createdAt": "2026-03-18T10:00:00Z" },
    { "id": "m3", "text": "涨价幅度怎么定的", "createdAt": "2026-03-18T10:05:00Z" },
    { "id": "m5", "text": "竞品的涨价节奏是怎样的", "createdAt": "2026-03-18T10:12:00Z" }
  ]
}
```

**Level 2** — message detail with pagination (sessionId + messageId):

```json
{
  "user": { "id": "m3", "text": "涨价幅度怎么定的" },
  "assistant": {
    "text": "根据竞品分析，Q2 行业平均涨幅 10%...",
    "totalLength": 3500,
    "offset": 0,
    "truncated": true,
    "nextOffset": 2000
  }
}
```

`nextOffset` 和 `truncated` 只在内容被截断时出现，与 browser `get_text` 模式一致。

---

## 实现方案

### 现有基础设施

数据层已经完备（Phase 1-4 全部完成）：

| 基础设施 | 状态 | 位置 |
|----------|------|------|
| ChatSession 消息树模型 | ✅ | `src/lib/ai-chat-tree.ts` |
| IndexedDB 持久化 (DB v3) | ✅ | `src/lib/ai-persistence.ts` |
| Session CRUD + 分页查询 | ✅ | `ai-persistence.ts` — `listChatSessionMetas()`, `getChatSession()` |
| 消息树遍历 | ✅ | `ai-chat-tree.ts` — `getLinearPath()` |
| AI 工具注册机制 | ✅ | `src/lib/ai-tools/index.ts` — `getAITools()` |
| 工具参数校验 | ✅ | `@mariozechner/pi-ai` Type schema |

### 关键数据结构

```typescript
// ai-chat-tree.ts — 已有
interface ChatSession {
  id: string;
  title: string | null;           // 首条 user 消息前 30 字
  mapping: Record<string, MessageNode>;
  currentNode: string;
  createdAt: number;
  updatedAt: number;
  syncedAt: number | null;
  revision: number;
  bridges: BridgeEntry[];
}

interface MessageNode {
  id: string;
  parentId: string | null;       // null = 合成根节点
  children: string[];
  currentChild: string | null;
  level: number;
  message: AgentMessage | null;  // null = 合成根节点
}
```

```typescript
// ai-persistence.ts — 已有
interface ChatSessionMeta {
  id: string;
  title: string | null;
  updatedAt: number;
}

// 已有函数：
listChatSessionMetas(): Promise<ChatSessionMeta[]>  // 按 updatedAt 降序
getChatSession(sessionId: string): Promise<ChatSession | null>
```

### Level 实现逻辑

#### Level 0 — session 列表

```typescript
// 使用已有的 listChatSessionMetas()
// 加上 before/after 时间过滤 + query 过滤
// query 匹配 title（如需更精确，可加载 session 扫描 user 消息）
const metas = await listChatSessionMetas();
// → 过滤 + 分页 → 返回 { total, sessions: [...] }
```

注意：`listChatSessionMetas()` 返回轻量 meta（id + title + updatedAt），不加载完整 session。Level 0 的 query 过滤如果只匹配 title，速度很快。如果需要匹配消息内容，才需要逐个加载 session（可以后续优化为 IndexedDB 全文索引）。

#### Level 1 — user 消息列表

```typescript
const session = await getChatSession(sessionId);
const path = getLinearPath(session);

// 只提取 user 消息，排除 system-reminder 注入的内容
const userMessages = path
  .filter(node => node.message?.role === 'user')
  .map(node => ({
    id: node.id,
    text: extractUserText(node.message),  // 提取纯文本，去掉 system-reminder
    createdAt: /* 从 message 或 node 获取时间 */,
  }));

// query 过滤 + 分页 → 返回 { sessionId, title, total, messages: [...] }
```

**`extractUserText` 注意事项**：
- user 消息的 `content` 可能是 string 或 `ContentPart[]`（含 text + image）
- 需要提取所有 `type: 'text'` 的部分，拼接为纯文本
- 需要过滤掉 `<system-reminder>` 标签包裹的内容（这是 transformContext 注入的上下文，不是用户真正说的话）
- 截断到前 200 字符 + `hasMore` 标记（绝大部分 user 消息远不到 200 字，但偶尔用户会贴长文）
- 参考现有 `getMessageTitle()` 的文本提取逻辑（`ai-chat-tree.ts` 行 67-79）

#### Level 2 — 消息详情

```typescript
const session = await getChatSession(sessionId);
const path = getLinearPath(session);

// 找到目标 user 消息
const targetNode = session.mapping[messageId];
// 找到它的下一条 assistant 消息（path 中紧跟其后的 assistant）
const targetIndex = path.findIndex(n => n.id === messageId);
const assistantNode = path.slice(targetIndex + 1)
  .find(n => n.message?.role === 'assistant');

const userText = extractUserText(targetNode.message);
const assistantText = extractAssistantText(assistantNode?.message);

// 对 assistantText 应用 maxChars + textOffset 分页
const slice = assistantText.slice(textOffset, textOffset + maxChars);
const truncated = textOffset + maxChars < assistantText.length;

// 返回 { user, assistant: { text, totalLength, offset, truncated, nextOffset? } }
```

**`extractAssistantText` 注意事项**：
- assistant 消息的 `content` 包含 text blocks + thinking blocks + toolCall blocks
- 只提取 `type: 'text'` 的部分，拼接为纯文本
- 排除 thinking blocks（推理过程对回忆无意义）
- 排除 toolCall blocks（工具调用中间过程是噪音）
- 如果 assistant 消息之间穿插了 toolResult，跳过（它们是 AI 内部操作，不是给用户的回复）

### 关键词搜索实现

Level 0 的 query 匹配需要注意性能：

1. **快速路径**（默认）：只匹配 `title`（来自 meta，不需要加载 session）
2. **深度路径**（query 在 title 中没找到结果时）：逐个加载 session，扫描 user 消息内容

深度路径可能较慢（每个 session 都要从 IndexedDB 加载），但 soma 是个人工具，session 数量有限（几十到几百），可以接受。后续如果需要优化，可以在 IndexedDB 中增加 user 消息的全文索引。

Level 1 的 query 只在已加载的 session 内搜索，没有性能问题。

### 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/lib/ai-tools/past-chats-tool.ts` | 新建 | 工具实现：三层渐进探索 + 关键词过滤 + 分页 |
| `src/lib/ai-tools/index.ts` | 修改 | 注册 `pastChatsTool` 到 `getAITools()` |
| `src/lib/ai-persistence.ts` | 可能修改 | 如需添加按时间范围查询的辅助函数 |
| `tests/vitest/past-chats-tool.test.ts` | 新建 | 三层返回 + 过滤 + 分页 + 边界情况测试 |

### system prompt 更新

需要在 `ai-agent-node.ts` 的 system prompt 中添加 past_chats 工具的使用指导：

```
When the user references past conversations or assumes shared knowledge,
use the past_chats tool to search history. Browse sessions first, then
drill into relevant ones. Use query to filter when you have specific keywords.

Never say "I don't have access to previous conversations" without
checking past_chats first.

Prioritize current context over past if contradictory.
```

---

## Checklist

- [ ] 新建 `src/lib/ai-tools/past-chats-tool.ts`
  - [ ] 定义 `pastChatsToolParameters` schema（Type.Object）
  - [ ] Level 0: 实现 session 列表（调用 `listChatSessionMetas()` + before/after/query 过滤 + 分页）
  - [ ] Level 1: 实现 user 消息列表（加载 session → `getLinearPath()` → 过滤 user 消息 → 截断 200 字 → query 过滤 + 分页）
  - [ ] Level 2: 实现消息详情（定位 user 消息 → 找对应 assistant 回复 → `maxChars` + `textOffset` 分页）
  - [ ] `extractUserText()`: 提取纯文本，去掉 system-reminder，截断
  - [ ] `extractAssistantText()`: 提取纯文本，排除 thinking/toolCall blocks
  - [ ] 参数校验：messageId 需要 sessionId，textOffset 需要 messageId
  - [ ] 错误处理：session 不存在、message 不存在 → 返回有意义的错误信息（建议使用 `past_chats()` 浏览）
- [ ] 修改 `src/lib/ai-tools/index.ts`
  - [ ] 导入 `pastChatsTool`
  - [ ] 加入 `getAITools()` 返回数组
- [ ] 排除当前 session
  - [ ] Level 0 列表中排除当前正在进行的 session（AI 已经有当前对话的上下文，不需要搜索自己）
  - [ ] 通过工具的 execute 上下文获取当前 session ID（参考其他工具如何获取运行时状态）
- [ ] system prompt 更新
  - [ ] 在 `src/lib/ai-agent-node.ts` 添加 past_chats 使用指导
- [ ] 测试
  - [ ] 新建 `tests/vitest/past-chats-tool.test.ts`
  - [ ] Level 0: 无参数返回所有 session、before/after 过滤、query 过滤、分页
  - [ ] Level 1: 返回 user 消息列表、query 过滤、分页、system-reminder 过滤
  - [ ] Level 2: 返回 user + assistant 全文、maxChars 截断、textOffset 分页、nextOffset 计算
  - [ ] 边界：空 session、只有 user 消息无 assistant 回复、assistant 回复为空
  - [ ] 错误：无效 sessionId、无效 messageId
- [ ] `npm run verify`（typecheck → test-sync → test → build）

## 工具设计质量标准

> 摘自 `docs/_archive/plans/tool-definitions.md` 和 `memory/ai-tool-design-principles.md`。past_chats 工具必须满足以下标准。

### 描述质量（CiC standard）

工具 description 必须包含：
1. **What it does** — 一句话概括
2. **Available modes** — 三层探索模式各一行说明
3. **Defaults and limits** — 分页默认值、maxChars 默认值
4. **Error recovery** — session/message 不存在时该怎么办
5. **Quick patterns** — 具体的调用示例，模型可以直接模仿

### 参数描述质量

每个参数 description 必须包含：
1. **哪个 Level 使用** — "Level 2 only: ..."
2. **默认值** — "Default 10, max 20"
3. **示例** — 具体值（ISO 日期格式、session ID 格式）
4. **约束** — 依赖关系（"Requires sessionId"）
5. **替代关系** — 参数间的互动（"Use when previous call returned truncated: true"）

### 返回值设计原则

1. **不重复调用参数**：模型传了 `sessionId`，Level 1 返回值中的 `sessionId` 是确认而非冗余（因为它同时返回了 `title`，构成有意义的上下文）
2. **只返回新信息**：Level 0 不返回消息内容，Level 1 不返回 assistant 回复
3. **条件返回**：`truncated` 和 `nextOffset` 只在内容被截断时出现
4. **失败时提供行动指南**：
   - session 不存在：`"Session not found: xxx. Use past_chats() to browse available sessions."`
   - message 不存在：`"Message not found: yyy in session xxx. Use past_chats(sessionId: 'xxx') to browse messages."`
   - 无搜索结果：`"No sessions match query 'xxx'. Try different keywords or use past_chats() to browse all sessions."`

### API 形状引导行为

- 参数名用 `sessionId` + `messageId` 明确层级关系，而非 `id` + `type` 等模糊名称
- `maxChars` 和 `textOffset` 只在 Level 2 有意义——description 中明确标注 "Level 2 only"
- 不设 `level` 参数——由 sessionId/messageId 的有无自动决定，减少模型选择负担

### 防止常见误用

工具 description 中应预防性引导：
- **不要用 past_chats 搜索当前对话内容** — 当前对话已在上下文中
- **先浏览再深入** — 不要猜 sessionId，先调 `past_chats()` 看列表
- **关键词要具体** — 用名词和专有名词，不要用"讨论"、"提到"等元对话词
- **优先当前上下文** — 过去和当前矛盾时，以当前为准

---

## 注意事项

1. **不要动现有代码的结构**。这个工具是纯新增，不修改任何现有工具或持久化逻辑
2. **参考 `read-tool.ts` 的代码风格**——参数用 `Type.Object` + `Type.Optional`，返回用 `formatResultText()`
3. **AgentMessage 的 content 类型**是 `string | ContentPart[]`，必须处理两种情况。参考 `ai-chat-tree.ts` 行 67-79 的 `getMessageTitle()`
4. **user 消息中的 system-reminder** 是 `transformContext` 注入的（`<system-reminder>` 标签），在提取文本时需要过滤掉。用正则 `/<system-reminder>[\s\S]*?<\/system-reminder>/g` 移除
5. **IndexedDB 是异步的**，所有持久化操作返回 Promise
6. **当前 session 排除**：AI 已经有当前对话的完整上下文，past_chats 不应该返回当前 session
7. **messageCount** 在 Level 0 返回值中 = session 的 user 消息数量（不是所有消息的数量），这样 AI 知道进入 Level 1 后大概会看到多少条消息
8. **错误消息必须可执行**——不要 `"Not found"`，要告诉模型下一步该做什么（见上方返回值设计原则）
