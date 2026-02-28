import { describe, it, expect, vi } from 'vitest';
import { navigateToSiblingRow, type NavigableRow } from '../../src/lib/outliner-navigation.js';

const rows: NavigableRow[] = [
  { id: 'field-1', type: 'field' },
  { id: 'content-1', type: 'content' },
  { id: 'field-2', type: 'field' },
  { id: 'content-2', type: 'content' },
];

describe('navigateToSiblingRow', () => {
  it('navigates up from content to previous field', () => {
    const onField = vi.fn();
    const onContent = vi.fn();
    const result = navigateToSiblingRow({
      rows,
      currentIndex: 1, // content-1
      direction: 'up',
      parentId: 'parent',
      onField,
      onContent,
    });
    expect(result).toBe(true);
    expect(onField).toHaveBeenCalledWith('field-1');
    expect(onContent).not.toHaveBeenCalled();
  });

  it('navigates down from field to next content', () => {
    const onField = vi.fn();
    const onContent = vi.fn();
    const result = navigateToSiblingRow({
      rows,
      currentIndex: 0, // field-1
      direction: 'down',
      parentId: 'parent',
      onField,
      onContent,
    });
    expect(result).toBe(true);
    expect(onContent).toHaveBeenCalledWith('content-1', 'parent', 0);
    expect(onField).not.toHaveBeenCalled();
  });

  it('navigates up from content to previous content with Infinity offset', () => {
    const onField = vi.fn();
    const onContent = vi.fn();
    const result = navigateToSiblingRow({
      rows,
      currentIndex: 3, // content-2
      direction: 'up',
      parentId: 'parent',
      onField,
      onContent,
    });
    expect(result).toBe(true);
    expect(onField).toHaveBeenCalledWith('field-2');
  });

  it('calls onEscape when no sibling in direction', () => {
    const onField = vi.fn();
    const onContent = vi.fn();
    const onEscape = vi.fn();
    const result = navigateToSiblingRow({
      rows,
      currentIndex: 0, // field-1
      direction: 'up',
      parentId: 'parent',
      onField,
      onContent,
      onEscape,
    });
    expect(result).toBe(false);
    expect(onEscape).toHaveBeenCalledWith('up');
    expect(onField).not.toHaveBeenCalled();
    expect(onContent).not.toHaveBeenCalled();
  });

  it('calls onEscape when navigating down past last row', () => {
    const onField = vi.fn();
    const onContent = vi.fn();
    const onEscape = vi.fn();
    const result = navigateToSiblingRow({
      rows,
      currentIndex: 3, // content-2
      direction: 'down',
      parentId: 'parent',
      onField,
      onContent,
      onEscape,
    });
    expect(result).toBe(false);
    expect(onEscape).toHaveBeenCalledWith('down');
  });

  it('skips hidden rows', () => {
    const rowsWithHidden: NavigableRow[] = [
      { id: 'field-1', type: 'field' },
      { id: 'hidden-content', type: 'content', hidden: true },
      { id: 'content-1', type: 'content' },
    ];
    const onField = vi.fn();
    const onContent = vi.fn();
    const result = navigateToSiblingRow({
      rows: rowsWithHidden,
      currentIndex: 0, // field-1
      direction: 'down',
      parentId: 'parent',
      onField,
      onContent,
    });
    expect(result).toBe(true);
    expect(onContent).toHaveBeenCalledWith('content-1', 'parent', 0);
  });

  it('returns false without onEscape when hitting boundary', () => {
    const onField = vi.fn();
    const onContent = vi.fn();
    const result = navigateToSiblingRow({
      rows,
      currentIndex: 0,
      direction: 'up',
      parentId: 'parent',
      onField,
      onContent,
      // no onEscape
    });
    expect(result).toBe(false);
    expect(onField).not.toHaveBeenCalled();
    expect(onContent).not.toHaveBeenCalled();
  });
});
