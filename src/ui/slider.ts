/** Term-count slider: log scale, snap markers, play/pause button and readout. */
import { config } from '../config';
import { positionToTerms, snapPosition, snapStops, termsToPosition } from './scale';

export interface SliderHandlers {
  /** The user picked a term count (drag, marker click or keyboard). */
  onTerms(n: number): void;
  onTogglePlay(): void;
}

export class TermSlider {
  readonly element: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly markers: HTMLElement;
  private readonly playButton: HTMLButtonElement;
  private readonly readout: HTMLOutputElement;
  private max = 1;
  private stops: number[] = [1];
  private terms = 1;

  constructor(private readonly handlers: SliderHandlers) {
    this.element = document.createElement('div');
    this.element.className = 'term-slider';
    this.element.innerHTML = `
      <button type="button" class="play" aria-label="Pause"></button>
      <div class="track">
        <input type="range" min="0" max="1" step="0.0001" aria-label="Number of terms" />
        <div class="markers"></div>
      </div>
      <output class="readout" aria-live="polite"></output>`;
    this.input = this.element.querySelector('input')!;
    this.markers = this.element.querySelector('.markers')!;
    this.playButton = this.element.querySelector('.play')!;
    this.readout = this.element.querySelector('output')!;

    this.playButton.addEventListener('click', () => handlers.onTogglePlay());
    this.input.addEventListener('input', () => {
      const p = snapPosition(Number(this.input.value), this.stops, this.max, config.snapDistance);
      this.input.value = String(p);
      this.pick(positionToTerms(p, this.max), false);
    });
    this.input.addEventListener('keydown', (event) => this.onKey(event));
  }

  /** Sets N and rebuilds the snap markers. */
  setMax(max: number): void {
    this.max = max;
    this.stops = snapStops(config.snapPoints, max);
    this.markers.replaceChildren(
      ...this.stops.map((stop) => {
        const marker = document.createElement('button');
        marker.type = 'button';
        marker.className = 'marker';
        marker.textContent = String(stop);
        marker.style.setProperty('--at', String(termsToPosition(stop, max)));
        marker.addEventListener('click', () => this.pick(stop, true));
        return marker;
      }),
    );
  }

  /** Moves the thumb to `n` without notifying handlers. */
  setTerms(n: number): void {
    this.terms = n;
    this.input.value = String(termsToPosition(n, this.max));
    this.input.setAttribute('aria-valuetext', `${n} ${n === 1 ? 'term' : 'terms'}`);
  }

  setPlaying(playing: boolean): void {
    this.playButton.classList.toggle('paused', !playing);
    this.playButton.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  }

  /** Hides the play button (reduced motion). */
  setPlayable(playable: boolean): void {
    this.playButton.hidden = !playable;
  }

  setReadout(n: number, error: number, atTarget: boolean, reached: boolean): void {
    const terms = `${n} ${n === 1 ? 'term' : 'terms'}`;
    const percent = `${(error * 100).toPrecision(2)}%`;
    const status = atTarget ? (reached ? ' · target reached ✓' : ' · target not reached (term cap)') : '';
    this.readout.textContent = `${terms} · error ${percent}${status}`;
  }

  private pick(n: number, moveThumb: boolean): void {
    if (moveThumb) this.setTerms(n);
    else this.terms = n;
    this.input.setAttribute('aria-valuetext', `${n} ${n === 1 ? 'term' : 'terms'}`);
    this.handlers.onTerms(n);
  }

  /** Arrow keys step one term; Page keys jump between snap markers; Home/End go to 1/N. */
  private onKey(event: KeyboardEvent): void {
    const next = this.stops.find((s) => s > this.terms) ?? this.max;
    const previous = [...this.stops].reverse().find((s) => s < this.terms) ?? 1;
    const targets: Record<string, number> = {
      ArrowRight: this.terms + 1,
      ArrowUp: this.terms + 1,
      ArrowLeft: this.terms - 1,
      ArrowDown: this.terms - 1,
      PageUp: next,
      PageDown: previous,
      Home: 1,
      End: this.max,
    };
    if (!(event.key in targets)) return;
    event.preventDefault();
    this.pick(Math.min(this.max, Math.max(1, targets[event.key])), true);
  }
}
