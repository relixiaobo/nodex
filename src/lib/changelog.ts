export interface ChangelogEntry {
  version: string;
  date: string;
  summary: string;
  items: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.1.1',
    // 按产品支柱排列: Think → Connect → Everywhere
    date: '2026-03-09',
    summary: 'Think where you read',
    items: [
      // Think — think where you read
      'Highlight any passage and write a note right where you read',
      'Clip web pages into structured notes while browsing',
      'A keyboard-first outliner that thinks in structure',
      // Connect — discover patterns
      'Supertags turn notes into structured data with typed fields',
      'Sort, filter, and group to surface what matters',
      '@ references and # tags to connect ideas across notes',
      // Everywhere
      'Cloud sync — your notes follow you across devices',
    ],
  },
];
