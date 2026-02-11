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
import type { NodexNode, DocType } from '../types/index.js';
import { WORKSPACE_CONTAINERS, SYS_A, SYS_D } from '../types/index.js';
import * as nodeService from '../services/node-service.js';
import { isSupabaseReady } from '../services/supabase.js';

const CONTAINER_SUFFIXES = Object.values(WORKSPACE_CONTAINERS);
function isWorkspaceContainer(nodeId: string): boolean {
  return CONTAINER_SUFFIXES.some(suffix => nodeId.endsWith(`_${suffix}`));
}

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
    position?: number,
  ): Promise<NodexNode>;

  /** Create a sibling node after the given nodeId */
  createSibling(
    nodeId: string,
    workspaceId: string,
    userId: string,
    name?: string,
  ): Promise<NodexNode>;

  /** Update a node's name locally (no Supabase sync — for live typing updates) */
  setNodeNameLocal(id: string, name: string): void;

  /** Update a node's name (optimistic + Supabase sync) */
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

  // ─── Tag operations ───

  /** Apply a supertag to a content node (creates metanode + tuple chain) */
  applyTag(nodeId: string, tagDefId: string, workspaceId: string, userId: string): Promise<void>;

  /** Remove a supertag from a content node */
  removeTag(nodeId: string, tagDefId: string, userId: string): Promise<void>;

  /** Create a new TagDef node in the SCHEMA container */
  createTagDef(name: string, workspaceId: string, userId: string): Promise<NodexNode>;

  /** Create a new AttrDef (field definition) and add it as a template tuple to a TagDef */
  createAttrDef(
    name: string,
    tagDefId: string,
    dataType: string,
    workspaceId: string,
    userId: string,
  ): Promise<NodexNode>;

  // ─── Field operations ───

  /** Set a field value on a content node */
  setFieldValue(
    nodeId: string,
    attrDefId: string,
    valueText: string,
    workspaceId: string,
    userId: string,
  ): Promise<void>;

  /** Set an OPTIONS-type field to a specific option node */
  setOptionsFieldValue(nodeId: string, attrDefId: string, optionNodeId: string, userId: string): void;

  /** Clear a field value (set to empty) */
  clearFieldValue(nodeId: string, attrDefId: string, userId: string): Promise<void>;

  /** Add an ad-hoc field to a node (creates tuple + associatedData) */
  addFieldToNode(
    nodeId: string,
    attrDefId: string,
    workspaceId: string,
    userId: string,
  ): Promise<void>;

  /** Create a standalone AttrDef (not tied to a tag) with default plain type */
  createStandaloneAttrDef(
    name: string,
    workspaceId: string,
    userId: string,
  ): Promise<NodexNode>;

  /** Create an unnamed field on a node (for `>` trigger: instant creation) */
  addUnnamedFieldToNode(
    nodeId: string,
    workspaceId: string,
    userId: string,
    afterChildId?: string,
  ): Promise<{ tupleId: string; attrDefId: string }>;

  // ─── Reference operations ───

  /** Add a node as a reference child (no _ownerId change) */
  addReference(parentId: string, refNodeId: string, userId: string, position?: number): void;

  /** Remove a reference from parent.children (node itself is NOT trashed) */
  removeReference(parentId: string, refNodeId: string, userId: string): void;

  /** Rename an attrDef node */
  renameAttrDef(attrDefId: string, newName: string, userId: string): Promise<void>;

  /** Replace a field's attrDef (swap placeholder → existing) and clean up orphan */
  replaceFieldAttrDef(
    nodeId: string,
    tupleId: string,
    oldAttrDefId: string,
    newAttrDefId: string,
    workspaceId: string,
    userId: string,
  ): Promise<void>;
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

    createChild: async (parentId, workspaceId, userId, name, position) => {
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
          if (position !== undefined) {
            parent.children.splice(position, 0, id);
          } else {
            parent.children.push(id);
          }
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

    createSibling: async (nodeId, workspaceId, userId, name) => {
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
        props: { created: now, name: name ?? '', _ownerId: parentId },
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
          { id, workspaceId, props: { created: now, name: name ?? '', _ownerId: parentId } },
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

    setNodeNameLocal: (id, name) => {
      set((state) => {
        if (state.entities[id]) {
          state.entities[id].props.name = name;
        }
      });
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
      if (isWorkspaceContainer(parentId)) return; // Parent is a container, can't outdent

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

    // ─── Tag operations ───

    applyTag: async (nodeId, tagDefId, workspaceId, userId) => {
      const { entities } = get();
      const node = entities[nodeId];
      if (!node) return;

      const now = Date.now();
      // Use nanoid() for all ID generation
      const makeNodeLocal = (id: string, ownerId: string, docType: DocType, children?: string[]): NodexNode => ({
        id,
        workspaceId,
        props: { created: now, name: '', _ownerId: ownerId, _docType: docType },
        children: children ?? [],
        version: 1,
        updatedAt: now,
        createdBy: userId,
        updatedBy: userId,
      });

      set((state) => {
        const n = state.entities[nodeId];
        if (!n) return;

        // 1. Get or create metanode
        let metanodeId = n.props._metaNodeId;
        if (!metanodeId || !state.entities[metanodeId]) {
          metanodeId = nanoid();
          state.entities[metanodeId] = makeNodeLocal(metanodeId, nodeId, 'metanode');
          n.props._metaNodeId = metanodeId;
        }

        const metanode = state.entities[metanodeId];

        // 2. Check if already tagged
        const alreadyTagged = (metanode.children ?? []).some((cid) => {
          const t = state.entities[cid];
          return t?.props._docType === 'tuple' &&
            t.children?.[0] === SYS_A.NODE_SUPERTAGS &&
            t.children?.[1] === tagDefId;
        });
        if (alreadyTagged) return;

        // 3. Create SYS_A13 tag tuple
        const tagTupleId = nanoid();
        state.entities[tagTupleId] = makeNodeLocal(tagTupleId, metanodeId, 'tuple', [SYS_A.NODE_SUPERTAGS, tagDefId]);
        if (!metanode.children) metanode.children = [];
        metanode.children.push(tagTupleId);

        // 4. Instantiate field templates from tagDef
        const tagDef = state.entities[tagDefId];
        if (!tagDef?.children) return;

        if (!n.children) n.children = [];
        if (!n.associationMap) n.associationMap = {};

        for (const templateTupleId of tagDef.children) {
          const template = state.entities[templateTupleId];
          if (template?.props._docType !== 'tuple') continue;
          const attrDefId = template.children?.[0];
          if (!attrDefId || attrDefId.startsWith('SYS_')) continue;

          // Check if field already instantiated (by _sourceId)
          const alreadyHasField = n.children.some((cid) => {
            return state.entities[cid]?.props._sourceId === templateTupleId;
          });
          if (alreadyHasField) continue;

          // Create instance tuple
          const instanceId = nanoid();
          const instanceNode = makeNodeLocal(instanceId, nodeId, 'tuple', [attrDefId]);
          instanceNode.props._sourceId = templateTupleId;
          state.entities[instanceId] = instanceNode;

          // Create associatedData
          const assocId = nanoid();
          state.entities[assocId] = makeNodeLocal(assocId, nodeId, 'associatedData');

          // Wire up
          n.children.push(instanceId);
          n.associationMap[instanceId] = assocId;
        }
      });

      // TODO: Supabase sync when ready
    },

    removeTag: async (nodeId, tagDefId, _userId) => {
      set((state) => {
        const node = state.entities[nodeId];
        if (!node?.props._metaNodeId) return;

        const metanode = state.entities[node.props._metaNodeId];
        if (!metanode?.children) return;

        // Find and remove the SYS_A13 tuple
        const idx = metanode.children.findIndex((cid) => {
          const t = state.entities[cid];
          return t?.props._docType === 'tuple' &&
            t.children?.[0] === SYS_A.NODE_SUPERTAGS &&
            t.children?.[1] === tagDefId;
        });
        if (idx >= 0) {
          metanode.children.splice(idx, 1);
        }
      });
    },

    createTagDef: async (name, workspaceId, userId) => {
      const id = nanoid();
      const now = Date.now();
      const schemaId = `${workspaceId}_SCHEMA`;

      const tagDef: NodexNode = {
        id,
        workspaceId,
        props: { created: now, name, _ownerId: schemaId, _docType: 'tagDef' },
        children: [],
        version: 1,
        updatedAt: now,
        createdBy: userId,
        updatedBy: userId,
      };

      set((state) => {
        // Ensure SCHEMA container exists
        if (!state.entities[schemaId]) {
          state.entities[schemaId] = {
            id: schemaId,
            workspaceId,
            props: { created: now, name: 'Schema', _ownerId: workspaceId },
            children: [],
            version: 1,
            updatedAt: now,
            createdBy: userId,
            updatedBy: userId,
          };
        }
        state.entities[id] = tagDef;
        const schema = state.entities[schemaId];
        if (!schema.children) schema.children = [];
        schema.children.push(id);
      });

      return tagDef;
    },

    createAttrDef: async (name, tagDefId, dataType, workspaceId, userId) => {
      const attrDefId = nanoid();
      const typeTupleId = nanoid();
      const templateTupleId = nanoid();
      const now = Date.now();
      const schemaId = `${workspaceId}_SCHEMA`;

      const attrDef: NodexNode = {
        id: attrDefId,
        workspaceId,
        props: { created: now, name, _ownerId: schemaId, _docType: 'attrDef' },
        children: [typeTupleId],
        version: 1,
        updatedAt: now,
        createdBy: userId,
        updatedBy: userId,
      };

      set((state) => {
        // AttrDef node
        state.entities[attrDefId] = attrDef;

        // Type tuple: [SYS_A02, dataType]
        state.entities[typeTupleId] = {
          id: typeTupleId,
          workspaceId,
          props: { created: now, name: '', _ownerId: attrDefId, _docType: 'tuple' },
          children: [SYS_A.TYPE_CHOICE, dataType],
          version: 1,
          updatedAt: now,
          createdBy: userId,
          updatedBy: userId,
        };

        // Add attrDef to SCHEMA container
        const schema = state.entities[schemaId];
        if (schema) {
          if (!schema.children) schema.children = [];
          schema.children.push(attrDefId);
        }

        // Template tuple in tagDef: [attrDefId]
        state.entities[templateTupleId] = {
          id: templateTupleId,
          workspaceId,
          props: { created: now, name: '', _ownerId: tagDefId, _docType: 'tuple' },
          children: [attrDefId],
          version: 1,
          updatedAt: now,
          createdBy: userId,
          updatedBy: userId,
        };

        // Add template to tagDef
        const tagDef = state.entities[tagDefId];
        if (tagDef) {
          if (!tagDef.children) tagDef.children = [];
          tagDef.children.push(templateTupleId);
        }
      });

      return attrDef;
    },

    // ─── Field operations ───

    setFieldValue: async (nodeId, attrDefId, valueText, workspaceId, userId) => {
      const now = Date.now();

      set((state) => {
        const node = state.entities[nodeId];
        if (!node?.children) return;

        // Find existing field tuple by attrDefId
        let tupleId: string | undefined;
        for (const cid of node.children) {
          const child = state.entities[cid];
          if (child?.props._docType === 'tuple' && child.children?.[0] === attrDefId) {
            tupleId = cid;
            break;
          }
        }

        if (tupleId) {
          // Update existing: create/update value node
          const tuple = state.entities[tupleId];
          if (!tuple) return;
          let valueNodeId = tuple.children?.[1];

          if (valueNodeId && state.entities[valueNodeId]) {
            // Update existing value node
            state.entities[valueNodeId].props.name = valueText;
          } else {
            // Create new value node
            valueNodeId = nanoid();
            state.entities[valueNodeId] = {
              id: valueNodeId,
              workspaceId,
              props: { created: now, name: valueText, _ownerId: nodeId },
              children: [],
              version: 1,
              updatedAt: now,
              createdBy: userId,
              updatedBy: userId,
            };
            if (!tuple.children) tuple.children = [attrDefId];
            tuple.children[1] = valueNodeId;
          }
        } else {
          // Create new field tuple + value node + associatedData
          const newTupleId = nanoid();
          const valueNodeId = nanoid();
          const assocId = nanoid();

          state.entities[valueNodeId] = {
            id: valueNodeId,
            workspaceId,
            props: { created: now, name: valueText, _ownerId: nodeId },
            children: [],
            version: 1,
            updatedAt: now,
            createdBy: userId,
            updatedBy: userId,
          };

          state.entities[newTupleId] = {
            id: newTupleId,
            workspaceId,
            props: { created: now, name: '', _ownerId: nodeId, _docType: 'tuple' },
            children: [attrDefId, valueNodeId],
            version: 1,
            updatedAt: now,
            createdBy: userId,
            updatedBy: userId,
          };

          state.entities[assocId] = {
            id: assocId,
            workspaceId,
            props: { created: now, name: '', _ownerId: nodeId, _docType: 'associatedData' },
            children: [],
            version: 1,
            updatedAt: now,
            createdBy: userId,
            updatedBy: userId,
          };

          node.children.push(newTupleId);
          if (!node.associationMap) node.associationMap = {};
          node.associationMap[newTupleId] = assocId;
        }
      });
    },

    setOptionsFieldValue: (nodeId, attrDefId, optionNodeId, userId) => {
      set((state) => {
        const node = state.entities[nodeId];
        if (!node?.children || !node.associationMap) return;

        // Find the field tuple for this attrDef
        for (const cid of node.children) {
          const child = state.entities[cid];
          if (child?.props._docType === 'tuple' && child.children?.[0] === attrDefId) {
            // Value lives in AssociatedData.children (same as plain fields)
            const assocId = node.associationMap[cid];
            const assoc = assocId ? state.entities[assocId] : undefined;
            if (!assoc) return;

            // Replace children with the selected option node (single-select)
            assoc.children = [optionNodeId];
            assoc.updatedAt = Date.now();
            assoc.updatedBy = userId;
            return;
          }
        }
      });
    },

    clearFieldValue: async (nodeId, attrDefId, _userId) => {
      set((state) => {
        const node = state.entities[nodeId];
        if (!node?.children) return;

        for (const cid of node.children) {
          const child = state.entities[cid];
          if (child?.props._docType === 'tuple' && child.children?.[0] === attrDefId) {
            const valueNodeId = child.children[1];
            if (valueNodeId && state.entities[valueNodeId]) {
              state.entities[valueNodeId].props.name = '';
            }
            break;
          }
        }
      });
    },

    addFieldToNode: async (nodeId, attrDefId, workspaceId, userId) => {
      set((state) => {
        const node = state.entities[nodeId];
        if (!node) return;

        // Check if field already exists
        const alreadyHasField = (node.children ?? []).some((cid) => {
          const child = state.entities[cid];
          return child?.props._docType === 'tuple' && child.children?.[0] === attrDefId;
        });
        if (alreadyHasField) return;

        const now = Date.now();
        const tupleId = nanoid();
        const assocId = nanoid();

        // Create field tuple
        state.entities[tupleId] = {
          id: tupleId,
          workspaceId,
          props: { created: now, name: '', _ownerId: nodeId, _docType: 'tuple' },
          children: [attrDefId],
          version: 1,
          updatedAt: now,
          createdBy: userId,
          updatedBy: userId,
        };

        // Create associatedData node
        state.entities[assocId] = {
          id: assocId,
          workspaceId,
          props: { created: now, name: '', _ownerId: nodeId, _docType: 'associatedData' },
          children: [],
          version: 1,
          updatedAt: now,
          createdBy: userId,
          updatedBy: userId,
        };

        // Wire up
        if (!node.children) node.children = [];
        node.children.push(tupleId);
        if (!node.associationMap) node.associationMap = {};
        node.associationMap[tupleId] = assocId;
      });
    },

    createStandaloneAttrDef: async (name, workspaceId, userId) => {
      const id = nanoid();
      const typeTupleId = nanoid();
      const now = Date.now();
      const schemaId = `${workspaceId}_SCHEMA`;

      const attrDef: NodexNode = {
        id,
        workspaceId,
        props: { created: now, name, _ownerId: schemaId, _docType: 'attrDef' },
        children: [typeTupleId],
        version: 1,
        updatedAt: now,
        createdBy: userId,
        updatedBy: userId,
      };

      set((state) => {
        // Create attrDef
        state.entities[id] = attrDef;

        // Create type tuple [SYS_A02, SYS_D06] (default plain)
        state.entities[typeTupleId] = {
          id: typeTupleId,
          workspaceId,
          props: { created: now, name: '', _ownerId: id, _docType: 'tuple' },
          children: [SYS_A.TYPE_CHOICE, SYS_D.PLAIN],
          version: 1,
          updatedAt: now,
          createdBy: userId,
          updatedBy: userId,
        };

        // Add to SCHEMA container
        if (!state.entities[schemaId]) {
          state.entities[schemaId] = {
            id: schemaId,
            workspaceId,
            props: { created: now, name: 'Schema', _ownerId: workspaceId },
            children: [],
            version: 1,
            updatedAt: now,
            createdBy: userId,
            updatedBy: userId,
          };
        }
        state.entities[schemaId].children!.push(id);
      });

      return get().entities[id];
    },

    addUnnamedFieldToNode: async (nodeId, workspaceId, userId, afterChildId?) => {
      const attrDefId = nanoid();
      const typeTupleId = nanoid();
      const tupleId = nanoid();
      const assocId = nanoid();
      const now = Date.now();
      const schemaId = `${workspaceId}_SCHEMA`;

      set((state) => {
        const node = state.entities[nodeId];
        if (!node) return;

        // 1. Create empty-name attrDef in SCHEMA
        state.entities[attrDefId] = {
          id: attrDefId,
          workspaceId,
          props: { created: now, name: '', _ownerId: schemaId, _docType: 'attrDef' },
          children: [typeTupleId],
          version: 1,
          updatedAt: now,
          createdBy: userId,
          updatedBy: userId,
        };
        state.entities[typeTupleId] = {
          id: typeTupleId,
          workspaceId,
          props: { created: now, name: '', _ownerId: attrDefId, _docType: 'tuple' },
          children: [SYS_A.TYPE_CHOICE, SYS_D.PLAIN],
          version: 1,
          updatedAt: now,
          createdBy: userId,
          updatedBy: userId,
        };
        if (state.entities[schemaId]) {
          state.entities[schemaId].children!.push(attrDefId);
        }

        // 2. Create field tuple [attrDefId] on node
        state.entities[tupleId] = {
          id: tupleId,
          workspaceId,
          props: { created: now, name: '', _ownerId: nodeId, _docType: 'tuple' },
          children: [attrDefId],
          version: 1,
          updatedAt: now,
          createdBy: userId,
          updatedBy: userId,
        };

        // 3. Create empty associatedData
        state.entities[assocId] = {
          id: assocId,
          workspaceId,
          props: { created: now, name: '', _ownerId: nodeId, _docType: 'associatedData' },
          children: [],
          version: 1,
          updatedAt: now,
          createdBy: userId,
          updatedBy: userId,
        };

        // 4. Wire up
        if (!node.children) node.children = [];
        if (afterChildId) {
          const idx = node.children.indexOf(afterChildId);
          if (idx >= 0) {
            node.children.splice(idx + 1, 0, tupleId);
          } else {
            node.children.push(tupleId);
          }
        } else {
          node.children.push(tupleId);
        }
        if (!node.associationMap) node.associationMap = {};
        node.associationMap[tupleId] = assocId;
        node.updatedAt = now;
        node.updatedBy = userId;
      });

      return { tupleId, attrDefId };
    },

    renameAttrDef: async (attrDefId, newName, userId) => {
      set((state) => {
        const attrDef = state.entities[attrDefId];
        if (!attrDef) return;
        attrDef.props.name = newName;
        attrDef.updatedAt = Date.now();
        attrDef.updatedBy = userId;
      });
    },

    replaceFieldAttrDef: async (nodeId, tupleId, oldAttrDefId, newAttrDefId, workspaceId, userId) => {
      set((state) => {
        const node = state.entities[nodeId];
        const tuple = state.entities[tupleId];
        if (!node || !tuple?.children) return;

        // Guard: don't replace if parent already has a field with newAttrDefId
        const alreadyHas = node.children?.some((cid) => {
          if (cid === tupleId) return false; // skip current tuple
          const c = state.entities[cid];
          return c?.props._docType === 'tuple' && c.children?.[0] === newAttrDefId;
        });
        if (alreadyHas) return;

        // Swap attrDefId in tuple
        tuple.children[0] = newAttrDefId;
        tuple.updatedAt = Date.now();
        tuple.updatedBy = userId;

        // Clean up orphaned placeholder attrDef
        const oldAttrDef = state.entities[oldAttrDefId];
        if (oldAttrDef) {
          // Remove from SCHEMA container
          const schemaId = `${workspaceId}_SCHEMA`;
          const schema = state.entities[schemaId];
          if (schema?.children) {
            const idx = schema.children.indexOf(oldAttrDefId);
            if (idx >= 0) schema.children.splice(idx, 1);
          }
          // Delete type tuple children
          if (oldAttrDef.children) {
            for (const cid of oldAttrDef.children) {
              delete state.entities[cid];
            }
          }
          delete state.entities[oldAttrDefId];
        }
      });
    },

    // ─── Reference operations ───

    addReference: (parentId, refNodeId, _userId, position) => {
      set((state) => {
        const parent = state.entities[parentId];
        if (!parent) return;
        if (!parent.children) parent.children = [];
        // Prevent duplicate reference
        if (parent.children.includes(refNodeId)) return;
        if (position !== undefined && position >= 0 && position <= parent.children.length) {
          parent.children.splice(position, 0, refNodeId);
        } else {
          parent.children.push(refNodeId);
        }
        parent.updatedAt = Date.now();
      });
    },

    removeReference: (parentId, refNodeId, _userId) => {
      set((state) => {
        const parent = state.entities[parentId];
        if (!parent?.children) return;
        const idx = parent.children.indexOf(refNodeId);
        if (idx >= 0) {
          parent.children.splice(idx, 1);
          parent.updatedAt = Date.now();
        }
      });
    },
  })),
);
