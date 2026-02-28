export const PASTE_DEBUG_STORAGE_KEY = 'soma:paste-debug';

type PasteNodeLike = {
  name?: string;
  type?: string;
  codeLanguage?: string;
  marks?: Array<{ type: string }>;
  tags?: string[];
  fields?: Array<{ name: string; value: string }>;
  children?: PasteNodeLike[];
};

export function isPasteDebugEnabled(): boolean {
  try {
    const globalFlag = (globalThis as { __SOMA_PASTE_DEBUG?: unknown }).__SOMA_PASTE_DEBUG;
    if (globalFlag === true) return true;

    const storage = (globalThis as { localStorage?: Storage }).localStorage;
    const raw = storage?.getItem(PASTE_DEBUG_STORAGE_KEY);
    if (!raw) return false;
    const normalized = raw.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'on' || normalized === 'yes';
  } catch {
    return false;
  }
}

export function logPasteDebug(context: string, payload: Record<string, unknown>): void {
  if (!isPasteDebugEnabled()) return;
  const ts = new Date().toISOString().slice(11, 23);
  // eslint-disable-next-line no-console
  console.groupCollapsed(`[paste-debug ${ts}] ${context}`);
  for (const [key, value] of Object.entries(payload)) {
    // eslint-disable-next-line no-console
    console.log(`${key}:`, value);
  }
  // eslint-disable-next-line no-console
  console.groupEnd();
}

export function previewMultiline(text: string, maxLines = 24): string[] {
  return text
    .split(/\r?\n/)
    .slice(0, maxLines)
    .map((line, idx) => `${String(idx + 1).padStart(2, '0')}: ${line}`);
}

export function summarizePasteNodes(
  nodes: PasteNodeLike[],
  depthLimit = 3,
): Array<Record<string, unknown>> {
  const walk = (node: PasteNodeLike, depth: number): Record<string, unknown> => {
    const summary: Record<string, unknown> = {
      type: node.type ?? 'text',
      name: node.name ?? '',
      marks: (node.marks ?? []).map((m) => m.type),
      tags: node.tags ?? [],
      fields: (node.fields ?? []).map((f) => `${f.name}::${f.value}`),
      codeLanguage: node.codeLanguage ?? '',
      childrenCount: node.children?.length ?? 0,
    };
    if (depth < depthLimit && (node.children?.length ?? 0) > 0) {
      summary.children = node.children!.map((child) => walk(child, depth + 1));
    }
    return summary;
  };

  return nodes.map((node) => walk(node, 1));
}
