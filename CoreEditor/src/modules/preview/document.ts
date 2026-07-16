import { EditorView } from '@codemirror/view';
import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import { gfmHeadingId } from 'marked-gfm-heading-id';
import hljs from 'highlight.js';
import hljsLightTheme from 'highlight.js/styles/github.css?raw';
import hljsDarkTheme from 'highlight.js/styles/github-dark.css?raw';
import { TemplateId, defaultTemplate, isTemplateId, templateExtra, templateStyle } from './templates';

/**
 * Full-document live preview.
 *
 * The rendered Markdown is injected into a sandboxed <iframe> (see index.html),
 * which keeps it fully isolated: scripts never run inside it. The frame is
 * same-origin only so the editor can drive its scroll and swap its body without
 * a full reload. All rendering (Markdown, syntax highlighting) happens here in
 * the editor context; no remote resources are fetched to build the document.
 */

const splitClassName = 'me-preview-split';
const previewClassName = 'me-preview-only';
const renderDebounce = 150;

// Configured Markdown renderer: GFM, syntax highlighting, heading ids for anchors,
// and images rewritten to the native image-loader scheme so local files resolve.
const markdown = new Marked(
  markedHighlight({
    emptyLangClass: 'hljs',
    langPrefix: 'hljs language-',
    highlight: (code, lang) => {
      const language = lang !== '' && hljs.getLanguage(lang) !== undefined ? lang : 'plaintext';
      return hljs.highlight(code, { language }).value;
    },
  }),
  gfmHeadingId(),
  {
    gfm: true,
    renderer: {
      image({ href, title, text }) {
        const titleAttr = title != null && title !== '' ? ` title="${escapeAttribute(title)}"` : '';
        return `<img src="${escapeAttribute(resolveImageSource(href))}" alt="${escapeAttribute(text)}"${titleAttr}>`;
      },
    },
  },
);

let renderTimer: ReturnType<typeof setTimeout> | undefined;
let frameReady = false;
let previewScrollBound = false;
let templateId: TemplateId = defaultTemplate;

const styleElementId = 'me-document-style';

/**
 * Switch the visual template.
 *
 * Only the stylesheet is swapped: the Markdown source and the rendered body are
 * untouched, so the preview restyles in place without losing the scroll position.
 */
export function setTemplate(id: string): void {
  templateId = isTemplateId(id) ? id : defaultTemplate;

  const style = previewFrame()?.contentDocument?.getElementById(styleElementId);
  if (style !== null && style !== undefined) {
    style.textContent = previewStyle(templateId);
  }
}

export function currentTemplate(): TemplateId {
  return templateId;
}

function previewFrame(): HTMLIFrameElement | null {
  return document.getElementById('preview') as HTMLIFrameElement | null;
}

export function currentPreviewMode(): PreviewMode {
  if (document.body.classList.contains(previewClassName)) {
    return 'preview';
  }

  if (document.body.classList.contains(splitClassName)) {
    return 'split';
  }

  return 'editor';
}

export type PreviewMode = 'editor' | 'split' | 'preview';

function isPreviewVisible(): boolean {
  return currentPreviewMode() !== 'editor';
}

/**
 * Switch the preview layout: editor only, split, or preview only.
 */
export function setPreviewMode(mode: PreviewMode): void {
  document.body.classList.toggle(splitClassName, mode === 'split');
  document.body.classList.toggle(previewClassName, mode === 'preview');

  if (mode !== 'editor') {
    renderPreview();
  }
}

/**
 * Render the current document into the preview iframe immediately.
 *
 * The iframe skeleton (head with CSP and styles) is written once via srcdoc; after
 * that only the <body> content is swapped, which preserves the preview scroll position
 * across edits instead of jumping back to the top on every keystroke.
 */
export function renderPreview(): void {
  const frame = previewFrame();
  if (frame === null || !isPreviewVisible()) {
    return;
  }

  const source = stripFrontMatter(window.editor.state.doc.toString());
  const rendered = externalizeLinks(markdown.parse(source, { async: false }) as string);

  const body = frame.contentDocument?.body;
  if (frameReady && body != null) {
    body.innerHTML = rendered;
    if (scrollSyncEnabled) {
      syncScrollToPreview();
    }

    return;
  }

  // First render: write the skeleton, then fill the body once the frame has loaded.
  frame.onload = () => {
    frameReady = true;
    bindPreviewScroll(frame);

    const loadedBody = frame.contentDocument?.body;
    if (loadedBody != null) {
      loadedBody.innerHTML = rendered;
      if (scrollSyncEnabled) {
        syncScrollToPreview();
      }
    }
  };

  frame.srcdoc = previewDocument();
}

function scheduleRender(): void {
  if (!isPreviewVisible()) {
    return;
  }

  if (renderTimer !== undefined) {
    clearTimeout(renderTimer);
  }

  renderTimer = setTimeout(renderPreview, renderDebounce);
}

/**
 * CodeMirror extension that re-renders the preview when the document changes.
 */
export function previewUpdateListener() {
  return EditorView.updateListener.of(update => {
    if (update.docChanged) {
      scheduleRender();
    }
  });
}

// MARK: - Synchronized scrolling (bidirectional)

let scrollSyncEnabled = true;
let suppressEditorScroll = false;
let suppressPreviewScroll = false;

export function setScrollSync(enabled: boolean): void {
  scrollSyncEnabled = enabled;
  if (enabled) {
    syncScrollToPreview();
  }
}

/**
 * CodeMirror extension: mirror the editor scroll position onto the preview.
 */
export function previewScrollListener() {
  return EditorView.domEventHandlers({
    scroll: () => {
      syncScrollToPreview();
    },
  });
}

function bindPreviewScroll(frame: HTMLIFrameElement): void {
  if (previewScrollBound) {
    return;
  }

  frame.contentWindow?.addEventListener('scroll', () => syncScrollToEditor(), { passive: true });
  previewScrollBound = true;
}

function syncScrollToPreview(): void {
  if (!scrollSyncEnabled || currentPreviewMode() !== 'split') {
    return;
  }

  if (suppressEditorScroll) {
    suppressEditorScroll = false;
    return;
  }

  const target = previewFrame()?.contentDocument?.scrollingElement;
  if (target == null) {
    return;
  }

  const source = window.editor.scrollDOM;
  const ratio = scrollRatio(source.scrollTop, source.scrollHeight - source.clientHeight);
  if (ratio === undefined) {
    return;
  }

  suppressPreviewScroll = true;
  target.scrollTop = ratio * (target.scrollHeight - target.clientHeight);
}

function syncScrollToEditor(): void {
  if (!scrollSyncEnabled || currentPreviewMode() !== 'split') {
    return;
  }

  if (suppressPreviewScroll) {
    suppressPreviewScroll = false;
    return;
  }

  const source = previewFrame()?.contentDocument?.scrollingElement;
  if (source == null) {
    return;
  }

  const ratio = scrollRatio(source.scrollTop, source.scrollHeight - source.clientHeight);
  if (ratio === undefined) {
    return;
  }

  const target = window.editor.scrollDOM;
  suppressEditorScroll = true;
  target.scrollTop = ratio * (target.scrollHeight - target.clientHeight);
}

function scrollRatio(offset: number, range: number): number | undefined {
  if (range <= 0) {
    return undefined;
  }

  return offset / range;
}

// MARK: - Rendering helpers

/** Remove a leading YAML frontmatter block so it isn't rendered as content. */
function stripFrontMatter(source: string): string {
  return source.replace(/^\uFEFF?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/, '');
}

/** Local/relative image paths are served by the native image-loader scheme. */
function resolveImageSource(href: string): string {
  if (/^(https?:|data:|blob:|image-loader:)/i.test(href)) {
    return href;
  }

  return `image-loader://${href.replace(/^\.?\//, '')}`;
}

/** Open external links in the browser; keep in-document anchors inside the preview. */
function externalizeLinks(html: string): string {
  return html.replace(/<a href="(?!#)/g, '<a target="_blank" rel="noopener noreferrer" href="');
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// The macOS text system (used for PDF export) honors inline styles far more reliably than
// stylesheet classes, so bake the highlight.js token colors into the spans for export.
let highlightColors: Record<string, string> | undefined;

function highlightColorMap(): Record<string, string> {
  if (highlightColors !== undefined) {
    return highlightColors;
  }

  const map: Record<string, string> = {};
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  let rule: RegExpExecArray | null;
  while ((rule = rulePattern.exec(hljsLightTheme)) !== null) {
    const color = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(rule[2]);
    if (color === null) {
      continue;
    }

    for (const selector of rule[1].split(',')) {
      const token = /\.hljs-([\w-]+)\s*$/.exec(selector.trim());
      if (token !== null) {
        map[token[1]] = color[1].trim();
      }
    }
  }

  highlightColors = map;
  return map;
}

function inlineHighlightColors(html: string): string {
  const map = highlightColorMap();
  return html.replace(/<span class="hljs-([\w-]+)"/g, (whole, token: string) => {
    return Object.hasOwn(map, token) ? `<span style="color:${map[token]}"` : whole;
  });
}

// MARK: - HTML export (self-contained, styled with the active template)

interface FrontMatter {
  title?: string;
  language?: string;
}

function parseFrontMatter(source: string): FrontMatter {
  const match = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(source);
  if (match === null) {
    return {};
  }

  const block = match[1];
  const read = (key: string): string | undefined => {
    const line = new RegExp(`^${key}[ \\t]*:[ \\t]*(.+)$`, 'm').exec(block);
    return line === null ? undefined : line[1].trim().replace(/^["']|["']$/g, '');
  };

  return { title: read('title'), language: read('language') };
}

function firstHeadingText(html: string): string | undefined {
  const match = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (match === null) {
    return undefined;
  }

  const text = match[1].replace(/<[^>]+>/g, '').trim();
  return text === '' ? undefined : text;
}

/**
 * Build a self-contained HTML document for export, using the active visual template.
 * Local images stay as image-loader URLs so the native side can embed them as data URIs.
 */
export function getExportHTML(): string {
  const raw = window.editor.state.doc.toString();
  const meta = parseFrontMatter(raw);
  const rendered = externalizeLinks(markdown.parse(stripFrontMatter(raw), { async: false }) as string);
  const body = inlineHighlightColors(rendered);
  const title = meta.title ?? firstHeadingText(body) ?? 'Untitled';
  const lang = meta.language ?? 'en';

  return `<!DOCTYPE html>
<html lang="${escapeAttribute(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeText(title)}</title>
<style>${exportStyle(templateId)}</style>
</head>
<body>
${body}
</body>
</html>`;
}

function previewDocument(): string {
  // Content Security Policy hardening (defense in depth on top of the iframe sandbox):
  // no scripts, no network connections, no frames. Inline styles and images are allowed
  // so the document renders; local images go through the image-loader scheme.
  const csp = "default-src 'none'; style-src 'unsafe-inline'; img-src data: https: http: image-loader:; font-src data:;";
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style id="${styleElementId}">${previewStyle(templateId)}</style>
</head>
<body></body>
</html>`;
}

// Structure and metrics shared by every template. Anything a template is allowed to
// restyle is expressed as a `--document-*` variable (see templates.ts) rather than a
// literal, so switching templates is a matter of swapping the variable block.
const baseStyle = `
html { height: 100%; }
body {
  font-family: var(--document-font-family);
  font-size: var(--document-font-size);
  line-height: var(--document-line-height);
  color: var(--document-text-color);
  background: var(--document-background-color);
  max-width: var(--document-page-width);
  margin: 0 auto;
  padding: var(--document-page-margin);
  word-wrap: break-word;
}
h1, h2, h3, h4, h5, h6 {
  font-family: var(--document-heading-font-family);
  color: var(--document-heading-color);
  line-height: 1.25;
  margin: 1.5em 0 0.6em;
  font-weight: 600;
}
h1 { font-size: 1.9em; }
h2 { font-size: 1.5em; }
p { margin: 0.85em 0; }
a { color: var(--document-accent-color); text-decoration: none; }
a:hover { text-decoration: underline; }
code {
  font-family: "SF Mono", ui-monospace, monospace;
  font-size: 0.88em;
  background: var(--document-code-background);
  color: var(--document-text-color);
  padding: 0.2em 0.4em;
  border-radius: 4px;
}
pre { margin: 0.9em 0; border-radius: 8px; overflow: auto; background: var(--document-code-background); }
pre code, pre code.hljs {
  display: block;
  padding: 14px 16px;
  font-size: 0.88em;
  background: var(--document-code-background);
}
blockquote {
  margin: 0.9em 0;
  padding: 0 1em;
  color: var(--document-muted-color);
  border-left: 3px solid var(--document-border-color);
}
table { border-collapse: collapse; margin: 0.9em 0; display: block; overflow: auto; }
th, td { border: 1px solid var(--document-border-color); padding: 6px 12px; }
th { background: var(--document-code-background); }
img { max-width: 100%; }
hr { border: none; border-top: 1px solid var(--document-border-color); margin: 1.6em 0; }
ul, ol { padding-left: 1.6em; }
li { margin: 0.25em 0; }
li:has(> input[type="checkbox"]) { list-style: none; margin-left: -1.3em; }
li > input[type="checkbox"] { margin: 0 0.5em 0 0; }
`;

/** Preview stylesheet: follows the system appearance, light and dark code themes. */
function previewStyle(id: TemplateId): string {
  return `:root { color-scheme: light dark; }
${templateStyle(id, 'auto')}
${baseStyle}
${templateExtra(id)}
${hljsLightTheme}
@media (prefers-color-scheme: dark) { ${hljsDarkTheme} }`;
}

// Exports always use a light "paper" look (white background, light code theme) regardless of
// the system appearance, plus fragmentation rules so PDF pages don't cut content awkwardly.
function exportStyle(id: TemplateId): string {
  return `:root { color-scheme: light; }
${templateStyle(id, 'light')}
${baseStyle}
${templateExtra(id)}
${hljsLightTheme}
pre, blockquote, table, img, figure { break-inside: avoid; }
h1, h2, h3, h4, h5, h6 { break-after: avoid; }
@media print {
  body { max-width: none; margin: 0; padding: 0; }
}`;
}
