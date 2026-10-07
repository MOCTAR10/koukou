import type { GeoJsonGeometry, Parcelle } from '@/api/types';

/** Point géographique au format attendu par react-native-maps. */
export interface LatLng {
  latitude: number;
  longitude: number;
}

const EPS = 1e-8;

function isValidCoord(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Convertit une coordonnée GeoJSON [longitude, latitude] en { latitude, longitude }. */
export function geoCoordToLatLng(coord: number[]): LatLng | null {
  if (!Array.isArray(coord) || coord.length < 2) return null;
  const [lng, lat] = coord;
  if (!isValidCoord(lat) || !isValidCoord(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { latitude: lat, longitude: lng };
}

/** Extrait l'anneau extérieur d'une géométrie GeoJSON Polygone/MultiPolygone. */
export function geoJsonOuterRing(geom: GeoJsonGeometry | null): LatLng[] {
  if (!geom) return [];
  if (geom.type === 'Polygon') {
    const ring = geom.coordinates[0] as number[][];
    return ring.map(geoCoordToLatLng).filter((p): p is LatLng => p !== null);
  }
  const first = geom.coordinates[0]?.[0] as number[][] | undefined;
  return first ? first.map(geoCoordToLatLng).filter((p): p is LatLng => p !== null) : [];
}

/** Calcule un point central depuis un anneau (moyenne simple, tolérable à l'échelle d'une parcelle). */
export function centerOfRing(ring: LatLng[]): LatLng | null {
  if (ring.length === 0) return null;
  const last = ring[ring.length - 1];
  const first = ring[0];
  const points =
    ring.length > 1 && last.latitude === first.latitude && last.longitude === first.longitude
      ? ring.slice(0, -1)
      : ring;
  let lat = 0;
  let lng = 0;
  for (const p of points) {
    lat += p.latitude;
    lng += p.longitude;
  }
  return { latitude: lat / points.length, longitude: lng / points.length };
}

/** Centre du premier contour disponible d'une parcelle (sinon null). */
export function parcelleCenter(p: Parcelle): LatLng | null {
  return centerOfRing(geoJsonOuterRing(p.boundaryGeoJson));
}

/** Centre d'une liste de parcelles : priorité au centroïde des contours, sinon moyenne des parcelles. */
export function parcellesCenter(parcelles: Parcelle[]): LatLng | null {
  const withGeom = parcelles
    .map(parcelleCenter)
    .filter((c): c is LatLng => c !== null);
  return withGeom.length > 0 ? centerOfRing(withGeom) : null;
}

/**
 * Périmètre Haversine approximatif (m) d'un anneau — utile au zoom auto :
 * on veut un zoom d'autant plus resserré que la parcelle est petite.
 */
export function ringApproxSizeM(ring: LatLng[]): number {
  if (ring.length < 2) return 0;
  const R = 6_371_000;
  let total = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i];
    const b = ring[i + 1];
    const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
    const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((a.latitude * Math.PI) / 180) *
        Math.cos((b.latitude * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    total += 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }
  return total;
}

/** Delta de latitude englobant l'anneau (dégrés), forcé ≥ EPS pour le zoom. */
export function ringLatDelta(ring: LatLng[]): number {
  if (ring.length === 0) return 0.001;
  const lats = ring.map((p) => p.latitude);
  return Math.max(EPS, Math.max(...lats) - Math.min(...lats));
}