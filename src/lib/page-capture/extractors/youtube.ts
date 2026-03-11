import { extractSchemaOrgAuthor } from '../metadata.js';
import type { PageCaptureSiteExtractor } from '../models.js';
import { isYouTubeHostname } from '../site-utils.js';

function extractYouTubeAuthor(document: Document, schemaOrgData: unknown): string | undefined {
  const schemaAuthor = extractSchemaOrgAuthor(schemaOrgData);
  if (schemaAuthor) return schemaAuthor;

  const authorSpan = document.querySelector('[itemprop="author"]');
  if (authorSpan) {
    const nameLink = authorSpan.querySelector('link[itemprop="name"]');
    const name = nameLink?.getAttribute('content')?.trim();
    if (name) return name;
  }

  const ownerLink = document.querySelector('#owner #channel-name a, #upload-info #channel-name a');
  return ownerLink?.textContent?.trim() || undefined;
}

export const youtubePageCaptureExtractor: PageCaptureSiteExtractor = {
  id: 'youtube',
  matches: ({ location }) => isYouTubeHostname(location.hostname),
  enrich: ({ baseline, context, page }) => ({
    metadata: {
      author: extractYouTubeAuthor(context.document, baseline.schemaOrgData) ?? page.metadata.author,
    },
    siteHints: {
      site: 'youtube',
      contentKind: 'video',
    },
  }),
};
