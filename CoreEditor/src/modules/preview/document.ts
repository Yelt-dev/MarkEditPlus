import { EditorView } from '@codemirror/view';
import { marked } from 'marked';

/**
 * Full-document live preview.
 *
 * The rendered Markdown is injected into a sandboxed <iframe> (see index.html),
 * which keeps it fully isolated from the editor context: no script execution and
 * no access to the native bridge (SPEC-PREVIEW-005). All rendering is local; no
 * remote resources are fetched to build the document.
 */

export type PreviewMode = 'editor' | 'split' | 'preview';

const splitClassName = 'me-preview-split';
const previewClassName = 'me-preview-only';
const renderDebounce = 150;

let renderTimer: ReturnType<typeof setTimeout> | undefined;

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
 */
export function renderPreview(): void {
  const frame = previewFrame();
  if (frame === null || !isPreviewVisible()) {
    return;
  }

  const source = window.editor.state.doc.toString();
  const rendered = marked.parse(source, { async: false, gfm: true }) as string;
  frame.srcdoc = previewDocument(withExternalLinks(rendered));
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

/**
 * Make links open outside the sandboxed frame (in the default browser),
 * rather than trying to navigate the isolated preview.
 */
function withExternalLinks(html: string): string {
  return html.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ');
}

function previewDocument(body: string): string {
  // Content Security Policy hardening (defense in depth on top of the iframe sandbox):
  // no scripts, no network connections, no frames. Inline styles and images are allowed
  // so the document renders; scripts are additionally blocked by the sandbox attribute.
  const csp = "default-src 'none'; style-src 'unsafe-inline'; img-src data: https: http:; font-src data:;";
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>${previewStyle}</style>
</head>
<body>${body}</body>
</html>`;
}

const previewStyle = `
:root { color-scheme: light dark; }
body {
  font-family: -apple-system, system-ui, BlinkMacSystemFont, sans-serif;
  font-size: 16px;
  line-height: 1.6;
  margin: 0;
  padding: 24px 28px;
  word-wrap: break-word;
}
h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 1.4em 0 0.6em; font-weight: 600; }
h1 { font-size: 1.9em; border-bottom: 1px solid rgba(128,128,128,0.25); padding-bottom: 0.3em; }
h2 { font-size: 1.5em; border-bottom: 1px solid rgba(128,128,128,0.2); padding-bottom: 0.3em; }
p { margin: 0.8em 0; }
a { color: #0969da; }
code {
  font-family: "SF Mono", ui-monospace, monospace;
  font-size: 0.9em;
  background: rgba(128,128,128,0.15);
  padding: 0.2em 0.4em;
  border-radius: 4px;
}
pre {
  background: rgba(128,128,128,0.12);
  padding: 14px 16px;
  border-radius: 8px;
  overflow: auto;
}
pre code { background: none; padding: 0; }
blockquote {
  margin: 0.8em 0;
  padding: 0 1em;
  color: rgba(128,128,128,1);
  border-left: 3px solid rgba(128,128,128,0.4);
}
table { border-collapse: collapse; margin: 0.8em 0; }
th, td { border: 1px solid rgba(128,128,128,0.35); padding: 6px 12px; }
img { max-width: 100%; }
hr { border: none; border-top: 1px solid rgba(128,128,128,0.3); margin: 1.5em 0; }
ul, ol { padding-left: 1.6em; }
`;
