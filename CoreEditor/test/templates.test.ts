import { describe, expect, test } from '@jest/globals';
import {
  TemplateId,
  defaultTemplate,
  isTemplateId,
  templateExtra,
  templateIds,
  templateStyle,
} from '../src/modules/preview/templates';

// The document variables every template must define.
const requiredVariables = [
  '--document-font-family',
  '--document-font-size',
  '--document-line-height',
  '--document-text-color',
  '--document-background-color',
  '--document-accent-color',
  '--document-heading-color',
  '--document-code-background',
  '--document-page-width',
  '--document-page-margin',
];

describe('Templates module', () => {
  test('test the shipped templates are available and include a default', () => {
    expect(templateIds).toEqual(['minimal', 'technical', 'business', 'academic']);
    expect(templateIds).toContain(defaultTemplate);
  });

  test('test template identifiers are validated', () => {
    expect(isTemplateId('academic')).toBe(true);
    expect(isTemplateId('Academic')).toBe(false);
    expect(isTemplateId('nonexistent')).toBe(false);
  });

  test('test every template defines the full set of document variables', () => {
    for (const id of templateIds) {
      const style = templateStyle(id, 'light');
      for (const variable of requiredVariables) {
        expect(style).toContain(`${variable}:`);
      }
    }
  });

  test('test templates are visually distinct', () => {
    const styles = templateIds.map(id => templateStyle(id, 'light'));
    expect(new Set(styles).size).toBe(templateIds.length);
  });

  // Exports must render on white paper regardless of the system appearance, so the
  // light appearance never carries a dark-mode block.
  test('test the light appearance ignores the system dark mode', () => {
    for (const id of templateIds) {
      expect(templateStyle(id, 'light')).not.toContain('prefers-color-scheme');
      expect(templateStyle(id, 'auto')).toContain('prefers-color-scheme: dark');
    }
  });

  test('test the auto appearance overrides the surface colors for dark mode', () => {
    const style = templateStyle('minimal', 'auto');
    expect(style).toContain('--document-background-color: #ffffff');
    expect(style).toContain('--document-background-color: #1c1c1e');
  });

  test('test template rules never alter document content', () => {
    for (const id of templateIds) {
      // `content:` would inject text into the exported document, which templates may not do.
      expect(templateExtra(id)).not.toContain('content:');
    }
  });

  test('test unknown templates are rejected rather than silently styled', () => {
    expect(isTemplateId('bogus')).toBe(false);
    expect(() => templateStyle('bogus' as TemplateId, 'light')).toThrow();
  });
});
