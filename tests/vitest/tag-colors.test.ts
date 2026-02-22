import { useNodeStore } from '../../src/stores/node-store.js';
import { resetAndSeed } from './helpers/test-state.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import {
  TAG_COLORS,
  TAG_COLOR_GRAY,
  TAG_COLOR_MAP,
  SWATCH_OPTIONS,
  getTagColor,
  INLINE_REF_FALLBACK_TEXT_COLOR,
  resolveInlineReferenceTextColor,
  resolveTagColor,
} from '../../src/lib/tag-colors.js';

describe('tag colors', () => {
  it('returns deterministic color for the same tagDef id', () => {
    const first = getTagColor('tagDef_task');
    const second = getTagColor('tagDef_task');
    expect(first).toEqual(second);
  });

  it('always returns one color from the palette', () => {
    const color = getTagColor('any-random-id');
    expect(TAG_COLORS).toContainEqual(color);
  });

  it('spreads different ids across multiple palette entries', () => {
    const ids = [
      'tagDef_task',
      'tagDef_person',
      'tagDef_company',
      'tagDef_project',
      'tagDef_area',
      'tagDef_goal',
      'tagDef_note',
      'tagDef_idea',
    ];
    const tokens = new Set(ids.map((id) => JSON.stringify(getTagColor(id))));
    expect(tokens.size).toBeGreaterThan(1);
  });
});

describe('resolveTagColor', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('returns gray for system tags (SYS_T*)', () => {
    expect(resolveTagColor('SYS_T01')).toEqual(TAG_COLOR_GRAY);
    expect(resolveTagColor('SYS_T02')).toEqual(TAG_COLOR_GRAY);
  });

  it('falls back to hash when no color config', () => {
    // tagDef_dev_task has no color configured in seed
    const color = resolveTagColor('tagDef_dev_task');
    expect(color).toEqual(getTagColor('tagDef_dev_task'));
  });

  it('reads pre-configured emerald for tagDef_task from seed', () => {
    // tagDef_task has color: 'emerald' in seed
    expect(resolveTagColor('tagDef_task')).toEqual(TAG_COLOR_MAP.emerald);
  });

  it('reads configured color value via setConfigValue', () => {
    const store = useNodeStore.getState();
    // Use setConfigValue to update tagDef_task color directly
    store.setConfigValue('tagDef_task', 'color', 'violet');

    const result = resolveTagColor('tagDef_task');
    expect(result).toEqual(TAG_COLOR_MAP.violet);
  });

  it('returns hash for unknown color key', () => {
    const store = useNodeStore.getState();
    store.setConfigValue('tagDef_task', 'color', 'nonexistent_color');

    // Falls back to hash since 'nonexistent_color' is not in TAG_COLOR_MAP
    const result = resolveTagColor('tagDef_task');
    expect(result).toEqual(getTagColor('tagDef_task'));
  });

  it('returns hash for nonexistent tagDefId', () => {
    const color = resolveTagColor('nonexistent_tagDef');
    expect(TAG_COLORS).toContainEqual(color);
  });
});

describe('resolveInlineReferenceTextColor', () => {
  it('falls back safely before LoroDoc is initialized', () => {
    loroDoc.resetLoroDoc();
    expect(resolveInlineReferenceTextColor('node_1')).toBe(INLINE_REF_FALLBACK_TEXT_COLOR);
  });
});

describe('SWATCH_OPTIONS', () => {
  it('has exactly 10 entries', () => {
    expect(SWATCH_OPTIONS).toHaveLength(10);
  });

  it('keys are all valid TAG_COLOR_MAP keys', () => {
    for (const swatch of SWATCH_OPTIONS) {
      expect(TAG_COLOR_MAP[swatch.key]).toBeTruthy();
      expect(swatch.color).toEqual(TAG_COLOR_MAP[swatch.key]);
    }
  });

  it('includes gray as the last swatch', () => {
    expect(SWATCH_OPTIONS[SWATCH_OPTIONS.length - 1].key).toBe('gray');
    expect(TAG_COLOR_MAP.gray).toEqual(TAG_COLOR_GRAY);
  });
});
