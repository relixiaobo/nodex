import {
  resolveNodeEditorArrowIntent,
  resolveNodeEditorEnterIntent,
  resolveNodeEditorEscapeIntent,
  resolveNodeEditorForceCreateIntent,
} from '../../src/lib/node-editor-shortcuts.js';

describe('node editor shortcut resolver', () => {
  it('resolves enter intent with dropdown priority', () => {
    expect(resolveNodeEditorEnterIntent({
      referenceActive: true,
      hashTagActive: true,
      slashActive: true,
    })).toBe('reference_confirm');
    expect(resolveNodeEditorEnterIntent({
      referenceActive: false,
      hashTagActive: true,
      slashActive: true,
    })).toBe('hashtag_confirm');
    expect(resolveNodeEditorEnterIntent({
      referenceActive: false,
      hashTagActive: false,
      slashActive: true,
    })).toBe('slash_confirm');
    expect(resolveNodeEditorEnterIntent({
      referenceActive: false,
      hashTagActive: false,
      slashActive: false,
    })).toBe('create_or_split');
  });

  it('resolves arrow intent with dropdown and boundary priority', () => {
    expect(
      resolveNodeEditorArrowIntent({
        referenceActive: true,
        hashTagActive: false,
        slashActive: false,
        isAtBoundary: true,
      }),
    ).toBe('reference_nav');

    expect(
      resolveNodeEditorArrowIntent({
        referenceActive: false,
        hashTagActive: true,
        slashActive: false,
        isAtBoundary: true,
      }),
    ).toBe('hashtag_nav');

    expect(
      resolveNodeEditorArrowIntent({
        referenceActive: false,
        hashTagActive: false,
        slashActive: true,
        isAtBoundary: true,
      }),
    ).toBe('slash_nav');

    expect(
      resolveNodeEditorArrowIntent({
        referenceActive: false,
        hashTagActive: false,
        slashActive: false,
        isAtBoundary: true,
      }),
    ).toBe('navigate_outliner');

    expect(
      resolveNodeEditorArrowIntent({
        referenceActive: false,
        hashTagActive: false,
        slashActive: false,
        isAtBoundary: false,
      }),
    ).toBe('allow_default');
  });

  it('resolves escape and force-create intents', () => {
    expect(resolveNodeEditorEscapeIntent(true, false, true)).toBe('reference_close');
    expect(resolveNodeEditorEscapeIntent(false, true, true)).toBe('hashtag_close');
    expect(resolveNodeEditorEscapeIntent(false, false, true)).toBe('slash_close');
    expect(resolveNodeEditorEscapeIntent(false, false, false)).toBe('allow_default');

    expect(resolveNodeEditorForceCreateIntent(true, false, true)).toBe('reference_create');
    expect(resolveNodeEditorForceCreateIntent(false, true, true)).toBe('hashtag_create');
    expect(resolveNodeEditorForceCreateIntent(false, false, true)).toBe('noop');
    expect(resolveNodeEditorForceCreateIntent(false, false, false)).toBe('toggle_done');
  });
});
