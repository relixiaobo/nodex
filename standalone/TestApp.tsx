/**
 * Standalone test App — Loro Phase 1 (local-only, no Supabase).
 *
 * Initializes LoroDoc, seeds test data, and renders the outliner.
 * Append ?offline=true to skip Supabase even if env vars are present (legacy).
 */
import { useEffect, useState } from 'react';
import { useWorkspaceStore } from '../src/stores/workspace-store';
import { useUIStore } from '../src/stores/ui-store';
import { useNodeStore } from '../src/stores/node-store';
import { useGlobalSelectionDismiss } from '../src/hooks/use-global-selection-dismiss.js';
import { TopToolbar } from '../src/components/toolbar/TopToolbar';
import { PanelStack } from '../src/components/panel/PanelStack';
import { CommandPalette } from '../src/components/search/CommandPalette';
import { CONTAINER_IDS } from '../src/types/index.js';
import { seedTestData } from '../src/entrypoints/test/seed-data';

/** Map port -> agent identity for visual differentiation */
const AGENT_BY_PORT: Record<string, { name: string; color: string }> = {
  '5199': { name: 'nodex', color: '#6366f1' },
  '5200': { name: 'nodex-codex', color: '#f59e0b' },
  '5201': { name: 'nodex-cc', color: '#10b981' },
  '5202': { name: 'nodex-cc-2', color: '#ef4444' },
};

function getAgentInfo() {
  const port = window.location.port;
  return AGENT_BY_PORT[port] ?? { name: `port:${port}`, color: '#6b7280' };
}

function useTestBootstrap(): boolean {
  const [ready, setReady] = useState(false);
  const panelHistory = useUIStore((s) => s.panelHistory);
  const navigateTo = useUIStore((s) => s.navigateTo);

  useEffect(() => {
    async function init() {
      // Initialize LoroDoc + seed test data (async: loads IndexedDB snapshot if any)
      await seedTestData({ forceFresh: true });

      // Navigate to Library if no panel open
      if (panelHistory.length === 0) {
        navigateTo(CONTAINER_IDS.LIBRARY);
      }

      // Expose stores on window for MCP/DevTools console testing
      Object.assign(window, {
        __nodeStore: useNodeStore,
        __uiStore: useUIStore,
        __wsStore: useWorkspaceStore,
      });

      const agent = getAgentInfo();
      document.title = `Nodex [${agent.name}] (Loro local)`;

      setReady(true);
    }

    init();
  }, []);

  return ready;
}

export function TestApp() {
  const ready = useTestBootstrap();
  const selectionDismissHandlers = useGlobalSelectionDismiss();

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Loading Loro seed data...
      </div>
    );
  }

  const agent = getAgentInfo();

  return (
    <div
      className="flex h-screen w-full flex-col overflow-hidden rounded-t-xl bg-background text-foreground"
      onPointerDownCapture={selectionDismissHandlers.onPointerDownCapture}
      onFocusCapture={selectionDismissHandlers.onFocusCapture}
    >
      <TopToolbar />
      <PanelStack />
      <CommandPalette />
      {/* Agent badge — fixed top-right corner */}
      <div
        style={{
          position: 'fixed',
          top: 50,
          right: 6,
          maxWidth: 'calc(100vw - 80px)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          backgroundColor: agent.color,
          color: '#fff',
          fontSize: 11,
          fontWeight: 600,
          padding: '2px 8px',
          borderRadius: 4,
          zIndex: 9999,
          opacity: 0.85,
          pointerEvents: 'none',
        }}
      >
        {agent.name}
      </div>
    </div>
  );
}
