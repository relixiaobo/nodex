import { useMemo, useState } from 'react';
import type { ToolCall, ToolResultMessage } from '@mariozechner/pi-ai';
import type { AppIcon } from '../../lib/icons.js';
import { IMAGE_PLACEHOLDER } from '../../lib/ai-message-images.js';
import { highlightCode } from '../../lib/code-highlight.js';
import {
  ArrowUpDown, Camera, ChevronDown, Clock, Code2, FileText, Globe, History, Image,
  Info, Keyboard, MousePointer, Move, PanelTop, Pencil, Plus, RotateCcw,
  Search, Terminal, Trash2, Wand2,
} from '../../lib/icons.js';

interface ToolCallBlockProps {
  toolCall: ToolCall;
  result?: ToolResultMessage;
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

type ToolStatus = 'pending' | 'done' | 'error';

function getStatus(result?: ToolResultMessage): ToolStatus {
  if (!result) return 'pending';
  return result.isError ? 'error' : 'done';
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

const BROWSER_ICON: Record<string, AppIcon> = {
  get_text: FileText,
  get_metadata: Info,
  find: Search,
  get_selection: FileText,
  screenshot: Camera,
  read_console: Terminal,
  read_network: Terminal,
  click: MousePointer,
  type: Keyboard,
  key: Keyboard,
  fill_form: Keyboard,
  scroll: ArrowUpDown,
  drag: Move,
  navigate: Globe,
  tab: PanelTop,
  wait: Clock,
  execute_js: Code2,
};

function getToolIcon(name: string, args: Record<string, unknown>): AppIcon {
  if (name === 'node_create') return Plus;
  if (name === 'node_read') return FileText;
  if (name === 'node_edit') return Pencil;
  if (name === 'node_delete') return args.restore === true ? RotateCcw : Trash2;
  if (name === 'node_search') return Search;
  if (name === 'undo') return RotateCcw;
  if (name === 'past_chats') return History;

  if (name === 'browser') {
    const action = typeof args.action === 'string' ? args.action : '';
    return BROWSER_ICON[action] ?? Globe;
  }

  // Legacy combined node tool
  if (name === 'node') {
    const action = typeof args.action === 'string' ? args.action : '';
    if (action === 'create') return Plus;
    if (action === 'read') return FileText;
    if (action === 'edit') return Pencil;
    if (action === 'delete') return Trash2;
    if (action === 'search') return Search;
  }

  return Wand2;
}

// ---------------------------------------------------------------------------
// Title helpers
// ---------------------------------------------------------------------------

/** Wrap subject in quotes (skip URLs). */
function q(subject: string): string {
  if (subject.startsWith('http://') || subject.startsWith('https://')) return subject;
  return `"${subject}"`;
}

/** Pick first available string arg. */
function pickSubject(args: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    if (typeof args[key] === 'string' && args[key]) return args[key] as string;
  }
  return null;
}

// Verb forms: [base, -ing, -ed]
type VerbForms = [string, string, string];

function verbByStatus(forms: VerbForms, status: ToolStatus): string {
  if (status === 'pending') return forms[1]; // -ing
  if (status === 'done') return forms[2];    // -ed
  return `Failed to ${forms[0]}`;            // error: Failed to + base
}

// ---------------------------------------------------------------------------
// Summarize
// ---------------------------------------------------------------------------

function summarizeToolCall(toolCall: ToolCall, status: ToolStatus): string {
  const { name, arguments: args } = toolCall;
  const subject = pickSubject(args, 'name', 'query');

  // ── Node tools ──────────────────────────────────────────────────────────

  if (name === 'node_create') {
    const verb = verbByStatus(['create', 'Creating', 'Created'], status);
    return subject ? `${verb} ${q(subject)}` : `${verb} node`;
  }
  if (name === 'node_read') {
    return verbByStatus(['read', 'Reading', 'Read'], status) + ' node';
  }
  if (name === 'node_edit') {
    const verb = verbByStatus(['edit', 'Editing', 'Edited'], status);
    const label = pickSubject(args, 'name');
    return label ? `${verb} ${q(label)}` : `${verb} node`;
  }
  if (name === 'node_delete') {
    if (args.restore === true) {
      const verb = verbByStatus(['restore', 'Restoring', 'Restored'], status);
      return `${verb} node`;
    }
    const verb = verbByStatus(['delete', 'Deleting', 'Deleted'], status);
    return `${verb} node`;
  }
  if (name === 'node_search') {
    const verb = verbByStatus(['search', 'Searching', 'Searched'], status);
    const query = pickSubject(args, 'query');
    return query ? `${verb} ${q(query)}` : `${verb} nodes`;
  }

  // Legacy combined node tool
  if (name === 'node') {
    const action = typeof args.action === 'string' ? args.action : 'run';
    const legacySubject = pickSubject(args, 'name', 'query');
    const LEGACY_VERBS: Record<string, VerbForms> = {
      create: ['create', 'Creating', 'Created'],
      read: ['read', 'Reading', 'Read'],
      edit: ['edit', 'Editing', 'Edited'],
      delete: ['delete', 'Deleting', 'Deleted'],
      search: ['search', 'Searching', 'Searched'],
    };
    const forms = LEGACY_VERBS[action];
    if (forms) {
      const verb = verbByStatus(forms, status);
      return legacySubject ? `${verb} ${q(legacySubject)}` : `${verb} node`;
    }
    return legacySubject ? `node.${action} ${q(legacySubject)}` : `node.${action}`;
  }

  // ── Past chats ──────────────────────────────────────────────────────────

  if (name === 'past_chats') {
    const sessionId = typeof args.sessionId === 'string' ? args.sessionId : null;
    const messageId = typeof args.messageId === 'string' ? args.messageId : null;
    const query = pickSubject(args, 'query');

    if (messageId) {
      const verb = verbByStatus(['read', 'Reading', 'Read'], status);
      return `${verb} chat message`;
    }
    if (sessionId) {
      const verb = verbByStatus(['browse', 'Browsing', 'Browsed'], status);
      return query ? `${verb} chat ${q(query)}` : `${verb} chat session`;
    }
    const verb = verbByStatus(['browse', 'Browsing', 'Browsed'], status);
    return query ? `${verb} chats ${q(query)}` : `${verb} recent chats`;
  }

  // ── Undo ────────────────────────────────────────────────────────────────

  if (name === 'undo') {
    const steps = typeof args.steps === 'number' ? args.steps : 1;
    const verb = verbByStatus(['undo', 'Undoing', 'Undone'], status);
    return `${verb} ${steps} step${steps > 1 ? 's' : ''}`;
  }

  // ── Browser ─────────────────────────────────────────────────────────────

  if (name === 'browser') {
    const action = typeof args.action === 'string' ? args.action : null;
    if (!action) return 'browser';

    const browserSubject = pickSubject(args, 'elementDescription', 'query', 'selector', 'url', 'text');

    const BROWSER_VERBS: Record<string, VerbForms> = {
      get_text: ['read page text', 'Reading page text', 'Read page text'],
      get_metadata: ['read metadata', 'Reading metadata', 'Read metadata'],
      find: ['find', 'Finding', 'Found'],
      get_selection: ['read selection', 'Reading selection', 'Read selection'],
      screenshot: ['take screenshot', 'Taking screenshot', 'Took screenshot'],
      read_console: ['read console', 'Reading console', 'Read console'],
      read_network: ['read network', 'Reading network', 'Read network'],
      click: ['click', 'Clicking', 'Clicked'],
      type: ['type text', 'Typing', 'Typed'],
      key: ['press', 'Pressing', 'Pressed'],
      fill_form: ['fill form', 'Filling form', 'Filled form'],
      scroll: ['scroll', 'Scrolling', 'Scrolled'],
      drag: ['drag', 'Dragging', 'Dragged'],
      navigate: ['navigate to', 'Navigating to', 'Navigated to'],
      tab: ['manage tab', 'Managing tab', 'Managed tab'],
      wait: ['wait', 'Waiting…', 'Waited'],
      execute_js: ['execute script', 'Executing script', 'Executed script'],
    };

    const forms = BROWSER_VERBS[action];
    if (forms) {
      const verb = verbByStatus(forms, status);
      return browserSubject ? `${verb} ${q(browserSubject)}` : verb;
    }
    // Unknown action fallback
    const readable = action.replace(/_/g, ' ');
    return browserSubject ? `${readable} ${q(browserSubject)}` : readable;
  }

  // ── Fallback ────────────────────────────────────────────────────────────

  return name;
}

// ---------------------------------------------------------------------------
// Result rendering helpers
// ---------------------------------------------------------------------------

function isImagePlaceholder(text: string): boolean {
  const t = text.trim();
  return t === IMAGE_PLACEHOLDER || t.startsWith('[Image removed');
}

type ResultPart = { type: 'text'; text: string } | { type: 'image_placeholder' };

function getResultParts(result: ToolResultMessage): ResultPart[] {
  return result.content
    .filter((block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text')
    .map((block) =>
      isImagePlaceholder(block.text)
        ? { type: 'image_placeholder' as const }
        : { type: 'text' as const, text: block.text },
    );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const CODE_BLOCK = 'max-h-48 overflow-auto whitespace-pre text-[11px] leading-5';

export function ToolCallBlock({ toolCall, result }: ToolCallBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const Icon = getToolIcon(toolCall.name, toolCall.arguments);
  const status = getStatus(result);

  const inputHtml = useMemo(
    () => expanded ? highlightCode(JSON.stringify(toolCall.arguments, null, 2), 'json') : '',
    [expanded, toolCall.arguments],
  );

  const parts = useMemo(() => result && expanded ? getResultParts(result) : [], [result, expanded]);

  return (
    <div className="max-w-full">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="group/tool flex max-w-[62%] items-center gap-1.5 py-0.5 text-foreground-tertiary transition-colors hover:text-foreground-secondary"
      >
        {/* Icon area: tool icon by default, chevron on hover / when expanded */}
        <span className="flex h-4 w-3.5 shrink-0 items-center justify-center">
          {expanded ? (
            <ChevronDown size={14} strokeWidth={1.8} className="rotate-180" />
          ) : (
            <>
              <Icon size={14} strokeWidth={1.6} className="group-hover/tool:hidden" />
              <ChevronDown size={14} strokeWidth={1.8} className="hidden group-hover/tool:block" />
            </>
          )}
        </span>
        <span className="min-w-0 truncate text-xs">
          {summarizeToolCall(toolCall, status)}
        </span>
      </button>
      {expanded && (
        <div className="ml-5 mt-1 overflow-hidden rounded-lg border border-border/60 bg-foreground/[0.02]">
          <div className="px-3 py-2">
            <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.06em] text-foreground-tertiary">Input</div>
            <pre
              className={`${CODE_BLOCK} text-foreground-secondary`}
              dangerouslySetInnerHTML={{ __html: inputHtml }}
            />
          </div>
          {result && (
            <div className="border-t border-border/50 px-3 py-2">
              <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.06em] text-foreground-tertiary">
                Output
                {result.isError && <span className="ml-1.5 text-destructive">error</span>}
              </div>
              {parts.map((part, i) =>
                part.type === 'image_placeholder' ? (
                  <div key={i} className="flex items-center gap-1.5 py-1 text-[11px] text-foreground-tertiary">
                    <Image size={14} strokeWidth={1.6} className="shrink-0" />
                    <span>Screenshot captured</span>
                  </div>
                ) : (
                  <HighlightedPre key={i} text={part.text} isError={result.isError} />
                ),
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HighlightedPre({ text, isError }: { text: string; isError: boolean }) {
  const html = useMemo(() => highlightCode(text), [text]);
  return (
    <pre
      className={`${CODE_BLOCK} ${isError ? 'text-destructive' : 'text-foreground-secondary'}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
