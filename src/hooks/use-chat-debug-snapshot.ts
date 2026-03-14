import { useEffect, useState } from 'react';
import type { AgentDebugState } from './use-agent.js';
import { collectAgentDebugSnapshot, type AgentDebugSnapshot } from '../lib/ai-debug.js';
import { useUIStore } from '../stores/ui-store.js';

interface UseChatDebugSnapshotResult {
  snapshot: AgentDebugSnapshot | null;
  error: string | null;
  loading: boolean;
}

export function useChatDebugSnapshot(debug: AgentDebugState): UseChatDebugSnapshotResult {
  const activePanelId = useUIStore((state) => state.activePanelId);
  const panels = useUIStore((state) => state.panels);
  const [tabRefreshVersion, setTabRefreshVersion] = useState(0);
  const [snapshot, setSnapshot] = useState<AgentDebugSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleContextRefresh() {
      setTabRefreshVersion((value) => value + 1);
    }

    window.addEventListener('focus', handleContextRefresh);

    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.onActivated?.addListener(handleContextRefresh);
      chrome.tabs.onUpdated?.addListener(handleContextRefresh);
    }

    return () => {
      window.removeEventListener('focus', handleContextRefresh);
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.onActivated?.removeListener(handleContextRefresh);
        chrome.tabs.onUpdated?.removeListener(handleContextRefresh);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void collectAgentDebugSnapshot(debug)
      .then((nextSnapshot) => {
        if (cancelled) return;
        setSnapshot(nextSnapshot);
        setError(null);
      })
      .catch((loadError) => {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      });

    return () => {
      cancelled = true;
    };
  }, [debug.revision, panels, activePanelId, tabRefreshVersion]);

  return {
    snapshot,
    error,
    loading: snapshot === null && error === null,
  };
}
