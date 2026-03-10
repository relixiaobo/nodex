# PKM Tools AI Landscape Research

> Research date: 2026-03-09
> Purpose: Understand how major PKM tools integrate AI, with focus on structured/graph-based vs document-based approaches

---

## Executive Summary

AI in PKM tools falls into a clear spectrum from **AI-native** (Mem) to **AI-optional** (Anytype, Obsidian). The most interesting differentiator is not *what* AI features exist (everyone has chat, summarize, write), but **how much of the knowledge structure AI can leverage**. Structured/graph-based tools (Notion, Capacities, Reflect) have a significant advantage: their data models give AI more to work with than flat documents.

| Product | Architecture | AI Depth | AI Pricing | Key Differentiator |
|---------|-------------|----------|------------|-------------------|
| **Notion** | Structured databases + pages | Deep (agents, auto-fill, Q&A) | Included in Business ($20/user/mo); credits for agents | Autonomous agents + database auto-fill |
| **Obsidian** | Local markdown files | Plugin ecosystem (community) | BYOK (free plugins, pay for API) | Local-first embeddings, user owns model choice |
| **Mem** | Flat notes, AI-organized | Core (AI *is* the organizer) | $12/mo (Mem Pro) | No folders -- AI handles all organization |
| **Reflect** | Backlinked notes + graph | Integrated (graph-aware AI) | Included in $10/mo plan | AI traverses note graph for synthesis |
| **Capacities** | Object types + properties | Integrated (context-aware) | Included in Pro ($9.99/mo) | Object structure gives AI typed context |
| **Anytype** | Local-first objects + relations | Planned (MCP bridge today) | N/A (not yet shipped) | User chooses: no AI, local AI, or cloud AI |

---

## 1. Notion AI

### Architecture
Structured databases (tables with typed properties) + freeform pages. The richest structured data model among mainstream tools.

### AI Features

**Database Auto-Fill (unique strength)**
- AI properties on database columns: Summary, Key Info, Translation, Custom Prompt
- Custom prompts can extract structured data from page content ("Who was the sales rep on this call?")
- Auto-updates 5 minutes after page edits -- passive, ambient intelligence
- This is the killer feature: AI that *writes into structure*, not just chat windows

**Q&A / Search**
- Workspace-wide Q&A: returns *answers* with citations, not just links
- Pulls from pages, databases, and connected apps (Slack, Google Drive, etc.)
- Natural language queries against database contents

**Autonomous Agents (launched Sept 2025, custom agents Feb 2026)**
- Trigger-based: schedule, Slack message, email, database change
- Can triage tasks, generate reports, respond to Slack, manage email
- Connect to external tools via MCP (Linear, Figma, HubSpot)
- Multi-model: Claude, GPT, Gemini -- user picks per agent
- 21,000+ custom agents built by early testers; Notion runs 2,800 internally
- Prompt injection guardrails built in

**Writing Assistance**
- Standard: summarize, translate, fix grammar, change tone, continue writing
- Inline in any page, context-aware to surrounding content

### How AI Leverages Structure
Notion's database model is the biggest advantage. Auto-fill properties mean AI doesn't just *answer questions* -- it *populates structured fields*. A CRM database can auto-extract deal size, next steps, and sentiment from meeting notes. This is qualitatively different from "chat with your notes."

### Pricing
- Business plan ($20/user/mo): full AI access included
- Free/Plus: limited trial
- Custom Agents: free through May 2026, then credit-based ($10/1000 credits) for Business/Enterprise
- Separate AI apps (AI Search $35, AI Meeting Notes $18, AI Writing $20, etc.) for standalone use

### User Reception
- **Works well**: Database auto-fill saves real time; Q&A across workspace is genuinely useful; seamless integration (no context switching)
- **Doesn't work well**: Struggles with highly technical/domain-specific content; throttling on heavy use; limited outside Notion ecosystem; per-seat pricing adds up; generic writing output (not specialized)
- Overall: ~8.2/10, "above overhyped bot, below total workflow transformer"

### Discovery vs Creation
**Both, but creation is stronger.** Auto-fill creates new structured data. Q&A discovers across existing content. Agents do both (find info and create/update records). Discovery is cross-workspace but stays within Notion's walls.

---

## 2. Obsidian (Community Plugins)

### Architecture
Local markdown files, user-managed vault. No cloud, no structure enforcement. All AI comes from community plugins.

### AI Features

**Smart Connections (flagship discovery plugin)**
- Local embeddings: indexes vault on-device, no API key required for basic use
- Connections View: shows semantically related notes while you write (not keyword -- *meaning*)
- Semantic search (Smart Lookup): natural language queries against vault
- Cosine similarity scoring for relevance ranking
- Works offline after initial indexing
- Smart Chat (separate plugin) for conversational Q&A over vault
- Open source, free core; Smart Chat Pro for cloud model access

**Obsidian Copilot (flagship creation plugin)**
- In-vault AI assistant with chat interface
- Vault-wide Q&A, web/YouTube integration
- Text modification with custom prompts
- BYOM: any OpenAI-compatible API or local model (Ollama, etc.)
- Agentic capabilities (can modify notes)
- 100% local data ownership

**Other Notable Plugins**
- Text Generator: GPT-powered writing assistance
- Various summarization, tagging, and linking plugins
- Community-driven: quality and maintenance vary

### How AI Leverages Structure
Obsidian has minimal inherent structure (just files and links). Smart Connections compensates by creating its own semantic layer via embeddings. This means:
- AI understands *meaning* relationships, even without explicit links
- But it cannot leverage typed properties, database columns, or object schemas
- The graph view exists but AI plugins generally don't traverse the link graph -- they use embeddings independently

### Pricing
- Plugins: free (open source core)
- API costs: user pays own provider (OpenAI, Anthropic, etc.) or runs local models (free)
- No vendor lock-in on AI provider
- Obsidian itself: free for personal use, $50/yr commercial

### User Reception
- **Works well**: Privacy-first; model choice freedom; Smart Connections' related-note surfacing is genuinely useful for large vaults; offline capability
- **Doesn't work well**: Setup complexity (choosing models, configuring APIs); quality varies by plugin; no unified AI experience; local models are slower/less capable than cloud; community maintenance risk
- The passionate community builds impressive tools, but fragmentation means no single "Obsidian AI" experience

### Discovery vs Creation
**Primarily discovery.** Smart Connections excels at surfacing forgotten/related notes. Copilot helps with creation but it's standard LLM writing assistance. The unique value is the embedding-based discovery layer that finds connections you didn't explicitly make.

---

## 3. Mem (mem.ai)

### Architecture
Flat notes, no folders, no hierarchy. Tags exist but organization is fundamentally AI-driven. This is the most radical "AI-first" approach.

### AI Features

**Self-Organizing System (core differentiator)**
- No folders: AI groups similar content automatically
- Replaces manual organization with semantic clustering
- The premise: you capture freely, AI handles the filing

**Smart Search / Deep Search**
- Semantic search across all notes
- Copilot surfaces relevant notes while you write (ambient, not prompted)
- Finds information even when wording differs from original capture

**Voice Mode**
- Dictate thoughts (walking, meetings)
- AI transcribes and transforms rambling into organized, searchable notes
- Meeting transcription with structured output

**Agentic Chat**
- Chat that takes action: creates, edits, and organizes notes
- Not just conversation -- actual CRUD operations on your data

### How AI Leverages Structure
Mem has minimal explicit structure -- that's the point. AI *is* the structure. This is a philosophical bet: instead of building a rich data model for AI to query, Mem lets AI be the organizational layer itself. Tags provide light structure, but the system is designed to work without manual organization.

### Pricing
- Free: 25 notes + 25 chat messages/month
- Mem Pro: $12/month (unlimited)
- No annual discount for individual plans

### User Reception
- **Works well**: Effortless capture (just write, don't organize); semantic search finds things you forgot about; voice mode is genuinely useful for capture on the go
- **Doesn't work well**: Buggy execution (tags don't always work in search; features removed without notice); no Android app; sluggish performance; poor customer support (bugs unfixed for 2+ years); missing basic features (no highlighting, no keyboard reordering); the folderless approach frustrates users who want control
- Mixed reception: the *idea* is beloved, the *execution* is criticized. "Amazing concept, huge problems with execution"

### Discovery vs Creation
**Discovery is the core promise, but creation (capture) is the actual strength.** The self-organizing discovery works inconsistently. Voice capture and frictionless note-taking are what users actually love. The "AI finds your stuff" promise is only partially delivered.

---

## 4. Reflect

### Architecture
Backlinked notes with a knowledge graph. Daily notes as primary capture. Closer to Roam/Logseq than Notion. End-to-end encrypted.

### AI Features

**Graph-Aware AI (key differentiator)**
- Claims to be the first note-taking app where AI understands the entire note graph
- AI traverses backlinks and connections, not just individual note content
- Cross-note synthesis: "What have I learned about X?" draws from 20+ connected notes
- Includes quotes, criticisms, and preferences from across the graph

**Writing & Organization**
- GPT-4 and Whisper integration
- Summarize long notes
- Generate daily tasks from notes
- Voice memo transcription

**MCP Server**
- Official MCP server lets external AI assistants (Claude Code, Codex) search Reflect notes
- Bridge between personal notes and development workflow

**Auto-Linking**
- AI quietly links related ideas from past entries
- Passive discovery: connections appear without user action

### How AI Leverages Structure
Reflect's graph structure is its AI advantage. While the data model is simpler than Notion's (notes + backlinks, no typed properties), the *connection graph* gives AI a semantic web to traverse. The AI doesn't just search text -- it follows relationship chains. This makes synthesis ("connect ideas across 23 notes about productivity") genuinely useful.

### Pricing
- $10/month or $99/year
- 14-day free trial
- All AI features included (no separate tier)

### User Reception
- **Works well**: Cross-note synthesis is the standout feature; AI suggestions improve with vault size (100+ notes); clean, focused UX; E2E encryption for privacy-conscious users
- **Doesn't work well**: AI value is minimal with fewer than 50 notes (cold start problem); related note accuracy ~70%; limited to personal use (no team features); smaller ecosystem than Notion/Obsidian
- Best suited for: individual thinkers/writers who build large interconnected note collections over time

### Discovery vs Creation
**Primarily discovery.** The graph-traversal synthesis is unique. Creation features (writing assist, transcription) are standard. The real value is "AI that understands your thinking history."

---

## 5. Capacities

### Architecture
Object-based: everything is a typed object (Person, Book, Meeting, Project) with custom properties and relationships. Closest to soma/Tana's "everything is a node" philosophy.

### AI Features

**Context-Aware AI Assistant**
- Chat with selected notes as context
- Backlinks automatically included in AI context
- AI reads and searches notes to answer questions
- Clickable source links in responses
- Perplexity integration for web-augmented answers

**Object-Aware Operations**
- Auto-fill object properties (similar to Notion's database auto-fill)
- Contextual: highlight text and use / command to explain, simplify, or generate questions
- AI understands object types -- a "Book" object gets different treatment than a "Meeting" object

**Saved AI Chats as Objects**
- AI conversations become first-class objects
- Can be tagged, linked, referenced, searched
- Appear in backlink sections of related objects
- This is elegant: AI output becomes part of the knowledge graph

### How AI Leverages Structure
Capacities' object model gives AI *typed* context. When AI processes a "Meeting" object, it knows about attendees, date, action items -- not just freeform text. This is structurally similar to Notion's database advantage but with a more flexible object graph (objects can reference each other freely, not just live in tables).

The key insight: saved AI chats becoming objects means AI output feeds back into the knowledge structure, creating a virtuous cycle.

### Pricing
- Free: unlimited notes, 5GB storage, no AI
- Pro: $9.99/month (annual) -- includes AI assistant
- Believer: $12.49/month (beta access)

### User Reception
- **Works well**: "AI assistant alone is worth it for research"; contextual in-line AI eliminates context switching; object model gives AI useful structure; clean UX
- **Doesn't work well**: Smaller feature set than Notion; less mature AI (catching up); limited integrations; smaller community
- Growing steadily: appeals to users who find Notion too complex and Obsidian too unstructured

### Discovery vs Creation
**Both, with a slight edge to creation.** The contextual AI assistant helps create (summarize, explain, generate) within object context. Discovery happens through backlink-aware search and AI traversal, but it's less emphasized than in Reflect or Smart Connections.

---

## 6. Anytype

### Architecture
Local-first, E2E encrypted objects with types and relations. P2P sync. Open source. The most privacy-focused tool in this comparison.

### AI Features

**Current State: MCP Bridge (no native AI)**
- Official MCP server: AI assistants (Claude, Cursor, etc.) can interact with Anytype data
- Search, create, update objects through natural language via MCP
- Leverages Anytype's full object model (types, relations, properties)

**Planned: Hybrid AI Stack**
- User chooses: no AI, local AI, cloud AI, or hybrid
- Prototyping local agents ("open clone" concept) that use Anytype objects as memory
- Agent can create executable programs through conversation
- Philosophy: AI is opt-in, never forced, always user-controlled

**Why No Native AI Yet**
- Data sovereignty is the priority: they won't ship cloud AI that compromises privacy principles
- Local AI (on-device models) not yet mature enough for their quality bar
- Structured object model is described as "unusually well-positioned" for AI integration

### How AI Leverages Structure
Anytype's object model (types, relations, sets) is rich enough for AI to work with meaningfully. The MCP server already exposes this structure. When native AI ships, the structured data should enable Notion-like property auto-fill and Capacities-like contextual assistance. The local-first architecture means AI can process everything on-device without privacy concerns.

### Pricing
- Free for personal use (local storage)
- Membership tiers for cloud backup and collaboration
- AI pricing: TBD (philosophy suggests local AI will be free, cloud AI may require API keys)

### User Reception
- **Works well**: Privacy-first approach is beloved; snappy performance; flexible data modeling; dependable P2P sync; clean UX
- **Doesn't work well**: No native AI yet (MCP bridge requires technical setup); smaller ecosystem; steeper learning curve for object modeling
- Community is enthusiastic about AI plans but waiting for delivery

### Discovery vs Creation
**Neither yet (natively).** The MCP bridge enables both through external tools. The planned local agent approach could be powerful for both discovery (search/connect) and creation (generate/organize).

---

## Cross-Cutting Analysis

### How Structure Affects AI Value

The most important finding: **structured data models multiply AI value**.

| Structure Level | Example | AI Can Do | AI Cannot Do |
|----------------|---------|-----------|-------------|
| **Flat text** | Obsidian (raw markdown) | Semantic search, summarize, write | Auto-fill properties, typed queries, cross-object reasoning |
| **Links/Graph** | Reflect, Obsidian (with links) | + Traverse connections, synthesize across notes | Typed queries, property extraction |
| **Typed objects** | Capacities, Anytype | + Property auto-fill, type-aware processing | (Mostly capable) |
| **Full database** | Notion, Tana/soma | + Column auto-fill, relational queries, agent workflows | (Most capable) |

**Key insight for soma**: Tana's "everything is a node" with typed Tuples, supertags, and field definitions puts it at the richest end of the spectrum. This means AI features can be *qualitatively* better than flat-note tools -- not just "chat with your notes" but "auto-populate field values based on node content and tag schema."

### Discovery vs Creation Matrix

| Product | Discovery (find connections) | Creation (generate content) | Organization (structure data) |
|---------|-------|----------|-------------|
| **Notion** | Q&A across workspace | Writing assist, agents | Auto-fill database properties |
| **Obsidian** | Smart Connections (embeddings) | Copilot (standard LLM) | Manual (no AI org) |
| **Mem** | Semantic search | Voice capture + transcription | AI self-organization (unreliable) |
| **Reflect** | Graph-traversal synthesis | Writing assist, transcription | Auto-linking (light) |
| **Capacities** | Backlink-aware search | Contextual AI assistant | Object property auto-fill |
| **Anytype** | MCP search (external) | MCP create (external) | Planned |

### Pricing Patterns

Three models emerging:
1. **Bundled** (Reflect $10/mo, Capacities Pro $10/mo): AI included in subscription. Simpler, appeals to individuals.
2. **Tiered** (Notion): AI in higher plans + usage-based credits for agents. Enterprise-oriented.
3. **BYOK** (Obsidian, Anytype planned): User brings own API key or runs local models. Privacy-oriented, technically complex.

### What Users Actually Value (across all tools)

1. **Ambient intelligence** -- AI that works without being asked (Notion auto-fill, Mem self-organization, Reflect auto-linking)
2. **Cross-note synthesis** -- "What do I know about X?" drawing from many notes (Reflect, Notion Q&A)
3. **Contextual assistance** -- AI that understands *what* you're looking at, not generic chat (Capacities, Notion)
4. **Voice capture** -- Dictate and let AI structure it (Mem, Reflect)

### What Users Consistently Criticize

1. **Generic output** -- AI writing that sounds like AI, not like them
2. **Cold start** -- AI is useless with < 50 notes
3. **Accuracy** -- Wrong connections, hallucinated facts, shallow summaries
4. **Pricing** -- Per-seat costs add up for teams
5. **Ecosystem lock-in** -- AI only works within the tool's walls

---

## Implications for soma

### Structural Advantages soma Has

1. **Rich data model**: Supertags + field definitions + Tuples give AI more typed context than any competitor except Notion
2. **Browser context**: Side panel placement means AI can see both the web page AND the knowledge base -- unique position
3. **Node-based everything**: AI output can become nodes (like Capacities' saved chats as objects, but deeper)

### Feature Opportunities (ordered by structural leverage)

1. **Field auto-fill from web content** (Notion-like but browser-native): When clipping a page tagged with a supertag, AI auto-populates field values from page content. A node tagged "Research Paper" with fields Author, Year, Key Finding gets all three filled from the web page. This leverages soma's full Tuple/supertag model.

2. **Cross-node synthesis** (Reflect-like): "What do I know about X?" that traverses the node graph, following supertag relationships and field references. soma's richer structure means deeper answers than Reflect's backlink-only traversal.

3. **Contextual web + notes chat** (unique to browser sidebar): Chat that has context of both the current web page AND relevant nodes. No other tool has this dual-context naturally.

4. **Ambient connection surfacing** (Smart Connections-like): While reading a web page, sidebar shows related nodes from the knowledge base. Uses embeddings + supertag matching for relevance.

5. **AI-powered node organization**: Suggest supertags for untagged nodes, recommend field values, propose connections. The typed data model makes suggestions more precise than flat-note tools.

### Anti-Patterns to Avoid

1. **Generic chat without context** -- Every tool has this, it's not differentiating
2. **AI as the *only* organizer** (Mem's lesson) -- Users want AI to *assist* organization, not replace their agency
3. **Cloud-only AI** (Anytype's lesson) -- Privacy-conscious users want local options or at least transparency
4. **AI features behind a paywall too early** -- Capacities and Reflect include AI in base subscription; Notion's per-seat add-on pricing is criticized

---

## Sources

- [Notion Releases](https://www.notion.com/releases)
- [Notion AI for Databases Help Center](https://www.notion.com/help/autofill)
- [Notion AI Review 2026](https://max-productive.ai/ai-tools/notion-ai/)
- [Notion AI Review 2025 Features & Pricing](https://skywork.ai/blog/notion-ai-review-2025-features-pricing-workflows/)
- [Notion AI Limitations & Best Practices](https://www.eesel.ai/blog/notion-ai-limitations-best-practices)
- [Notion AI Autofill Guide](https://www.eesel.ai/blog/notion-ai-autofill)
- [Notion Custom Agents Guide](https://almcorp.com/blog/notion-custom-agents/)
- [Notion 3.3: Custom Agents Release](https://www.notion.com/releases/2026-02-24)
- [Introducing Custom Agents Blog](https://www.notion.com/blog/introducing-custom-agents)
- [Smart Connections for Obsidian](https://smartconnections.app)
- [Smart Connections GitHub](https://github.com/brianpetro/obsidian-smart-connections)
- [Obsidian Copilot GitHub](https://github.com/logancyang/obsidian-copilot)
- [Obsidian AI Explained](https://www.eesel.ai/blog/obsidian-ai)
- [Obsidian Smart Connections Semantic Search](https://smartconnections.app/semantic-search/)
- [Mem 2.0 Introduction](https://get.mem.ai/blog/introducing-mem-2-0)
- [Mem AI Pricing](https://get.mem.ai/pricing)
- [Mem AI Review 2025](https://www.fahimai.com/mem-ai)
- [Mem Trustpilot Reviews](https://www.trustpilot.com/review/mem.ai)
- [Capacities vs Mem AI Comparison](https://www.fahimai.com/capacities-vs-mem-ai)
- [Reflect Notes AI Features](https://downloadchaos.com/blog/reflect-notes-ai-features-note-taking-innovation)
- [Reflect Review 2025](https://votars.ai/en/blog/reflect-review-2025/)
- [Reflect Notes Official](https://reflect.app)
- [Capacities AI Assistant Docs](https://docs.capacities.io/reference/ai-assistant)
- [Capacities AI Release](https://capacities.io/whats-new/release-26)
- [Capacities Product AI Page](https://capacities.io/product/ai)
- [Capacities Pricing](https://capacities.io/pricing)
- [Capacities Review 2025](https://www.fahimai.com/capacities-review)
- [Anytype AI Plans Blog](https://blog.anytype.io/our-journey-and-plans-for-2025/)
- [Anytype February 2026 Update](https://blog.anytype.io/february-community-update-2026/)
- [Anytype MCP Server GitHub](https://github.com/anyproto/anytype-mcp)
- [Anytype Roadmap 2026](https://community.anytype.io/t/roadmap-update-2026-feb/30112)
- [Anytype Review 2025](https://www.fahimai.com/anytype)
- [Best PKM Apps 2026](https://toolfinder.com/best/pkm-apps)
