/**
 * Mini outliner for attrDef config pages.
 *
 * Renders non-tuple children of an attrDef as OutlinerItems + TrailingInput.
 * Used for "Pre-determined options" in OPTIONS field config.
 * Same rendering as OutlinerView but embedded inside a FieldRow value column.
 */
import { useMemo } from 'react';
import { useChildren } from '../../hooks/use-children';
import { useNodeStore } from '../../stores/node-store';
import { OutlinerItem } from '../outliner/OutlinerItem';
import { TrailingInput } from '../editor/TrailingInput';

interface ConfigOutlinerProps {
  nodeId: string;
}

export function ConfigOutliner({ nodeId }: ConfigOutlinerProps) {
  useChildren(nodeId);

  const allChildIds = useNodeStore((s) => s.entities[nodeId]?.children ?? []);
  const entities = useNodeStore((s) => s.entities);
  const ownerId = useNodeStore((s) => s.entities[nodeId]?.props._ownerId ?? '');

  // Filter to non-docType children only (same logic as OutlinerView)
  const childIds = useMemo(
    () => allChildIds.filter((cid) => !entities[cid]?.props._docType),
    [allChildIds, entities],
  );

  return (
    <div className="min-h-[22px]">
      {childIds.map((childId) => (
        <OutlinerItem
          key={childId}
          nodeId={childId}
          depth={0}
          rootChildIds={childIds}
          parentId={nodeId}
          rootNodeId={nodeId}
        />
      ))}
      <TrailingInput
        parentId={nodeId}
        depth={0}
        parentExpandKey={`${ownerId}:${nodeId}`}
      />
    </div>
  );
}
