/** Equal-area projection of a place into kilometres, centred on the place itself. */
import { geoAzimuthalEqualArea } from 'd3-geo';
import type { LonLatRing } from './rings';

/** A projected ring as `[x, y]` km pairs, y pointing north. */
export type XYRing = [number, number][];

const EARTH_RADIUS_KM = 6371;
const RAD = Math.PI / 180;

/**
 * Spherical centroid of all vertices (mean of unit vectors), as `[lon, lat]`.
 * Unlike averaging longitudes, this is correct for places spanning the antimeridian.
 */
export function sphericalCentroid(rings: LonLatRing[]): [number, number] {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      const cosLat = Math.cos(lat * RAD);
      x += cosLat * Math.cos(lon * RAD);
      y += cosLat * Math.sin(lon * RAD);
      z += Math.sin(lat * RAD);
    }
  }
  return [Math.atan2(y, x) / RAD, Math.atan2(z, Math.hypot(x, y)) / RAD];
}

/** Projects rings with an azimuthal equal-area projection centred on `center`, in km. */
export function projectRings(rings: LonLatRing[], center: [number, number]): XYRing[] {
  const projection = geoAzimuthalEqualArea()
    .rotate([-center[0], -center[1]])
    .scale(EARTH_RADIUS_KM)
    .translate([0, 0]);
  return rings.map((ring) =>
    ring.map(([lon, lat]) => {
      const [px, py] = projection([lon, lat])!;
      return [px, -py];
    }),
  );
}
