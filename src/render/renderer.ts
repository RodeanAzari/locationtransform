/** Canvas renderer: ghost outline, traced reconstruction, and epicycles. */
import { config } from '../config';
import { epicycleCentres, tracePath } from '../fourier/series';
import type { PlaceSeries, RingSeries } from '../fourier/types';

interface Theme {
  ghost: string;
  trace: string;
  circle: string;
  arm: string;
}

/** Visual weight of the epicycles: full for the main ring, lighter for islands. */
const MAIN_ALPHA = 1;
const ISLAND_ALPHA = 0.45;

export class EpicycleRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private place: PlaceSeries | null = null;
  /** Cached reconstructed path per ring for the current term count. */
  private paths: Float64Array[] = [];
  private terms = 0;
  private theme: Theme = { ghost: '', trace: '', circle: '', arm: '' };
  /** World (km, y up) → CSS pixel transform. */
  private scale = 1;
  private center: [number, number] = [0, 0];
  private width = 0;
  private height = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  /** Shows a place. The canvas must be in the document (colors come from its computed style). */
  setPlace(place: PlaceSeries): void {
    this.place = place;
    this.theme = this.readTheme();
    this.terms = 0;
    this.resize();
  }

  /** Re-reads colors from CSS custom properties (call when the color scheme changes). */
  refreshTheme(): void {
    this.theme = this.readTheme();
  }

  /** Matches the canvas backing store to its CSS size and device pixel ratio, and refits. */
  resize(): void {
    const { width, height } = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.width = width;
    this.height = height;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.place) this.fit(this.place);
  }

  /**
   * Draws the place with `terms` terms per ring (capped at each ring's N_i).
   * @param t current angle in [0, 2π) for the epicycles
   * @param traced fraction of the path drawn so far (≥ 1 draws the closed path)
   * @param epicycles whether to draw circles and arms
   */
  render(terms: number, t: number, traced: number, epicycles: boolean): void {
    const { ctx, place } = this;
    ctx.clearRect(0, 0, this.width, this.height);
    if (!place) return;
    if (terms !== this.terms) {
      this.terms = terms;
      this.paths = place.rings.map((ring) => tracePath(ring, terms, ring.truth.length / 2));
    }

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = 1;
    ctx.strokeStyle = this.theme.ghost;
    for (const ring of place.rings) this.strokePoints(ring.truth, ring.truth.length / 2, true);

    ctx.lineWidth = 2;
    ctx.strokeStyle = this.theme.trace;
    for (const path of this.paths) {
      const count = path.length / 2;
      this.strokePoints(path, traced >= 1 ? count : Math.floor(traced * count) + 1, traced >= 1);
    }

    if (epicycles) {
      place.rings.forEach((ring, i) =>
        this.drawEpicycles(ring, this.paths[i], terms, t, i === 0 ? MAIN_ALPHA : ISLAND_ALPHA),
      );
    }
  }

  /** Draws the first epicycles of `ring` at angle t; a final arm joins the chain to the path. */
  private drawEpicycles(ring: RingSeries, path: Float64Array, terms: number, t: number, alpha: number): void {
    const { ctx } = this;
    const drawn = Math.min(terms, config.maxDrawnEpicycles);
    const centres = epicycleCentres(ring, drawn, t);
    const count = centres.length / 2 - 1;

    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1;
    ctx.strokeStyle = this.theme.circle;
    ctx.beginPath();
    for (let j = 0; j < count; j++) {
      const r = Math.hypot(ring.re[j], ring.im[j]) * this.scale;
      if (r < 0.5) continue;
      const [x, y] = this.toScreen(centres[2 * j], centres[2 * j + 1]);
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, 2 * Math.PI);
    }
    ctx.stroke();

    ctx.strokeStyle = this.theme.arm;
    ctx.beginPath();
    ctx.moveTo(...this.toScreen(centres[0], centres[1]));
    for (let j = 1; j <= count; j++) ctx.lineTo(...this.toScreen(centres[2 * j], centres[2 * j + 1]));
    if (Math.min(terms, ring.n) > count) {
      // Undrawn small terms: join the chain to the actual point on the path.
      const points = path.length / 2;
      const p = Math.round((t / (2 * Math.PI)) * points) % points;
      ctx.lineTo(...this.toScreen(path[2 * p], path[2 * p + 1]));
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** Strokes the first `count` points of an interleaved x, y array. */
  private strokePoints(xy: Float64Array, count: number, closed: boolean): void {
    const { ctx } = this;
    ctx.beginPath();
    for (let p = 0; p < count; p++) {
      const [x, y] = this.toScreen(xy[2 * p], xy[2 * p + 1]);
      if (p === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    if (closed) ctx.closePath();
    ctx.stroke();
  }

  /** Fits the true rings, plus each ring's first (largest) circle, into the canvas. */
  private fit(place: PlaceSeries): void {
    let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
    const include = (x: number, y: number, r = 0): void => {
      minX = Math.min(minX, x - r);
      maxX = Math.max(maxX, x + r);
      minY = Math.min(minY, y - r);
      maxY = Math.max(maxY, y + r);
    };
    for (const ring of place.rings) {
      for (let p = 0; p < ring.truth.length; p += 2) include(ring.truth[p], ring.truth[p + 1]);
      include(ring.c0[0], ring.c0[1], Math.hypot(ring.re[0], ring.im[0]));
    }
    const padding = config.canvasPadding * Math.min(this.width, this.height);
    this.scale = Math.min(
      (this.width - 2 * padding) / (maxX - minX || 1),
      (this.height - 2 * padding) / (maxY - minY || 1),
    );
    this.center = [(minX + maxX) / 2, (minY + maxY) / 2];
  }

  private toScreen(x: number, y: number): [number, number] {
    return [
      this.width / 2 + (x - this.center[0]) * this.scale,
      this.height / 2 - (y - this.center[1]) * this.scale,
    ];
  }

  private readTheme(): Theme {
    const style = getComputedStyle(this.canvas);
    const color = (name: string): string => style.getPropertyValue(name).trim();
    return {
      ghost: color('--ghost'),
      trace: color('--trace'),
      circle: color('--circle'),
      arm: color('--arm'),
    };
  }
}
