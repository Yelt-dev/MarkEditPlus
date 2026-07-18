import { EditorSelection } from '@codemirror/state';
import { TextRule, cleanLineRules, cleanTextRules } from './cleanAI';
import { Rule, finalNewline, formatRules } from './rules';
import { classifyLines, joinLines } from './segments';
import { TOCOptions, buildTableOfContents } from './toc';

// The heading of the generated index. It is document content, not UI, so it is not localized
// to the system language; the app writes in Spanish. Users can edit it in their document.
const tocTitle = 'Tabla de contenido';

/**
 * Deterministic document transforms.
 *
 * The native side drives these in two steps: it asks for a summary, shows it, and only
 * applies the result if the user confirms. Both steps recompute from the same rules over the
 * same document, which is safe precisely because the rules are deterministic — there is no
 * pending state to keep in sync between the two calls.
 */

export interface RuleSummary {
  id: string;
  count: number;
}

export interface TransformSummary {
  changed: boolean;
  /** Only the rules that actually did something, so the user sees what was applied. */
  rules: RuleSummary[];
}

/**
 * Run a transform over the source and report what each rule changed.
 *
 * Text rules run first, over the raw source: they remove packaging that would otherwise be
 * misread once the document is classified — an outer fence makes everything it wraps look
 * like code. Line rules run afterwards, on the classified result.
 */
export function runRules(
  source: string,
  rules: Rule[],
  textRules: TextRule[] = [],
): { text: string; summary: TransformSummary } {
  const applied: RuleSummary[] = [];
  let current = source;

  for (const rule of textRules) {
    const outcome = rule.apply(current);
    current = outcome.text;

    if (outcome.count > 0) {
      applied.push({ id: rule.id, count: outcome.count });
    }
  }

  // A well-formed document ends with a newline, which `split` turns into a phantom empty
  // line. Dropping it keeps rules from reporting that artifact as a change; `finalNewline`
  // puts the terminator back at the end.
  const body = current.endsWith('\n') ? current.slice(0, -1) : current;

  let lines = classifyLines(body);

  for (const rule of rules) {
    const outcome = rule.apply(lines);
    lines = outcome.lines;

    if (outcome.count > 0) {
      applied.push({ id: rule.id, count: outcome.count });
    }
  }

  const text = finalNewline(joinLines(lines));
  if (!current.endsWith('\n')) {
    applied.push({ id: 'final-newline', count: 1 });
  }

  return { text, summary: { changed: text !== source, rules: applied } };
}

/**
 * Replace the whole document in a single transaction.
 *
 * One transaction is what makes the whole transform undoable with a single Cmd-Z.
 * The cursor is clamped rather than mapped: formatting can delete the very position it sat on.
 */
function replaceDocument(text: string): void {
  const editor = window.editor;
  const state = editor.state;
  const head = Math.min(state.selection.main.head, text.length);

  editor.dispatch({
    changes: { from: 0, to: state.doc.length, insert: text },
    selection: EditorSelection.cursor(head),
  });
}

function perform(rules: Rule[], apply: boolean, textRules: TextRule[] = []): string {
  const source = window.editor.state.doc.toString();
  const { text, summary } = runRules(source, rules, textRules);

  if (apply && summary.changed) {
    replaceDocument(text);
  }

  return JSON.stringify(summary);
}

/**
 * Format Document: called with `apply: false` to preview the summary, then with
 * `apply: true` to commit.
 */
export function formatDocument(apply: boolean): string {
  return perform(formatRules, apply);
}

/**
 * Clean up Markdown pasted out of an AI chat: strip the packaging the assistant wrapped it
 * in, then format it. Entirely offline and rule-based — no model is involved, and no prose
 * is rewritten.
 */
export function cleanMarkdown(apply: boolean): string {
  return perform(cleanLineRules, apply, cleanTextRules);
}

/**
 * Export a normalized copy of the document as Markdown (EXPORT-004).
 *
 * Runs the exact same rules as Format Document but never touches the editor — the native side
 * saves the returned string to a new file, leaving the original untouched. Reusing `runRules`
 * (not `perform`) is what keeps the output identical to what formatting would produce.
 */
export function getFormattedMarkdown(): string {
  return runRules(window.editor.state.doc.toString(), formatRules).text;
}

// A TOC covering h2–h6 fits the common shape: h1 is the document title, and the index lists
// the sections beneath it. h1 is still slugged (see toc.ts) so its anchors don't drift.
const tocOptions: TOCOptions = {
  minLevel: 2,
  maxLevel: 6,
  ordered: false,
  title: tocTitle,
};

/**
 * Merge caller-supplied options (from the native config dialog) over the defaults.
 *
 * The argument is a JSON string so it can cross the `evaluateJavaScript` boundary; anything
 * missing or malformed falls back to the default, so a bad payload can never break generation.
 */
function resolveTOCOptions(optionsJSON?: string): TOCOptions {
  if (optionsJSON === undefined || optionsJSON === '') {
    return tocOptions;
  }

  try {
    const raw = JSON.parse(optionsJSON) as Partial<TOCOptions>;
    const clampLevel = (value: unknown, fallback: number) =>
      typeof value === 'number' && Number.isFinite(value) ? Math.min(6, Math.max(1, Math.round(value))) : fallback;

    const minLevel = clampLevel(raw.minLevel, tocOptions.minLevel);
    const maxLevel = Math.max(minLevel, clampLevel(raw.maxLevel, tocOptions.maxLevel));
    return {
      minLevel,
      maxLevel,
      ordered: typeof raw.ordered === 'boolean' ? raw.ordered : tocOptions.ordered,
      title: typeof raw.title === 'string' ? raw.title : tocOptions.title,
    };
  } catch {
    return tocOptions;
  }
}

/**
 * Generate (or refresh) the table of contents. Unlike the rule-based transforms this builds
 * the new document directly, then commits it in one transaction so undo stays a single step.
 *
 * `optionsJSON` (optional) carries the choices from the native config dialog; omitted, the
 * defaults apply so existing callers keep working unchanged.
 */
export function generateTableOfContents(apply: boolean, optionsJSON?: string): string {
  const source = window.editor.state.doc.toString();
  const { text, count, mode } = buildTableOfContents(source, resolveTOCOptions(optionsJSON));

  const changed = mode !== 'none' && text !== source;
  if (apply && changed) {
    replaceDocument(text);
  }

  const rules = changed ? [{ id: `toc-${mode}`, count }] : [];
  return JSON.stringify({ changed, rules } satisfies TransformSummary);
}
