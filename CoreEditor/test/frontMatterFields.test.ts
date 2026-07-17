import { describe, expect, test } from '@jest/globals';
import { readFields, setField } from '../src/modules/frontMatter/fields';

describe('Frontmatter fields: read', () => {
  test('test no block yields not present', () => {
    const result = readFields('# Just a document\n');
    expect(result.present).toBe(false);
    expect(result.values).toEqual({});
  });

  test('test known fields are read and unquoted', () => {
    const source = '---\ntitle: "Hola mundo"\nauthor: Ada\nlanguage: es\n---\n\n# Body\n';
    const result = readFields(source);
    expect(result.present).toBe(true);
    expect(result.values.title).toBe('Hola mundo');
    expect(result.values.author).toBe('Ada');
    expect(result.values.language).toBe('es');
  });

  test('test unknown keys are noted, not lost', () => {
    const result = readFields('---\ntitle: X\ncustom_field: 42\n---\n\nBody\n');
    expect(result.values.title).toBe('X');
    expect(result.unknownKeys).toEqual(['custom_field']);
  });
});

describe('Frontmatter fields: write', () => {
  test('test updating a field touches only its line', () => {
    const source = '---\ntitle: Old\nauthor: Ada\n---\n\n# Body\n';
    expect(setField(source, 'title', 'New')).toBe('---\ntitle: New\nauthor: Ada\n---\n\n# Body\n');
  });

  test('test unknown fields and comments are preserved on edit', () => {
    const source = '---\n# a comment\ntitle: Old\ncustom: keep-me\n---\n\nBody\n';
    const result = setField(source, 'title', 'New');
    expect(result).toContain('# a comment');
    expect(result).toContain('custom: keep-me');
    expect(result).toContain('title: New');
  });

  test('test adding a field appends it inside the block', () => {
    const source = '---\ntitle: X\n---\n\nBody\n';
    expect(setField(source, 'author', 'Ada')).toBe('---\ntitle: X\nauthor: Ada\n---\n\nBody\n');
  });

  test('test clearing a field removes its line', () => {
    const source = '---\ntitle: X\nauthor: Ada\n---\n\nBody\n';
    expect(setField(source, 'author', '')).toBe('---\ntitle: X\n---\n\nBody\n');
  });

  test('test setting a field with no block creates one at the top', () => {
    expect(setField('# Body\n', 'title', 'Hola')).toBe('---\ntitle: Hola\n---\n\n# Body\n');
  });

  test('test clearing a field with no block changes nothing', () => {
    expect(setField('# Body\n', 'title', '')).toBe('# Body\n');
  });

  test('test values needing YAML quoting are quoted', () => {
    // A colon followed by a space would otherwise be read as a nested mapping.
    const result = setField('---\ntitle: X\n---\n\nBody\n', 'title', 'nota: importante');
    expect(result).toContain('title: "nota: importante"');
    // But a colon without a space is a plain scalar and stays unquoted.
    const ratio = setField('---\ntitle: X\n---\n\nBody\n', 'title', 'Ratio 3:2');
    expect(ratio).toContain('title: Ratio 3:2');
  });

  test('test the document body is never modified', () => {
    const body = '# Título\n\nUn párrafo con `código`.\n';
    const source = `---\ntitle: X\n---\n\n${body}`;
    expect(setField(source, 'title', 'Y').endsWith(body)).toBe(true);
  });

  test('test writing a field then reading it round-trips', () => {
    const written = setField('# Body\n', 'author', 'Ada Lovelace');
    expect(readFields(written).values.author).toBe('Ada Lovelace');
  });

  test('test setting the same value twice is idempotent', () => {
    const once = setField('---\ntitle: X\n---\n\nBody\n', 'title', 'Hola mundo');
    expect(setField(once, 'title', 'Hola mundo')).toBe(once);
  });
});
