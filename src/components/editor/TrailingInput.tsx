/**
 * Trailing input: phantom empty editor for creating new nodes.
 * TipTap-free implementation (single-line input).
 */
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useNodeStore } from '../../stores/node-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { useUIStore } from '../../stores/ui-store';
import { WORKSPACE_CONTAINERS, SYS_D } from '../../types';
import { getLastVisibleNode } from '../../lib/tree-utils.js';
import { getPrimaryShortcutKey, matchesShortcutEvent } from '../../lib/shortcut-registry';
import { resolveTrailingUpdateAction } from '../../lib/trailing-input-actions.js';
import {
  resolveTrailingArrowDownIntent,
  resolveTrailingArrowUpIntent,
  resolveTrailingBackspaceIntent,
  resolveTrailingEscapeIntent,
} from '../../lib/trailing-input-navigation.js';
import { useFieldOptions } from '../../hooks/use-field-options.js';
import { BulletChevron } from '../outliner/BulletChevron';

const CONTAINER_SUFFIXES = Object.values(WORKSPACE_CONTAINERS);
function isWorkspaceContainer(nodeId: string): boolean {
  return CONTAINER_SUFFIXES.some(suffix => nodeId.endsWith(`_${suffix}`));
}

const KEY_TRAILING_ENTER = getPrimaryShortcutKey('trailing.enter', 'Enter');
const KEY_TRAILING_FORCE_ENTER = 'Mod-Enter';
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
  parentExpandKey: string;
  fieldDataType?: string;
  attrDefId?: string;
  onNavigateOut?: (direction: 'up' | 'down') => void;
}

export function TrailingInput({ parentId, depth, autoFocus, parentExpandKey, fieldDataType, attrDefId, onNavigateOut }: TrailingInputProps) {
  const createChild = useNodeStore((s) => s.createChild);
  const cycleNodeCheckbox = useNodeStore((s) => s.cycleNodeCheckbox);
  const addUnnamedFieldToNode = useNodeStore((s) => s.addUnnamedFieldToNode);
  const addReference = useNodeStore((s) => s.addReference);
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const userId = useWorkspaceStore((s) => s.userId);
  const setExpanded = useUIStore((s) => s.setExpanded);
  const setFocusedNode = useUIStore((s) => s.setFocusedNode);
  const setEditingFieldName = useUIStore((s) => s.setEditingFieldName);
  const setTriggerHint = useUIStore((s) => s.setTriggerHint);

  const [effectiveParentId, setEffectiveParentId] = useState(parentId);
  const [effectiveDepth, setEffectiveDepth] = useState(depth);
  const [effectiveParentEK, setEffectiveParentEK] = useState(parentExpandKey);

  useEffect(() => {
    setEffectiveParentId(parentId);
    setEffectiveDepth(depth);
    setEffectiveParentEK(parentExpandKey);
  }, [parentId, depth, parentExpandKey]);

  const [value, setValue] = useState('');
  const [hasContent, setHasContent] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const committingRef = useRef(false);
  const composingRef = useRef(false);

  const isOptions = fieldDataType === SYS_D.OPTIONS || fieldDataType === SYS_D.OPTIONS_FROM_SUPERTAG;
  const allOptions = useFieldOptions(isOptions ? (attrDefId ?? '') : '');

  const [optionsOpen, setOptionsOpen] = useState(false);
  const [optionsQuery, setOptionsQuery] = useState('');
  const [optionsIndex, setOptionsIndex] = useState(0);

  const filteredOptions = useMemo(() => {
    if (!isOptions || !optionsOpen || allOptions.length === 0) return [];
    if (!optionsQuery.trim()) return allOptions;
    const q = optionsQuery.trim().toLowerCase();
    return allOptions.filter(o => o.name.toLowerCase().includes(q));
  }, [isOptions, optionsOpen, optionsQuery, allOptions]);

  const commitText = useCallback((text: string, toggleCheckbox = false) => {
    if (committingRef.current) return;
    if (!wsId || !userId) return;

    committingRef.current = true;
    setValue('');
    setHasContent(false);

    createChild(effectiveParentId, wsId, userId, text).then((newNode) => {
      if (toggleCheckbox) {
        void cycleNodeCheckbox(newNode.id, userId);
      }
      setExpanded(effectiveParentEK, true);
      setFocusedNode(newNode.id, effectiveParentId);
      queueMicrotask(() => { committingRef.current = false; });
    });
  }, [createChild, cycleNodeCheckbox, effectiveParentEK, effectiveParentId, setExpanded, setFocusedNode, userId, wsId]);

  const createEmptyNode = useCallback((toggleCheckbox = false) => {
    if (committingRef.current) return;
    if (!wsId || !userId) return;

    committingRef.current = true;
    createChild(effectiveParentId, wsId, userId, '').then((newNode) => {
      if (toggleCheckbox) {
        void cycleNodeCheckbox(newNode.id, userId);
      }
      setExpanded(effectiveParentEK, true);
      setFocusedNode(newNode.id, effectiveParentId);
      queueMicrotask(() => { committingRef.current = false; });
    });
  }, [createChild, cycleNodeCheckbox, effectiveParentEK, effectiveParentId, setExpanded, setFocusedNode, userId, wsId]);

  const confirmOptionSelection = useCallback(() => {
    const selected = filteredOptions[optionsIndex];
    if (!selected || !userId) return;

    committingRef.current = true;
    addReference(effectiveParentId, selected.id, userId);
    setValue('');
    setHasContent(false);
    setOptionsOpen(false);
    setOptionsQuery('');
    setOptionsIndex(0);
    inputRef.current?.blur();
    queueMicrotask(() => { committingRef.current = false; });
  }, [addReference, effectiveParentId, filteredOptions, optionsIndex, userId]);

  const handleEnter = useCallback((toggleCheckbox = false) => {
    if (isOptions && optionsOpen && filteredOptions.length > 0) {
      confirmOptionSelection();
      return;
    }

    if (value.trim().length > 0) {
      commitText(value, toggleCheckbox);
      return;
    }

    createEmptyNode(toggleCheckbox);
  }, [confirmOptionSelection, createEmptyNode, filteredOptions.length, isOptions, optionsOpen, value, commitText]);

  const handleInputValue = useCallback((nextValue: string) => {
    setValue(nextValue);
    setHasContent(nextValue.length > 0);

    if (committingRef.current) return;
    if (!wsId || !userId) return;

    const action = resolveTrailingUpdateAction({ text: nextValue, isOptionsField: isOptions });

    if (action.type === 'create_field') {
      committingRef.current = true;
      setValue('');
      setHasContent(false);
      setOptionsOpen(false);

      addUnnamedFieldToNode(effectiveParentId, wsId, userId).then(({ tupleId }) => {
        setEditingFieldName(tupleId);
        queueMicrotask(() => { committingRef.current = false; });
      });
      return;
    }

    if (action.type === 'create_trigger_node') {
      committingRef.current = true;
      setValue('');
      setHasContent(false);
      setOptionsOpen(false);

      setTriggerHint(action.trigger);
      createChild(effectiveParentId, wsId, userId, action.trigger).then((newNode) => {
        setExpanded(effectiveParentEK, true);
        setFocusedNode(newNode.id, effectiveParentId);
        queueMicrotask(() => { committingRef.current = false; });
      });
      return;
    }

    if (action.type === 'open_options') {
      setOptionsOpen(true);
      setOptionsQuery(action.query);
      setOptionsIndex(0);
      return;
    }

    if (action.type === 'close_options') {
      setOptionsOpen(false);
      setOptionsQuery('');
      setOptionsIndex(0);
    }
  }, [
    addUnnamedFieldToNode,
    createChild,
    effectiveParentEK,
    effectiveParentId,
    isOptions,
    setEditingFieldName,
    setExpanded,
    setFocusedNode,
    setTriggerHint,
    userId,
    wsId,
  ]);

  const handleKeyDown = useCallback((e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (composingRef.current || e.nativeEvent.isComposing || e.key === 'Process') return;

    if (matchesShortcutEvent(e.nativeEvent, KEY_TRAILING_FORCE_ENTER)) {
      e.preventDefault();
      handleEnter(true);
      return;
    }

    if (matchesShortcutEvent(e.nativeEvent, KEY_TRAILING_ENTER)) {
      e.preventDefault();
      handleEnter(false);
      return;
    }

    if (matchesShortcutEvent(e.nativeEvent, KEY_TRAILING_INDENT)) {
      e.preventDefault();
      const parent = useNodeStore.getState().entities[effectiveParentId];
      const siblings = parent?.children ?? [];
      if (siblings.length === 0) return;

      const lastSiblingId = siblings[siblings.length - 1];
      const siblingEK = `${effectiveParentId}:${lastSiblingId}`;
      setExpanded(siblingEK, true);
      setEffectiveParentEK(siblingEK);
      setEffectiveParentId(lastSiblingId);
      setEffectiveDepth((d) => d + 1);
      return;
    }

    if (matchesShortcutEvent(e.nativeEvent, KEY_TRAILING_OUTDENT)) {
      e.preventDefault();
      if (effectiveDepth <= 0) return;
      if (isWorkspaceContainer(effectiveParentId)) return;

      const currentParent = useNodeStore.getState().entities[effectiveParentId];
      const grandparentId = currentParent?.props._ownerId;
      if (!grandparentId || isWorkspaceContainer(grandparentId)) return;

      const ggpId = useNodeStore.getState().entities[grandparentId]?.props._ownerId ?? '';
      setEffectiveParentEK(`${ggpId}:${grandparentId}`);
      setEffectiveParentId(grandparentId);
      setEffectiveDepth((d) => d - 1);
      return;
    }

    if (matchesShortcutEvent(e.nativeEvent, KEY_TRAILING_BACKSPACE)) {
      const entities = useNodeStore.getState().entities;
      const expanded = useUIStore.getState().expandedNodes;
      const parent = entities[effectiveParentId];
      const target = getLastVisibleNode(effectiveParentId, entities, expanded);
      const intent = resolveTrailingBackspaceIntent({
        isEditorEmpty: value.length === 0,
        depthShifted: effectiveParentId !== parentId,
        parentChildCount: (parent?.children ?? []).length,
        hasLastVisibleTarget: !!target,
      });

      if (intent === 'allow_default') return;
      e.preventDefault();

      if (intent === 'reset_depth_shift') {
        setEffectiveParentId(parentId);
        setEffectiveDepth(depth);
        return;
      }

      if (intent === 'collapse_parent') {
        if (effectiveParentEK) setExpanded(effectiveParentEK, false);
        const gpId = parent?.props._ownerId;
        if (gpId) setFocusedNode(effectiveParentId, gpId);
        return;
      }

      if (intent === 'focus_last_visible' && target) {
        setFocusedNode(target.nodeId, target.parentId);
      }
      return;
    }

    if (matchesShortcutEvent(e.nativeEvent, KEY_TRAILING_ARROW_DOWN)) {
      const intent = resolveTrailingArrowDownIntent({
        optionsOpen: isOptions && optionsOpen,
        optionCount: filteredOptions.length,
        hasNavigateOut: !!onNavigateOut,
      });

      if (intent === 'options_down') {
        e.preventDefault();
        setOptionsIndex((i) => Math.min(i + 1, filteredOptions.length - 1));
        return;
      }

      if (intent === 'navigate_out_down' && onNavigateOut) {
        e.preventDefault();
        onNavigateOut('down');
      }
      return;
    }

    if (matchesShortcutEvent(e.nativeEvent, KEY_TRAILING_ARROW_UP)) {
      const entities = useNodeStore.getState().entities;
      const expanded = useUIStore.getState().expandedNodes;
      const target = getLastVisibleNode(effectiveParentId, entities, expanded);
      const intent = resolveTrailingArrowUpIntent({
        optionsOpen: isOptions && optionsOpen,
        optionCount: filteredOptions.length,
        hasLastVisibleTarget: !!target,
        hasNavigateOut: !!onNavigateOut,
      });

      if (intent === 'options_up') {
        e.preventDefault();
        setOptionsIndex((i) => Math.max(i - 1, 0));
        return;
      }

      if (intent === 'focus_last_visible' && target) {
        e.preventDefault();
        setFocusedNode(target.nodeId, target.parentId);
        return;
      }

      if (intent === 'navigate_out_up' && onNavigateOut) {
        e.preventDefault();
        onNavigateOut('up');
      }
      return;
    }

    if (matchesShortcutEvent(e.nativeEvent, KEY_TRAILING_ESCAPE)) {
      e.preventDefault();
      const intent = resolveTrailingEscapeIntent(isOptions && optionsOpen);
      if (intent === 'close_options') {
        setOptionsOpen(false);
        setOptionsQuery('');
        setOptionsIndex(0);
        return;
      }
      inputRef.current?.blur();
    }
  }, [
    depth,
    effectiveDepth,
    effectiveParentEK,
    effectiveParentId,
    filteredOptions.length,
    handleEnter,
    isOptions,
    onNavigateOut,
    optionsOpen,
    parentId,
    setExpanded,
    setFocusedNode,
    value.length,
  ]);

  const handleBlur = useCallback(() => {
    if (committingRef.current) return;
    const text = value.trim();
    if (text.length > 0) {
      commitText(value);
    }

    setHasContent(false);
    setOptionsOpen(false);
    setOptionsQuery('');
    setOptionsIndex(0);

    if (effectiveParentId !== parentId) {
      setEffectiveParentId(parentId);
      setEffectiveDepth(depth);
    }
  }, [commitText, depth, effectiveParentId, parentId, value]);

  const handleFocus = useCallback(() => {
    if (isOptions) {
      setOptionsOpen(true);
      setOptionsQuery(value);
      setOptionsIndex(0);
    }
  }, [isOptions, value]);

  const handleOptionClick = useCallback((optionId: string) => {
    if (!userId) return;
    committingRef.current = true;
    addReference(effectiveParentId, optionId, userId);
    setValue('');
    setHasContent(false);
    setOptionsOpen(false);
    setOptionsQuery('');
    setOptionsIndex(0);
    inputRef.current?.blur();
    queueMicrotask(() => { committingRef.current = false; });
  }, [addReference, effectiveParentId, userId]);

  const handleCompositionStart = useCallback(() => {
    composingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback(() => {
    composingRef.current = false;
  }, []);

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(value.length, value.length);
    }
  }, [autoFocus, value.length]);

  return (
    <div
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
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => handleInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          onFocus={handleFocus}
          onBlur={handleBlur}
          className="block w-full h-[21px] appearance-none bg-transparent p-0 m-0 border-0 outline-none text-sm leading-[21px] align-top font-sans"
        />
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
