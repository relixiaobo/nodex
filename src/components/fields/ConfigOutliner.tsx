/**
 * Mini outliner for definition node config pages.
 *
 * Renders non-config children of a definition node:
 * - For attrDef: plain content nodes (pre-determined options) → OutlinerItem
 * - For tagDef: field entries (template fields) → FieldRow + plain content → OutlinerItem
 *
 * For tagDef with Extend (inheritance): merges inherited template items from
 * ancestor tagDefs. Each item's bullet/icon is tinted with its owning tagDef's color.
 *
 * Skips config field entries (SYS_A* keys) which are handled by FieldList.
 * Same mixed field/content pattern as FieldValueOutliner.
 */
import { useCallback, useMemo, useRef } from 'react';
import { useChildren } from '../../hooks/use-children';
import { useNodeStore } from '../../stores/node-store';
import { useUIStore } from '../../stores/ui-store';
import { useDragSelect } from '../../hooks/use-drag-select.js';
import { useNodeFields, type FieldEntry } from '../../hooks/use-node-fields';
import { resolveDataType, getExtendsChain } from '../../lib/field-utils.js';
import { resolveTagColor } from '../../lib/tag-colors.js';
import { OutlinerItem } from '../outliner/OutlinerItem';
import { RowHost } from '../outliner/RowHost.js';
import { TrailingInput } from '../editor/TrailingInput';
import { FieldRow } from './FieldRow';
import { toFieldRowEntryProps } from './field-row-props.js';
import * as loroDoc from '../../lib/loro-doc.js';
import { shouldShowTrailingInput } from '../outliner/row-model.js';
import { navigateToSiblingRow } from '../../lib/outliner-navigation.js';
import { canCreateChildrenUnder } from '../../lib/node-capabilities.js';

interface ConfigOutlinerProps {
  nodeId: string;
  panelId?: string;
  onNavigateOut?: (direction: 'up' | 'down') => void;
}

type MergedItem =
  | {
    id: string;
    type: 'field';
    hidden?: boolean;
    ownerTagDefId: string;
    /** For fields: resolved FieldEntry data */
    fieldEntry: FieldEntry;
  }
  | {
    id: string;
    type: 'content';
    hidden?: boolean;
    ownerTagDefId: string;
    fieldEntry?: undefined;
  };

export function shouldShowConfigTrailingInput(
  items: Array<{ type: 'field' | 'content' }>,
): boolean {
  return shouldShowTrailingInput(items);
}

export function ConfigOutliner({ nodeId, panelId = 'main', onNavigateOut }: ConfigOutlinerProps) {
  useChildren(nodeId);

  const _version = useNodeStore((s) => s._version);
  const ownerId = loroDoc.getParentId(nodeId) ?? '';
  const isTagDef = useNodeStore((s) => { void s._version; return s.getNode(nodeId)?.type === 'tagDef'; });
  const canCreateConfigChildren = useNodeStore((s) => {
    void s._version;
    return canCreateChildrenUnder(nodeId);
  });

  // For tagDef: get Extend chain (ancestor tagDef IDs)
  const extendsChain = useMemo(
    () => (isTagDef ? getExtendsChain(nodeId) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isTagDef, _version, nodeId],
  );

  // Detect fields on THIS node (includes config + template fields)
  const fields = useNodeFields(nodeId);

  // Build fieldMap for non-config fields only (template field entries on current node)
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
          if (keyId.startsWith('SYS_') || keyId.startsWith('NDX_A')) continue;

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
        const childNode = getNode(cid);
        const nodeType = childNode?.type;
        // Include plain content nodes AND fieldDef children (template fields in new Loro model)
        // Exclude auto-collected option nodes (shown in AutoCollectSection instead)
        if ((!nodeType || nodeType === 'fieldDef') && !childNode?.autoCollected) {
          items.push({
            id: cid,
            type: 'content',
            ownerTagDefId: nodeId,
          });
        }
        // else skip: fieldEntry config items, reference, autoCollected, etc.
      }
    }

    return items;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_version, extendsChain, nodeId, fieldMap]);

  // Unified selectable rows for range/multi-selection.
  const selectableRootIds = useMemo(
    () => mergedItems.map((c) => c.id),
    [mergedItems],
  );

  // Drag select: document-level mouse tracking for multi-node selection
  const containerRef = useRef<HTMLDivElement>(null);
  useDragSelect({ containerRef, rootChildIds: selectableRootIds, rootNodeId: nodeId });

  const setFocusedNode = useUIStore((s) => s.setFocusedNode);
  const clearFocus = useUIStore((s) => s.clearFocus);
  const setEditingFieldName = useUIStore((s) => s.setEditingFieldName);

  // Prevent border stacking: when nested FieldRows are first/last, add padding
  const firstIsField = mergedItems.length > 0 && mergedItems[0].type === 'field';
  const lastIsField = mergedItems.length > 0 && mergedItems[mergedItems.length - 1].type === 'field';
  const showTrailingInput = canCreateConfigChildren && shouldShowConfigTrailingInput(mergedItems);

  const navToField = useCallback((fieldId: string) => {
    clearFocus();
    setEditingFieldName(fieldId);
  }, [clearFocus, setEditingFieldName]);

  const navToContent = useCallback((id: string, parentId: string) => {
    setFocusedNode(id, parentId);
  }, [setFocusedNode]);

  const handleTrailingNavigateOut = useCallback((direction: 'up' | 'down') => {
    // TrailingInput is conceptually at index = mergedItems.length
    navigateToSiblingRow({
      rows: mergedItems,
      currentIndex: mergedItems.length,
      direction,
      parentId: nodeId,
      onField: navToField,
      onContent: navToContent,
      onEscape: onNavigateOut,
    });
  }, [mergedItems, nodeId, navToField, navToContent, onNavigateOut]);

  return (
    <div ref={containerRef} className={`min-h-[22px]${firstIsField ? ' pt-1' : ''}${lastIsField ? ' pb-1' : ''}`}>
      <RowHost
        rows={mergedItems}
        renderField={(row, i, rows) => {
          const ownerColor = resolveTagColor(row.ownerTagDefId).text;
          if (!row.fieldEntry) return null;
          return (
            <div className="@container" style={{ paddingLeft: 6 + 15 + 4 }}>
              <FieldRow
                nodeId={row.ownerTagDefId}
                {...toFieldRowEntryProps(row.fieldEntry)}
                rootChildIds={selectableRootIds}
                rootNodeId={nodeId}
                isLastInGroup={i === rows.length - 1 || rows[i + 1].type !== 'field'}
                ownerTagColor={ownerColor}
                onNavigateOut={(direction) => navigateToSiblingRow({
                  rows,
                  currentIndex: i,
                  direction,
                  parentId: nodeId,
                  onField: navToField,
                  onContent: navToContent,
                  onEscape: onNavigateOut,
                })}
              />
            </div>
          );
        }}
        renderContent={(row) => {
          // Only tint bullets for inherited items in tagDef configs (visual ancestry indicator).
          // attrDef content (pre-determined options) should use default bullet color.
          const isInherited = isTagDef && row.ownerTagDefId !== nodeId;
          const ownerColor = isInherited ? resolveTagColor(row.ownerTagDefId).text : undefined;
          return (
            <OutlinerItem
              nodeId={row.id}
              depth={0}
              panelId={panelId}
              rootChildIds={selectableRootIds}
              parentId={nodeId}
              rootNodeId={nodeId}
              bulletColors={ownerColor ? [ownerColor] : undefined}
              onNavigateOut={onNavigateOut}
            />
          );
        }}
      />
      {showTrailingInput && (
        <TrailingInput
          parentId={nodeId}
          depth={0}
          panelId={panelId}
          parentExpandKey={`${panelId}:${ownerId}:${nodeId}`}
          onNavigateOut={handleTrailingNavigateOut}
        />
      )}
    </div>
  );
}
