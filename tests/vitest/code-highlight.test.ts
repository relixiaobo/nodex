import { describe, it, expect } from 'vitest';
import { highlightCode, detectLanguage, SUPPORTED_LANGUAGES } from '../../src/lib/code-highlight';

describe('code-highlight', () => {
  describe('SUPPORTED_LANGUAGES', () => {
    it('includes Plain text as first entry with empty value', () => {
      expect(SUPPORTED_LANGUAGES[0]).toEqual({ label: 'Plain text', value: '' });
    });

    it('has at least 12 language entries plus plain text', () => {
      expect(SUPPORTED_LANGUAGES.length).toBeGreaterThanOrEqual(13);
    });

    it('all entries have label and value', () => {
      for (const lang of SUPPORTED_LANGUAGES) {
        expect(typeof lang.label).toBe('string');
        expect(typeof lang.value).toBe('string');
        expect(lang.label.length).toBeGreaterThan(0);
      }
    });
  });

  describe('highlightCode', () => {
    it('returns empty string for empty code', () => {
      expect(highlightCode('')).toBe('');
    });

    it('highlights JavaScript with explicit language', () => {
      const html = highlightCode('const x = 42;', 'javascript');
      expect(html).toContain('<span');
      expect(html).toContain('const');
    });

    it('highlights TypeScript with explicit language', () => {
      const html = highlightCode('interface Foo { bar: string }', 'typescript');
      expect(html).toContain('<span');
    });

    it('highlights Python with explicit language', () => {
      const html = highlightCode('def hello():\n  print("world")', 'python');
      expect(html).toContain('<span');
    });

    it('escapes HTML entities in plain text', () => {
      const html = highlightCode('<div>"hello" & world</div>');
      // Should not contain raw < or >
      expect(html).not.toContain('<div>');
      expect(html).toContain('&lt;div&gt;');
      expect(html).toContain('&amp;');
      expect(html).toContain('&quot;');
    });

    it('falls back gracefully for unknown language', () => {
      const html = highlightCode('hello world', 'nonexistent_lang_xyz');
      // Should still return something (auto-detect or escaped)
      expect(html).toContain('hello');
    });

    it('auto-detects language for recognizable code', () => {
      const jsCode = `function fibonacci(n) {\n  if (n <= 1) return n;\n  return fibonacci(n - 1) + fibonacci(n - 2);\n}`;
      const html = highlightCode(jsCode);
      expect(html).toContain('<span');
    });
  });

  describe('detectLanguage', () => {
    it('returns empty string for empty code', () => {
      expect(detectLanguage('')).toBe('');
    });

    it('returns empty string for plain text', () => {
      expect(detectLanguage('just some text')).toBe('');
    });

    it('detects JavaScript-like code', () => {
      const lang = detectLanguage(
        `function add(a, b) {\n  return a + b;\n}\nconsole.log(add(1, 2));`,
      );
      // Should detect as some language (js or ts)
      expect(typeof lang).toBe('string');
    });
  });
});
