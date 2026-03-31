# Bilibili Subtitle Extraction Research

> Research date: 2026-03-30 (实测验证)
> Context: soma Chrome extension (MV3), existing `page-capture` framework, alongside YouTube transcript extraction

## 1. How Bilibili Serves Subtitles

Bilibili uses a **two-step process**:

1. Call the Player API with `bvid` + `cid` to get subtitle track metadata (list of available tracks with CDN URLs)
2. Fetch the actual subtitle JSON from the CDN URL

### 1.1 API Endpoints

| Step | Endpoint | Auth | Notes |
|------|----------|------|-------|
| Get CID | `api.bilibili.com/x/player/pagelist?bvid={bvid}` | No | Multi-part: `data[p-1].cid` |
| Get subtitle list | `api.bilibili.com/x/player/wbi/v2?bvid={bvid}&cid={cid}` | **Yes (cookies)** | Must include `Referer: https://www.bilibili.com/` |
| Download subtitle | `subtitle_url` field value (prepend `https:`) | No | CDN: `aisubtitle.hdslb.com` or `i0.hdslb.com` |

**Critical: Must use `/x/player/wbi/v2`**, NOT the old `/x/player/v2`. See Section 3.1.

### 1.2 Response Structure (Player API)

```json
{
  "code": 0,
  "data": {
    "need_login_subtitle": true,
    "subtitle": {
      "subtitles": [
        {
          "id": 1234567890,
          "lan": "ai-zh",
          "lan_doc": "中文（自动生成）",
          "is_lock": false,
          "subtitle_url": "//aisubtitle.hdslb.com/bfs/ai_subtitle/prod/...",
          "ai_type": 1,
          "ai_status": 2
        }
      ]
    }
  }
}
```

### 1.3 Subtitle JSON Format (from CDN)

```json
{
  "font_size": 0.4,
  "font_color": "#FFFFFF",
  "background_alpha": 0.5,
  "background_color": "#9C27B0",
  "type": "AIsubtitle",
  "lang": "zh",
  "body": [
    {
      "from": 1.86,
      "to": 4.46,
      "sid": 1,
      "location": 2,
      "content": "字幕文本",
      "music": 0.0
    }
  ]
}
```

Timestamps are seconds (float). `body[].content` concatenated = full transcript text.

## 2. Subtitle Types

| `lan` code | `ai_type` | CDN Domain | Description | Prevalence |
|------------|-----------|------------|-------------|------------|
| `ai-zh` | 1 | `aisubtitle.hdslb.com` | AI-generated Chinese | Most videos |
| `ai-en` | 1 | `aisubtitle.hdslb.com` | AI-generated English | Some videos |
| `zh-Hans` | 0 | `i0.hdslb.com` | Manual Chinese (Simplified) | Rare |
| `en-US` | 0 | `i0.hdslb.com` | Manual English | Rare |

Detection:
```typescript
function isAISubtitle(sub: { lan: string; ai_type: number }): boolean {
  return sub.lan.startsWith('ai-') || sub.ai_type === 1;
}
```

## 3. Known Issues and Pitfalls

### 3.1 CRITICAL: Old API Endpoint Returns Random Wrong Subtitles

**Source**: [bilibili-API-collect Discussion #1129](https://github.com/SocialSisterYi/bilibili-API-collect/discussions/1129)

The old `/x/player/v2` endpoint, when called multiple times with identical parameters, returns **different subtitle data** each time. Most responses contain **incorrect/wrong subtitles**. The accuracy is described as "depending entirely on luck."

**Root cause**: The old endpoint appears to be load-balanced across servers with inconsistent or stale caches.

**Fix**: Use `/x/player/wbi/v2` which returns correct, consistent subtitles. Despite the `/wbi/` path, WBI URL signing is NOT required for this endpoint ([confirmed by yt-dlp PR #11708](https://github.com/yt-dlp/yt-dlp/pull/11708)).

### 3.2 CRITICAL: Multi-Part Video (多P) Subtitle Mismatch

**Source**: [yt-dlp Issue #6357](https://github.com/yt-dlp/yt-dlp/issues/6357), [PR #6358](https://github.com/yt-dlp/yt-dlp/pull/6358)

`window.__INITIAL_STATE__` only contains the **first part's** subtitle data. When navigating between parts via SPA, the data does not update. Any tool reading from page HTML/JS gets the wrong subtitles for parts 2+.

**Fix**: Always fetch via the API with the correct `cid` for each specific part.

### 3.3 Login Required (Silent Empty Response)

**实测验证 (2026-03-30)**:

Without cookies, the API returns:
```json
{
  "code": 0,
  "message": "OK",
  "data": {
    "need_login_subtitle": true,
    "subtitle": { "subtitles": [] }
  }
}
```

**No error code** — just an empty array with `need_login_subtitle: true` buried in the response. All tested videos (5+) returned 0 subtitles without authentication.

### 3.4 Missing Referer Header → HTTP 412

All requests to `api.bilibili.com` must include `Referer: https://www.bilibili.com/` or the server returns 412 Precondition Failed.

**Source**: [yt-dlp commit a2000bc](https://github.com/yt-dlp/yt-dlp/commit/a2000bc85730c950351d78bb818493dc39dca3cb)

### 3.5 Silent Rate Limiting

After ~100 subtitle requests/day on a single account, Bilibili silently stops returning subtitle data. The API returns a valid response structure with empty subtitles array — no error code.

**Source**: [bilibili-api Issue #696](https://github.com/Nemo2011/bilibili-api/issues/696)

**Mitigation**: Cache results by `bvid+cid`, don't re-fetch.

### 3.6 AI Subtitle Quality Issues

- **Homophone errors** (同音错字): ASR confuses characters with similar pronunciations. A community [Tampermonkey script](https://linux.do/t/topic/247058) exists to auto-correct using OpenAI API.
- **Specialized terminology**: Technical/scientific vocabulary is error-prone.
- **Dialect/accent sensitivity**: Non-standard Mandarin produces worse results.
- **Missing sentences**: Some videos with problematic vocabulary have gaps in AI subtitles.

### 3.7 Wrong Language Subtitle

**Source**: [Bilibili-Evolved Issue #5349](https://github.com/the1812/Bilibili-Evolved/issues/5349)

When multiple languages exist, download may return the wrong language. Mitigated by explicitly selecting the desired language track from the subtitles array.

### 3.8 Bangumi vs UGC Subtitles

- **UGC (user-uploaded videos)**: Use `/x/player/wbi/v2` as documented.
- **Bangumi/PGC (anime/TV)**: Same endpoint but may need `season_id`/`ep_id`. Professional subtitles from licensors.
- **bilibili.tv (international)**: Completely different API (`/web/v2/subtitle`), ASS format. Not in scope.

### 3.9 `subtitle_url` vs `subtitle_url_v2`

- `subtitle_url`: Points to `hdslb.com`, **plain JSON**, directly accessible.
- `subtitle_url_v2`: Points to `subtitle.bilibili.com`, **encrypted content**, requires decryption.
- Only `/x/player/wbi/v2` returns `subtitle_url_v2`.
- **Use `subtitle_url` (unencrypted)** — this is what all third-party tools use.

### 3.10 Deprecated Frontend APIs

- `VideoInfo.subtitles` property deprecated as of player v4.8.48 ([Bilibili-Evolved #4944](https://github.com/the1812/Bilibili-Evolved/issues/4944)).
- `window.__INITIAL_STATE__.videoData.subtitle.list` contains stale data for multi-part videos.
- Do NOT rely on frontend JS objects for subtitle data.

## 4. Chrome Extension Implementation

### 4.1 Architecture

```
Content Script (bilibili.com)
  ├── Parse URL → extract bvid + p
  └── Send to background via chrome.runtime.sendMessage

Background Script (Service Worker)
  ├── GET pagelist → get cid (no auth needed)
  ├── GET player/wbi/v2 → get subtitle list (cookies auto-included)
  ├── Check need_login_subtitle → error if true
  ├── GET subtitle_url → download subtitle JSON
  └── Return body[].content → transcript text
```

### 4.2 Why Background Script

- **No CORS issues**: Background scripts can fetch any URL in `host_permissions`.
- **Automatic cookies**: Browser includes Bilibili session cookies (`SESSDATA`) automatically.
- **Content script CORS limits**: Since Chrome 73, content scripts follow page CORS policy.

### 4.3 Required Permissions

```json
{
  "host_permissions": [
    "*://*.bilibili.com/*",
    "*://*.hdslb.com/*"
  ]
}
```

### 4.4 URL Parsing

```typescript
function extractBvid(url: string): string | null {
  return url.match(/\/video\/(BV[a-zA-Z0-9]+)/)?.[1] ?? null;
}

function extractPartNumber(url: string): number {
  const match = url.match(/[?&]p=(\d+)/);
  return match ? parseInt(match[1], 10) : 1;
}
```

### 4.5 Implementation Requirements (Hard Rules)

1. **Use `/x/player/wbi/v2`**, never `/x/player/v2`
2. **Fetch from background script** (auto cookie, no CORS)
3. **Per-CID fetch** for each video part — never cache across parts
4. **Check `need_login_subtitle`** → return clear error message
5. **Include `Referer: https://www.bilibili.com/`** in all API requests
6. **Cache by `bvid+cid`** — avoid redundant requests (rate limiting)
7. **Prefer `subtitle_url`** over `subtitle_url_v2` (unencrypted)
8. **Label AI subtitles** — let user know quality may vary

## 5. Comparison with YouTube

| Aspect | YouTube | Bilibili |
|--------|---------|----------|
| Auth required | No | **Yes (cookies)** |
| Steps | 1 (DOM scrape transcript panel) | 2 (API for list, CDN for content) |
| Format | DOM elements → text | JSON (`body[].content`) |
| Multi-part | N/A | Need CID per part |
| Auto-captions | ~97% of videos | Most videos (AI-generated) |
| Quality issues | Generally good | Homophone errors, dialect issues |
| Rate limiting | N/A (local DOM) | ~100 req/day then silent empty |
| Wrong subtitle risk | Low | **High if using old API endpoint** |
| Implementation | Content script only | Background script required |

## 6. Integration with page-capture Framework

### 6.1 Files to Modify/Create

| File | Change |
|------|--------|
| `src/lib/page-capture/extractors/bilibili.ts` | **New** — site extractor for bilibili.com |
| `src/lib/page-capture/bilibili-subtitle-service.ts` | **New** — background-side subtitle fetch (pagelist → player API → CDN) |
| `src/lib/page-capture/models.ts` | Add `transcript?: string` to `CapturedPageMetadata` (if not already from YouTube) |
| `src/entrypoints/background/index.ts` | Handle bilibili subtitle fetch messages |
| `wxt.config.ts` | Add `*://*.bilibili.com/*` and `*://*.hdslb.com/*` to host_permissions |

### 6.2 Estimated Effort

- Bilibili extractor + subtitle service: ~120 lines
- Background message handler: ~20 lines
- Tests: ~60 lines
- **Total: ~200 lines, 1 day**

## 7. References

### API Documentation
- [bilibili-API-collect — Player API](https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/video/player.md)
- [bilibili-API-collect — WBI Signing](https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/misc/sign/wbi.md)

### Known Issues
- [bilibili-API-collect Discussion #1129 — Inconsistent subtitle returns](https://github.com/SocialSisterYi/bilibili-API-collect/discussions/1129)
- [bilibili-API-collect Issue #778 — Login required for subtitles](https://github.com/SocialSisterYi/bilibili-API-collect/issues/778)
- [yt-dlp Issue #6357 — Multi-part subtitle mismatch](https://github.com/yt-dlp/yt-dlp/issues/6357)
- [yt-dlp PR #11708 — Fix subtitle extraction with WBI endpoint](https://github.com/yt-dlp/yt-dlp/pull/11708)
- [yt-dlp Issue #11089 — 412 Precondition Failed](https://github.com/yt-dlp/yt-dlp/issues/11089)
- [Bilibili-Evolved Issue #5349 — Wrong language subtitle](https://github.com/the1812/Bilibili-Evolved/issues/5349)
- [Bilibili-Evolved Issue #4944 — Deprecated VideoInfo.subtitles](https://github.com/the1812/Bilibili-Evolved/issues/4944)
- [bilibili-api Issue #696 — Rate limiting](https://github.com/Nemo2011/bilibili-api/issues/696)

### Reference Implementations
- [yt-dlp `bilibili.py`](https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/bilibili.py) — Most authoritative, uses `/wbi/v2`
- [IndieKKY/bilibili-subtitle](https://github.com/IndieKKY/bilibili-subtitle) — Chrome extension (TypeScript)
- [Bilibili Subtitle Extractor (Greasyfork)](https://greasyfork.org/en/scripts/544280) — Userscript with multi-endpoint fallback
- [Bilibili CC subtitle AI correction script](https://linux.do/t/topic/247058) — AI-powered homophone correction
