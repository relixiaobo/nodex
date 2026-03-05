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
      'First public release',
      'Outliner with full keyboard navigation',
      'Supertags with template fields',
      'Web page clipping with content extraction',
      'Highlight & comment on any web page',
      'Daily journal with calendar heatmap',
      'Command palette (Cmd+K) with fuzzy search',
      'Cloud sync via Cloudflare',
    ],
  },
];
