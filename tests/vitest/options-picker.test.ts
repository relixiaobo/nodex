import { describe, expect, it } from 'vitest';
import { isAutoCollectCreationEnabled, resolveSelectedOptionId } from '../../src/components/fields/OptionsPicker.js';

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

describe('resolveSelectedOptionId', () => {
  const options = [
    { id: 'opt_chat', name: 'Chat' },
    { id: 'opt_today', name: 'Today' },
  ];

  it('prefers targetId when the value node already references an option node', () => {
    expect(resolveSelectedOptionId({ targetId: 'opt_today' } as never, options)).toBe('opt_today');
  });

  it('falls back to matching a legacy plain-text value by option label', () => {
    expect(resolveSelectedOptionId({ name: 'Today' } as never, options)).toBe('opt_today');
  });

  it('falls back to matching a legacy plain-text value by option id', () => {
    expect(resolveSelectedOptionId({ name: 'opt_chat' } as never, options)).toBe('opt_chat');
  });
});
