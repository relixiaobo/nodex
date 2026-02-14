import { useWorkspaceStore } from '../../src/stores/workspace-store.js';

describe('workspace-store auth and persistence', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      currentWorkspaceId: null,
      userId: null,
      isAuthenticated: false,
    });
    localStorage.removeItem('nodex-workspace');
  });

  it('starts unauthenticated with empty workspace context', () => {
    expect(useWorkspaceStore.getState()).toMatchObject({
      currentWorkspaceId: null,
      userId: null,
      isAuthenticated: false,
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
    });
  });
});
