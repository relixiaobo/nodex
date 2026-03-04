/**
 * Lightweight highlight.js wrapper — registers ~12 common languages.
 * Auto-detects language when `codeLanguage` is not set.
 */
import hljs from 'highlight.js/lib/core';

// ── Register languages ──
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import css from 'highlight.js/lib/languages/css';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import xml from 'highlight.js/lib/languages/xml';
import sql from 'highlight.js/lib/languages/sql';
import markdown from 'highlight.js/lib/languages/markdown';
import rust from 'highlight.js/lib/languages/rust';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('css', css);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);          // HTML = XML grammar
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('go', go);
hljs.registerLanguage('java', java);

/** Languages available in the language selector (display label → hljs name). */
export const SUPPORTED_LANGUAGES: { label: string; value: string }[] = [
  { label: 'Plain text', value: '' },
  { label: 'JavaScript', value: 'javascript' },
  { label: 'TypeScript', value: 'typescript' },
  { label: 'Python', value: 'python' },
  { label: 'CSS', value: 'css' },
  { label: 'JSON', value: 'json' },
  { label: 'Bash', value: 'bash' },
  { label: 'HTML', value: 'html' },
  { label: 'XML', value: 'xml' },
  { label: 'SQL', value: 'sql' },
  { label: 'Markdown', value: 'markdown' },
  { label: 'Rust', value: 'rust' },
  { label: 'Go', value: 'go' },
  { label: 'Java', value: 'java' },
];

/**
 * Returns highlighted HTML for the given code.
 * When `language` is empty/undefined, auto-detects from registered subset.
 * Returns escaped plain text if detection fails or language is unsupported.
 */
export function highlightCode(code: string, language?: string): string {
  if (!code) return '';

  // Explicit language
  if (language) {
    try {
      const result = hljs.highlight(code, { language });
      return result.value;
    } catch {
      // Unknown language — fall through to auto-detect
    }
  }

  // Auto-detect
  const auto = hljs.highlightAuto(code);
  // Only use auto-detect if confidence is reasonable
  if (auto.relevance > 3) {
    return auto.value;
  }

  // No highlight — return escaped HTML
  return escapeHtml(code);
}

/** Returns the detected language name (or empty string). */
export function detectLanguage(code: string): string {
  if (!code) return '';
  const auto = hljs.highlightAuto(code);
  return auto.relevance > 3 ? (auto.language ?? '') : '';
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
