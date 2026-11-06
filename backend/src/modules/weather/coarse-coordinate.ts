/**
 * A coordinate rounded to 0.1° (about 11 km at the equator) before it leaves
 * for a third-party service (CDC §8, POUFA audit F11). Null stays null.
 */
export function coarseCoordinate(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
}
