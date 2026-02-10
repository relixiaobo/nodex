/**
 * Supabase Realtime subscription for nodes table.
 * Keeps Zustand store in sync with database changes from other clients.
 */
import { useEffect } from 'react';
import { getSupabase } from '../lib/supabase';
import { useNodeStore } from '../stores/node-store';
import { rowToNode, type NodeRow } from '../services/node-service.js';

export function useRealtimeNodes(workspaceId: string | null) {
  useEffect(() => {
    if (!workspaceId) return;

    let channel: ReturnType<ReturnType<typeof getSupabase>['channel']>;

    try {
      const supabase = getSupabase();
      channel = supabase
        .channel(`nodes:${workspaceId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'nodes',
            filter: `workspace_id=eq.${workspaceId}`,
          },
          (payload) => {
            const store = useNodeStore.getState();

            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              const node = rowToNode(payload.new as NodeRow);
              store.setNode(node);
            } else if (payload.eventType === 'DELETE') {
              const oldRow = payload.old as { id?: string };
              if (oldRow.id) {
                store.removeNode(oldRow.id);
              }
            }
          },
        )
        .subscribe();
    } catch {
      // Supabase not initialized yet — skip realtime
      return;
    }

    return () => {
      if (channel) {
        getSupabase().removeChannel(channel);
      }
    };
  }, [workspaceId]);
}
