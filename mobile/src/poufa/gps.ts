// GPS capture of the farm (CDC 2): messages, accuracy and the PUT payload. Pure.
import type { FarmGpsPayload } from '@/api/poufa';

export interface DevicePosition {
  latitude: number;
  longitude: number;
  /** Radius of 68 % confidence announced by the phone (m), null when unknown. */
  accuracyM: number | null;
  /** ISO instant of the fix. */
  capturedAt: string;
}

export type PositionFailure = 'NOT_INSTALLED' | 'PERMISSION_DENIED' | 'SERVICES_OFF' | 'TIMEOUT' | 'UNAVAILABLE';

export const POSITION_MESSAGES: Record<PositionFailure, string> = {
  NOT_INSTALLED:
    'Le module de localisation n’est pas encore installé dans cette version de l’application. Le relevé GPS sera disponible après la prochaine mise à jour.',
  PERMISSION_DENIED:
    'Accès à la position refusé. Autorisez la localisation pour Fermia dans les réglages du téléphone, puis réessayez.',
  SERVICES_OFF: 'La localisation du téléphone est désactivée. Activez le GPS, puis réessayez.',
  TIMEOUT:
    'Position introuvable à temps. Placez-vous à découvert, loin des bâtiments, et réessayez dans un instant.',
  UNAVAILABLE: 'Position indisponible pour le moment. Réessayez dans un instant.',
};

/** Raised by `getCurrentPosition` with a French message. */
export class PositionError extends Error {
  readonly reason: PositionFailure;

  constructor(reason: PositionFailure, message = POSITION_MESSAGES[reason]) {
    super(message);
    this.reason = reason;
  }
}

/** Waits for `promise`, or rejects with TIMEOUT after `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new PositionError('TIMEOUT')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export type AccuracyGrade = 'bonne' | 'moyenne' | 'faible' | 'inconnue';

/** ≤ 15 m good, ≤ 50 m fair (a farm building), beyond weak. */
export function accuracyGrade(accuracyM: number | null | undefined): AccuracyGrade {
  if (accuracyM == null || !Number.isFinite(accuracyM)) return 'inconnue';
  if (accuracyM <= 15) return 'bonne';
  if (accuracyM <= 50) return 'moyenne';
  return 'faible';
}

export function accuracyLabel(accuracyM: number | null | undefined): string {
  const grade = accuracyGrade(accuracyM);
  if (grade === 'inconnue') return 'Précision inconnue';
  return `Précision ± ${Math.round(accuracyM as number)} m (${grade})`;
}

/** `0.39123, 9.45210` — 5 decimals ≈ 1 m. */
export function formatCoords(p: { latitude: number; longitude: number }): string {
  return `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}`;
}

/** French refusal of a fix before sending, or null. */
export function positionRefusal(p: DevicePosition): string | null {
  if (!Number.isFinite(p.latitude) || p.latitude < -90 || p.latitude > 90) return 'Latitude invalide.';
  if (!Number.isFinite(p.longitude) || p.longitude < -180 || p.longitude > 180) return 'Longitude invalide.';
  if (p.latitude === 0 && p.longitude === 0) return 'Position invalide (0, 0) : refaites le relevé.';
  return null;
}

/**
 * Body of `PUT /programme/farms/:farmId/gps`: a device fix keeps its own
 * capture time, so a queued fix sent later is dated when it was taken.
 */
export function buildGpsPayload(p: DevicePosition, reason?: string): FarmGpsPayload {
  return {
    latitude: Math.round(p.latitude * 1e6) / 1e6,
    longitude: Math.round(p.longitude * 1e6) / 1e6,
    capturedAt: p.capturedAt,
    source: 'APPAREIL',
    ...(p.accuracyM != null && Number.isFinite(p.accuracyM) && p.accuracyM >= 0
      ? { accuracyM: Math.round(p.accuracyM * 10) / 10 }
      : {}),
    ...(reason?.trim() ? { reason: reason.trim() } : {}),
  };
}
