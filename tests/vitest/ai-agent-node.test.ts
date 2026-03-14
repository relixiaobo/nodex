import { beforeEach, describe, expect, it } from 'vitest';
import {
  AI_AGENT_NODE_IDS,
  buildAgentSystemPrompt,
  DEFAULT_AGENT_MAX_TOKENS,
  DEFAULT_AGENT_MODEL_ID,
  DEFAULT_AGENT_TEMPERATURE,
  readSkillIds,
  SKILL_NODE_IDS,
} from '../../src/lib/ai-agent-node.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { SYSTEM_NODE_IDS, SYS_T } from '../../src/types/index.js';
import { resetAndSeed } from './helpers/test-state.js';

function createSkillNode({
  id,
  name,
  description,
  ruleText,
}: {
  id: string;
  name: string;
  description?: string;
  ruleText?: string;
}): void {
  loroDoc.createNode(id, SYSTEM_NODE_IDS.SCHEMA);
  loroDoc.setNodeRichTextContent(id, name, [], []);
  loroDoc.addTag(id, SYS_T.SKILL);

  if (description) {
    loroDoc.setNodeData(id, 'description', description);
  }

  if (ruleText) {
    const ruleId = `${id}_rule`;
    loroDoc.createNode(ruleId, id);
    loroDoc.setNodeRichTextContent(ruleId, ruleText, [], []);
  }

  loroDoc.commitDoc('__test__');
}

const BASE_CONFIG = {
  nodeId: SYSTEM_NODE_IDS.AGENT,
  systemPrompt: 'Base prompt',
  modelId: DEFAULT_AGENT_MODEL_ID,
  temperature: DEFAULT_AGENT_TEMPERATURE,
  maxTokens: DEFAULT_AGENT_MAX_TOKENS,
  skillIds: [] as string[],
};

describe('ai agent skill bootstrap and prompt rendering', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('readSkillIds returns the default active skill reference', () => {
    expect(readSkillIds(AI_AGENT_NODE_IDS.SKILLS_FIELD_ENTRY)).toEqual([SKILL_NODE_IDS.REFINE_STRUCTURE]);
  });

  it('buildAgentSystemPrompt renders available-skills index without dumping full rules', () => {
    createSkillNode({
      id: 'skill_test_index',
      name: 'Test skill',
      description: 'Custom description',
      ruleText: 'Unique rule text that should never appear in the system prompt.',
    });

    const prompt = buildAgentSystemPrompt({
      ...BASE_CONFIG,
      skillIds: ['skill_test_index'],
    });

    expect(prompt).toContain('<available-skills>');
    expect(prompt).toContain('<skill id="skill_test_index" name="Test skill" description="Custom description" />');
    expect(prompt).toContain("When you need a skill's detailed rules, use node_read to read the skill node's children.");
    expect(prompt).not.toContain('Unique rule text that should never appear in the system prompt.');
    expect(prompt).not.toContain('<skill-context>');
  });

  it('buildAgentSystemPrompt omits available-skills block when no skills are active', () => {
    const prompt = buildAgentSystemPrompt(BASE_CONFIG);

    expect(prompt).toBe('Base prompt');
    expect(prompt).not.toContain('<available-skills>');
  });

  it('buildAgentSystemPrompt falls back to skill name when description is missing', () => {
    createSkillNode({
      id: 'skill_test_fallback',
      name: 'Fallback skill',
      ruleText: 'Rule text stays behind node_read.',
    });

    const prompt = buildAgentSystemPrompt({
      ...BASE_CONFIG,
      skillIds: ['skill_test_fallback'],
    });

    expect(prompt).toContain('<skill id="skill_test_fallback" name="Fallback skill" description="Fallback skill" />');
    expect(prompt).not.toContain('Rule text stays behind node_read.');
  });
});
