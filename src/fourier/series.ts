/** Evaluating truncated Fourier series on the UI side: paths, epicycle chains, error readout. */
import type { PlaceSeries, RingSeries } from './types';

/**
 * Normalized error of one ring with `n` terms, interpolated (in log n) from its error curve.
 * Beyond N_i the ring stays at its final error.
 */
export function ringErrorAt(ring: RingSeries, n: number): number {
  const { curveN, curveError } = ring;
  const target = Math.min(Math.max(n, 1), ring.n);
  // The curve always ends at N_i, so some entry is ≥ target.
  const hi = curveN.findIndex((k) => k >= target);
  if (curveN[hi] === target) return curveError[hi];
  const lo = hi - 1;
  const span = Math.log(curveN[hi]) - Math.log(curveN[lo]);
  const f = (Math.log(target) - Math.log(curveN[lo])) / span;
  return curveError[lo] + f * (curveError[hi] - curveError[lo]);
}

/** Error of the whole place with `n` terms: the worst ring. */
export function placeErrorAt(place: PlaceSeries, n: number): number {
  return Math.max(...place.rings.map((ring) => ringErrorAt(ring, n)));
}

/**
 * Points of `z(t) = c₀ + Σ_{j<terms} c_j e^{i k_j t}` at `count` evenly spaced t in [0, 2π),
 * interleaved x, y. Uses a rotation recurrence per term instead of trig per point.
 */
export function tracePath(ring: RingSeries, terms: number, count: number): Float64Array {
  const out = new Float64Array(2 * count);
  for (let p = 0; p < count; p++) {
    out[2 * p] = ring.c0[0];
    out[2 * p + 1] = ring.c0[1];
  }
  for (let j = 0; j < Math.min(terms, ring.n); j++) {
    const step = (2 * Math.PI * ring.k[j]) / count;
    const [wr, wi] = [Math.cos(step), Math.sin(step)];
    let [zr, zi] = [ring.re[j], ring.im[j]];
    for (let p = 0; p < count; p++) {
      out[2 * p] += zr;
      out[2 * p + 1] += zi;
      [zr, zi] = [zr * wr - zi * wi, zr * wi + zi * wr];
    }
  }
  return out;
}

/**
 * Centres of the first `drawn` epicycles at time t, interleaved x, y: entry 0 is c₀, entry j is
 * the tip of term j−1's arm (and the centre of circle j).
 */
export function epicycleCentres(ring: RingSeries, drawn: number, t: number): Float64Array {
  const count = Math.min(drawn, ring.n);
  const out = new Float64Array(2 * (count + 1));
  let [x, y] = ring.c0;
  out[0] = x;
  out[1] = y;
  for (let j = 0; j < count; j++) {
    const angle = ring.k[j] * t;
    const [c, s] = [Math.cos(angle), Math.sin(angle)];
    x += ring.re[j] * c - ring.im[j] * s;
    y += ring.re[j] * s + ring.im[j] * c;
    out[2 * j + 2] = x;
    out[2 * j + 3] = y;
  }
  return out;
}
