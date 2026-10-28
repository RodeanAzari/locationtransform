/** The full geometry pipeline: GeoJSON place → projected, filtered, oriented rings in km. */
import type { MultiPolygon, Polygon } from 'geojson';
import { config } from '../config';
import { boundingDiagonal, counterClockwise, filterIslands } from './islands';
import { projectRings, sphericalCentroid, type XYRing } from './project';
import { outerRings, unwrapLongitudes } from './rings';

export interface PreparedPlace {
  /** Kept rings, largest first, counter-clockwise, in km. */
  rings: XYRing[];
  /** Number of small rings dropped by the island filter. */
  droppedRings: number;
  /** Bounding-box diagonal of the kept rings (km): the accuracy normalizer. */
  diagonal: number;
}

export function preparePlace(geometry: Polygon | MultiPolygon): PreparedPlace {
  const lonLatRings = outerRings(geometry).map(unwrapLongitudes);
  const projected = projectRings(lonLatRings, sphericalCentroid(lonLatRings));
  const { kept, dropped } = filterIslands(projected, config.islandMinAreaFraction, config.maxRings);
  const rings = kept.map(counterClockwise);
  return { rings, droppedRings: dropped, diagonal: boundingDiagonal(rings) };
}
