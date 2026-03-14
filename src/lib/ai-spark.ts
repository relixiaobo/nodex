/**
 * AI Spark — structure extraction from clipped content.
 *
 * Two-phase flow:
 *   1. ensureSparkPlaceholder() — immediate: creates empty #spark node (pending state)
 *   2. triggerSparkExtraction() — async: LLM call → napkin name + insight children
 *
 * The #spark node has three states, driven by children + UI loading set:
 *   - pending:  no children, not loading → clickable "Generate Spark" button
 *   - loading:  in loadingNodeIds → spinning bullet + "Generating..."
 *   - complete: has children → napkin name + insight tree
 */

import { getModel } from '@mariozechner/pi-ai';
import { getApiKey, hasApiKey } from './ai-service.js';
import { streamProxyWithApiKey } from './ai-proxy.js';
import { getStoredToken } from './auth.js';
import { getPageContent } from './ai-shadow-cache.js';
import { ensureSparkAgentNode, readSparkAgentConfig } from './ai-agent-node.js';
import * as loroDoc from './loro-doc.js';
import { withCommitOrigin, commitDoc } from './loro-doc.js';
import { useNodeStore, applyTagMutationsNoCommit, syncTemplateMutationsNoCommit } from '../stores/node-store.js';
import { useUIStore } from '../stores/ui-store.js';
import { NDX_T, NDX_F, SYSTEM_NODE_IDS } from '../types/index.js';

export const SPARK_COMMIT_ORIGIN = 'ai:spark';

// ============================================================
// Types
// ============================================================

export interface SparkInsight {
  name: string;
  children?: SparkInsight[];
}

export interface SparkResponse {
  napkin: string;
  insights: SparkInsight[];
}

// ============================================================
// Ensure #spark tagDef
// ============================================================

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

// ============================================================
// Content reading
// ============================================================

async function readPageContent(sourceNodeId: string): Promise<string | null> {
  const url = getSourceUrl(sourceNodeId);
  if (url) {
    const cached = await getPageContent(url);
    if (cached) return cached;
  }

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
// LLM call
// ============================================================

async function callSparkLLM(
  systemPrompt: string,
  content: string,
  modelId: string,
  temperature: number,
  maxTokens: number,
): Promise<string> {
  const apiKey = await getApiKey();
  const authToken = await getStoredToken();
  if (!authToken) throw new Error('Not signed in');
  if (!apiKey) throw new Error('No API key configured');

  const proxyUrl = import.meta.env.VITE_SYNC_API_URL ?? 'http://localhost:8787';
  const model = getModel('anthropic', modelId as Parameters<typeof getModel>[1]);

  const stream = streamProxyWithApiKey(model, {
    systemPrompt,
    messages: [{
      role: 'user' as const,
      content: [{ type: 'text' as const, text: content }],
      timestamp: Date.now(),
    }],
    tools: [],
  }, {
    apiKey,
    authToken,
    proxyUrl,
    temperature,
    maxTokens,
  });

  let fullText = '';
  for await (const event of stream) {
    if (event.type === 'text_delta') {
      fullText += event.delta;
    }
    if (event.type === 'error') {
      throw new Error((event as any).error?.errorMessage ?? 'Spark LLM call failed');
    }
  }

  return fullText;
}

// ============================================================
// Response parsing
// ============================================================

function parseInsights(raw: unknown[]): SparkInsight[] {
  return raw
    .filter((item: any) => typeof item?.name === 'string' && item.name.trim().length > 0)
    .map((item: any) => ({
      name: item.name.trim(),
      children: Array.isArray(item.children) && item.children.length > 0
        ? parseInsights(item.children)
        : undefined,
    }));
}

export function parseSparkResponse(text: string): SparkResponse {
  // Strip markdown code fences if present
  let json = text.trim();
  if (json.startsWith('```')) {
    json = json.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  const parsed = JSON.parse(json);

  // New format: { napkin, insights }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return {
      napkin: typeof parsed.napkin === 'string' ? parsed.napkin.trim() : '',
      insights: Array.isArray(parsed.insights) ? parseInsights(parsed.insights) : [],
    };
  }

  // Legacy fallback: plain array (from old prompt format)
  if (Array.isArray(parsed)) {
    return {
      napkin: '',
      insights: parseInsights(parsed),
    };
  }

  throw new Error('Expected JSON object with napkin + insights, or JSON array');
}

// ============================================================
// Node creation
// ============================================================

function buildInsightTree(
  store: ReturnType<typeof useNodeStore.getState>,
  parentId: string,
  items: SparkInsight[],
): number {
  let count = 0;
  for (const item of items) {
    const node = store.createChild(parentId, undefined, { name: item.name }, { commit: false });
    count++;
    if (item.children && item.children.length > 0) {
      count += buildInsightTree(store, node.id, item.children);
    }
  }
  return count;
}

function buildInsightNodes(sparkNodeId: string, insights: SparkInsight[]): number {
  let count = 0;
  withCommitOrigin(SPARK_COMMIT_ORIGIN, () => {
    const store = useNodeStore.getState();
    count = buildInsightTree(store, sparkNodeId, insights);
    commitDoc();
  });
  return count;
}

// ============================================================
// Public API
// ============================================================

/**
 * Find an existing #spark child node under a source node.
 */
export function findSparkChild(sourceNodeId: string): string | null {
  const children = loroDoc.getChildren(sourceNodeId);
  for (const childId of children) {
    const child = loroDoc.toNodexNode(childId);
    if (child?.tags.includes(NDX_T.SPARK)) return childId;
  }
  return null;
}

/**
 * Find or create a #spark placeholder under a source node.
 * Idempotent — returns existing spark node ID if one exists.
 */
export function ensureSparkPlaceholder(sourceNodeId: string): string {
  const existing = findSparkChild(sourceNodeId);
  if (existing) return existing;

  ensureSparkTagDef();
  ensureSparkAgentNode();

  return withCommitOrigin(SPARK_COMMIT_ORIGIN, () => {
    const store = useNodeStore.getState();
    const created = store.createChild(sourceNodeId, undefined, { name: 'Spark' }, { commit: false });
    applyTagMutationsNoCommit(created.id, NDX_T.SPARK);
    syncTemplateMutationsNoCommit(created.id);
    commitDoc();
    return created.id;
  });
}

/**
 * Run Spark extraction on an existing #spark placeholder node.
 * Transitions: pending → loading → complete (or back to pending on failure).
 */
export async function triggerSparkExtraction(
  sparkNodeId: string,
  sourceNodeId: string,
  providedContent?: string,
): Promise<void> {
  useUIStore.getState().addLoadingNode(sparkNodeId);

  try {
    const pageContent = providedContent || await readPageContent(sourceNodeId);
    if (!pageContent) {
      console.warn('[spark] no content available for extraction:', sourceNodeId);
      return;
    }

    ensureSparkTagDef();
    ensureSparkAgentNode();
    const config = readSparkAgentConfig();

    const truncated = pageContent.length > 100_000
      ? pageContent.slice(0, 100_000) + '\n\n[Content truncated]'
      : pageContent;

    const responseText = await callSparkLLM(
      config.systemPrompt,
      truncated,
      config.modelId,
      config.temperature,
      config.maxTokens,
    );

    const response = parseSparkResponse(responseText);

    // Update container name with napkin (extreme one-sentence compression)
    if (response.napkin) {
      withCommitOrigin(SPARK_COMMIT_ORIGIN, () => {
        loroDoc.setNodeRichTextContent(sparkNodeId, response.napkin, [], []);
        commitDoc();
      });
    }

    buildInsightNodes(sparkNodeId, response.insights);

    console.log('[spark] completed for:', sourceNodeId, '| napkin:', !!response.napkin, '| insights:', response.insights.length);
  } catch (error) {
    console.error('[spark] extraction failed:', error);
  } finally {
    useUIStore.getState().removeLoadingNode(sparkNodeId);
  }
}

/**
 * Create placeholder + auto-trigger extraction if API key available.
 * Used by clip flows for active clips.
 */
export function autoTriggerSpark(sourceNodeId: string, providedContent?: string): void {
  const sparkId = ensureSparkPlaceholder(sourceNodeId);
  void (async () => {
    try {
      if (await hasApiKey()) {
        await triggerSparkExtraction(sparkId, sourceNodeId, providedContent);
      }
    } catch {
      // Spark errors never affect clip
    }
  })();
}

/**
 * Handle user clicking "Generate Spark" on a pending #spark node.
 * Checks API key, then triggers extraction.
 */
export async function handleSparkClick(sparkNodeId: string, sourceNodeId: string): Promise<void> {
  const hasKey = await hasApiKey();
  if (!hasKey) {
    // TODO: navigate to Settings or show toast
    console.warn('[spark] No API key configured');
    return;
  }
  await triggerSparkExtraction(sparkNodeId, sourceNodeId);
}
