import { describe, expect, test } from '@jest/globals';
import { cleanLineRules, cleanTextRules } from '../src/modules/transform/cleanAI';
import { runRules } from '../src/modules/transform';

function clean(source: string): string {
  return runRules(source, cleanLineRules, cleanTextRules).text;
}

function rulesApplied(source: string): string[] {
  return runRules(source, cleanLineRules, cleanTextRules).summary.rules.map(rule => rule.id);
}

describe('Transform: clean AI Markdown', () => {
  test('test the outer markdown fence is removed', () => {
    const source = '```markdown\n# Title\n\nBody.\n```\n';
    expect(clean(source)).toBe('# Title\n\nBody.\n');
  });

  test('test an unlabeled fence wrapping a document is removed', () => {
    const source = '```\n# Title\n\nBody.\n```\n';
    expect(clean(source)).toBe('# Title\n\nBody.\n');
  });

  test('test a document that is only a code block is never unwrapped', () => {
    // Unwrapping here would turn code into prose. Without a heading or table inside, an
    // unlabeled fence is indistinguishable from a legitimate code block.
    const source = '```\nconst x = 1;\nif (x) {}\n```\n';
    expect(clean(source)).toBe(source);
  });

  test('test a labeled code block is never unwrapped', () => {
    const source = '```python\n# Title\nprint(1)\n```\n';
    expect(clean(source)).toBe(source);
  });

  test('test two separate code blocks are not treated as a wrapper', () => {
    const source = '```\ncode a\n```\n\n# Heading\n\n```\ncode b\n```\n';
    expect(clean(source)).toBe(source);
  });

  test('test content inside the unwrapped document is revealed and formatted', () => {
    // A document holding code blocks gets wrapped in a longer fence, so the inner ``` do not
    // close it. Only once the wrapper is gone is the inner block recognized as code.
    const source = '````markdown\n#Title\n\n* one\n\n```python\ncode   \n```\n````\n';
    expect(clean(source)).toBe('# Title\n\n- one\n\n```python\ncode   \n```\n');
  });

  test('test an assistant lead-in is removed', () => {
    expect(clean('¡Claro! Aquí tienes el documento:\n\n# Title\n')).toBe('# Title\n');
    expect(clean("Sure! Here's the markdown:\n\n# Title\n")).toBe('# Title\n');
    expect(rulesApplied('Aquí tienes el documento:\n\n# Title\n')).toContain('preamble');
  });

  test('test ordinary prose ending in a colon is kept', () => {
    // Losing a real paragraph is far worse than leaving a lead-in behind.
    expect(clean('Requisitos:\n\n- uno\n')).toBe('Requisitos:\n\n- uno\n');
    expect(clean('El resultado fue el siguiente:\n\n- uno\n')).toBe('El resultado fue el siguiente:\n\n- uno\n');
  });

  test('test a lead-in that is the whole document is kept', () => {
    // With nothing after it, it is not packaging: it is the content.
    expect(clean('Aquí tienes el documento:\n')).toBe('Aquí tienes el documento:\n');
  });

  test('test a stray language tag is removed', () => {
    expect(clean('markdown\n# Title\n')).toBe('# Title\n');
    // A document that is just the word is content, not a tag.
    expect(clean('markdown\n')).toBe('markdown\n');
  });

  test('test an unclosed fence is closed at the end', () => {
    expect(clean('# Title\n\n```python\ncode\n')).toBe('# Title\n\n```python\ncode\n```\n');
    expect(rulesApplied('# Title\n\n```js\ncode\n')).toContain('unclosed-fence');
  });

  test('test duplicate separators collapse', () => {
    expect(clean('a\n\n---\n\n---\n\nb\n')).toBe('a\n\n---\n\nb\n');
    expect(clean('a\n\n---\n\nb\n\n---\n\nc\n')).toBe('a\n\n---\n\nb\n\n---\n\nc\n');
  });

  test('test the regular formatting rules still run', () => {
    const source = '```markdown\n#Title   \n\n\n* one\n+ two\n\n- [X] done\n```\n';
    expect(clean(source)).toBe('# Title\n\n- one\n- two\n\n- [x] done\n');
  });

  test('test cleaning twice produces the same result', () => {
    const source = "Sure! Here's the markdown:\n\n```markdown\n#Title   \n\n\n* one\n+ two\n\n---\n\n---\n\n| a | b |\n|---|---|\n| 1 |\n```\n";
    const once = clean(source);
    expect(clean(once)).toBe(once);
  });

  test('test prose is never rewritten', () => {
    const prose = '# Title\n\nEste párrafo se queda exactamente igual, con sus palabras.\n';
    expect(clean(prose)).toBe(prose);
  });

  test('test cleaning an already clean document changes nothing', () => {
    const source = '# Title\n\n- one\n- two\n';
    expect(runRules(source, cleanLineRules, cleanTextRules).summary.changed).toBe(false);
  });

  test('test frontmatter survives the cleanup', () => {
    const source = '---\ntitle: Something\n---\n\n# Body\n';
    expect(clean(source)).toBe(source);
  });
});
