/**
 * Trailing input: phantom empty editor for creating new nodes.
 *
 * - Click → focus, cursor appears
 * - Type + Enter → create child of effective parent, clear input, keep focus
 * - Enter empty → create empty child
 * - Tab → indent (move effective parent to last sibling's child level)
 * - Shift+Tab → outdent (move effective parent up one level)
 * - Escape → blur
 * - Blur with content → create child (preserve user's work)
 * - Blur empty → no-op
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { EditorState, TextSelection, type Plugin } from 'prosemirror-state';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';
import { EditorView } from 'prosemirror-view';
import { useNodeStore } from '../../stores/node-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { useUIStore } from '../../stores/ui-store';
import { WORKSPACE_CONTAINERS, SYS_D } from '../../types';
import { getLastVisibleNode } from '../../lib/tree-utils.js';
import { getPrimaryShortcutKey } from '../../lib/shortcut-registry';
import { resolveTrailingUpdateAction } from '../../lib/trailing-input-actions.js';
import {
  resolveTrailingArrowDownIntent,
  resolveTrailingArrowUpIntent,
  resolveTrailingBackspaceIntent,
  resolveTrailingEscapeIntent,
} from '../../lib/trailing-input-navigation.js';
import { useFieldOptions } from '../../hooks/use-field-options.js';
import { BulletChevron } from '../outliner/BulletChevron';
import { pmSchema } from './pm-schema.js';
import { marksToDoc } from '../../lib/pm-doc-utils.js';

const CONTAINER_SUFFIXES = Object.values(WORKSPACE_CONTAINERS);
function isWorkspaceContainer(nodeId: string): boolean {
  return CONTAINER_SUFFIXES.some((suffix) => nodeId.endsWith(`_${suffix}`));
}

const KEY_TRAILING_ENTER = getPrimaryShortcutKey('trailing.enter', 'Enter');
const KEY_TRAILING_INDENT = getPrimaryShortcutKey('trailing.indent_depth', 'Tab');
const KEY_TRAILING_OUTDENT = getPrimaryShortcutKey('trailing.outdent_depth', 'Shift-Tab');
const KEY_TRAILING_BACKSPACE = getPrimaryShortcutKey('trailing.backspace', 'Backspace');
const KEY_TRAILING_ARROW_DOWN = getPrimaryShortcutKey('trailing.arrow_down', 'ArrowDown');
const KEY_TRAILING_ARROW_UP = getPrimaryShortcutKey('trailing.arrow_up', 'ArrowUp');
const KEY_TRAILING_ESCAPE = getPrimaryShortcutKey('trailing.escape', 'Escape');

interface TrailingInputProps {
  parentId: string;
  depth: number;
  autoFocus?: boolean;
  /** Compound expand key for the parent node (grandparentId:parentId) */
  parentExpandKey: string;
  /** Field data type (e.g., SYS_D.OPTIONS) — enables option autocomplete */
  fieldDataType?: string;
  /** AttrDef ID — used to look up available options */
  attrDefId?: string;
  /** Called when arrow navigation reaches a boundary (e.g. escaping field values) */
  onNavigateOut?: (direction: 'up' | 'down') => void;
}

function resetEditorContent(view: EditorView) {
  const emptyDoc = marksToDoc('', [], []);
  let tr = view.state.tr.replaceWith(0, view.state.doc.content.size, emptyDoc.content);
  tr = tr.setMeta('addToHistory', false);
  tr = tr.setSelection(TextSelection.create(tr.doc, 1));
  view.dispatch(tr);
}

function getEditorText(view: EditorView): string {
  return view.state.doc.textContent;
}

export function TrailingInput({ parentId, depth, autoFocus, parentExpandKey, fieldDataType, attrDefId, onNavigateOut }: TrailingInputProps) {
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
  const mountRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);

  // Options autocomplete state
  const isOptions = fieldDataType === SYS_D.OPTIONS || fieldDataType === SYS_D.OPTIONS_FROM_SUPERTAG;
  const allOptions = useFieldOptions(isOptions ? (attrDefId ?? '') : '');
  const addReference = useNodeStore((s) => s.addReference);
  const selectFieldOption = useNodeStore((s) => s.selectFieldOption);

  const [optionsOpen, setOptionsOpen] = useState(false);
  const [optionsQuery, setOptionsQuery] = useState('');
  const [optionsIndex, setOptionsIndex] = useState(0);

  const filteredOptions = useMemo(() => {
    if (!isOptions || !optionsOpen || allOptions.length === 0) return [];
    if (!optionsQuery.trim()) return allOptions;
    const q = optionsQuery.trim().toLowerCase();
    return allOptions.filter((o) => o.name.toLowerCase().includes(q));
  }, [isOptions, optionsOpen, optionsQuery, allOptions]);

  const callbacksRef = useRef({
    createChild, addUnnamedFieldToNode, addReference, selectFieldOption, wsId, userId,
    parentId, effectiveParentId, effectiveDepth, effectiveParentEK,
    setEffectiveParentId, setEffectiveDepth, setEffectiveParentEK,
    setExpanded, setFocusedNode, setEditingFieldName, setTriggerHint,
    isOptions, optionsOpen, filteredOptions, optionsIndex,
    setOptionsOpen, setOptionsQuery, setOptionsIndex,
    onNavigateOut,
  });
  callbacksRef.current = {
    createChild, addUnnamedFieldToNode, addReference, selectFieldOption, wsId, userId,
    parentId, effectiveParentId, effectiveDepth, effectiveParentEK,
    setEffectiveParentId, setEffectiveDepth, setEffectiveParentEK,
    setExpanded, setFocusedNode, setEditingFieldName, setTriggerHint,
    isOptions, optionsOpen, filteredOptions, optionsIndex,
    setOptionsOpen, setOptionsQuery, setOptionsIndex,
    onNavigateOut,
  };

  const commitContent = useCallback((rawText: string, view: EditorView) => {
    if (!rawText.trim() || committingRef.current) return;

    const ref = callbacksRef.current;
    if (!ref.wsId || !ref.userId) return;

    committingRef.current = true;
    resetEditorContent(view);
    setHasContent(false);

    // Create child and focus it (TrailingInput unmounts once there are children,
    // so we focus the new node to keep the cursor visible)
    ref.createChild(ref.effectiveParentId, ref.wsId, ref.userId, rawText).then((newNode) => {
      ref.setExpanded(ref.effectiveParentEK, true);
      ref.setFocusedNode(newNode.id, ref.effectiveParentId);
      queueMicrotask(() => { committingRef.current = false; });
    });
  }, []);

  const plugins = useMemo<Plugin[]>(() => {
    return [
      keymap({
        [KEY_TRAILING_ENTER]: (_state, _dispatch, view) => {
          if (!view) return false;
          const ref = callbacksRef.current;

          // Options autocomplete: select highlighted option
          if (ref.isOptions && ref.optionsOpen && ref.filteredOptions.length > 0) {
            const selected = ref.filteredOptions[ref.optionsIndex];
            if (selected && ref.userId) {
              committingRef.current = true;
              ref.selectFieldOption(ref.effectiveParentId, selected.id, undefined, ref.userId);
              resetEditorContent(view);
              setHasContent(false);
              ref.setOptionsOpen(false);
              ref.setOptionsQuery('');
              ref.setOptionsIndex(0);
              // Blur so the TrailingInput doesn't look like an empty node
              view.dom.blur();
              queueMicrotask(() => { committingRef.current = false; });
            }
            return true;
          }

          const text = getEditorText(view).trim();
          if (text.length > 0) {
            commitContent(getEditorText(view), view);
          } else {
            // Empty Enter → create empty child so user can keep creating nodes
            if (!ref.wsId || !ref.userId) return true;
            committingRef.current = true;
            ref.createChild(ref.effectiveParentId, ref.wsId, ref.userId, '').then((newNode) => {
              ref.setExpanded(ref.effectiveParentEK, true);
              ref.setFocusedNode(newNode.id, ref.effectiveParentId);
              queueMicrotask(() => { committingRef.current = false; });
            });
          }
          return true;
        },
        [KEY_TRAILING_INDENT]: () => {
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
        [KEY_TRAILING_OUTDENT]: () => {
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
        [KEY_TRAILING_BACKSPACE]: (_state, _dispatch, view) => {
          if (!view) return false;
          const ref = callbacksRef.current;
          const isEditorEmpty = getEditorText(view).length === 0;
          const entities = useNodeStore.getState().entities;
          const expanded = useUIStore.getState().expandedNodes;
          const parent = entities[ref.effectiveParentId];
          const target = getLastVisibleNode(ref.effectiveParentId, entities, expanded);
          const intent = resolveTrailingBackspaceIntent({
            isEditorEmpty,
            depthShifted: ref.effectiveParentId !== ref.parentId,
            parentChildCount: (parent?.children ?? []).length,
            hasLastVisibleTarget: !!target,
          });

          if (intent === 'allow_default') return false; // Let PM handle normal backspace

          // If depth was shifted via Tab/Shift+Tab, undo the shift first
          if (intent === 'reset_depth_shift') {
            ref.setEffectiveParentId(ref.parentId);
            ref.setEffectiveDepth(depth);
            return true;
          }

          // If parent has no real children (only TrailingInput showing),
          // collapse the parent and focus it
          if (intent === 'collapse_parent') {
            const expandKey = ref.effectiveParentEK;
            if (expandKey) ref.setExpanded(expandKey, false);
            const gpId = parent?.props._ownerId;
            if (gpId) ref.setFocusedNode(ref.effectiveParentId, gpId);
            return true;
          }

          // Focus the last visible node above this TrailingInput.
          if (intent === 'focus_last_visible' && target) {
            ref.setFocusedNode(target.nodeId, target.parentId);
          }
          return true;
        },
        [KEY_TRAILING_ARROW_DOWN]: () => {
          const ref = callbacksRef.current;
          const intent = resolveTrailingArrowDownIntent({
            optionsOpen: ref.isOptions && ref.optionsOpen,
            optionCount: ref.filteredOptions.length,
            hasNavigateOut: !!ref.onNavigateOut,
          });
          if (intent === 'options_down') {
            ref.setOptionsIndex(Math.min(ref.optionsIndex + 1, ref.filteredOptions.length - 1));
            return true;
          }
          // At the bottom — escape to parent context
          if (intent === 'navigate_out_down' && ref.onNavigateOut) {
            ref.onNavigateOut('down');
            return true;
          }
          return false;
        },
        [KEY_TRAILING_ARROW_UP]: () => {
          const ref = callbacksRef.current;
          const entities = useNodeStore.getState().entities;
          const expanded = useUIStore.getState().expandedNodes;
          const target = getLastVisibleNode(ref.effectiveParentId, entities, expanded);
          const intent = resolveTrailingArrowUpIntent({
            optionsOpen: ref.isOptions && ref.optionsOpen,
            optionCount: ref.filteredOptions.length,
            hasLastVisibleTarget: !!target,
            hasNavigateOut: !!ref.onNavigateOut,
          });
          if (intent === 'options_up') {
            ref.setOptionsIndex(Math.max(ref.optionsIndex - 1, 0));
            return true;
          }
          // Try to focus last visible node above this TrailingInput
          if (intent === 'focus_last_visible' && target) {
            ref.setFocusedNode(target.nodeId, target.parentId);
            return true;
          }
          // No nodes above — escape to parent context
          if (intent === 'navigate_out_up' && ref.onNavigateOut) {
            ref.onNavigateOut('up');
            return true;
          }
          return false;
        },
        [KEY_TRAILING_ESCAPE]: (_state, _dispatch, view) => {
          if (!view) return false;
          const ref = callbacksRef.current;
          const intent = resolveTrailingEscapeIntent(ref.isOptions && ref.optionsOpen);
          if (intent === 'close_options') {
            ref.setOptionsOpen(false);
            ref.setOptionsQuery('');
            ref.setOptionsIndex(0);
            return true;
          }
          view.dom.blur();
          return true;
        },
      }),
      keymap(baseKeymap),
    ];
  }, [commitContent, depth]);

  useEffect(() => {
    if (!mountRef.current) return;

    const view = new EditorView(mountRef.current, {
      state: EditorState.create({
        schema: pmSchema,
        doc: marksToDoc('', [], []),
        plugins,
      }),
      dispatchTransaction: (tr) => {
        const newState = view.state.apply(tr);
        view.updateState(newState);

        if (!tr.docChanged) return;

        const text = newState.doc.textContent;
        setHasContent(text.length > 0);

        if (committingRef.current) return;

        const ref = callbacksRef.current;
        if (!ref.wsId || !ref.userId) return;

        const action = resolveTrailingUpdateAction({
          text,
          isOptionsField: ref.isOptions,
        });

        // > field trigger: handle directly (no intermediate node needed)
        if (action.type === 'create_field') {
          committingRef.current = true;
          resetEditorContent(view);
          setHasContent(false);
          ref.setOptionsOpen(false);

          ref.addUnnamedFieldToNode(ref.effectiveParentId, ref.wsId, ref.userId).then(({ tupleId }) => {
            ref.setEditingFieldName(tupleId);
            queueMicrotask(() => { committingRef.current = false; });
          });
          return;
        }

        // #/@/ trigger: create child node + set triggerHint so OutlinerItem
        // opens the dropdown immediately.
        if (action.type === 'create_trigger_node') {
          committingRef.current = true;
          resetEditorContent(view);
          setHasContent(false);
          ref.setOptionsOpen(false);

          ref.setTriggerHint(action.trigger);
          ref.createChild(ref.effectiveParentId, ref.wsId, ref.userId, action.trigger).then((newNode) => {
            ref.setExpanded(ref.effectiveParentEK, true);
            ref.setFocusedNode(newNode.id, ref.effectiveParentId);
            queueMicrotask(() => { committingRef.current = false; });
          });
          return;
        }

        if (action.type === 'open_options') {
          ref.setOptionsOpen(true);
          ref.setOptionsQuery(action.query);
          ref.setOptionsIndex(0);
          return;
        }

        if (action.type === 'close_options') {
          ref.setOptionsOpen(false);
          ref.setOptionsQuery('');
          ref.setOptionsIndex(0);
        }
      },
      handleDOMEvents: {
        focus: () => {
          // Options: show all options immediately on focus (even with empty input)
          const ref = callbacksRef.current;
          if (ref.isOptions) {
            setOptionsOpen(true);
            setOptionsQuery('');
            setOptionsIndex(0);
          }
          return false;
        },
        blur: () => {
          if (committingRef.current) return false;

          const activeView = viewRef.current;
          const text = activeView ? activeView.state.doc.textContent.trim() : '';
          if (text.length > 0 && activeView) {
            commitContent(activeView.state.doc.textContent, activeView);
          }
          setHasContent(false);
          // Close options dropdown
          setOptionsOpen(false);
          setOptionsQuery('');
          setOptionsIndex(0);
          // Reset to original depth on blur
          const ref = callbacksRef.current;
          if (ref.effectiveParentId !== ref.parentId) {
            ref.setEffectiveParentId(ref.parentId);
            ref.setEffectiveDepth(depth);
          }
          return false;
        },
      },
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [commitContent, depth, plugins]);

  // Auto-focus when mounting with autoFocus (leaf node expansion)
  useEffect(() => {
    const view = viewRef.current;
    if (autoFocus && view && !view.isDestroyed) {
      view.focus();
    }
  }, [autoFocus]);

  // Handle option click from dropdown
  const handleOptionClick = useCallback((optionId: string) => {
    const ref = callbacksRef.current;
    const view = viewRef.current;
    if (!ref.userId || !view || view.isDestroyed) return;

    committingRef.current = true;
    ref.selectFieldOption(ref.effectiveParentId, optionId, undefined, ref.userId);
    resetEditorContent(view);
    setHasContent(false);
    setOptionsOpen(false);
    setOptionsQuery('');
    setOptionsIndex(0);
    // Blur so the TrailingInput doesn't look like an empty node
    view.dom.blur();
    queueMicrotask(() => { committingRef.current = false; });
  }, []);

  return (
    <div
      data-trailing-parent-id={parentId}
      className="group/row flex min-h-7 items-start gap-2 py-1"
      style={{ paddingLeft: effectiveDepth * 28 + 6 + 15 + 4 }}
    >
      <BulletChevron
        hasChildren={false}
        isExpanded={false}
        onBulletClick={() => {}}
        dimmed={!hasContent}
      />
      <div className="relative flex-1 min-w-0">
        <div ref={mountRef} className="outline-none text-sm leading-[21px]" />
        {optionsOpen && filteredOptions.length > 0 && (
          <div className="absolute left-0 top-full z-50 mt-0.5 max-h-48 w-56 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
            {filteredOptions.map((opt, i) => (
              <div
                key={opt.id}
                className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm ${i === optionsIndex ? 'bg-accent text-accent-foreground' : 'text-popover-foreground hover:bg-accent/50'}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleOptionClick(opt.id)}
              >
                <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-foreground/40" />
                <span className="truncate">{opt.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
