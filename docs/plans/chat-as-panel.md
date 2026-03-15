# Chat as Panel — 设计方案 v3

> Chat 晋升为面板级，与 NodePanel 同层、同权、同操作。宽屏并排，窄屏 dropdown 切换。

## 动机

Chat 和 Notes 是**对等工作区**——用户在 Chat 里做多轮对话、操作节点、分析网页，不是"背景环境"。宽屏时它们已经并排（对等），窄屏时也应该是对等的 tab 切换，而非"层级揭开"。

统一为 Panel 后：
- 一个心智模型——一切都是卡片
- 窄屏 Notes dropdown 自然包含 Chat（无需特殊处理）
- DeskLayout 大幅简化（删除 chat 层、resize handle、宽窄判断）
- 支持多个 Chat 面板（不同对话同时可见）

## 核心变化

| 现状 | 目标 |
|------|------|
| ChatDrawer 在桌面层，独立 Z 轴 | ChatPanel 与 NodePanel 同级，浮动卡片 |
| `chatOpen` / `toggleChat()` toggle 机制 | 用通用 `openPanel()` / `closePanel()` |
| 单例 Agent | Agent 注册表，每个 ChatPanel 独立实例 |
| DeskLayout 管理两层布局 + resize | DeskLayout 简化为纯面板容器 |

**不变的**：Chat session 管理（ai-chat-tree / ai-persistence）、Agent 核心（pi-agent-core）、ChatInput / ChatMessage 组件、Debug 模式、消息树/分支/压缩。

---

## 1. Panel ID 体系扩展

| 前缀 | 示例 | 类型 |
|------|------|------|
| _(无)_ | `ws123_abc` | NodePanel（节点 ID） |
| `app:` | `app:about` | AppPanel（纯 UI 路由） |
| `chat:` | `chat:sess_abc123` | **ChatPanel（聊天会话）** |

```typescript
// src/types/node.ts — 新增

export const CHAT_PANEL_PREFIX = 'chat:';

export function isChatPanel(panelNodeId: string): boolean {
  return panelNodeId.startsWith(CHAT_PANEL_PREFIX);
}

export function chatPanelSessionId(panelNodeId: string): string {
  return panelNodeId.slice(CHAT_PANEL_PREFIX.length);
}
```

---

## 2. UIStore 改动

### 删除

```diff
- chatOpen: boolean;              // session-only, L71
- openChat(): void;               // L543
- closeChat(): void;              // L545
- toggleChat(): void;             // L547
```

由通用面板操作替代。

### 保留

```typescript
pendingChatPrompt: string | null;
setPendingChatPrompt(prompt: string | null): void;
```

投递逻辑（找到活跃 ChatPanel 或新建）由 `chat-panel-actions.ts` 编排函数处理。

### hasBackingNode 适配

```diff
  function hasBackingNode(nodeId: string): boolean {
    if (nodeId.startsWith('app:')) return true;
+   if (nodeId.startsWith(CHAT_PANEL_PREFIX)) return true;
    // ... node store check
  }
```

### NavigationEvent

删除 `NavigationEvent` 类型注释中的 _"Chat events are NOT included in navHistory"_。Chat 面板的 `open-panel` / `close-panel` 事件正常进入 `navHistory`，支持 undo/redo。

---

## 3. Agent 多实例管理

### 现状

```typescript
// ai-service.ts
let agentSingleton: Agent | null = null;
export function getAIAgent(): Agent { /* 返回/创建单例 */ }
export async function restoreLatestChatSession(agent: Agent): Promise<void> { /* 从 IndexedDB 取最新 session */ }
```

全局唯一。多面板场景下所有面板竞争同一个 latest session。

### 目标

```typescript
// ai-service.ts — 新增

const agentRegistry = new Map<string, Agent>();

/** 获取或创建指定 session 的 Agent 实例。 */
export function getAgentForSession(sessionId: string): Agent {
  let agent = agentRegistry.get(sessionId);
  if (!agent) {
    agent = createAgent();
    agentRegistry.set(sessionId, agent);
  }
  return agent;
}

/** 按 sessionId 恢复指定 session。ChatPanel mount 时调用。 */
export async function restoreChatSessionById(
  sessionId: string,
  agent: Agent,
): Promise<void> {
  const runtime = getAgentRuntimeState(agent);
  if (runtime.hydrated) return;

  if (!runtime.restorePromise) {
    runtime.restorePromise = (async () => {
      await configureAgent(agent);
      const session = await getChatSession(sessionId);
      if (session) {
        setCurrentSession(agent, session);
        agent.replaceMessages(getCompressedPath(session));
      } else {
        // session 被删除或首次打开 — 创建新 session 并立即保存
        const newSession = createSession();
        // 覆盖 id 以匹配面板 nodeId
        Object.assign(newSession, { id: sessionId });
        await saveChatSession(newSession);
        setCurrentSession(agent, newSession);
      }
      runtime.hydrated = true;
    })();
  }
  await runtime.restorePromise;
}
```

**不主动 destroy**：Agent 是轻量 JS 对象，关闭面板只是从 `panels[]` 移除。undo 重新打开时无缝恢复。

`getAIAgent()` 保留用于非面板场景（Spark）。Chat 面板用 `getAgentForSession(sessionId)`。

### useAgent hook 适配

新增可选 `sessionId` 参数，决定走哪个 restore 路径：

```typescript
// use-agent.ts
export function useAgent(agent: Agent = getAIAgent(), sessionId?: string) {
  useEffect(() => {
    const restoreFn = sessionId
      ? restoreChatSessionById(sessionId, agent)
      : restoreLatestChatSession(agent);
    void restoreFn.finally(() => { if (!cancelled) setReady(true); ... });
  }, [agent, sessionId]);
  // ... rest unchanged
}
```

---

## 4. 编排函数

```typescript
// src/lib/chat-panel-actions.ts — 新建

import { createSession } from './ai-chat-tree.js';
import { saveChatSession } from './ai-persistence.js';
import { CHAT_PANEL_PREFIX, isChatPanel } from '../types/index.js';
import { useUIStore } from '../stores/ui-store.js';

/** 创建新 session 并打开 ChatPanel。 */
export async function openChatPanel(insertIndex?: number): Promise<void> {
  const session = createSession();
  await saveChatSession(session);
  useUIStore.getState().openPanel(
    CHAT_PANEL_PREFIX + session.id,
    insertIndex,
  );
}

/** 聚焦已有 ChatPanel，没有则新建。⌘L 用。 */
export async function focusOrOpenChat(): Promise<void> {
  const { panels, activePanelId, setActivePanel } = useUIStore.getState();
  // 当前面板已是 Chat → 不做任何事
  if (panels.some((p) => p.id === activePanelId && isChatPanel(p.nodeId))) return;
  // 有其他 Chat 面板 → 聚焦
  const anyChatPanel = panels.find((p) => isChatPanel(p.nodeId));
  if (anyChatPanel) {
    setActivePanel(anyChatPanel.id);
    return;
  }
  // 没有 Chat 面板 → 新建
  await openChatPanel();
}

/** 找到活跃 ChatPanel 并投递 prompt，没有则新建。⌘K Ask AI 用。 */
export async function openChatWithPrompt(prompt: string): Promise<void> {
  const { panels, activePanelId, setActivePanel, setPendingChatPrompt } =
    useUIStore.getState();
  const activeChatPanel = panels.find(
    (p) => p.id === activePanelId && isChatPanel(p.nodeId),
  );
  const targetPanel = activeChatPanel ?? panels.find((p) => isChatPanel(p.nodeId));

  if (targetPanel) {
    setActivePanel(targetPanel.id);
  } else {
    await openChatPanel();
  }
  setPendingChatPrompt(prompt);
}
```

---

## 5. DeskLayout 简化

从两层 Z 轴布局简化为纯面板容器：

```typescript
// DeskLayout.tsx — 目标

export function DeskLayout() {
  return (
    <div className="flex flex-1 overflow-hidden p-1.5">
      <PanelLayout toolbar={<GlobalTools />} />
    </div>
  );
}
```

**删除**：`chatOpen` 订阅、`isWideLayout` 状态、`useChatResize` hook、ChatDrawer lazy import、所有 resize handle、`ChatFallback` 组件、宽窄条件判断。

**`use-chat-resize.ts`**：整个文件删除。面板间距由 PanelLayout 的 `gap-1.5` 控制。

---

## 6. PanelLayout 适配

### 面板内容分发

```typescript
// PanelLayout.tsx

function renderPanelContent(nodeId: string, panelId: string) {
  if (isChatPanel(nodeId)) {
    return <ChatPanel panelId={panelId} sessionId={chatPanelSessionId(nodeId)} />;
  }
  if (isAppPanel(nodeId)) {
    return <AppPanel panelId={nodeId as AppPanelId} />;
  }
  return <NodePanel nodeId={nodeId} panelId={panelId} />;
}
```

### Shaped tab 排除

ChatPanel 没有 Breadcrumb（不是节点树），走 `hasTab` 会用 `<Breadcrumb nodeId="chat:xxx">` 崩溃。排除：

```diff
- const hasTab = isLast && !!toolbar && !isApp;
+ const isChat = isChatPanel(nodeId);
+ const hasTab = isLast && !!toolbar && !isApp && !isChat;
```

ChatPanel 作为最后面板时走普通卡片布局（与 AppPanel 同）。

### Dropdown 模式

PR #143 已实现 Notes dropdown。ChatPanel 自然出现在 dropdown 列表里。`PanelLabel` 组件需要增加 `chat:` 分支：

```typescript
function PanelLabel({ nodeId }: { nodeId: string }) {
  const name = useNodeStore((s) => {
    void s._version;
    if (isChatPanel(nodeId)) return 'Chat';
    if (isAppPanel(nodeId)) return nodeId.replace(/^app:/, '').replace(/^./, (c) => c.toUpperCase());
    const node = s.getNode(nodeId);
    const raw = node?.name ?? '';
    return raw.replace(/<[^>]+>/g, '').trim() || 'Untitled';
  });
  return <>{name}</>;
}
```

### Dropdown 中 Chat 的视觉区分

Chat 面板在 dropdown 列表中用 ✦ 图标（Sparkles）替代 ● bullet，区分于 NodePanel：

```tsx
<span className={`shrink-0 text-[10px] ${active ? 'text-primary' : 'text-foreground-tertiary'}`}>
  {isChatPanel(panel.nodeId) ? <Sparkles size={10} /> : '●'}
</span>
```

---

## 7. ChatPanel 组件

从 `ChatDrawer` 演化。

| ChatDrawer（现状） | ChatPanel（目标） |
|-------------------|-----------------|
| `<aside>` 根元素 | `<div>` 填满面板卡片 |
| Close → `closeChat()` | Close → `closePanel(panelId)` |
| `useAgent()` 无参 | `useAgent(getAgentForSession(sessionId), sessionId)` |
| `pendingChatPrompt` 始终消费 | 只在活跃面板时消费 |
| 背景色略暗（`bg-background-recessed`） | 与 NodePanel 相同 `bg-background` |
| `+` → 同 agent 换 session | `+` → `openChatPanel()` 新开面板 |

Props：`{ panelId: string; sessionId: string }`

**`shouldStickChatScroll`**：从 ChatDrawer 迁移到 ChatPanel（或提取到独立 util）。`chat-ui.test.ts` import 路径同步更新。

### `pendingChatPrompt` 消费守卫

只在当前面板是活跃面板时消费：

```typescript
const activePanelId = useUIStore((s) => s.activePanelId);
const isActive = activePanelId === panelId;

useEffect(() => {
  if (!isActive || !pendingChatPrompt || ...) return;
  setPendingChatPrompt(null);
  void handleSendMessage(pendingChatPrompt);
}, [isActive, pendingChatPrompt, ...]);
```

---

## 8. TopToolbar ✦ 按钮

位置不变（PR #143 已实现）。行为从 `toggleChat()` 改为 `focusOrOpenChat()`：

```diff
- const chatOpen = useUIStore((s) => s.chatOpen);
- const toggleChat = useUIStore((s) => s.toggleChat);
+ import { focusOrOpenChat } from '../../lib/chat-panel-actions.js';

  <button
    type="button"
-   onClick={toggleChat}
+   onClick={() => void focusOrOpenChat()}
    className="..."
-   aria-label={chatOpen ? 'Close chat' : 'Open chat'}
-   aria-pressed={chatOpen}
+   aria-label="Open chat"
  >
    <Sparkles size={15} strokeWidth={1.6} className="text-foreground-tertiary" />
  </button>
```

按钮不再有 toggle 语义（Chat 面板通过通用的 X/⌘⇧W 关闭）。

---

## 9. 调用方迁移

| 调用方 | 现状 | 目标 |
|--------|------|------|
| `TopToolbar.tsx` | `toggleChat()` | `focusOrOpenChat()` |
| `use-chat-shortcut.ts` | `toggleChat()` | `focusOrOpenChat()` |
| `CommandPalette.tsx` | `openChat()` + `setPendingChatPrompt()` | `openChatWithPrompt(query)` |
| `use-panel-keyboard.ts` | ⌘\ fallback 无排除 | 排除 `chat:` / `app:` 面板 |
| `App.tsx` bootstrap | 只排除 `app:` | 额外排除 `chat:` 前缀 |

### ⌘\ 排除

```typescript
// use-panel-keyboard.ts
if (!nodeId || isChatPanel(nodeId) || isAppPanel(nodeId)) return;
```

### App.tsx bootstrap

```diff
  if (!currentPanelNodeId.startsWith('app:')
+   && !currentPanelNodeId.startsWith(CHAT_PANEL_PREFIX)
    && !loroDoc.hasNode(currentPanelNodeId))
```

---

## 10. 文件清单

| 文件 | 改动 | 大小 |
|------|------|------|
| `src/types/node.ts` | 新增 `CHAT_PANEL_PREFIX`、`isChatPanel()`、`chatPanelSessionId()` | 小 |
| `src/lib/chat-panel-actions.ts` | **新建** — 编排函数 | 小 |
| `src/lib/ai-service.ts` | `agentRegistry` + `getAgentForSession()` + `restoreChatSessionById()` | 中 |
| `src/hooks/use-agent.ts` | 新增可选 `sessionId` 参数 | 小 |
| `src/stores/ui-store.ts` | 删除 `chatOpen` 系列，`hasBackingNode` 加 `chat:` | 小 |
| `src/components/chat/ChatPanel.tsx` | **新建**，从 ChatDrawer 演化 | 中 |
| `src/components/chat/ChatDrawer.tsx` | **删除** | — |
| `src/hooks/use-chat-resize.ts` | **删除** | — |
| `src/components/layout/DeskLayout.tsx` | 大幅简化（~90 行 → ~10 行） | 小 |
| `src/components/panel/PanelLayout.tsx` | `isChatPanel` 分发 + `hasTab` 排除 + `PanelLabel` 适配 | 小 |
| `src/components/toolbar/TopToolbar.tsx` | `toggleChat()` → `focusOrOpenChat()` | 小 |
| `src/hooks/use-chat-shortcut.ts` | `toggleChat()` → `focusOrOpenChat()` | 小 |
| `src/hooks/use-panel-keyboard.ts` | ⌘\ fallback 排除 `chat:` / `app:` | 小 |
| `src/components/search/CommandPalette.tsx` | `openChat()` → `openChatWithPrompt()` | 小 |
| `src/entrypoints/sidepanel/App.tsx` | bootstrap 排除 `chat:` 前缀 | 小 |
| `tests/vitest/chat-ui.test.ts` | `ChatDrawer` → `ChatPanel` + import 更新 | 小 |
| `tests/vitest/panel-layout.test.ts` | 增加 ChatPanel dropdown 测试 | 小 |
| `tests/vitest/ui-store.test.ts` | 删除 `chatOpen` 测试 | 小 |
| `tests/vitest/ui-store-persist.test.ts` | 删除 `chatOpen` 字段断言 | 小 |
| `tests/vitest/helpers/test-state.ts` | 删除 `chatOpen` 初始值 | 小 |

**不改的**：`ai-chat-tree.ts`、`ai-persistence.ts`、`ChatInput.tsx`、`ChatMessage.tsx`、`ToolCallBlock.tsx`、`ToolbarUserMenu.tsx`（PR #143 已清理）。

---

## 11. Checklist

按依赖顺序 commit：

- [ ] `node.ts` — 新增 `chat:` 前缀类型和工具函数
- [ ] `ai-service.ts` — `agentRegistry` + `getAgentForSession()` + `restoreChatSessionById()`
- [ ] `use-agent.ts` — 新增可选 `sessionId` 参数
- [ ] `ui-store.ts` — 删除 `chatOpen` 系列，`hasBackingNode` 加 `chat:`
- [ ] `chat-panel-actions.ts` — 新建编排函数
- [ ] `ChatPanel.tsx` — 从 ChatDrawer 演化（props / agent / close / new chat / pendingChatPrompt 守卫 / `shouldStickChatScroll` 迁移）
- [ ] `PanelLayout.tsx` — `isChatPanel` 分发 + `hasTab` 排除 + `PanelLabel` 适配 + dropdown ✦ 图标
- [ ] `DeskLayout.tsx` — 删除 chat 层，简化为纯面板容器
- [ ] `App.tsx` — bootstrap 排除 `chat:` 前缀
- [ ] 迁移调用方：`TopToolbar`、`CommandPalette`、`use-chat-shortcut`、`use-panel-keyboard`
- [ ] 删除：`ChatDrawer.tsx`、`use-chat-resize.ts`
- [ ] 测试同步：更新 `chat-ui.test.ts`、`panel-layout.test.ts`、`ui-store.test.ts`、`ui-store-persist.test.ts`、`helpers/test-state.ts`
- [ ] `npm run verify`
