/**
 * PanelLayout — renders N panels side by side.
 *
 * Replaces PanelStack. Each panel gets its own panelId for per-panel expand state.
 * Single panel is the initial state; multi-panel support is added in Step 3.
 */
import { useUIStore, selectCurrentNodeId } from '../../stores/ui-store';
import { isAppPanel } from '../../types/index.js';
import type { AppPanelId } from '../../types/index.js';
import { NodePanel } from './NodePanel';
import { AppPanel } from './AppPanel';

export function PanelLayout() {
  const panels = useUIStore((s) => s.panels);
  const activePanelId = useUIStore((s) => s.activePanelId);

  if (panels.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-foreground-tertiary text-sm">
        Press ⌘K to search
      </div>
    );
  }

  // For now, render only the active panel (multi-panel rendering added in Step 3)
  const activePanel = panels.find((p) => p.id === activePanelId) ?? panels[0];
  const nodeId = activePanel.nodeId;

  if (isAppPanel(nodeId)) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <AppPanel panelId={nodeId as AppPanelId} />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <NodePanel nodeId={nodeId} panelId={activePanel.id} />
    </div>
  );
}
