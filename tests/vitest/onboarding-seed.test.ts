import { seedTestDataSync } from '../../src/entrypoints/test/seed-data';
import * as loroDoc from '../../src/lib/loro-doc';
import { seedOnboardingData, isOnboardingSeeded } from '../../src/lib/onboarding-seed';
import { CONTAINER_IDS, NDX_T, NDX_F } from '../../src/types/index';

beforeEach(() => {
  seedTestDataSync();
});

describe('onboarding seed', () => {
  it('seeds onboarding data when not already seeded', () => {
    // seedTestDataSync creates test data but not onboarding data
    // Force-remove sentinel to ensure clean state
    if (loroDoc.hasNode('onb_welcome')) {
      loroDoc.deleteNode('onb_welcome');
      loroDoc.commitDoc();
    }

    expect(isOnboardingSeeded()).toBe(false);
    seedOnboardingData();
    expect(isOnboardingSeeded()).toBe(true);
  });

  it('is idempotent — second call is no-op', () => {
    seedOnboardingData();
    const nodesBefore = loroDoc.getAllNodeIds().length;
    seedOnboardingData();
    const nodesAfter = loroDoc.getAllNodeIds().length;
    expect(nodesAfter).toBe(nodesBefore);
  });

  it('creates schema nodes under SCHEMA', () => {
    seedOnboardingData();
    expect(loroDoc.hasNode('onb_tagDef_task')).toBe(true);
    expect(loroDoc.getParentId('onb_tagDef_task')).toBe(CONTAINER_IDS.SCHEMA);

    const tagDef = loroDoc.toNodexNode('onb_tagDef_task');
    expect(tagDef?.type).toBe('tagDef');
    expect(tagDef?.showCheckbox).toBe(true);

    // FieldDefs
    expect(loroDoc.hasNode('onb_attrDef_status')).toBe(true);
    expect(loroDoc.hasNode('onb_attrDef_due')).toBe(true);

    // Options
    expect(loroDoc.hasNode('onb_opt_todo')).toBe(true);
    expect(loroDoc.hasNode('onb_opt_in_progress')).toBe(true);
    expect(loroDoc.hasNode('onb_opt_done')).toBe(true);
  });

  it('creates welcome section nodes', () => {
    seedOnboardingData();
    expect(loroDoc.hasNode('onb_welcome')).toBe(true);
    expect(loroDoc.hasNode('onb_tagline')).toBe(true);
    expect(loroDoc.hasNode('onb_basics')).toBe(true);
    expect(loroDoc.hasNode('onb_cmdk')).toBe(true);
    expect(loroDoc.hasNode('onb_journal')).toBe(true);
  });

  it('creates sample clip with #article tag', () => {
    seedOnboardingData();
    expect(loroDoc.hasNode('onb_clip')).toBe(true);

    const clip = loroDoc.toNodexNode('onb_clip');
    expect(clip?.tags).toContain(NDX_T.ARTICLE);
  });

  it('creates task nodes with #task tag', () => {
    seedOnboardingData();

    for (const id of ['onb_task_1', 'onb_task_2', 'onb_task_3', 'onb_task_4', 'onb_task_5']) {
      expect(loroDoc.hasNode(id)).toBe(true);
      const node = loroDoc.toNodexNode(id);
      expect(node?.tags).toContain('onb_tagDef_task');
    }

    // First task should be completed
    const task1 = loroDoc.toNodexNode('onb_task_1');
    expect(task1?.completedAt).toBeGreaterThan(0);
  });

  it('creates keyboard shortcuts section', () => {
    seedOnboardingData();
    expect(loroDoc.hasNode('onb_shortcuts')).toBe(true);
    expect(loroDoc.hasNode('onb_kb_1')).toBe(true);
    expect(loroDoc.hasNode('onb_kb_6')).toBe(true);
  });

  it('creates deletable hint node', () => {
    seedOnboardingData();
    expect(loroDoc.hasNode('onb_deletable')).toBe(true);
  });

  it('creates correct total node count (28 content + 6 schema = ~34 nodes)', () => {
    const before = loroDoc.getAllNodeIds().length;
    seedOnboardingData();
    const after = loroDoc.getAllNodeIds().length;
    // 6 schema + 22 content + 1 deletable hint + fieldEntry/value nodes from tags & fields
    // applyTagMutationsNoCommit creates fieldEntry nodes for template fields
    // setOptionField/setPlainField create fieldEntry + valueNode pairs
    // Exact count varies, but should be at least 29 new visible nodes
    expect(after - before).toBeGreaterThanOrEqual(29);
  });
});
