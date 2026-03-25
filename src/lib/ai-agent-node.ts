import { FIELD_TYPES, NDX_F, SYSTEM_NODE_IDS, SYS_T } from '../types/index.js';
import { isOutlinerContentNodeType } from './node-type-utils.js';
import * as loroDoc from './loro-doc.js';
import { SYSTEM_SCHEMA_NODE_IDS } from './system-schema-presets.js';
import { materializeSearchResults } from './search-engine.js';
import {
  SETTINGS_AI_NODE_IDS,
  SETTINGS_AI_QUERY_NODE_IDS,
} from './ai-system-node-ids.js';

export const DEFAULT_AGENT_MODEL_ID = '';
export const DEFAULT_AGENT_TEMPERATURE = 0.2;
export const DEFAULT_AGENT_MAX_TOKENS = 32_000;

export function buildDefaultSystemPrompt(configNodeId: string): string {
  return `You are soma, the user's thinking partner — not their assistant, not their expert, not their teacher. You engage as an intellectual equal. Reply in the user's language. Think globally — your perspective is international, not bound to any single culture or region.

## How you think

You explore ideas with genuine curiosity — and push back when reasoning has gaps. You challenge ideas, never the person. When a premise is shaky, name it directly: "You're assuming X, but what if Y?"

You calibrate confidence honestly:
- High confidence: assert directly, no hedging.
- Medium: "Based on what I know..." with qualifiers.
- Low: "This is speculative, but..."
- Exploratory: "One hypothesis..."
Never pretend certainty you don't have. When data is sparse, say so.

You ask questions that sharpen thinking, not questions that fill space. Prefer "What specifically do you mean by X?" over "Would you like to explore this further?"

You act, then explain. When you see something worth recording, record it. When you see a connection, surface it. Never ask permission for what you should obviously just do.

## How you grow

Your config is node ${configNodeId}. Its children are your persistent instructions. When the user asks you to change how you work, update this node so the change carries forward.

## Context

Messages may contain <system-reminder> blocks injected by soma. These provide background context (current view, time, open tabs) — NOT user intent. Never use system-reminder content to guess what the user is asking about. Only respond to what the user explicitly says.

## Markup

When mentioning an existing node inline, use <ref id="nodeId">display text</ref>.
When citing a source, use <cite type="TYPE" id="ID">N</cite> where TYPE is:
- "node" for knowledge graph nodes (default if type is omitted)
- "chat" for past chat sessions (use the session ID from past_chats results)
- "url" for web pages
N is a sequential number (1, 2, 3...).
When displaying node content for the user to see (search results, a node you just created, nodes to compare), use <node id="nodeId" /> on its own line. This renders as an interactive outliner the user can expand and edit. Reserve <node /> for when the user benefits from seeing the content — not for every mention.`;
}

// Legacy export for tests that reference DEFAULT_AGENT_SYSTEM_PROMPT
export const DEFAULT_AGENT_SYSTEM_PROMPT = buildDefaultSystemPrompt(SYSTEM_NODE_IDS.AGENT);

// Legacy — past chats guidance now lives in the Chat recall skill.
// Kept as unused export for backward compatibility with any external references.
export const AGENT_PAST_CHATS_GUIDANCE = '';

export const AI_AGENT_NODE_IDS = {
  MODEL_FIELD_ENTRY: 'NDX_FE13',
  TEMPERATURE_FIELD_ENTRY: 'NDX_FE14',
  MAX_TOKENS_FIELD_ENTRY: 'NDX_FE15',
  SKILLS_FIELD_ENTRY: 'NDX_FE16',
  MODEL_VALUE: 'NDX_N23',
  TEMPERATURE_VALUE: 'NDX_N24',
  MAX_TOKENS_VALUE: 'NDX_N25',
  DEFAULT_SKILL_VALUE: 'NDX_N52',
  KNOWLEDGE_MGMT_SKILL_VALUE: 'NDX_N87',
  MEMORY_SKILL_VALUE: 'NDX_N88',
  PROMPT_LINE_0: 'NDX_N53',
  PROMPT_LINE_1: 'NDX_N54',
  PROMPT_LINE_2: 'NDX_N55',
  PROMPT_LINE_3: 'NDX_N56',
  PROMPT_LINE_4: 'NDX_N57',
  PROMPT_LINE_5: 'NDX_N58',
} as const;

const DEFAULT_AGENT_PROMPT_PRESET_IDS = [
  AI_AGENT_NODE_IDS.PROMPT_LINE_0,
  AI_AGENT_NODE_IDS.PROMPT_LINE_1,
  AI_AGENT_NODE_IDS.PROMPT_LINE_2,
  AI_AGENT_NODE_IDS.PROMPT_LINE_3,
  AI_AGENT_NODE_IDS.PROMPT_LINE_4,
  AI_AGENT_NODE_IDS.PROMPT_LINE_5,
] as const;

export const SKILL_NODE_IDS = {
  SKILL_CREATOR: 'NDX_N40',
  SKILL_CREATOR_RULE_1: 'NDX_N41',
  SKILL_CREATOR_RULE_2: 'NDX_N42',
  SKILL_CREATOR_RULE_3: 'NDX_N43',
  SKILL_CREATOR_RULE_4: 'NDX_N44',
  KNOWLEDGE_MGMT: 'NDX_N80',
  KNOWLEDGE_MGMT_RULE_1: 'NDX_N81',
  KNOWLEDGE_MGMT_RULE_2: 'NDX_N82',
  KNOWLEDGE_MGMT_RULE_3: 'NDX_N83',
  KNOWLEDGE_MGMT_RULE_4: 'NDX_N84',
  MEMORY: 'NDX_N85',
  MEMORY_RULE_1: 'NDX_N86_R1',
  MEMORY_RULE_2: 'NDX_N86_R2',
  MEMORY_RULE_3: 'NDX_N86_R3',
  SKILL_CREATOR_RULE_5: 'NDX_N45',
} as const;

export {
  SETTINGS_AI_GROUP_NODE_IDS,
  SETTINGS_AI_NODE_IDS,
  SETTINGS_AI_QUERY_NODE_IDS,
} from './ai-system-node-ids.js';

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

const DEFAULT_PROMPT_PRESETS = buildDefaultSystemPrompt(SYSTEM_NODE_IDS.AGENT)
  .split('\n')
  .filter((line) => line.trim().length > 0)
  .map((text, index) => ({
    id: DEFAULT_AGENT_PROMPT_PRESET_IDS[index] ?? `NDX_AGENT_PROMPT_${index}`,
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
    id: SKILL_NODE_IDS.KNOWLEDGE_MGMT,
    name: 'Node organizer',
    description: 'Record, search, connect, and organize nodes in the knowledge graph. Use when the user records something, asks about their notes, or when you discover connections between ideas.',
    rulePresets: [
      {
        id: SKILL_NODE_IDS.KNOWLEDGE_MGMT_RULE_1,
        text: 'When the user shares something worth preserving, save it as a node and show it with <node id="..." />. Then search for connections across the knowledge graph — contradictions, echoes, patterns. If you find one, name it specifically. If not, confirm briefly and move on. Never force connections.',
      },
      {
        id: SKILL_NODE_IDS.KNOWLEDGE_MGMT_RULE_2,
        text: 'Use existing tags and fields. Create new ones only when nothing fits. Skip tags when nothing applies. Never ask operational questions — just act.',
      },
      {
        id: SKILL_NODE_IDS.KNOWLEDGE_MGMT_RULE_3,
        text: 'Only preserve things that outlast the current conversation: decisions, conclusions, long-term preferences. Daily chat details do not need nodes. A lean graph is more valuable than a bloated one.',
      },
      {
        id: SKILL_NODE_IDS.KNOWLEDGE_MGMT_RULE_4,
        text: 'Look for patterns across time. When the user mentions something they have written about before — even weeks ago — connect it. "You noted X last week, and now you are saying Y. Those seem to pull in different directions." Help the user see their own intellectual trajectory.',
      },
    ],
  },
  {
    id: SKILL_NODE_IDS.MEMORY,
    name: 'Chat recall',
    description: 'Search and recall past conversations. Use when the user references past discussions, assumes shared context, or when you need to ground your answer in what was previously discussed.',
    rulePresets: [
      {
        id: SKILL_NODE_IDS.MEMORY_RULE_1,
        text: 'Before answering, search nodes and past chats for relevant context. Your value is answering with the full weight of what the user has thought before, not just general knowledge. When citing past context, mark your confidence: "You discussed X in detail (high confidence)" vs "I think you mentioned something related (low confidence, let me check)."',
      },
      {
        id: SKILL_NODE_IDS.MEMORY_RULE_2,
        text: 'Use past_chats() to browse recent sessions, then drill in with sessionId and messageId. Use concrete keywords (names, concepts, decisions), not meta words like "discussed" or "mentioned". Never say you cannot access previous conversations without checking past_chats first.',
      },
      {
        id: SKILL_NODE_IDS.MEMORY_RULE_3,
        text: 'If past conversations conflict with the current context, prioritize the current context. The user\'s thinking evolves — do not anchor on outdated information. When you notice evolution, name it: "Last time you leaned toward X, now you seem to prefer Y. What changed?"',
      },
    ],
  },
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

interface LockedContentPreset {
  id: string;
  text: string;
}

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
    loroDoc.setNodeData(SYSTEM_NODE_IDS.LIBRARY, 'locked', true);
    return;
  }

  if (loroDoc.getParentId(SYSTEM_NODE_IDS.LIBRARY) !== workspaceId) {
    loroDoc.moveNode(SYSTEM_NODE_IDS.LIBRARY, workspaceId);
  }

  const libraryNode = loroDoc.toNodexNode(SYSTEM_NODE_IDS.LIBRARY);
  if (!libraryNode?.name?.trim()) {
    loroDoc.setNodeRichTextContent(SYSTEM_NODE_IDS.LIBRARY, 'Library', [], []);
  }
  if (libraryNode?.locked !== true) {
    loroDoc.setNodeData(SYSTEM_NODE_IDS.LIBRARY, 'locked', true);
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

function syncLockedContentChildren(parentId: string, presets: ReadonlyArray<LockedContentPreset>): void {
  for (const [index, preset] of presets.entries()) {
    ensureNode({
      id: preset.id,
      parentId,
      name: preset.text,
      data: {
        locked: true,
      },
    });
    moveNodeToIndex(preset.id, parentId, index);
  }

  const presetIds = new Set(presets.map((preset) => preset.id));
  for (const childId of loroDoc.getChildren(parentId)) {
    if (presetIds.has(childId)) continue;

    const child = loroDoc.toNodexNode(childId);
    if (!child?.locked) continue;
    if (!isOutlinerContentNodeType(child.type) || child.type === 'reference') continue;

    loroDoc.deleteNode(childId);
  }
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
      locked: true,
    },
  });

  const skillNode = loroDoc.toNodexNode(skillPreset.id);
  if (!skillNode?.tags.includes(SYS_T.SKILL)) {
    loroDoc.addTag(skillPreset.id, SYS_T.SKILL);
  }

  syncLockedContentChildren(skillPreset.id, skillPreset.rulePresets);
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
  materializeSearchResults(SETTINGS_AI_NODE_IDS.AGENTS);
  materializeSearchResults(SETTINGS_AI_NODE_IDS.SKILLS);
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

  syncLockedContentChildren(SYSTEM_NODE_IDS.AGENT, DEFAULT_PROMPT_PRESETS);

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
  ensureTargetValue(
    AI_AGENT_NODE_IDS.SKILLS_FIELD_ENTRY,
    AI_AGENT_NODE_IDS.KNOWLEDGE_MGMT_SKILL_VALUE,
    SKILL_NODE_IDS.KNOWLEDGE_MGMT,
  );
  ensureTargetValue(
    AI_AGENT_NODE_IDS.SKILLS_FIELD_ENTRY,
    AI_AGENT_NODE_IDS.MEMORY_SKILL_VALUE,
    SKILL_NODE_IDS.MEMORY,
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
    if (child.locked) continue;

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

  syncLockedContentChildren(SYSTEM_NODE_IDS.SPARK_AGENT, SPARK_DEFAULT_PROMPT_PRESETS);

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
  materializeSearchResults(SETTINGS_AI_NODE_IDS.AGENTS);

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
    buildDefaultSystemPrompt(config.nodeId),
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

/**
 * Write the selected model ID back to the #agent node's Model field.
 * Called when user picks a model in the Chat UI — persists across new chats.
 */
export function writeAgentModelSelection(modelId: string): void {
  const valueNode = loroDoc.toNodexNode(AI_AGENT_NODE_IDS.MODEL_VALUE);
  if (!valueNode) return;
  if (valueNode.name === modelId) return;
  loroDoc.setNodeRichTextContent(AI_AGENT_NODE_IDS.MODEL_VALUE, modelId, [], []);
  loroDoc.commitDoc();
}

export function buildSparkSystemPrompt(config: AgentNodeConfig = readSparkAgentConfig()): string {
  const sections = [SPARK_DEFAULT_SYSTEM_PROMPT];
  const userInstructions = config.userInstructions.trim();

  if (userInstructions) {
    sections.push(`<user-instructions>\n${userInstructions}\n</user-instructions>`);
  }

  return sections.join('\n\n');
}
