import { useNode } from '../../hooks/use-node';
import { useNodeTags } from '../../hooks/use-node-tags';
import { useHasFields } from '../../hooks/use-has-fields';
import { NodePanelHeader } from './NodePanelHeader';
import { OutlinerView } from '../outliner/OutlinerView';
import { FieldList } from '../fields/FieldList';

interface NodePanelProps {
  nodeId: string;
}

export function NodePanel({ nodeId }: NodePanelProps) {
  const node = useNode(nodeId);
  const tagIds = useNodeTags(nodeId);
  const hasFields = useHasFields(nodeId);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <NodePanelHeader nodeId={nodeId} />
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {(tagIds.length > 0 || hasFields) && (
          <div className="mb-2 ml-4">
            <FieldList nodeId={nodeId} />
          </div>
        )}
        <OutlinerView rootNodeId={nodeId} />
      </div>
    </div>
  );
}
