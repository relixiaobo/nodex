export type TrailingUpdateAction =
  | { type: 'none' }
  | { type: 'create_field' }
  | { type: 'create_trigger_node'; trigger: '#' | '@' | '/' }
  | { type: 'open_options'; query: string }
  | { type: 'close_options' };

interface ResolveTrailingUpdateActionParams {
  text: string;
  isOptionsField: boolean;
}

/**
 * Classifies TrailingInput onUpdate text into deterministic actions.
 */
export function resolveTrailingUpdateAction(
  params: ResolveTrailingUpdateActionParams,
): TrailingUpdateAction {
  const { text, isOptionsField } = params;

  if (text === '>') return { type: 'create_field' };
  if (text === '#' || text === '@' || text === '/') {
    return { type: 'create_trigger_node', trigger: text };
  }

  if (isOptionsField) {
    if (text.length > 0) return { type: 'open_options', query: text };
    return { type: 'close_options' };
  }

  return { type: 'none' };
}
