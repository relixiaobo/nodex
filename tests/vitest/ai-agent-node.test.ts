import { beforeEach, describe, expect, it } from 'vitest';
import {
  AI_AGENT_NODE_IDS,
  buildDefaultSystemPrompt,
  buildAgentSystemPrompt,
  DEFAULT_AGENT_SYSTEM_PROMPT,
  DEFAULT_AGENT_MAX_TOKENS,
  DEFAULT_AGENT_MODEL_ID,
  DEFAULT_AGENT_TEMPERATURE,
  ensureAgentNode,
  readAgentNodeConfig,
  readSkillIds,
  SETTINGS_AI_NODE_IDS,
  SKILL_NODE_IDS,
} from '../../src/lib/ai-agent-node.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { SYSTEM_NODE_IDS, SYS_T } from '../../src/types/index.js';
import { runSearch } from '../../src/lib/search-engine.js';
import { resetAndSeed } from './helpers/test-state.js';
import { isOutlinerContentNodeType } from '../../src/lib/node-type-utils.js';

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
  userInstructions: 'Base prompt',
  modelId: DEFAULT_AGENT_MODEL_ID,
  temperature: DEFAULT_AGENT_TEMPERATURE,
  maxTokens: DEFAULT_AGENT_MAX_TOKENS,
  skillIds: [] as string[],
};

function getContentChildren(parentId: string): string[] {
  return loroDoc.getChildren(parentId)
    .filter((id) => {
      const node = loroDoc.toNodexNode(id);
      return node != null && isOutlinerContentNodeType(node.type);
    });
}

describe('ai agent skill bootstrap and prompt rendering', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('readSkillIds returns the default active skill reference', () => {
    expect(readSkillIds(AI_AGENT_NODE_IDS.SKILLS_FIELD_ENTRY)).toEqual([SKILL_NODE_IDS.SKILL_CREATOR]);
  });

  it('places the built-in skill under Library', () => {
    expect(loroDoc.getParentId(SKILL_NODE_IDS.SKILL_CREATOR)).toBe(SYSTEM_NODE_IDS.LIBRARY);
    expect(loroDoc.toNodexNode(SKILL_NODE_IDS.SKILL_CREATOR)?.tags).toContain(SYS_T.SKILL);
    expect(loroDoc.toNodexNode(SKILL_NODE_IDS.SKILL_CREATOR)?.locked).toBe(true);
    expect(loroDoc.toNodexNode(SKILL_NODE_IDS.SKILL_CREATOR_RULE_1)?.locked).toBe(true);
  });

  it('uses fixed Settings AI search nodes to aggregate all agents and skills', () => {
    loroDoc.createNode('custom_agent', 'note_1');
    loroDoc.setNodeRichTextContent('custom_agent', 'Custom agent', [], []);
    loroDoc.addTag('custom_agent', SYS_T.AGENT);

    createSkillNode({
      id: 'skill_custom_anywhere',
      name: 'Custom skill',
      description: 'User-authored skill',
      ruleText: 'Custom rule',
    });

    const agentsSearch = loroDoc.toNodexNode(SETTINGS_AI_NODE_IDS.AGENTS);
    const skillsSearch = loroDoc.toNodexNode(SETTINGS_AI_NODE_IDS.SKILLS);

    expect(loroDoc.getParentId(SETTINGS_AI_NODE_IDS.AGENTS)).toBe(SETTINGS_AI_NODE_IDS.AI);
    expect(loroDoc.getParentId(SETTINGS_AI_NODE_IDS.SKILLS)).toBe(SETTINGS_AI_NODE_IDS.AI);
    expect(agentsSearch?.type).toBe('search');
    expect(skillsSearch?.type).toBe('search');

    expect(Array.from(runSearch(SETTINGS_AI_NODE_IDS.AGENTS))).toEqual(
      expect.arrayContaining([SYSTEM_NODE_IDS.AGENT, 'custom_agent']),
    );
    expect(Array.from(runSearch(SETTINGS_AI_NODE_IDS.SKILLS))).toEqual(
      expect.arrayContaining([SKILL_NODE_IDS.SKILL_CREATOR, 'skill_custom_anywhere']),
    );
  });

  it('syncs official skill rules while preserving user-authored children', () => {
    loroDoc.setNodeRichTextContent(SKILL_NODE_IDS.SKILL_CREATOR_RULE_1, 'stale rule text', [], []);
    loroDoc.deleteNode(SKILL_NODE_IDS.SKILL_CREATOR_RULE_5);

    loroDoc.createNode('legacy_official_skill_rule', SKILL_NODE_IDS.SKILL_CREATOR);
    loroDoc.setNodeRichTextContent('legacy_official_skill_rule', 'Legacy official rule', [], []);
    loroDoc.setNodeData('legacy_official_skill_rule', 'locked', true);

    loroDoc.createNode('user_skill_rule', SKILL_NODE_IDS.SKILL_CREATOR);
    loroDoc.setNodeRichTextContent('user_skill_rule', 'User-authored supplement', [], []);

    ensureAgentNode();

    expect(loroDoc.toNodexNode(SKILL_NODE_IDS.SKILL_CREATOR_RULE_1)?.name).toBe(
      'A skill is a #skill node whose children define the rules the AI follows when that skill is active. Built-in skills live in Library; user-created skills can live anywhere in the graph. Tag it #skill and add rule nodes as children.',
    );
    expect(loroDoc.toNodexNode(SKILL_NODE_IDS.SKILL_CREATOR_RULE_1)?.locked).toBe(true);
    expect(loroDoc.hasNode(SKILL_NODE_IDS.SKILL_CREATOR_RULE_5)).toBe(true);
    expect(loroDoc.toNodexNode(SKILL_NODE_IDS.SKILL_CREATOR_RULE_5)?.locked).toBe(true);
    expect(loroDoc.hasNode('legacy_official_skill_rule')).toBe(false);
    expect(loroDoc.getParentId('user_skill_rule')).toBe(SKILL_NODE_IDS.SKILL_CREATOR);
    expect(loroDoc.toNodexNode('user_skill_rule')?.name).toBe('User-authored supplement');
    expect(loroDoc.toNodexNode('user_skill_rule')?.locked).toBeUndefined();
  });

  it('syncs locked default prompt children while keeping user instructions separate', () => {
    const promptLines = buildDefaultSystemPrompt(SYSTEM_NODE_IDS.AGENT)
      .split('\n')
      .filter((line) => line.trim().length > 0);

    loroDoc.setNodeRichTextContent(AI_AGENT_NODE_IDS.PROMPT_LINE_0, 'Stale default prompt', [], []);
    loroDoc.deleteNode(AI_AGENT_NODE_IDS.PROMPT_LINE_5);

    loroDoc.createNode('legacy_locked_prompt', SYSTEM_NODE_IDS.AGENT);
    loroDoc.setNodeRichTextContent('legacy_locked_prompt', 'Legacy locked prompt', [], []);
    loroDoc.setNodeData('legacy_locked_prompt', 'locked', true);

    loroDoc.createNode('user_prompt_note', SYSTEM_NODE_IDS.AGENT);
    loroDoc.setNodeRichTextContent('user_prompt_note', 'User prompt addition', [], []);

    ensureAgentNode();

    const contentChildren = getContentChildren(SYSTEM_NODE_IDS.AGENT);
    expect(contentChildren).toHaveLength(promptLines.length + 1);
    expect(loroDoc.toNodexNode(AI_AGENT_NODE_IDS.PROMPT_LINE_0)?.name).toBe(promptLines[0]);
    expect(loroDoc.toNodexNode(AI_AGENT_NODE_IDS.PROMPT_LINE_0)?.locked).toBe(true);
    expect(loroDoc.hasNode(AI_AGENT_NODE_IDS.PROMPT_LINE_5)).toBe(true);
    expect(loroDoc.toNodexNode(AI_AGENT_NODE_IDS.PROMPT_LINE_5)?.locked).toBe(true);
    expect(loroDoc.hasNode('legacy_locked_prompt')).toBe(false);
    expect(loroDoc.getParentId('user_prompt_note')).toBe(SYSTEM_NODE_IDS.AGENT);

    const config = readAgentNodeConfig();

    expect(config.userInstructions).toBe('User prompt addition');
    expect(config.skillIds).toEqual([SKILL_NODE_IDS.SKILL_CREATOR]);
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

    expect(prompt).toContain(DEFAULT_AGENT_SYSTEM_PROMPT);
    expect(prompt).toContain('How you think');
    expect(prompt).toContain('<user-instructions>');
    expect(prompt).toContain('Base prompt');
    expect(prompt).toContain('<available-skills>');
    expect(prompt).toContain('<skill id="skill_test_index" name="Test skill" description="Custom description" />');
    expect(prompt).toContain("When you need a skill's detailed rules, use node_read to read the skill node's children.");
    expect(prompt).not.toContain('Unique rule text that should never appear in the system prompt.');
    expect(prompt).not.toContain('<skill-context>');
  });

  it('buildAgentSystemPrompt omits available-skills block when no skills are active', () => {
    const prompt = buildAgentSystemPrompt(BASE_CONFIG);

    expect(prompt).toContain(DEFAULT_AGENT_SYSTEM_PROMPT);
    expect(prompt).toContain('How you think');
    expect(prompt).toContain('<user-instructions>\nBase prompt\n</user-instructions>');
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
