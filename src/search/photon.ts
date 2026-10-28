/** Photon (komoot) autocomplete for OSM places: cities, towns, villages, districts, counties. */
import { config } from '../config';

/** A place-like OSM object suggested by Photon. */
export interface OsmSuggestion {
  /** e.g. "R7444"; also the suffix of the app's place id (`osm-R7444`). */
  osmRef: string;
  name: string;
  /** "City", "Village", "District", … */
  typeLabel: string;
  /** Photon's coarse type: "city", "district", "county", "state", "country", … */
  type: string;
  /** "Texas, United States". */
  context: string;
}

interface PhotonFeature {
  properties: {
    osm_type?: string;
    osm_id?: number;
    osm_key?: string;
    osm_value?: string;
    type?: string;
    name?: string;
    county?: string;
    state?: string;
    country?: string;
  };
}

const PLACE_TYPES = new Set(['city', 'district', 'county', 'state', 'locality', 'country']);

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');

/**
 * Keeps place-like results (place=* or administrative boundaries), one per OSM object and one
 * per visible label (OSM often has several objects that would read identically).
 */
export function parsePhoton(features: PhotonFeature[]): OsmSuggestion[] {
  const seen = new Set<string>();
  const out: OsmSuggestion[] = [];
  for (const { properties: p } of features) {
    const placeLike = p.osm_key === 'place' || (p.osm_key === 'boundary' && p.osm_value === 'administrative');
    if (!placeLike || !p.name || !p.osm_type || !p.osm_id || !PLACE_TYPES.has(p.type ?? '')) continue;
    const suggestion: OsmSuggestion = {
      osmRef: `${p.osm_type}${p.osm_id}`,
      name: p.name,
      typeLabel: capitalize(p.osm_key === 'place' ? p.osm_value! : p.type!),
      type: p.type!,
      context: [p.state ?? p.county, p.country].filter((s) => s && s !== p.name).join(', '),
    };
    const label = `${suggestion.name}|${suggestion.typeLabel}|${suggestion.context}`;
    if (seen.has(suggestion.osmRef) || seen.has(label)) continue;
    seen.add(suggestion.osmRef).add(label);
    out.push(suggestion);
  }
  return out;
}

/** Queries Photon. Rejects on network errors or when `signal` aborts. */
export async function searchPhoton(query: string, signal: AbortSignal): Promise<OsmSuggestion[]> {
  const url = new URL(config.photonUrl);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', String(config.photonLimit));
  url.searchParams.set('lang', 'en');
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Photon returned ${response.status}`);
  const body = (await response.json()) as { features: PhotonFeature[] };
  return parsePhoton(body.features);
}
