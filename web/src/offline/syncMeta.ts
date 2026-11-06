// Offline conflict rule (CDC §7.2, backend `sync/conflict-rules.ts`,
// `backend/docs/poufa-conflits-hors-ligne.md`): a daily entry carries the time
// it was typed, the record it was typed on, the device and, at each sending,
// the device clock. Same contract as mobile `src/offline/sync-meta.ts`.

const DEVICE_KEY = 'koukou.deviceId';

/** Stable random id of this browser install (never the user, never a fingerprint). */
export function deviceId(): string {
  try {
    const known = localStorage.getItem(DEVICE_KEY);
    if (known) return known;
    const fresh = `web-${crypto.randomUUID()}`;
    localStorage.setItem(DEVICE_KEY, fresh);
    return fresh;
  } catch {
    return 'web-inconnu';
  }
}

/** The fields the server compares one by one (feed in kg). */
export const DAILY_ENTRY_SYNC_FIELDS = [
  'deaths',
  'feedQuantity',
  'waterL',
  'avgWeightKg',
  'sampleSize',
  'eggsCollected',
  'eggsSellable',
  'eggsCracked',
  'eggsSmall',
  'eggsDoubleYolk',
  'eggsDirty',
] as const;

export type DailyEntrySyncField = (typeof DAILY_ENTRY_SYNC_FIELDS)[number];

/** The entry of that date as this browser knows it (the server's answer). */
export interface KnownDailyEntry {
  updatedAt?: string | null;
  deaths?: number | null;
  feedQuantity?: number | null;
  waterL?: number | null;
  avgWeightKg?: number | null;
  sampleSize?: number | null;
  eggsCollected?: number | null;
  eggsSellable?: number | null;
  eggsCracked?: number | null;
  eggsSmall?: number | null;
  eggsDoubleYolk?: number | null;
  eggsDirty?: number | null;
}

/**
 * `baseUpdatedAt` / `baseValues` of an edit: the record the form was opened
 * on. Nothing for a new entry (the server then applies every field).
 * `feedQuantity` is already in kg on the server's answer.
 */
export function dailyEntryBase(
  known: KnownDailyEntry | null | undefined,
): { baseUpdatedAt?: string; baseValues?: Record<string, number | null> } {
  if (!known) return {};
  const baseValues: Record<string, number | null> = {};
  for (const field of DAILY_ENTRY_SYNC_FIELDS) {
    const v = known[field];
    baseValues[field] = typeof v === 'number' ? v : null;
  }
  return known.updatedAt ? { baseUpdatedAt: known.updatedAt, baseValues } : { baseValues };
}

/**
 * Body of a daily entry at its first attempt: the capture time (the op's
 * creation, kept as is on every replay) and the device. Values already in
 * the body (a form that set them) win.
 */
export function withCaptureMeta(body: object | undefined, capturedAt: string, device: string): object {
  return { capturedAt, deviceId: device, ...body };
}

/** Body at one sending: the device clock now, refreshed at every attempt. */
export function withSendTime(body: unknown, now: Date = new Date()): object {
  return { ...(body as object | undefined), deviceSentAt: now.toISOString() };
}
