/**
 * Sync status indicator — shown in sidebar above UserMenu.
 *
 * States:
 *   local-only  → hidden (not signed in)
 *   synced      → cloud check (green)
 *   syncing     → cloud spinning
 *   pending     → cloud with count badge
 *   error       → cloud x (red)
 *   offline     → cloud off (muted)
 */
import { Cloud, CloudOff, AlertCircle, Loader2, Check } from '../../lib/icons.js';
import { useSyncStore } from '../../stores/sync-store';

export function SyncStatusIndicator() {
  const status = useSyncStore((s) => s.status);
  const pendingCount = useSyncStore((s) => s.pendingCount);
  const error = useSyncStore((s) => s.error);
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);

  if (status === 'local-only') return null;

  const label = statusLabel(status, pendingCount);
  const tooltip = buildTooltip(status, error, lastSyncedAt, pendingCount);

  return (
    <div className="flex items-center gap-1.5 px-3 py-1 text-xs text-foreground-secondary" title={tooltip}>
      <StatusIcon status={status} />
      <span className="truncate">{label}</span>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'syncing':
      return <Loader2 size={14} className="animate-spin text-foreground-secondary" />;
    case 'synced':
      return <Check size={14} className="text-green-500" />;
    case 'pending':
      return <Cloud size={14} className="text-foreground-secondary" />;
    case 'error':
      return <AlertCircle size={14} className="text-red-500" />;
    case 'offline':
      return <CloudOff size={14} className="text-foreground-secondary" />;
    default:
      return null;
  }
}

function statusLabel(status: string, pendingCount: number): string {
  switch (status) {
    case 'syncing': return 'Syncing...';
    case 'synced': return 'Synced';
    case 'pending': return `${pendingCount} pending`;
    case 'error': return 'Sync error';
    case 'offline': return 'Offline';
    default: return '';
  }
}

function buildTooltip(
  status: string,
  error: string | null,
  lastSyncedAt: number | null,
  pendingCount: number,
): string {
  const parts: string[] = [];

  if (lastSyncedAt) {
    const ago = Math.round((Date.now() - lastSyncedAt) / 1000);
    if (ago < 60) parts.push(`Last synced: ${ago}s ago`);
    else if (ago < 3600) parts.push(`Last synced: ${Math.round(ago / 60)}m ago`);
    else parts.push(`Last synced: ${Math.round(ago / 3600)}h ago`);
  }

  if (pendingCount > 0) parts.push(`${pendingCount} updates pending`);
  if (error) parts.push(`Error: ${error}`);

  return parts.join('\n') || status;
}
