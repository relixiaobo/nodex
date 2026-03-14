/**
 * PanelLayout — renders N panels side by side.
 *
 * Each panel gets its own panelId for per-panel expand state.
 * Click on a panel to make it active. Close button appears when >1 panel open.
 * Active panel is indicated by a subtle top border.
 */
import { Fragment, useCallback } from 'react';
import { useUIStore } from '../../stores/ui-store.js';
import { isAppPanel } from '../../types/index.js';
import type { AppPanelId } from '../../types/index.js';
import { NodePanel } from './NodePanel';
import { AppPanel } from './AppPanel';
import { X } from '../../lib/icons.js';

export function PanelLayout() {
  const panels = useUIStore((s) => s.panels);
  const activePanelId = useUIStore((s) => s.activePanelId);
  const setActivePanel = useUIStore((s) => s.setActivePanel);
  const closePanel = useUIStore((s) => s.closePanel);

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
    <div className="flex flex-1 overflow-hidden">
      {panels.map((panel, i) => {
        const isActive = panel.id === activePanelId;
        const nodeId = panel.nodeId;
        const isApp = isAppPanel(nodeId);

        return (
          <Fragment key={panel.id}>
            {i > 0 && <div className="w-px shrink-0 bg-border-subtle" />}
            <div
              className={`group/panel relative flex flex-1 min-w-0 flex-col overflow-hidden ${
                isActive ? 'border-t-2 border-primary' : 'border-t-2 border-transparent'
              }`}
              onClick={() => setActivePanel(panel.id)}
            >
              {showClose && (
                <button
                  className="absolute top-1 right-1 z-10 flex h-5 w-5 items-center justify-center rounded-md text-foreground-tertiary opacity-0 transition-opacity hover:bg-foreground/8 hover:text-foreground group-hover/panel:opacity-100"
                  onClick={(e) => handleClosePanel(e, panel.id)}
                  title="Close panel"
                >
                  <X size={12} />
                </button>
              )}
              {isApp ? (
                <AppPanel panelId={nodeId as AppPanelId} />
              ) : (
                <NodePanel nodeId={nodeId} panelId={panel.id} />
              )}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
