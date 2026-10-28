/** Planar ring measures, the small-island filter, and ring orientation. */
import type { XYRing } from './project';

/** Signed shoelace area; positive for counter-clockwise rings (y up). */
export function signedArea(ring: XYRing): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

/** Returns the ring counter-clockwise, reversing it if needed. */
export function counterClockwise(ring: XYRing): XYRing {
  return signedArea(ring) < 0 ? [...ring].reverse() : ring;
}

export interface IslandFilterResult {
  /** Kept rings, largest area first. */
  kept: XYRing[];
  /** How many rings were dropped. */
  dropped: number;
}

/**
 * Keeps rings with area ≥ `minFraction` of the total, at most `maxRings` of them, largest
 * first. The largest ring is always kept.
 */
export function filterIslands(rings: XYRing[], minFraction: number, maxRings: number): IslandFilterResult {
  const withArea = rings.map((ring) => ({ ring, area: Math.abs(signedArea(ring)) }));
  const total = withArea.reduce((sum, r) => sum + r.area, 0);
  withArea.sort((a, b) => b.area - a.area);
  const kept = withArea
    .filter((r, i) => i === 0 || r.area >= minFraction * total)
    .slice(0, Math.max(1, maxRings))
    .map((r) => r.ring);
  return { kept, dropped: rings.length - kept.length };
}

/** Diagonal of the bounding box of all rings together. */
export function boundingDiagonal(rings: XYRing[]): number {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const ring of rings) {
    for (const [x, y] of ring) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return Math.hypot(maxX - minX, maxY - minY);
}
