import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Pencil, Plus } from '../../lib/icons.js';
import { openNewChatDrawer } from '../../lib/chat-panel-actions.js';
import { listChatSessionMetasPage, type ChatSessionMeta } from '../../lib/ai-persistence.js';
import { useUIStore } from '../../stores/ui-store.js';
import { ChatTitleInput, useChatTitleEdit } from '../chat/ChatPanelHeader.js';
import { ChatPanel } from '../chat/ChatPanel.js';

const ICON_BTN = 'flex h-7 w-7 items-center justify-center rounded-full text-foreground-tertiary outline-none transition-colors hover:bg-foreground/4 hover:text-foreground';
const HISTORY_LIMIT = 20;
const MIN_HEIGHT = 0.3;
const MAX_HEIGHT = 0.95;

// ── Session history dropdown ──

function SessionHistoryDropdown({ currentSessionId, onClose, headerRef }: { currentSessionId: string; onClose: () => void; headerRef: React.RefObject<HTMLDivElement | null> }) {
  const [sessions, setSessions] = useState<ChatSessionMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void listChatSessionMetasPage({ limit: HISTORY_LIMIT, offset: 0 }).then(({ items }) => {
      setSessions(items);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      // Ignore clicks inside dropdown or header (header has its own toggle)
      if (ref.current?.contains(e.target as Node)) return;
      if (headerRef.current?.contains(e.target as Node)) return;
      onClose();
    }
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [onClose, headerRef]);

  function formatTime(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  return (
    <div ref={ref} className="absolute left-0 right-0 top-full z-50 mx-3 max-h-[50vh] overflow-y-auto rounded-lg bg-background p-1 shadow-paper">
      {loading ? (
        <div className="px-3 py-2 text-sm text-foreground-tertiary">Loading…</div>
      ) : sessions.length === 0 ? (
        <div className="px-3 py-2 text-sm text-foreground-tertiary">No conversations yet</div>
      ) : (
        sessions.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => { useUIStore.getState().openChatDrawer(s.id); onClose(); }}
            className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${
              s.id === currentSessionId ? 'bg-foreground/[0.06] font-medium text-foreground' : 'text-foreground-secondary hover:bg-foreground/4'
            }`}
          >
            <span className="min-w-0 flex-1 truncate">{s.title?.trim() || 'Chat'}</span>
            <span className="shrink-0 text-xs text-foreground-tertiary">{formatTime(s.updatedAt)}</span>
          </button>
        ))
      )}
    </div>
  );
}

// ── Drawer header ──

function DrawerHeader({ sessionId }: { sessionId: string }) {
  const titleEdit = useChatTitleEdit(sessionId);
  const [historyOpen, setHistoryOpen] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={headerRef} className="relative shrink-0">
      <div className="flex items-center gap-1 px-3 pb-2 pt-2">
        {titleEdit.editing ? (
          <div className="min-w-0 flex-1">
            <ChatTitleInput edit={titleEdit} />
          </div>
        ) : (
          <div className="group/title flex min-w-0 flex-1 items-center gap-1 rounded-lg px-1.5 -ml-1.5 py-1 transition-colors hover:bg-foreground/4">
            <button
              type="button"
              onClick={() => setHistoryOpen((v) => !v)}
              className="flex min-w-0 flex-1 items-center gap-1 outline-none"
            >
              <span className="min-w-0 truncate text-[13px] font-medium text-foreground">
                {titleEdit.displayTitle}
              </span>
              <ChevronDown size={12} strokeWidth={1.8} className={`shrink-0 text-foreground-tertiary transition-transform ${historyOpen ? 'rotate-180' : ''}`} />
            </button>
            <button
              type="button"
              onClick={titleEdit.startEdit}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-foreground-tertiary opacity-0 outline-none transition-opacity hover:bg-foreground/8 hover:text-foreground group-hover/title:opacity-100"
              aria-label="Edit title"
            >
              <Pencil size={10} strokeWidth={1.8} />
            </button>
          </div>
        )}
        <button type="button" onClick={() => void openNewChatDrawer()} className={ICON_BTN} aria-label="New chat">
          <Plus size={15} strokeWidth={1.8} />
        </button>
      </div>
      {historyOpen && (
        <SessionHistoryDropdown currentSessionId={sessionId} onClose={() => setHistoryOpen(false)} headerRef={headerRef} />
      )}
    </div>
  );
}

// ── Drag resize ──

function useDragResize(drawerRef: React.RefObject<HTMLDivElement | null>) {
  const [height, setHeight] = useState(0.75);
  const [isDragging, setIsDragging] = useState(false);
  const dragState = useRef({ startY: 0, startHeight: 0.75 });

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragState.current = { startY: e.clientY, startHeight: height };
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [height]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    const container = drawerRef.current?.parentElement;
    if (!container) return;
    const delta = (dragState.current.startY - e.clientY) / container.clientHeight;
    setHeight(Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, dragState.current.startHeight + delta)));
  }, [isDragging, drawerRef]);

  const onPointerUp = useCallback(() => setIsDragging(false), []);

  return { height, isDragging, onPointerDown, onPointerMove, onPointerUp };
}

// ── Drawer ──

export function ChatDrawer() {
  const chatDrawerOpen = useUIStore((s) => s.chatDrawerOpen);
  const currentChatSessionId = useUIStore((s) => s.currentChatSessionId);
  const closeChatDrawer = useUIStore((s) => s.closeChatDrawer);
  const drawerRef = useRef<HTMLDivElement>(null);
  const drag = useDragResize(drawerRef);

  const [hasOpened, setHasOpened] = useState(false);
  useEffect(() => { if (chatDrawerOpen) setHasOpened(true); }, [chatDrawerOpen]);

  useEffect(() => {
    if (!chatDrawerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeChatDrawer(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [chatDrawerOpen, closeChatDrawer]);

  if (!hasOpened) return null;

  // Disable transition during drag to avoid lag
  const drawerTransition = drag.isDragging ? '' : 'transition-transform duration-300 ease-out';

  return (
    <div
      className={`absolute inset-0 z-30 flex items-end transition-opacity duration-250 ${chatDrawerOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
      data-testid="chat-drawer"
    >
      <button type="button" onClick={closeChatDrawer} className="absolute inset-0 bg-foreground/10 backdrop-blur-[1px]" aria-label="Close" />
      <div
        ref={drawerRef}
        className={`relative z-10 flex min-h-0 w-full flex-col overflow-hidden rounded-t-[22px] border border-b-0 border-border bg-background shadow-[0_-18px_42px_rgba(15,23,42,0.14)] ${drawerTransition} ${chatDrawerOpen ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ height: `${drag.height * 100}%` }}
        data-chat-drawer="true"
      >
        <div
          className="flex cursor-row-resize touch-none items-center justify-center pt-2 pb-1"
          onPointerDown={drag.onPointerDown}
          onPointerMove={drag.onPointerMove}
          onPointerUp={drag.onPointerUp}
        >
          <div className="h-1 w-10 rounded-full bg-foreground/12" />
        </div>
        {currentChatSessionId ? (
          <>
            <DrawerHeader sessionId={currentChatSessionId} />
            <ChatPanel sessionId={currentChatSessionId} hideHeader />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-foreground-tertiary">Loading chat…</div>
        )}
      </div>
    </div>
  );
}
