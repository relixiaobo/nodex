import {
  KNOWN_SHORTCUT_CONFLICTS,
  SHORTCUT_REGISTRY,
  findShortcutConflicts,
  findUnexpectedShortcutConflicts,
  getShortcutsByScope,
  matchesShortcutEvent,
  type ShortcutDefinition,
} from '../../src/lib/shortcut-registry.js';

describe('shortcut-registry', () => {
  it('surfaces current canonical conflicts (snapshot guard)', () => {
    const conflicts = findShortcutConflicts();
    expect(conflicts).toEqual(KNOWN_SHORTCUT_CONFLICTS);
    expect(findUnexpectedShortcutConflicts()).toEqual([]);
  });

  it('detects normalized key conflicts within same scope and ignores pseudo keys', () => {
    const custom: ShortcutDefinition[] = [
      {
        id: 'a',
        scope: 'node_editor',
        keys: ['Ctrl-i'],
        when: '',
        action: '',
        source: 'x',
      },
      {
        id: 'b',
        scope: 'node_editor',
        keys: [' ctrl-I '], // same key after normalization
        when: '',
        action: '',
        source: 'x',
      },
      {
        id: 'c',
        scope: 'global',
        keys: ['Ctrl-i'], // same key, different scope => not a conflict with node_editor
        when: '',
        action: '',
        source: 'x',
      },
      {
        id: 'd',
        scope: 'node_editor',
        keys: ['<printable>'], // pseudo key should be ignored
        when: '',
        action: '',
        source: 'x',
      },
    ];

    const conflicts = findShortcutConflicts(custom);
    expect(conflicts).toEqual([
      {
        scope: 'node_editor',
        key: 'ctrl-i',
        ids: ['a', 'b'],
      },
    ]);
  });

  it('returns shortcuts filtered by scope', () => {
    const nodeEditor = getShortcutsByScope('node_editor');
    expect(nodeEditor.length).toBeGreaterThan(0);
    expect(nodeEditor.every((s) => s.scope === 'node_editor')).toBe(true);

    const global = getShortcutsByScope('global');
    expect(global.length).toBeGreaterThan(0);
    expect(global.every((s) => s.scope === 'global')).toBe(true);
  });

  it('excludes known conflicts and reports unexpected ones', () => {
    const custom: ShortcutDefinition[] = [
      ...SHORTCUT_REGISTRY,
      {
        id: 'custom.ctrl_i_duplicate',
        scope: 'node_editor',
        keys: ['Ctrl-i'],
        when: '',
        action: '',
        source: 'test',
      },
    ];

    const unexpected = findUnexpectedShortcutConflicts(custom);
    expect(unexpected).toEqual([
      {
        scope: 'node_editor',
        key: 'ctrl-i',
        ids: ['editor.edit_description', 'custom.ctrl_i_duplicate'],
      },
    ]);
  });

  it('registry ids are unique', () => {
    const ids = SHORTCUT_REGISTRY.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('matches shortcut events with Mod/meta/ctrl semantics', () => {
    const modMeta = new KeyboardEvent('keydown', { key: 'z', metaKey: true });
    expect(matchesShortcutEvent(modMeta, 'Mod-z')).toBe(true);
    expect(matchesShortcutEvent(modMeta, 'Ctrl-z')).toBe(false);

    const modCtrl = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true });
    expect(matchesShortcutEvent(modCtrl, 'Mod-z')).toBe(true);
    expect(matchesShortcutEvent(modCtrl, 'Ctrl-z')).toBe(true);

    const shifted = new KeyboardEvent('keydown', { key: 'z', metaKey: true, shiftKey: true });
    expect(matchesShortcutEvent(shifted, 'Mod-Shift-z')).toBe(true);
    expect(matchesShortcutEvent(shifted, 'Mod-z')).toBe(false);
  });

  it('supports plus-separated bindings and token aliases', () => {
    const ctrlShift = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true });
    expect(matchesShortcutEvent(ctrlShift, 'Ctrl+Shift+z')).toBe(true);

    const commandI = new KeyboardEvent('keydown', { key: 'i', metaKey: true });
    expect(matchesShortcutEvent(commandI, 'Command-i')).toBe(true);

    const optionK = new KeyboardEvent('keydown', { key: 'k', altKey: true });
    expect(matchesShortcutEvent(optionK, 'Option-k')).toBe(true);
  });
});
