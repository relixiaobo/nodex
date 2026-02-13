/**
 * Mini outliner for definition node config pages.
 *
 * Renders non-config children of a definition node:
 * - For attrDef: plain content nodes (pre-determined options) → OutlinerItem
 * - For tagDef: field tuples (template fields) → FieldRow + plain content → OutlinerItem
 *
 * Skips config tuples (SYS_A* keys) which are handled by FieldList.
 * Same mixed field/content pattern as FieldValueOutliner.
 */
import { useMemo } from 'react';
import { useChildren } from '../../hooks/use-children';
import { useNodeStore } from '../../stores/node-store';
import { useNodeFields, type FieldEntry } from '../../hooks/use-node-fields';
import { OutlinerItem } from '../outliner/OutlinerItem';
import { TrailingInput } from '../editor/TrailingInput';
import { FieldRow } from './FieldRow';

interface ConfigOutlinerProps {
  nodeId: string;
}

export function ConfigOutliner({ nodeId }: ConfigOutlinerProps) {
  useChildren(nodeId);

  const allChildIds = useNodeStore((s) => s.entities[nodeId]?.children ?? []);
  const entities = useNodeStore((s) => s.entities);
  const ownerId = useNodeStore((s) => s.entities[nodeId]?.props._ownerId ?? '');

  // Detect fields on this node (includes config + template fields)
  const fields = useNodeFields(nodeId);

  // Build fieldMap for non-config fields only (template field tuples)
  const fieldMap = useMemo(() => {
    const m = new Map<string, FieldEntry>();
    for (const f of fields) {
      // Skip config fields — those are rendered by FieldList
      if (f.dataType.startsWith('__')) continue;
      m.set(f.tupleId, f);
    }
    return m;
  }, [fields]);

  // Classify children as field (FieldRow) or content (OutlinerItem)
  const visibleChildren = useMemo(() => {
    const result: { id: string; type: 'field' | 'content' }[] = [];
    for (const cid of allChildIds) {
      if (fieldMap.has(cid)) {
        result.push({ id: cid, type: 'field' });
      } else {
        const dt = entities[cid]?.props._docType;
        if (!dt) result.push({ id: cid, type: 'content' });
        // else skip: config tuples, metanode, associatedData, etc.
      }
    }
    return result;
  }, [allChildIds, fieldMap, entities]);

  const contentChildIds = useMemo(
    () => visibleChildren.filter((c) => c.type === 'content').map((c) => c.id),
    [visibleChildren],
  );

  // Prevent border stacking: when nested FieldRows are first/last, add padding
  // so their border-t/border-b doesn't visually coincide with the parent FieldRow's borders
  const firstIsField = visibleChildren.length > 0 && visibleChildren[0].type === 'field';
  const lastIsField = visibleChildren.length > 0 && visibleChildren[visibleChildren.length - 1].type === 'field';

  return (
    <div className={`min-h-[22px]${firstIsField ? ' pt-1' : ''}${lastIsField ? ' pb-1' : ''}`}>
      {visibleChildren.map(({ id, type }, i) =>
        type === 'field' ? (
          <div key={id} className="@container" style={{ paddingLeft: 6 + 15 + 4 }}>
            <FieldRow
              nodeId={nodeId}
              attrDefId={fieldMap.get(id)!.attrDefId}
              attrDefName={fieldMap.get(id)!.attrDefName}
              tupleId={id}
              valueNodeId={fieldMap.get(id)!.valueNodeId}
              valueName={fieldMap.get(id)!.valueName}
              dataType={fieldMap.get(id)!.dataType}
              assocDataId={fieldMap.get(id)!.assocDataId}
              isLastInGroup={i === visibleChildren.length - 1 || visibleChildren[i + 1].type !== 'field'}
              trashed={fieldMap.get(id)!.trashed}
            />
          </div>
        ) : (
          <OutlinerItem
            key={id}
            nodeId={id}
            depth={0}
            rootChildIds={contentChildIds}
            parentId={nodeId}
            rootNodeId={nodeId}
          />
        ),
      )}
      <TrailingInput
        parentId={nodeId}
        depth={0}
        parentExpandKey={`${ownerId}:${nodeId}`}
      />
    </div>
  );
}
