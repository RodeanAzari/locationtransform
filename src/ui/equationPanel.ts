/**
 * Equation panel: the general Fourier series plus the current reconstruction of one ring,
 * rendered with KaTeX (loaded on first use). Re-rendering is throttled while the slider moves.
 */
import type { PlaceSeries } from '../fourier/types';
import { GENERAL_LATEX, coefficientsJson, reconstructionLatex, ringLabel } from './equation';

/** Minimum time between re-renders while the term count changes (ms). */
const RENDER_INTERVAL_MS = 120;
/** Below this panel width (px) the equation is written one term per line. */
const NARROW_WIDTH = 520;

type Katex = typeof import('katex').default;
let katexPromise: Promise<Katex> | null = null;

function loadKatex(): Promise<Katex> {
  katexPromise ??= Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([m]) => m.default);
  return katexPromise;
}

export class EquationPanel {
  readonly element: HTMLElement;
  private readonly general: HTMLElement;
  private readonly current: HTMLElement;
  private readonly select: HTMLSelectElement;
  private readonly copyButton: HTMLButtonElement;
  private katex: Katex | null = null;
  private terms = 1;
  private ring = 0;
  private throttle = 0;
  private dirty = false;

  constructor(private readonly place: PlaceSeries) {
    this.element = document.createElement('section');
    this.element.className = 'equation-panel';
    this.element.setAttribute('aria-label', 'Equation');
    this.element.innerHTML = `
      <div class="equation-general"></div>
      <div class="equation-controls">
        <label class="ring-select">Show <select></select></label>
        <button type="button" class="copy">Copy coefficients</button>
      </div>
      <div class="equation-current"></div>`;
    this.general = this.element.querySelector('.equation-general')!;
    this.current = this.element.querySelector('.equation-current')!;
    this.select = this.element.querySelector('select')!;
    this.copyButton = this.element.querySelector('.copy')!;

    this.select.append(...place.rings.map((_, i) => new Option(ringLabel(i), String(i))));
    this.element.querySelector<HTMLElement>('.ring-select')!.hidden = place.rings.length < 2;
    this.select.addEventListener('change', () => {
      this.ring = Number(this.select.value);
      this.render();
    });
    this.copyButton.addEventListener('click', () => void this.copy());

    void loadKatex().then((katex) => {
      this.katex = katex;
      katex.render(GENERAL_LATEX, this.general, { displayMode: true });
      this.render();
    });
  }

  /** Updates the shown term count; renders at most once per `RENDER_INTERVAL_MS`. */
  setTerms(terms: number): void {
    this.terms = terms;
    if (this.throttle) {
      this.dirty = true;
      return;
    }
    this.render();
    this.throttle = window.setTimeout(() => {
      this.throttle = 0;
      if (this.dirty) {
        this.dirty = false;
        this.render();
      }
    }, RENDER_INTERVAL_MS);
  }

  destroy(): void {
    clearTimeout(this.throttle);
  }

  private render(): void {
    if (!this.katex) return;
    const perLine = this.element.clientWidth < NARROW_WIDTH ? 1 : 2;
    const latex = reconstructionLatex(this.place.rings[this.ring], this.terms, perLine);
    this.katex.render(latex, this.current, { displayMode: true });
  }

  private async copy(): Promise<void> {
    const json = coefficientsJson(this.place.rings[this.ring], this.terms, ringLabel(this.ring));
    let label: string;
    try {
      await navigator.clipboard.writeText(json);
      label = 'Copied ✓';
    } catch {
      label = 'Copy failed';
    }
    this.copyButton.textContent = label;
    setTimeout(() => (this.copyButton.textContent = 'Copy coefficients'), 1500);
  }
}
