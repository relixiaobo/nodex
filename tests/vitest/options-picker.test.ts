import { describe, expect, it } from 'vitest';
import { isAutoCollectCreationEnabled } from '../../src/components/fields/OptionsPicker.js';

describe('isAutoCollectCreationEnabled', () => {
  it('defaults to enabled when config is unset', () => {
    expect(isAutoCollectCreationEnabled(undefined)).toBe(true);
    expect(isAutoCollectCreationEnabled(null)).toBe(true);
    expect(isAutoCollectCreationEnabled({} as never)).toBe(true);
  });

  it('returns false only when autocollectOptions is explicitly false', () => {
    expect(isAutoCollectCreationEnabled({ autocollectOptions: false } as never)).toBe(false);
    expect(isAutoCollectCreationEnabled({ autocollectOptions: true } as never)).toBe(true);
  });
});
