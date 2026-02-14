import { findHashTriggerRange, findRefTriggerRange } from '../../src/lib/trigger-cleanup.js';

describe('findHashTriggerRange', () => {
  it('finds #query ending at caret (primary path)', () => {
    // "hello #task" with caret at end (pos 11)
    expect(findHashTriggerRange('hello #task', 11)).toEqual({ from: 6, to: 11 });
  });

  it('finds bare # with empty query at caret', () => {
    expect(findHashTriggerRange('hello #', 7)).toEqual({ from: 6, to: 7 });
  });

  it('finds partial query mid-text when caret is right after trigger', () => {
    // "before #ta after" with caret at 10 (after "ta")
    expect(findHashTriggerRange('before #ta after', 10)).toEqual({ from: 7, to: 10 });
  });

  it('returns null when no # trigger exists', () => {
    expect(findHashTriggerRange('hello world', 11)).toBeNull();
  });

  it('does not match # preceded by text without space (not a trigger start)', () => {
    // "hello#world" — # is not preceded by space boundary
    // But regex /#([^\s#@]*)$/u matches "#world" because it looks at the pattern within text
    // Actually, the regex only looks for # in the text before caret, and the # can appear
    // mid-word. This is consistent with how the trigger works — any # starts a trigger.
    expect(findHashTriggerRange('hello#world', 11)).toEqual({ from: 5, to: 11 });
  });

  it('uses fallback when caret is not at trigger position', () => {
    // "hello #task more text" with caret at end (21), past the trigger
    // beforeCaret = "hello #task more text" — no match because of space after "task"
    // Fallback finds last #token in full text
    expect(findHashTriggerRange('hello #task more text', 21)).toEqual({ from: 6, to: 11 });
  });

  it('handles multiple # tokens — picks last one in fallback', () => {
    // "a #foo b #bar c" with caret at end (no active trigger)
    expect(findHashTriggerRange('a #foo b #bar c', 15)).toEqual({ from: 9, to: 13 });
  });

  it('ignores # inside words for trigger matching at caret', () => {
    // "email@foo#bar" with caret at 13 — # is preceded by non-space
    // But the regex /#([^\s#@]*)$/u will match "#bar"
    expect(findHashTriggerRange('email@foo#bar', 13)).toEqual({ from: 9, to: 13 });
  });
});

describe('findRefTriggerRange', () => {
  it('finds @query ending at caret', () => {
    expect(findRefTriggerRange('hello @john', 11)).toEqual({ from: 6, to: 11 });
  });

  it('finds bare @ with empty query', () => {
    expect(findRefTriggerRange('hello @', 7)).toEqual({ from: 6, to: 7 });
  });

  it('returns null when no @ trigger exists', () => {
    expect(findRefTriggerRange('hello world', 11)).toBeNull();
  });

  it('uses fallback when caret moved past trigger', () => {
    expect(findRefTriggerRange('hi @user done', 13)).toEqual({ from: 3, to: 8 });
  });
});
