import { describe, expect, test } from '@jest/globals';
import * as editor from './utils/editor';
import { generateTableOfContents, getFormattedMarkdown } from '../src/modules/transform';

interface Summary {
  changed: boolean;
  rules: { id: string; count: number }[];
}

function tocSummary(doc: string, optionsJSON?: string): Summary {
  editor.setUp(doc);
  return JSON.parse(generateTableOfContents(false, optionsJSON)) as Summary;
}

describe('Transform: normalized Markdown export', () => {
  test('test it returns the same output as Format Document without touching the editor', () => {
    const messy = '#Título\n\n\n\n* uno\n* dos  \n';
    editor.setUp(messy);
    const formatted = getFormattedMarkdown();

    // Normalized: heading gets a space, blank runs collapse, list markers unified, no trailing spaces.
    expect(formatted).toContain('# Título');
    expect(formatted).toContain('- uno');
    expect(formatted).toContain('- dos');
    expect(formatted.endsWith('\n')).toBe(true);
    // The document itself is left untouched (export never mutates it).
    expect(editor.getText()).toBe(messy);
  });
});

describe('Transform: table of contents options', () => {
  test('test the default options include deep headings', () => {
    const summary = tocSummary('# T\n\n## Uno\n\n### Profundo\n');
    expect(summary.rules[0].count).toBe(2);
  });

  test('test a maxLevel option limits which headings are listed', () => {
    const summary = tocSummary('# T\n\n## Uno\n\n### Profundo\n', JSON.stringify({ maxLevel: 2 }));
    expect(summary.rules[0].count).toBe(1);
  });

  test('test a malformed options payload falls back to the defaults', () => {
    const summary = tocSummary('# T\n\n## Uno\n\n### Profundo\n', 'not json');
    expect(summary.rules[0].count).toBe(2);
  });
});
