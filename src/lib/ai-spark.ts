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
 *   4. Collision: search for related nodes and create cross-references
 *
 * Spark runs as a fire-and-forget background task — it does not block clip
 * and does not interfere with Chat.
 */

import { createAgent, hasApiKey } from './ai-service.js';
import { getAITools } from './ai-tools/index.js';
import { getPageContent } from './ai-shadow-cache.js';
import { getSkillBasedRules, ensureDefaultSkillNodes } from './ai-skills/extraction-presets.js';
import * as loroDoc from './loro-doc.js';
import { NDX_T, SYS_T, NDX_F, SYSTEM_NODE_IDS } from '../types/index.js';

export const SPARK_COMMIT_ORIGIN = 'ai:spark';

// ============================================================
// Ensure #spark tagDef
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
export function detectContentType(sourceNodeId: string): string | undefined {
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

// ============================================================
// Extraction System Prompt
// ============================================================

/**
 * Build the Spark extraction system prompt.
 *
 * Uses #skill node rules when available, falls back to hardcoded presets.
 * The agent creates #spark child nodes as the extraction result —
 * no separate metadata fields.
 */
export function buildSparkSystemPrompt(
  sourceNodeId: string,
  contentType: string | undefined,
): string {
  const rules = getSkillBasedRules(contentType);
  const rulesBlock = rules.map((r) => `- ${r}`).join('\n');

  return [
    'You are soma\'s Spark extractor. Your job is to extract the cognitive structure',
    'of a piece of content — NOT to summarize it.',
    '',
    'You will receive the full text of a web page that the user has clipped.',
    'Your task:',
    '',
    '1. **Skeleton**: Create 2-5 top-level child nodes under the source node',
    `   (parentId: "${sourceNodeId}"). Each node captures a core structural element`,
    '   (framework, thesis, key mechanism) — not a topic heading.',
    '   Tag each with "spark".',
    '',
    '2. **Flesh**: For each skeleton node, create child nodes that capture',
    '   the supporting reasoning: argument chains, implicit assumptions, boundary',
    '   conditions, tensions. Keep these as real child nodes, not descriptions.',
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

// ============================================================
// Collision System Prompt
// ============================================================

/**
 * Gather #spark children names (with their sub-children) for collision context.
 */
export function gatherSparkSummary(sourceNodeId: string): string[] {
  const lines: string[] = [];
  const children = loroDoc.getChildren(sourceNodeId);
  for (const childId of children) {
    const child = loroDoc.toNodexNode(childId);
    if (!child?.tags?.includes(NDX_T.SPARK) || !child.name) continue;
    lines.push(child.name);
    // Include first-level sub-children for richer context
    for (const grandchildId of loroDoc.getChildren(childId)) {
      const gc = loroDoc.toNodexNode(grandchildId);
      if (gc?.name) lines.push(`  - ${gc.name}`);
    }
  }
  return lines;
}

/**
 * Build the collision detection system prompt.
 * Collision is driven by the spark extraction content — no structured fields needed.
 */
export function buildCollisionSystemPrompt(
  sourceNodeId: string,
  sparkSummary: string[],
): string {
  const sparkBlock = sparkSummary.length > 0
    ? sparkSummary.join('\n')
    : '(no spark nodes)';

  return [
    'You are soma\'s collision detector. Your job is to find meaningful connections',
    'between a newly clipped piece of content and the user\'s existing knowledge graph.',
    '',
    `Source node ID: "${sourceNodeId}"`,
    '',
    'Here is the cognitive structure just extracted from this source:',
    '<spark-structure>',
    sparkBlock,
    '</spark-structure>',
    '',
    'Your task:',
    '',
    '1. **Search for candidates**: Use node_search to find potentially related nodes.',
    '   Search strategies (try in order, stop when you have enough candidates):',
    '   a) Search by tags: node_search(searchTags: ["source"])',
    '   b) Text search by key concepts from the spark structure:',
    '      node_search(query: "<key concept>")',
    '   Limit to 10 candidates total. Skip the source node itself.',
    '',
    '2. **Evaluate candidates**: For promising candidates, use node_read to examine',
    '   their content and #spark children. Look for:',
    '   - **Cross-domain isomorphism** (highest value): same underlying structure/pattern',
    '     in a different domain (e.g. "software modularity" ↔ "organizational design")',
    '   - **Complementary arguments**: different perspectives on the same mechanism',
    '   - **Tensions or contradictions**: conflicting claims worth surfacing',
    '   Do NOT report mere topic overlap (e.g. two articles both about machine learning).',
    '',
    '3. **Create collision results**: For each genuinely related node (high confidence only),',
    `   create a child node under the source node (parentId: "${sourceNodeId}") with:`,
    '   - Tag: "spark"',
    '   - Name: a statement describing the connection (not just "Related to X")',
    '     Example: "Same constraint-freedom pattern as <ref id="nodeId">API design notes</ref>"',
    '   - Use <ref id="nodeId">text</ref> to reference the related node inline.',
    '',
    'CRITICAL RULES:',
    '- **Confidence threshold**: Only create collisions you are genuinely confident about.',
    '  If unsure, do NOT create a collision. Better to miss a connection than fabricate one.',
    '- **Quality over quantity**: 0-2 collisions is the expected range. 3+ means your',
    '  threshold is too low.',
    '- **Cross-domain > same-topic**: Prioritize surprising structural connections over',
    '  obvious topical similarity.',
    '- If no candidates meet the confidence threshold, reply "No collisions found" and',
    '  do NOT create any nodes.',
    '- Reply in the same language as the source content.',
  ].join('\n');
}

// ============================================================
// Trigger Logic
// ============================================================

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
 * After extraction, triggers collision detection as a separate agent pass.
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

    // Ensure #spark tag and default #skill nodes
    ensureSparkTagDef();
    ensureDefaultSkillNodes();

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
    await agent.prompt(prompt);

    console.log('[spark] extraction completed for:', sourceNodeId);

    // Fire-and-forget collision detection
    void triggerCollision(sourceNodeId).catch((err) => {
      console.error('[spark] collision failed:', err);
    });
  } catch (error) {
    // Spark failure must never crash the clip flow
    console.error('[spark] extraction failed:', error);
  }
}

/**
 * Trigger collision detection on a #source node.
 *
 * Reads the spark extraction results and uses a separate agent to search
 * for related nodes in the knowledge graph.
 *
 * This is a fire-and-forget operation that runs after extraction.
 *
 * @param sourceNodeId - The ID of the #source node to search collisions for
 */
export async function triggerCollision(sourceNodeId: string): Promise<void> {
  // Gather spark structure for context
  const sparkSummary = gatherSparkSummary(sourceNodeId);

  // Skip collision if no spark nodes to search with
  if (sparkSummary.length === 0) {
    console.log('[spark] skipping collision — no spark nodes:', sourceNodeId);
    return;
  }

  // Create a dedicated collision agent
  const collisionAgent = createAgent();
  collisionAgent.setTools(getAITools());
  collisionAgent.setSystemPrompt(
    buildCollisionSystemPrompt(sourceNodeId, sparkSummary),
  );

  const prompt = [
    'Search the knowledge graph for nodes related to this source.',
    `Source node: "${sourceNodeId}"`,
    'Follow the search strategies in your system prompt.',
    'Create collision results only if confidence is high.',
  ].join('\n');

  await collisionAgent.prompt(prompt);

  console.log('[spark] collision detection completed for:', sourceNodeId);
}
