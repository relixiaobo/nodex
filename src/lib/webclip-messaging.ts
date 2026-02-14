export const WEBCLIP_CAPTURE_ACTIVE_TAB = 'webclip:capture-active-tab' as const;
export const WEBCLIP_CAPTURE_PAGE = 'webclip:capture-page' as const;

export interface WebClipCapturePayload {
  url: string;
  title: string;
  selectionText: string;
  pageText: string;
  capturedAt: number;
}

export type WebClipCaptureResponse =
  | { ok: true; payload: WebClipCapturePayload }
  | { ok: false; error: string };

