/**
 * AI Spark — structure extraction from clipped content.
 *
 * Flow:
 *   1. Read config from Spark #agent node (system prompt + model settings)
 *   2. Pre-create #spark container node (user sees it immediately)
 *   3. Single LLM call: system prompt (from agent node) + user prompt (content) → JSON
 *   4. Parse JSON → create child nodes under the container
 *
 * No Agent class, no tools. Simple prompt → response → build nodes.
 */

import { getModel } from '@mariozechner/pi-ai';
import { getApiKey, hasApiKey } from './ai-service.js';
import { streamProxyWithApiKey } from './ai-proxy.js';
import { getStoredToken } from './auth.js';
import { getPageContent } from './ai-shadow-cache.js';
import { ensureSparkAgentNode, readSparkAgentConfig } from './ai-agent-node.js';
import * as loroDoc from './loro-doc.js';
import { AI_COMMIT_ORIGIN, withCommitOrigin, commitDoc } from './loro-doc.js';
import { useNodeStore, applyTagMutationsNoCommit, syncTemplateMutationsNoCommit } from '../stores/node-store.js';
import { NDX_T, NDX_F, SYSTEM_NODE_IDS } from '../types/index.js';

export const SPARK_COMMIT_ORIGIN = 'ai:spark';

// ============================================================
// Types
// ============================================================

interface SparkInsight {
  name: string;
  children?: { name: string }[];
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
// Content reading (fallback when content not passed directly)
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

function parseSparkResponse(text: string): SparkInsight[] {
  // Strip markdown code fences if present
  let json = text.trim();
  if (json.startsWith('```')) {
    json = json.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed)) {
    throw new Error('Expected JSON array');
  }

  return parsed.filter(
    (item: any) => typeof item?.name === 'string' && item.name.trim().length > 0,
  ).map((item: any) => ({
    name: item.name.trim(),
    children: Array.isArray(item.children)
      ? item.children
          .filter((c: any) => typeof c?.name === 'string' && c.name.trim().length > 0)
          .map((c: any) => ({ name: c.name.trim() }))
      : undefined,
  }));
}

// ============================================================
// Node creation
// ============================================================

function createSparkContainer(sourceNodeId: string): string {
  return withCommitOrigin(AI_COMMIT_ORIGIN, () => {
    const store = useNodeStore.getState();
    const created = store.createChild(sourceNodeId, undefined, { name: 'Spark' }, { commit: false });
    applyTagMutationsNoCommit(created.id, NDX_T.SPARK);
    syncTemplateMutationsNoCommit(created.id);
    commitDoc();
    return created.id;
  });
}

function buildInsightNodes(sparkNodeId: string, insights: SparkInsight[]): number {
  let count = 0;
  withCommitOrigin(AI_COMMIT_ORIGIN, () => {
    const store = useNodeStore.getState();
    for (const insight of insights) {
      const node = store.createChild(sparkNodeId, undefined, { name: insight.name }, { commit: false });
      count++;
      if (insight.children) {
        for (const child of insight.children) {
          store.createChild(node.id, undefined, { name: child.name }, { commit: false });
          count++;
        }
      }
    }
    commitDoc();
  });
  return count;
}

// ============================================================
// Public API
// ============================================================

export async function shouldAutoTrigger(): Promise<boolean> {
  return hasApiKey();
}

/**
 * Trigger Spark extraction on a #source node.
 *
 * 1. Reads config from the Spark #agent node (system prompt + model settings)
 * 2. Pre-creates a single #spark container (appears immediately)
 * 3. Single LLM call → JSON response
 * 4. Parse JSON → create child nodes
 *
 * Fire-and-forget — errors are logged but never propagate.
 */
export async function triggerSpark(sourceNodeId: string, providedContent?: string): Promise<void> {
  try {
    const sourceNode = loroDoc.toNodexNode(sourceNodeId);
    if (!sourceNode) {
      console.warn('[spark] source node not found:', sourceNodeId);
      return;
    }

    const pageContent = providedContent || await readPageContent(sourceNodeId);
    if (!pageContent) {
      console.warn('[spark] no content available for extraction:', sourceNodeId);
      return;
    }

    // Bootstrap
    ensureSparkTagDef();
    ensureSparkAgentNode();

    // Read config from Spark #agent node
    const config = readSparkAgentConfig();

    // 1. Container appears immediately
    const sparkNodeId = createSparkContainer(sourceNodeId);
    console.log('[spark] container created:', sparkNodeId);

    // 2. Single LLM call
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

    // 3. Parse and build nodes
    const insights = parseSparkResponse(responseText);
    const nodeCount = buildInsightNodes(sparkNodeId, insights);

    console.log('[spark] completed for:', sourceNodeId, '| insights:', insights.length, '| nodes:', nodeCount);
  } catch (error) {
    console.error('[spark] extraction failed:', error);
  }
}
