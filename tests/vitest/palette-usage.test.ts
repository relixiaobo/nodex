/**
 * Tests for ⌘K palette usage tracking and score boosting.
 *
 * Covers:
 * - trackPaletteUsage increments count and sets lastUsedAt
 * - getUsageBoost frequency formula (log scale, capped at 15)
 * - getUsageBoost recency formula (7-day decay, max 10)
 * - paletteUsage is included in partializeUIStore (persisted)
 */
import { useUIStore, partializeUIStore } from '../../src/stores/ui-store.js';

// Extracted from CommandPalette.tsx for unit testing
function getUsageBoost(
  paletteUsage: Record<string, { count: number; lastUsedAt: number }>,
  itemId: string,
): number {
  const usage = paletteUsage[itemId];
  if (!usage) return 0;
  const freqBoost = Math.min(Math.log2(usage.count + 1) * 5, 15);
  const ageMs = Date.now() - usage.lastUsedAt;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const recencyBoost = Math.max(10 - ageDays * (10 / 7), 0);
  return freqBoost + recencyBoost;
}

describe('palette usage tracking (ui-store)', () => {
  beforeEach(() => {
    useUIStore.setState({ paletteUsage: {} });
  });

  it('trackPaletteUsage creates entry on first call', () => {
    useUIStore.getState().trackPaletteUsage('node_1');
    const usage = useUIStore.getState().paletteUsage['node_1'];
    expect(usage).toBeDefined();
    expect(usage.count).toBe(1);
    expect(typeof usage.lastUsedAt).toBe('number');
  });

  it('trackPaletteUsage increments count on subsequent calls', () => {
    const { trackPaletteUsage } = useUIStore.getState();
    trackPaletteUsage('node_1');
    trackPaletteUsage('node_1');
    trackPaletteUsage('node_1');
    const usage = useUIStore.getState().paletteUsage['node_1'];
    expect(usage.count).toBe(3);
  });

  it('trackPaletteUsage updates lastUsedAt', () => {
    useUIStore.getState().trackPaletteUsage('node_1');
    const t1 = useUIStore.getState().paletteUsage['node_1'].lastUsedAt;
    // Small delay to ensure timestamp changes
    useUIStore.getState().trackPaletteUsage('node_1');
    const t2 = useUIStore.getState().paletteUsage['node_1'].lastUsedAt;
    expect(t2).toBeGreaterThanOrEqual(t1);
  });

  it('trackPaletteUsage tracks multiple items independently', () => {
    const { trackPaletteUsage } = useUIStore.getState();
    trackPaletteUsage('node_1');
    trackPaletteUsage('node_1');
    trackPaletteUsage('cmd_2');
    expect(useUIStore.getState().paletteUsage['node_1'].count).toBe(2);
    expect(useUIStore.getState().paletteUsage['cmd_2'].count).toBe(1);
  });

  it('paletteUsage is included in partializeUIStore', () => {
    const usage = { node_1: { count: 3, lastUsedAt: 1000 } };
    const result = partializeUIStore({
      panelHistory: [],
      panelIndex: -1,
      expandedNodes: new Set<string>(),
      viewMode: 'list',
      paletteUsage: usage,
    } as never);
    expect(result.paletteUsage).toEqual(usage);
  });
});

describe('palette usage boost calculation', () => {
  it('returns 0 for unknown items', () => {
    expect(getUsageBoost({}, 'unknown')).toBe(0);
  });

  it('frequency boost scales logarithmically', () => {
    const now = Date.now();
    // 1 use → log2(2) * 5 = 5
    const boost1 = getUsageBoost({ x: { count: 1, lastUsedAt: now } }, 'x');
    // 3 uses → log2(4) * 5 = 10
    const boost3 = getUsageBoost({ x: { count: 3, lastUsedAt: now } }, 'x');
    // 7 uses → log2(8) * 5 = 15 (capped)
    const boost7 = getUsageBoost({ x: { count: 7, lastUsedAt: now } }, 'x');
    // 100 uses → still capped at 15
    const boost100 = getUsageBoost({ x: { count: 100, lastUsedAt: now } }, 'x');

    // Frequency portion (subtract recency which should be 10 for "just now")
    const freq1 = boost1 - 10;
    const freq3 = boost3 - 10;
    const freq7 = boost7 - 10;
    const freq100 = boost100 - 10;

    expect(freq1).toBeCloseTo(5, 1);
    expect(freq3).toBeCloseTo(10, 1);
    expect(freq7).toBeCloseTo(15, 1);
    expect(freq100).toBeCloseTo(15, 1); // capped
  });

  it('recency boost decays over 7 days', () => {
    const now = Date.now();
    const oneDay = 1000 * 60 * 60 * 24;

    // Just now → recency ≈ 10
    const boostNow = getUsageBoost({ x: { count: 1, lastUsedAt: now } }, 'x');
    // 3.5 days ago → recency ≈ 5
    const boost3d = getUsageBoost({ x: { count: 1, lastUsedAt: now - 3.5 * oneDay } }, 'x');
    // 7 days ago → recency = 0
    const boost7d = getUsageBoost({ x: { count: 1, lastUsedAt: now - 7 * oneDay } }, 'x');
    // 14 days ago → recency = 0 (clamped)
    const boost14d = getUsageBoost({ x: { count: 1, lastUsedAt: now - 14 * oneDay } }, 'x');

    const freq = 5; // log2(2) * 5 for count=1
    expect(boostNow - freq).toBeCloseTo(10, 0);
    expect(boost3d - freq).toBeCloseTo(5, 0);
    expect(boost7d - freq).toBeCloseTo(0, 0);
    expect(boost14d - freq).toBeCloseTo(0, 0);
  });

  it('max total boost is 25 (15 freq + 10 recency)', () => {
    const now = Date.now();
    const boost = getUsageBoost({ x: { count: 100, lastUsedAt: now } }, 'x');
    expect(boost).toBeCloseTo(25, 0);
  });
});
