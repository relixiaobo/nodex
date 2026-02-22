import { describe, expect, it } from 'vitest';
import { canNavigateToTagNode } from '../../src/components/tags/TagBadge.js';

describe('TagBadge navigation guard', () => {
  it('disables navigation when tag has no backing node (e.g. sys:day)', () => {
    expect(canNavigateToTagNode(false)).toBe(false);
  });

  it('allows navigation for tagDefs with backing nodes', () => {
    expect(canNavigateToTagNode(true)).toBe(true);
  });
});
