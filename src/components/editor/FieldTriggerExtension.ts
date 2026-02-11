/**
 * TipTap extension that detects `>` at position 0 of an empty node.
 * Fires once immediately — the parent handler creates the field
 * and deletes the current node.
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export interface FieldTriggerCallbacks {
  onActivate: () => void;
}

const fieldTriggerPluginKey = new PluginKey('fieldTrigger');

export const FieldTriggerExtension = Extension.create<{ callbacks: { current: FieldTriggerCallbacks } }>({
  name: 'fieldTrigger',

  addOptions() {
    return {
      callbacks: { current: { onActivate: () => {} } },
    };
  },

  addProseMirrorPlugins() {
    const { callbacks } = this.options;
    let fired = false;

    return [
      new Plugin({
        key: fieldTriggerPluginKey,
        view() {
          return {
            update(view) {
              const { state } = view;
              const { from } = state.selection;

              const $from = state.doc.resolve(from);
              const textBefore = $from.parent.textBetween(
                0,
                $from.parentOffset,
                undefined,
                '\ufffc',
              );

              // Fire once when `>` is typed at position 0
              if (textBefore === '>' && !fired) {
                fired = true;
                callbacks.current.onActivate();
              } else if (textBefore !== '>') {
                fired = false;
              }
            },
          };
        },
      }),
    ];
  },
});
