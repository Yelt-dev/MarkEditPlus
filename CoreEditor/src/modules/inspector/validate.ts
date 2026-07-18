import { EditorState } from '@codemirror/state';
import { getNodesNamed } from '../lezer';
import { LineKind, classifyLines } from '../transform/segments';
import { buildOutline } from '../outline/model';
import { HeadingInfo } from '../toc';
import { getReferenceLinkLabels } from '../link';

/**
 * Structural validation for the inspector (INSPECTOR-002).
 *
 * Every check is read-only and reports a finding with a severity, a message and — where it can
 * be pinned down — a document position so the panel can jump to it. Nothing here rewrites the
 * document. Checks reuse machinery already in the codebase: heading extraction and the level-
 * skip detection from the outline, and the line classifier from the transforms.
 *
 * Checks that would need filesystem access (does an image file actually exist on disk?) are
 * deliberately NOT done here: reading the document's folder can trigger a macOS security-scope
 * permission prompt, and the inspector re-runs on every edit. Everything below is pure and
 * synchronous — it validates only what the text itself can tell us.
 *
 * Still tracked for a later pass: inconsistent list indentation.
 */

export type Severity = 'info' | 'warning' | 'error';

export interface Finding {
  severity: Severity;
  message: string;
  /** Document offset to navigate to, when the problem has a location. */
  from?: number;
  /** 1-based line number, for display. */
  line?: number;
}

const headingNodes = [1, 2, 3, 4, 5, 6].flatMap(level => [`ATXHeading${level}`, `SetextHeading${level}`]);

interface Heading {
  level: number;
  from: number;
  text: string;
}

function extractHeadings(state: EditorState): Heading[] {
  return getNodesNamed(state, headingNodes).map(node => {
    const level = Number(/Heading([1-6])/.exec(node.name)?.[1] ?? 1);
    const raw = state.sliceDoc(node.from, node.to);
    const text = node.name.startsWith('Setext')
      ? raw.split('\n')[0].trim()
      : raw.replace(/^\s{0,3}#+\s*/, '').replace(/\s+#+\s*$/, '').trim();
    return { level, from: node.from, text };
  });
}

export function validateDocument(state: EditorState): Finding[] {
  const findings: Finding[] = [];
  const lineOf = (from: number) => state.doc.lineAt(from).number;

  validateHeadings(state, findings, lineOf);
  validateImagesAndLinks(state, findings, lineOf);
  validateTables(state, findings);
  validateReferences(state, findings);
  validateFrontMatter(state, findings);
  validateWhitespace(state, findings);

  return findings;
}

/** Image extensions the preview/export can actually render. */
const supportedImageExtensions = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'tiff', 'tif', 'heic', 'heif', 'avif', 'ico',
]);

/** Reference labels are case-insensitive and collapse internal whitespace (CommonMark). */
function normalizeLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ');
}

function validateHeadings(state: EditorState, findings: Finding[], lineOf: (from: number) => number): void {
  const headings = extractHeadings(state);
  const h1s = headings.filter(heading => heading.level === 1);

  if (headings.length > 0 && h1s.length === 0) {
    findings.push({ severity: 'info', message: 'El documento no tiene un encabezado H1.' });
  }

  if (h1s.length > 1) {
    findings.push({
      severity: 'warning',
      message: `El documento tiene ${h1s.length} encabezados H1; se recomienda uno solo.`,
      from: h1s[1].from,
      line: lineOf(h1s[1].from),
    });
  }

  for (const heading of headings) {
    if (heading.text === '') {
      findings.push({
        severity: 'warning',
        message: `Encabezado H${heading.level} vacío.`,
        from: heading.from,
        line: lineOf(heading.from),
      });
    }
  }

  // Reuse the outline's level-skip detection so both surfaces agree.
  const infos: HeadingInfo[] = headings.map(heading => ({
    title: heading.text,
    level: heading.level as CodeGen_Int,
    from: heading.from as CodeGen_Int,
    to: heading.from as CodeGen_Int,
    selected: false,
  }));

  for (const item of buildOutline(infos)) {
    if (item.warning !== undefined) {
      findings.push({
        severity: 'warning',
        message: item.warning,
        from: item.heading.from,
        line: lineOf(item.heading.from),
      });
    }
  }
}

function validateImagesAndLinks(state: EditorState, findings: Finding[], lineOf: (from: number) => number): void {
  for (const node of getNodesNamed(state, ['Image'])) {
    const raw = state.sliceDoc(node.from, node.to);
    const alt = /^!\[([^\]]*)\]/.exec(raw)?.[1] ?? '';
    if (alt.trim() === '') {
      findings.push({
        severity: 'warning',
        message: 'Imagen sin texto alternativo (alt).',
        from: node.from,
        line: lineOf(node.from),
      });
    }

    // Unsupported format: pure string check, no filesystem access (see the file header).
    // Only local inline images have a checkable extension; remote/data/reference images are skipped.
    const url = /\]\(\s*<?([^)\s>]+)>?/.exec(raw)?.[1] ?? '';
    const isLocal = url !== '' && !/^(https?:|data:|blob:|image-loader:|#)/i.test(url);
    if (isLocal) {
      const ext = (/\.([a-z0-9]+)$/i.exec(url.split(/[?#]/)[0])?.[1] ?? '').toLowerCase();
      if (ext !== '' && !supportedImageExtensions.has(ext)) {
        findings.push({
          severity: 'warning',
          message: `Formato de imagen posiblemente no soportado (.${ext}).`,
          from: node.from,
          line: lineOf(node.from),
        });
      }
    }
  }

  for (const node of getNodesNamed(state, ['Link'])) {
    const raw = state.sliceDoc(node.from, node.to);
    const text = /^\[([^\]]*)\]/.exec(raw)?.[1] ?? '';
    const target = /\]\(([^)]*)\)/.exec(raw)?.[1] ?? '';
    if (text.trim() === '' || target.trim() === '') {
      findings.push({
        severity: 'warning',
        message: text.trim() === '' ? 'Enlace sin texto.' : 'Enlace sin destino.',
        from: node.from,
        line: lineOf(node.from),
      });
    }
  }
}

/** Count the cells of a GFM table row, honoring escaped pipes and optional edge pipes. */
function countCells(row: string): number {
  const cells: string[] = [];
  let cell = '';
  const trimmed = row.trim();
  for (let index = 0; index < trimmed.length; index++) {
    const char = trimmed[index];
    if (char === '\\' && index + 1 < trimmed.length) {
      cell += char + trimmed[index + 1];
      index++;
    } else if (char === '|') {
      cells.push(cell);
      cell = '';
    } else {
      cell += char;
    }
  }
  cells.push(cell);

  // A leading/trailing pipe produces one empty edge cell that isn't a real column.
  if (cells.length > 1 && cells[0].trim() === '') {
    cells.shift();
  }
  if (cells.length > 1 && cells[cells.length - 1].trim() === '') {
    cells.pop();
  }

  return cells.length;
}

/** Flag GFM table rows whose column count doesn't match the delimiter row. */
function validateTables(state: EditorState, findings: Finding[]): void {
  for (const node of getNodesNamed(state, ['Table'])) {
    const headerLine = state.doc.lineAt(node.from).number;
    const lastLine = state.doc.lineAt(Math.min(node.to, state.doc.length)).number;
    if (lastLine - headerLine < 1) {
      continue; // needs at least a header and a delimiter row
    }

    const expected = countCells(state.doc.line(headerLine + 1).text);
    if (expected === 0) {
      continue;
    }

    for (let number = headerLine; number <= lastLine; number++) {
      if (number === headerLine + 1) {
        continue; // the delimiter row is the reference, don't compare it to itself
      }

      const line = state.doc.line(number);
      if (line.text.trim() === '') {
        continue;
      }

      const cells = countCells(line.text);
      if (cells !== expected) {
        findings.push({
          severity: 'warning',
          message: `Fila de tabla con ${cells} celda(s); se esperaban ${expected}.`,
          from: line.from,
          line: number,
        });
      }
    }
  }
}

/**
 * Flag reference-style links whose label has no matching definition.
 *
 * Only the unambiguous full `[text][label]` and collapsed `[text][]` forms are checked; the
 * shortcut `[label]` form is skipped because `[foo]` is far too easily ordinary bracketed text
 * to flag without false positives. Inline code and fenced code are excluded.
 */
function validateReferences(state: EditorState, findings: Finding[]): void {
  const defined = new Set(getReferenceLinkLabels(state).map(normalizeLabel));
  const lines = classifyLines(state.doc.toString());
  const referencePattern = /\[([^\]]*)\]\[([^\]]*)\]/g;

  lines.forEach((line, index) => {
    if (line.kind !== LineKind.text) {
      return;
    }

    // Blank out inline code spans while preserving offsets, so `[a][b]` inside code isn't flagged.
    const scannable = line.text.replace(/`[^`]*`/g, match => ' '.repeat(match.length));
    referencePattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = referencePattern.exec(scannable)) !== null) {
      const label = match[2].trim() !== '' ? match[2] : match[1];
      if (label.trim() === '' || defined.has(normalizeLabel(label))) {
        continue;
      }

      findings.push({
        severity: 'warning',
        message: `Referencia no definida: [${label.trim()}].`,
        from: state.doc.line(index + 1).from + match.index,
        line: index + 1,
      });
    }
  });
}

/**
 * Flag a malformed leading YAML frontmatter block.
 *
 * To avoid flagging a plain `---` thematic break at the top of a document, this only treats the
 * document as having frontmatter when the line right after the opening `---` looks like a
 * `key: value` pair or a comment. Then: an unclosed block is an error, and any non `key: value`
 * body line is a warning. Uses LF offsets since `doc.toString()` is always LF internally.
 */
function validateFrontMatter(state: EditorState, findings: Finding[]): void {
  const lines = state.doc.toString().split('\n');
  if (lines.length === 0 || !/^---[ \t]*$/.test(lines[0])) {
    return;
  }

  const firstBody = lines[1] ?? '';
  const looksLikeFrontMatter = /^[A-Za-z0-9_-]+[ \t]*:/.test(firstBody) || /^\s*#/.test(firstBody);
  if (!looksLikeFrontMatter) {
    return; // most likely a thematic break, not frontmatter
  }

  let close = -1;
  for (let index = 1; index < lines.length; index++) {
    if (/^---[ \t]*$/.test(lines[index])) {
      close = index;
      break;
    }
  }

  if (close === -1) {
    findings.push({
      severity: 'error',
      message: 'Frontmatter sin cerrar (falta la línea «---» de cierre).',
      from: 0,
      line: 1,
    });
    return;
  }

  for (let index = 1; index < close; index++) {
    const raw = lines[index];
    if (raw.trim() === '' || /^\s*#/.test(raw) || /^\s+/.test(raw)) {
      continue; // blank, comment, or an indented continuation/nested value
    }

    if (!/^[A-Za-z0-9_-]+[ \t]*:/.test(raw)) {
      findings.push({
        severity: 'warning',
        message: 'Línea de frontmatter que no es «clave: valor».',
        from: state.doc.line(index + 1).from,
        line: index + 1,
      });
    }
  }
}

function validateWhitespace(state: EditorState, findings: Finding[]): void {
  const source = state.doc.toString();
  const lines = classifyLines(source);

  // An unclosed fence: more openings than closings leaves code running to the end of file.
  const opens = lines.filter(line => line.kind === LineKind.fenceOpen).length;
  const closes = lines.filter(line => line.kind === LineKind.fenceClose).length;
  if (opens > closes) {
    const lastOpen = lines.map(line => line.kind).lastIndexOf(LineKind.fenceOpen);
    findings.push({
      severity: 'error',
      message: 'Bloque de código sin cerrar.',
      from: state.doc.line(lastOpen + 1).from,
      line: lastOpen + 1,
    });
  }

  const trailing = lines.findIndex(line => line.kind === LineKind.text && /[ \t]+$/.test(line.text));
  if (trailing !== -1) {
    const count = lines.filter(line => line.kind === LineKind.text && /[ \t]+$/.test(line.text)).length;
    findings.push({
      severity: 'info',
      message: count === 1 ? 'Una línea con espacios al final.' : `${count} líneas con espacios al final.`,
      from: state.doc.line(trailing + 1).from,
      line: trailing + 1,
    });
  }

  if (source.length > 0 && !source.endsWith('\n')) {
    findings.push({ severity: 'info', message: 'Falta la nueva línea final.' });
  }
}
