/**
 * Standalone test App that skips Supabase initialization.
 * Used for localhost testing where the database isn't available.
 */
import { useEffect, useState } from 'react';
import { useWorkspaceStore } from '../src/stores/workspace-store';
import { useUIStore } from '../src/stores/ui-store';
import { useNodeStore } from '../src/stores/node-store';
import { Sidebar } from '../src/components/sidebar/Sidebar';
import { PanelStack } from '../src/components/panel/PanelStack';
import { CommandPalette } from '../src/components/search/CommandPalette';
import { WORKSPACE_CONTAINERS, getContainerId } from '../src/types/index.js';
import type { NodexNode, WorkspaceContainerSuffix } from '../src/types/index.js';
import { seedTestData } from '../src/entrypoints/test/seed-data';

function seedWorkspaceContainers(wsId: string, userId: string) {
  const store = useNodeStore.getState();
  const now = Date.now();
  const containers: Array<{ suffix: WorkspaceContainerSuffix; name: string }> = [
    { suffix: WORKSPACE_CONTAINERS.LIBRARY, name: 'Library' },
    { suffix: WORKSPACE_CONTAINERS.INBOX, name: 'Inbox' },
    { suffix: WORKSPACE_CONTAINERS.JOURNAL, name: 'Journal' },
    { suffix: WORKSPACE_CONTAINERS.SEARCHES, name: 'Searches' },
    { suffix: WORKSPACE_CONTAINERS.TRASH, name: 'Trash' },
  ];
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

function useTestBootstrap() {
  const [ready, setReady] = useState(false);
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);
  const setUser = useWorkspaceStore((s) => s.setUser);
  const panelHistory = useUIStore((s) => s.panelHistory);
  const navigateTo = useUIStore((s) => s.navigateTo);

  useEffect(() => {
    // NO Supabase initialization — purely offline
    let currentWsId = wsId;
    if (!currentWsId) {
      currentWsId = 'ws_default';
      setWorkspace(currentWsId);
      setUser('user_default');
    }

    seedWorkspaceContainers(currentWsId, 'user_default');
    seedTestData();

    if (panelHistory.length === 0) {
      const libraryId = getContainerId(currentWsId, WORKSPACE_CONTAINERS.LIBRARY);
      navigateTo(libraryId);
    }

    // Expose stores on window for MCP/DevTools console testing
    Object.assign(window, {
      __nodeStore: useNodeStore,
      __uiStore: useUIStore,
      __wsStore: useWorkspaceStore,
    });

    setReady(true);
  }, []);

  return ready;
}

export function TestApp() {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const ready = useTestBootstrap();

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
