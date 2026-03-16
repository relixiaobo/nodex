import { getModels, getProviders } from '@mariozechner/pi-ai';
import type { Api, Model } from '@mariozechner/pi-ai';
import { NDX_F, NDX_T, SYS_V } from '../types/index.js';
import * as loroDoc from './loro-doc.js';
import { SYSTEM_SCHEMA_NODE_IDS } from './system-schema-presets.js';

export interface ProviderConfig {
  provider: string;
  enabled: boolean;
  apiKey: string;
  baseUrl?: string;
  nodeId: string;
}

export function normalizeProviderId(provider: string | null | undefined): string {
  return provider?.trim().toLowerCase() ?? '';
}

function findFieldEntry(nodeId: string, fieldDefId: string): string | null {
  const children = loroDoc.getChildren(nodeId);
  for (const childId of children) {
    const child = loroDoc.toNodexNode(childId);
    if (child?.type === 'fieldEntry' && child.fieldDefId === fieldDefId) {
      return childId;
    }
  }
  return null;
}

function readTextFieldValue(nodeId: string, fieldDefId: string): string {
  const fieldEntryId = findFieldEntry(nodeId, fieldDefId);
  if (!fieldEntryId) return '';

  const fieldEntry = loroDoc.toNodexNode(fieldEntryId);
  const valueNodeId = fieldEntry?.children?.[0];
  const value = valueNodeId ? loroDoc.toNodexNode(valueNodeId)?.name?.trim() : '';
  return value ?? '';
}

function readTargetFieldValue(nodeId: string, fieldDefId: string): string {
  const fieldEntryId = findFieldEntry(nodeId, fieldDefId);
  if (!fieldEntryId) return '';

  const fieldEntry = loroDoc.toNodexNode(fieldEntryId);
  const valueNodeId = fieldEntry?.children?.[0];
  if (!valueNodeId) return '';

  const valueNode = loroDoc.toNodexNode(valueNodeId);
  if (valueNode?.targetId) {
    return normalizeProviderId(loroDoc.toNodexNode(valueNode.targetId)?.name);
  }
  return normalizeProviderId(valueNode?.name);
}

function readBooleanFieldValue(nodeId: string, fieldDefId: string): boolean {
  return readTextFieldValue(nodeId, fieldDefId) === SYS_V.YES;
}

function getProviderConfigPriority(config: ProviderConfig): number {
  if (config.enabled && config.apiKey.length > 0) return 2;
  if (config.enabled) return 1;
  return 0;
}

function getCanonicalProviderConfigs(configs: ProviderConfig[]): ProviderConfig[] {
  const result = new Map<string, ProviderConfig>();

  for (const config of configs) {
    const provider = normalizeProviderId(config.provider);
    if (!provider) continue;

    const existing = result.get(provider);
    if (!existing || getProviderConfigPriority(config) > getProviderConfigPriority(existing)) {
      result.set(provider, config);
    }
  }

  return [...result.values()];
}

function getCanonicalProviderConfig(provider: string): ProviderConfig | null {
  const normalizedProvider = normalizeProviderId(provider);
  if (!normalizedProvider) return null;

  return getCanonicalProviderConfigs(getProviderConfigs()).find(
    (candidate) => normalizeProviderId(candidate.provider) === normalizedProvider,
  ) ?? null;
}

export function findProviderOptionNodeId(provider: string): string | null {
  try {
    const normalizedProvider = normalizeProviderId(provider);
    if (!normalizedProvider) return null;

    const optionNodeIds = loroDoc.getChildren(NDX_F.PROVIDER_ID);
    for (const optionNodeId of optionNodeIds) {
      const optionNode = loroDoc.toNodexNode(optionNodeId);
      if (normalizeProviderId(optionNode?.name) === normalizedProvider) {
        return optionNodeId;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function getProviderConfigs(): ProviderConfig[] {
  try {
    const fieldEntry = loroDoc.toNodexNode(SYSTEM_SCHEMA_NODE_IDS.SETTINGS_AI_PROVIDERS_FIELD_ENTRY);
    if (!fieldEntry?.children?.length) return [];

    return fieldEntry.children
      .map<ProviderConfig | null>((nodeId) => {
        const node = loroDoc.toNodexNode(nodeId);
        if (!node) return null;
        if (!node.tags.includes(NDX_T.AI_PROVIDER) && !findFieldEntry(nodeId, NDX_F.PROVIDER_ID)) {
          return null;
        }

        const provider = readTargetFieldValue(nodeId, NDX_F.PROVIDER_ID);
        if (!provider) return null;

        const apiKey = readTextFieldValue(nodeId, NDX_F.PROVIDER_API_KEY);
        const baseUrl = readTextFieldValue(nodeId, NDX_F.PROVIDER_BASE_URL);

        return {
          provider,
          enabled: readBooleanFieldValue(nodeId, NDX_F.PROVIDER_ENABLED),
          apiKey,
          baseUrl: baseUrl || undefined,
          nodeId,
        };
      })
      .filter((config): config is ProviderConfig => config !== null);
  } catch {
    return [];
  }
}

export function getEnabledProviderConfigs(): ProviderConfig[] {
  return getCanonicalProviderConfigs(getProviderConfigs())
    .filter((config) => config.enabled && config.apiKey.length > 0);
}

export function getApiKeyForProvider(provider: string): string | null {
  const config = getCanonicalProviderConfig(provider);
  if (!config?.enabled || config.apiKey.length === 0) return null;
  return config.apiKey;
}

export function getAvailableModels(): Model<Api>[] {
  const knownProviders = new Set(getProviders().map((provider) => normalizeProviderId(provider)));
  const enabledConfigs = getCanonicalProviderConfigs(getProviderConfigs())
    .filter((config) => config.enabled);

  return enabledConfigs.flatMap((config) => {
    const provider = normalizeProviderId(config.provider);
    if (!knownProviders.has(provider)) return [];

    return getModels(provider as Parameters<typeof getModels>[0]).map((model) => (
      config.baseUrl
        ? { ...model, baseUrl: config.baseUrl }
        : model
    ));
  });
}

export function hasAnyEnabledProvider(): boolean {
  return getCanonicalProviderConfigs(getProviderConfigs())
    .some((config) => config.enabled && config.apiKey.length > 0);
}
