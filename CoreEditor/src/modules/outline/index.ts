import { EditorView } from '@codemirror/view';
import { HeadingInfo, getTableOfContents, gotoHeader } from '../toc';
import { OutlineItem, buildOutline } from './model';

/**
 * Document outline panel.
 *
 * A live, navigable list of the document's headings, living in the DOM next to the editor —
 * the same arrangement as the preview split. All data comes from getTableOfContents(), which
 * already reports the heading levels and which section holds the cursor; this module only
 * turns that into a panel and keeps it in sync as the document and selection change.
 */

const visibleClassName = 'me-outline-visible';
const renderDebounce = 150;

let renderTimer: ReturnType<typeof setTimeout> | undefined;
// Kept so selection changes can restyle the active row without rebuilding the whole list.
let rendered: { item: OutlineItem; element: HTMLElement }[] = [];

function outlinePanel(): HTMLElement | null {
  return document.getElementById('outline');
}

function isVisible(): boolean {
  return document.body.classList.contains(visibleClassName);
}

/** Show or hide the outline panel; rendering happens only while it is visible. */
export function setOutlineVisible(visible: boolean): void {
  document.body.classList.toggle(visibleClassName, visible);

  if (visible) {
    renderOutline();
  }
}

/** Rebuild the panel from the current headings. */
export function renderOutline(): void {
  const panel = outlinePanel();
  if (panel === null || !isVisible()) {
    return;
  }

  const items = buildOutline(getTableOfContents());
  panel.replaceChildren();
  rendered = [];

  if (items.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'me-outline-empty';
    empty.textContent = 'Sin encabezados';
    panel.append(empty);
    return;
  }

  for (const item of items) {
    const element = rowElement(item);
    panel.append(element);
    rendered.push({ item, element });
  }
}

function rowElement(item: OutlineItem): HTMLElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'me-outline-item';
  button.style.paddingInlineStart = `${8 + item.depth * 14}px`;
  button.dataset.level = `${item.heading.level}`;
  button.classList.toggle('active', item.heading.selected);

  const label = document.createElement('span');
  label.className = 'me-outline-label';
  label.textContent = item.heading.title;
  button.append(label);

  if (item.warning !== undefined) {
    button.classList.add('me-outline-warning');
    button.title = item.warning;
    button.setAttribute('aria-label', `${item.heading.title} — ${item.warning}`);

    const badge = document.createElement('span');
    badge.className = 'me-outline-badge';
    badge.setAttribute('aria-hidden', 'true');
    badge.textContent = '!';
    button.append(badge);
  }

  button.addEventListener('click', () => gotoHeader(item.heading));
  return button;
}

/**
 * Restyle the active row after the cursor moves, without rebuilding the list.
 *
 * getTableOfContents() recomputes `selected` from the current cursor, so re-reading it and
 * toggling one class is enough — far cheaper than re-rendering on every cursor move.
 */
function refreshActive(): void {
  if (!isVisible() || rendered.length === 0) {
    return;
  }

  const headings = getTableOfContents();
  rendered.forEach(({ element }, index) => {
    element.classList.toggle('active', headings[index]?.selected ?? false);
  });
}

function scheduleRender(): void {
  if (!isVisible()) {
    return;
  }

  if (renderTimer !== undefined) {
    clearTimeout(renderTimer);
  }

  renderTimer = setTimeout(renderOutline, renderDebounce);
}

/**
 * CodeMirror extension: keep the outline in sync. Structural edits rebuild the list (debounced);
 * a bare cursor move only restyles the active row.
 */
export function outlineUpdateListener() {
  return EditorView.updateListener.of(update => {
    if (update.docChanged) {
      scheduleRender();
    } else if (update.selectionSet) {
      refreshActive();
    }
  });
}

export type { HeadingInfo };
