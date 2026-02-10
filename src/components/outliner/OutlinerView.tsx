import { useCallback } from 'react';
import { useNode } from '../../hooks/use-node';
import { useChildren } from '../../hooks/use-children';
import { useNodeStore } from '../../stores/node-store';
import { useUIStore } from '../../stores/ui-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { OutlinerItem } from './OutlinerItem';

interface OutlinerViewProps {
  rootNodeId: string;
}

export function OutlinerView({ rootNodeId }: OutlinerViewProps) {
  const node = useNode(rootNodeId);
  useChildren(rootNodeId);

  const createChild = useNodeStore((s) => s.createChild);
  const setFocusedNode = useUIStore((s) => s.setFocusedNode);
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const userId = useWorkspaceStore((s) => s.userId);

  const childIds = node?.children ?? [];

  const handleAddFirstNode = useCallback(() => {
    if (!wsId || !userId) return;
    createChild(rootNodeId, wsId, userId).then((newNode) => {
      setFocusedNode(newNode.id);
    });
  }, [rootNodeId, wsId, userId, createChild, setFocusedNode]);

  if (childIds.length === 0) {
    return (
      <div className="py-4">
        <button
          onClick={handleAddFirstNode}
          className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors py-2 rounded-md hover:bg-muted/50"
        >
          + Click to add a node
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col" role="tree">
      {childIds.map((childId) => (
        <OutlinerItem
          key={childId}
          nodeId={childId}
          depth={0}
          rootChildIds={childIds}
        />
      ))}
    </div>
  );
}
