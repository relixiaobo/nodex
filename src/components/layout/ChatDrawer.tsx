import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Pencil, Plus, RefreshCw } from '../../lib/icons.js';
import { openNewChatDrawer } from '../../lib/chat-panel-actions.js';
import { getChatSession, listChatSessionMetasPage, saveChatSession, type ChatSessionMeta } from '../../lib/ai-persistence.js';
import { regenerateChatTitle } from '../../lib/ai-service.js';
import { useUIStore } from '../../stores/ui-store.js';
import { ChatTitleInput, useChatTitleEdit } from '../chat/ChatPanelHeader.js';
import { ChatPanel } from '../chat/ChatPanel.js';

const ICON_BTN = 'flex h-7 w-7 items-center justify-center rounded-full text-foreground-tertiary outline-none transition-colors hover:bg-foreground/4 hover:text-foreground';
const SMALL_BTN = 'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-foreground-tertiary outline-none transition-colors hover:bg-foreground/4 hover:text-foreground';
const HISTORY_LIMIT = 20;
const MIN_HEIGHT = 0.3;
const MAX_HEIGHT = 0.95;

// ── Inline title editor (inside dropdown row) ──

function InlineRowEditor({ sessionId, initialTitle, onDone }: { sessionId: string; initialTitle: string; onDone: () => void }) {
  const [draft, setDraft] = useState(initialTitle);
  const [regenerating, setRegenerating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.select(); }, []);

  async function save() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== initialTitle) {
      const session = await getChatSession(sessionId);
      if (session) {
        session.title = trimmed;
        await saveChatSession(session);
      }
    }
    onDone();
  }

  async function handleAiRename() {
    setRegenerating(true);
    const title = await regenerateChatTitle(sessionId);
    if (title) setDraft(title);
    setRegenerating(false);
  }

  return (
    <div className="flex items-center gap-1 px-2 py-1">
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') onDone(); }}
        className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
      />
      <button type="button" onClick={() => void handleAiRename()} disabled={regenerating} className={SMALL_BTN} aria-label="AI rename">
        <RefreshCw size={12} strokeWidth={1.8} className={regenerating ? 'animate-spin' : ''} />
      </button>
      <button type="button" onClick={() => void save()} className={SMALL_BTN} aria-label="Confirm">
        <Check size={14} strokeWidth={2} />
      </button>
    </div>
  );
}

// ── Session history dropdown ──

function SessionHistoryDropdown({
  currentSessionId,
  headerRef,
  onClose,
}: {
  currentSessionId: string;
  headerRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
}) {
  const [sessions, setSessions] = useState<ChatSessionMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  function loadSessions() {
    void listChatSessionMetasPage({ limit: HISTORY_LIMIT, offset: 0 }).then(({ items }) => {
      setSessions(items);
      setLoading(false);
    });
  }

  useEffect(loadSessions, []);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
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
    const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return time;
    const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `${date} ${time}`;
  }

  return (
    <div ref={ref} className="absolute left-0 right-0 top-full z-50 mx-3 max-h-[50vh] overflow-y-auto rounded-lg bg-background p-1 shadow-paper">
      {loading ? (
        <div className="px-3 py-2 text-sm text-foreground-tertiary">Loading…</div>
      ) : sessions.length === 0 ? (
        <div className="px-3 py-2 text-sm text-foreground-tertiary">No conversations yet</div>
      ) : (
        sessions.map((s) => {
          const isCurrent = s.id === currentSessionId;

          if (editingId === s.id) {
            return (
              <div key={s.id} className="rounded-md bg-foreground/[0.04]">
                <InlineRowEditor
                  sessionId={s.id}
                  initialTitle={s.title?.trim() || 'Chat'}
                  onDone={() => { setEditingId(null); loadSessions(); }}
                />
              </div>
            );
          }

          return (
            <div
              key={s.id}
              className={`group/row flex items-start rounded-md transition-colors ${
                isCurrent ? 'bg-foreground/[0.06]' : 'hover:bg-foreground/4'
              }`}
            >
              <button
                type="button"
                onClick={() => { useUIStore.getState().openChatDrawer(s.id); onClose(); }}
                className={`flex min-w-0 flex-1 flex-col gap-0.5 px-2.5 py-1.5 text-left ${
                  isCurrent ? 'text-foreground' : 'text-foreground-secondary'
                }`}
              >
                <span className={`min-w-0 truncate text-sm ${isCurrent ? 'font-medium' : ''}`}>
                  {s.title?.trim() || 'Chat'}
                </span>
                <span className="text-xs text-foreground-tertiary">{formatTime(s.updatedAt)}</span>
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setEditingId(s.id); }}
                className={`${SMALL_BTN} mr-1 mt-1.5 opacity-0 group-hover/row:opacity-100`}
                aria-label="Edit title"
              >
                <Pencil size={11} strokeWidth={1.8} />
              </button>
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
  const headerRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={headerRef} className="relative">
      <div className="flex items-center pb-1 pl-4 pr-3">
        {titleEdit.editing ? (
          <div className="min-w-0 flex-1">
            <ChatTitleInput edit={titleEdit} />
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setHistoryOpen((v) => !v)}
              className="flex min-w-0 max-w-[70%] items-center gap-1 rounded-lg px-1.5 -ml-1.5 py-1 outline-none transition-colors hover:bg-foreground/4"
            >
              <span className="min-w-0 truncate text-[13px] font-medium text-foreground-secondary">
                {titleEdit.displayTitle}
              </span>
              <ChevronDown size={12} strokeWidth={1.8} className={`shrink-0 text-foreground-tertiary transition-transform ${historyOpen ? 'rotate-180' : ''}`} />
            </button>
            <div className="flex-1" />
          </>
        )}
        <button type="button" onClick={() => void openNewChatDrawer()} className={ICON_BTN} aria-label="New chat">
          <Plus size={15} strokeWidth={1.8} />
        </button>
      </div>
      {historyOpen && (
        <SessionHistoryDropdown
          currentSessionId={sessionId}
          headerRef={headerRef}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </div>
  );
}

// ── Drawer content with auto-hide header ──

function DrawerContent({ sessionId, drag, drawerOpen }: {
  sessionId: string;
  drag: ReturnType<typeof useDragResize>;
  drawerOpen: boolean;
}) {
  const [headerVisible, setHeaderVisible] = useState(true);
  const lastScrollTop = useRef(0);
  const contentRef = useRef<HTMLDivElement>(null);

  // Show header when drawer opens
  useEffect(() => { if (drawerOpen) setHeaderVisible(true); }, [drawerOpen]);

  // Track scroll direction inside ChatPanel (debounced to prevent flicker)
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    let timer: number | null = null;

    function onScroll(e: Event) {
      const target = e.target as HTMLElement;
      const scrollTop = target.scrollTop;
      const delta = scrollTop - lastScrollTop.current;

      if (Math.abs(delta) > 12) {
        const shouldShow = delta < 0 || scrollTop < 10;
        lastScrollTop.current = scrollTop;

        // Debounce hide to avoid flicker from layout shifts
        if (timer !== null) window.clearTimeout(timer);
        if (shouldShow) {
          setHeaderVisible(true);
        } else {
          timer = window.setTimeout(() => setHeaderVisible(false), 150);
        }
      }
    }

    el.addEventListener('scroll', onScroll, true);
    return () => {
      el.removeEventListener('scroll', onScroll, true);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  return (
    <>
      {/* Drag handle — always visible */}
      <div
        className="group/handle flex shrink-0 cursor-row-resize touch-none items-center justify-center rounded-t-[22px] py-1.5"
        onPointerDown={drag.onPointerDown}
        onPointerMove={drag.onPointerMove}
        onPointerUp={drag.onPointerUp}
      >
        <div className="h-1 w-8 rounded-full bg-foreground/15 transition-colors group-hover/handle:bg-foreground/40" />
      </div>

      {/* Title row — auto-hides on scroll, hover to reveal */}
      <div
        className={`shrink-0 overflow-hidden transition-all duration-200 ease-out ${headerVisible ? 'max-h-12 opacity-100' : 'max-h-0 opacity-0'}`}
        onPointerEnter={() => setHeaderVisible(true)}
      >
        <DrawerHeader sessionId={sessionId} />
      </div>
      <div ref={contentRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <ChatPanel sessionId={sessionId} hideHeader />
      </div>
    </>
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

  const drawerTransition = drag.isDragging ? '' : 'transition-transform duration-300 ease-out';

  return (
    <div
      className={`absolute inset-0 z-30 flex items-end transition-opacity duration-250 ${chatDrawerOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
      data-testid="chat-drawer"
    >
      <button type="button" onClick={closeChatDrawer} className="absolute inset-0" aria-label="Close" />
      <div
        ref={drawerRef}
        className={`relative z-10 flex min-h-0 w-full flex-col overflow-hidden rounded-t-[22px] border border-b-0 border-border bg-background shadow-[0_-18px_42px_rgba(15,23,42,0.14)] ${drawerTransition} ${chatDrawerOpen ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ height: `${drag.height * 100}%` }}
        data-chat-drawer="true"
      >
        {currentChatSessionId ? (
          <DrawerContent
            sessionId={currentChatSessionId}
            drag={drag}
            drawerOpen={chatDrawerOpen}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-foreground-tertiary">Loading chat…</div>
        )}
      </div>
    </div>
  );
}
