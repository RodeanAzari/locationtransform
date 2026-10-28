/** Web worker: runs the geometry pipeline (TS) and the Fourier core (WASM) off the UI thread. */
import type { MultiPolygon, Polygon } from 'geojson';
import init, { Options, analyzeRing } from '../crates/fourier-core/pkg/fourier_core.js';
import { config } from './config';
import type { PlaceSeries, RingSeries } from './fourier/types';
import { preparePlace } from './geo/prepare';

export interface AnalyzeRequest {
  requestId: number;
  geometry: Polygon | MultiPolygon;
}

export type AnalyzeResponse =
  | { requestId: number; ok: true; place: PlaceSeries }
  | { requestId: number; ok: false; message: string };

const ready = init();

function analyze(geometry: Polygon | MultiPolygon): PlaceSeries {
  const { rings, droppedRings, diagonal } = preparePlace(geometry);
  const options = new Options(
    diagonal,
    config.accuracyTarget,
    config.minSamples,
    config.maxSamples,
    config.sampleSpacing,
    config.findNLookahead,
    config.errorCurveSamples,
  );
  try {
    const series = rings.map((ring): RingSeries => {
      const result = analyzeRing(Float64Array.from(ring.flat()), options);
      try {
        return {
          c0: [result.c0Re, result.c0Im],
          k: result.termK,
          re: result.termRe,
          im: result.termIm,
          n: result.n,
          error: result.error,
          targetReached: result.targetReached,
          curveN: result.curveN,
          curveError: result.curveError,
          truth: result.resampledXy,
        };
      } finally {
        result.free();
      }
    });
    return { rings: series, droppedRings, diagonal, n: Math.max(...series.map((r) => r.n)) };
  } finally {
    options.free();
  }
}

addEventListener('message', async (event: MessageEvent<AnalyzeRequest>) => {
  const { requestId, geometry } = event.data;
  try {
    await ready;
    const place = analyze(geometry);
    const transfer = place.rings.flatMap((r) => [r.k, r.re, r.im, r.curveN, r.curveError, r.truth].map((a) => a.buffer));
    postMessage({ requestId, ok: true, place } satisfies AnalyzeResponse, { transfer });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    postMessage({ requestId, ok: false, message } satisfies AnalyzeResponse);
  }
});
