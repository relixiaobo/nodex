/**
 * useEditorTriggers — shared trigger system for #tag, @reference, /slash
 *
 * Extracted from OutlinerItem.tsx so that NodeHeader (and future consumers)
 * can reuse the same trigger logic. The hook owns all trigger state, handlers,
 * and effects. Consumers pass a config describing behaviour differences.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type { EditorView } from 'prosemirror-view';
import type { TriggerAnchorRect } from '../components/editor/RichTextEditor.js';
import type { TagDropdownHandle } from '../components/tags/TagSelector.js';
import type { ReferenceDropdownHandle } from '../components/references/ReferenceSelector.js';
import type { SlashCommandId } from '../lib/slash-commands.js';
import { useNodeStore } from '../stores/node-store.js';
import { useUIStore } from '../stores/ui-store.js';
import * as loroDoc from '../lib/loro-doc.js';
import { toast } from 'sonner';
import { docToMarks } from '../lib/pm-doc-utils.js';
import {
  deleteEditorRange,
  isEditorViewAlive,
  replaceEditorRangeWithInlineRef,
  replaceEditorRangeWithText,
  setEditorPlainTextContent,
  setEditorSelection,
  toggleHeadingMark,
} from '../lib/pm-editor-view.js';
import {
  filterSlashCommands,
  getFirstEnabledSlashIndex,
  getNextEnabledSlashIndex,
} from '../lib/slash-commands.js';
import { getTreeReferenceBlockReason, getTreeReferenceBlockMessage } from '../lib/reference-rules.js';
import { isOnlyInlineRef } from '../lib/tree-utils.js';
import {
  WEBCLIP_CAPTURE_ACTIVE_TAB,
  type WebClipCaptureResponse,
} from '../lib/webclip-messaging.js';
import { applyWebClipToNode } from '../lib/webclip-service.js';
import { ensureTodayNode } from '../lib/journal.js';
import { t } from '../i18n/strings.js';

// ────────────────────────────────────────────────────────────────────────────
// Config
// ────────────────────────────────────────────────────────────────────────────

export interface EditorTriggerConfig {
  nodeId: string;
  /** Parent in the outliner tree. null → @ only inserts inline refs (NodeHeader mode). */
  parentId: string | null;
  editorRef: MutableRefObject<EditorView | null>;
  tagIds: string[];
  /** Whether the editor is currently active (OutlinerItem: isFocused, NodeHeader: editing). */
  isActive: boolean;
  /** Disable all triggers (e.g. code block). */
  disabled?: boolean;

  enableSlash?: boolean;         // default true
  enableFieldTrigger?: boolean;  // default true, NodeHeader sets false
  enableTreeReference?: boolean; // default true, NodeHeader sets false

  // Outliner-specific callbacks (NodeHeader does not provide these)
  trashNode?: (nodeId: string) => void;
  onAfterTreeReferenceCreated?: (params: {
    tempNodeId: string;
    refNodeId: string;
    parentId: string;
  }) => void;
  onCycleCheckbox?: () => void;
  onOpenSearch?: () => void;
}

// ────────────────────────────────────────────────────────────────────────────
// Return type
// ────────────────────────────────────────────────────────────────────────────

export interface EditorTriggerState {
  hashTag: {
    open: boolean;
    query: string;
    selectedIndex: number;
    anchor: TriggerAnchorRect | undefined;
    tagDropdownRef: React.RefObject<TagDropdownHandle | null>;
    onTrigger: (query: string, from: number, to: number, anchor?: TriggerAnchorRect) => void;
    onDeactivate: () => void;
    onSelect: (tagDefId: string) => void;
    onCreateNew: (name: string) => void;
    onConfirm: () => void;
    onNavDown: () => void;
    onNavUp: () => void;
    onForceCreate: () => void;
    onClose: () => void;
  };
  reference: {
    open: boolean;
    query: string;
    selectedIndex: number;
    anchor: TriggerAnchorRect | undefined;
    treeContextParentId: string | null;
    refDropdownRef: React.RefObject<ReferenceDropdownHandle | null>;
    onTrigger: (query: string, from: number, to: number, anchor?: TriggerAnchorRect) => void;
    onDeactivate: () => void;
    onSelect: (refNodeId: string) => void;
    onCreateNew: (name: string) => void;
    onConfirm: () => void;
    onNavDown: () => void;
    onNavUp: () => void;
    onForceCreate: () => void;
    onClose: () => void;
  };
  slash: {
    open: boolean;
    query: string;
    selectedIndex: number;
    anchor: TriggerAnchorRect | undefined;
    filteredCommands: ReturnType<typeof filterSlashCommands>;
    onTrigger: (query: string, from: number, to: number, anchor?: TriggerAnchorRect) => void;
    onDeactivate: () => void;
    onConfirm: () => void;
    onNavDown: () => void;
    onNavUp: () => void;
    onClose: () => void;
    executeCommand: (commandId: SlashCommandId) => void;
  };
  onFieldTriggerFire: (() => void) | undefined;
  hasOverlayOpen: boolean;
  resetAll: () => void;
}

// ────────────────────────────────────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────────────────────────────────────

export function useEditorTriggers(config: EditorTriggerConfig): EditorTriggerState {
  const {
    nodeId,
    parentId,
    editorRef,
    tagIds,
    isActive,
    disabled = false,
    enableSlash = true,
    enableFieldTrigger = true,
    enableTreeReference = true,
    trashNode: trashNodeCb,
    onAfterTreeReferenceCreated,
    onCycleCheckbox,
    onOpenSearch,
  } = config;

  // ── Store actions ──
  const applyTag = useNodeStore((s) => s.applyTag);
  const createTagDef = useNodeStore((s) => s.createTagDef);
  const updateNodeContent = useNodeStore((s) => s.updateNodeContent);
  const addReference = useNodeStore((s) => s.addReference);
  const startRefConversion = useNodeStore((s) => s.startRefConversion);
  const addUnnamedFieldToNode = useNodeStore((s) => s.addUnnamedFieldToNode);
  const setExpanded = useUIStore((s) => s.setExpanded);
  const setFocusedNode = useUIStore((s) => s.setFocusedNode);
  const setPendingRefConversion = useUIStore((s) => s.setPendingRefConversion);
  const setEditingFieldName = useUIStore((s) => s.setEditingFieldName);
  const openSearch = useUIStore((s) => s.openSearch);
  const trashNodeStore = useNodeStore((s) => s.trashNode);

  // ── # tag trigger state ──
  const [hashTagOpen, setHashTagOpen] = useState(false);
  const [hashTagQuery, setHashTagQuery] = useState('');
  const [hashTagSelectedIndex, setHashTagSelectedIndex] = useState(0);
  const [hashTagAnchor, setHashTagAnchor] = useState<TriggerAnchorRect | undefined>(undefined);
  const hashRangeRef = useRef<{ from: number; to: number }>({ from: 0, to: 0 });
  const tagDropdownRef = useRef<TagDropdownHandle>(null);

  // ── @ reference trigger state ──
  const [refOpen, setRefOpen] = useState(false);
  const [refQuery, setRefQuery] = useState('');
  const [refSelectedIndex, setRefSelectedIndex] = useState(0);
  const [refAnchor, setRefAnchor] = useState<TriggerAnchorRect | undefined>(undefined);
  const [refTreeContextParentId, setRefTreeContextParentId] = useState<string | null>(null);
  const refRangeRef = useRef<{ from: number; to: number }>({ from: 0, to: 0 });
  const refDropdownRef = useRef<ReferenceDropdownHandle>(null);

  // ── / slash trigger state ──
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(-1);
  const [slashAnchor, setSlashAnchor] = useState<TriggerAnchorRect | undefined>(undefined);
  const slashRangeRef = useRef<{ from: number; to: number }>({ from: 0, to: 0 });

  const filteredSlashCommands = useMemo(
    () => filterSlashCommands(slashQuery),
    [slashQuery],
  );

  // ── triggerHint effect (TrailingInput bridging) ──
  useEffect(() => {
    if (!isActive) return;
    const hint = useUIStore.getState().triggerHint;
    if (!hint || hint.nodeId !== nodeId) return;
    useUIStore.getState().setTriggerHint(null);

    if (hint.char === '#') {
      setHashTagQuery('');
      setHashTagSelectedIndex(0);
      setHashTagAnchor(undefined);
      hashRangeRef.current = { from: 1, to: 2 };
      setHashTagOpen(true);
    } else if (hint.char === '@') {
      setRefQuery('');
      setRefSelectedIndex(0);
      setRefAnchor(undefined);
      refRangeRef.current = { from: 1, to: 2 };
      setRefOpen(true);
    } else if (hint.char === '/') {
      setSlashQuery('');
      setSlashAnchor(undefined);
      slashRangeRef.current = { from: 1, to: 2 };
      setSlashOpen(true);
    }
  }, [isActive, nodeId]);

  // ── slash auto-select effect ──
  useEffect(() => {
    if (!slashOpen) return;
    if (filteredSlashCommands.length === 0) {
      if (slashSelectedIndex !== -1) setSlashSelectedIndex(-1);
      return;
    }
    const current = filteredSlashCommands[slashSelectedIndex];
    if (slashSelectedIndex >= 0 && current?.enabled) return;
    setSlashSelectedIndex(getFirstEnabledSlashIndex(filteredSlashCommands));
  }, [slashOpen, filteredSlashCommands, slashSelectedIndex]);

  // ── Reset all triggers ──
  const resetAll = useCallback(() => {
    setHashTagOpen(false);
    setHashTagQuery('');
    setHashTagSelectedIndex(0);
    setHashTagAnchor(undefined);
    setRefOpen(false);
    setRefQuery('');
    setRefSelectedIndex(0);
    setRefAnchor(undefined);
    setSlashOpen(false);
    setSlashQuery('');
    setSlashSelectedIndex(-1);
    setSlashAnchor(undefined);
  }, []);

  // ────────────────────────────────────────────────────────────────────────
  // # tag handlers
  // ────────────────────────────────────────────────────────────────────────

  const handleHashTag = useCallback((query: string, from: number, to: number, anchor?: TriggerAnchorRect) => {
    hashRangeRef.current = { from, to };
    setHashTagQuery(query);
    setHashTagSelectedIndex(0);
    setHashTagAnchor(anchor);
    setHashTagOpen(true);
  }, []);

  const handleHashTagDeactivate = useCallback(() => {
    setHashTagOpen(false);
    setHashTagQuery('');
    setHashTagSelectedIndex(0);
    setHashTagAnchor(undefined);
  }, []);

  const cleanupHashTagText = useCallback(() => {
    const ed = editorRef.current;
    if (!isEditorViewAlive(ed)) return;
    const { from, to } = hashRangeRef.current;
    deleteEditorRange(ed, from, to);
    const parsed = docToMarks(ed.state.doc);
    updateNodeContent(nodeId, { name: parsed.text, marks: parsed.marks, inlineRefs: parsed.inlineRefs });
  }, [nodeId, editorRef, updateNodeContent]);

  const handleHashTagSelect = useCallback(
    (tagDefId: string) => {
      cleanupHashTagText();
      applyTag(nodeId, tagDefId);
      setHashTagOpen(false);
      setHashTagQuery('');
      setHashTagSelectedIndex(0);
      setHashTagAnchor(undefined);
    },
    [nodeId, applyTag, cleanupHashTagText],
  );

  const handleHashTagCreateNew = useCallback(
    (name: string) => {
      cleanupHashTagText();
      const tagDef = createTagDef(name);
      applyTag(nodeId, tagDef.id);
      setHashTagOpen(false);
      setHashTagQuery('');
      setHashTagSelectedIndex(0);
      setHashTagAnchor(undefined);
    },
    [nodeId, createTagDef, applyTag, cleanupHashTagText],
  );

  const handleHashTagConfirm = useCallback(() => {
    const item = tagDropdownRef.current?.getSelectedItem();
    if (!item) return;
    if (item.type === 'existing') {
      handleHashTagSelect(item.id);
    } else {
      handleHashTagCreateNew(item.name);
    }
  }, [handleHashTagSelect, handleHashTagCreateNew]);

  const handleHashTagNavDown = useCallback(() => {
    setHashTagSelectedIndex((i) => {
      const count = tagDropdownRef.current?.getItemCount() ?? 0;
      return count > 0 ? Math.min(i + 1, count - 1) : 0;
    });
  }, []);

  const handleHashTagNavUp = useCallback(() => {
    setHashTagSelectedIndex((i) => Math.max(i - 1, 0));
  }, []);

  const handleHashTagForceCreate = useCallback(() => {
    const query = hashTagQuery.trim();
    if (query) {
      handleHashTagCreateNew(query);
    }
  }, [hashTagQuery, handleHashTagCreateNew]);

  const handleHashTagClose = useCallback(() => {
    setHashTagOpen(false);
    setHashTagQuery('');
    setHashTagSelectedIndex(0);
    setHashTagAnchor(undefined);
  }, []);

  // ────────────────────────────────────────────────────────────────────────
  // > field trigger (fire-once)
  // ────────────────────────────────────────────────────────────────────────

  const handleFieldTriggerFire = useCallback(() => {
    const actualParentId = loroDoc.getParentId(nodeId);
    if (!actualParentId) return;
    const { fieldEntryId } = addUnnamedFieldToNode(actualParentId, nodeId);
    trashNodeStore(nodeId);
    setEditingFieldName(fieldEntryId);
  }, [nodeId, addUnnamedFieldToNode, trashNodeStore, setEditingFieldName]);

  // ────────────────────────────────────────────────────────────────────────
  // @ reference handlers
  // ────────────────────────────────────────────────────────────────────────

  const handleReference = useCallback((query: string, from: number, to: number, anchor?: TriggerAnchorRect) => {
    refRangeRef.current = { from, to };
    const ed = editorRef.current;
    if (isEditorViewAlive(ed) && parentId !== null) {
      const fullText = ed.state.doc.textContent;
      const beforeAt = fullText.substring(0, from - 1);
      const afterQuery = fullText.substring(to - 1);
      const isEmptyAround = beforeAt.trim() === '' && afterQuery.trim() === '';
      setRefTreeContextParentId(isEmptyAround ? parentId : null);
    } else {
      setRefTreeContextParentId(null);
    }
    setRefQuery(query);
    setRefSelectedIndex(0);
    setRefAnchor(anchor);
    setRefOpen(true);
  }, [parentId, editorRef]);

  const handleReferenceDeactivate = useCallback(() => {
    setRefOpen(false);
    setRefQuery('');
    setRefSelectedIndex(0);
    setRefAnchor(undefined);
    setRefTreeContextParentId(null);
  }, []);

  const handleReferenceSelect = useCallback(
    (refNodeId: string) => {
      const ed = editorRef.current;
      if (!isEditorViewAlive(ed)) return;

      const fullText = ed.state.doc.textContent;
      const { from, to } = refRangeRef.current;
      const beforeAt = fullText.substring(0, from - 1);
      const afterQuery = fullText.substring(to - 1);
      const isEmptyAround = beforeAt.trim() === '' && afterQuery.trim() === '';

      if (isEmptyAround && enableTreeReference && parentId !== null) {
        // Tree reference mode: replace node with reference
        const parent = useNodeStore.getState().getNode(parentId);
        const blockReason = getTreeReferenceBlockReason(parentId, refNodeId, {
          hasNode: loroDoc.hasNode,
          getNode: loroDoc.toNodexNode,
          getChildren: loroDoc.getChildren,
        });
        if (blockReason) {
          toast.warning(getTreeReferenceBlockMessage(blockReason));
          return;
        }
        const alreadyChild = (parent?.children?.some((cid) => {
          if (cid === refNodeId) return true;
          const child = loroDoc.toNodexNode(cid);
          return child?.type === 'reference' && child.targetId === refNodeId;
        })) ?? false;

        if (alreadyChild) {
          const refNode = loroDoc.toNodexNode(refNodeId);
          const refName = (refNode?.name ?? '').trim() || 'Untitled';
          replaceEditorRangeWithInlineRef(ed, from, to, refNodeId, refName);
        } else {
          const pos = parent?.children?.indexOf(nodeId) ?? -1;
          const insertPos = pos >= 0 ? pos : 0;
          const newRefId = addReference(parentId, refNodeId, insertPos);
          if (!newRefId) {
            toast.warning(t('reference.blocked.createFallback'));
            return;
          }
          if (trashNodeCb) {
            trashNodeCb(nodeId);
          } else {
            trashNodeStore(nodeId);
          }
          const tempNodeId = startRefConversion(newRefId, parentId, insertPos);
          setPendingRefConversion({ tempNodeId, refNodeId, parentId });
          const gpId = loroDoc.getParentId(parentId);
          if (gpId) setExpanded(`${gpId}:${parentId}`, true, true);
          useUIStore.getState().setPendingInputChar(null);
          useUIStore.getState().setFocusClickCoords({
            nodeId: tempNodeId,
            parentId,
            textOffset: 1,
          });
          setTimeout(() => setFocusedNode(tempNodeId, parentId), 0);
          onAfterTreeReferenceCreated?.({ tempNodeId, refNodeId, parentId });
        }
      } else {
        // Inline reference mode
        const refNode = loroDoc.toNodexNode(refNodeId);
        const refName = (refNode?.name ?? '').trim() || 'Untitled';
        replaceEditorRangeWithInlineRef(ed, from, to, refNodeId, refName);
      }

      setRefOpen(false);
      setRefQuery('');
      setRefSelectedIndex(0);
      setRefAnchor(undefined);
      setRefTreeContextParentId(null);
    },
    [nodeId, parentId, enableTreeReference, editorRef, addReference, trashNodeCb, trashNodeStore, setExpanded, setFocusedNode, startRefConversion, setPendingRefConversion, onAfterTreeReferenceCreated],
  );

  const handleReferenceCreateNew = useCallback(
    (name: string) => {
      const parentId = ensureTodayNode();
      const newNode = useNodeStore.getState().createChild(parentId, undefined, { name });
      handleReferenceSelect(newNode.id);
    },
    [handleReferenceSelect],
  );

  const handleReferenceConfirm = useCallback(() => {
    const item = refDropdownRef.current?.getSelectedItem();
    if (!item) return;
    if (item.type === 'existing') {
      handleReferenceSelect(item.id);
    } else {
      handleReferenceCreateNew(item.name);
    }
  }, [handleReferenceSelect, handleReferenceCreateNew]);

  const handleReferenceNavDown = useCallback(() => {
    setRefSelectedIndex((i) => {
      const count = refDropdownRef.current?.getItemCount() ?? 0;
      return count > 0 ? Math.min(i + 1, count - 1) : 0;
    });
  }, []);

  const handleReferenceNavUp = useCallback(() => {
    setRefSelectedIndex((i) => Math.max(i - 1, 0));
  }, []);

  const handleReferenceForceCreate = useCallback(() => {
    const query = refQuery.trim();
    if (query) {
      handleReferenceCreateNew(query);
    }
  }, [refQuery, handleReferenceCreateNew]);

  const handleReferenceClose = useCallback(() => {
    setRefOpen(false);
    setRefQuery('');
    setRefSelectedIndex(0);
    setRefAnchor(undefined);
  }, []);

  // ────────────────────────────────────────────────────────────────────────
  // / slash command handlers
  // ────────────────────────────────────────────────────────────────────────

  const replaceSlashTriggerText = useCallback((replacement = '') => {
    const ed = editorRef.current;
    if (!isEditorViewAlive(ed)) return;
    const { from, to } = slashRangeRef.current;
    replaceEditorRangeWithText(ed, from, to, replacement);
  }, [editorRef]);

  const closeSlashMenu = useCallback(() => {
    setSlashOpen(false);
    setSlashQuery('');
    setSlashSelectedIndex(-1);
    setSlashAnchor(undefined);
  }, []);

  const executeSlashCommand = useCallback(async (commandId: SlashCommandId) => {
    if (commandId === 'field') {
      replaceSlashTriggerText('>');
      closeSlashMenu();
      return;
    }

    if (commandId === 'reference') {
      replaceSlashTriggerText('@');
      closeSlashMenu();
      return;
    }

    if (commandId === 'heading') {
      replaceSlashTriggerText('');
      const ed = editorRef.current;
      if (isEditorViewAlive(ed)) {
        const { from, to } = ed.state.selection;
        const docEnd = ed.state.doc.content.size - 1;

        if (from !== to) {
          toggleHeadingMark(ed);
        } else if (docEnd > 1) {
          const cursorPos = Math.max(1, Math.min(from, docEnd));
          setEditorSelection(ed, 1, docEnd);
          toggleHeadingMark(ed);
          setEditorSelection(ed, cursorPos, cursorPos);
        } else {
          toggleHeadingMark(ed);
        }
      }
      closeSlashMenu();
      return;
    }

    if (commandId === 'more_commands') {
      replaceSlashTriggerText('');
      closeSlashMenu();
      if (onOpenSearch) {
        onOpenSearch();
      } else {
        openSearch();
      }
      return;
    }

    if (commandId === 'checkbox') {
      replaceSlashTriggerText('');
      onCycleCheckbox?.();
      closeSlashMenu();
      return;
    }

    if (commandId === 'clip_page') {
      replaceSlashTriggerText('');
      closeSlashMenu();

      const canUseRuntime =
        typeof chrome !== 'undefined' &&
        !!chrome.runtime &&
        !!chrome.runtime.sendMessage;

      if (!canUseRuntime) return;

      const uiStore = useUIStore.getState();
      uiStore.addLoadingNode(nodeId);
      uiStore.clearFocus();

      try {
        const response = await chrome.runtime.sendMessage({
          type: WEBCLIP_CAPTURE_ACTIVE_TAB,
        }) as WebClipCaptureResponse;

        if (!response?.ok) {
          toast.error('Clip failed', { description: response?.error ?? 'unknown error' });
          return;
        }

        const store = useNodeStore.getState();
        await applyWebClipToNode(nodeId, response.payload, store);

        const ed = editorRef.current;
        if (isEditorViewAlive(ed) && response.payload.title) {
          setEditorPlainTextContent(ed, response.payload.title);
        }
      } catch (err) {
        toast.error('Clip failed', { description: err instanceof Error ? err.message : String(err) });
      } finally {
        uiStore.removeLoadingNode(nodeId);
      }
    }
  }, [replaceSlashTriggerText, closeSlashMenu, onOpenSearch, openSearch, onCycleCheckbox, nodeId, editorRef]);

  const handleSlashCommand = useCallback((query: string, from: number, to: number, anchor?: TriggerAnchorRect) => {
    slashRangeRef.current = { from, to };
    setSlashQuery(query);
    setSlashAnchor(anchor);
    setSlashOpen(true);

    // Close other trigger dropdowns
    setHashTagOpen(false);
    setHashTagQuery('');
    setHashTagSelectedIndex(0);
    setHashTagAnchor(undefined);
    setRefOpen(false);
    setRefQuery('');
    setRefSelectedIndex(0);
    setRefAnchor(undefined);
  }, []);

  const handleSlashDeactivate = useCallback(() => {
    closeSlashMenu();
  }, [closeSlashMenu]);

  const handleSlashConfirm = useCallback(() => {
    if (slashSelectedIndex < 0) return;
    const selected = filteredSlashCommands[slashSelectedIndex];
    if (!selected || !selected.enabled) return;
    executeSlashCommand(selected.id);
  }, [slashSelectedIndex, filteredSlashCommands, executeSlashCommand]);

  const handleSlashNavDown = useCallback(() => {
    setSlashSelectedIndex((i) => getNextEnabledSlashIndex(filteredSlashCommands, i, 'down'));
  }, [filteredSlashCommands]);

  const handleSlashNavUp = useCallback(() => {
    setSlashSelectedIndex((i) => getNextEnabledSlashIndex(filteredSlashCommands, i, 'up'));
  }, [filteredSlashCommands]);

  // ────────────────────────────────────────────────────────────────────────
  // Derived
  // ────────────────────────────────────────────────────────────────────────

  const hasOverlayOpen = isActive && (hashTagOpen || refOpen || slashOpen);

  return {
    hashTag: {
      open: hashTagOpen,
      query: hashTagQuery,
      selectedIndex: hashTagSelectedIndex,
      anchor: hashTagAnchor,
      tagDropdownRef,
      onTrigger: disabled ? () => {} : handleHashTag,
      onDeactivate: disabled ? () => {} : handleHashTagDeactivate,
      onSelect: handleHashTagSelect,
      onCreateNew: handleHashTagCreateNew,
      onConfirm: disabled ? () => {} : handleHashTagConfirm,
      onNavDown: disabled ? () => {} : handleHashTagNavDown,
      onNavUp: disabled ? () => {} : handleHashTagNavUp,
      onForceCreate: disabled ? () => {} : handleHashTagForceCreate,
      onClose: disabled ? () => {} : handleHashTagClose,
    },
    reference: {
      open: refOpen,
      query: refQuery,
      selectedIndex: refSelectedIndex,
      anchor: refAnchor,
      treeContextParentId: refTreeContextParentId,
      refDropdownRef,
      onTrigger: disabled ? () => {} : handleReference,
      onDeactivate: disabled ? () => {} : handleReferenceDeactivate,
      onSelect: handleReferenceSelect,
      onCreateNew: handleReferenceCreateNew,
      onConfirm: disabled ? () => {} : handleReferenceConfirm,
      onNavDown: disabled ? () => {} : handleReferenceNavDown,
      onNavUp: disabled ? () => {} : handleReferenceNavUp,
      onForceCreate: disabled ? () => {} : handleReferenceForceCreate,
      onClose: disabled ? () => {} : handleReferenceClose,
    },
    slash: {
      open: slashOpen,
      query: slashQuery,
      selectedIndex: slashSelectedIndex,
      anchor: slashAnchor,
      filteredCommands: filteredSlashCommands,
      onTrigger: disabled || !enableSlash ? () => {} : handleSlashCommand,
      onDeactivate: disabled || !enableSlash ? () => {} : handleSlashDeactivate,
      onConfirm: disabled || !enableSlash ? () => {} : handleSlashConfirm,
      onNavDown: disabled || !enableSlash ? () => {} : handleSlashNavDown,
      onNavUp: disabled || !enableSlash ? () => {} : handleSlashNavUp,
      onClose: disabled || !enableSlash ? () => {} : closeSlashMenu,
      executeCommand: executeSlashCommand,
    },
    onFieldTriggerFire: !disabled && enableFieldTrigger ? handleFieldTriggerFire : undefined,
    hasOverlayOpen,
    resetAll,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Helper: map hook return → RichTextEditor props
// ────────────────────────────────────────────────────────────────────────────

export function buildTriggerEditorProps(triggers: EditorTriggerState) {
  return {
    onHashTag: triggers.hashTag.onTrigger,
    onHashTagDeactivate: triggers.hashTag.onDeactivate,
    hashTagActive: triggers.hashTag.open,
    onHashTagConfirm: triggers.hashTag.onConfirm,
    onHashTagNavDown: triggers.hashTag.onNavDown,
    onHashTagNavUp: triggers.hashTag.onNavUp,
    onHashTagCreate: triggers.hashTag.onForceCreate,
    onHashTagClose: triggers.hashTag.onClose,
    onFieldTriggerFire: triggers.onFieldTriggerFire,
    onReference: triggers.reference.onTrigger,
    onReferenceDeactivate: triggers.reference.onDeactivate,
    referenceActive: triggers.reference.open,
    onReferenceConfirm: triggers.reference.onConfirm,
    onReferenceNavDown: triggers.reference.onNavDown,
    onReferenceNavUp: triggers.reference.onNavUp,
    onReferenceCreate: triggers.reference.onForceCreate,
    onReferenceClose: triggers.reference.onClose,
    onSlashCommand: triggers.slash.onTrigger,
    onSlashCommandDeactivate: triggers.slash.onDeactivate,
    slashActive: triggers.slash.open,
    onSlashConfirm: triggers.slash.onConfirm,
    onSlashNavDown: triggers.slash.onNavDown,
    onSlashNavUp: triggers.slash.onNavUp,
    onSlashClose: triggers.slash.onClose,
  } as const;
}
