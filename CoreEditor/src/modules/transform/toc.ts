import { Slugger } from './slugger';
import { LineKind, classifyLines } from './segments';

/**
 * Table of contents generation.
 *
 * The list is built from the document's ATX headings, wrapped in HTML comment markers so it
 * can be regenerated in place instead of piling up duplicates — the markers are how "update"
 * and "no duplicate index" are kept true. Setext headings (underlined with === or ---) are
 * intentionally not collected: telling them apart from separators and tables by line rules is
 * unreliable, and a wrong guess would put a horizontal rule in the index. ATX covers the
 * overwhelming majority of documents and every AI-generated one.
 */

export interface TOCOptions {
  minLevel: number;
  maxLevel: number;
  ordered: boolean;
  title: string;
}

export interface TOCResult {
  text: string;
  /** Number of entries in the generated index. */
  count: number;
  mode: 'inserted' | 'updated' | 'none';
}

export const openMarker = '<!-- toc -->';
export const closeMarker = '<!-- /toc -->';

interface Heading {
  level: number;
  text: string;
}

const atxHeading = /^ {0,3}(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;

/**
 * Collect ATX headings, skipping anything inside code, frontmatter, or an existing TOC block.
 *
 * The existing block is skipped so regenerating never folds the index's own title back into
 * itself, and so it doesn't advance the slug counter for real headings.
 */
function collectHeadings(lines: { text: string; kind: LineKind }[], tocRange?: [number, number]): Heading[] {
  const headings: Heading[] = [];

  for (const [index, line] of lines.entries()) {
    if (line.kind !== LineKind.text) {
      continue;
    }

    if (tocRange !== undefined && index >= tocRange[0] && index <= tocRange[1]) {
      continue;
    }

    const match = atxHeading.exec(line.text);
    if (match !== null) {
      headings.push({ level: match[1].length, text: match[2].trim() });
    }
  }

  return headings;
}

/** Line indices of an existing TOC block (marker to marker), if the document has one. */
function findTOCBlock(lines: { text: string }[]): [number, number] | undefined {
  const open = lines.findIndex(line => line.text.trim() === openMarker);
  if (open === -1) {
    return undefined;
  }

  const close = lines.findIndex((line, index) => index > open && line.text.trim() === closeMarker);
  return close === -1 ? undefined : [open, close];
}

/**
 * Render the TOC block for the given headings.
 *
 * The slugger walks every heading in document order so its duplicate numbering matches the
 * preview, then only the ones within the level range are emitted. Indentation is relative to
 * the shallowest included heading, so a document of h2/h3 starts flush left.
 */
function renderBlock(headings: Heading[], options: TOCOptions): { block: string; count: number } {
  const slugger = new Slugger();
  const entries: { level: number; text: string; anchor: string }[] = [];

  for (const heading of headings) {
    const anchor = slugger.slug(heading.text);
    if (heading.level >= options.minLevel && heading.level <= options.maxLevel) {
      entries.push({ level: heading.level, text: heading.text, anchor });
    }
  }

  if (entries.length === 0) {
    return { block: '', count: 0 };
  }

  const base = Math.min(...entries.map(entry => entry.level));
  const lines = entries.map(entry => {
    const indent = '  '.repeat(entry.level - base);
    const bullet = options.ordered ? '1.' : '-';
    return `${indent}${bullet} [${escapeText(entry.text)}](#${entry.anchor})`;
  });

  const heading = options.title.trim() === '' ? [] : [`## ${options.title}`, ''];
  const block = [openMarker, ...heading, ...lines, closeMarker].join('\n');
  return { block, count: entries.length };
}

/** Link text is inline Markdown; only the characters that would break a link need escaping. */
function escapeText(value: string): string {
  return value.replace(/([[\]])/g, '\\$1');
}

/** End of a leading YAML frontmatter block, as a line index, or -1 if there is none. */
function frontMatterEnd(lines: { text: string; kind: LineKind }[]): number {
  if (lines.length === 0 || lines[0].kind !== LineKind.protected || lines[0].text.trim() !== '---') {
    return -1;
  }

  for (let index = 1; index < lines.length; ++index) {
    if (lines[index].text.trim() === '---') {
      return index;
    }
  }

  return -1;
}

/**
 * Build the document with its table of contents inserted or refreshed.
 *
 * If a TOC block already exists it is replaced where it sits. Otherwise the block goes near
 * the top: right after the title (the first h1) when there is one, else after the frontmatter,
 * else at the very start. Placement is fixed rather than cursor-based so the result is
 * predictable and the whole thing stays a pure function.
 */
export function buildTableOfContents(source: string, options: TOCOptions): TOCResult {
  const trailingNewline = source.endsWith('\n');
  const body = trailingNewline ? source.slice(0, -1) : source;
  const lines = classifyLines(body);

  const existing = findTOCBlock(lines);
  const headings = collectHeadings(lines, existing);
  const { block, count } = renderBlock(headings, options);

  if (count === 0) {
    return { text: source, count: 0, mode: 'none' };
  }

  const raw = lines.map(line => line.text);
  const restore = (result: string[]): string => {
    const joined = result.join('\n');
    return trailingNewline ? `${joined}\n` : joined;
  };

  if (existing !== undefined) {
    const updated = [...raw.slice(0, existing[0]), ...block.split('\n'), ...raw.slice(existing[1] + 1)];
    const text = restore(updated);
    return { text, count, mode: text === source ? 'none' : 'updated' };
  }

  const insertAt = insertionPoint(lines);
  const before = raw.slice(0, insertAt);
  const after = raw.slice(insertAt);

  // A single blank line separates the block from whatever sits above and below it.
  const withGaps = [
    ...before,
    ...(before.length > 0 && before[before.length - 1].trim() !== '' ? [''] : []),
    ...block.split('\n'),
    ...(after.length > 0 && after[0].trim() !== '' ? [''] : []),
    ...after,
  ];

  return { text: restore(withGaps), count, mode: 'inserted' };
}

/** The line index the new block is inserted before. */
function insertionPoint(lines: { text: string; kind: LineKind }[]): number {
  const firstH1 = lines.findIndex(line => line.kind === LineKind.text && /^ {0,3}#[ \t]/.test(line.text));
  if (firstH1 !== -1) {
    return firstH1 + 1;
  }

  const frontMatter = frontMatterEnd(lines);
  return frontMatter === -1 ? 0 : frontMatter + 1;
}
