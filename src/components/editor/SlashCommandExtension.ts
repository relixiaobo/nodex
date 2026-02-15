/**
 * TipTap extension that detects `/query` patterns and emits callbacks.
 *
 * Reuses the same activation guard pattern as #/@ triggers:
 * activate only after a real doc change since mount.
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export interface SlashCommandCallbacks {
  onActivate: (query: string, from: number, to: number) => void;
  onDeactivate: () => void;
}

const slashCommandPluginKey = new PluginKey('slashCommand');

export const SlashCommandExtension = Extension.create<{ callbacks: { current: SlashCommandCallbacks } }>({
  name: 'slashCommand',

  addOptions() {
    return {
      callbacks: { current: { onActivate: () => {}, onDeactivate: () => {} } },
    };
  },

  addProseMirrorPlugins() {
    const { callbacks } = this.options;

    return [
      new Plugin({
        key: slashCommandPluginKey,
        view() {
          let active = false;
          let hasUserEdited = false;
          return {
            update(view, prevState) {
              if (prevState && view.state.doc.eq(prevState.doc) &&
                  view.state.selection.eq(prevState.selection)) {
                return;
              }

              const docChanged = !!prevState && !view.state.doc.eq(prevState.doc);
              if (docChanged) hasUserEdited = true;

              const { state } = view;
              const { from } = state.selection;

              const $from = state.doc.resolve(from);
              const textBefore = $from.parent.textBetween(
                0,
                $from.parentOffset,
                undefined,
                '\ufffc',
              );

              // Trigger on the last /query token, requiring start-of-line or
              // preceding whitespace to avoid matching URLs.
              const match = textBefore.match(/(?:^|\s)\/([^\s/]*)$/);
              if (match && hasUserEdited && (docChanged || active)) {
                active = true;
                const query = match[1];
                const slashStart = from - (query.length + 1);
                callbacks.current.onActivate(query, slashStart, from);
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
