export type NodeEditorEnterIntent =
  | 'reference_confirm'
  | 'hashtag_confirm'
  | 'create_or_split';

interface ResolveNodeEditorEnterIntentParams {
  referenceActive: boolean;
  hashTagActive: boolean;
}

export function resolveNodeEditorEnterIntent(
  params: ResolveNodeEditorEnterIntentParams,
): NodeEditorEnterIntent {
  const { referenceActive, hashTagActive } = params;
  if (referenceActive) return 'reference_confirm';
  if (hashTagActive) return 'hashtag_confirm';
  return 'create_or_split';
}

export type NodeEditorArrowIntent =
  | 'reference_nav'
  | 'hashtag_nav'
  | 'navigate_outliner'
  | 'allow_default';

interface ResolveNodeEditorArrowIntentParams {
  referenceActive: boolean;
  hashTagActive: boolean;
  isAtBoundary: boolean;
}

export function resolveNodeEditorArrowIntent(
  params: ResolveNodeEditorArrowIntentParams,
): NodeEditorArrowIntent {
  const { referenceActive, hashTagActive, isAtBoundary } = params;
  if (referenceActive) return 'reference_nav';
  if (hashTagActive) return 'hashtag_nav';
  if (isAtBoundary) return 'navigate_outliner';
  return 'allow_default';
}

export type NodeEditorEscapeIntent =
  | 'reference_close'
  | 'hashtag_close'
  | 'allow_default';

export function resolveNodeEditorEscapeIntent(
  referenceActive: boolean,
  hashTagActive: boolean,
): NodeEditorEscapeIntent {
  if (referenceActive) return 'reference_close';
  if (hashTagActive) return 'hashtag_close';
  return 'allow_default';
}

export type NodeEditorForceCreateIntent =
  | 'reference_create'
  | 'hashtag_create'
  | 'allow_default';

export function resolveNodeEditorForceCreateIntent(
  referenceActive: boolean,
  hashTagActive: boolean,
): NodeEditorForceCreateIntent {
  if (referenceActive) return 'reference_create';
  if (hashTagActive) return 'hashtag_create';
  return 'allow_default';
}
