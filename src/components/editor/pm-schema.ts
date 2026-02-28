import { Schema } from 'prosemirror-model';
import { resolveHighlightBulletColor, resolveInlineReferenceTextColor } from '../../lib/tag-colors.js';

export const pmSchema = new Schema({
  nodes: {
    doc: { content: 'paragraph' },
    paragraph: {
      content: 'inline*',
      parseDOM: [{ tag: 'p' }],
      toDOM() {
        return ['p', 0];
      },
    },
    text: { group: 'inline' },
    inlineReference: {
      group: 'inline',
      inline: true,
      atom: true,
      attrs: {
        targetNodeId: { default: '' },
        displayName: { default: '' },
      },
      toDOM(node) {
        const refColor = resolveInlineReferenceTextColor(node.attrs.targetNodeId);
        const highlightColor = resolveHighlightBulletColor(node.attrs.targetNodeId);
        const bgStyle = highlightColor ? `background:${highlightColor}20;` : '';
        return ['span', {
          class: `inline-ref${highlightColor ? ' inline-ref-highlight' : ''}`,
          'data-inlineref-node': node.attrs.targetNodeId,
          contenteditable: 'false',
          style: `color:${refColor};--inline-ref-accent:${refColor};${bgStyle}`,
        }, node.attrs.displayName || '...'];
      },
      parseDOM: [{
        tag: 'span[data-inlineref-node]',
        getAttrs(dom) {
          const el = dom as HTMLElement;
          return {
            targetNodeId: el.getAttribute('data-inlineref-node') ?? '',
            displayName: el.textContent ?? '',
          };
        },
      }],
    },
  },
  marks: {
    bold: {
      parseDOM: [{ tag: 'strong' }, { tag: 'b' }],
      toDOM() {
        return ['strong', 0];
      },
    },
    italic: {
      parseDOM: [{ tag: 'em' }, { tag: 'i' }],
      toDOM() {
        return ['em', 0];
      },
    },
    strike: {
      parseDOM: [{ tag: 's' }, { tag: 'strike' }, { tag: 'del' }],
      toDOM() {
        return ['s', 0];
      },
    },
    code: {
      parseDOM: [{ tag: 'code' }],
      toDOM() {
        return ['code', { class: 'pm-code' }, 0];
      },
    },
    highlight: {
      parseDOM: [{ tag: 'mark' }],
      toDOM() {
        return ['mark', { class: 'pm-highlight' }, 0];
      },
    },
    headingMark: {
      parseDOM: [{ tag: 'span[data-heading-mark="true"]' }],
      toDOM() {
        return ['span', { 'data-heading-mark': 'true' }, 0];
      },
    },
    link: {
      attrs: { href: { default: '' } },
      inclusive: false,
      parseDOM: [{
        tag: 'a[href]',
        getAttrs(dom) {
          const href = (dom as HTMLAnchorElement).getAttribute('href') ?? '';
          return { href };
        },
      }],
      toDOM(node) {
        return ['a', { href: node.attrs.href, title: node.attrs.href }, 0];
      },
    },
  },
});
