export const WEBCLIP_CAPTURE_ACTIVE_TAB = 'webclip:capture-active-tab' as const;
export const WEBCLIP_CAPTURE_PAGE = 'webclip:capture-page' as const;
export const CONTENT_SCRIPT_READY = 'content-script:ready' as const;

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
  /** ISO 8601 or formatted duration (video only) */
  duration?: string;
  /** Defuddle extractor type (e.g. 'youtube', 'twitter') */
  extractorType?: string;
  /** og:type meta value */
  ogType?: string;
  /** Schema.org @type */
  schemaOrgType?: string;
  /** DOM contains an <article> element */
  hasArticleElement?: boolean;
  /** x.com long-form article detected (status URL but article DOM structure) */
  isXArticle?: boolean;
}

export type WebClipCaptureResponse =
  | { ok: true; payload: WebClipCapturePayload }
  | { ok: false; error: string };

export const X_VIDEO_FETCH_URL = 'x-video:fetch-url' as const;

export interface XVideoFetchPayload {
  tweetId: string;
}

export interface XVideoFetchResponse {
  mp4Url?: string;
  posterUrl?: string;
}
