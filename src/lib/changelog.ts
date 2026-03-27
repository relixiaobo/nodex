export interface ChangelogEntry {
  version: string;
  date: string;
  summary: string;
  items: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.3.4',
    date: '2026-03-27',
    summary: 'Smoother Chat & Smarter Errors',
    items: [
      'Chat opens instantly and model switching no longer freezes',
      'Multi-step AI tasks stay visible — no more flickering between tool calls',
      'Errors show a clear message with Retry that resumes at the failed step',
      'Long conversations auto-compress before hitting the context limit',
      'Floating bar shows "soma is working…" when AI runs in the background',
    ],
  },
  {
    version: '0.3.3',
    date: '2026-03-27',
    summary: 'Faster Everywhere',
    items: [
      'Typing, Enter, Tab indent, and drag & drop are now instant — even with 10,000+ nodes',
      'Cursor stays in place when you indent or outdent with Tab',
      'New icon',
    ],
  },
  {
    version: '0.3.2',
    date: '2026-03-26',
    summary: '@ Mentions + Login Redesign',
    items: [
      'Type @ in chat to mention any node — its content is injected as AI context',
      'Inline references show @Name format with consistent spacing everywhere',
      'Redesigned login screen — logo, tagline, and clear value proposition',
      'Auto-select default model after first API key setup',
      'Sync startup fix — retries after LoroDoc initialization',
    ],
  },
  {
    version: '0.3.1',
    date: '2026-03-25',
    summary: 'Smarter AI + New Logo',
    items: [
      'AI sees what you see — conversations now include your visible outliner tree as context',
      'Regenerate replays the entire response, not just the last message',
      'Official skills auto-update on launch while preserving your custom rules',
      'Unsent draft visible in chat bar when drawer is closed',
      'Simplified onboarding — "Connect an AI provider" in one step',
      'New logo',
    ],
  },
  {
    version: '0.3.0',
    date: '2026-03-24',
    summary: 'Chat Drawer + Node Embed',
    items: [
      'Chat Drawer — Outliner always visible, AI Chat as bottom drawer with drag-to-resize',
      'Node embed in chat — interactive outliner inside AI responses, expand/collapse inline',
      'AI tools improved — more reliable node creation, search nodes, merge, batch delete',
      'Custom model support — configure any OpenAI-compatible provider',
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
