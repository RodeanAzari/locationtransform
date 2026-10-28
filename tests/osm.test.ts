import { describe, expect, it } from 'vitest';
import { isOsmPlaceId, parseLookup } from '../src/search/nominatim';
import { parsePhoton } from '../src/search/photon';
import { RateLimitedQueue } from '../src/search/rateLimit';

describe('RateLimitedQueue', () => {
  /** A fake clock whose sleep advances time instantly. */
  function fakeClock(): { now: () => number; sleep: (ms: number) => Promise<void> } {
    let time = 0;
    return { now: () => time, sleep: async (ms) => void (time += ms) };
  }

  it('spaces task starts by at least the interval', async () => {
    const clock = fakeClock();
    const queue = new RateLimitedQueue(1000, clock.now, clock.sleep);
    const starts: number[] = [];
    await Promise.all([1, 2, 3].map(() => queue.run(async () => void starts.push(clock.now()))));
    expect(starts).toEqual([0, 1000, 2000]);
  });

  it('keeps going after a failed task', async () => {
    const clock = fakeClock();
    const queue = new RateLimitedQueue(1000, clock.now, clock.sleep);
    const failed = queue.run(async () => {
      throw new Error('offline');
    });
    const next = queue.run(async () => clock.now());
    await expect(failed).rejects.toThrow('offline');
    await expect(next).resolves.toBe(1000);
  });
});

describe('parsePhoton', () => {
  const feature = (p: Record<string, unknown>) => ({ properties: p });

  it('keeps place-like results with context and drops the rest', () => {
    const results = parsePhoton([
      feature({ osm_type: 'R', osm_id: 115357, osm_key: 'place', osm_value: 'town', type: 'city', name: 'Paris', state: 'Texas', country: 'United States' }),
      feature({ osm_type: 'R', osm_id: 7444, osm_key: 'boundary', osm_value: 'administrative', type: 'district', name: 'Paris', state: 'Île-de-France', country: 'France' }),
      feature({ osm_type: 'N', osm_id: 1, osm_key: 'railway', osm_value: 'station', type: 'house', name: 'Chicago' }),
      feature({ osm_type: 'W', osm_id: 2, osm_key: 'highway', osm_value: 'unclassified', type: 'street', name: 'Route de Paris' }),
    ]);
    expect(results).toEqual([
      { osmRef: 'R115357', name: 'Paris', typeLabel: 'Town', type: 'city', context: 'Texas, United States' },
      { osmRef: 'R7444', name: 'Paris', typeLabel: 'District', type: 'district', context: 'Île-de-France, France' },
    ]);
  });

  it('drops different OSM objects that would read identically', () => {
    const district = { osm_key: 'boundary', osm_value: 'administrative', type: 'district', name: 'Paris', state: 'Île-de-France', country: 'France' };
    const results = parsePhoton([feature({ ...district, osm_type: 'R', osm_id: 1 }), feature({ ...district, osm_type: 'R', osm_id: 2 })]);
    expect(results.map((r) => r.osmRef)).toEqual(['R1']);
  });

  it('drops duplicate OSM objects and context equal to the name', () => {
    const p = { osm_type: 'R', osm_id: 3, osm_key: 'place', osm_value: 'city', type: 'city', name: 'Berlin', state: 'Berlin', country: 'Germany' };
    expect(parsePhoton([feature(p), feature(p)])).toEqual([
      { osmRef: 'R3', name: 'Berlin', typeLabel: 'City', type: 'city', context: 'Germany' },
    ]);
  });
});

describe('Nominatim lookup', () => {
  it('validates place ids', () => {
    expect(isOsmPlaceId('osm-R7444')).toBe(true);
    expect(isOsmPlaceId('osm-N262837479')).toBe(true);
    expect(isOsmPlaceId('osm-X1')).toBe(false);
    expect(isOsmPlaceId('country-ita')).toBe(false);
  });

  it('returns the polygon and context for an area', () => {
    const geometry = { type: 'Polygon', coordinates: [[[2.2, 48.8], [2.4, 48.8], [2.4, 48.9], [2.2, 48.8]]] };
    expect(parseLookup([{ properties: { name: 'Paris', display_name: 'Paris, Île-de-France, France' }, geometry }])).toEqual({
      kind: 'polygon',
      name: 'Paris',
      context: 'Île-de-France, France',
      geometry,
    });
  });

  it('reports "no boundary" for places mapped only as a point', () => {
    const result = parseLookup([
      { properties: { name: 'Saint-Cyr-du-Gault', display_name: 'Saint-Cyr-du-Gault, Blois, France' }, geometry: { type: 'Point' } },
    ]);
    expect(result).toEqual({ kind: 'none', name: 'Saint-Cyr-du-Gault', context: 'Blois, France' });
  });

  it('returns null for unknown objects', () => {
    expect(parseLookup([])).toBeNull();
  });
});
