/** LaTeX and JSON for a ring's current reconstruction (rendered by the equation panel). */
import type { RingSeries } from '../fourier/types';

/** Terms written out in full before the "+ … (m more terms)" tail. */
export const SHOWN_TERMS = 5;
/** Significant figures for radii and phases. */
const DIGITS = 3;

/** A number as LaTeX with `DIGITS` significant figures; scientific notation outside 1e-3…1e5. */
export function formatNumber(x: number): string {
  if (x === 0) return '0';
  const abs = Math.abs(x);
  if (abs >= 1e-3 && abs < 1e5) return String(Number(x.toPrecision(DIGITS)));
  const [mantissa, exponent] = x.toExponential(DIGITS - 1).split('e');
  return `${Number(mantissa)}\\times10^{${Number(exponent)}}`;
}

/** `r·e^{iφ}` for a coefficient. */
function polar(re: number, im: number): string {
  return `${formatNumber(Math.hypot(re, im))}\\,e^{${formatNumber(Math.atan2(im, re))}i}`;
}

/** `e^{ikt}` with k = ±1 written as `e^{it}` / `e^{-it}`. */
function rotation(k: number): string {
  const coefficient = k === 1 ? '' : k === -1 ? '-' : String(k);
  return `e^{${coefficient}it}`;
}

/** The general form of the series. */
export const GENERAL_LATEX = 'z(t) = c_0 + \\sum_{k} c_k\\, e^{ikt}';

/**
 * The reconstruction with `terms` terms: c₀ and up to `SHOWN_TERMS` terms in polar form (km,
 * radians), `perLine` terms per line, then a count of the remaining terms.
 */
export function reconstructionLatex(ring: RingSeries, terms: number, perLine = 2): string {
  const count = Math.min(terms, ring.n);
  const shown = Math.min(count, SHOWN_TERMS);
  const parts: string[] = [];
  for (let j = 0; j < shown; j++) parts.push(`${polar(ring.re[j], ring.im[j])}\\,${rotation(ring.k[j])}`);
  const rest = count - shown;
  if (rest > 0) parts.push(`\\cdots\\;(\\text{${rest} more ${rest === 1 ? 'term' : 'terms'}})`);

  const lines = [`z(t) \\approx\\; & ${polar(...ring.c0)}`];
  for (let i = 0; i < parts.length; i += perLine) lines.push(`& + ${parts.slice(i, i + perLine).join(' + ')}`);
  return `\\begin{aligned} ${lines.join(' \\\\ ')} \\end{aligned}`;
}

/** All current terms of a ring (c₀ first, as k = 0) as pretty-printed JSON. */
export function coefficientsJson(ring: RingSeries, terms: number, label: string): string {
  const term = (k: number, re: number, im: number) => ({
    k,
    re,
    im,
    amplitude: Math.hypot(re, im),
    phase: Math.atan2(im, re),
  });
  const count = Math.min(terms, ring.n);
  const list = [term(0, ...ring.c0)];
  for (let j = 0; j < count; j++) list.push(term(ring.k[j], ring.re[j], ring.im[j]));
  return JSON.stringify({ ring: label, units: 'km', terms: list }, null, 2);
}

/** Dropdown label for ring `index` (rings are sorted largest first). */
export function ringLabel(index: number): string {
  return index === 0 ? 'Main polygon' : `Island ${index + 1}`;
}
