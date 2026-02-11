import { useMemo } from 'react';
import { useNode } from '../../hooks/use-node';
import { useChildren } from '../../hooks/use-children';
import { useNodeStore } from '../../stores/node-store';
import { OutlinerItem } from './OutlinerItem';
import { TrailingInput } from '../editor/TrailingInput';

interface OutlinerViewProps {
  rootNodeId: string;
}

export function OutlinerView({ rootNodeId }: OutlinerViewProps) {
  const node = useNode(rootNodeId);
  useChildren(rootNodeId);

  const allChildIds = node?.children ?? [];
  const entities = useNodeStore((s) => s.entities);

  // Filter root children: only show content nodes (no docType).
  // Tuples, metanodes, associatedData etc. are rendered elsewhere (FieldList).
  const childIds = useMemo(
    () => allChildIds.filter((cid) => !entities[cid]?.props._docType),
    [allChildIds, entities],
  );

  return (
    <div className="flex flex-col" role="tree">
      {childIds.map((childId) => (
        <OutlinerItem
          key={childId}
          nodeId={childId}
          depth={0}
          rootChildIds={childIds}
          parentId={rootNodeId}
          rootNodeId={rootNodeId}
        />
      ))}
      <TrailingInput parentId={rootNodeId} depth={0} autoFocus={childIds.length === 0} parentExpandKey={`${node?.props._ownerId ?? ''}:${rootNodeId}`} />
    </div>
  );
}
