# Chrome Web Store Listing

## Extension Name
soma

## Short Description (132 chars max)
Think where you read. Write what you think, connect what you know, compound what you learn — in your browser side panel.

## Detailed Description

**Think where you read.**

You read a lot online. Most of it fades — not because it wasn't good, but because you didn't stop to think about it. soma changes that.

soma lives in your browser side panel. While you read, you think. While you think, you write. Your notes sit right beside the page — no tab-switching, no "save for later" that becomes never.

**Think — write what you think**
The moment you read something that matters, capture it. Highlight a sentence. Jot a reaction. Write it in your own words. Each step is thinking — from a quick highlight to a full reflection.

**Connect — find the threads**
Tag your notes, drag them into structure, link ideas together. Every time you organize, you discover relationships you didn't see before. Organizing isn't filing — it's thinking.

**Compound — AI reveals the threads in your thinking**
AI doesn't think for you — it reveals the threads in your own thinking. Three cognitive workflows make your notes compound over time:
• **Reading Ring** — When you clip a page, AI extracts the thinking framework and connects it to your existing notes. You focus on "what does this make me think?" instead of summarizing.
• **Collision Ring** — Open Chat with a half-formed idea. AI adds density and angles. You leave with sharper questions, not just answers.
• **Review Ring** — `/review` analyzes how your thinking has evolved: new structures emerging, old ones upgrading, hidden contradictions. A cognitive mirror, not a summary.

**How it works**
• Nested outliner with keyboard-first navigation — expand, collapse, drag, indent
• Tags with structured fields — status, priority, dates, custom templates
• Highlight text on any webpage — each highlight is already a thought
• Cmd+K to search everything — notes, tags, commands
• Daily journal for stream-of-consciousness capture
• Rich text — bold, italic, code, highlights, internal links between notes
• Sync across devices — edit offline, changes merge automatically
• AI chat for thinking out loud — bring a rough idea, leave with a sharper one
• Clip any webpage — AI extracts the structure so you can focus on your own reactions

**Not another bookmark manager.** soma doesn't help you save more — it helps you think more. 100 notes you've thought through beat 10,000 unread bookmarks.

---

## Category
Productivity

## Language
English

## Promo images
- `images/promo-marquee.png` — 1400×560 marquee: "Think where you read" + Think→Connect→Compound pills + browser mockup

## Screenshots to upload (in order)
1. `images/screenshot-1-overview.png` — Think where you read: browser + side panel overview (1280×800)
2. `images/screenshot-2-think.png` — Write it in your own words: reading → understanding (1280×800)
3. `images/screenshot-3-connect.png` — Organize your notes, discover what you think (1280×800)
4. `images/screenshot-4-compound.png` — AI finds the threads in your thinking (1280×800)
5. `images/screenshot-5-belief.png` — 100 notes thought through beat 10,000 unread bookmarks (1280×800)

HTML source files for regenerating screenshots: `image-sources/`

## Privacy Policy (single purpose description)
Think where you read — knowledge management in your browser side panel.

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
