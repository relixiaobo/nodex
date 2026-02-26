import { resolveTrailingRowUpdateAction } from '../../src/lib/row-interactions.js';

describe('trailing input update action resolver', () => {
  it('maps ">" to field-creation action', () => {
    expect(resolveTrailingRowUpdateAction({ text: '>', isOptionsField: false })).toEqual({
      type: 'create_field',
    });
  });

  it('maps "#", "@", "/" to trigger-node actions', () => {
    expect(resolveTrailingRowUpdateAction({ text: '#', isOptionsField: false })).toEqual({
      type: 'create_trigger_node',
      trigger: '#',
      matchText: '#',
      textOffset: 1,
    });
    expect(resolveTrailingRowUpdateAction({ text: '@', isOptionsField: false })).toEqual({
      type: 'create_trigger_node',
      trigger: '@',
      matchText: '@',
      textOffset: 1,
    });
    expect(resolveTrailingRowUpdateAction({ text: '/', isOptionsField: false })).toEqual({
      type: 'create_trigger_node',
      trigger: '/',
      matchText: '/',
      textOffset: 1,
    });
  });

  it('maps trailing "#", "@", "/" to trigger-node actions when preceded by text', () => {
    expect(resolveTrailingRowUpdateAction({ text: 'hello#', isOptionsField: false })).toEqual({
      type: 'create_trigger_node',
      trigger: '#',
      matchText: 'hello#',
      textOffset: 6,
    });
  });

  it('opens and closes options dropdown in options fields', () => {
    expect(resolveTrailingRowUpdateAction({ text: 'abc', isOptionsField: true })).toEqual({
      type: 'open_options',
      query: 'abc',
    });
    expect(resolveTrailingRowUpdateAction({ text: '', isOptionsField: true })).toEqual({
      type: 'close_options',
    });
  });

  it('returns none for regular text in non-options fields', () => {
    expect(resolveTrailingRowUpdateAction({ text: 'hello', isOptionsField: false })).toEqual({
      type: 'none',
    });
  });
});
