import { describe, expect, it } from 'vitest';
import { shouldRenderReferenceBulletStyle } from '../../src/components/outliner/OutlinerItem.js';

describe('OutlinerItem reference bullet style', () => {
  it('shows dashed bullet for real reference rows', () => {
    expect(shouldRenderReferenceBulletStyle({
      isReference: true,
      isPendingConversion: false,
      isOptionsValueNode: false,
    })).toBe(true);
  });

  it('shows dashed bullet while pending ref conversion row is active', () => {
    expect(shouldRenderReferenceBulletStyle({
      isReference: false,
      isPendingConversion: true,
      isOptionsValueNode: false,
    })).toBe(true);
  });

  it('does not treat inline reference content rows as reference bullets', () => {
    expect(shouldRenderReferenceBulletStyle({
      isReference: false,
      isPendingConversion: false,
      isOptionsValueNode: false,
    })).toBe(false);
  });
});
