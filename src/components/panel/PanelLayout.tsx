/**
 * PanelLayout — renders N panels as independent floating cards.
 *
 * Two layout modes based on container width:
 *
 * Side-by-side (wide): panels as independent cards with breadcrumb headers.
 * Last panel's breadcrumb becomes a shaped tab (Chrome tab style) when
 * `toolbar` is provided; toolbar sits on the desk background to its right.
 *
 * Tab mode (narrow, < 250px per panel): Chrome-style tab bar with equal-width
 * tabs. Active tab shows [W] / ... / nodeName breadcrumb; inactive tabs show
 * only the node name. Only the active panel is rendered below.
 *
 * Active panel is indicated by the breadcrumb [W] avatar color:
 * active = primary (colored), inactive = foreground-tertiary (gray).
 */
import { useCallback, useRef, useState, useEffect } from 'react';
import { useUIStore } from '../../stores/ui-store.js';
import { useNodeStore } from '../../stores/node-store.js';
import { isAppPanel } from '../../types/index.js';
import type { AppPanelId } from '../../types/index.js';
import { NodePanel } from './NodePanel';
import { AppPanel } from './AppPanel';
import { Breadcrumb } from './Breadcrumb';
import { ChevronDown, X } from '../../lib/icons.js';

/** Minimum width per panel before switching to tab mode. */
const MIN_PANEL_WIDTH = 250;

interface PanelLayoutProps {
  toolbar?: React.ReactNode;
}

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
      <div ref={containerRef} className="flex flex-1 items-center justify-center text-foreground-tertiary text-sm">
        Press ⌘K to search
      </div>
    );
  }

  const showClose = panels.length > 1;
  const tabMode = panels.length > 1 && containerWidth / panels.length < MIN_PANEL_WIDTH;

  // ── Tab mode: Chrome-style tab bar — all tabs same height, equal width ──
  if (tabMode) {
    const activePanel = panels.find((p) => p.id === activePanelId) ?? panels[0];
    const nodeId = activePanel.nodeId;
    const isApp = isAppPanel(nodeId);

    return (
      <div ref={containerRef} className="flex flex-1 flex-col overflow-hidden">
        <div className="flex h-10 shrink-0 items-center gap-2">
          <div ref={notesMenuRef} className="relative min-w-0">
            <button
              type="button"
              className="flex min-w-0 items-center gap-1 rounded-lg px-2 py-1 text-[13px] text-foreground transition-colors hover:bg-foreground/4"
              onClick={() => setNotesMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={notesMenuOpen}
            >
              <ChevronDown
                size={13}
                strokeWidth={1.7}
                className={`shrink-0 transition-transform ${notesMenuOpen ? 'rotate-180' : ''}`}
              />
              <span className="min-w-0 truncate">
                <InactiveTabLabel nodeId={activePanel.nodeId} />
              </span>
            </button>
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
                      <span className={`shrink-0 text-[10px] ${active ? 'text-primary' : 'text-foreground-tertiary'}`}>
                        ●
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        <InactiveTabLabel nodeId={panel.nodeId} />
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
          </div>
          <div className="flex-1" />
          {toolbar && (
            <div className="flex shrink-0">
              {toolbar}
            </div>
          )}
        </div>
        <div className="group/panel flex flex-1 min-h-0 flex-col overflow-hidden rounded-xl bg-background shadow-card">
          {isApp ? (
            <AppPanel panelId={nodeId as AppPanelId} />
          ) : (
            <NodePanel nodeId={nodeId} panelId={activePanel.id} />
          )}
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
        const titleVisible = panelTitleVisibleMap[panel.id] ?? true;
        const isLast = i === panels.length - 1;
        const hasTab = isLast && !!toolbar && !isApp;

        // ── Last panel with tab layout ──
        if (hasTab) {
          return (
            <div key={panel.id} className="flex flex-1 min-w-0 flex-col">
              {/* Tab row: breadcrumb tab (paper) + toolbar (desk) */}
              <div className="flex items-end shrink-0">
                <div
                  className="tab-connector-right relative z-10 flex h-10 min-w-0 shrink items-center bg-background rounded-t-xl"
                  onClick={() => setActivePanel(panel.id)}
                >
                  <Breadcrumb nodeId={nodeId} showCurrentName={!titleVisible} active={isActive} compact />
                  {showClose && (
                    <button
                      className="flex h-5 w-5 mr-1 shrink-0 items-center justify-center rounded-md text-foreground-tertiary hover:bg-foreground/8 hover:text-foreground"
                      onClick={(e) => handleClosePanel(e, panel.id)}
                      title="Close panel"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
                <div className="flex flex-1 justify-end">
                  {toolbar}
                </div>
              </div>
              {/* Panel body — no top-left rounding (connects to tab) */}
              <div
                className="group/panel flex flex-1 min-w-0 flex-col overflow-hidden bg-background shadow-card rounded-b-xl rounded-tr-xl"
                onClick={() => setActivePanel(panel.id)}
              >
                {isApp ? (
                  <AppPanel panelId={nodeId as AppPanelId} />
                ) : (
                  <NodePanel nodeId={nodeId} panelId={panel.id} />
                )}
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
              {!isApp && (
                <div className="flex items-center shrink-0">
                  <Breadcrumb nodeId={nodeId} showCurrentName={!titleVisible} active={isActive} />
                  {showClose && (
                    <button
                      className="flex h-5 w-5 mr-1 shrink-0 items-center justify-center rounded-md text-foreground-tertiary opacity-0 transition-opacity hover:bg-foreground/8 hover:text-foreground group-hover/panel:opacity-100"
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
                    className="flex h-5 w-5 mr-1 shrink-0 items-center justify-center rounded-md text-foreground-tertiary opacity-0 transition-opacity hover:bg-foreground/8 hover:text-foreground group-hover/panel:opacity-100"
                    onClick={(e) => handleClosePanel(e, panel.id)}
                    title="Close panel"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}
              {isApp ? (
                <AppPanel panelId={nodeId as AppPanelId} />
              ) : (
                <NodePanel nodeId={nodeId} panelId={panel.id} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Node name label for inactive tabs in tab mode. */
function InactiveTabLabel({ nodeId }: { nodeId: string }) {
  const name = useNodeStore((s) => {
    void s._version;
    if (isAppPanel(nodeId)) return nodeId.replace(/^app:/, '').replace(/^./, (c) => c.toUpperCase());
    const node = s.getNode(nodeId);
    const raw = node?.name ?? '';
    return raw.replace(/<[^>]+>/g, '').trim() || 'Untitled';
  });
  return <>{name}</>;
}
