import {
  resolveNodeEditorArrowIntent,
  resolveNodeEditorEnterIntent,
  resolveNodeEditorEscapeIntent,
  resolveNodeEditorForceCreateIntent,
} from '../../src/lib/node-editor-shortcuts.js';

describe('node editor shortcut resolver', () => {
  it('resolves enter intent with dropdown priority', () => {
    expect(resolveNodeEditorEnterIntent({ referenceActive: true, hashTagActive: true })).toBe('reference_confirm');
    expect(resolveNodeEditorEnterIntent({ referenceActive: false, hashTagActive: true })).toBe('hashtag_confirm');
    expect(resolveNodeEditorEnterIntent({ referenceActive: false, hashTagActive: false })).toBe('create_or_split');
  });

  it('resolves arrow intent with dropdown and boundary priority', () => {
    expect(
      resolveNodeEditorArrowIntent({
        referenceActive: true,
        hashTagActive: false,
        isAtBoundary: true,
      }),
    ).toBe('reference_nav');

    expect(
      resolveNodeEditorArrowIntent({
        referenceActive: false,
        hashTagActive: true,
        isAtBoundary: true,
      }),
    ).toBe('hashtag_nav');

    expect(
      resolveNodeEditorArrowIntent({
        referenceActive: false,
        hashTagActive: false,
        isAtBoundary: true,
      }),
    ).toBe('navigate_outliner');

    expect(
      resolveNodeEditorArrowIntent({
        referenceActive: false,
        hashTagActive: false,
        isAtBoundary: false,
      }),
    ).toBe('allow_default');
  });

  it('resolves escape and force-create intents', () => {
    expect(resolveNodeEditorEscapeIntent(true, false)).toBe('reference_close');
    expect(resolveNodeEditorEscapeIntent(false, true)).toBe('hashtag_close');
    expect(resolveNodeEditorEscapeIntent(false, false)).toBe('allow_default');

    expect(resolveNodeEditorForceCreateIntent(true, false)).toBe('reference_create');
    expect(resolveNodeEditorForceCreateIntent(false, true)).toBe('hashtag_create');
    expect(resolveNodeEditorForceCreateIntent(false, false)).toBe('allow_default');
  });
});
