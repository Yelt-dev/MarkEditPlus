import { EditorSelection } from '@codemirror/state';
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

/** Run a rule set over the source and report what each rule changed. */
export function runRules(source: string, rules: Rule[]): { text: string; summary: TransformSummary } {
  // A well-formed document ends with a newline, which `split` turns into a phantom empty
  // line. Dropping it keeps rules from reporting that artifact as a change; `finalNewline`
  // puts the terminator back at the end.
  const body = source.endsWith('\n') ? source.slice(0, -1) : source;

  let lines = classifyLines(body);
  const applied: RuleSummary[] = [];

  for (const rule of rules) {
    const outcome = rule.apply(lines);
    lines = outcome.lines;

    if (outcome.count > 0) {
      applied.push({ id: rule.id, count: outcome.count });
    }
  }

  const text = finalNewline(joinLines(lines));
  if (!source.endsWith('\n')) {
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

function perform(rules: Rule[], apply: boolean): string {
  const source = window.editor.state.doc.toString();
  const { text, summary } = runRules(source, rules);

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
