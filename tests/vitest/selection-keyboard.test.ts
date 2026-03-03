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

  it('returns extend_up for Shift+ArrowUp', () => {
    expect(resolveSelectionKeyboardAction(keyEvent('ArrowUp', { shiftKey: true }))).toBe('extend_up');
  });

  it('returns extend_down for Shift+ArrowDown', () => {
    expect(resolveSelectionKeyboardAction(keyEvent('ArrowDown', { shiftKey: true }))).toBe('extend_down');
  });

  it('returns select_all for Cmd+A', () => {
    expect(resolveSelectionKeyboardAction(keyEvent('a', { metaKey: true }))).toBe('select_all');
  });

  it('returns select_all for Ctrl+A', () => {
    expect(resolveSelectionKeyboardAction(keyEvent('a', { ctrlKey: true }))).toBe('select_all');
  });

  it('returns null for Cmd/Ctrl+key (non-a/c/x)', () => {
    expect(resolveSelectionKeyboardAction(keyEvent('b', { metaKey: true }))).toBeNull();
    expect(resolveSelectionKeyboardAction(keyEvent('z', { ctrlKey: true }))).toBeNull();
  });

  it('returns batch_copy for Cmd+C / Ctrl+C', () => {
    expect(resolveSelectionKeyboardAction(keyEvent('c', { metaKey: true }))).toBe('batch_copy');
    expect(resolveSelectionKeyboardAction(keyEvent('c', { ctrlKey: true }))).toBe('batch_copy');
  });

  it('returns batch_cut for Cmd+X / Ctrl+X', () => {
    expect(resolveSelectionKeyboardAction(keyEvent('x', { metaKey: true }))).toBe('batch_cut');
    expect(resolveSelectionKeyboardAction(keyEvent('x', { ctrlKey: true }))).toBe('batch_cut');
  });

  it('returns null for Alt+key', () => {
    expect(resolveSelectionKeyboardAction(keyEvent('a', { altKey: true }))).toBeNull();
  });

  it('returns null during IME composition events', () => {
    expect(resolveSelectionKeyboardAction(keyEvent('n', { isComposing: true }))).toBeNull();
    expect(resolveSelectionKeyboardAction(keyEvent('Process'))).toBeNull();
    expect(resolveSelectionKeyboardAction(keyEvent('n', { keyCode: 229 }))).toBeNull();
  });

  it('returns null for unhandled special keys', () => {
    expect(resolveSelectionKeyboardAction(keyEvent('F1'))).toBeNull();
    expect(resolveSelectionKeyboardAction(keyEvent('Shift'))).toBeNull();
    expect(resolveSelectionKeyboardAction(keyEvent('Control'))).toBeNull();
  });

  it('returns null for Enter with non-batch modifiers', () => {
    expect(resolveSelectionKeyboardAction(keyEvent('Enter', { shiftKey: true }))).toBeNull();
    expect(resolveSelectionKeyboardAction(keyEvent('Enter', { altKey: true }))).toBeNull();
  });

  // ─── Phase 3: Batch actions ───

  it('returns batch_delete for Backspace', () => {
    expect(resolveSelectionKeyboardAction(keyEvent('Backspace'))).toBe('batch_delete');
  });

  it('returns batch_delete for Delete', () => {
    expect(resolveSelectionKeyboardAction(keyEvent('Delete'))).toBe('batch_delete');
  });

  it('returns batch_indent for Tab', () => {
    expect(resolveSelectionKeyboardAction(keyEvent('Tab'))).toBe('batch_indent');
  });

  it('returns batch_outdent for Shift+Tab', () => {
    expect(resolveSelectionKeyboardAction(keyEvent('Tab', { shiftKey: true }))).toBe('batch_outdent');
  });

  it('returns batch_duplicate for Cmd+Shift+D', () => {
    expect(resolveSelectionKeyboardAction(keyEvent('d', { metaKey: true, shiftKey: true }))).toBe('batch_duplicate');
    expect(resolveSelectionKeyboardAction(keyEvent('D', { metaKey: true, shiftKey: true }))).toBe('batch_duplicate');
    expect(resolveSelectionKeyboardAction(keyEvent('d', { ctrlKey: true, shiftKey: true }))).toBe('batch_duplicate');
  });

  it('returns batch_checkbox for Cmd+Enter', () => {
    expect(resolveSelectionKeyboardAction(keyEvent('Enter', { metaKey: true }))).toBe('batch_checkbox');
    expect(resolveSelectionKeyboardAction(keyEvent('Enter', { ctrlKey: true }))).toBe('batch_checkbox');
  });

  it('returns batch_apply_tag for # key', () => {
    expect(resolveSelectionKeyboardAction(keyEvent('#', { shiftKey: true }))).toBe('batch_apply_tag');
    expect(resolveSelectionKeyboardAction(keyEvent('#'))).toBe('batch_apply_tag');
  });

  it('returns null for Arrow with Cmd modifier', () => {
    expect(resolveSelectionKeyboardAction(keyEvent('ArrowUp', { metaKey: true }))).toBeNull();
    expect(resolveSelectionKeyboardAction(keyEvent('ArrowDown', { ctrlKey: true }))).toBeNull();
  });
});
