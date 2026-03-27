import { describe, expect, it } from 'vitest';
import { shouldSuppressStaleDisplayRow } from '../../src/components/outliner/OutlinerItem.js';

describe('OutlinerItem stale display row suppression', () => {
  it('suppresses a moved content node that is still rendered under its old parent', () => {
    expect(shouldSuppressStaleDisplayRow({
      parentId: 'old_parent',
      nodeExists: true,
      isReferenceNode: false,
      actualParentId: 'new_parent',
    })).toBe(true);
  });

  it('keeps the row visible when the node still belongs to this parent', () => {
    expect(shouldSuppressStaleDisplayRow({
      parentId: 'display_parent',
      nodeExists: true,
      isReferenceNode: false,
      actualParentId: 'display_parent',
    })).toBe(false);
  });

  it('never suppresses real reference nodes', () => {
    expect(shouldSuppressStaleDisplayRow({
      parentId: 'display_parent',
      nodeExists: true,
      isReferenceNode: true,
      actualParentId: 'other_parent',
    })).toBe(false);
  });
});
