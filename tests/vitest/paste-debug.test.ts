import { describe, expect, it } from 'vitest';
import {
  isPasteDebugEnabled,
  PASTE_DEBUG_STORAGE_KEY,
  previewMultiline,
  summarizePasteNodes,
} from '../../src/lib/paste-debug.js';

describe('paste-debug', () => {
  it('is disabled by default', () => {
    expect(isPasteDebugEnabled()).toBe(false);
  });

  it('reads localStorage switch values', () => {
    localStorage.setItem(PASTE_DEBUG_STORAGE_KEY, '1');
    expect(isPasteDebugEnabled()).toBe(true);

    localStorage.setItem(PASTE_DEBUG_STORAGE_KEY, 'true');
    expect(isPasteDebugEnabled()).toBe(true);

    localStorage.setItem(PASTE_DEBUG_STORAGE_KEY, 'off');
    expect(isPasteDebugEnabled()).toBe(false);
  });

  it('accepts window global runtime flag', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__SOMA_PASTE_DEBUG = true;
    expect(isPasteDebugEnabled()).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).__SOMA_PASTE_DEBUG;
  });

  it('builds concise multiline previews', () => {
    const preview = previewMultiline('A\nB\nC', 2);
    expect(preview).toEqual(['01: A', '02: B']);
  });

  it('summarizes parsed node trees', () => {
    const summary = summarizePasteNodes([{
      name: 'Parent',
      type: 'text',
      marks: [{ type: 'bold' }],
      children: [{
        name: 'Child',
        type: 'codeBlock',
        codeLanguage: 'ts',
        children: [],
      }],
    } as never]);

    expect(summary).toHaveLength(1);
    expect(summary[0].name).toBe('Parent');
    expect(summary[0].childrenCount).toBe(1);
    const child = (summary[0].children as Array<Record<string, unknown>>)[0];
    expect(child.type).toBe('codeBlock');
    expect(child.codeLanguage).toBe('ts');
  });
});
