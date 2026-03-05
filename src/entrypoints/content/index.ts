import Defuddle from 'defuddle';
import {
  WEBCLIP_CAPTURE_PAGE,
  CONTENT_SCRIPT_READY,
  X_VIDEO_FETCH_URL,
  type WebClipCapturePayload,
  type WebClipCaptureResponse,
  type XVideoFetchResponse,
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

/**
 * Extract author name from Schema.org data.
 * Handles both `"author": "Name"` and `"author": { "name": "Name" }` formats.
 */
function extractSchemaOrgAuthor(schemaOrgData: unknown): string | undefined {
  if (!schemaOrgData) return undefined;
  const items = Array.isArray(schemaOrgData) ? schemaOrgData : [schemaOrgData];
  for (const item of items) {
    const a = (item as Record<string, unknown>)?.author;
    if (typeof a === 'string' && a.trim()) return a.trim();
    if (a && typeof a === 'object') {
      const name = (a as Record<string, unknown>)?.name;
      if (typeof name === 'string' && name.trim()) return name.trim();
    }
  }
  return undefined;
}

/**
 * Extract author from YouTube page DOM (itemprop or channel link).
 * Falls back to Schema.org data if available.
 */
function extractYouTubeAuthor(schemaOrgData: unknown): string | undefined {
  // 1. Schema.org data (most reliable — JSON-LD parsed by Defuddle)
  const schemaAuthor = extractSchemaOrgAuthor(schemaOrgData);
  if (schemaAuthor) return schemaAuthor;

  // 2. itemprop="author" > link[itemprop="name"] (YouTube microdata)
  const authorSpan = document.querySelector('[itemprop="author"]');
  if (authorSpan) {
    const nameLink = authorSpan.querySelector('link[itemprop="name"]');
    if (nameLink) {
      const name = nameLink.getAttribute('content')?.trim();
      if (name) return name;
    }
  }

  // 3. Channel name from the video owner link
  const ownerLink = document.querySelector('#owner #channel-name a, #upload-info #channel-name a');
  if (ownerLink?.textContent?.trim()) return ownerLink.textContent.trim();

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

function isYouTubeDomain(): boolean {
  const h = location.hostname.replace(/^www\./, '').replace(/^m\./, '');
  return h === 'youtube.com' || h === 'youtu.be';
}

// ── x.com / Twitter DOM extraction ──

function isXDomain(): boolean {
  const h = location.hostname.replace(/^www\./, '');
  return h === 'x.com' || h === 'twitter.com';
}

/**
 * Detect x.com profile page via URL pattern + DOM presence.
 * Profile URLs: /username, /username/with_replies, /username/media, etc.
 * NOT: /username/status/123, /search, /home, /explore, /notifications, /messages, /i/*
 */
function isXProfilePage(): boolean {
  const path = location.pathname;
  // Must be /{username} or /{username}/{tab} — no /status/, no system paths
  const systemPaths = ['/home', '/explore', '/search', '/notifications', '/messages', '/settings', '/i/'];
  if (systemPaths.some((p) => path === p || path.startsWith(p))) return false;
  if (path.includes('/status/')) return false;
  // Check for profile DOM marker
  return !!document.querySelector('[data-testid="UserName"]');
}

/**
 * Extract x.com profile info as HTML content.
 * Returns structured HTML: bio + metadata list.
 */
function extractXProfileContent(): string {
  const parts: string[] = [];

  // Bio
  const bioEl = document.querySelector('[data-testid="UserDescription"]');
  if (bioEl) parts.push(`<p>${bioEl.innerHTML}</p>`);

  // Profile metadata (location, website, join date, follower counts)
  const metaItems: string[] = [];

  const locationEl = document.querySelector('[data-testid="UserLocation"]');
  if (locationEl?.textContent?.trim()) {
    metaItems.push(`<li>${locationEl.textContent.trim()}</li>`);
  }

  const urlEl = document.querySelector('[data-testid="UserUrl"]');
  if (urlEl) {
    const href = urlEl.closest('a')?.getAttribute('href') ?? urlEl.textContent?.trim();
    const display = urlEl.textContent?.trim();
    if (href && display) {
      metaItems.push(`<li><a href="${href}">${display}</a></li>`);
    }
  }

  const joinDateEl = document.querySelector('[data-testid="UserJoinDate"]');
  if (joinDateEl?.textContent?.trim()) {
    metaItems.push(`<li>${joinDateEl.textContent.trim()}</li>`);
  }

  // Following / Followers
  const followingLink = document.querySelector('a[href$="/following"]');
  if (followingLink?.textContent?.trim()) {
    metaItems.push(`<li>${followingLink.textContent.trim()}</li>`);
  }
  const followersLink = document.querySelector('a[href$="/verified_followers"], a[href$="/followers"]');
  if (followersLink?.textContent?.trim()) {
    metaItems.push(`<li>${followersLink.textContent.trim()}</li>`);
  }

  if (metaItems.length > 0) {
    parts.push(`<ul>${metaItems.join('\n')}</ul>`);
  }

  return parts.join('\n');
}

/**
 * Extract display name from x.com profile page.
 * The UserName element contains div[dir="ltr"] children:
 * first = display name ("Chris Olah"), second = handle ("@ch402").
 */
function extractXProfileTitle(): string | undefined {
  const userNameEl = document.querySelector('[data-testid="UserName"]');
  if (!userNameEl) return undefined;
  const dirDivs = userNameEl.querySelectorAll('div[dir="ltr"]');
  for (const div of dirDivs) {
    const text = div.textContent?.trim();
    if (text && !text.startsWith('@')) return text;
  }
  return undefined;
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
 * Convert a tweetText element to clean HTML paragraphs.
 * x.com wraps @mentions in <DIV style="display:inline-flex"> containing <a> tags.
 * These DIVs are visually inline but our parser treats <div> as block-level,
 * causing unwanted line breaks. This function flattens them to inline <a> tags.
 * Line breaks (<br>) split content into separate <p> elements so our parser
 * creates separate nodes for each paragraph.
 */
function tweetTextToHtmlParagraphs(el: Element): string {
  // First collect inline HTML, using a sentinel for line breaks
  const BREAK = '\x00BR\x00';
  function collect(node: Element): string {
    let html = '';
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        html += child.textContent ?? '';
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const elem = child as Element;
        if (elem.tagName === 'IMG' && elem.getAttribute('src')?.includes('/emoji/')) {
          html += elem.getAttribute('alt') ?? '';
        } else if (elem.tagName === 'BR') {
          html += BREAK;
        } else if (elem.tagName === 'A') {
          html += elem.outerHTML;
        } else if (elem.tagName === 'SPAN') {
          html += collect(elem);
        } else if (elem.tagName === 'DIV') {
          // x.com wraps @mentions in DIV[display:inline-flex] > A
          const anchor = elem.querySelector('a');
          if (anchor) {
            html += anchor.outerHTML;
          } else {
            html += collect(elem);
          }
        } else {
          html += collect(elem);
        }
      }
    }
    return html;
  }

  const raw = collect(el);
  // Split on line breaks and wrap each non-empty segment in <p>
  const segments = raw.split(BREAK).filter((s) => s.trim());
  if (segments.length === 0) return '';
  return segments.map((s) => `<p>${s.trim()}</p>`).join('\n');
}

/**
 * Try to extract a direct .mp4 URL for x.com native video.
 * Uses og:video meta tag — works for natively uploaded videos,
 * not for embedded YouTube/external videos.
 */
function extractXVideoDirectUrl(): string | undefined {
  const ogVideo = document.querySelector('meta[property="og:video"]')?.getAttribute('content');
  if (!ogVideo) return undefined;
  try {
    const parsed = new URL(ogVideo);
    // Accept video.twimg.com URLs (mp4 direct links, with or without query params)
    if (parsed.hostname === 'video.twimg.com') {
      return ogVideo;
    }
  } catch { /* invalid URL */ }
  return undefined;
}

/**
 * Extract tweet/status ID from x.com URL.
 * Handles: https://x.com/user/status/1234567890
 */
function extractTweetId(): string | undefined {
  const match = location.pathname.match(/\/status\/(\d+)/);
  return match?.[1];
}

/**
 * Fetch direct mp4 URL for x.com video via background script (syndication API).
 */
function fetchXVideoUrl(tweetId: string): Promise<XVideoFetchResponse> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: X_VIDEO_FETCH_URL, payload: { tweetId } },
      (response?: XVideoFetchResponse) => {
        if (chrome.runtime.lastError) {
          resolve({});
          return;
        }
        resolve(response ?? {});
      },
    );
  });
}

/**
 * Extract the author handle from a tweet article element.
 */
function extractTweetAuthor(article: Element): string | undefined {
  const userNameEl = article.querySelector('[data-testid="User-Name"]');
  if (!userNameEl) return undefined;
  const links = userNameEl.querySelectorAll('a[href*="/"]');
  for (const link of links) {
    const href = link.getAttribute('href');
    if (href?.startsWith('/') && !href.includes('/status/')) {
      return '@' + href.replace(/^\//, '');
    }
  }
  return undefined;
}

/**
 * Extract HTML parts from a single tweet article (text + media).
 */
function extractTweetArticleParts(article: Element, videoMp4Url?: string): string[] {
  const parts: string[] = [];

  // Tweet text — flatten x.com's DIV-wrapped @mentions to inline <a> tags,
  // preserving line breaks as separate <p> elements
  const textEl = article.querySelector('[data-testid="tweetText"]');
  if (textEl) {
    const textHtml = tweetTextToHtmlParagraphs(textEl);
    if (textHtml) parts.push(textHtml);
  }

  // Tweet videos: check first — if video exists, skip tweetPhoto images
  // (x.com wraps video thumbnails inside tweetPhoto containers)
  const videoEl = article.querySelector('video');
  if (videoEl) {
    const poster = videoEl.getAttribute('poster') ?? '';
    const mp4Src = videoMp4Url ?? extractXVideoDirectUrl();
    if (mp4Src) {
      parts.push(`<video src="${mp4Src}" poster="${poster}"></video>`);
    } else if (poster) {
      parts.push(`<video poster="${poster}"></video>`);
    }
  } else {
    // Tweet images (photo grid) — only when no video present
    const photos = article.querySelectorAll('[data-testid="tweetPhoto"] img');
    for (const img of photos) {
      const src = img.getAttribute('src');
      if (src && !src.includes('/emoji/')) {
        parts.push(`<img src="${src}" alt="${img.getAttribute('alt') ?? ''}">`);
      }
    }
  }

  return parts;
}

/**
 * Build HTML content from x.com tweet text and article elements.
 *
 * Structure:
 * - Thread tweets (same author as main tweet) → top-level content
 * - Replies (different authors) → nested under "h2 Replies" heading
 *
 * @param videoMp4Url - Direct mp4 URL from syndication API (optional)
 */
function extractXPageContent(videoMp4Url?: string): string {
  // x.com article: extract from the rich-text view
  const rtView = document.querySelector('[data-testid="twitterArticleRichTextView"]');
  if (rtView) return rtView.innerHTML;

  // Regular tweet/thread: extract tweetText + images + videos from tweet articles
  const articles = document.querySelectorAll('article[data-testid="tweet"]');
  if (articles.length === 0) return '';

  // Identify the main tweet author to distinguish thread vs replies
  const mainAuthor = extractTweetAuthor(articles[0]);
  const threadParts = extractTweetArticleParts(articles[0], videoMp4Url);

  if (articles.length <= 1) {
    return threadParts.join('\n');
  }

  // Separate thread continuation (same author) from replies (different author)
  const replyItems: string[] = [];
  for (let i = 1; i < articles.length; i++) {
    const article = articles[i];
    const author = extractTweetAuthor(article);
    const parts = extractTweetArticleParts(article);
    if (parts.length === 0) continue;

    if (mainAuthor && author === mainAuthor) {
      // Thread continuation — same author, append as top-level content
      threadParts.push(...parts);
    } else {
      // Reply — different author, collect for nested section
      const authorPrefix = author ? `<b>${author}</b>: ` : '';
      const first = parts[0];
      if (first.startsWith('<p>')) {
        parts[0] = `<p>${authorPrefix}${first.slice(3)}`;
      } else {
        parts.unshift(`<p>${authorPrefix}</p>`);
      }
      replyItems.push(`<li>${parts.join('\n')}</li>`);
    }
  }

  // Build final HTML: thread content + replies section
  const result = [...threadParts];
  if (replyItems.length > 0) {
    result.push(`<h2>Replies</h2>`);
    result.push(`<ul>${replyItems.join('\n')}</ul>`);
  }
  return result.join('\n');
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

// ── Google Docs content extraction ──

function isGoogleDocsDomain(): boolean {
  return location.hostname === 'docs.google.com';
}

/**
 * Extract document title from Google Docs.
 * Tries the in-page title input first, falls back to <title> minus suffix.
 */
function extractGoogleDocsTitle(): string | undefined {
  const titleInput = document.querySelector<HTMLInputElement>('.docs-title-input');
  if (titleInput?.value?.trim()) return titleInput.value.trim();
  const pageTitle = document.title;
  if (pageTitle.endsWith(' - Google Docs')) {
    return pageTitle.slice(0, -' - Google Docs'.length).trim() || undefined;
  }
  return undefined;
}

/**
 * Extract document ID from a Google Docs URL.
 * Format: /document/d/{DOCUMENT_ID}/edit
 */
function extractGoogleDocsId(): string | undefined {
  const match = location.pathname.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  return match?.[1];
}

/**
 * Fetch Google Docs content via the export endpoint.
 *
 * Google Docs canvas rendering makes DOM extraction impossible.
 * Instead, we fetch the HTML export of the document directly.
 * Since this runs in a content script on docs.google.com, the fetch
 * is same-origin and includes the user's Google session cookies.
 *
 * Post-processing: Google Docs exports flat sibling <ol> elements
 * with CSS classes encoding indent level (lst-kix_*-0, lst-kix_*-1, etc.)
 * instead of properly nested <ol>/<li>. We restructure these into
 * nested lists so parseHtmlToNodes can build the correct hierarchy.
 */
async function fetchGoogleDocsContent(docId: string): Promise<string | undefined> {
  try {
    const res = await fetch(
      `https://docs.google.com/document/d/${docId}/export?format=html`,
      { credentials: 'include' },
    );
    if (!res.ok) return undefined;
    const html = await res.text();
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    const bodyHtml = bodyMatch?.[1]?.trim();
    if (!bodyHtml) return undefined;
    return nestGoogleDocsLists(bodyHtml);
  } catch {
    return undefined;
  }
}

/**
 * Extract indent level from Google Docs list CSS class.
 * Pattern: `lst-kix_XXXX-N` where N is the nesting level (0-based).
 */
function extractGDocsListLevel(el: Element): number {
  const cls = el.getAttribute('class') ?? '';
  const match = cls.match(/lst-kix_\w+-(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

interface GDocsListItem {
  level: number;
  html: string;
  children: GDocsListItem[];
}

function renderNestedList(items: GDocsListItem[]): string {
  if (items.length === 0) return '';
  const parts: string[] = ['<ol>'];
  for (const item of items) {
    if (item.children.length > 0) {
      parts.push(`<li>${item.html}`);
      parts.push(renderNestedList(item.children));
      parts.push('</li>');
    } else {
      parts.push(`<li>${item.html}</li>`);
    }
  }
  parts.push('</ol>');
  return parts.join('\n');
}

/**
 * Convert Google Docs' flat list structure into properly nested <ol>/<li>.
 *
 * Google Docs export produces:
 *   <ol class="lst-kix_abc-0"><li>Level 0</li></ol>
 *   <ol class="lst-kix_abc-1"><li>Level 1</li></ol>
 *   <ol class="lst-kix_abc-2"><li>Level 2a</li><li>Level 2b</li></ol>
 *
 * We restructure this into:
 *   <ol><li>Level 0<ol><li>Level 1<ol><li>Level 2a</li><li>Level 2b</li></ol></li></ol></li></ol>
 */
function nestGoogleDocsLists(bodyHtml: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<html><body>${bodyHtml}</body></html>`, 'text/html');
  const body = doc.body;
  if (!body) return bodyHtml;

  const output: string[] = [];
  let pendingItems: GDocsListItem[] = [];
  let itemStack: GDocsListItem[] = [];

  function flushList(): void {
    if (pendingItems.length > 0) {
      output.push(renderNestedList(pendingItems));
      pendingItems = [];
      itemStack = [];
    }
  }

  for (const child of Array.from(body.children)) {
    const tag = child.tagName.toLowerCase();

    // Check if it's a Google Docs kix list
    const isKixList = (tag === 'ol' || tag === 'ul')
      && /lst-kix_/.test(child.getAttribute('class') ?? '');

    if (!isKixList) {
      flushList();
      output.push(child.outerHTML);
      continue;
    }

    const level = extractGDocsListLevel(child);
    for (const li of Array.from(child.children)) {
      if (li.tagName.toLowerCase() !== 'li') continue;

      const item: GDocsListItem = { level, html: li.innerHTML, children: [] };

      // Pop stack to find the parent
      while (itemStack.length > 0 && itemStack[itemStack.length - 1].level >= level) {
        itemStack.pop();
      }

      if (itemStack.length > 0) {
        itemStack[itemStack.length - 1].children.push(item);
      } else {
        pendingItems.push(item);
      }
      itemStack.push(item);
    }
  }

  flushList();
  return output.join('\n');
}

// ── GitHub DOM extraction ──

function isGitHubDomain(): boolean {
  const h = location.hostname.replace(/^www\./, '');
  return h === 'github.com';
}

/**
 * Extract README / wiki / issue / PR content from GitHub pages.
 * GitHub renders Markdown inside `.markdown-body` elements which preserve
 * full HTML structure (headings, code blocks, lists, tables, images).
 */
function extractGitHubContent(): string | undefined {
  // README, wiki pages, issue/PR body
  const markdownBody = document.querySelector('article.markdown-body, .markdown-body');
  if (markdownBody) return markdownBody.innerHTML;
  return undefined;
}

async function captureCurrentPage(): Promise<WebClipCapturePayload> {
  const url = location.href;
  const selectionText = window.getSelection()?.toString() ?? '';
  const extracted = new Defuddle(document, {
    url,
    markdown: false,
    separateMarkdown: false,
  }).parse();
  let title = extracted.title?.trim() || document.title?.trim() || location.hostname;
  let pageText = extracted.content ?? '';
  let description: string | undefined = extracted.description ?? undefined;

  let isXArticle = false;

  // Fetch x.com video URL via syndication API (async, through background script)
  let xVideoMp4Url: string | undefined;
  if (isXDomain()) {
    const tweetId = extractTweetId();
    if (tweetId) {
      try {
        const videoResult = await fetchXVideoUrl(tweetId);
        xVideoMp4Url = videoResult.mp4Url;
      } catch { /* non-fatal: fall back to poster-only */ }
    }
  }

  // ── x.com / Twitter enhancement ──
  // Defuddle often fails on x.com SPA — use DOM extraction as primary source.
  if (isXDomain()) {
    if (isXProfilePage()) {
      // x.com profile page: extract bio + metadata, not tweets
      const profileTitle = extractXProfileTitle();
      if (profileTitle) title = profileTitle;
      const profileContent = extractXProfileContent();
      if (profileContent) pageText = profileContent;
      const bioEl = document.querySelector('[data-testid="UserDescription"]');
      if (bioEl?.textContent?.trim()) description = bioEl.textContent.trim();
    } else if (isXArticlePage()) {
      // x.com long-form article: always use DOM content
      isXArticle = true;
      const articleTitle = extractXArticleTitle();
      if (articleTitle) title = articleTitle;
      // Always override pageText — Defuddle returns partial/broken content for x.com articles
      const xContent = extractXPageContent(xVideoMp4Url);
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
      const xContent = extractXPageContent(xVideoMp4Url);
      if (xContent) pageText = xContent;
    }
  }

  // ── GitHub enhancement ──
  // Defuddle extracts the entire page (file tree, nav, etc.) on GitHub.
  // Override with just the .markdown-body content which preserves HTML structure.
  if (isGitHubDomain()) {
    const ghContent = extractGitHubContent();
    if (ghContent) pageText = ghContent;
  }

  // ── Google Docs enhancement ──
  // Google Docs uses canvas rendering — DOM extraction is impossible.
  // Fetch the HTML export of the document using the user's session cookies.
  if (isGoogleDocsDomain()) {
    const gdTitle = extractGoogleDocsTitle();
    if (gdTitle) title = gdTitle;
    const docId = extractGoogleDocsId();
    if (docId) {
      const gdContent = await fetchGoogleDocsContent(docId);
      if (gdContent) {
        pageText = gdContent;
        description = undefined;
      }
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

  // Author extraction with site-specific fallbacks:
  // - YouTube: Defuddle sometimes extracts comment authors instead of channel name
  // - x.com: Defuddle often misses the author on SPA pages
  let author = extracted.author ?? undefined;
  if (isYouTubeDomain()) {
    const ytAuthor = extractYouTubeAuthor(extracted.schemaOrgData);
    if (ytAuthor) author = ytAuthor;
  } else if (isXDomain()) {
    if (isXProfilePage()) {
      // Profile page: author = @handle from URL path
      const handle = location.pathname.split('/')[1];
      if (handle) author = '@' + handle;
    } else {
      author = author ?? extractXAuthor() ?? undefined;
    }
  }

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
        captureCurrentPage().then((payload) => {
          const response: WebClipCaptureResponse = { ok: true, payload };
          sendResponse(response);
        }).catch((err) => {
          const response: WebClipCaptureResponse = {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          };
          sendResponse(response);
        });
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
