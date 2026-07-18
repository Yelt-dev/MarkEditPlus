/**
 * Page setup for PDF export (EXPORT-002): normalize the free-text `page_size` / `orientation`
 * frontmatter fields into a fixed vocabulary the native PDF exporter can size pages from.
 *
 * Kept in its own module (no marked / highlight.js imports) so it stays trivially unit-testable.
 */

export type PageSizeId = 'a4' | 'letter' | 'legal';
export type OrientationId = 'portrait' | 'landscape';

export interface ExportPageSetup {
  pageSize: PageSizeId;
  orientation: OrientationId;
}

/**
 * The form lets the user type freely (and in Spanish), so accept the obvious spellings:
 * "A4" / "Letter" / "Carta" / "Legal" / "Oficio", and
 * "vertical" / "horizontal" / "landscape" / "apaisado".
 *
 * Anything unrecognized falls back to A4 portrait — the size the PDF exporter used before this
 * became configurable, so an empty or garbled value never changes long-standing behavior.
 */
export function normalizePageSetup(pageSize?: string, orientation?: string): ExportPageSetup {
  const size = (pageSize ?? '').toLowerCase();
  const resolvedSize: PageSizeId = /legal|oficio/.test(size)
    ? 'legal'
    : /letter|carta/.test(size)
      ? 'letter'
      : 'a4';

  const orient = (orientation ?? '').toLowerCase();
  const resolvedOrientation: OrientationId = /land|horiz|apais|paisaje|wide/.test(orient)
    ? 'landscape'
    : 'portrait';

  return { pageSize: resolvedSize, orientation: resolvedOrientation };
}
