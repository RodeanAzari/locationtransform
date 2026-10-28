/** Data passed from the worker to the UI. All arrays are transferable typed arrays. */

/** The truncated Fourier series of one ring. */
export interface RingSeries {
  /** Centre coefficient c₀ as `[re, im]` (km). */
  c0: [number, number];
  /** Frequencies of the first N_i terms, largest amplitude first. */
  k: Int32Array;
  /** Real and imaginary parts of the first N_i coefficients (km). */
  re: Float64Array;
  im: Float64Array;
  /** N_i: terms needed for this ring to reach the target (or the cap). */
  n: number;
  /** Normalized Hausdorff error at N_i. */
  error: number;
  targetReached: boolean;
  /** Error curve: normalized error at ascending term counts 1 … N_i. */
  curveN: Uint32Array;
  curveError: Float64Array;
  /** The resampled true ring, interleaved x, y (km): the ghost outline. */
  truth: Float64Array;
}

/** All kept rings of a place, largest first. */
export interface PlaceSeries {
  rings: RingSeries[];
  /** Rings dropped by the island filter. */
  droppedRings: number;
  /** Bounding-box diagonal of the kept rings (km). */
  diagonal: number;
  /** N for the place: the maximum N_i. */
  n: number;
}
