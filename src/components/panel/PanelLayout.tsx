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
import { X } from '../../lib/icons.js';

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
  const [containerWidth, setContainerWidth] = useState(Infinity);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
    const activeIdx = panels.findIndex((p) => p.id === activePanelId);
    const nodeId = activePanel.nodeId;
    const isApp = isAppPanel(nodeId);

    return (
      <div ref={containerRef} className="flex flex-1 flex-col overflow-hidden">
        {/* Tab bar */}
        <div className="flex items-end shrink-0">
          <div className="flex min-w-0 flex-1 items-end">
            {panels.map((panel) => {
              const active = panel.id === activePanelId;
              return (
                <div
                  key={panel.id}
                  className={`group/tab flex h-10 min-w-0 flex-1 items-center rounded-t-xl transition-colors ${
                    active
                      ? `bg-background relative z-10 tab-connector-right${activeIdx > 0 ? ' tab-connector-left' : ''}`
                      : 'cursor-pointer text-foreground-tertiary hover:text-foreground overflow-hidden'
                  }`}
                  onClick={() => !active && setActivePanel(panel.id)}
                >
                  {active ? (
                    /* Active tab: [W] / ... / NodeName — full breadcrumb navigation */
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <Breadcrumb nodeId={panel.nodeId} showCurrentName active compact foldAll />
                    </div>
                  ) : (
                    /* Inactive tab: just the node name */
                    <span className="min-w-0 flex-1 truncate pl-3 text-[13px]">
                      <InactiveTabLabel nodeId={panel.nodeId} />
                    </span>
                  )}
                  <button
                    className={`flex h-5 w-5 mr-2 shrink-0 items-center justify-center rounded-md text-foreground-tertiary hover:bg-foreground/8 hover:text-foreground ${
                      active ? '' : 'opacity-0 transition-opacity group-hover/tab:opacity-100'
                    }`}
                    onClick={(e) => handleClosePanel(e, panel.id)}
                    title="Close panel"
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })}
          </div>
          {toolbar && (
            <div className="flex shrink-0">
              {toolbar}
            </div>
          )}
        </div>
        {/* Panel body — round exposed top corners where desk background shows through */}
        <div className={`group/panel flex flex-1 min-h-0 flex-col overflow-hidden bg-background shadow-card ${
          activeIdx > 0 ? 'rounded-xl' : 'rounded-b-xl rounded-tr-xl'
        }`}>
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
