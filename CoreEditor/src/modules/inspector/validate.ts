import { EditorState } from '@codemirror/state';
import { getNodesNamed } from '../lezer';
import { LineKind, classifyLines } from '../transform/segments';
import { buildOutline } from '../outline/model';
import { HeadingInfo } from '../toc';

/**
 * Structural validation for the inspector (INSPECTOR-002).
 *
 * Every check is read-only and reports a finding with a severity, a message and — where it can
 * be pinned down — a document position so the panel can jump to it. Nothing here rewrites the
 * document. Checks reuse machinery already in the codebase: heading extraction and the level-
 * skip detection from the outline, and the line classifier from the transforms.
 *
 * Deliberately left out for now (less reliable or needing I/O, tracked for a later pass):
 * undefined link references, missing image files, inconsistent tables, inconsistent list
 * indentation, and invalid YAML frontmatter.
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
  validateWhitespace(state, findings);

  return findings;
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
