import { SYS_A, SYS_D } from '../../src/types/index.js';
import { useNodeStore } from '../../src/stores/node-store.js';
import { resetAndSeed } from './helpers/test-state.js';
import {
  TAG_COLORS,
  TAG_COLOR_GRAY,
  TAG_COLOR_MAP,
  SWATCH_OPTIONS,
  getTagColor,
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
    const entities = useNodeStore.getState().entities;
    expect(resolveTagColor(entities, 'SYS_T01')).toEqual(TAG_COLOR_GRAY);
    expect(resolveTagColor(entities, 'SYS_T02')).toEqual(TAG_COLOR_GRAY);
  });

  it('falls back to hash when no SYS_A11 config', () => {
    const entities = useNodeStore.getState().entities;
    // tagDef_dev_task has no color configured (value undefined in seed)
    const color = resolveTagColor(entities, 'tagDef_dev_task');
    expect(color).toEqual(getTagColor('tagDef_dev_task'));
  });

  it('reads pre-configured emerald for tagDef_task from seed', () => {
    const entities = useNodeStore.getState().entities;
    expect(resolveTagColor(entities, 'tagDef_task')).toEqual(TAG_COLOR_MAP.emerald);
  });

  it('reads configured SYS_A11 color value', () => {
    const state = useNodeStore.getState();
    const entities = state.entities;
    const tagDef = entities['tagDef_task'];

    // Find the color config tuple
    const colorTupleId = (tagDef.children ?? []).find((cid) => {
      const child = entities[cid];
      return child?.props._docType === 'tuple' && child.children?.[0] === SYS_A.COLOR;
    });
    expect(colorTupleId).toBeTruthy();
    if (!colorTupleId) return;

    // Set color to 'violet'
    state.setConfigValue(colorTupleId, 'violet', 'user_default');

    const updated = useNodeStore.getState().entities;
    expect(resolveTagColor(updated, 'tagDef_task')).toEqual(TAG_COLOR_MAP.violet);
  });

  it('returns hash for unknown color key in config', () => {
    const state = useNodeStore.getState();
    const entities = state.entities;
    const tagDef = entities['tagDef_task'];

    const colorTupleId = (tagDef.children ?? []).find((cid) => {
      const child = entities[cid];
      return child?.props._docType === 'tuple' && child.children?.[0] === SYS_A.COLOR;
    });
    expect(colorTupleId).toBeTruthy();
    if (!colorTupleId) return;

    state.setConfigValue(colorTupleId, 'nonexistent_color', 'user_default');

    const updated = useNodeStore.getState().entities;
    // Falls back to hash since 'nonexistent_color' is not in TAG_COLOR_MAP
    expect(resolveTagColor(updated, 'tagDef_task')).toEqual(getTagColor('tagDef_task'));
  });

  it('returns hash for nonexistent tagDefId', () => {
    const entities = useNodeStore.getState().entities;
    const color = resolveTagColor(entities, 'nonexistent_tagDef');
    expect(TAG_COLORS).toContainEqual(color);
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

describe('SYS_A11 seed data', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('Color attrDef uses NDX_D02 (COLOR) data type', () => {
    const entities = useNodeStore.getState().entities;
    const colorAttrDef = entities[SYS_A.COLOR];
    expect(colorAttrDef).toBeTruthy();
    expect(colorAttrDef.props._docType).toBe('attrDef');

    const typeTuple = (colorAttrDef.children ?? [])
      .map(cid => entities[cid])
      .find(n => n?.props._docType === 'tuple' && n.children?.[0] === SYS_A.TYPE_CHOICE);
    expect(typeTuple).toBeTruthy();
    expect(typeTuple!.children![1]).toBe(SYS_D.COLOR);
  });
});
