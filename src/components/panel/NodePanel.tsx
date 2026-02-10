import { useNode } from '../../hooks/use-node';
import { NodePanelHeader } from './NodePanelHeader';
import { OutlinerView } from '../outliner/OutlinerView';

interface NodePanelProps {
  nodeId: string;
}

export function NodePanel({ nodeId }: NodePanelProps) {
  const node = useNode(nodeId);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <NodePanelHeader nodeId={nodeId} />
      <div className="flex-1 overflow-y-auto px-2 py-1">
        <OutlinerView rootNodeId={nodeId} />
      </div>
    </div>
  );
}
