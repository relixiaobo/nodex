import { Schema } from '@tiptap/pm/model';

export const pmSchema = new Schema({
  nodes: {
    doc: { content: 'paragraph' },
    paragraph: { content: 'inline*' },
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
        return ['span', {
          class: 'inline-ref',
          'data-inlineref-node': node.attrs.targetNodeId,
          contenteditable: 'false',
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
        return ['a', { href: node.attrs.href }, 0];
      },
    },
  },
});

