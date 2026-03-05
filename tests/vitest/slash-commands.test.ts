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
    expect(filterSlashCommands('clip').map((c) => c.id)).toContain('clip_page');
    expect(filterSlashCommands('capture').map((c) => c.id)).toEqual(['clip_page']);
  });

  it('only returns enabled commands', () => {
    const filtered = filterSlashCommands('');
    const enabledBaseline = SLASH_COMMANDS_BASELINE.filter((c) => c.enabled);
    expect(filtered).toHaveLength(enabledBaseline.length);
    expect(filtered.every((c) => c.enabled)).toBe(true);
  });

  it('returns first enabled index', () => {
    const filtered = filterSlashCommands('');
    expect(getFirstEnabledSlashIndex(filtered)).toBe(0);
    expect(filtered[0]?.id).toBe('clip_page');
  });

  it('moves selection across all visible items', () => {
    const filtered = filterSlashCommands('');
    const ids = filtered.map((c) => c.id);
    expect(ids).toEqual(['clip_page', 'field', 'reference', 'heading', 'checkbox']);

    // Clamp to boundaries.
    const last = filtered.length - 1;
    expect(getNextEnabledSlashIndex(filtered, last, 'down')).toBe(last);
    expect(getNextEnabledSlashIndex(filtered, 0, 'up')).toBe(0);
  });

  it('enables heading command', () => {
    const heading = SLASH_COMMANDS_BASELINE.find((command) => command.id === 'heading');
    expect(heading?.enabled).toBe(true);
  });

  it('returns -1 when no enabled commands are present', () => {
    const disabledOnly = SLASH_COMMANDS_BASELINE.map((c) => ({ ...c, enabled: false }));
    expect(getFirstEnabledSlashIndex(disabledOnly)).toBe(-1);
    expect(getNextEnabledSlashIndex(disabledOnly, 0, 'down')).toBe(-1);
  });
});
