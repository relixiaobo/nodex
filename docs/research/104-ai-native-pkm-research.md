# AI-Native PKM Deep Research

> Research date: 2026-03-09
> Focus: Products built from the ground up around AI for personal knowledge management

---

## Product Analysis

### 1. Napkin (napkin.one)

**Core AI Proposition**: AI as a "thinking companion" — not a productivity tool but a serendipity engine. The thesis is that the problem isn't capturing ideas, it's reconnecting with them at the right moment.

**How AI Interacts with Knowledge**:
- Every note is automatically tagged and connected to previous notes via semantic NLP
- Bidirectional links form automatically without user intervention
- Notes are presented in a physics simulation — related notes attract each other, unrelated notes repel. This creates a visual "swarm of thoughts" that spatially encodes relevance

**Proactive AI Features**:
- **Smart Resurfacing**: Old thoughts resurface automatically based on current thinking context
- **Daily Digest**: Sends daily summaries of resurfaced ideas and fresh connections
- **Auto-tagging**: Tags suggest themselves while typing

**Automation vs Control Balance**: Leans heavily toward automation. The user's job is to dump thoughts in; Napkin handles connection, organization, and resurfacing. There is no folder system, no manual tagging required.

**User Reception**: Positive. Reviewers describe it as "a creativity partner" and note the auto-connection feature provides genuine serendipitous moments. Criticism: weak on collaboration, limited integrations.

**Business Model**: Freemium. Currently generous free beta. Paid plans not yet fully materialized.

**Key Insight for soma**: Napkin proves that **auto-connection without user effort** is the highest-value AI feature in PKM. Users don't want to be asked "how should I connect this?" — they want to be surprised by connections they didn't see.

---

### 2. Fabric (fabric.so)

**Core AI Proposition**: "Death to organizing." AI should eliminate the entire concept of manual organization — no folders, no tags, no databases. You throw things in; AI understands what they are and how they relate.

**How AI Interacts with Knowledge**:
- Analyzes everything uploaded (documents, images, links, screenshots) and labels automatically
- Groups related content without user-created folder structures
- AI-powered semantic search ("ask like you'd ask a person")
- Browser extension + mobile app for instant capture

**Proactive AI Features**:
- Automatic grouping of related content
- AI assistant can answer questions across your entire knowledge base
- Summaries generated on save

**Automation vs Control Balance**: Maximally automated. The design philosophy explicitly rejects manual organization. This is the extreme end of the "AI does it all" spectrum.

**User Reception**: Polarized. Power users who love building systems (Notion/Obsidian crowd) find it too opaque — "where did my stuff go?" Users who are overwhelmed by organizational overhead find it liberating. The key complaint: when AI organizes for you, you lose the mental model of where things are.

**Business Model**: Freemium with subscription tiers.

**Key Insight for soma**: Fabric demonstrates both the appeal and the danger of full automation. The "death to organizing" promise attracts users tired of maintenance overhead, but the loss of spatial/structural mental models makes some users anxious. **There's a sweet spot between "organize everything for me" and "I need to understand my own system."**

---

### 3. Limitless (formerly Rewind) — acquired by Meta, Dec 2025

**Core AI Proposition**: Capture everything you hear, make it searchable and actionable. The insight: the bottleneck isn't note-taking ability, it's the cognitive cost of note-taking during conversations.

**How AI Interacts with Knowledge**:
- Wearable pendant records all conversations (with consent tap)
- Audio transcribed to searchable text in the cloud
- AI summarizes discussions, extracts key points, suggests action items
- Natural language queries across conversation history ("What did Sarah say about the project timeline?")

**Proactive AI Features**:
- Automatic meeting summaries with action items
- Speaker identification and attribution
- Post-meeting recap generation

**Automation vs Control Balance**: Capture is fully automated (always-on recording). Analysis is on-demand but with proactive summary generation. Users control what gets recorded via physical tap.

**User Reception**: Strong among professionals with meeting-heavy schedules and people with ADHD/memory challenges. Key criticism: **"It doesn't know who I am beyond what I've said recently — doesn't understand my relationships, goals, or personal context."** The AI excels at recall but fails at synthesis and deeper understanding.

**Business Model**: Hardware ($99 pendant) + subscription for full features. Acquired by Meta for integration into Meta's AI wearables ecosystem.

**Key Insight for soma**: Limitless validates that **ambient capture** (reducing friction to zero) is powerful, but reveals that **capture without context is shallow**. Users want the AI to understand the significance of what it captures, not just store and retrieve it. This is the "memory prosthetic" vs "thinking partner" distinction.

---

### 4. Personal AI (personal.ai)

**Core AI Proposition**: Create a "digital twin" — an AI trained exclusively on your data that can communicate in your voice, retain your knowledge, and represent you.

**How AI Interacts with Knowledge**:
- Builds "Personal Language Models" (PLMs) per user
- Memory Stacks: structured collections of your knowledge that the AI learns from
- Integrates data from social media, documents, web pages, conversations
- The AI can respond to others on your behalf in "Lounges" (group chats)

**Proactive AI Features**:
- AI learns from your messaging patterns and proactively assists in conversations
- Can represent you in group discussions when you're unavailable
- Continuous learning from all interactions

**Automation vs Control Balance**: High automation in learning, but user controls what data feeds into the model. The "digital twin" framing gives users a sense of ownership — "it's learning to be me" rather than "it's organizing my stuff."

**User Reception**: Niche but enthusiastic. Professionals (doctors, lawyers, consultants) report significant time savings (50% in some cases). General consumer adoption is limited — the "digital twin" concept is compelling but the utility for personal PKM is unclear beyond professional use cases.

**Business Model**: Subscription (personal + enterprise tiers). Enterprise focus on professional digital twins.

**Key Insight for soma**: Personal AI's most interesting contribution is the concept that **AI should model your thinking patterns, not just your data**. The "digital twin" is an extreme version of this, but the underlying principle — AI that understands your cognitive style, not just your content — is powerful.

---

### 5. Saga (saga.so)

**Core AI Proposition**: AI as an accelerator for a traditional workspace. Not "AI-first" in the Napkin/Fabric sense, but "AI-enhanced" — a clean workspace with AI bolted on well.

**How AI Interacts with Knowledge**:
- Automatic page linking reveals relationships across the knowledge base
- AI summarization of long documents
- Translation across 20+ languages
- AI-powered writing assistance within documents
- Uses OpenAI and Anthropic models

**Proactive AI Features**:
- Auto-linking surfaces related pages
- AI suggests connections between documents
- Lightweight compared to Napkin/Fabric — more "helpful nudges" than "autonomous organization"

**Automation vs Control Balance**: Conservative. Users maintain full control over structure. AI assists rather than takes over. This is the "Notion with better AI" positioning.

**User Reception**: Positive for teams. The workspace is fast and clean. AI features are seen as useful but not transformative. Users who come from Notion appreciate the speed; users looking for AI-native experiences find it incremental.

**Business Model**: Freemium with team tiers. Free for up to 3 collaborators.

**Key Insight for soma**: Saga shows that **"AI-enhanced" can be a safer bet than "AI-native"** for user adoption. Users trust tools where they understand the structure and AI provides optional acceleration. The risk: in a market where Napkin and Fabric promise magical auto-organization, "AI as a helper" may feel underwhelming.

---

### 6. Browser-Adjacent AI Knowledge Tools

**Recall (getrecall.ai)**:
- Browser extension that saves and auto-summarizes web content into a knowledge graph
- "Augmented Browsing": connections from your knowledge base resurface as you browse new content
- Graph View 2.0 (Jan 2026): Path Finder shows shortest connection between any two concepts
- **Key feature**: knowledge appears in context while browsing — no need to switch to a separate app

**Glasp**:
- Social web highlighter — highlight text on web pages, build a shared knowledge base
- "AI Clone" trained on your highlights provides personalized recommendations
- Social dimension: follow others' highlights, discover through community
- 1M+ users. Free.

**Dia (by The Browser Company, acquired by Atlassian)**:
- AI-first browser with built-in sidebar AI for summarizing, Q&A, and research
- Contextual memory across browsing sessions
- Positioned as "AI for average consumers who don't want to rethink browsing"
- Arc (predecessor) entering maintenance mode; notes being deprecated

**Mem (mem.ai)**:
- Mem 2.0 (Oct 2025): complete rebuild as "AI Thought Partner"
- "Heads Up" feature: surfaces related notes while you work — proactive, contextual
- Voice Mode: brain dump via voice, Mem organizes into structured notes
- Agentic Chat: AI can create, edit, and organize notes — not just answer questions
- Semantic search by meaning, not keywords

**Key Insight for soma**: The browser is the capture point. Tools that live inside the browser (Recall, Glasp) or are the browser (Dia) have a fundamental UX advantage for capture. Mem's "Heads Up" feature — surfacing relevant existing knowledge while you work — is the most compelling proactive AI pattern for a sidepanel tool.

---

## Market Analysis: AI-Native PKM

### What the Market Says

The PKM market is splitting into three tiers:

1. **AI-Native** (Napkin, Fabric, Mem 2.0): AI is the organizing principle. No folders, no manual structure. "Just capture, we handle the rest."

2. **AI-Enhanced** (Saga, Notion AI, Obsidian + plugins): Traditional structure with AI as accelerator. User controls organization; AI helps with search, summarization, and connection.

3. **AI-Ambient** (Limitless, Recall, Glasp): AI operates at the capture layer, reducing friction to near-zero. Organization is secondary to never losing information.

### Common Failure Modes

1. **The Digital Graveyard**: Users capture everything but never revisit. AI-powered capture makes this worse — zero-friction capture means even more unreviewed content. "We have more tools for capturing knowledge than ever, yet feel less in control of understanding."

2. **The Organization Trap**: Users spend more time maintaining the system than using it. Notion is the poster child — databases, views, templates, relations become a full-time job. AI-native tools try to solve this but introduce a new problem: opacity.

3. **The Opacity Problem**: When AI organizes for you, you lose your mental model. You can't navigate by memory because you didn't build the structure. Search becomes the only way in, and if search fails, everything is lost. This is Fabric's core risk.

4. **The Noise Problem**: Proactive surfacing can become annoying. "Here's a related note!" — if the relevance threshold is too low, it's worse than no surfacing at all. Users report that poorly calibrated proactive features train them to ignore AI suggestions entirely.

5. **The Shallow AI Problem**: Most "AI-powered" PKM tools stop at summarization + search. These are useful but not transformative. Limitless users complain: "It doesn't understand my context, just my words." The gap between "find that note" and "understand what I'm thinking" is enormous.

6. **The Productivity Trap**: Building and maintaining a second brain becomes a hobby that substitutes for actual thinking. AI tools can amplify this — now you're not just organizing, you're training your AI, reviewing its connections, correcting its summaries. The meta-work expands.

7. **The Cognitive Outsourcing Risk**: AI that summarizes, connects, and resurfaces can cause users to skip the cognitive processing that creates real understanding. "Letting the AI write the summary and assuming you've absorbed the knowledge" — the illusion of knowledge without comprehension.

### What Users Actually Want

Based on user feedback across all products:

1. **Synthesis, not storage.** The most requested capability is: "I have 200 notes on topic X — tell me what I actually think about it." Pattern recognition across a corpus, not just retrieval.

2. **Contextual relevance at the right moment.** Mem's "Heads Up" and Recall's "Augmented Browsing" hit this: surface related knowledge while the user is actively working on something related, not in a daily digest they'll ignore.

3. **Confidence in completeness.** When users search, they want to know they've found everything relevant. Current AI search is good at finding some results but terrible at communicating "this is everything" vs "there might be more."

4. **Effortless capture, thoughtful retrieval.** Capture should be zero-friction (browser extension, voice, quick note). But retrieval should be rich — not just the note, but its context, connections, and relevance to the current task.

5. **Transparency in AI decisions.** Users want to understand why the AI surfaced something or made a connection. "Because these notes share the concept of X" is more trustworthy than a mysterious relevance score.

6. **User control as the default, AI assistance as opt-in.** The most trusted tools let users build their own structure and use AI to enhance it, rather than having AI impose structure. This conflicts with the "death to organizing" pitch but aligns with actual long-term user behavior.

### Emerging Patterns

**Pattern 1: Agentic Knowledge Management**
The next evolution of PKM where AI assistants proactively monitor your knowledge base, detect changes, and autonomously execute tasks based on inferred intent. Not just "find this note" but "I noticed you're working on project X — here are 5 notes from last quarter that are relevant, and 2 of them contradict each other."

**Pattern 2: The Browser as the Knowledge Layer**
Recall, Glasp, and Dia all converge on the browser as the primary knowledge surface. For a sidepanel tool like soma, this is directly relevant: the browser is where reading happens, and the sidepanel is the natural place for knowledge to live alongside browsing.

**Pattern 3: Voice-First Capture**
Limitless and Mem 2.0 both emphasize voice as the lowest-friction capture method. Brain dumps via voice, transcribed and structured by AI. This matters because the gap between "having a thought" and "writing it down" is where most knowledge is lost.

**Pattern 4: Knowledge Graph as Primary Interface**
Recall's Graph View 2.0, Napkin's physics simulation, and Obsidian's graph view all point to visual knowledge graphs as a compelling way to understand large knowledge bases. But user feedback is mixed — graphs are beautiful but not always actionable.

**Pattern 5: Social/Shared Knowledge**
Glasp's social highlighting and Personal AI's "Lounge" conversations suggest that knowledge isn't purely personal. Shared annotation, collaborative knowledge bases, and AI that operates across multiple people's knowledge are emerging.

**Pattern 6: The "Thought Partner" Framing**
Mem 2.0 calls itself an "AI Thought Partner." Napkin calls itself an "AI Thinking Companion." This framing shift — from "tool" to "partner" — reflects user desire for AI that engages with their thinking process, not just their data. The difference: a tool retrieves; a partner challenges, suggests, and connects.

---

## Implications for soma

### What Works (Proven by Market)

1. **Zero-friction capture in the browser** — soma's sidepanel position is a natural advantage. Recall and Glasp prove this works.

2. **Automatic connection without user effort** — Napkin's auto-linking and Recall's knowledge graph show users value discovery of connections they didn't manually create.

3. **Contextual surfacing while working** — Mem's "Heads Up" and Recall's "Augmented Browsing" are the highest-value proactive AI features. For soma, this means: "While you're reading this webpage, here are your notes that relate to it."

4. **Semantic search by meaning** — Every successful AI-native tool offers this. Keyword search is table stakes; meaning-based search is the expectation.

### What Doesn't Work (Proven by Market)

1. **Full auto-organization without user mental model** — Fabric's "death to organizing" attracts users but creates anxiety about "where is my stuff?" soma's node-tree structure gives users a visible, navigable structure — this is a feature, not a limitation.

2. **Proactive features with poor relevance** — Low-quality surfacing trains users to ignore AI. Any proactive feature needs a high relevance threshold and a way to dismiss/tune.

3. **AI that only summarizes** — Summarization is commodity. The value is in synthesis (connecting across notes), not compression (making one note shorter).

4. **Daily digests and notification-based engagement** — Users overwhelmingly prefer in-context surfacing over out-of-context notifications.

### Strategic Positioning

soma occupies a unique position: **structured knowledge management (Tana-style node trees) + browser-native capture (sidepanel) + AI**. This combines the user control and mental model of Tier 2 (AI-Enhanced) tools with the browser-native capture advantage of Tier 3 (AI-Ambient) tools. The opportunity is to add Tier 1 (AI-Native) connection and surfacing capabilities without sacrificing the structural transparency that makes Tana's model powerful.

The thesis: **AI should enhance the node tree, not replace it.** Auto-connect nodes, surface relevant branches, synthesize across subtrees — but always within a structure the user can see, navigate, and trust.

---

Sources:
- [Napkin AI Review (2025)](https://aitoolinsight.com/napkin-ai-review/)
- [Napkin - AI Thinking Companion](https://www.toolpilot.ai/products/napkin)
- [Napkin: Building a swarm of thoughts](https://nesslabs.com/napkin-featured-tool)
- [Napkin.one](https://napkin.one/)
- [Fabric.so Review (2025)](https://aiblogfirst.com/fabric-so-review/)
- [Fabric.so Review - GeniusAITech](https://geniusaitech.com/fabric-so-review/)
- [One Month with Fabric.so](https://medium.com/lets-code-future/one-month-with-fabric-so-the-ai-workspace-that-actually-cleared-my-mind-51720049e9af)
- [Limitless AI: In-Depth Review](https://skywork.ai/skypage/en/Limitless-AI-An-In-Depth-Review-and-Analysis/1976154402840047616)
- [Meta Acquires Limitless | TechCrunch](https://techcrunch.com/2025/12/05/meta-acquires-ai-device-startup-limitless/)
- [Limitless AI Pendant Real-World Review](https://thoughts.jock.pl/p/voice-ai-hardware-limitless-pendant-real-world-review-automation-experiments)
- [The End of Forgetting: Limitless, Rewind, and the Rise of Personal Knowledge AI](https://asktodo.ai/blog/ai-memory-assistants-limitless-rewind-trends-2025)
- [Personal AI - Digital Twins](https://www.personal.ai/insights/ai-digital-twins-the-future-of-personal-knowledge-management)
- [Personal AI - Memory](https://www.personal.ai/memory)
- [Saga AI: 2025 Review](https://skywork.ai/skypage/en/Saga-AI:-My-Ultimate-2025-Review-for-Work,-Law,-and-Creativity/1975258232076824576)
- [Saga.so](https://saga.so/)
- [Recall AI - getrecall.ai](https://www.getrecall.ai/)
- [Recall Graph View 2.0](https://feedback.getrecall.ai/changelog/recall-release-notes-jan-12-2026-graph-view-20-and-much-more)
- [Recall AI In-Depth Review](https://productivematters.substack.com/p/deep-dive-into-recall-ai)
- [Glasp](https://glasp.co/)
- [Dia AI Browser | TechCrunch](https://techcrunch.com/2025/06/11/the-browser-company-launches-its-ai-first-browser-dia-in-beta/)
- [Dia Inherits Arc Features | TechCrunch](https://techcrunch.com/2025/11/03/dias-ai-browser-starts-adding-arcs-greatest-hits-to-its-feature-set/)
- [Mem 2.0 Introduction](https://get.mem.ai/blog/introducing-mem-2-0)
- [Mem AI 2025 Review](https://skywork.ai/skypage/en/Mem-AI-Your-Personal-Knowledge-Engine-in-2025/1976181401534394368)
- [Agentic Knowledge Management: The Next Evolution of PKM](https://www.dsebastien.net/agentic-knowledge-management-the-next-evolution-of-pkm/)
- [The Paradox: Why an AI Enthusiast Avoids AI for Core PKM](https://medium.com/@alekseyrubtsov/the-paradox-why-an-ai-enthusiast-avoids-ai-for-core-pkm-and-learning-a308fed27bd2)
- [Second Brain Productivity Trap](https://www.maketecheasier.com/second-brain-productivity-trap/)
- [From PKM to Personal AI Companion (ACM 2025)](https://dl.acm.org/doi/10.1145/3688828.3699647)
- [State of AI in Knowledge Management 2026](https://1up.ai/blog/state-of-ai-knowledge-management-report/)
- [Top 10 AI Assistants With Memory in 2026](https://www.dume.ai/blog/top-10-ai-assistants-with-memory-in-2026)
