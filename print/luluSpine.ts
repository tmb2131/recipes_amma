/**
 * Lulu hardcover casewrap / linen spine widths by page count.
 * @see https://help.api.lulu.com/en/support/solutions/articles/64000254616
 *
 * Not a linear pages × paper-thickness formula — Lulu uses fixed buckets.
 */

/** Upper inclusive page count → spine width in inches. */
const LULU_HARDCOVER_SPINE_MAX_PAGES: readonly (readonly [number, number])[] = [
  [84, 0.25],
  [140, 0.5],
  [168, 0.625],
  [194, 0.6875],
  [222, 0.75],
  [250, 0.8125],
  [278, 0.875],
  [306, 0.9375],
  [334, 1],
  [360, 1.0625],
  [388, 1.125],
  [416, 1.1875],
  [444, 1.25],
  [472, 1.3125],
  [500, 1.375],
  [528, 1.4375],
  [556, 1.5],
  [582, 1.5625],
  [610, 1.625],
  [638, 1.6875],
  [666, 1.75],
  [694, 1.8125],
  [722, 1.875],
  [750, 1.9375],
  [778, 2],
  [800, 2.0625],
] as const;

const SPINE_OVER_800_INCHES = 2.125;
const MIN_PAGES = 24;

/**
 * Spine width in inches for Lulu Premium Hardcover (casewrap).
 */
export function luluHardcoverSpineInches(pageCount: number): number {
  if (pageCount < MIN_PAGES) {
    throw new Error(
      `Lulu hardcover requires at least ${MIN_PAGES} pages (got ${pageCount}).`
    );
  }
  if (pageCount > 800) {
    return SPINE_OVER_800_INCHES;
  }
  for (const [maxPages, spineInches] of LULU_HARDCOVER_SPINE_MAX_PAGES) {
    if (pageCount <= maxPages) {
      return spineInches;
    }
  }
  return SPINE_OVER_800_INCHES;
}
