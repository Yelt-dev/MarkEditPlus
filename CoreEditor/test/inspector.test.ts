import { describe, expect, test } from '@jest/globals';
import * as editor from './utils/editor';
import { computeMetrics, countWords, readingMinutes } from '../src/modules/inspector/metrics';
import { Finding, validateDocument } from '../src/modules/inspector/validate';

function metricsOf(doc: string) {
  editor.setUp(doc);
  return computeMetrics(window.editor.state);
}

function findingsOf(doc: string): Finding[] {
  editor.setUp(doc);
  return validateDocument(window.editor.state);
}

function messages(findings: Finding[]): string[] {
  return findings.map(finding => finding.message);
}

describe('Inspector: metrics', () => {
  test('test word counting is language-neutral and ignores punctuation', () => {
    expect(countWords('Hola, mundo cruel.')).toBe(3);
    expect(countWords("it's a well-formed test")).toBe(4);
    expect(countWords('   ')).toBe(0);
    expect(countWords('café münchen 123')).toBe(3);
  });

  test('test reading time rounds to whole minutes', () => {
    expect(readingMinutes(0)).toBe(0);
    expect(readingMinutes(110)).toBe(1);
    expect(readingMinutes(660)).toBe(3);
  });

  test('test text metrics count characters, spaces and lines', () => {
    const m = metricsOf('# Hola\n\nmundo\n');
    expect(m.characters).toBe('# Hola\n\nmundo\n'.length);
    expect(m.charactersNoSpaces).toBe('#Holamundo'.length);
    expect(m.lines).toBe(4);
    expect(m.words).toBe(2);
  });

  test('test structural counts come from the syntax tree', () => {
    const doc = [
      '# Title',
      '',
      '## Section',
      '',
      'A [link](https://x.com) and an ![image](pic.png).',
      '',
      '| a | b |',
      '| - | - |',
      '| 1 | 2 |',
      '',
      '```js',
      'code();',
      '```',
    ].join('\n');
    const m = metricsOf(doc);

    expect(m.headings).toBe(2);
    expect(m.links).toBe(1);
    expect(m.images).toBe(1);
    expect(m.tables).toBe(1);
    expect(m.codeBlocks).toBe(1);
  });

  test('test byte size is UTF-8', () => {
    // "café" is 5 bytes in UTF-8 (é is two bytes) but 4 code points.
    const m = metricsOf('café');
    expect(m.bytes).toBe(5);
    expect(m.characters).toBe(4);
  });
});

describe('Inspector: structural validation', () => {
  test('test a clean document reports nothing', () => {
    expect(findingsOf('# Title\n\nBody with a paragraph.\n')).toEqual([]);
  });

  test('test a missing H1 is reported as info', () => {
    const findings = findingsOf('## Section\n\nBody.\n');
    expect(messages(findings)).toContain('El documento no tiene un encabezado H1.');
  });

  test('test multiple H1 headings are flagged', () => {
    const findings = findingsOf('# One\n\n# Two\n');
    const finding = findings.find(f => f.message.includes('encabezados H1'));
    expect(finding?.severity).toBe('warning');
    expect(finding?.line).toBe(3);
  });

  test('test a skipped heading level is flagged with location', () => {
    const findings = findingsOf('# Title\n\n### Deep\n');
    const finding = findings.find(f => f.message.includes('sin un H2 intermedio'));
    expect(finding).toBeDefined();
    expect(finding?.line).toBe(3);
  });

  test('test an empty heading is flagged', () => {
    const findings = findingsOf('# Title\n\n## \n\nBody.\n');
    expect(messages(findings).some(m => m.includes('vacío'))).toBe(true);
  });

  test('test an image without alt text is flagged', () => {
    const findings = findingsOf('# T\n\n![](pic.png)\n');
    const finding = findings.find(f => f.message.includes('texto alternativo'));
    expect(finding?.severity).toBe('warning');
  });

  test('test an image with alt text passes', () => {
    const findings = findingsOf('# T\n\n![a diagram](pic.png)\n');
    expect(messages(findings).some(m => m.includes('texto alternativo'))).toBe(false);
  });

  test('test an empty link is flagged', () => {
    const findings = findingsOf('# T\n\n[](https://x.com)\n');
    expect(messages(findings)).toContain('Enlace sin texto.');
  });

  test('test an unclosed code fence is an error with location', () => {
    const findings = findingsOf('# T\n\n```js\ncode();\n');
    const finding = findings.find(f => f.severity === 'error');
    expect(finding?.message).toBe('Bloque de código sin cerrar.');
    expect(finding?.line).toBe(3);
  });

  test('test trailing whitespace is reported once with a count', () => {
    const findings = findingsOf('# T\n\nfoo  \nbar   \n');
    const finding = findings.find(f => f.message.includes('espacios al final'));
    expect(finding?.message).toBe('2 líneas con espacios al final.');
  });

  test('test a missing final newline is reported', () => {
    const findings = findingsOf('# Title');
    expect(messages(findings)).toContain('Falta la nueva línea final.');
  });

  test('test headings inside code blocks are not counted', () => {
    // The "## Not a heading" is inside a fence; only the real H1 exists, so no "missing H1".
    const findings = findingsOf('# Real\n\n```\n## Not a heading\n```\n');
    expect(messages(findings)).not.toContain('El documento no tiene un encabezado H1.');
  });
});

describe('Inspector: extended validation', () => {
  test('test an unsupported image format is flagged', () => {
    const finding = findingsOf('# T\n\n![diagram](sketch.psd)\n').find(f => f.message.includes('no soportado'));
    expect(finding?.severity).toBe('warning');
    expect(finding?.message).toContain('.psd');
  });

  test('test a supported local image format passes', () => {
    expect(messages(findingsOf('# T\n\n![ok](pic.png)\n')).some(m => m.includes('no soportado'))).toBe(false);
  });

  test('test remote images are not checked for format', () => {
    expect(messages(findingsOf('# T\n\n![x](https://example.com/a.psd)\n')).some(m => m.includes('no soportado'))).toBe(false);
  });

  test('test a table row with the wrong number of cells is flagged', () => {
    const doc = '# T\n\n| a | b |\n| - | - |\n| 1 |\n';
    const finding = findingsOf(doc).find(f => f.message.includes('celda'));
    expect(finding?.severity).toBe('warning');
    expect(finding?.message).toContain('se esperaban 2');
  });

  test('test a consistent table passes', () => {
    const doc = '# T\n\n| a | b |\n| - | - |\n| 1 | 2 |\n';
    expect(messages(findingsOf(doc)).some(m => m.includes('celda'))).toBe(false);
  });

  test('test an undefined reference link is flagged', () => {
    const finding = findingsOf('# T\n\nSee [the docs][missing] here.\n').find(f => f.message.includes('Referencia no definida'));
    expect(finding?.severity).toBe('warning');
    expect(finding?.message).toContain('[missing]');
  });

  test('test a defined reference link passes', () => {
    const doc = '# T\n\nSee [the docs][ok] here.\n\n[ok]: https://example.com\n';
    expect(messages(findingsOf(doc)).some(m => m.includes('Referencia no definida'))).toBe(false);
  });

  test('test reference matching is case-insensitive', () => {
    const doc = '# T\n\nSee [the docs][OK] here.\n\n[ok]: https://example.com\n';
    expect(messages(findingsOf(doc)).some(m => m.includes('Referencia no definida'))).toBe(false);
  });

  test('test an unclosed frontmatter block is an error', () => {
    const finding = findingsOf('---\ntitle: X\n\n# Body\n').find(f => f.message.includes('Frontmatter sin cerrar'));
    expect(finding?.severity).toBe('error');
  });

  test('test a malformed frontmatter line is flagged', () => {
    const doc = '---\ntitle: X\nesto no es válido\n---\n\n# Body\n';
    const finding = findingsOf(doc).find(f => f.message.includes('clave: valor'));
    expect(finding?.severity).toBe('warning');
  });

  test('test a leading thematic break is not mistaken for frontmatter', () => {
    // A `---` followed by prose (not key: value) is an <hr>, not an unclosed frontmatter block.
    const doc = '---\n\nJust some text, not metadata.\n';
    expect(messages(findingsOf(doc)).some(m => m.includes('Frontmatter'))).toBe(false);
  });

  test('test valid frontmatter passes', () => {
    const doc = '---\ntitle: X\nauthor: Yo\n---\n\n# Body\n';
    expect(messages(findingsOf(doc)).some(m => m.includes('Frontmatter') || m.includes('clave: valor'))).toBe(false);
  });
});
