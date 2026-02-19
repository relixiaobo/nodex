/**
 * Standalone test App with optional Supabase connection.
 *
 * - If VITE_SUPABASE_URL is set in .env, connects to Supabase and requires auth.
 * - Uses browser-native OAuth redirect (not chrome.identity) for login.
 * - Append ?offline=true to force offline mode even when env vars are present.
 * - Falls back to offline seed-data mode when Supabase is unavailable.
 */
import { useEffect, useRef, useState } from 'react';
import { useWorkspaceStore } from '../src/stores/workspace-store';
import { useUIStore } from '../src/stores/ui-store';
import { useNodeStore } from '../src/stores/node-store';
import { useRealtimeNodes } from '../src/hooks/use-realtime';
import { Sidebar } from '../src/components/sidebar/Sidebar';
import { PanelStack } from '../src/components/panel/PanelStack';
import { CommandPalette } from '../src/components/search/CommandPalette';
import { LoginScreen } from '../src/components/auth/LoginScreen';
import { WORKSPACE_CONTAINERS, getContainerId } from '../src/types/index.js';
import type { NodexNode, WorkspaceContainerSuffix } from '../src/types/index.js';
import { isSupabaseReady, resetSupabase } from '../src/services/supabase.js';
import { nodeToRow } from '../src/services/node-service.js';
import { seedTestData } from '../src/entrypoints/test/seed-data';

const CONTAINER_DEFS: Array<{ suffix: WorkspaceContainerSuffix; name: string }> = [
  { suffix: WORKSPACE_CONTAINERS.LIBRARY, name: 'Library' },
  { suffix: WORKSPACE_CONTAINERS.INBOX, name: 'Inbox' },
  { suffix: WORKSPACE_CONTAINERS.JOURNAL, name: 'Journal' },
  { suffix: WORKSPACE_CONTAINERS.SEARCHES, name: 'Searches' },
  { suffix: WORKSPACE_CONTAINERS.TRASH, name: 'Trash' },
];

/** Seed workspace containers locally, and upsert to Supabase when connected. */
async function seedWorkspaceContainers(wsId: string, userId: string) {
  // Provision user + workspace_members in Supabase (required for RLS)
  if (isSupabaseReady()) {
    try {
      const { getSupabase } = await import('../src/lib/supabase');
      const { useWorkspaceStore } = await import('../src/stores/workspace-store');
      const authUser = useWorkspaceStore.getState().authUser;
      await getSupabase().rpc('provision_workspace', {
        p_user_id: userId,
        p_email: authUser?.email ?? '',
        p_display_name: authUser?.name ?? null,
        p_avatar_url: authUser?.avatarUrl ?? null,
      });
    } catch {
      // Non-fatal
    }
  }

  const store = useNodeStore.getState();
  const now = Date.now();

  const toSeed: NodexNode[] = [];

  // Workspace root node
  if (!store.entities[wsId]) {
    const wsRoot: NodexNode = {
      id: wsId,
      workspaceId: wsId,
      props: { created: now, name: 'My Workspace' },
      children: CONTAINER_DEFS.map(({ suffix }) => getContainerId(wsId, suffix)),
      version: 1,
      updatedAt: now,
      createdBy: userId,
      updatedBy: userId,
    };
    store.setNode(wsRoot);
    toSeed.push(wsRoot);
  }

  for (const { suffix, name } of CONTAINER_DEFS) {
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
      toSeed.push(node);
    }
  }

  // Persist to Supabase when connected
  if (isSupabaseReady() && toSeed.length > 0) {
    try {
      const { getSupabase } = await import('../src/lib/supabase');
      const rows = toSeed.map((n) => nodeToRow(n));
      await getSupabase()
        .from('nodes')
        .upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
    } catch {
      // Non-fatal
    }
  }
}

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

function isForceOffline(): boolean {
  return new URLSearchParams(window.location.search).get('offline') === 'true';
}

interface BootstrapResult {
  ready: boolean;
  requiresAuth: boolean;
  supabaseConnected: boolean;
}

function useTestBootstrap(): BootstrapResult {
  const [ready, setReady] = useState(false);
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [supabaseConnected, setSbConnected] = useState(false);
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const isAuthenticated = useWorkspaceStore((s) => s.isAuthenticated);
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);
  const setUser = useWorkspaceStore((s) => s.setUser);
  const panelHistory = useUIStore((s) => s.panelHistory);
  const navigateTo = useUIStore((s) => s.navigateTo);
  const fetchNode = useNodeStore((s) => s.fetchNode);

  const initAuthCalled = useRef(false);

  useEffect(() => {
    let authUnsubscribe: (() => void) | undefined;

    async function init() {
      let supabaseReady = false;

      // Try to initialize Supabase (unless forced offline)
      if (!isForceOffline()) {
        try {
          const { setupSupabase } = await import('../src/lib/supabase');
          const client = setupSupabase();
          const { error } = await client.auth.getSession();
          if (error) throw error;
          supabaseReady = true;
          setSbConnected(true);
        } catch {
          resetSupabase();
        }
      }

      // Auth flow when Supabase is available
      if (supabaseReady && !initAuthCalled.current) {
        initAuthCalled.current = true;
        const initAuth = useWorkspaceStore.getState().initAuth;
        authUnsubscribe = await initAuth();

        const authenticated = useWorkspaceStore.getState().isAuthenticated;
        if (!authenticated) {
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

      await seedWorkspaceContainers(currentWsId, currentUserId ?? 'user_default');

      // Only seed test data in offline mode
      if (!supabaseReady) {
        seedTestData();
      }

      if (panelHistory.length === 0) {
        const libraryId = getContainerId(currentWsId, WORKSPACE_CONTAINERS.LIBRARY);
        navigateTo(libraryId);
        if (supabaseReady) {
          await fetchNode(libraryId);
        }
      }

      // Expose stores on window for MCP/DevTools console testing
      Object.assign(window, {
        __nodeStore: useNodeStore,
        __uiStore: useUIStore,
        __wsStore: useWorkspaceStore,
      });

      const agent = getAgentInfo();
      document.title = `Nodex [${agent.name}]${supabaseReady ? ' (Supabase)' : ' (offline)'}`;

      setReady(true);
    }

    init();

    return () => authUnsubscribe?.();
  }, []);

  // Re-bootstrap after login
  const bootstrappedAfterLogin = useRef(false);
  useEffect(() => {
    if (!isAuthenticated || !requiresAuth || bootstrappedAfterLogin.current) return;
    bootstrappedAfterLogin.current = true;
    setRequiresAuth(false);

    const wsId = useWorkspaceStore.getState().currentWorkspaceId;
    const userId = useWorkspaceStore.getState().userId;
    if (userId) {
      const effectiveWsId = wsId ?? userId;
      if (!wsId) useWorkspaceStore.getState().setWorkspace(userId);
      seedWorkspaceContainers(effectiveWsId, userId).then(() => {
        const libraryId = getContainerId(effectiveWsId, WORKSPACE_CONTAINERS.LIBRARY);
        return useNodeStore.getState().fetchNode(libraryId);
      });
      const libraryId = getContainerId(effectiveWsId, WORKSPACE_CONTAINERS.LIBRARY);
      useUIStore.getState().navigateTo(libraryId);
    }
  }, [isAuthenticated, requiresAuth]);

  return { ready, requiresAuth, supabaseConnected };
}

/**
 * Standalone login screen that uses browser-native OAuth redirect
 * instead of chrome.identity.launchWebAuthFlow.
 */
function StandaloneLoginScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setLoading(true);
    setError(null);
    try {
      const { getSupabase } = await import('../src/lib/supabase');
      const supabase = getSupabase();
      const redirectTo = window.location.href.split('?')[0]; // current page URL without query params
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });
      if (error) throw error;
      // Browser will redirect to Google → back to this page
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 bg-background px-6 text-foreground">
      <div className="flex flex-col items-center gap-1">
        <span className="text-2xl font-bold tracking-tight">Nodex</span>
        <span className="text-xs text-foreground-secondary">
          Standalone Test — Supabase Connected
        </span>
      </div>
      <button
        onClick={handleSignIn}
        disabled={loading}
        className="flex w-full max-w-[240px] items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium transition-colors hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-foreground/30 border-t-foreground" />
        ) : (
          <GoogleIcon />
        )}
        {loading ? 'Redirecting…' : 'Sign in with Google'}
      </button>
      {error && (
        <p className="max-w-[240px] text-center text-xs text-red-500">{error}</p>
      )}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

export function TestApp() {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const { ready, requiresAuth, supabaseConnected } = useTestBootstrap();

  // Realtime subscription (no-op when Supabase not connected)
  useRealtimeNodes(wsId);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (requiresAuth) {
    return <StandaloneLoginScreen />;
  }

  const agent = getAgentInfo();

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      {sidebarOpen && <Sidebar />}
      <PanelStack />
      <CommandPalette />
      {/* Agent badge — fixed top-right corner */}
      <div
        style={{
          position: 'fixed',
          top: 6,
          right: 6,
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
        {supabaseConnected && ' (SB)'}
      </div>
    </div>
  );
}
