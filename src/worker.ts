/** Web worker that owns the WASM math core so the UI thread never blocks. */
import init, { spike_sum } from '../crates/fourier-core/pkg/fourier_core.js';

export interface SpikeRequest {
  values: Float64Array;
}

export interface SpikeResponse {
  sum: number;
}

const ready = init();

addEventListener('message', async (event: MessageEvent<SpikeRequest>) => {
  await ready;
  const response: SpikeResponse = { sum: spike_sum(event.data.values) };
  postMessage(response);
});
