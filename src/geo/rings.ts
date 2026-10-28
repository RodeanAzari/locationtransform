/** Ring extraction and antimeridian handling for GeoJSON place geometries. */
import type { MultiPolygon, Polygon, Position } from 'geojson';

/** A closed ring of `[lon, lat]` positions (degrees). */
export type LonLatRing = Position[];

/** Outer rings of a Polygon or MultiPolygon. Holes are ignored (v1). */
export function outerRings(geometry: Polygon | MultiPolygon): LonLatRing[] {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.map((polygon) => polygon[0]).filter((ring) => ring.length >= 4);
}

/**
 * Makes a ring's longitudes continuous: each point is shifted by a multiple of 360° so it is
 * within 180° of the previous one. A ring crossing the antimeridian then has no 360° jumps;
 * longitudes may end up outside [-180, 180], which is fine for projection.
 */
export function unwrapLongitudes(ring: LonLatRing): LonLatRing {
  let previous = ring[0][0];
  return ring.map(([lon, lat]) => {
    let x = lon;
    while (x - previous > 180) x -= 360;
    while (x - previous < -180) x += 360;
    previous = x;
    return [x, lat];
  });
}
