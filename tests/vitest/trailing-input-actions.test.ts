import { resolveTrailingUpdateAction } from '../../src/lib/trailing-input-actions.js';

describe('trailing input update action resolver', () => {
  it('maps ">" to field-creation action', () => {
    expect(resolveTrailingUpdateAction({ text: '>', isOptionsField: false })).toEqual({
      type: 'create_field',
    });
  });

  it('maps "#", "@", "/" to trigger-node actions', () => {
    expect(resolveTrailingUpdateAction({ text: '#', isOptionsField: false })).toEqual({
      type: 'create_trigger_node',
      trigger: '#',
      textOffset: 1,
    });
    expect(resolveTrailingUpdateAction({ text: '@', isOptionsField: false })).toEqual({
      type: 'create_trigger_node',
      trigger: '@',
      textOffset: 1,
    });
    expect(resolveTrailingUpdateAction({ text: '/', isOptionsField: false })).toEqual({
      type: 'create_trigger_node',
      trigger: '/',
      textOffset: 1,
    });
  });

  it('opens and closes options dropdown in options fields', () => {
    expect(resolveTrailingUpdateAction({ text: 'abc', isOptionsField: true })).toEqual({
      type: 'open_options',
      query: 'abc',
    });
    expect(resolveTrailingUpdateAction({ text: '', isOptionsField: true })).toEqual({
      type: 'close_options',
    });
  });

  it('returns none for regular text in non-options fields', () => {
    expect(resolveTrailingUpdateAction({ text: 'hello', isOptionsField: false })).toEqual({
      type: 'none',
    });
  });
});
