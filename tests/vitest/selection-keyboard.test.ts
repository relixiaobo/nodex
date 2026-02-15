import { resolveSelectionKeyboardAction } from '../../src/lib/selection-keyboard.js';

function keyEvent(key: string, mods: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    key,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...mods,
  } as KeyboardEvent;
}

describe('resolveSelectionKeyboardAction', () => {
  it('returns navigate_up for ArrowUp', () => {
    expect(resolveSelectionKeyboardAction(keyEvent('ArrowUp'))).toBe('navigate_up');
  });

  it('returns navigate_down for ArrowDown', () => {
    expect(resolveSelectionKeyboardAction(keyEvent('ArrowDown'))).toBe('navigate_down');
  });

  it('returns enter_edit for Enter', () => {
    expect(resolveSelectionKeyboardAction(keyEvent('Enter'))).toBe('enter_edit');
  });

  it('returns clear_selection for Escape', () => {
    expect(resolveSelectionKeyboardAction(keyEvent('Escape'))).toBe('clear_selection');
  });

  it('returns type_char for printable characters', () => {
    expect(resolveSelectionKeyboardAction(keyEvent('a'))).toBe('type_char');
    expect(resolveSelectionKeyboardAction(keyEvent('Z'))).toBe('type_char');
    expect(resolveSelectionKeyboardAction(keyEvent('1'))).toBe('type_char');
    expect(resolveSelectionKeyboardAction(keyEvent(' '))).toBe('type_char');
  });

  it('returns type_char for uppercase via Shift', () => {
    expect(resolveSelectionKeyboardAction(keyEvent('A', { shiftKey: true }))).toBe('type_char');
  });

  it('returns null for Shift+Arrow (reserved for Phase 2 extend)', () => {
    expect(resolveSelectionKeyboardAction(keyEvent('ArrowUp', { shiftKey: true }))).toBeNull();
    expect(resolveSelectionKeyboardAction(keyEvent('ArrowDown', { shiftKey: true }))).toBeNull();
  });

  it('returns null for Cmd/Ctrl+key', () => {
    expect(resolveSelectionKeyboardAction(keyEvent('a', { metaKey: true }))).toBeNull();
    expect(resolveSelectionKeyboardAction(keyEvent('a', { ctrlKey: true }))).toBeNull();
  });

  it('returns null for Alt+key', () => {
    expect(resolveSelectionKeyboardAction(keyEvent('a', { altKey: true }))).toBeNull();
  });

  it('returns null for unhandled special keys', () => {
    expect(resolveSelectionKeyboardAction(keyEvent('Tab'))).toBeNull();
    expect(resolveSelectionKeyboardAction(keyEvent('F1'))).toBeNull();
    expect(resolveSelectionKeyboardAction(keyEvent('Shift'))).toBeNull();
    expect(resolveSelectionKeyboardAction(keyEvent('Control'))).toBeNull();
  });

  it('returns null for Enter with modifiers', () => {
    expect(resolveSelectionKeyboardAction(keyEvent('Enter', { metaKey: true }))).toBeNull();
    expect(resolveSelectionKeyboardAction(keyEvent('Enter', { shiftKey: true }))).toBeNull();
  });

  it('returns null for Arrow with Cmd modifier', () => {
    expect(resolveSelectionKeyboardAction(keyEvent('ArrowUp', { metaKey: true }))).toBeNull();
    expect(resolveSelectionKeyboardAction(keyEvent('ArrowDown', { ctrlKey: true }))).toBeNull();
  });
});
