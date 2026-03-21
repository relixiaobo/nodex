import { getProviders } from '@mariozechner/pi-ai';
import { useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { ensureTodayNode } from '../../lib/journal.js';
import {
  guessProviderFromApiKey,
  normalizeProviderId,
  saveProviderApiKey,
} from '../../lib/ai-provider-config.js';
import { STARTUP_PAGE, setStartupPagePreference } from '../../lib/settings-service.js';
import { useUIStore } from '../../stores/ui-store.js';

function getActionErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
}

export function ChatOnboarding() {
  const [provider, setProvider] = useState('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const providerOptions = useMemo(
    () => getProviders().map((entry) => normalizeProviderId(entry)).filter((entry) => entry.length > 0),
    [],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    try {
      saveProviderApiKey(provider, apiKey);
      setApiKey('');
    } catch (error) {
      toast.error(getActionErrorMessage(error, 'Failed to save API key'));
    } finally {
      setSubmitting(false);
    }
  }

  function handleStartWithOutliner() {
    setStartupPagePreference(STARTUP_PAGE.TODAY);
    const todayId = ensureTodayNode();
    useUIStore.getState().switchToNode(todayId);
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex flex-1 flex-col justify-center px-6 py-8">
        <div className="mx-auto flex w-full max-w-[320px] flex-col items-center gap-4 text-center">
          <div className="space-y-1">
            <p className="text-lg font-medium text-foreground">Welcome to soma</p>
            <p className="text-sm text-foreground-tertiary">
              Paste an API key to unlock Chat without leaving this panel.
            </p>
          </div>

          <form className="flex w-full flex-col gap-3" onSubmit={handleSubmit}>
            <label className="flex flex-col gap-1 text-left">
              <span className="text-xs font-medium uppercase tracking-[0.08em] text-foreground-tertiary">
                Provider
              </span>
              <select
                aria-label="Select provider"
                value={provider}
                onChange={(event) => setProvider(event.target.value)}
                className="h-10 rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-foreground/20"
              >
                {providerOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-left">
              <span className="text-xs font-medium uppercase tracking-[0.08em] text-foreground-tertiary">
                API key
              </span>
              <input
                aria-label="API key"
                type="password"
                value={apiKey}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setApiKey(nextValue);

                  const detectedProvider = guessProviderFromApiKey(nextValue);
                  if (detectedProvider) {
                    setProvider(detectedProvider);
                  }
                }}
                placeholder="Paste your API key"
                className="h-10 rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-foreground-tertiary focus:border-foreground/20"
              />
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Save API key'}
            </button>
          </form>

          <button
            type="button"
            onClick={handleStartWithOutliner}
            className="text-sm text-foreground-secondary transition-colors hover:text-foreground"
          >
            Start with outliner →
          </button>
        </div>
      </div>
    </div>
  );
}
