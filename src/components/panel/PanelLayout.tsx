/**
 * PanelLayout — renders N panels as independent floating cards.
 *
 * Two layout modes based on container width:
 *
 * Side-by-side (wide): each panel is an independent card with a shared
 * header (breadcrumb + close). The last panel shares the top row with the
 * toolbar, creating a tab shape (Chrome tab concave corner), but its header
 * content is identical — only the container shape differs.
 *
 * Narrow mode (< 250px per panel): name-only tab with panel switcher
 * dropdown. Click tab body → toggle dropdown. Click × → close.
 * Breadcrumb renders inside the panel body for navigation context.
 */
import { Suspense, lazy, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useUIStore } from '../../stores/ui-store.js';
import { useNodeStore } from '../../stores/node-store.js';
import { chatPanelSessionId, isAppPanel, isChatPanel } from '../../types/index.js';
import type { AppPanelId } from '../../types/index.js';
import { NodePanel } from './NodePanel';
import { AppPanel } from './AppPanel';
import { Breadcrumb } from './Breadcrumb';
import { ChevronDown, MessageCircle, Pencil, X } from '../../lib/icons.js';
import { getChatTitle, subscribeChatTitles, getAgentForSession, updateSessionTitle } from '../../lib/ai-service.js';
import { DeskLanding } from './DeskLanding';

const ChatPanel = lazy(async () => ({
  default: (await import('../chat/ChatPanel')).ChatPanel,
}));
const CHAT_PANEL_FALLBACK = (
  <div className="flex flex-1 items-center justify-center text-sm text-foreground-tertiary">
    Loading chat…
  </div>
);

/** Minimum width per panel before switching to tab mode. */
const MIN_PANEL_WIDTH = 250;

interface PanelLayoutProps {
  toolbar?: React.ReactNode;
}

function renderPanelContent(nodeId: string, panelId: string, options?: { hideHeader?: boolean }) {
  if (isChatPanel(nodeId)) {
    return (
      <Suspense fallback={CHAT_PANEL_FALLBACK}>
        <ChatPanel panelId={panelId} sessionId={chatPanelSessionId(nodeId)} hideHeader={options?.hideHeader} />
      </Suspense>
    );
  }
  if (isAppPanel(nodeId)) {
    return <AppPanel panelId={nodeId as AppPanelId} />;
  }
  return <NodePanel nodeId={nodeId} panelId={panelId} />;
}

// ── Shared panel header ──────────────────────────────────────────
//
// Used by both normal cards and hasTab layout. The content is identical;
// only the container shape differs (rounded-xl card vs tab-connector).

/**
 * Close button class shared across all panel headers.
 * mr-2.5 (10px) matches the effective top distance: mt-1 (4px) + centering
 * offset (6px from h-5 centered in h-8) = 10px. Equal edge distance.
 */
const PANEL_CLOSE_BTN = 'flex h-5 w-5 mr-2.5 shrink-0 items-center justify-center rounded-md text-foreground-tertiary opacity-0 transition-opacity hover:bg-foreground/4 hover:text-foreground group-hover/panel:opacity-100';

/** Icon button that appears on hover via group-hover. Same visual as PANEL_CLOSE_BTN but no margin. */
const PANEL_ICON_BTN = 'flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-foreground-tertiary opacity-0 transition-opacity hover:bg-foreground/4 hover:text-foreground group-hover/panel:opacity-100';

/**
 * Panel header: breadcrumb + close (node), close-only (app/chat-non-hasTab).
 * Returns null for chat panels (ChatPanel renders its own header internally).
 * In hasTab mode, chat gets an inline header directly in PanelLayout.
 */
function renderPanelHeader(
  nodeId: string,
  opts: { isActive: boolean; titleVisible: boolean; onClose: (e: React.MouseEvent) => void },
): React.ReactNode {
  if (isChatPanel(nodeId)) return null;
  if (isAppPanel(nodeId)) {
    return (
      <div className="flex items-center justify-end shrink-0 h-8 mt-1">
        <button type="button" className={PANEL_CLOSE_BTN} onClick={opts.onClose} title="Close panel">
          <X size={12} />
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center shrink-0 mt-1">
      <Breadcrumb nodeId={nodeId} showCurrentName={!opts.titleVisible} active={opts.isActive} />
      <button type="button" className={PANEL_CLOSE_BTN} onClick={opts.onClose} title="Close panel">
        <X size={12} />
      </button>
    </div>
  );
}

// ── Chat title editing ───────────────────────────────────────────

function useChatTitleEdit(nodeId: string) {
  const sessionId = chatPanelSessionId(nodeId);
  const title = useSyncExternalStore(
    subscribeChatTitles,
    () => getChatTitle(sessionId),
  );
  const displayTitle = title || 'Chat';

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setDraft(displayTitle);
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.select());
  }, [displayTitle]);

  const saveEdit = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== displayTitle) {
      const agent = getAgentForSession(sessionId);
      updateSessionTitle(agent, trimmed);
    }
    setEditing(false);
  }, [draft, displayTitle, sessionId]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
  }, []);

  return { editing, draft, setDraft, displayTitle, inputRef, startEdit, saveEdit, cancelEdit };
}

/** Inline input used when editing a chat title. */
function ChatTitleInput({ edit }: { edit: ReturnType<typeof useChatTitleEdit> }) {
  return (
    <input
      ref={edit.inputRef}
      value={edit.draft}
      onChange={(e) => edit.setDraft(e.target.value)}
      onBlur={edit.saveEdit}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') edit.saveEdit();
        if (e.key === 'Escape') edit.cancelEdit();
        e.stopPropagation();
      }}
      className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none"
      placeholder="Chat"
    />
  );
}

// ── Chat tab header (wide hasTab mode) ───────────────────────────
//
// Layout: [💬 title] [✏️ ×]
// Title truncates when container is narrow. Pencil + close are shrink-0.

function ChatTabHeader({ nodeId, onClose }: { nodeId: string; onClose: (e: React.MouseEvent) => void }) {
  const edit = useChatTitleEdit(nodeId);

  return (
    <div className="group/panel flex items-center shrink-0 mt-1 h-8">
      <div className="flex flex-1 min-w-0 items-center gap-1.5 pl-4 text-[13px] text-foreground-tertiary">
        <MessageCircle size={12} strokeWidth={1.6} className="shrink-0" />
        {edit.editing ? (
          <ChatTitleInput edit={edit} />
        ) : (
          <span className="min-w-0 truncate">{edit.displayTitle}</span>
        )}
      </div>
      <div className="flex shrink-0 items-center mr-2.5">
        {!edit.editing && (
          <button type="button" onClick={edit.startEdit} title="Edit title" className={PANEL_ICON_BTN}>
            <Pencil size={10} strokeWidth={1.8} />
          </button>
        )}
        <button type="button" onClick={onClose} title="Close panel" className={PANEL_ICON_BTN}>
          <X size={12} />
        </button>
      </div>
    </div>
  );
}

// ── Name-only tab (narrow / dropdown mode) ──────────────────────
//
// Shows panel name (+ MessageCircle for Chat) in a shaped tab.
// Click body → toggle dropdown; `children` = dropdown menu.

interface TabHeadProps {
  nodeId: string;
  onClickBody?: () => void;
  onClose?: (e: React.MouseEvent) => void;
  menuOpen?: boolean;
  tabRef?: React.Ref<HTMLDivElement>;
  children?: React.ReactNode;
}

function TabHead({ nodeId, onClickBody, onClose, menuOpen, tabRef, children }: TabHeadProps) {
  const isChat = isChatPanel(nodeId);

  return (
    <div
      ref={tabRef}
      className="tab-connector-right relative z-10 flex h-10 min-w-0 flex-1 items-center bg-background rounded-t-xl"
    >
      {/* Name area — interactive only when onClickBody is provided */}
      <div
        className={`group/name flex min-w-0 flex-1 ml-1 h-7 items-center rounded-md transition-colors ${onClickBody ? 'cursor-pointer hover:bg-foreground/4' : ''}`}
        onClick={onClickBody}
        role={menuOpen !== undefined ? 'button' : undefined}
        aria-haspopup={menuOpen !== undefined ? 'menu' : undefined}
        aria-expanded={menuOpen !== undefined ? menuOpen : undefined}
      >
        <span className="flex min-w-0 flex-1 items-center gap-1.5 px-2 text-[13px] text-foreground">
          {isChat && <MessageCircle size={12} strokeWidth={1.6} className="shrink-0 text-foreground-tertiary" />}
          <span className="min-w-0 truncate"><PanelLabel nodeId={nodeId} /></span>
        </span>
        {menuOpen !== undefined && (
          <ChevronDown
            size={14}
            strokeWidth={1.7}
            className={`shrink-0 mr-1.5 text-foreground-tertiary transition-all ${menuOpen ? 'opacity-100 rotate-180' : 'opacity-0 group-hover/name:opacity-100'}`}
          />
        )}
      </div>
      {/* Close button */}
      {onClose && (
        <button
          type="button"
          className="flex h-7 w-7 mr-1 shrink-0 items-center justify-center rounded-md text-foreground-tertiary transition-colors hover:bg-foreground/4 hover:text-foreground"
          onClick={onClose}
          title="Close panel"
        >
          <X size={12} />
        </button>
      )}
      {children}
    </div>
  );
}

// ── Dropdown menu row for chat panels ────────────────────────────
//
// Separate component because useChatTitleEdit is a hook and cannot
// be called conditionally inside the dropdown loop.

function ChatDropdownRow({
  nodeId,
  active,
  onSelect,
  onClose,
}: {
  nodeId: string;
  active: boolean;
  onSelect: () => void;
  onClose: (e: React.MouseEvent) => void;
}) {
  const edit = useChatTitleEdit(nodeId);

  return (
    <div
      className={`group/menu flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-foreground transition-colors hover:bg-foreground/4 ${
        active ? '' : 'cursor-pointer'
      }`}
      onClick={onSelect}
    >
      <span className={`flex shrink-0 text-[10px] ${active ? 'text-primary' : 'text-foreground-tertiary'}`}>
        <MessageCircle size={10} strokeWidth={1.6} />
      </span>
      <span className="min-w-0 flex-1 truncate">
        {edit.editing ? <ChatTitleInput edit={edit} /> : <PanelLabel nodeId={nodeId} />}
      </span>
      {!edit.editing && (
        <button
          type="button"
          onClick={edit.startEdit}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-foreground-tertiary opacity-0 transition-opacity hover:bg-foreground/4 hover:text-foreground group-hover/menu:opacity-100"
          title="Edit title"
        >
          <Pencil size={10} strokeWidth={1.8} />
        </button>
      )}
      <button
        type="button"
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-foreground-tertiary transition-colors hover:bg-foreground/4 hover:text-foreground"
        onClick={onClose}
        title="Close panel"
      >
        <X size={12} />
      </button>
    </div>
  );
}

/** Panel body class for tab layouts (narrow + wide hasTab). */
const TAB_PANEL_BODY = 'group/panel flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden bg-background shadow-card rounded-b-xl rounded-tr-xl';

export function PanelLayout({ toolbar }: PanelLayoutProps) {
  const panels = useUIStore((s) => s.panels);
  const activePanelId = useUIStore((s) => s.activePanelId);
  const setActivePanel = useUIStore((s) => s.setActivePanel);
  const closePanel = useUIStore((s) => s.closePanel);
  const panelTitleVisibleMap = useUIStore((s) => s.panelTitleVisibleMap);

  const containerRef = useRef<HTMLDivElement>(null);
  const notesMenuRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(Infinity);
  const [notesMenuOpen, setNotesMenuOpen] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!notesMenuOpen) return;

    function onPointerDown(e: PointerEvent) {
      if (notesMenuRef.current && !notesMenuRef.current.contains(e.target as Node)) {
        setNotesMenuOpen(false);
      }
    }

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [notesMenuOpen]);

  const handleClosePanel = useCallback((e: React.MouseEvent, panelId: string) => {
    e.stopPropagation();
    closePanel(panelId);
  }, [closePanel]);

  if (panels.length === 0) {
    return (
      <div ref={containerRef} className="flex flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 justify-end">
          {toolbar}
        </div>
        <DeskLanding />
      </div>
    );
  }

  const dropdownMode = panels.length > 1 && containerWidth / panels.length < MIN_PANEL_WIDTH;

  // ── Narrow mode: name tab + dropdown panel switcher ──
  if (dropdownMode) {
    const activePanel = panels.find((p) => p.id === activePanelId) ?? panels[0];
    const nodeId = activePanel.nodeId;
    const isApp = isAppPanel(nodeId);
    const isChat = isChatPanel(nodeId);

    return (
      <div ref={containerRef} className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-end shrink-0">
          <TabHead
            nodeId={nodeId}
            onClose={(e) => handleClosePanel(e, activePanel.id)}
            onClickBody={() => setNotesMenuOpen((open) => !open)}
            menuOpen={notesMenuOpen}
            tabRef={notesMenuRef}
          >
            {notesMenuOpen && (
              <div className="absolute left-0 right-0 top-full z-50 mt-1 min-w-[220px] rounded-lg bg-background p-1 shadow-paper">
                {panels.map((panel) => {
                  const active = panel.id === activePanelId;

                  if (isChatPanel(panel.nodeId)) {
                    return (
                      <ChatDropdownRow
                        key={panel.id}
                        nodeId={panel.nodeId}
                        active={active}
                        onSelect={() => {
                          setActivePanel(panel.id);
                          setNotesMenuOpen(false);
                        }}
                        onClose={(e) => {
                          setNotesMenuOpen(false);
                          handleClosePanel(e, panel.id);
                        }}
                      />
                    );
                  }

                  return (
                    <div
                      key={panel.id}
                      className={`group/menu flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-foreground transition-colors hover:bg-foreground/4 ${
                        active ? '' : 'cursor-pointer'
                      }`}
                      onClick={() => {
                        setActivePanel(panel.id);
                        setNotesMenuOpen(false);
                      }}
                    >
                      <span className={`flex shrink-0 text-[10px] ${active ? 'text-primary' : 'text-foreground-tertiary'}`}>
                        ●
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        <PanelLabel nodeId={panel.nodeId} />
                      </span>
                      <button
                        type="button"
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-foreground-tertiary transition-colors hover:bg-foreground/4 hover:text-foreground"
                        onClick={(e) => {
                          setNotesMenuOpen(false);
                          handleClosePanel(e, panel.id);
                        }}
                        title="Close panel"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </TabHead>
          <div className="flex shrink-0 justify-end">
            {toolbar}
          </div>
        </div>
        <div className={TAB_PANEL_BODY}>
          {!isApp && !isChat && (
            <div className="flex items-center shrink-0 mt-1">
              <Breadcrumb nodeId={nodeId} active />
            </div>
          )}
          {renderPanelContent(nodeId, activePanel.id, { hideHeader: isChat })}
        </div>
      </div>
    );
  }

  // ── Side-by-side mode ──
  return (
    <div ref={containerRef} className="flex flex-1 gap-1.5 overflow-hidden">
      {panels.map((panel, i) => {
        const isActive = panel.id === activePanelId;
        const nodeId = panel.nodeId;
        const isChat = isChatPanel(nodeId);
        const titleVisible = panelTitleVisibleMap[panel.id] ?? true;
        const isLast = i === panels.length - 1;
        const hasTab = isLast && !!toolbar;
        const headerOpts = { isActive, titleVisible, onClose: (e: React.MouseEvent) => handleClosePanel(e, panel.id) };

        // ── Last panel: tab shape, same header content ──
        if (hasTab) {
          return (
            <div key={panel.id} className="group/panel flex flex-1 min-w-0 flex-col">
              <div className="flex items-end shrink-0">
                <div
                  className="tab-connector-right relative z-10 flex-1 min-w-0 self-stretch bg-background rounded-t-xl"
                  onClick={() => setActivePanel(panel.id)}
                >
                  {isChat ? (
                    <ChatTabHeader nodeId={nodeId} onClose={headerOpts.onClose} />
                  ) : (
                    renderPanelHeader(nodeId, headerOpts)
                  )}
                </div>
                <div className="flex shrink-0 justify-end">
                  {toolbar}
                </div>
              </div>
              <div
                className={TAB_PANEL_BODY}
                onClick={() => setActivePanel(panel.id)}
              >
                {renderPanelContent(nodeId, panel.id, { hideHeader: isChat })}
              </div>
            </div>
          );
        }

        // ── Normal card ──
        return (
          <div key={panel.id} className="flex flex-1 min-w-0 flex-col">
            <div
              className="group/panel flex flex-1 min-w-0 flex-col overflow-hidden rounded-xl bg-background shadow-card"
              onClick={() => setActivePanel(panel.id)}
            >
              {renderPanelHeader(nodeId, headerOpts)}
              {renderPanelContent(nodeId, panel.id)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Panel name text for tab labels and dropdown menu rows. */
function PanelLabel({ nodeId }: { nodeId: string }) {
  const isChat = isChatPanel(nodeId);
  const chatTitle = useSyncExternalStore(
    subscribeChatTitles,
    () => isChat ? getChatTitle(chatPanelSessionId(nodeId)) : null,
  );

  const nodeName = useNodeStore((s) => {
    void s._version;
    if (isChat) return null;
    if (isAppPanel(nodeId)) return nodeId.replace(/^app:/, '').replace(/^./, (c) => c.toUpperCase());
    const node = s.getNode(nodeId);
    const raw = node?.name ?? '';
    return raw.replace(/<[^>]+>/g, '').trim() || 'Untitled';
  });

  return <>{isChat ? (chatTitle || 'Chat') : nodeName}</>;
}
