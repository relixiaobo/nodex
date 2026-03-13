/**
 * Extraction presets — predefined #skill rules for Spark structure extraction.
 *
 * These are hardcoded rule sets used until the user creates their own #skill
 * nodes. Phase 5 will let users edit and extend these via the UI.
 *
 * Phase 2 additions:
 * - ensureDefaultSkillNodes() — bootstrap 4 default #skill nodes with rules as children
 * - getSkillBasedRules() — read rules from matching #skill node, fallback to presets
 */

import * as loroDoc from '../loro-doc.js';
import { SYS_T, NDX_F, FIELD_TYPES, SYSTEM_NODE_IDS } from '../../types/index.js';

// ─── Hardcoded presets (fallback) ───

export const ARTICLE_EXTRACTION_RULES: readonly string[] = [
  'Extract the core argumentation framework, not a list of bullet-point summaries.',
  'Identify implicit assumptions and boundary conditions the author relies on.',
  'Distinguish the author\'s own claims from cited or referenced viewpoints.',
  'Surface the logical structure: premise \u2192 reasoning \u2192 conclusion.',
  'Note any tensions or contradictions within the argument.',
];

export const VIDEO_EXTRACTION_RULES: readonly string[] = [
  'Extract the core structure of the presentation or discussion.',
  'Identify key arguments and their supporting evidence.',
  'Distinguish between the speaker\'s conclusions and cited sources.',
  'Note any demonstrated techniques or workflows.',
];

export const SOCIAL_EXTRACTION_RULES: readonly string[] = [
  'Extract the core claim or observation being made.',
  'Identify the implicit context the author assumes the reader knows.',
  'Note whether this is an original insight, a reaction, or a summary.',
];

export const GENERAL_EXTRACTION_RULES: readonly string[] = [
  'Extract the core structure and key concepts of the content.',
  'Identify the main arguments and their supporting evidence.',
  'Distinguish between primary claims and supporting details.',
  'Note implicit assumptions or boundary conditions.',
];

/**
 * Get extraction rules based on content type (hardcoded fallback).
 *
 * @param contentType - The clip type (article, video, social, or source/general)
 */
export function getExtractionRules(contentType?: string): readonly string[] {
  switch (contentType) {
    case 'article':
      return ARTICLE_EXTRACTION_RULES;
    case 'video':
      return VIDEO_EXTRACTION_RULES;
    case 'social':
      return SOCIAL_EXTRACTION_RULES;
    default:
      return GENERAL_EXTRACTION_RULES;
  }
}

// ─── Default #skill node IDs ───

export const DEFAULT_SKILL_IDS = {
  ARTICLE: 'NDX_SKL01',
  VIDEO: 'NDX_SKL02',
  SOCIAL: 'NDX_SKL03',
  GENERAL: 'NDX_SKL04',
} as const;

interface SkillPreset {
  id: string;
  name: string;
  trigger: string; // content type to match
  rules: readonly string[];
}

const SKILL_PRESETS: readonly SkillPreset[] = [
  { id: DEFAULT_SKILL_IDS.ARTICLE, name: 'Article Extraction', trigger: 'article', rules: ARTICLE_EXTRACTION_RULES },
  { id: DEFAULT_SKILL_IDS.VIDEO, name: 'Video Extraction', trigger: 'video', rules: VIDEO_EXTRACTION_RULES },
  { id: DEFAULT_SKILL_IDS.SOCIAL, name: 'Social Extraction', trigger: 'social', rules: SOCIAL_EXTRACTION_RULES },
  { id: DEFAULT_SKILL_IDS.GENERAL, name: 'General Extraction', trigger: 'general', rules: GENERAL_EXTRACTION_RULES },
];

// ─── Skill Trigger fieldDef ───

/**
 * Ensure the "Trigger" fieldDef exists on #skill tagDef.
 */
export function ensureSkillTriggerFieldDef(): void {
  if (loroDoc.hasNode(NDX_F.SKILL_TRIGGER)) return;

  loroDoc.createNode(NDX_F.SKILL_TRIGGER, SYS_T.SKILL);
  loroDoc.setNodeDataBatch(NDX_F.SKILL_TRIGGER, {
    type: 'fieldDef',
    name: 'Trigger',
    fieldType: FIELD_TYPES.OPTIONS,
    cardinality: 'single',
    nullable: true,
    description: 'Content type that activates this skill (e.g. article, video)',
  });
  loroDoc.commitDoc();
}

// ─── Bootstrap default #skill nodes ───

/**
 * Ensure the 4 default extraction #skill nodes exist with rules as children.
 * Idempotent — skips nodes that already exist.
 */
export function ensureDefaultSkillNodes(): void {
  ensureSkillTriggerFieldDef();

  for (const preset of SKILL_PRESETS) {
    if (loroDoc.hasNode(preset.id)) continue;

    // Create skill node under SCHEMA
    loroDoc.createNode(preset.id, SYSTEM_NODE_IDS.SCHEMA);
    loroDoc.setNodeRichTextContent(preset.id, preset.name, [], []);

    // Tag with #skill
    loroDoc.addTag(preset.id, SYS_T.SKILL);

    // Create trigger field entry + value
    const triggerFEId = `${preset.id}_FE`;
    loroDoc.createNode(triggerFEId, preset.id);
    loroDoc.setNodeDataBatch(triggerFEId, {
      type: 'fieldEntry',
      fieldDefId: NDX_F.SKILL_TRIGGER,
    });

    // Create option for trigger value (or reuse existing)
    const triggerOptionId = findOrCreateTriggerOption(preset.trigger);
    const triggerValueId = `${preset.id}_TV`;
    loroDoc.createNode(triggerValueId, triggerFEId);
    loroDoc.setNodeDataBatch(triggerValueId, { targetId: triggerOptionId });

    // Create rule children
    for (let i = 0; i < preset.rules.length; i++) {
      const ruleId = `${preset.id}_R${i}`;
      loroDoc.createNode(ruleId, preset.id);
      loroDoc.setNodeRichTextContent(ruleId, preset.rules[i], [], []);
    }

    loroDoc.commitDoc();
  }
}

/**
 * Find or create an option node under the Trigger fieldDef for a content type value.
 */
function findOrCreateTriggerOption(triggerValue: string): string {
  const normalized = triggerValue.trim().toLowerCase();
  const children = loroDoc.getChildren(NDX_F.SKILL_TRIGGER);
  for (const childId of children) {
    const child = loroDoc.toNodexNode(childId);
    if (child?.name?.trim().toLowerCase() === normalized) {
      return childId;
    }
  }

  // Create new option
  const optionId = `NDX_SKLO_${normalized}`;
  if (!loroDoc.hasNode(optionId)) {
    loroDoc.createNode(optionId, NDX_F.SKILL_TRIGGER);
    loroDoc.setNodeRichTextContent(optionId, triggerValue, [], []);
  }
  return optionId;
}

// ─── Read rules from #skill nodes ───

/**
 * Find a #skill node matching the given content type via its Trigger field.
 * Returns the skill node ID or null.
 */
export function findSkillByTrigger(contentType: string): string | null {
  const normalized = contentType.trim().toLowerCase();

  // Scan all nodes tagged with #skill
  const allNodeIds = loroDoc.getAllNodeIds();
  for (const nodeId of allNodeIds) {
    const node = loroDoc.toNodexNode(nodeId);
    if (!node || !node.tags.includes(SYS_T.SKILL)) continue;

    // Check trigger field
    const triggerValue = readTriggerField(nodeId);
    if (triggerValue && triggerValue.trim().toLowerCase() === normalized) {
      return nodeId;
    }
  }

  return null;
}

/**
 * Read the Trigger field value from a #skill node.
 */
function readTriggerField(skillNodeId: string): string | null {
  const children = loroDoc.getChildren(skillNodeId);
  for (const childId of children) {
    const child = loroDoc.toNodexNode(childId);
    if (child?.type === 'fieldEntry' && child.fieldDefId === NDX_F.SKILL_TRIGGER) {
      const valueChildren = loroDoc.getChildren(childId);
      if (valueChildren.length > 0) {
        const valueNode = loroDoc.toNodexNode(valueChildren[0]);
        // Options field: value node has targetId → resolve to option name
        if (valueNode?.targetId) {
          return loroDoc.toNodexNode(valueNode.targetId)?.name ?? null;
        }
        return valueNode?.name ?? null;
      }
    }
  }
  return null;
}

/**
 * Read rules (children names) from a #skill node.
 * Only returns non-fieldEntry children (rules are plain content nodes).
 */
export function readSkillRules(skillNodeId: string): string[] {
  const children = loroDoc.getChildren(skillNodeId);
  const rules: string[] = [];
  for (const childId of children) {
    const child = loroDoc.toNodexNode(childId);
    if (child && child.type !== 'fieldEntry' && child.name) {
      rules.push(child.name);
    }
  }
  return rules;
}

/**
 * Get extraction rules for a content type.
 * Priority: #skill node rules → hardcoded presets.
 *
 * @param contentType - The content type (article, video, social, or undefined for general)
 */
export function getSkillBasedRules(contentType?: string): readonly string[] {
  if (!contentType) return getExtractionRules(undefined);

  const skillNodeId = findSkillByTrigger(contentType);
  if (skillNodeId) {
    const rules = readSkillRules(skillNodeId);
    if (rules.length > 0) return rules;
  }

  // Also try "general" skill for non-specific types
  if (contentType !== 'general') {
    const generalSkill = findSkillByTrigger('general');
    if (generalSkill) {
      const rules = readSkillRules(generalSkill);
      if (rules.length > 0) return rules;
    }
  }

  return getExtractionRules(contentType);
}
