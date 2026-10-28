import type { SpikeRequest, SpikeResponse } from './worker';

const app = document.querySelector<HTMLElement>('#app')!;
const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });

worker.addEventListener('message', (event: MessageEvent<SpikeResponse>) => {
  app.textContent = `WASM worker says 1 + 2 + 3.5 = ${event.data.sum}`;
});

const request: SpikeRequest = { values: new Float64Array([1, 2, 3.5]) };
worker.postMessage(request);
