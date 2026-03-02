// Mock sync-manager (imported at module top-level by workspace-store)
vi.mock('../../src/lib/sync/sync-manager.js', () => ({
  syncManager: {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    getState: vi.fn().mockReturnValue({ status: 'local-only' }),
    onStateChange: vi.fn().mockReturnValue(() => {}),
  },
}));

import { useWorkspaceStore } from '../../src/stores/workspace-store.js';

describe('workspace-store auth and persistence', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      currentWorkspaceId: null,
      userId: null,
      isAuthenticated: false,
      authUser: null,
    });
    localStorage.removeItem('nodex-workspace');
  });

  it('starts unauthenticated with empty workspace context', () => {
    expect(useWorkspaceStore.getState()).toMatchObject({
      currentWorkspaceId: null,
      userId: null,
      isAuthenticated: false,
      authUser: null,
    });
  });

  it('sets workspace and user context, then clears all on logout', () => {
    const store = useWorkspaceStore.getState();

    store.setWorkspace('ws_1');
    store.setUser('user_1');
    expect(useWorkspaceStore.getState()).toMatchObject({
      currentWorkspaceId: 'ws_1',
      userId: 'user_1',
      isAuthenticated: true,
    });

    // Only currentWorkspaceId is persisted (auth state is transient)
    const persisted = localStorage.getItem('nodex-workspace');
    expect(persisted).not.toBeNull();
    const parsed = JSON.parse(persisted as string);
    expect(parsed.state.currentWorkspaceId).toBe('ws_1');
    expect(parsed.state.userId).toBeUndefined();
    expect(parsed.state.isAuthenticated).toBeUndefined();

    useWorkspaceStore.getState().logout();
    expect(useWorkspaceStore.getState()).toMatchObject({
      currentWorkspaceId: null,
      userId: null,
      isAuthenticated: false,
      authUser: null,
    });
  });

  it('only currentWorkspaceId is persisted — auth state is not', () => {
    useWorkspaceStore.setState({
      currentWorkspaceId: 'ws_1',
      userId: 'user_1',
      isAuthenticated: true,
      authUser: { id: 'user_1', email: 'test@example.com', name: 'Test User' },
    });

    const persisted = localStorage.getItem('nodex-workspace');
    expect(persisted).not.toBeNull();
    const parsed = JSON.parse(persisted as string);
    // Only workspace preference is persisted; auth state is transient
    expect(parsed.state.currentWorkspaceId).toBe('ws_1');
    expect(parsed.state.userId).toBeUndefined();
    expect(parsed.state.isAuthenticated).toBeUndefined();
    expect(parsed.state.authUser).toBeUndefined();
  });

  it('logout clears authUser along with workspace state', () => {
    useWorkspaceStore.setState({
      currentWorkspaceId: 'ws_1',
      userId: 'uid_abc',
      isAuthenticated: true,
      authUser: { id: 'uid_abc', email: 'x@example.com', name: 'X' },
    });

    useWorkspaceStore.getState().logout();

    const state = useWorkspaceStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.authUser).toBeNull();
    expect(state.userId).toBeNull();
    expect(state.currentWorkspaceId).toBeNull();
  });

  it('signInWithGoogle action updates store with user and workspaceId', async () => {
    const mockUser = { id: 'guser_1', email: 'g@example.com', name: 'Google User' };
    vi.doMock('../../src/lib/auth.js', () => ({
      signInWithGoogle: vi.fn().mockResolvedValue(mockUser),
      getStoredToken: vi.fn().mockResolvedValue(null),
    }));
    vi.doMock('../../src/lib/loro-doc.js', () => ({
      setCurrentWorkspaceId: vi.fn(),
      wasLoadedFromSnapshot: vi.fn().mockReturnValue(false),
      getPeerIdStr: vi.fn().mockReturnValue('peer_1'),
      getLoroDoc: vi.fn().mockReturnValue({ export: vi.fn().mockReturnValue(new Uint8Array(0)) }),
      getChildren: vi.fn().mockReturnValue([]),
      deleteNode: vi.fn(),
      commitDoc: vi.fn(),
    }));
    vi.doMock('../../src/lib/sync/pending-queue.js', () => ({
      enqueuePendingUpdate: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock('../../src/lib/bootstrap-containers.js', () => ({
      ensureContainers: vi.fn(),
    }));
    vi.doMock('../../src/types/index.js', () => ({
      CONTAINER_IDS: { JOURNAL: 'test_JOURNAL' },
    }));
    vi.doMock('../../src/lib/journal.js', () => ({
      ensureTodayNode: vi.fn().mockReturnValue('today_node'),
    }));
    vi.doMock('../../src/stores/ui-store.js', () => ({
      useUIStore: { getState: vi.fn().mockReturnValue({ replacePanel: vi.fn() }) },
    }));

    // Call the actual store action (dynamic import will use our mock)
    await useWorkspaceStore.getState().signInWithGoogle();

    const state = useWorkspaceStore.getState();
    expect(state.userId).toBe('guser_1');
    expect(state.currentWorkspaceId).toBe('guser_1');
    expect(state.isAuthenticated).toBe(true);
    expect(state.authUser).toMatchObject({ email: 'g@example.com', name: 'Google User' });
  });

  it('signInWithGoogle action propagates auth errors', async () => {
    vi.doMock('../../src/lib/auth.js', () => ({
      signInWithGoogle: vi.fn().mockRejectedValue(new Error('Auth cancelled')),
      getStoredToken: vi.fn().mockResolvedValue(null),
    }));
    vi.doMock('../../src/lib/loro-doc.js', () => ({
      setCurrentWorkspaceId: vi.fn(),
      wasLoadedFromSnapshot: vi.fn().mockReturnValue(false),
      getPeerIdStr: vi.fn().mockReturnValue('peer_1'),
      getLoroDoc: vi.fn().mockReturnValue({ export: vi.fn().mockReturnValue(new Uint8Array(0)) }),
      getChildren: vi.fn().mockReturnValue([]),
      deleteNode: vi.fn(),
      commitDoc: vi.fn(),
    }));
    vi.doMock('../../src/lib/sync/pending-queue.js', () => ({
      enqueuePendingUpdate: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock('../../src/lib/bootstrap-containers.js', () => ({
      ensureContainers: vi.fn(),
    }));
    vi.doMock('../../src/types/index.js', () => ({
      CONTAINER_IDS: { JOURNAL: 'test_JOURNAL' },
    }));
    vi.doMock('../../src/lib/journal.js', () => ({
      ensureTodayNode: vi.fn().mockReturnValue('today_node'),
    }));
    vi.doMock('../../src/stores/ui-store.js', () => ({
      useUIStore: { getState: vi.fn().mockReturnValue({ replacePanel: vi.fn() }) },
    }));

    await expect(useWorkspaceStore.getState().signInWithGoogle()).rejects.toThrow('Auth cancelled');

    // Store should remain unauthenticated on failure
    const state = useWorkspaceStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.authUser).toBeNull();
  });

  it('initAuth clears bootstrap journal when no local snapshot', async () => {
    const mockUser = { id: 'auth_user', email: 'a@example.com', name: 'Auth User' };
    vi.doMock('../../src/lib/auth.js', () => ({
      getCurrentUser: vi.fn().mockResolvedValue(mockUser),
      getStoredToken: vi.fn().mockResolvedValue('token_abc'),
    }));
    const mockDeleteNode = vi.fn();
    const mockCommitDoc = vi.fn();
    vi.doMock('../../src/lib/loro-doc.js', () => ({
      wasLoadedFromSnapshot: vi.fn().mockReturnValue(false),
      getPeerIdStr: vi.fn().mockReturnValue('peer_1'),
      getLoroDoc: vi.fn().mockReturnValue({ export: vi.fn().mockReturnValue(new Uint8Array(0)) }),
      getChildren: vi.fn().mockReturnValue(['year_2026', 'year_2025']),
      deleteNode: mockDeleteNode,
      commitDoc: mockCommitDoc,
    }));
    vi.doMock('../../src/lib/sync/pending-queue.js', () => ({
      enqueuePendingUpdate: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock('../../src/types/index.js', () => ({
      CONTAINER_IDS: { JOURNAL: 'test_JOURNAL' },
    }));
    vi.doMock('../../src/lib/journal.js', () => ({
      ensureTodayNode: vi.fn().mockReturnValue('today_node'),
    }));
    vi.doMock('../../src/stores/ui-store.js', () => ({
      useUIStore: { getState: vi.fn().mockReturnValue({ replacePanel: vi.fn() }) },
    }));

    await useWorkspaceStore.getState().initAuth();

    const state = useWorkspaceStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.userId).toBe('auth_user');

    // Should have cleared bootstrap journal children
    expect(mockDeleteNode).toHaveBeenCalledWith('year_2026');
    expect(mockDeleteNode).toHaveBeenCalledWith('year_2025');
    expect(mockCommitDoc).toHaveBeenCalledWith('system:clear-bootstrap-journal');
  });

  it('initAuth skips journal cleanup when snapshot exists', async () => {
    const mockUser = { id: 'auth_user', email: 'a@example.com', name: 'Auth User' };
    vi.doMock('../../src/lib/auth.js', () => ({
      getCurrentUser: vi.fn().mockResolvedValue(mockUser),
      getStoredToken: vi.fn().mockResolvedValue('token_abc'),
    }));
    const mockDeleteNode = vi.fn();
    vi.doMock('../../src/lib/loro-doc.js', () => ({
      wasLoadedFromSnapshot: vi.fn().mockReturnValue(true),
      getPeerIdStr: vi.fn().mockReturnValue('peer_1'),
      getLoroDoc: vi.fn().mockReturnValue({ export: vi.fn().mockReturnValue(new Uint8Array(0)) }),
      getChildren: vi.fn().mockReturnValue(['year_2026']),
      deleteNode: mockDeleteNode,
      commitDoc: vi.fn(),
    }));
    vi.doMock('../../src/lib/sync/pending-queue.js', () => ({
      enqueuePendingUpdate: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock('../../src/types/index.js', () => ({
      CONTAINER_IDS: { JOURNAL: 'test_JOURNAL' },
    }));

    await useWorkspaceStore.getState().initAuth();

    const state = useWorkspaceStore.getState();
    expect(state.isAuthenticated).toBe(true);
    // Should NOT have deleted any journal children (snapshot exists)
    expect(mockDeleteNode).not.toHaveBeenCalled();
  });
});
