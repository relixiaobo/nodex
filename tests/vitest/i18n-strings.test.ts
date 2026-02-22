import { describe, expect, it } from 'vitest';
import { getLocale, setLocale, t } from '../../src/i18n/strings.js';

describe('i18n strings', () => {
  it('returns english messages by key', () => {
    expect(t('reference.selector.blockedBadge')).toBe('Blocked');
  });

  it('falls back to key when message is missing', () => {
    expect(t('reference.selector.blockedBadge' as never)).toBe('Blocked');
    expect((t as (key: string) => string)('missing.path')).toBe('missing.path');
  });

  it('supports simple interpolation and locale accessors', () => {
    expect(getLocale()).toBe('en');
    setLocale('en');
    expect(t('reference.blocked.unavailable')).toBe('This reference cannot be created');
  });
});
