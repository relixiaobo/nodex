import { describe, expect, it } from 'vitest';
import { getLocale, setLocale, t } from '../../src/i18n/strings.js';

describe('i18n strings', () => {
  it('returns english messages by key', () => {
    expect(t('reference.selector.blockedBadge')).toBe('Blocked');
    expect(t('reference.selector.sectionDates')).toBe('Dates');
    expect(t('reference.selector.shortcutToday')).toBe('Today');
    expect(t('reference.selector.noMatches')).toBe('No matches');
    expect(t('slash.menu.noResults')).toBe('No results');
    expect(t('search.commandPalette.placeholder')).toBe('Search nodes...');
    expect(t('tag.selector.noTagsAvailable')).toBe('No tags available');
    expect(t('nodePicker.createPrefix')).toBe('Create');
    expect(t('dateNavigationBar.previousDay')).toBe('Previous day');
    expect(t('datePicker.clear')).toBe('Clear');
    expect(t('breadcrumb.search')).toBe('Search (Cmd+K)');
    expect(t('nodeHeader.dragToMove')).toBe('Drag to move (right-click for menu)');
    expect(t('floatingToolbar.link')).toBe('Link');
  });

  it('falls back to key when message is missing', () => {
    expect(t('reference.selector.blockedBadge' as never)).toBe('Blocked');
    expect((t as (key: string) => string)('missing.path')).toBe('missing.path');
  });

  it('supports simple interpolation and locale accessors', () => {
    expect(getLocale()).toBe('en');
    setLocale('en');
    expect(t('reference.blocked.unavailable')).toBe('This reference cannot be created');
    expect(t('reference.selector.create', { name: 'Node' })).toBe('Create "Node"');
    expect(t('tag.selector.create', { name: 'Task' })).toBe('Create "Task"');
    expect(t('nodePicker.create', { name: 'Option' })).toBe('Create "Option"');
    expect(t('common.todayPrefix', { name: 'Feb 22' })).toBe('Today, Feb 22');
  });
});
