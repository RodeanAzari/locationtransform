import { describe, expect, it } from 'vitest';
import type { RingSeries } from '../src/fourier/types';
import { coefficientsJson, formatNumber, reconstructionLatex, ringLabel } from '../src/ui/equation';

function ring(n: number): RingSeries {
  return {
    c0: [3, 4],
    k: Int32Array.from({ length: n }, (_, j) => (j % 2 === 0 ? j / 2 + 1 : -(j + 1) / 2)),
    re: Float64Array.from({ length: n }, (_, j) => 100 / (j + 1)),
    im: new Float64Array(n),
    n,
    error: 0.001,
    targetReached: true,
    curveN: new Uint32Array([n]),
    curveError: new Float64Array([0.001]),
    truth: new Float64Array(),
  };
}

describe('formatNumber', () => {
  it('uses three significant figures', () => {
    expect(formatNumber(123.456)).toBe('123');
    expect(formatNumber(0.012345)).toBe('0.0123');
    expect(formatNumber(-3.14159)).toBe('-3.14');
    expect(formatNumber(54321)).toBe('54300');
    expect(formatNumber(0)).toBe('0');
  });

  it('switches to scientific notation for very large or small values', () => {
    expect(formatNumber(0.000123456)).toBe('1.23\\times10^{-4}');
    expect(formatNumber(123456)).toBe('1.23\\times10^{5}');
  });
});

describe('reconstructionLatex', () => {
  it('writes c0 and every term in polar form when n ≤ 5', () => {
    const latex = reconstructionLatex(ring(3), 3);
    expect(latex).toContain('5\\,e^{0.927i}'); // c0 = 3 + 4i
    expect(latex).toContain('100\\,e^{0i}\\,e^{it}');
    expect(latex).toContain('50\\,e^{0i}\\,e^{-it}');
    expect(latex).toContain('33.3\\,e^{0i}\\,e^{2it}');
    expect(latex).not.toContain('more');
  });

  it('shows five terms then counts the rest', () => {
    const latex = reconstructionLatex(ring(40), 12);
    expect(latex).toContain('(\\text{7 more terms})');
    expect(latex.match(/e\^\{-?\d*it\}/g)).toHaveLength(5);
  });

  it('puts the requested number of terms on each line', () => {
    // Lines are separated by LaTeX's " \\ ": c0, then 5 terms + tail.
    expect(reconstructionLatex(ring(40), 12, 1).split(' \\\\ ')).toHaveLength(7);
    expect(reconstructionLatex(ring(40), 12, 2).split(' \\\\ ')).toHaveLength(4);
  });

  it('caps at the ring’s own N and uses the singular for one term', () => {
    expect(reconstructionLatex(ring(6), 50)).toContain('(\\text{1 more term})');
  });
});

describe('coefficientsJson', () => {
  it('lists c0 as k = 0 followed by the current terms', () => {
    const parsed = JSON.parse(coefficientsJson(ring(10), 2, 'Main polygon'));
    expect(parsed.ring).toBe('Main polygon');
    expect(parsed.units).toBe('km');
    expect(parsed.terms).toHaveLength(3);
    expect(parsed.terms[0]).toEqual({ k: 0, re: 3, im: 4, amplitude: 5, phase: Math.atan2(4, 3) });
    expect(parsed.terms[2]).toMatchObject({ k: -1, re: 50, im: 0, amplitude: 50, phase: 0 });
  });
});

describe('ringLabel', () => {
  it('names the largest ring and numbers the islands', () => {
    expect(ringLabel(0)).toBe('Main polygon');
    expect(ringLabel(1)).toBe('Island 2');
  });
});
