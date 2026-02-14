import { useEffect, useState } from 'react';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { useUIStore } from '../../stores/ui-store';
import { useNodeStore } from '../../stores/node-store';
import { useRealtimeNodes } from '../../hooks/use-realtime';
import { useNavUndoKeyboard } from '../../hooks/use-nav-undo-keyboard';
import { Sidebar } from '../../components/sidebar/Sidebar';
import { PanelStack } from '../../components/panel/PanelStack';
import { CommandPalette } from '../../components/search/CommandPalette';
import { WORKSPACE_CONTAINERS, getContainerId } from '../../types/index.js';
import type { NodexNode, WorkspaceContainerSuffix } from '../../types/index.js';
import { resetSupabase } from '../../services/supabase.js';
import { findUnexpectedShortcutConflicts } from '../../lib/shortcut-registry.js';

/**
 * Bootstrap workspace root node and container nodes.
 * Called when no Supabase data is available (offline/demo mode).
 */
function seedWorkspace(wsId: string, userId: string) {
  const store = useNodeStore.getState();
  const now = Date.now();

  const containers: Array<{ suffix: WorkspaceContainerSuffix; name: string }> = [
    { suffix: WORKSPACE_CONTAINERS.LIBRARY, name: 'Library' },
    { suffix: WORKSPACE_CONTAINERS.INBOX, name: 'Inbox' },
    { suffix: WORKSPACE_CONTAINERS.JOURNAL, name: 'Journal' },
    { suffix: WORKSPACE_CONTAINERS.SEARCHES, name: 'Searches' },
    { suffix: WORKSPACE_CONTAINERS.TRASH, name: 'Trash' },
  ];

  const containerIds = containers.map(({ suffix }) => getContainerId(wsId, suffix));

  // Create workspace root node (id === wsId)
  if (!store.entities[wsId]) {
    store.setNode({
      id: wsId,
      workspaceId: wsId,
      props: { created: now, name: 'My Workspace' },
      children: containerIds,
      version: 1,
      updatedAt: now,
      createdBy: userId,
      updatedBy: userId,
    });
  }

  // Create container nodes
  for (const { suffix, name } of containers) {
    const id = getContainerId(wsId, suffix);
    if (!store.entities[id]) {
      const node: NodexNode = {
        id,
        workspaceId: wsId,
        props: { created: now, name, _ownerId: wsId },
        children: [],
        version: 1,
        updatedAt: now,
        createdBy: userId,
        updatedBy: userId,
      };
      store.setNode(node);
    }
  }
}

function useBootstrap() {
  const [ready, setReady] = useState(false);
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);
  const setUser = useWorkspaceStore((s) => s.setUser);
  const panelHistory = useUIStore((s) => s.panelHistory);
  const navigateTo = useUIStore((s) => s.navigateTo);
  const fetchNode = useNodeStore((s) => s.fetchNode);

  useEffect(() => {
    async function init() {
      let supabaseReady = false;

      // Try to initialize Supabase
      try {
        const { setupSupabase } = await import('../../lib/supabase');
        const client = setupSupabase();
        // Test actual connectivity with a lightweight query
        const { error } = await client.from('nodes').select('id').limit(1);
        if (error) throw error;
        supabaseReady = true;
      } catch {
        // Supabase not reachable or not configured — fall back to offline mode
        resetSupabase();
      }

      // Bootstrap workspace
      let currentWsId = wsId;
      const currentUserId = useWorkspaceStore.getState().userId;
      if (!currentWsId) {
        currentWsId = 'ws_default';
        setWorkspace(currentWsId);
        setUser('user_default');
      }

      // Seed workspace root + container nodes (for offline/demo mode)
      seedWorkspace(
        currentWsId,
        currentUserId ?? 'user_default',
      );

      // Navigate to Library if panel stack is empty
      if (panelHistory.length === 0) {
        const libraryId = getContainerId(
          currentWsId,
          WORKSPACE_CONTAINERS.LIBRARY,
        );
        navigateTo(libraryId);

        // Try to fetch from Supabase (will use local seed if fails)
        if (supabaseReady) {
          await fetchNode(libraryId);
        }
      }

      setReady(true);
    }

    init();
  }, []); // Run once on mount

  return ready;
}

export function App() {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const ready = useBootstrap();

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const conflicts = findUnexpectedShortcutConflicts();
    if (conflicts.length > 0) {
      console.warn('[shortcut-registry] unexpected conflicts detected', conflicts);
    }
  }, []);

  // Realtime subscription
  useRealtimeNodes(wsId);

  // Global Cmd+Z / Cmd+Shift+Z for navigation undo/redo
  useNavUndoKeyboard();

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      {sidebarOpen && <Sidebar />}
      <PanelStack />
      <CommandPalette />
    </div>
  );
}
