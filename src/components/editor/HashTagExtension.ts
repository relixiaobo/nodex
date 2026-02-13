/**
 * TipTap extension that detects `#query` patterns and emits callbacks.
 * When user types `#` followed by text, we notify the parent to show
 * a tag selector popup. The parent removes the `#query` text and applies
 * the tag via store actions.
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export interface HashTagCallbacks {
  onActivate: (query: string, from: number, to: number) => void;
  onDeactivate: () => void;
}

const hashTagPluginKey = new PluginKey('hashTag');

export const HashTagExtension = Extension.create<{ callbacks: { current: HashTagCallbacks } }>({
  name: 'hashTag',

  addOptions() {
    return {
      callbacks: { current: { onActivate: () => {}, onDeactivate: () => {} } },
    };
  },

  addProseMirrorPlugins() {
    const { callbacks } = this.options;

    return [
      new Plugin({
        key: hashTagPluginKey,
        view() {
          let active = false;
          return {
            update(view, prevState) {
              // Skip spurious updates where doc/selection haven't changed
              // (e.g., from TipTap setOptions or view.setProps during re-renders)
              if (prevState && view.state.doc.eq(prevState.doc) &&
                  view.state.selection.eq(prevState.selection)) {
                return;
              }

              // Only trigger on doc changes (user typed something),
              // not on selection-only changes (focus, arrow keys).
              // !prevState = initial mount → treat as no change (prevents
              // triggering on focus when text already contains #).
              const docChanged = !!prevState && !view.state.doc.eq(prevState.doc);

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

              // Look for # pattern at the end: #word
              const match = textBefore.match(/#(\w*)$/);
              if (match && (docChanged || active)) {
                active = true;
                const query = match[1];
                const hashStart = from - match[0].length;
                callbacks.current.onActivate(query, hashStart, from);
              } else {
                if (active) callbacks.current.onDeactivate();
                active = false;
              }
            },
          };
        },
      }),
    ];
  },
});
