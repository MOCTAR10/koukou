/**
 * Basemap of the web maps. Default: CARTO Positron (sober light style, no API key,
 * free for non-commercial / modest use). Lot B can switch provider without code:
 * VITE_MAP_TILE_URL (xyz template), VITE_MAP_TILE_ATTRIBUTION (HTML) and VITE_MAP_TILE_MAX_ZOOM.
 */
const env = import.meta.env as Record<string, string | undefined>;

export const MAP_TILE_URL = env.VITE_MAP_TILE_URL || 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
export const MAP_TILE_ATTRIBUTION =
  env.VITE_MAP_TILE_ATTRIBUTION ||
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
export const MAP_TILE_MAX_ZOOM = Number(env.VITE_MAP_TILE_MAX_ZOOM) || 19;
export const MAP_TILE_SUBDOMAINS = 'abcd';

/** Gabon bounding box [south-west, north-east] (with a small margin). */
export const GABON_BOUNDS: [[number, number], [number, number]] = [
  [-3.98, 8.6],
  [2.33, 14.55],
];
/** Country-wide zoom floor: the user cannot pan away from Gabon. */
export const GABON_MIN_ZOOM = 6;
