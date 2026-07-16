import { ClassifiedLine, LineKind, isEditable } from './segments';

/**
 * The deterministic rules behind Format Document.
 *
 * Every rule obeys the same contract:
 *
 * - it never changes meaning, only spelling of the syntax;
 * - it never touches code blocks or frontmatter (guaranteed by `isEditable`);
 * - it is idempotent, so running Format twice equals running it once.
 *
 * Where tidying up the syntax and preserving meaning pull in opposite directions, meaning
 * wins and the exception is commented at the rule. Each rule reports how many lines it
 * touched so the user can be shown a summary before anything is applied.
 */

export interface RuleOutcome {
  lines: ClassifiedLine[];
  /** How many lines this rule rewrote or removed, for the summary. */
  count: number;
}

export interface Rule {
  /** Stable id, also the localization key for the summary shown to the user. */
  id: string;
  apply: (lines: ClassifiedLine[]) => RuleOutcome;
}

/** Rewrite lines one by one, counting the ones that actually changed. */
function rewrite(
  lines: ClassifiedLine[],
  transform: (line: ClassifiedLine, index: number) => string,
): RuleOutcome {
  let count = 0;
  const result = lines.map((line, index) => {
    if (!isEditable(line)) {
      return line;
    }

    const text = transform(line, index);
    if (text === line.text) {
      return line;
    }

    ++count;
    return { ...line, text };
  });

  return { lines: result, count };
}

/** A thematic break: three or more *, - or _, optionally spaced out. */
const thematicBreak = /^ {0,3}((\*[ \t]*){3,}|(-[ \t]*){3,}|(_[ \t]*){3,})$/;

function isBlank(line: ClassifiedLine | undefined): boolean {
  return line === undefined || (isEditable(line) && line.text.trim() === '');
}

/**
 * Trailing whitespace is noise, except when it isn't: exactly two trailing spaces are a
 * hard line break. Stripping those would drop a `<br>`, so they are normalized to two
 * spaces instead of removed.
 */
export const trailingWhitespace: Rule = {
  id: 'trailing-whitespace',
  apply: lines => rewrite(lines, (line, index) => {
    if (!/[ \t]$/.test(line.text)) {
      return line.text;
    }

    const stripped = line.text.replace(/[ \t]+$/, '');
    const next = lines[index + 1] as ClassifiedLine | undefined;
    const isHardBreak = stripped !== ''
      && /  +$/.test(line.text)
      && next !== undefined
      && isEditable(next)
      && next.text.trim() !== '';

    return isHardBreak ? `${stripped}  ` : stripped;
  }),
};

/** Collapse runs of blank lines to a single one, and drop blank lines at the top. */
export const blankLines: Rule = {
  id: 'blank-lines',
  apply: lines => {
    const result: ClassifiedLine[] = [];

    for (const line of lines) {
      const blank = isBlank(line) && isEditable(line);
      if (!blank) {
        result.push(line);
        continue;
      }

      // Nothing but blanks so far: the document has no leading empty lines.
      if (result.length === 0) {
        continue;
      }

      if (!isBlank(result[result.length - 1]) || !isEditable(result[result.length - 1])) {
        result.push(line);
      }
    }

    // Trailing blanks are handled by `finalNewline`, which owns the end of the document.
    while (result.length > 0 && isBlank(result[result.length - 1]) && isEditable(result[result.length - 1])) {
      result.pop();
    }

    return { lines: result, count: lines.length - result.length };
  },
};

/**
 * `#Title` is a paragraph, not a heading — adding the space is what makes it one.
 *
 * That is a deliberate change of meaning and exactly what the rule is for, but it is only
 * safe where a heading could legitimately start: at the beginning of a block. Applying it to
 * a line in the middle of a paragraph would silently turn prose such as "#1 on the list"
 * into a heading, so a preceding blank line is required.
 */
export const headingSpace: Rule = {
  id: 'heading-space',
  apply: lines => rewrite(lines, (line, index) => {
    const match = /^( {0,3})(#{1,6})([^\s#].*)$/.exec(line.text);
    if (match === null || !isBlank(lines[index - 1])) {
      return line.text;
    }

    return `${match[1]}${match[2]} ${match[3]}`;
  }),
};

/** Unify bullet markers on `-`, leaving thematic breaks such as `* * *` alone. */
export const listMarkers: Rule = {
  id: 'list-markers',
  apply: lines => rewrite(lines, line => {
    if (thematicBreak.test(line.text)) {
      return line.text;
    }

    // A marker is only a bullet when whitespace follows it; `*emphasis*` must not match.
    return line.text.replace(/^(\s*)[*+](\s+)/, '$1-$2');
  }),
};

/** Normalize checkbox spelling: `[X]`/`[]` become `[x]`/`[ ]`, with a space after `]`. */
export const checklists: Rule = {
  id: 'checklists',
  apply: lines => rewrite(lines, line => {
    const match = /^(\s*[-*+]\s+)\[([ xX]?)\][ \t]*(.*)$/.exec(line.text);
    if (match === null) {
      return line.text;
    }

    const mark = match[2].toLowerCase() === 'x' ? 'x' : ' ';
    const content = match[3];

    // An empty task keeps no trailing space, otherwise the trailing-whitespace rule and this
    // one would disagree and the transform would stop being idempotent.
    return content === '' ? `${match[1]}[${mark}]` : `${match[1]}[${mark}] ${content}`;
  }),
};

/**
 * Unify fences on ``` and drop padding in the info string.
 *
 * A `~~~` block is only rewritten when its content has no backtick fence of its own, which
 * would otherwise terminate the block early and destroy the document.
 */
export const fences: Rule = {
  id: 'fences',
  apply: lines => {
    const result = [...lines];
    let count = 0;

    for (let index = 0; index < result.length; ++index) {
      if (result[index].kind !== LineKind.fenceOpen) {
        continue;
      }

      const end = result.findIndex((line, at) => at > index && line.kind === LineKind.fenceClose);
      const content = result.slice(index + 1, end === -1 ? result.length : end);
      if (content.some(line => /^ {0,3}```/.test(line.text))) {
        continue;
      }

      const open = /^( {0,3})(?:`{3,}|~{3,})(.*)$/.exec(result[index].text);
      if (open !== null) {
        const text = `${open[1]}\`\`\`${open[2].trim()}`;
        if (text !== result[index].text) {
          result[index] = { ...result[index], text };
          ++count;
        }
      }

      if (end !== -1) {
        const text = `${/^( {0,3})/.exec(result[end].text)?.[1] ?? ''}\`\`\``;
        if (text !== result[end].text) {
          result[end] = { ...result[end], text };
          ++count;
        }
      }
    }

    return { lines: result, count };
  },
};

/**
 * Unify thematic breaks on `---`.
 *
 * `---` directly under a paragraph is a Setext heading, not a break, so a rewrite is only
 * safe when the previous line is blank. Ignoring that would turn a horizontal rule into an
 * `<h2>` and swallow the line above it.
 */
export const separators: Rule = {
  id: 'separators',
  apply: lines => rewrite(lines, (line, index) => {
    if (!thematicBreak.test(line.text) || !isBlank(lines[index - 1])) {
      return line.text;
    }

    return '---';
  }),
};

/**
 * Ensure the document ends with exactly one newline.
 *
 * Only trailing newlines are collapsed, never trailing spaces: the last line may be inside a
 * code block, where whitespace is content. Blank lines at the end are `blankLines`' business.
 */
export function finalNewline(source: string): string {
  return `${source.replace(/\n+$/, '')}\n`;
}

// MARK: - Tables

const delimiterCell = /^:?-+:?$/;

/**
 * Split a table row into cells, honoring `\|` escapes and pipes inside inline code, both of
 * which are content rather than column separators.
 */
export function splitRow(text: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let inCode = false;

  const trimmed = text.trim();
  for (let index = 0; index < trimmed.length; ++index) {
    const char = trimmed[index];

    if (char === '\\' && trimmed[index + 1] === '|') {
      cell += '\\|';
      ++index;
      continue;
    }

    if (char === '`') {
      inCode = !inCode;
    }

    if (char === '|' && !inCode) {
      cells.push(cell);
      cell = '';
      continue;
    }

    cell += char;
  }

  cells.push(cell);

  // A leading and trailing pipe produce empty edge cells that are not columns.
  if (cells.length > 0 && cells[0].trim() === '' && trimmed.startsWith('|')) {
    cells.shift();
  }

  if (cells.length > 0 && cells[cells.length - 1].trim() === '' && trimmed.endsWith('|')) {
    cells.pop();
  }

  return cells.map(value => value.trim());
}

function isDelimiterRow(text: string): boolean {
  const cells = splitRow(text);
  return cells.length > 0 && cells.every(cell => delimiterCell.test(cell));
}

function looksLikeRow(line: ClassifiedLine | undefined): boolean {
  return line !== undefined && isEditable(line) && line.text.includes('|') && line.text.trim() !== '';
}

type Alignment = 'left' | 'center' | 'right' | 'none';

function alignmentOf(cell: string): Alignment {
  const left = cell.startsWith(':');
  const right = cell.endsWith(':');

  if (left && right) {
    return 'center';
  }

  return left ? 'left' : right ? 'right' : 'none';
}

function delimiterFor(alignment: Alignment, width: number): string {
  switch (alignment) {
    case 'center':
      return `:${'-'.repeat(Math.max(1, width - 2))}:`;
    case 'left':
      return `:${'-'.repeat(Math.max(1, width - 1))}`;
    case 'right':
      return `${'-'.repeat(Math.max(1, width - 1))}:`;
    case 'none':
      return '-'.repeat(Math.max(3, width));
  }
}

function pad(cell: string, width: number, alignment: Alignment): string {
  const room = Math.max(0, width - cell.length);
  if (alignment === 'right') {
    return `${' '.repeat(room)}${cell}`;
  }

  if (alignment === 'center') {
    const left = Math.floor(room / 2);
    return `${' '.repeat(left)}${cell}${' '.repeat(room - left)}`;
  }

  return `${cell}${' '.repeat(room)}`;
}

/**
 * Align pipe tables into even columns.
 *
 * Ragged rows are padded to the column count declared by the delimiter row rather than
 * dropped: losing a cell would lose content. Extra cells beyond the declared columns are
 * kept too, since Markdown renderers ignore them but the author may not mean to lose them.
 */
export const tables: Rule = {
  id: 'tables',
  apply: lines => {
    const result: ClassifiedLine[] = [];
    let count = 0;

    for (let index = 0; index < lines.length; ++index) {
      const header = lines[index];
      const delimiter = lines[index + 1] as ClassifiedLine | undefined;

      const isTable = looksLikeRow(header)
        && delimiter !== undefined
        && isEditable(delimiter)
        && isDelimiterRow(delimiter.text);

      if (!isTable) {
        result.push(header);
        continue;
      }

      let end = index + 2;
      while (looksLikeRow(lines[end])) {
        ++end;
      }

      const body = lines.slice(index + 2, end);
      const alignments = splitRow(delimiter.text).map(alignmentOf);
      const rows = [splitRow(header.text), ...body.map(line => splitRow(line.text))];
      const columns = Math.max(alignments.length, ...rows.map(row => row.length));

      const widths = Array.from({ length: columns }, (_, column) => Math.max(
        3,
        ...rows.map(row => (row[column] ?? '').length),
      ));

      const render = (cells: string[]) => `| ${Array.from(
        { length: columns },
        (_, column) => pad(cells[column] ?? '', widths[column], alignments[column] ?? 'none'),
      ).join(' | ')} |`;

      const rendered: ClassifiedLine[] = [
        { ...header, text: render(rows[0]) },
        {
          ...delimiter,
          text: `| ${Array.from(
            { length: columns },
            (_, column) => delimiterFor(alignments[column] ?? 'none', widths[column]),
          ).join(' | ')} |`,
        },
        ...rows.slice(1).map((row, offset) => ({ ...body[offset], text: render(row) })),
      ];

      const original = [header, delimiter, ...body];
      count += rendered.filter((line, at) => line.text !== original[at].text).length;
      result.push(...rendered);

      index = end - 1;
    }

    return { lines: result, count };
  },
};

/** Rules of Format Document, in the order they are applied. */
export const formatRules: Rule[] = [
  fences,
  headingSpace,
  listMarkers,
  checklists,
  separators,
  tables,
  trailingWhitespace,
  blankLines,
];
