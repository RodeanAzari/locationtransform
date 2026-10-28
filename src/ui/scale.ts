/** The slider's log scale: position p ∈ [0, 1] ↔ term count n ∈ [1, N]. */

/** Term count at slider position `p` (n = N^p, rounded). */
export function positionToTerms(p: number, max: number): number {
  return Math.min(max, Math.max(1, Math.round(max ** p)));
}

/** Slider position of term count `n`. */
export function termsToPosition(n: number, max: number): number {
  return max > 1 ? Math.log(n) / Math.log(max) : 0;
}

/** Snap stops: the configured points that are below N, plus N itself, ascending and distinct. */
export function snapStops(points: readonly number[], max: number): number[] {
  return [...new Set([...points.filter((p) => p < max), max])].sort((a, b) => a - b);
}

/** `p`, moved onto the nearest stop if one is within `distance`. */
export function snapPosition(p: number, stops: number[], max: number, distance: number): number {
  for (const stop of stops) {
    const q = termsToPosition(stop, max);
    if (Math.abs(p - q) < distance) return q;
  }
  return p;
}
