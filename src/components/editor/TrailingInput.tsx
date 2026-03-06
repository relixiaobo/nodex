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
import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { EditorState, TextSelection, type Plugin } from 'prosemirror-state';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';
import { EditorView } from 'prosemirror-view';
import { useNodeStore } from '../../stores/node-store';
import { useUIStore } from '../../stores/ui-store';
import { getLastVisibleNode, isWorkspaceContainer, getNodeTextLengthById } from '../../lib/tree-utils.js';
import { isOptionsFieldType } from '../../lib/field-utils.js';
import * as loroDoc from '../../lib/loro-doc.js';
import { undoDoc, redoDoc, commitDoc } from '../../lib/loro-doc.js';
import { getPrimaryShortcutKey } from '../../lib/shortcut-registry';
import { t } from '../../i18n/strings.js';
import { isImeComposingEvent } from '../../lib/ime-keyboard.js';
import {
    resolveTrailingRowUpdateAction,
    resolveTrailingRowEnterIntent as resolveTrailingEnterIntent,
    resolveTrailingRowArrowDownIntent as resolveTrailingArrowDownIntent,
    resolveTrailingRowArrowUpIntent as resolveTrailingArrowUpIntent,
    resolveTrailingRowBackspaceIntent as resolveTrailingBackspaceIntent,
    resolveTrailingRowEscapeIntent as resolveTrailingEscapeIntent,
} from '../../lib/row-interactions.js';
import { useFieldOptions } from '../../hooks/use-field-options.js';
import { BulletChevron } from '../outliner/BulletChevron';
import { FIELD_OVERLAY_Z_INDEX } from '../fields/field-layout.js';
import { pmSchema } from './pm-schema.js';
import { marksToDoc } from '../../lib/pm-doc-utils.js';
import { parseMultiLinePaste } from '../../lib/paste-parser.js';
import { logPasteDebug, previewMultiline, summarizePasteNodes } from '../../lib/paste-debug.js';

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
    isSearchContext?: boolean;
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

export function TrailingInput({ parentId, depth, autoFocus, parentExpandKey, fieldDataType, attrDefId, onNavigateOut, isSearchContext }: TrailingInputProps) {
    const createChild = useNodeStore((s) => s.createChild);
    const createNodeInSearchContext = useNodeStore((s) => s.createNodeInSearchContext);
    const cycleNodeCheckbox = useNodeStore((s) => s.cycleNodeCheckbox);
    const addUnnamedFieldToNode = useNodeStore((s) => s.addUnnamedFieldToNode);
    const setExpanded = useUIStore((s) => s.setExpanded);
    const setFocusedNode = useUIStore((s) => s.setFocusedNode);
    const setFocusClickCoords = useUIStore((s) => s.setFocusClickCoords);
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
    const isComposingRef = useRef(false);
    const [hasContent, setHasContent] = useState(false);
    const mountRef = useRef<HTMLDivElement | null>(null);
    const viewRef = useRef<EditorView | null>(null);

    // Options autocomplete state
    const isOptions = isOptionsFieldType(fieldDataType);
    const allOptions = useFieldOptions(isOptions ? (attrDefId ?? '') : '');
    const addReference = useNodeStore((s) => s.addReference);
    const selectFieldOption = useNodeStore((s) => s.selectFieldOption);
    const registerCollectedOption = useNodeStore((s) => s.registerCollectedOption);
    const applyParsedPasteMetadata = useNodeStore((s) => s.applyParsedPasteMetadata);
    const createSiblingNodesFromPaste = useNodeStore((s) => s.createSiblingNodesFromPaste);
    const createChildNodesFromPaste = useNodeStore((s) => s.createChildNodesFromPaste);

    const [optionsOpen, setOptionsOpen] = useState(false);
    const [optionsQuery, setOptionsQuery] = useState('');
    const [optionsIndex, setOptionsIndex] = useState(0);
    const trailingWrapperRef = useRef<HTMLDivElement>(null);
    const optionsDropdownRef = useRef<HTMLDivElement>(null);
    const [optionsDropdownPos, setOptionsDropdownPos] = useState<{ top: number; left: number } | null>(null);

    const filteredOptions = useMemo(() => {
        if (!isOptions || !optionsOpen || allOptions.length === 0) return [];
        if (!optionsQuery.trim()) return allOptions;
        const q = optionsQuery.trim().toLowerCase();
        return allOptions.filter((o) => o.name.toLowerCase().includes(q));
    }, [isOptions, optionsOpen, optionsQuery, allOptions]);

    const callbacksRef = useRef({
        createChild, createNodeInSearchContext, cycleNodeCheckbox, addUnnamedFieldToNode, addReference, selectFieldOption, registerCollectedOption, applyParsedPasteMetadata, createSiblingNodesFromPaste, createChildNodesFromPaste,
        parentId, effectiveParentId, effectiveDepth, effectiveParentEK,
        setEffectiveParentId, setEffectiveDepth, setEffectiveParentEK,
        setExpanded, setFocusedNode, setFocusClickCoords, setEditingFieldName, setTriggerHint,
        isOptions, attrDefId, optionsOpen, filteredOptions, optionsIndex,
        setOptionsOpen, setOptionsQuery, setOptionsIndex,
        onNavigateOut, isSearchContext,
    });
    callbacksRef.current = {
        createChild, createNodeInSearchContext, cycleNodeCheckbox, addUnnamedFieldToNode, addReference, selectFieldOption, registerCollectedOption, applyParsedPasteMetadata, createSiblingNodesFromPaste, createChildNodesFromPaste,
        parentId, effectiveParentId, effectiveDepth, effectiveParentEK,
        setEffectiveParentId, setEffectiveDepth, setEffectiveParentEK,
        setExpanded, setFocusedNode, setFocusClickCoords, setEditingFieldName, setTriggerHint,
        isOptions, attrDefId, optionsOpen, filteredOptions, optionsIndex,
        setOptionsOpen, setOptionsQuery, setOptionsIndex,
        onNavigateOut, isSearchContext,
    };

    const createInContext = (ref: typeof callbacksRef.current, parentIdArg: string, data?: Partial<import('../../types/index.js').NodexNode>) => {
        if (ref.isSearchContext) return ref.createNodeInSearchContext(parentIdArg, data);
        return ref.createChild(parentIdArg, undefined, data);
    };

    const commitContent = useCallback((rawText: string, view: EditorView) => {
        if (!rawText.trim() || committingRef.current) return;

        const ref = callbacksRef.current;
        committingRef.current = true;
        resetEditorContent(view);
        setHasContent(false);

        // Create child and focus it (TrailingInput unmounts once there are children,
        // so we focus the new node to keep the cursor visible)
        const newNode = createInContext(ref, ref.effectiveParentId, { name: rawText });

        // Options field: also register as auto-collected option under fieldDef
        if (ref.isOptions && ref.attrDefId) {
            ref.registerCollectedOption(ref.attrDefId, rawText.trim());
        }
        ref.setExpanded(ref.effectiveParentEK, true, true);
        ref.setFocusClickCoords({
            nodeId: newNode.id,
            parentId: ref.effectiveParentId,
            textOffset: rawText.length,
        });
        ref.setFocusedNode(newNode.id, ref.effectiveParentId);
        queueMicrotask(() => { committingRef.current = false; });
    }, []);

    const plugins = useMemo<Plugin[]>(() => {
        const isComposing = (view: EditorView | null | undefined): boolean =>
            !!view && (view.composing || isComposingRef.current);

        return [
            keymap({
                [KEY_TRAILING_ENTER]: (_state, _dispatch, view) => {
                    if (!view || isComposing(view)) return false;
                    const ref = callbacksRef.current;
                    const rawText = getEditorText(view);
                    const intent = resolveTrailingEnterIntent({
                        optionsOpen: ref.isOptions && ref.optionsOpen,
                        optionCount: ref.filteredOptions.length,
                        hasText: rawText.trim().length > 0,
                    });

                    // Options autocomplete: select highlighted option
                    if (intent === 'options_confirm') {
                        const selected = ref.filteredOptions[ref.optionsIndex];
                        if (selected) {
                            committingRef.current = true;
                            ref.selectFieldOption(ref.effectiveParentId, selected.id, undefined);
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

                    if (intent === 'create_content_and_continue') {
                        if (committingRef.current) return true;
                        committingRef.current = true;
                        resetEditorContent(view);
                        setHasContent(false);

                        const targetParentId = ref.effectiveParentId;
                        createInContext(ref, targetParentId, { name: rawText });

                        // Options field: also register as auto-collected option
                        if (ref.isOptions && ref.attrDefId) {
                            ref.registerCollectedOption(ref.attrDefId, rawText.trim());
                        }
                        ref.setExpanded(ref.effectiveParentEK, true, true);
                        const newNode = createInContext(ref, targetParentId, { name: '' });
                        ref.setExpanded(ref.effectiveParentEK, true, true);
                        ref.setFocusClickCoords({
                            nodeId: newNode.id,
                            parentId: targetParentId,
                            textOffset: 0,
                        });
                        ref.setFocusedNode(newNode.id, targetParentId);
                        queueMicrotask(() => { committingRef.current = false; });
                        return true;
                    }

                    // Empty Enter → create empty child so user can keep creating nodes
                    committingRef.current = true;
                    const newEmptyNode = createInContext(ref, ref.effectiveParentId, { name: '' });
                    ref.setExpanded(ref.effectiveParentEK, true, true);
                    ref.setFocusClickCoords({
                        nodeId: newEmptyNode.id,
                        parentId: ref.effectiveParentId,
                        textOffset: 0,
                    });
                    ref.setFocusedNode(newEmptyNode.id, ref.effectiveParentId);
                    queueMicrotask(() => { committingRef.current = false; });
                    return true;
                },
                [KEY_TRAILING_INDENT]: (_state, _dispatch, view) => {
                    if (isComposing(view)) return false;
                    // Indent: move effective parent to last child of current parent
                    const ref = callbacksRef.current;
                    const parent = useNodeStore.getState().getNode(ref.effectiveParentId);
                    const siblings = parent?.children ?? [];
                    if (siblings.length === 0) return true; // No siblings to indent under

                    const lastSiblingId = siblings[siblings.length - 1];
                    // Expand the last sibling (compound key: effectiveParentId is its parent context)
                    const siblingEK = `${ref.effectiveParentId}:${lastSiblingId}`;
                    ref.setExpanded(siblingEK, true, true);
                    // Track: new effectiveParentId is lastSiblingId, its expand key is siblingEK
                    ref.setEffectiveParentEK(siblingEK);
                    ref.setEffectiveParentId(lastSiblingId);
                    ref.setEffectiveDepth(ref.effectiveDepth + 1);
                    return true;
                },
                [KEY_TRAILING_OUTDENT]: (_state, _dispatch, view) => {
                    if (isComposing(view)) return false;
                    // Outdent: move effective parent up one level
                    const ref = callbacksRef.current;

                    // Can't go above workspace containers or depth 0
                    if (ref.effectiveDepth <= 0) return true;
                    if (isWorkspaceContainer(ref.effectiveParentId)) return true;

                    const grandparentId = loroDoc.getParentId(ref.effectiveParentId);
                    if (!grandparentId || isWorkspaceContainer(grandparentId)) return true;

                    // Compute expand key for grandparent (best-effort via parent chain)
                    const ggpId = loroDoc.getParentId(grandparentId) ?? '';
                    ref.setEffectiveParentEK(`${ggpId}:${grandparentId}`);
                    ref.setEffectiveParentId(grandparentId);
                    ref.setEffectiveDepth(ref.effectiveDepth - 1);
                    return true;
                },
                [KEY_TRAILING_BACKSPACE]: (_state, _dispatch, view) => {
                    if (!view || isComposing(view)) return false;
                    const ref = callbacksRef.current;
                    const isEditorEmpty = getEditorText(view).length === 0;
                    const expanded = useUIStore.getState().expandedNodes;
                    const parent = useNodeStore.getState().getNode(ref.effectiveParentId);
                    const target = getLastVisibleNode(ref.effectiveParentId, expanded);
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
                        if (expandKey) ref.setExpanded(expandKey, false, true);
                        const gpId = loroDoc.getParentId(ref.effectiveParentId);
                        if (gpId) ref.setFocusedNode(ref.effectiveParentId, gpId);
                        return true;
                    }

                    // Focus the last visible node above this TrailingInput at the end of its text.
                    if (intent === 'focus_last_visible' && target) {
                        useUIStore.getState().setFocusClickCoords({
                            nodeId: target.nodeId,
                            parentId: target.parentId,
                            textOffset: getNodeTextLengthById(target.nodeId),
                        });
                        ref.setFocusedNode(target.nodeId, target.parentId);
                    }
                    return true;
                },
                [KEY_TRAILING_ARROW_DOWN]: (_state, _dispatch, view) => {
                    if (isComposing(view)) return false;
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
                [KEY_TRAILING_ARROW_UP]: (_state, _dispatch, view) => {
                    if (isComposing(view)) return false;
                    const ref = callbacksRef.current;
                    const expanded = useUIStore.getState().expandedNodes;
                    const target = getLastVisibleNode(ref.effectiveParentId, expanded);
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
                // Cmd+Enter: commit text + toggle checkbox on the new node
                'Mod-Enter': (_state, _dispatch, view) => {
                    if (!view || isComposing(view)) return false;
                    if (committingRef.current) return true;
                    const ref = callbacksRef.current;
                    const rawText = getEditorText(view);

                    committingRef.current = true;
                    resetEditorContent(view);
                    setHasContent(false);
                    ref.setOptionsOpen(false);

                    const newNode = createInContext(ref, ref.effectiveParentId, { name: rawText });
                    ref.setExpanded(ref.effectiveParentEK, true, true);
                    ref.cycleNodeCheckbox(newNode.id);
                    ref.setFocusClickCoords({
                        nodeId: newNode.id,
                        parentId: ref.effectiveParentId,
                        textOffset: rawText.length,
                    });
                    ref.setFocusedNode(newNode.id, ref.effectiveParentId);
                    queueMicrotask(() => { committingRef.current = false; });
                    return true;
                },
                // Undo/Redo — route to Loro UndoManager (same as RichTextEditor)
                'Mod-z': () => { undoDoc(); return true; },
                'Mod-y': () => { redoDoc(); return true; },
                'Mod-Shift-z': () => { redoDoc(); return true; },
                [KEY_TRAILING_ESCAPE]: (_state, _dispatch, view) => {
                    if (!view || isComposing(view)) return false;
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

                const action = resolveTrailingRowUpdateAction({
                    text,
                    isOptionsField: ref.isOptions,
                });

                // > field trigger: handle directly (no intermediate node needed)
                if (action.type === 'create_field') {
                    committingRef.current = true;
                    resetEditorContent(view);
                    setHasContent(false);
                    ref.setOptionsOpen(false);

                    const { fieldEntryId } = ref.addUnnamedFieldToNode(ref.effectiveParentId);
                    ref.setEditingFieldName(fieldEntryId);
                    queueMicrotask(() => { committingRef.current = false; });
                    return;
                }

                // #/@/ trigger: create child node + set triggerHint so OutlinerItem
                // opens the dropdown immediately.
                if (action.type === 'create_trigger_node') {
                    committingRef.current = true;
                    resetEditorContent(view);
                    setHasContent(false);
                    ref.setOptionsOpen(false);

                    const triggerNode = createInContext(ref, ref.effectiveParentId, { name: action.matchText });
                    ref.setTriggerHint({ char: action.trigger, nodeId: triggerNode.id });
                    ref.setExpanded(ref.effectiveParentEK, true, true);
                    ref.setFocusClickCoords({
                        nodeId: triggerNode.id,
                        parentId: ref.effectiveParentId,
                        textOffset: action.textOffset,
                    });
                    ref.setFocusedNode(triggerNode.id, ref.effectiveParentId);

                    queueMicrotask(() => { committingRef.current = false; });
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
                paste: (_view, event) => {
                    const clipboardEvent = event as ClipboardEvent;
                    clipboardEvent.preventDefault();
                    const plain = clipboardEvent.clipboardData?.getData('text/plain') ?? '';
                    const html = clipboardEvent.clipboardData?.getData('text/html') ?? '';
                    logPasteDebug('TrailingInput.paste:raw', {
                        clipboardTypes: clipboardEvent.clipboardData ? Array.from(clipboardEvent.clipboardData.types ?? []) : [],
                        plainPreview: previewMultiline(plain),
                        htmlPreview: previewMultiline((html ?? '').replace(/\s+/g, ' ').trim(), 8),
                    });
                    if (!plain.trim() && !html.trim()) return true;

                    const ref = callbacksRef.current;
                    if (committingRef.current) return true;
                    committingRef.current = true;

                    const nodes = parseMultiLinePaste(plain, html).filter((node) =>
                        node.name.trim().length > 0
                        || node.children.length > 0
                        || (node.tags?.length ?? 0) > 0
                        || (node.fields?.length ?? 0) > 0,
                    );
                    logPasteDebug('TrailingInput.paste:parsed', {
                        parsedCount: nodes.length,
                        parsed: summarizePasteNodes(nodes),
                    });
                    if (nodes.length === 0) { committingRef.current = false; return true; }

                    // Create first child from first line
                    resetEditorContent(_view);
                    setHasContent(false);
                    const firstParsed = nodes[0];
                    const firstNode = createInContext(ref, ref.effectiveParentId, {
                        name: firstParsed.name,
                        marks: firstParsed.marks,
                        inlineRefs: firstParsed.inlineRefs,
                        type: firstParsed.type,
                        codeLanguage: firstParsed.codeLanguage,
                    });
                    ref.setExpanded(ref.effectiveParentEK, true, true);
                    ref.applyParsedPasteMetadata(firstNode.id, firstParsed, { commit: false });
                    if (firstParsed.children.length > 0) {
                        ref.createChildNodesFromPaste(firstNode.id, firstParsed.children, { commit: false });
                    }

                    // Create siblings for remaining lines
                    let lastId = firstNode.id;
                    if (nodes.length > 1) {
                        const result = ref.createSiblingNodesFromPaste(firstNode.id, nodes.slice(1), { commit: false });
                        if (result) lastId = result;
                    }
                    commitDoc('user:paste');

                    ref.setFocusClickCoords({
                        nodeId: lastId,
                        parentId: ref.effectiveParentId,
                        textOffset: nodes[nodes.length - 1].name.length,
                    });
                    ref.setFocusedNode(lastId, ref.effectiveParentId);
                    queueMicrotask(() => { committingRef.current = false; });
                    return true;
                },
                // Prevent ProseMirror from handling drag-over / drop when
                // a custom outliner drag is in progress (dragNodeId set).
                // Returning true tells ProseMirror to skip its own handling,
                // and the events bubble up to FieldValueOutliner container.
                dragover: () => {
                    if (useUIStore.getState().dragNodeId) return true;
                    return false;
                },
                drop: () => {
                    if (useUIStore.getState().dragNodeId) return true;
                    return false;
                },
                keydown: (view, event) => {
                    const keyboardEvent = event as KeyboardEvent;
                    if (isImeComposingEvent(keyboardEvent)) {
                        isComposingRef.current = true;
                        return false;
                    }

                    // For non-IME regular characters, trigger immediate eager conversion to Real Node.
                    if (
                        !keyboardEvent.ctrlKey &&
                        !keyboardEvent.altKey &&
                        !keyboardEvent.metaKey &&
                        keyboardEvent.key.length === 1 &&
                        (!view.state.doc.textContent || view.state.doc.textContent.length === 0)
                    ) {
                        const ref = callbacksRef.current;
                        const char = keyboardEvent.key;

                        // Only eager convert if it's not a trigger character that has special meaning
                        if (char !== '>' && char !== '#' && char !== '@' && char !== '/') {
                            keyboardEvent.preventDefault();
                            committingRef.current = true;
                            resetEditorContent(view);
                            setHasContent(false);

                            const newEmptyNode = createInContext(ref, ref.effectiveParentId, { name: '' });
                            ref.setExpanded(ref.effectiveParentEK, true, true);

                            useUIStore.getState().setPendingInputChar({
                                char,
                                nodeId: newEmptyNode.id,
                                parentId: ref.effectiveParentId,
                            });

                            ref.setFocusedNode(newEmptyNode.id, ref.effectiveParentId);
                            queueMicrotask(() => { committingRef.current = false; });
                            return true;
                        }
                    }

                    return false;
                },
                compositionstart: () => {
                    isComposingRef.current = true;
                    return false;
                },
                compositionend: (view) => {
                    isComposingRef.current = false;
                    // When IME finishes, grab the text and trigger an immediate commit
                    // to eager-convert the node
                    queueMicrotask(() => {
                        if (committingRef.current || !viewRef.current) return;
                        const text = viewRef.current.state.doc.textContent;
                        if (text.length > 0) {
                            commitContent(text, viewRef.current);
                        }
                    });
                    return false;
                },
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
                    isComposingRef.current = false;
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

    // Compute dropdown position for the portal when options dropdown opens
    useLayoutEffect(() => {
        if (!optionsOpen || !trailingWrapperRef.current) {
            setOptionsDropdownPos(null);
            return;
        }
        const updatePos = () => {
            const rect = trailingWrapperRef.current?.getBoundingClientRect();
            if (rect) {
                setOptionsDropdownPos({ top: rect.bottom + 2, left: rect.left });
            }
        };
        updatePos();
        const scrollContainer = trailingWrapperRef.current.closest('.overflow-y-auto, [style*="overflow"]');
        scrollContainer?.addEventListener('scroll', updatePos, { passive: true });
        window.addEventListener('resize', updatePos, { passive: true });
        return () => {
            scrollContainer?.removeEventListener('scroll', updatePos);
            window.removeEventListener('resize', updatePos);
        };
    }, [optionsOpen]);

    // Handle option click from dropdown
    const handleOptionClick = useCallback((optionId: string) => {
        const ref = callbacksRef.current;
        const view = viewRef.current;
        if (!view || view.isDestroyed) return;

        committingRef.current = true;
        ref.selectFieldOption(ref.effectiveParentId, optionId, undefined);
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
            className="group/row flex min-h-6 items-start gap-2 py-1"
            style={{ paddingLeft: effectiveDepth * 28 + 6 + 15 + 4 }}
        >
            <BulletChevron
                hasChildren={false}
                isExpanded={false}
                onBulletClick={() => { }}
                dimmed={!hasContent}
            />
            <div ref={trailingWrapperRef} className="relative flex-1 min-w-0">
                <div
                    ref={mountRef}
                    className={`${fieldDataType ? 'field-trailing' : 'idle-hint'} outline-none text-[15px] leading-6`}
                    style={fieldDataType ? { '--field-hint': `"${isOptions ? t('field.selectOption') : t('field.emptyText')}"` } as React.CSSProperties : undefined}
                />
                {optionsOpen && filteredOptions.length > 0 && optionsDropdownPos && createPortal(
                    <div
                        ref={optionsDropdownRef}
                        className="max-h-48 w-56 overflow-y-auto rounded-lg bg-background shadow-paper p-1"
                        style={{ position: 'fixed', top: optionsDropdownPos.top, left: optionsDropdownPos.left, zIndex: FIELD_OVERLAY_Z_INDEX }}
                        onMouseDown={(e) => e.preventDefault()}
                    >
                        {filteredOptions.map((opt, i) => (
                            <div
                                key={opt.id}
                                className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm ${i === optionsIndex ? 'bg-primary-muted text-foreground' : 'text-foreground hover:bg-foreground/4'}`}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => handleOptionClick(opt.id)}
                            >
                                <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-foreground/40" />
                                <span className="truncate">{opt.name}</span>
                            </div>
                        ))}
                    </div>,
                    document.body,
                )}
            </div>
        </div>
    );
}
