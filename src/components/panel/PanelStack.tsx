import { useUIStore, selectCurrentNodeId } from '../../stores/ui-store';
import { NodePanel } from './NodePanel';

export function PanelStack() {
  const topNodeId = useUIStore(selectCurrentNodeId);

  if (!topNodeId) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
        Press ⌘K to search
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <NodePanel nodeId={topNodeId} />
    </div>
  );
}
