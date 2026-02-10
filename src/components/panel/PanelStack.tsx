import { useUIStore } from '../../stores/ui-store';
import { NodePanel } from './NodePanel';

export function PanelStack() {
  const panelStack = useUIStore((s) => s.panelStack);
  const topNodeId = panelStack[panelStack.length - 1] ?? null;

  if (!topNodeId) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
        Select a node from the sidebar
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <NodePanel nodeId={topNodeId} />
    </div>
  );
}
