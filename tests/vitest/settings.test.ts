import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resetAndSeed } from './helpers/test-state.js';
import { SYSTEM_NODE_IDS } from '../../src/types/index.js';
import {
  BOOTSTRAP_SYSTEM_NODES,
  QUICK_NAV_SYSTEM_NODES,
  getSystemNodePreset,
  isPaletteSearchableSystemNode,
} from '../../src/lib/system-node-presets.js';
import { getHighlightEnabled, setHighlightEnabled } from '../../src/lib/settings-service.js';
import { SYSTEM_SCHEMA_NODE_IDS } from '../../src/lib/system-schema-presets.js';
import { NDX_F, NDX_T } from '../../src/types/index.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { NodePanel } from '../../src/components/panel/NodePanel.js';
import { SETTINGS_AI_GROUP_NODE_IDS } from '../../src/lib/ai-agent-node.js';

class MockIntersectionObserver {
  constructor(private readonly callback: IntersectionObserverCallback) {}

  observe() {
    this.callback(
      [
        {
          isIntersecting: true,
        } as IntersectionObserverEntry,
      ],
      this as unknown as IntersectionObserver,
    );
  }

  disconnect() {}

  unobserve() {}

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  readonly root = null;
  readonly rootMargin = '0px';
  readonly thresholds = [0];
}

describe('settings system', () => {
  let container: HTMLDivElement;
  let root: Root;
  let originalIntersectionObserver: typeof globalThis.IntersectionObserver | undefined;

  beforeEach(() => {
    resetAndSeed();
    originalIntersectionObserver = globalThis.IntersectionObserver;
    globalThis.IntersectionObserver = MockIntersectionObserver as typeof IntersectionObserver;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    flushSync(() => {
      root.unmount();
    });
    container.remove();
    globalThis.IntersectionObserver = originalIntersectionObserver;
  });

  // ── SETTINGS preset ──

  it('SETTINGS exists in SYSTEM_NODE_IDS', () => {
    expect(SYSTEM_NODE_IDS.SETTINGS).toBe('SETTINGS');
  });

  it('SETTINGS is in the system node presets', () => {
    const meta = getSystemNodePreset(SYSTEM_NODE_IDS.SETTINGS);
    expect(meta).toBeDefined();
    expect(meta!.defaultName).toBe('Settings');
    expect(meta!.iconKey).toBe('settings');
    expect(meta!.bootstrap).toBe(true);
    expect(meta!.locked).toBe(true);
    expect(meta!.paletteSearchable).toBe(true);
  });

  it('SETTINGS is included in bootstrap system nodes', () => {
    const settingsDef = BOOTSTRAP_SYSTEM_NODES.find((c) => c.id === SYSTEM_NODE_IDS.SETTINGS);
    expect(settingsDef).toBeDefined();
    expect(settingsDef!.defaultName).toBe('Settings');
  });

  it('SETTINGS is NOT in quick nav items', () => {
    const found = QUICK_NAV_SYSTEM_NODES.find((c) => c.id === SYSTEM_NODE_IDS.SETTINGS);
    expect(found).toBeUndefined();
  });

  it('SETTINGS remains searchable in the command palette', () => {
    expect(isPaletteSearchableSystemNode(SYSTEM_NODE_IDS.SETTINGS)).toBe(true);
  });

  // ── highlightEnabled (LoroDoc field on SETTINGS node) ──

  it('bootstraps Settings through fixed schema nodes instead of a bespoke page shape', () => {
    expect(loroDoc.getParentId(NDX_T.WORKSPACE_SETTINGS)).toBe(SYSTEM_NODE_IDS.SCHEMA);
    expect(loroDoc.toNodexNode(NDX_T.WORKSPACE_SETTINGS)?.locked).toBe(true);
    expect(loroDoc.getParentId(NDX_T.AI_PROVIDER)).toBe(SYSTEM_NODE_IDS.SCHEMA);
    expect(loroDoc.getParentId(NDX_F.SETTING_HIGHLIGHT_ENABLED)).toBe(NDX_T.WORKSPACE_SETTINGS);
    expect(loroDoc.getParentId(NDX_F.SETTING_AI_PROVIDERS)).toBe(NDX_T.WORKSPACE_SETTINGS);
    expect(loroDoc.getParentId(NDX_F.PROVIDER_ID)).toBe(NDX_T.AI_PROVIDER);
    expect(loroDoc.getParentId(NDX_F.PROVIDER_ENABLED)).toBe(NDX_T.AI_PROVIDER);
    expect(loroDoc.getParentId(NDX_F.PROVIDER_API_KEY)).toBe(NDX_T.AI_PROVIDER);
    expect(loroDoc.getParentId(NDX_F.PROVIDER_BASE_URL)).toBe(NDX_T.AI_PROVIDER);
    expect(loroDoc.getParentId(SYSTEM_SCHEMA_NODE_IDS.SETTINGS_HIGHLIGHT_FIELD_ENTRY)).toBe(SYSTEM_NODE_IDS.SETTINGS);
    expect(loroDoc.getParentId(SETTINGS_AI_GROUP_NODE_IDS.AI)).toBe(SYSTEM_NODE_IDS.SETTINGS);
    expect(loroDoc.toNodexNode(SETTINGS_AI_GROUP_NODE_IDS.AI)?.locked).toBe(true);
    expect(loroDoc.getParentId(SETTINGS_AI_GROUP_NODE_IDS.DEFAULT_AGENTS)).toBe(SETTINGS_AI_GROUP_NODE_IDS.AI);
    expect(loroDoc.getParentId(SYSTEM_SCHEMA_NODE_IDS.SETTINGS_AI_PROVIDERS_FIELD_ENTRY)).toBe(SETTINGS_AI_GROUP_NODE_IDS.AI);
  });

  it('highlightEnabled defaults to true', () => {
    expect(getHighlightEnabled()).toBe(true);
  });

  it('setHighlightEnabled toggles the value', () => {
    setHighlightEnabled(false);
    expect(getHighlightEnabled()).toBe(false);

    setHighlightEnabled(true);
    expect(getHighlightEnabled()).toBe(true);
  });

  it('renders the Settings node panel without triggering a React update loop', () => {
    expect(() => {
      flushSync(() => {
        root.render(React.createElement(NodePanel, { nodeId: SYSTEM_NODE_IDS.SETTINGS }));
      });
    }).not.toThrow();

    expect(container.textContent).toContain('Settings');
    expect(container.textContent).toContain('AI');
    expect(container.textContent).toContain('Highlight & Comment');
    expect(container.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('true');
    expect(container.querySelector('[data-field-row]')?.className).toContain('@md:grid-cols-[clamp(10rem,32%,15rem)_minmax(0,1fr)]');
  });
});
