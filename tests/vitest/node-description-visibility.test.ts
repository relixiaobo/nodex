import { describe, expect, it } from 'vitest';
import { shouldRenderNodeDescription } from '../../src/lib/node-description-visibility.js';
import { SYS_T } from '../../src/types/index.js';

describe('node description visibility', () => {
  it('renders when a node has description text', () => {
    expect(shouldRenderNodeDescription({
      description: 'User-facing description',
      editing: false,
      tags: [],
    })).toBe(true);
  });

  it('renders for #highlight nodes when they have description text', () => {
    expect(shouldRenderNodeDescription({
      description: 'Highlight note',
      editing: false,
      tags: [SYS_T.HIGHLIGHT],
    })).toBe(true);
  });

  it('renders while editing even when the description is empty', () => {
    expect(shouldRenderNodeDescription({
      description: '',
      editing: true,
      tags: [],
    })).toBe(true);
  });

  it('stays hidden only when empty and not editing', () => {
    expect(shouldRenderNodeDescription({
      description: '',
      editing: false,
      tags: [SYS_T.HIGHLIGHT],
    })).toBe(false);
  });
});
