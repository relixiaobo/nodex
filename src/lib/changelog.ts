export interface ChangelogEntry {
  version: string;
  date: string;
  items: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.1.0',
    date: '2026-03-05',
    items: [
      'Write and organize your notes in a keyboard-friendly outliner',
      'Tag any node with supertags to add structure and fields',
      'Clip web pages into your notes while browsing',
      'Highlight and annotate text on any website',
      'Keep a daily journal with a calendar heatmap overview',
      'Find anything instantly with ⌘K quick search',
      'Sync your notes across devices',
    ],
  },
];
