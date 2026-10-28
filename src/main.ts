import type { AnalyzeRequest, AnalyzeResponse } from './worker';

const app = document.querySelector<HTMLElement>('#app')!;
const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });

worker.addEventListener('message', (event: MessageEvent<AnalyzeResponse>) => {
  const { n, error, targetReached } = event.data;
  app.textContent = `Square: N = ${n}, error = ${(error * 100).toFixed(3)}%, target reached: ${targetReached}`;
});

const request: AnalyzeRequest = {
  xy: new Float64Array([0, 0, 100, 0, 100, 100, 0, 100]),
  placeDiagonal: 100 * Math.SQRT2,
};
worker.postMessage(request);
