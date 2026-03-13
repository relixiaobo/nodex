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
> 2026-03-12 — Phase 1.5 update: 6 focused tools replacing monolithic node tool

---

## Phase 1.5: Knowledge Tools (6 focused tools)

> Phase 1 had a single `node` tool with 5 actions and 20+ shared params.
> Phase 1.5 splits into 6 independent tools with 3-10 focused params each.

### Tool 1: `node_create`

```
name: "node_create"
label: "Create Node"
description: |
  Create new nodes. Supports single nodes, trees (via children), field values,
  references, siblings, and duplicates — everything is a node.

  Structured content belongs in children, not description. Each child is a node with its own name.
  Use data.description only for short metadata summaries, not for main content.

  Use data to set raw node properties: type, description, color, fieldType, cardinality,
  showCheckbox, etc. data cannot set rich text internals, tree structure, tags, or timestamps.

  Quick patterns:
  - Content node: node_create(name: "...", parentId: "...")
  - With tags + fields: node_create(name: "...", tags: ["task"], fields: {"Status": "Todo"})
  - Tree: node_create(parentId: "...", children: [{name: "...", children: [...]}])
  - Reference: node_create(parentId: "...", targetId: "nodeId")
  - Sibling: node_create(afterId: "...", name: "...")
  - Duplicate: node_create(duplicateId: "nodeId")
  - Field value (direct): node_create(parentId: "fieldEntryId", name: "value")

  All write operations use isolated undo — undoable with the undo tool.
```

#### Parameters

```typescript
{
  name: {
    type: "string",
    description: "Node name/title. Required for content nodes. "
      + "Not needed for reference (targetId) or duplicate (duplicateId) modes.",
  },

  parentId: {
    type: "string",
    description: "Parent node ID. Defaults to today's journal node if omitted. "
      + "Mutually exclusive with afterId.",
  },

  afterId: {
    type: "string",
    description: "Create a sibling after this node (same parent). Mutually exclusive with parentId.",
  },

  position: {
    type: "number",
    description: "Zero-based insertion position in parent's children list. Defaults to end.",
  },

  tags: {
    type: "array of strings",
    description: "Tag display names to apply (e.g. ['task', 'source']). Names auto-resolve to IDs; "
      + "new tags are created if they don't exist. Template fields are synced after tagging.",
  },

  data: {
    type: "Record<string, unknown>",
    description: "Raw node properties to set while creating. "
      + "Allows type, description, color, fieldType, cardinality, nullable, showCheckbox, etc. "
      + "Use data.description only for short metadata summaries — structured content belongs in children. "
      + "children/tags/name/richText/marks/inlineRefs/createdAt/updatedAt are blocked.",
  },

  fields: {
    type: "Record<string, string>",
    description: "Convenience field setting by display name. Example: {\"Status\": \"Todo\", \"Priority\": \"High\"}. "
      + "For options fields: selects existing option or auto-collects a new one. "
      + "For plain/url/etc: sets as text value. Requires tags to be applied first (fields resolve from tag templates).",
  },

  targetId: {
    type: "string",
    description: "Create a reference node pointing to this target. "
      + "The reference appears as a child of parentId.",
  },

  duplicateId: {
    type: "string",
    description: "Deep-copy this node. Creates a sibling of the original with all children and fields.",
  },

  children: {
    type: "array of CreateChildInput",
    description: "Recursively create a subtree (max depth 3). Each child can have: "
      + "name, tags, content, data, fields, targetId, children. "
      + "All nodes created in one commit = one undo step.",
  },
}
```

#### Smart Dispatch

| Condition | Behavior |
|-----------|----------|
| `duplicateId` | `store.duplicateNode()` |
| `targetId` (no children) | `store.addReference(parentId, targetId)` |
| `afterId` | `store.createSibling(afterId, data)` |
| otherwise | `store.createChild(parentId, position, data)` |

#### Return Value

```json
{
  "id": "abc123",
  "name": "Buy groceries",
  "parentId": "day_20260312",
  "parentName": "2026-03-12",
  "tags": ["task"],
  "childrenCreated": 0
}
```

---

### Tool 2: `node_read`

```
name: "node_read"
label: "Read Node"
description: |
  Read a node's raw type/data, content, fields, and children. Fields show type
  and available options. Field entries are in the fields array, not in children
  — children only lists content nodes and references.

  Use node_read to inspect raw nodeData like fieldType/color/cardinality before
  editing, or to discover field entry IDs for direct manipulation.
```

#### Parameters

```typescript
{
  nodeId: { type: "string", required: true },
  depth: { type: "number", default: 1, max: 3 },
  childOffset: { type: "number", default: 0 },
  childLimit: { type: "number", default: 20, max: 50 },
}
```

#### Return Value

```json
{
  "id": "abc123",
  "type": "fieldDef",
  "name": "Buy groceries",
  "description": "",
  "createdAt": 1773273600000,
  "updatedAt": 1773273601000,
  "tags": ["task"],
  "nodeData": {
    "fieldType": "options",
    "cardinality": "single",
    "nullable": true
  },
  "fields": [
    {
      "name": "Status",
      "type": "options",
      "value": "In Progress",
      "fieldEntryId": "fe_001",
      "valueNodeId": "vn_001",
      "options": ["Todo", "In Progress", "Done"]
    },
    {
      "name": "Priority",
      "type": "options",
      "value": "",
      "fieldEntryId": "fe_002",
      "valueNodeId": null,
      "options": ["Low", "Medium", "High"]
    }
  ],
  "checked": false,
  "parent": { "id": "day_20260312", "name": "2026-03-12" },
  "breadcrumb": ["Journal", "2026-03-12"],
  "children": {
    "total": 3,
    "offset": 0,
    "limit": 20,
    "items": [
      { "id": "c1", "name": "Buy milk", "hasChildren": false, "childCount": 0, "tags": [], "checked": null },
      { "id": "ref_1", "name": "Shopping list", "isReference": true, "targetId": "list_node", "hasChildren": false, "childCount": 0, "tags": [] }
    ]
  }
}
```

**Key design:**
- `fields` contains `fieldEntryId` + `valueNodeId` for direct CRUD
- `fields` contains `type` + `options` so AI knows how to set values
- `children` excludes fieldEntry nodes (reduced noise)
- `children` marks `isReference` + `targetId` for AI to distinguish references

---

### Tool 3: `node_edit`

```
name: "node_edit"
label: "Edit Node"
description: |
  Modify an existing node. Only provided fields are changed. Works on any node
  including field value nodes and reference nodes.

  Use data to set raw node properties like description, color, fieldType,
  cardinality, showCheckbox, or viewMode. data cannot change type, name,
  rich text internals, tree structure, tags, or timestamps.

  Use fields parameter to set field values by name — no need to know field entry IDs.
  Or edit field value nodes directly: node_edit(nodeId: valueNodeId, name: "new value").

  All write operations use isolated undo — undoable with the undo tool.
```

#### Parameters

```typescript
{
  nodeId: { type: "string", required: true },
  name: { type: "string", description: "New name" },
  checked: { type: "boolean | null", description: "true = done, false = not done, null = remove checkbox" },
  addTags: { type: "array of strings", description: "Tags to add (display names)" },
  removeTags: { type: "array of strings", description: "Tags to remove (display names)" },
  data: {
    type: "Record<string, unknown>",
    description: "Raw node properties to set. "
      + "Allows description, color, fieldType, cardinality, nullable, showCheckbox, etc. "
      + "type/name/richText/marks/inlineRefs/children/tags/createdAt/updatedAt are blocked.",
  },
  fields: {
    type: "Record<string, string>",
    description: "Set field values by display name (same as node_create). "
      + "For options: selects or auto-collects. For plain: sets text value.",
  },
  parentId: { type: "string", description: "Move to new parent" },
  position: { type: "number", description: "New position in parent" },
}
```

#### Return Value

```json
{
  "id": "abc123",
  "name": "Updated name",
  "updated": ["name", "tags", "fields"]
}
```

---

### Tool 4: `node_delete`

```
name: "node_delete"
label: "Delete Node"
description: |
  Move a node to Trash, or restore from Trash.
  Works on any node: content, field values, references.
  Deleting a field value node clears that field.
  Deleting a reference removes the link.
  Use restore: true to recover a trashed node.

  All write operations use isolated undo — undoable with the undo tool.
```

#### Parameters

```typescript
{
  nodeId: { type: "string", required: true },
  restore: { type: "boolean", default: false, description: "true = restore from Trash" },
}
```

#### Return Value

```json
{ "id": "abc123", "name": "Old note", "movedToTrash": true }
```

Or with `restore: true`:
```json
{ "id": "abc123", "name": "Old note", "restored": true }
```

---

### Tool 5: `node_search`

```
name: "node_search"
label: "Search Nodes"
description: |
  Search the knowledge graph. Supports text search (fuzzy, CJK), tag filtering,
  field value filtering, backlink lookup, date range, subtree scoping, and
  structured sort. Think of it as Grep for your knowledge graph.

  Quick patterns:
  - Text search: node_search(query: "API design")
  - Tag + field: node_search(searchTags: ["task"], fields: {"Status": "Todo"})
  - Backlinks: node_search(linkedTo: "nodeId")  → all nodes referencing this node
  - Subtree: node_search(parentId: "projectId", query: "auth")
  - Count only: node_search(searchTags: ["task"], count: true)
  - Sorted: node_search(query: "auth", sort: { field: "modified", order: "desc" })
```

#### Parameters

```typescript
{
  query: { type: "string", description: "Fuzzy text search (name + description)" },
  searchTags: { type: "array of strings", description: "Tag display names (AND logic)" },
  fields: {
    type: "Record<string, string>",
    description: "Field value filter. Example: {\"Status\": \"Todo\"}. "
      + "Uses getFieldValue() for value matching.",
  },
  linkedTo: {
    type: "string",
    description: "Find all nodes referencing this node (backlinks). "
      + "Uses computeBacklinks() from backlinks.ts.",
  },
  parentId: { type: "string", description: "Limit search to subtree under this node" },
  dateRange: {
    type: "object",
    properties: {
      from: { type: "string", description: "Start date ISO (inclusive)" },
      to: { type: "string", description: "End date ISO (inclusive)" },
    },
  },
  sort: {
    type: "object",
    properties: {
      field: { type: "string", enum: ["relevance", "created", "modified", "name", "refCount"] },
      order: { type: "string", enum: ["asc", "desc"], default: "desc" },
    },
    description: "Sort results. Uses sort-utils.ts comparators. "
      + "Default: relevance (fuzzy score) for text search, modified desc otherwise.",
  },
  limit: { type: "number", default: 20, max: 50 },
  offset: { type: "number", default: 0 },
  count: {
    type: "boolean",
    description: "true → only return { total }, no items. Useful for statistics.",
  },
}
```

#### Infrastructure Mapping

| Parameter | Backend |
|-----------|---------|
| `query` | fuzzy-search.ts (existing) |
| `searchTags` | Tag ID resolution + node.tags filter |
| `fields` | filter-utils.ts `getFieldValue()` logic |
| `linkedTo` | backlinks.ts `computeBacklinks()` |
| `parentId` | Subtree walk |
| `sort` | sort-utils.ts `compareNodes()` |
| `count` | `return { total: results.length }` |

#### Return Value

```json
{
  "total": 42,
  "offset": 0,
  "limit": 20,
  "items": [
    {
      "id": "abc123",
      "name": "API Auth Design",
      "tags": ["source"],
      "snippet": "API Auth Design — JWT token rotation strategy for...",
      "createdAt": "2026-03-12T...",
      "parentName": "Architecture Notes",
      "fields": { "Status": "In Progress" }
    }
  ]
}
```

`count: true` returns only `{ "total": 42 }`.

---

### Tool 6: `undo`

```
name: "undo"
label: "Undo"
description: |
  Undo recent AI operations on the knowledge graph. Only undoes operations made by AI
  in this conversation — user's own edits are never affected.

  Uses a dedicated AI UndoManager (isolated from the user's ⌘Z timeline via origin prefix).
  Each undo step reverses one entire tool call (e.g., a full node_create or node_edit).
  Undo is not granular — it cannot revert a single property within an operation.
  Maximum 20 steps per call.

  To restructure a node (e.g. move description into children), do NOT undo then recreate.
  Instead: create the new children first, then edit the node to remove the old value.

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
- Operation log tracks which tool call each undo step reverts
```

#### Parameters

```typescript
{
  steps: {
    type: "number",
    description: "Number of AI operations to undo (default: 1, max: 20). Each step reverses "
      + "one entire tool call. User operations are never affected.",
    default: 1,
  },
}
```

#### Return Value

```json
{
  "undone": 2,
  "hasMore": true,
  "reverted": [
    "node_create(abc123, \"Meeting notes\")",
    "node_edit(def456, \"Updated task\")"
  ]
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

  // ── click / type / fill_form / drag ──

  selector: {
    type: "string",
    description: "CSS selector of the target element. For 'click', 'type', 'fill_form', and 'drag'. "
      + "Examples: 'button.submit', '#login-form input[type=email]', '[data-testid=save-btn]'. "
      + "If the selector matches multiple elements, the first visible one is used.",
  },

  elementDescription: {
    type: "string",
    description: "Natural language description of the element to interact with. "
      + "For 'click', 'type'. Alternative to selector — the system uses page structure to find the best match. "
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
  "truncated": true,
  "nextOffset": 30000,
  "hint": "Use textOffset to read the next page."
}
```
`nextOffset` and `hint` only present when `truncated` is true.

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
{ "typed": true }
```

**key** returns:
```json
{ "pressed": true }
```

**scroll** returns:
```json
{ "scrolled": true }
```

**fill_form** returns:
```json
{ "filled": true }
```

**drag** returns:
```json
{ "dragged": true, "from": "selector", "to": "targetSelector" }
```

**navigate** returns:
```json
{
  "url": "https://example.com/page",
  "title": "Page Title"
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

**tab** (switch) returns:
```json
{ "switched": true, "title": "Page Title", "url": "https://..." }
```

**tab** (create) returns:
```json
{ "created": true, "tabId": 789, "title": "", "url": "https://..." }
```

**tab** (close) returns:
```json
{ "closed": true }
```

**wait** returns:
```json
{ "waited": true, "duration": 3 }
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
