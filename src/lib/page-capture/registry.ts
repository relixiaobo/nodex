import type { PageCaptureContext, PageCaptureSiteExtractor } from './models.js';
import { githubPageCaptureExtractor } from './extractors/github.js';
import { googleDocsPageCaptureExtractor } from './extractors/google-docs.js';
import { xPageCaptureExtractor } from './extractors/x.js';
import { youtubePageCaptureExtractor } from './extractors/youtube.js';

const PAGE_CAPTURE_EXTRACTORS: readonly PageCaptureSiteExtractor[] = [
  xPageCaptureExtractor,
  googleDocsPageCaptureExtractor,
  githubPageCaptureExtractor,
  youtubePageCaptureExtractor,
];

export function getPageCaptureExtractors(): readonly PageCaptureSiteExtractor[] {
  return PAGE_CAPTURE_EXTRACTORS;
}

export function matchPageCaptureExtractor(
  context: PageCaptureContext,
): PageCaptureSiteExtractor | null {
  return PAGE_CAPTURE_EXTRACTORS.find((extractor) => extractor.matches(context)) ?? null;
}
