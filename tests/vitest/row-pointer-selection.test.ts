import { describe, expect, it } from 'vitest';
import { resolveRowPointerSelectAction } from '../../src/lib/row-pointer-selection.js';

describe('resolveRowPointerSelectAction', () => {
  it('prioritizes modifier-based selection actions', () => {
    expect(resolveRowPointerSelectAction({
      justDragged: false,
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
      allowSingle: false,
    })).toBe('toggle');

    expect(resolveRowPointerSelectAction({
      justDragged: false,
      metaKey: false,
      ctrlKey: false,
      shiftKey: true,
      allowSingle: false,
    })).toBe('range');
  });

  it('returns single only when explicitly allowed', () => {
    expect(resolveRowPointerSelectAction({
      justDragged: false,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      allowSingle: true,
    })).toBe('single');

    expect(resolveRowPointerSelectAction({
      justDragged: false,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      allowSingle: false,
    })).toBe(null);
  });

  it('suppresses selection after drag or while editing', () => {
    expect(resolveRowPointerSelectAction({
      justDragged: true,
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
      allowSingle: true,
    })).toBe(null);

    expect(resolveRowPointerSelectAction({
      justDragged: false,
      isEditing: true,
      metaKey: false,
      ctrlKey: false,
      shiftKey: true,
      allowSingle: true,
    })).toBe(null);
  });
});
