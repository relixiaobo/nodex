import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Pencil, Plus, RefreshCw } from '../../lib/icons.js';
import { openNewChatDrawer } from '../../lib/chat-panel-actions.js';
import { getChatSession, listChatSessionMetasPage, saveChatSession, type ChatSessionMeta } from '../../lib/ai-persistence.js';
import { regenerateChatTitle } from '../../lib/ai-service.js';
import { readChatDebugEnabled_sync } from '../../lib/ai-debug.js';
import { useNodeStore } from '../../stores/node-store.js';
import { useUIStore } from '../../stores/ui-store.js';
import { ChatTitleInput, useChatTitleEdit } from '../chat/ChatPanelHeader.js';
import { ChatPanel } from '../chat/ChatPanel.js';
import { DropdownPanel } from '../ui/DropdownPanel.js';

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
    try {
      const trimmed = draft.trim();
      if (trimmed && trimmed !== initialTitle) {
        const session = await getChatSession(sessionId);
        if (session) {
          session.title = trimmed;
          await saveChatSession(session);
        }
      }
    } finally {
      onDone();
    }
  }

  async function handleAiRename() {
    setRegenerating(true);
    try {
      const title = await regenerateChatTitle(sessionId);
      if (title) setDraft(title);
    } finally {
      setRegenerating(false);
    }
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
  anchorRef,
  onClose,
}: {
  currentSessionId: string;
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const [sessions, setSessions] = useState<ChatSessionMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  function loadSessions() {
    void listChatSessionMetasPage({ limit: HISTORY_LIMIT, offset: 0 }).then(({ items }) => {
      setSessions(items);
      setLoading(false);
    });
  }

  useEffect(loadSessions, []);

  function formatTime(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return time;
    const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `${date} ${time}`;
  }

  return (
    <DropdownPanel anchorRef={anchorRef} onClose={onClose} width={320}>
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
    </DropdownPanel>
  );
}

// ── Drawer header ──

function DrawerHeader({ sessionId, trailing }: { sessionId: string; trailing?: ReactNode }) {
  const titleEdit = useChatTitleEdit(sessionId);
  const [historyOpen, setHistoryOpen] = useState(false);
  const titleButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="relative">
      <div className="flex items-center py-1 pl-4 pr-3">
        {titleEdit.editing ? (
          <div className="min-w-0 flex-1">
            <ChatTitleInput edit={titleEdit} />
          </div>
        ) : (
          <>
            <button
              ref={titleButtonRef}
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
        {trailing}
        <button type="button" onClick={() => void openNewChatDrawer()} className={ICON_BTN} aria-label="New chat">
          <Plus size={15} strokeWidth={1.8} />
        </button>
      </div>
      {historyOpen && (
        <SessionHistoryDropdown
          currentSessionId={sessionId}
          anchorRef={titleButtonRef}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </div>
  );
}

// ── Drawer content with auto-hide header ──

function DrawerContent({ sessionId }: {
  sessionId: string;
}) {
  // Debug panel state — managed here so the toggle button lives in DrawerHeader.
  // Re-read on every store version change so toggling the setting in Settings
  // immediately shows/hides the debug button without reopening the drawer.
  const debugEnabled = useNodeStore((s) => {
    void s._version;
    try { return readChatDebugEnabled_sync(); } catch { return false; }
  });
  const [debugOpen, setDebugOpen] = useState(false);
  useEffect(() => { if (!debugEnabled) setDebugOpen(false); }, [debugEnabled]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Header — always visible, in normal flow */}
      <div className="shrink-0">
        <DrawerHeader
          sessionId={sessionId}
          trailing={debugEnabled ? (
            <button
              type="button"
              onClick={() => setDebugOpen((v) => !v)}
              className={`${ICON_BTN} font-mono text-[11px] ${debugOpen ? 'bg-foreground/8 text-foreground' : ''}`}
              aria-label={debugOpen ? 'Hide debug panel' : 'Show debug panel'}
            >
              {'</>'}
            </button>
          ) : undefined}
        />
      </div>

      {/* Chat content */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <ChatPanel sessionId={sessionId} hideHeader debugOpen={debugOpen} />
      </div>
    </div>
  );
}

// ── Drag resize ──

function useDragResize(drawerRef: React.RefObject<HTMLDivElement | null>) {
  const [height, setHeight] = useState(0.80);
  const [isDragging, setIsDragging] = useState(false);
  const dragState = useRef({ startY: 0, startHeight: 0.80 });

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
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === 'Escape') closeChatDrawer();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [chatDrawerOpen, closeChatDrawer]);

  // Close drawer when clicking outside (on outliner)
  useEffect(() => {
    if (!chatDrawerOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (drawerRef.current?.contains(e.target as Node)) return;
      // Don't close if clicking a portal popup (model menu, dropdowns)
      const target = e.target as HTMLElement;
      if (target.closest('.shadow-paper, [data-dropdown-panel], [data-chat-drawer]')) return;
      closeChatDrawer();
    }
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [chatDrawerOpen, closeChatDrawer]);

  if (!hasOpened) return null;

  const drawerTransition = drag.isDragging ? '' : 'transition-transform duration-300 ease-out';

  return (
    <div
      className={`absolute inset-0 z-30 flex items-end pointer-events-none ${chatDrawerOpen ? 'opacity-100' : 'opacity-0'} transition-opacity duration-250`}
      data-testid="chat-drawer"
    >
      <div
        ref={drawerRef}
        className={`pointer-events-auto relative z-10 flex min-h-0 w-full flex-col ${drawerTransition} ${chatDrawerOpen ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ height: `${drag.height * 100}%` }}
        data-chat-drawer="true"
      >
        {/* Drag handle — transparent bg, above the card */}
        <div
          className="group/handle flex shrink-0 cursor-row-resize touch-none items-center justify-center py-1.5"
          onPointerDown={drag.onPointerDown}
          onPointerMove={drag.onPointerMove}
          onPointerUp={drag.onPointerUp}
        >
          <div className="h-1.5 w-12 rounded-full bg-primary/40 transition-colors group-hover/handle:bg-primary/80" />
        </div>

        {/* Card body — opaque bg, rounded top */}
        <div className="flex min-h-0 flex-1 flex-col overflow-clip rounded-t-[22px] border border-b-0 border-border bg-surface pt-1 shadow-[0_-18px_42px_rgba(15,23,42,0.14)]">
          {currentChatSessionId ? (
            <DrawerContent sessionId={currentChatSessionId} />
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-foreground-tertiary">Loading chat…</div>
          )}
        </div>
      </div>
    </div>
  );
}
