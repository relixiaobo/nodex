/**
 * AI Spark — structure extraction from clipped content.
 *
 * When a user clips a web page, Spark automatically extracts its cognitive
 * structure (not a summary) and creates #spark child nodes under the #source
 * node. The extraction is driven by the AI agent's tool-call loop — Spark
 * content is written as real nodes via `node_create`.
 *
 * Flow:
 *   1. Read page content from Shadow Cache (or node children)
 *   2. Create a dedicated agent instance with extraction system prompt
 *   3. Agent uses node_create tool calls to build the #spark subtree
 *   4. Fill is/has/about metadata fields on the #source node
 *
 * Spark runs as a fire-and-forget background task — it does not block clip
 * and does not interfere with Chat.
 */

import { createAgent, hasApiKey } from './ai-service.js';
import { getAITools } from './ai-tools/index.js';
import { getPageContent } from './ai-shadow-cache.js';
import { getExtractionRules } from './ai-skills/extraction-presets.js';
import * as loroDoc from './loro-doc.js';
import { NDX_T, SYS_T, NDX_F, FIELD_TYPES, SYSTEM_NODE_IDS } from '../types/index.js';

export const SPARK_COMMIT_ORIGIN = 'ai:spark';

// ============================================================
// Ensure #spark tagDef and is/has/about fieldDefs
// ============================================================

/**
 * Ensure #spark tagDef exists with fixed ID NDX_T04.
 */
export function ensureSparkTagDef(): void {
  if (!loroDoc.hasNode(NDX_T.SPARK)) {
    loroDoc.createNode(NDX_T.SPARK, SYSTEM_NODE_IDS.SCHEMA);
    loroDoc.setNodeDataBatch(NDX_T.SPARK, {
      type: 'tagDef',
      name: 'spark',
      color: 'amber',
      description: 'AI structure extraction — cognitive framework, not summary',
    });
    loroDoc.commitDoc();
  }
}

/**
 * Ensure "is", "has", "about" fieldDefs exist under #source tagDef.
 * These are metadata fields filled by Spark extraction.
 *
 * Assumes #source tagDef (SYS_T.SOURCE) already exists — it is created
 * during the clip flow before Spark triggers.
 */
export function ensureSourceMetadataFieldDefs(): void {

  // "is" field — content type classification
  if (!loroDoc.hasNode(NDX_F.SOURCE_IS)) {
    loroDoc.createNode(NDX_F.SOURCE_IS, SYS_T.SOURCE);
    loroDoc.setNodeDataBatch(NDX_F.SOURCE_IS, {
      type: 'fieldDef',
      name: 'is',
      fieldType: FIELD_TYPES.OPTIONS,
      cardinality: 'single',
      nullable: true,
      autocollectOptions: true,
    });
    loroDoc.commitDoc();
  }

  // "has" field — core concepts
  if (!loroDoc.hasNode(NDX_F.SOURCE_HAS)) {
    loroDoc.createNode(NDX_F.SOURCE_HAS, SYS_T.SOURCE);
    loroDoc.setNodeDataBatch(NDX_F.SOURCE_HAS, {
      type: 'fieldDef',
      name: 'has',
      fieldType: FIELD_TYPES.OPTIONS,
      cardinality: 'list',
      nullable: true,
      autocollectOptions: true,
    });
    loroDoc.commitDoc();
  }

  // "about" field — topics
  if (!loroDoc.hasNode(NDX_F.SOURCE_ABOUT)) {
    loroDoc.createNode(NDX_F.SOURCE_ABOUT, SYS_T.SOURCE);
    loroDoc.setNodeDataBatch(NDX_F.SOURCE_ABOUT, {
      type: 'fieldDef',
      name: 'about',
      fieldType: FIELD_TYPES.OPTIONS,
      cardinality: 'list',
      nullable: true,
      autocollectOptions: true,
    });
    loroDoc.commitDoc();
  }
}

/** Tag IDs in the #source family. */
const SOURCE_FAMILY_TAGS = new Set<string>([
  SYS_T.SOURCE,
  NDX_T.ARTICLE,
  NDX_T.VIDEO,
  NDX_T.SOCIAL,
]);

/**
 * Determine the content type of a #source node from its tags.
 */
function detectContentType(sourceNodeId: string): string | undefined {
  const node = loroDoc.toNodexNode(sourceNodeId);
  if (!node) return undefined;

  for (const tagId of node.tags) {
    if (tagId === NDX_T.ARTICLE) return 'article';
    if (tagId === NDX_T.VIDEO) return 'video';
    if (tagId === NDX_T.SOCIAL) return 'social';
  }

  if (node.tags.some((t) => SOURCE_FAMILY_TAGS.has(t))) return 'source';
  return undefined;
}

/**
 * Read page content — try Shadow Cache first, then fall back to node
 * children text (highlights, description, etc.).
 */
async function readPageContent(sourceNodeId: string): Promise<string | null> {
  // 1. Try Shadow Cache by URL
  const url = getSourceUrl(sourceNodeId);
  if (url) {
    const cached = await getPageContent(url);
    if (cached) return cached;
  }

  // 2. Fallback: gather text from node name + description + children
  const node = loroDoc.toNodexNode(sourceNodeId);
  if (!node) return null;

  const parts: string[] = [];
  if (node.name) parts.push(node.name);
  if (node.description) parts.push(node.description);

  const children = loroDoc.getChildren(sourceNodeId);
  for (const childId of children) {
    const child = loroDoc.toNodexNode(childId);
    if (child?.name && child.type !== 'fieldEntry') {
      parts.push(child.name);
    }
  }

  return parts.length > 0 ? parts.join('\n\n') : null;
}

/**
 * Get the source URL from a #source node's URL field entry.
 */
function getSourceUrl(sourceNodeId: string): string | null {
  const children = loroDoc.getChildren(sourceNodeId);
  for (const childId of children) {
    const child = loroDoc.toNodexNode(childId);
    if (child?.type === 'fieldEntry' && child.fieldDefId === NDX_F.SOURCE_URL) {
      const valueChildren = loroDoc.getChildren(childId);
      if (valueChildren.length > 0) {
        return loroDoc.toNodexNode(valueChildren[0])?.name ?? null;
      }
    }
  }
  return null;
}

/**
 * Build the Spark extraction system prompt.
 */
function buildSparkSystemPrompt(
  sourceNodeId: string,
  contentType: string | undefined,
): string {
  const rules = getExtractionRules(contentType);
  const rulesBlock = rules.map((r) => `- ${r}`).join('\n');

  return [
    'You are soma\'s Spark extractor. Your job is to extract the cognitive structure',
    'of a piece of content — NOT to summarize it.',
    '',
    'You will receive the full text of a web page that the user has clipped.',
    'Your task:',
    '',
    '1. **Round 1 — Skeleton**: Create 2-5 top-level #spark child nodes under the',
    `   source node (parentId: "${sourceNodeId}"). Each node captures a core structural`,
    '   element (framework, thesis, key mechanism) — not a topic heading.',
    '   Tag each with "spark".',
    '',
    '2. **Round 2 — Flesh**: For each skeleton node, create child nodes that capture',
    '   the supporting reasoning: argument chains, implicit assumptions, boundary',
    '   conditions, tensions. Keep these as real child nodes, not descriptions.',
    '',
    '3. **Metadata**: After extraction, use node_edit to set these fields on the',
    `   source node (id: "${sourceNodeId}"):`,
    '   - "is": what type of content this is (e.g. "methodological argument", "technical tutorial")',
    '   - "has": core concepts as comma-separated values (e.g. "modularity, constraint theory")',
    '   - "about": topics as comma-separated values (e.g. "software architecture, design")',
    '',
    '<extraction-rules>',
    rulesBlock,
    '</extraction-rules>',
    '',
    'Guidelines:',
    '- Create content nodes, not empty grouping nodes.',
    '- Each node name should be a clear, self-contained statement (not a label).',
    '- Keep node names concise (under 100 chars). Use children for elaboration.',
    '- Do NOT create a "Summary" or "Key Points" wrapper — the skeleton IS the structure.',
    '- Use the node_create tool for every node. Use children param for nesting.',
    '- Reply in the same language as the source content.',
  ].join('\n');
}

/**
 * Check whether Spark should auto-trigger.
 * Requires: user has an API key configured.
 */
export async function shouldAutoTrigger(): Promise<boolean> {
  return hasApiKey();
}

/**
 * Trigger Spark extraction on a #source node.
 *
 * Creates a dedicated agent instance, runs the extraction prompt,
 * and the agent uses node_create tool calls to build the #spark subtree
 * as real nodes in the knowledge graph.
 *
 * This is a fire-and-forget operation — errors are logged but do not
 * propagate (Spark failure should never break clip).
 *
 * @param sourceNodeId - The ID of the #source node to extract from
 */
export async function triggerSpark(sourceNodeId: string): Promise<void> {
  try {
    // Validate source node exists
    const sourceNode = loroDoc.toNodexNode(sourceNodeId);
    if (!sourceNode) {
      console.warn('[spark] source node not found:', sourceNodeId);
      return;
    }

    // Read page content
    const pageContent = await readPageContent(sourceNodeId);
    if (!pageContent) {
      console.warn('[spark] no content available for extraction:', sourceNodeId);
      return;
    }

    // Detect content type for rule selection
    const contentType = detectContentType(sourceNodeId);

    // Ensure #spark tag and is/has/about fields exist before extraction
    ensureSparkTagDef();
    ensureSourceMetadataFieldDefs();

    // Create a dedicated agent for this extraction
    const agent = createAgent();
    agent.setTools(getAITools());
    agent.setSystemPrompt(buildSparkSystemPrompt(sourceNodeId, contentType));

    // Truncate content to avoid token limits (roughly 100k chars ~ 25k tokens)
    const truncatedContent = pageContent.length > 100_000
      ? pageContent.slice(0, 100_000) + '\n\n[Content truncated]'
      : pageContent;

    // Build the extraction prompt
    const prompt = [
      'Extract the cognitive structure of this content.',
      `Create the spark nodes as children of source node "${sourceNodeId}".`,
      '',
      '<page-content>',
      truncatedContent,
      '</page-content>',
    ].join('\n');

    // Run the extraction — agent will use node_create via tool calls.
    // Tool calls commit with AI_COMMIT_ORIGIN internally.
    // Future: separate undo scope for Spark (SPARK_COMMIT_ORIGIN).
    await agent.prompt(prompt);

    console.log('[spark] extraction completed for:', sourceNodeId);
  } catch (error) {
    // Spark failure must never crash the clip flow
    console.error('[spark] extraction failed:', error);
  }
}
