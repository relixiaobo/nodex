/**
 * Lightweight fuzzy search scorer.
 *
 * Scoring heuristics:
 * - Consecutive character matches score higher than scattered matches
 * - Prefix matches get a bonus
 * - Exact case matches get a bonus
 * - Shorter targets score higher (more relevant)
 *
 * Returns null if no match, or a score (higher = better match).
 */

export interface FuzzyResult {
  score: number;
  /** Matched character indices in the target string (for highlighting). */
  indices: number[];
}

/**
 * Score a query against a target string using fuzzy matching.
 * Returns null if the query doesn't match the target.
 */
export function fuzzyMatch(query: string, target: string): FuzzyResult | null {
  if (!query) return { score: 0, indices: [] };

  const queryLower = query.toLowerCase();
  const targetLower = target.toLowerCase();

  // Quick check: all query chars must exist in target (in order)
  let qi = 0;
  for (let ti = 0; ti < targetLower.length && qi < queryLower.length; ti++) {
    if (targetLower[ti] === queryLower[qi]) qi++;
  }
  if (qi < queryLower.length) return null;

  // Score the match
  let score = 0;
  const indices: number[] = [];
  let consecutiveBonus = 0;
  let prevMatchIndex = -2; // -2 so first match at 0 doesn't count as consecutive

  qi = 0;
  for (let ti = 0; ti < target.length && qi < queryLower.length; ti++) {
    if (targetLower[ti] === queryLower[qi]) {
      indices.push(ti);

      // Base match score
      score += 1;

      // Consecutive match bonus (grows with streak length)
      if (ti === prevMatchIndex + 1) {
        consecutiveBonus += 2;
        score += consecutiveBonus;
      } else {
        consecutiveBonus = 0;
      }

      // Prefix bonus: first char matches first char of target
      if (ti === 0 && qi === 0) {
        score += 5;
      }

      // Word boundary bonus: match at start of word
      if (ti > 0 && /[\s_\-./]/.test(target[ti - 1])) {
        score += 3;
      }

      // Exact case bonus
      if (target[ti] === query[qi]) {
        score += 0.5;
      }

      prevMatchIndex = ti;
      qi++;
    }
  }

  // Length penalty: prefer shorter targets (more specific matches)
  score -= target.length * 0.1;

  return { score, indices };
}

/**
 * Sort items by fuzzy match score against a query.
 * Returns only matching items, sorted by descending score.
 */
export function fuzzySort<T>(
  items: T[],
  query: string,
  getText: (item: T) => string,
  limit = 20,
): Array<T & { _fuzzyScore: number; _fuzzyIndices: number[] }> {
  if (!query.trim()) return [];

  const results: Array<T & { _fuzzyScore: number; _fuzzyIndices: number[] }> = [];

  for (const item of items) {
    const text = getText(item);
    const match = fuzzyMatch(query, text);
    if (match) {
      results.push({
        ...item,
        _fuzzyScore: match.score,
        _fuzzyIndices: match.indices,
      });
    }
  }

  results.sort((a, b) => b._fuzzyScore - a._fuzzyScore);
  return results.slice(0, limit);
}
