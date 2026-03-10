import { describe, it, expect } from 'vitest';
import { CONTAINER_IDS } from '../../src/types/index.js';
import { SYSTEM_TAGS } from '../../src/types/system-nodes.js';
import {
  SYSTEM_NODE_PRESETS,
  BOOTSTRAP_SYSTEM_NODES,
  QUICK_NAV_SYSTEM_NODES,
  getSystemNodePreset,
} from '../../src/lib/system-node-presets.js';

describe('system node presets', () => {
  it('contains all declared system root and journal schema node ids exactly once', () => {
    const ids = SYSTEM_NODE_PRESETS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids)).toEqual(new Set([
      ...Object.values(CONTAINER_IDS),
      SYSTEM_TAGS.DAY,
      SYSTEM_TAGS.WEEK,
      SYSTEM_TAGS.YEAR,
    ]));
  });

  it('bootstraps only locked system roots', () => {
    expect(BOOTSTRAP_SYSTEM_NODES.map((c) => c.id)).toEqual([
      CONTAINER_IDS.JOURNAL,
      CONTAINER_IDS.TRASH,
      CONTAINER_IDS.SCHEMA,
      CONTAINER_IDS.SETTINGS,
    ]);
  });

  it('keeps quick navigation only for Journal and Trash', () => {
    expect(QUICK_NAV_SYSTEM_NODES.map((c) => c.id)).toEqual([
      CONTAINER_IDS.JOURNAL,
      CONTAINER_IDS.TRASH,
    ]);
  });

  it('exposes metadata lookup by id', () => {
    expect(getSystemNodePreset(CONTAINER_IDS.SCHEMA)?.defaultName).toBe('Schema');
    expect(getSystemNodePreset(CONTAINER_IDS.CLIPS)?.bootstrap).toBe(false);
    expect(getSystemNodePreset(CONTAINER_IDS.INBOX)?.locked).toBe(false);
    expect(getSystemNodePreset(SYSTEM_TAGS.DAY)?.locked).toBe(true);
    expect(getSystemNodePreset(SYSTEM_TAGS.DAY)?.canEditStructure).toBe(true);
  });
});
