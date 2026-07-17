import { EditorState } from '@codemirror/state';
import { getNodesNamed } from '../lezer';

/**
 * Document metrics for the inspector (INSPECTOR-001).
 *
 * Text counts (words, characters, lines, size, reading time) are pure functions over the
 * source string. Structural counts (headings, links, images, tables, code blocks, paragraphs)
 * come from the editor's own syntax tree via getNodesNamed, so they match exactly what the
 * editor parses — GFM tables included — rather than a second, drifting parser.
 */

export interface Metrics {
  words: number;
  characters: number;
  charactersNoSpaces: number;
  lines: number;
  paragraphs: number;
  headings: number;
  links: number;
  images: number;
  tables: number;
  codeBlocks: number;
  /** Bytes of the UTF-8 encoded document. */
  bytes: number;
  /** Estimated reading time in whole minutes (0 means under a minute). */
  readingMinutes: number;
}

const headingNodes = [1, 2, 3, 4, 5, 6].flatMap(level => [`ATXHeading${level}`, `SetextHeading${level}`]);
const wordsPerMinute = 220;

// A "word" is a run of letters/numbers, allowing internal apostrophes and hyphens. This is
// deterministic and language-neutral enough for a reading estimate; it is not NLP tokenization.
const wordPattern = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

export function countWords(text: string): number {
  return text.match(wordPattern)?.length ?? 0;
}

/** Whole minutes, rounded; 0 when the document reads in under a minute. */
export function readingMinutes(words: number): number {
  return Math.round(words / wordsPerMinute);
}

/** UTF-8 byte length, computed directly so it needs no TextEncoder (absent under jsdom). */
export function utf8Bytes(text: string): number {
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }

  return bytes;
}

export function computeMetrics(state: EditorState): Metrics {
  const text = state.doc.toString();
  const words = countWords(text);

  return {
    words,
    characters: [...text].length,
    charactersNoSpaces: [...text.replace(/\s/gu, '')].length,
    lines: state.doc.lines,
    paragraphs: getNodesNamed(state, ['Paragraph']).length,
    headings: getNodesNamed(state, headingNodes).length,
    links: getNodesNamed(state, ['Link']).length,
    images: getNodesNamed(state, ['Image']).length,
    tables: getNodesNamed(state, ['Table']).length,
    codeBlocks: getNodesNamed(state, ['FencedCode', 'CodeBlock']).length,
    bytes: utf8Bytes(text),
    readingMinutes: readingMinutes(words),
  };
}
