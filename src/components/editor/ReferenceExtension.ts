/**
 * TipTap extension that detects `@query` patterns and emits callbacks.
 * When user types `@` followed by text, we notify the parent to show
 * a reference selector popup. The parent removes the `@query` text and
 * creates the reference via store actions.
 *
 * Pattern mirrors HashTagExtension.ts exactly — only the trigger char
 * and regex differ.
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export interface ReferenceCallbacks {
  onActivate: (query: string, from: number, to: number) => void;
  onDeactivate: () => void;
}

const referencePluginKey = new PluginKey('reference');

export const ReferenceExtension = Extension.create<{ callbacks: { current: ReferenceCallbacks } }>({
  name: 'reference',

  addOptions() {
    return {
      callbacks: { current: { onActivate: () => {}, onDeactivate: () => {} } },
    };
  },

  addProseMirrorPlugins() {
    const { callbacks } = this.options;

    return [
      new Plugin({
        key: referencePluginKey,
        view() {
          return {
            update(view) {
              const { state } = view;
              const { from } = state.selection;

              // Get text from start of current text block to cursor
              const $from = state.doc.resolve(from);
              const textBefore = $from.parent.textBetween(
                0,
                $from.parentOffset,
                undefined,
                '\ufffc',
              );

              // Match @query at end — broader than # (supports CJK, punctuation)
              const match = textBefore.match(/@([^\s]*)$/);
              if (match) {
                const query = match[1];
                const atStart = from - match[0].length;
                callbacks.current.onActivate(query, atStart, from);
              } else {
                callbacks.current.onDeactivate();
              }
            },
          };
        },
      }),
    ];
  },
});
