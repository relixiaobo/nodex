/**
 * Sync status dot — small colored circle indicating sync state.
 * Replaces the larger SyncStatusIndicator that was in the Sidebar.
 */
import { useSyncStore } from '../../stores/sync-store';

const STATUS_CLASSES: Record<string, string> = {
  synced: 'bg-success',
  syncing: 'bg-primary animate-pulse',
  pending: 'bg-warning',
  error: 'bg-destructive',
  offline: 'bg-foreground-tertiary',
};

export function SyncDot() {
  const status = useSyncStore((s) => s.status);
  const pendingCount = useSyncStore((s) => s.pendingCount);
  const error = useSyncStore((s) => s.error);
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);

  if (status === 'local-only') return null;

  const dotClass = STATUS_CLASSES[status] ?? 'bg-gray-400';

  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${dotClass}`}
      title={buildTooltip(status, error, lastSyncedAt, pendingCount)}
    />
  );
}

function buildTooltip(
  status: string,
  error: string | null,
  lastSyncedAt: number | null,
  pendingCount: number,
): string {
  const parts: string[] = [];

  const labels: Record<string, string> = {
    synced: 'Synced',
    syncing: 'Syncing...',
    pending: 'Pending',
    error: 'Sync error',
    offline: 'Offline',
  };
  parts.push(labels[status] ?? status);

  if (lastSyncedAt) {
    const ago = Math.round((Date.now() - lastSyncedAt) / 1000);
    if (ago < 60) parts.push(`Last synced: ${ago}s ago`);
    else if (ago < 3600) parts.push(`Last synced: ${Math.round(ago / 60)}m ago`);
    else parts.push(`Last synced: ${Math.round(ago / 3600)}h ago`);
  }

  if (pendingCount > 0) parts.push(`${pendingCount} updates pending`);
  if (error) parts.push(`Error: ${error}`);

  return parts.join('\n');
}
