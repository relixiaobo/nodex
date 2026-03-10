# 104 — Competitor AI Features Research

> Date: 2026-03-09
> Scope: Tana, Readwise/Reader, Heptabase, Logseq, Roam Research
> Purpose: Map the AI feature landscape for soma's AI roadmap

---

## 1. Tana AI (tana.inc)

Tana is the most relevant competitor. They have gone all-in on AI as a core differentiator, raising $25M in early 2025 with AI-native positioning. They currently utilize 13+ AI models (OpenAI, Claude, Gemini) and let users pick per-task.

### 1.1 AI Command Nodes

The crown jewel of Tana's AI system. Command nodes are **user-configurable AI automation units** that live inside the node graph — consistent with "everything is a node."

**How they work:**
- Create: `Cmd+K > Convert to command node` on any node
- Configure: Chain multiple steps using `@` to reference available commands (Tana built-ins, AI commands, or other custom command nodes)
- Prompt templating: Use `${name}`, `${description}`, field references as variables in prompts — the node's data is injected at runtime
- Trigger methods: (1) Command palette, (2) Button on supertag instances, (3) Node events (auto-trigger on creation/update)
- Model selection: Each command node can specify which AI model to use

**Key insight for soma**: Command nodes are essentially **stored procedures that mix AI calls with graph operations** (set field, add tag, clone node, move, etc.). They compose — one command node can call another.

### 1.2 AI Fields (Auto-fill)

Fields on supertags can be marked as "AI-enhanced" (sparkle icon). When triggered:

1. AI sees the node's name, children, description, and other fields as context
2. The task is "Decide a value for field: [field name]"
3. AI fills the field value automatically

**UX flow:**
- Enable per-field in Field Configuration > toggle "AI-enhanced field"
- Sparkle button appears next to field name
- Click to auto-fill a single field, or run in bulk across a table/list view
- Fields can be excluded from auto-fill via "Fields to exclude" config

**Voice memo integration**: On mobile, when a voice memo is transcribed and a supertag is applied, AI attempts to auto-fill all supertag fields from the transcript content.

### 1.3 AI Chat

Contextual chat embedded in the workspace, not a separate app.

**How context works:**
- Press space on empty node at bottom of any node → chat with that node as context
- Click purple sparkle icon → chat opens in side panel
- `@` to reference any node — its full tree (children, fields) is included
- Entire conversation history is sent each turn (cost scales with length)
- Token caching: up to 90% cost savings on repeated context within ~1 hour

**2025 additions:**
- AI voice chat on iOS/Android — speak ideas, get structured responses
- Voice chat can search both Tana workspace and the web

### 1.4 AI Agents (Beta)

AI chat agents let you shape AI behavior using supertags and structure.

- Essentially **CustomGPT-like chatbots embedded in your notes**
- Can read your notes in real-time
- Connect to existing knowledge graph
- Configurable via supertag templates (system prompt, behavior, accessible context)
- Run with one click as a button

### 1.5 Meeting Agent

Bot-less meeting transcription built into the desktop app.

- Works with any meeting tool (Zoom, Meet, Teams, Slack, in-person)
- Live timestamped transcription in 61 languages
- Post-meeting AI processing (1-3 min): generates summary, action items, agenda items, entity extraction
- Entities link to existing graph nodes (CRM-like: contacts enriched from meetings)
- Custom AI processing templates configurable per meeting type

### 1.6 Local API / MCP

Tana desktop exposes a Local API + MCP endpoint:
- AI tools (Claude Code, Codex) can read/search/create/update nodes
- Tana becomes a **native context provider** for external AI tools
- Programmatic field updates, node creation via Tana Paste format

### 1.7 AI-Powered Search

Not a separate feature — AI chat with `@` context references effectively serves as semantic search. The knowledge graph's supertag structure gives AI semantic types for multi-hop reasoning, reducing hallucination.

### 1.8 Pricing

| Plan | Price | AI Credits/month |
|------|-------|-----------------|
| Free | $0 | 500 |
| Plus | $10/mo (annual) | ~2,000 |
| Pro | $18/mo (annual) | ~5,000 |

Top-up credits valid 12 months, used only after monthly quota depleted. Free users cannot top up.

### 1.9 User Reception

- **Product of the Year 2025** on Product Hunt
- Praised: AI feels like "smart autocomplete for your mind"; deep graph integration makes AI responses more relevant than generic chatbots
- Criticized: Steep learning curve; mobile parity gaps; credit system can feel limiting for heavy AI users
- 25,000+ community members; 160K+ waitlist during stealth

---

## 2. Readwise / Reader

Readwise focuses AI on the **reading and retention** workflow rather than general-purpose note-taking. Two products: Readwise (highlight review) and Reader (read-later + annotation).

### 2.1 Ghostreader

The AI assistant inside Reader. Powers all AI features.

**Default prompts (built-in):**
- **Document-level**: Summarize, extract key takeaways, generate Q&A pairs
- **Paragraph-level** (highlights > 4 words): Simplify, expand, translate, explain
- **Word/phrase-level** (highlights <= 4 words): Define, encyclopedia lookup, translate

**Custom prompts:**
- Users write their own prompts with template variables: `${title}`, `${full_text}`, `${paragraph}`, `${selection}`, `${highlights}`
- Scoping system: document / paragraph / word-phrase / automatic (runs on document import)
- Auto-tagging: add `.tagname` in prompt to automatically tag AI output
- Community prompt library for sharing

**AI models:**
- Default (included): GPT-5 Mini
- BYOK (bring your own key): GPT-5, GPT-4.1, o3, o4-mini

**Chat integration (2025):**
- Chat sidebar on web consolidates all AI prompts into one conversational interface
- Can ask questions about any document with full context

### 2.2 AI-Powered Themed Reviews

Beyond simple spaced repetition, Readwise uses AI for discovery:

- **Themed Reviews**: Describe a theme in natural language → AI surfaces relevant highlights across your entire library, even without manual tags
- **Themed Connections** (experimental): Weekly batch of highlights exploring unexpected connections across sources — delivered every Saturday
- **AI-improved theme suggestions**: Better recommendations when creating new themed reviews

### 2.3 Daily Review (Algorithmic + AI)

The core Readwise product uses **spaced repetition** (not primarily AI):

- Highlights resurfaced at optimal intervals based on recall feedback
- "Mastery cards" presented in active recall form
- AI enhancement: auto-generated summaries at top of review; AI can generate questions from highlights for active recall

### 2.4 Automatic Processing

- Auto-summarize documents on import (configurable)
- Auto-tag highlights based on content
- Auto-extract metadata from articles

### 2.5 MCP Integration

Multiple community-built MCP servers (not official first-party):
- Read/search highlights and documents
- Save URLs, manage tags
- AI-powered text processing (word segmentation fixes, etc.)

### 2.6 Pricing

- **Readwise + Reader bundle**: $9.99/mo annual ($12.99/mo monthly)
- 30-day free trial
- 50% student discount
- Ghostreader included in subscription (default model); BYOK for premium models

### 2.7 User Reception

- Users report 40% better recall, 2-3 hours/week saved on research
- Themed Connections called "most delightful" feature
- AI chat "blown my mind" for consulting with valued voices
- Criticism: Price feels high for light users; diagram annotation lacking for technical papers
- The "highlighting habit" is required to get full value

---

## 3. Heptabase

Visual PKM centered on whiteboards. AI added as a layer on top of spatial thinking.

### 3.1 AI Chat with Visual Context

- Open Chat on any whiteboard → chat with AI using whiteboard content as context
- Add cards, sections, whiteboards, PDFs, videos, journals via `+` button or `@` mention
- AI reads cards, texts, connections, and sections on whiteboards
- Responses include **source-level citations** (which paragraph the answer came from)
- **Drag AI messages onto whiteboards** — conversations become part of the knowledge graph

### 3.2 AI Actions for Cards

- Hover over any card → pick an AI action (translate, summarize, mind map, etc.)
- Custom AI actions: save reusable prompts, avoid retyping
- "All actions" panel for management

### 3.3 Knowledge Base Search via AI

- AI automatically searches your space using keyword + semantic search
- Finds ~20 most relevant cards/whiteboards
- Answers with source citations
- "Space" toggle in AI chat expands context to entire space

### 3.4 Models & Pricing

- Models: GPT-5, GPT-5 Nano/Mini, Gemini 2.5 Flash Lite, Claude 4.1 Opus
- Reasoning model chain-of-thought visible in chat
- BYOK supported (OpenAI key for transcription)
- New "Premium+" plan for heavy AI users; Premium plan AI credits doubled

### 3.5 MCP Integration

Heptabase exposes MCP for external AI services to read, search, and write to your knowledge base.

---

## 4. Logseq

Open-source outliner PKM. **No official AI features** as of early 2026.

- Database version (major rewrite) still in beta; mobile + RTC in alpha
- Community expects new version no earlier than Q3 2026
- AI exists only through **third-party plugins**:
  - `logseq-plugin-ai-assistant` — ChatGPT integration for text generation/transformation
  - `AssistSeq` — indexes current document + related notes for contextual AI chat (OpenAI, Ollama, Groq)
  - `logseq-plugin-gpt3-openai` — GPT-3 + DALL-E in blocks
- Community MCP server available for external AI agents to read/write Logseq graphs
- Forum discussions request official AI alignment, but team focused on DB rewrite first

---

## 5. Roam Research

**Effectively stagnant on AI.** No major updates since 2023.

- No native AI assistant or ChatGPT integration
- AI-powered search (natural language queries) is the only built-in AI feature
- Third-party only: `Live AI Assistant` extension for AI in blocks
- Zapier integration for basic AI workflows
- Community concerns about long-term viability; competitors have surpassed Roam in features

---

## 6. Comparative Analysis

### Feature Matrix

| Feature | Tana | Readwise/Reader | Heptabase | Logseq | Roam |
|---------|------|----------------|-----------|--------|------|
| AI Chat (contextual) | Yes (node context) | Yes (document context) | Yes (whiteboard context) | Plugin only | No |
| AI Field Auto-fill | Yes (supertag fields) | No | No | No | No |
| Custom AI Commands | Yes (command nodes) | Yes (custom prompts) | Yes (custom actions) | Plugin only | No |
| AI Agents | Yes (beta) | No | No | No | No |
| Meeting Transcription | Yes (bot-less) | No | No | No | No |
| Voice → Structured Data | Yes (mobile) | No | No | No | No |
| AI-powered Discovery | Via chat + graph | Themed Reviews/Connections | Semantic search | No | No |
| Spaced Repetition + AI | No | Yes (core feature) | No | No | No |
| Auto-summarize on Import | No | Yes (Ghostreader) | No | No | No |
| MCP / Local API | Yes (first-party) | Community servers | Yes (first-party) | Community server | No |
| Multi-model Support | 13+ models | GPT-5 Mini + BYOK | 5+ models + BYOK | Plugin-dependent | No |
| AI Credits System | Yes (tiered) | Included in sub | Yes (tiered) | N/A | N/A |

### Architectural Approaches

| Tool | AI Architecture Philosophy |
|------|--------------------------|
| **Tana** | "AI is a node operation" — commands, prompts, agents all live in the graph as nodes. AI reads/writes the same data model users interact with. Deepest integration. |
| **Readwise** | "AI enhances the reading workflow" — focused on comprehension and retention. AI operates on documents and highlights, not general-purpose. Narrower but polished. |
| **Heptabase** | "AI augments visual thinking" — chat conversations can become spatial objects on whiteboards. AI is a thinking partner, not an automation engine. |
| **Logseq/Roam** | "AI is a plugin" — no architectural commitment. Community fills gaps. Risk of fragmentation. |

### Key Differentiators by Tool

**Tana's unique advantages:**
1. Command nodes = composable AI + graph operations (no other tool has this)
2. AI field auto-fill leveraging supertag schema (structured data extraction)
3. Meeting agent with entity linking to existing graph
4. Voice → structured supertag fields on mobile

**Readwise's unique advantages:**
1. Spaced repetition + AI = retention-focused (no competitor combines these)
2. Themed Connections = serendipitous discovery across all reading
3. Auto-processing on import = zero-friction AI
4. Prompt scoping system (document/paragraph/word) is well-designed

**Heptabase's unique advantages:**
1. AI conversations become spatial objects (drag to whiteboard)
2. Visual context (whiteboard layout) informs AI understanding
3. Source-level citations in responses

---

## 7. Implications for soma

### What soma can learn from each:

**From Tana (must-match, since we share the data model):**
- AI command nodes as "everything is a node" — soma's `CLAUDE.md` already mandates this
- AI field auto-fill is a killer feature for structured note-taking
- Contextual AI chat with `@` node references
- Variable templating in prompts (`${name}`, `${field}`)

**From Readwise (reading-focused features soma should consider):**
- Auto-summarize web pages on clip (natural fit for browser sidebar)
- Prompt scoping (document vs selection vs word) is elegant UX
- Themed discovery across accumulated content
- "Automatic prompts" that run on import without user action

**From Heptabase (interaction patterns):**
- Source-level citations in AI responses (link back to specific nodes)
- AI output as first-class content (drag into outline)

### soma's Unique Position

soma lives in the **browser sidebar** — this creates opportunities no competitor has:

1. **Page context is always available**: Unlike Tana (separate app) or Readwise (import-then-process), soma sees the page in real-time. AI can reference both the current webpage AND the user's knowledge graph simultaneously.

2. **Clip + structure + AI in one action**: Read article → highlight → AI extracts structured fields → saves as tagged node. Zero app-switching.

3. **Conversational reading assistant**: Chat about the current page using your existing notes as context. "How does this relate to what I read last week about X?"

4. **Lightweight AI entry point**: No desktop app required, no complex setup. AI features surface in the natural flow of browsing.

### Recommended Priority for soma AI Features

**Phase 1 — Foundation (highest leverage):**
- AI Chat in sidebar (contextual to current page + selected nodes)
- Auto-summarize on web clip
- Basic prompt templates (define, explain, translate on selection)

**Phase 2 — Structured AI:**
- AI field auto-fill for supertag fields
- Command nodes (AI + graph operations, composable)
- Custom prompt templates (user-configurable)

**Phase 3 — Discovery & Agents:**
- "Related notes" surfacing when reading (AI finds connections to existing graph)
- AI agents with configurable persona/context
- Themed review / spaced repetition for highlights

---

## Sources

- [Tana AI Documentation](https://tana.inc/docs/tana-ai)
- [AI Command Nodes in Tana](https://tana.inc/docs/ai-command-nodes)
- [Tana AI Chat](https://tana.inc/docs/ai-chat)
- [Tana AI Agents](https://tana.inc/docs/ai-agents)
- [Tana Meeting Agent](https://tana.inc/docs/meeting-agent)
- [Tana Local API & MCP](https://tana.inc/docs/local-api-mcp)
- [Tana AI for Builders](https://tana.inc/docs/ai-for-builders)
- [Tana Pricing](https://tana.inc/pricing)
- [What's New in Tana 2025](https://tana.inc/articles/whats-new-in-tana-2025-product-updates)
- [Tana $25M Funding — TechCrunch](https://techcrunch.com/2025/02/03/tana-snaps-up-25m-with-its-ai-powered-knowledge-graph-for-work-racking-up-a-160k-waitlist/)
- [Use Multiple AI Models in Tana](https://tana.inc/articles/ai-models-in-tana)
- [Tana Advent Calendar 2025](https://tana.inc/articles/tana-advent-calendar-december-2025)
- [Readwise Ghostreader Overview](https://docs.readwise.io/reader/guides/ghostreader/overview)
- [Ghostreader Custom Prompts](https://docs.readwise.io/reader/guides/ghostreader/custom-prompts)
- [Ghostreader Default Prompts](https://docs.readwise.io/reader/guides/ghostreader/default-prompts)
- [Readwise Themed Reviews](https://docs.readwise.io/readwise/guides/themed-reviews)
- [Readwise Spaced Repetition](https://help.readwise.io/article/26-how-does-the-readwise-spaced-repetition-algorithm-work)
- [Readwise Reader Update Jan 2025](https://readwise.io/reader/update-jan2025)
- [Readwise Pricing](https://readwise.io/pricing)
- [Readwise & Reader Changelog](https://docs.readwise.io/changelog)
- [Heptabase Work with AI](https://wiki.heptabase.com/work-with-ai)
- [Heptabase 2025 Changelog](https://wiki.heptabase.com/changelog/2025)
- [Heptabase 2026 Changelog](https://wiki.heptabase.com/changelog/changelog)
- [Heptabase AI Updates Dec 2025](https://wiki.heptabase.com/newsletters/2025-12-30)
- [Logseq AI Discussion](https://discuss.logseq.com/t/how-is-logseq-s-official-development-aligning-with-the-emerging-agentic-ai-trend/34823)
- [Roam Research](https://roamresearch.com/)
- [Tana Review — Medium](https://medium.com/@danielasgharian/tana-review-the-note-taking-app-that-actually-gets-ai-right-639ce08211f3)
- [AI in Readwise — Learning Aloud](https://learningaloud.com/blog/2025/02/12/ai-in-readwise/)
