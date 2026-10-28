/**
 * The place view: slider + canvas, the animation clock and auto-play.
 *
 * Auto-play steps through the snap stops (1, 3, 10, 50, N), one full trace each, then stays at
 * N. Using the slider cancels auto-play; the play button pauses and resumes the motion.
 */
import { config } from '../config';
import { placeErrorAt } from '../fourier/series';
import type { PlaceSeries } from '../fourier/types';
import { EpicycleRenderer } from '../render/renderer';
import { snapStops } from './scale';
import { TermSlider } from './slider';

export class PlaceView {
  readonly element: HTMLElement;
  private readonly renderer: EpicycleRenderer;
  private readonly slider: TermSlider;
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private terms: number;
  private playing = true;
  /** Remaining auto-play stops; empty once auto-play is over or cancelled. */
  private autoplay: number[];
  /** Seconds since the current trace started (advances only while playing). */
  private elapsed = 0;
  private lastFrame: number | null = null;
  private frame = 0;
  private readonly resizeObserver: ResizeObserver;
  private readonly colorScheme = matchMedia('(prefers-color-scheme: dark)');
  private readonly onSchemeChange = (): void => {
    this.renderer.refreshTheme();
    this.draw();
  };

  constructor(private readonly place: PlaceSeries) {
    this.element = document.createElement('section');
    this.element.className = 'place-view';
    this.slider = new TermSlider({
      onTerms: (n) => {
        this.autoplay = [];
        this.setTerms(n);
      },
      onTogglePlay: () => {
        this.playing = !this.playing;
        this.slider.setPlaying(this.playing);
      },
    });
    const canvas = document.createElement('canvas');
    canvas.className = 'epicycles';
    this.element.append(this.slider.element, canvas);
    if (place.droppedRings > 0) {
      const note = document.createElement('p');
      note.className = 'dropped-note';
      note.textContent = `+${place.droppedRings} small ${place.droppedRings === 1 ? 'island' : 'islands'} not shown`;
      this.element.append(note);
    }

    this.renderer = new EpicycleRenderer(canvas);
    this.slider.setMax(place.n);
    this.slider.setPlayable(!this.reducedMotion);
    this.slider.setPlaying(true);

    const stops = snapStops(config.snapPoints, place.n);
    this.autoplay = this.reducedMotion ? [] : stops.slice(1);
    this.terms = this.reducedMotion ? place.n : stops[0];
    this.setTerms(this.terms);

    this.resizeObserver = new ResizeObserver(() => {
      this.renderer.resize();
      this.draw();
    });
  }

  /** Call after `element` is in the document. */
  start(): void {
    this.renderer.setPlace(this.place);
    this.resizeObserver.observe(this.element.querySelector('canvas')!);
    this.colorScheme.addEventListener('change', this.onSchemeChange);
    if (!this.reducedMotion) this.frame = requestAnimationFrame((now) => this.tick(now));
    else this.draw();
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.colorScheme.removeEventListener('change', this.onSchemeChange);
  }

  private setTerms(n: number): void {
    this.terms = n;
    this.elapsed = 0;
    this.slider.setTerms(n);
    const atTarget = n >= this.place.n;
    const reached = this.place.rings.every((ring) => ring.targetReached);
    this.slider.setReadout(n, placeErrorAt(this.place, n), atTarget, reached);
    if (this.reducedMotion) this.draw();
  }

  private tick(now: number): void {
    if (this.playing && this.lastFrame !== null) this.elapsed += (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    if (this.autoplay.length > 0 && this.elapsed >= config.traceSeconds) {
      this.setTerms(this.autoplay.shift()!);
    }
    this.draw();
    this.frame = requestAnimationFrame((next) => this.tick(next));
  }

  private draw(): void {
    if (this.reducedMotion) {
      this.renderer.render(this.terms, 0, 1, false);
      return;
    }
    const progress = this.elapsed / config.traceSeconds;
    const t = 2 * Math.PI * (progress % 1);
    this.renderer.render(this.terms, t, progress, true);
  }
}
