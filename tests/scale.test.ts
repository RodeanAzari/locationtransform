import { describe, expect, it } from 'vitest';
import { positionToTerms, snapPosition, snapStops, termsToPosition } from '../src/ui/scale';

describe('slider scale', () => {
  it('maps the ends to 1 and N', () => {
    expect(positionToTerms(0, 400)).toBe(1);
    expect(positionToTerms(1, 400)).toBe(400);
  });

  it('is logarithmic, so 1–50 is not squeezed into a sliver', () => {
    expect(termsToPosition(50, 2000)).toBeGreaterThan(0.5);
    expect(positionToTerms(0.5, 400)).toBe(20);
  });

  it('round-trips term counts', () => {
    for (const n of [1, 3, 10, 50, 123, 400]) {
      expect(positionToTerms(termsToPosition(n, 400), 400)).toBe(n);
    }
  });

  it('handles N = 1', () => {
    expect(termsToPosition(1, 1)).toBe(0);
    expect(positionToTerms(0.7, 1)).toBe(1);
  });
});

describe('snap stops', () => {
  it('adds N and drops points at or above it', () => {
    expect(snapStops([1, 3, 10, 50], 200)).toEqual([1, 3, 10, 50, 200]);
    expect(snapStops([1, 3, 10, 50], 10)).toEqual([1, 3, 10]);
    expect(snapStops([1, 3, 10, 50], 1)).toEqual([1]);
  });

  it('snaps nearby positions only', () => {
    const stops = [1, 3, 10, 50, 200];
    const at10 = termsToPosition(10, 200);
    expect(snapPosition(at10 + 0.01, stops, 200, 0.015)).toBe(at10);
    expect(snapPosition(at10 + 0.05, stops, 200, 0.015)).toBe(at10 + 0.05);
  });
});
