import {
  resolveTrailingEnterIntent,
  resolveTrailingArrowDownIntent,
  resolveTrailingArrowUpIntent,
  resolveTrailingBackspaceIntent,
  resolveTrailingEscapeIntent,
} from '../../src/lib/trailing-input-navigation.js';

describe('trailing input navigation resolver', () => {
  it('resolves backspace intents by priority', () => {
    expect(
      resolveTrailingBackspaceIntent({
        isEditorEmpty: false,
        depthShifted: true,
        parentChildCount: 0,
        hasLastVisibleTarget: false,
      }),
    ).toBe('allow_default');

    expect(
      resolveTrailingBackspaceIntent({
        isEditorEmpty: true,
        depthShifted: true,
        parentChildCount: 0,
        hasLastVisibleTarget: false,
      }),
    ).toBe('reset_depth_shift');

    expect(
      resolveTrailingBackspaceIntent({
        isEditorEmpty: true,
        depthShifted: false,
        parentChildCount: 0,
        hasLastVisibleTarget: false,
      }),
    ).toBe('collapse_parent');

    expect(
      resolveTrailingBackspaceIntent({
        isEditorEmpty: true,
        depthShifted: false,
        parentChildCount: 2,
        hasLastVisibleTarget: true,
      }),
    ).toBe('focus_last_visible');

    expect(
      resolveTrailingBackspaceIntent({
        isEditorEmpty: true,
        depthShifted: false,
        parentChildCount: 2,
        hasLastVisibleTarget: false,
      }),
    ).toBe('noop');
  });

  it('resolves arrow-down intents', () => {
    expect(
      resolveTrailingArrowDownIntent({
        optionsOpen: true,
        optionCount: 2,
        hasNavigateOut: true,
      }),
    ).toBe('options_down');

    expect(
      resolveTrailingArrowDownIntent({
        optionsOpen: false,
        optionCount: 0,
        hasNavigateOut: true,
      }),
    ).toBe('navigate_out_down');

    expect(
      resolveTrailingArrowDownIntent({
        optionsOpen: false,
        optionCount: 0,
        hasNavigateOut: false,
      }),
    ).toBe('allow_default');
  });

  it('resolves arrow-up intents', () => {
    expect(
      resolveTrailingArrowUpIntent({
        optionsOpen: true,
        optionCount: 1,
        hasLastVisibleTarget: true,
        hasNavigateOut: true,
      }),
    ).toBe('options_up');

    expect(
      resolveTrailingArrowUpIntent({
        optionsOpen: false,
        optionCount: 0,
        hasLastVisibleTarget: true,
        hasNavigateOut: true,
      }),
    ).toBe('navigate_out_up');

    expect(
      resolveTrailingArrowUpIntent({
        optionsOpen: false,
        optionCount: 0,
        hasLastVisibleTarget: false,
        hasNavigateOut: true,
      }),
    ).toBe('navigate_out_up');

    expect(
      resolveTrailingArrowUpIntent({
        optionsOpen: false,
        optionCount: 0,
        hasLastVisibleTarget: false,
        hasNavigateOut: false,
      }),
    ).toBe('allow_default');
  });

  it('resolves escape intent by options visibility', () => {
    expect(resolveTrailingEscapeIntent(true)).toBe('close_options');
    expect(resolveTrailingEscapeIntent(false)).toBe('blur_editor');
  });

  it('resolves enter intent', () => {
    expect(
      resolveTrailingEnterIntent({
        optionsOpen: true,
        optionCount: 2,
        hasText: true,
      }),
    ).toBe('options_confirm');

    expect(
      resolveTrailingEnterIntent({
        optionsOpen: false,
        optionCount: 0,
        hasText: true,
      }),
    ).toBe('create_content_and_continue');

    expect(
      resolveTrailingEnterIntent({
        optionsOpen: false,
        optionCount: 0,
        hasText: false,
      }),
    ).toBe('create_empty');
  });
});
