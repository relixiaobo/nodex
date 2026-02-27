// Mock sync-manager (imported at module top-level by workspace-store)
vi.mock('../../src/lib/sync/sync-manager.js', () => ({
  syncManager: {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    getState: vi.fn().mockReturnValue({ status: 'local-only' }),
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
      getPeerIdStr: vi.fn().mockReturnValue('peer_1'),
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
      getPeerIdStr: vi.fn().mockReturnValue('peer_1'),
    }));

    await expect(useWorkspaceStore.getState().signInWithGoogle()).rejects.toThrow('Auth cancelled');

    // Store should remain unauthenticated on failure
    const state = useWorkspaceStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.authUser).toBeNull();
  });
});
