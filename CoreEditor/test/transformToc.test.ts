import { describe, expect, test } from '@jest/globals';
import { TOCOptions, buildTableOfContents, closeMarker, openMarker } from '../src/modules/transform/toc';

const options: TOCOptions = { minLevel: 2, maxLevel: 6, ordered: false, title: 'Tabla de contenido' };

function toc(source: string, overrides: Partial<TOCOptions> = {}) {
  return buildTableOfContents(source, { ...options, ...overrides });
}

describe('Transform: table of contents', () => {
  test('test the index is inserted after the title', () => {
    const source = '# Título\n\n## Introducción\n\n## Arquitectura\n';
    const result = toc(source);

    expect(result.mode).toBe('inserted');
    expect(result.count).toBe(2);
    expect(result.text).toBe([
      '# Título',
      '',
      openMarker,
      '## Tabla de contenido',
      '',
      '- [Introducción](#introducción)',
      '- [Arquitectura](#arquitectura)',
      closeMarker,
      '',
      '## Introducción',
      '',
      '## Arquitectura',
      '',
    ].join('\n'));
  });

  test('test nesting reflects the heading hierarchy', () => {
    const source = '# T\n\n## Arquitectura\n\n### Backend\n\n### Frontend\n\n## Cierre\n';
    const lines = toc(source).text.split('\n');

    expect(lines).toContain('- [Arquitectura](#arquitectura)');
    expect(lines).toContain('  - [Backend](#backend)');
    expect(lines).toContain('  - [Frontend](#frontend)');
    expect(lines).toContain('- [Cierre](#cierre)');
  });

  test('test indentation is relative to the shallowest included heading', () => {
    // No h2 anywhere: h3 becomes the top level and sits flush left.
    const source = '# T\n\n### Uno\n\n#### Dos\n';
    const lines = toc(source).text.split('\n');
    expect(lines).toContain('- [Uno](#uno)');
    expect(lines).toContain('  - [Dos](#dos)');
  });

  test('test accents are preserved in anchors', () => {
    // The spec example links to #introducción, with the accent kept.
    const result = toc('# T\n\n## Introducción\n');
    expect(result.text).toContain('[Introducción](#introducción)');
  });

  test('test repeated headings get github-style numbered anchors', () => {
    const source = '# T\n\n## Notas\n\n## Notas\n';
    const links = toc(source).text.split('\n').filter(line => line.includes(']('));
    expect(links).toEqual([
      '- [Notas](#notas)',
      '- [Notas](#notas-1)',
    ]);
  });

  test('test anchor numbering accounts for headings outside the level range', () => {
    // The h1 "Repo" is not listed but is still slugged, so the listed h2 "Repo" is #repo-1,
    // matching the ids the preview assigns.
    const source = '# Repo\n\n## Repo\n';
    expect(toc(source).text).toContain('[Repo](#repo-1)');
  });

  test('test regenerating updates the block in place instead of duplicating', () => {
    const first = toc('# T\n\n## Uno\n').text;
    const withSection = first.replace('## Uno\n', '## Uno\n\n## Dos\n');
    const second = toc(withSection);

    expect(second.mode).toBe('updated');
    expect(second.text.match(new RegExp(openMarker, 'g'))).toHaveLength(1);
    expect(second.text).toContain('[Dos](#dos)');
  });

  test('test regenerating an unchanged document reports no change', () => {
    const once = toc('# T\n\n## Uno\n\n## Dos\n').text;
    const twice = toc(once);
    expect(twice.text).toBe(once);
    expect(twice.mode).toBe('none');
  });

  test('test headings inside code blocks are ignored', () => {
    const source = '# T\n\n## Real\n\n```\n## Not a heading\n```\n';
    const result = toc(source);
    expect(result.count).toBe(1);
    expect(result.text).not.toContain('Not a heading](');
  });

  test('test the index is placed after frontmatter when there is no title', () => {
    const source = '---\ntitle: X\n---\n\n## Uno\n\n## Dos\n';
    const result = toc(source);
    const marker = result.text.indexOf(openMarker);
    const frontMatterEnd = result.text.lastIndexOf('---');
    expect(marker).toBeGreaterThan(frontMatterEnd);
    expect(result.text.startsWith('---\ntitle: X\n---')).toBe(true);
  });

  test('test frontmatter delimiters are not read as headings', () => {
    const source = '---\ntitle: X\n---\n\n## Uno\n';
    expect(toc(source).count).toBe(1);
  });

  test('test an ordered index uses numbered markers', () => {
    const result = toc('# T\n\n## Uno\n\n## Dos\n', { ordered: true });
    expect(result.text).toContain('1. [Uno](#uno)');
    expect(result.text).toContain('1. [Dos](#dos)');
  });

  test('test a document with no headings in range is left unchanged', () => {
    const source = '# Solo título\n\nTexto sin secciones.\n';
    const result = toc(source);
    expect(result.mode).toBe('none');
    expect(result.text).toBe(source);
  });

  test('test link brackets in a heading are escaped', () => {
    const result = toc('# T\n\n## Ver [ref]\n');
    expect(result.text).toContain('[Ver \\[ref\\]](#ver-ref)');
  });

  test('test closing hashes are stripped from the heading text', () => {
    const result = toc('# T\n\n## Sección ##\n');
    expect(result.text).toContain('[Sección](#sección)');
  });
});
