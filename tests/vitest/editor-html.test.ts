import { stripWrappingP, wrapInP } from '../../src/lib/editor-html.js';

describe('editor html utils', () => {
  it('strips a single wrapping paragraph and trims whitespace', () => {
    expect(stripWrappingP('  <p>Hello</p>  ')).toBe('Hello');
  });

  it('keeps nested paragraph structures untouched', () => {
    const html = '<p>before <p>nested</p> after</p>';
    expect(stripWrappingP(html)).toBe(html);
  });

  it('wraps plain content in a paragraph', () => {
    expect(wrapInP('hello')).toBe('<p>hello</p>');
  });

  it('keeps paragraph content as-is after trim', () => {
    expect(wrapInP('   <p>already</p>   ')).toBe('<p>already</p>');
  });

  it('returns empty paragraph for empty content', () => {
    expect(wrapInP('')).toBe('<p></p>');
  });
});
