import { describe, expect, it } from 'vitest';
import { epicycleCentres, placeErrorAt, ringErrorAt, tracePath } from '../src/fourier/series';
import type { PlaceSeries, RingSeries } from '../src/fourier/types';

function ring(terms: [k: number, re: number, im: number][], curve: [n: number, error: number][]): RingSeries {
  return {
    c0: [10, 20],
    k: Int32Array.from(terms.map((t) => t[0])),
    re: Float64Array.from(terms.map((t) => t[1])),
    im: Float64Array.from(terms.map((t) => t[2])),
    n: terms.length,
    error: curve[curve.length - 1][1],
    targetReached: true,
    curveN: Uint32Array.from(curve.map((c) => c[0])),
    curveError: Float64Array.from(curve.map((c) => c[1])),
    truth: new Float64Array(),
  };
}

describe('tracePath', () => {
  it('evaluates c0 + Σ c_k e^{ikt}', () => {
    const r = ring(
      [
        [1, 5, 0],
        [-2, 0, 1],
      ],
      [[2, 0]],
    );
    const count = 16;
    const path = tracePath(r, 2, count);
    for (let p = 0; p < count; p++) {
      const t = (2 * Math.PI * p) / count;
      const x = 10 + 5 * Math.cos(t) - Math.sin(-2 * t);
      const y = 20 + 5 * Math.sin(t) + Math.cos(-2 * t);
      expect(path[2 * p]).toBeCloseTo(x, 9);
      expect(path[2 * p + 1]).toBeCloseTo(y, 9);
    }
  });

  it('uses only the requested number of terms', () => {
    const r = ring(
      [
        [1, 5, 0],
        [3, 1, 0],
      ],
      [[2, 0]],
    );
    const path = tracePath(r, 1, 4);
    expect([path[0], path[1], path[2], path[3]]).toEqual([15, 20, 10, 25]);
  });
});

describe('epicycleCentres', () => {
  it('chains arms from c0, ending at the path point', () => {
    const r = ring(
      [
        [1, 5, 0],
        [-2, 0, 1],
      ],
      [[2, 0]],
    );
    const t = 0.7;
    const centres = epicycleCentres(r, 50, t);
    expect(centres).toHaveLength(6);
    expect([centres[0], centres[1]]).toEqual([10, 20]);
    expect(centres[4]).toBeCloseTo(10 + 5 * Math.cos(t) - Math.sin(-2 * t), 12);
    expect(centres[5]).toBeCloseTo(20 + 5 * Math.sin(t) + Math.cos(-2 * t), 12);
  });
});

describe('error readout', () => {
  const r = ring(
    Array.from({ length: 100 }, (_, i) => [i + 1, 1, 0]),
    [
      [1, 0.1],
      [10, 0.01],
      [100, 0.001],
    ],
  );

  it('returns sampled values exactly and interpolates in log n between them', () => {
    expect(ringErrorAt(r, 1)).toBe(0.1);
    expect(ringErrorAt(r, 10)).toBe(0.01);
    expect(ringErrorAt(r, Math.round(Math.sqrt(1000)))).toBeCloseTo(0.0055, 3);
  });

  it('holds the final error beyond N_i', () => {
    expect(ringErrorAt(r, 5000)).toBe(0.001);
  });

  it('takes the worst ring for the place', () => {
    const place: PlaceSeries = { rings: [r, ring([[1, 1, 0]], [[1, 0.5]])], droppedRings: 0, diagonal: 1, n: 100 };
    expect(placeErrorAt(place, 100)).toBe(0.5);
  });
});
