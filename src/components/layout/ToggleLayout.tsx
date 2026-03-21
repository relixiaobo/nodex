import { useEffect, useSyncExternalStore } from 'react';
import { ListTree, MessageSquare } from '../../lib/icons.js';
import { getChatTitle, subscribeChatTitles } from '../../lib/ai-service.js';
import { ensureChatSession } from '../../lib/chat-panel-actions.js';
import { useNodeStore } from '../../stores/node-store.js';
import { useUIStore } from '../../stores/ui-store.js';
import { isAppPanel, type AppPanelId } from '../../types/index.js';
import { ChatPanel } from '../chat/ChatPanel.js';
import { AppPanel } from '../panel/AppPanel.js';
import { NodePanel } from '../panel/NodePanel.js';
import { ToolbarUserMenu } from '../toolbar/ToolbarUserMenu.js';

const CHAT_PANEL_ID = 'chat-main';
const NODE_PANEL_ID = 'node-main';

function resolveAppPanelTitle(panelId: AppPanelId): string {
  return panelId.replace(/^app:/, '').replace(/^./, (char) => char.toUpperCase());
}

function useRenderableNodeId(currentNodeId: string | null): string | null {
  return useNodeStore((s) => {
    void s._version;
    if (currentNodeId && (isAppPanel(currentNodeId) || s.getNode(currentNodeId))) {
      return currentNodeId;
    }
    return null;
  });
}

function useNodeTitle(nodeId: string | null): string {
  return useNodeStore((s) => {
    void s._version;
    if (!nodeId) {
      return 'Outliner';
    }
    if (isAppPanel(nodeId)) {
      return resolveAppPanelTitle(nodeId);
    }
    const node = s.getNode(nodeId);
    const rawName = node?.name ?? '';
    return rawName.replace(/<[^>]+>/g, '').trim() || 'Untitled';
  });
}

function ToggleTopBar({
  activeView,
  currentChatSessionId,
  resolvedNodeId,
}: {
  activeView: 'chat' | 'node';
  currentChatSessionId: string | null;
  resolvedNodeId: string | null;
}) {
  const switchToChat = useUIStore((s) => s.switchToChat);
  const switchToNode = useUIStore((s) => s.switchToNode);
  const chatTitle = useSyncExternalStore(
    subscribeChatTitles,
    () => currentChatSessionId ? getChatTitle(currentChatSessionId) : null,
    () => currentChatSessionId ? getChatTitle(currentChatSessionId) : null,
  );
  const nodeTitle = useNodeTitle(resolvedNodeId);

  // Active tab: bg-background + rounded-t-xl + tab-connector for concave corner
  // Inactive tab: transparent bg, just icon + text
  const chatActive = activeView === 'chat';
  const nodeActive = activeView === 'node';

  return (
    <div className="flex shrink-0 items-end">
      {/* Chat tab */}
      <button
        type="button"
        onClick={() => switchToChat()}
        className={
          chatActive
            ? 'tab-connector-right relative z-10 flex h-9 min-w-0 flex-1 items-center gap-1.5 rounded-t-xl bg-background pl-3 pr-2 text-[13px] text-foreground'
            : 'flex h-8 min-w-0 flex-1 items-center gap-1.5 px-3 text-[13px] text-foreground-tertiary transition-colors hover:text-foreground'
        }
      >
        <MessageSquare size={15} strokeWidth={1.7} className="shrink-0" />
        <span className="min-w-0 truncate">
          {chatTitle?.trim() || 'Chat'}
        </span>
      </button>

      {/* Node tab */}
      <button
        type="button"
        onClick={() => switchToNode()}
        className={
          nodeActive
            ? 'tab-connector-left relative z-10 flex h-9 min-w-0 flex-1 items-center gap-1.5 rounded-t-xl bg-background pl-3 pr-2 text-[13px] text-foreground'
            : 'flex h-8 min-w-0 flex-1 items-center gap-1.5 px-3 text-[13px] text-foreground-tertiary transition-colors hover:text-foreground'
        }
      >
        <ListTree size={15} strokeWidth={1.7} className="shrink-0" />
        <span className="min-w-0 truncate">
          {nodeTitle}
        </span>
      </button>

      {/* User menu — sits at same height as active tab */}
      <div className="flex h-9 items-center rounded-t-xl bg-background px-1">
        <ToolbarUserMenu />
      </div>
    </div>
  );
}

export function ToggleLayout() {
  const activeView = useUIStore((s) => s.activeView);
  const currentNodeId = useUIStore((s) => s.currentNodeId);
  const currentChatSessionId = useUIStore((s) => s.currentChatSessionId);
  const renderableNodeId = useRenderableNodeId(currentNodeId);

  useEffect(() => {
    if (!currentChatSessionId) {
      void ensureChatSession();
    }
  }, [currentChatSessionId]);

  const hiddenViewClass = 'pointer-events-none invisible absolute inset-0 overflow-hidden';

  return (
    <div className="flex flex-1 flex-col overflow-hidden p-1.5">
      <ToggleTopBar
        activeView={activeView}
        currentChatSessionId={currentChatSessionId}
        resolvedNodeId={renderableNodeId}
      />

      <div className="flex flex-1 flex-col overflow-hidden rounded-b-xl bg-background shadow-card">
        <div className="relative flex-1 overflow-hidden">
          <div className={activeView === 'chat' ? 'flex h-full flex-col' : hiddenViewClass} aria-hidden={activeView !== 'chat'}>
            {currentChatSessionId ? (
              <ChatPanel panelId={CHAT_PANEL_ID} sessionId={currentChatSessionId} hideHeader />
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-foreground-tertiary">
                Loading chat…
              </div>
            )}
          </div>

          <div className={activeView === 'node' ? 'flex h-full flex-col' : hiddenViewClass} aria-hidden={activeView !== 'node'}>
            {renderableNodeId === null ? (
              <div className="flex flex-1 items-center justify-center text-sm text-foreground-tertiary">
                Open the outliner to start.
              </div>
            ) : isAppPanel(renderableNodeId) ? (
              <AppPanel panelId={renderableNodeId as AppPanelId} />
            ) : (
              <NodePanel nodeId={renderableNodeId} panelId={NODE_PANEL_ID} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
