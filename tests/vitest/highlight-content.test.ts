import { describe, it, expect, beforeEach } from 'vitest';
import {
  renderHighlight,
  removeHighlightRendering,
  clearAllHighlightRenderings,
} from '../../src/entrypoints/content/highlight.js';

function createRangeForText(node: Text, start: number, end: number): Range {
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  return range;
}

describe('content highlight rendering', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    if (!customElements.get('soma-hl')) {
      customElements.define('soma-hl', class extends HTMLElement {});
    }
  });

  it('renders a highlight for selection inside a single text node', () => {
    document.body.innerHTML = '<p id="content">hello world</p>';
    const textNode = document.querySelector('#content')!.firstChild as Text;
    const range = createRangeForText(textNode, 0, 5);

    renderHighlight(range, 'hl_1');

    const highlights = document.querySelectorAll('soma-hl[data-highlight-id="hl_1"]');
    expect(highlights).toHaveLength(1);
    expect(highlights[0].textContent).toBe('hello');
  });

  it('can remove rendered highlight wrapper and keep text content', () => {
    document.body.innerHTML = '<p id="content">hello world</p>';
    const textNode = document.querySelector('#content')!.firstChild as Text;
    const range = createRangeForText(textNode, 0, 5);

    renderHighlight(range, 'hl_2');
    removeHighlightRendering('hl_2');

    expect(document.querySelectorAll('soma-hl')).toHaveLength(0);
    expect(document.querySelector('#content')!.textContent).toBe('hello world');
  });

  it('renders highlight with custom CSS background color', () => {
    document.body.innerHTML = '<p id="content">hello world</p>';
    const textNode = document.querySelector('#content')!.firstChild as Text;
    const range = createRangeForText(textNode, 0, 5);

    renderHighlight(range, 'hl_3', 'rgba(155, 124, 56, 0.3)');

    const highlights = document.querySelectorAll('soma-hl[data-highlight-id="hl_3"]');
    expect(highlights).toHaveLength(1);
    expect((highlights[0] as HTMLElement).style.backgroundColor).toBe('rgba(155, 124, 56, 0.3)');
  });

  it('clears all rendered highlights on the page', () => {
    document.body.innerHTML = '<p id="a">hello world</p><p id="b">another line</p>';
    const textNodeA = document.querySelector('#a')!.firstChild as Text;
    const textNodeB = document.querySelector('#b')!.firstChild as Text;

    const rangeA = createRangeForText(textNodeA, 0, 5);
    renderHighlight(rangeA, 'hl_a');

    const rangeB = createRangeForText(textNodeB, 0, 7);
    renderHighlight(rangeB, 'hl_b');

    expect(document.querySelectorAll('soma-hl')).toHaveLength(2);

    clearAllHighlightRenderings();

    expect(document.querySelectorAll('soma-hl')).toHaveLength(0);
    expect(document.querySelector('#a')!.textContent).toBe('hello world');
    expect(document.querySelector('#b')!.textContent).toBe('another line');
  });
});
