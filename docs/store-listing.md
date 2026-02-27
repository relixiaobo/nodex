# Chrome Web Store Listing

## Extension Name
soma

## Short Description (132 chars max)
Cloud knowledge management in Chrome Side Panel. Outline notes, tag & organize, sync across devices.

## Detailed Description

soma is a knowledge management tool that lives in your Chrome Side Panel. Capture ideas, organize projects, and build your personal knowledge base — all without leaving the browser.

**Outline your thoughts**
Structure notes with a powerful nested outliner. Expand, collapse, drag to reorder, and navigate entirely from the keyboard.

**Tag & organize anything**
Apply tags to add structured fields like status, priority, and due dates. Create custom tag templates to fit your workflow.

**Find anything instantly**
Press Cmd+K to search all your notes or jump to Library, Inbox, Journal, and more.

**Sync across devices**
Your notes sync automatically to the cloud. Edit offline — changes merge seamlessly when you're back online.

**Rich text editing**
Bold, italic, code, highlights, and internal links between notes. A full-featured writing experience in your side panel.

**Always within reach**
Click the soma icon on any webpage to open your notes alongside what you're reading. No tab-switching needed.

---

## Category
Productivity

## Language
English

## Screenshots to upload (in order)
1. `01-library-overview.png` — Library view with outliner, tags, and fields
2. `06-node-detail-wide.png` — Node detail with breadcrumb navigation
3. `05-command-palette-wide.png` — Command palette (Cmd+K) quick search

All screenshots are 2560x1600 (Retina 2x), located in `docs/store-screenshots/`.

## Privacy Policy (single purpose description)
Cloud knowledge management in Chrome Side Panel.

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
- **User activity**: No
