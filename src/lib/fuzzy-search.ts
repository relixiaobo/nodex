/**
 * Fuzzy search powered by uFuzzy.
 *
 * Supports CJK + Latin scripts, typo tolerance (1 edit per term),
 * and multi-token queries (space-separated).
 *
 * "today" matches "Today's meeting" but NOT "Next meeting on Friday".
 * "会议" matches "今天的会议记录".
 * "tody" (typo) matches "Today's meeting".
 */
import uFuzzy from '@leeoniya/ufuzzy';

export interface FuzzyResult {
  score: number;
  /** Highlight ranges as [start, end, start, end, ...] pairs. */
  ranges: number[];
}

const uf = new uFuzzy({
  unicode: true,
  interSplit: '[\\s]+',  // split query on whitespace only (keeps CJK tokens intact)
  interLft: 0,           // no left boundary required (CJK has no word boundaries)
  interRgt: 0,           // no right boundary required
  intraMode: 1,          // allow 1 typo per term (substitution/transposition/insertion/deletion)
});

/**
 * Score a query against a single target string.
 * Returns null if no match. Use fuzzySort() for batch operations.
 */
export function fuzzyMatch(query: string, target: string): FuzzyResult | null {
  if (!query) return { score: 0, ranges: [] };

  const [idxs, info, order] = uf.search([target], query);
  if (!idxs || idxs.length === 0) return null;

  if (info && order && order.length > 0) {
    const oi = order[0];
    return {
      score: scoreFromInfo(info, oi, target.length),
      ranges: info.ranges[oi] ?? [],
    };
  }

  // Filtered but not scored (shouldn't happen for single item, but handle gracefully)
  return { score: 1, ranges: [] };
}

/**
 * Batch fuzzy search: filter, score, and sort items by match quality.
 * Returns top `limit` matching items, already sorted best-first.
 */
export function fuzzySort<T>(
  items: T[],
  query: string,
  getText: (item: T) => string,
  limit = 20,
): Array<T & { _fuzzyScore: number; _fuzzyRanges: number[] }> {
  if (!query.trim()) return [];

  const haystack = items.map(getText);
  const [idxs, info, order] = uf.search(haystack, query);
  if (!idxs || idxs.length === 0) return [];

  const results: Array<T & { _fuzzyScore: number; _fuzzyRanges: number[] }> = [];

  if (info && order && order.length > 0) {
    // Ranked results — take top `limit` from sorted order
    const count = Math.min(order.length, limit);
    for (let i = 0; i < count; i++) {
      const oi = order[i];
      const itemIdx = info.idx[oi];
      results.push({
        ...items[itemIdx],
        _fuzzyScore: scoreFromInfo(info, oi, haystack[itemIdx].length),
        _fuzzyRanges: info.ranges[oi] ?? [],
      });
    }
  } else {
    // Too many matches to rank — return first `limit` unscored
    const count = Math.min(idxs.length, limit);
    for (let i = 0; i < count; i++) {
      results.push({
        ...items[idxs[i]],
        _fuzzyScore: 1,
        _fuzzyRanges: [],
      });
    }
  }

  return results;
}

/** Derive a numeric score from uFuzzy info for cross-set comparison. */
function scoreFromInfo(info: uFuzzy.Info, oi: number, targetLen: number): number {
  const chars = info.chars[oi] ?? 0;
  const start = info.start[oi] ?? 0;
  const interIns = info.interIns[oi] ?? 0;
  const intraIns = info.intraIns[oi] ?? 0;

  return (
    chars * 10 +
    (start === 0 ? 20 : 0) -
    interIns * 2 -
    intraIns * 5 -
    targetLen * 0.1
  );
}
