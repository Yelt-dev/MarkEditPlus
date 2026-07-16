import { EditorSelection } from '@codemirror/state';
import { TextRule, cleanLineRules, cleanTextRules } from './cleanAI';
import { Rule, finalNewline, formatRules } from './rules';
import { classifyLines, joinLines } from './segments';

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
