import {
  Children,
  cloneElement,
  type ComponentPropsWithoutRef,
  isValidElement,
  type ReactNode,
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Lexer } from 'marked';
import remend from 'remend';
import { highlightCode } from '../../lib/code-highlight.js';
import { Check, Copy } from '../../lib/icons.js';
import { CitationBadge } from './CitationBadge.js';
import { NodeReference } from './NodeReference.js';
import { NodeEmbed } from './NodeEmbed.js';

// ── Inline markup extraction ──

const REF_MARKUP_RE = /<ref\s+id="([^"]+)">([\s\S]*?)<\/ref>/g;
const CITE_MARKUP_RE = /<cite\s+(?:type="([^"]+)"\s+)?id="([^"]+)">([\s\S]*?)<\/cite>/g;
const PLACEHOLDER_RE = /%%SOMA_(\d+)%%/g;

// Block-level <node /> tag: must be on its own line (optional whitespace around)
const NODE_EMBED_LINE_RE = /^\s*<node\s+id="([^"]+)"\s*\/>\s*$/;

type CiteType = 'node' | 'chat' | 'url';

interface RefPlaceholder {
  kind: 'ref';
  nodeId: string;
  content: string;
}

interface CitePlaceholder {
  kind: 'cite';
  id: string;
  content: string;
  citeType: CiteType;
}

interface NodeEmbedPlaceholder {
  kind: 'node';
  nodeId: string;
}

type Placeholder = RefPlaceholder | CitePlaceholder | NodeEmbedPlaceholder;

/**
 * Extract inline markup (<ref>, <cite>) and block-level <node /> tags.
 *
 * - <ref> and <cite> are replaced with %%SOMA_N%% inline placeholders.
 * - <node /> on its own line becomes a standalone %%SOMA_N%% paragraph.
 */
export function extractInlineMarkup(text: string): { cleaned: string; placeholders: Placeholder[] } {
  const placeholders: Placeholder[] = [];

  // Pass 1: extract block-level <node /> tags (line-by-line)
  const lines = text.split('\n');
  const processedLines: string[] = [];
  for (const line of lines) {
    const nodeMatch = NODE_EMBED_LINE_RE.exec(line);
    if (nodeMatch) {
      const index = placeholders.length;
      placeholders.push({ kind: 'node', nodeId: nodeMatch[1] });
      // Emit as its own paragraph (blank lines around ensure marked treats it as separate block)
      processedLines.push('', `%%SOMA_${index}%%`, '');
    } else {
      processedLines.push(line);
    }
  }

  const afterNodeExtraction = processedLines.join('\n');

  // Pass 2: extract inline <ref> tags
  let afterRefs = afterNodeExtraction.replace(REF_MARKUP_RE, (_match, nodeId: string, content: string) => {
    const index = placeholders.length;
    placeholders.push({ kind: 'ref', nodeId, content });
    return `%%SOMA_${index}%%`;
  });

  // Pass 3: extract inline <cite> tags (with optional type attribute)
  const cleaned = afterRefs.replace(CITE_MARKUP_RE, (_match, type: string | undefined, id: string, content: string) => {
    const index = placeholders.length;
    const citeType: CiteType = (type === 'chat' || type === 'url') ? type : 'node';
    placeholders.push({ kind: 'cite', id, content, citeType });
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

// ── Check if a block is a standalone node embed placeholder ──

const STANDALONE_NODE_EMBED_RE = /^\s*%%SOMA_(\d+)%%\s*$/;

function tryGetNodeEmbed(block: string, placeholders: Placeholder[]): string | null {
  const match = STANDALONE_NODE_EMBED_RE.exec(block);
  if (!match) return null;
  const idx = Number(match[1]);
  const ph = placeholders[idx];
  if (ph?.kind === 'node') return ph.nodeId;
  return null;
}

// ── Placeholder injection into React children ──

function injectPlaceholders(
  children: ReactNode,
  placeholders: Placeholder[],
  keyPrefix: string,
): ReactNode {
  if (placeholders.length === 0) return children;

  return Children.map(children, (child) => {
    // String child — scan for %%SOMA_N%% and replace with components
    if (typeof child === 'string') {
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
              <NodeReference key={`${keyPrefix}-ref-${partIndex}`} nodeId={ph.nodeId}>{ph.content}</NodeReference>,
            );
          } else if (ph.kind === 'cite') {
            parts.push(
              <CitationBadge key={`${keyPrefix}-cite-${partIndex}`} id={ph.id} label={ph.content} type={ph.citeType} />,
            );
          }
          // 'node' kind is handled at block level, not inline — skip here
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

    // React element (e.g. <strong>, <em>) — recurse into its children
    if (isValidElement<{ children?: ReactNode }>(child) && child.props.children != null) {
      return cloneElement(child, {}, injectPlaceholders(child.props.children, placeholders, keyPrefix));
    }

    return child;
  });
}

// ── Markdown component overrides ──
// Component overrides handle two concerns:
// 1. Placeholder injection — replace %%SOMA_N%% with NodeReference/CitationBadge
// 2. Code blocks — syntax highlighting via highlightCode()
// All visual styling lives in CSS (.chat-prose h1, .chat-prose a, etc.)

const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins = [rehypeKatex];

// ── Code block with copy button ──

function ChatCodeBlock({ code, lang, className }: { code: string; lang: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const resetRef = useRef<number | null>(null);
  const highlighted = highlightCode(code, lang);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      if (resetRef.current !== null) window.clearTimeout(resetRef.current);
      resetRef.current = window.setTimeout(() => {
        setCopied(false);
        resetRef.current = null;
      }, 1500);
    });
  }, [code]);

  return (
    <div className="chat-code-block">
      <div className="chat-code-header">
        <span className="chat-code-lang">{lang}</span>
        <button type="button" onClick={handleCopy} className="chat-code-copy" aria-label="Copy code">
          {copied
            ? <Check size={13} strokeWidth={2} />
            : <Copy size={13} strokeWidth={1.8} />}
        </button>
      </div>
      <pre className="code-block-pre">
        <code className={className} dangerouslySetInnerHTML={{ __html: highlighted }} />
      </pre>
    </div>
  );
}

function buildComponents(keyPrefix: string, placeholders: Placeholder[]) {
  const wp = (children: ReactNode) => injectPlaceholders(children, placeholders, keyPrefix);

  return {
    code({ children, className }: ComponentPropsWithoutRef<'code'>) {
      const lang = className?.match(/language-(\S+)/)?.[1];
      if (lang) {
        return <ChatCodeBlock code={String(children).replace(/\n$/, '')} lang={lang} className={className} />;
      }
      return <code className="chat-inline-code">{children}</code>;
    },
    pre({ children }: ComponentPropsWithoutRef<'pre'>) {
      return <>{children}</>;
    },
    p({ children, ...rest }: ComponentPropsWithoutRef<'p'>) {
      return <p {...rest}>{wp(children)}</p>;
    },
    li({ children, ...rest }: ComponentPropsWithoutRef<'li'>) {
      return <li {...rest}>{wp(children)}</li>;
    },
    td({ children, ...rest }: ComponentPropsWithoutRef<'td'>) {
      return <td {...rest}>{wp(children)}</td>;
    },
    th({ children, ...rest }: ComponentPropsWithoutRef<'th'>) {
      return <th {...rest}>{wp(children)}</th>;
    },
    blockquote({ children, ...rest }: ComponentPropsWithoutRef<'blockquote'>) {
      return <blockquote {...rest}>{wp(children)}</blockquote>;
    },
    h1({ children, ...rest }: ComponentPropsWithoutRef<'h1'>) {
      return <h1 {...rest}>{wp(children)}</h1>;
    },
    h2({ children, ...rest }: ComponentPropsWithoutRef<'h2'>) {
      return <h2 {...rest}>{wp(children)}</h2>;
    },
    h3({ children, ...rest }: ComponentPropsWithoutRef<'h3'>) {
      return <h3 {...rest}>{wp(children)}</h3>;
    },
    h4({ children, ...rest }: ComponentPropsWithoutRef<'h4'>) {
      return <h4 {...rest}>{wp(children)}</h4>;
    },
    a({ children, href, ...rest }: ComponentPropsWithoutRef<'a'>) {
      return <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>{wp(children)}</a>;
    },
  };
}

// ── Memoized single block ──
// Custom comparator: only compare the markdown string. Completed blocks have
// stable markdown — if it hasn't changed, the render output is identical.
// `placeholders` array ref changes every streaming tick, but a completed block
// only references placeholder indices embedded in its own markdown substring,
// so content equality is guaranteed when markdown matches.

const MemoizedMarkdownBlock = memo(
  function MemoizedMarkdownBlock({
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
      <Markdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
        {markdown}
      </Markdown>
    );
  },
  (prev, next) => prev.markdown === next.markdown,
);

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

  return (
    <div className="chat-prose">
      {blocks.map((block, i) => {
        const isLast = i === blocks.length - 1;
        const blockKey = `${keyPrefix}-b${i}`;

        // Block-level <node /> embed — render as NodeEmbed instead of markdown
        const embedNodeId = tryGetNodeEmbed(block, placeholders);
        if (embedNodeId) {
          return <NodeEmbed key={blockKey} nodeId={embedNodeId} />;
        }

        if (streaming && isLast) {
          // Last block during streaming: no memo (content changes every tick).
          // [data-streaming] CSS makes a single <p> inline so cursor follows text.
          const components = buildComponents(blockKey, placeholders);
          return (
            <div key={blockKey} data-streaming="">
              <Markdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
                {block}
              </Markdown>
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
