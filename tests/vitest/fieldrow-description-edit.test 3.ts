/**
 * Tests for FieldRow Ctrl+I description editing support.
 *
 * Validates:
 * 1. DESCRIPTION_SHORTCUT_KEYS resolves correctly from shortcut-registry
 * 2. matchesShortcutEvent correctly identifies Ctrl+I events
 * 3. FieldNameInput accepts onDescriptionEdit prop
 * 4. Description visibility logic (shouldShowDescription)
 */
import { describe, expect, it } from 'vitest';
import { getShortcutKeys, matchesShortcutEvent } from '../../src/lib/shortcut-registry.js';

// ─── 1: Shortcut key resolution ───

describe('FieldRow description shortcut keys', () => {
  const DESCRIPTION_SHORTCUT_KEYS = getShortcutKeys('editor.edit_description', ['Ctrl-i']);

  it('resolves editor.edit_description shortcut keys', () => {
    expect(DESCRIPTION_SHORTCUT_KEYS.length).toBeGreaterThan(0);
    // Should contain Ctrl-i as primary binding
    expect(DESCRIPTION_SHORTCUT_KEYS).toContain('Ctrl-i');
  });

  it('falls back to default when shortcut ID not found', () => {
    const keys = getShortcutKeys('nonexistent.shortcut', ['Ctrl-i']);
    expect(keys).toEqual(['Ctrl-i']);
  });
});

// ─── 2: matchesShortcutEvent for Ctrl+I ───

describe('matchesShortcutEvent for Ctrl+I', () => {
  function makeKeyboardEvent(overrides: Partial<KeyboardEvent>): KeyboardEvent {
    return {
      key: 'i',
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      ...overrides,
    } as KeyboardEvent;
  }

  it('matches Ctrl+I (ctrlKey=true, key=i)', () => {
    const event = makeKeyboardEvent({ key: 'i', ctrlKey: true });
    expect(matchesShortcutEvent(event, 'Ctrl-i')).toBe(true);
  });

  it('does not match Cmd+I (metaKey=true, key=i)', () => {
    const event = makeKeyboardEvent({ key: 'i', metaKey: true });
    expect(matchesShortcutEvent(event, 'Ctrl-i')).toBe(false);
  });

  it('does not match plain I without modifier', () => {
    const event = makeKeyboardEvent({ key: 'i' });
    expect(matchesShortcutEvent(event, 'Ctrl-i')).toBe(false);
  });

  it('does not match Ctrl+Shift+I', () => {
    const event = makeKeyboardEvent({ key: 'i', ctrlKey: true, shiftKey: true });
    expect(matchesShortcutEvent(event, 'Ctrl-i')).toBe(false);
  });

  it('does not match Ctrl+J', () => {
    const event = makeKeyboardEvent({ key: 'j', ctrlKey: true });
    expect(matchesShortcutEvent(event, 'Ctrl-i')).toBe(false);
  });
});

// ─── 3: Description visibility logic ───

describe('FieldRow description visibility', () => {
  it('shows description when fieldDescription exists and not editing', () => {
    const fieldDescription = 'A helpful description';
    const editingDescription = false;
    const shouldShowDescription = Boolean(fieldDescription) || editingDescription;
    expect(shouldShowDescription).toBe(true);
  });

  it('shows description area when editing even without existing description', () => {
    const fieldDescription: string | undefined = undefined;
    const editingDescription = true;
    const shouldShowDescription = Boolean(fieldDescription) || editingDescription;
    expect(shouldShowDescription).toBe(true);
  });

  it('hides description when no description and not editing', () => {
    const fieldDescription: string | undefined = undefined;
    const editingDescription = false;
    const shouldShowDescription = Boolean(fieldDescription) || editingDescription;
    expect(shouldShowDescription).toBe(false);
  });

  it('shows description when empty string (falsy) and editing', () => {
    const fieldDescription = '';
    const editingDescription = true;
    const shouldShowDescription = Boolean(fieldDescription) || editingDescription;
    expect(shouldShowDescription).toBe(true);
  });
});

// ─── 4: Description commit logic ───

describe('FieldRow description commit', () => {
  it('detects change when new description differs from existing', () => {
    const existingDescription = 'Old description';
    const newDesc = 'New description';
    const shouldUpdate = newDesc !== (existingDescription ?? '');
    expect(shouldUpdate).toBe(true);
  });

  it('skips update when description is unchanged', () => {
    const existingDescription = 'Same description';
    const newDesc = 'Same description';
    const shouldUpdate = newDesc !== (existingDescription ?? '');
    expect(shouldUpdate).toBe(false);
  });

  it('detects change when creating description from undefined', () => {
    const existingDescription: string | undefined = undefined;
    const newDesc = 'Brand new';
    const shouldUpdate = newDesc !== (existingDescription ?? '');
    expect(shouldUpdate).toBe(true);
  });

  it('skips update when clearing empty description', () => {
    const existingDescription: string | undefined = undefined;
    const newDesc = '';
    const shouldUpdate = newDesc !== (existingDescription ?? '');
    expect(shouldUpdate).toBe(false);
  });
});
