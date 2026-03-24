# Chrome Web Store Listing

## Extension Name
soma

## Short Description (132 chars max)
Notes that think with you. Structured notes, web highlights, and AI thinking partner — all in your browser sidebar.

## Detailed Description

**Notes that think with you.**

You're reading an article that sparks an idea. You highlight a sentence, jot a reaction in the sidebar, and keep reading. Later, you open the AI drawer and ask "what connects this to what I wrote last week?" It finds a thread you didn't see.

That's soma — a structured notebook and AI thinking partner, right in your browser sidebar.

**Structure your thinking**
You have a loose idea. You write it down, nest another underneath, drag one up, tag it with a status field. In five minutes, a scattered thought becomes a structure you can build on. That's what an outliner does that a flat doc never will.

**Capture while you browse**
You're halfway through an article when a paragraph clicks. Highlight it — it's already a note in your sidebar. Clip the whole page if you want. Tomorrow your journal references it. Everything stays connected because it was never in a separate app to begin with.

**Think with AI**
You're stuck on a draft. Pull up the chat drawer — it's right below your notes. "Here's what I have so far" — and your AI sees the actual notes, not a copy-paste. It pushes back on a weak argument, suggests a structure, edits a node for you. You think out loud; it thinks with you.

Bring your own model: Claude, GPT, Gemini, DeepSeek, or any OpenAI-compatible provider.

**Not another AI chatbot. Not another note app.** soma is where your notes and AI work together — so your thinking compounds over time.

---

## Category
Productivity

## Language
English

## Promo images
- `images/promo-marquee.png` — 1400×560 marquee: "Notes that think with you" + browser mockup

## Screenshots to upload (in order)
1. `images/screenshot-1-overview.png` — Overview: browser + side panel with outliner and chat drawer (1280×800)
2. `images/screenshot-2-structure.png` — Structure your thinking: outliner with tags, fields, nested nodes (1280×800)
3. `images/screenshot-3-connect.png` — Capture while you browse: web highlights + sidebar notes (1280×800)
4. `images/screenshot-4-ai.png` — Think with AI: chat drawer with node embed (1280×800)
5. `images/screenshot-5-project.png` — Bring your own model: multi-provider AI setup (1280×800)

HTML source files for regenerating screenshots: `image-sources/`

## Privacy Policy (single purpose description)
Notes that think with you — structured notes and AI thinking partner in your browser sidebar.

## Permissions justification
| Permission | Reason |
|---|---|
| storage, unlimitedStorage | Store notes and CRDT data locally for offline access |
| sidePanel | Display the main UI in Chrome Side Panel |
| activeTab | Capture content from the current webpage (web clipping) |
| identity | Google OAuth sign-in via chrome.identity API |
| scripting | Inject content script for web clipping |
| host_permissions: <all_urls> | Web clipping works on any website |
| host_permissions: nodex-sync.getsoma.workers.dev | Sync data with cloud backend |

## Data usage disclosure
- **Personally identifiable information**: Yes (Google account email for authentication)
- **Health information**: No
- **Financial information**: No
- **Authentication information**: Yes (OAuth tokens stored locally)
- **Personal communications**: No
- **Location**: No
- **Web history**: No
- **User activity**: Yes (AI feature usage — chat messages and note content sent to AI provider when user initiates AI features)
