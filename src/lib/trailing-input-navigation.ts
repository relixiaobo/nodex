export type TrailingBackspaceIntent =
  | 'allow_default'
  | 'reset_depth_shift'
  | 'collapse_parent'
  | 'focus_last_visible'
  | 'noop';

interface ResolveTrailingBackspaceIntentParams {
  isEditorEmpty: boolean;
  depthShifted: boolean;
  parentChildCount: number;
  hasLastVisibleTarget: boolean;
}

export function resolveTrailingBackspaceIntent(
  params: ResolveTrailingBackspaceIntentParams,
): TrailingBackspaceIntent {
  const {
    isEditorEmpty,
    depthShifted,
    parentChildCount,
    hasLastVisibleTarget,
  } = params;

  if (!isEditorEmpty) return 'allow_default';
  if (depthShifted) return 'reset_depth_shift';
  if (parentChildCount === 0) return 'collapse_parent';
  if (hasLastVisibleTarget) return 'focus_last_visible';
  return 'noop';
}

export type TrailingArrowDownIntent =
  | 'options_down'
  | 'navigate_out_down'
  | 'allow_default';

interface ResolveTrailingArrowDownIntentParams {
  optionsOpen: boolean;
  optionCount: number;
  hasNavigateOut: boolean;
}

export function resolveTrailingArrowDownIntent(
  params: ResolveTrailingArrowDownIntentParams,
): TrailingArrowDownIntent {
  const { optionsOpen, optionCount, hasNavigateOut } = params;
  if (optionsOpen && optionCount > 0) return 'options_down';
  if (hasNavigateOut) return 'navigate_out_down';
  return 'allow_default';
}

export type TrailingArrowUpIntent =
  | 'options_up'
  | 'focus_last_visible'
  | 'navigate_out_up'
  | 'allow_default';

interface ResolveTrailingArrowUpIntentParams {
  optionsOpen: boolean;
  optionCount: number;
  hasLastVisibleTarget: boolean;
  hasNavigateOut: boolean;
}

export function resolveTrailingArrowUpIntent(
  params: ResolveTrailingArrowUpIntentParams,
): TrailingArrowUpIntent {
  const { optionsOpen, optionCount, hasLastVisibleTarget, hasNavigateOut } = params;
  if (optionsOpen && optionCount > 0) return 'options_up';
  if (hasNavigateOut) return 'navigate_out_up';
  if (hasLastVisibleTarget) return 'focus_last_visible';
  return 'allow_default';
}

export type TrailingEscapeIntent = 'close_options' | 'blur_editor';

export function resolveTrailingEscapeIntent(optionsOpen: boolean): TrailingEscapeIntent {
  return optionsOpen ? 'close_options' : 'blur_editor';
}

export type TrailingEnterIntent =
  | 'options_confirm'
  | 'create_content_and_continue'
  | 'create_empty';

interface ResolveTrailingEnterIntentParams {
  optionsOpen: boolean;
  optionCount: number;
  hasText: boolean;
}

export function resolveTrailingEnterIntent(
  params: ResolveTrailingEnterIntentParams,
): TrailingEnterIntent {
  const { optionsOpen, optionCount, hasText } = params;
  if (optionsOpen && optionCount > 0) return 'options_confirm';
  if (hasText) return 'create_content_and_continue';
  return 'create_empty';
}
