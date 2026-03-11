import type { PageCaptureSiteExtractor } from '../models.js';
import { isXHostname } from '../site-utils.js';

function isXProfilePage(document: Document, pathname: string): boolean {
  const systemPaths = ['/home', '/explore', '/search', '/notifications', '/messages', '/settings', '/i/'];
  if (systemPaths.some((prefix) => pathname === prefix || pathname.startsWith(prefix))) return false;
  if (pathname.includes('/status/')) return false;
  return !!document.querySelector('[data-testid="UserName"]');
}

function extractXProfileContent(document: Document): string {
  const parts: string[] = [];

  const bioElement = document.querySelector('[data-testid="UserDescription"]');
  if (bioElement) parts.push(`<p>${bioElement.innerHTML}</p>`);

  const metaItems: string[] = [];

  const locationElement = document.querySelector('[data-testid="UserLocation"]');
  if (locationElement?.textContent?.trim()) {
    metaItems.push(`<li>${locationElement.textContent.trim()}</li>`);
  }

  const urlElement = document.querySelector('[data-testid="UserUrl"]');
  if (urlElement) {
    const href = urlElement.closest('a')?.getAttribute('href') ?? urlElement.textContent?.trim();
    const display = urlElement.textContent?.trim();
    if (href && display) {
      metaItems.push(`<li><a href="${href}">${display}</a></li>`);
    }
  }

  const joinDateElement = document.querySelector('[data-testid="UserJoinDate"]');
  if (joinDateElement?.textContent?.trim()) {
    metaItems.push(`<li>${joinDateElement.textContent.trim()}</li>`);
  }

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

function extractXProfileTitle(document: Document): string | undefined {
  const userNameElement = document.querySelector('[data-testid="UserName"]');
  if (!userNameElement) return undefined;

  const dirDivs = userNameElement.querySelectorAll('div[dir="ltr"]');
  for (const div of dirDivs) {
    const text = div.textContent?.trim();
    if (text && !text.startsWith('@')) return text;
  }

  return undefined;
}

function isXArticlePage(document: Document): boolean {
  return !!document.querySelector('[data-testid="twitterArticleRichTextView"]');
}

function extractXArticleTitle(document: Document): string | undefined {
  const richTextView = document.querySelector('[data-testid="twitterArticleRichTextView"]');
  if (richTextView) {
    const heading = richTextView.querySelector('h1, h2, [role="heading"]');
    if (heading?.textContent?.trim()) return heading.textContent.trim();
  }

  const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
  if (ogTitle && ogTitle.length > 10 && !ogTitle.startsWith('Thread by') && !/on X$/.test(ogTitle)) {
    return ogTitle;
  }

  return undefined;
}

function nodeToText(element: Element): string {
  let text = '';
  for (const child of element.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      text += child.textContent;
      continue;
    }

    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const current = child as Element;
    if (current.tagName === 'IMG' && current.getAttribute('src')?.includes('/emoji/')) {
      text += current.getAttribute('alt') ?? '';
    } else if (current.tagName === 'BR') {
      text += '\n';
    } else {
      text += nodeToText(current);
    }
  }

  return text;
}

function extractXTweetText(document: Document): string | undefined {
  const mainTweet = document.querySelector('article[data-testid="tweet"]');
  if (!mainTweet) return undefined;

  const textElement = mainTweet.querySelector('[data-testid="tweetText"]');
  if (!textElement) return undefined;

  return nodeToText(textElement);
}

function tweetTextToHtmlParagraphs(element: Element): string {
  const breakToken = '\x00BR\x00';

  const collect = (node: Element): string => {
    let html = '';
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        html += child.textContent ?? '';
        continue;
      }

      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const current = child as Element;

      if (current.tagName === 'IMG' && current.getAttribute('src')?.includes('/emoji/')) {
        html += current.getAttribute('alt') ?? '';
      } else if (current.tagName === 'BR') {
        html += breakToken;
      } else if (current.tagName === 'A') {
        html += current.outerHTML;
      } else if (current.tagName === 'SPAN') {
        html += collect(current);
      } else if (current.tagName === 'DIV') {
        const anchor = current.querySelector('a');
        html += anchor ? anchor.outerHTML : collect(current);
      } else {
        html += collect(current);
      }
    }

    return html;
  };

  const rawHtml = collect(element);
  const segments = rawHtml.split(breakToken).filter((segment) => segment.trim());
  if (segments.length === 0) return '';

  return segments.map((segment) => `<p>${segment.trim()}</p>`).join('\n');
}

function extractXVideoDirectUrl(document: Document): string | undefined {
  const ogVideo = document.querySelector('meta[property="og:video"]')?.getAttribute('content');
  if (!ogVideo) return undefined;

  try {
    const parsed = new URL(ogVideo);
    if (parsed.hostname === 'video.twimg.com') return ogVideo;
  } catch {
    return undefined;
  }

  return undefined;
}

function extractTweetId(pathname: string): string | undefined {
  return pathname.match(/\/status\/(\d+)/)?.[1];
}

function extractTweetAuthor(article: Element): string | undefined {
  const userNameElement = article.querySelector('[data-testid="User-Name"]');
  if (!userNameElement) return undefined;

  const links = userNameElement.querySelectorAll('a[href*="/"]');
  for (const link of links) {
    const href = link.getAttribute('href');
    if (href?.startsWith('/') && !href.includes('/status/')) {
      return '@' + href.replace(/^\//, '');
    }
  }

  return undefined;
}

function extractTweetArticleParts(article: Element, videoMp4Url?: string): string[] {
  const parts: string[] = [];

  const textElement = article.querySelector('[data-testid="tweetText"]');
  if (textElement) {
    const textHtml = tweetTextToHtmlParagraphs(textElement);
    if (textHtml) parts.push(textHtml);
  }

  const videoElement = article.querySelector('video');
  if (videoElement) {
    const poster = videoElement.getAttribute('poster') ?? '';
    const mp4Url = videoMp4Url ?? extractXVideoDirectUrl(article.ownerDocument);
    if (mp4Url) {
      parts.push(`<video src="${mp4Url}" poster="${poster}"></video>`);
    } else if (poster) {
      parts.push(`<video poster="${poster}"></video>`);
    }
  } else {
    const photos = article.querySelectorAll('[data-testid="tweetPhoto"] img');
    for (const image of photos) {
      const src = image.getAttribute('src');
      if (src && !src.includes('/emoji/')) {
        parts.push(`<img src="${src}" alt="${image.getAttribute('alt') ?? ''}">`);
      }
    }
  }

  return parts;
}

function extractXPageContent(document: Document, videoMp4Url?: string): string {
  const richTextView = document.querySelector('[data-testid="twitterArticleRichTextView"]');
  if (richTextView) return richTextView.innerHTML;

  const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
  if (articles.length === 0) return '';

  const mainAuthor = extractTweetAuthor(articles[0]);
  const threadParts = extractTweetArticleParts(articles[0], videoMp4Url);
  if (articles.length <= 1) return threadParts.join('\n');

  const replyItems: string[] = [];
  for (let index = 1; index < articles.length; index++) {
    const article = articles[index];
    const author = extractTweetAuthor(article);
    const parts = extractTweetArticleParts(article);
    if (parts.length === 0) continue;

    if (mainAuthor && author === mainAuthor) {
      threadParts.push(...parts);
      continue;
    }

    const authorPrefix = author ? `<b>${author}</b>: ` : '';
    const firstPart = parts[0];
    if (firstPart.startsWith('<p>')) {
      parts[0] = `<p>${authorPrefix}${firstPart.slice(3)}`;
    } else {
      parts.unshift(`<p>${authorPrefix}</p>`);
    }
    replyItems.push(`<li>${parts.join('\n')}</li>`);
  }

  const result = [...threadParts];
  if (replyItems.length > 0) {
    result.push('<h2>Replies</h2>');
    result.push(`<ul>${replyItems.join('\n')}</ul>`);
  }

  return result.join('\n');
}

function extractXAuthor(document: Document): string | undefined {
  const mainTweet = document.querySelector('article[data-testid="tweet"]');
  if (!mainTweet) return undefined;

  const userNameElement = mainTweet.querySelector('[data-testid="User-Name"]');
  if (!userNameElement) return undefined;

  const links = userNameElement.querySelectorAll('a[href*="/"]');
  for (const link of links) {
    const href = link.getAttribute('href');
    if (href?.startsWith('/') && !href.includes('/status/')) {
      return '@' + href.replace(/^\//, '');
    }
  }

  return undefined;
}

export const xPageCaptureExtractor: PageCaptureSiteExtractor = {
  id: 'x',
  matches: ({ location }) => isXHostname(location.hostname),
  enrich: async ({ context, page }) => {
    const { document, location, services } = context;
    let title = page.title;
    let contentHtml = page.contentHtml;
    let description = page.metadata.description;
    let author = page.metadata.author;
    let contentKind: 'article' | 'profile' | 'social' = 'social';

    let xVideoMp4Url: string | undefined;
    const tweetId = extractTweetId(location.pathname);
    if (tweetId && services?.fetchXVideoMetadata) {
      try {
        const video = await services.fetchXVideoMetadata(tweetId);
        xVideoMp4Url = video.mp4Url;
      } catch {
        xVideoMp4Url = undefined;
      }
    }

    if (isXProfilePage(document, location.pathname)) {
      contentKind = 'profile';
      const profileTitle = extractXProfileTitle(document);
      const profileContent = extractXProfileContent(document);
      const bioElement = document.querySelector('[data-testid="UserDescription"]');
      const handle = location.pathname.split('/')[1];

      if (profileTitle) title = profileTitle;
      if (profileContent) contentHtml = profileContent;
      if (bioElement?.textContent?.trim()) description = bioElement.textContent.trim();
      if (handle) author = '@' + handle;
    } else if (isXArticlePage(document)) {
      contentKind = 'article';
      const articleTitle = extractXArticleTitle(document);
      const articleContent = extractXPageContent(document, xVideoMp4Url);

      if (articleTitle) title = articleTitle;
      if (articleContent) contentHtml = articleContent;
      author = author ?? extractXAuthor(document);
    } else {
      const tweetText = extractXTweetText(document);
      const threadContent = extractXPageContent(document, xVideoMp4Url);

      if (tweetText && /Thread by|on X$|on Twitter$/i.test(title)) {
        const xAuthor = extractXAuthor(document);
        const preview = tweetText.length > 30 ? tweetText.slice(0, 27) + '…' : tweetText;
        title = xAuthor ? `${xAuthor}: ${preview}` : preview;
      }

      if (tweetText && (!description || description === title || description.startsWith('Thread by'))) {
        description = tweetText;
      }

      if (threadContent) contentHtml = threadContent;
      author = author ?? extractXAuthor(document);
    }

    return {
      title,
      contentHtml,
      metadata: {
        author,
        description,
      },
      siteHints: {
        site: 'x',
        contentKind,
      },
    };
  },
};
