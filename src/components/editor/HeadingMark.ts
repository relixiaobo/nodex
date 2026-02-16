import { Mark, mergeAttributes } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    headingMark: {
      setHeadingMark: () => ReturnType;
      toggleHeadingMark: () => ReturnType;
      unsetHeadingMark: () => ReturnType;
    };
  }
}

export const HeadingMark = Mark.create({
  name: 'headingMark',

  parseHTML() {
    return [{ tag: 'span[data-heading-mark]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ 'data-heading-mark': 'true' }, HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setHeadingMark: () => ({ commands }) => commands.setMark(this.name),
      toggleHeadingMark: () => ({ commands }) => commands.toggleMark(this.name),
      unsetHeadingMark: () => ({ commands }) => commands.unsetMark(this.name),
    };
  },
});
