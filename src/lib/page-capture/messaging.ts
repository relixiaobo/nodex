import type { PageCaptureResult, XVideoAsset } from './models.js';

export const PAGE_CAPTURE_ACTIVE_TAB = 'page-capture:capture-active-tab' as const;
export const PAGE_CAPTURE_PAGE = 'page-capture:capture-page' as const;
export const CONTENT_SCRIPT_READY = 'content-script:ready' as const;
export const PAGE_CAPTURE_FETCH_X_VIDEO = 'x-video:fetch-url' as const;

export type PageCaptureResponse = PageCaptureResult;

export interface PageCaptureXVideoPayload {
  tweetId: string;
}

export type PageCaptureXVideoResponse = XVideoAsset;
