/**
 * Mini outliner for definition node config pages.
 *
 * Renders non-config children of a definition node:
 * - For attrDef: plain content nodes (pre-determined options) → OutlinerItem
 * - For tagDef: field tuples (template fields) → FieldRow + plain content → OutlinerItem
 *
 * For tagDef with Extend (inheritance): merges inherited template items from
 * ancestor tagDefs. Each item's bullet/icon is tinted with its owning tagDef's color.
 *
 * Skips config tuples (SYS_A* keys) which are handled by FieldList.
 * Same mixed field/content pattern as FieldValueOutliner.
 */
import { useMemo, useEffect } from 'react';
import { useChildren } from '../../hooks/use-children';
import { useNodeStore } from '../../stores/node-store';
import { useNodeFields, type FieldEntry } from '../../hooks/use-node-fields';
import { resolveDataType, getExtendsChain } from '../../lib/field-utils.js';
import { getTagColor } from '../../lib/tag-colors.js';
import { OutlinerItem } from '../outliner/OutlinerItem';
import { TrailingInput } from '../editor/TrailingInput';
import { FieldRow } from './FieldRow';

interface ConfigOutlinerProps {
  nodeId: string;
}

interface MergedItem {
  id: string;
  type: 'field' | 'content';
  ownerTagDefId: string;
  /** For fields: resolved FieldEntry data */
  fieldEntry?: FieldEntry;
}

export function ConfigOutliner({ nodeId }: ConfigOutlinerProps) {
  useChildren(nodeId);

  const entities = useNodeStore((s) => s.entities);
  const fetchChildren = useNodeStore((s) => s.fetchChildren);
  const ownerId = useNodeStore((s) => s.entities[nodeId]?.props._ownerId ?? '');
  const isTagDef = useNodeStore((s) => s.entities[nodeId]?.props._docType === 'tagDef');

  // For tagDef: get Extend chain (ancestor tagDef IDs)
  const extendsChain = useMemo(
    () => (isTagDef ? getExtendsChain(entities, nodeId) : []),
    [isTagDef, entities, nodeId],
  );

  // Ensure ancestor tagDef children are loaded
  useEffect(() => {
    for (const ancestorId of extendsChain) {
      const ancestor = entities[ancestorId];
      if (ancestor?.children?.some((cid) => !entities[cid])) {
        fetchChildren(ancestorId);
      }
    }
  }, [extendsChain, entities, fetchChildren]);

  // Detect fields on THIS node (includes config + template fields)
  const fields = useNodeFields(nodeId);

  // Build fieldMap for non-config fields only (template field tuples on current node)
  const fieldMap = useMemo(() => {
    const m = new Map<string, FieldEntry>();
    for (const f of fields) {
      // Skip config fields — those are rendered by FieldList
      if (f.dataType.startsWith('__')) continue;
      m.set(f.tupleId, f);
    }
    return m;
  }, [fields]);

  // Build merged items: [inherited from ancestors..., own items]
  const mergedItems = useMemo(() => {
    const items: MergedItem[] = [];

    // 1. Inherited items from ancestor tagDefs (in ancestor-first order)
    for (const ancestorId of extendsChain) {
      const ancestor = entities[ancestorId];
      if (!ancestor?.children) continue;

      for (const cid of ancestor.children) {
        const child = entities[cid];
        if (!child) continue;

        // Field tuples: _docType=tuple with attrDef key
        if (child.props._docType === 'tuple' && child.children?.length) {
          const keyId = child.children[0];
          // Skip config tuples (SYS_A*, NDX_A*)
          if (keyId.startsWith('SYS_') || keyId.startsWith('NDX_')) continue;

          const attrDef = entities[keyId];
          if (!attrDef || attrDef.props._docType !== 'attrDef') continue;

          items.push({
            id: cid,
            type: 'field',
            ownerTagDefId: ancestorId,
            fieldEntry: {
              attrDefId: keyId,
              attrDefName: attrDef.props.name ?? 'Untitled',
              tupleId: cid,
              dataType: resolveDataType(entities, keyId),
            },
          });
        } else if (!child.props._docType) {
          // Content node (regular template content)
          items.push({
            id: cid,
            type: 'content',
            ownerTagDefId: ancestorId,
          });
        }
      }
    }

    // 2. Own items from current tagDef
    const node = entities[nodeId];
    const allChildIds = node?.children ?? [];
    for (const cid of allChildIds) {
      if (fieldMap.has(cid)) {
        items.push({
          id: cid,
          type: 'field',
          ownerTagDefId: nodeId,
          fieldEntry: fieldMap.get(cid)!,
        });
      } else {
        const dt = entities[cid]?.props._docType;
        if (!dt) {
          items.push({
            id: cid,
            type: 'content',
            ownerTagDefId: nodeId,
          });
        }
        // else skip: config tuples, metanode, associatedData, etc.
      }
    }

    return items;
  }, [entities, extendsChain, nodeId, fieldMap]);

  // Collect content child IDs (for OutlinerItem rootChildIds — own items only)
  const contentChildIds = useMemo(
    () => mergedItems.filter((c) => c.type === 'content' && c.ownerTagDefId === nodeId).map((c) => c.id),
    [mergedItems, nodeId],
  );

  // Prevent border stacking: when nested FieldRows are first/last, add padding
  const firstIsField = mergedItems.length > 0 && mergedItems[0].type === 'field';
  const lastIsField = mergedItems.length > 0 && mergedItems[mergedItems.length - 1].type === 'field';

  return (
    <div className={`min-h-[22px]${firstIsField ? ' pt-1' : ''}${lastIsField ? ' pb-1' : ''}`}>
      {mergedItems.map(({ id, type, ownerTagDefId, fieldEntry }, i) => {
        // Color from owning tagDef (only for tagDef config pages with extends)
        const ownerColor = extendsChain.length > 0 ? getTagColor(ownerTagDefId).text : undefined;

        return type === 'field' && fieldEntry ? (
          <div key={id} className="@container" style={{ paddingLeft: 6 + 15 + 4 }}>
            <FieldRow
              nodeId={ownerTagDefId}
              attrDefId={fieldEntry.attrDefId}
              attrDefName={fieldEntry.attrDefName}
              tupleId={id}
              valueNodeId={fieldEntry.valueNodeId}
              valueName={fieldEntry.valueName}
              dataType={fieldEntry.dataType}
              assocDataId={fieldEntry.assocDataId}
              isLastInGroup={i === mergedItems.length - 1 || mergedItems[i + 1].type !== 'field'}
              trashed={fieldEntry.trashed}
              ownerTagColor={ownerColor}
            />
          </div>
        ) : (
          <OutlinerItem
            key={id}
            nodeId={id}
            depth={0}
            rootChildIds={contentChildIds}
            parentId={ownerTagDefId}
            rootNodeId={nodeId}
            bulletColor={ownerColor}
          />
        );
      })}
      <TrailingInput
        parentId={nodeId}
        depth={0}
        parentExpandKey={`${ownerId}:${nodeId}`}
      />
    </div>
  );
}
