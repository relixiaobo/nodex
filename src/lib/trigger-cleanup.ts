import type { TextRange } from '../components/editor/editor-handle.js';

/**
 * Find the range of a #trigger token in editor text, suitable for deletion.
 *
 * Strategy: single-transaction — read text+caret once, regex match, return range.
 * No stale refs or cascading fallbacks.
 *
 * @returns The range to delete, or null if no trigger found.
 */
export function findHashTriggerRange(
  text: string,
  caretOffset: number,
): TextRange | null {
  const beforeCaret = text.slice(0, caretOffset);

  // Primary: #query ending at caret (the active trigger)
  const match = beforeCaret.match(/#([^\s#@]*)$/u);
  if (match) {
    return { from: caretOffset - match[0].length, to: caretOffset };
  }

  // Fallback: caret moved away (e.g. mouse-clicked dropdown item).
  // Find last #token in full text.
  const regex = /#([^\s#@]*)/gu;
  let lastMatch: RegExpMatchArray | null = null;
  for (const m of text.matchAll(regex)) lastMatch = m;
  if (lastMatch && typeof lastMatch.index === 'number') {
    return { from: lastMatch.index, to: lastMatch.index + lastMatch[0].length };
  }

  return null;
}

/**
 * Find the range of an @trigger token in editor text, suitable for deletion or replacement.
 */
export function findRefTriggerRange(
  text: string,
  caretOffset: number,
): TextRange | null {
  const beforeCaret = text.slice(0, caretOffset);

  const match = beforeCaret.match(/@([^\s]*)$/);
  if (match) {
    return { from: caretOffset - match[0].length, to: caretOffset };
  }

  const regex = /@([^\s]*)/g;
  let lastMatch: RegExpMatchArray | null = null;
  for (const m of text.matchAll(regex)) lastMatch = m;
  if (lastMatch && typeof lastMatch.index === 'number') {
    return { from: lastMatch.index, to: lastMatch.index + lastMatch[0].length };
  }

  return null;
}
