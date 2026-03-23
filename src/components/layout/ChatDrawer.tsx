import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Pencil, Plus } from '../../lib/icons.js';
import { openNewChatDrawer } from '../../lib/chat-panel-actions.js';
import { listChatSessionMetasPage, type ChatSessionMeta } from '../../lib/ai-persistence.js';
import { useUIStore } from '../../stores/ui-store.js';
import { ChatTitleInput, useChatTitleEdit } from '../chat/ChatPanelHeader.js';
import { ChatPanel } from '../chat/ChatPanel.js';

const ICON_BUTTON_CLASS = 'flex h-7 w-7 items-center justify-center rounded-full text-foreground-tertiary outline-none transition-colors hover:bg-foreground/4 hover:text-foreground';
const HISTORY_LIMIT = 20;
const MIN_DRAWER_HEIGHT = 0.3;
const MAX_DRAWER_HEIGHT = 0.95;

// ── Session history dropdown ──

function SessionHistoryDropdown({
  currentSessionId,
  onClose,
  onEditTitle,
}: {
  currentSessionId: string;
  onClose: () => void;
  onEditTitle: () => void;
}) {
  const [sessions, setSessions] = useState<ChatSessionMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void listChatSessionMetasPage({ limit: HISTORY_LIMIT, offset: 0 }).then(({ items }) => {
      setSessions(items);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (dropdownRef.current?.contains(e.target as Node)) return;
      onClose();
    }
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [onClose]);

  function formatTime(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  return (
    <div ref={dropdownRef} className="absolute left-0 right-0 top-full z-50 mx-3 max-h-[50vh] overflow-y-auto rounded-lg bg-background p-1 shadow-paper">
      {loading ? (
        <div className="px-3 py-2 text-sm text-foreground-tertiary">Loading…</div>
      ) : sessions.length === 0 ? (
        <div className="px-3 py-2 text-sm text-foreground-tertiary">No conversations yet</div>
      ) : (
        sessions.map((s) => {
          const isCurrent = s.id === currentSessionId;
          return (
            <div key={s.id} className="group/row flex items-center rounded-md transition-colors hover:bg-foreground/4">
              <button
                type="button"
                onClick={() => {
                  useUIStore.getState().openChatDrawer(s.id);
                  onClose();
                }}
                className={`flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1.5 text-left text-sm ${
                  isCurrent ? 'font-medium text-foreground' : 'text-foreground-secondary'
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{s.title?.trim() || 'Chat'}</span>
                <span className="shrink-0 text-xs text-foreground-tertiary">{formatTime(s.updatedAt)}</span>
              </button>
              {isCurrent && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose();
                    onEditTitle();
                  }}
                  className="mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-foreground-tertiary opacity-0 transition-opacity hover:bg-foreground/4 hover:text-foreground group-hover/row:opacity-100"
                  aria-label="Edit title"
                >
                  <Pencil size={11} strokeWidth={1.8} />
                </button>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

// ── Drawer header ──

function DrawerHeader({ sessionId }: { sessionId: string }) {
  const titleEdit = useChatTitleEdit(sessionId);
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <div className="relative shrink-0">
      <div className="flex items-center gap-2 px-3 pb-2 pt-2">
        <div className="flex min-w-0 flex-1 items-center">
          {titleEdit.editing ? (
            <ChatTitleInput edit={titleEdit} />
          ) : (
            <button
              type="button"
              onClick={() => setHistoryOpen((v) => !v)}
              className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-1 -ml-1 py-0.5 outline-none transition-colors hover:bg-foreground/4"
            >
              <span className="min-w-0 truncate text-[13px] font-medium text-foreground">
                {titleEdit.displayTitle}
              </span>
              <ChevronDown size={12} strokeWidth={1.8} className={`shrink-0 text-foreground-tertiary transition-transform ${historyOpen ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => void openNewChatDrawer()}
          className={ICON_BUTTON_CLASS}
          aria-label="New chat"
        >
          <Plus size={15} strokeWidth={1.8} />
        </button>
      </div>
      {historyOpen && (
        <SessionHistoryDropdown
          currentSessionId={sessionId}
          onClose={() => setHistoryOpen(false)}
          onEditTitle={() => {
            requestAnimationFrame(() => titleEdit.startEdit({ stopPropagation: () => {} } as React.MouseEvent<HTMLButtonElement>));
          }}
        />
      )}
    </div>
  );
}

// ── Drag handle ──

function useDragResize(drawerRef: React.RefObject<HTMLDivElement | null>) {
  const [height, setHeight] = useState(0.75);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0.75);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    startY.current = e.clientY;
    startHeight.current = height;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [height]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || !drawerRef.current) return;
    const containerHeight = drawerRef.current.parentElement?.clientHeight ?? window.innerHeight;
    const deltaRatio = (startY.current - e.clientY) / containerHeight;
    const next = Math.max(MIN_DRAWER_HEIGHT, Math.min(MAX_DRAWER_HEIGHT, startHeight.current + deltaRatio));
    setHeight(next);
  }, [drawerRef]);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return { height, onPointerDown, onPointerMove, onPointerUp };
}

// ── Drawer ──

export function ChatDrawer() {
  const chatDrawerOpen = useUIStore((s) => s.chatDrawerOpen);
  const currentChatSessionId = useUIStore((s) => s.currentChatSessionId);
  const closeChatDrawer = useUIStore((s) => s.closeChatDrawer);
  const drawerRef = useRef<HTMLDivElement>(null);
  const drag = useDragResize(drawerRef);

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
        ref={drawerRef}
        className={`relative z-10 flex min-h-0 w-full flex-col overflow-hidden rounded-t-[22px] border border-b-0 border-border bg-background shadow-[0_-18px_42px_rgba(15,23,42,0.14)] transition-transform duration-300 ease-out ${chatDrawerOpen ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ height: `${drag.height * 100}%` }}
        data-chat-drawer="true"
      >
        {/* Drag handle */}
        <div
          className="flex cursor-row-resize touch-none items-center justify-center pt-2 pb-1"
          onPointerDown={drag.onPointerDown}
          onPointerMove={drag.onPointerMove}
          onPointerUp={drag.onPointerUp}
        >
          <div className="h-1 w-10 rounded-full bg-foreground/12" aria-hidden="true" />
        </div>

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
