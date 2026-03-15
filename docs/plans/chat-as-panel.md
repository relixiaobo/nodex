# Chat as Panel — 设计方案

> Chat 从桌面层晋升为面板级，与 NodePanel 同层、同权、同操作。

## 动机

当前架构：Chat 在桌面层（Z-0），NodePanel 在卡片层（Z-10）。实际使用中 NodePanel 是常驻工作区，Chat 在桌面层始终上下挤占空间。Chat 不应该是"环境"，而是用户主动打开的独立工作面板——跟 NodePanel 一样可以自由操作，甚至可以开多个。

## 核心变化

| 现状 | 目标 |
|------|------|
| ChatDrawer 在桌面层，独立 Z 轴 | ChatPanel 与 NodePanel 同级，都是浮动卡片 |
| 单例 Chat，toggle 开关 | 多个 ChatPanel 共存（不同对话同时可见） |
| DeskLayout 管理两层布局 + 手动拉伸 | DeskLayout 简化为纯面板容器 |
| `chatOpen` / `openChat()` / `closeChat()` | Chat 用通用面板操作：`openPanel()` / `closePanel()` |
| 单例 Agent | Agent 注册表，每个 ChatPanel 独立 Agent 实例 |

---

## 1. Panel ID 体系扩展

现有两种面板 `nodeId`：

| 前缀 | 示例 | 类型 |
|------|------|------|
| _(无)_ | `ws123_abc` | NodePanel（节点 ID） |
| `app:` | `app:about` | AppPanel（纯 UI 路由） |

新增：

| 前缀 | 示例 | 类型 |
|------|------|------|
| `chat:` | `chat:sess_abc123` | ChatPanel（聊天会话） |

```typescript
// src/types/node.ts

export const CHAT_PANEL_PREFIX = 'chat:';

export function isChatPanel(panelNodeId: string): boolean {
  return panelNodeId.startsWith(CHAT_PANEL_PREFIX);
}

export function chatPanelSessionId(panelNodeId: string): string {
  return panelNodeId.slice(CHAT_PANEL_PREFIX.length);
}
```

### `hasBackingNode()` 适配

`ui-store.ts` 中的 `hasBackingNode()` 需要增加 `chat:` 前缀的 pass-through。当前三个调用方都经过此函数：

- `openPanel()` — 打开面板
- `navigateTo()` — 面板内导航
- `replacePanel()` — 替换面板内容

```diff
  function hasBackingNode(nodeId: string): boolean {
    if (nodeId.startsWith('app:')) return true;
+   if (nodeId.startsWith(CHAT_PANEL_PREFIX)) return true;
    // ... node store check
  }
```

### `App.tsx` bootstrap 适配

当前 `App.tsx:170` 的启动逻辑会把非 `app:` 前缀、且不在 LoroDoc 中的面板替换为 Today 节点。`chat:` 面板不在 LoroDoc 中，重启时会被干掉。需要排除：

```diff
- if (!currentPanelNodeId.startsWith('app:') && !loroDoc.hasNode(currentPanelNodeId))
+ if (!currentPanelNodeId.startsWith('app:')
+   && !currentPanelNodeId.startsWith(CHAT_PANEL_PREFIX)
+   && !loroDoc.hasNode(currentPanelNodeId))
```

---

## 2. UIStore 改动

### 删除

```diff
- chatOpen: boolean;
- openChat(): void;
- closeChat(): void;
- toggleChat(): void;
```

这些由通用面板操作替代。

### 保留

```typescript
pendingChatPrompt: string | null;
setPendingChatPrompt(prompt: string | null): void;
```

`setPendingChatPrompt` 只负责存值。投递逻辑（找到活跃 ChatPanel 或新建一个）由调用方处理（见 §5 交互细节）。

### 不新增 store action

打开 Chat 面板涉及 async 操作（IndexedDB 创建 session），不适合放在同步的 Zustand set() 里。提供独立的 orchestration 函数：

```typescript
// src/lib/chat-panel-actions.ts

import { createSession } from './ai-chat-tree.js';       // ← 注意：来自 ai-chat-tree，不是 ai-service
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
  if (panels.some((p) => p.id === activePanelId && isChatPanel(p.nodeId))) return;
  const anyChatPanel = panels.find((p) => isChatPanel(p.nodeId));
  if (anyChatPanel) {
    setActivePanel(anyChatPanel.id);
    return;
  }
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

### NavigationEvent

删除注释 _"Chat events are NOT included in navHistory"_ 和类型注释中相同的话。Chat 面板的 `open-panel` / `close-panel` 事件正常进入 `navHistory`，支持 undo/redo。

Chat 面板内部没有 `navigate` 事件（不存在"在同一个 chat 面板里导航到另一个 session"——要看另一个 session，开新面板）。

### 持久化

`panels[]` 已持久化。Chat 面板的 `nodeId`（如 `chat:sess_abc123`）自然被持久化。恢复时 ChatPanel mount → `useAgent(getAgentForSession(sessionId), sessionId)` → `restoreChatSessionById` 从 IndexedDB 恢复（见 §3）。

---

## 3. Agent 多实例管理

### 现状

```
agentSingleton ← createAgent()
getAIAgent()   → agentSingleton
restoreLatestChatSession(agent) → 从 IndexedDB 取最新 session（不支持按 ID 恢复）
```

全局唯一。多面板场景下所有面板会竞争同一个 latest session。

### 目标：Agent 注册表

```typescript
// src/lib/ai-service.ts

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
```

**不主动 destroy**：Agent 很轻量（纯 JS 对象 + 消息数组），关闭面板只是从 `panels[]` 移除。Agent 留在 registry 里，undo 重新打开面板时无缝恢复。页面卸载时自然清理。典型用户同时开 2-3 个 chat，registry 不会膨胀到有意义的程度。

`getAIAgent()` 保留用于非面板场景（如 Spark）。Chat 面板统一使用 `getAgentForSession(sessionId)`。

### 新增：按 ID 恢复 session

```typescript
// src/lib/ai-service.ts

/** 按 sessionId 恢复指定 session 到 agent。ChatPanel mount 时调用。 */
export async function restoreChatSessionById(
  sessionId: string,
  agent: Agent,
): Promise<void> {
  const runtime = getAgentRuntimeState(agent);
  if (runtime.hydrated) return;                // 幂等：已加载则跳过

  if (!runtime.restorePromise) {
    runtime.restorePromise = (async () => {
      await configureAgent(agent);
      const session = await getChatSession(sessionId);  // ai-persistence.ts 已有此函数
      if (session) {
        setCurrentSession(agent, session);
        agent.replaceMessages(getCompressedPath(session));
      } else {
        setCurrentSession(agent, createSession(sessionId));
      }
      runtime.hydrated = true;
    })();
  }
  await runtime.restorePromise;
}
```

### useAgent hook 适配

新增可选 `sessionId` 参数，决定走哪个 restore 路径：

```typescript
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

## 4. 布局简化

### DeskLayout

从"两层 Z 轴布局"简化为"纯面板容器"：

```diff
  export function DeskLayout() {
-   const chatOpen = useUIStore((s) => s.chatOpen);
-   const [isWideLayout, setIsWideLayout] = useState(...);
-   const { chatWidth, chatHeight, handlePointerDown } = useChatResize();
    return (
-     <div className={`flex flex-1 overflow-hidden p-1.5${wideChat ? '' : ' flex-col'}`}>
+     <div className="flex flex-1 overflow-hidden p-1.5">
        <PanelLayout toolbar={<GlobalTools />} />
-       {/* chat column / row / resize handles 全部删除 */}
      </div>
    );
  }
```

**删除**：`useChatResize` hook + `use-chat-resize.ts` 文件、Chat lazy import、宽窄布局判断、resize handle。

**GlobalTools** 始终通过 `toolbar` prop 传给 PanelLayout，始终显示在最后面板的 shaped tab 右侧。

### PanelLayout

新增第三种面板类型分发：

```typescript
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

#### Shaped tab 规则

当前 `hasTab = isLast && !!toolbar && !isApp`。ChatPanel 不是 AppPanel，会命中 hasTab，然后 `<Breadcrumb nodeId="chat:xxx">` 查 node store 崩溃。修复：

```typescript
const isChat = isChatPanel(nodeId);
const hasTab = isLast && !!toolbar && !isApp && !isChat;
```

ChatPanel 作为最后面板时走普通卡片布局（与 AppPanel 同）。GlobalTools 在卡片右上角的桌面区域。

#### Tab 模式标签

v1 简化：`InactiveTabLabel` 对 `chat:` 面板固定显示 `Chat`，不追求 session title。

原因：session title 来自 agent runtime / IndexedDB，没有可订阅的同步数据源。v1 用固定文本，后续迭代再加。

---

## 5. ChatPanel 组件

从 `ChatDrawer` 演化。差异：

| ChatDrawer（现状） | ChatPanel（目标） |
|-------------------|-----------------|
| `<aside>` 根元素 | `<div>` 填满面板卡片 |
| Close → `closeChat()` | Close → `closePanel(panelId)` |
| `useAgent()` 无参 | `useAgent(getAgentForSession(sessionId), sessionId)` |
| `pendingChatPrompt` 全局消费 | 只在活跃面板时消费 |
| 背景色略暗 | 与 NodePanel 相同 `bg-background` |
| `+` 按钮 → 同 agent 换 session | `+` 按钮 → `openChatPanel()` 新开面板 |

Props：`{ panelId: string; sessionId: string }`

内部结构不变：Header + Settings + 消息列表（`ChatMessage`）+ Composer（`ChatInput`）+ Debug panel。

### "New chat" 按钮行为变更

当前 ChatDrawer 的 `+` 按钮调用 `createNewChatSession(agent)`，在同一个 agent 上替换 session。面板化后 panel nodeId（`chat:oldSessionId`）和实际 session 会不一致。

**新行为**：`+` 按钮 = `openChatPanel()` 新开一个 ChatPanel。当前面板保持不变。

### `shouldStickChatScroll` 导出迁移

此工具函数当前从 `ChatDrawer.tsx` 导出，`chat-ui.test.ts` import 它。删除 ChatDrawer 时需要迁移到 `ChatPanel.tsx`。

---

## 6. 交互细节

### 打开 Chat

| 入口 | 行为 | 实现 |
|------|------|------|
| 工具栏 Chat 按钮 | 新建 session + 面板 | `openChatPanel()` |
| ⌘L / ⌘⇧L | 有 ChatPanel → 聚焦；无 → 新建 | `focusOrOpenChat()` |
| ⌘K → "Ask AI" + 输入内容 | 有 ChatPanel → 投递到活跃 Chat；无 → 新建 + 投递 | `openChatWithPrompt(query)` |
| ⌘K → "New Chat" | 总是新建 | `openChatPanel()` |
| Alt+Click Chat 按钮 | 在活跃面板右侧插入 | `openChatPanel(activeIndex + 1)` |
| ChatPanel 内 `+` 按钮 | 新建 ChatPanel（不替换当前） | `openChatPanel()` |

### 关闭 Chat

- X 按钮 / ⌘⇧W → `closePanel(panelId)`（通用）
- 最后一个面板不可关闭（通用规则）

### ⌘\ 排除 chat/app 面板

当前 `use-panel-keyboard.ts` 的 ⌘\ 逻辑：无 focused/selected node 时取 `selectCurrentNodeId(state)` 调 `openPanel(nodeId)`。活跃面板是 ChatPanel 时会复制一份同 session 的面板（无意义）。

修复：⌘\ fallback 排除 `chat:` 和 `app:` 面板：

```typescript
if (!nodeId) return;
if (isChatPanel(nodeId) || isAppPanel(nodeId)) return;
```

### 快捷键

| 快捷键 | 现有行为 | 新行为 |
|--------|---------|--------|
| ⌘L / ⌘⇧L (`global.toggle_chat`) | `toggleChat()` | `focusOrOpenChat()` |
| ⌘\ | 打开 NodePanel | 保留不变（排除 chat/app fallback） |
| ⌘⇧W | 关闭活跃面板 | 保留不变（Chat 面板适用） |
| ⌘⌥←→ | 切换面板 | 保留不变（Chat 面板参与） |

---

## 7. 文件清单

| 文件 | 改动 |
|------|------|
| `src/types/node.ts` | 新增 `CHAT_PANEL_PREFIX`、`isChatPanel()`、`chatPanelSessionId()` |
| `src/lib/chat-panel-actions.ts` | **新建** — `openChatPanel()`、`openChatWithPrompt()`、`focusOrOpenChat()` |
| `src/lib/ai-service.ts` | `agentSingleton` → `agentRegistry`，新增 `getAgentForSession()`、`restoreChatSessionById()` |
| `src/hooks/use-agent.ts` | 新增可选 `sessionId` 参数，按 ID 恢复 session |
| `src/stores/ui-store.ts` | 删除 `chatOpen` 系列 4 字段/方法，`hasBackingNode` 加 `chat:` pass-through |
| `src/entrypoints/sidepanel/App.tsx` | bootstrap 面板校验排除 `chat:` 前缀 |
| `src/components/chat/ChatPanel.tsx` | **新建**，从 ChatDrawer 演化 |
| `src/components/chat/ChatDrawer.tsx` | **删除**（`shouldStickChatScroll` 迁移到 ChatPanel） |
| `src/components/layout/DeskLayout.tsx` | 大幅简化，删除 chat 层（~60 行 → ~10 行） |
| `src/components/panel/PanelLayout.tsx` | `renderPanelContent` 加 `isChatPanel` 分支 + `hasTab` 排除 chat + `InactiveTabLabel` 适配 |
| `src/hooks/use-chat-shortcut.ts` | `toggleChat()` → `focusOrOpenChat()` |
| `src/hooks/use-chat-resize.ts` | **删除** |
| `src/hooks/use-panel-keyboard.ts` | ⌘\ fallback 排除 `chat:` / `app:` 面板 |
| `src/components/toolbar/ToolbarUserMenu.tsx` | `openChat()` → `openChatPanel()` |
| `src/components/search/CommandPalette.tsx` | `openChat()` + `setPendingChatPrompt()` → `openChatWithPrompt()` |
| `tests/vitest/ui-store.test.ts` | 删除 `chatOpen` 测试，补 chat panel 相关测试 |
| `tests/vitest/ui-store-persist.test.ts` | 删除 `chatOpen` 字段断言 |
| `tests/vitest/helpers/test-state.ts` | 删除 `chatOpen` 初始值（保留 `pendingChatPrompt` reset） |
| `tests/vitest/chat-ui.test.ts` | `ChatDrawer` import → `ChatPanel`（含 `shouldStickChatScroll`） |

---

## 8. Checklist

所有改动在一个 PR 内完成。按依赖顺序 commit：

- [ ] `node.ts` — 新增 `chat:` 前缀类型和工具函数
- [ ] `ui-store.ts` — 删除 `chatOpen` 系列，`hasBackingNode` 加 `chat:`（**必须在 chat-panel-actions 之前**，否则 `openPanel` 会 no-op）
- [ ] `ai-service.ts` — `agentSingleton` → `agentRegistry` + `getAgentForSession()` + `restoreChatSessionById()`
- [ ] `use-agent.ts` — 新增可选 `sessionId` 参数
- [ ] `chat-panel-actions.ts` — 新建 orchestration 函数（依赖 ui-store + ai-service）
- [ ] `ChatPanel.tsx` — 从 ChatDrawer 复制 + 适配 props / agent / close / new chat / `shouldStickChatScroll` 迁移
- [ ] `PanelLayout.tsx` — 加 `isChatPanel` 分支 + `hasTab` 排除 + tab 标签
- [ ] `DeskLayout.tsx` — 删除 chat 层，简化为纯面板容器
- [ ] `App.tsx` — bootstrap 面板校验排除 `chat:` 前缀
- [ ] 迁移调用方：`ToolbarUserMenu`、`CommandPalette`、`use-chat-shortcut`、`use-panel-keyboard`
- [ ] 删除：`ChatDrawer.tsx`、`use-chat-resize.ts`
- [ ] 测试同步：更新所有 `tests/vitest/` 中的引用（保留 `pendingChatPrompt` reset）
- [ ] `npm run verify`（typecheck → test-sync → test → build）
