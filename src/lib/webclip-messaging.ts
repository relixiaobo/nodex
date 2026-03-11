import type { CapturedPage, PageCaptureResult } from './page-capture/models.js';
import {
  CONTENT_SCRIPT_READY,
  PAGE_CAPTURE_FETCH_X_VIDEO,
  type PageCaptureXVideoPayload,
  type PageCaptureXVideoResponse,
} from './page-capture/messaging.js';

/** Deprecated compatibility message for legacy clip callers. */
export const WEBCLIP_CAPTURE_ACTIVE_TAB = 'webclip:capture-active-tab' as const;
/** Deprecated compatibility message for legacy content-script capture callers. */
export const WEBCLIP_CAPTURE_PAGE = 'webclip:capture-page' as const;
export const X_VIDEO_FETCH_URL = PAGE_CAPTURE_FETCH_X_VIDEO;

export interface WebClipCapturePayload {
  url: string;
  title: string;
  selectionText: string;
  pageText: string;
  capturedAt: number;
  author?: string;
  published?: string;
  description?: string;
  siteName?: string;
  duration?: string;
  extractorType?: string;
  ogType?: string;
  schemaOrgType?: string;
  hasArticleElement?: boolean;
  isXArticle?: boolean;
}

export type WebClipCaptureResponse =
  | { ok: true; payload: WebClipCapturePayload }
  | { ok: false; error: string };

export type XVideoFetchPayload = PageCaptureXVideoPayload;
export type XVideoFetchResponse = PageCaptureXVideoResponse;

export function toWebClipCapturePayload(page: CapturedPage): WebClipCapturePayload {
  return {
    url: page.url,
    title: page.title,
    selectionText: page.selectionText,
    pageText: page.contentHtml,
    capturedAt: page.capturedAt,
    author: page.metadata.author,
    published: page.metadata.published,
    description: page.metadata.description,
    siteName: page.metadata.siteName,
    duration: page.metadata.duration,
    extractorType: page.metadata.extractorType,
    ogType: page.metadata.ogType,
    schemaOrgType: page.metadata.schemaOrgType,
    hasArticleElement: page.metadata.hasArticleElement,
    isXArticle: page.siteHints.site === 'x' && page.siteHints.contentKind === 'article',
  };
}

export function toWebClipCaptureResponse(result: PageCaptureResult): WebClipCaptureResponse {
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  return {
    ok: true,
    payload: toWebClipCapturePayload(result.page),
  };
}

export {
  CONTENT_SCRIPT_READY,
  type PageCaptureXVideoPayload,
  type PageCaptureXVideoResponse,
};
