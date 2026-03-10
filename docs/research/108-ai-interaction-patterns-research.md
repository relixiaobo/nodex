# AI Interaction Patterns in Knowledge Management Tools

> Deep research on how users invoke, interact with, and receive AI results across productivity and knowledge management products.
> Date: 2026-03-10

---

## 1. Chat-Based Interactions

The most common AI interaction pattern: a dedicated conversation interface where users type natural language queries and receive responses.

### 1.1 Sidebar Chat (Persistent Panel)

**Products**: Sider, Monica, Chrome Gemini, Capacities, Heptabase

**Trigger**: Click sidebar icon in browser toolbar, or keyboard shortcut. Always available as a persistent panel on the right side of the screen.

**Context injection**:
- **Sider**: Automatically reads the current webpage. User can also highlight text before opening sidebar to scope context. Supports chatting with links, images, files, and GPTs. Multi-model switching (GPT-5, Claude, Gemini, DeepSeek) within the same panel.
- **Chrome Gemini** (Jan 2026): Embedded directly into Chrome's native side panel. Each tab maintains its own conversation context ("memory per tab"). Tab groups are understood as related context, so Gemini can reason across multiple tabs you opened for the same research task. "Personal Intelligence" feature connects to Gmail, Search, YouTube, Google Photos for cross-service context.
- **Capacities**: Three explicit context modes when opening chat: (a) block selection, (b) currently active object (full content or just title + properties), (c) no context. The choice is made at chat-open time, not after. Saved AI chats become first-class objects in the knowledge graph -- searchable, linkable via @-mention or [[]], and appearing in backlinks of the referenced object.
- **Heptabase**: Chat can reference whiteboards as context. AI responses include reference links to the specific cards and blocks that the response is grounded on, enabling source verification. Users can one-click add a PDF section to chat context.

**Output**: Responses appear in the chat panel. Sider and Gemini keep results in the sidebar; Capacities persists chats as knowledge objects; Heptabase links responses back to source cards.

**Feedback loop**: Continue conversation, switch models (Sider), refine with follow-up questions. Capacities lets you save or discard the chat as an object. Heptabase lets you trace each claim back to a source card.

### 1.2 Contextual Node Chat (Space Bar Trigger)

**Products**: Tana

**Trigger**: Press **Space** on an empty node at the bottom of any node tree. This is the primary method -- no menu, no button, just a single keystroke in the natural editing flow.

**Context injection**: The parent node and its full subtree become the chat context automatically. Users can inject additional context by typing **@** to reference any other node in the workspace. When a referenced node is included, all its children are sent as context (but not children of references within those children -- one level of reference resolution).

**Output**: AI responses appear as sibling nodes in the same tree. The entire conversation is visible as a node structure, editable and reorganizable like any other content.

**Feedback loop**: The entire chat history is sent as context for each subsequent message (cost increases with length). Token caching (added 2025) reduces cost by up to 90% for repeated context within ~1 hour. Users can edit any previous message node and re-run.

**Key design insight**: Chat is not a separate mode -- it happens inside the outliner. The conversation is part of the knowledge graph, not a floating window overlaid on it.

### 1.3 Graph-Aware Q&A

**Products**: Reflect, Mem

**Trigger**:
- **Reflect**: Highlight text then press **Cmd+J** (Mac) / **Ctrl+J** (Windows) to open the AI palette. Or use the open text field without highlighting to ask anything. Custom prompts can be saved for quick re-use.
- **Mem**: AI Chat accessible from the main interface. "Deep Search" mode for meaning-based retrieval across all notes.

**Context injection**:
- **Reflect** (launched Sept 2025): Claims to be the first note-taking app where AI understands the entire note graph -- connections between notes, not just individual content. Uses bidirectional [[double bracket]] links to build a web of connections. When queried about a topic, synthesizes insights from multiple connected notes (e.g., pulling from 23 connected notes about "productivity tools"). The graph structure (not just text similarity) influences what context is retrieved.
- **Mem**: Uses semantic embedding to find relevant notes. Not limited to explicit links -- surfaces notes based on meaning similarity.

**Output**: Reflect shows synthesized answers with references to source notes. Mem presents structured responses with "Find More" option to expand the search.

**Feedback loop**: Both allow follow-up questions. Reflect's MCP server enables external AI tools (Claude Code, Cursor) to search notes directly. Fundamental limitation: the system is only as good as what you've written.

---

## 2. Inline/Contextual Triggers

AI actions triggered from within the editing context, without opening a separate chat.

### 2.1 Empty Line Trigger (Space Bar on New Line)

**Products**: Notion, Tana

**Trigger**:
- **Notion**: Press **Space** on a new empty line (or empty page). An AI command menu appears with contextual suggestions. The system recommends "highest value actions based on where you're using it." To disable: Shift+Space for a regular space.
- **Tana**: Press **Space** on an empty node at the bottom of any node tree. This transitions directly into AI Chat mode with the parent node as context (see 1.2 above).

**Context**: Notion sends the current page content. Tana sends the parent node tree.

**Output**:
- **Notion**: Generated content appears inline as new blocks. User sees Accept / Discard / Try Again / Insert Below options.
- **Tana**: Response appears as node children in the outliner.

**Design tension**: Notion's Space trigger is controversial -- it intercepts a fundamental keyboard action. Users report accidental triggers. Tana avoids this because Space only triggers on an already-empty node at tree bottom, a more intentional position.

### 2.2 Slash Commands

**Products**: Notion, Capacities

**Trigger**: Type **/ai** in the editor to access AI actions. If editing existing content, highlight text first, then type /ai.

**Context**: The current page or selected blocks.

**Output**: Notion generates content inline with Accept/Discard/Try Again controls. Capacities opens the AI assistant panel with the selection as context.

### 2.3 AI Field Auto-Fill (Sparkle Icon)

**Products**: Tana, Notion, Capacities

This pattern is specific to structured data: AI fills in a field value based on the node/page context.

**Trigger**:
- **Tana**: Click the **sparkle icon** (AI icon) that appears on fields configured for auto-fill. Or run "Autofill" to fill all AI-enabled fields at once. Can be configured per-field on any supertag template.
- **Notion**: Add an "AI" property type to a database. Configure with a built-in preset (Summary, Key Info, Translation) or a custom prompt. Can set to "Auto-update on page edits" (triggers 5 min after changes).
- **Capacities**: Hover over a property field to reveal the auto-fill button. Or hover over the object title and click "Fill properties" to fill all AI-enabled properties at once. Custom instructions can be added per-property.

**Context**:
- **Tana**: The entire node (name, fields, children). Can learn from previous instances -- e.g., "Based on the title of a bug, figure out which feature it relates to, priority, and assignee based on previous bug reports."
- **Notion**: Other properties on the same database page, plus page content.
- **Capacities**: At minimum the object title; more properties = better results.

**Output**: Field value is filled inline. User can accept, edit, or re-generate.

**Key design insight**: This is the highest-ROI AI pattern for structured knowledge tools. It turns schema definition into AI configuration -- defining a "Priority" field on a #Bug supertag implicitly teaches the AI what to fill. No prompt engineering required from users.

### 2.4 Hover-to-Action (Card Level)

**Products**: Heptabase

**Trigger**: Hover over any card on a whiteboard. An **AI action button** appears. Click to see available actions (translate, summarize, create mind map, etc.). Users can create **custom AI actions** with personalized prompts (e.g., a "Study Guide" action that always generates a specific format).

**Context**: The full content of the hovered card.

**Output**: Generated content appears as a new card or within the existing card, depending on the action. Results stay on the whiteboard in spatial context.

**Feedback loop**: An "All actions" panel lets users manage and organize their custom actions. Once created, any action is one-click reusable across all cards.

---

## 3. Selection-Based Interactions

The user selects text first, then invokes an AI action on the selection.

### 3.1 Floating Toolbar on Selection

**Products**: Monica, Sider, Selectly

**Trigger**: Highlight/select text on any webpage. A **floating Quick Actions toolbar** appears beneath the selected text automatically (no keyboard shortcut needed).

**Available actions**:
- **Monica**: Translate, explain, rephrase, grammar check, expand. Actions are customizable -- users can rearrange order and add/remove actions in settings. The toolbar appears on any webpage.
- **Selectly**: Translate, rewrite in different tones, grammar/spell check, simplify, explain, web search, one-click copy.
- **Sider**: Explain, translate, summarize highlighted text. Can also open sidebar with selection as context for deeper interaction.

**Context**: The selected text, plus (in some products) the surrounding page content for disambiguation.

**Output**: Results appear in a popup near the selection, or in the sidebar panel. User can copy, insert, or continue to another action.

**Design pattern**: This is the lowest-friction AI interaction -- zero explicit invocation. The toolbar appearance is the invitation. Risk: can feel intrusive if it appears on every selection. Monica and Selectly mitigate with customizable trigger sensitivity.

### 3.2 Keyboard-Triggered Selection Actions

**Products**: Reflect, Notion

**Trigger**:
- **Reflect**: Select text, then **Cmd+J** opens the AI palette with prompts like "list key takeaways" or "list action items." Open text field also available for custom queries.
- **Notion**: Select text, then choose "Ask AI" from the floating toolbar, or type /ai. Pre-loaded actions: Improve writing, Fix spelling & grammar, Make shorter, Make longer, Change tone.

**Context**: The selected text. Notion also considers the full page for context.

**Output**:
- **Notion**: Shows result inline with Accept / Discard / Insert Below / Try Again. The original text is preserved until the user explicitly accepts the replacement.
- **Reflect**: Result appears in the AI palette panel.

**Feedback loop**: Notion offers thumbs up/down on each response. Both allow "Try Again" for regeneration.

### 3.3 Multi-Level Scoping (Context-Aware Action Sets)

**Products**: Readwise Ghostreader

**Trigger**: Select text and press **G**, or press **Shift+G** for document-level actions. The system detects the scope and shows appropriate presets.

**Scope detection**:
- **Word level** (1-4 words selected): Dictionary define, encyclopedia lookup. Designed for vocabulary and concept clarification while reading.
- **Passage level** (5+ words / paragraph): Simplify, expand, explain, translate. Input expected to be at least a full sentence.
- **Document level** (Shift+G, no selection): Summarize document, extract takeaways, identify key questions, summarize highlights/notes. Can be invoked at any time.

**Context**: Selected text (word/passage) or full document (document level). Custom prompts can reference `{highlight}`, `{document_title}`, `{document_author}` etc. via a template variable system.

**Output**: All Ghostreader responses now go into the **Chat interface** in the right sidebar (unified in 2025). Action tags can be automatically applied to highlights after running prompts.

**Feedback loop**: Chat interface allows follow-up. Custom prompts can be created and shared via a community Prompt Library. Default model is GPT-5 Mini (included with subscription), configurable per-prompt.

**Key design insight**: The three-level scoping (word/passage/document) is elegant because it maps to natural reading behaviors. You look up a word, you think about a paragraph, you reflect on an article. The UI adapts without the user having to specify scope.

### 3.4 Right-Click Context Menu

**Products**: Monica, various browser extensions

**Trigger**: Right-click on selected text to see AI actions in the browser context menu.

**Context**: Selected text + page URL.

**Output**: Varies -- typically opens a popup or the sidebar with results.

**Note**: This pattern is declining in favor of floating toolbars, which are faster (no menu navigation) and more visually discoverable. Right-click is now typically a secondary access method.

---

## 4. Proactive/Ambient AI

AI surfaces information without explicit user invocation. The system watches what you're doing and provides relevant context.

### 4.1 Related Notes Surfacing

**Products**: Mem "Heads Up", Obsidian Smart Connections, Napkin

**Trigger**: No explicit trigger -- the system watches your current activity.

- **Mem Heads Up**: Automatically resurfaces notes "at exactly the right moment." When you open a note about a person, it brings up your history with them. As you write, related notes appear. Groups related notes by topic, shows related meetings on a timeline, includes a "Find More" button for deeper exploration.
- **Smart Connections** (Obsidian): Opens a sidebar (from ribbon or command palette) that shows semantically related notes to the current one. Updates in real-time as you write. Uses local embeddings (on-device, no cloud) to measure semantic "distance" between notes. Each result shows a similarity score (0-1).
- **Napkin**: Notes float in a visual "swarm" where AI clusters related ideas together. Every day shows past notes relevant to current thinking. AI auto-tags new notes and discovers connections. Uses spatial proximity to show relatedness.

**Context**: The current note/document content, analyzed via embedding similarity.

**Output**:
- **Mem**: Sidebar panel with grouped related notes + timeline.
- **Smart Connections**: Sidebar with scored results. Drag-to-link (drag a result into your note to create a link). Cmd-hover for preview. Right-click to hide irrelevant results.
- **Napkin**: Visual spatial layout with clustered nodes and connecting lines.

**Feedback loop**: Mem has "Find More" for expansion. Smart Connections allows hiding results (negative feedback). Napkin's spatial layout invites exploration by proximity.

**Key design insight**: The critical difference is passive vs. active. Smart Connections requires opening a sidebar (semi-active). Mem's Heads Up appears unbidden (fully passive). Napkin's swarm is always visible (ambient). The more passive the surfacing, the more serendipitous the discovery -- but also the higher the risk of distraction.

### 4.2 Augmented Browsing Overlay

**Products**: Recall

**Trigger**: Completely passive. The browser extension widget shows a connection count for each page. While browsing, keywords that relate to saved content are **highlighted directly on the webpage**.

**Context**: The current webpage text is analyzed against your saved knowledge base. Uses an in-browser model (not LLM) for keyword extraction -- continuously fine-tuned for meaningful connections.

**Output**: Keywords on the webpage are highlighted. Hovering over a highlighted keyword shows a **contextual overlay** with the related content from your knowledge base. The browser extension widget shows the total number of connections found.

**Feedback loop**: Clicking a connection opens the related saved content. The system learns from what you save to improve future connections.

**Key design insight**: This is the only product that modifies the webpage itself to show AI connections. It transforms passive reading into active learning without any user action. The local-first, non-LLM approach keeps it fast and private. Launched August 2025, still in Beta.

### 4.3 AI-Suggested Related Cards

**Products**: Heptabase

**Trigger**: Open the Card Library from the right sidebar and select the **AI filter**. Shows cards related to your currently selected card.

**Context**: The content of the selected card, analyzed via a self-hosted embedding model (all processing on Heptabase servers, not third-party).

**Output**: A filtered list of related cards in the sidebar library. Works across all contexts -- whiteboards, tags, journals, card tabs.

**Feedback loop**: Cards can be dragged onto the whiteboard for spatial organization alongside the current card.

---

## 5. Command/Automation Triggers

AI actions that run based on events, schedules, or explicit command invocation -- beyond simple chat or inline editing.

### 5.1 Command Nodes (Node-as-Program)

**Products**: Tana

**Trigger**: Three invocation methods:
1. **Command palette** (Cmd+K): Search and run any command by name.
2. **Supertag button**: Commands configured on a supertag appear as buttons on every node with that tag. Clicking the button runs the command with the current node as context.
3. **Event triggers**: Commands auto-run when a supertag is added/removed, a node is created, or a state change occurs (e.g., task checked).

**Context configuration** (prompt template variables):
- `${name}` -- the node's name/title
- `${sys:context}` -- full node context including all fields and children, in Tana Paste format
- `${content}` -- node content including children, excluding supertag-inherited content
- `${source}` -- source material from voice memos/transcription

**Output placement strategies**:
- Insert as children (default)
- Replace contents
- Target specific fields or nodes

**Safety**: Loop detection -- if an AI command triggers another AI command on a node created by AI within 60 seconds, Tana shows a warning and disables the event system until reload.

**Key design insight**: Commands are nodes. They live in the same graph as everything else. They can be tagged, searched, referenced, templated, and shared. The three trigger methods (manual, button, event) provide a spectrum from explicit to automatic. The prompt template system using `${variable}` is simple but powerful -- it turns every node's structure into prompt context without the user writing any prompt engineering.

### 5.2 Custom Agents (Autonomous Workers)

**Products**: Notion (Feb 2026)

**Trigger types**:
- **Schedule**: Daily, weekly, monthly, custom cron-like schedules
- **Slack events**: New message or emoji reaction in public Slack channels
- **Database changes**: Page created or updated in a specific database
- **Manual**: On-demand invocation

**Context**: Agents are scoped to specific data sources (databases, pages). They can read from and write to Notion content and connected external tools via MCP.

**External tool integration** (via MCP): Linear, Figma, HubSpot, Ramp, Wiz, Stripe, GitHub, Intercom, Amplitude, Attio, Sentry. Also: Slack, Notion Mail, Notion Calendar. Custom MCP server connections for proprietary tools.

**Tool permissions**: Read tools (search, fetch, list, view) vs. Write tools (create, update, delete, send, post). Granular control over what each agent can access.

**Output**: Agents write results back into Notion databases/pages, send Slack messages, create calendar events, etc. Every run is logged for audit.

**Feedback loop**: Agents can be shared org-wide, disabled at any time, and all changes are reversible. Runs are visible in an activity log.

**Key design insight**: Notion's agents are the most "enterprise-grade" AI automation in the knowledge management space. The MCP integration makes them extensible beyond Notion's own ecosystem. The trigger variety (schedule + event + manual) covers the full automation spectrum.

### 5.3 AI Agents (Conversational Experts)

**Products**: Tana

**Trigger**: Built using supertags. An agent is essentially a customized AI chat with persistent personality, knowledge scope, and tool access. Can be run via command palette or as a button on tagged nodes.

**Context**: Agents read the user's note graph in real-time. They are configured via supertag fields (system prompt, model selection, tool access).

**Output**: Conversational responses within the node tree, with ability to create/modify nodes.

**Current state** (2025): Tana is deliberately slowing down agent development. Their concern: "When agents roam around your graph, assessing what they change and why is a big issue." They are rethinking agents as "powerful collaborators, not just chatbots" with emphasis on transparency and control.

### 5.4 AI + Shortcuts (System-Level Automation)

**Products**: Apple Intelligence + Shortcuts (WWDC 2025 / macOS 26)

**Trigger**: Siri voice command, Shortcuts app, or automation triggers (time, location, app events).

**Key capability**: New "Use Model" action in Shortcuts lets users choose between on-device AI, Apple servers, or ChatGPT. AI can parse unstructured text, extract calendar events from messages, summarize documents, and feed results into subsequent Shortcut steps.

**Context**: Any data accessible to the Shortcuts runtime -- files, clipboard, screen content, app data via intents.

**Output**: Results flow into the next Shortcut action. Can create calendar events, send messages, update files, etc.

**Design insight**: Apple's approach treats AI as a composable building block within an existing automation framework, rather than a standalone feature. This is the most "plumbing-level" AI integration -- it doesn't have its own UI, it powers other UIs.

---

## 6. Voice Interactions

Capturing spoken input and converting it into structured knowledge.

### 6.1 Voice-to-Structured Data

**Products**: Tana

**Trigger**: Voice memo on mobile app, or live transcription on desktop. Meeting notetaker captures meeting audio without adding a bot to the call.

**Context**: The raw audio stream. If the user applies a supertag to the resulting node, Tana also has the supertag's field schema as context.

**Processing pipeline**:
1. Audio capture (local on device)
2. Transcription (supports 61 languages as of 2025)
3. Structuring: If a supertag is applied, AI auto-fills fields from the transcription. E.g., speaking "Meeting with Andrea on June 7th" with a #Meeting tag creates a node with attendee = Andrea Faliva and date = June 7th.
4. Meeting-specific: Summary generation, action item extraction, entity extraction, with configurable output targets.

**Output placement**: Configurable per output type -- summary target, action items target, extracted entities target. Default: placed as children of the transcription node.

**Feedback loop**: All generated content is editable. The structured output (fields, children) can be manually corrected. The voice memo audio is preserved alongside the transcript for verification.

**Key design insight**: The "apply supertag to voice memo" pattern is elegant -- the schema acts as a structuring prompt. You don't tell the AI "extract the attendee" -- you just have an Attendee field on your #Meeting tag, and it fills it. Schema = prompt.

### 6.2 Voice-to-Organized Notes

**Products**: Mem

**Trigger**: Voice Mode recording on mobile or desktop. Tap to start recording, tap to stop.

**Processing pipeline**:
1. Record audio locally
2. Transcribe
3. AI organizes the transcript into structured notes (not just raw transcript)
4. Both audio and transcript are preserved

**Output**: A clean, organized note -- not a raw transcript. Brain dumps become structured notes. Meeting recordings surface key points and action items automatically.

**Design claim**: "3x faster than typing" for idea capture. Positioned for hands-free contexts: walking, driving, doing dishes.

### 6.3 Ambient Capture (Wearable)

**Products**: Limitless (acquired by Meta, Dec 2025)

**Trigger**: Wear the pendant. It records continuously throughout the day.

**Processing**:
- Real-time transcription
- Speaker identification (after 20 seconds of labeled audio, automatically recognizes speakers in future conversations)
- Automatic daily organization and summarization
- Noise cancellation for clear speech extraction

**Output**: Organized daily summary. Individual conversations segmented and summarized. Searchable transcript archive.

**Status**: Effectively discontinued as a product after Meta acquisition (Dec 2025). But the interaction pattern -- always-on, zero-effort capture with AI structuring -- represents an extreme end of the "proactive AI" spectrum.

---

## 7. Browser-Specific Patterns

AI interaction patterns unique to or optimized for the browser context.

### 7.1 Sidebar-as-Copilot

**Products**: Sider, Chrome Gemini

**Pattern**: A persistent AI sidebar that lives alongside any webpage.

- **Sider**: Opens from toolbar icon. Can read current page, summarize, translate, answer questions. Supports multiple AI models. "Smart Chat" extracts summaries, action items, and answers from page content. "Deep Research" mode collates sources, ranks relevance, produces structured reports.
- **Chrome Gemini**: Native Chrome side panel (Jan 2026). Per-tab conversation memory. Tab group context awareness. Auto-Browse feature (for subscribers) performs multi-step tasks autonomously: research prices, schedule appointments, fill forms. Pauses for user confirmation on actions like purchases or social media posts.

**Key difference from knowledge tool sidebars**: These are general-purpose AI assistants that happen to be in the browser. They don't have a persistent knowledge graph. Each conversation is ephemeral (though Gemini maintains per-tab memory within a session).

### 7.2 Inline Page Annotation

**Products**: Monica, Recall

**Pattern**: AI modifies or annotates the webpage itself.

- **Monica**: Floating Quick Actions toolbar appears on text selection. Actions (translate, explain, rephrase) produce results in a popup near the selection. Customizable action set and order.
- **Recall**: Keywords on the webpage are highlighted based on connections to your saved knowledge. Hovering shows related content from your knowledge base. The page becomes a lens into your existing knowledge.

**Design contrast**: Monica is active (user selects, AI responds). Recall is passive (AI highlights, user explores). Both modify the page, but in opposite directions of user intent.

### 7.3 Agentic Browsing

**Products**: Chrome Gemini Auto-Browse (Jan 2026)

**Pattern**: AI autonomously navigates and interacts with websites on behalf of the user.

**Trigger**: User describes a task in the sidebar chat (e.g., "Find the cheapest hotel in Tokyo for March 15-20").

**Processing**: The AI autonomously:
- Navigates to relevant websites
- Fills in search forms
- Compares results across pages
- Handles multi-step workflows

**Safety**: Explicitly pauses for user confirmation before:
- Making purchases
- Posting on social media
- Submitting forms with personal data
- Any irreversible action

**Output**: Structured results presented in the sidebar. The user can see what the agent did and verify before approving actions.

**Status**: Available to AI Pro and Ultra subscribers in the U.S. as of Jan 2026.

---

## Cross-Cutting Analysis

### Pattern Taxonomy by User Intent

| User Intent | Pattern | Friction Level | Products |
|---|---|---|---|
| "I want to ask something" | Sidebar chat | Low -- click to open | Sider, Gemini, Capacities |
| "I want to think with AI" | Node chat (Space) | Very low -- keystroke in flow | Tana |
| "Help me with this text" | Selection + floating toolbar | Zero -- automatic on select | Monica, Selectly |
| "Help me with this text" | Selection + keyboard | Low -- select + shortcut | Reflect (Cmd+J), Notion (/ai) |
| "Fill in this field" | Sparkle icon auto-fill | Low -- one click per field | Tana, Notion, Capacities |
| "What does this word mean" | Scope-aware selection | Very low -- select + G | Ghostreader |
| "Run this workflow" | Command node / Agent | Medium -- configured once, then one-click | Tana, Notion Agents |
| "Process this automatically" | Event trigger / Schedule | Zero -- fire-and-forget | Tana events, Notion Agents |
| "What's related to this?" | Ambient sidebar | Zero -- always visible | Smart Connections, Mem Heads Up |
| "Connect this to what I know" | Augmented browsing overlay | Zero -- passive annotation | Recall |
| "Capture this thought" | Voice-to-structure | Very low -- speak naturally | Tana, Mem |

### The Trigger Spectrum

```
Manual ←──────────────────────────────────────────────→ Automatic

Cmd+K      Selection    Space bar    Hover-to-     Event       Ambient
command     + shortcut   on empty     action        trigger     overlay
palette                  line         (Heptabase)   (Tana)      (Recall)

Notion      Reflect     Tana AI      Heptabase     Notion      Mem Heads Up
/ai         Cmd+J       Chat         card hover    Agents      Smart Connections
            Notion      Notion                     Tana        Recall
            select+AI   Space                      Events
```

### Output Placement Patterns

1. **Inline replacement**: Generated text replaces selected text (Notion "Accept", Reflect). Requires explicit user confirmation.

2. **Insert below/adjacent**: Result appears as a new block below the current content (Notion "Insert Below"). Non-destructive.

3. **Children of current node**: Result becomes children of the context node (Tana default). Naturally fits outliner/tree structures.

4. **Sidebar/panel**: Result appears in a separate panel (Ghostreader chat, Sider, Smart Connections). Keeps the document unmodified.

5. **Field value**: Result fills a specific property/field (Tana sparkle, Notion autofill, Capacities auto-fill). The most constrained and precise output type.

6. **New object/card**: Result creates a new entity in the knowledge graph (Heptabase card from AI action, Capacities saved chat). Gives the output first-class status.

7. **Page annotation**: Result modifies the external webpage (Recall highlights, Monica popup). Ephemeral -- disappears when you leave the page.

8. **External system**: Result is sent to Slack, email, calendar, etc. (Notion Agents via MCP). Output escapes the knowledge tool entirely.

### Context Injection Strategies

| Strategy | Example | Precision | User Effort |
|---|---|---|---|
| Automatic (current page/node) | Sider reads webpage, Tana Space reads parent node | Low -- may include irrelevant content | Zero |
| Selection-scoped | Highlight text first | High -- user defines exact scope | Low |
| Schema-guided | Tana autofill uses supertag field definitions | High -- schema constrains what AI looks for | Zero (after schema setup) |
| @-reference injection | Tana @-mention in chat, Notion agent data scoping | High -- user explicitly chooses context | Medium |
| Embedding/similarity | Smart Connections, Reflect graph, Mem Heads Up | Medium -- depends on embedding quality | Zero |
| Graph traversal | Reflect follows bidirectional links | Medium-High -- depends on link quality | Zero (after linking) |
| Cross-service | Gemini Personal Intelligence (Gmail, Search, YouTube) | Variable | Zero |

### Design Principles Observed

**1. Schema = Prompt**: The most elegant pattern across all products is using existing data structure (supertag fields, database properties, object types) as implicit AI instructions. Tana and Notion both discovered this: defining a "Priority" field is equivalent to writing "extract the priority from this content" as a prompt. Users who organize well automatically get better AI.

**2. AI output should be first-class data**: Products that treat AI output as editable, searchable, linkable content (Tana, Capacities, Heptabase) create more value than those where AI output is ephemeral (Sider, Monica). The key question: can you build on what AI gave you?

**3. Progressive disclosure of automation**: The best products offer a spectrum from one-shot manual actions (select + action) to persistent automation (event triggers). Users start manual and graduate to automatic as trust builds. Tana's three trigger modes (Cmd+K, supertag button, event) exemplify this perfectly.

**4. Context should be inspectable**: Heptabase's "reference links to source cards" and Tana's "everything as visible nodes" let users verify what the AI saw. Black-box context (most sidebar chats) erodes trust over time.

**5. Scope detection reduces friction**: Ghostreader's word/passage/document detection eliminates a decision point. The UI adapts to what you selected rather than asking you to choose a mode.

**6. Ambient AI works best when non-destructive**: Recall highlights keywords but doesn't change the page. Smart Connections shows a sidebar but doesn't modify notes. Mem surfaces related notes but doesn't insert them. Proactive AI should suggest, not act.

**7. Safety scales with autonomy**: Manual actions need no guardrails. Event triggers need loop detection (Tana's 60-second cooldown). Autonomous agents need explicit pause-and-confirm (Gemini Auto-Browse). Notion agents log every action. The more autonomous the AI, the more transparency and control mechanisms are required.

---

## Sources

- [Notion AI Inline Guide](https://www.eesel.ai/blog/notion-ai-inline)
- [Notion AI Help Center](https://www.notion.com/help/notion-ai-faqs)
- [Notion Custom Agents Release](https://www.notion.com/releases/2026-02-24)
- [Notion Custom Agents Help](https://www.notion.com/help/custom-agent)
- [Notion MCP Integrations](https://www.notion.com/help/mcp-connections-for-custom-agents)
- [Notion AI for Databases (Autofill)](https://www.notion.com/help/autofill)
- [Tana AI Chat](https://tana.inc/docs/ai-chat)
- [Tana AI Command Nodes](https://tana.inc/docs/ai-command-nodes)
- [Tana Command Nodes](https://tana.inc/docs/command-nodes)
- [Tana AI Agents](https://tana.inc/docs/ai-agents)
- [Tana AI for Builders](https://tana.inc/docs/ai-for-builders)
- [Tana Supertags](https://tana.inc/docs/supertags)
- [Tana 2025 Product Updates](https://tana.inc/articles/whats-new-in-tana-2025-product-updates)
- [Tana Meeting Notetaker](https://tana.inc/docs/tana-meeting-notetaker)
- [Tana Autofill and Autotag](https://tananodes.com/enhanced-workspace-with-tanas-autofill-and-autotag/)
- [Capacities AI Assistant Documentation](https://docs.capacities.io/reference/ai-assistant)
- [Capacities AI Release](https://capacities.io/whats-new/release-26)
- [Capacities AI Product Page](https://capacities.io/product/ai)
- [Capacities AI Auto-tagging Release](https://capacities.io/whats-new/release-41)
- [Reflect Notes AI Features](https://downloadchaos.com/blog/reflect-notes-ai-features-note-taking-innovation)
- [Reflect Academy AI Guide](https://reflect.academy/artificial-intelligence)
- [Readwise Ghostreader Overview](https://docs.readwise.io/reader/guides/ghostreader/overview)
- [Readwise Ghostreader Default Prompts](https://docs.readwise.io/reader/guides/ghostreader/default-prompts)
- [Readwise Ghostreader Custom Prompts](https://docs.readwise.io/reader/guides/ghostreader/custom-prompts)
- [Readwise Ghostreader Chat](https://docs.readwise.io/reader/guides/ghostreader/chat)
- [Heptabase AI Actions Newsletter](https://wiki.heptabase.com/newsletters/2025-12-30)
- [Heptabase AI Suggestions Newsletter](https://wiki.heptabase.com/newsletters/2025-11-06)
- [Heptabase Whiteboard Chat Newsletter](https://wiki.heptabase.com/newsletters/2025-07-23)
- [Heptabase Work with AI](https://wiki.heptabase.com/work-with-ai)
- [Obsidian Smart Connections](https://smartconnections.app/smart-connections/)
- [Obsidian Copilot Auto-Completion](https://github.com/j0rd1smit/obsidian-copilot-auto-completion)
- [Mem 2.0 Introduction](https://get.mem.ai/blog/introducing-mem-2-0)
- [Mem Voice-Activated AI Notes](https://get.mem.ai/blog/voice-activated-ai-notes)
- [Recall Augmented Browsing](https://docs.getrecall.ai/deep-dives/recall-augmented-browsing)
- [Recall Augmented Browsing Launch](https://feedback.getrecall.ai/changelog/release-august-12-2025-our-1-most-requested-feature-is-live)
- [Napkin Ideas App](https://napkin.one/)
- [Sider AI Browser Extension](https://sider.ai/extensions)
- [Sider Side Panel](https://sider.ai/extensions/side-panel)
- [Monica AI Chrome Extension](https://monica.im/home)
- [Monica Quick Start Guide](https://monica.im/help/)
- [Chrome Gemini Sidebar Announcement](https://blog.google/products-and-platforms/products/chrome/gemini-3-auto-browse/)
- [Chrome Gemini Side Panel TechCrunch](https://techcrunch.com/2026/01/28/chrome-takes-on-ai-browsers-with-tighter-gemini-integration-agentic-features-for-autonomous-tasks/)
- [Limitless AI Pendant](https://www.limitless.ai/)
- [Apple Shortcuts AI (WWDC 2025)](https://techcrunch.com/2025/06/09/at-wwdc-2025-apple-introduces-an-ai-powered-shortcuts-app/)
- [Apple Intelligence Shortcuts](https://www.cultofmac.com/guide/13-mind-blowing-ios-26-shortcuts-with-apple-intelligence)
- [Building an AI Toolbar for Text Editors](https://chrisnicholas.dev/blog/building-an-ai-toolbar-for-text-editors)
- [Selectly Chrome Extension](https://chrome-stats.com/d/cpgfbcghiimbjkkdjaljkhpbdlccfeap)
