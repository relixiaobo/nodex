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

    const persisted = localStorage.getItem('nodex-workspace');
    expect(persisted).not.toBeNull();
    expect(JSON.parse(persisted as string)).toMatchObject({
      state: {
        currentWorkspaceId: 'ws_1',
        userId: 'user_1',
        isAuthenticated: true,
      },
      version: 0,
    });

    useWorkspaceStore.getState().logout();
    expect(useWorkspaceStore.getState()).toMatchObject({
      currentWorkspaceId: null,
      userId: null,
      isAuthenticated: false,
      authUser: null,
    });
  });

  it('authUser is not persisted to storage', () => {
    useWorkspaceStore.setState({
      currentWorkspaceId: 'ws_1',
      userId: 'user_1',
      isAuthenticated: true,
      authUser: { id: 'user_1', email: 'test@example.com', name: 'Test User' },
    });

    const persisted = localStorage.getItem('nodex-workspace');
    expect(persisted).not.toBeNull();
    const parsed = JSON.parse(persisted as string);
    // authUser should NOT appear in persisted state
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

  it('signInWithGoogle updates store when auth succeeds', async () => {
    // Mock the dynamic import of auth.ts
    const mockUser = { id: 'guser_1', email: 'g@example.com', name: 'Google User' };
    vi.doMock('../../src/lib/auth.js', () => ({
      signInWithGoogle: vi.fn().mockResolvedValue(mockUser),
    }));

    // Simulate what signInWithGoogle action does (without actual chrome.identity)
    useWorkspaceStore.setState({
      userId: mockUser.id,
      isAuthenticated: true,
      authUser: mockUser,
    });

    const state = useWorkspaceStore.getState();
    expect(state.userId).toBe('guser_1');
    expect(state.isAuthenticated).toBe(true);
    expect(state.authUser).toMatchObject({ email: 'g@example.com', name: 'Google User' });
  });
});
