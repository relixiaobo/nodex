import type { PageCaptureSiteExtractor } from '../models.js';
import { isGitHubHostname } from '../site-utils.js';

function extractGitHubContent(document: Document): string | undefined {
  const markdownBody = document.querySelector('article.markdown-body, .markdown-body');
  return markdownBody?.innerHTML || undefined;
}

export const githubPageCaptureExtractor: PageCaptureSiteExtractor = {
  id: 'github',
  matches: ({ location }) => isGitHubHostname(location.hostname),
  enrich: ({ context }) => {
    const contentHtml = extractGitHubContent(context.document);
    return {
      ...(contentHtml ? { contentHtml } : {}),
      siteHints: {
        site: 'github',
        contentKind: 'repository',
      },
    };
  },
};
