import {
  SLASH_COMMANDS_BASELINE,
  filterSlashCommands,
  getFirstEnabledSlashIndex,
  getNextEnabledSlashIndex,
} from '../../src/lib/slash-commands.js';

describe('slash command helpers', () => {
  it('filters by command name and keywords', () => {
    expect(filterSlashCommands('field').map((c) => c.id)).toEqual(['field']);
    expect(filterSlashCommands('mention').map((c) => c.id)).toEqual(['reference']);
    expect(filterSlashCommands('')).toHaveLength(SLASH_COMMANDS_BASELINE.length);
  });

  it('returns first enabled index', () => {
    const filtered = filterSlashCommands('');
    expect(getFirstEnabledSlashIndex(filtered)).toBe(filtered.findIndex((c) => c.id === 'field'));
  });

  it('moves selection only across enabled items', () => {
    const filtered = filterSlashCommands('');
    const first = getFirstEnabledSlashIndex(filtered);
    const second = getNextEnabledSlashIndex(filtered, first, 'down');
    const third = getNextEnabledSlashIndex(filtered, second, 'down');
    const fourth = getNextEnabledSlashIndex(filtered, third, 'down');

    expect(filtered[first]?.id).toBe('field');
    expect(filtered[second]?.id).toBe('reference');
    expect(filtered[third]?.id).toBe('checkbox');
    expect(filtered[fourth]?.id).toBe('more_commands');

    // Clamp to boundaries.
    expect(getNextEnabledSlashIndex(filtered, fourth, 'down')).toBe(fourth);
    expect(getNextEnabledSlashIndex(filtered, first, 'up')).toBe(first);
  });

  it('returns -1 when no enabled commands are present', () => {
    const disabledOnly = SLASH_COMMANDS_BASELINE.map((c) => ({ ...c, enabled: false }));
    expect(getFirstEnabledSlashIndex(disabledOnly)).toBe(-1);
    expect(getNextEnabledSlashIndex(disabledOnly, 0, 'down')).toBe(-1);
  });
});
