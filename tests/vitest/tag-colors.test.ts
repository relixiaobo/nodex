import { TAG_COLORS, getTagColor } from '../../src/lib/tag-colors.js';

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
