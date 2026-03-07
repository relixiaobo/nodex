import { describe, it, expect, beforeEach } from 'vitest';
import {
  renderHighlight,
  removeHighlightRendering,
  clearAllHighlightRenderings,
  findOverlappingHighlightId,
} from '../../src/entrypoints/content/highlight.js';
import type {
  HighlightActionsCallbacks,
  NotePopoverCallbacks,
} from '../../src/entrypoints/content/highlight-toolbar.js';

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

    renderHighlight(range, 'hl_3', '#9B7C38');

    const highlights = document.querySelectorAll('soma-hl[data-highlight-id="hl_3"]');
    expect(highlights).toHaveLength(1);
    const style = (highlights[0] as HTMLElement).style;
    expect(style.backgroundColor).toBe('rgba(247, 236, 139, 0.6)');
    expect(style.borderBottom).toContain('2px solid');
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

  it('renders filled dot when hasNote option is true', () => {
    document.body.innerHTML = '<p id="content">hello world</p>';
    const textNode = document.querySelector('#content')!.firstChild as Text;
    const range = createRangeForText(textNode, 0, 5);

    renderHighlight(range, 'hl_comment', 'rgba(155, 124, 56, 0.3)', { hasNote: true });

    const dot = document.querySelector(
      'soma-hl[data-highlight-id="hl_comment"] [data-soma-dot="filled"]',
    );
    expect(dot).toBeTruthy();
  });

  it('renders hollow dot when hasNote option is false', () => {
    document.body.innerHTML = '<p id="content">hello world</p>';
    const textNode = document.querySelector('#content')!.firstChild as Text;
    const range = createRangeForText(textNode, 0, 5);

    renderHighlight(range, 'hl_bare');

    const dot = document.querySelector(
      'soma-hl[data-highlight-id="hl_bare"] [data-soma-dot="hollow"]',
    );
    expect(dot).toBeTruthy();
  });

  it('renders highlight correctly when range endContainer is an Element (double-click selection)', () => {
    // Simulates double-click paragraph selection where the browser sets
    // endContainer to the <p> element (not a text node), endOffset = 1.
    document.body.innerHTML =
      '<div id="root"><p id="p1">First paragraph</p><p id="p2">Second paragraph</p></div>';

    const p1 = document.querySelector('#p1')!;
    const textNode = p1.firstChild as Text;

    // Range: start in text node, end at Element boundary
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(p1, 1); // endContainer = <p>, endOffset = 1 (after first child)

    renderHighlight(range, 'hl_dblclick');

    const highlights = document.querySelectorAll('soma-hl[data-highlight-id="hl_dblclick"]');
    expect(highlights).toHaveLength(1);
    expect(highlights[0].textContent).toBe('First paragraph');

    // Second paragraph must NOT be highlighted
    const p2 = document.querySelector('#p2')!;
    expect(p2.querySelector('soma-hl')).toBeNull();
    expect(p2.textContent).toBe('Second paragraph');
  });

  it('handles cross-paragraph selection with Element endContainer', () => {
    document.body.innerHTML =
      '<div id="root"><p id="p1">First</p><p id="p2">Second</p><p id="p3">Third</p></div>';

    const root = document.querySelector('#root')!;
    const p1Text = document.querySelector('#p1')!.firstChild as Text;

    // Range: from "First" to end of <p id="p2"> (element boundary)
    const range = document.createRange();
    range.setStart(p1Text, 0);
    range.setEnd(root, 2); // After the second child (p2)

    renderHighlight(range, 'hl_cross');

    const highlights = document.querySelectorAll('soma-hl[data-highlight-id="hl_cross"]');
    expect(highlights).toHaveLength(2);
    expect(highlights[0].textContent).toBe('First');
    expect(highlights[1].textContent).toBe('Second');

    // Third paragraph must NOT be highlighted
    expect(document.querySelector('#p3')!.querySelector('soma-hl')).toBeNull();
  });
});

describe('findOverlappingHighlightId', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    if (!customElements.get('soma-hl')) {
      customElements.define('soma-hl', class extends HTMLElement {});
    }
  });

  it('detects overlap when selection is inside a single <soma-hl>', () => {
    document.body.innerHTML = '<p><soma-hl data-highlight-id="abc">highlighted text</soma-hl></p>';
    const textNode = document.querySelector('soma-hl')!.firstChild as Text;
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 11); // "highlighted"

    expect(findOverlappingHighlightId(range)).toBe('abc');
  });

  it('detects overlap on double-click when endContainer is parent Element', () => {
    // After highlighting, DOM looks like: <p><soma-hl id="abc">Full text</soma-hl></p>
    // Double-click creates range: startContainer=text inside soma-hl, endContainer=<p>, endOffset=1
    document.body.innerHTML = '<p id="p1"><soma-hl data-highlight-id="abc">Full paragraph text</soma-hl></p>';

    const textNode = document.querySelector('soma-hl')!.firstChild as Text;
    const p1 = document.querySelector('#p1')!;
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(p1, 1); // endContainer = <p>, endOffset = 1

    expect(findOverlappingHighlightId(range)).toBe('abc');
  });

  it('returns null when selection extends beyond highlight', () => {
    document.body.innerHTML =
      '<p><soma-hl data-highlight-id="abc">highlighted</soma-hl> not highlighted</p>';
    const textNode = document.querySelector('soma-hl')!.firstChild as Text;
    const p = document.querySelector('p')!;
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(p, 2); // Includes both <soma-hl> and the text after it

    expect(findOverlappingHighlightId(range)).toBeNull();
  });

  it('returns null when no highlights exist in selection', () => {
    document.body.innerHTML = '<p id="p1">plain text</p>';
    const textNode = document.querySelector('#p1')!.firstChild as Text;
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 5);

    expect(findOverlappingHighlightId(range)).toBeNull();
  });

  it('detects overlap across multi-element highlight with same ID', () => {
    // A cross-element highlight produces multiple <soma-hl> with the same ID
    document.body.innerHTML =
      '<div id="root"><p><soma-hl data-highlight-id="xyz">First part</soma-hl></p>' +
      '<p><soma-hl data-highlight-id="xyz">Second part</soma-hl></p></div>';
    const root = document.querySelector('#root')!;
    const firstText = root.querySelector('soma-hl')!.firstChild as Text;
    const range = document.createRange();
    range.setStart(firstText, 0);
    range.setEnd(root, 2); // Covers both <p> elements

    expect(findOverlappingHighlightId(range)).toBe('xyz');
  });
});

describe('highlight toolbar interfaces', () => {
  it('HighlightActionsCallbacks has single onOpenNote callback', () => {
    const cb: HighlightActionsCallbacks = { onOpenNote: () => {} };
    expect(cb.onOpenNote).toBeTypeOf('function');
    // Should NOT have onDelete or onAddNote (moved to NotePopoverCallbacks)
    expect('onDelete' in cb).toBe(false);
  });

  it('NotePopoverCallbacks has optional onDelete', () => {
    const cb: NotePopoverCallbacks = {
      onSave: () => {},
      onCancel: () => {},
      onDelete: () => {},
    };
    expect(cb.onDelete).toBeTypeOf('function');

    // onDelete is optional
    const cbWithout: NotePopoverCallbacks = {
      onSave: () => {},
      onCancel: () => {},
    };
    expect(cbWithout.onDelete).toBeUndefined();
  });
});
