import { resolveWorkspaceRootTargetId } from '../../src/components/panel/Breadcrumb.js';
import { CONTAINER_IDS } from '../../src/types/index.js';

describe('breadcrumb workspace root target', () => {
  it('always prefers workspaceId when present', () => {
    const target = resolveWorkspaceRootTargetId({
      workspaceId: 'ws_1',
      workspaceRootId: CONTAINER_IDS.INBOX,
    });
    expect(target).toBe('ws_1');
  });

  it('falls back to workspaceRootId when workspaceId is missing', () => {
    const target = resolveWorkspaceRootTargetId({
      workspaceId: null,
      workspaceRootId: CONTAINER_IDS.JOURNAL,
    });
    expect(target).toBe(CONTAINER_IDS.JOURNAL);
  });

  it('falls back to JOURNAL when neither workspaceId nor workspaceRootId is usable', () => {
    const target = resolveWorkspaceRootTargetId({
      workspaceId: null,
      workspaceRootId: null,
    });
    expect(target).toBe(CONTAINER_IDS.JOURNAL);
  });
});
