/**
 * « Utiliser ma position » of the registry GPS form: the browser's
 * `navigator.geolocation` fix turned into the form's fields, and its errors
 * into French. Pure; the point is still saved through `PUT …/gps` (history,
 * province warning), and the fields stay editable for a manual correction.
 */

/** High accuracy (GPS chip on a phone or tablet), never a cached fix, 20 s at most. */
export const GEOLOCATION_OPTIONS: PositionOptions = { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 };

/** 6 decimals ≈ 0.1 m: more than any phone gives, less than the noise a long float shows. */
export const COORDINATE_DIGITS = 6;

/** `GeolocationPositionError.code` values (the constants live on the error object). */
export const GEO_PERMISSION_DENIED = 1;
export const GEO_POSITION_UNAVAILABLE = 2;
export const GEO_TIMEOUT = 3;

export function roundCoordinate(value: number, digits = COORDINATE_DIGITS): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/** The fields the form shows (text, as typed by hand). */
export interface DeviceFix {
  latitude: string;
  longitude: string;
  accuracyM: string;
}

/** Form fields of a browser position: rounded coordinates, accuracy in whole metres. */
export function fixFromPosition(position: { coords: { latitude: number; longitude: number; accuracy?: number | null } }): DeviceFix {
  const { latitude, longitude, accuracy } = position.coords;
  return {
    latitude: String(roundCoordinate(latitude)),
    longitude: String(roundCoordinate(longitude)),
    accuracyM: accuracy != null && Number.isFinite(accuracy) && accuracy >= 0 ? String(Math.round(accuracy)) : '',
  };
}

/** French message of a failed `getCurrentPosition`. */
export function geolocationErrorMessage(code: number): string {
  switch (code) {
    case GEO_PERMISSION_DENIED:
      return 'Accès à la position refusé : autorisez la localisation pour ce site dans le navigateur, ou saisissez les coordonnées.';
    case GEO_POSITION_UNAVAILABLE:
      return 'Position indisponible : activez la localisation de l’appareil (GPS) et réessayez à l’extérieur, ou saisissez les coordonnées.';
    case GEO_TIMEOUT:
      return 'La position n’a pas pu être obtenue à temps : réessayez, de préférence à découvert, ou saisissez les coordonnées.';
    default:
      return 'La position n’a pas pu être obtenue : saisissez les coordonnées.';
  }
}

/** Why the browser can't locate at all (null: it can try). */
export function geolocationUnavailableReason(env: { hasGeolocation: boolean; secureContext: boolean }): string | null {
  if (!env.secureContext) return 'La localisation n’est possible que sur une connexion sécurisée (https) : saisissez les coordonnées.';
  if (!env.hasGeolocation) return 'Ce navigateur ne donne pas accès à la position : saisissez les coordonnées.';
  return null;
}

/** Plain-language accuracy shown beside the fix. */
export function accuracyLabel(accuracyM: string): string | null {
  const m = Number(accuracyM);
  if (!accuracyM || !Number.isFinite(m)) return null;
  const quality = m <= 20 ? 'bonne' : m <= 100 ? 'moyenne' : 'faible : rapprochez-vous des bâtiments, à découvert';
  return `Précision ± ${m} m (${quality}).`;
}

/** `APPAREIL` while the fields still hold the device fix as read, `MANUEL` once edited by hand. */
export function gpsSourceOf(draft: DeviceFix, device: DeviceFix | null): 'APPAREIL' | 'MANUEL' {
  if (!device) return 'MANUEL';
  const same = (a: string, b: string) => a.trim().replace(',', '.') === b;
  return same(draft.latitude, device.latitude) && same(draft.longitude, device.longitude) && same(draft.accuracyM, device.accuracyM)
    ? 'APPAREIL'
    : 'MANUEL';
}
