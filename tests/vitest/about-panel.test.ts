import { CONTAINER_IDS } from '../../src/types/index.js';
import { CHANGELOG } from '../../src/lib/changelog.js';
import { SYSTEM_CONTAINER_REGISTRY } from '../../src/lib/system-node-registry.js';

describe('About panel', () => {
  it('CONTAINER_IDS.ABOUT exists', () => {
    expect(CONTAINER_IDS.ABOUT).toBe('ABOUT');
  });

  it('ABOUT container is registered in system-node-registry', () => {
    const aboutEntry = SYSTEM_CONTAINER_REGISTRY.find((c) => c.id === CONTAINER_IDS.ABOUT);
    expect(aboutEntry).toBeDefined();
    expect(aboutEntry!.defaultName).toBe('About');
    expect(aboutEntry!.seedInWorkspace).toBe(true);
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
