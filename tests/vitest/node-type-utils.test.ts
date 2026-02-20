import { isOutlinerContentNodeType } from '../../src/lib/node-type-utils.js';

describe('isOutlinerContentNodeType', () => {
  it('treats regular content nodes as renderable', () => {
    expect(isOutlinerContentNodeType(undefined)).toBe(true);
  });

  it('treats reference nodes as renderable content', () => {
    expect(isOutlinerContentNodeType('reference')).toBe(true);
  });

  it('filters structural schema/field nodes from content rows', () => {
    expect(isOutlinerContentNodeType('fieldEntry')).toBe(false);
    expect(isOutlinerContentNodeType('tagDef')).toBe(false);
    expect(isOutlinerContentNodeType('fieldDef')).toBe(false);
  });
});
