/**
 * Province boundary upload (`PUT /programme/provinces/:code/geometry`): the
 * server takes one GeoJSON Polygon or MultiPolygon (WGS 84, positions
 * [longitude, latitude], closed rings of 4 points or more). Files exported by
 * GIS tools are usually a Feature or a FeatureCollection: this pulls the
 * geometry out, merges several polygons into one MultiPolygon, rounds the
 * positions and checks the same rules as the server before sending.
 */

export type Position = [number, number];
export type Polygon = { type: 'Polygon'; coordinates: Position[][] };
export type MultiPolygon = { type: 'MultiPolygon'; coordinates: Position[][][] };
export type BoundaryGeometry = Polygon | MultiPolygon;

export type GeometryResult = { ok: true; geometry: BoundaryGeometry; polygons: number; points: number; bytes: number } | { ok: false; error: string };

/**
 * Nest's default JSON body limit (100 KB): a heavier boundary answers 413
 * before reaching the programme route, so it is refused here with a hint.
 */
export const MAX_GEOMETRY_BYTES = 100 * 1024;

/** 5 decimals ≈ 1 m: plenty for a province, and much lighter than a GIS export's 15. */
export const GEOMETRY_DIGITS = 5;

const FAIL_SHAPE = 'Contour invalide : un GeoJSON Polygon ou MultiPolygon est attendu (positions [longitude, latitude], anneaux d’au moins 4 points).';

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Polygons (as rings) of any GeoJSON object, or an error. Points and lines are refused. */
function polygonsOf(value: unknown): Position[][][] | string {
  if (!isObject(value)) return FAIL_SHAPE;
  switch (value.type) {
    case 'Polygon':
      return [value.coordinates as Position[][]];
    case 'MultiPolygon':
      return value.coordinates as Position[][][];
    case 'Feature':
      return value.geometry ? polygonsOf(value.geometry) : 'Contour invalide : l’objet Feature n’a pas de géométrie.';
    case 'FeatureCollection': {
      const features = Array.isArray(value.features) ? value.features : [];
      if (!features.length) return 'Contour invalide : la collection ne contient aucun objet.';
      const all: Position[][][] = [];
      for (const f of features) {
        const p = polygonsOf(f);
        if (typeof p === 'string') return p;
        all.push(...p);
      }
      return all;
    }
    case 'GeometryCollection': {
      const geometries = Array.isArray(value.geometries) ? value.geometries : [];
      const all: Position[][][] = [];
      for (const g of geometries) {
        const p = polygonsOf(g);
        if (typeof p === 'string') return p;
        all.push(...p);
      }
      return all.length ? all : FAIL_SHAPE;
    }
    default:
      return typeof value.type === 'string'
        ? `Contour invalide : un « ${value.type} » n’est pas une surface (Polygon ou MultiPolygon attendu).`
        : FAIL_SHAPE;
  }
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** Rounded positions, consecutive repeats dropped (the closing point kept). */
function compactRing(ring: unknown, digits: number): Position[] | null {
  if (!Array.isArray(ring)) return null;
  const out: Position[] = [];
  for (const pos of ring) {
    if (!Array.isArray(pos) || pos.length < 2) return null;
    const [lng, lat] = pos as unknown[];
    if (typeof lng !== 'number' || typeof lat !== 'number' || !Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;
    const p: Position = [round(lng, digits), round(lat, digits)];
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  return out;
}

/**
 * The boundary to send from a parsed GeoJSON file, with the server's checks
 * (shape, ranges, rings ≥ 4 points and closed) and the body size limit.
 */
export function boundaryFromGeoJson(value: unknown, digits = GEOMETRY_DIGITS): GeometryResult {
  const polygons = polygonsOf(value);
  if (typeof polygons === 'string') return { ok: false, error: polygons };
  if (!Array.isArray(polygons) || !polygons.length) return { ok: false, error: FAIL_SHAPE };
  const cleaned: Position[][][] = [];
  let points = 0;
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || !polygon.length) return { ok: false, error: FAIL_SHAPE };
    const rings: Position[][] = [];
    for (const ring of polygon) {
      const r = compactRing(ring, digits);
      if (!r) return { ok: false, error: FAIL_SHAPE };
      if (r.length < 4) return { ok: false, error: FAIL_SHAPE };
      const first = r[0]!;
      const last = r[r.length - 1]!;
      if (first[0] !== last[0] || first[1] !== last[1]) {
        return { ok: false, error: 'Contour invalide : chaque anneau doit être fermé (premier point = dernier point).' };
      }
      points += r.length;
      rings.push(r);
    }
    cleaned.push(rings);
  }
  const geometry: BoundaryGeometry = cleaned.length === 1 ? { type: 'Polygon', coordinates: cleaned[0]! } : { type: 'MultiPolygon', coordinates: cleaned };
  const bytes = new TextEncoder().encode(JSON.stringify({ geometry })).length;
  if (bytes > MAX_GEOMETRY_BYTES) {
    return {
      ok: false,
      error: `Contour trop lourd (${Math.ceil(bytes / 1024)} Ko, ${points} points ; le serveur accepte environ ${MAX_GEOMETRY_BYTES / 1024} Ko) : simplifiez-le dans votre logiciel SIG (par exemple mapshaper, simplification à quelques centaines de mètres) puis recommencez.`,
    };
  }
  return { ok: true, geometry, polygons: cleaned.length, points, bytes };
}

/** Parses the file's text, then `boundaryFromGeoJson`. */
export function boundaryFromText(text: string): GeometryResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Fichier illisible : un fichier GeoJSON (.geojson ou .json) est attendu.' };
  }
  return boundaryFromGeoJson(parsed);
}
