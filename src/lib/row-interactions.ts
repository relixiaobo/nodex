interface ContentDropdownState {
  referenceActive: boolean;
  hashTagActive: boolean;
  slashActive: boolean;
}

type ContentDropdownKind = 'reference' | 'hashtag' | 'slash' | null;

function resolveContentDropdownKind(state: ContentDropdownState): ContentDropdownKind {
  if (state.referenceActive) return 'reference';
  if (state.hashTagActive) return 'hashtag';
  if (state.slashActive) return 'slash';
  return null;
}

export type ContentRowEnterIntent =
  | 'reference_confirm'
  | 'hashtag_confirm'
  | 'slash_confirm'
  | 'create_or_split';

export function resolveContentRowEnterIntent(
  state: ContentDropdownState,
): ContentRowEnterIntent {
  const kind = resolveContentDropdownKind(state);
  if (kind === 'reference') return 'reference_confirm';
  if (kind === 'hashtag') return 'hashtag_confirm';
  if (kind === 'slash') return 'slash_confirm';
  return 'create_or_split';
}

export type ContentRowArrowIntent =
  | 'reference_nav'
  | 'hashtag_nav'
  | 'slash_nav'
  | 'navigate_outliner'
  | 'allow_default';

interface ResolveContentRowArrowIntentParams extends ContentDropdownState {
  isAtBoundary: boolean;
}

export function resolveContentRowArrowIntent(
  params: ResolveContentRowArrowIntentParams,
): ContentRowArrowIntent {
  const kind = resolveContentDropdownKind(params);
  if (kind === 'reference') return 'reference_nav';
  if (kind === 'hashtag') return 'hashtag_nav';
  if (kind === 'slash') return 'slash_nav';
  if (params.isAtBoundary) return 'navigate_outliner';
  return 'allow_default';
}

export type ContentRowEscapeIntent =
  | 'reference_close'
  | 'hashtag_close'
  | 'slash_close'
  | 'select_current';

export function resolveContentRowEscapeIntent(
  state: ContentDropdownState,
): ContentRowEscapeIntent {
  const kind = resolveContentDropdownKind(state);
  if (kind === 'reference') return 'reference_close';
  if (kind === 'hashtag') return 'hashtag_close';
  if (kind === 'slash') return 'slash_close';
  return 'select_current';
}

export type ContentRowForceCreateIntent =
  | 'reference_create'
  | 'hashtag_create'
  | 'noop'
  | 'toggle_done';

export function resolveContentRowForceCreateIntent(
  state: ContentDropdownState,
): ContentRowForceCreateIntent {
  const kind = resolveContentDropdownKind(state);
  if (kind === 'reference') return 'reference_create';
  if (kind === 'hashtag') return 'hashtag_create';
  if (kind === 'slash') return 'noop';
  return 'toggle_done';
}

export type ContentRowBackspaceIntent =
  | 'allow_default'
  | 'select_reference'
  | 'merge_with_previous'
  | 'delete_empty';

interface ResolveContentRowBackspaceIntentParams extends ContentDropdownState {
  isEmpty: boolean;
  isAtStart: boolean;
  isAtEnd?: boolean;
  isSingleInlineRefAtom?: boolean;
}

export function resolveContentRowBackspaceIntent(
  params: ResolveContentRowBackspaceIntentParams,
): ContentRowBackspaceIntent {
  const kind = resolveContentDropdownKind(params);
  if (kind) return 'allow_default';
  if (params.isSingleInlineRefAtom && params.isAtEnd) return 'select_reference';
  if (params.isEmpty) return 'delete_empty';
  if (params.isAtStart) return 'merge_with_previous';
  return 'allow_default';
}

interface TrailingOptionsState {
  optionsOpen: boolean;
  optionCount: number;
}

function hasActiveOptionsDropdown(state: TrailingOptionsState): boolean {
  return state.optionsOpen && state.optionCount > 0;
}

export type TrailingRowBackspaceIntent =
  | 'allow_default'
  | 'reset_depth_shift'
  | 'collapse_parent'
  | 'focus_last_visible'
  | 'noop';

interface ResolveTrailingRowBackspaceIntentParams {
  isEditorEmpty: boolean;
  depthShifted: boolean;
  parentChildCount: number;
  hasLastVisibleTarget: boolean;
}

export function resolveTrailingRowBackspaceIntent(
  params: ResolveTrailingRowBackspaceIntentParams,
): TrailingRowBackspaceIntent {
  if (!params.isEditorEmpty) return 'allow_default';
  if (params.depthShifted) return 'reset_depth_shift';
  if (params.parentChildCount === 0) return 'collapse_parent';
  if (params.hasLastVisibleTarget) return 'focus_last_visible';
  return 'noop';
}

export type TrailingRowArrowDownIntent =
  | 'options_down'
  | 'navigate_out_down'
  | 'allow_default';

interface ResolveTrailingRowArrowDownIntentParams extends TrailingOptionsState {
  hasNavigateOut: boolean;
}

export function resolveTrailingRowArrowDownIntent(
  params: ResolveTrailingRowArrowDownIntentParams,
): TrailingRowArrowDownIntent {
  if (hasActiveOptionsDropdown(params)) return 'options_down';
  if (params.hasNavigateOut) return 'navigate_out_down';
  return 'allow_default';
}

export type TrailingRowArrowUpIntent =
  | 'options_up'
  | 'focus_last_visible'
  | 'navigate_out_up'
  | 'allow_default';

interface ResolveTrailingRowArrowUpIntentParams extends TrailingOptionsState {
  hasLastVisibleTarget: boolean;
  hasNavigateOut: boolean;
}

export function resolveTrailingRowArrowUpIntent(
  params: ResolveTrailingRowArrowUpIntentParams,
): TrailingRowArrowUpIntent {
  if (hasActiveOptionsDropdown(params)) return 'options_up';
  if (params.hasNavigateOut) return 'navigate_out_up';
  if (params.hasLastVisibleTarget) return 'focus_last_visible';
  return 'allow_default';
}

export type TrailingRowEscapeIntent = 'close_options' | 'blur_editor';

export function resolveTrailingRowEscapeIntent(
  optionsOpen: boolean,
): TrailingRowEscapeIntent {
  return optionsOpen ? 'close_options' : 'blur_editor';
}

export type TrailingRowEnterIntent =
  | 'options_confirm'
  | 'create_content_and_continue'
  | 'create_empty';

interface ResolveTrailingRowEnterIntentParams extends TrailingOptionsState {
  hasText: boolean;
}

export function resolveTrailingRowEnterIntent(
  params: ResolveTrailingRowEnterIntentParams,
): TrailingRowEnterIntent {
  if (hasActiveOptionsDropdown(params)) return 'options_confirm';
  if (params.hasText) return 'create_content_and_continue';
  return 'create_empty';
}

export type TrailingRowUpdateAction =
  | { type: 'none' }
  | { type: 'create_field' }
  | { type: 'create_trigger_node'; trigger: '#' | '@' | '/'; matchText: string; textOffset: number }
  | { type: 'open_options'; query: string }
  | { type: 'close_options' };

interface ResolveTrailingRowUpdateActionParams {
  text: string;
  isOptionsField: boolean;
}

export function resolveTrailingRowUpdateAction(
  params: ResolveTrailingRowUpdateActionParams,
): TrailingRowUpdateAction {
  const { text, isOptionsField } = params;

  if (text === '>') return { type: 'create_field' };

  // Detect trigger characters even if preceded by text.
  // The hashtag/mention must be at the end of the input to trigger node creation immediately.
  const triggerMatch = text.match(/(#|@|\/)$/);
  if (triggerMatch) {
    const trigger = triggerMatch[1] as '#' | '@' | '/';
    return { type: 'create_trigger_node', trigger, matchText: text, textOffset: text.length };
  }

  if (isOptionsField) {
    if (text.length > 0) return { type: 'open_options', query: text };
    return { type: 'close_options' };
  }

  return { type: 'none' };
}
