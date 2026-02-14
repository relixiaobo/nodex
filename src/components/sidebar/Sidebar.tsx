import { useState } from 'react';
import { Search } from 'lucide-react';
import { useUIStore } from '../../stores/ui-store';
import { useNodeStore } from '../../stores/node-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import {
  WEBCLIP_CAPTURE_ACTIVE_TAB,
  type WebClipCaptureResponse,
} from '../../lib/webclip-messaging.js';
import { SidebarNav } from './SidebarNav';

export function Sidebar() {
  const openSearch = useUIStore((s) => s.openSearch);
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const wsName = useNodeStore((s) => s.entities[wsId ?? '']?.props.name);
  const [captureStatus, setCaptureStatus] = useState<string>('');
  const [captureLoading, setCaptureLoading] = useState(false);

  const canUseRuntime =
    typeof chrome !== 'undefined' &&
    !!chrome.runtime &&
    !!chrome.runtime.sendMessage;

  async function handleCaptureTab() {
    if (!canUseRuntime || captureLoading) return;

    setCaptureLoading(true);
    setCaptureStatus('Capturing current tab...');

    try {
      const response = await chrome.runtime.sendMessage({
        type: WEBCLIP_CAPTURE_ACTIVE_TAB,
      }) as WebClipCaptureResponse;

      if (!response?.ok) {
        setCaptureStatus(`Capture failed: ${response?.error ?? 'unknown error'}`);
        return;
      }

      const snippet = response.payload.pageText.replace(/\s+/g, ' ').slice(0, 100);
      setCaptureStatus(`Captured: ${response.payload.title} (${snippet}${response.payload.pageText.length > 100 ? '...' : ''})`);
    } catch (err) {
      setCaptureStatus(`Capture failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCaptureLoading(false);
    }
  }

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex h-10 items-center justify-between px-3">
        <span className="text-sm font-semibold">{wsName || 'Nodex'}</span>
      </div>
      {/* Quick search trigger */}
      <div className="px-2 pb-1">
        <button
          onClick={openSearch}
          className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground-secondary hover:bg-foreground/5 transition-colors"
        >
          <Search size={14} />
          <span className="flex-1 text-left">Search...</span>
          <kbd className="rounded border border-border bg-muted px-1 text-[10px] font-medium">
            {navigator.platform?.includes('Mac') ? '\u2318' : 'Ctrl+'}K
          </kbd>
        </button>
      </div>
      {/* Temporary capture trigger for web clipping implementation */}
      <div className="px-2 pb-2">
        <button
          onClick={handleCaptureTab}
          disabled={!canUseRuntime || captureLoading}
          className="flex w-full items-center justify-center rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground-secondary hover:bg-foreground/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {captureLoading ? 'Capturing...' : 'Capture Tab (Preview)'}
        </button>
        {captureStatus && (
          <p className="mt-1 line-clamp-2 text-[11px] text-foreground-tertiary">
            {captureStatus}
          </p>
        )}
      </div>
      <SidebarNav />
    </aside>
  );
}
