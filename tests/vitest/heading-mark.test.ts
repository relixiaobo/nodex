import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { HeadingMark } from '../../src/components/editor/HeadingMark.js';

describe('HeadingMark extension', () => {
  let editor: Editor;

  afterEach(() => {
    editor?.destroy();
  });

  it('applies heading mark to selected text', () => {
    editor = new Editor({
      extensions: [StarterKit.configure({ heading: false }), HeadingMark],
      content: '<p>Hello world</p>',
    });

    editor.commands.setTextSelection({ from: 1, to: 6 });
    editor.commands.toggleHeadingMark();

    expect(editor.getHTML()).toContain('data-heading-mark="true"');
    expect(editor.getHTML()).toContain('Hello');
  });

  it('toggles heading mark off when applied twice to same range', () => {
    editor = new Editor({
      extensions: [StarterKit.configure({ heading: false }), HeadingMark],
      content: '<p>Hello world</p>',
    });

    editor.commands.setTextSelection({ from: 1, to: 6 });
    editor.commands.toggleHeadingMark();
    editor.commands.setTextSelection({ from: 1, to: 6 });
    editor.commands.toggleHeadingMark();

    expect(editor.getHTML()).not.toContain('data-heading-mark="true"');
  });
});
