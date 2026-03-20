import { nanoid } from 'nanoid';
import { FIELD_TYPES, NDX_F, SYSTEM_NODE_IDS, SYS_T } from '../types/index.js';
import { isOutlinerContentNodeType } from './node-type-utils.js';
import * as loroDoc from './loro-doc.js';
import { SYSTEM_SCHEMA_NODE_IDS } from './system-schema-presets.js';

export const DEFAULT_AGENT_MODEL_ID = '';
export const DEFAULT_AGENT_TEMPERATURE = 0.2;
export const DEFAULT_AGENT_MAX_TOKENS = 32_000;

export const DEFAULT_AGENT_SYSTEM_PROMPT = `You are soma, the user's thinking partner. You share a knowledge graph (the outliner) with the user — both of you can create, edit, and connect nodes freely.

Reply in the user's language unless they explicitly ask otherwise.

## How you respond

The user types whatever they want — recording, asking, instructing, thinking out loud. You figure out the intent and respond accordingly.

When the user records something (a decision, idea, observation), save it as a node first, then search the knowledge graph for connections. If you find a meaningful link — a contradiction, a pattern, an echo, an unexpected intersection — mention it naturally. If you don't find anything worth saying, just confirm briefly. Don't force connections that aren't there. A quiet confirmation is always better than a contrived association.

When the user asks a question or wants to explore a topic, search nodes and past chats for relevant context before answering. Your value is answering with the full weight of what the user has thought before, not just your general knowledge.

## Be honest

Say "I don't know" when you don't know. Say "not enough notes yet" when data is sparse. Don't fabricate connections, don't guess at context you haven't checked, don't pretend certainty you don't have. Trust is the foundation — without it, the user won't record, and without records, there's nothing to connect.

## Don't ask operational questions

Save nodes, pick tags, choose structure — just do it. Use the user's existing tags and fields when they fit; create new ones when they don't; skip tags entirely when nothing applies. Never ask "should I save this?", "what tag?", "which format?" — these break the flow of thinking.

The only time to pause and invite judgment is when you discover something cognitively valuable: a contradiction with a past note, a recurring theme, a connection between seemingly unrelated topics. That's not an operational question — it's a thinking opportunity.

## Markup

When mentioning an existing node inline, use <ref id="nodeId">display text</ref>.
When citing a node as evidence, use <cite id="nodeId">N</cite>.
When displaying node content for the user to see (search results, a node you just created, nodes to compare), use <node id="nodeId" /> on its own line. This renders as an interactive outliner the user can expand and edit. Reserve <node /> for when the user benefits from seeing the content — don't use it for every mention.`;

export const AGENT_PAST_CHATS_GUIDANCE = [
  'When the user references past conversations or assumes shared knowledge, use the past_chats tool to search history.',
  'Browse with past_chats() first, then drill into a session with sessionId and a user message with messageId.',
  'Use concrete keywords in query. Do not use past_chats to search the current conversation; the current session is already in context.',
  'Never say you cannot access previous conversations without checking past_chats first.',
  'If past conversations conflict with the current context, prioritize the current context.',
].join('\n');

export const AI_AGENT_NODE_IDS = {
  MODEL_FIELD_ENTRY: 'NDX_FE13',
  TEMPERATURE_FIELD_ENTRY: 'NDX_FE14',
  MAX_TOKENS_FIELD_ENTRY: 'NDX_FE15',
  SKILLS_FIELD_ENTRY: 'NDX_FE16',
  MODEL_VALUE: 'NDX_N23',
  TEMPERATURE_VALUE: 'NDX_N24',
  MAX_TOKENS_VALUE: 'NDX_N25',
  DEFAULT_SKILL_VALUE: 'NDX_N52',
  PROMPT_LINE_0: 'NDX_N53',
  PROMPT_LINE_1: 'NDX_N54',
  PROMPT_LINE_2: 'NDX_N55',
  PROMPT_LINE_3: 'NDX_N56',
  PROMPT_LINE_4: 'NDX_N57',
  PROMPT_LINE_5: 'NDX_N58',
} as const;

export const SKILL_NODE_IDS = {
  SKILL_CREATOR: 'NDX_N40',
  SKILL_CREATOR_RULE_1: 'NDX_N41',
  SKILL_CREATOR_RULE_2: 'NDX_N42',
  SKILL_CREATOR_RULE_3: 'NDX_N43',
  SKILL_CREATOR_RULE_4: 'NDX_N44',
  SKILL_CREATOR_RULE_5: 'NDX_N45',
} as const;

export const SETTINGS_AI_NODE_IDS = {
  AI: 'NDX_N70',
  AGENTS: 'NDX_N71',
  SKILLS: 'NDX_N72',
} as const;

export const SETTINGS_AI_QUERY_NODE_IDS = {
  AGENTS_GROUP: 'NDX_N73',
  AGENTS_TAG: 'NDX_N74',
  SKILLS_GROUP: 'NDX_N75',
  SKILLS_TAG: 'NDX_N76',
} as const;

export const SETTINGS_AI_GROUP_NODE_IDS = {
  AI: SETTINGS_AI_NODE_IDS.AI,
  AGENTS: SETTINGS_AI_NODE_IDS.AGENTS,
  SKILLS: SETTINGS_AI_NODE_IDS.SKILLS,
} as const;

// ─── Spark agent defaults ───

export const SPARK_DEFAULT_TEMPERATURE = 0.5;
export const SPARK_DEFAULT_MAX_TOKENS = 16_000;

export const SPARK_DEFAULT_PROMPT_LINES = [
  'You do two things, only two: extract what this content really says (cognitive framework, NOT summary) and compress it to one sentence.',
  'Return a JSON object: { "napkin": "one-sentence essence", "insights": [...] }',
  'napkin: extreme compression. If you can\'t say it in one sentence, you haven\'t understood it yet — keep thinking.',
  'insights: 3-5 framework nodes. Each has "name" (string) and optional "children" (array, same shape, recursive).',
  'Write insight names in the reader\'s language — no jargon from the source. If a technical term is necessary, immediately follow with a plain analogy.',
  'Self-check: if your insight name is just a section heading reworded, you\'re still on the surface — dig to the real mechanism underneath.',
  'Load-bearing insights (remove them and the argument collapses) MUST have children explaining why. Minor points can be flat.',
  'Children capture: argument chains, implicit assumptions, boundary conditions, tensions. Implicit assumptions are high-value — always surface them.',
  'Distinguish the author\'s claims from cited viewpoints.',
  'Reply in the same language as the source content.',
  'Return ONLY the JSON object, no markdown fences, no explanation.',
];

export const SPARK_DEFAULT_SYSTEM_PROMPT = SPARK_DEFAULT_PROMPT_LINES.join('\n');

export const SPARK_AGENT_NODE_IDS = {
  MODEL_FIELD_ENTRY: 'NDX_FE20',
  TEMPERATURE_FIELD_ENTRY: 'NDX_FE21',
  MAX_TOKENS_FIELD_ENTRY: 'NDX_FE22',
  MODEL_VALUE: 'NDX_N30',
  TEMPERATURE_VALUE: 'NDX_N31',
  MAX_TOKENS_VALUE: 'NDX_N32',
  PROMPT_LINE_0: 'NDX_N59',
  PROMPT_LINE_1: 'NDX_N60',
  PROMPT_LINE_2: 'NDX_N61',
  PROMPT_LINE_3: 'NDX_N62',
  PROMPT_LINE_4: 'NDX_N63',
  PROMPT_LINE_5: 'NDX_N64',
  PROMPT_LINE_6: 'NDX_N65',
  PROMPT_LINE_7: 'NDX_N66',
  PROMPT_LINE_8: 'NDX_N67',
  PROMPT_LINE_9: 'NDX_N68',
  PROMPT_LINE_10: 'NDX_N69',
} as const;

// Legacy IDs — used only for migration cleanup
const LEGACY_IDS = {
  ALWAYS_ACTIVE_SKILLS_GROUP: 'NDX_N26',
  RULES_GROUP: 'NDX_N27',
};

// IDs from deleted default skills (Writing assistant rules, Research + rules)
const LEGACY_SKILL_IDS = ['NDX_N46', 'NDX_N47', 'NDX_N48', 'NDX_N49', 'NDX_N50', 'NDX_N51'];

// Legacy prompt lines — only used to clean up old seeded nodes from earlier versions.
// The actual system prompt is now DEFAULT_AGENT_SYSTEM_PROMPT above.
const LEGACY_PROMPT_LINES = [
  'You are soma, an AI collaborator inside the user\'s knowledge graph.',
  'Operate carefully on the outliner and prefer precise, reversible changes.',
  'Use tools when the user asks you to inspect, create, edit, delete, search, or undo nodes.',
  'When you mention an existing node in your answer, use <ref id="nodeId">display text</ref>.',
  'When you cite evidence from a node, use <cite id="nodeId">N</cite>.',
  'Reply in the user\'s language unless they explicitly ask otherwise.',
  'Use <node id="nodeId" /> on its own line to display a node\'s content as an interactive outliner.',
];

const DEFAULT_PROMPT_PRESETS = LEGACY_PROMPT_LINES.map((text, i) => ({
  id: AI_AGENT_NODE_IDS[`PROMPT_LINE_${i}` as keyof typeof AI_AGENT_NODE_IDS],
  text,
}));

const SPARK_DEFAULT_PROMPT_PRESETS = SPARK_DEFAULT_PROMPT_LINES.map((text, i) => ({
  id: SPARK_AGENT_NODE_IDS[`PROMPT_LINE_${i}` as keyof typeof SPARK_AGENT_NODE_IDS],
  text,
}));

interface FixedNodePreset {
  id: string;
  parentId: string;
  name?: string;
  data?: Record<string, unknown>;
}

interface DefaultSkillPreset {
  id: string;
  name: string;
  description: string;
  rulePresets: ReadonlyArray<{
    id: string;
    text: string;
  }>;
}

export interface AgentNodeConfig {
  nodeId: string;
  userInstructions: string;
  modelId: string;
  temperature: number;
  maxTokens: number;
  skillIds: string[];
}

const AGENT_SCHEMA_PRESETS: ReadonlyArray<FixedNodePreset> = [
  // #agent tagDef
  {
    id: SYS_T.AGENT,
    parentId: SYSTEM_NODE_IDS.SCHEMA,
    name: 'agent',
    data: {
      type: 'tagDef',
      color: 'sage',
      description: 'Agent identity and default configuration',
    },
  },
  // #skill tagDef
  {
    id: SYS_T.SKILL,
    parentId: SYSTEM_NODE_IDS.SCHEMA,
    name: 'skill',
    data: {
      type: 'tagDef',
      color: 'amber',
      description: 'AI skill — reusable prompt/instruction set',
    },
  },
  // Model field (plain text — user types any model name)
  {
    id: NDX_F.AGENT_MODEL,
    parentId: SYS_T.AGENT,
    name: 'Model',
    data: {
      type: 'fieldDef',
      fieldType: FIELD_TYPES.PLAIN,
      nullable: false,
      cardinality: 'single',
      description: 'Default model used by the soma agent',
    },
  },
  // Temperature field (number)
  {
    id: NDX_F.AGENT_TEMPERATURE,
    parentId: SYS_T.AGENT,
    name: 'Temperature',
    data: {
      type: 'fieldDef',
      fieldType: FIELD_TYPES.NUMBER,
      nullable: true,
      cardinality: 'single',
      description: 'Sampling temperature for Chat responses',
    },
  },
  // Max Tokens field (number)
  {
    id: NDX_F.AGENT_MAX_TOKENS,
    parentId: SYS_T.AGENT,
    name: 'Max Tokens',
    data: {
      type: 'fieldDef',
      fieldType: FIELD_TYPES.NUMBER,
      nullable: true,
      cardinality: 'single',
      description: 'Maximum output tokens for Chat responses',
    },
  },
  // Skills field (options_from_supertag → #skill)
  {
    id: NDX_F.AGENT_SKILLS,
    parentId: SYS_T.AGENT,
    name: 'Skills',
    data: {
      type: 'fieldDef',
      fieldType: FIELD_TYPES.OPTIONS_FROM_SUPERTAG,
      sourceSupertag: SYS_T.SKILL,
      nullable: true,
      cardinality: 'list',
      description: 'Active skills available to the agent',
    },
  },
];

const DEFAULT_SKILL_PRESETS: ReadonlyArray<DefaultSkillPreset> = [
  {
    id: SKILL_NODE_IDS.SKILL_CREATOR,
    name: 'Skill creator',
    description: 'Help the user design, create, and refine #skill nodes. Use when the user wants to add a new skill, edit an existing skill, or asks how skills work.',
    rulePresets: [
      {
        id: SKILL_NODE_IDS.SKILL_CREATOR_RULE_1,
        text: 'A skill is a #skill node whose children define the rules the AI follows when that skill is active. Built-in skills live in Library; user-created skills can live anywhere in the graph. Tag it #skill and add rule nodes as children.',
      },
      {
        id: SKILL_NODE_IDS.SKILL_CREATOR_RULE_2,
        text: 'The description field is the trigger — it determines when the skill activates. Write it to describe both what the skill does AND the situations where it should be used.',
      },
      {
        id: SKILL_NODE_IDS.SKILL_CREATOR_RULE_3,
        text: 'Each rule should be one node with one clear instruction. Explain the "why" behind the rule — context helps the AI apply it intelligently in edge cases rather than following it blindly.',
      },
      {
        id: SKILL_NODE_IDS.SKILL_CREATOR_RULE_4,
        text: 'Keep rules specific and actionable. Avoid vague guidance like "be helpful" — instead say exactly what to do and when.',
      },
      {
        id: SKILL_NODE_IDS.SKILL_CREATOR_RULE_5,
        text: 'To activate a skill, add it to the Skills field on the soma #agent node. Test by chatting with scenarios that should trigger the skill.',
      },
    ],
  },
] as const;

const SKILL_INDEX_READ_INSTRUCTION =
  "When you need a skill's detailed rules, use node_read to read the skill node's children.";

const SEARCH_RESULT_EXCLUDED_TYPES = new Set([
  'queryCondition',
  'fieldEntry',
  'reference',
  'tagDef',
  'fieldDef',
  'viewDef',
]);

// ─── Node helpers ───

function ensureNode({ id, parentId, name, data }: FixedNodePreset): void {
  if (!loroDoc.hasNode(id)) {
    loroDoc.createNode(id, parentId);
  } else if (loroDoc.getParentId(id) !== parentId) {
    loroDoc.moveNode(id, parentId);
  }

  const current = loroDoc.toNodexNode(id);
  const currentRecord = current as (Record<string, unknown> | null | undefined);
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data ?? {})) {
    if (currentRecord?.[key] !== value) {
      patch[key] = value;
    }
  }

  if (name !== undefined && current?.name !== name) {
    loroDoc.setNodeRichTextContent(id, name, [], []);
  }
  if (Object.keys(patch).length > 0) {
    loroDoc.setNodeDataBatch(id, patch);
  }
}

function ensureFieldEntry(nodeId: string, fieldEntryId: string, fieldDefId: string): void {
  ensureNode({
    id: fieldEntryId,
    parentId: nodeId,
    data: {
      type: 'fieldEntry',
      fieldDefId,
    },
  });
}

function ensureLibraryNode(workspaceId: string): void {
  if (!loroDoc.hasNode(SYSTEM_NODE_IDS.LIBRARY)) {
    loroDoc.createNode(SYSTEM_NODE_IDS.LIBRARY, workspaceId);
    loroDoc.setNodeRichTextContent(SYSTEM_NODE_IDS.LIBRARY, 'Library', [], []);
    return;
  }

  if (loroDoc.getParentId(SYSTEM_NODE_IDS.LIBRARY) !== workspaceId) {
    loroDoc.moveNode(SYSTEM_NODE_IDS.LIBRARY, workspaceId);
  }

  const libraryNode = loroDoc.toNodexNode(SYSTEM_NODE_IDS.LIBRARY);
  if (!libraryNode?.name?.trim()) {
    loroDoc.setNodeRichTextContent(SYSTEM_NODE_IDS.LIBRARY, 'Library', [], []);
  }
  if (libraryNode?.locked === true) {
    loroDoc.deleteNodeData(SYSTEM_NODE_IDS.LIBRARY, 'locked');
  }
}

function ensureTextValue(fieldEntryId: string, valueNodeId: string, value: string): void {
  const fieldEntry = loroDoc.toNodexNode(fieldEntryId);
  if ((fieldEntry?.children?.length ?? 0) > 0) return;

  ensureNode({
    id: valueNodeId,
    parentId: fieldEntryId,
    name: value,
  });
}

function ensureTargetValue(fieldEntryId: string, valueNodeId: string, targetId: string): void {
  const fieldEntry = loroDoc.toNodexNode(fieldEntryId);
  if ((fieldEntry?.children?.length ?? 0) > 0) return;

  ensureNode({
    id: valueNodeId,
    parentId: fieldEntryId,
    data: { targetId },
  });
}

function ensureSkillNode(skillPreset: DefaultSkillPreset): void {
  ensureNode({
    id: skillPreset.id,
    parentId: SYSTEM_NODE_IDS.LIBRARY,
    name: skillPreset.name,
    data: {
      description: skillPreset.description,
    },
  });

  const skillNode = loroDoc.toNodexNode(skillPreset.id);
  if (!skillNode?.tags.includes(SYS_T.SKILL)) {
    loroDoc.addTag(skillPreset.id, SYS_T.SKILL);
  }

  const contentChildren = loroDoc.getChildren(skillPreset.id)
    .filter((childId) => {
      const child = loroDoc.toNodexNode(childId);
      return child != null && isOutlinerContentNodeType(child.type);
    });

  if (contentChildren.length > 0) return;

  for (const rulePreset of skillPreset.rulePresets) {
    ensureNode({
      id: rulePreset.id,
      parentId: skillPreset.id,
      name: rulePreset.text,
    });
  }
}

function isDefaultPromptPresetNode(nodeId: string, parentId: string, text: string): boolean {
  if (loroDoc.getParentId(nodeId) !== parentId) return false;

  const node = loroDoc.toNodexNode(nodeId);
  if (!node || !isOutlinerContentNodeType(node.type) || node.type === 'reference') return false;
  if ((node.name ?? '').trim() !== text) return false;
  if ((node.description ?? '').trim().length > 0) return false;
  if ((node.tags?.length ?? 0) > 0) return false;
  if (node.targetId) return false;
  if (loroDoc.getChildren(nodeId).length > 0) return false;

  return true;
}

function cleanupSeededPromptPresetNodes(
  parentId: string,
  presets: ReadonlyArray<{ id: string; text: string }>,
): void {
  for (const preset of presets) {
    if (isDefaultPromptPresetNode(preset.id, parentId, preset.text)) {
      loroDoc.deleteNode(preset.id);
    }
  }
}

function moveNodeToIndex(nodeId: string, parentId: string, index: number): void {
  if (!loroDoc.hasNode(nodeId)) return;
  const currentParentId = loroDoc.getParentId(nodeId);
  const siblingCount = currentParentId === parentId
    ? loroDoc.getChildren(parentId).filter((childId) => childId !== nodeId).length
    : loroDoc.getChildren(parentId).length;
  const clampedIndex = Math.max(0, Math.min(index, siblingCount));
  loroDoc.moveNode(nodeId, parentId, clampedIndex);
}

function isInTrash(nodeId: string): boolean {
  let cursor: string | null = nodeId;
  while (cursor) {
    if (cursor === SYSTEM_NODE_IDS.TRASH) return true;
    cursor = loroDoc.getParentId(cursor);
  }
  return false;
}

function isSearchResultCandidate(nodeId: string, excludeNodeId: string): boolean {
  const node = loroDoc.toNodexNode(nodeId);
  if (!node || node.id === excludeNodeId) return false;
  if (node.type && SEARCH_RESULT_EXCLUDED_TYPES.has(node.type)) return false;
  if (node.id === loroDoc.getCurrentWorkspaceId()) return false;
  if (node.locked === true) return false;
  if (isInTrash(node.id)) return false;
  return true;
}

function refreshTaggedSearchNode(searchNodeId: string, tagId: string): void {
  const searchNode = loroDoc.toNodexNode(searchNodeId);
  if (!searchNode || searchNode.type !== 'search') return;

  const matchedIds: string[] = [];
  for (const nodeId of loroDoc.getAllNodeIds()) {
    if (!isSearchResultCandidate(nodeId, searchNodeId)) continue;
    const node = loroDoc.toNodexNode(nodeId);
    if (node?.tags.includes(tagId)) {
      matchedIds.push(nodeId);
    }
  }

  const existingRefs = new Map<string, string>();
  for (const childId of searchNode.children) {
    const child = loroDoc.toNodexNode(childId);
    if (child?.type === 'reference' && child.targetId) {
      existingRefs.set(child.targetId, childId);
    }
  }

  const matchedSet = new Set(matchedIds);
  for (const [targetId, refNodeId] of existingRefs) {
    if (!matchedSet.has(targetId)) {
      loroDoc.deleteNode(refNodeId);
    }
  }

  for (const targetId of matchedIds) {
    if (existingRefs.has(targetId)) continue;
    const refId = nanoid();
    loroDoc.createNode(refId, searchNodeId);
    loroDoc.setNodeDataBatch(refId, {
      type: 'reference',
      targetId,
    });
  }

  loroDoc.setNodeData(searchNodeId, 'lastRefreshedAt', Date.now());
  loroDoc.commitDoc('system:refresh');
}

function ensureTaggedSearchNode(
  searchNodeId: string,
  name: string,
  tagId: string,
  groupId: string,
  leafId: string,
  index: number,
): void {
  ensureNode({
    id: searchNodeId,
    parentId: SETTINGS_AI_NODE_IDS.AI,
    name,
    data: {
      type: 'search',
      locked: true,
    },
  });
  moveNodeToIndex(searchNodeId, SETTINGS_AI_NODE_IDS.AI, index);

  ensureNode({
    id: groupId,
    parentId: searchNodeId,
    data: {
      type: 'queryCondition',
      queryLogic: 'AND',
    },
  });

  ensureNode({
    id: leafId,
    parentId: groupId,
    data: {
      type: 'queryCondition',
      queryOp: 'HAS_TAG',
      queryTagDefId: tagId,
    },
  });
}

function ensureSettingsAIGrouping(): void {
  ensureNode({
    id: SETTINGS_AI_NODE_IDS.AI,
    parentId: SYSTEM_NODE_IDS.SETTINGS,
    name: 'AI',
    data: {
      locked: true,
    },
  });
  moveNodeToIndex(SETTINGS_AI_NODE_IDS.AI, SYSTEM_NODE_IDS.SETTINGS, 0);

  if (loroDoc.hasNode(SYSTEM_SCHEMA_NODE_IDS.SETTINGS_AI_PROVIDERS_FIELD_ENTRY)) {
    moveNodeToIndex(
      SYSTEM_SCHEMA_NODE_IDS.SETTINGS_AI_PROVIDERS_FIELD_ENTRY,
      SETTINGS_AI_NODE_IDS.AI,
      0,
    );
  }

  ensureTaggedSearchNode(
    SETTINGS_AI_NODE_IDS.AGENTS,
    'Agents',
    SYS_T.AGENT,
    SETTINGS_AI_QUERY_NODE_IDS.AGENTS_GROUP,
    SETTINGS_AI_QUERY_NODE_IDS.AGENTS_TAG,
    1,
  );
  ensureTaggedSearchNode(
    SETTINGS_AI_NODE_IDS.SKILLS,
    'Skills',
    SYS_T.SKILL,
    SETTINGS_AI_QUERY_NODE_IDS.SKILLS_GROUP,
    SETTINGS_AI_QUERY_NODE_IDS.SKILLS_TAG,
    2,
  );
}

function refreshSettingsAISearches(): void {
  refreshTaggedSearchNode(SETTINGS_AI_NODE_IDS.AGENTS, SYS_T.AGENT);
  refreshTaggedSearchNode(SETTINGS_AI_NODE_IDS.SKILLS, SYS_T.SKILL);
}

function ensureLibraryChild(nodeId: string, index: number): void {
  ensureSettingsAIGrouping();
  if (!loroDoc.hasNode(nodeId) || !loroDoc.hasNode(SYSTEM_NODE_IDS.LIBRARY)) return;
  moveNodeToIndex(nodeId, SYSTEM_NODE_IDS.LIBRARY, index);
}

// ─── Bootstrap ───

export function ensureAgentNode(workspaceId = loroDoc.getCurrentWorkspaceId() ?? 'ws_default'): string {
  ensureLibraryNode(workspaceId);

  // Schema presets (tagDefs + fieldDefs)
  for (const preset of AGENT_SCHEMA_PRESETS) {
    ensureNode(preset);
  }
  ensureSettingsAIGrouping();

  // Agent node itself
  ensureNode({
    id: SYSTEM_NODE_IDS.AGENT,
    parentId: SYSTEM_NODE_IDS.LIBRARY,
    name: 'soma',
  });
  ensureLibraryChild(SYSTEM_NODE_IDS.AGENT, 0);
  if (!loroDoc.toNodexNode(SYSTEM_NODE_IDS.AGENT)?.tags.includes(SYS_T.AGENT)) {
    loroDoc.addTag(SYSTEM_NODE_IDS.AGENT, SYS_T.AGENT);
  }

  // Migration: clear legacy description (system prompt was stored there)
  const agentNode = loroDoc.toNodexNode(SYSTEM_NODE_IDS.AGENT);
  if (agentNode?.description) {
    loroDoc.deleteNodeData(SYSTEM_NODE_IDS.AGENT, 'description');
  }

  // Migration: remove legacy group nodes
  for (const legacyId of Object.values(LEGACY_IDS)) {
    if (loroDoc.hasNode(legacyId) && loroDoc.getParentId(legacyId) === SYSTEM_NODE_IDS.AGENT) {
      loroDoc.deleteNode(legacyId);
    }
  }

  // Migration: remove deleted default skill nodes (Writing assistant rules, Research + rules)
  for (const legacyId of LEGACY_SKILL_IDS) {
    if (loroDoc.hasNode(legacyId)) {
      loroDoc.deleteNode(legacyId);
    }
  }

  // Default prompt now lives in code. Legacy seeded prompt lines are removed
  // when they still match the old built-in defaults, while custom content
  // remains as user-authored instructions.
  cleanupSeededPromptPresetNodes(SYSTEM_NODE_IDS.AGENT, DEFAULT_PROMPT_PRESETS);

  // Field entries
  ensureFieldEntry(SYSTEM_NODE_IDS.AGENT, AI_AGENT_NODE_IDS.MODEL_FIELD_ENTRY, NDX_F.AGENT_MODEL);
  ensureTextValue(
    AI_AGENT_NODE_IDS.MODEL_FIELD_ENTRY,
    AI_AGENT_NODE_IDS.MODEL_VALUE,
    DEFAULT_AGENT_MODEL_ID,
  );

  // Migration: convert Model value from OPTIONS (targetId → option node) to PLAIN (direct name).
  // Old data has a value node with targetId pointing to a preset option; resolve and inline the name.
  migrateModelValueToPlainText(AI_AGENT_NODE_IDS.MODEL_FIELD_ENTRY);

  ensureFieldEntry(SYSTEM_NODE_IDS.AGENT, AI_AGENT_NODE_IDS.TEMPERATURE_FIELD_ENTRY, NDX_F.AGENT_TEMPERATURE);
  ensureTextValue(
    AI_AGENT_NODE_IDS.TEMPERATURE_FIELD_ENTRY,
    AI_AGENT_NODE_IDS.TEMPERATURE_VALUE,
    String(DEFAULT_AGENT_TEMPERATURE),
  );

  ensureFieldEntry(SYSTEM_NODE_IDS.AGENT, AI_AGENT_NODE_IDS.MAX_TOKENS_FIELD_ENTRY, NDX_F.AGENT_MAX_TOKENS);
  ensureTextValue(
    AI_AGENT_NODE_IDS.MAX_TOKENS_FIELD_ENTRY,
    AI_AGENT_NODE_IDS.MAX_TOKENS_VALUE,
    String(DEFAULT_AGENT_MAX_TOKENS),
  );

  for (const skillPreset of DEFAULT_SKILL_PRESETS) {
    ensureSkillNode(skillPreset);
  }
  moveNodeToIndex(SKILL_NODE_IDS.SKILL_CREATOR, SYSTEM_NODE_IDS.LIBRARY, 2);

  ensureFieldEntry(SYSTEM_NODE_IDS.AGENT, AI_AGENT_NODE_IDS.SKILLS_FIELD_ENTRY, NDX_F.AGENT_SKILLS);
  ensureTargetValue(
    AI_AGENT_NODE_IDS.SKILLS_FIELD_ENTRY,
    AI_AGENT_NODE_IDS.DEFAULT_SKILL_VALUE,
    SKILL_NODE_IDS.SKILL_CREATOR,
  );
  refreshSettingsAISearches();

  return SYSTEM_NODE_IDS.AGENT;
}

// ─── Reading config ───

/**
 * Migration: convert an OPTIONS value node (targetId → option) to plain text (name only).
 * Resolves the target name and writes it as the value node's own name, then clears targetId.
 */
function migrateModelValueToPlainText(fieldEntryId: string): void {
  const fieldEntry = loroDoc.toNodexNode(fieldEntryId);
  const valueNodeId = fieldEntry?.children?.[0];
  if (!valueNodeId) return;
  const valueNode = loroDoc.toNodexNode(valueNodeId);
  if (!valueNode?.targetId) return; // already plain text

  // Resolve the display name from the old option node, write as plain text, clear pointer
  const resolvedName = loroDoc.toNodexNode(valueNode.targetId)?.name ?? DEFAULT_AGENT_MODEL_ID;
  loroDoc.setNodeData(valueNodeId, 'name', resolvedName);
  loroDoc.deleteNodeData(valueNodeId, 'targetId');
}

function readOptionFieldName(fieldEntryId: string): string | null {
  const fieldEntry = loroDoc.toNodexNode(fieldEntryId);
  const valueNodeId = fieldEntry?.children?.[0];
  if (!valueNodeId) return null;
  const valueNode = loroDoc.toNodexNode(valueNodeId);
  if (!valueNode?.targetId) return valueNode?.name ?? null;
  return loroDoc.toNodexNode(valueNode.targetId)?.name ?? null;
}

function readNumberField(fieldEntryId: string, fallback: number): number {
  const fieldEntry = loroDoc.toNodexNode(fieldEntryId);
  const valueNodeId = fieldEntry?.children?.[0];
  const raw = valueNodeId ? loroDoc.toNodexNode(valueNodeId)?.name : null;
  const value = raw == null ? NaN : Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Read user-authored instructions from the agent node's content children.
 * Regular content nodes contribute their name text.
 * Reference nodes resolve to the target's name (+ its children for multi-line content).
 */
function readUserInstructionsFromChildren(agentNodeId: string): string {
  const children = loroDoc.getChildren(agentNodeId);
  const lines: string[] = [];

  for (const childId of children) {
    const child = loroDoc.toNodexNode(childId);
    if (!child || !isOutlinerContentNodeType(child.type)) continue;

    if (child.type === 'reference' && child.targetId) {
      // Resolve reference → use target's content (name + children)
      const target = loroDoc.toNodexNode(child.targetId);
      if (target?.name) lines.push(target.name.trim());
      // Also include the target's children as lines
      for (const grandchildId of loroDoc.getChildren(child.targetId)) {
        const grandchild = loroDoc.toNodexNode(grandchildId);
        if (grandchild && isOutlinerContentNodeType(grandchild.type) && grandchild.name) {
          lines.push(grandchild.name.trim());
        }
      }
    } else if (child.name) {
      lines.push(child.name.trim());
    }
  }

  return lines.filter(Boolean).join('\n');
}

/**
 * Read active skill IDs from the Skills field entry (options_from_supertag).
 * Each value node has a targetId pointing to the selected #skill node.
 */
export function readSkillIds(fieldEntryId: string): string[] {
  const fieldEntry = loroDoc.toNodexNode(fieldEntryId);
  if (!fieldEntry?.children?.length) return [];

  return fieldEntry.children
    .map((valueNodeId) => {
      const valueNode = loroDoc.toNodexNode(valueNodeId);
      return valueNode?.targetId ?? null;
    })
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
}

export function readAgentNodeConfig(): AgentNodeConfig {
  ensureAgentNode();

  const skillIds = readSkillIds(AI_AGENT_NODE_IDS.SKILLS_FIELD_ENTRY);

  return {
    nodeId: SYSTEM_NODE_IDS.AGENT,
    userInstructions: readUserInstructionsFromChildren(SYSTEM_NODE_IDS.AGENT),
    modelId: readOptionFieldName(AI_AGENT_NODE_IDS.MODEL_FIELD_ENTRY) ?? DEFAULT_AGENT_MODEL_ID,
    temperature: readNumberField(AI_AGENT_NODE_IDS.TEMPERATURE_FIELD_ENTRY, DEFAULT_AGENT_TEMPERATURE),
    maxTokens: Math.max(1, Math.round(readNumberField(AI_AGENT_NODE_IDS.MAX_TOKENS_FIELD_ENTRY, DEFAULT_AGENT_MAX_TOKENS))),
    skillIds,
  };
}

// ─── Spark agent bootstrap ───

export function ensureSparkAgentNode(workspaceId = loroDoc.getCurrentWorkspaceId() ?? 'ws_default'): string {
  ensureLibraryNode(workspaceId);

  // Schema presets (shared with main agent — tagDefs + fieldDefs)
  for (const preset of AGENT_SCHEMA_PRESETS) {
    ensureNode(preset);
  }
  ensureSettingsAIGrouping();

  // Spark agent node
  ensureNode({
    id: SYSTEM_NODE_IDS.SPARK_AGENT,
    parentId: SYSTEM_NODE_IDS.LIBRARY,
    name: 'Spark',
  });
  ensureLibraryChild(SYSTEM_NODE_IDS.SPARK_AGENT, 1);
  if (!loroDoc.toNodexNode(SYSTEM_NODE_IDS.SPARK_AGENT)?.tags.includes(SYS_T.AGENT)) {
    loroDoc.addTag(SYSTEM_NODE_IDS.SPARK_AGENT, SYS_T.AGENT);
  }

  cleanupSeededPromptPresetNodes(SYSTEM_NODE_IDS.SPARK_AGENT, SPARK_DEFAULT_PROMPT_PRESETS);

  // Field entries
  ensureFieldEntry(SYSTEM_NODE_IDS.SPARK_AGENT, SPARK_AGENT_NODE_IDS.MODEL_FIELD_ENTRY, NDX_F.AGENT_MODEL);
  ensureTextValue(
    SPARK_AGENT_NODE_IDS.MODEL_FIELD_ENTRY,
    SPARK_AGENT_NODE_IDS.MODEL_VALUE,
    DEFAULT_AGENT_MODEL_ID,
  );

  // Migration: convert Model value from OPTIONS to PLAIN (same as main agent)
  migrateModelValueToPlainText(SPARK_AGENT_NODE_IDS.MODEL_FIELD_ENTRY);

  ensureFieldEntry(SYSTEM_NODE_IDS.SPARK_AGENT, SPARK_AGENT_NODE_IDS.TEMPERATURE_FIELD_ENTRY, NDX_F.AGENT_TEMPERATURE);
  ensureTextValue(
    SPARK_AGENT_NODE_IDS.TEMPERATURE_FIELD_ENTRY,
    SPARK_AGENT_NODE_IDS.TEMPERATURE_VALUE,
    String(SPARK_DEFAULT_TEMPERATURE),
  );

  ensureFieldEntry(SYSTEM_NODE_IDS.SPARK_AGENT, SPARK_AGENT_NODE_IDS.MAX_TOKENS_FIELD_ENTRY, NDX_F.AGENT_MAX_TOKENS);
  ensureTextValue(
    SPARK_AGENT_NODE_IDS.MAX_TOKENS_FIELD_ENTRY,
    SPARK_AGENT_NODE_IDS.MAX_TOKENS_VALUE,
    String(SPARK_DEFAULT_MAX_TOKENS),
  );
  refreshTaggedSearchNode(SETTINGS_AI_NODE_IDS.AGENTS, SYS_T.AGENT);

  return SYSTEM_NODE_IDS.SPARK_AGENT;
}

export function readSparkAgentConfig(): AgentNodeConfig {
  ensureSparkAgentNode();

  return {
    nodeId: SYSTEM_NODE_IDS.SPARK_AGENT,
    userInstructions: readUserInstructionsFromChildren(SYSTEM_NODE_IDS.SPARK_AGENT),
    modelId: readOptionFieldName(SPARK_AGENT_NODE_IDS.MODEL_FIELD_ENTRY) ?? DEFAULT_AGENT_MODEL_ID,
    temperature: readNumberField(SPARK_AGENT_NODE_IDS.TEMPERATURE_FIELD_ENTRY, SPARK_DEFAULT_TEMPERATURE),
    maxTokens: Math.max(1, Math.round(readNumberField(SPARK_AGENT_NODE_IDS.MAX_TOKENS_FIELD_ENTRY, SPARK_DEFAULT_MAX_TOKENS))),
    skillIds: [],
  };
}

// ─── Build system prompt ───

function escapeXmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function buildAgentSystemPrompt(config: AgentNodeConfig = readAgentNodeConfig()): string {
  const sections = [
    DEFAULT_AGENT_SYSTEM_PROMPT,
    AGENT_PAST_CHATS_GUIDANCE,
  ];

  const userInstructions = config.userInstructions.trim();
  if (userInstructions) {
    sections.push(`<user-instructions>\n${userInstructions}\n</user-instructions>`);
  }

  if (config.skillIds.length > 0) {
    const skillLines = config.skillIds
      .map((skillId) => {
        const skillNode = loroDoc.toNodexNode(skillId);
        if (!skillNode) return null;

        const name = (skillNode.name ?? '').trim() || skillNode.id;
        const description = (skillNode.description ?? '').trim() || name;
        return `<skill id="${escapeXmlAttribute(skillNode.id)}" name="${escapeXmlAttribute(name)}" description="${escapeXmlAttribute(description)}" />`;
      })
      .filter((line): line is string => line !== null);

    if (skillLines.length > 0) {
      sections.push(`<available-skills>\n${skillLines.join('\n')}\n</available-skills>`);
      sections.push(SKILL_INDEX_READ_INSTRUCTION);
    }
  }

  return sections.filter(Boolean).join('\n\n');
}

export function buildSparkSystemPrompt(config: AgentNodeConfig = readSparkAgentConfig()): string {
  const sections = [SPARK_DEFAULT_SYSTEM_PROMPT];
  const userInstructions = config.userInstructions.trim();

  if (userInstructions) {
    sections.push(`<user-instructions>\n${userInstructions}\n</user-instructions>`);
  }

  return sections.join('\n\n');
}
