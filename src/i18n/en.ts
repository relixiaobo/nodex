export const enMessages = {
  reference: {
    blocked: {
      selfChild: 'Cannot reference a node as its own child',
      cycle: 'Cannot create this tree reference (would create a cycle)',
      unavailable: 'This reference cannot be created',
      createFallback: 'This tree reference cannot be created (it may create a cycle)',
    },
    selector: {
      blockedBadge: 'Blocked',
      disabledReasonSelfChild: 'Cannot reference a node as its own child',
      disabledReasonCycle: 'Would create a circular tree reference',
      disabledReasonUnavailable: 'This node cannot be referenced right now',
      sectionDates: 'Dates',
      sectionRecentlyUsed: 'Recently used',
      sectionNodes: 'Nodes',
      noMatches: 'No matches',
      create: 'Create "{name}"',
      shortcutToday: 'Today',
      shortcutTomorrow: 'Tomorrow',
      shortcutYesterday: 'Yesterday',
    },
  },
  tag: {
    selector: {
      noTagsAvailable: 'No tags available',
      create: 'Create "{name}"',
    },
  },
  slash: {
    menu: {
      noResults: 'No results',
    },
  },
  search: {
    commandPalette: {
      placeholder: 'Search nodes...',
      noResults: 'No results found.',
      groupNavigate: 'Navigate',
      groupNodes: 'Nodes',
      containerLibrary: 'Library',
      containerInbox: 'Inbox',
      containerJournal: 'Journal',
      containerTrash: 'Trash',
      untitled: 'Untitled',
    },
  },
  nodePicker: {
    create: 'Create "{name}"',
    createPrefix: 'Create',
  },
} as const;

export type EnMessages = typeof enMessages;
