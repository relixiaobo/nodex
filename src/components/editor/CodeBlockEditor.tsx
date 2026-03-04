/**
 * CodeBlockEditor — Replaces ProseMirror for code block nodes.
 *
 * Architecture: always-rendered `<pre><code>` with syntax highlighting.
 * When focused, a transparent `<textarea>` overlays for editing.
 * No DOM swap → no visual jump.
 */
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { Check, ChevronDown, Copy } from 'lucide-react';
import { highlightCode, detectLanguage, SUPPORTED_LANGUAGES } from '../../lib/code-highlight.js';
import { useNodeStore } from '../../stores/node-store.js';
import * as loroDoc from '../../lib/loro-doc.js';

export interface CodeBlockEditorProps {
  nodeId: string;
  parentId: string;
  initialText: string;
  codeLanguage?: string;
  isFocused: boolean;
  readOnly?: boolean;
  /** Text offset to place cursor at when first gaining focus (set by parent on click-to-focus). */
  pendingCursorOffset?: number | null;
  onBlur: () => void;
  onEscapeSelect: () => void;
  onArrowUp: () => void;
  onArrowDown: () => void;
  onBackspaceAtStart: () => boolean;
  onDelete: () => boolean;
  onIndent: () => void;
  onOutdent: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

export function CodeBlockEditor({
  nodeId,
  parentId,
  initialText,
  codeLanguage,
  isFocused,
  readOnly,
  pendingCursorOffset,
  onBlur,
  onEscapeSelect,
  onArrowUp,
  onArrowDown,
  onBackspaceAtStart,
  onDelete,
  onIndent,
  onOutdent,
  onMoveUp,
  onMoveDown,
}: CodeBlockEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const [text, setText] = useState(initialText);
  const [copied, setCopied] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const langDropdownRef = useRef<HTMLDivElement>(null);
  // Track whether we've synced to store yet (to avoid redundant blur sync)
  const dirtyRef = useRef(false);

  // Sync with external changes when not focused
  useEffect(() => {
    if (!isFocused) {
      setText(initialText);
    }
  }, [initialText, isFocused]);

  // Focus textarea when entering edit mode, place cursor at pending offset or end
  useEffect(() => {
    if (isFocused && textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      const offset = pendingCursorOffset != null
        ? Math.min(Math.max(0, pendingCursorOffset), len)
        : len;
      textareaRef.current.setSelectionRange(offset, offset);
      dirtyRef.current = false;
    }
  }, [isFocused]); // pendingCursorOffset intentionally excluded — only read on focus transition

  // Auto-detected language (only when no explicit language is set)
  const detectedLang = useMemo(
    () => (!codeLanguage && text ? detectLanguage(text) : ''),
    [text, codeLanguage],
  );

  // Effective language for highlighting: explicit > auto-detected
  const effectiveLang = codeLanguage || detectedLang || '';

  // Highlighted HTML — memoized on text + effective language
  const highlightedHtml = useMemo(
    () => highlightCode(text, effectiveLang || undefined),
    [text, effectiveLang],
  );

  /** Find nearest scrollable ancestor (for scroll preservation). */
  const findScrollAncestor = useCallback((): Element | null => {
    let el = preRef.current?.parentElement;
    while (el) {
      if (el.scrollHeight > el.clientHeight) return el;
      el = el.parentElement;
    }
    return null;
  }, []);

  // ── Sync text to store ──
  const syncToStore = useCallback(() => {
    if (!dirtyRef.current) return;
    const { updateNodeContent } = useNodeStore.getState();
    updateNodeContent(nodeId, { name: text, marks: [], inlineRefs: [] });
    loroDoc.commitDoc('user:text');
    dirtyRef.current = false;
  }, [nodeId, text]);

  // ── Event handlers ──

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (readOnly) return;
    setText(e.target.value);
    dirtyRef.current = true;
  }, [readOnly]);

  const handleBlur = useCallback(() => {
    syncToStore();
    onBlur();
  }, [syncToStore, onBlur]);

  // Scroll sync: textarea scroll → pre scroll
  const handleScroll = useCallback(() => {
    if (textareaRef.current && preRef.current) {
      preRef.current.scrollLeft = textareaRef.current.scrollLeft;
      preRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = textareaRef.current;
    if (!ta) return;

    const { selectionStart, selectionEnd, value } = ta;
    const hasSelection = selectionStart !== selectionEnd;

    // Escape → exit edit
    if (e.key === 'Escape') {
      e.preventDefault();
      syncToStore();
      onEscapeSelect();
      return;
    }

    // Tab → insert 2 spaces (no indenting node tree)
    if (e.key === 'Tab' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      if (readOnly) return;
      if (e.shiftKey) {
        // Shift+Tab: outdent current line (remove up to 2 leading spaces)
        const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
        const line = value.substring(lineStart);
        const spacesToRemove = line.startsWith('  ') ? 2 : line.startsWith(' ') ? 1 : 0;
        if (spacesToRemove > 0) {
          const newValue = value.substring(0, lineStart) + value.substring(lineStart + spacesToRemove);
          setText(newValue);
          dirtyRef.current = true;
          requestAnimationFrame(() => {
            ta.setSelectionRange(
              Math.max(lineStart, selectionStart - spacesToRemove),
              Math.max(lineStart, selectionEnd - spacesToRemove),
            );
          });
        }
      } else {
        // Insert 2 spaces
        const newValue = value.substring(0, selectionStart) + '  ' + value.substring(selectionEnd);
        setText(newValue);
        dirtyRef.current = true;
        requestAnimationFrame(() => {
          ta.setSelectionRange(selectionStart + 2, selectionStart + 2);
        });
      }
      return;
    }

    // Cmd+Shift+Up → move node up
    if (e.key === 'ArrowUp' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
      e.preventDefault();
      syncToStore();
      onMoveUp();
      return;
    }

    // Cmd+Shift+Down → move node down
    if (e.key === 'ArrowDown' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
      e.preventDefault();
      syncToStore();
      onMoveDown();
      return;
    }

    // ArrowUp at line 1 → navigate to previous node
    if (e.key === 'ArrowUp' && !hasSelection && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      const textBefore = value.substring(0, selectionStart);
      const isFirstLine = !textBefore.includes('\n');
      if (isFirstLine) {
        e.preventDefault();
        syncToStore();
        onArrowUp();
        return;
      }
    }

    // ArrowDown at last line → navigate to next node
    if (e.key === 'ArrowDown' && !hasSelection && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      const textAfter = value.substring(selectionStart);
      const isLastLine = !textAfter.includes('\n');
      if (isLastLine) {
        e.preventDefault();
        syncToStore();
        onArrowDown();
        return;
      }
    }

    // Backspace at start → merge with previous node
    if (e.key === 'Backspace' && selectionStart === 0 && !hasSelection) {
      e.preventDefault();
      syncToStore();
      onBackspaceAtStart();
      return;
    }

    // Delete at end → merge with next node
    if (e.key === 'Delete' && selectionStart === value.length && !hasSelection) {
      e.preventDefault();
      syncToStore();
      onDelete();
      return;
    }
  }, [readOnly, syncToStore, onEscapeSelect, onArrowUp, onArrowDown, onBackspaceAtStart, onDelete, onMoveUp, onMoveDown]);

  // ── Copy button ──
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may fail in extension context — ignore
    }
  }, [text]);

  // ── Language selector ──
  const handleLanguageSelect = useCallback((langValue: string) => {
    // Save scroll position BEFORE store update triggers re-render
    const ancestor = findScrollAncestor();
    const scrollTop = ancestor?.scrollTop ?? 0;

    const { setNodeCodeLanguage } = useNodeStore.getState();
    setNodeCodeLanguage(nodeId, langValue);
    setLangOpen(false);

    // Restore scroll after React commits DOM changes
    requestAnimationFrame(() => {
      if (ancestor) ancestor.scrollTop = scrollTop;
    });
  }, [nodeId, findScrollAncestor]);

  // Close language dropdown on outside click
  useEffect(() => {
    if (!langOpen) return;
    const handler = (e: MouseEvent) => {
      if (langDropdownRef.current && !langDropdownRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [langOpen]);

  // Display label: explicit language > auto-detected (with indicator) > Plain text
  const currentLangLabel = (() => {
    if (codeLanguage) {
      return SUPPORTED_LANGUAGES.find((l) => l.value === codeLanguage)?.label ?? codeLanguage;
    }
    if (detectedLang) {
      const detected = SUPPORTED_LANGUAGES.find((l) => l.value === detectedLang);
      return detected ? detected.label : detectedLang;
    }
    return 'Plain text';
  })();

  return (
    <div className="code-block-wrapper group/code relative overflow-hidden rounded-lg border border-border">
      {/* Code area — pre + textarea overlay */}
      <div className="relative">
        <pre
          ref={preRef}
          className="code-block-pre"
        >
          <code dangerouslySetInnerHTML={{ __html: highlightedHtml || '&#8203;' }} />
        </pre>

        {/* Transparent textarea overlay — only when focused */}
        {isFocused && !readOnly && (
          <textarea
            ref={textareaRef}
            className="code-block-textarea"
            value={text}
            onChange={handleChange}
            onBlur={handleBlur}
            onScroll={handleScroll}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
          />
        )}
      </div>

      {/* Toolbar — breathe-style: hidden by default, shown on hover/focus */}
      <div className="absolute top-1 right-1 flex items-center gap-1 rounded-lg bg-background shadow-paper z-10">
        {/* Language selector */}
        <div ref={langDropdownRef} className="relative">
          <button
            type="button"
            className="flex items-center gap-0.5 rounded px-1.5 py-1 text-sm text-foreground-secondary hover:text-foreground hover:bg-foreground/4 transition-colors"
            onClick={(e) => { e.stopPropagation(); setLangOpen(!langOpen); }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {currentLangLabel}
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {langOpen && (
            <div
              className="absolute right-0 top-full mt-0.5 z-50 max-h-60 w-36 overflow-y-auto rounded-lg bg-background shadow-paper p-1"
              onMouseDown={(e) => e.stopPropagation()}
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <div
                  key={lang.value}
                  className={`cursor-pointer rounded-md px-2 py-1.5 text-sm ${
                    (codeLanguage ?? '') === lang.value
                      ? 'bg-primary text-primary-foreground'
                      : 'text-foreground-secondary hover:bg-foreground/4 hover:text-foreground'
                  }`}
                  onClick={() => handleLanguageSelect(lang.value)}
                >
                  {lang.label}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Copy button */}
        <button
          type="button"
          className="flex items-center justify-center rounded p-1 text-foreground-secondary hover:text-foreground hover:bg-foreground/4 transition-colors"
          onClick={(e) => { e.stopPropagation(); handleCopy(); }}
          onMouseDown={(e) => e.stopPropagation()}
          title="Copy code"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}
