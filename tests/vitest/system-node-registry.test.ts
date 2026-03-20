import { describe, it, expect } from 'vitest';
import { SYSTEM_NODE_IDS } from '../../src/types/index.js';
import { SYSTEM_TAGS } from '../../src/types/system-nodes.js';
import {
  SYSTEM_NODE_PRESETS,
  BOOTSTRAP_SYSTEM_NODES,
  QUICK_NAV_SYSTEM_NODES,
  getSystemNodePreset,
} from '../../src/lib/system-node-presets.js';
import { SETTINGS_AI_NODE_IDS } from '../../src/lib/ai-agent-node.js';

describe('system node presets', () => {
  it('contains all declared system and journal schema node ids exactly once', () => {
    const ids = SYSTEM_NODE_PRESETS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids)).toEqual(new Set([
      ...Object.values(SYSTEM_NODE_IDS),
      ...Object.values(SETTINGS_AI_NODE_IDS),
      SYSTEM_TAGS.DAY,
      SYSTEM_TAGS.WEEK,
      SYSTEM_TAGS.YEAR,
    ]));
  });

  it('bootstraps workspace roots including Library', () => {
    expect(BOOTSTRAP_SYSTEM_NODES.map((c) => c.id)).toEqual([
      SYSTEM_NODE_IDS.JOURNAL,
      SYSTEM_NODE_IDS.LIBRARY,
      SYSTEM_NODE_IDS.TRASH,
      SYSTEM_NODE_IDS.SCHEMA,
      SYSTEM_NODE_IDS.SETTINGS,
    ]);
  });

  it('keeps quick navigation only for Journal and Trash', () => {
    expect(QUICK_NAV_SYSTEM_NODES.map((c) => c.id)).toEqual([
      SYSTEM_NODE_IDS.JOURNAL,
      SYSTEM_NODE_IDS.TRASH,
    ]);
  });

  it('exposes metadata lookup by id', () => {
    expect(getSystemNodePreset(SYSTEM_NODE_IDS.SCHEMA)?.defaultName).toBe('Schema');
    expect(getSystemNodePreset(SYSTEM_NODE_IDS.CLIPS)?.bootstrap).toBe(false);
    expect(getSystemNodePreset(SYSTEM_NODE_IDS.INBOX)?.locked).toBe(false);
    expect(getSystemNodePreset(SYSTEM_TAGS.DAY)?.locked).toBe(true);
    expect(getSystemNodePreset(SYSTEM_TAGS.DAY)?.canEditStructure).toBe(true);
  });
});
