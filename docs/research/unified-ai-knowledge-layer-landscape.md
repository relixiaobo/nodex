# Unified AI + Knowledge Layer: Product Landscape Research

> Research date: 2026-03-28
> Purpose: Map the landscape of products that act as a "unified layer between local files and AI" — products that treat local files, notes, web content, and code as part of a single knowledge graph or semantic layer, with AI capabilities on top.

---

## Executive Summary

The vision of a "unified semantic layer between all user information and AI" is being pursued from multiple directions, but **no single product has achieved it**. The landscape breaks down into six archetypes:

| Archetype | Examples | Strength | Weakness |
|-----------|----------|----------|----------|
| **Screen Recorders** | Screenpipe, (Rewind/Limitless RIP) | Capture everything | No structure, no graph |
| **OS-Level AI** | Apple Intelligence, Microsoft Recall, Raycast | Deep system access | Walled garden, shallow semantics |
| **Object-Based PKM** | Tana, Capacities, Anytype | Structured knowledge graph | No local file integration |
| **File Managers + AI** | DEVONthink, Eagle | Deep file handling | Weak graph, weak collaboration |
| **Developer Context** | Pieces, Continue.dev, Warp | Rich workflow capture | Developer-only, no general knowledge |
| **Enterprise Search** | Glean, Dust, Notion Connectors | Cross-app unification | Enterprise-only, cloud-dependent |

**The gap soma can fill**: A structured knowledge graph (like Tana/Capacities) that also acts as a context layer for AI (like Pieces/Dust) and can ingest web content (like Screenpipe/Eagle), all local-first. The closest competitors are Tana (graph model) and Anytype (local-first + graph), but neither has cracked the "AI context layer over all your information" problem.

---

## Category 1: Local-First Knowledge + AI

### Rewind.ai / Limitless (DEAD)

**Core concept**: Record everything on your screen, make it searchable with AI.

**Status**: Acquired by Meta in December 2025. Desktop app disabled December 19, 2025. Hardware (pendant) discontinued. The product no longer exists as an independent entity.

**How it handled local files**: The original Rewind (pre-pivot) was a local-first Mac app that recorded screen activity and stored everything locally. After the 2024 rebrand to Limitless, the company pivoted to a cloud-based wearable pendant for meeting recording, abandoning the local-first desktop screen capture vision.

**AI capabilities**: Natural language search across recorded screen content and audio transcripts. The pendant version focused on meeting transcription and summarization.

**Data model**: Flat timeline of screenshots + OCR text + audio transcripts. No graph, no structure, no relations.

**Key insight for soma**: The original Rewind vision (local-first, record everything, search with AI) was compelling but **lacked structure**. Raw screen recordings without a knowledge graph produce noise, not knowledge. The pivot away from desktop recording and Meta acquisition suggest this "capture everything" model is hard to sustain as a standalone product.

**Limitations**: No structure or organization. No user agency in what gets captured. Privacy concerns killed adoption. Company no longer exists independently.

### Screenpipe (Open Source Alternative)

**Core concept**: Open-source, local-first screen recording with AI search. Spiritual successor to Rewind.

**How it handles local files**: Captures 24/7 screen recording with text extraction via accessibility APIs + OCR fallback. All data stored locally, encrypted, never leaves device. Captures only when something meaningful changes (app switches, clicks, typing pauses).

**AI capabilities**: Works with local models (Ollama), Apple Intelligence, or cloud (Claude, GPT). Full REST API for building custom integrations. MCP server support for connecting to AI agents.

**Data model**: Timeline of screen captures + extracted text. Searchable by keyword, app, time range, or natural language. No graph structure.

**Key insight for soma**: Screenpipe's **plugin/pipe system** is interesting — it exposes a REST API so other tools can consume the captured context. This is the "AI context layer" pattern: capture broadly, expose structured context to whatever AI system needs it. The MCP integration is particularly relevant.

**Limitations**: Raw captures without semantic structure. 16K+ GitHub stars show demand for local-first capture, but the product remains a developer tool, not a knowledge management system.

### Apple Intelligence

**Core concept**: System-wide AI that can see across all apps on Apple devices. The OS itself becomes the unified layer.

**How it handles local files**: The **Semantic Index** is an on-device database that indexes the semantic meaning of all files, photos, emails, and content on the device. Uses Apple Silicon NPU for local inference. ~3B parameter on-device model optimized through KV-cache sharing and 2-bit quantization.

**AI capabilities**: Writing tools, image generation, smart replies, Siri with personal context. Third-party developers can expose their app data to the Semantic Index via the App Intents framework. Private Cloud Compute handles tasks too complex for on-device processing.

**Data model**: The Semantic Index is opaque — Apple hasn't published its internal structure. It indexes across Mail, Messages, Photos, Notes, Calendar, and third-party apps that opt in. The index understands entities and relationships but this is not user-visible or user-editable.

**Key insight for soma**: Apple's approach proves that **the OS is the natural unification point**. When AI can see across all apps, the value proposition is enormous. However, Apple's implementation is a black box — users can't see, edit, or extend the semantic index. Soma's opportunity: be the **user-controlled semantic index** that Apple Intelligence cannot be. A structured knowledge graph the user owns and shapes, that can also serve as context for AI.

**Limitations**: Walled garden (Apple-only). Black box (no user control over the semantic index). Third-party integration depends on developers adopting App Intents. Siri's quality remains a bottleneck. No cross-platform story.

### Microsoft Recall / Semantic Indexing

**Core concept**: Periodic screenshots + AI understanding of everything you do on Windows. Semantic Indexing adds natural-language file search.

**How it handles local files**: Recall captures periodic screenshots of active windows, with on-device OCR and 40+ local ML models for text/image recognition. Semantic Indexing indexes .txt, .pdf, .docx, .pptx, .xls and image files. All data encrypted locally. Requires Copilot+ PC NPU (40+ TOPS).

**AI capabilities**: Natural language search ("blue sustainability slide from last meeting"). Chronological timeline navigation. Semantic file search that works offline.

**Data model**: Timeline of snapshots with extracted text and visual features. Semantic Indexing adds a vector index of file contents. No graph structure — purely a search layer.

**Key insight for soma**: Microsoft's approach validates that **semantic understanding of local content is a killer feature**, but their implementation is purely passive (screenshots). There's no mechanism for users to create structure or connections. The hardware requirement (NPU) limits adoption. Soma could offer the semantic understanding without requiring specialized hardware, by having users create the structure themselves (which is what note-taking already is).

**Limitations**: Requires expensive Copilot+ PC hardware. Privacy controversies caused multiple delays. No graph or relationship model. Windows-only. Limited file format support.

### Raycast

**Core concept**: macOS launcher that connects to everything + AI. "Your shortcut to everything."

**How it handles local files**: Searches Finder, integrates with Calendar, Notes, Reminders. File search and clipboard history built in. All data stored locally on device.

**AI capabilities**: Access to 30+ models (OpenAI, Claude, DeepSeek, Gemini) through single interface. Quick AI floating window. AI Extensions that convert natural language to actions. Can attach documents (PDFs, CSV) to chat sessions. Web search with inline references.

**Data model**: No graph. Raycast is a **command layer**, not a knowledge layer. It dispatches actions to other apps. Extensions are the atomic unit — each connects to one service. Notes feature exists but is basic.

**Key insight for soma**: Raycast's **AI Extensions pattern** is brilliant: describe what you want in natural language, let AI orchestrate actions across multiple tools. This is the "AI as universal remote control" model. Also notable: Raycast launched Notes as a feature, recognizing that even a launcher needs persistent knowledge to be truly useful. The trajectory from "launcher" to "AI OS" validates that **all roads lead to knowledge management**.

**Limitations**: macOS-only (Windows beta in late 2025). No knowledge graph. Notes are flat. The extension model means Raycast is as good as its integrations — it doesn't own your data. Subscription pricing ($8-16/mo for AI features).

---

## Category 2: File-Based Knowledge Management + AI

### DEVONthink

**Core concept**: The power user's document management system for macOS. Deep indexing, AI-powered classification, and complete control over your files.

**How it handles local files**: DEVONthink can import files or index them in place (without moving them). Supports virtually every file format. Groups, tags, and smart groups organize content. Databases can be stored locally or synced via iCloud/WebDAV/Bonjour.

**AI capabilities**: Built-in local ML for document classification and "See Also" suggestions (finds related documents). DEVONthink 4 (2025) added LLM integration — ChatGPT, Claude, Gemini — for natural language search, tagging, summarizing, and document conversations. Local AI models supported. Philosophy: "You decide whether and how to integrate AI."

**Data model**: Hierarchical groups (folders) + tags + smart groups (saved searches). Not a graph — documents don't link to each other in a structured way. The "See Also" AI finds similarity but doesn't create persistent connections.

**Key insight for soma**: DEVONthink's **indexing-in-place** capability is remarkable — it can make any folder on your filesystem part of its knowledge base without moving files. This is the closest to a "unified layer over local files." Their AI integration philosophy is also instructive: they added LLMs as optional tools, not as core infrastructure. For DEVONthink, the AI serves the document management, not the other way around.

**Limitations**: macOS-only. No graph model. No collaboration features. Steep learning curve. The data model is still fundamentally files-in-folders. AI features feel bolted on rather than native. No web presence.

### Hazel (macOS File Automation)

**Core concept**: Rule-based file automation for macOS. Watch folders, apply conditions, execute actions.

**How it handles files**: Watches designated folders. Rules match on file metadata (name, extension, date, size, tags) and can read text inside PDFs. Actions: move, copy, rename, tag, archive, delete, run scripts. Multi-step rule chains possible.

**Data model**: Rules are condition-action pairs. No knowledge graph, no semantic understanding. Purely metadata-driven automation.

**Key insight for soma**: Hazel demonstrates that **file automation is a separate concern from file understanding**. Hazel is powerful for filing but has "no concept of what is actually inside the file." This is the gap: systems that understand file metadata vs. systems that understand file meaning. Soma operates in the meaning layer.

**Limitations**: No AI, no semantic understanding, no graph. Rules are brittle — you need a specific rule for each scenario. macOS System Settings pane (not even a standalone app). No content understanding.

### Hookmark (formerly Hook)

**Core concept**: Create bidirectional links between any files, emails, web pages, and app items on macOS. "Links beat searching."

**How it handles local files**: Hookmark doesn't store or manage files. It creates a **link layer** on top of your existing apps. When invoked, it communicates with the foreground app via AppleScript/JXA to get the current item's address, then stores bidirectional links between items. Uses robust `hook://file/` URLs that survive file moves.

**AI capabilities**: None natively. However, a community-built **Hookmark MCP Server** exists, allowing AI agents to traverse Hookmark's link graph.

**Data model**: A **graph of links** stored locally. Each link connects two addressable items (files, emails, web pages, app-specific items). Links are bidirectional. Supports deep links into PDFs (page + location). The graph is exportable as XML.

**Key insight for soma**: Hookmark is the **purest expression of the "link layer" concept**. It proves that bidirectional links between arbitrary items across apps are technically feasible on macOS via AppleScript/URL schemes. The limitation is that Hookmark is *only* a link layer — it has no content, no notes, no AI. Soma's node graph IS a richer version of what Hookmark does: not just links between items, but structured nodes with content, fields, tags, and AI capabilities.

**Limitations**: macOS-only. No content layer — only links. Depends on each app exposing AppleScript APIs (many don't). No AI. No mobile. No collaboration. Steep learning curve for a single-function tool.

### Eagle

**Core concept**: Visual asset management for designers. Organize images, videos, fonts, and design files with powerful tagging and search.

**How it handles local files**: Eagle stores all files locally in its own library format. Supports 100+ file formats. Automatic color detection, smart folders, nested tags. Files stay 100% on your machine.

**AI capabilities**: Current: AI Image Enlarger, AI Background Remover, AI Eraser. Coming in Eagle 5.0 (Q1 2026): AI Search (drop in reference image, find matches), AI Action (auto-naming, tagging, categorizing on import), Eagle MCP (control Eagle via natural language through ChatGPT/Claude).

**Data model**: Files organized by folders, tags, colors, ratings, annotations. Tag hierarchy supported. Not a graph — relations are through tags and smart folders only. One-time purchase license model.

**Key insight for soma**: Eagle 5.0's approach is noteworthy: **local-first AI that runs with zero uploads**, and **MCP integration for AI control**. The "configure AI models once, use across all plugins" pattern is elegant. Eagle proves that domain-specific asset management + AI can work well. For soma, the lesson is that AI features should serve the existing workflow (organizing, tagging, searching) rather than replacing it.

**Limitations**: Design-focused, not general knowledge management. No graph model. No text/note content. No web integration. Desktop-only.

---

## Category 3: Unified Workspace / "Everything App"

### Capacities

**Core concept**: "A studio for your mind" — object-based note-taking where everything is a typed object with properties and connections.

**How it handles local files**: Limited. Can embed files in objects but doesn't index or manage local files. Recent rebuild of search to run locally on device for instant offline search.

**AI capabilities (Pro plan)**: AI that knows your notes and context. Conversational AI on any note. AI suggests tags, collections, and properties. Smart Queries for saved dynamic filters.

**Data model**: **Object-centric database architecture**. Two categories of object types:
- **Basic types** (built-in): Page, Image, Web Link, etc.
- **Custom types** (user-defined): Any entity with custom properties

Properties include text, date, checkbox, URL, object-select (typed references to other objects). **Two-way linked properties** automatically update across object types. Objects are stored in per-type databases. Smart Queries surface objects matching complex criteria.

**Key insight for soma**: Capacities is the **closest competitor to soma's "everything is a node" model**, but with a key philosophical difference: Capacities uses **typed databases** (one per object type) while soma/Tana uses a **universal node graph** (one table, `doc_type` distinguishes). Capacities' strength is that types provide clear structure and expectations. Its weakness is that rigid typing creates friction ("Is this a Person or a Contact?"). Soma's approach — everything is a node, supertags add structure optionally — is more flexible. Capacities' **two-way linked properties** are worth studying: when you link Project A to Person B, Person B automatically shows Project A.

**Limitations**: No local file integration. Cloud-dependent (despite local search). No API for third-party integration until recently. Limited AI features compared to Tana. No custom views or advanced visualization.

### Anytype

**Core concept**: Local-first, decentralized, everything-is-an-object workspace built on peer-to-peer IPFS-based protocol.

**How it handles local files**: All data stored locally first, encrypted with zero-knowledge encryption. Syncs via private IPFS network. Local P2P sync between devices on same network. Full offline functionality. Can operate in local-only mode with no network.

**AI capabilities**: Currently exploratory. Prototyping a local AI agent using user-provided API keys, where Anytype objects serve as the agent's memory. Philosophy: "user choice over imposed solutions."

**Data model**: **Object Types + Relations** model.
- **Object Types**: Define entity structure (Page, Note, Task, Contact, Book, etc.). Each has a layout and set of Relations. System, Internal, and User-created categories.
- **Relations**: Properties attached to objects. Can be Details (metadata), Derived (computed), Local, or Account-specific. Format=object relations create typed connections between objects.
- **Block Structure**: Documents use parent-child tree (blocks with `childrenIds` arrays). Relations provide graph-like cross-references on top of the tree.
- **Collections 2.0** (in exploration): Moving from rigid single-type categorization toward "context defines the object" — an object can relate to multiple types based on context.

Compared to Tana's "everything is a node":
- Anytype: Hierarchical blocks (tree) + Relations (graph overlay). Types constrain what data objects hold.
- Tana: Universal node graph. No inherent type constraint. Supertags add structure optionally.

**Key insight for soma**: Anytype is the **most architecturally similar to soma** — local-first, CRDT-based sync, structured object model, graph of relations. Key differences: (1) Anytype uses IPFS/decentralized sync vs. soma's Loro CRDT + Cloudflare; (2) Anytype separates "Types" and "Relations" as first-class concepts vs. soma's unified node + supertag model; (3) Anytype has no AI integration yet. Their **Collections 2.0 exploration** (objects belonging to multiple types by context) is philosophically interesting and worth tracking. Their "Sovereign Collaboration" (shared spaces with P2P CRDT) is also architecturally relevant.

**Limitations**: No AI features yet. Complex mental model (Types vs Templates vs Relations vs Sets vs Collections). Performance issues reported with large datasets. Mobile apps lag behind desktop. The decentralized architecture adds complexity without clear user benefit for most people.

### Heptabase

**Core concept**: Visual knowledge management through infinite whiteboards + cards. "Think visually, learn deeply."

**How it handles local files**: PDF import with OCR (content, images, equations, tables). Web clipper for articles. Files embedded in cards. No local file system indexing.

**AI capabilities**: Research assistance with citations. Chat with whiteboards. AI uses OpenAI, Gemini, Anthropic models. PDF parsing and explanation. Limited vs Pro vs Premium tiers.

**Data model**: **Cards + Whiteboards** architecture.
- **Cards**: The atomic unit. A card can appear on multiple whiteboards simultaneously as "replicants." Cards have block-based content with bidirectional linking.
- **Whiteboards**: Infinite spatial canvases. Don't own card content — only store spatial metadata (position, shape, color, arrows). This is a key design decision: content lives in cards, arrangement lives in whiteboards.
- **Journal**: Another meta-app that references cards, doesn't own them.
- Global search across 10,000+ notes in under a second.

**Key insight for soma**: Heptabase's **separation of content from spatial arrangement** is architecturally elegant. Cards contain knowledge; whiteboards contain thinking arrangements. The same card on three whiteboards represents three different cognitive contexts. This validates that **views and content should be separate concerns** — which aligns with soma's planned ViewDef nodes. Heptabase's MCP server (for AI access to backup data) is also worth noting as a pattern.

**Limitations**: No local file integration. No structured types/schemas (cards are untyped). Limited AI features. No API. Closed source. No automation or agent capabilities. Expensive ($11.99/mo minimum).

### Mem.ai

**Core concept**: Self-organizing AI workspace. "Just write — AI handles the rest."

**How it handles local files**: Does not handle local files. Cloud-only. Notes, emails, and imported content live in Mem's cloud.

**AI capabilities**: **Mem X** — background AI that builds a knowledge graph (the "Mem Graph") of relationships between notes. Conversational AI that synthesizes answers across all notes. Automatic organization, tagging, and surfacing of related content. GPT-4 and Claude models. "Parallel mind" concept in Mem 2.0.

**Data model**: Notes as the primary unit. The **Mem Graph** combines a knowledge graph for relationships and a vector database for semantic understanding. AI extracts entities and relations from notes. Self-organizing: as you add content, Mem X finds connections and suggests structure.

**Key insight for soma**: Mem represents the **AI-first extreme** — structure emerges from AI, not from user effort. The Mem Graph is interesting: entities and relations extracted automatically from unstructured notes. The question is whether AI-generated structure is trustworthy and useful. User reviews suggest it works for quick capture but fails for systematic knowledge work. Soma's philosophy ("everything is a node" with explicit user-created structure) is the opposite approach — and likely more reliable for serious knowledge work.

**Limitations**: Cloud-only. No local-first. No user-visible graph model (AI decides the structure). Limited export options. Expensive ($14.99/mo+). Reviews report the AI organization is hit-or-miss. No file integration. No collaboration.

---

## Category 4: Developer-Oriented Unified Layers

### Pieces for Developers

**Core concept**: AI-powered context manager that captures, enriches, and recalls developer workflow context across IDEs, browsers, and terminals.

**How it handles local files**: **PiecesOS** runs as a background service at the OS level. The **Long-Term Memory Engine (LTM-2.7)** captures context from IDEs (changes, commits, open files), browsers (tabs, reference links), and collaboration tools (messaging, file sharing). All data stored locally. IndexedDB for caching. On-device ML filters sensitive information.

**AI capabilities**: Multiple LLM support (local via Ollama, cloud via any provider). Snippet enrichment with auto-generated titles, tags, descriptions. 9-month historical context recall. MCP server for connecting to external AI tools. "Deep Study" features use dedicated cloud LLM.

**Data model**: **Timeline of workflow events** enriched with AI metadata. Snippets with auto-generated metadata. Context includes user metadata, application registry, timeline events (task summaries, decisions, follow-ups), and temporal context. Runs on local ports (39300-39399) for service discovery.

**Key insight for soma**: Pieces is the **most architecturally ambitious "context layer" product** in the developer space. The LTM-2.7 engine captures OS-level workflow context and exposes it via MCP to any AI tool. This is the "unified context layer" vision applied to developer workflows. **The MCP integration pattern is critical**: Pieces doesn't try to be the AI — it captures and serves context to whatever AI the user chooses. For soma, this validates the architecture of "structured knowledge graph that serves as context for AI" rather than "AI tool that happens to have notes."

**Limitations**: Developer-only. No general knowledge management. Context capture is passive (workflow events), not active (user-created knowledge). No graph model — timeline-based. $pricing for teams.

### Continue.dev

**Core concept**: Open-source AI coding assistant that reads across your entire codebase with customizable context providers.

**How it handles local files**: Indexes entire codebase using embeddings calculated locally (transformers.js). Stores embeddings in `~/.continue/index`. Repository mapping for codebase structure understanding. File exploration, code search, and git integration as built-in tools.

**AI capabilities**: Any LLM (local or cloud). Agent mode for autonomous coding tasks. Custom Code RAG for enterprise-scale codebase search. MCP integration for external context sources. Context providers for extensibility.

**Data model**: Vector embeddings of code files + repository structure map. Context providers pull from multiple sources (files, docs, web, git history). No persistent knowledge graph.

**Key insight for soma**: Continue's **context provider abstraction** is elegant: any source of information can be wrapped as a context provider and injected into AI conversations. The MCP integration means Continue can consume context from any MCP server (including, potentially, soma). The lesson: **being a good context provider is as valuable as being a good context consumer**.

**Limitations**: Code-only. No general knowledge management. No persistent knowledge. Context is ephemeral (per-session). Open source but complex configuration.

### Warp

**Core concept**: AI-powered terminal that understands your development context. Moving toward "Agentic Development Environment."

**How it handles local files**: Universal Input with `@` to search and attach files. Views file structure, can open and edit files. Indexes codebases for richer context (120K+ codebases indexed in 2025).

**AI capabilities**: Multiple LLM support. MCP server integration (Linear, Figma, Slack, Sentry). **Warp Drive** — shared team knowledge store with semantic indexing. AI searches Warp Drive content when answering questions.

**Data model**: Warp Drive is a team knowledge base with semantic indexing. Blocks (command groups) as the terminal UI unit. No graph model.

**Key insight for soma**: **Warp Drive** is interesting — it's a shared, semantically-indexed knowledge store specifically for team context. When AI answers a question, it searches Warp Drive first. This is "institutional memory as AI context" — the same pattern soma could provide for personal knowledge.

**Limitations**: Terminal-only. Developer-focused. No general knowledge management.

---

## Category 5: Browser-Based OS / Workspace

### Arc Browser (Sunset)

**Core concept**: "Browser as OS" — reimagine the browser as a workspace with Spaces, Easels, and a vertical sidebar replacing traditional tabs.

**Status**: Sunset announced in 2025. The Browser Company shifted focus to **Dia** (new AI browser). Arc is maintained only for Chromium/security updates. The Browser Company was acquired by Atlassian in 2025.

**How it handled local files**: Did not. Arc was purely web-based.

**Key features before sunset**: Spaces (workspace containers), Easels (collaborative canvases for screenshots and URLs), Boosts (custom CSS/JS per site), vertical sidebar, split view.

**Key insight for soma**: Arc's rise and fall teaches two lessons: (1) The "browser as OS" vision resonated strongly — users loved Spaces and the sidebar-first interface. (2) But a browser is a **distribution layer**, not a **knowledge layer**. Arc organized web pages but couldn't understand or connect the knowledge within them. Dia (the successor) aims to add AI understanding. Soma as a browser sidebar already has the distribution advantage — and adds the knowledge graph that Arc lacked.

**Limitations**: Now dead as an active product. Never handled local files. No knowledge graph. No AI (was planned). The lesson: beautiful UI isn't enough without a data model.

### SigmaOS

**Core concept**: macOS-only productivity browser with task-based workspaces, vertical tabs, and built-in AI assistant.

**How it handles local files**: Does not. Web-only.

**AI capabilities**: Built-in AI assistant "Airis" for page summarization, question answering, and content creation. Context-aware within the current browsing session.

**Key insight for soma**: SigmaOS attempted to make browsing more organized through workspaces and task-based tab management. Reviews praise the concept but criticize reliability. The lesson: **browser-level workspace organization is desired but insufficient** — without persistent knowledge and a data model, it's just fancy tab management.

**Limitations**: macOS-only (WebKit). Buggy and unreliable per user reviews. No knowledge graph. Limited AI. No file integration. Small team, uncertain future.

### Sidekick Browser (DEAD)

**Status**: Sunset effective August 3, 2025. Did not achieve sustainable growth.

**Key features before sunset**: App sidebar integration (Slack, Gmail, etc.), multi-account support, workspaces, built-in task manager, Pomodoro timer, anti-tracking, sessions (tab groups).

**Key insight for soma**: Sidekick attempted to be a "work OS" browser by integrating SaaS apps into a sidebar. It failed commercially, suggesting that **aggregating existing apps is not enough value** — users need something the individual apps can't provide (which is: understanding and connecting information across them).

---

## Category 6: Emerging "AI OS" / "Second Brain + AI"

### Granola

**Core concept**: AI meeting notes that layer on top of existing tools. "The AI notepad for people in back-to-back meetings." Recently raised $125M at $1.5B valuation (March 2026).

**How it handles local files**: Granola captures audio directly from the device's audio output — no meeting bot joins the call. Transcription is local-first. Supports Zoom, Google Meet, Teams, Webex, Slack Huddles, and any app that outputs audio.

**AI capabilities**: Post-meeting enhancement: combines user-typed notes with full audio context to produce structured summaries, action items, decisions, and key quotes. **Recipes** — saved AI prompts by domain experts that process meeting notes through specific lenses (Due Diligence, Sprint Retro, etc.). Granola Chat for querying meeting history. Multiple model support (Claude, GPT, Gemini).

**Data model**: Meeting notes organized by calendar event. Folders and Spaces for team organization. Personal and Enterprise APIs. **MCP integration** — meeting notes can feed directly into AI-powered workflows via the Model Context Protocol.

**Key insight for soma**: Granola's explosive growth ($1.5B valuation) validates a crucial pattern: **AI that augments existing workflows, not replaces them**. Granola doesn't change how you meet — it layers intelligence on top. The **Recipes** concept (domain-specific AI prompts that process your content) maps directly to soma's planned Command Nodes. The MCP integration means Granola's meeting context can flow into other tools — soma could consume this context. Also noteworthy: Granola's output feeds into CRMs, Notion, Slack — it's a **context producer**, not a walled garden.

**Limitations**: Meeting-specific (not general knowledge). No knowledge graph. No file integration. Context is temporal (organized by meeting, not by topic). Cloud processing for AI enhancement.

### Dust

**Core concept**: Build custom AI assistants connected to company data. "A team of specialized agents beats one generalist."

**How it handles local files**: Does not handle local files. Connects to SaaS tools (Slack, Google Drive, Notion, Confluence, GitHub) via connectors. All processing cloud-based.

**AI capabilities**: Custom AI agents without code. RAG over company data. Multiple model support. Table Query for quantitative analysis. Multi-modal (image analysis, data visualization). Agents can search, execute actions, chain operations, and run on schedules. MCP integration for extending agent capabilities.

**Data model**: Connected data sources + custom agent configurations. Agents have specific knowledge scopes, tools, and model assignments. Permission-aware retrieval (respects source permissions).

**Key insight for soma**: Dust validates the **"specialized agents over general assistant"** pattern. Each agent has a specific role with specific knowledge and tools. This maps to soma's vision of Command Nodes as specialized AI capabilities. Dust also shows that **MCP is becoming the standard integration layer** for AI context. The key difference: Dust is enterprise/team, soma is personal. Dust is cloud-dependent, soma is local-first.

**Limitations**: Enterprise-only (no personal/free tier). Cloud-dependent. No local data. $29/user/mo minimum. Read-and-respond only — limited action capabilities compared to pure automation tools.

### Fabric (by Daniel Miessler)

**Core concept**: Open-source framework for augmenting humans using AI. A modular system of crowdsourced AI prompts ("patterns") for specific tasks.

**How it handles local files**: Fabric itself doesn't index or manage files. It stores configuration in `~/.claude/` directories. Skills encode domain expertise. Memory system maintains session, work, and learning tiers.

**AI capabilities**: 200+ specialized prompt patterns for tasks like summarizing, extracting insights, creating outlines, analyzing security reports. CLI-based execution. Multi-model support. MCP server integration for extending capabilities. Community-contributed patterns.

**Related concept — Personal AI Infrastructure (PAI)**: Daniel Miessler's broader vision of a unified, modular system for building deeply personalized AI assistants. Seven components: Intelligence, Context, Personality, Tools, Security, Orchestration, Interface. Key insight: "The intelligence layer doesn't change. The interface is just a window into it."

**Data model**: Patterns (prompt templates) are the atomic unit. Skills encode domain expertise. Memory has three tiers (session, work, learning). No knowledge graph.

**Key insight for soma**: Fabric's **PAI framework** articulates the most sophisticated vision of personal AI infrastructure. The separation of Intelligence/Context/Personality/Tools/Security/Orchestration/Interface is a clean architecture. For soma, the key insight is the **Context** layer: "multi-tiered memory capturing who you are, your work, and lessons learned." Soma's node graph IS this context layer — structured, persistent, user-owned. Fabric provides the AI patterns; soma could provide the context and memory that makes those patterns personal.

**Limitations**: CLI-only (developer tool). No GUI. No knowledge graph. No persistence beyond file system. No collaboration. Requires technical setup. Patterns are text templates, not structured data.

### Khoj

**Core concept**: Open-source AI second brain. Self-hostable. Get answers from the web or your docs.

**How it handles local files**: Ingests PDF, Markdown, Org-mode, Word, image files and Notion pages. Files are parsed, chunked, and stored as semantic embeddings. Also syncs with Obsidian and Emacs vaults.

**AI capabilities**: Any LLM (local via Ollama or cloud). Semantic search across all documents. Custom agents with specific knowledge, persona, and tools. Scheduled automations (recurring AI tasks). Deep research capability. Python code execution for data analysis and reports.

**Data model**: Vector embeddings of document content. No explicit knowledge graph (though semantic similarity creates implicit connections). Automation schedules stored as configurations. Agent definitions with custom knowledge scope.

**Key insight for soma**: Khoj demonstrates the **"RAG over personal documents"** pattern at its simplest. Upload your files, ask questions, get answers grounded in your content. The automation feature (scheduled AI tasks) is interesting — imagine soma nodes that trigger AI analysis on a schedule. Khoj's scalability claim (from on-device to cloud-scale) is worth noting for soma's architecture planning.

**Limitations**: No knowledge graph (just vector search over chunks). No structured data model. UI is basic. Self-hosting requires technical expertise. No real-time collaboration. File support is limited to specific formats.

### Quivr

**Core concept**: Open-source RAG platform for building AI assistants over your documents.

**How it handles local files**: Upload any file (PDF, TXT, Markdown). Also connects to Google Drive, Notion, GitHub, Intercom, HubSpot, PostgreSQL via integrations. Uses Megaparse for file ingestion.

**AI capabilities**: RAG with any LLM (OpenAI, Anthropic, Mistral, Gemma). Customizable RAG pipeline with internet search, tools, and custom logic. Claims 50,000+ users.

**Data model**: Vector embeddings in configurable vector stores (PGVector, Faiss). No knowledge graph. "Brains" (databases) as organizational containers.

**Key insight for soma**: Quivr has evolved from a personal second brain to an **opinionated RAG framework** for building AI apps. The lesson: pure "upload and chat" products struggle to differentiate. The value is in the **structure and organization** of knowledge, not just the ability to search it. Soma already has this structure (node graph + supertags + field entries).

**Limitations**: No knowledge graph. No structured data model. "Upload and chat" ceiling. Self-hosting complexity. UI/UX is secondary to the RAG engine.

---

## Additional Notable Products (Discovered During Research)

### Tana (Reference Competitor)

Soma's primary inspiration. Tana's AI features have matured significantly:
- Multiple LLM support (GPT 5.2, Claude, Gemini 3 Flash)
- AI chat integrated on any node, started with Space key
- Live transcription on any node
- AI agents tailored to use cases
- Supertags were "made with AI in mind from the start"

Tana remains the gold standard for structured knowledge graphs with AI integration. Soma's differentiation: local-first (Tana is cloud), browser-native (Tana is web app), and Chrome sidebar integration.

### Reflect Notes

Notable for being the first note-taking app where AI claims to understand the entire note graph structure (not just individual note content). AI leverages backlinks and connections for synthesis. Worth watching as an example of graph-aware AI.

### Saner.AI

AI-first note-taking that auto-organizes captured content. Chrome extension captures web content. AI suggests tags and surfaces related notes. Represents the "minimal friction capture + AI organization" approach.

### Obsidian + AI Plugins

Obsidian with Smart Connections and Copilot plugins approximates the "local-first knowledge + AI" vision using flat Markdown files + embeddings. Smart Connections finds semantically related notes. Copilot enables vault-wide Q&A. All local, all open. Key limitation: flat files with no typed schema.

### Notion 3.0 with AI Connectors & Agents

Notion's evolution to AI Agents (September 2025) + Enterprise Search with connectors across Slack, Google Drive, GitHub represents the enterprise "unified workspace + AI" play. Connectors are read-only (can search but not act). Important for validating the connector pattern, but cloud-dependent and enterprise-focused.

### Glean (Enterprise)

Enterprise AI search with 100+ connectors and a sophisticated knowledge graph that personalizes to each company's language patterns. Their evaluation showed Glean answers preferred 1.9x more than ChatGPT for enterprise questions. Validates that **knowledge graph + search > raw LLM** for contextual answers.

---

## Synthesis: What This Means for Soma

### The Landscape Gap

```
                    Structured Knowledge Graph
                           ↑
                   Tana ●  | ● soma (target)
          Capacities ●     |
              Anytype ●    |
                           |
     Heptabase ●           |        ● Pieces (developer context)
                           |
  Obsidian+AI ●            |             ● Dust (enterprise)
                           |
       Reflect ●           |                    ● Glean
                           |
         Mem.ai ●          |             ● Notion Connectors
                           |
   ←───────────────────────┼──────────────────────────→
   Local/Personal                          Cloud/Enterprise
                           |
   Screenpipe ●            |
                           |
   DEVONthink ●            |
                           |
     Raycast ●             |
                           |
  Apple Intelligence ●     |
                           |
                           ↓
                    Unstructured Capture
```

### Five Key Insights

**1. MCP is the universal connector.**
The Model Context Protocol appears in Pieces, Granola, Dust, Eagle, Continue.dev, Warp, Hookmark, Heptabase, Screenpipe, and more. It's becoming the standard way for knowledge stores to expose context to AI. **Soma should implement an MCP server** that exposes its node graph as context to any AI tool. This is potentially more impactful than building AI features directly into soma.

**2. "Context provider" is a more defensible position than "AI consumer."**
Products that provide structured context to AI (Pieces, Granola, Glean) are thriving. Products that merely consume AI APIs for chat (Mem, Quivr) struggle to differentiate. Soma's structured knowledge graph is a natural **context provider** — the question is how to expose it.

**3. The "everything is an object/node" model is winning.**
Tana, Capacities, and Anytype all converge on typed objects with properties and connections. This model is strictly superior to flat notes (Obsidian), flat files (DEVONthink), or timeline captures (Screenpipe). Soma is already here.

**4. Local-first + AI is the hardest combination — and the most valuable.**
Apple Intelligence shows the value; Screenpipe shows the demand; Anytype shows the architecture. But nobody has combined local-first with a structured knowledge graph with deep AI integration. This is soma's opportunity.

**5. Specialized AI beats general AI.**
Dust's "team of specialized agents," Granola's "Recipes," Fabric's "Patterns," Tana's "AI agents per use case" all validate the same insight: users want AI that understands their specific context, not a generic chatbot. Soma's Command Nodes (AI commands stored as nodes with specific configurations) align perfectly.

### Competitive Positioning

**Soma's unique position**: The only product attempting to combine:
1. Tana-grade structured knowledge graph ("everything is a node")
2. Local-first with CRDT sync (like Anytype, but more practical)
3. Browser sidebar native (no separate app to maintain)
4. AI integration via the graph (not bolted on)

**Nearest competitors and differentiators**:
- **vs Tana**: soma is local-first and browser-native; Tana is cloud-only web app
- **vs Anytype**: soma has richer AI integration planned; Anytype's AI is still exploratory
- **vs Capacities**: soma's node model is more flexible (supertags vs rigid types)
- **vs Pieces**: soma covers general knowledge, not just developer context
- **vs Obsidian+AI**: soma has structured schema (supertags/fields), not just flat files

### Architecture Implications

1. **Implement MCP server early.** Expose soma's node graph as structured context to Claude Code, Cursor, Raycast, and other AI tools. This is low effort, high leverage.

2. **Node graph as AI context layer.** When AI needs to understand a user's knowledge, it queries the node graph — not a vector database of flat text. The graph structure (supertags, field entries, relations) provides richer context than embeddings alone.

3. **Command Nodes = Granola Recipes = Fabric Patterns = Dust Agents.** The pattern is universal: specialized AI configurations stored as first-class objects. Soma's Command Node design is validated by the entire market.

4. **Web content capture is table stakes.** Every product in this space handles web clipping. Soma already has this via the sidebar. The differentiator is what happens after capture: soma turns web content into structured nodes in a knowledge graph.

5. **Don't try to be the AI.** Be the knowledge layer that AI operates on. Apple owns the OS layer. Raycast owns the command layer. Soma should own the **knowledge layer** — the structured, user-owned, local-first graph that gives AI the context it needs.

---

## Sources

### Category 1: Local-First Knowledge + AI
- [Limitless/Rewind - Crunchbase](https://www.crunchbase.com/organization/limitless-ai)
- [Meta acquires Limitless - TechCrunch](https://techcrunch.com/2025/12/05/meta-acquires-ai-device-startup-limitless/)
- [Screenpipe vs Limitless 2026](https://screenpi.pe/blog/screenpipe-vs-limitless-2026)
- [Screenpipe - Official Site](https://screenpi.pe/)
- [Apple Intelligence](https://www.apple.com/apple-intelligence/)
- [Apple Intelligence Foundation Models Tech Report 2025](https://machinelearning.apple.com/research/apple-foundation-models-tech-report-2025)
- [Apple Intelligence Personal Context](https://lannonbr.com/blog/apple-intelligence-personal-context/)
- [Microsoft Recall - Support](https://support.microsoft.com/en-us/windows/retrace-your-steps-with-recall-aa03f8a0-a78b-4b3e-b0a1-2eb8ac48701c)
- [Windows Semantic Indexing](https://www.windowscentral.com/software-apps/windows-11/how-to-get-started-with-semantic-indexing-on-windows-11)
- [Raycast AI](https://www.raycast.com/core-features/ai)
- [Raycast CEO Interview](https://www.techbuzz.ai/articles/raycast-ceo-ai-should-do-more-than-chat)

### Category 2: File-Based Knowledge Management + AI
- [DEVONthink AI](https://www.devontechnologies.com/apps/devonthink/ai)
- [DEVONthink Local AI](https://www.devontechnologies.com/blog/20250513-local-ai-in-devonthink)
- [DEVONthink 4 Review - MacStories](https://www.macstories.net/reviews/ai-adds-a-new-dimension-to-devonthink-4/)
- [Hazel Overview - Noodlesoft](https://www.noodlesoft.com/manual/hazel/hazel-overview/)
- [Hookmark - Official Site](https://hookproductivity.com/)
- [Hookmark Integration Architecture](https://hookproductivity.com/help/integration/)
- [Hookmark Developer API](https://hookproductivity.com/help/integration/information-for-developers-api-requirements/)
- [Eagle 5.0 Teaser](https://en.eagle.cool/blog/post/eagle5-teaser)
- [Eagle Official](https://en.eagle.cool/)

### Category 3: Unified Workspace
- [Capacities Product](https://capacities.io/product/)
- [Capacities Object Types](https://docs.capacities.io/reference/content-types)
- [Capacities Properties](https://docs.capacities.io/reference/properties)
- [Anytype February 2026 Update](https://blog.anytype.io/february-community-update-2026/)
- [Anytype Object Types - DeepWiki](https://deepwiki.com/anyproto/anytype-heart/3.1-object-types-and-relations)
- [Anytype Local-First Architecture](https://hilton.org.uk/blog/anytype-local-first)
- [Heptabase Official](https://heptabase.com/)
- [Heptabase Changelog 2025](https://wiki.heptabase.com/changelog/2025)
- [Mem.ai Future](https://get.mem.ai/blog/the-future)

### Category 4: Developer Context
- [PiecesOS Architecture](https://docs.pieces.app/products/core-dependencies/pieces-os)
- [Pieces MCP](https://docs.pieces.app/products/mcp/get-started)
- [Continue.dev Codebase Awareness](https://docs.continue.dev/guides/codebase-documentation-awareness)
- [Continue.dev Context Providers](https://docs.continue.dev/customize/custom-providers)
- [Warp Features](https://www.warp.dev/all-features)
- [Warp 2025 Review](https://www.warp.dev/blog/2025-in-review)

### Category 5: Browser-Based OS
- [Arc Browser - Wikipedia](https://en.wikipedia.org/wiki/Arc_(web_browser))
- [SigmaOS](https://sigmaos.com/)
- [Sidekick Browser - Product Hunt](https://www.producthunt.com/products/sidekick-browser)

### Category 6: AI OS / Second Brain
- [Granola $125M Raise - TechCrunch](https://techcrunch.com/2026/03/25/granola-raises-125m-hits-1-5b-valuation-as-it-expands-from-meeting-notetaker-to-enterprise-ai-app/)
- [Granola Official](https://www.granola.ai/)
- [Dust Official](https://dust.tt/)
- [Dust Docs](https://docs.dust.tt/docs/welcome-to-dust)
- [Fabric GitHub](https://github.com/danielmiessler/Fabric)
- [Personal AI Infrastructure - Daniel Miessler](https://danielmiessler.com/blog/personal-ai-infrastructure)
- [Khoj GitHub](https://github.com/khoj-ai/khoj)
- [Khoj Docs](https://docs.khoj.dev/)
- [Quivr GitHub](https://github.com/QuivrHQ/quivr)

### Additional
- [Tana Knowledge Graph](https://tana.inc/knowledge-graph)
- [Tana AI](https://tana.inc/docs/tana-ai)
- [Reflect Notes AI](https://downloadchaos.com/blog/reflect-notes-ai-features-note-taking-innovation)
- [Notion 3.0 Agents](https://www.notion.com/releases/2025-09-18)
- [Glean Knowledge Graph](https://www.glean.com/blog/enterprise-ai-knowledge-graph)
- [Stanford OpenJarvis](https://www.marktechpost.com/2026/03/12/stanford-researchers-release-openjarvis-a-local-first-framework-for-building-on-device-personal-ai-agents-with-tools-memory-and-learning/)
- [Obsidian Smart Connections](https://github.com/brianpetro/obsidian-smart-connections)
