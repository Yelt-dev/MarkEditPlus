import { EditorView } from '@codemirror/view';
import { FieldKey, knownFields, readFields, setField } from './fields';

/**
 * Frontmatter form panel (FRONTMATTER-001).
 *
 * A form of the document's metadata, living in the DOM beside the editor like the outline and
 * inspector. The editor stays the source of truth: the form reads from it and, on edit, writes
 * one field back through setField (which preserves everything it doesn't manage). The raw YAML
 * remains editable in the editor itself — that is the "code mode".
 */

const visibleClassName = 'me-frontmatter-visible';
const renderDebounce = 200;

const fieldLabels: Record<FieldKey, string> = {
  title: 'Título',
  subtitle: 'Subtítulo',
  author: 'Autor',
  date: 'Fecha',
  language: 'Idioma',
  description: 'Descripción',
  keywords: 'Palabras clave',
  template: 'Plantilla',
  page_size: 'Tamaño de página',
  orientation: 'Orientación',
};

const multiline: Set<FieldKey> = new Set(['description']);

let renderTimer: ReturnType<typeof setTimeout> | undefined;
// True while we are writing a field, so the resulting doc change doesn't rebuild the form
// under the user's cursor.
let applying = false;
const inputs = new Map<FieldKey, HTMLInputElement | HTMLTextAreaElement>();

function panel(): HTMLElement | null {
  return document.getElementById('frontmatter');
}

function isVisible(): boolean {
  return document.body.classList.contains(visibleClassName);
}

export function setFrontMatterVisible(visible: boolean): void {
  document.body.classList.toggle(visibleClassName, visible);

  if (visible) {
    renderFrontMatter();
  }
}

/** Rebuild the form from the document. */
export function renderFrontMatter(): void {
  const container = panel();
  if (container === null || !isVisible()) {
    return;
  }

  const fields = readFields(window.editor.state.doc.toString());
  container.replaceChildren();
  inputs.clear();

  const form = document.createElement('div');
  form.className = 'me-frontmatter-form';

  for (const key of knownFields) {
    form.append(fieldRow(key, fields.values[key] ?? ''));
  }

  container.append(form);

  if (fields.unknownKeys.length > 0) {
    const note = document.createElement('p');
    note.className = 'me-frontmatter-note';
    note.textContent = `Otros campos se conservan sin tocar: ${fields.unknownKeys.join(', ')}.`;
    container.append(note);
  }
}

function fieldRow(key: FieldKey, value: string): HTMLElement {
  const row = document.createElement('label');
  row.className = 'me-frontmatter-field';

  const name = document.createElement('span');
  name.className = 'me-frontmatter-label';
  name.textContent = fieldLabels[key];

  const input = multiline.has(key) ? document.createElement('textarea') : document.createElement('input');
  input.className = 'me-frontmatter-input';
  input.value = value;
  if (input instanceof HTMLInputElement) {
    input.type = 'text';
  } else {
    input.rows = 2;
  }

  input.addEventListener('input', () => writeField(key, input.value));
  inputs.set(key, input);

  row.append(name, input);
  return row;
}

/** Write one field back to the document in a single transaction. */
function writeField(key: FieldKey, value: string): void {
  const source = window.editor.state.doc.toString();
  const next = setField(source, key, value);
  if (next === source) {
    return;
  }

  applying = true;
  window.editor.dispatch({ changes: { from: 0, to: source.length, insert: next } });
  applying = false;
}

function scheduleRender(): void {
  if (!isVisible() || applying) {
    return;
  }

  if (renderTimer !== undefined) {
    clearTimeout(renderTimer);
  }

  renderTimer = setTimeout(renderFrontMatter, renderDebounce);
}

/**
 * CodeMirror extension: keep the form in sync with edits made in the editor, but not with the
 * edits the form itself makes (guarded by `applying`), so typing in a field isn't interrupted.
 */
export function frontMatterUpdateListener() {
  return EditorView.updateListener.of(update => {
    if (update.docChanged) {
      scheduleRender();
    }
  });
}
