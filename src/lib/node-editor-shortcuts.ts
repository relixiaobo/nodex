export type NodeEditorEnterIntent =
  | 'reference_confirm'
  | 'hashtag_confirm'
  | 'slash_confirm'
  | 'create_or_split';

interface ResolveNodeEditorEnterIntentParams {
  referenceActive: boolean;
  hashTagActive: boolean;
  slashActive: boolean;
}

export function resolveNodeEditorEnterIntent(
  params: ResolveNodeEditorEnterIntentParams,
): NodeEditorEnterIntent {
  const { referenceActive, hashTagActive, slashActive } = params;
  if (referenceActive) return 'reference_confirm';
  if (hashTagActive) return 'hashtag_confirm';
  if (slashActive) return 'slash_confirm';
  return 'create_or_split';
}

export type NodeEditorArrowIntent =
  | 'reference_nav'
  | 'hashtag_nav'
  | 'slash_nav'
  | 'navigate_outliner'
  | 'allow_default';

interface ResolveNodeEditorArrowIntentParams {
  referenceActive: boolean;
  hashTagActive: boolean;
  slashActive: boolean;
  isAtBoundary: boolean;
}

export function resolveNodeEditorArrowIntent(
  params: ResolveNodeEditorArrowIntentParams,
): NodeEditorArrowIntent {
  const { referenceActive, hashTagActive, slashActive, isAtBoundary } = params;
  if (referenceActive) return 'reference_nav';
  if (hashTagActive) return 'hashtag_nav';
  if (slashActive) return 'slash_nav';
  if (isAtBoundary) return 'navigate_outliner';
  return 'allow_default';
}

export type NodeEditorEscapeIntent =
  | 'reference_close'
  | 'hashtag_close'
  | 'slash_close'
  | 'select_current';

export function resolveNodeEditorEscapeIntent(
  referenceActive: boolean,
  hashTagActive: boolean,
  slashActive: boolean,
): NodeEditorEscapeIntent {
  if (referenceActive) return 'reference_close';
  if (hashTagActive) return 'hashtag_close';
  if (slashActive) return 'slash_close';
  return 'select_current';
}

export type NodeEditorForceCreateIntent =
  | 'reference_create'
  | 'hashtag_create'
  | 'noop'
  | 'toggle_done';

export function resolveNodeEditorForceCreateIntent(
  referenceActive: boolean,
  hashTagActive: boolean,
  slashActive: boolean,
): NodeEditorForceCreateIntent {
  if (referenceActive) return 'reference_create';
  if (hashTagActive) return 'hashtag_create';
  if (slashActive) return 'noop';
  return 'toggle_done';
}
