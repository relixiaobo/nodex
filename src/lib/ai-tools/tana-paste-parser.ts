import type { InlineRefEntry } from '../../types/node.js';

const REFERENCE_PATTERN = /\[\[([^\]^]+)\^([^\]]+)\]\]/g;
const EXACT_REFERENCE_PATTERN = /^\[\[([^\]^]+)\^([^\]]+)\]\]$/;
const CHECKBOX_PATTERN = /^\[(X| )\](?:\s+(.*))?$/;
const FIELD_PATTERN = /^([^:\n]+?)::(?:\s*(.*))?$/;
const TAG_PATTERN = /(^|\s)#([^\s#[\]]+)/g;
const BULLET_PREFIX = '- ';

export interface ParsedTanaPasteValue {
  text: string;
  inlineRefs: InlineRefEntry[];
  targetId?: string;
}

export interface ParsedTanaPasteField {
  name: string;
  values: ParsedTanaPasteValue[];
  clear: boolean;
}

export interface ParsedTanaPasteNode {
  name: string;
  inlineRefs: InlineRefEntry[];
  tags: string[];
  checked: boolean | null;
  targetId?: string;
  fields: ParsedTanaPasteField[];
  children: ParsedTanaPasteNode[];
}

interface ParsedFieldLine {
  field: ParsedTanaPasteField;
  opensValueBlock: boolean;
}

interface ParseContextNode {
  kind: 'node';
  node: ParsedTanaPasteNode;
  childIndent: number;
}

interface ParseContextField {
  kind: 'field';
  field: ParsedTanaPasteField;
  childIndent: number;
}

type ParseContext = ParseContextNode | ParseContextField;

function stripListPrefix(text: string): string {
  return text.startsWith(BULLET_PREFIX) ? text.slice(BULLET_PREFIX.length) : text;
}

function parseRichText(text: string): ParsedTanaPasteValue {
  const inlineRefs: InlineRefEntry[] = [];
  let output = '';
  let lastIndex = 0;

  text.replace(REFERENCE_PATTERN, (match, displayName: string, targetId: string, offset: number) => {
    output += text.slice(lastIndex, offset);
    inlineRefs.push({
      offset: output.length,
      targetNodeId: targetId,
      displayName,
    });
    output += '\uFFFC';
    lastIndex = offset + match.length;
    return match;
  });

  output += text.slice(lastIndex);

  return {
    text: output.trim(),
    inlineRefs,
  };
}

function extractTags(text: string): { text: string; tags: string[] } {
  const tags: string[] = [];
  const withoutTags = text.replace(TAG_PATTERN, (_match, leading: string, tagName: string) => {
    tags.push(tagName);
    return leading;
  });

  return {
    text: withoutTags.replace(/\s{2,}/g, ' ').trim(),
    tags,
  };
}

function parseNodeLine(rawLine: string): ParsedTanaPasteNode {
  const stripped = stripListPrefix(rawLine.trim());
  const exactReference = stripped.match(EXACT_REFERENCE_PATTERN);
  if (exactReference) {
    return {
      name: exactReference[1] ?? '',
      inlineRefs: [],
      tags: [],
      checked: null,
      targetId: exactReference[2],
      fields: [],
      children: [],
    };
  }

  let checked: boolean | null = null;
  let content = stripped;

  const checkboxMatch = stripped.match(CHECKBOX_PATTERN);
  if (checkboxMatch) {
    checked = checkboxMatch[1] === 'X';
    content = checkboxMatch[2] ?? '';
  }

  const { text: textWithoutTags, tags } = extractTags(content);
  const richText = parseRichText(textWithoutTags);

  return {
    name: richText.text,
    inlineRefs: richText.inlineRefs,
    tags,
    checked,
    fields: [],
    children: [],
  };
}

function parseFieldValueLine(rawLine: string): ParsedTanaPasteValue {
  const stripped = stripListPrefix(rawLine.trim());
  const exactReference = stripped.match(EXACT_REFERENCE_PATTERN);
  if (exactReference) {
    return {
      text: exactReference[1] ?? '',
      inlineRefs: [],
      targetId: exactReference[2],
    };
  }

  return parseRichText(stripped);
}

function parseFieldLine(rawLine: string): ParsedFieldLine | null {
  const stripped = stripListPrefix(rawLine.trim());
  const match = stripped.match(FIELD_PATTERN);
  if (!match) return null;

  const fieldName = match[1]?.trim() ?? '';
  const inlineValue = match[2]?.trim() ?? '';

  if (!fieldName) return null;

  if (!inlineValue) {
    return {
      field: {
        name: fieldName,
        values: [],
        clear: true,
      },
      opensValueBlock: true,
    };
  }

  return {
    field: {
      name: fieldName,
      values: [parseFieldValueLine(inlineValue)],
      clear: false,
    },
    opensValueBlock: false,
  };
}

function createEmptyRoot(): ParsedTanaPasteNode {
  return {
    name: '',
    inlineRefs: [],
    tags: [],
    checked: null,
    fields: [],
    children: [],
  };
}

function countIndent(line: string): number {
  const match = line.match(/^ */);
  return match?.[0].length ?? 0;
}

function mergeRootInlineMetadata(root: ParsedTanaPasteNode, metaNode: ParsedTanaPasteNode): void {
  if (metaNode.name || metaNode.targetId || metaNode.children.length > 0 || metaNode.fields.length > 0) {
    throw new Error('Top-level content after the first line must be indented. Root-level metadata can only be tags, checkbox, or fields.');
  }

  root.tags.push(...metaNode.tags);
  if (metaNode.checked !== null) {
    root.checked = metaNode.checked;
  }
}

function pushFieldContext(
  stack: ParseContext[],
  field: ParsedTanaPasteField,
  parentIndent: number,
): void {
  stack.push({
    kind: 'field',
    field,
    childIndent: parentIndent + 2,
  });
}

export function parseTanaPaste(text: string): ParsedTanaPasteNode {
  const normalized = text.replace(/\r\n?/g, '\n').trim();
  if (!normalized) {
    throw new Error('Empty Tana Paste text.');
  }

  const lines = normalized
    .split('\n')
    .filter((line) => line.trim().length > 0);

  const root = createEmptyRoot();
  const firstLine = lines[0] ?? '';
  const rootField = parseFieldLine(firstLine);
  if (rootField) {
    root.fields.push(rootField.field);
  } else {
    Object.assign(root, parseNodeLine(firstLine));
  }

  const stack: ParseContext[] = [
    {
      kind: 'node',
      node: root,
      childIndent: 2,
    },
  ];

  if (rootField?.opensValueBlock) {
    pushFieldContext(stack, rootField.field, 0);
  }

  for (const rawLine of lines.slice(1)) {
    const indent = countIndent(rawLine);
    const content = rawLine.slice(indent);

    if (indent === 0) {
      while (stack.length > 1) {
        stack.pop();
      }

      const fieldLine = parseFieldLine(content);
      if (fieldLine) {
        root.fields.push(fieldLine.field);
        if (fieldLine.opensValueBlock) {
          pushFieldContext(stack, fieldLine.field, 0);
        }
        continue;
      }

      mergeRootInlineMetadata(root, parseNodeLine(content));
      continue;
    }

    while (stack.length > 0 && stack[stack.length - 1]!.childIndent > indent) {
      stack.pop();
    }

    const context = stack[stack.length - 1];
    if (!context || context.childIndent !== indent) {
      throw new Error(`Invalid indentation at line: "${rawLine.trim()}". Use 2-space indentation.`);
    }

    if (context.kind === 'field') {
      context.field.values.push(parseFieldValueLine(content));
      context.field.clear = false;
      continue;
    }

    const fieldLine = parseFieldLine(content);
    if (fieldLine) {
      context.node.fields.push(fieldLine.field);
      if (fieldLine.opensValueBlock) {
        pushFieldContext(stack, fieldLine.field, indent);
      }
      continue;
    }

    const childNode = parseNodeLine(content);
    context.node.children.push(childNode);
    stack.push({
      kind: 'node',
      node: childNode,
      childIndent: indent + 2,
    });
  }

  return root;
}
