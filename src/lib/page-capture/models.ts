export type PageCaptureSiteId = 'generic' | 'youtube' | 'x' | 'google-docs' | 'github';

export type PageCaptureContentKind =
  | 'article'
  | 'social'
  | 'video'
  | 'profile'
  | 'document'
  | 'repository'
  | 'discussion';

export interface PageCaptureRequest {
  url?: string;
  selectionText?: string;
}

export interface CapturedPageMetadata {
  author?: string;
  published?: string;
  description?: string;
  siteName?: string;
  duration?: string;
  extractorType?: string;
  ogType?: string;
  schemaOrgType?: string;
  hasArticleElement?: boolean;
}

export interface PageCaptureSiteHints {
  site?: PageCaptureSiteId;
  contentKind?: PageCaptureContentKind;
}

export interface CapturedPage {
  url: string;
  title: string;
  selectionText: string;
  contentHtml: string;
  capturedAt: number;
  metadata: CapturedPageMetadata;
  siteHints: PageCaptureSiteHints;
}

export type PageCaptureResult =
  | { ok: true; page: CapturedPage }
  | { ok: false; error: string };

export interface DefuddlePageData {
  title?: string;
  content?: string;
  description?: string;
  author?: string;
  published?: string;
  site?: string;
  extractorType?: string;
  schemaOrgData?: unknown;
}

export interface XVideoAsset {
  mp4Url?: string;
  posterUrl?: string;
}

export interface PageCaptureServices {
  now?: () => number;
  fetchImpl?: typeof fetch;
  defuddleParse?: (document: Document, options: { url: string }) => DefuddlePageData;
  fetchXVideoMetadata?: (tweetId: string) => Promise<XVideoAsset>;
}

export interface PageCaptureContext {
  window: Window;
  document: Document;
  location: Location;
  services?: PageCaptureServices;
}

export interface PageCapturePatch {
  title?: string;
  contentHtml?: string;
  metadata?: Partial<CapturedPageMetadata>;
  siteHints?: Partial<PageCaptureSiteHints>;
}

export interface PageCaptureSiteExtractorArgs {
  baseline: DefuddlePageData;
  context: PageCaptureContext;
  page: CapturedPage;
  request: Required<PageCaptureRequest>;
}

export interface PageCaptureSiteExtractor {
  id: Exclude<PageCaptureSiteId, 'generic'>;
  matches: (context: PageCaptureContext) => boolean;
  enrich: (args: PageCaptureSiteExtractorArgs) => Promise<PageCapturePatch | void> | PageCapturePatch | void;
}

export function applyPageCapturePatch(
  page: CapturedPage,
  patch?: PageCapturePatch | void,
): CapturedPage {
  if (!patch) return page;

  return {
    ...page,
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.contentHtml !== undefined ? { contentHtml: patch.contentHtml } : {}),
    metadata: patch.metadata ? { ...page.metadata, ...patch.metadata } : page.metadata,
    siteHints: patch.siteHints ? { ...page.siteHints, ...patch.siteHints } : page.siteHints,
  };
}
