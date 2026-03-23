import { useEffect, useState } from 'react';
import { Plus, X, MessageSquare } from '../../lib/icons.js';
import { openNewChatDrawer } from '../../lib/chat-panel-actions.js';
import { useUIStore } from '../../stores/ui-store.js';
import { ChatTitleInput, useChatTitleEdit } from '../chat/ChatPanelHeader.js';
import { ChatPanel } from '../chat/ChatPanel.js';

const ICON_BUTTON_CLASS = 'flex h-7 w-7 items-center justify-center rounded-full text-foreground-tertiary transition-colors hover:bg-foreground/4 hover:text-foreground';

interface DrawerHeaderProps {
  sessionId: string;
}

function DrawerHeader({ sessionId }: DrawerHeaderProps) {
  const closeChatDrawer = useUIStore((s) => s.closeChatDrawer);
  const titleEdit = useChatTitleEdit(sessionId);

  return (
    <div className="shrink-0 border-b border-border">
      <div className="flex items-center justify-center pt-2">
        <div className="h-1 w-10 rounded-full bg-foreground/12" aria-hidden="true" />
      </div>
      <div className="flex items-center gap-2 px-3 pb-2 pt-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground/[0.05] text-foreground-tertiary">
            <MessageSquare size={14} strokeWidth={1.8} />
          </span>
          {titleEdit.editing ? (
            <ChatTitleInput edit={titleEdit} />
          ) : (
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
              {titleEdit.displayTitle}
            </span>
          )}
        </div>
        {!titleEdit.editing && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              titleEdit.startEdit(event);
            }}
            className={ICON_BUTTON_CLASS}
            aria-label="Edit session title"
          >
            <span className="text-[11px] font-medium">Aa</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => void openNewChatDrawer()}
          className={ICON_BUTTON_CLASS}
          aria-label="New chat"
        >
          <Plus size={15} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          onClick={closeChatDrawer}
          className={ICON_BUTTON_CLASS}
          aria-label="Close chat drawer"
        >
          <X size={15} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}

export function ChatDrawer() {
  const chatDrawerOpen = useUIStore((s) => s.chatDrawerOpen);
  const currentChatSessionId = useUIStore((s) => s.currentChatSessionId);
  const closeChatDrawer = useUIStore((s) => s.closeChatDrawer);

  // Track if drawer has ever been opened (to mount content lazily)
  const [hasOpened, setHasOpened] = useState(false);
  useEffect(() => {
    if (chatDrawerOpen) setHasOpened(true);
  }, [chatDrawerOpen]);

  useEffect(() => {
    if (!chatDrawerOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      closeChatDrawer();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [chatDrawerOpen, closeChatDrawer]);

  if (!hasOpened) return null;

  return (
    <div
      className={`absolute inset-0 z-30 flex items-end transition-opacity duration-250 ${chatDrawerOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
      data-testid="chat-drawer"
    >
      <button
        type="button"
        onClick={closeChatDrawer}
        className="absolute inset-0 bg-foreground/10 backdrop-blur-[1px]"
        aria-label="Close chat drawer"
      />
      <div
        className={`relative z-10 flex h-[75%] min-h-0 w-full flex-col overflow-hidden rounded-t-[22px] border border-b-0 border-border bg-background shadow-[0_-18px_42px_rgba(15,23,42,0.14)] transition-transform duration-300 ease-out ${chatDrawerOpen ? 'translate-y-0' : 'translate-y-full'}`}
        data-chat-drawer="true"
      >
        {currentChatSessionId ? (
          <>
            <DrawerHeader sessionId={currentChatSessionId} />
            <ChatPanel sessionId={currentChatSessionId} hideHeader />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-foreground-tertiary">
            Loading chat…
          </div>
        )}
      </div>
    </div>
  );
}
