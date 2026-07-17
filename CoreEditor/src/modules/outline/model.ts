import { HeadingInfo } from '../toc';

/**
 * Pure model behind the outline panel.
 *
 * Kept free of the DOM so the structure and the hierarchy validation can be tested on their
 * own. The panel (index.ts) turns these items into elements; everything decided here — order,
 * indentation depth, which heading skips a level — is derivable from the headings alone.
 */

export interface OutlineItem {
  heading: HeadingInfo;
  /** Indentation depth, 0 for the shallowest heading present. */
  depth: number;
  /** Set when this heading skips one or more levels below the previous one (e.g. H1 → H3). */
  warning?: string;
}

/**
 * Build the outline entries from the document headings.
 *
 * Depth is relative to the shallowest heading present, so a document of h2/h3 starts flush
 * left. A heading is flagged when it descends more than one level past the previous heading,
 * which is the jump the spec calls out (H1 → H3 with no H2 between). Going back up any number
 * of levels is fine — only skipping levels downward is a structural problem.
 */
export function buildOutline(headings: HeadingInfo[]): OutlineItem[] {
  if (headings.length === 0) {
    return [];
  }

  const shallowest = Math.min(...headings.map(heading => heading.level));
  const items: OutlineItem[] = [];
  let previousLevel: number | undefined;

  for (const heading of headings) {
    const item: OutlineItem = { heading, depth: heading.level - shallowest };

    if (previousLevel !== undefined && heading.level > previousLevel + 1) {
      item.warning = hierarchyWarning(previousLevel, heading.level);
    }

    items.push(item);
    previousLevel = heading.level;
  }

  return items;
}

function hierarchyWarning(from: number, to: number): string {
  return `Se pasó de H${from} a H${to} sin un H${from + 1} intermedio.`;
}
