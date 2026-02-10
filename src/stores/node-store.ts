/**
 * Normalized node entity store.
 *
 * Central cache for all NodexNode entities loaded from Supabase.
 * Components select individual nodes by ID for minimal re-renders.
 *
 * NOT persisted (node data lives in Supabase; local cache is ephemeral).
 */
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { nanoid } from 'nanoid';
import type { NodexNode } from '../types/index.js';
import * as nodeService from '../services/node-service.js';
import { isSupabaseReady } from '../services/supabase.js';

interface NodeStore {
  /** Normalized entities map: { [nodeId]: NodexNode } */
  entities: Record<string, NodexNode>;

  /** IDs currently being fetched (prevent duplicate requests) */
  loading: Set<string>;

  // ─── Local state mutations ───

  /** Set a single node in the cache */
  setNode(node: NodexNode): void;

  /** Set multiple nodes in the cache */
  setNodes(nodes: NodexNode[]): void;

  /** Remove a node from the cache */
  removeNode(id: string): void;

  // ─── Async data operations ───

  /** Fetch a single node from Supabase and cache it */
  fetchNode(id: string): Promise<NodexNode | null>;

  /** Fetch all children of a node and cache them */
  fetchChildren(nodeId: string): Promise<NodexNode[]>;

  /** Create a new child node under parentId */
  createChild(
    parentId: string,
    workspaceId: string,
    userId: string,
    name?: string,
  ): Promise<NodexNode>;

  /** Create a sibling node after the given nodeId */
  createSibling(
    nodeId: string,
    workspaceId: string,
    userId: string,
  ): Promise<NodexNode>;

  /** Update a node's name (optimistic) */
  updateNodeName(id: string, name: string, userId: string): Promise<void>;

  /** Indent node: make it a child of its previous sibling */
  indentNode(nodeId: string, userId: string): Promise<void>;

  /** Outdent node: make it a sibling of its parent */
  outdentNode(nodeId: string, userId: string): Promise<void>;

  /** Move node up among siblings */
  moveNodeUp(nodeId: string, userId: string): Promise<void>;

  /** Move node down among siblings */
  moveNodeDown(nodeId: string, userId: string): Promise<void>;

  /** Move node to a new parent at a specific position (for drag-and-drop) */
  moveNodeTo(
    nodeId: string,
    newParentId: string,
    position: number,
    userId: string,
  ): Promise<void>;

  /** Move node to trash */
  trashNode(nodeId: string, workspaceId: string, userId: string): Promise<void>;
}

export const useNodeStore = create<NodeStore>()(
  immer((set, get) => ({
    entities: {},
    loading: new Set<string>(),

    setNode: (node) =>
      set((state) => {
        state.entities[node.id] = node;
      }),

    setNodes: (nodes) =>
      set((state) => {
        for (const node of nodes) {
          state.entities[node.id] = node;
        }
      }),

    removeNode: (id) =>
      set((state) => {
        delete state.entities[id];
      }),

    fetchNode: async (id) => {
      const { loading, entities } = get();
      // Return cached if exists
      if (entities[id]) return entities[id];
      // Skip remote fetch if Supabase not connected
      if (!isSupabaseReady()) return null;
      // Prevent duplicate fetches
      if (loading.has(id)) return null;

      set((state) => {
        state.loading.add(id);
      });

      try {
        const node = await nodeService.getNode(id);
        if (node) {
          set((state) => {
            state.entities[node.id] = node;
            state.loading.delete(id);
          });
        } else {
          set((state) => {
            state.loading.delete(id);
          });
        }
        return node;
      } catch {
        set((state) => {
          state.loading.delete(id);
        });
        return null;
      }
    },

    fetchChildren: async (nodeId) => {
      if (!isSupabaseReady()) return [];

      try {
        const children = await nodeService.getChildren(nodeId);
        if (children.length > 0) {
          set((state) => {
            for (const child of children) {
              state.entities[child.id] = child;
            }
          });
        }
        return children;
      } catch {
        return [];
      }
    },

    createChild: async (parentId, workspaceId, userId, name) => {
      const id = nanoid();
      const now = Date.now();

      // Optimistic: add to store immediately
      const optimisticNode: NodexNode = {
        id,
        workspaceId,
        props: { created: now, name: name ?? '', _ownerId: parentId },
        children: [],
        version: 1,
        updatedAt: now,
        createdBy: userId,
        updatedBy: userId,
      };

      set((state) => {
        state.entities[id] = optimisticNode;
        // Add to parent's children
        const parent = state.entities[parentId];
        if (parent) {
          if (!parent.children) parent.children = [];
          parent.children.push(id);
        }
      });

      // Persist to Supabase (skip if not connected)
      if (!isSupabaseReady()) return optimisticNode;

      try {
        const node = await nodeService.createNode(
          { id, workspaceId, props: { created: now, name: name ?? '', _ownerId: parentId } },
          userId,
        );
        await nodeService.addChild(parentId, id, userId);

        set((state) => {
          state.entities[node.id] = node;
        });
        return node;
      } catch {
        // Rollback on server failure
        set((state) => {
          delete state.entities[id];
          const parent = state.entities[parentId];
          if (parent?.children) {
            parent.children = parent.children.filter((cid) => cid !== id);
          }
        });
        return optimisticNode;
      }
    },

    createSibling: async (nodeId, workspaceId, userId) => {
      const { entities } = get();
      const node = entities[nodeId];
      const parentId = node?.props._ownerId;
      if (!parentId) throw new Error('Cannot create sibling: no parent');

      const parent = entities[parentId];
      const siblings = parent?.children ?? [];
      const currentIndex = siblings.indexOf(nodeId);
      const insertPosition = currentIndex >= 0 ? currentIndex + 1 : siblings.length;

      const id = nanoid();
      const now = Date.now();

      const optimisticNode: NodexNode = {
        id,
        workspaceId,
        props: { created: now, name: '', _ownerId: parentId },
        children: [],
        version: 1,
        updatedAt: now,
        createdBy: userId,
        updatedBy: userId,
      };

      // Optimistic update
      set((state) => {
        state.entities[id] = optimisticNode;
        const p = state.entities[parentId];
        if (p) {
          if (!p.children) p.children = [];
          p.children.splice(insertPosition, 0, id);
        }
      });

      // Persist (skip if not connected)
      if (!isSupabaseReady()) return optimisticNode;

      try {
        const newNode = await nodeService.createNode(
          { id, workspaceId, props: { created: now, name: '', _ownerId: parentId } },
          userId,
        );
        await nodeService.addChild(parentId, id, userId, insertPosition);

        set((state) => {
          state.entities[newNode.id] = newNode;
        });
        return newNode;
      } catch {
        // Rollback
        set((state) => {
          delete state.entities[id];
          const p = state.entities[parentId];
          if (p?.children) {
            p.children = p.children.filter((cid) => cid !== id);
          }
        });
        return optimisticNode;
      }
    },

    updateNodeName: async (id, name, userId) => {
      const { entities } = get();
      const oldName = entities[id]?.props.name;

      // Optimistic
      set((state) => {
        if (state.entities[id]) {
          state.entities[id].props.name = name;
        }
      });

      if (!isSupabaseReady()) return;

      try {
        await nodeService.updateNode(id, { props: { name } }, userId);
      } catch {
        // Rollback
        set((state) => {
          if (state.entities[id]) {
            state.entities[id].props.name = oldName;
          }
        });
      }
    },

    indentNode: async (nodeId, userId) => {
      const { entities } = get();
      const node = entities[nodeId];
      const parentId = node?.props._ownerId;
      if (!parentId) return;

      const parent = entities[parentId];
      if (!parent?.children) return;

      const index = parent.children.indexOf(nodeId);
      if (index <= 0) return; // Can't indent first child

      const newParentId = parent.children[index - 1];

      // Optimistic: move in local state
      set((state) => {
        const p = state.entities[parentId];
        if (p?.children) {
          p.children = p.children.filter((id) => id !== nodeId);
        }
        const newParent = state.entities[newParentId];
        if (newParent) {
          if (!newParent.children) newParent.children = [];
          newParent.children.push(nodeId);
        }
        if (state.entities[nodeId]) {
          state.entities[nodeId].props._ownerId = newParentId;
        }
      });

      if (!isSupabaseReady()) return;

      try {
        await nodeService.moveNode(nodeId, newParentId, userId);
      } catch {
        // Rollback
        set((state) => {
          const newParent = state.entities[newParentId];
          if (newParent?.children) {
            newParent.children = newParent.children.filter((id) => id !== nodeId);
          }
          const p = state.entities[parentId];
          if (p?.children) {
            p.children.splice(index, 0, nodeId);
          }
          if (state.entities[nodeId]) {
            state.entities[nodeId].props._ownerId = parentId;
          }
        });
      }
    },

    outdentNode: async (nodeId, userId) => {
      const { entities } = get();
      const node = entities[nodeId];
      const parentId = node?.props._ownerId;
      if (!parentId) return;

      const parent = entities[parentId];
      const grandparentId = parent?.props._ownerId;
      if (!grandparentId) return; // Parent is top-level, can't outdent

      const grandparent = entities[grandparentId];
      if (!grandparent?.children) return;

      const parentIndex = grandparent.children.indexOf(parentId);
      const insertPosition = parentIndex + 1;

      // Optimistic
      set((state) => {
        // Remove from current parent
        const p = state.entities[parentId];
        if (p?.children) {
          p.children = p.children.filter((id) => id !== nodeId);
        }
        // Add to grandparent after parent
        const gp = state.entities[grandparentId];
        if (gp?.children) {
          gp.children.splice(insertPosition, 0, nodeId);
        }
        if (state.entities[nodeId]) {
          state.entities[nodeId].props._ownerId = grandparentId;
        }
      });

      if (!isSupabaseReady()) return;

      try {
        await nodeService.moveNode(nodeId, grandparentId, userId, insertPosition);
      } catch {
        // Rollback
        set((state) => {
          const gp = state.entities[grandparentId];
          if (gp?.children) {
            gp.children = gp.children.filter((id) => id !== nodeId);
          }
          const p = state.entities[parentId];
          if (p?.children) {
            p.children.push(nodeId);
          }
          if (state.entities[nodeId]) {
            state.entities[nodeId].props._ownerId = parentId;
          }
        });
      }
    },

    moveNodeUp: async (nodeId, userId) => {
      const { entities } = get();
      const node = entities[nodeId];
      const parentId = node?.props._ownerId;
      if (!parentId) return;

      const parent = entities[parentId];
      if (!parent?.children) return;

      const index = parent.children.indexOf(nodeId);
      if (index <= 0) return; // Already first

      // Optimistic: swap with previous sibling
      set((state) => {
        const p = state.entities[parentId];
        if (p?.children && p.children.length > index) {
          const temp = p.children[index - 1];
          p.children[index - 1] = nodeId;
          p.children[index] = temp;
        }
      });

      if (!isSupabaseReady()) return;

      try {
        const newChildren = get().entities[parentId]?.children;
        if (newChildren) {
          await nodeService.reorderChildren(parentId, newChildren, userId);
        }
      } catch {
        // Rollback: swap back
        set((state) => {
          const p = state.entities[parentId];
          if (p?.children && p.children.length > index) {
            const temp = p.children[index - 1];
            p.children[index - 1] = p.children[index];
            p.children[index] = temp;
          }
        });
      }
    },

    moveNodeDown: async (nodeId, userId) => {
      const { entities } = get();
      const node = entities[nodeId];
      const parentId = node?.props._ownerId;
      if (!parentId) return;

      const parent = entities[parentId];
      if (!parent?.children) return;

      const index = parent.children.indexOf(nodeId);
      if (index < 0 || index >= parent.children.length - 1) return; // Already last

      // Optimistic: swap with next sibling
      set((state) => {
        const p = state.entities[parentId];
        if (p?.children && p.children.length > index + 1) {
          const temp = p.children[index + 1];
          p.children[index + 1] = nodeId;
          p.children[index] = temp;
        }
      });

      if (!isSupabaseReady()) return;

      try {
        const newChildren = get().entities[parentId]?.children;
        if (newChildren) {
          await nodeService.reorderChildren(parentId, newChildren, userId);
        }
      } catch {
        // Rollback: swap back
        set((state) => {
          const p = state.entities[parentId];
          if (p?.children && p.children.length > index + 1) {
            const temp = p.children[index + 1];
            p.children[index + 1] = p.children[index];
            p.children[index] = temp;
          }
        });
      }
    },

    moveNodeTo: async (nodeId, newParentId, position, userId) => {
      const { entities } = get();
      const node = entities[nodeId];
      const oldParentId = node?.props._ownerId;
      if (!oldParentId) return;

      // Don't drop onto self or own descendant
      if (nodeId === newParentId) return;
      let checkId: string | undefined = newParentId;
      while (checkId) {
        if (checkId === nodeId) return; // Descendant check
        checkId = entities[checkId]?.props._ownerId;
      }

      const oldParent = entities[oldParentId];
      const oldIndex = oldParent?.children?.indexOf(nodeId) ?? -1;

      // Optimistic
      set((state) => {
        // Remove from old parent
        const op = state.entities[oldParentId];
        if (op?.children) {
          op.children = op.children.filter((id) => id !== nodeId);
        }
        // Add to new parent at position
        const np = state.entities[newParentId];
        if (np) {
          if (!np.children) np.children = [];
          // Adjust position if same parent and removing shifted indices
          let insertAt = position;
          if (oldParentId === newParentId && oldIndex < position) {
            insertAt = Math.max(0, position - 1);
          }
          np.children.splice(insertAt, 0, nodeId);
        }
        if (state.entities[nodeId]) {
          state.entities[nodeId].props._ownerId = newParentId;
        }
      });

      if (!isSupabaseReady()) return;

      try {
        await nodeService.moveNode(nodeId, newParentId, userId, position);
      } catch {
        // Rollback
        set((state) => {
          // Remove from new parent
          const np = state.entities[newParentId];
          if (np?.children) {
            np.children = np.children.filter((id) => id !== nodeId);
          }
          // Restore to old parent
          const op = state.entities[oldParentId];
          if (op) {
            if (!op.children) op.children = [];
            op.children.splice(oldIndex >= 0 ? oldIndex : op.children.length, 0, nodeId);
          }
          if (state.entities[nodeId]) {
            state.entities[nodeId].props._ownerId = oldParentId;
          }
        });
      }
    },

    trashNode: async (nodeId, workspaceId, userId) => {
      const { entities } = get();
      const node = entities[nodeId];
      const oldOwnerId = node?.props._ownerId;

      const trashId = `${workspaceId}_TRASH`;

      // Optimistic: remove from parent's children, add to trash, update ownerId
      set((state) => {
        if (oldOwnerId) {
          const parent = state.entities[oldOwnerId];
          if (parent?.children) {
            parent.children = parent.children.filter((id) => id !== nodeId);
          }
        }
        const trash = state.entities[trashId];
        if (trash) {
          if (!trash.children) trash.children = [];
          trash.children.push(nodeId);
        }
        if (state.entities[nodeId]) {
          state.entities[nodeId].props._ownerId = trashId;
        }
      });

      if (!isSupabaseReady()) return;

      try {
        await nodeService.trashNode(nodeId, workspaceId, userId);
      } catch {
        // Rollback
        set((state) => {
          // Remove from trash
          const trash = state.entities[trashId];
          if (trash?.children) {
            trash.children = trash.children.filter((id) => id !== nodeId);
          }
          // Restore owner
          if (state.entities[nodeId]) {
            state.entities[nodeId].props._ownerId = oldOwnerId;
          }
          // Re-add to original parent
          if (oldOwnerId) {
            const parent = state.entities[oldOwnerId];
            if (parent) {
              if (!parent.children) parent.children = [];
              parent.children.push(nodeId);
            }
          }
        });
      }
    },
  })),
);
