import { resolveWorkspaceRootTargetId } from '../../src/components/panel/Breadcrumb.js';
import { SYSTEM_NODE_IDS } from '../../src/types/index.js';

describe('breadcrumb workspace root target', () => {
  it('always prefers workspaceId when present', () => {
    const target = resolveWorkspaceRootTargetId({
      workspaceId: 'ws_1',
      workspaceRootId: SYSTEM_NODE_IDS.INBOX,
    });
    expect(target).toBe('ws_1');
  });

  it('falls back to workspaceRootId when workspaceId is missing', () => {
    const target = resolveWorkspaceRootTargetId({
      workspaceId: null,
      workspaceRootId: SYSTEM_NODE_IDS.JOURNAL,
    });
    expect(target).toBe(SYSTEM_NODE_IDS.JOURNAL);
  });

  it('falls back to JOURNAL when neither workspaceId nor workspaceRootId is usable', () => {
    const target = resolveWorkspaceRootTargetId({
      workspaceId: null,
      workspaceRootId: null,
    });
    expect(target).toBe(SYSTEM_NODE_IDS.JOURNAL);
  });
});
