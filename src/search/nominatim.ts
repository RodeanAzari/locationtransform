/**
 * Boundary polygons for OSM places from Nominatim's lookup endpoint.
 *
 * Usage policy: never used for autocomplete (Photon does that), at most one request per second
 * (client-side queue), results cached in IndexedDB so each place is fetched once.
 */
import type { MultiPolygon, Polygon } from 'geojson';
import { config } from '../config';
import { cacheGet, cachePut } from './cache';
import { RateLimitedQueue } from './rateLimit';

export type OsmBoundary =
  | { kind: 'polygon'; name: string; context: string; geometry: Polygon | MultiPolygon }
  /** The place exists but OSM maps it only as a point (or line), not an area. */
  | { kind: 'none'; name: string; context: string };

interface LookupFeature {
  properties: { name?: string; display_name?: string };
  geometry: { type: string } | null;
}

const queue = new RateLimitedQueue(config.nominatimIntervalMs);

/** Matches the app's OSM place ids, e.g. `osm-R7444`. */
const OSM_ID = /^osm-([NWR])(\d+)$/;

export function isOsmPlaceId(id: string): boolean {
  return OSM_ID.test(id);
}

/** Interprets a lookup response; `null` when Nominatim knows no such object. */
export function parseLookup(features: LookupFeature[]): OsmBoundary | null {
  const feature = features[0];
  if (!feature) return null;
  const { name, display_name: displayName = '' } = feature.properties;
  // display_name is "Paris, Île-de-France, France métropolitaine, France": drop the name itself.
  const parts = displayName.split(', ');
  const placeName = name || parts[0] || 'Unnamed place';
  const context = parts.slice(1).join(', ');
  const geometry = feature.geometry;
  if (geometry && (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon')) {
    return { kind: 'polygon', name: placeName, context, geometry: geometry as Polygon | MultiPolygon };
  }
  return { kind: 'none', name: placeName, context };
}

/**
 * The boundary of OSM place `id` (`osm-R7444`), from the cache or Nominatim. Resolves to `null`
 * for unknown objects; rejects on network or server errors (which are not cached).
 */
export async function fetchOsmBoundary(id: string): Promise<OsmBoundary | null> {
  const match = OSM_ID.exec(id);
  if (!match) return null;
  const cached = await cacheGet<OsmBoundary>(id);
  if (cached) return cached;

  const url = new URL(config.nominatimLookupUrl);
  url.searchParams.set('osm_ids', `${match[1]}${match[2]}`);
  url.searchParams.set('format', 'geojson');
  url.searchParams.set('polygon_geojson', '1');
  url.searchParams.set('polygon_threshold', String(config.nominatimPolygonThreshold));
  if (config.nominatimEmail) url.searchParams.set('email', config.nominatimEmail);

  const response = await queue.run(() => fetch(url));
  if (!response.ok) throw new Error(`OpenStreetMap lookup failed (${response.status})`);
  const body = (await response.json()) as { features: LookupFeature[] };
  const boundary = parseLookup(body.features);
  if (boundary) await cachePut(id, boundary);
  return boundary;
}
