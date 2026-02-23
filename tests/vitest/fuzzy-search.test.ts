/**
 * Tests for the lightweight fuzzy search scorer (src/lib/fuzzy-search.ts).
 */
import { describe, it, expect } from 'vitest';
import { fuzzyMatch, fuzzySort } from '../../src/lib/fuzzy-search';

describe('fuzzyMatch', () => {
  it('returns a result for an empty query', () => {
    const result = fuzzyMatch('', 'anything');
    expect(result).not.toBeNull();
    expect(result!.score).toBe(0);
    expect(result!.indices).toEqual([]);
  });

  it('returns null when query chars are not in target', () => {
    expect(fuzzyMatch('xyz', 'hello')).toBeNull();
  });

  it('returns null when query chars exist but not in order', () => {
    expect(fuzzyMatch('ba', 'abc')).toBeNull();
  });

  it('matches exact prefix', () => {
    const result = fuzzyMatch('hel', 'hello world');
    expect(result).not.toBeNull();
    expect(result!.indices).toEqual([0, 1, 2]);
    expect(result!.score).toBeGreaterThan(0);
  });

  it('matches scattered characters', () => {
    const result = fuzzyMatch('hw', 'hello world');
    expect(result).not.toBeNull();
    expect(result!.indices).toEqual([0, 6]);
  });

  it('scores consecutive matches higher than scattered', () => {
    const consecutive = fuzzyMatch('hel', 'hello');
    const scattered = fuzzyMatch('hlo', 'hello');
    expect(consecutive).not.toBeNull();
    expect(scattered).not.toBeNull();
    expect(consecutive!.score).toBeGreaterThan(scattered!.score);
  });

  it('gives prefix bonus for first-char match', () => {
    const prefix = fuzzyMatch('m', 'meeting notes');
    const noPrefix = fuzzyMatch('n', 'meeting notes');
    expect(prefix).not.toBeNull();
    expect(noPrefix).not.toBeNull();
    // prefix match at position 0 should score higher than match at position 8
    expect(prefix!.score).toBeGreaterThan(noPrefix!.score);
  });

  it('is case-insensitive', () => {
    const result = fuzzyMatch('HEL', 'hello');
    expect(result).not.toBeNull();
  });

  it('gives word boundary bonus', () => {
    // 'sw' in 'search_widget' matches at word boundary after _
    const result = fuzzyMatch('sw', 'search_widget');
    expect(result).not.toBeNull();
    // Score should include the word boundary bonus
    expect(result!.score).toBeGreaterThan(0);
  });

  it('penalizes longer targets', () => {
    const short = fuzzyMatch('hi', 'hi');
    const long = fuzzyMatch('hi', 'hi there how are you doing today');
    expect(short).not.toBeNull();
    expect(long).not.toBeNull();
    expect(short!.score).toBeGreaterThan(long!.score);
  });
});

describe('fuzzySort', () => {
  const items = [
    { id: '1', name: 'Meeting notes' },
    { id: '2', name: 'Weekly review' },
    { id: '3', name: 'Project roadmap' },
    { id: '4', name: 'My meetings list' },
  ];

  it('returns empty for empty query', () => {
    expect(fuzzySort(items, '', (i) => i.name)).toEqual([]);
    expect(fuzzySort(items, '   ', (i) => i.name)).toEqual([]);
  });

  it('filters and sorts by score', () => {
    const results = fuzzySort(items, 'meet', (i) => i.name);
    expect(results.length).toBeGreaterThanOrEqual(1);
    // "Meeting notes" should rank higher than "My meetings list"
    expect(results[0].id).toBe('1');
  });

  it('respects limit parameter', () => {
    const results = fuzzySort(items, 'e', (i) => i.name, 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('attaches _fuzzyScore and _fuzzyIndices', () => {
    const results = fuzzySort(items, 'meet', (i) => i.name);
    expect(results.length).toBeGreaterThan(0);
    expect(typeof results[0]._fuzzyScore).toBe('number');
    expect(Array.isArray(results[0]._fuzzyIndices)).toBe(true);
  });

  it('excludes non-matching items', () => {
    const results = fuzzySort(items, 'xyz', (i) => i.name);
    expect(results.length).toBe(0);
  });
});
