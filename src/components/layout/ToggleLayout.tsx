import { useEffect, useSyncExternalStore, type ComponentType } from 'react';
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

// ── Helpers ──

function resolveAppPanelTitle(panelId: AppPanelId): string {
  return panelId.replace(/^app:/, '').replace(/^./, (c) => c.toUpperCase());
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
    if (!nodeId) return 'Outliner';
    if (isAppPanel(nodeId)) return resolveAppPanelTitle(nodeId);
    const rawName = s.getNode(nodeId)?.name ?? '';
    return rawName.replace(/<[^>]+>/g, '').trim() || 'Untitled';
  });
}

// ── Tab button ──

const TAB_BUTTON = 'group/tab flex h-9 min-w-0 flex-1 items-center gap-1.5 px-3 text-[13px] outline-none';
const TAB_BUTTON_ACTIVE = `${TAB_BUTTON} tab-connector-left tab-connector-right relative z-10 rounded-t-xl bg-background text-foreground`;
const TAB_BUTTON_INACTIVE = `${TAB_BUTTON} relative text-foreground-tertiary transition-colors hover:text-foreground`;

function TabButton({
  active,
  icon: Icon,
  title,
  onClick,
}: {
  active: boolean;
  icon: ComponentType<{ size: number; strokeWidth: number; className?: string }>;
  title: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={active ? TAB_BUTTON_ACTIVE : TAB_BUTTON_INACTIVE}>
      {/* Hover bg indicator — inset from button edges, only for inactive */}
      {!active && (
        <span className="pointer-events-none absolute inset-x-1 bottom-1 top-0 rounded-lg transition-colors group-hover/tab:bg-foreground/[0.05]" />
      )}
      <Icon size={15} strokeWidth={1.7} className="relative shrink-0" />
      <span className="relative min-w-0 truncate">{title}</span>
    </button>
  );
}

// ── Top bar ──

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
    () => (currentChatSessionId ? getChatTitle(currentChatSessionId) : null),
    () => (currentChatSessionId ? getChatTitle(currentChatSessionId) : null),
  );
  const nodeTitle = useNodeTitle(resolvedNodeId);

  return (
    <div className="flex shrink-0 items-end">
      <TabButton active={activeView === 'chat'} icon={MessageSquare} title={chatTitle?.trim() || 'Chat'} onClick={switchToChat} />
      <TabButton active={activeView === 'node'} icon={ListTree} title={nodeTitle} onClick={() => switchToNode()} />
      <div className="flex h-9 items-center px-1">
        <ToolbarUserMenu />
      </div>
    </div>
  );
}

// ── Layout ──

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

  const hidden = 'pointer-events-none invisible absolute inset-0 overflow-hidden';

  return (
    <div className="flex flex-1 flex-col overflow-hidden p-1.5">
      <ToggleTopBar activeView={activeView} currentChatSessionId={currentChatSessionId} resolvedNodeId={renderableNodeId} />

      <div className="flex flex-1 flex-col overflow-hidden rounded-xl bg-background shadow-card">
        <div className="relative flex-1 overflow-hidden">
          <div className={activeView === 'chat' ? 'flex h-full flex-col' : hidden} aria-hidden={activeView !== 'chat'}>
            {currentChatSessionId ? (
              <ChatPanel panelId={CHAT_PANEL_ID} sessionId={currentChatSessionId} hideHeader />
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-foreground-tertiary">Loading chat…</div>
            )}
          </div>

          <div className={activeView === 'node' ? 'flex h-full flex-col' : hidden} aria-hidden={activeView !== 'node'}>
            {renderableNodeId === null ? (
              <div className="flex flex-1 items-center justify-center text-sm text-foreground-tertiary">Open the outliner to start.</div>
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
