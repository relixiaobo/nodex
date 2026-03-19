import { beforeEach, describe, expect, it } from 'vitest';
import {
  findProviderOptionNodeId,
  getApiKeyForProvider,
  getAvailableModels,
  getAvailableModelsWithMeta,
  getEnabledProviderConfigs,
  getProviderConfigs,
  hasAnyEnabledProvider,
} from '../../src/lib/ai-provider-config.js';
import { ensureSystemNodes } from '../../src/lib/bootstrap-system-nodes.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { SYSTEM_SCHEMA_NODE_IDS } from '../../src/lib/system-schema-presets.js';
import { useNodeStore } from '../../src/stores/node-store.js';
import { NDX_F, SYS_V } from '../../src/types/index.js';

function seedProviderConfig({
  provider,
  enabled,
  apiKey,
  baseUrl,
  name,
  models,
}: {
  provider: string;
  enabled: boolean;
  apiKey?: string;
  baseUrl?: string;
  name: string;
  models?: string[];
}): string {
  const store = useNodeStore.getState();
  const node = store.createChild(
    SYSTEM_SCHEMA_NODE_IDS.SETTINGS_AI_PROVIDERS_FIELD_ENTRY,
    undefined,
    { name },
    { commit: false },
  );

  const providerOptionNodeId = findProviderOptionNodeId(provider);
  if (providerOptionNodeId) {
    store.setOptionsFieldValue(node.id, NDX_F.PROVIDER_ID, providerOptionNodeId);
  }

  store.setFieldValue(node.id, NDX_F.PROVIDER_ENABLED, [enabled ? SYS_V.YES : SYS_V.NO]);
  if (apiKey !== undefined) {
    store.setFieldValue(node.id, NDX_F.PROVIDER_API_KEY, apiKey ? [apiKey] : []);
  }
  if (baseUrl !== undefined) {
    store.setFieldValue(node.id, NDX_F.PROVIDER_BASE_URL, baseUrl ? [baseUrl] : []);
  }
  if (models !== undefined && models.length > 0) {
    store.setFieldValue(node.id, NDX_F.PROVIDER_MODELS, models);
  }

  return node.id;
}

describe('ai-provider-config', () => {
  beforeEach(() => {
    loroDoc.resetLoroDoc();
    loroDoc.initLoroDocForTest('ws_ai_provider');
    ensureSystemNodes('ws_ai_provider');
  });

  it('getProviderConfigs reads multiple provider nodes from Settings', () => {
    seedProviderConfig({
      provider: 'openai',
      enabled: true,
      apiKey: 'sk-openai-primary',
      name: 'OpenAI Primary',
    });
    seedProviderConfig({
      provider: 'openrouter',
      enabled: false,
      apiKey: '',
      baseUrl: 'https://openrouter.example/v1',
      name: 'OpenRouter',
    });

    const configs = getProviderConfigs();

    // Default Anthropic provider is no longer auto-created on bootstrap;
    // only the explicitly seeded providers should appear.
    expect(configs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        provider: 'openai',
        enabled: true,
        apiKey: 'sk-openai-primary',
      }),
      expect.objectContaining({
        provider: 'openrouter',
        enabled: false,
        apiKey: '',
        baseUrl: 'https://openrouter.example/v1',
      }),
    ]));
    expect(configs).toHaveLength(2);
  });

  it('getEnabledProviderConfigs filters out disabled and keyless providers', () => {
    seedProviderConfig({
      provider: 'openai',
      enabled: true,
      apiKey: 'sk-openai-primary',
      name: 'OpenAI Primary',
    });
    seedProviderConfig({
      provider: 'openrouter',
      enabled: true,
      apiKey: '',
      name: 'OpenRouter',
    });
    seedProviderConfig({
      provider: 'groq',
      enabled: false,
      apiKey: 'sk-groq-disabled',
      name: 'Groq',
    });

    expect(getEnabledProviderConfigs()).toEqual([
      expect.objectContaining({
        provider: 'openai',
        enabled: true,
        apiKey: 'sk-openai-primary',
      }),
    ]);
  });

  it('getApiKeyForProvider matches the first enabled provider config by provider id', () => {
    seedProviderConfig({
      provider: 'openai',
      enabled: true,
      apiKey: 'sk-openai-primary',
      name: 'OpenAI Primary',
    });
    seedProviderConfig({
      provider: 'openai',
      enabled: true,
      apiKey: 'sk-openai-secondary',
      name: 'OpenAI Secondary',
    });

    expect(getApiKeyForProvider('openai')).toBe('sk-openai-primary');
    expect(getApiKeyForProvider('groq')).toBeNull();
  });

  it('uses one canonical config per provider for models, baseUrl, and api key', () => {
    seedProviderConfig({
      provider: 'openai',
      enabled: true,
      apiKey: '',
      baseUrl: 'https://stale-openai.example/v1',
      name: 'OpenAI Stale',
    });
    seedProviderConfig({
      provider: 'openai',
      enabled: true,
      apiKey: 'sk-openai-primary',
      baseUrl: 'https://primary-openai.example/v1',
      name: 'OpenAI Primary',
    });

    const enabledConfigs = getEnabledProviderConfigs();
    const availableModels = getAvailableModels();

    expect(enabledConfigs).toEqual([
      expect.objectContaining({
        provider: 'openai',
        apiKey: 'sk-openai-primary',
        baseUrl: 'https://primary-openai.example/v1',
      }),
    ]);
    expect(getApiKeyForProvider('openai')).toBe('sk-openai-primary');
    expect(
      availableModels.find((model) => model.provider === 'openai' && model.id === 'gpt-4o')?.baseUrl,
    ).toBe('https://primary-openai.example/v1');
    expect(hasAnyEnabledProvider()).toBe(true);
  });

  it('getAvailableModels aggregates enabled provider models and applies baseUrl overrides', () => {
    seedProviderConfig({
      provider: 'anthropic',
      enabled: true,
      apiKey: 'sk-ant-primary',
      name: 'Anthropic',
    });
    seedProviderConfig({
      provider: 'openai',
      enabled: true,
      apiKey: '',
      baseUrl: 'https://custom-openai.example/v1',
      name: 'OpenAI',
    });

    const availableModels = getAvailableModels();

    expect(availableModels.some((model) => model.provider === 'anthropic' && model.id === 'claude-sonnet-4-5')).toBe(true);
    expect(availableModels.some((model) => model.provider === 'openai' && model.id === 'gpt-4o')).toBe(true);
    expect(
      availableModels.find((model) => model.provider === 'openai' && model.id === 'gpt-4o')?.baseUrl,
    ).toBe('https://custom-openai.example/v1');
  });

  it('hasAnyEnabledProvider only returns true when an enabled provider also has a key', () => {
    expect(hasAnyEnabledProvider()).toBe(false);

    const openAiNodeId = seedProviderConfig({
      provider: 'openai',
      enabled: true,
      apiKey: '',
      name: 'OpenAI',
    });

    expect(hasAnyEnabledProvider()).toBe(false);

    useNodeStore.getState().setFieldValue(openAiNodeId, NDX_F.PROVIDER_API_KEY, ['sk-openai-primary']);

    expect(hasAnyEnabledProvider()).toBe(true);
  });

  describe('custom provider models', () => {
    it('includes custom models from the Models field for a known provider', () => {
      seedProviderConfig({
        provider: 'openai',
        enabled: true,
        apiKey: 'sk-openai',
        name: 'OpenAI',
        models: ['ft:gpt-4o-custom', 'o3-preview'],
      });

      const models = getAvailableModels();

      // SDK models should still be present
      expect(models.some((m) => m.provider === 'openai' && m.id === 'gpt-4o')).toBe(true);
      // Custom models should appear
      expect(models.some((m) => m.provider === 'openai' && m.id === 'ft:gpt-4o-custom')).toBe(true);
      expect(models.some((m) => m.provider === 'openai' && m.id === 'o3-preview')).toBe(true);

      // Custom model should use the same API as SDK models
      const customModel = models.find((m) => m.id === 'ft:gpt-4o-custom');
      const sdkModel = models.find((m) => m.id === 'gpt-4o');
      expect(customModel?.api).toBe(sdkModel?.api);
    });

    it('deduplicates custom model IDs that overlap with SDK models', () => {
      seedProviderConfig({
        provider: 'openai',
        enabled: true,
        apiKey: 'sk-openai',
        name: 'OpenAI',
        models: ['gpt-4o', 'custom-model'],
      });

      const models = getAvailableModels();
      const gpt4oModels = models.filter((m) => m.id === 'gpt-4o');

      // gpt-4o should appear only once (from SDK, not duplicated by custom)
      expect(gpt4oModels).toHaveLength(1);
      // custom-model should appear once
      expect(models.filter((m) => m.id === 'custom-model')).toHaveLength(1);
    });

    it('custom models inherit baseUrl from provider config', () => {
      seedProviderConfig({
        provider: 'openai',
        enabled: true,
        apiKey: 'sk-openai',
        baseUrl: 'https://custom-api.example/v1',
        name: 'OpenAI Custom',
        models: ['my-custom-model'],
      });

      const models = getAvailableModels();
      const customModel = models.find((m) => m.id === 'my-custom-model');

      expect(customModel?.baseUrl).toBe('https://custom-api.example/v1');
      expect(customModel?.provider).toBe('openai');
    });

    it('custom models for unknown providers default to openai-completions API', () => {
      // Seed an unknown provider option node directly via loroDoc (bypasses locked guard)
      const optId = 'NDX_PROVIDER_OPT_QWEN';
      loroDoc.createNode(optId, NDX_F.PROVIDER_ID);
      loroDoc.setNodeRichTextContent(optId, 'qwen', [], []);
      loroDoc.commitDoc();

      seedProviderConfig({
        provider: 'qwen',
        enabled: true,
        apiKey: 'sk-qwen',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        name: 'Qwen',
        models: ['qwen-plus', 'qwen-turbo'],
      });

      const models = getAvailableModels();

      // No SDK models for unknown providers
      const qwenModels = models.filter((m) => m.provider === 'qwen');
      expect(qwenModels).toHaveLength(2);
      expect(qwenModels.map((m) => m.id).sort()).toEqual(['qwen-plus', 'qwen-turbo']);

      // Unknown providers default to openai-completions
      expect(qwenModels[0].api).toBe('openai-completions');
      expect(qwenModels[0].baseUrl).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1');
    });

    it('provider with no custom models returns only SDK models', () => {
      seedProviderConfig({
        provider: 'openai',
        enabled: true,
        apiKey: 'sk-openai',
        name: 'OpenAI',
      });

      const models = getAvailableModels();

      // Should have SDK models
      expect(models.some((m) => m.provider === 'openai' && m.id === 'gpt-4o')).toBe(true);
      // No extra custom models
      expect(models.every((m) => m.provider === 'openai')).toBe(true);
    });

    it('getAvailableModelsWithMeta marks custom models as not featured', () => {
      seedProviderConfig({
        provider: 'openai',
        enabled: true,
        apiKey: 'sk-openai',
        name: 'OpenAI',
        models: ['my-custom-model'],
      });

      const modelsWithMeta = getAvailableModelsWithMeta();
      const customModel = modelsWithMeta.find((m) => m.id === 'my-custom-model');

      expect(customModel).toBeDefined();
      expect(customModel?.featured).toBe(false);
      expect(customModel?.provider).toBe('openai');
    });

    it('custom model with a featured model ID is still not featured', () => {
      // Use an unknown provider so there are no SDK models to dedup against.
      // Give the custom model an ID that matches a featured model from another
      // provider — the __isCustom marker must force featured: false by design,
      // not merely because the provider lookup misses.
      const optId = 'NDX_PROVIDER_OPT_ACME';
      loroDoc.createNode(optId, NDX_F.PROVIDER_ID);
      loroDoc.setNodeRichTextContent(optId, 'acme', [], []);
      loroDoc.commitDoc();

      // Use a featured OpenAI model name as the custom model ID
      const featuredModelId = 'gpt-5.4';

      seedProviderConfig({
        provider: 'acme',
        enabled: true,
        apiKey: 'sk-acme',
        baseUrl: 'https://acme.example/v1',
        name: 'Acme Corp',
        models: [featuredModelId, 'acme-custom'],
      });

      const modelsWithMeta = getAvailableModelsWithMeta();
      const acmeModels = modelsWithMeta.filter((m) => m.provider === 'acme');

      expect(acmeModels).toHaveLength(2);

      // Both custom models must be not-featured, even though one has an ID
      // that matches a featured model name
      const matchingModel = acmeModels.find((m) => m.id === featuredModelId);
      expect(matchingModel).toBeDefined();
      expect(matchingModel?.featured).toBe(false);

      const otherModel = acmeModels.find((m) => m.id === 'acme-custom');
      expect(otherModel).toBeDefined();
      expect(otherModel?.featured).toBe(false);
    });

    it('disabled provider custom models are excluded', () => {
      seedProviderConfig({
        provider: 'openai',
        enabled: false,
        apiKey: 'sk-openai',
        name: 'OpenAI',
        models: ['custom-disabled-model'],
      });

      const models = getAvailableModels();
      expect(models.some((m) => m.id === 'custom-disabled-model')).toBe(false);
    });
  });
});
