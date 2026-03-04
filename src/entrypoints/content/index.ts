import Defuddle from 'defuddle';
import {
  WEBCLIP_CAPTURE_PAGE,
  CONTENT_SCRIPT_READY,
  type WebClipCapturePayload,
  type WebClipCaptureResponse,
} from '../../lib/webclip-messaging.js';
import {
  HIGHLIGHT_RESTORE,
  HIGHLIGHT_REMOVE,
  HIGHLIGHT_SCROLL_TO,
  type HighlightRestorePayload,
  type HighlightRemovePayload,
  type HighlightScrollToPayload,
} from '../../lib/highlight-messaging.js';
import { initHighlight, removeHighlightRendering, scrollToHighlight } from './highlight.js';
import { restoreHighlights } from './highlight-restore.js';

function notifyContentScriptReady(): void {
  chrome.runtime.sendMessage({ type: CONTENT_SCRIPT_READY }).catch(() => {});
}

function extractSchemaOrgType(schemaOrgData: unknown): string | undefined {
  if (!schemaOrgData) return undefined;
  if (Array.isArray(schemaOrgData)) {
    for (const item of schemaOrgData) {
      const t = (item as Record<string, unknown>)?.['@type'];
      if (typeof t === 'string') return t;
      if (Array.isArray(t) && typeof t[0] === 'string') return t[0];
    }
    return undefined;
  }
  const t = (schemaOrgData as Record<string, unknown>)?.['@type'];
  if (typeof t === 'string') return t;
  if (Array.isArray(t) && typeof t[0] === 'string') return t[0];
  return undefined;
}

function extractDuration(schemaOrgData: unknown): string | undefined {
  if (!schemaOrgData) return undefined;
  const items = Array.isArray(schemaOrgData) ? schemaOrgData : [schemaOrgData];
  for (const item of items) {
    const d = (item as Record<string, unknown>)?.duration;
    if (typeof d === 'string') return d;
  }
  // Fallback: meta[itemprop="duration"]
  const meta = document.querySelector('meta[itemprop="duration"]');
  if (meta) return meta.getAttribute('content') ?? undefined;
  return undefined;
}

// ── x.com / Twitter DOM extraction ──

function isXDomain(): boolean {
  const h = location.hostname.replace(/^www\./, '');
  return h === 'x.com' || h === 'twitter.com';
}

/**
 * Detect x.com "文章" (Articles) via the dedicated rich-text view container.
 * Defuddle's x-article extractor uses the same selector.
 */
function isXArticlePage(): boolean {
  return !!document.querySelector('[data-testid="twitterArticleRichTextView"]');
}

/**
 * Extract x.com article title from the rich-text view heading or og:title.
 */
function extractXArticleTitle(): string | undefined {
  // Article view has headings inside the rich-text container
  const rtView = document.querySelector('[data-testid="twitterArticleRichTextView"]');
  if (rtView) {
    const h = rtView.querySelector('h1, h2, [role="heading"]');
    if (h?.textContent?.trim()) return h.textContent.trim();
  }
  // Fallback: og:title for articles is usually the actual title
  const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
  if (ogTitle && ogTitle.length > 10 && !ogTitle.startsWith('Thread by') && !/on X$/.test(ogTitle)) {
    return ogTitle;
  }
  return undefined;
}

/**
 * Extract the main tweet's text from x.com DOM using stable data-testid selectors.
 * Only extracts the first (main) tweet, not replies.
 */
function extractXTweetText(): string | undefined {
  // Scope to the main tweet (first article, not replies)
  const mainTweet = document.querySelector('article[data-testid="tweet"]');
  if (!mainTweet) return undefined;
  const textEl = mainTweet.querySelector('[data-testid="tweetText"]');
  if (!textEl) return undefined;
  // Convert emoji <img> tags back to text
  return nodeToText(textEl);
}

/** Convert a DOM node to text, restoring emoji img alt text. */
function nodeToText(el: Element): string {
  let text = '';
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      text += child.textContent;
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const elem = child as Element;
      if (elem.tagName === 'IMG' && elem.getAttribute('src')?.includes('/emoji/')) {
        text += elem.getAttribute('alt') ?? '';
      } else if (elem.tagName === 'BR') {
        text += '\n';
      } else {
        text += nodeToText(elem);
      }
    }
  }
  return text;
}

/**
 * Build HTML content from x.com tweet text and article elements.
 * Fallback when Defuddle returns empty/minimal content.
 */
function extractXPageContent(): string {
  // x.com article: extract from the rich-text view
  const rtView = document.querySelector('[data-testid="twitterArticleRichTextView"]');
  if (rtView) return rtView.innerHTML;

  // Regular tweet/thread: extract all tweetText elements
  const els = document.querySelectorAll('[data-testid="tweetText"]');
  if (els.length === 0) return '';
  return Array.from(els).map(el => `<p>${el.innerHTML}</p>`).join('\n');
}

/**
 * Extract x.com author handle from the main tweet's User-Name element.
 */
function extractXAuthor(): string | undefined {
  const mainTweet = document.querySelector('article[data-testid="tweet"]');
  if (!mainTweet) return undefined;
  const userNameEl = mainTweet.querySelector('[data-testid="User-Name"]');
  if (!userNameEl) return undefined;
  // The @handle is typically in the second link
  const links = userNameEl.querySelectorAll('a[href*="/"]');
  for (const link of links) {
    const href = link.getAttribute('href');
    if (href?.startsWith('/') && !href.includes('/status/')) {
      return '@' + href.replace(/^\//, '');
    }
  }
  return undefined;
}

function captureCurrentPage(): WebClipCapturePayload {
  const url = location.href;
  const selectionText = window.getSelection()?.toString() ?? '';
  const extracted = new Defuddle(document, {
    url,
    markdown: false,
    separateMarkdown: false,
  }).parse();
  let title = extracted.title?.trim() || document.title?.trim() || location.hostname;
  let pageText = extracted.content ?? '';
  let description = extracted.description ?? undefined;

  let isXArticle = false;

  // ── x.com / Twitter enhancement ──
  // Defuddle often fails on x.com SPA — use DOM extraction as primary source.
  if (isXDomain()) {
    if (isXArticlePage()) {
      // x.com long-form article: always use DOM content
      isXArticle = true;
      const articleTitle = extractXArticleTitle();
      if (articleTitle) title = articleTitle;
      // Always override pageText — Defuddle returns partial/broken content for x.com articles
      const xContent = extractXPageContent();
      if (xContent) pageText = xContent;
    } else {
      // Regular tweet/thread: refine title + fallback content
      const tweetText = extractXTweetText();

      // Replace generic "Thread by @user" / "... on X" titles with actual tweet content
      if (tweetText && /Thread by|on X$|on Twitter$/i.test(title)) {
        const xAuthor = extractXAuthor();
        const preview = tweetText.length > 30 ? tweetText.slice(0, 27) + '…' : tweetText;
        title = xAuthor ? `${xAuthor}: ${preview}` : preview;
      }

      // Use tweet text as description (for sidepanel display)
      if (tweetText && (!description || description === title || description.startsWith('Thread by'))) {
        description = tweetText;
      }

      // Always use DOM content for tweets — Defuddle includes metadata lines (author + date)
      const xContent = extractXPageContent();
      if (xContent) pageText = xContent;
    }
  }

  if (!pageText) {
    throw new Error('Defuddle returned empty content');
  }

  const ogType = document.querySelector('meta[property="og:type"]')?.getAttribute('content') ?? undefined;
  const schemaOrgType = extractSchemaOrgType(extracted.schemaOrgData);
  // Exclude x.com from <article> detection — every tweet is wrapped in <article>
  const hasArticleElement = !isXDomain() && !!document.querySelector('article');
  const duration = extractDuration(extracted.schemaOrgData);

  // x.com author fallback: Defuddle often misses the author on SPA pages
  const author = extracted.author ?? (isXDomain() ? extractXAuthor() : undefined) ?? undefined;

  return {
    url,
    title,
    selectionText,
    pageText,
    capturedAt: Date.now(),
    author,
    published: extracted.published ?? undefined,
    description,
    siteName: extracted.site ?? undefined,
    duration: duration ?? undefined,
    extractorType: extracted.extractorType ?? undefined,
    ogType,
    schemaOrgType,
    hasArticleElement,
    isXArticle,
  };
}

export default defineContentScript({
  matches: ['https://*/*', 'http://*/*'],
  registration: 'runtime',
  runAt: 'document_idle',

  main() {
    // Guard: prevent duplicate listener when executeScript runs multiple times
    // within the SAME extension session. After extension reload, chrome.runtime.id
    // changes, so we must re-register listeners for the new context.
    const extId = chrome.runtime?.id;
    if ((globalThis as any).__nodexCaptureExtId === extId) {
      notifyContentScriptReady();
      return;
    }

    // Initialize highlight selection listener and custom elements.
    // Non-fatal: some pages break customElements (set it to null),
    // but webclip capture must still work.
    // Check highlightEnabled setting from chrome.storage (shared with sidepanel ui-store).
    chrome.storage.local.get('nodex-ui').then((stored) => {
      const uiState = stored?.['nodex-ui']?.state;
      const highlightEnabled = uiState?.highlightEnabled ?? true;
      if (highlightEnabled) {
        try {
          initHighlight();
        } catch {
          // Highlight toolbar won't work on this page, but clip capture will.
        }
      }
    }).catch(() => {
      // Fallback: initialize highlight if storage read fails
      try {
        initHighlight();
      } catch {
        // Highlight toolbar won't work on this page, but clip capture will.
      }
    });

    // Set guard AFTER listener registration — if initHighlight crashes,
    // we still want the onMessage listener to be registered.
    (globalThis as any).__nodexCaptureExtId = extId;

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      // ── WebClip Capture ──
      if (message?.type === WEBCLIP_CAPTURE_PAGE) {
        try {
          const payload = captureCurrentPage();
          const response: WebClipCaptureResponse = { ok: true, payload };
          sendResponse(response);
        } catch (err) {
          const response: WebClipCaptureResponse = {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          };
          sendResponse(response);
        }
        return true;
      }

      // ── Highlight Restore (Side Panel -> Content Script) ──
      if (message?.type === HIGHLIGHT_RESTORE) {
        const payload = message.payload as HighlightRestorePayload;
        restoreHighlights(payload);
        sendResponse({ ok: true });
        return true;
      }

      // ── Highlight Remove (Side Panel -> Content Script) ──
      if (message?.type === HIGHLIGHT_REMOVE) {
        const payload = message.payload as HighlightRemovePayload;
        removeHighlightRendering(payload.id);
        sendResponse({ ok: true });
        return true;
      }

      // ── Highlight Scroll To (Side Panel -> Content Script) ──
      if (message?.type === HIGHLIGHT_SCROLL_TO) {
        const payload = message.payload as HighlightScrollToPayload;
        scrollToHighlight(payload.id);
        sendResponse({ ok: true });
        return true;
      }
    });

    notifyContentScriptReady();
  },
});
