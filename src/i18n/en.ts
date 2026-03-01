export const enMessages = {
  common: {
    untitled: 'Untitled',
    todayPrefix: 'Today, {name}',
  },
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
    batch: {
      title: 'Apply tag to {count} nodes',
      placeholder: 'Search or create tag...',
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
  },
  dateNavigationBar: {
    previousDay: 'Previous day',
    nextDay: 'Next day',
    goToToday: 'Go to today',
    today: 'Today',
    pickDate: 'Pick a date',
  },
  datePicker: {
    datePlaceholder: 'YYYY/MM/DD',
    settingEndDate: 'End date',
    settingIncludeTime: 'Include time',
    clear: 'Clear',
    today: 'Today',
  },
  breadcrumb: {
    goToParent: 'Go to parent',
    goToWorkspaceRoot: 'Go to workspace root',
    showHiddenAncestors: 'Show hidden ancestors',
  },
  nodeHeader: {
    dragToMove: 'Drag to move (right-click for menu)',
  },
  outliner: {
    zoomIn: 'Zoom in',
    toggleChildren: 'Toggle children',
    showField: 'Show {name}',
  },
  field: {
    empty: 'Empty',
    selectSupertag: 'Select supertag',
    selectFieldType: 'Select field type',
    selectValue: 'Select value',
    selectOption: 'Select option',
    fieldNamePlaceholder: 'Field name...',
  },
  sidebar: {
    nav: {
      library: 'Library',
      inbox: 'Inbox',
      dailyNotes: 'Daily notes',
      searches: 'Searches',
      trash: 'Trash',
      goToTodayShortcut: 'Go to today (Cmd+Shift+D)',
    },
  },
  userMenu: {
    ariaLabel: 'User menu',
    signedInFallback: 'Signed in',
    signOut: 'Sign out',
    avatarAlt: 'avatar',
  },
  toolbar: {
    back: 'Back',
    forward: 'Forward',
    search: 'Search',
    signIn: 'Sign in with Google',
    dragToMove: 'Drag to move',
  },
  floatingToolbar: {
    bold: 'Bold',
    italic: 'Italic',
    strikethrough: 'Strikethrough',
    code: 'Code',
    highlight: 'Highlight',
    heading: 'Heading',
    tag: 'Tag',
  },
} as const;

export type EnMessages = typeof enMessages;
