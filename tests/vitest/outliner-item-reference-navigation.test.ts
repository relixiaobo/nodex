import { describe, expect, it } from 'vitest';
import { resolvePanelNavigationNodeId } from '../../src/components/outliner/OutlinerItem.js';

describe('OutlinerItem reference panel navigation target', () => {
  it('navigates to reference target node for reference rows', () => {
    expect(resolvePanelNavigationNodeId('ref_123', 'target_456')).toBe('target_456');
  });

  it('falls back to row node id for normal rows', () => {
    expect(resolvePanelNavigationNodeId('node_123', null)).toBe('node_123');
  });
});
