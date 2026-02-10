# Nodex Testing Checklist

## How to Test

### Method 1: Load Unpacked (Recommended)

1. Open Chrome, navigate to `chrome://extensions/`
2. Enable "Developer mode" (top-right toggle)
3. Click "Load unpacked"
4. Select the folder: `<project-root>/.output/chrome-mv3/`
5. The extension will appear. Click the Nodex icon in the toolbar to open the Side Panel.

### Method 2: Test Page in Tab

After loading unpacked, open the test page in a new tab:

```
chrome-extension://<EXTENSION_ID>/test.html
```

To find your extension ID: go to `chrome://extensions/`, find "Nodex", and copy the ID shown below the name.

The test page pre-seeds sample data (a project with tasks, notes, rich text examples, inbox items, journal entries) so you can immediately test all interactions without Supabase.

### Rebuilding After Changes

```bash
npm run build
```

Then go to `chrome://extensions/` and click the refresh button (circular arrow) on the Nodex extension card.

---

## 1. Layout & Sidebar

### 1.1 Overall Layout
- [ ] App renders with sidebar on the left, main panel on the right
- [ ] No blank screens or JavaScript errors on load

### 1.2 Sidebar Navigation
- [ ] Sidebar shows: Library, Inbox, Journal, Searches, Trash
- [ ] Each item has a Lucide icon (Library, Inbox, Calendar, Search, Trash)
- [ ] Clicking a nav item switches the main panel to that container
- [ ] Active item is highlighted with primary color background
- [ ] **Tana comparison**: Tana sidebar has Today, Supertags, Recents, AI chats, Create new, Search. Our sidebar has Library/Inbox/Journal/Searches/Trash — different navigation model, acceptable for v1.

### 1.3 Sidebar Toggle
- [ ] Click the sidebar toggle button (PanelLeft icon) in the panel header
- [ ] Sidebar collapses/expands
- [ ] Main panel fills the available width when sidebar is hidden

### 1.4 Search Button in Sidebar
- [ ] Search bar in sidebar shows "Search..." placeholder with keyboard shortcut hint
- [ ] Clicking it opens the command palette

---

## 2. Outliner Core

### 2.1 Node Display
- [ ] Nodes render with bullet point + text
- [ ] Empty nodes show "Untitled" in muted color
- [ ] Nodes indent correctly based on their depth level (24px per level)
- [ ] **Tana comparison**: Tana uses a solid black dot (●) for regular bullets. Verify our bullet size and style are visually similar.

### 2.2 Expand / Collapse
- [ ] Nodes with children show a chevron (`>`) instead of a plain bullet
- [ ] Clicking the chevron expands children inline (chevron rotates to `v`)
- [ ] Clicking again collapses children (chevron rotates back to `>`)
- [ ] Expanded state persists after navigating away and back
- [ ] **Tana comparison**: In Tana, the chevron is a circle `(>)` that appears to the LEFT of the bullet on hover. Our implementation shows the chevron in place of the bullet. Note: this is a known visual difference — Tana's chevron is a separate element from the bullet.

### 2.3 Drill-Down (Panel Navigation)
- [ ] Double-clicking the BulletChevron opens the node as a full panel (drill-down)
- [ ] The panel header shows the node name as the title
- [ ] A back button (`<`) appears in the header
- [ ] Clicking back returns to the previous panel
- [ ] **Tana comparison**: In Tana, single-clicking the bullet (not chevron) triggers drill-down. The drilled-in panel shows the node title in large heading font with children listed below. We use double-click on chevron — verify this feels natural.

### 2.4 Empty State
- [ ] When a container has no children, a "+ Click to add a node" button appears
- [ ] Clicking it creates a new node and focuses it for editing

---

## 3. Node Editing (TipTap)

### 3.1 Focus & Edit
- [ ] Clicking on a node's text activates the TipTap editor (cursor appears)
- [ ] The editor auto-focuses at the end of the text
- [ ] Clicking outside the editor (blurring) saves the content
- [ ] Content persists after blur — clicking the node again shows the saved text

### 3.2 Rich Text
- [ ] **Bold**: Select text, press `Cmd+B` — text becomes bold
- [ ] **Italic**: Select text, press `Cmd+I` — text becomes italic
- [ ] **Code**: Select text, press `` Cmd+` `` (if supported) — text wraps in `<code>`
- [ ] **Strikethrough**: Select text, press `Cmd+Shift+S` (if supported)
- [ ] Rich text formatting is preserved after blur and re-focus
- [ ] **Tana comparison**: Tana supports bold, italic, code, highlight, strikethrough. The styling should match visually.

### 3.3 Placeholder
- [ ] An empty focused node shows "Type something..." placeholder in muted color
- [ ] The placeholder disappears when you start typing

---

## 4. Keyboard Shortcuts

### 4.1 Node Creation
- [ ] **Enter**: Creates a new sibling node below the current one
- [ ] New node is automatically focused for editing
- [ ] Content before Enter is saved to the current node

### 4.2 Indent / Outdent
- [ ] **Tab**: Indents the current node (makes it a child of the previous sibling)
- [ ] The previous sibling auto-expands to show the indented node
- [ ] **Shift+Tab**: Outdents the current node (moves it to parent's level)
- [ ] Cannot indent the first child (Tab does nothing)
- [ ] Cannot outdent a top-level node (Shift+Tab does nothing)

### 4.3 Delete
- [ ] **Backspace** on an empty node: Deletes the node and focuses the previous node
- [ ] **Backspace** on a non-empty node: Normal text editing (deletes character)
- [ ] Deleted nodes are moved to Trash container

### 4.4 Arrow Navigation
- [ ] **Arrow Up** (when cursor is at start of text): Focus moves to previous visible node
- [ ] **Arrow Down** (when cursor is at end of text): Focus moves to next visible node
- [ ] Navigation respects expand/collapse state (skips collapsed children)
- [ ] **Tana comparison**: Tana uses the same arrow up/down behavior at text boundaries.

### 4.5 Move Node
- [ ] **Cmd+Shift+Up**: Moves the node up among its siblings (swap with previous)
- [ ] **Cmd+Shift+Down**: Moves the node down among its siblings (swap with next)
- [ ] Node stays focused after moving
- [ ] Cannot move the first sibling up or the last sibling down

---

## 5. Drag and Drop

### 5.1 Basic DnD
- [ ] Nodes become draggable when NOT focused (editing)
- [ ] During drag, the dragged node appears dimmed (opacity: 40%)
- [ ] A blue horizontal line indicator shows where the node will be dropped

### 5.2 Drop Zones (3-zone system)
- [ ] **Top third of target**: Blue line appears ABOVE the target (drop before)
- [ ] **Bottom third of target**: Blue line appears BELOW the target (drop after)
- [ ] **Middle third of target**: Target gets a blue ring highlight (drop inside as child)

### 5.3 Drop Actions
- [ ] Dropping "before" places the node above the target as a sibling
- [ ] Dropping "after" places the node below the target as a sibling
- [ ] Dropping "inside" makes the node a child of the target (target auto-expands)
- [ ] Dropping "after" an expanded node with children inserts as first child

### 5.4 Safety
- [ ] Cannot drop a node onto itself
- [ ] Cannot drop a node onto its own descendant (prevents circular references)
- [ ] Drag indicator clears when leaving a drop zone

---

## 6. Command Palette (Cmd+K)

### 6.1 Open / Close
- [ ] **Cmd+K** (or Ctrl+K on Windows): Opens the command palette
- [ ] **Cmd+K** again: Closes the palette
- [ ] **Esc**: Closes the palette
- [ ] Clicking the backdrop closes the palette

### 6.2 Quick Navigation
- [ ] When empty (no query): Shows container shortcuts (Library, Inbox, Journal, Trash)
- [ ] Selecting a container navigates to it (pushes panel)

### 6.3 Node Search
- [ ] Typing a query filters nodes from the cache
- [ ] Results show node names with a file icon
- [ ] HTML tags are stripped from search results (shows plain text)
- [ ] Selecting a result navigates to that node (pushes panel)
- [ ] "No results found" shown when query matches nothing
- [ ] Results limited to 20 items

---

## 7. Panel Header

### 7.1 Display
- [ ] Shows the current panel's node name (HTML tags stripped)
- [ ] For container nodes (Library, Inbox, etc.), shows the container name

### 7.2 Navigation
- [ ] Back button appears only when there's history (panelStack > 1)
- [ ] Clicking back returns to the previous panel
- [ ] Sidebar toggle button works

### 7.3 Search
- [ ] Search button (magnifying glass icon) opens the command palette

---

## 8. Visual Styling

### 8.1 Theme
- [ ] Background is white (#ffffff)
- [ ] Text is dark (#0f172a)
- [ ] Primary accent is indigo (#6366f1)
- [ ] Border color is light gray (#e2e8f0)
- [ ] Muted text is gray (#64748b)

### 8.2 TipTap Styles
- [ ] Bold text renders with `font-weight: 600`
- [ ] Italic text renders properly
- [ ] Inline code has muted background and mono font
- [ ] Strikethrough has line-through decoration
- [ ] Highlighted text has yellow background (#fef08a)
- [ ] Links appear in primary color with underline

### 8.3 Responsiveness
- [ ] Side Panel (~400px width): All elements fit without overflow
- [ ] Test page (full tab width): Layout expands naturally
- [ ] Sidebar takes 224px (w-56), main panel fills the rest

---

## 9. Data Persistence

### 9.1 State Persistence (chrome.storage)
- [ ] Close the Side Panel, reopen it — panel stack is preserved
- [ ] Expanded/collapsed state is preserved across sessions
- [ ] Sidebar open/close state is preserved
- [ ] View mode preference is preserved

### 9.2 Node Data (Offline Mode)
- [ ] Nodes created in offline/demo mode persist within the session
- [ ] Creating, editing, indenting, outdenting all work without Supabase
- [ ] No error messages or console errors related to Supabase

---

## 10. Known Differences from Tana

These are intentional differences in the current v1 implementation:

| Feature | Tana | Nodex v1 | Notes |
|---------|------|----------|-------|
| Bullet style | Circle `(>)` chevron LEFT of solid dot | Chevron replaces bullet | Future: add separate chevron + bullet |
| Drill-down trigger | Single-click on bullet | Double-click on chevron | Future: add bullet click handler |
| Bullet color | Blue for tagged nodes | Same color for all | Future: tag-aware bullet colors |
| Tag badges | `# mytag` blue pill | Not implemented | Planned for Step 7 |
| Progress bar | Green bar with fraction | Not implemented | Planned for future |
| Done checkbox | Green ✅ with strikethrough | Not implemented | Planned for Step 7 |
| Inline references | Blue underlined text | Not implemented | Planned for Step 5 |
| Reference nodes | Entirely blue/underlined | Not implemented | Planned for Step 5 |
| Search nodes | Magnifying glass bullet | Not implemented | Planned for Step 8 |
| Sidebar items | Today, Supertags, Recents | Library, Inbox, Journal | Different navigation model |
| Panel title | Large heading on drill-down | Small text in header bar | Future: large panel title |

---

## 11. Test Page Specific

The test page (`chrome-extension://<ID>/test.html`) pre-seeds the following sample data:

### Library
- **My Project** (expanded)
  - Design the data model (expanded)
    - Define node types and properties
    - Create database migration
  - Build the outliner UI (expanded)
    - Implement BulletChevron component
    - Add keyboard navigation
    - Implement drag and drop
  - Connect to Supabase
- **Meeting notes - Team standup**
  - Discussed project timeline
  - Need to review PR #42
  - Next meeting on Friday
- **Quick ideas**
  - Try using virtual scrolling for large lists
  - Add dark mode support
- **Rich text formatting tests** (expanded)
  - **Bold text** mixed with normal
  - *Italic text* and ***bold italic***
  - Inline `code snippet` in a sentence
  - ~~Strikethrough text~~ for done items
  - Text with ==highlighted== parts

### Inbox
- Read the article about Chrome extensions
- Respond to email from client
- Review pull request
  - Check test coverage
  - Verify performance impact

### Journal
- Today's Journal
  - Started working on the outliner component
  - Fixed a bug in the drag and drop handler
  - Learned about TipTap keyboard shortcuts

---

## Feedback Template

When reporting issues, please use this format:

```
## Issue: [brief description]
- **Section**: [checklist section number, e.g., "4.2 Indent / Outdent"]
- **Steps**: [how to reproduce]
- **Expected**: [what should happen]
- **Actual**: [what actually happens]
- **Screenshot**: [if applicable]
```
