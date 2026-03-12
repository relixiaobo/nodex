# AI Tool Definitions — Complete Schema

> All tool schemas for soma AI, designed to maximize LLM call accuracy.
> Conventions: descriptions include default behavior + limits + error recovery (CiC pattern).
> Parameter descriptions include type, default, examples, and constraints.
>
> **CiC 参考来源**：browser tool 的参数设计参考了 Claude in Chrome（CiC）的工具定义质量标准
> （`docs/research/claude-in-chrome-log.md`）。CiC 以 17 个独立工具拆分，soma 合并为单一 `browser` 工具
> 17 actions——架构不同，但参数描述质量（defaults、examples、edge cases）对齐 CiC 水准。
> Phase 3 实施时逐个 action 对照 CiC 对应工具细化参数。
>
> 2026-03-12 — Draft for review

---

## Phase 1: Knowledge Tools

### Tool: `node`

```
name: "node"
label: "Node"
description: |
  Create, read, update, delete, or search nodes in the user's knowledge graph.
  The knowledge graph is a tree of nodes. Each node has a name, optional description,
  optional tags (supertags), and children. Nodes can be organized hierarchically.

  Actions:
  - "create": Create a new node. Defaults to creating under today's journal node.
  - "read": Read a node and its children summaries. Children are paginated (default 20).
    Call read multiple times with childOffset to explore large subtrees.
  - "update": Update a node's name, description, tags, or position. Supports partial updates.
  - "delete": Move a node to Trash (recoverable). Cannot delete system/locked nodes.
  - "search": Search nodes by text, tags, or date. Returns paginated results (default 20).

  Reference format: When mentioning nodes in your response, use <ref id="nodeId">display name</ref>.
  For citations, use <cite id="nodeId">N</cite>.

  All write operations (create/update/delete) are committed with origin 'ai:chat'
  and can be undone with the undo tool (isolated from user's ⌘Z history).
```

#### Parameters

```typescript
{
  action: {
    type: "string",
    enum: ["create", "read", "update", "delete", "search"],
    description: "The operation to perform on the knowledge graph.",
    required: true,
  },

  // ── create ──

  name: {
    type: "string",
    description: "Node name/title. Required for 'create'. For 'update', the new name to set. "
      + "Supports plain text only — rich formatting (bold, links) is not supported here.",
  },

  parentId: {
    type: "string",
    description: "Parent node ID. For 'create': where to place the new node (defaults to today's "
      + "journal node if omitted). For 'update': set this to move the node to a new parent.",
  },

  position: {
    type: "number",
    description: "Zero-based index in the parent's children list. For 'create': insertion position "
      + "(defaults to end). For 'update': new position after move. Omit to append at end.",
  },

  tags: {
    type: "array of strings",
    description: "For 'create': tag names to apply (e.g. ['task', 'source']). Use tag display names, "
      + "not IDs — the system resolves names to IDs automatically, creating new tags if needed. "
      + "For 'update': use addTags/removeTags instead.",
  },

  content: {
    type: "string",
    description: "Node description/body text. For 'create': initial description. For 'update': "
      + "replaces the entire description. Supports plain text and <ref id=\"nodeId\">text</ref> "
      + "references which will be converted to inline references. Omit to leave unchanged.",
  },

  // ── read ──

  nodeId: {
    type: "string",
    description: "Target node ID. Required for 'read', 'update', and 'delete'.",
  },

  depth: {
    type: "number",
    description: "For 'read': how many levels of children to include (default: 1, max: 3). "
      + "depth=1 returns direct children summaries. depth=2 includes grandchildren summaries. "
      + "Use depth=0 to read only the node itself without children.",
    default: 1,
  },

  childOffset: {
    type: "number",
    description: "For 'read': skip this many children before returning results (default: 0). "
      + "Use with childLimit for pagination when a node has many children.",
    default: 0,
  },

  childLimit: {
    type: "number",
    description: "For 'read': maximum number of children to return (default: 20, max: 50). "
      + "The response includes a 'total' count so you know if there are more.",
    default: 20,
  },

  // ── update ──

  addTags: {
    type: "array of strings",
    description: "For 'update': tag names to add (e.g. ['task']). Use display names, not IDs. "
      + "New tags are created automatically if they don't exist.",
  },

  removeTags: {
    type: "array of strings",
    description: "For 'update': tag names to remove (e.g. ['task']). Use display names.",
  },

  checked: {
    type: "boolean",
    description: "For 'update': set the node's checkbox state. true = done, false = not done, "
      + "null = remove checkbox. Only works on nodes with checkbox enabled.",
  },

  // ── search ──

  query: {
    type: "string",
    description: "For 'search': text to search for (fuzzy matching, supports CJK). "
      + "Searches node names and descriptions. Omit to search by tags/date only.",
  },

  searchTags: {
    type: "array of strings",
    description: "For 'search': filter by tag names (AND logic — all tags must match). "
      + "Use display names (e.g. ['task', 'source']), not IDs.",
  },

  dateRange: {
    type: "object",
    description: "For 'search': filter by creation date. "
      + "Example: {\"from\": \"2026-03-01\", \"to\": \"2026-03-12\"} for nodes created in this range. "
      + "Both from and to are optional (omit for open-ended range).",
    properties: {
      from: { type: "string", description: "Start date (ISO format, inclusive)" },
      to: { type: "string", description: "End date (ISO format, inclusive)" },
    },
  },

  limit: {
    type: "number",
    description: "For 'search': maximum results to return (default: 20, max: 50).",
    default: 20,
  },

  offset: {
    type: "number",
    description: "For 'search': skip this many results for pagination (default: 0).",
    default: 0,
  },
}
```

#### Return Values

**create** returns:
```json
{
  "id": "abc123",
  "name": "Meeting notes",
  "parentId": "day_20260312",
  "parentName": "2026-03-12",
  "tags": ["task"]
}
```

**read** returns:
```json
{
  "id": "abc123",
  "name": "AI Research",
  "description": "Notes on transformer architectures",
  "tags": ["source", "AI"],
  "fields": [
    { "name": "URL", "value": "https://arxiv.org/..." },
    { "name": "Status", "value": "reading" }
  ],
  "checked": null,
  "parent": { "id": "day_20260312", "name": "2026-03-12" },
  "breadcrumb": ["Journal", "2026-03-12"],
  "children": {
    "total": 45,
    "offset": 0,
    "limit": 20,
    "items": [
      { "id": "child1", "name": "Attention mechanism", "hasChildren": true, "childCount": 3, "tags": [] },
      { "id": "child2", "name": "Key findings", "hasChildren": false, "childCount": 0, "tags": ["insight"] }
    ]
  }
}
```

**update** returns:
```json
{
  "id": "abc123",
  "name": "AI Research (updated)",
  "updated": ["name", "tags"]
}
```

**delete** returns:
```json
{
  "id": "abc123",
  "name": "Old note",
  "movedToTrash": true
}
```

**search** returns:
```json
{
  "total": 42,
  "offset": 0,
  "limit": 20,
  "items": [
    {
      "id": "abc123",
      "name": "Transformer Architecture Notes",
      "tags": ["source", "AI"],
      "snippet": "...self-attention mechanism allows the model to...",
      "createdAt": "2026-03-10T14:30:00Z",
      "parentName": "2026-03-10"
    }
  ]
}
```

---

### Tool: `undo`

```
name: "undo"
label: "Undo"
description: |
  Undo recent AI operations on the knowledge graph. Only undoes operations made by AI
  in this conversation — user's own edits are never affected.

  Uses a dedicated AI UndoManager (isolated from the user's ⌘Z timeline via origin prefix).
  Each undo step reverses one atomic AI operation (e.g., one create, one move, one tag change).
  Maximum 20 steps per call.

  Note: the user can still undo AI operations via ⌘Z (the main UndoManager includes AI ops).
  This tool only goes in the reverse direction — there is no AI redo.
```

#### Implementation Note

```
AI isolation via Loro origin prefix:
- All AI write operations commit with origin 'ai:chat'
- Main UndoManager (⌘Z): does NOT exclude 'ai:' → user can undo AI ops too
- AI UndoManager (this tool): excludes all non-'ai:' origins → only tracks AI ops
- Two UndoManagers on the same LoroDoc, each with different excludeOriginPrefixes
```

#### Parameters

```typescript
{
  steps: {
    type: "number",
    description: "Number of AI operations to undo (default: 1, max: 20). Each step reverses "
      + "one atomic AI operation. User operations are never affected.",
    default: 1,
  },
}
```

#### Return Value

```json
{
  "undone": 3,
  "remaining": 12
}
```

---

## Phase 3: Browser Tool

> Adapted from Claude in Chrome patterns for soma's Chrome extension context.
> soma runs as a Side Panel — browser tool operates on the user's active tab via
> Content Script (L0/L1) or Chrome DevTools Protocol (L2).

### Tool: `browser`

```
name: "browser"
label: "Browser"
description: |
  Read, interact with, and debug the user's browser tab. All actions target the
  user's currently active tab unless a tabId is specified.

  Observation actions (no side effects):
  - "get_text": Extract the main text content of the page. Limited to 30000 characters;
    use textOffset for pagination on long pages.
  - "get_metadata": Get page metadata (title, URL, author, date). Lightweight — call
    this first to understand what the user is viewing.
  - "find": Search for text on the page. Returns up to 20 matching excerpts with context.
  - "get_selection": Get the user's currently selected/highlighted text.
  - "screenshot": Take a screenshot of the visible viewport. Returns an image.
  - "read_network": Read recent network requests (XHR/fetch). Requires CDP.
  - "read_console": Read console log messages. Requires CDP.

  Interaction actions (have side effects):
  - "click": Click an element by CSS selector or natural language description.
  - "type": Type text into the currently focused element.
  - "key": Press keyboard keys (e.g., "Enter", "Escape", "cmd+a").
  - "scroll": Scroll the page in a direction.
  - "drag": Drag an element to a target position or element.
  - "fill_form": Set a form field value by selector (input, select, checkbox, etc.).

  Control actions:
  - "navigate": Go to a URL or navigate back/forward in history.
  - "tab": Switch, create, or close browser tabs.
  - "wait": Wait for a specified duration or until an element appears.
  - "execute_js": Execute JavaScript in the page context. Use sparingly — prefer
    structured actions over raw JS.

  Before interacting with elements, use find or screenshot to locate the target.
  For form inputs, prefer fill_form over click+type sequences.

  Safety: Destructive actions (form submissions, purchases, account changes) require
  user confirmation. Never submit payment forms or delete user accounts without
  explicit approval.
```

#### Parameters

```typescript
{
  action: {
    type: "string",
    enum: [
      // observation
      "get_text", "get_metadata", "find", "get_selection", "screenshot",
      "read_network", "read_console",
      // interaction
      "click", "type", "key", "scroll", "drag", "fill_form",
      // control
      "navigate", "tab", "wait", "execute_js"
    ],
    description: "The browser operation to perform.",
    required: true,
  },

  // ── get_text ──

  maxChars: {
    type: "number",
    description: "For 'get_text': maximum characters to return (default: 30000). "
      + "Use with textOffset for pagination on long pages.",
    default: 30000,
  },

  textOffset: {
    type: "number",
    description: "For 'get_text': character offset to start reading from (default: 0). "
      + "Use for pagination when page text exceeds maxChars.",
    default: 0,
  },

  // ── find ──

  query: {
    type: "string",
    description: "For 'find': text or pattern to search for on the page. Case-insensitive. "
      + "Returns up to 20 matching excerpts with surrounding context (50 chars before/after).",
  },

  // ── click / fill_form / drag ──

  selector: {
    type: "string",
    description: "CSS selector of the target element. For 'click', 'fill_form', and 'drag'. "
      + "Examples: 'button.submit', '#login-form input[type=email]', '[data-testid=save-btn]'. "
      + "If the selector matches multiple elements, the first visible one is used.",
  },

  elementDescription: {
    type: "string",
    description: "Natural language description of the element to interact with. "
      + "Alternative to selector — the system uses page structure to find the best match. "
      + "Examples: 'the login button', 'search input field', 'the third item in the list'. "
      + "Provide either selector or elementDescription, not both.",
  },

  // ── type / key ──

  text: {
    type: "string",
    description: "For 'type': the text to type into the focused element. "
      + "For 'key': keyboard key(s) to press. Space-separated for sequences. "
      + "Supports modifiers: 'cmd+a' (Mac), 'ctrl+a' (Windows/Linux), 'Enter', "
      + "'Escape', 'Tab', 'Backspace', 'ArrowUp', 'ArrowDown'. "
      + "Examples: 'Enter', 'cmd+c', 'Backspace Backspace'.",
  },

  // ── scroll ──

  direction: {
    type: "string",
    enum: ["up", "down", "left", "right"],
    description: "For 'scroll': direction to scroll. Default amount is 3 ticks (~300px).",
  },

  amount: {
    type: "number",
    description: "For 'scroll': number of scroll ticks (default: 3, range: 1-10). "
      + "Each tick is approximately 100px.",
    default: 3,
  },

  // ── drag ──

  targetSelector: {
    type: "string",
    description: "For 'drag': CSS selector of the drop target element. "
      + "Alternatively, use targetPosition for pixel coordinates.",
  },

  targetPosition: {
    type: "object",
    description: "For 'drag': drop target as pixel coordinates { x, y } relative to viewport.",
    properties: {
      x: { type: "number" },
      y: { type: "number" },
    },
  },

  // ── fill_form ──

  value: {
    type: "string | boolean | number",
    description: "For 'fill_form': the value to set. For text inputs use string, "
      + "for checkboxes use boolean, for selects use option text or value, "
      + "for number inputs use number.",
  },

  // ── navigate ──

  url: {
    type: "string",
    description: "For 'navigate': URL to go to (defaults to https:// if no protocol). "
      + "Use 'back' for browser back, 'forward' for browser forward.",
  },

  // ── tab ──

  tabAction: {
    type: "string",
    enum: ["switch", "create", "close", "list"],
    description: "For 'tab': the tab operation. 'switch' activates a tab by tabId, "
      + "'create' opens a new tab (optionally with url), 'close' closes a tab by tabId, "
      + "'list' returns all open tabs.",
  },

  tabId: {
    type: "number",
    description: "For 'tab': target tab ID. Required for 'switch' and 'close'. "
      + "Get tab IDs from 'tab' action with tabAction='list'.",
  },

  // ── wait ──

  duration: {
    type: "number",
    description: "For 'wait': seconds to wait (default: 2, max: 10).",
    default: 2,
  },

  waitFor: {
    type: "string",
    description: "For 'wait': CSS selector to wait for — returns when the element appears "
      + "in the DOM (max 10 seconds). Alternative to duration-based waiting.",
  },

  // ── read_network ──

  urlPattern: {
    type: "string",
    description: "For 'read_network': filter requests by URL pattern (substring match). "
      + "Omit to return all recent requests. Returns up to 50 most recent matching requests.",
  },

  // ── read_console ──

  logLevel: {
    type: "string",
    enum: ["all", "error", "warn", "log", "info"],
    description: "For 'read_console': filter by log level (default: 'all'). "
      + "Returns up to 100 most recent matching messages.",
    default: "all",
  },

  // ── execute_js ──

  code: {
    type: "string",
    description: "For 'execute_js': JavaScript code to run in the page context. "
      + "The result of the last expression is returned. Do NOT use 'return' — "
      + "just write the expression (e.g., 'document.title' not 'return document.title'). "
      + "Max 5000 characters.",
  },
}
```

#### Return Values

**get_text** returns:
```json
{
  "text": "Article content here...",
  "totalLength": 45000,
  "offset": 0,
  "truncated": true
}
```

**get_metadata** returns:
```json
{
  "title": "Attention Is All You Need",
  "url": "https://arxiv.org/abs/1706.03762",
  "author": "Vaswani et al.",
  "publishDate": "2017-06-12",
  "description": "The dominant sequence transduction models...",
  "siteName": "arXiv"
}
```

**find** returns:
```json
{
  "matches": [
    { "excerpt": "...the self-**attention** mechanism allows...", "index": 1243 }
  ],
  "total": 5
}
```

**get_selection** returns:
```json
{
  "text": "The user's selected text",
  "hasSelection": true
}
```

**screenshot** returns:
```json
{
  "imageId": "screenshot_001",
  "width": 1280,
  "height": 720
}
```
Plus the image content in the tool result.

**click** returns:
```json
{ "clicked": true, "element": "button.submit" }
```

**type** returns:
```json
{ "typed": true, "length": 15 }
```

**drag** returns:
```json
{ "dragged": true, "from": "selector", "to": "targetSelector" }
```

**navigate** returns:
```json
{
  "url": "https://example.com/page",
  "title": "Page Title",
  "loaded": true
}
```

**tab** (list) returns:
```json
{
  "tabs": [
    { "tabId": 123, "title": "Page Title", "url": "https://...", "active": true },
    { "tabId": 456, "title": "Other Page", "url": "https://...", "active": false }
  ]
}
```

**read_network** returns:
```json
{
  "requests": [
    { "url": "https://api.example.com/data", "method": "GET", "status": 200, "type": "xhr", "size": 1234 }
  ],
  "total": 12
}
```

**read_console** returns:
```json
{
  "messages": [
    { "level": "error", "text": "Uncaught TypeError: ...", "timestamp": "2026-03-12T14:30:00Z" }
  ],
  "total": 5
}
```

**execute_js** returns:
```json
{
  "result": "evaluated value as string",
  "type": "string"
}
```

---

## Tool Design Patterns Summary

### Description Quality (CiC standard)

Every tool description includes:
1. **What it does** — one-sentence summary
2. **Available actions** — list with one-line each
3. **Defaults and limits** — pagination defaults, max values
4. **Error recovery** — what to do when output is too large or element not found
5. **Usage guidance** — when to use this tool vs others

### Parameter Description Quality

Every parameter description includes:
1. **Which action(s) it applies to** — "For 'create': ..."
2. **Default value** — "default: 20"
3. **Examples** — concrete values the LLM can imitate
4. **Constraints** — "max: 50", "range: 1-10"
5. **Alternatives** — "provide either selector or elementDescription, not both"

### Tag Name vs ID Resolution

Node tool accepts **display names** for tags (e.g., "task", "source"), not internal IDs.
The execute layer resolves names → IDs via fuzzy matching against existing tagDefs.
If no match, a new tagDef is auto-created. This removes a round-trip for the LLM.

### Unified Reference Format

All tools output node references as `<ref id="nodeId">text</ref>`.
Chat renderer and node content parser each handle materialization independently.
