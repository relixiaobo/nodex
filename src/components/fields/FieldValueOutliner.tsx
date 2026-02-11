/**
 * Mini outliner for plain-type field values.
 *
 * Uses AssociatedData node as the root. Its children are value nodes
 * rendered with full OutlinerItem capabilities (Enter, Tab, children, etc.).
 * Shows a TrailingInput when empty or at the end.
 */
import { useNodeStore } from '../../stores/node-store';
import { useChildren } from '../../hooks/use-children';
import { OutlinerItem } from '../outliner/OutlinerItem';
import { TrailingInput } from '../editor/TrailingInput';

interface FieldValueOutlinerProps {
  assocDataId: string;
}

export function FieldValueOutliner({ assocDataId }: FieldValueOutlinerProps) {
  useChildren(assocDataId);
  const childIds = useNodeStore((s) => s.entities[assocDataId]?.children ?? []);

  return (
    <div className="min-h-[22px]">
      {childIds.map((id) => (
        <OutlinerItem key={id} nodeId={id} depth={0} rootChildIds={childIds} parentId={assocDataId} rootNodeId={assocDataId} />
      ))}
      <TrailingInput parentId={assocDataId} depth={0} />
    </div>
  );
}
