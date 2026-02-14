/**
 * TipTap custom Node for inline references.
 *
 * Renders `<span data-inlineref-node="nodeId">Display Name</span>` as an
 * atomic (non-editable) inline element in the editor. Preserves the
 * Tana-compatible HTML encoding for inline node references.
 */
import { Node, mergeAttributes } from '@tiptap/core';

export const InlineRefNode = Node.create({
  name: 'inlineRef',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      nodeId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-inlineref-node'),
        renderHTML: (attributes) => ({
          'data-inlineref-node': attributes.nodeId,
        }),
      },
      label: {
        default: '',
        parseHTML: (element) => element.textContent ?? '',
        renderHTML: (attributes) => ({
          'data-label': attributes.label,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-inlineref-node]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const label = HTMLAttributes['data-label'] || '';
    // Remove data-label from DOM attributes — it's only used internally
    const { 'data-label': _, ...rest } = HTMLAttributes;
    return [
      'span',
      mergeAttributes(rest, {
        'data-inlineref-node': HTMLAttributes['data-inlineref-node'],
        class: 'inline-ref',
      }),
      label,
    ];
  },
});
