import type { PageCaptureSiteExtractor } from '../models.js';
import { isGitHubHostname } from '../site-utils.js';

function isGitHubDiscussionPage(pathname: string): boolean {
  return /\/(issues|pull)\/\d+/.test(pathname);
}

function extractGitHubReadmeContent(document: Document): string | undefined {
  const markdownBody = document.querySelector('article.markdown-body, .markdown-body');
  return markdownBody?.innerHTML || undefined;
}

function extractGitHubDiscussionContent(document: Document): string | undefined {
  const commentBodies = document.querySelectorAll(
    '.js-comment-body, .comment-body .markdown-body',
  );

  if (commentBodies.length === 0) {
    return extractGitHubReadmeContent(document);
  }

  const parts: string[] = [];
  for (const body of commentBodies) {
    const html = body.innerHTML?.trim();
    if (!html) continue;

    const container = body.closest(
      '.timeline-comment, [id^="issuecomment-"], .js-timeline-item',
    );
    const author = container
      ?.querySelector('.author, a[data-hovercard-type="user"]')
      ?.textContent?.trim();

    if (author) {
      parts.push(`<p><b>@${author}</b></p>\n${html}`);
    } else {
      parts.push(html);
    }
  }

  return parts.length > 0 ? parts.join('\n<hr>\n') : undefined;
}

export const githubPageCaptureExtractor: PageCaptureSiteExtractor = {
  id: 'github',
  matches: ({ location }) => isGitHubHostname(location.hostname),
  enrich: ({ context }) => {
    const { document, location } = context;
    const isDiscussion = isGitHubDiscussionPage(location.pathname);
    const contentHtml = isDiscussion
      ? extractGitHubDiscussionContent(document)
      : extractGitHubReadmeContent(document);
    const contentKind = isDiscussion ? 'discussion' : 'repository';

    return {
      ...(contentHtml ? { contentHtml } : {}),
      siteHints: {
        site: 'github',
        contentKind,
      },
    };
  },
};
