import {
  type TrailingRowUpdateAction,
  resolveTrailingRowUpdateAction,
} from './row-interactions.js';

interface ResolveTrailingUpdateActionParams {
  text: string;
  isOptionsField: boolean;
}

export type TrailingUpdateAction = TrailingRowUpdateAction;

/**
 * Backward-compatible wrapper around shared row-interaction onUpdate resolver.
 */
export function resolveTrailingUpdateAction(
  params: ResolveTrailingUpdateActionParams,
): TrailingUpdateAction {
  return resolveTrailingRowUpdateAction(params);
}
