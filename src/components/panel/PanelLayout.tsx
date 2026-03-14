/**
 * PanelLayout — renders N panels as independent floating cards.
 *
 * Each panel is a self-contained card with its own breadcrumb header.
 * When `toolbar` is provided, it renders as an irregular shaped tab
 * connected to the last panel's top-right corner (Chrome tab style).
 */
import { useCallback } from 'react';
import { useUIStore } from '../../stores/ui-store.js';
import { isAppPanel } from '../../types/index.js';
import type { AppPanelId } from '../../types/index.js';
import { NodePanel } from './NodePanel';
import { AppPanel } from './AppPanel';
import { Breadcrumb } from './Breadcrumb';
import { X } from '../../lib/icons.js';

interface PanelLayoutProps {
  toolbar?: React.ReactNode;
}

export function PanelLayout({ toolbar }: PanelLayoutProps) {
  const panels = useUIStore((s) => s.panels);
  const activePanelId = useUIStore((s) => s.activePanelId);
  const setActivePanel = useUIStore((s) => s.setActivePanel);
  const closePanel = useUIStore((s) => s.closePanel);
  const panelTitleVisibleMap = useUIStore((s) => s.panelTitleVisibleMap);

  const handleClosePanel = useCallback((e: React.MouseEvent, panelId: string) => {
    e.stopPropagation();
    closePanel(panelId);
  }, [closePanel]);

  if (panels.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-foreground-tertiary text-sm">
        Press ⌘K to search
      </div>
    );
  }

  const showClose = panels.length > 1;

  return (
    <div className="flex flex-1 gap-1.5 overflow-hidden">
      {panels.map((panel, i) => {
        const isActive = panel.id === activePanelId;
        const nodeId = panel.nodeId;
        const isApp = isAppPanel(nodeId);
        const titleVisible = panelTitleVisibleMap[panel.id] ?? true;
        const isLast = i === panels.length - 1;
        const hasTab = isLast && !!toolbar;

        const panelCard = (
          <div
            className={`group/panel relative flex flex-1 min-w-0 flex-col overflow-hidden bg-background ${
              hasTab ? 'rounded-tl-xl rounded-b-xl' : 'rounded-xl'
            } ${isActive ? 'ring-2 ring-primary/30' : ''}`}
            onClick={() => setActivePanel(panel.id)}
          >
            {/* Per-panel breadcrumb header */}
            {!isApp && (
              <div className="flex items-center shrink-0">
                <Breadcrumb nodeId={nodeId} showCurrentName={!titleVisible} compact />
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
        );

        if (hasTab) {
          return (
            <div key={panel.id} className="flex flex-1 min-w-0 flex-col">
              <div className="flex justify-end shrink-0">
                <div className="tab-connector-left flex items-center bg-background rounded-t-xl">
                  {toolbar}
                </div>
              </div>
              {panelCard}
            </div>
          );
        }

        return <div key={panel.id} className="flex flex-1 min-w-0 flex-col">{panelCard}</div>;
      })}
    </div>
  );
}
