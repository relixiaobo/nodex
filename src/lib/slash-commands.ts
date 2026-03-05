export type SlashCommandId =
  | 'paste'
  | 'clip_page'
  | 'search_node'
  | 'field'
  | 'reference'
  | 'image_file'
  | 'heading'
  | 'checkbox'
  | 'checklist'
  | 'start_live_transcription'
  | 'more_commands';

export interface SlashCommandDefinition {
  id: SlashCommandId;
  name: string;
  shortcutHint?: string;
  keywords: string[];
  enabled: boolean;
  disabledHint?: string;
}

export const SLASH_DISABLED_HINT_DEFAULT = 'Coming soon';
export const SLASH_DISABLED_HINT_SEARCH_NODE = 'Search node UI is not implemented yet';

export const SLASH_COMMANDS_BASELINE: readonly SlashCommandDefinition[] = [
  {
    id: 'paste',
    name: 'Paste',
    shortcutHint: '⌘V',
    keywords: ['paste', 'clipboard'],
    enabled: false,
    disabledHint: SLASH_DISABLED_HINT_DEFAULT,
  },
  {
    id: 'clip_page',
    name: 'Clip Page',
    keywords: ['clip', 'web', 'capture', 'page'],
    enabled: true,
  },
  {
    id: 'search_node',
    name: 'Search node',
    keywords: ['search', 'node', 'find', '?'],
    enabled: false,
    disabledHint: SLASH_DISABLED_HINT_SEARCH_NODE,
  },
  {
    id: 'field',
    name: 'Field',
    shortcutHint: '>',
    keywords: ['field', 'attribute', 'property', '>'],
    enabled: true,
  },
  {
    id: 'reference',
    name: 'Reference',
    shortcutHint: '@',
    keywords: ['reference', 'ref', '@', 'mention'],
    enabled: true,
  },
  {
    id: 'image_file',
    name: 'Image / file',
    keywords: ['image', 'file', 'upload', 'attachment'],
    enabled: false,
    disabledHint: SLASH_DISABLED_HINT_DEFAULT,
  },
  {
    id: 'heading',
    name: 'Heading',
    shortcutHint: '!',
    keywords: ['heading', 'title', 'h1', '!'],
    enabled: true,
  },
  {
    id: 'checkbox',
    name: 'Checkbox',
    shortcutHint: '⌘↩',
    keywords: ['checkbox', 'todo', 'done', 'check'],
    enabled: true,
  },
  {
    id: 'checklist',
    name: 'Checklist',
    keywords: ['checklist', 'list', 'tasks'],
    enabled: false,
    disabledHint: SLASH_DISABLED_HINT_DEFAULT,
  },
  {
    id: 'start_live_transcription',
    name: 'Start live transcription',
    keywords: ['transcription', 'voice', 'speech', 'microphone', 'audio'],
    enabled: false,
    disabledHint: SLASH_DISABLED_HINT_DEFAULT,
  },
  {
    id: 'more_commands',
    name: 'More commands',
    shortcutHint: '⌘K',
    keywords: ['more', 'commands', 'command palette', 'cmdk', '⌘k'],
    enabled: false,
  },
] as const;

export function filterSlashCommands(
  query: string,
  commands: readonly SlashCommandDefinition[] = SLASH_COMMANDS_BASELINE,
): SlashCommandDefinition[] {
  // Only show enabled commands (hide unimplemented features)
  const visible = commands.filter((c) => c.enabled);
  const q = query.trim().toLowerCase();
  if (!q) return [...visible];
  return visible.filter((c) => {
    if (c.name.toLowerCase().includes(q)) return true;
    return c.keywords.some((k) => k.toLowerCase().includes(q));
  });
}

export function getFirstEnabledSlashIndex(commands: readonly SlashCommandDefinition[]): number {
  return commands.findIndex((c) => c.enabled);
}

export function getNextEnabledSlashIndex(
  commands: readonly SlashCommandDefinition[],
  currentIndex: number,
  direction: 'up' | 'down',
): number {
  const enabledIndices = commands
    .map((c, i) => (c.enabled ? i : -1))
    .filter((i) => i >= 0);

  if (enabledIndices.length === 0) return -1;
  if (currentIndex < 0) return direction === 'down' ? enabledIndices[0] : enabledIndices[enabledIndices.length - 1];

  if (direction === 'down') {
    for (const idx of enabledIndices) {
      if (idx > currentIndex) return idx;
    }
    return enabledIndices[enabledIndices.length - 1];
  }

  for (let i = enabledIndices.length - 1; i >= 0; i--) {
    const idx = enabledIndices[i];
    if (idx < currentIndex) return idx;
  }
  return enabledIndices[0];
}
