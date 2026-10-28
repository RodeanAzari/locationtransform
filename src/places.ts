/** Loads a place by id from the bundled Natural Earth data or, for `osm-*` ids, from OSM. */
import type { MultiPolygon, Polygon } from 'geojson';
import { config } from './config';
import { fetchOsmBoundary, isOsmPlaceId } from './search/nominatim';

export type PlaceSource = 'natural-earth' | 'osm';

export type LoadedPlace =
  | { kind: 'area'; source: PlaceSource; name: string; context: string; geometry: Polygon | MultiPolygon }
  /** An OSM place mapped only as a point: nothing to draw. */
  | { kind: 'no-boundary'; name: string; context: string }
  | { kind: 'unknown' };

/** Thrown when OpenStreetMap can't be reached; the message is shown to the user. */
export class OsmUnavailableError extends Error {}

interface ShapeFile {
  id: string;
  name: string;
  geometry: Polygon | MultiPolygon;
}

export async function loadPlace(id: string): Promise<LoadedPlace> {
  if (isOsmPlaceId(id)) {
    let boundary;
    try {
      boundary = await fetchOsmBoundary(id);
    } catch {
      throw new OsmUnavailableError(
        'Couldn’t reach OpenStreetMap to fetch this boundary. Check your connection and try again. Countries, states and provinces still work.',
      );
    }
    if (!boundary) return { kind: 'unknown' };
    if (boundary.kind === 'none') return { kind: 'no-boundary', name: boundary.name, context: boundary.context };
    const { name, context, geometry } = boundary;
    return { kind: 'area', source: 'osm', name, context, geometry };
  }

  const response = await fetch(`${config.dataUrl}/shapes/${encodeURIComponent(id)}.json`);
  // Static hosts (and the dev server) may answer a missing file with index.html and 200.
  if (!response.ok || !response.headers.get('content-type')?.includes('json')) return { kind: 'unknown' };
  const shape = (await response.json()) as ShapeFile;
  return { kind: 'area', source: 'natural-earth', name: shape.name, context: '', geometry: shape.geometry };
}
