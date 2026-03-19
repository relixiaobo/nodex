# YouTube Transcript Extraction Research

> Research date: 2026-03-19
> Context: soma Chrome extension (MV3), existing `page-capture` framework

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

### 1.4 Unofficial: Content Script DOM Extraction

When the user is on a YouTube video page, the `ytInitialPlayerResponse` object is available as a global variable on the page.

**Access path:**
```javascript
window.ytInitialPlayerResponse?.captions
  ?.playerCaptionsTracklistRenderer?.captionTracks
```

**Critical limitation:** Content scripts run in an isolated world and cannot access page-level JavaScript variables directly. Accessing `window.ytInitialPlayerResponse` requires injecting a `<script>` tag into the page's main world, which:
- Works but requires `"world": "MAIN"` in the content script manifest, or dynamic script injection
- Has security implications (runs in the page's JS context)
- **The global variable does not update on SPA navigation** — when users navigate between videos without full page reloads, the variable retains stale data

**However**, a content script _can_ read the raw HTML of `<script>` tags in the DOM and extract the data via regex, avoiding the isolated world issue.

### 1.5 Existing npm Libraries

| Package | Weekly Downloads | Approach | Notes |
|---------|-----------------|----------|-------|
| `youtube-transcript` | ~80K | InnerTube API + web page fallback | TypeScript, dual strategy, most maintained |
| `youtube-captions-scraper` | ~20K | Page HTML regex | Simple, Algolia-maintained, returns `{start, dur, text}[]` |
| `youtube-caption-extractor` | ~5K | Page HTML regex | Similar to above |
| `youtube-transcript-plus` | ~2K | InnerTube API | Node.js focused |

**Bundle size concern:** These packages are designed for Node.js server environments. They use `fetch` (fine) but include Node.js-specific error handling and may bring unnecessary dependencies. For a Chrome extension, a lean custom implementation is preferable.

## 2. Chrome Extension Constraints (MV3)

### 2.1 Content Script Limitations

- **CORS**: Content scripts follow the page's CORS policy (since Chrome 73). YouTube's timedtext/transcript endpoints do not set CORS headers, so content scripts **cannot** directly `fetch()` transcript URLs.
- **Isolated world**: Content scripts cannot access `window.ytInitialPlayerResponse` without main-world injection.
- **What content scripts CAN do**: Read DOM elements, read `<script>` tag text content, extract data via regex from inline scripts.

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

The X.com video metadata fetch provides a direct precedent:

1. Content script calls `fetchXVideoMetadataViaBackground(tweetId)` — sends a message to background
2. Background receives `PAGE_CAPTURE_FETCH_X_VIDEO` message
3. Background calls `fetchXVideoMetadata()` which does the actual HTTP request
4. Response relayed back to content script

YouTube transcript extraction should follow the same pattern:
1. YouTube extractor (running in content script) extracts `captionTracks` from DOM (regex on inline `<script>` tags)
2. Sends tracks to background via `chrome.runtime.sendMessage`
3. Background fetches the transcript XML/JSON from the track's `baseUrl`
4. Returns parsed transcript data to content script
5. Extractor includes transcript in the `PageCapturePatch`

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

## 4. Recommended Approach

### 4.1 Architecture: Background Fetch via InnerTube API

**Why this approach:**
- No external API key or OAuth required
- No npm dependency needed (lean custom implementation)
- Follows existing `x-video-service.ts` pattern exactly
- Works for any public video with captions enabled
- Background service worker has no CORS restrictions

**Flow:**

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Content Script  │     │  Background SW   │     │  YouTube API    │
│  (youtube.com)   │     │                  │     │                 │
├─────────────────┤     ├──────────────────┤     ├─────────────────┤
│ 1. Extract       │     │                  │     │                 │
│    videoId from  │     │                  │     │                 │
│    URL           │     │                  │     │                 │
│                  │     │                  │     │                 │
│ 2. sendMessage   │────>│ 3. POST to       │────>│ 4. Return       │
│    {videoId}     │     │    InnerTube      │     │    captionTracks│
│                  │     │    /player        │<────│                 │
│                  │     │                  │     │                 │
│                  │     │ 5. Pick best      │     │                 │
│                  │     │    track (en/     │     │                 │
│                  │     │    auto-gen)      │     │                 │
│                  │     │                  │     │                 │
│                  │     │ 6. GET baseUrl    │────>│ 7. Return XML/  │
│                  │     │    &fmt=json3     │<────│    JSON3        │
│                  │     │                  │     │                 │
│                  │     │ 8. Parse segments │     │                 │
│ 9. Receive       │<────│    & return       │     │                 │
│    transcript    │     │                  │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

### 4.2 Alternative Considered: Content Script DOM Extraction

An alternative would be to extract `captionTracks` from the page's inline `<script>` tags in the content script, then only send the `baseUrl` to background for fetching.

**Pros:** Avoids one network request (the InnerTube POST) since the data is already in the page.
**Cons:** More fragile — YouTube's HTML structure changes more frequently than the InnerTube API response format. SPA navigation on YouTube means the initial page data may be stale.

**Verdict:** The InnerTube approach is more robust. A single extra POST request is negligible latency.

### 4.3 Implementation Plan

#### New files:

| File | Purpose |
|------|---------|
| `src/lib/page-capture/youtube-transcript-service.ts` | InnerTube API call + transcript parsing (runs in background) |

#### Modified files:

| File | Change |
|------|--------|
| `src/lib/page-capture/extractors/youtube.ts` | Add transcript fetching via background message in `enrich()` |
| `src/lib/page-capture/messaging.ts` | Add `PAGE_CAPTURE_FETCH_YT_TRANSCRIPT` message type + payload/response types |
| `src/lib/page-capture/content-adapter.ts` | Add `fetchYouTubeTranscriptViaBackground()` helper (like `fetchXVideoMetadataViaBackground`) |
| `src/lib/page-capture/models.ts` | Add `transcript?: string` to `CapturedPageMetadata` |
| `src/entrypoints/background/index.ts` | Handle `PAGE_CAPTURE_FETCH_YT_TRANSCRIPT` message |
| `src/entrypoints/content/index.ts` | Wire up new service in `PageCaptureServices` |
| `src/lib/webclip-service.ts` | Store transcript in a new `Transcript` fieldDef under `#video` |
| `src/lib/webclip-messaging.ts` | Add `transcript?: string` to `WebClipCapturePayload` |
| `src/types/node.ts` (or `system-nodes.ts`) | Add `NDX_F.TRANSCRIPT` fixed ID constant |

#### Estimated effort:
- `youtube-transcript-service.ts`: ~120 lines (InnerTube fetch + JSON3 parsing + language selection)
- Messaging plumbing: ~30 lines across messaging/content-adapter files
- YouTube extractor enhancement: ~20 lines
- Background handler: ~15 lines
- WebClip integration: ~30 lines (new fieldDef + storage)
- Tests: ~100 lines (mock InnerTube responses, parse verification)
- **Total: ~300-350 lines of code, 1-2 days of work**

### 4.4 `youtube-transcript-service.ts` Pseudocode

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

// Select best track (prefer manual English, then auto-generated English, then first available)
function selectBestTrack(tracks: CaptionTrack[]): CaptionTrack | null { ... }

// Fetch and parse transcript content (JSON3 format)
async function fetchTranscriptContent(baseUrl: string): Promise<YouTubeTranscriptSegment[]> {
  const url = baseUrl + '&fmt=json3';
  const response = await fetch(url);
  const data = await response.json();
  // Parse events[] → segments, filter events without segs
  return data.events
    .filter(e => e.segs)
    .map(e => ({
      text: e.segs.map(s => s.utf8).join(''),
      startMs: e.tStartMs,
      durationMs: e.dDurationMs,
    }));
}

// Main entry point
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

### 5.1 Breakage Risk (Medium)

The InnerTube API is undocumented and YouTube can change it at any time. Mitigations:
- **Graceful degradation**: If transcript fetch fails, the video clip is still created with all other metadata (title, author, URL, duration). Transcript is purely additive.
- **Versioned client context**: If YouTube enforces client version checks, we update the version string.
- **Dual-strategy fallback**: If InnerTube fails, fall back to parsing the watch page HTML (same approach as `youtube-transcript` npm package).

### 5.2 Rate Limiting (Low)

YouTube may rate-limit requests from the same IP. For a browser extension, each user's requests come from their own IP, so collective rate limiting is not a concern. Individual users are unlikely to clip more than a few videos per session.

### 5.3 Videos Without Captions (Expected)

Some videos have no captions (manual or auto-generated). The transcript field simply remains empty. ~97% of popular YouTube videos have auto-generated captions available.

### 5.4 Age-Restricted / Private Videos (Expected)

- **Age-restricted**: InnerTube API returns no caption tracks without authentication cookies. Since the user is browsing YouTube in their own browser (logged in), the content script approach could work (the page already has the data). But the background fetch approach sends a fresh request without cookies. Mitigation: fall back to DOM extraction for age-restricted videos if the InnerTube approach fails.
- **Private/unlisted**: If the user can see the video, the content script DOM approach works. Background fetch will fail for private videos.

### 5.5 Long Videos (Low Risk)

A 2-hour video might produce ~20KB of transcript text. This is well within node storage limits and reasonable for LLM context.

### 5.6 MV3 Service Worker Lifetime (Low Risk)

The InnerTube POST + transcript fetch should complete in 1-3 seconds total. Well within the 30-second service worker idle timeout. The existing X.com video fetch follows the same pattern without issues.

## 6. Summary

| Aspect | Decision |
|--------|----------|
| **Approach** | Background service worker fetches via InnerTube API |
| **API key** | Not required |
| **New permissions** | None (already have `<all_urls>`) |
| **npm dependencies** | None (custom ~120-line implementation) |
| **Data storage** | `Transcript` field (type: PLAIN) under `#video` tagDef |
| **Fallback** | Graceful — clip created without transcript if fetch fails |
| **Pattern** | Mirrors existing `x-video-service.ts` architecture |
| **Estimated effort** | ~300-350 lines, 1-2 days |
| **Primary risk** | YouTube API changes (mitigated by graceful degradation + dual strategy) |

## References

- [YouTube Data API v3 — Captions](https://developers.google.com/youtube/v3/docs/captions)
- [youtube-transcript (npm)](https://www.npmjs.com/package/youtube-transcript) — most popular JS extraction library
- [youtube-captions-scraper (npm)](https://www.npmjs.com/package/youtube-captions-scraper) — Algolia's scraper
- [youtube-transcript-api (Python)](https://github.com/jdepoix/youtube-transcript-api) — reference implementation
- [InnerTube API transcript guide (Medium)](https://medium.com/@aqib-2/extract-youtube-transcripts-using-innertube-api-2025-javascript-guide-dc417b762f49)
- [How ytranscript Works](https://nadimtuhin.com/blog/ytranscript-how-it-works) — reverse-engineering analysis
- [Chrome MV3 CORS changes](https://www.chromium.org/Home/chromium-security/extension-content-script-fetches/) — content script fetch restrictions
