import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { ListTree, MessageSquare } from '../../lib/icons.js';
import { ensureTodayNode } from '../../lib/journal.js';
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

function useResolvedNodeId(currentNodeId: string | null): string {
  const version = useNodeStore((s) => s._version);

  return useMemo(() => {
    void version;
    if (currentNodeId && (isAppPanel(currentNodeId) || useNodeStore.getState().getNode(currentNodeId))) {
      return currentNodeId;
    }
    return ensureTodayNode();
  }, [currentNodeId, version]);
}

function useNodeTitle(nodeId: string): string {
  return useNodeStore((s) => {
    void s._version;
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
  resolvedNodeId: string;
}) {
  const switchToChat = useUIStore((s) => s.switchToChat);
  const switchToNode = useUIStore((s) => s.switchToNode);
  const chatTitle = useSyncExternalStore(
    subscribeChatTitles,
    () => currentChatSessionId ? getChatTitle(currentChatSessionId) : null,
    () => currentChatSessionId ? getChatTitle(currentChatSessionId) : null,
  );
  const nodeTitle = useNodeTitle(resolvedNodeId);

  const toggleButtonClass = (active: boolean) =>
    active
      ? 'flex h-7 min-w-0 items-center gap-1.5 rounded-full bg-foreground/[0.06] px-2 text-sm text-foreground'
      : 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-foreground-tertiary transition-colors hover:bg-foreground/4 hover:text-foreground';

  return (
    <div className="flex h-10 shrink-0 items-center gap-1 rounded-xl bg-background px-2 shadow-card">
      <button
        type="button"
        disabled={activeView === 'chat'}
        onClick={() => switchToChat()}
        className={toggleButtonClass(activeView === 'chat')}
      >
        <MessageSquare size={16} strokeWidth={1.7} className="shrink-0" />
        {activeView === 'chat' && (
          <span className="min-w-0 truncate text-[13px]">
            {chatTitle?.trim() || 'Chat'}
          </span>
        )}
      </button>

      <div className="flex-1" />

      <button
        type="button"
        disabled={activeView === 'node'}
        onClick={() => switchToNode()}
        className={toggleButtonClass(activeView === 'node')}
      >
        <ListTree size={16} strokeWidth={1.7} className="shrink-0" />
        {activeView === 'node' && (
          <span className="min-w-0 truncate text-[13px]">
            {nodeTitle}
          </span>
        )}
      </button>

      <ToolbarUserMenu />
    </div>
  );
}

export function ToggleLayout() {
  const activeView = useUIStore((s) => s.activeView);
  const currentNodeId = useUIStore((s) => s.currentNodeId);
  const currentChatSessionId = useUIStore((s) => s.currentChatSessionId);
  const resolvedNodeId = useResolvedNodeId(currentNodeId);

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
        resolvedNodeId={resolvedNodeId}
      />

      <div className="relative mt-1.5 flex-1 overflow-hidden rounded-xl bg-background shadow-card">
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
          {isAppPanel(resolvedNodeId) ? (
            <AppPanel panelId={resolvedNodeId as AppPanelId} />
          ) : (
            <NodePanel nodeId={resolvedNodeId} panelId={NODE_PANEL_ID} />
          )}
        </div>
      </div>
    </div>
  );
}
