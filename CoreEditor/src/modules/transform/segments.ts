/**
 * Line classification for deterministic transforms.
 *
 * Transform rules must never touch code, nor rewrite the YAML frontmatter, which is not
 * Markdown at all. Rather than have each rule re-discover that, the document is classified
 * once into lines that may be rewritten and lines that are off limits.
 */

export enum LineKind {
  /** Regular Markdown; rules may rewrite it. */
  text = 'text',
  /** Inside a fenced code block, or a `---` frontmatter block: never rewritten. */
  protected = 'protected',
  /** The opening ``` / ~~~ line: only the fence rule may rewrite it. */
  fenceOpen = 'fence-open',
  /** The closing fence line: only the fence rule may rewrite it. */
  fenceClose = 'fence-close',
}

export interface ClassifiedLine {
  text: string;
  kind: LineKind;
}

// Up to three leading spaces still opens a fence; four would make it an indented code block.
const fencePattern = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const frontMatterFence = /^---[ \t]*$/;

/**
 * Split the source into lines tagged with what a rule is allowed to do to them.
 *
 * An unterminated fence keeps its content protected through the end of the document: a rule
 * must not "fix" text it cannot prove is prose. Closing such a fence is the job of the
 * AI-cleanup transform, which is explicitly allowed to do it.
 */
export function classifyLines(source: string): ClassifiedLine[] {
  const lines = source.split('\n');
  const result: ClassifiedLine[] = [];

  let fenceMarker: string | undefined;
  let inFrontMatter = false;

  for (const [index, text] of lines.entries()) {
    // Frontmatter only counts when it opens the very first line of the document.
    if (index === 0 && frontMatterFence.test(text)) {
      inFrontMatter = true;
      result.push({ text, kind: LineKind.protected });
      continue;
    }

    if (inFrontMatter) {
      if (frontMatterFence.test(text)) {
        inFrontMatter = false;
      }

      result.push({ text, kind: LineKind.protected });
      continue;
    }

    const fence = fencePattern.exec(text);

    if (fenceMarker === undefined) {
      if (fence !== null) {
        fenceMarker = fence[1][0].repeat(3);
        result.push({ text, kind: LineKind.fenceOpen });
      } else {
        result.push({ text, kind: LineKind.text });
      }

      continue;
    }

    // A fence is closed only by the same character it was opened with, and an info string
    // is not allowed on a closing fence.
    const closes = fence !== null && fence[1][0] === fenceMarker[0] && fence[2].trim() === '';
    if (closes) {
      fenceMarker = undefined;
      result.push({ text, kind: LineKind.fenceClose });
    } else {
      result.push({ text, kind: LineKind.protected });
    }
  }

  return result;
}

/** Whether a rule that rewrites prose may touch this line. */
export function isEditable(line: ClassifiedLine): boolean {
  return line.kind === LineKind.text;
}

export function joinLines(lines: ClassifiedLine[]): string {
  return lines.map(line => line.text).join('\n');
}
