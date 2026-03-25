export interface ChangelogEntry {
  version: string;
  date: string;
  summary: string;
  items: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.3.1',
    date: '2026-03-25',
    summary: 'AI Context + Official Skills + Polish',
    items: [
      // AI Intelligence
      'AI sees what you see — view context injection sends your visible outliner tree to the AI',
      'AI no longer guesses intent from browser tabs — system-reminder treated as background only',
      'Regenerate replays the entire agent turn (all tool calls), not just the last response',

      // Official Skills
      'Official skills auto-update — locked rules sync on every launch, your custom rules preserved',
      'System prompt auto-sync — code-managed defaults update without losing user instructions',

      // Chat UX
      'Unsent draft visible in floating chat bar when drawer is closed',
      'Chat drawer header always visible (no more auto-hide flicker)',
      'Streaming cursor stays pinned at bottom (no jump on tool group collapse)',
      'Chat rename buttons always work (try-finally error handling)',
      'Onboarding simplified — "Connect an AI provider" replaces old Welcome screen',
      'Placeholder text repositioned as general agent ("Ask anything…")',

      // Settings & Icons
      'New three-color cube icon (sage green / warm amber / brick red)',
      'AI Debug moved under AI group in Settings',
      'Startup page setting removed (always outliner + today)',
      'Chat drawer uses white background to distinguish from outliner',

      // Dependencies
      'pi-ai / pi-agent-core upgraded to 0.62.0 (new models, OpenRouter thinking)',
    ],
  },
  {
    version: '0.3.0',
    date: '2026-03-24',
    summary: 'Chat Drawer + Node Embed',
    items: [
      // Layout
      'Chat Drawer — Outliner always visible, AI Chat as bottom drawer with drag-to-resize',
      'Chat and Outliner use distinct backgrounds (white vs warm paper) for clear visual separation',
      'Auto-hide drawer header on scroll — reveals on scroll up or hover, stays visible on open',

      // Node Embed
      'Redesigned node embed in chat — header with node name + children in bordered panel',
      'Full outliner interaction inside chat embeds — edit, expand/collapse, field pickers all work',
      'Embed max height 40vh with independent scroll, empty state placeholder',
      'Chevron circular background — sits on panel border line for compact layout',

      // Interaction Fixes
      'Focus isolation — editing in chat embed does not affect main outliner focus',
      'Escape priority — closing a dropdown does not close the chat drawer',
      'Click-outside safety — clicking portal dropdowns does not dismiss the drawer',
      'Session history and model menu use portal-based dropdowns (no overflow clipping)',

      // AI Tools
      'AI tools use Tana Paste text format — more reliable node creation and editing',
      'AI can create search nodes, merge duplicate nodes, and batch delete',
      'Custom model support — configure any OpenAI-compatible provider with base URL + API key',
      'Tool call groups always collapsed for cleaner chat UI',
    ],
  },
  {
    version: '0.2.0',
    date: '2026-03-20',
    summary: 'Think with your AI',
    items: [
      // AI Thinking Partner
      'AI Chat as your thinking partner — challenge ideas, question assumptions, find connections',
      'Chat as default start screen with inline API key setup and outliner mode switch',
      'Three built-in skills: Node organizer, Chat recall, Skill creator — all user-editable',
      'AI grows with you — tell it to change its behavior and it persists across conversations',

      // Chat Experience
      'Multi-panel Chat — open multiple conversations side by side',
      'Cross-session memory — AI searches past conversations to recall what you discussed',
      'Long conversations auto-compress with handoff memos, preserving full history',
      'Edit messages, regenerate responses, and navigate conversation branches',
      'Node references in chat: <ref> links with popover preview, <node /> inline outliner',
      'Citation badges for nodes, past chats, and web URLs with expandable source preview',

      // Knowledge Graph
      'Browse your knowledge graph from the root — node_read() with journal and schema shortcuts',
      'Fuzzy search across notes and past chats — works with Chinese, English, and mixed queries',
      'Settings reorganized: AI group with Providers, Agents search, and Skills search',

      // Browser & Tools
      'Full browser automation: screenshot, click, navigate, read pages, fill forms, debug console',
      'Spark structure extraction: clip a page and AI reveals its cognitive framework',
      'Web clip pipeline unified across all entry points with content caching',

      // Multi-Panel Layout
      'Floating card panels with tab-style navigation and keyboard shortcuts',
      'Responsive layout: side-by-side panels on wide screens, tab switching on narrow screens',

      // Platform
      'Forced login with Google OAuth — your data syncs from day one',
      'Multi-provider AI: Anthropic, OpenAI, Google, DeepSeek, and custom models',
      'Chat history syncs across devices via Cloudflare D1/R2',
    ],
  },
  {
    version: '0.1.1',
    date: '2026-03-09',
    summary: 'Think where you read',
    items: [
      'Highlight any passage and write a note right where you read',
      'Clip web pages into structured notes while browsing',
      'A keyboard-first outliner that thinks in structure',
      'Supertags turn notes into structured data with typed fields',
      'Sort, filter, and group to surface what matters',
      '@ references and # tags to connect ideas across notes',
      'Cloud sync — your notes follow you across devices',
    ],
  },
];
