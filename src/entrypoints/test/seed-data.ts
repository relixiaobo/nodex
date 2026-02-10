/**
 * Seed sample data for the test page.
 *
 * Creates a realistic outliner tree with various node types
 * to exercise all outliner interactions.
 */
import { useNodeStore } from '../../stores/node-store';
import { useUIStore } from '../../stores/ui-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import type { NodexNode } from '../../types/index.js';

const WS_ID = 'ws_default';
const USER_ID = 'user_default';

function makeNode(
  id: string,
  name: string,
  parentId: string,
  children: string[] = [],
): NodexNode {
  const now = Date.now();
  return {
    id,
    workspaceId: WS_ID,
    props: { created: now, name, _ownerId: parentId },
    children,
    version: 1,
    updatedAt: now,
    createdBy: USER_ID,
    updatedBy: USER_ID,
  };
}

export function seedTestData() {
  const store = useNodeStore.getState();
  const wsStore = useWorkspaceStore.getState();
  const uiStore = useUIStore.getState();

  // Only seed if store is empty (avoid re-seeding on hot reload)
  if (Object.keys(store.entities).length > 5) return;

  // Set workspace
  wsStore.setWorkspace(WS_ID);
  wsStore.setUser(USER_ID);

  // ─── Container nodes ───
  const libraryId = `${WS_ID}_LIBRARY`;
  const inboxId = `${WS_ID}_INBOX`;
  const journalId = `${WS_ID}_JOURNAL`;
  const searchesId = `${WS_ID}_SEARCHES`;
  const trashId = `${WS_ID}_TRASH`;

  const containers = [
    makeNode(libraryId, 'Library', WS_ID, ['proj_1', 'note_1', 'note_2', 'note_rich']),
    makeNode(inboxId, 'Inbox', WS_ID, ['inbox_1', 'inbox_2', 'inbox_3']),
    makeNode(journalId, 'Journal', WS_ID, ['journal_1']),
    makeNode(searchesId, 'Searches', WS_ID, []),
    makeNode(trashId, 'Trash', WS_ID, []),
  ];

  // ─── Library nodes ───

  // Project with nested structure
  const projectNodes = [
    makeNode('proj_1', 'My Project', libraryId, ['task_1', 'task_2', 'task_3']),
    makeNode('task_1', 'Design the data model', 'proj_1', ['subtask_1a', 'subtask_1b']),
    makeNode('subtask_1a', 'Define node types and properties', 'task_1', []),
    makeNode('subtask_1b', 'Create database migration', 'task_1', []),
    makeNode('task_2', 'Build the outliner UI', 'proj_1', ['subtask_2a', 'subtask_2b', 'subtask_2c']),
    makeNode('subtask_2a', 'Implement BulletChevron component', 'task_2', []),
    makeNode('subtask_2b', 'Add keyboard navigation', 'task_2', []),
    makeNode('subtask_2c', 'Implement drag and drop', 'task_2', []),
    makeNode('task_3', 'Connect to Supabase', 'proj_1', []),
  ];

  // Simple notes
  const noteNodes = [
    makeNode('note_1', 'Meeting notes - Team standup', libraryId, ['note_1a', 'note_1b', 'note_1c']),
    makeNode('note_1a', 'Discussed project timeline', 'note_1', []),
    makeNode('note_1b', 'Need to review PR #42', 'note_1', []),
    makeNode('note_1c', 'Next meeting on Friday', 'note_1', []),
    makeNode('note_2', 'Quick ideas', libraryId, ['idea_1', 'idea_2']),
    makeNode('idea_1', 'Try using virtual scrolling for large lists', 'note_2', []),
    makeNode('idea_2', 'Add dark mode support', 'note_2', []),
  ];

  // Rich text test node
  const richTextNodes = [
    makeNode(
      'note_rich',
      'Rich text formatting tests',
      libraryId,
      ['rich_1', 'rich_2', 'rich_3', 'rich_4', 'rich_5'],
    ),
    makeNode('rich_1', '<strong>Bold text</strong> mixed with normal', 'note_rich', []),
    makeNode('rich_2', '<em>Italic text</em> and <strong><em>bold italic</em></strong>', 'note_rich', []),
    makeNode('rich_3', 'Inline <code>code snippet</code> in a sentence', 'note_rich', []),
    makeNode('rich_4', '<s>Strikethrough text</s> for done items', 'note_rich', []),
    makeNode('rich_5', 'Text with <mark>highlighted</mark> parts', 'note_rich', []),
  ];

  // ─── Inbox nodes ───
  const inboxNodes = [
    makeNode('inbox_1', 'Read the article about Chrome extensions', inboxId, []),
    makeNode('inbox_2', 'Respond to email from client', inboxId, []),
    makeNode('inbox_3', 'Review pull request', inboxId, ['inbox_3a', 'inbox_3b']),
    makeNode('inbox_3a', 'Check test coverage', 'inbox_3', []),
    makeNode('inbox_3b', 'Verify performance impact', 'inbox_3', []),
  ];

  // ─── Journal node ───
  const journalNodes = [
    makeNode('journal_1', 'Today\'s Journal', journalId, ['j_1', 'j_2', 'j_3']),
    makeNode('j_1', 'Started working on the outliner component', 'journal_1', []),
    makeNode('j_2', 'Fixed a bug in the drag and drop handler', 'journal_1', []),
    makeNode('j_3', 'Learned about TipTap keyboard shortcuts', 'journal_1', []),
  ];

  // ─── Set all nodes ───
  const allNodes = [
    ...containers,
    ...projectNodes,
    ...noteNodes,
    ...richTextNodes,
    ...inboxNodes,
    ...journalNodes,
  ];

  store.setNodes(allNodes);

  // Expand some nodes by default for testing
  uiStore.setExpanded('proj_1', true);
  uiStore.setExpanded('task_1', true);
  uiStore.setExpanded('task_2', true);
  uiStore.setExpanded('note_rich', true);

  // Navigate to Library
  if (uiStore.panelStack.length === 0) {
    uiStore.pushPanel(libraryId);
  }
}
