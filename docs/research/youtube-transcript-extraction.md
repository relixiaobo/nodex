# YouTube Transcript Extraction Research

> Research date: 2026-03-19 (updated: 2026-03-19)
> Context: soma Chrome extension (MV3), existing `page-capture` framework, WXT build system

## 1. Extraction Methods Survey

### 1.1 Official API: YouTube Data API v3

The YouTube Data API v3 provides a `captions` resource with `list`, `download`, `insert`, `update`, and `delete` methods.

**Requirements:**
- Google Cloud project with YouTube Data API v3 enabled
- OAuth 2.0 credentials (captions.download requires user authorization with `youtube.force-ssl` scope)
- `captions.list` can use an API key (no OAuth) but only returns track metadata, not the transcript text
- `captions.download` requires OAuth and only works for videos owned by the authenticated user

**Quota:**
- Default: 10,000 units/day per project
- `captions.list`: 50 units per call
- `captions.download`: 200 units per call
- Quota resets at midnight Pacific Time

**Verdict: Not viable.** The `captions.download` endpoint only works for videos the authenticated user owns. There is no official API to download transcripts of arbitrary public videos. Additionally, requiring users to set up OAuth and an API key creates unacceptable friction for a browser extension.

### 1.2 Unofficial: InnerTube API (Player Endpoint)

YouTube's web and mobile clients use an internal API called "InnerTube." The player endpoint returns caption track metadata for any public video.

**Endpoint:**
```
POST https://www.youtube.com/youtubei/v1/player?prettyPrint=false
```

**Request body:**
```json
{
  "context": {
    "client": {
      "clientName": "WEB",
      "clientVersion": "2.20240101.00.00"
    }
  },
  "videoId": "VIDEO_ID"
}
```

**Response path:** `captions.playerCaptionsTracklistRenderer.captionTracks[]`

Each track object contains:
- `baseUrl` — URL to fetch the actual transcript content
- `languageCode` — e.g. `"en"`, `"zh-Hans"`
- `kind` — `"asr"` for auto-generated captions
- `name.simpleText` — human-readable language name (e.g. "English (auto-generated)")

**Fetching transcript content from `baseUrl`:**

Option A — XML format (default):
```
GET {baseUrl}
```
Returns XML like:
```xml
<transcript>
  <text start="0.48" dur="3.12">Hello and welcome</text>
  <text start="3.6" dur="2.88">to this video</text>
</transcript>
```

Option B — JSON3 format (append `&fmt=json3`):
```
GET {baseUrl}&fmt=json3
```
Returns JSON with `events[]` array:
```json
{
  "events": [
    {
      "tStartMs": 480,
      "dDurationMs": 3120,
      "segs": [{"utf8": "Hello and welcome"}]
    }
  ]
}
```

**Requirements:**
- Browser-like `User-Agent` header required
- No API key or authentication needed for public videos
- No CORS headers on response (cannot fetch from content script directly)

### 1.3 Unofficial: Page HTML Scraping

Fetch the YouTube watch page HTML and extract caption track metadata from the embedded `ytInitialPlayerResponse` JavaScript object.

**Process:**
1. `GET https://www.youtube.com/watch?v=VIDEO_ID`
2. Parse HTML for the `ytInitialPlayerResponse` object (regex or string split on `"captionTracks":`)
3. Extract `captionTracks` array
4. Fetch transcript from the track's `baseUrl`

This is the approach used by most npm libraries. It is functionally equivalent to the InnerTube approach (same data, different delivery mechanism) but requires an extra page fetch.

### 1.4 Unofficial: Content Script Local Extraction (MAIN World)

When the user is on a YouTube video page, caption track metadata is available through multiple local access methods that don't require any external API call.

**Access methods (in priority order):**

1. **Player API** — `document.querySelector('#movie_player').getPlayerResponse()` returns the full player response including captions. This is the most reliable method as it reflects the _current_ video's state, even after SPA navigation.

2. **DOM element data** — `document.querySelector('ytd-app').data.playerResponse` accesses the player response via YouTube's Polymer component data binding. This is the approach used by the popular [Youtube Subtitle Downloader v36](https://greasyfork.org/en/scripts/5368-youtube-subtitle-downloader-v36) userscript.

3. **Global variable** — `window.ytInitialPlayerResponse` is set on initial page load but does **not** update on SPA navigation.

4. **Inline script regex** — Parse `<script>` tag contents for `ytInitialPlayerResponse\s*=\s*({.+?});` and extract the JSON. Used by the [YouTube Smart Subtitle Downloader](https://greasyfork.org/en/scripts/523696-youtube-smart-subtitle-downloader) userscript.

**All methods yield the same data path:**
```javascript
playerResponse?.captions
  ?.playerCaptionsTracklistRenderer?.captionTracks
```

**Critical constraint:** Methods 1-3 require access to the page's JavaScript context. Content scripts run in an isolated world and cannot access page-level variables. This requires **main world injection** (see Section 1.6).

Method 4 (regex) works from the isolated world but only captures the initial page load data — it misses SPA navigation updates.

**SPA navigation handling:**

YouTube uses `history.pushState` for navigation between videos. The page fires several custom events:
- `yt-navigate-start` — navigation begins
- `yt-page-data-fetched` — new page data loaded
- `yt-page-data-updated` — DOM updated with new data
- `yt-navigate-finish` — navigation complete

A main world script can listen for `yt-navigate-finish` to re-extract caption tracks for the new video. The `event.detail.response.playerResponse` also contains the fresh player response directly.

**Proven at scale:** Extensions like [Immersive Translate](https://immersivetranslate.com/) (millions of users) and [youtube-to-claude-transcriptiser](https://github.com/MorganOnCode/youtube-to-claude-transcriptiser) use this local extraction approach for YouTube subtitle access. The Brave browser's built-in AI Chat also [extracts transcripts locally](https://github.com/brave/brave-browser/issues/34945) from the page.

### 1.5 Existing npm Libraries

| Package | Weekly Downloads | Approach | Notes |
|---------|-----------------|----------|-------|
| `youtube-transcript` | ~80K | InnerTube API + web page fallback | TypeScript, dual strategy, most maintained |
| `youtube-captions-scraper` | ~20K | Page HTML regex | Simple, Algolia-maintained, returns `{start, dur, text}[]` |
| `youtube-caption-extractor` | ~5K | Page HTML regex | Similar to above |
| `youtube-transcript-plus` | ~2K | InnerTube API | Node.js focused |

**Bundle size concern:** These packages are designed for Node.js server environments. They use `fetch` (fine) but include Node.js-specific error handling and may bring unnecessary dependencies. For a Chrome extension, a lean custom implementation is preferable.

### 1.6 MV3 `world: 'MAIN'` Injection

Chrome MV3 introduced the ability to run content scripts in the page's main world via `world: "MAIN"`. This is essential for accessing YouTube's player API and `ytInitialPlayerResponse`.

**Two approaches in MV3:**

**A. Manifest declaration** (`world: "MAIN"` in manifest.json):
```json
{
  "content_scripts": [{
    "matches": ["*://*.youtube.com/*"],
    "js": ["main-world.js"],
    "world": "MAIN"
  }]
}
```
- Chrome-only (not supported in Firefox)
- The script has NO access to extension APIs (`chrome.runtime`, `chrome.storage`, etc.)
- Must communicate with the isolated-world content script via `window.postMessage` or `CustomEvent`

**B. WXT `injectScript` utility** (recommended for our codebase):

WXT provides `injectScript()` which creates a `<script>` element pointing to an unlisted script, loading it into the page's main world. This is the recommended cross-browser approach.

**Setup:**

1. Create an **unlisted script** (runs in MAIN world):
```typescript
// src/entrypoints/youtube-main-world.ts
export default defineUnlistedScript(() => {
  // Full access to page JS context
  const player = document.querySelector('#movie_player') as any;
  const captionTracks = player?.getPlayerResponse()
    ?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

  // Send data back to content script via CustomEvent
  document.currentScript?.dispatchEvent(
    new CustomEvent('yt-caption-tracks', { detail: captionTracks })
  );
});
```

2. **Inject from content script** (ISOLATED world):
```typescript
import { injectScript } from 'wxt/client';

const { script } = await injectScript('/youtube-main-world.js', {
  modifyScript(script) {
    script.addEventListener('yt-caption-tracks', (event) => {
      const tracks = (event as CustomEvent).detail;
      // Now have captionTracks in isolated world
    });
  },
});
```

**Key WXT details:**
- `injectScript` is synchronous in MV3 — the injected script evaluates at the same time as `run_at`
- Returns a Promise that resolves when the script has been evaluated
- The `<script>` element itself serves as a communication channel via `CustomEvent`
- Works in MV2 and MV3, Chrome and Firefox
- The unlisted script must be configured as a `web_accessible_resource`

**Communication patterns (MAIN <-> ISOLATED):**

| Method | Pros | Cons |
|--------|------|------|
| `CustomEvent` on `<script>` element | Scoped, no global pollution | One-shot (script element removed after eval) |
| `window.postMessage` | Bidirectional, persistent | Any page script can listen; needs origin check |
| `document.dispatchEvent` | Simple, persistent | Any page script can listen |

For our use case, `window.postMessage` with a unique message type prefix is best since we need ongoing communication (SPA navigation triggers re-extraction).

## 2. Chrome Extension Constraints (MV3)

### 2.1 Content Script Limitations

- **CORS**: Content scripts follow the page's CORS policy (since Chrome 73). YouTube's timedtext/transcript endpoints do not set CORS headers, so content scripts **cannot** directly `fetch()` transcript URLs from the ISOLATED world.
- **Isolated world**: Content scripts cannot access `window.ytInitialPlayerResponse` without main-world injection.
- **What content scripts CAN do**: Read DOM elements, read `<script>` tag text content, extract data via regex from inline scripts.
- **MAIN world scripts**: Can access all page JS variables and APIs, but **cannot** use extension APIs. Can fetch same-origin URLs (youtube.com timedtext endpoints are same-origin when running on youtube.com). This is a key advantage — the `baseUrl` for transcript content is on `youtube.com`, so a MAIN world script can fetch it directly without needing the background service worker.

### 2.2 Background Service Worker Capabilities

- **fetch()**: Can make cross-origin requests to any URL matching `host_permissions`. No CORS restrictions.
- **Current permissions**: The extension already has `"<all_urls>"` in `host_permissions`, so fetching from `youtube.com` domains is already permitted.
- **Lifetime**: Service worker may terminate after ~30s of inactivity. Transcript fetch should complete well within this window.

### 2.3 CSP

The current CSP (`script-src 'self' 'wasm-unsafe-eval'`) does not affect `fetch()` calls. No CSP changes needed.

### 2.4 Required Permission Changes

**None.** The extension already has `<all_urls>` in `host_permissions`, which covers `youtube.com` and all YouTube timedtext endpoints.

## 3. Integration with Existing Architecture

### 3.1 page-capture Framework

The `page-capture` framework follows this pattern:

1. **Content script** (`content-adapter.ts`) runs on the page, uses Defuddle to extract content, then applies site-specific extractors
2. **Extractors** (`extractors/*.ts`) enrich the captured page with site-specific data (author, content kind, etc.)
3. **Background transport** (`background-transport.ts`) handles injecting the content script and relaying messages
4. **Background service worker** handles requests that need elevated privileges (e.g., `x-video-service.ts` fetches X.com video metadata)

The existing YouTube extractor (`extractors/youtube.ts`) currently only:
- Sets `site: 'youtube'` and `contentKind: 'video'`
- Extracts author from Schema.org data or DOM

It does **not** extract transcript data.

### 3.2 Existing Pattern for Background Fetches

The X.com video metadata fetch provides a direct precedent for the **fallback** approach:

1. Content script calls `fetchXVideoMetadataViaBackground(tweetId)` — sends a message to background
2. Background receives `PAGE_CAPTURE_FETCH_X_VIDEO` message
3. Background calls `fetchXVideoMetadata()` which does the actual HTTP request
4. Response relayed back to content script

The **primary** approach (local extraction) differs from this pattern:
1. YouTube extractor injects a MAIN world script via WXT `injectScript()`
2. MAIN world script accesses YouTube's player API directly to get `captionTracks`
3. MAIN world script fetches transcript content (same-origin, no CORS issues)
4. Result sent back to isolated world via `window.postMessage`
5. Extractor includes transcript in the `PageCapturePatch`

If local extraction fails, the **fallback** follows the X.com pattern:
1. Content script sends `videoId` to background via `chrome.runtime.sendMessage`
2. Background POSTs to InnerTube `/player` endpoint to get `captionTracks`
3. Background fetches transcript XML/JSON from the track's `baseUrl`
4. Returns parsed transcript data to content script

### 3.3 Transcript Data Storage

Following the "everything is a node" principle, transcript data should be stored as **children nodes** under the video clip node. Two viable approaches:

**Option A: Single child node with full transcript text**
```
VideoClipNode (#video)
  ├── fieldEntry (URL)
  ├── fieldEntry (Author)
  ├── fieldEntry (Duration)
  └── "Transcript" node (plain content node)
       └── name: full transcript text (concatenated)
```

**Option B: Transcript as a field value**
Add a "Transcript" `fieldDef` (type: `PLAIN`) under the `#video` tagDef, store the full text as a field value node.

```
VideoClipNode (#video)
  ├── fieldEntry (URL)
  ├── fieldEntry (Author)
  ├── fieldEntry (Duration)
  └── fieldEntry (Transcript)
       └── valueNode: full transcript text
```

**Recommendation: Option B (field value).** This is consistent with how Author, Duration, and other metadata are already stored. The transcript is video metadata, not user-authored content, so it belongs in a field.

**Timestamped segments** should be stored as a single concatenated text string in the field value (not as individual nodes per segment). Reasons:
- A 10-minute video can have 100+ segments — creating 100 nodes is excessive overhead
- The primary use case is AI context (feeding transcript to LLM), which needs the full text
- If timestamp-level navigation is needed later, the raw segment data can be cached in IndexedDB or `chrome.storage` alongside the page content cache (`ai-shadow-cache`)

## 4. Recommended Approach: Local Extraction via MAIN World

### 4.1 Architecture: Local Extraction (Primary) + InnerTube API (Fallback)

**Why local extraction is preferred over InnerTube API:**

| Aspect | Local Extraction (MAIN world) | InnerTube API (Background SW) |
|--------|------------------------------|------------------------------|
| **Network requests** | 1 (fetch `baseUrl` for transcript content) | 2 (POST to `/player` + fetch `baseUrl`) |
| **Data freshness** | Uses YouTube's own loaded data — always current | Separate request — may get different data |
| **CORS** | Same-origin fetch (youtube.com → youtube.com) | Needs background SW (no CORS in SW) |
| **Authentication** | Inherits user's cookies — works for age-restricted/private videos | No cookies — fails for restricted content |
| **SPA navigation** | Handles via `yt-navigate-finish` event | N/A (videoId-based) |
| **Stability** | Proven by Immersive Translate (millions of users), Brave browser | Undocumented API, YouTube may change |
| **Background SW** | Not needed for caption data | Required for all fetches |
| **Complexity** | Needs MAIN world injection setup | Simpler messaging pattern |

**The key insight from Immersive Translate and similar extensions:** The user is already on the YouTube page. The caption data is already loaded by YouTube's own code. Extracting it locally via the player API is more stable than making a separate API call, because:
1. It uses the exact same data YouTube uses to render captions
2. It inherits the user's authentication state (age-restricted, private videos)
3. It avoids the risk of YouTube blocking or rate-limiting the InnerTube endpoint
4. Only one fetch is needed (the transcript content), and it's same-origin

**Flow:**

```
┌─────────────────────────────────────────────────────────────────┐
│  YouTube Page (youtube.com)                                     │
│                                                                 │
│  ┌──────────────────┐     ┌──────────────────┐                 │
│  │  MAIN World       │     │  ISOLATED World   │                 │
│  │  (unlisted script)│     │  (content script)  │                 │
│  ├──────────────────┤     ├──────────────────┤                 │
│  │ 1. Access player  │     │                  │                 │
│  │    API or ytd-app │     │                  │                 │
│  │    .data          │     │                  │                 │
│  │                  │     │                  │                 │
│  │ 2. Extract        │     │                  │                 │
│  │    captionTracks  │     │                  │                 │
│  │                  │     │                  │                 │
│  │ 3. Select best    │     │                  │                 │
│  │    track          │     │                  │                 │
│  │                  │     │                  │                 │
│  │ 4. fetch(baseUrl) │     │                  │                 │
│  │    (same-origin!) │     │                  │                 │
│  │                  │     │                  │                 │
│  │ 5. Parse XML/JSON │     │                  │                 │
│  │    → segments     │     │                  │                 │
│  │                  │     │                  │                 │
│  │ 6. postMessage    │────>│ 7. Receive       │                 │
│  │    {transcript}   │     │    transcript     │                 │
│  │                  │     │    data           │                 │
│  └──────────────────┘     │                  │                 │
│                           │ 8. Include in     │                 │
│                           │    PageCapturePatch│                 │
│                           └──────────────────┘                 │
└─────────────────────────────────────────────────────────────────┘
```

**No background service worker involvement** — the entire extraction happens within the YouTube page context. The MAIN world script can fetch the transcript content directly because the `baseUrl` points to `youtube.com` (same-origin).

### 4.2 Fallback: InnerTube API via Background Service Worker

The InnerTube API approach (from the original research) serves as a fallback when local extraction fails. This can happen if:
- YouTube changes the player API structure
- The MAIN world injection is blocked
- The page hasn't fully loaded the player response

The fallback follows the existing `x-video-service.ts` pattern:
1. Content script sends `videoId` to background
2. Background POSTs to InnerTube `/player` endpoint
3. Background fetches transcript from `baseUrl`
4. Returns parsed transcript to content script

See Section 4.4 for the InnerTube pseudocode (retained for fallback reference).

### 4.3 Implementation Plan

#### New files:

| File | Purpose |
|------|---------|
| `src/entrypoints/youtube-transcript-main.ts` | Unlisted script — runs in MAIN world, extracts caption tracks + fetches transcript content |
| `src/lib/page-capture/youtube-transcript-service.ts` | InnerTube API fallback + shared transcript parsing logic (runs in background) |

#### Modified files:

| File | Change |
|------|--------|
| `src/lib/page-capture/extractors/youtube.ts` | Orchestrate local extraction (inject MAIN world script) with InnerTube fallback |
| `src/lib/page-capture/messaging.ts` | Add `PAGE_CAPTURE_FETCH_YT_TRANSCRIPT` message type for fallback path |
| `src/lib/page-capture/content-adapter.ts` | Add `fetchYouTubeTranscriptViaBackground()` fallback helper |
| `src/lib/page-capture/models.ts` | Add `transcript?: string` to `CapturedPageMetadata` |
| `src/entrypoints/background/index.ts` | Handle `PAGE_CAPTURE_FETCH_YT_TRANSCRIPT` message (fallback only) |
| `src/entrypoints/content/index.ts` | Wire up transcript extraction in `PageCaptureServices` |
| `src/lib/webclip-service.ts` | Store transcript in a new `Transcript` fieldDef under `#video` |
| `src/lib/webclip-messaging.ts` | Add `transcript?: string` to `WebClipCapturePayload` |
| `src/types/node.ts` (or `system-nodes.ts`) | Add `NDX_F.TRANSCRIPT` fixed ID constant |
| `wxt.config.ts` | May need to add `web_accessible_resources` for the unlisted script |

#### Estimated effort:
- `youtube-transcript-main.ts` (MAIN world script): ~80 lines (player API access + fetch + parse + postMessage)
- `youtube-transcript-service.ts` (BG fallback + shared types): ~120 lines
- YouTube extractor orchestration: ~50 lines (inject + listen + fallback logic)
- Messaging plumbing: ~30 lines
- WebClip integration: ~30 lines
- Tests: ~120 lines (mock player response, parse verification, fallback logic)
- **Total: ~430 lines of code, 2-3 days of work**

### 4.4 Pseudocode: MAIN World Script (`youtube-transcript-main.ts`)

```typescript
// Unlisted script — runs in YouTube page's MAIN world
export default defineUnlistedScript(() => {
  const MSG_PREFIX = 'soma:yt-transcript';

  interface CaptionTrack {
    baseUrl: string;
    languageCode: string;
    kind?: string;        // 'asr' for auto-generated
    name: { simpleText: string };
  }

  // --- Step 1: Extract caption tracks from page context ---

  function getCaptionTracks(): CaptionTrack[] | null {
    // Method A: Player API (best — always reflects current video)
    try {
      const player = document.querySelector('#movie_player') as any;
      const response = player?.getPlayerResponse?.();
      const tracks = response?.captions
        ?.playerCaptionsTracklistRenderer?.captionTracks;
      if (tracks?.length) return tracks;
    } catch { /* fall through */ }

    // Method B: ytd-app data binding (Polymer component)
    try {
      const app = document.querySelector('ytd-app') as any;
      const tracks = app?.data?.playerResponse?.captions
        ?.playerCaptionsTracklistRenderer?.captionTracks;
      if (tracks?.length) return tracks;
    } catch { /* fall through */ }

    // Method C: Global variable (initial load only)
    try {
      const w = window as any;
      const tracks = w.ytInitialPlayerResponse?.captions
        ?.playerCaptionsTracklistRenderer?.captionTracks;
      if (tracks?.length) return tracks;
    } catch { /* fall through */ }

    return null;
  }

  // --- Step 2: Select best track ---

  function selectBestTrack(tracks: CaptionTrack[]): CaptionTrack | null {
    // Prefer manual English, then auto-generated English, then first manual, then first auto
    const manualEn = tracks.find(t => t.languageCode === 'en' && t.kind !== 'asr');
    if (manualEn) return manualEn;
    const autoEn = tracks.find(t => t.languageCode === 'en' && t.kind === 'asr');
    if (autoEn) return autoEn;
    const firstManual = tracks.find(t => t.kind !== 'asr');
    if (firstManual) return firstManual;
    return tracks[0] ?? null;
  }

  // --- Step 3: Fetch transcript content (same-origin!) ---

  async function fetchTranscript(baseUrl: string) {
    // Append fmt=json3 for structured JSON response
    const url = baseUrl + (baseUrl.includes('?') ? '&' : '?') + 'fmt=json3';
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();

    // Parse events[] → segments
    const segments = (data.events ?? [])
      .filter((e: any) => e.segs)
      .map((e: any) => ({
        text: e.segs.map((s: any) => s.utf8 ?? '').join(''),
        startMs: e.tStartMs ?? 0,
        durationMs: e.dDurationMs ?? 0,
      }));

    return segments;
  }

  // --- Step 4: Orchestrate & send result ---

  async function extractAndSend() {
    const tracks = getCaptionTracks();
    if (!tracks) {
      window.postMessage({ type: `${MSG_PREFIX}:result`, data: null }, '*');
      return;
    }

    const track = selectBestTrack(tracks);
    if (!track) {
      window.postMessage({ type: `${MSG_PREFIX}:result`, data: null }, '*');
      return;
    }

    const segments = await fetchTranscript(track.baseUrl);
    window.postMessage({
      type: `${MSG_PREFIX}:result`,
      data: segments ? {
        segments,
        fullText: segments.map((s: any) => s.text).join(' '),
        languageCode: track.languageCode,
        isAutoGenerated: track.kind === 'asr',
      } : null,
    }, '*');
  }

  // Listen for extraction requests from isolated world
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.type === `${MSG_PREFIX}:extract`) {
      extractAndSend();
    }
  });
});
```

### 4.5 Pseudocode: Content Script Integration (ISOLATED world)

```typescript
// In youtube.ts extractor enrich() — runs in ISOLATED world
async function extractTranscriptLocally(): Promise<YouTubeTranscriptResult | null> {
  const MSG_PREFIX = 'soma:yt-transcript';

  // Inject the MAIN world script
  await injectScript('/youtube-transcript-main.js');

  // Request extraction and wait for result
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      window.removeEventListener('message', handler);
      resolve(null); // Timeout → fall back to InnerTube
    }, 5000);

    function handler(event: MessageEvent) {
      if (event.source !== window) return;
      if (event.data?.type !== `${MSG_PREFIX}:result`) return;
      clearTimeout(timeout);
      window.removeEventListener('message', handler);
      resolve(event.data.data);
    }

    window.addEventListener('message', handler);
    window.postMessage({ type: `${MSG_PREFIX}:extract` }, '*');
  });
}

// In enrich():
const transcript = await extractTranscriptLocally()
  ?? await fetchYouTubeTranscriptViaBackground(videoId); // fallback
```

### 4.6 InnerTube API Fallback Pseudocode (`youtube-transcript-service.ts`)

Retained from original research as the fallback strategy. Runs in background service worker.

```typescript
// Types
interface YouTubeTranscriptSegment {
  text: string;
  startMs: number;
  durationMs: number;
}

interface YouTubeTranscriptResult {
  segments: YouTubeTranscriptSegment[];
  fullText: string;
  languageCode: string;
  isAutoGenerated: boolean;
}

// InnerTube player request
async function fetchCaptionTracks(videoId: string): Promise<CaptionTrack[]> {
  const response = await fetch(
    'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: {
          client: { clientName: 'WEB', clientVersion: '2.20240101.00.00' }
        },
        videoId,
      }),
    }
  );
  const data = await response.json();
  return data?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
}

// Select best track (same logic as MAIN world script)
function selectBestTrack(tracks: CaptionTrack[]): CaptionTrack | null { ... }

// Fetch and parse transcript content (JSON3 format)
async function fetchTranscriptContent(baseUrl: string): Promise<YouTubeTranscriptSegment[]> {
  const url = baseUrl + '&fmt=json3';
  const response = await fetch(url);
  const data = await response.json();
  return data.events
    .filter(e => e.segs)
    .map(e => ({
      text: e.segs.map(s => s.utf8).join(''),
      startMs: e.tStartMs,
      durationMs: e.dDurationMs,
    }));
}

// Main entry point (background service worker)
export async function fetchYouTubeTranscript(videoId: string): Promise<YouTubeTranscriptResult | null> {
  const tracks = await fetchCaptionTracks(videoId);
  if (tracks.length === 0) return null;
  const track = selectBestTrack(tracks);
  if (!track) return null;
  const segments = await fetchTranscriptContent(track.baseUrl);
  return {
    segments,
    fullText: segments.map(s => s.text).join(' '),
    languageCode: track.languageCode,
    isAutoGenerated: track.kind === 'asr',
  };
}
```

## 5. Risk Assessment

### 5.1 Breakage Risk (Medium-Low)

Both approaches depend on YouTube's internal data structures. Mitigations:

- **Graceful degradation**: If transcript fetch fails, the video clip is still created with all other metadata (title, author, URL, duration). Transcript is purely additive.
- **Dual-strategy fallback**: Local extraction fails → InnerTube API fallback. Both fail → no transcript (graceful).
- **Proven stability**: The local extraction approach (player API + `ytd-app.data`) has been used by Immersive Translate for years with millions of users. Brave browser's AI Chat also uses local extraction. The `playerCaptionsTracklistRenderer` structure has been stable since at least 2023.
- **Multi-method local extraction**: Three different access methods (player API, ytd-app data, global variable) provide redundancy within the local approach itself.

### 5.2 Rate Limiting (Very Low)

Local extraction uses data already loaded by the page — no additional API calls to YouTube servers for caption metadata. The transcript content fetch is a single same-origin GET request, indistinguishable from YouTube's own subtitle loading. This is much less likely to trigger rate limiting than the InnerTube API approach.

### 5.3 Videos Without Captions (Expected)

Some videos have no captions (manual or auto-generated). The transcript field simply remains empty. ~97% of popular YouTube videos have auto-generated captions available.

### 5.4 Age-Restricted / Private Videos (Improved)

The local extraction approach **solves** the age-restricted/private video problem identified in the original research:
- **Age-restricted**: The MAIN world script inherits the user's YouTube session cookies. If the user can see the video (logged in, age-verified), the player response includes caption tracks.
- **Private/unlisted**: Same — if the user has access, the player response is available locally.
- **InnerTube fallback**: Will still fail for restricted content (no cookies), but this is acceptable since the primary approach handles it.

### 5.5 Long Videos (Low Risk)

A 2-hour video might produce ~20KB of transcript text. This is well within node storage limits and reasonable for LLM context.

### 5.6 MAIN World Security (Low Risk)

The MAIN world script runs in YouTube's page context. Risks:
- **Page script interference**: YouTube or other extensions could intercept our `postMessage` calls. Mitigated by using a unique message type prefix (`soma:yt-transcript`).
- **XSS via page data**: The extracted caption data is text content from YouTube's own API. We parse JSON, extract text strings, and concatenate. No HTML rendering or `eval()`.
- **Script injection detection**: Some pages detect injected scripts. YouTube does not appear to block this (Immersive Translate, Brave, and numerous userscripts use this approach successfully).

### 5.7 SPA Navigation Timing (Low Risk)

Our page-capture extractor runs at the time of web clip creation (user action). At that point, the YouTube player has fully loaded the current video's data. The SPA staleness issue only affects persistent listeners that need to track _every_ video the user navigates to — not applicable to our clip-on-demand model.

## 6. Summary

| Aspect | Decision |
|--------|----------|
| **Primary approach** | Local extraction via MAIN world script (player API + same-origin fetch) |
| **Fallback approach** | InnerTube API via background service worker |
| **API key** | Not required |
| **New permissions** | None (already have `<all_urls>`) |
| **npm dependencies** | None (custom implementation) |
| **WXT integration** | `injectScript()` + unlisted script for MAIN world access |
| **Data storage** | `Transcript` field (type: PLAIN) under `#video` tagDef |
| **Fallback** | Local fails → InnerTube fallback → graceful (clip without transcript) |
| **Estimated effort** | ~430 lines, 2-3 days |
| **Primary risk** | YouTube player API structure changes (mitigated by 3-method local fallback + InnerTube fallback) |

### Decision rationale (local over InnerTube)

The original research recommended InnerTube API as the primary approach. After studying how Immersive Translate and similar extensions extract YouTube subtitles locally, we now prefer local extraction because:

1. **Zero extra API calls** for caption metadata — the data is already on the page
2. **Same-origin fetch** for transcript content — no background SW needed for the primary path
3. **Authenticated access** — inherits user session, solving the age-restricted/private video problem
4. **Proven at scale** — Immersive Translate (millions of users), Brave browser AI, and dozens of userscripts/extensions use this technique
5. **Lower breakage surface** — uses the same data YouTube itself uses to render captions

The InnerTube API is retained as a reliable fallback. Having dual strategies maximizes resilience.

## References

### APIs & Official Docs
- [YouTube Data API v3 — Captions](https://developers.google.com/youtube/v3/docs/captions)
- [Chrome MV3 Content Scripts — world: MAIN](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Chrome MV3 CORS changes](https://www.chromium.org/Home/chromium-security/extension-content-script-fetches/) — content script fetch restrictions

### WXT Framework
- [WXT Content Scripts — Main World & injectScript](https://wxt.dev/guide/essentials/content-scripts.html)
- [WXT injectScript API reference](https://wxt.dev/api/reference/wxt/client/functions/injectscript)
- [WXT Discussion: Best practice for injecting scripts / accessing page window](https://github.com/wxt-dev/wxt/discussions/523)

### Open-source implementations (local extraction)
- [youtube-to-claude-transcriptiser](https://github.com/MorganOnCode/youtube-to-claude-transcriptiser) — Chrome extension, multi-method fallback (player API + global var + regex)
- [Brave browser — YouTube transcript fix](https://github.com/brave/brave-browser/issues/34945) — SPA navigation staleness analysis
- [Youtube Subtitle Downloader v36](https://greasyfork.org/en/scripts/5368-youtube-subtitle-downloader-v36/code) — uses `ytd-app.data.playerResponse` + `yt-navigate-finish`
- [YouTube Smart Subtitle Downloader](https://greasyfork.org/en/scripts/523696-youtube-smart-subtitle-downloader/code) — uses `ytInitialPlayerResponse` regex extraction

### Libraries & Analysis
- [youtube-transcript (npm)](https://www.npmjs.com/package/youtube-transcript) — most popular JS extraction library
- [youtube-captions-scraper (npm)](https://www.npmjs.com/package/youtube-captions-scraper) — Algolia's scraper
- [youtube-transcript-api (Python)](https://github.com/jdepoix/youtube-transcript-api) — reference implementation, InnerTube approach
- [InnerTube API transcript guide (Medium)](https://medium.com/@aqib-2/extract-youtube-transcripts-using-innertube-api-2025-javascript-guide-dc417b762f49)
- [How ytranscript Works](https://nadimtuhin.com/blog/ytranscript-how-it-works) — reverse-engineering analysis

### Extensions using local extraction at scale
- [Immersive Translate](https://immersivetranslate.com/) — millions of users, YouTube bilingual subtitle translation
- [Trancy](https://chromewebstore.google.com/detail/trancy-immersive-translat/mjdbhokoopacimoekfgkcoogikbfgngb) — immersive translate + language learning
