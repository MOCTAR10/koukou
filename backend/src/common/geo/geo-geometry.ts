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

export function isGeoJsonGeometry(value: unknown): value is GeoJsonGeometry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { type?: unknown; coordinates?: unknown };
  if (v.type === 'Polygon' && Array.isArray(v.coordinates)) return true;
  if (v.type === 'MultiPolygon' && Array.isArray(v.coordinates)) return true;
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