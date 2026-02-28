import { isOutlinerContentNodeType } from '../../src/lib/node-type-utils.js';

describe('isOutlinerContentNodeType', () => {
  it('treats regular content nodes as renderable', () => {
    expect(isOutlinerContentNodeType(undefined)).toBe(true);
  });

  it('treats reference nodes as renderable content', () => {
    expect(isOutlinerContentNodeType('reference')).toBe(true);
  });

  it('treats search nodes as renderable content', () => {
    expect(isOutlinerContentNodeType('search')).toBe(true);
  });

  it('treats codeBlock nodes as renderable content', () => {
    expect(isOutlinerContentNodeType('codeBlock')).toBe(true);
  });

  it('treats tagDef as renderable content (Schema container)', () => {
    expect(isOutlinerContentNodeType('tagDef')).toBe(true);
  });

  it('filters structural/internal nodes from content rows', () => {
    expect(isOutlinerContentNodeType('fieldEntry')).toBe(false);
    expect(isOutlinerContentNodeType('fieldDef')).toBe(false);
    expect(isOutlinerContentNodeType('queryCondition')).toBe(false);
  });
});
