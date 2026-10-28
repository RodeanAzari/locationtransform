/** Promise-based wrapper around the analysis worker. */
import type { MultiPolygon, Polygon } from 'geojson';
import type { AnalyzeRequest, AnalyzeResponse } from '../worker';
import type { PlaceSeries } from './types';

export class FourierClient {
  private readonly worker = new Worker(new URL('../worker.ts', import.meta.url), { type: 'module' });
  private readonly pending = new Map<number, { resolve: (p: PlaceSeries) => void; reject: (e: Error) => void }>();
  private nextId = 0;

  constructor() {
    this.worker.addEventListener('message', (event: MessageEvent<AnalyzeResponse>) => {
      const response = event.data;
      const request = this.pending.get(response.requestId);
      if (!request) return;
      this.pending.delete(response.requestId);
      if (response.ok) request.resolve(response.place);
      else request.reject(new Error(response.message));
    });
  }

  /** Projects the geometry, filters islands and computes each ring's Fourier series. */
  analyze(geometry: Polygon | MultiPolygon): Promise<PlaceSeries> {
    const requestId = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.worker.postMessage({ requestId, geometry } satisfies AnalyzeRequest);
    });
  }
}
