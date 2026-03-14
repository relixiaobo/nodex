import { describe, expect, it } from 'vitest';
import { resolvePanelNavigationNodeId } from '../../src/components/outliner/OutlinerItem.js';

describe('OutlinerItem panel navigation target', () => {
  it('navigates to targetId for reference nodes', () => {
    expect(resolvePanelNavigationNodeId('ref_123', { targetId: 'target_456' })).toBe('target_456');
  });

  it('navigates to targetId for options value nodes', () => {
    expect(resolvePanelNavigationNodeId('value_node', { targetId: 'skill_node' })).toBe('skill_node');
  });

  it('falls back to nodeId when node has no targetId', () => {
    expect(resolvePanelNavigationNodeId('node_123', {})).toBe('node_123');
  });

  it('falls back to nodeId when node is null', () => {
    expect(resolvePanelNavigationNodeId('node_123', null)).toBe('node_123');
  });
});
