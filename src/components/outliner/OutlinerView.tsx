import { useNode } from '../../hooks/use-node';
import { useChildren } from '../../hooks/use-children';
import { OutlinerItem } from './OutlinerItem';
import { TrailingInput } from '../editor/TrailingInput';

interface OutlinerViewProps {
  rootNodeId: string;
}

export function OutlinerView({ rootNodeId }: OutlinerViewProps) {
  const node = useNode(rootNodeId);
  useChildren(rootNodeId);

  const childIds = node?.children ?? [];

  return (
    <div className="flex flex-col" role="tree">
      {childIds.map((childId) => (
        <OutlinerItem
          key={childId}
          nodeId={childId}
          depth={0}
          rootChildIds={childIds}
          parentId={rootNodeId}
        />
      ))}
      <TrailingInput parentId={rootNodeId} depth={0} autoFocus={childIds.length === 0} />
    </div>
  );
}
