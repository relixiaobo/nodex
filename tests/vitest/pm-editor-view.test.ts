import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { pmSchema } from '../../src/components/editor/pm-schema.js';
import { docToMarks, marksToDoc } from '../../src/lib/pm-doc-utils.js';
import {
  deleteEditorRange,
  isEditorViewAlive,
  replaceEditorRangeWithInlineRef,
  replaceEditorRangeWithText,
  setEditorPlainTextContent,
  setEditorSelection,
  toggleHeadingMark,
} from '../../src/lib/pm-editor-view.js';

function createView(text: string): { mount: HTMLDivElement; view: EditorView } {
  const mount = document.createElement('div');
  document.body.appendChild(mount);

  const state = EditorState.create({
    schema: pmSchema,
    doc: marksToDoc(text, [], []),
  });

  const view = new EditorView(mount, { state });
  return { mount, view };
}

describe('pm-editor-view helpers', () => {
  it('deletes a text range and keeps cursor at range start', () => {
    const { mount, view } = createView('abc');

    deleteEditorRange(view, 2, 3);

    const parsed = docToMarks(view.state.doc);
    expect(parsed.text).toBe('ac');
    expect(view.state.selection.from).toBe(2);

    view.destroy();
    mount.remove();
  });

  it('replaces a range with plain text', () => {
    const { mount, view } = createView('abc');

    replaceEditorRangeWithText(view, 2, 3, 'ZZ');

    const parsed = docToMarks(view.state.doc);
    expect(parsed.text).toBe('aZZc');

    view.destroy();
    mount.remove();
  });

  it('replaces a range with inline reference atom', () => {
    const { mount, view } = createView('abcd');

    replaceEditorRangeWithInlineRef(view, 2, 4, 'task_1', 'Task 1');

    const parsed = docToMarks(view.state.doc);
    expect(parsed.text).toBe('a\uFFFCd');
    expect(parsed.inlineRefs).toEqual([
      { offset: 1, targetNodeId: 'task_1', displayName: 'Task 1' },
    ]);

    view.destroy();
    mount.remove();
  });

  it('toggles heading mark on a selected range', () => {
    const { mount, view } = createView('Hello');

    setEditorSelection(view, 1, 6);
    toggleHeadingMark(view);

    const parsed = docToMarks(view.state.doc);
    expect(parsed.marks).toEqual([
      { start: 0, end: 5, type: 'headingMark' },
    ]);

    view.destroy();
    mount.remove();
  });

  it('replaces whole content with plain text', () => {
    const { mount, view } = createView('Old text');

    setEditorPlainTextContent(view, 'New title');

    const parsed = docToMarks(view.state.doc);
    expect(parsed).toEqual({
      text: 'New title',
      marks: [],
      inlineRefs: [],
    });

    view.destroy();
    mount.remove();
  });

  it('reports editor lifecycle with isEditorViewAlive', () => {
    const { mount, view } = createView('x');

    expect(isEditorViewAlive(view)).toBe(true);
    view.destroy();
    expect(isEditorViewAlive(view)).toBe(false);

    mount.remove();
  });
});
