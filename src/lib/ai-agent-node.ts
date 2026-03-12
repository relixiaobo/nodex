import { nanoid } from 'nanoid';
import { FIELD_TYPES, NDX_F, SYSTEM_NODE_IDS, SYS_T } from '../types/index.js';
import { isOutlinerContentNodeType } from './node-type-utils.js';
import * as loroDoc from './loro-doc.js';

export const DEFAULT_AGENT_MODEL_ID = 'claude-sonnet-4-5';
export const DEFAULT_AGENT_TEMPERATURE = 0.2;
export const DEFAULT_AGENT_MAX_TOKENS = 4000;

export const DEFAULT_PROMPT_LINES = [
  'You are soma, an AI collaborator inside the user\'s knowledge graph.',
  'Operate carefully on the outliner and prefer precise, reversible changes.',
  'Use tools when the user asks you to inspect, create, edit, delete, search, or undo nodes.',
  'When you mention an existing node in your answer, use <ref id="nodeId">display text</ref>.',
  'When you cite evidence from a node, use <cite id="nodeId">N</cite>.',
  'Reply in the user\'s language unless they explicitly ask otherwise.',
];

export const DEFAULT_AGENT_SYSTEM_PROMPT = DEFAULT_PROMPT_LINES.join('\n');

export const AI_AGENT_NODE_IDS = {
  MODEL_OPTION_SONNET: 'NDX_N20',
  MODEL_OPTION_OPUS: 'NDX_N21',
  MODEL_OPTION_HAIKU: 'NDX_N22',
  MODEL_FIELD_ENTRY: 'NDX_FE13',
  TEMPERATURE_FIELD_ENTRY: 'NDX_FE14',
  MAX_TOKENS_FIELD_ENTRY: 'NDX_FE15',
  SKILLS_FIELD_ENTRY: 'NDX_FE16',
  MODEL_VALUE: 'NDX_N23',
  TEMPERATURE_VALUE: 'NDX_N24',
  MAX_TOKENS_VALUE: 'NDX_N25',
} as const;

// Legacy IDs — used only for migration cleanup
const LEGACY_IDS = {
  ALWAYS_ACTIVE_SKILLS_GROUP: 'NDX_N26',
  RULES_GROUP: 'NDX_N27',
};

interface FixedNodePreset {
  id: string;
  parentId: string;
  name?: string;
  data?: Record<string, unknown>;
}

export interface AgentNodeConfig {
  nodeId: string;
  systemPrompt: string;
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
  // Model field (options)
  {
    id: NDX_F.AGENT_MODEL,
    parentId: SYS_T.AGENT,
    name: 'Model',
    data: {
      type: 'fieldDef',
      fieldType: FIELD_TYPES.OPTIONS,
      nullable: false,
      cardinality: 'single',
      description: 'Default model used by the soma agent',
    },
  },
  {
    id: AI_AGENT_NODE_IDS.MODEL_OPTION_SONNET,
    parentId: NDX_F.AGENT_MODEL,
    name: DEFAULT_AGENT_MODEL_ID,
  },
  {
    id: AI_AGENT_NODE_IDS.MODEL_OPTION_OPUS,
    parentId: NDX_F.AGENT_MODEL,
    name: 'claude-opus-4',
  },
  {
    id: AI_AGENT_NODE_IDS.MODEL_OPTION_HAIKU,
    parentId: NDX_F.AGENT_MODEL,
    name: 'claude-haiku-4-5',
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

// ─── Node helpers ───

function ensureNode({ id, parentId, name, data }: FixedNodePreset): void {
  if (!loroDoc.hasNode(id)) {
    loroDoc.createNode(id, parentId);
  } else if (loroDoc.getParentId(id) !== parentId) {
    loroDoc.moveNode(id, parentId);
  }

  const current = loroDoc.toNodexNode(id);
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data ?? {})) {
    if ((current as Record<string, unknown> | null)?.[key] !== value) {
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

// ─── Bootstrap ───

export function ensureAgentNode(workspaceId = loroDoc.getCurrentWorkspaceId() ?? 'ws_default'): string {
  // Schema presets (tagDefs + fieldDefs)
  for (const preset of AGENT_SCHEMA_PRESETS) {
    ensureNode(preset);
  }

  // Agent node itself
  ensureNode({
    id: SYSTEM_NODE_IDS.AGENT,
    parentId: workspaceId,
    name: 'soma',
  });
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

  // Create default prompt as content children (only if no content children exist yet)
  const contentChildren = loroDoc.getChildren(SYSTEM_NODE_IDS.AGENT)
    .filter((id) => {
      const n = loroDoc.toNodexNode(id);
      return n != null && isOutlinerContentNodeType(n.type);
    });
  if (contentChildren.length === 0) {
    for (const line of DEFAULT_PROMPT_LINES) {
      const childId = nanoid();
      loroDoc.createNode(childId, SYSTEM_NODE_IDS.AGENT);
      loroDoc.setNodeRichTextContent(childId, line, [], []);
    }
  }

  // Field entries
  ensureFieldEntry(SYSTEM_NODE_IDS.AGENT, AI_AGENT_NODE_IDS.MODEL_FIELD_ENTRY, NDX_F.AGENT_MODEL);
  ensureTargetValue(
    AI_AGENT_NODE_IDS.MODEL_FIELD_ENTRY,
    AI_AGENT_NODE_IDS.MODEL_VALUE,
    AI_AGENT_NODE_IDS.MODEL_OPTION_SONNET,
  );

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

  ensureFieldEntry(SYSTEM_NODE_IDS.AGENT, AI_AGENT_NODE_IDS.SKILLS_FIELD_ENTRY, NDX_F.AGENT_SKILLS);

  return SYSTEM_NODE_IDS.AGENT;
}

// ─── Reading config ───

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
 * Read system prompt from the agent node's content children.
 * Regular content nodes contribute their name text.
 * Reference nodes resolve to the target's name (+ its children for multi-line content).
 */
function readSystemPromptFromChildren(agentNodeId: string): string {
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
function readSkillIds(fieldEntryId: string): string[] {
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

  const systemPrompt = readSystemPromptFromChildren(SYSTEM_NODE_IDS.AGENT) || DEFAULT_AGENT_SYSTEM_PROMPT;
  const skillIds = readSkillIds(AI_AGENT_NODE_IDS.SKILLS_FIELD_ENTRY);

  return {
    nodeId: SYSTEM_NODE_IDS.AGENT,
    systemPrompt,
    modelId: readOptionFieldName(AI_AGENT_NODE_IDS.MODEL_FIELD_ENTRY) ?? DEFAULT_AGENT_MODEL_ID,
    temperature: readNumberField(AI_AGENT_NODE_IDS.TEMPERATURE_FIELD_ENTRY, DEFAULT_AGENT_TEMPERATURE),
    maxTokens: Math.max(1, Math.round(readNumberField(AI_AGENT_NODE_IDS.MAX_TOKENS_FIELD_ENTRY, DEFAULT_AGENT_MAX_TOKENS))),
    skillIds,
  };
}

// ─── Build system prompt ───

export function buildAgentSystemPrompt(config: AgentNodeConfig = readAgentNodeConfig()): string {
  const sections = [config.systemPrompt.trim()];

  if (config.skillIds.length > 0) {
    const skillLines = config.skillIds
      .map((skillId) => loroDoc.toNodexNode(skillId))
      .filter((node): node is NonNullable<ReturnType<typeof loroDoc.toNodexNode>> => node !== null)
      .map((skillNode) => {
        const ruleLines = loroDoc.getChildren(skillNode.id)
          .map((childId) => loroDoc.toNodexNode(childId))
          .filter((node): node is NonNullable<ReturnType<typeof loroDoc.toNodexNode>> => node !== null)
          .map((node) => (node.name ?? '').trim())
          .filter(Boolean);

        if (ruleLines.length === 0) return `<skill name="${skillNode.name ?? skillNode.id}" />`;
        return `<skill name="${skillNode.name ?? skillNode.id}">\n${ruleLines.map((line) => `- ${line}`).join('\n')}\n</skill>`;
      });

    if (skillLines.length > 0) {
      sections.push(`<skill-context>\n${skillLines.join('\n')}\n</skill-context>`);
    }
  }

  return sections.filter(Boolean).join('\n\n');
}
