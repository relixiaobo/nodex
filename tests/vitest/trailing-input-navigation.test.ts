import {
  resolveTrailingRowEnterIntent,
  resolveTrailingRowArrowDownIntent,
  resolveTrailingRowArrowUpIntent,
  resolveTrailingRowBackspaceIntent,
  resolveTrailingRowEscapeIntent,
} from '../../src/lib/row-interactions.js';

describe('trailing input navigation resolver', () => {
  it('resolves backspace intents by priority', () => {
    expect(
      resolveTrailingRowBackspaceIntent({
        isEditorEmpty: false,
        depthShifted: true,
        parentChildCount: 0,
        hasLastVisibleTarget: false,
      }),
    ).toBe('allow_default');

    expect(
      resolveTrailingRowBackspaceIntent({
        isEditorEmpty: true,
        depthShifted: true,
        parentChildCount: 0,
        hasLastVisibleTarget: false,
      }),
    ).toBe('reset_depth_shift');

    expect(
      resolveTrailingRowBackspaceIntent({
        isEditorEmpty: true,
        depthShifted: false,
        parentChildCount: 0,
        hasLastVisibleTarget: false,
      }),
    ).toBe('collapse_parent');

    expect(
      resolveTrailingRowBackspaceIntent({
        isEditorEmpty: true,
        depthShifted: false,
        parentChildCount: 2,
        hasLastVisibleTarget: true,
      }),
    ).toBe('focus_last_visible');

    expect(
      resolveTrailingRowBackspaceIntent({
        isEditorEmpty: true,
        depthShifted: false,
        parentChildCount: 2,
        hasLastVisibleTarget: false,
      }),
    ).toBe('noop');
  });

  it('resolves arrow-down intents', () => {
    expect(
      resolveTrailingRowArrowDownIntent({
        optionsOpen: true,
        optionCount: 2,
        hasNavigateOut: true,
      }),
    ).toBe('options_down');

    expect(
      resolveTrailingRowArrowDownIntent({
        optionsOpen: false,
        optionCount: 0,
        hasNavigateOut: true,
      }),
    ).toBe('navigate_out_down');

    expect(
      resolveTrailingRowArrowDownIntent({
        optionsOpen: false,
        optionCount: 0,
        hasNavigateOut: false,
      }),
    ).toBe('allow_default');
  });

  it('resolves arrow-up intents', () => {
    expect(
      resolveTrailingRowArrowUpIntent({
        optionsOpen: true,
        optionCount: 1,
        hasLastVisibleTarget: true,
        hasNavigateOut: true,
      }),
    ).toBe('options_up');

    expect(
      resolveTrailingRowArrowUpIntent({
        optionsOpen: false,
        optionCount: 0,
        hasLastVisibleTarget: true,
        hasNavigateOut: true,
      }),
    ).toBe('navigate_out_up');

    expect(
      resolveTrailingRowArrowUpIntent({
        optionsOpen: false,
        optionCount: 0,
        hasLastVisibleTarget: false,
        hasNavigateOut: true,
      }),
    ).toBe('navigate_out_up');

    expect(
      resolveTrailingRowArrowUpIntent({
        optionsOpen: false,
        optionCount: 0,
        hasLastVisibleTarget: false,
        hasNavigateOut: false,
      }),
    ).toBe('allow_default');
  });

  it('resolves escape intent by options visibility', () => {
    expect(resolveTrailingRowEscapeIntent(true)).toBe('close_options');
    expect(resolveTrailingRowEscapeIntent(false)).toBe('blur_editor');
  });

  it('resolves enter intent', () => {
    expect(
      resolveTrailingRowEnterIntent({
        optionsOpen: true,
        optionCount: 2,
        hasText: true,
      }),
    ).toBe('options_confirm');

    expect(
      resolveTrailingRowEnterIntent({
        optionsOpen: false,
        optionCount: 0,
        hasText: true,
      }),
    ).toBe('create_content_and_continue');

    expect(
      resolveTrailingRowEnterIntent({
        optionsOpen: false,
        optionCount: 0,
        hasText: false,
      }),
    ).toBe('create_empty');
  });
});
