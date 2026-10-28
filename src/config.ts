/** All app tunables. Logic must read these rather than hard-coding values. */
export const config = {
  /** Base URL of the generated data (respects Vite's `base`). */
  dataUrl: `${import.meta.env.BASE_URL}data`,
  /** Source repository, linked from the landing page. */
  githubUrl: 'https://github.com/RodeanAzari/locationtransform',

  // Search.
  /** Maximum local-index suggestions shown. */
  localSuggestionLimit: 8,
  /** Photon autocomplete (OSM). Nominatim's policy forbids autocomplete, so Photon does it. */
  photonUrl: 'https://photon.komoot.io/api/',
  photonLimit: 10,
  photonMinChars: 3,
  photonDebounceMs: 300,
  /** Nominatim lookup, used once per selected OSM place to fetch its boundary polygon. */
  nominatimLookupUrl: 'https://nominatim.openstreetmap.org/lookup',
  /** Contact address sent to Nominatim per its usage policy; omitted when empty. */
  nominatimEmail: '',
  /** Minimum gap between Nominatim requests (policy: at most 1 per second). */
  nominatimIntervalMs: 1100,
  /** Server-side polygon simplification tolerance (degrees, ≈ 5 m). */
  nominatimPolygonThreshold: 0.00005,

  // Accuracy and Fourier core (passed to fourier-core).
  /** Target normalized Hausdorff error (0.1% of the place's bounding-box diagonal). */
  accuracyTarget: 0.001,
  /** Resampled points per ring: power-of-two bounds. */
  minSamples: 256,
  maxSamples: 4096,
  /** Resample spacing as a fraction of the place's bounding-box diagonal. */
  sampleSpacing: 0.0005,
  /** Term counts after N that must also meet the target. */
  findNLookahead: 3,
  /** Approximate number of error-curve samples per ring for the slider readout. */
  errorCurveSamples: 48,

  // Geometry.
  /** Rings smaller than this fraction of the place's total area are dropped. */
  islandMinAreaFraction: 0.005,
  /** At most this many rings are kept (largest first). */
  maxRings: 30,

  // Rendering and slider.
  /** Slider snap markers (N is always added). */
  snapPoints: [1, 3, 10, 50],
  /** Relative slider distance within which dragging snaps to a marker. */
  snapDistance: 0.015,
  /** Seconds for one full trace of the curve, regardless of term count. */
  traceSeconds: 7,
  /** Epicycle circles drawn per ring (later terms still contribute to the path). */
  maxDrawnEpicycles: 50,
  /** Canvas padding as a fraction of the smaller canvas dimension. */
  canvasPadding: 0.06,
} as const;
