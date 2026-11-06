import type { GeoJsonGeometry } from './geo-geometry.js';

/**
 * Point-in-polygon test on GeoJSON (Polygon / MultiPolygon, [lng, lat]
 * positions), standard library only: ray casting per ring, even-odd rule.
 *
 * A polygon is its outer ring minus its holes. A point lying exactly on a
 * boundary (outer ring or hole edge, vertex included) counts as INSIDE: the
 * result only feeds a warning, and a GPS reading on a border must not be
 * reported as "outside its province".
 *
 * Coordinates are treated as planar (lng = x, lat = y), which is fine at the
 * scale of a province near the equator. Rings may be closed or not.
 */

/** Tolerance (degrees, ~1 cm) for "on the boundary". */
const EPSILON = 1e-9;

type Ring = readonly (readonly number[])[];

function onSegment(
  x: number,
  y: number,
  [x1, y1]: readonly number[],
  [x2, y2]: readonly number[],
): boolean {
  const cross = (x - x1) * (y2 - y1) - (y - y1) * (x2 - x1);
  if (Math.abs(cross) > EPSILON) return false;
  return (
    x >= Math.min(x1, x2) - EPSILON &&
    x <= Math.max(x1, x2) + EPSILON &&
    y >= Math.min(y1, y2) - EPSILON &&
    y <= Math.max(y1, y2) + EPSILON
  );
}

/** 'boundary' when on an edge, else whether the ray crosses an odd number of edges. */
function ringPosition(
  x: number,
  y: number,
  ring: Ring,
): 'inside' | 'outside' | 'boundary' {
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (onSegment(x, y, a, b)) return 'boundary';
    const [xi, yi] = a;
    const [xj, yj] = b;
    // Half-open rule on y so a vertex shared by two edges is counted once.
    if (yi > y !== yj > y) {
      const xCross = ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (x < xCross) inside = !inside;
    }
  }
  return inside ? 'inside' : 'outside';
}

function inPolygon(x: number, y: number, polygon: readonly Ring[]): boolean {
  const [outer, ...holes] = polygon;
  if (!outer) return false;
  const pos = ringPosition(x, y, outer);
  if (pos === 'boundary') return true;
  if (pos === 'outside') return false;
  for (const hole of holes) {
    const h = ringPosition(x, y, hole);
    if (h === 'boundary') return true;
    if (h === 'inside') return false;
  }
  return true;
}

/** Whether (lat, lng) lies inside (or on the boundary of) `geometry`. */
export function pointInGeometry(
  latitude: number,
  longitude: number,
  geometry: GeoJsonGeometry,
): boolean {
  if (geometry.type === 'Polygon') {
    return inPolygon(longitude, latitude, geometry.coordinates);
  }
  return geometry.coordinates.some((polygon) =>
    inPolygon(longitude, latitude, polygon),
  );
}

/** Every ring is closed (first position equals the last). */
export function ringsAreClosed(geometry: GeoJsonGeometry): boolean {
  const polygons =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.every((polygon) =>
    polygon.every((ring) => {
      const first = ring[0];
      const last = ring[ring.length - 1];
      return first[0] === last[0] && first[1] === last[1];
    }),
  );
}
