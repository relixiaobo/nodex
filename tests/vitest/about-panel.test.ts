import { APP_PANELS, CHAT_PANEL_PREFIX, chatPanelSessionId, isAppPanel, isChatPanel } from '../../src/types/index.js';
import { CHANGELOG } from '../../src/lib/changelog.js';
import { SYSTEM_NODE_PRESETS } from '../../src/lib/system-node-presets.js';

describe('About panel', () => {
  it('APP_PANELS.ABOUT is an app panel, not a node', () => {
    expect(APP_PANELS.ABOUT).toBe('app:about');
    expect(isAppPanel(APP_PANELS.ABOUT)).toBe(true);
  });

  it('chat panel ids use the chat: prefix and expose their session id', () => {
    const panelId = `${CHAT_PANEL_PREFIX}sess_123`;
    expect(isChatPanel(panelId)).toBe(true);
    expect(chatPanelSessionId(panelId)).toBe('sess_123');
  });

  it('ABOUT is not registered in system node presets', () => {
    const aboutEntry = SYSTEM_NODE_PRESETS.find((c) => c.defaultName === 'About');
    expect(aboutEntry).toBeUndefined();
  });

  it('changelog has at least one entry with valid structure', () => {
    expect(CHANGELOG.length).toBeGreaterThanOrEqual(1);
    for (const entry of CHANGELOG) {
      expect(entry.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.items.length).toBeGreaterThan(0);
      for (const item of entry.items) {
        expect(typeof item).toBe('string');
        expect(item.length).toBeGreaterThan(0);
      }
    }
  });
});
