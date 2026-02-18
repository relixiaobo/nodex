export interface ImeKeyboardEventLike {
  isComposing?: boolean;
  key?: string;
  keyCode?: number;
  which?: number;
}

/**
 * Browsers may report IME composition with different signals.
 * Keep resolver-level guards centralized so keyboard shortcuts don't
 * consume composition keystrokes.
 */
export function isImeComposingEvent(e: ImeKeyboardEventLike | null | undefined): boolean {
  if (!e) return false;
  if (e.isComposing) return true;
  if (e.key === 'Process') return true;
  const legacyCode = e.keyCode ?? e.which;
  return legacyCode === 229;
}
