import { useEffect, useSyncExternalStore, type ComponentType } from 'react';
import { ListTree, MessageSquare, Pencil } from '../../lib/icons.js';
import { getChatTitle, subscribeChatTitles } from '../../lib/ai-service.js';
import { useChatTitleEdit, ChatTitleInput } from '../chat/ChatPanelHeader.js';
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
const TAB_BUTTON_ACTIVE_BASE = `${TAB_BUTTON} relative z-10 rounded-t-xl bg-background text-foreground`;
const TAB_BUTTON_INACTIVE = 'group/tab flex h-9 min-w-0 flex-1 items-stretch px-1.5 pb-1.5 outline-none';

function TabButton({
  active,
  icon: Icon,
  title,
  onClick,
  connectors = 'both',
}: {
  active: boolean;
  icon: ComponentType<{ size: number; strokeWidth: number; className?: string }>;
  title: string;
  onClick: () => void;
  connectors?: 'left' | 'right' | 'both';
}) {
  const connectorClass = active
    ? `${connectors === 'both' || connectors === 'left' ? 'tab-connector-left' : ''} ${connectors === 'both' || connectors === 'right' ? 'tab-connector-right' : ''}`.trim()
    : '';
  return (
    <button type="button" onClick={onClick} className={active ? `${TAB_BUTTON_ACTIVE_BASE} ${connectorClass}` : TAB_BUTTON_INACTIVE}>
      {active ? (
        <>
          <Icon size={15} strokeWidth={1.7} className="shrink-0" />
          <span className="min-w-0 truncate">{title}</span>
        </>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-1.5 text-foreground-tertiary transition-colors group-hover/tab:bg-foreground/[0.05] group-hover/tab:text-foreground">
          <Icon size={15} strokeWidth={1.7} className="shrink-0" />
          <span className="min-w-0 truncate">{title}</span>
        </span>
      )}
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
  const chatEdit = currentChatSessionId ? useChatTitleEdit(currentChatSessionId) : null;
  const chatTitle = chatEdit?.displayTitle ?? 'Chat';
  const nodeTitle = useNodeTitle(resolvedNodeId);
  const chatActive = activeView === 'chat';

  return (
    <div className="flex shrink-0 items-end">
      {/* Chat tab — with inline title editing */}
      {chatActive && chatEdit ? (
        <div className="group/tab flex h-9 min-w-0 flex-1 items-center gap-1.5 px-3 text-[13px] outline-none tab-connector-right relative z-10 rounded-t-xl bg-background text-foreground">
          <MessageSquare size={15} strokeWidth={1.7} className="shrink-0" />
          {chatEdit.editing ? (
            <ChatTitleInput edit={chatEdit} />
          ) : (
            <>
              <span className="min-w-0 truncate">{chatTitle}</span>
              <button
                type="button"
                onClick={chatEdit.startEdit}
                title="Edit title"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-foreground-tertiary opacity-0 transition-opacity hover:bg-foreground/4 hover:text-foreground group-hover/tab:opacity-100"
              >
                <Pencil size={10} strokeWidth={1.8} />
              </button>
            </>
          )}
        </div>
      ) : (
        <TabButton active={false} icon={MessageSquare} title={chatTitle} onClick={switchToChat} connectors="right" />
      )}
      <TabButton active={activeView === 'node'} icon={ListTree} title={nodeTitle} onClick={() => switchToNode()} connectors="both" />
      <div className="flex h-9 shrink-0 items-start pt-px pl-2 pr-0.5">
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

      <div className={`flex flex-1 flex-col overflow-hidden bg-background shadow-card ${activeView === 'chat' ? 'rounded-b-xl rounded-tr-xl' : 'rounded-xl'}`}>
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
