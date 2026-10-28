/**
 * App shell and routing. `?place=<id>` shows a place; no parameter shows the landing page.
 * Navigation uses history.pushState, so back/forward and shared links work.
 */
import type { MultiPolygon, Polygon } from 'geojson';
import './style.css';
import { config } from './config';
import { FourierClient } from './fourier/client';
import { LocalIndex, describe, type IndexEntry } from './search/localIndex';
import { PlaceView } from './ui/placeView';
import { SearchBox, type Suggestion } from './ui/searchBox';

interface ShapeFile {
  id: string;
  name: string;
  geometry: Polygon | MultiPolygon;
}

const APP_TITLE = 'Fourier Borders';
const SUGGESTION_LIMIT = 8;

const app = document.querySelector<HTMLElement>('#app')!;
const client = new FourierClient();
/** The local search index; null until loaded (search shows no suggestions until then). */
let index: LocalIndex | null = null;
fetch(`${config.dataUrl}/index.json`)
  .then((response) => response.json() as Promise<IndexEntry[]>)
  .then((entries) => (index = new LocalIndex(entries)))
  .catch(() => undefined);

let currentView: PlaceView | null = null;
/** Incremented on each navigation so stale async work can bail out. */
let routeToken = 0;

function createSearchBox(): SearchBox {
  return new SearchBox({
    placeholder: 'Search a country, state or province',
    suggest: (query): Suggestion[] =>
      (index?.search(query, SUGGESTION_LIMIT) ?? []).map((entry) => ({
        id: entry.id,
        title: entry.name,
        detail: describe(entry),
      })),
    onSelect: (suggestion) => navigate(suggestion.id),
  });
}

function navigate(placeId: string | null): void {
  const url = new URL(location.href);
  if (placeId) url.searchParams.set('place', placeId);
  else url.searchParams.delete('place');
  history.pushState(null, '', url);
  void route();
}

function homeLink(): HTMLAnchorElement {
  const link = document.createElement('a');
  link.className = 'home-link';
  link.href = import.meta.env.BASE_URL;
  link.textContent = APP_TITLE;
  link.addEventListener('click', (event) => {
    event.preventDefault();
    navigate(null);
  });
  return link;
}

function showLanding(): void {
  document.title = APP_TITLE;
  const landing = document.createElement('section');
  landing.className = 'landing';
  const heading = document.createElement('h1');
  heading.textContent = APP_TITLE;
  const tagline = document.createElement('p');
  tagline.className = 'tagline';
  tagline.textContent = 'Any border, drawn by spinning circles.';
  const search = createSearchBox();
  landing.append(heading, tagline, search.element);
  app.replaceChildren(landing);
  search.focus();
}

async function showPlace(id: string, token: number): Promise<void> {
  const header = document.createElement('header');
  header.className = 'place-header';
  header.append(homeLink(), createSearchBox().element);
  const status = document.createElement('p');
  status.className = 'status';
  status.textContent = 'Loading…';
  app.replaceChildren(header, status);

  const response = await fetch(`${config.dataUrl}/shapes/${encodeURIComponent(id)}.json`);
  if (token !== routeToken) return;
  // Static hosts (and the dev server) may answer a missing file with index.html and 200.
  if (!response.ok || !response.headers.get('content-type')?.includes('json')) {
    status.textContent = 'That place isn’t in the dataset. Try searching for it above.';
    document.title = APP_TITLE;
    return;
  }
  const shape = (await response.json()) as ShapeFile;
  if (token !== routeToken) return;
  document.title = `${shape.name} · ${APP_TITLE}`;
  status.textContent = `Computing ${shape.name}…`;

  const place = await client.analyze(shape.geometry);
  if (token !== routeToken) return;
  const heading = document.createElement('h1');
  heading.textContent = shape.name;
  currentView = new PlaceView(place);
  status.replaceWith(heading, currentView.element);
  currentView.start();
}

async function route(): Promise<void> {
  const token = ++routeToken;
  currentView?.destroy();
  currentView = null;
  const placeId = new URLSearchParams(location.search).get('place');
  if (!placeId) {
    showLanding();
    return;
  }
  try {
    await showPlace(placeId, token);
  } catch (error) {
    if (token !== routeToken) return;
    const message = document.createElement('p');
    message.className = 'status';
    message.textContent = `Something went wrong: ${error instanceof Error ? error.message : String(error)}`;
    app.append(message);
  }
}

addEventListener('popstate', () => void route());
void route();
