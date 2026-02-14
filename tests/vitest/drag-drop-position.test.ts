import { resolveDropHoverPosition } from '../../src/lib/drag-drop-position.js';

describe('drag drop hover position resolver', () => {
  it('returns before inside after by vertical third zones', () => {
    expect(resolveDropHoverPosition({ offsetY: 0, rowHeight: 30 })).toBe('before');
    expect(resolveDropHoverPosition({ offsetY: 5, rowHeight: 30 })).toBe('before');

    expect(resolveDropHoverPosition({ offsetY: 10, rowHeight: 30 })).toBe('inside');
    expect(resolveDropHoverPosition({ offsetY: 20, rowHeight: 30 })).toBe('inside');

    expect(resolveDropHoverPosition({ offsetY: 25, rowHeight: 30 })).toBe('after');
    expect(resolveDropHoverPosition({ offsetY: 29, rowHeight: 30 })).toBe('after');
  });

  it('treats exact 1/3 and 2/3 boundaries as inside', () => {
    expect(resolveDropHoverPosition({ offsetY: 10, rowHeight: 30 })).toBe('inside');
    expect(resolveDropHoverPosition({ offsetY: 20, rowHeight: 30 })).toBe('inside');
  });

  it('falls back to inside for invalid row height', () => {
    expect(resolveDropHoverPosition({ offsetY: 0, rowHeight: 0 })).toBe('inside');
    expect(resolveDropHoverPosition({ offsetY: 3, rowHeight: -1 })).toBe('inside');
  });
});
