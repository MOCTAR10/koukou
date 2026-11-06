/**
 * Rules of a farm GPS fix sent by the field (CDC n° 2, POUFA audit A8). Pure,
 * unit-tested.
 */

const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Africa/Libreville',
});

/**
 * French reason a fix is ignored: it was taken before the farm's current
 * point (an offline fix sent late must not replace a newer one). Null when
 * the fix applies (no current point, or not older).
 */
export function staleGpsMessage(
  capturedAt: Date,
  current: Date | null | undefined,
): string | null {
  if (!current) return null;
  if (capturedAt.getTime() >= current.getTime()) return null;
  return `Relevé GPS du ${DATE_FORMAT.format(capturedAt)} ignoré : il est plus ancien que le point actuel de la ferme (relevé le ${DATE_FORMAT.format(current)}), qui est conservé.`;
}

/** The replay key of a GPS fix: trimmed, null when empty. */
export function gpsIdempotencyKey(raw: string | null | undefined): string | null {
  const key = raw?.trim();
  return key ? key : null;
}
