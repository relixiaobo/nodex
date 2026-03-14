import { useUIStore, selectCurrentNodeId } from '../../stores/ui-store';
import { isAppPanel } from '../../types/index.js';
import type { AppPanelId } from '../../types/index.js';
import { NodePanel } from './NodePanel';
import { AppPanel } from './AppPanel';

export function PanelStack() {
  const topNodeId = useUIStore(selectCurrentNodeId);

  if (!topNodeId) {
    return (
      <div className="flex flex-1 items-center justify-center text-foreground-tertiary text-sm">
        Press ⌘K to search
      </div>
    );
  }

  if (isAppPanel(topNodeId)) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <AppPanel panelId={topNodeId as AppPanelId} />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <NodePanel nodeId={topNodeId} />
    </div>
  );
}
