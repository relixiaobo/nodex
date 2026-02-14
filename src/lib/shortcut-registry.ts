/**
 * Central shortcut registry (single source of truth for definitions).
 *
 * Note:
 * - Runtime bindings are still distributed across NodeEditor/TrailingInput/hooks.
 * - This registry is the canonical definition layer for docs and future wiring.
 */

export type ShortcutScope =
  | 'node_editor'
  | 'trailing_input'
  | 'selected_reference'
  | 'global';

export interface ShortcutDefinition {
  /** Stable ID for docs/tests/config mapping. */
  id: string;
  /** Logical scope where this shortcut is active. */
  scope: ShortcutScope;
  /** Default key bindings in canonical notation. */
  keys: string[];
  /** Activation condition. */
  when: string;
  /** Behavior summary. */
  action: string;
  /** Current implementation location. */
  source: string;
}

/**
 * Canonical shortcut definitions for current implementation.
 */
export const SHORTCUT_REGISTRY: ShortcutDefinition[] = [
  {
    id: 'editor.enter',
    scope: 'node_editor',
    keys: ['Enter'],
    when: 'NodeEditor focused',
    action: 'Confirm dropdown selection or split/create next node',
    source: 'src/components/editor/NodeEditor.tsx',
  },
  {
    id: 'editor.indent',
    scope: 'node_editor',
    keys: ['Tab'],
    when: 'NodeEditor focused',
    action: 'Indent current node',
    source: 'src/components/editor/NodeEditor.tsx',
  },
  {
    id: 'editor.outdent',
    scope: 'node_editor',
    keys: ['Shift-Tab'],
    when: 'NodeEditor focused',
    action: 'Outdent current node',
    source: 'src/components/editor/NodeEditor.tsx',
  },
  {
    id: 'editor.backspace_empty',
    scope: 'node_editor',
    keys: ['Backspace'],
    when: 'NodeEditor focused and current node is empty',
    action: 'Delete current node/reference entry and move focus',
    source: 'src/components/editor/NodeEditor.tsx',
  },
  {
    id: 'editor.arrow_up',
    scope: 'node_editor',
    keys: ['ArrowUp'],
    when: 'NodeEditor focused',
    action: 'Dropdown up or navigate to previous visible node',
    source: 'src/components/editor/NodeEditor.tsx',
  },
  {
    id: 'editor.arrow_down',
    scope: 'node_editor',
    keys: ['ArrowDown'],
    when: 'NodeEditor focused',
    action: 'Dropdown down or navigate to next visible node',
    source: 'src/components/editor/NodeEditor.tsx',
  },
  {
    id: 'editor.escape',
    scope: 'node_editor',
    keys: ['Escape'],
    when: 'NodeEditor focused with active dropdown',
    action: 'Close dropdown',
    source: 'src/components/editor/NodeEditor.tsx',
  },
  {
    id: 'editor.dropdown_force_create',
    scope: 'node_editor',
    keys: ['Mod-Enter'],
    when: 'NodeEditor focused with #/@ dropdown open',
    action: 'Force create tag/reference target from query',
    source: 'src/components/editor/NodeEditor.tsx',
  },
  {
    id: 'editor.move_up',
    scope: 'node_editor',
    keys: ['Mod-Shift-ArrowUp'],
    when: 'NodeEditor focused',
    action: 'Move node up among siblings',
    source: 'src/components/editor/NodeEditor.tsx',
  },
  {
    id: 'editor.move_down',
    scope: 'node_editor',
    keys: ['Mod-Shift-ArrowDown'],
    when: 'NodeEditor focused',
    action: 'Move node down among siblings',
    source: 'src/components/editor/NodeEditor.tsx',
  },
  {
    id: 'editor.edit_description',
    scope: 'node_editor',
    keys: ['Mod-i', 'Ctrl-i'],
    when: 'NodeEditor focused',
    action: 'Enter description editing mode',
    source: 'src/components/editor/NodeEditor.tsx',
  },

  {
    id: 'trailing.enter',
    scope: 'trailing_input',
    keys: ['Enter'],
    when: 'TrailingInput focused',
    action: 'Select option or create child node',
    source: 'src/components/editor/TrailingInput.tsx',
  },
  {
    id: 'trailing.indent_depth',
    scope: 'trailing_input',
    keys: ['Tab'],
    when: 'TrailingInput focused',
    action: 'Increase effective depth for next creation',
    source: 'src/components/editor/TrailingInput.tsx',
  },
  {
    id: 'trailing.outdent_depth',
    scope: 'trailing_input',
    keys: ['Shift-Tab'],
    when: 'TrailingInput focused',
    action: 'Decrease effective depth for next creation',
    source: 'src/components/editor/TrailingInput.tsx',
  },
  {
    id: 'trailing.backspace',
    scope: 'trailing_input',
    keys: ['Backspace'],
    when: 'TrailingInput focused and empty',
    action: 'Undo depth shift or jump to last visible node',
    source: 'src/components/editor/TrailingInput.tsx',
  },
  {
    id: 'trailing.arrow_up',
    scope: 'trailing_input',
    keys: ['ArrowUp'],
    when: 'TrailingInput focused',
    action: 'Options up or navigate to previous visible node',
    source: 'src/components/editor/TrailingInput.tsx',
  },
  {
    id: 'trailing.arrow_down',
    scope: 'trailing_input',
    keys: ['ArrowDown'],
    when: 'TrailingInput focused',
    action: 'Options down or escape to outer context',
    source: 'src/components/editor/TrailingInput.tsx',
  },
  {
    id: 'trailing.escape',
    scope: 'trailing_input',
    keys: ['Escape'],
    when: 'TrailingInput focused',
    action: 'Close options dropdown or blur editor',
    source: 'src/components/editor/TrailingInput.tsx',
  },

  {
    id: 'selected_ref.delete',
    scope: 'selected_reference',
    keys: ['Backspace', 'Delete'],
    when: 'Reference node selected (not focused)',
    action: 'Remove reference from parent',
    source: 'src/components/outliner/OutlinerItem.tsx',
  },
  {
    id: 'selected_ref.convert_arrow_right',
    scope: 'selected_reference',
    keys: ['ArrowRight'],
    when: 'Reference node selected and options picker closed',
    action: 'Enter reference conversion mode (temporary editable node)',
    source: 'src/components/outliner/OutlinerItem.tsx',
  },
  {
    id: 'selected_ref.convert_printable',
    scope: 'selected_reference',
    keys: ['<printable>'],
    when: 'Reference node selected and options picker closed',
    action: 'Enter conversion mode and append typed character',
    source: 'src/components/outliner/OutlinerItem.tsx',
  },
  {
    id: 'selected_ref.options_up',
    scope: 'selected_reference',
    keys: ['ArrowUp'],
    when: 'Reference node selected and options picker open',
    action: 'Move options picker highlight up',
    source: 'src/components/outliner/OutlinerItem.tsx',
  },
  {
    id: 'selected_ref.options_down',
    scope: 'selected_reference',
    keys: ['ArrowDown'],
    when: 'Reference node selected and options picker open',
    action: 'Move options picker highlight down',
    source: 'src/components/outliner/OutlinerItem.tsx',
  },
  {
    id: 'selected_ref.options_confirm',
    scope: 'selected_reference',
    keys: ['Enter'],
    when: 'Reference node selected and options picker open',
    action: 'Confirm current options picker item',
    source: 'src/components/outliner/OutlinerItem.tsx',
  },
  {
    id: 'selected_ref.options_cancel',
    scope: 'selected_reference',
    keys: ['Escape'],
    when: 'Reference node selected and options picker open',
    action: 'Close options picker and clear selection',
    source: 'src/components/outliner/OutlinerItem.tsx',
  },
  {
    id: 'selected_ref.clear_selection',
    scope: 'selected_reference',
    keys: ['Escape'],
    when: 'Reference node selected and options picker closed',
    action: 'Clear selection',
    source: 'src/components/outliner/OutlinerItem.tsx',
  },

  {
    id: 'global.nav_undo',
    scope: 'global',
    keys: ['Mod-z', 'Ctrl-z'],
    when: 'Focus not in contentEditable/input/textarea',
    action: 'Navigation undo',
    source: 'src/hooks/use-nav-undo-keyboard.ts',
  },
  {
    id: 'global.nav_redo',
    scope: 'global',
    keys: ['Mod-Shift-z', 'Ctrl-Shift-z'],
    when: 'Focus not in contentEditable/input/textarea',
    action: 'Navigation redo',
    source: 'src/hooks/use-nav-undo-keyboard.ts',
  },
];

function normalizeKey(key: string): string {
  return key.trim().toLowerCase().replace(/\s+/g, '');
}

export interface ShortcutConflict {
  scope: ShortcutScope;
  key: string;
  ids: string[];
}

export const KNOWN_SHORTCUT_CONFLICTS: ShortcutConflict[] = [
  {
    scope: 'selected_reference',
    key: 'escape',
    ids: ['selected_ref.options_cancel', 'selected_ref.clear_selection'],
  },
];

/**
 * Finds duplicate key declarations in the same scope.
 * Pseudo keys like "<printable>" are ignored.
 */
export function findShortcutConflicts(
  registry: ShortcutDefinition[] = SHORTCUT_REGISTRY,
): ShortcutConflict[] {
  const grouped = new Map<string, string[]>();

  for (const item of registry) {
    for (const key of item.keys) {
      if (key.startsWith('<') && key.endsWith('>')) continue;
      const normalized = normalizeKey(key);
      const bucket = `${item.scope}:${normalized}`;
      const ids = grouped.get(bucket) ?? [];
      ids.push(item.id);
      grouped.set(bucket, ids);
    }
  }

  const conflicts: ShortcutConflict[] = [];
  for (const [bucket, ids] of grouped.entries()) {
    if (ids.length <= 1) continue;
    const [scope, key] = bucket.split(':');
    conflicts.push({ scope: scope as ShortcutScope, key, ids });
  }

  return conflicts;
}

export function findUnexpectedShortcutConflicts(
  registry: ShortcutDefinition[] = SHORTCUT_REGISTRY,
  knownConflicts: ShortcutConflict[] = KNOWN_SHORTCUT_CONFLICTS,
): ShortcutConflict[] {
  const knownSet = new Set(
    knownConflicts.map((item) => `${item.scope}:${item.key}:${[...item.ids].sort().join('|')}`),
  );
  return findShortcutConflicts(registry).filter((item) => {
    const token = `${item.scope}:${item.key}:${[...item.ids].sort().join('|')}`;
    return !knownSet.has(token);
  });
}

export function getShortcutsByScope(
  scope: ShortcutScope,
  registry: ShortcutDefinition[] = SHORTCUT_REGISTRY,
): ShortcutDefinition[] {
  return registry.filter((s) => s.scope === scope);
}

export function getShortcutDefinition(
  id: string,
  registry: ShortcutDefinition[] = SHORTCUT_REGISTRY,
): ShortcutDefinition | undefined {
  return registry.find((s) => s.id === id);
}

export function getShortcutKeys(
  id: string,
  fallback: string[] = [],
  registry: ShortcutDefinition[] = SHORTCUT_REGISTRY,
): string[] {
  return getShortcutDefinition(id, registry)?.keys ?? fallback;
}

export function getPrimaryShortcutKey(
  id: string,
  fallback: string,
  registry: ShortcutDefinition[] = SHORTCUT_REGISTRY,
): string {
  return getShortcutKeys(id, [fallback], registry)[0] ?? fallback;
}

interface ParsedShortcut {
  key: string;
  mod: boolean;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
}

function parseShortcutKey(binding: string): ParsedShortcut {
  const tokens = binding
    .split(/[-+]/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  let mod = false;
  let ctrl = false;
  let meta = false;
  let shift = false;
  let alt = false;
  let key = '';

  for (const token of tokens) {
    if (token === 'mod') mod = true;
    else if (token === 'ctrl' || token === 'control') ctrl = true;
    else if (token === 'meta' || token === 'cmd' || token === 'command') meta = true;
    else if (token === 'shift') shift = true;
    else if (token === 'alt' || token === 'option') alt = true;
    else key = token;
  }

  return { key, mod, ctrl, meta, shift, alt };
}

/**
 * Match a KeyboardEvent against a shortcut binding from this registry.
 */
export function matchesShortcutEvent(
  e: KeyboardEvent,
  binding: string,
): boolean {
  const parsed = parseShortcutKey(binding);
  if (!parsed.key) return false;

  const eventKey = e.key.toLowerCase();
  if (eventKey !== parsed.key) return false;

  const modPressed = e.metaKey || e.ctrlKey;
  if (parsed.mod) {
    if (!modPressed) return false;
  } else if (e.metaKey || e.ctrlKey) {
    // Binding doesn't allow generic Mod if not explicitly requested.
    if (!parsed.meta && !parsed.ctrl) return false;
  }

  if (parsed.meta !== e.metaKey && !parsed.mod) return false;
  if (parsed.ctrl !== e.ctrlKey && !parsed.mod) return false;
  if (parsed.shift !== e.shiftKey) return false;
  if (parsed.alt !== e.altKey) return false;

  return true;
}
