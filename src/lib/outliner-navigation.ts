/**
 * Shared navigation utility for onNavigateOut callbacks in outliner containers.
 *
 * All three containers (OutlinerView, ConfigOutliner, FieldValueOutliner)
 * use the same pattern: walk siblings from current index, focus the next
 * visible field or content row, or escape to the parent.
 */

export interface NavigableRow {
  id: string;
  type: 'field' | 'content';
  hidden?: boolean;
}

/**
 * Navigate from a row at `currentIndex` in the given `rows` list to the next
 * visible sibling in the specified direction.
 *
 * @returns true if a sibling was found and focused, false if navigation escaped.
 */
export function navigateToSiblingRow(params: {
  rows: readonly NavigableRow[];
  currentIndex: number;
  direction: 'up' | 'down';
  parentId: string;
  /** Focus a field row by entering its name editor */
  onField: (fieldId: string) => void;
  /** Focus a content row at a text offset */
  onContent: (nodeId: string, parentId: string, textOffset: number) => void;
  /** Called when no sibling is found in the given direction */
  onEscape?: (direction: 'up' | 'down') => void;
}): boolean {
  const { rows, currentIndex, direction, parentId, onField, onContent, onEscape } = params;

  if (direction === 'up') {
    for (let j = currentIndex - 1; j >= 0; j--) {
      const prev = rows[j];
      if (prev.hidden) continue;
      if (prev.type === 'field') {
        onField(prev.id);
        return true;
      }
      // Navigate up → place cursor at end of text
      onContent(prev.id, parentId, Infinity);
      return true;
    }
  } else {
    for (let j = currentIndex + 1; j < rows.length; j++) {
      const next = rows[j];
      if (next.hidden) continue;
      if (next.type === 'field') {
        onField(next.id);
        return true;
      }
      // Navigate down → place cursor at start of text
      onContent(next.id, parentId, 0);
      return true;
    }
  }

  onEscape?.(direction);
  return false;
}
