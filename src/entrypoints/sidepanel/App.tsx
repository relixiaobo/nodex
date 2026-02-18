import { useEffect, useState } from 'react';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { useUIStore } from '../../stores/ui-store';
import { useNodeStore } from '../../stores/node-store';
import { useRealtimeNodes } from '../../hooks/use-realtime';
import { useNavUndoKeyboard } from '../../hooks/use-nav-undo-keyboard';
import { Sidebar } from '../../components/sidebar/Sidebar';
import { PanelStack } from '../../components/panel/PanelStack';
import { CommandPalette } from '../../components/search/CommandPalette';
import { LoginScreen } from '../../components/auth/LoginScreen';
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

interface BootstrapResult {
  ready: boolean;
  requiresAuth: boolean;
}

function useBootstrap(): BootstrapResult {
  const [ready, setReady] = useState(false);
  const [requiresAuth, setRequiresAuth] = useState(false);
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const isAuthenticated = useWorkspaceStore((s) => s.isAuthenticated);
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);
  const setUser = useWorkspaceStore((s) => s.setUser);
  const panelHistory = useUIStore((s) => s.panelHistory);
  const navigateTo = useUIStore((s) => s.navigateTo);
  const fetchNode = useNodeStore((s) => s.fetchNode);

  useEffect(() => {
    let authUnsubscribe: (() => void) | undefined;

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

      // When Supabase is available, require authentication
      if (supabaseReady) {
        const initAuth = useWorkspaceStore.getState().initAuth;
        authUnsubscribe = await initAuth();

        const authenticated = useWorkspaceStore.getState().isAuthenticated;
        if (!authenticated) {
          // Signal to App that we need a login screen
          setRequiresAuth(true);
          setReady(true);
          return;
        }
      }

      // Bootstrap workspace
      let currentWsId = wsId;
      const currentUserId = useWorkspaceStore.getState().userId;
      if (!currentWsId) {
        currentWsId = supabaseReady
          ? (useWorkspaceStore.getState().userId ?? 'ws_default')
          : 'ws_default';
        setWorkspace(currentWsId);
        if (!supabaseReady) setUser('user_default');
      }

      // Seed workspace root + container nodes (for offline/demo mode)
      seedWorkspace(currentWsId, currentUserId ?? 'user_default');

      // Navigate to Library if panel stack is empty
      if (panelHistory.length === 0) {
        const libraryId = getContainerId(currentWsId, WORKSPACE_CONTAINERS.LIBRARY);
        navigateTo(libraryId);

        // Try to fetch from Supabase (will use local seed if fails)
        if (supabaseReady) {
          await fetchNode(libraryId);
        }
      }

      setReady(true);
    }

    init();

    return () => authUnsubscribe?.();
  }, []); // Run once on mount

  // Re-evaluate auth requirement when isAuthenticated changes (e.g. after login)
  useEffect(() => {
    if (isAuthenticated && requiresAuth) {
      setRequiresAuth(false);
      // Re-run workspace bootstrap after successful login
      const currentWsId = useWorkspaceStore.getState().currentWorkspaceId;
      const userId = useWorkspaceStore.getState().userId;
      if (userId && !currentWsId) {
        useWorkspaceStore.getState().setWorkspace(userId);
        seedWorkspace(userId, userId);
        const libraryId = getContainerId(userId, WORKSPACE_CONTAINERS.LIBRARY);
        useUIStore.getState().navigateTo(libraryId);
      }
    }
  }, [isAuthenticated, requiresAuth]);

  return { ready, requiresAuth };
}

export function App() {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const { ready, requiresAuth } = useBootstrap();

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

  // Show login screen when Supabase is available but user is not authenticated
  if (requiresAuth) {
    return <LoginScreen />;
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      {sidebarOpen && <Sidebar />}
      <PanelStack />
      <CommandPalette />
    </div>
  );
}
