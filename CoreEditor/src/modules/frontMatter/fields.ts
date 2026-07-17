/**
 * Reading and writing individual frontmatter fields (FRONTMATTER-001).
 *
 * This is line-based on purpose, not a YAML round-trip. Editing only the line of the field
 * being changed is what keeps every promise the spec makes: unknown fields, comments and
 * formatting the form doesn't manage are never touched, because they are never rewritten.
 * A full parse-and-serialize would drop comments and reorder keys.
 */

/** The fields the form manages, in display order. Anything else is preserved untouched. */
export const knownFields = [
  'title',
  'subtitle',
  'author',
  'date',
  'language',
  'description',
  'keywords',
  'template',
  'page_size',
  'orientation',
] as const;

export type FieldKey = (typeof knownFields)[number];

// A leading frontmatter block: --- on its own line, up to the next --- line.
const blockPattern = /^\uFEFF?(---[ \t]*\r?\n)([\s\S]*?)(\r?\n---[ \t]*)(\r?\n|$)/;

interface Block {
  before: string;
  open: string;
  body: string;
  close: string;
  after: string;
}

function parseBlock(source: string): Block | undefined {
  const match = blockPattern.exec(source);
  if (match === null) {
    return undefined;
  }

  return {
    before: source.slice(0, match.index),
    open: match[1],
    body: match[2],
    // The trailing newline after the closing --- belongs to the block, not the body after it.
    close: match[3] + match[4],
    after: source.slice(match.index + match[0].length),
  };
}

/** A `key: value` line at the top level of the block (not indented, not a comment). */
function fieldLine(line: string): { key: string; value: string } | undefined {
  const match = /^([A-Za-z0-9_-]+)[ \t]*:[ \t]*(.*)$/.exec(line);
  if (match === null) {
    return undefined;
  }

  return { key: match[1], value: match[2] };
}

/** Strip one layer of matching surrounding quotes from a scalar value. */
function unquote(value: string): string {
  const trimmed = value.trim();
  const match = /^"(.*)"$/.exec(trimmed) ?? /^'(.*)'$/.exec(trimmed);
  return match === null ? trimmed : match[1];
}

/** Quote a value only when YAML needs it (so simple values stay readable). */
function quoteIfNeeded(value: string): string {
  return /^[\s"'#&*!|>%@`]|[:#]\s|[:\s]$/.test(value) || value === '' ? JSON.stringify(value) : value;
}

export interface FrontMatterFields {
  /** Present frontmatter? Distinguishes "no block" from "block with empty fields". */
  present: boolean;
  values: Partial<Record<FieldKey, string>>;
  /** Keys in the block that the form does not manage; kept so the UI can note them. */
  unknownKeys: string[];
}

/** Read the managed fields (and note unknown keys) from a document's frontmatter. */
export function readFields(source: string): FrontMatterFields {
  const block = parseBlock(source);
  if (block === undefined) {
    return { present: false, values: {}, unknownKeys: [] };
  }

  const values: Partial<Record<FieldKey, string>> = {};
  const unknownKeys: string[] = [];
  const known = new Set<string>(knownFields);

  for (const line of block.body.split('\n')) {
    const field = fieldLine(line);
    if (field === undefined) {
      continue;
    }

    if (known.has(field.key)) {
      values[field.key as FieldKey] = unquote(field.value);
    } else {
      unknownKeys.push(field.key);
    }
  }

  return { present: true, values, unknownKeys };
}

/**
 * Set (or clear) one field, returning the new document.
 *
 * Updates the field's line in place, appends it if absent, or removes the line when the value
 * is emptied. Every other line — other fields, unknown keys, comments, blank lines — is left
 * exactly as it was. With no block and a non-empty value, a new block is created at the top.
 */
export function setField(source: string, key: FieldKey, value: string): string {
  const trimmed = value.trim();
  const block = parseBlock(source);

  if (block === undefined) {
    return trimmed === '' ? source : `---\n${key}: ${quoteIfNeeded(trimmed)}\n---\n\n${source}`;
  }

  const lines = block.body.split('\n');
  const index = lines.findIndex(line => fieldLine(line)?.key === key);

  if (index !== -1) {
    if (trimmed === '') {
      lines.splice(index, 1);
    } else {
      lines[index] = `${key}: ${quoteIfNeeded(trimmed)}`;
    }
  } else if (trimmed !== '') {
    lines.push(`${key}: ${quoteIfNeeded(trimmed)}`);
  }

  const body = lines.join('\n');
  return `${block.before}${block.open}${body}${block.close}${block.after}`;
}
