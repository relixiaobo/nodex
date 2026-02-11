import { useUIStore } from '../../stores/ui-store';
import { useNodeStore } from '../../stores/node-store';
import { NodePanel } from './NodePanel';
import { FieldConfigPanel } from './FieldConfigPanel';

export function PanelStack() {
  const panelStack = useUIStore((s) => s.panelStack);
  const topNodeId = panelStack[panelStack.length - 1] ?? null;
  const docType = useNodeStore(
    (s) => (topNodeId ? s.entities[topNodeId]?.props._docType : undefined),
  );

  if (!topNodeId) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
        Select a node from the sidebar
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {docType === 'attrDef' ? (
        <FieldConfigPanel nodeId={topNodeId} />
      ) : (
        <NodePanel nodeId={topNodeId} />
      )}
    </div>
  );
}
