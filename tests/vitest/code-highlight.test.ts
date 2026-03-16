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

    it('escapes HTML entities when no language matches', () => {
      const html = highlightCode('just some "text" & symbols < > here');
      expect(html).toContain('&amp;');
      expect(html).toContain('&quot;');
      expect(html).toContain('&lt;');
      expect(html).toContain('&gt;');
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

    // Structural heuristics
    it('detects JSON object', () => {
      expect(detectLanguage('{ "name": "test" }')).toBe('json');
    });

    it('detects JSON array', () => {
      expect(detectLanguage('[\n  1, 2, 3\n]')).toBe('json');
    });

    it('detects JSON with leading whitespace', () => {
      expect(detectLanguage('  \n  { "key": "value" }')).toBe('json');
    });

    it('detects JSON with long embedded text values', () => {
      const json = JSON.stringify({ text: 'A very long natural language paragraph that would confuse auto-detect...'.repeat(20), offset: 0 }, null, 2);
      expect(detectLanguage(json)).toBe('json');
    });

    it('detects HTML', () => {
      expect(detectLanguage('<div class="app">\n  <p>Hello</p>\n</div>')).toBe('html');
    });

    it('detects SQL (case-insensitive)', () => {
      expect(detectLanguage('SELECT id, name FROM users WHERE active = true')).toBe('sql');
      expect(detectLanguage('select * from orders')).toBe('sql');
      expect(detectLanguage('INSERT INTO users (name) VALUES ("test")')).toBe('sql');
    });

    it('detects bash shebang', () => {
      expect(detectLanguage('#!/bin/bash\necho "hello"')).toBe('bash');
    });

    // hljs auto-detect fallback
    it('detects JavaScript-like code via hljs fallback', () => {
      const lang = detectLanguage(
        `function add(a, b) {\n  return a + b;\n}\nconsole.log(add(1, 2));`,
      );
      expect(lang.length).toBeGreaterThan(0);
    });
  });
});
