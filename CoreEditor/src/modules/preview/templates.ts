/**
 * Visual templates (SPEC-TEMPLATES-001).
 *
 * A template is presentation only: it never touches the Markdown source. Each one is
 * a set of `--document-*` custom properties consumed by the shared document stylesheet
 * (see document.ts), plus optional rules for looks the variables alone can't express.
 *
 * The same template drives the live preview, the HTML export and the PDF export, which
 * is what keeps "what you see is what you ship" true.
 */

export type TemplateId = 'minimal' | 'technical' | 'business' | 'academic';

export const defaultTemplate: TemplateId = 'minimal';

type Variables = Record<string, string>;

interface Template {
  /** Custom properties for the light appearance, also used verbatim by exports. */
  light: Variables;
  /** Overrides applied when the preview renders in dark appearance. */
  dark: Variables;
  /** Rules beyond the variables; appended after the base stylesheet so they win. */
  extra?: string;
}

// Shared dark-appearance values: templates keep their identity (accent, type, metrics)
// while the paper turns dark, so only the surface colors need overriding.
const darkSurface: Variables = {
  '--document-text-color': '#e6edf3',
  '--document-background-color': '#1c1c1e',
  '--document-heading-color': '#f0f6fc',
  '--document-code-background': '#2c2c2e',
  '--document-border-color': '#3d4145',
  '--document-muted-color': '#9aa4ae',
};

const templates: Record<TemplateId, Template> = {
  // The original look of the app: neutral, system-native, unopinionated.
  minimal: {
    light: {
      '--document-font-family': '-apple-system, system-ui, BlinkMacSystemFont, sans-serif',
      '--document-heading-font-family': 'inherit',
      '--document-font-size': '16px',
      '--document-line-height': '1.7',
      '--document-text-color': '#1f2328',
      '--document-background-color': '#ffffff',
      '--document-accent-color': '#0969da',
      '--document-heading-color': '#1f2328',
      '--document-code-background': '#eff1f3',
      '--document-page-width': '820px',
      '--document-page-margin': '32px 32px 64px',
      '--document-border-color': '#d0d7de',
      '--document-muted-color': '#57606a',
    },
    dark: darkSurface,
    extra: `
h1 { border-bottom: 1px solid var(--document-border-color); padding-bottom: 0.3em; }
h2 { border-bottom: 1px solid var(--document-border-color); padding-bottom: 0.3em; }
`,
  },

  // Documentation: denser type, wider measure for code and tables, teal accent.
  technical: {
    light: {
      '--document-font-family': '-apple-system, system-ui, BlinkMacSystemFont, sans-serif',
      '--document-heading-font-family': 'inherit',
      '--document-font-size': '15px',
      '--document-line-height': '1.65',
      '--document-text-color': '#24292f',
      '--document-background-color': '#ffffff',
      '--document-accent-color': '#0b7285',
      '--document-heading-color': '#0d1117',
      '--document-code-background': '#f0f3f6',
      '--document-page-width': '900px',
      '--document-page-margin': '32px 40px 64px',
      '--document-border-color': '#d0d7de',
      '--document-muted-color': '#57606a',
    },
    dark: darkSurface,
    extra: `
h1 { border-bottom: 2px solid var(--document-accent-color); padding-bottom: 0.3em; }
h2 { border-bottom: 1px solid var(--document-border-color); padding-bottom: 0.3em; }
h3 { color: var(--document-accent-color); }
/* Full-width tables read better for API/option references. */
table { display: table; width: 100%; }
th { text-align: left; }
pre { border: 1px solid var(--document-border-color); }
blockquote { border-left: 3px solid var(--document-accent-color); }
`,
  },

  // Reports and decks: roomier leading, restrained corporate blue, banded tables.
  business: {
    light: {
      '--document-font-family': '"Helvetica Neue", -apple-system, system-ui, sans-serif',
      '--document-heading-font-family': 'inherit',
      '--document-font-size': '16.5px',
      '--document-line-height': '1.75',
      '--document-text-color': '#2b2f33',
      '--document-background-color': '#ffffff',
      '--document-accent-color': '#1f4e79',
      '--document-heading-color': '#1f4e79',
      '--document-code-background': '#f2f4f7',
      '--document-page-width': '780px',
      '--document-page-margin': '44px 48px 72px',
      '--document-border-color': '#c9d3dd',
      '--document-muted-color': '#5a6672',
    },
    dark: { ...darkSurface, '--document-heading-color': '#8ab4e8', '--document-accent-color': '#8ab4e8' },
    extra: `
h1 { border-bottom: 3px solid var(--document-accent-color); padding-bottom: 0.35em; letter-spacing: -0.01em; }
h2 { font-size: 1.35em; }
table { display: table; width: 100%; }
th {
  background: var(--document-accent-color);
  color: #ffffff;
  text-align: left;
  border-color: var(--document-accent-color);
}
tr:nth-child(even) td { background: var(--document-code-background); }
blockquote {
  border-left: 4px solid var(--document-accent-color);
  background: var(--document-code-background);
  padding: 0.6em 1em;
  font-style: italic;
}
`,
  },

  // Papers and essays: serif, justified, narrow measure, centered title.
  academic: {
    light: {
      '--document-font-family': '"New York", Georgia, "Times New Roman", serif',
      '--document-heading-font-family': 'inherit',
      '--document-font-size': '17px',
      '--document-line-height': '1.8',
      '--document-text-color': '#1a1a1a',
      '--document-background-color': '#ffffff',
      '--document-accent-color': '#3a3a3a',
      '--document-heading-color': '#111111',
      '--document-code-background': '#f4f4f4',
      '--document-page-width': '700px',
      '--document-page-margin': '48px 56px 80px',
      '--document-border-color': '#cccccc',
      '--document-muted-color': '#555555',
    },
    dark: { ...darkSurface, '--document-accent-color': '#c9c9c9' },
    extra: `
p { text-align: justify; hyphens: auto; }
h1 { text-align: center; font-size: 1.75em; margin-bottom: 1em; }
h2 { font-size: 1.3em; }
h3 { font-size: 1.1em; font-style: italic; font-weight: 600; }
blockquote { margin-left: 1.5em; font-size: 0.95em; }
table { display: table; width: 100%; font-size: 0.95em; }
/* Rule-only tables, the way journals set them. */
th, td { border: none; border-bottom: 1px solid var(--document-border-color); }
th { background: none; border-bottom: 2px solid var(--document-text-color); text-align: left; }
`,
  },
};

export const templateIds = Object.keys(templates) as TemplateId[];

export function isTemplateId(value: string): value is TemplateId {
  return Object.hasOwn(templates, value);
}

function declarations(variables: Variables): string {
  return Object.entries(variables)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n');
}

/**
 * Stylesheet fragment for a template: variables first, template rules last.
 *
 * `appearance: 'auto'` follows the system (used by the preview); `'light'` pins the
 * light values, which is what exports want so a PDF is always on white paper.
 */
export function templateStyle(id: TemplateId, appearance: 'auto' | 'light'): string {
  const template = templates[id];
  const light = `:root {\n${declarations(template.light)}\n}`;
  const dark = appearance === 'auto'
    ? `\n@media (prefers-color-scheme: dark) {\n:root {\n${declarations(template.dark)}\n}\n}`
    : '';

  return `${light}${dark}`;
}

export function templateExtra(id: TemplateId): string {
  return templates[id].extra ?? '';
}
