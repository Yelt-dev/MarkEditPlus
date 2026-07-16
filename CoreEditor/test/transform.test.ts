import { describe, expect, test } from '@jest/globals';
import { formatRules } from '../src/modules/transform/rules';
import { runRules } from '../src/modules/transform';

function format(source: string): string {
  return runRules(source, formatRules).text;
}

function rulesApplied(source: string): string[] {
  return runRules(source, formatRules).summary.rules.map(rule => rule.id);
}

describe('Transform: format document', () => {
  test('test running the format twice produces the same result', () => {
    const messy = [
      '#Title   ',
      '',
      '',
      '',
      '* one',
      '+ two',
      '',
      '***',
      '',
      '| a | bbbb |',
      '|---|:-:|',
      '| 1 | 2 |',
      '',
      '- [X] done',
      '- [] todo',
    ].join('\n');

    const once = format(messy);
    expect(format(once)).toBe(once);
  });

  test('test the summary reports only the rules that changed something', () => {
    expect(rulesApplied('# Clean\n')).toEqual([]);
    expect(rulesApplied('# Messy   \n')).toEqual(['trailing-whitespace']);
    expect(rulesApplied('* a\n')).toEqual(['list-markers']);
  });

  test('test code blocks are never rewritten', () => {
    const source = [
      '# Title',
      '',
      '```python',
      '# not a heading   ',
      '* not a list',
      '',
      '',
      '',
      'x   = 1',
      '```',
      '',
    ].join('\n');

    expect(format(source)).toBe(source);
  });

  test('test an unterminated fence protects the rest of the document', () => {
    const source = '```\n* not a list   \n';
    expect(format(source)).toBe('```\n* not a list   \n');
  });

  test('test frontmatter is left untouched', () => {
    const source = ['---', 'title:   Something', 'tags: [a,b]', '---', '', '# Body', ''].join('\n');
    expect(format(source)).toBe(source);
  });

  test('test trailing whitespace is removed but hard line breaks survive', () => {
    // Two trailing spaces are a <br>; removing them would change the rendered output.
    expect(format('a  \nb\n')).toBe('a  \nb\n');
    expect(format('a   \nb\n')).toBe('a  \nb\n');
    // Not a hard break: nothing follows it.
    expect(format('a  \n\nb\n')).toBe('a\n\nb\n');
  });

  test('test blank lines collapse and the document ends with one newline', () => {
    expect(format('\n\n# A\n\n\n\nB\n\n\n')).toBe('# A\n\nB\n');
    expect(format('# A')).toBe('# A\n');
  });

  test('test a space is added after a hash that starts a block', () => {
    expect(format('#Title\n')).toBe('# Title\n');
    expect(format('# A\n\n###Deep\n')).toBe('# A\n\n### Deep\n');
    // Seven hashes are not a heading in Markdown, so this stays prose.
    expect(format('#######Nope\n')).toBe('#######Nope\n');
  });

  test('test prose that merely starts with a hash is not turned into a heading', () => {
    // Mid-paragraph, "#1" is text. Adding a space would silently create an <h1>.
    const source = 'We ranked them:\n#1 was the best\n';
    expect(format(source)).toBe(source);
  });

  test('test bullet markers are unified without touching emphasis or breaks', () => {
    expect(format('* a\n+ b\n- c\n')).toBe('- a\n- b\n- c\n');
    expect(format('  * nested\n')).toBe('  - nested\n');
    // A line of emphasis, not a list.
    expect(format('*emphasis*\n')).toBe('*emphasis*\n');
    // `* * *` is a thematic break, not a bullet holding "* *".
    expect(format('* * *\n')).toBe('---\n');
  });

  test('test checklists are normalized', () => {
    expect(format('- [X] done\n')).toBe('- [x] done\n');
    expect(format('- [] todo\n')).toBe('- [ ] todo\n');
    expect(format('- [x]tight\n')).toBe('- [x] tight\n');
  });

  test('test thematic breaks are unified', () => {
    expect(format('a\n\n***\n\nb\n')).toBe('a\n\n---\n\nb\n');
    expect(format('a\n\n___\n\nb\n')).toBe('a\n\n---\n\nb\n');
  });

  test('test a Setext heading is not mistaken for a thematic break', () => {
    // `Title` followed by `===` or `---` is a heading; rewriting it would destroy it.
    const setext = 'Title\n---\n\nBody\n';
    expect(format(setext)).toBe(setext);
  });

  test('test fences are unified on backticks', () => {
    expect(format('~~~ js\ncode\n~~~\n')).toBe('```js\ncode\n```\n');
    expect(format('````\ncode\n````\n')).toBe('```\ncode\n```\n');
  });

  test('test a tilde fence containing a backtick fence is left alone', () => {
    // Rewriting the outer fence to ``` would let the inner fence close it early.
    const source = '~~~\n```\ninner\n```\n~~~\n';
    expect(format(source)).toBe(source);
  });

  test('test tables are aligned', () => {
    const source = ['| a | bbbb |', '| --- | --- |', '| 1 | 2 |', ''].join('\n');
    expect(format(source)).toBe([
      '| a   | bbbb |',
      '| --- | ---- |',
      '| 1   | 2    |',
      '',
    ].join('\n'));
  });

  test('test table alignment markers are preserved', () => {
    const source = ['| a | b | c |', '|:--|:-:|--:|', '| 1 | 2 | 3 |', ''].join('\n');
    const result = format(source);
    expect(result).toContain('| :-- | :-: | --: |');
    // Right-aligned content is padded on the left.
    expect(result).toContain('|   3 |');
  });

  test('test ragged tables keep every cell', () => {
    // A short row must be padded, never truncated: a dropped cell is lost content.
    const source = ['| a | b |', '| --- | --- |', '| 1 |', ''].join('\n');
    const result = format(source);
    expect(result).toContain('| 1   |     |');
  });

  test('test pipes inside code spans and escapes are not column separators', () => {
    const source = ['| a | b |', '| --- | --- |', '| `x\\|y` | 2 |', ''].join('\n');
    const result = format(source);
    expect(result).toContain('`x\\|y`');
    expect(result.split('\n')[2].match(/(?<!\\)\|/g)).toHaveLength(3);
  });

  test('test formatting an empty document is safe', () => {
    expect(format('')).toBe('\n');
    expect(format('\n\n\n')).toBe('\n');
  });
});
