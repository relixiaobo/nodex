import type { NodeType } from '../../types/index.js';
import { SYS_V } from '../../types/index.js';
import type { FieldEntry } from '../../hooks/use-node-fields';

export type OutlinerRowType = 'field' | 'content';

export type OutlinerRowItem =
  | {
    id: string;
    type: 'field';
    hidden?: boolean;
    ownerTagDefId?: string;
    fieldEntry?: FieldEntry;
  }
  | {
    id: string;
    type: 'content';
    hidden?: boolean;
    ownerTagDefId?: string;
    fieldEntry?: FieldEntry;
  };

export function isHiddenFieldRow(hideMode: string | undefined, isEmpty: boolean | undefined): boolean {
  switch (hideMode) {
    case SYS_V.ALWAYS:
      return true;
    case SYS_V.WHEN_EMPTY:
      return !!isEmpty;
    case SYS_V.WHEN_NOT_EMPTY:
      return !isEmpty;
    default:
      return false;
  }
}

export function buildFieldOwnerColors(
  fieldMap: Map<string, Pick<FieldEntry, 'fieldDefId' | 'templateId'>>,
  getFieldDefOwnerId: (fieldDefId: string) => string | null,
  getNodeType: (nodeId: string) => string | undefined,
  resolveOwnerColor: (ownerTagDefId: string) => string,
): Map<string, string> {
  const result = new Map<string, string>();
  for (const [entryId, entry] of fieldMap) {
    const ownerLookupIds = [entry.fieldDefId];
    if (entry.templateId && entry.templateId !== entry.fieldDefId) {
      ownerLookupIds.unshift(entry.templateId);
    }
    let ownerTagDefId: string | null = null;
    for (const lookupId of ownerLookupIds) {
      const ownerId = getFieldDefOwnerId(lookupId);
      if (!ownerId) continue;
      if (getNodeType(ownerId) !== 'tagDef') continue;
      ownerTagDefId = ownerId;
      break;
    }
    if (!ownerTagDefId) continue;
    result.set(entryId, resolveOwnerColor(ownerTagDefId));
  }
  return result;
}

export function buildVisibleChildrenRows(params: {
  allChildIds: string[];
  fieldMap: Map<string, Pick<FieldEntry, 'fieldDefId' | 'templateId' | 'hideMode' | 'isEmpty'>>;
  tagIds: string[];
  getFieldDefOwnerId: (fieldDefId: string) => string | null;
  getNodeType: (nodeId: string) => string | undefined;
  getChildNodeType: (childId: string) => NodeType | undefined;
  isOutlinerContentType: (nodeType: NodeType | undefined) => boolean;
}): OutlinerRowItem[] {
  const {
    allChildIds,
    fieldMap,
    tagIds,
    getFieldDefOwnerId,
    getNodeType,
    getChildNodeType,
    isOutlinerContentType,
  } = params;

  const tagIdSet = new Set(tagIds);
  const templateFieldsByTagDef = new Map<string, OutlinerRowItem[]>();
  const remainingItems: OutlinerRowItem[] = [];

  for (const cid of allChildIds) {
    const fieldEntry = fieldMap.get(cid);
    if (fieldEntry) {
      const child: OutlinerRowItem = {
        id: cid,
        type: 'field',
        hidden: isHiddenFieldRow(fieldEntry.hideMode, fieldEntry.isEmpty),
      };
      const ownerTagDefId = fieldEntry.templateId
        ? getFieldDefOwnerId(fieldEntry.templateId)
        : getFieldDefOwnerId(fieldEntry.fieldDefId);
      const isTemplateField = !!fieldEntry.templateId
        && ownerTagDefId !== null
        && getNodeType(ownerTagDefId) === 'tagDef'
        && tagIdSet.has(ownerTagDefId);
      if (isTemplateField && ownerTagDefId) {
        let bucket = templateFieldsByTagDef.get(ownerTagDefId);
        if (!bucket) {
          bucket = [];
          templateFieldsByTagDef.set(ownerTagDefId, bucket);
        }
        bucket.push(child);
      } else {
        remainingItems.push(child);
      }
      continue;
    }

    const childType = getChildNodeType(cid);
    if (isOutlinerContentType(childType)) {
      remainingItems.push({ id: cid, type: 'content' });
    }
  }

  const result: OutlinerRowItem[] = [];
  for (const tagId of tagIds) {
    const bucket = templateFieldsByTagDef.get(tagId);
    if (bucket) result.push(...bucket);
  }
  result.push(...remainingItems);
  return result;
}

export function shouldShowTrailingInput(
  items: Array<{ type: OutlinerRowType }>,
): boolean {
  if (items.length === 0) return true;
  return items[items.length - 1]?.type === 'field';
}

export function getDragSelectableRowIds(
  rows: OutlinerRowItem[],
  isFieldRevealed: (fieldEntryId: string) => boolean,
): string[] {
  return rows
    .filter((row) => !row.hidden || isFieldRevealed(row.id))
    .map((row) => row.id);
}
