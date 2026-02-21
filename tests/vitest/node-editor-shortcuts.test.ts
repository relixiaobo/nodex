import {
  resolveContentRowArrowIntent,
  resolveContentRowEnterIntent,
  resolveContentRowEscapeIntent,
  resolveContentRowForceCreateIntent,
} from '../../src/lib/row-interactions.js';

describe('node editor shortcut resolver', () => {
  it('resolves enter intent with dropdown priority', () => {
    expect(resolveContentRowEnterIntent({
      referenceActive: true,
      hashTagActive: true,
      slashActive: true,
    })).toBe('reference_confirm');
    expect(resolveContentRowEnterIntent({
      referenceActive: false,
      hashTagActive: true,
      slashActive: true,
    })).toBe('hashtag_confirm');
    expect(resolveContentRowEnterIntent({
      referenceActive: false,
      hashTagActive: false,
      slashActive: true,
    })).toBe('slash_confirm');
    expect(resolveContentRowEnterIntent({
      referenceActive: false,
      hashTagActive: false,
      slashActive: false,
    })).toBe('create_or_split');
  });

  it('resolves arrow intent with dropdown and boundary priority', () => {
    expect(
      resolveContentRowArrowIntent({
        referenceActive: true,
        hashTagActive: false,
        slashActive: false,
        isAtBoundary: true,
      }),
    ).toBe('reference_nav');

    expect(
      resolveContentRowArrowIntent({
        referenceActive: false,
        hashTagActive: true,
        slashActive: false,
        isAtBoundary: true,
      }),
    ).toBe('hashtag_nav');

    expect(
      resolveContentRowArrowIntent({
        referenceActive: false,
        hashTagActive: false,
        slashActive: true,
        isAtBoundary: true,
      }),
    ).toBe('slash_nav');

    expect(
      resolveContentRowArrowIntent({
        referenceActive: false,
        hashTagActive: false,
        slashActive: false,
        isAtBoundary: true,
      }),
    ).toBe('navigate_outliner');

    expect(
      resolveContentRowArrowIntent({
        referenceActive: false,
        hashTagActive: false,
        slashActive: false,
        isAtBoundary: false,
      }),
    ).toBe('allow_default');
  });

  it('resolves escape and force-create intents', () => {
    expect(resolveContentRowEscapeIntent({
      referenceActive: true,
      hashTagActive: false,
      slashActive: true,
    })).toBe('reference_close');
    expect(resolveContentRowEscapeIntent({
      referenceActive: false,
      hashTagActive: true,
      slashActive: true,
    })).toBe('hashtag_close');
    expect(resolveContentRowEscapeIntent({
      referenceActive: false,
      hashTagActive: false,
      slashActive: true,
    })).toBe('slash_close');
    expect(resolveContentRowEscapeIntent({
      referenceActive: false,
      hashTagActive: false,
      slashActive: false,
    })).toBe('select_current');

    expect(resolveContentRowForceCreateIntent({
      referenceActive: true,
      hashTagActive: false,
      slashActive: true,
    })).toBe('reference_create');
    expect(resolveContentRowForceCreateIntent({
      referenceActive: false,
      hashTagActive: true,
      slashActive: true,
    })).toBe('hashtag_create');
    expect(resolveContentRowForceCreateIntent({
      referenceActive: false,
      hashTagActive: false,
      slashActive: true,
    })).toBe('noop');
    expect(resolveContentRowForceCreateIntent({
      referenceActive: false,
      hashTagActive: false,
      slashActive: false,
    })).toBe('toggle_done');
  });
});
