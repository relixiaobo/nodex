import {
  resolveContentRowArrowIntent,
  resolveContentRowBackspaceIntent,
  resolveContentRowEnterIntent,
  resolveContentRowEscapeIntent,
  resolveContentRowForceCreateIntent,
  resolveTrailingRowArrowDownIntent,
  resolveTrailingRowArrowUpIntent,
  resolveTrailingRowBackspaceIntent,
  resolveTrailingRowEnterIntent,
  resolveTrailingRowEscapeIntent,
  resolveTrailingRowUpdateAction,
} from '../../src/lib/row-interactions.js';

describe('row interaction intents', () => {
  it('content row keeps dropdown priority order', () => {
    expect(resolveContentRowEnterIntent({
      referenceActive: true,
      hashTagActive: true,
      slashActive: true,
    })).toBe('reference_confirm');

    expect(resolveContentRowEnterIntent({
      referenceActive: false,
      hashTagActive: true,
      slashActive: true,
    })).toBe('hashtag_confirm');

    expect(resolveContentRowEnterIntent({
      referenceActive: false,
      hashTagActive: false,
      slashActive: true,
    })).toBe('slash_confirm');
  });

  it('content row falls back to outliner navigation when no dropdown is active', () => {
    expect(resolveContentRowArrowIntent({
      referenceActive: false,
      hashTagActive: false,
      slashActive: false,
      isAtBoundary: true,
    })).toBe('navigate_outliner');

    expect(resolveContentRowArrowIntent({
      referenceActive: false,
      hashTagActive: false,
      slashActive: false,
      isAtBoundary: false,
    })).toBe('allow_default');
  });

  it('content row escape and force-create remain aligned', () => {
    expect(resolveContentRowEscapeIntent({
      referenceActive: false,
      hashTagActive: false,
      slashActive: false,
    })).toBe('select_current');

    expect(resolveContentRowForceCreateIntent({
      referenceActive: false,
      hashTagActive: false,
      slashActive: true,
    })).toBe('noop');
  });

  it('content row backspace resolves merge/delete/default by state', () => {
    expect(resolveContentRowBackspaceIntent({
      referenceActive: false,
      hashTagActive: false,
      slashActive: false,
      isEmpty: false,
      isAtStart: true,
    })).toBe('merge_with_previous');

    expect(resolveContentRowBackspaceIntent({
      referenceActive: false,
      hashTagActive: false,
      slashActive: false,
      isEmpty: true,
      isAtStart: true,
    })).toBe('delete_empty');

    expect(resolveContentRowBackspaceIntent({
      referenceActive: true,
      hashTagActive: false,
      slashActive: false,
      isEmpty: false,
      isAtStart: true,
    })).toBe('allow_default');
  });

  it('trailing row options intent requires non-empty option list', () => {
    expect(resolveTrailingRowEnterIntent({
      optionsOpen: true,
      optionCount: 0,
      hasText: true,
    })).toBe('create_content_and_continue');

    expect(resolveTrailingRowArrowDownIntent({
      optionsOpen: true,
      optionCount: 0,
      hasNavigateOut: true,
    })).toBe('navigate_out_down');

    expect(resolveTrailingRowEnterIntent({
      optionsOpen: true,
      optionCount: 2,
      hasText: true,
    })).toBe('options_confirm');
  });

  it('trailing row keeps backspace and arrow priority', () => {
    expect(resolveTrailingRowBackspaceIntent({
      isEditorEmpty: true,
      depthShifted: true,
      parentChildCount: 2,
      hasLastVisibleTarget: true,
    })).toBe('reset_depth_shift');

    expect(resolveTrailingRowArrowUpIntent({
      optionsOpen: false,
      optionCount: 0,
      hasLastVisibleTarget: true,
      hasNavigateOut: true,
    })).toBe('navigate_out_up');
  });

  it('trailing row escape still differentiates options and blur', () => {
    expect(resolveTrailingRowEscapeIntent(true)).toBe('close_options');
    expect(resolveTrailingRowEscapeIntent(false)).toBe('blur_editor');
  });

  it('trailing row onUpdate trigger intent is shared here', () => {
    expect(
      resolveTrailingRowUpdateAction({ text: '@', isOptionsField: false }),
    ).toEqual({
      type: 'create_trigger_node',
      trigger: '@',
      textOffset: 1,
    });

    expect(
      resolveTrailingRowUpdateAction({ text: 'opt', isOptionsField: true }),
    ).toEqual({
      type: 'open_options',
      query: 'opt',
    });
  });
});
