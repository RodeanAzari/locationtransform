import { describe, expect, it } from 'vitest';
import { boundingDiagonal, counterClockwise, filterIslands, signedArea } from '../src/geo/islands';
import { preparePlace } from '../src/geo/prepare';
import { projectRings, sphericalCentroid, type XYRing } from '../src/geo/project';
import { outerRings, unwrapLongitudes } from '../src/geo/rings';

const square = (x: number, y: number, side: number): XYRing => [
  [x, y],
  [x + side, y],
  [x + side, y + side],
  [x, y + side],
];

describe('unwrapLongitudes', () => {
  it('removes 360° jumps from a ring crossing the antimeridian', () => {
    const ring = [
      [179, -16],
      [-179, -16],
      [-179, -17],
      [179, -17],
      [179, -16],
    ];
    const unwrapped = unwrapLongitudes(ring);
    for (let i = 1; i < unwrapped.length; i++) {
      expect(Math.abs(unwrapped[i][0] - unwrapped[i - 1][0])).toBeLessThanOrEqual(180);
    }
    expect(unwrapped.map(([lon]) => lon)).toEqual([179, 181, 181, 179, 179]);
    expect(unwrapped.map(([, lat]) => lat)).toEqual(ring.map(([, lat]) => lat));
  });

  it('leaves ordinary rings untouched', () => {
    const ring = [
      [10, 40],
      [12, 40],
      [12, 42],
      [10, 40],
    ];
    expect(unwrapLongitudes(ring)).toEqual(ring);
  });
});

describe('outerRings', () => {
  it('takes the outer ring of each polygon and drops holes', () => {
    const outer = [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 0],
    ];
    const hole = [
      [1, 1],
      [2, 1],
      [2, 2],
      [1, 1],
    ];
    expect(outerRings({ type: 'Polygon', coordinates: [outer, hole] })).toEqual([outer]);
    expect(outerRings({ type: 'MultiPolygon', coordinates: [[outer, hole], [outer]] })).toEqual([outer, outer]);
  });
});

describe('projection', () => {
  it('centres an antimeridian-crossing place near 180°, not 0°', () => {
    const [lon, lat] = sphericalCentroid([
      [
        [178, -17],
        [-178, -17],
      ],
    ]);
    expect(Math.abs(Math.abs(lon) - 180)).toBeLessThan(1e-9);
    expect(lat).toBeCloseTo(-17, 1);
  });

  it('works in kilometres and preserves area', () => {
    // A 1°×1° cell at the equator is ≈ 111.2 km × 111.2 km.
    const [ring] = projectRings(
      [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ],
      ],
      [0.5, 0.5],
    );
    expect(Math.abs(signedArea(ring))).toBeCloseTo(111.19 * 111.19, -2);
    // North is up: the second point (east) has larger x, the third (north) larger y.
    expect(ring[1][0]).toBeGreaterThan(ring[0][0]);
    expect(ring[2][1]).toBeGreaterThan(ring[1][1]);
  });
});

describe('filterIslands', () => {
  it('keeps the largest ring and drops rings below the area threshold', () => {
    const big = square(0, 0, 100);
    const medium = square(200, 0, 10); // 1% of total
    const tiny = square(300, 0, 1); // 0.01%
    const { kept, dropped } = filterIslands([tiny, medium, big], 0.005, 30);
    expect(kept).toEqual([big, medium]);
    expect(dropped).toBe(1);
  });

  it('respects the ring cap', () => {
    const rings = Array.from({ length: 50 }, (_, i) => square(i * 20, 0, 10));
    const { kept, dropped } = filterIslands(rings, 0.005, 30);
    expect(kept).toHaveLength(30);
    expect(dropped).toBe(20);
  });

  it('always keeps the largest ring, even when it is below the threshold', () => {
    const rings = Array.from({ length: 1000 }, (_, i) => square(i * 20, 0, 10));
    const { kept } = filterIslands(rings, 0.005, 30);
    expect(kept).toHaveLength(1);
  });
});

describe('orientation and size', () => {
  it('makes rings counter-clockwise', () => {
    const clockwise = [...square(0, 0, 1)].reverse();
    expect(signedArea(clockwise)).toBeLessThan(0);
    expect(signedArea(counterClockwise(clockwise))).toBeGreaterThan(0);
  });

  it('measures the bounding diagonal of all rings together', () => {
    expect(boundingDiagonal([square(0, 0, 3), square(0, 0, 1)])).toBeCloseTo(Math.hypot(3, 3));
  });
});

describe('preparePlace', () => {
  it('produces a continuous projected ring for a place crossing the antimeridian', () => {
    const { rings, diagonal } = preparePlace({
      type: 'Polygon',
      coordinates: [
        [
          [179, -16],
          [-179, -16],
          [-179, -18],
          [179, -18],
          [179, -16],
        ],
      ],
    });
    expect(rings).toHaveLength(1);
    // ≈ 214 km × 222 km, not a ring stretched across the globe.
    expect(diagonal).toBeGreaterThan(250);
    expect(diagonal).toBeLessThan(350);
    expect(signedArea(rings[0])).toBeGreaterThan(0);
  });
});
