import type { MultiPolygon, Polygon } from 'geojson';
import './style.css';
import { config } from './config';
import { FourierClient } from './fourier/client';
import { PlaceView } from './ui/placeView';

interface ShapeFile {
  id: string;
  name: string;
  geometry: Polygon | MultiPolygon;
}

const app = document.querySelector<HTMLElement>('#app')!;
const client = new FourierClient();

async function showPlace(id: string): Promise<void> {
  const status = document.createElement('p');
  status.className = 'status';
  status.textContent = 'Loading…';
  app.replaceChildren(status);

  const response = await fetch(`${config.dataUrl}/shapes/${encodeURIComponent(id)}.json`);
  if (!response.ok) {
    status.textContent = `Unknown place “${id}”.`;
    return;
  }
  const shape = (await response.json()) as ShapeFile;
  status.textContent = `Computing ${shape.name}…`;
  const place = await client.analyze(shape.geometry);

  const heading = document.createElement('h1');
  heading.textContent = shape.name;
  const view = new PlaceView(place);
  app.replaceChildren(heading, view.element);
  view.start();
}

const placeId = new URLSearchParams(location.search).get('place') ?? config.defaultPlaceId;
showPlace(placeId).catch((error: unknown) => {
  app.textContent = `Something went wrong: ${error instanceof Error ? error.message : String(error)}`;
});
