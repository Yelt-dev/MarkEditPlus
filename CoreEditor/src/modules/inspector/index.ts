import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { scrollToSelection } from '../selection';
import { saveGoBackSelection } from '../selection/navigate';
import selectWithRanges from '../selection/selectWithRanges';
import { Metrics, computeMetrics } from './metrics';
import { Finding, validateDocument } from './validate';

/**
 * Document inspector panel.
 *
 * A live panel beside the editor — same arrangement as the outline and the preview — showing
 * document metrics and read-only structural findings. Clicking a finding navigates to it. The
 * inspector never modifies the document. All figures come from computeMetrics/validateDocument,
 * which read the editor's own syntax tree.
 */

const visibleClassName = 'me-inspector-visible';
const renderDebounce = 200;

let renderTimer: ReturnType<typeof setTimeout> | undefined;

function inspectorPanel(): HTMLElement | null {
  return document.getElementById('inspector');
}

function isVisible(): boolean {
  return document.body.classList.contains(visibleClassName);
}

export function setInspectorVisible(visible: boolean): void {
  document.body.classList.toggle(visibleClassName, visible);

  if (visible) {
    renderInspector();
  }
}

export function renderInspector(): void {
  const panel = inspectorPanel();
  if (panel === null || !isVisible()) {
    return;
  }

  const state = window.editor.state;
  panel.replaceChildren(
    metricsSection(computeMetrics(state)),
    findingsSection(validateDocument(state)),
  );
}

const metricLabels: [keyof Metrics, string][] = [
  ['words', 'Palabras'],
  ['characters', 'Caracteres'],
  ['charactersNoSpaces', 'Caracteres sin espacios'],
  ['lines', 'Líneas'],
  ['paragraphs', 'Párrafos'],
  ['headings', 'Encabezados'],
  ['links', 'Enlaces'],
  ['images', 'Imágenes'],
  ['tables', 'Tablas'],
  ['codeBlocks', 'Bloques de código'],
];

function metricsSection(metrics: Metrics): HTMLElement {
  const section = document.createElement('section');
  section.className = 'me-inspector-metrics';

  for (const [key, label] of metricLabels) {
    section.append(metricRow(label, `${metrics[key]}`));
  }

  section.append(metricRow('Tamaño', formatBytes(metrics.bytes)));
  section.append(metricRow('Tiempo de lectura', formatReadingTime(metrics.readingMinutes)));
  return section;
}

function metricRow(label: string, value: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'me-inspector-row';

  const name = document.createElement('span');
  name.className = 'me-inspector-name';
  name.textContent = label;

  const amount = document.createElement('span');
  amount.className = 'me-inspector-value';
  amount.textContent = value;

  row.append(name, amount);
  return row;
}

function findingsSection(findings: Finding[]): HTMLElement {
  const section = document.createElement('section');
  section.className = 'me-inspector-findings';

  const heading = document.createElement('h2');
  heading.className = 'me-inspector-heading';
  heading.textContent = findings.length === 0 ? 'Sin problemas' : `Problemas (${findings.length})`;
  section.append(heading);

  for (const finding of findings) {
    section.append(findingRow(finding));
  }

  return section;
}

function findingRow(finding: Finding): HTMLElement {
  const navigable = finding.from !== undefined;
  const row = document.createElement(navigable ? 'button' : 'div');
  row.className = `me-inspector-finding ${finding.severity}`;

  if (row instanceof HTMLButtonElement) {
    row.type = 'button';
    row.addEventListener('click', () => navigateTo(finding.from as number));
  }

  const dot = document.createElement('span');
  dot.className = 'me-inspector-dot';
  dot.setAttribute('aria-hidden', 'true');

  const message = document.createElement('span');
  message.className = 'me-inspector-message';
  message.textContent = finding.line !== undefined ? `${finding.message} (línea ${finding.line})` : finding.message;

  row.append(dot, message);
  return row;
}

/** Navigate the editor to a document offset, mirroring how the outline jumps to a heading. */
function navigateTo(from: number): void {
  saveGoBackSelection();
  selectWithRanges([EditorSelection.cursor(from)]);
  scrollToSelection('start');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kb = bytes / 1024;
  return kb < 1024 ? `${kb.toFixed(1)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

function formatReadingTime(minutes: number): string {
  return minutes < 1 ? '< 1 min' : `${minutes} min`;
}

function scheduleRender(): void {
  if (!isVisible()) {
    return;
  }

  if (renderTimer !== undefined) {
    clearTimeout(renderTimer);
  }

  renderTimer = setTimeout(renderInspector, renderDebounce);
}

/** CodeMirror extension: refresh the inspector when the document changes (debounced). */
export function inspectorUpdateListener() {
  return EditorView.updateListener.of(update => {
    if (update.docChanged) {
      scheduleRender();
    }
  });
}
