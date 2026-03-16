import {
  Children,
  type ComponentPropsWithoutRef,
  type ReactNode,
  memo,
  useMemo,
} from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Lexer } from 'marked';
import remend from 'remend';
import { highlightCode } from '../../lib/code-highlight.js';
import { CitationBadge } from './CitationBadge.js';
import { NodeReference } from './NodeReference.js';

// ── Inline markup extraction ──

const INLINE_MARKUP_RE = /<(ref|cite)\s+id="([^"]+)">([\s\S]*?)<\/\1>/g;
const PLACEHOLDER_RE = /%%SOMA_(\d+)%%/g;

interface Placeholder {
  kind: 'ref' | 'cite';
  nodeId: string;
  content: string;
}

export function extractInlineMarkup(text: string): { cleaned: string; placeholders: Placeholder[] } {
  const placeholders: Placeholder[] = [];
  const cleaned = text.replace(INLINE_MARKUP_RE, (_match, kind: string, nodeId: string, content: string) => {
    const index = placeholders.length;
    placeholders.push({ kind: kind as 'ref' | 'cite', nodeId, content });
    return `%%SOMA_${index}%%`;
  });
  return { cleaned, placeholders };
}

// ── Block splitting via marked lexer ──

export function splitMarkdownBlocks(text: string): string[] {
  if (!text) return [''];
  try {
    const tokens = Lexer.lex(text);
    return tokens.map((t) => t.raw);
  } catch {
    return [text];
  }
}

// ── Placeholder injection into React children ──

function injectPlaceholders(
  children: ReactNode,
  placeholders: Placeholder[],
  keyPrefix: string,
): ReactNode {
  if (placeholders.length === 0) return children;

  return Children.map(children, (child) => {
    if (typeof child === 'string') {
      // Split on %%SOMA_N%% and interleave components
      const parts: ReactNode[] = [];
      let cursor = 0;
      let partIndex = 0;
      PLACEHOLDER_RE.lastIndex = 0;
      let match = PLACEHOLDER_RE.exec(child);
      while (match) {
        const idx = Number(match[1]);
        const ph = placeholders[idx];
        if (match.index > cursor) {
          parts.push(child.slice(cursor, match.index));
        }
        if (ph) {
          if (ph.kind === 'ref') {
            parts.push(
              <NodeReference key={`${keyPrefix}-ref-${partIndex}`} nodeId={ph.nodeId}>
                {ph.content}
              </NodeReference>,
            );
          } else {
            parts.push(
              <CitationBadge
                key={`${keyPrefix}-cite-${partIndex}`}
                nodeId={ph.nodeId}
                label={ph.content}
              />,
            );
          }
        }
        cursor = match.index + match[0].length;
        partIndex += 1;
        match = PLACEHOLDER_RE.exec(child);
      }
      if (cursor < child.length) {
        parts.push(child.slice(cursor));
      }
      return parts.length === 1 ? parts[0] : <>{parts}</>;
    }
    return child;
  });
}

// ── Markdown component overrides ──

const remarkPlugins = [remarkGfm];

function buildComponents(keyPrefix: string, placeholders: Placeholder[]) {
  function withPlaceholders(children: ReactNode) {
    return injectPlaceholders(children, placeholders, keyPrefix);
  }

  return {
    // Code: inline vs block
    code({ children, className, ...rest }: ComponentPropsWithoutRef<'code'>) {
      const langMatch = className?.match(/language-(\S+)/);
      if (langMatch) {
        const lang = langMatch[1];
        const codeStr = String(children).replace(/\n$/, '');
        const highlighted = highlightCode(codeStr, lang);
        return (
          <div className="chat-code-block">
            <div className="chat-code-header">
              <span className="chat-code-lang">{lang}</span>
            </div>
            <pre className="code-block-pre">
              <code
                className={className}
                dangerouslySetInnerHTML={{ __html: highlighted }}
                {...rest}
              />
            </pre>
          </div>
        );
      }
      // Inline code
      return (
        <code className="chat-inline-code" {...rest}>
          {children}
        </code>
      );
    },

    // Fenced code block wrapper (```...```)
    pre({ children }: ComponentPropsWithoutRef<'pre'>) {
      return <>{children}</>;
    },

    // Inject placeholders into text-bearing elements
    p({ children, ...rest }: ComponentPropsWithoutRef<'p'>) {
      return <p {...rest}>{withPlaceholders(children)}</p>;
    },
    li({ children, ...rest }: ComponentPropsWithoutRef<'li'>) {
      return <li {...rest}>{withPlaceholders(children)}</li>;
    },
    td({ children, ...rest }: ComponentPropsWithoutRef<'td'>) {
      return <td {...rest}>{withPlaceholders(children)}</td>;
    },
    th({ children, ...rest }: ComponentPropsWithoutRef<'th'>) {
      return <th {...rest}>{withPlaceholders(children)}</th>;
    },
    blockquote({ children, ...rest }: ComponentPropsWithoutRef<'blockquote'>) {
      return <blockquote {...rest}>{withPlaceholders(children)}</blockquote>;
    },

    // Headings
    h1({ children, ...rest }: ComponentPropsWithoutRef<'h1'>) {
      return <h1 className="chat-h1" {...rest}>{withPlaceholders(children)}</h1>;
    },
    h2({ children, ...rest }: ComponentPropsWithoutRef<'h2'>) {
      return <h2 className="chat-h2" {...rest}>{withPlaceholders(children)}</h2>;
    },
    h3({ children, ...rest }: ComponentPropsWithoutRef<'h3'>) {
      return <h3 className="chat-h3" {...rest}>{withPlaceholders(children)}</h3>;
    },
    h4({ children, ...rest }: ComponentPropsWithoutRef<'h4'>) {
      return <h4 className="chat-h3" {...rest}>{withPlaceholders(children)}</h4>;
    },

    // Links
    a({ children, href, ...rest }: ComponentPropsWithoutRef<'a'>) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className="chat-link" {...rest}>
          {withPlaceholders(children)}
        </a>
      );
    },
  };
}

// ── Memoized single block ──

const MemoizedMarkdownBlock = memo(function MemoizedMarkdownBlock({
  markdown,
  keyPrefix,
  placeholders,
}: {
  markdown: string;
  keyPrefix: string;
  placeholders: Placeholder[];
}) {
  const components = useMemo(
    () => buildComponents(keyPrefix, placeholders),
    [keyPrefix, placeholders],
  );

  return (
    <Markdown remarkPlugins={remarkPlugins} components={components}>
      {markdown}
    </Markdown>
  );
});

// ── Main export ──

interface MarkdownContentProps {
  text: string;
  streaming?: boolean;
  keyPrefix: string;
}

export function MarkdownContent({ text, streaming = false, keyPrefix }: MarkdownContentProps) {
  const { cleaned, placeholders } = useMemo(() => extractInlineMarkup(text), [text]);
  const mended = streaming ? remend(cleaned) : cleaned;
  const blocks = useMemo(() => splitMarkdownBlocks(mended), [mended]);

  const components = useMemo(
    () => buildComponents(keyPrefix, placeholders),
    [keyPrefix, placeholders],
  );

  return (
    <div className="chat-prose">
      {blocks.map((block, i) => {
        const isLast = i === blocks.length - 1;
        const blockKey = `${keyPrefix}-b${i}`;

        if (streaming && isLast) {
          // Last block during streaming: render directly (no memo) + cursor
          return (
            <div key={blockKey} className="chat-streaming-block">
              <Markdown remarkPlugins={remarkPlugins} components={components}>
                {block}
              </Markdown>
              <span className="ml-1 inline-block h-3 w-1.5 animate-pulse rounded-sm bg-primary align-[-2px]" />
            </div>
          );
        }

        return (
          <MemoizedMarkdownBlock
            key={blockKey}
            markdown={block}
            keyPrefix={blockKey}
            placeholders={placeholders}
          />
        );
      })}
    </div>
  );
}
