import { describe, expect, test } from '@jest/globals';
import { HeadingInfo } from '../src/modules/toc';
import { buildOutline } from '../src/modules/outline/model';

function headings(...levels: number[]): HeadingInfo[] {
  return levels.map((level, index) => ({
    title: `H${level} #${index}`,
    level: level as CodeGen_Int,
    from: index as CodeGen_Int,
    to: index as CodeGen_Int,
    selected: false,
  }));
}

describe('Outline model', () => {
  test('test an empty document yields no items', () => {
    expect(buildOutline([])).toEqual([]);
  });

  test('test depth is relative to the shallowest heading', () => {
    const items = buildOutline(headings(1, 2, 3, 2));
    expect(items.map(item => item.depth)).toEqual([0, 1, 2, 1]);
  });

  test('test a document without h1 still starts flush left', () => {
    const items = buildOutline(headings(2, 3, 3));
    expect(items.map(item => item.depth)).toEqual([0, 1, 1]);
  });

  test('test a skipped level is flagged with a warning', () => {
    const items = buildOutline(headings(1, 3));
    expect(items[0].warning).toBeUndefined();
    expect(items[1].warning).toBe('Se pasó de H1 a H3 sin un H2 intermedio.');
  });

  test('test descending one level at a time is not flagged', () => {
    const items = buildOutline(headings(1, 2, 3, 4));
    expect(items.every(item => item.warning === undefined)).toBe(true);
  });

  test('test going back up any number of levels is allowed', () => {
    // H3 → H1 is a valid return to a top section, not a skipped level.
    const items = buildOutline(headings(1, 2, 3, 1));
    expect(items[3].warning).toBeUndefined();
  });

  test('test order follows the document', () => {
    const items = buildOutline(headings(2, 1, 2));
    expect(items.map(item => item.heading.level)).toEqual([2, 1, 2]);
  });

  test('test duplicate headings all remain', () => {
    const items = buildOutline(headings(2, 2, 2));
    expect(items).toHaveLength(3);
  });

  test('test the warning names the missing intermediate level', () => {
    const items = buildOutline(headings(2, 5));
    expect(items[1].warning).toBe('Se pasó de H2 a H5 sin un H3 intermedio.');
  });
});
