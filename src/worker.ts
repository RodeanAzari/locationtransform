/** Web worker that owns the WASM math core so the UI thread never blocks. */
import init, { Options, analyzeRing } from '../crates/fourier-core/pkg/fourier_core.js';

export interface AnalyzeRequest {
  /** Interleaved projected x, y coordinates (km) of one ring. */
  xy: Float64Array;
  /** Bounding-box diagonal of the whole place (km). */
  placeDiagonal: number;
}

export interface AnalyzeResponse {
  n: number;
  error: number;
  targetReached: boolean;
}

const ready = init();

addEventListener('message', async (event: MessageEvent<AnalyzeRequest>) => {
  await ready;
  const { xy, placeDiagonal } = event.data;
  // Placeholder tunables until config.ts exists (milestone 3).
  const options = new Options(placeDiagonal, 0.001, 256, 4096, 0.0005, 3, 48);
  const result = analyzeRing(xy, options);
  const response: AnalyzeResponse = {
    n: result.n,
    error: result.error,
    targetReached: result.targetReached,
  };
  result.free();
  options.free();
  postMessage(response);
});
