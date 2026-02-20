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
import { useMemo } from 'react';
import { useChildren } from '../../hooks/use-children';
import { useNodeStore } from '../../stores/node-store';
import { useNodeFields, type FieldEntry } from '../../hooks/use-node-fields';
import { resolveDataType, getExtendsChain } from '../../lib/field-utils.js';
import { resolveTagColor } from '../../lib/tag-colors.js';
import { OutlinerItem } from '../outliner/OutlinerItem';
import { TrailingInput } from '../editor/TrailingInput';
import { FieldRow } from './FieldRow';
import * as loroDoc from '../../lib/loro-doc.js';

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

export function shouldShowConfigTrailingInput(
  items: Array<{ type: 'field' | 'content' }>,
): boolean {
  if (items.length === 0) return true;
  return items[items.length - 1]?.type === 'field';
}

export function ConfigOutliner({ nodeId }: ConfigOutlinerProps) {
  useChildren(nodeId);

  const _version = useNodeStore((s) => s._version);
  const ownerId = loroDoc.getParentId(nodeId) ?? '';
  const isTagDef = useNodeStore((s) => { void s._version; return s.getNode(nodeId)?.type === 'tagDef'; });

  // For tagDef: get Extend chain (ancestor tagDef IDs)
  const extendsChain = useMemo(
    () => (isTagDef ? getExtendsChain(nodeId) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isTagDef, _version, nodeId],
  );

  // Detect fields on THIS node (includes config + template fields)
  const fields = useNodeFields(nodeId);

  // Build fieldMap for non-config fields only (template field tuples on current node)
  const fieldMap = useMemo(() => {
    const m = new Map<string, FieldEntry>();
    for (const f of fields) {
      // Skip config fields — those are rendered by FieldList
      if (f.isSystemConfig) continue;
      m.set(f.fieldEntryId, f);
    }
    return m;
  }, [fields]);

  // Build merged items: [inherited from ancestors..., own items]
  const mergedItems = useMemo(() => {
    const items: MergedItem[] = [];
    const getNode = useNodeStore.getState().getNode;

    // 1. Inherited items from ancestor tagDefs (in ancestor-first order)
    for (const ancestorId of extendsChain) {
      const ancestor = getNode(ancestorId);
      if (!ancestor?.children) continue;

      for (const cid of ancestor.children) {
        const child = getNode(cid);
        if (!child) continue;

        // Field entries: type='fieldEntry' with fieldDefId
        if (child.type === 'fieldEntry' && child.fieldDefId) {
          const keyId = child.fieldDefId;
          // Skip config fields (SYS_A*, NDX_A*)
          if (keyId.startsWith('SYS_') || keyId.startsWith('NDX_')) continue;

          const fieldDef = getNode(keyId);
          if (!fieldDef || fieldDef.type !== 'fieldDef') continue;

          items.push({
            id: cid,
            type: 'field',
            ownerTagDefId: ancestorId,
            fieldEntry: {
              fieldDefId: keyId,
              attrDefName: fieldDef.name ?? 'Untitled',
              fieldEntryId: cid,
              dataType: resolveDataType(keyId),
            },
          });
        } else if (!child.type) {
          // Content node (regular template content)
          items.push({
            id: cid,
            type: 'content',
            ownerTagDefId: ancestorId,
          });
        }
      }
    }

    // 2. Own items from current node
    const node = getNode(nodeId);
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
        const nodeType = getNode(cid)?.type;
        // Include plain content nodes AND fieldDef children (template fields in new Loro model)
        if (!nodeType || nodeType === 'fieldDef') {
          items.push({
            id: cid,
            type: 'content',
            ownerTagDefId: nodeId,
          });
        }
        // else skip: fieldEntry config items, reference, etc.
      }
    }

    return items;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_version, extendsChain, nodeId, fieldMap]);

  // Collect content child IDs (for OutlinerItem rootChildIds — own items only)
  const contentChildIds = useMemo(
    () => mergedItems.filter((c) => c.type === 'content' && c.ownerTagDefId === nodeId).map((c) => c.id),
    [mergedItems, nodeId],
  );

  // Prevent border stacking: when nested FieldRows are first/last, add padding
  const firstIsField = mergedItems.length > 0 && mergedItems[0].type === 'field';
  const lastIsField = mergedItems.length > 0 && mergedItems[mergedItems.length - 1].type === 'field';
  const showTrailingInput = shouldShowConfigTrailingInput(mergedItems);

  return (
    <div className={`min-h-[22px]${firstIsField ? ' pt-1' : ''}${lastIsField ? ' pb-1' : ''}`}>
      {mergedItems.map(({ id, type, ownerTagDefId, fieldEntry }, i) => {
        // Color from owning tagDef (only for tagDef config pages with extends)
        const ownerColor = extendsChain.length > 0 ? resolveTagColor(ownerTagDefId).text : undefined;

        return type === 'field' && fieldEntry ? (
          <div key={id} className="@container" style={{ paddingLeft: 6 + 15 + 4 }}>
            <FieldRow
              nodeId={ownerTagDefId}
              attrDefId={fieldEntry.fieldDefId}
              attrDefName={fieldEntry.attrDefName}
              tupleId={id}
              valueNodeId={fieldEntry.valueNodeId}
              valueName={fieldEntry.valueName}
              dataType={fieldEntry.dataType}
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
      {showTrailingInput && (
        <TrailingInput
          parentId={nodeId}
          depth={0}
          parentExpandKey={`${ownerId}:${nodeId}`}
        />
      )}
    </div>
  );
}
