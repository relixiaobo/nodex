# Phase 0: 基座 — pi-mono 集成 + 最小 Chat

> 依赖：无（所有 AI 功能的起点）
> 执行者：nodex（主 Agent，需要 spike 验证 + 视觉调试）
> 来源：ai-strategy.md §15 "AI 调用架构：pi-mono + Proxy 模式" + multi-panel-design.md §3 Phase 1 "Chat 抽屉"

---

## 目标

验证完整栈可用：用户发消息 → 经 Cloudflare Worker 代理 → Claude 流式回复。

**这不是"写一个聊天功能"，是建立后续所有 AI 能力的地基。** Phase 1-5 的 tool calling、steering、subagent 全部建立在 pi-agent-core 的 Agent 类之上。

**交付物**：用户在 Settings 输入 API key → 打开 ChatDrawer → 发送消息 → 看到 Claude 流式回复 → 可中途停止

---

## 架构

来源：ai-strategy.md §15

```
Chrome 扩展 (Side Panel)                  Cloudflare Worker              LLM Provider
┌──────────────────────┐               ┌───────────────────────┐      ┌──────────────┐
│ pi-agent-core Agent  │   POST        │  POST /api/stream     │      │              │
│   streamProxy()      │──────────────→│                       │      │  Anthropic   │
│                      │   SSE stream  │  pi-ai stream()       │─────→│  /v1/messages│
│   authToken:         │←──────────────│  → ProxyEvent SSE     │←─────│              │
│   getStoredToken()   │               │                       │      │  OpenAI      │
│                      │               │  Auth: Bearer token   │      │  Google      │
│ API key:             │               │  (existing requireAuth)│      │  ...         │
│ chrome.storage.local │               │                       │      │              │
└──────────────────────┘               └───────────────────────┘      └──────────────┘
```

### 为什么 Proxy 而不是客户端直连

来源：ai-strategy.md §15

- Chrome 扩展不适合打包 20+ provider SDK（bundle size）
- API key Phase 1 迁移到 Settings 节点字段（Loro，随工作区同步）
- Cloudflare Worker 天然适合做 API 代理（低延迟、全球边缘）
- BYOK 用户的 key 也通过 Worker 代理

---

## 协议细节（从 pi-mono 源码确认）

### streamProxy 客户端请求

来源：`pi-mono/packages/agent/src/proxy.ts:121-137`

```
POST ${proxyUrl}/api/stream
Headers:
  Authorization: Bearer {authToken}
  Content-Type: application/json
Body:
  {
    "model": Model,           // { provider, id, api, ... }
    "context": Context,       // { messages, tools?, systemPrompt?, ... }
    "options": {
      "temperature": number?,
      "maxTokens": number?,
      "reasoning": object?    // thinking/reasoning config
    }
  }
```

### 服务端响应格式

来源：`pi-mono/packages/agent/src/proxy.ts:36-57` ProxyAssistantMessageEvent

服务端返回 `Content-Type: text/event-stream`，每个事件格式 `data: {JSON}\n\n`：

```typescript
type ProxyAssistantMessageEvent =
  | { type: "start" }
  | { type: "text_start"; contentIndex: number }
  | { type: "text_delta"; contentIndex: number; delta: string }
  | { type: "text_end"; contentIndex: number; contentSignature?: string }
  | { type: "thinking_start"; contentIndex: number }
  | { type: "thinking_delta"; contentIndex: number; delta: string }
  | { type: "thinking_end"; contentIndex: number; contentSignature?: string }
  | { type: "toolcall_start"; contentIndex: number; id: string; toolName: string }
  | { type: "toolcall_delta"; contentIndex: number; delta: string }
  | { type: "toolcall_end"; contentIndex: number }
  | { type: "done"; reason: StopReason; usage: Usage }
  | { type: "error"; reason: StopReason; errorMessage?: string; usage: Usage }
```

**关键**：ProxyAssistantMessageEvent 是 AssistantMessageEvent 去掉 `partial` 字段后的精简版（减少带宽）。客户端 `processProxyEvent()` 在本地重建 partial message。

### 服务端实现（pi-mono 未提供现成 handler）

pi-mono 只提供了客户端 `streamProxy()`，**服务端 handler 需要我们自己实现**。逻辑：

```
1. 接收 POST { model, context, options }
2. 提取 API key（Phase 0: 从 context._apiKey；Phase 1: 从 Settings 节点字段读取）
3. 调用 pi-ai 的 stream(model, context, { apiKey, ...options })
4. 遍历 AssistantMessageEvent 事件流
5. 每个事件转换为 ProxyAssistantMessageEvent（去掉 partial 字段）
6. 以 SSE 格式发送：data: {JSON}\n\n
```

**事件转换规则**（从 proxy.ts processProxyEvent 反推）：

| AssistantMessageEvent | ProxyAssistantMessageEvent |
|----------------------|---------------------------|
| `{ type: "start", partial }` | `{ type: "start" }` |
| `{ type: "text_delta", contentIndex, delta, partial }` | `{ type: "text_delta", contentIndex, delta }` |
| `{ type: "done", reason, message }` | `{ type: "done", reason, usage: message.usage }` |
| `{ type: "error", reason, error }` | `{ type: "error", reason, errorMessage: error.errorMessage, usage: error.usage }` |
| ...其余类型同理：保留类型特定字段，去掉 partial/message/error | |

---

## Step 1: Server — LLM Proxy Endpoint

### 安装依赖

```bash
cd server && npm install @mariozechner/pi-ai
```

**注意**：pi-ai 依赖 provider SDK（@anthropic-ai/sdk、openai 等），Cloudflare Workers 兼容性需要验证。如果有问题，可能需要只安装核心包或用 `fetch` 直接调用 provider。

### 创建 `server/src/routes/ai.ts`

```typescript
// Hono sub-app, mounted at /api (匹配 streamProxy 的 ${proxyUrl}/api/stream)
import { Hono } from 'hono';
import { stream as piStream } from '@mariozechner/pi-ai';
import type { Env } from '../types.js';
import type { AuthVariables } from '../middleware/auth.js';
import { requireAuth } from '../middleware/auth.js';

const ai = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
ai.use('*', requireAuth);

ai.post('/stream', async (c) => {
  const body = await c.req.json();
  const { model, context, options } = body;

  // Phase 0: API key from context._apiKey (Phase 1: from Settings node)
  const apiKey = context?._apiKey;
  delete context?._apiKey;  // 清除后再传给 pi-ai
  if (!apiKey) {
    return c.json({ error: 'API key required' }, 400);
  }

  // Validate required fields
  if (!model || !context) {
    return c.json({ error: 'model and context required' }, 400);
  }

  try {
    const eventStream = piStream(model, context, {
      ...options,
      apiKey,
    });

    // Create SSE response
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // Process events in background
    (async () => {
      try {
        for await (const event of eventStream) {
          const proxyEvent = convertToProxyEvent(event);
          if (proxyEvent) {
            await writer.write(
              encoder.encode(`data: ${JSON.stringify(proxyEvent)}\n\n`)
            );
          }
        }
      } catch (error) {
        const errorEvent = {
          type: 'error',
          reason: 'error',
          errorMessage: error instanceof Error ? error.message : String(error),
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        };
        await writer.write(
          encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`)
        );
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

function convertToProxyEvent(event: any): any {
  // 去掉 partial/message/error 字段，保留类型特定字段
  switch (event.type) {
    case 'start': return { type: 'start' };
    case 'text_start': return { type: 'text_start', contentIndex: event.contentIndex };
    case 'text_delta': return { type: 'text_delta', contentIndex: event.contentIndex, delta: event.delta };
    case 'text_end': return { type: 'text_end', contentIndex: event.contentIndex, contentSignature: event.content?.textSignature };
    case 'thinking_start': return { type: 'thinking_start', contentIndex: event.contentIndex };
    case 'thinking_delta': return { type: 'thinking_delta', contentIndex: event.contentIndex, delta: event.delta };
    case 'thinking_end': return { type: 'thinking_end', contentIndex: event.contentIndex, contentSignature: event.content?.thinkingSignature };
    case 'toolcall_start': return { type: 'toolcall_start', contentIndex: event.contentIndex, id: event.partial?.content?.[event.contentIndex]?.id, toolName: event.partial?.content?.[event.contentIndex]?.name };
    case 'toolcall_delta': return { type: 'toolcall_delta', contentIndex: event.contentIndex, delta: event.delta };
    case 'toolcall_end': return { type: 'toolcall_end', contentIndex: event.contentIndex };
    case 'done': return { type: 'done', reason: event.reason, usage: event.message?.usage };
    case 'error': return { type: 'error', reason: event.reason, errorMessage: event.error?.errorMessage, usage: event.error?.usage };
    default: return null;
  }
}

export { ai as aiRoutes };
```

**注意**：`convertToProxyEvent` 的字段映射需要根据 pi-ai 的实际 `AssistantMessageEvent` 结构调整——这是 Phase 0 最大的技术风险。建议先用 curl 测试确认事件格式。

### 修改 `server/src/index.ts`

在现有路由之后添加：

```typescript
import { aiRoutes } from './routes/ai.js';
app.route('/api', aiRoutes);
```

**注意**：挂载到 `/api`（不是 `/api/ai`），因为 pi-agent-core 的 `streamProxy` 硬编码请求路径为 `${proxyUrl}/api/stream`。如果 proxyUrl = Worker 域名，server 需要在 `/api/stream` 接收请求。

来源：`pi-mono/packages/agent/src/proxy.ts:121` streamProxy 请求路径

### 验证

```bash
cd server && npx wrangler dev

# 另一个终端：
curl -N -X POST http://localhost:8787/api/stream \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": {"provider":"anthropic","id":"claude-sonnet-4-20250514","api":"anthropic"},
    "context": {"messages":[{"role":"user","content":"Say hi"}],"_apiKey":"sk-ant-..."},
    "options": {}
  }'
```

预期：收到 SSE 事件流，包含 `text_delta` 和最终的 `done`。

**注意**：API key 通过 `context._apiKey` 传递（不是顶层 `body.apiKey`），与客户端 `streamProxy` 的注入方式一致。

---

## Step 2: Client — pi-agent-core 集成

### 安装依赖

```bash
npm install @mariozechner/pi-agent-core @mariozechner/pi-ai
```

**Bundle size 验证**：安装后检查 `npm run build` 的输出大小。pi-agent-core ~201KB，pi-ai 客户端侧只使用 `getModel()` 类型构造（不调用 provider SDK），应该 tree-shake 掉大部分代码。如果 bundle 过大，可能需要只从 pi-ai 导入类型。

### 创建 `src/lib/ai-service.ts`

```typescript
import { Agent, streamProxy } from '@mariozechner/pi-agent-core';
import { getModel } from '@mariozechner/pi-ai';
import { getStoredToken } from './auth.js';

// ── API Key 管理（Phase 0: chrome.storage.local）──

const AI_KEY_STORAGE = 'soma-ai-api-key';

export async function getApiKey(): Promise<string | null> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const result = await chrome.storage.local.get(AI_KEY_STORAGE);
    return result[AI_KEY_STORAGE] ?? null;
  }
  // standalone fallback
  return localStorage.getItem(AI_KEY_STORAGE);
}

export async function setApiKey(key: string): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({ [AI_KEY_STORAGE]: key });
  } else {
    localStorage.setItem(AI_KEY_STORAGE, key);
  }
}

export async function clearApiKey(): Promise<void> { /* ... */ }
export async function hasApiKey(): Promise<boolean> { /* ... */ }

// ── Agent 工厂 ──

const SYNC_API_URL = import.meta.env.VITE_SYNC_API_URL ?? 'http://localhost:8787';

export async function createAgent(): Promise<Agent> {
  const apiKey = await getApiKey();

  return new Agent({
    initialState: {
      systemPrompt: 'You are soma, a knowledge assistant...', // Phase 1: 从 #agent 节点加载
      model: getModel('anthropic', 'claude-sonnet-4-20250514'),
      thinkingLevel: 'off',
      tools: [],   // Phase 1: 加载 node/undo tool
      messages: [],
    },
    convertToLlm: (messages) => {
      // 过滤掉自定义消息类型（Phase 1+），只保留 LLM 可理解的
      return messages
        .filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'toolResult')
        .map((m) => ({ role: m.role, content: m.content, timestamp: m.timestamp }));
    },
    streamFn: async (model, context, options) => {
      const token = await getStoredToken();
      if (!token) throw new Error('Please sign in first');
      const apiKey = await getApiKey();

      return streamProxy(model, {
        ...context,
        _apiKey: apiKey,  // server 端提取后删除，再传给 pi-ai
      }, {
        ...options,
        authToken: token,
        proxyUrl: SYNC_API_URL,  // 复用现有 Cloudflare Worker
      });
    },
  });
}
```

**关键**：
- `proxyUrl` = 现有的 `VITE_SYNC_API_URL`（复用同一个 Cloudflare Worker）
- `authToken` = `getStoredToken()`（复用现有认证）
- API key 通过 `context._apiKey` 注入 → server 端提取后删除再传给 pi-ai
- Phase 1 迁移到 Settings 节点字段后，`_apiKey` 注入方式可能调整（key 从 Loro 读取后注入）

### 创建 `src/hooks/use-agent.ts`

```typescript
import { useEffect, useRef, useState, useCallback } from 'react';
import type { Agent, AgentEvent, AgentMessage } from '@mariozechner/pi-agent-core';

interface UseAgentState {
  messages: AgentMessage[];
  isStreaming: boolean;
  error: string | null;
}

export function useAgent(agent: Agent | null) {
  const [state, setState] = useState<UseAgentState>({
    messages: [],
    isStreaming: false,
    error: null,
  });

  useEffect(() => {
    if (!agent) return;

    // Initialize with current messages
    setState((s) => ({ ...s, messages: [...agent.state.messages] }));

    const unsubscribe = agent.subscribe((event: AgentEvent) => {
      switch (event.type) {
        case 'agent_start':
          setState((s) => ({ ...s, isStreaming: true, error: null }));
          break;
        case 'message_start':
        case 'message_update':
        case 'message_end':
          setState((s) => ({ ...s, messages: [...agent.state.messages] }));
          break;
        case 'agent_end':
          setState((s) => ({
            ...s,
            messages: [...agent.state.messages],
            isStreaming: false,
          }));
          break;
        case 'turn_end':
          // Tool results available
          setState((s) => ({ ...s, messages: [...agent.state.messages] }));
          break;
      }
    });

    return unsubscribe;
  }, [agent]);

  const sendMessage = useCallback(async (content: string) => {
    if (!agent || state.isStreaming) return;
    try {
      await agent.prompt(content);
    } catch (err) {
      setState((s) => ({
        ...s,
        isStreaming: false,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [agent, state.isStreaming]);

  const stopStreaming = useCallback(() => {
    if (agent) agent.abort();
  }, [agent]);

  return { ...state, sendMessage, stopStreaming };
}
```

**设计决策**：Agent 是消息的单一事实来源（README.md 跨 Phase 决策 #6）。不引入独立的 chat-store，避免双源同步。

---

## Step 3: Chat UI — ChatDrawer

### 设计来源

来源：multi-panel-design.md §3 Phase 1 "Chat 抽屉"

> Chat 不进入 panelHistory。它是一个独立的 overlay/sidebar，与 PanelStack 并列。

```
窄屏 (≤500px):
┌──────────────────────┐
│  PanelStack (Node)   │
├──────────────────────┤
│  Chat drawer         │  ← 底部抽屉，高度可拖拽 (1/3 到 2/3)
└──────────────────────┘

宽屏 (>500px):
┌────────────┬─────────┐
│ PanelStack │  Chat   │  ← Node 60%, Chat 40%
│  (Node)    │  panel  │
└────────────┴─────────┘
```

### ui-store 变更

在 `src/stores/ui-store.ts` 中添加：

```typescript
// State
chatOpen: boolean;        // 默认 false

// Actions
openChat(): void;
closeChat(): void;
toggleChat(): void;
```

**persist**：`chatOpen` 不持久化（每次打开扩展默认关闭，用户主动打开）。

### App.tsx 集成点

当前 App.tsx 布局（line 449-478）：

```tsx
<div className="flex h-screen w-full flex-col overflow-hidden bg-background text-foreground">
  <TopToolbar />
  <PanelStack />        ← ChatDrawer 需要在这里旁边
  <CommandPalette />
  <BatchTagSelector />
  <Toaster />
</div>
```

改为：

```tsx
<div className="flex h-screen w-full flex-col overflow-hidden bg-background text-foreground">
  <TopToolbar />
  <div className="flex flex-1 overflow-hidden">
    <PanelStack />                          {/* flex-1 */}
    {chatOpen && <ChatDrawer />}            {/* 宽屏: 固定宽度; 窄屏: 底部抽屉 */}
  </div>
  <CommandPalette />
  <BatchTagSelector />
  <Toaster />
</div>
```

**宽屏/窄屏切换**：ResizeObserver 监听容器宽度，>500px 用 flex 并排，≤500px ChatDrawer 改为绝对定位底部抽屉。

### 组件结构

**`src/components/chat/ChatDrawer.tsx`** — 主容器

```
┌────────────────────────────────┐
│ [Chat]              [⚙] [✕]   │  ← header
├────────────────────────────────┤
│                                │
│  如果没有 API key:              │
│  ┌──────────────────────────┐  │
│  │      🔑                  │  │
│  │  Enter your API key      │  │
│  │  [sk-ant-••••••••]       │  │
│  │  [Save]                  │  │
│  └──────────────────────────┘  │
│                                │
│  如果有 API key:               │
│  ┌──────────────────────────┐  │
│  │ Messages (scrollable)    │  │
│  │                          │  │
│  │ User: "hello"            │  │
│  │ Assistant: "Hi! ..."     │  │
│  └──────────────────────────┘  │
│                                │
├────────────────────────────────┤
│  [  Type a message...   ] [→]  │  ← 固定底部
└────────────────────────────────┘
```

- 没有 API key → 内嵌设置表单（替代消息区域）
- 有 API key → 聊天模式
- Header 右侧 ⚙ icon → 重新打开 API key 设置
- Header 右侧 ✕ → closeChat()

**`src/components/chat/ChatMessage.tsx`** — 消息渲染

- User 消息：`bg-foreground/[0.04]` 背景，圆角
- Assistant 消息：无背景
- 流式中：末尾显示闪烁 cursor（`animate-pulse` 小方块）
- Phase 0 纯文本（`whitespace-pre-wrap`），Phase 1 加 markdown + tool call 渲染

**`src/components/chat/ChatInput.tsx`** — 输入区

- `<textarea>` 自适应高度（1-4 行）
- 发送：`Cmd/Ctrl+Enter` 或点击发送按钮
- Streaming 时：输入禁用 + "Stop" 按钮（调用 `agent.abort()`）
- 空内容时禁用发送按钮

### 入口

**ToolbarUserMenu.tsx** — 添加 Chat 菜单项

在 Settings 和 About 之间：

```tsx
<button
  onClick={() => {
    setOpen(false);
    useUIStore.getState().openChat();
  }}
  className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm ..."
>
  <div className="flex w-4 shrink-0 items-center justify-center text-foreground-tertiary">
    <Sparkles size={14} strokeWidth={1.5} />
  </div>
  Chat
</button>
```

图标选择：`Sparkles`（已在 ToolbarUserMenu 中导入）或 `MessageCircle`（需要在 icons.ts 中添加导出）。

**快捷键**：`⌘L`（或 `⌘⇧L` 如果 Chrome 拦截）→ toggleChat()。需实测 Chrome Side Panel 有焦点时 `⌘L` 是否被 Chrome 吃掉。

---

## Step 4: API Key 设置

### 内嵌在 ChatDrawer 中

来源：原计划 "不用独立 Dialog"

ChatDrawer 两种状态：
1. **无 API key** → 显示设置表单
2. **有 API key** → 显示聊天界面

### 设置表单内容

```
Provider: Anthropic（Phase 0 固定）
[sk-ant-••••••••••••••••••]          ← password input
[Save]                                ← 验证前缀 sk-ant- 后保存

Get your key at console.anthropic.com
```

- 保存：`setApiKey()` → 切换到聊天模式
- Header ⚙ → 重新打开设置（显示已保存的 key 掩码 + Clear 按钮）
- 基本校验：非空 + 前缀 `sk-ant-`

---

## Step 5: Tests

### `tests/vitest/ai-service.test.ts`

- `getApiKey()` / `setApiKey()` / `clearApiKey()` / `hasApiKey()` — mock `chrome.storage.local`
- `createAgent()` — 返回 Agent 实例，验证 streamFn 设置

### `tests/vitest/use-agent.test.ts`（可选，UI hook 测试复杂度高）

- Mock Agent 实例 + subscribe
- 验证 sendMessage → state 更新
- 验证 stopStreaming → agent.abort() 调用

---

## 文件变更汇总

| Action | File | Scope |
|--------|------|-------|
| **npm install** | `server/package.json` | +`@mariozechner/pi-ai` |
| **npm install** | `package.json` (root) | +`@mariozechner/pi-agent-core` +`@mariozechner/pi-ai` |
| **Create** | `server/src/routes/ai.ts` | pi-ai proxy endpoint + event conversion (~120 行) |
| **Modify** | `server/src/index.ts` | 挂载 `/api` routes (+3 行) |
| **Create** | `src/lib/ai-service.ts` | Agent 工厂 + API key 管理 (~100 行) |
| **Create** | `src/hooks/use-agent.ts` | React hook 订阅 Agent 事件 (~70 行) |
| **Create** | `src/components/chat/ChatDrawer.tsx` | 主容器 (响应式布局 + API key 状态) (~150 行) |
| **Create** | `src/components/chat/ChatMessage.tsx` | 消息渲染 (~50 行) |
| **Create** | `src/components/chat/ChatInput.tsx` | 输入区 (~80 行) |
| **Modify** | `src/stores/ui-store.ts` | +chatOpen / openChat / closeChat / toggleChat (+15 行) |
| **Modify** | `src/entrypoints/sidepanel/App.tsx` | ChatDrawer 集成 (~10 行修改) |
| **Modify** | `src/components/toolbar/ToolbarUserMenu.tsx` | +Chat 菜单项 (+12 行) |
| **Modify** | `src/lib/icons.ts` | 如需添加 MessageCircle export (+1 行) |
| **Create** | `tests/vitest/ai-service.test.ts` | AI service 测试 |

**不修改**：
- `src/types/node.ts` — 不需要 APP_PANELS.CHAT（Chat 不是 AppPanel）
- `src/components/panel/AppPanel.tsx` — 不需要 Chat 路由
- `PanelStack.tsx` — 不改导航模型

---

## 技术风险

### 风险 1: pi-ai 在 Cloudflare Workers 上的兼容性（高）

pi-ai 依赖 provider SDK（@anthropic-ai/sdk、openai 等）。这些 SDK 可能使用 Node.js API（如 `fs`、`net`），在 Workers 上不可用。

**缓解**：
- 先用 `wrangler dev` 本地测试
- 如果 SDK 不兼容，只用 pi-ai 的类型定义，实际 API 调用用 `fetch` 直接写
- 或者把 pi-ai 的 `stream()` 函数逻辑提取到 Worker 中（pi-ai 核心不依赖 Node.js）

### 风险 2: streamProxy API key 传递（已解决）

`streamProxy` 的 body 格式是固定的 `{ model, context, options }`，没有 `apiKey` 字段。

**决策**：通过 `context._apiKey` 注入，server 端提取后删除。详见 Step 2 客户端实现。Phase 1 迁移到 Settings 节点字段后此注入方式可能调整。

### 风险 3: Bundle size（中）

pi-ai 的客户端 bundle 可能比预期大（包含 provider type 定义）。

**缓解**：
- 客户端只 import `getModel` 和类型
- 验证 tree-shaking 效果：`npm run build` 后检查 chunk 大小
- 如果过大，考虑只安装 pi-agent-core（它依赖 pi-ai 会自动安装）

### 风险 4: `convertToLlm` 消息格式（低）

pi-agent-core 的 `AgentMessage` 和 pi-ai 的 `Message` 类型可能不完全对齐。需要确认 `convertToLlm` 返回的格式。

**缓解**：阅读 pi-agent-core 的 `convertToLlm` 类型定义，确保返回正确的 `Message[]`。

---

## 验证标准

1. **Server**: `cd server && npx wrangler dev` → curl 测试 `/api/stream` → 收到 SSE 事件流
2. **TypeScript**: `npm run typecheck` → 无错误
3. **Test sync**: `npm run check:test-sync` → 通过
4. **Vitest**: `npm run test:run` → 所有测试通过
5. **Build**: `npm run build` → 构建成功，检查 bundle size
6. **Visual**: `npm run dev` → Chrome 加载扩展 → 用户菜单 → Chat → 设置 API key → 发送消息 → 看到流式回复
7. **Abort**: 流式响应期间点 Stop → 响应停止，可以发新消息
8. **Error**: 无效 API key → 显示错误信息
9. **Persist**: API key 保存后刷新 → key 仍然存在

---

## 提交策略

分步提交，每步 typecheck 通过：

1. `feat: AI proxy endpoint — pi-ai streaming proxy on Cloudflare Worker`
2. `feat: AI service layer — pi-agent-core Agent factory + API key management`
3. `feat: ChatDrawer — minimal chat UI with streaming response`
4. `test: AI service unit tests`

---

## Out of Scope（Phase 1+）

- Tool calling (node/browser/undo) → Phase 1
- 对话持久化（IndexedDB）→ Phase 1
- System prompt 从 #agent 节点加载 → Phase 1
- ⌘K 统一入口 → Phase 1
- API key 迁移到 Settings 节点字段 → Phase 1
- Reference 渲染 → Phase 1
- Markdown 渲染 → 独立排期
- 多 provider 选择 UI → 独立排期
- Tool call 渲染 → Phase 1
- 上下文构建（当前页面/选中节点）→ Phase 1+
