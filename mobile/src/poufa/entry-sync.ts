// Offline conflict rule of the daily entry (CDC §7.2, backend
// sync/conflict-rules.ts and backend/docs/poufa-conflits-hors-ligne.md).
// Pure: the sheet adds the base it edited, the engine stamps the capture,
// the device and the send time.
import type { DailyEntryPayload } from '@/api/mutations';
import type { DailyEntryRecord } from '@/api/types';

/** Fields the server compares one by one (`DAILY_ENTRY_SYNC_FIELDS`). */
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

export type DailyEntryBaseValues = Partial<Record<DailyEntrySyncField, number | null>>;

/**
 * The record as last known by this phone: its `updatedAt` and its values
 * (feed in kg, as the server stores it). Sent with an edit so the server
 * knows which fields the user really changed (the mobile resends zeros).
 */
export function entryBase(entry: DailyEntryRecord | null | undefined): {
  baseUpdatedAt: string;
  baseValues: DailyEntryBaseValues;
} | null {
  if (!entry || !entry.updatedAt) return null;
  const record = entry as unknown as Record<string, unknown>;
  const baseValues: DailyEntryBaseValues = {};
  for (const field of DAILY_ENTRY_SYNC_FIELDS) {
    const v = record[field];
    baseValues[field] = typeof v === 'number' ? v : null;
  }
  return { baseUpdatedAt: entry.updatedAt, baseValues };
}

/** The payload with the base of the edited record (nothing for a new entry). */
export function withEntryBase(payload: DailyEntryPayload, entry: DailyEntryRecord | null | undefined): DailyEntryPayload {
  const base = entryBase(entry);
  if (!base) return payload;
  return { ...payload, baseUpdatedAt: base.baseUpdatedAt, baseValues: base.baseValues };
}

/**
 * Capture metadata, fixed once when the user saves: `capturedAt` (time of
 * entry) and the device. Values already set (a replay) are kept.
 */
export function withCapture(payload: DailyEntryPayload, capturedAt: string, deviceId: string): DailyEntryPayload {
  return { ...payload, capturedAt: payload.capturedAt ?? capturedAt, deviceId: payload.deviceId ?? deviceId };
}

/** The phone clock at this send attempt (the server measures the skew). */
export function withSendTime(payload: DailyEntryPayload, now: string): DailyEntryPayload {
  return { ...payload, deviceSentAt: now };
}
