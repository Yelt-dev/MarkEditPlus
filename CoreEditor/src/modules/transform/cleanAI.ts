import { Rule, RuleOutcome, formatRules } from './rules';
import { ClassifiedLine, LineKind, classifyLines, isEditable, joinLines } from './segments';

/**
 * Cleanup for Markdown pasted out of an AI chat.
 *
 * These rules only remove packaging the assistant added around the document — an outer code
 * fence, a "here's the markdown:" lead-in — and then hand over to the regular formatting
 * rules. Nothing here rewrites, reflows, summarizes or translates prose: if a line is not a
 * recognizable artifact, it is content and it stays.
 *
 * The artifacts have to be dealt with before the document is classified, because removing an
 * outer fence changes what counts as code in everything it wrapped. That is why these are
 * text rules that run over the raw source, ahead of the line rules.
 */

export interface TextRule {
  id: string;
  apply: (source: string) => { text: string; count: number };
}

function firstIndex(lines: string[]): number {
  return lines.findIndex(line => line.trim() !== '');
}

function lastIndex(lines: string[]): number {
  for (let index = lines.length - 1; index >= 0; --index) {
    if (lines[index].trim() !== '') {
      return index;
    }
  }

  return -1;
}

/** Markdown block syntax that code is unlikely to contain: a heading or a table delimiter. */
const documentShape = /^ {0,3}#{1,6}\s|^\s*\|?\s*:?-{3,}:?\s*\|/;

/**
 * Drop a code fence wrapping the entire document.
 *
 * A fence tagged `markdown` is unambiguous. A bare fence is not: a document whose whole
 * content is one unlabeled code block looks exactly the same, and unwrapping that would turn
 * code into prose. So a bare fence is only removed when what it wraps clearly looks like a
 * document — it contains a heading or a table.
 */
export const outerFence: TextRule = {
  id: 'outer-fence',
  apply: source => {
    const lines = source.split('\n');
    const first = firstIndex(lines);
    const last = lastIndex(lines);

    if (first === -1 || last <= first) {
      return { text: source, count: 0 };
    }

    const open = /^ {0,3}(`{3,}|~{3,})[ \t]*(\w*)[ \t]*$/.exec(lines[first]);
    const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(lines[last]);
    if (open === null || open[1][0] !== close?.[1][0]) {
      return { text: source, count: 0 };
    }

    // The fence that opens the document must be the very one that closes it: the first close
    // has to land on the last line. Otherwise these are two unrelated code blocks with the
    // document between them, and unwrapping would tear it apart.
    const classified = classifyLines(source);
    const closesAt = classified.findIndex((line, index) => index > first && line.kind === LineKind.fenceClose);
    if (classified[first].kind !== LineKind.fenceOpen || closesAt !== last) {
      return { text: source, count: 0 };
    }

    const language = open[2].toLowerCase();
    const body = lines.slice(first + 1, last);
    const wraps = language === 'markdown' || language === 'md'
      || (language === '' && body.some(line => documentShape.test(line)));

    if (!wraps) {
      return { text: source, count: 0 };
    }

    return { text: [...lines.slice(0, first), ...body, ...lines.slice(last + 1)].join('\n'), count: 2 };
  },
};

// Lead-ins such as "Sure! Here's the Markdown:" or "Aquí tienes el documento:". The line has
// to open the document, be short, announce itself with one of these verbs and end in a colon.
// A real paragraph rarely does all four at once, and prose is never worth losing to a guess.
const leadIn = /^\s*[¡!]?\s*(claro|por supuesto|perfecto|sure|certainly|of course)?[!.,]?\s*(aquí (tienes|está|va)|te dejo|here'?s|here is|this is|below is)\b[^\n]{0,100}:\s*$/i;

/** Remove an assistant's introduction line, if the document opens with one. */
export const preamble: TextRule = {
  id: 'preamble',
  apply: source => {
    const lines = source.split('\n');
    const first = firstIndex(lines);

    if (first === -1 || !leadIn.test(lines[first])) {
      return { text: source, count: 0 };
    }

    // Never leave the document empty: if the lead-in is all there is, it is the content.
    if (lastIndex(lines) === first) {
      return { text: source, count: 0 };
    }

    return { text: [...lines.slice(0, first), ...lines.slice(first + 1)].join('\n'), count: 1 };
  },
};

/** A stray `markdown` language tag left behind as plain text at the top of the document. */
export const strayLanguageTag: TextRule = {
  id: 'stray-language-tag',
  apply: source => {
    const lines = source.split('\n');
    const first = firstIndex(lines);

    if (first === -1 || !/^\s*(markdown|md)\s*$/i.test(lines[first]) || lastIndex(lines) === first) {
      return { text: source, count: 0 };
    }

    return { text: [...lines.slice(0, first), ...lines.slice(first + 1)].join('\n'), count: 1 };
  },
};

/**
 * Close a code fence that was never closed.
 *
 * Everything after an unterminated fence renders as code, so the document is truncated from
 * that point on. Closing it at the end is the least destructive repair: no content moves.
 */
export const unclosedFence: TextRule = {
  id: 'unclosed-fence',
  apply: source => {
    const classified = classifyLines(source);
    const open = classified.findLastIndex(line => line.kind === LineKind.fenceOpen);
    if (open === -1) {
      return { text: source, count: 0 };
    }

    const closed = classified.findIndex((line, index) => index > open && line.kind === LineKind.fenceClose);
    if (closed !== -1) {
      return { text: source, count: 0 };
    }

    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(classified[open].text)?.[1] ?? '```';
    return { text: `${source.replace(/\n+$/, '')}\n${marker}\n`, count: 1 };
  },
};

/** Collapse thematic breaks that repeat with nothing but blank lines between them. */
export const duplicateSeparators: Rule = {
  id: 'duplicate-separators',
  apply: lines => {
    const result: ClassifiedLine[] = [];
    let count = 0;

    for (const line of lines) {
      const isSeparator = isEditable(line) && /^ {0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(line.text);
      if (!isSeparator) {
        result.push(line);
        continue;
      }

      // Look back past blank lines for another separator; if there is one, this is a repeat.
      let previous = result.length - 1;
      while (previous >= 0 && isEditable(result[previous]) && result[previous].text.trim() === '') {
        --previous;
      }

      const repeats = previous >= 0
        && isEditable(result[previous])
        && /^ {0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(result[previous].text);

      if (repeats) {
        ++count;
      } else {
        result.push(line);
      }
    }

    return { lines: result, count } satisfies RuleOutcome;
  },
};

/** Artifacts stripped from the raw source, before the document is classified. */
export const cleanTextRules: TextRule[] = [preamble, strayLanguageTag, outerFence, unclosedFence];

/** Line rules for the cleanup: the AI-specific one, then the regular formatting rules. */
export const cleanLineRules: Rule[] = [duplicateSeparators, ...formatRules];

export { joinLines };
