import type { PageCaptureSiteExtractor } from '../models.js';
import { isGoogleDocsHostname } from '../site-utils.js';

function extractGoogleDocsTitle(document: Document): string | undefined {
  const titleInput = document.querySelector<HTMLInputElement>('.docs-title-input');
  if (titleInput?.value?.trim()) return titleInput.value.trim();

  const pageTitle = document.title;
  if (pageTitle.endsWith(' - Google Docs')) {
    return pageTitle.slice(0, -' - Google Docs'.length).trim() || undefined;
  }

  return undefined;
}

function extractGoogleDocsId(pathname: string): string | undefined {
  const match = pathname.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  return match?.[1];
}

interface GDocsListItem {
  level: number;
  html: string;
  children: GDocsListItem[];
}

function extractGDocsListLevel(element: Element): number {
  const className = element.getAttribute('class') ?? '';
  const match = className.match(/lst-kix_\w+-(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
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

export function nestGoogleDocsLists(bodyHtml: string): string {
  const parser = new DOMParser();
  const document = parser.parseFromString(`<html><body>${bodyHtml}</body></html>`, 'text/html');
  const body = document.body;
  if (!body) return bodyHtml;

  const output: string[] = [];
  let pendingItems: GDocsListItem[] = [];
  let itemStack: GDocsListItem[] = [];

  const flushList = (): void => {
    if (pendingItems.length === 0) return;
    output.push(renderNestedList(pendingItems));
    pendingItems = [];
    itemStack = [];
  };

  for (const child of Array.from(body.children)) {
    const tagName = child.tagName.toLowerCase();
    const isKixList = (tagName === 'ol' || tagName === 'ul')
      && /lst-kix_/.test(child.getAttribute('class') ?? '');

    if (!isKixList) {
      flushList();
      output.push(child.outerHTML);
      continue;
    }

    const level = extractGDocsListLevel(child);
    for (const li of Array.from(child.children)) {
      if (li.tagName.toLowerCase() !== 'li') continue;

      const item: GDocsListItem = {
        level,
        html: li.innerHTML,
        children: [],
      };

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

async function fetchGoogleDocsContent(
  documentId: string,
  fetchImpl: typeof fetch,
): Promise<string | undefined> {
  try {
    const response = await fetchImpl(
      `https://docs.google.com/document/d/${documentId}/export?format=html`,
      { credentials: 'include' },
    );
    if (!response.ok) return undefined;

    const html = await response.text();
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    const bodyHtml = bodyMatch?.[1]?.trim();
    if (!bodyHtml) return undefined;

    return nestGoogleDocsLists(bodyHtml);
  } catch {
    return undefined;
  }
}

export const googleDocsPageCaptureExtractor: PageCaptureSiteExtractor = {
  id: 'google-docs',
  matches: ({ location }) => isGoogleDocsHostname(location.hostname),
  enrich: async ({ context }) => {
    const patch: {
      title?: string;
      contentHtml?: string;
      metadata?: { description: undefined };
      siteHints: { site: 'google-docs'; contentKind: 'document' };
    } = {
      siteHints: {
        site: 'google-docs',
        contentKind: 'document',
      },
    };

    const title = extractGoogleDocsTitle(context.document);
    if (title) patch.title = title;

    const documentId = extractGoogleDocsId(context.location.pathname);
    if (documentId) {
      const fetchImpl = context.services?.fetchImpl ?? fetch;
      const contentHtml = await fetchGoogleDocsContent(documentId, fetchImpl);
      if (contentHtml) {
        patch.contentHtml = contentHtml;
        patch.metadata = { description: undefined };
      }
    }

    return patch;
  },
};
