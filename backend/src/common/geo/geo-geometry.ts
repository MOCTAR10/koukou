/** Contour de parcelle au format GeoJSON (Polygon ou MultiPolygon). */
export interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface GeoJsonMultiPolygon {
  type: 'MultiPolygon';
  coordinates: number[][][][];
}

export type GeoJsonGeometry = GeoJsonPolygon | GeoJsonMultiPolygon;

const isPosition = (p: unknown): boolean =>
  Array.isArray(p) &&
  p.length >= 2 &&
  typeof p[0] === 'number' &&
  typeof p[1] === 'number' &&
  Number.isFinite(p[0]) &&
  Number.isFinite(p[1]) &&
  Math.abs(p[0]) <= 180 &&
  Math.abs(p[1]) <= 90;

/** A closed ring: at least 4 [lng, lat] positions. */
const isRing = (r: unknown): boolean =>
  Array.isArray(r) && r.length >= 4 && r.every(isPosition);

const isPolygonCoords = (c: unknown): boolean =>
  Array.isArray(c) && c.length >= 1 && c.every(isRing);

/**
 * Polygon or MultiPolygon with well-formed rings. Checked deeply: the area
 * computation (PostGIS or JS fallback) would otherwise crash on bad input.
 */
export function isGeoJsonGeometry(value: unknown): value is GeoJsonGeometry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { type?: unknown; coordinates?: unknown };
  if (v.type === 'Polygon') return isPolygonCoords(v.coordinates);
  if (v.type === 'MultiPolygon') {
    return (
      Array.isArray(v.coordinates) &&
      v.coordinates.length >= 1 &&
      v.coordinates.every(isPolygonCoords)
    );
  }
  return false;
}

/**
 * Surface (hectares) d'un polygone GeoJSON calculée en JavaScript pur
 * (projection équirectangulaire locale + formule de l'aire en coordonnées
 * planes). Fallback quand l'extension PostGIS n'est pas disponible.
 */
export function geoJsonAreaHaFallback(
  geometry: GeoJsonGeometry,
): number | null {
  const EARTH_RADIUS_M = 6371008.8;
  const d2r = (deg: number) => (deg * Math.PI) / 180;

  const ringAreaM2 = (ring: number[][]): number => {
    if (!Array.isArray(ring) || ring.length < 4) return 0;
    // Latitude moyenne du contour → projection locale peu distordue.
    const latSum = ring.reduce<number>((acc, p) => acc + p[1], 0);
    const meanLatRad = d2r(latSum / ring.length);
    const x = (lng: number) => d2r(lng) * EARTH_RADIUS_M * Math.cos(meanLatRad);
    const y = (lat: number) => d2r(lat) * EARTH_RADIUS_M;

    let area = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [lng1, lat1] = ring[i];
      const [lng2, lat2] = ring[i + 1];
      area += x(lng1) * y(lat2) - x(lng2) * y(lat1);
    }
    return Math.abs(area / 2);
  };

  const polygonAreaM2 = (polygon: number[][][]): number => {
    // Anneau extérieur − trous intérieurs.
    let area = ringAreaM2(polygon[0] ?? []);
    for (let i = 1; i < polygon.length; i++) {
      area -= ringAreaM2(polygon[i]);
    }
    return Math.max(0, area);
  };

  let m2: number;
  if (geometry.type === 'Polygon') {
    m2 = polygonAreaM2(geometry.coordinates);
  } else {
    m2 = geometry.coordinates.reduce<number>(
      (acc, polygon) => acc + polygonAreaM2(polygon),
      0,
    );
  }
  return m2 / 10_000;
}