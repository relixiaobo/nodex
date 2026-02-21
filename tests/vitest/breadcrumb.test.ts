import { resolveWorkspaceRootTargetId } from '../../src/components/panel/Breadcrumb.js';
import { CONTAINER_IDS } from '../../src/types/index.js';

describe('breadcrumb workspace root target', () => {
  it('prefers current workspace node when it exists', () => {
    const target = resolveWorkspaceRootTargetId({
      workspaceId: 'ws_1',
      workspaceRootId: CONTAINER_IDS.INBOX,
      hasWorkspaceNode: (id) => id === 'ws_1',
    });
    expect(target).toBe('ws_1');
  });

  it('falls back to workspaceRootId when workspace node is missing', () => {
    const target = resolveWorkspaceRootTargetId({
      workspaceId: 'ws_missing',
      workspaceRootId: CONTAINER_IDS.JOURNAL,
      hasWorkspaceNode: () => false,
    });
    expect(target).toBe(CONTAINER_IDS.JOURNAL);
  });

  it('falls back to LIBRARY when neither workspaceId nor workspaceRootId is usable', () => {
    const target = resolveWorkspaceRootTargetId({
      workspaceId: null,
      workspaceRootId: null,
      hasWorkspaceNode: () => false,
    });
    expect(target).toBe(CONTAINER_IDS.LIBRARY);
  });
});
