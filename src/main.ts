/**
 * App shell and routing. `?place=<id>` shows a place; no parameter shows the landing page.
 * Navigation uses history.pushState, so back/forward and shared links work.
 */
import './style.css';
import { config } from './config';
import { FourierClient } from './fourier/client';
import { OsmUnavailableError, loadPlace, type PlaceSource } from './places';
import { LocalIndex, describe, normalize, type IndexEntry } from './search/localIndex';
import { searchPhoton } from './search/photon';
import { aboutSection, githubButton, landingFooter } from './ui/about';
import { PlaceView } from './ui/placeView';
import { SearchBox, type Suggestion } from './ui/searchBox';

const APP_TITLE = 'Fourier Borders';

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

/**
 * OSM suggestions from Photon, minus countries (all in the local index) and states/counties
 * whose name matches a local suggestion already shown.
 */
async function suggestOsm(query: string, local: Suggestion[], signal: AbortSignal): Promise<Suggestion[]> {
  const localNames = new Set(local.map((s) => normalize(s.title)));
  const results = await searchPhoton(query, signal);
  return results
    .filter((r) => r.type !== 'country' && !(['state', 'county'].includes(r.type) && localNames.has(normalize(r.name))))
    .map((r) => ({
      id: `osm-${r.osmRef}`,
      title: r.name,
      detail: [r.typeLabel, r.context].filter(Boolean).join(', '),
    }));
}

function createSearchBox(): SearchBox {
  return new SearchBox({
    placeholder: 'Search any country, state, city or town',
    suggest: (query): Suggestion[] =>
      (index?.search(query, config.localSuggestionLimit) ?? []).map((entry) => ({
        id: entry.id,
        title: entry.name,
        detail: describe(entry),
      })),
    remote: {
      label: 'OpenStreetMap',
      minChars: config.photonMinChars,
      debounceMs: config.photonDebounceMs,
      suggest: suggestOsm,
    },
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
  const hero = document.createElement('section');
  hero.className = 'landing';
  const heading = document.createElement('h1');
  heading.textContent = APP_TITLE;
  const tagline = document.createElement('p');
  tagline.className = 'tagline';
  tagline.textContent = 'Any border, drawn by spinning circles.';
  const search = createSearchBox();
  hero.append(heading, tagline, search.element, githubButton());
  app.replaceChildren(hero, aboutSection(), landingFooter());
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

  const loaded = await loadPlace(id);
  if (token !== routeToken) return;
  if (loaded.kind === 'unknown') {
    status.textContent = 'That place isn’t in the dataset. Try searching for it above.';
    document.title = APP_TITLE;
    return;
  }
  document.title = `${loaded.name} · ${APP_TITLE}`;
  const heading = placeHeading(loaded.name, loaded.context);
  if (loaded.kind === 'no-boundary') {
    status.textContent =
      'No boundary is mapped for this place in OpenStreetMap — only its location. Try a nearby larger town or its county.';
    status.before(heading);
    app.append(attribution('osm'));
    return;
  }
  status.textContent = `Computing ${loaded.name}…`;

  const place = await client.analyze(loaded.geometry);
  if (token !== routeToken) return;
  currentView = new PlaceView(place);
  status.replaceWith(heading, currentView.element);
  app.append(attribution(loaded.source));
  currentView.start();
}

function placeHeading(name: string, context: string): HTMLElement {
  const heading = document.createElement('hgroup');
  heading.className = 'place-heading';
  const title = document.createElement('h1');
  title.textContent = name;
  heading.append(title);
  if (context) {
    const subtitle = document.createElement('p');
    subtitle.textContent = context;
    heading.append(subtitle);
  }
  return heading;
}

/** Data credits for a place page. */
function attribution(source: PlaceSource): HTMLElement {
  const footer = document.createElement('footer');
  footer.className = 'attribution';
  const boundary =
    source === 'osm'
      ? 'Boundary © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> (ODbL)'
      : 'Boundary from <a href="https://www.naturalearthdata.com/">Natural Earth</a> (public domain)';
  footer.innerHTML = `${boundary} · Search by <a href="https://photon.komoot.io/">Photon / komoot</a>`;
  return footer;
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
    message.textContent =
      error instanceof OsmUnavailableError
        ? error.message
        : `Something went wrong: ${error instanceof Error ? error.message : String(error)}`;
    app.querySelector('.status')?.remove();
    app.append(message);
  }
}

addEventListener('popstate', () => void route());
void route();
