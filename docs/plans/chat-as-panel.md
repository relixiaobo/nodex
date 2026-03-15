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

`hasBackingNode()` 在 ui-store 中增加 `chat:` 前缀的 pass-through（跟 `app:` 一样返回 `true`）。

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

`setPendingChatPrompt` 只负责存值。投递逻辑（找到活跃 ChatPanel 或新建一个）由调用方处理（见 §6 交互细节）。

### 不新增 store action

打开 Chat 面板涉及 async 操作（IndexedDB 创建 session），不适合放在同步的 Zustand set() 里。提供一个独立的 orchestration 函数：

```typescript
// src/lib/chat-panel-actions.ts

/** 创建新 session 并打开 ChatPanel。调用方直接使用。 */
export async function openChatPanel(insertIndex?: number): Promise<void> {
  const session = createSession();              // 纯内存，同步
  await saveChatSession(session);               // 持久化到 IndexedDB
  useUIStore.getState().openPanel(
    CHAT_PANEL_PREFIX + session.id,
    insertIndex,
  );
}

/** 找到活跃 ChatPanel 并投递 prompt，没有则新建。 */
export async function openChatWithPrompt(prompt: string): Promise<void> {
  const { panels, activePanelId } = useUIStore.getState();
  const activeChat = panels.find(
    (p) => p.id === activePanelId && isChatPanel(p.nodeId),
  );
  const anyChat = activeChat ?? panels.find((p) => isChatPanel(p.nodeId));

  if (anyChat) {
    useUIStore.getState().setActivePanel(anyChat.id);
  } else {
    await openChatPanel();
  }
  useUIStore.getState().setPendingChatPrompt(prompt);
}
```

### NavigationEvent

删除注释 _"Chat events are NOT included in navHistory"_。Chat 面板的 `open-panel` / `close-panel` 事件正常进入 `navHistory`，支持 undo/redo。

Chat 面板内部没有 `navigate` 事件（不存在"在同一个 chat 面板里导航到另一个 session"——要看另一个 session，开新面板）。

### 持久化

`panels[]` 已持久化。Chat 面板的 `nodeId`（如 `chat:sess_abc123`）自然被持久化。恢复时 ChatPanel mount → `useAgent(getAgentForSession(sessionId))` → `restoreLatestChatSession` 从 IndexedDB 恢复。

---

## 3. Agent 多实例管理

### 现状

```
agentSingleton ← createAgent()
getAIAgent()   → agentSingleton
```

全局唯一，所有 Chat 共享同一个 Agent。

### 目标

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

**不主动 destroy**：Agent 很轻量（纯 JS 对象 + 消息数组），关闭面板只是从 `panels[]` 移除。Agent 留在 registry 里，undo 重新打开面板时无缝恢复。页面卸载时自然清理。

`getAIAgent()` 保留用于非面板场景（如 Spark）。Chat 面板统一使用 `getAgentForSession(sessionId)`。

### useAgent hook

已接受 `agent` 参数，无需改动：

```typescript
// ChatPanel 内部
const agent = getAgentForSession(sessionId);
const chat = useAgent(agent);
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

**GlobalTools** 始终通过 `toolbar` prop 传给 PanelLayout。

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

ChatPanel 有自己的 mini breadcrumb（`✦ Chat` 或 session title），可以参与 shaped tab。规则不变：`hasTab = isLast && !!toolbar && !isApp`。ChatPanel 作为最后面板时，tab 显示 `✦ Chat`，GlobalTools 正常排在右侧。

#### Tab 模式标签

`InactiveTabLabel` 增加 `chat:` 分支，显示 session title（fallback `Chat`）。

---

## 5. ChatPanel 组件

从 `ChatDrawer` 演化。差异：

| ChatDrawer（现状） | ChatPanel（目标） |
|-------------------|-----------------|
| `<aside>` 根元素 | `<div>` 填满面板卡片 |
| Close → `closeChat()` | Close → `closePanel(panelId)` |
| `useAgent()` 无参 | `useAgent(getAgentForSession(sessionId))` |
| `pendingChatPrompt` 全局消费 | 只在活跃面板时消费 |
| 背景色略暗 | 与 NodePanel 相同 `bg-background` |

Props：`{ panelId: string; sessionId: string }`

内部结构不变：Header + Settings + 消息列表（`ChatMessage`）+ Composer（`ChatInput`）+ Debug panel。

ChatPanel 内部渲染一个 mini breadcrumb（`✦ Chat`），用于 shaped tab 连接。当面板在 PanelLayout 中处于 hasTab 位置时，PanelLayout 已经用 Breadcrumb 组件渲染了 tab——因此 ChatPanel 需要暴露一个 `nodeId`-style 的名称供 PanelLayout 的 Breadcrumb/InactiveTabLabel 使用。实际做法：PanelLayout 里对 `isChatPanel` 的面板用 ChatPanel 自带的 header，不走 Breadcrumb 组件。

---

## 6. 交互细节

### 打开 Chat

| 入口 | 行为 | 实现 |
|------|------|------|
| 工具栏 Chat 按钮 | 新建 session + 面板 | `openChatPanel()` |
| ⌘L / ⌘⇧L | 有 ChatPanel → 聚焦；无 → 新建 | `focusOrOpenChat()` |
| ⌘K → "Ask AI" + 输入内容 | 有 ChatPanel → 投递到活跃 Chat；无 → 新建 + 投递 | `openChatWithPrompt(query)` |
| ⌘K → "New Chat" | 总是新建 | `openChatPanel()` |
| Alt+Click Chat 按钮 | 在当前面板旁插入 | `openChatPanel(insertIndex)` |

### 关闭 Chat

- X 按钮 / ⌘⇧W → `closePanel(panelId)`（通用）
- 最后一个面板不可关闭（通用规则）

### 切换

- ⌘⌥← / ⌘⌥→ → 切换活跃面板（通用，Chat 参与）
- 点击面板 → `setActivePanel`
- Tab 模式下 Chat 面板跟 NodePanel 一样显示为标签

### 快捷键

| 快捷键 | 现有行为 | 新行为 |
|--------|---------|--------|
| ⌘L / ⌘⇧L (`global.toggle_chat`) | `toggleChat()` | `focusOrOpenChat()` — 有 Chat 面板则聚焦，无则新建 |
| ⌘\ | 打开 NodePanel | 保留不变 |
| ⌘⇧W | 关闭活跃面板 | 保留不变（Chat 面板适用） |

---

## 7. 文件清单

| 文件 | 改动 |
|------|------|
| `src/types/node.ts` | 新增 `CHAT_PANEL_PREFIX`、`isChatPanel()`、`chatPanelSessionId()` |
| `src/lib/chat-panel-actions.ts` | **新建** — `openChatPanel()`、`openChatWithPrompt()`、`focusOrOpenChat()` |
| `src/lib/ai-service.ts` | `agentSingleton` → `agentRegistry`，新增 `getAgentForSession()`，保留 `getAIAgent()` |
| `src/stores/ui-store.ts` | 删除 `chatOpen` 系列 4 个字段/方法，`hasBackingNode` 加 `chat:` pass-through |
| `src/components/chat/ChatPanel.tsx` | **新建**，从 ChatDrawer 演化 |
| `src/components/chat/ChatDrawer.tsx` | **删除** |
| `src/components/layout/DeskLayout.tsx` | 大幅简化，删除 chat 层（~60 行 → ~10 行） |
| `src/components/panel/PanelLayout.tsx` | `renderPanelContent` 加 `isChatPanel` 分支 + `InactiveTabLabel` 适配 |
| `src/hooks/use-chat-shortcut.ts` | `toggleChat()` → `focusOrOpenChat()` |
| `src/hooks/use-chat-resize.ts` | **删除** |
| `src/components/toolbar/ToolbarUserMenu.tsx` | `openChat()` → `openChatPanel()` |
| `src/components/search/CommandPalette.tsx` | `openChat()` + `setPendingChatPrompt()` → `openChatWithPrompt()` |
| `tests/vitest/ui-store.test.ts` | 删除 `chatOpen` 测试，补 chat panel 相关测试 |
| `tests/vitest/ui-store-persist.test.ts` | 删除 `chatOpen` 字段 |
| `tests/vitest/helpers/test-state.ts` | 删除 `chatOpen`、`pendingChatPrompt` 初始值 |
| `tests/vitest/chat-ui.test.ts` | `ChatDrawer` import → `ChatPanel` |

---

## 8. Checklist

所有改动在一个 PR 内完成（类型、store、组件、布局、调用方、测试环环相扣，不可独立验证）。建议按以下顺序 commit：

- [ ] `node.ts` — 新增 `chat:` 前缀类型和工具函数
- [ ] `ai-service.ts` — `agentSingleton` → `agentRegistry` + `getAgentForSession()`
- [ ] `chat-panel-actions.ts` — 新建 orchestration 函数
- [ ] `ui-store.ts` — 删除 `chatOpen` 系列，`hasBackingNode` 加 `chat:`
- [ ] `ChatPanel.tsx` — 从 ChatDrawer 复制 + 适配 props / agent / close
- [ ] `PanelLayout.tsx` — 加 `isChatPanel` 分支 + tab 标签
- [ ] `DeskLayout.tsx` — 删除 chat 层，简化为纯面板容器
- [ ] 迁移调用方：`ToolbarUserMenu`、`CommandPalette`、`use-chat-shortcut`
- [ ] 删除：`ChatDrawer.tsx`、`use-chat-resize.ts`
- [ ] 测试同步：更新所有 `tests/vitest/` 中的引用
- [ ] `npm run verify`（typecheck → test-sync → test → build）
