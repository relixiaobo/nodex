/**
 * PanelLayout — renders N panels as independent floating cards.
 *
 * Two layout modes based on container width:
 *
 * Side-by-side (wide): panels as independent cards with breadcrumb headers.
 * Last panel uses a shaped tab (Chrome tab style) when `toolbar` is provided;
 * tab shows panel name only, breadcrumb moves into the panel body.
 *
 * Narrow mode (< 250px per panel): shaped tab with Notes dropdown.
 * Click tab body → toggle panel switcher dropdown.
 * Click × → close panel. Breadcrumb renders inside panel body.
 *
 * Active panel is indicated by the dropdown row highlight + bullet color.
 */
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { useUIStore } from '../../stores/ui-store.js';
import { useNodeStore } from '../../stores/node-store.js';
import { chatPanelSessionId, isAppPanel, isChatPanel } from '../../types/index.js';
import type { AppPanelId } from '../../types/index.js';
import { NodePanel } from './NodePanel';
import { AppPanel } from './AppPanel';
import { Breadcrumb } from './Breadcrumb';
import { Sparkles, X } from '../../lib/icons.js';
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

// ── Shared shaped tab ──────────────────────────────────────────────
//
// Name-only label tab used by both narrow-mode dropdown and wide-mode
// last-panel. Shows: [panel name] [×close]. Breadcrumb lives inside
// the panel body, not the tab.
//
// Narrow mode: click tab body → toggle dropdown; dropdown as `children`.
// Wide mode: click tab body → activate panel; no children.

interface TabHeadProps {
  nodeId: string;
  onClose: (e: React.MouseEvent) => void;
  /** Click on the name area (not close). */
  onClickBody?: () => void;
  /** Narrow mode: whether the dropdown is open (for aria-expanded). */
  menuOpen?: boolean;
  tabRef?: React.Ref<HTMLDivElement>;
  /** Dropdown menu (narrow mode only). */
  children?: React.ReactNode;
}

function TabHead({ nodeId, onClose, onClickBody, menuOpen, tabRef, children }: TabHeadProps) {
  const isChat = isChatPanel(nodeId);

  return (
    <div
      ref={tabRef}
      className="tab-connector-right relative z-10 flex h-10 min-w-0 shrink items-center bg-background rounded-t-xl"
    >
      {/* Name area — clickable body */}
      <div
        className="group/tab flex flex-1 max-w-[240px] min-w-0 ml-1 h-7 items-center rounded-md hover:bg-foreground/4 transition-colors cursor-pointer"
        onClick={onClickBody}
        role={menuOpen !== undefined ? 'button' : undefined}
        aria-haspopup={menuOpen !== undefined ? 'menu' : undefined}
        aria-expanded={menuOpen !== undefined ? menuOpen : undefined}
      >
        <span className="flex min-w-0 flex-1 items-center gap-1.5 px-2 text-[13px] text-foreground truncate">
          {isChat && <Sparkles size={12} strokeWidth={1.6} className="shrink-0 text-foreground-tertiary" />}
          <PanelLabel nodeId={nodeId} />
        </span>
        <button
          type="button"
          className="flex h-5 w-5 mr-1 shrink-0 items-center justify-center rounded-md text-foreground-tertiary opacity-0 transition-opacity hover:bg-foreground/8 hover:text-foreground group-hover/tab:opacity-100"
          onClick={onClose}
          title="Close panel"
        >
          <X size={12} />
        </button>
      </div>
      {children}
    </div>
  );
}

/** Panel body class shared by tab layouts (narrow + wide hasTab). */
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

  const showClose = true;
  const dropdownMode = panels.length > 1 && containerWidth / panels.length < MIN_PANEL_WIDTH;

  // ── Narrow mode: Notes dropdown + single active panel body ──
  if (dropdownMode) {
    const activePanel = panels.find((p) => p.id === activePanelId) ?? panels[0];
    const nodeId = activePanel.nodeId;
    const isApp = isAppPanel(nodeId);
    const isChat = isChatPanel(nodeId);

    return (
      <div ref={containerRef} className="flex flex-1 flex-col overflow-hidden">
        {/* Tab row: name tab (paper) + toolbar (desk) */}
        <div className="flex items-end shrink-0">
          <TabHead
            nodeId={nodeId}
            onClose={(e) => handleClosePanel(e, activePanel.id)}
            onClickBody={() => setNotesMenuOpen((open) => !open)}
            menuOpen={notesMenuOpen}
            tabRef={notesMenuRef}
          >
            {/* Dropdown menu */}
            {notesMenuOpen && (
              <div className="absolute left-0 top-full z-50 mt-1 min-w-[220px] rounded-lg bg-background p-1 shadow-paper">
                {panels.map((panel) => {
                  const active = panel.id === activePanelId;
                  return (
                    <div
                      key={panel.id}
                      className={`group/menu flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-foreground transition-colors ${
                        active ? 'bg-foreground/4' : 'cursor-pointer hover:bg-foreground/4'
                      }`}
                      onClick={() => {
                        setActivePanel(panel.id);
                        setNotesMenuOpen(false);
                      }}
                    >
                      <span className={`flex shrink-0 text-[10px] ${active ? 'text-primary' : 'text-foreground-tertiary'}`}>
                        {isChatPanel(panel.nodeId)
                          ? <Sparkles size={10} strokeWidth={1.6} />
                          : '●'}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        <PanelLabel nodeId={panel.nodeId} />
                      </span>
                      {showClose && (
                        <button
                          type="button"
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-foreground-tertiary transition-colors hover:bg-foreground/8 hover:text-foreground"
                          onClick={(e) => {
                            setNotesMenuOpen(false);
                            handleClosePanel(e, panel.id);
                          }}
                          title="Close panel"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </TabHead>
          <div className="flex flex-1 justify-end">
            {toolbar}
          </div>
        </div>
        {/* Panel body — breadcrumb inside, no top-left rounding (connects to tab) */}
        <div className={TAB_PANEL_BODY}>
          {!isApp && !isChat && (
            <Breadcrumb nodeId={nodeId} active />
          )}
          {renderPanelContent(nodeId, activePanel.id, { hideHeader: isChat })}
        </div>
      </div>
    );
  }

  // ── Side-by-side mode: panels as independent floating cards ──
  return (
    <div ref={containerRef} className="flex flex-1 gap-1.5 overflow-hidden">
      {panels.map((panel, i) => {
        const isActive = panel.id === activePanelId;
        const nodeId = panel.nodeId;
        const isApp = isAppPanel(nodeId);
        const isChat = isChatPanel(nodeId);
        const titleVisible = panelTitleVisibleMap[panel.id] ?? true;
        const isLast = i === panels.length - 1;
        const hasTab = isLast && !!toolbar && !isApp;

        // ── Last panel with tab layout ──
        if (hasTab) {
          return (
            <div key={panel.id} className="flex flex-1 min-w-0 flex-col">
              {/* Tab row: name tab (paper) + toolbar (desk) */}
              <div className="flex items-end shrink-0">
                <TabHead
                  nodeId={nodeId}
                  onClose={(e) => handleClosePanel(e, panel.id)}
                  onClickBody={() => setActivePanel(panel.id)}
                />
                <div className="flex flex-1 justify-end">
                  {toolbar}
                </div>
              </div>
              {/* Panel body — breadcrumb inside, no top-left rounding (connects to tab) */}
              <div
                className={TAB_PANEL_BODY}
                onClick={() => setActivePanel(panel.id)}
              >
                {!isApp && !isChat && (
                  <Breadcrumb nodeId={nodeId} showCurrentName={!titleVisible} active={isActive} />
                )}
                {renderPanelContent(nodeId, panel.id, { hideHeader: isChat })}
              </div>
            </div>
          );
        }

        // ── Normal panel card ──
        return (
          <div key={panel.id} className="flex flex-1 min-w-0 flex-col">
            <div
              className="group/panel flex flex-1 min-w-0 flex-col overflow-hidden rounded-xl bg-background shadow-card"
              onClick={() => setActivePanel(panel.id)}
            >
              {!isApp && !isChat && (
                <div className="flex items-center shrink-0">
                  <Breadcrumb nodeId={nodeId} showCurrentName={!titleVisible} active={isActive} />
                  {showClose && (
                    <button
                      type="button"
                      className="flex h-5 w-5 mr-2 shrink-0 items-center justify-center rounded-md text-foreground-tertiary opacity-0 transition-opacity hover:bg-foreground/8 hover:text-foreground group-hover/panel:opacity-100"
                      onClick={(e) => handleClosePanel(e, panel.id)}
                      title="Close panel"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              )}
              {isApp && showClose && (
                <div className="flex items-center justify-end shrink-0 h-8">
                  <button
                    type="button"
                    className="flex h-5 w-5 mr-2 shrink-0 items-center justify-center rounded-md text-foreground-tertiary opacity-0 transition-opacity hover:bg-foreground/8 hover:text-foreground group-hover/panel:opacity-100"
                    onClick={(e) => handleClosePanel(e, panel.id)}
                    title="Close panel"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}
              {renderPanelContent(nodeId, panel.id)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Shared panel title text for the dropdown trigger and menu rows. */
function PanelLabel({ nodeId }: { nodeId: string }) {
  const name = useNodeStore((s) => {
    void s._version;
    if (isChatPanel(nodeId)) return 'Chat';
    if (isAppPanel(nodeId)) return nodeId.replace(/^app:/, '').replace(/^./, (c) => c.toUpperCase());
    const node = s.getNode(nodeId);
    const raw = node?.name ?? '';
    return raw.replace(/<[^>]+>/g, '').trim() || 'Untitled';
  });
  return <>{name}</>;
}
