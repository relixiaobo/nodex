/**
 * Trailing input: phantom empty editor for creating new nodes.
 *
 * - Click → focus, cursor appears
 * - Type + Enter → create child of effective parent, clear input, keep focus
 * - Enter empty → no-op
 * - Tab → indent (move effective parent to last sibling's child level)
 * - Shift+Tab → outdent (move effective parent up one level)
 * - Escape → blur
 * - Blur with content → create child (preserve user's work)
 * - Blur empty → no-op
 *
 * Tab/Shift+Tab do NOT create real nodes — they just change where the
 * next Enter will create a node (effective parent + visual depth).
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import { Extension } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useNodeStore } from '../../stores/node-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { useUIStore } from '../../stores/ui-store';
import { WORKSPACE_CONTAINERS } from '../../types';
import { BulletChevron } from '../outliner/BulletChevron';

const CONTAINER_SUFFIXES = Object.values(WORKSPACE_CONTAINERS);
function isWorkspaceContainer(nodeId: string): boolean {
  return CONTAINER_SUFFIXES.some(suffix => nodeId.endsWith(`_${suffix}`));
}

interface TrailingInputProps {
  parentId: string;
  depth: number;
  autoFocus?: boolean;
  /** Compound expand key for the parent node (grandparentId:parentId) */
  parentExpandKey: string;
}

export function TrailingInput({ parentId, depth, autoFocus, parentExpandKey }: TrailingInputProps) {
  const createChild = useNodeStore((s) => s.createChild);
  const addUnnamedFieldToNode = useNodeStore((s) => s.addUnnamedFieldToNode);
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const userId = useWorkspaceStore((s) => s.userId);
  const setExpanded = useUIStore((s) => s.setExpanded);
  const setFocusedNode = useUIStore((s) => s.setFocusedNode);
  const setEditingFieldName = useUIStore((s) => s.setEditingFieldName);
  const setTriggerHint = useUIStore((s) => s.setTriggerHint);

  // Effective parent/depth — Tab/Shift+Tab change these without creating nodes
  const [effectiveParentId, setEffectiveParentId] = useState(parentId);
  const [effectiveDepth, setEffectiveDepth] = useState(depth);

  // Track the expand key for the current effectiveParentId
  const [effectiveParentEK, setEffectiveParentEK] = useState(parentExpandKey);

  // Reset when props change (parent re-renders, or node gets new children)
  useEffect(() => {
    setEffectiveParentId(parentId);
    setEffectiveDepth(depth);
    setEffectiveParentEK(parentExpandKey);
  }, [parentId, depth, parentExpandKey]);

  const committingRef = useRef(false);
  const [hasContent, setHasContent] = useState(false);

  const callbacksRef = useRef({
    createChild, addUnnamedFieldToNode, wsId, userId,
    parentId, effectiveParentId, effectiveDepth, effectiveParentEK,
    setEffectiveParentId, setEffectiveDepth, setEffectiveParentEK,
    setExpanded, setFocusedNode, setEditingFieldName, setTriggerHint,
  });
  callbacksRef.current = {
    createChild, addUnnamedFieldToNode, wsId, userId,
    parentId, effectiveParentId, effectiveDepth, effectiveParentEK,
    setEffectiveParentId, setEffectiveDepth, setEffectiveParentEK,
    setExpanded, setFocusedNode, setEditingFieldName, setTriggerHint,
  };

  const commitContent = useCallback((html: string, editor: Editor) => {
    const cleaned = stripWrappingP(html);
    if (!cleaned || committingRef.current) return;

    const ref = callbacksRef.current;
    if (!ref.wsId || !ref.userId) return;

    committingRef.current = true;
    editor.commands.clearContent(false);
    setHasContent(false);

    // Create child — keep cursor in TrailingInput so the user can keep typing.
    // (TrailingInput always renders at the bottom of expanded children.)
    ref.createChild(ref.effectiveParentId, ref.wsId, ref.userId, cleaned).then(() => {
      ref.setExpanded(ref.effectiveParentEK, true);
      queueMicrotask(() => { committingRef.current = false; });
    });
  }, []);

  const keymap = useRef(
    Extension.create({
      name: 'trailingInputKeymap',
      addKeyboardShortcuts() {
        return {
          Enter: ({ editor }) => {
            const text = editor.state.doc.textContent.trim();
            if (text.length > 0) {
              commitContent(editor.getHTML(), editor);
            } else {
              // Empty Enter → create empty child so user can keep creating nodes
              const ref = callbacksRef.current;
              if (!ref.wsId || !ref.userId) return true;
              committingRef.current = true;
              ref.createChild(ref.effectiveParentId, ref.wsId, ref.userId, '').then(() => {
                ref.setExpanded(ref.effectiveParentEK, true);
                queueMicrotask(() => { committingRef.current = false; });
              });
            }
            return true;
          },
          Tab: () => {
            // Indent: move effective parent to last child of current parent
            const ref = callbacksRef.current;
            const parent = useNodeStore.getState().entities[ref.effectiveParentId];
            const siblings = parent?.children ?? [];
            if (siblings.length === 0) return true; // No siblings to indent under

            const lastSiblingId = siblings[siblings.length - 1];
            // Expand the last sibling (compound key: effectiveParentId is its parent context)
            const siblingEK = `${ref.effectiveParentId}:${lastSiblingId}`;
            ref.setExpanded(siblingEK, true);
            // Track: new effectiveParentId is lastSiblingId, its expand key is siblingEK
            ref.setEffectiveParentEK(siblingEK);
            ref.setEffectiveParentId(lastSiblingId);
            ref.setEffectiveDepth(ref.effectiveDepth + 1);
            return true;
          },
          'Shift-Tab': () => {
            // Outdent: move effective parent up one level
            const ref = callbacksRef.current;

            // Can't go above workspace containers or depth 0
            if (ref.effectiveDepth <= 0) return true;
            if (isWorkspaceContainer(ref.effectiveParentId)) return true;

            const currentParent = useNodeStore.getState().entities[ref.effectiveParentId];
            const grandparentId = currentParent?.props._ownerId;
            if (!grandparentId || isWorkspaceContainer(grandparentId)) return true;

            // Compute expand key for grandparent (best-effort via _ownerId)
            const ggpId = useNodeStore.getState().entities[grandparentId]?.props._ownerId ?? '';
            ref.setEffectiveParentEK(`${ggpId}:${grandparentId}`);
            ref.setEffectiveParentId(grandparentId);
            ref.setEffectiveDepth(ref.effectiveDepth - 1);
            return true;
          },
          Backspace: ({ editor }) => {
            const isEmpty = editor.state.doc.textContent.length === 0;
            if (!isEmpty) return false; // Let TipTap handle normal backspace

            const ref = callbacksRef.current;

            // If depth was shifted via Tab/Shift+Tab, undo the shift first
            if (ref.effectiveParentId !== ref.parentId) {
              ref.setEffectiveParentId(ref.parentId);
              ref.setEffectiveDepth(depth);
              return true;
            }

            // At original level: collapse parent → trailing input unmounts, focus parent
            ref.setExpanded(ref.effectiveParentEK, false);
            ref.setFocusedNode(ref.parentId);
            return true;
          },
          Escape: ({ editor }) => {
            editor.commands.blur();
            return true;
          },
        };
      },
    }),
  ).current;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: false,
        orderedList: false,
        listItem: false,
        heading: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Placeholder.configure({
        placeholder: '',
      }),
      keymap,
    ],
    content: '<p></p>',
    editorProps: {
      attributes: {
        class: 'outline-none text-sm leading-[21px]',
      },
    },
    onUpdate: ({ editor }) => {
      const text = editor.state.doc.textContent;
      setHasContent(text.length > 0);

      if (committingRef.current) return;
      const ref = callbacksRef.current;
      if (!ref.wsId || !ref.userId) return;

      // > field trigger: handle directly (no intermediate node needed)
      if (text === '>') {
        committingRef.current = true;
        editor.commands.clearContent(false);
        setHasContent(false);

        ref.addUnnamedFieldToNode(ref.effectiveParentId, ref.wsId, ref.userId).then(({ tupleId }) => {
          ref.setEditingFieldName(tupleId);
          queueMicrotask(() => { committingRef.current = false; });
        });
        return;
      }

      // # or @ trigger: create child node + set triggerHint so OutlinerItem
      // opens the dropdown immediately (extensions need docChanged to fire,
      // but mount doesn't count as docChanged)
      if (text === '#' || text === '@') {
        committingRef.current = true;
        editor.commands.clearContent(false);
        setHasContent(false);

        ref.setTriggerHint(text as '#' | '@');
        ref.createChild(ref.effectiveParentId, ref.wsId, ref.userId, text).then((newNode) => {
          ref.setExpanded(ref.effectiveParentEK, true);
          ref.setFocusedNode(newNode.id, ref.effectiveParentId);
          queueMicrotask(() => { committingRef.current = false; });
        });
      }
    },
    onBlur: ({ editor }) => {
      if (committingRef.current) return;
      const text = editor.state.doc.textContent.trim();
      if (text.length > 0) {
        commitContent(editor.getHTML(), editor);
      }
      setHasContent(false);
      // Reset to original depth on blur
      const ref = callbacksRef.current;
      if (ref.effectiveParentId !== ref.parentId) {
        ref.setEffectiveParentId(ref.parentId);
        ref.setEffectiveDepth(depth);
      }
    },
  });

  // Auto-focus when mounting with autoFocus (leaf node expansion)
  useEffect(() => {
    if (autoFocus && editor && !editor.isDestroyed) {
      editor.commands.focus('start');
    }
  }, [autoFocus, editor]);

  if (!editor) return null;

  return (
    <div
      className="group/row flex min-h-7 items-start gap-[7.5px] py-1"
      style={{ paddingLeft: effectiveDepth * 24 + 6 }}
    >
      <BulletChevron
        hasChildren={false}
        isExpanded={false}
        onToggle={() => {}}
        onDrillDown={() => {}}
        onBulletClick={() => {}}
        dimmed={!hasContent}
      />
      <div className="flex-1 min-w-0">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function stripWrappingP(html: string): string {
  const trimmed = html.trim();
  const match = trimmed.match(/^<p>(.*)<\/p>$/s);
  if (match && !match[1].includes('<p>')) {
    return match[1];
  }
  return trimmed;
}
